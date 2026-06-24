/**
 * SupplyChainManager — supplier management, purchase orders, lead times,
 * risk tracking, and delivery performance.
 *
 * Events:
 *   - "supply.order_placed": { orderId, supplierId, totalUsd, expectedDelivery }
 *   - "supply.order_received": { orderId, supplierId, onTime, daysVariance }
 *   - "supply.supplier_flagged": { supplierId, reason, riskLevel }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type OrderStatus = "draft" | "submitted" | "confirmed" | "in_transit" | "received" | "cancelled";
export type SupplierStatus = "active" | "on_hold" | "blacklisted" | "under_review";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Supplier {
  id: string;
  name: string;
  country: string;
  category: string;
  status: SupplierStatus;
  leadTimeDays: number;
  onTimeDeliveryPct: number; // 0-100
  qualityScore: number; // 0-100
  riskLevel: RiskLevel;
  contactEmail: string;
  createdAt: string;
}

export interface PurchaseOrderLine {
  skuId: string;
  description: string;
  quantity: number;
  unitCostUsd: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: OrderStatus;
  lines: PurchaseOrderLine[];
  totalUsd: number;
  placedAt: string;
  expectedDelivery: string;
  receivedAt?: string;
  daysVariance?: number; // positive = late, negative = early
  notes?: string;
}

export interface SupplyChainSummary {
  totalSuppliers: number;
  activeSuppliers: number;
  openOrders: number;
  totalOpenValueUsd: number;
  avgOnTimeDeliveryPct: number;
  highRiskSuppliers: number;
}

export class SupplyChainManager {
  private suppliers: Map<string, Supplier> = new Map();
  private orders: Map<string, PurchaseOrder> = new Map();

  constructor(private readonly bus: EventBus) {}

  addSupplier(input: Omit<Supplier, "id" | "createdAt"> & { id?: string }): Supplier {
    const supplier: Supplier = {
      id: input.id ?? randomUUID(),
      name: input.name,
      country: input.country,
      category: input.category,
      status: input.status,
      leadTimeDays: input.leadTimeDays,
      onTimeDeliveryPct: input.onTimeDeliveryPct,
      qualityScore: input.qualityScore,
      riskLevel: input.riskLevel,
      contactEmail: input.contactEmail,
      createdAt: new Date().toISOString(),
    };
    this.suppliers.set(supplier.id, supplier);
    return supplier;
  }

  flagSupplier(supplierId: string, reason: string, riskLevel: RiskLevel): Supplier | undefined {
    const s = this.suppliers.get(supplierId);
    if (!s) return undefined;
    s.riskLevel = riskLevel;
    if (riskLevel === "critical") s.status = "on_hold";
    this.bus.publish("supply.supplier_flagged", { supplierId, reason, riskLevel });
    return s;
  }

  placeOrder(input: {
    supplierId: string;
    lines: Omit<PurchaseOrderLine, "lineTotal">[];
    expectedDelivery: string;
    notes?: string;
    id?: string;
  }): PurchaseOrder | undefined {
    if (!this.suppliers.has(input.supplierId)) return undefined;
    const lines: PurchaseOrderLine[] = input.lines.map((l) => ({
      ...l,
      lineTotal: l.quantity * l.unitCostUsd,
    }));
    const totalUsd = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const order: PurchaseOrder = {
      id: input.id ?? randomUUID(),
      supplierId: input.supplierId,
      status: "submitted",
      lines,
      totalUsd,
      placedAt: new Date().toISOString(),
      expectedDelivery: input.expectedDelivery,
      notes: input.notes,
    };
    this.orders.set(order.id, order);
    this.bus.publish("supply.order_placed", {
      orderId: order.id,
      supplierId: order.supplierId,
      totalUsd,
      expectedDelivery: order.expectedDelivery,
    });
    return order;
  }

  receiveOrder(orderId: string, receivedAt: string): PurchaseOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order) return undefined;
    const expected = new Date(order.expectedDelivery).getTime();
    const actual = new Date(receivedAt).getTime();
    const daysVariance = Math.round((actual - expected) / 86400000);
    order.status = "received";
    order.receivedAt = receivedAt;
    order.daysVariance = daysVariance;
    this.bus.publish("supply.order_received", {
      orderId,
      supplierId: order.supplierId,
      onTime: daysVariance <= 0,
      daysVariance,
    });
    return order;
  }

  getSupplier(id: string): Supplier | undefined { return this.suppliers.get(id); }

  listSuppliers(status?: SupplierStatus): Supplier[] {
    const all = Array.from(this.suppliers.values());
    return status ? all.filter((s) => s.status === status) : all;
  }

  getOrder(id: string): PurchaseOrder | undefined { return this.orders.get(id); }

  listOrders(supplierId?: string): PurchaseOrder[] {
    const all = Array.from(this.orders.values());
    return supplierId ? all.filter((o) => o.supplierId === supplierId) : all;
  }

  summary(): SupplyChainSummary {
    const suppliers = Array.from(this.suppliers.values());
    const orders = Array.from(this.orders.values());
    const openOrders = orders.filter((o) => !["received", "cancelled"].includes(o.status));
    const activeSuppliers = suppliers.filter((s) => s.status === "active");
    const avgOnTime = activeSuppliers.length > 0
      ? activeSuppliers.reduce((sum, s) => sum + s.onTimeDeliveryPct, 0) / activeSuppliers.length
      : 0;
    return {
      totalSuppliers: suppliers.length,
      activeSuppliers: activeSuppliers.length,
      openOrders: openOrders.length,
      totalOpenValueUsd: openOrders.reduce((sum, o) => sum + o.totalUsd, 0),
      avgOnTimeDeliveryPct: Math.round(avgOnTime),
      highRiskSuppliers: suppliers.filter((s) => s.riskLevel === "high" || s.riskLevel === "critical").length,
    };
  }
}
