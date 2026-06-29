/**
 * DropshipManager — dropship order routing: supplier catalog by SKU, order
 * routing to the best supplier, fulfillment status, and SLA/tracking capture.
 *
 * Events:
 *   - "dropship.routed": { orderId, supplierId, sku, costUsd }
 *   - "dropship.shipped": { orderId, trackingNumber }
 *   - "dropship.unfulfillable": { orderId, sku }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DropshipStatus = "routed" | "accepted" | "shipped" | "delivered" | "cancelled" | "unfulfillable";

export interface SupplierOffer {
  supplierId: string;
  sku: string;
  costUsd: number;
  leadTimeDays: number;
  inStock: boolean;
}

export interface DropshipOrder {
  id: string;
  orderRef: string;
  sku: string;
  quantity: number;
  customerAddress: string;
  supplierId?: string;
  costUsd?: number;
  status: DropshipStatus;
  trackingNumber?: string;
  createdAt: string;
}

export interface DropshipSummary {
  totalOrders: number;
  routed: number;
  shipped: number;
  unfulfillable: number;
  totalCostUsd: number;
  bySupplier: Record<string, number>;
}

export class DropshipManager {
  private offers: SupplierOffer[] = [];
  private orders: Map<string, DropshipOrder> = new Map();

  constructor(private readonly bus: EventBus) {}

  addOffer(offer: SupplierOffer): void {
    const existing = this.offers.findIndex(o => o.supplierId === offer.supplierId && o.sku === offer.sku);
    if (existing >= 0) this.offers[existing] = offer;
    else this.offers.push(offer);
  }

  setStock(supplierId: string, sku: string, inStock: boolean): boolean {
    const offer = this.offers.find(o => o.supplierId === supplierId && o.sku === sku);
    if (!offer) return false;
    offer.inStock = inStock;
    return true;
  }

  /** Route an order to the cheapest in-stock supplier for its SKU. */
  routeOrder(orderRef: string, sku: string, quantity: number, customerAddress: string): DropshipOrder {
    const order: DropshipOrder = { id: randomUUID(), orderRef, sku, quantity, customerAddress, status: "routed", createdAt: new Date().toISOString() };
    const candidates = this.offers.filter(o => o.sku === sku && o.inStock).sort((a, b) => a.costUsd - b.costUsd);
    const best = candidates[0];
    if (!best) {
      order.status = "unfulfillable";
      this.orders.set(order.id, order);
      this.bus.publish("dropship.unfulfillable", { orderId: order.id, sku });
      return order;
    }
    order.supplierId = best.supplierId;
    order.costUsd = Math.round(best.costUsd * quantity * 100) / 100;
    this.orders.set(order.id, order);
    this.bus.publish("dropship.routed", { orderId: order.id, supplierId: best.supplierId, sku, costUsd: order.costUsd });
    return order;
  }

  accept(orderId: string): DropshipOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "routed") return undefined;
    order.status = "accepted";
    return order;
  }

  ship(orderId: string, trackingNumber: string): DropshipOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || (order.status !== "accepted" && order.status !== "routed")) return undefined;
    order.status = "shipped";
    order.trackingNumber = trackingNumber;
    this.bus.publish("dropship.shipped", { orderId, trackingNumber });
    return order;
  }

  markDelivered(orderId: string): DropshipOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "shipped") return undefined;
    order.status = "delivered";
    return order;
  }

  cancel(orderId: string): DropshipOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status === "delivered" || order.status === "shipped") return undefined;
    order.status = "cancelled";
    return order;
  }

  getOrder(id: string): DropshipOrder | undefined { return this.orders.get(id); }
  listOffers(sku?: string): SupplierOffer[] {
    return sku ? this.offers.filter(o => o.sku === sku) : [...this.offers];
  }
  listOrders(status?: DropshipStatus): DropshipOrder[] {
    const all = Array.from(this.orders.values());
    return status ? all.filter(o => o.status === status) : all;
  }

  summary(): DropshipSummary {
    const orders = Array.from(this.orders.values());
    const bySupplier: Record<string, number> = {};
    for (const o of orders) { if (o.supplierId) bySupplier[o.supplierId] = (bySupplier[o.supplierId] ?? 0) + 1; }
    return {
      totalOrders: orders.length,
      routed: orders.filter(o => o.status !== "unfulfillable").length,
      shipped: orders.filter(o => o.status === "shipped" || o.status === "delivered").length,
      unfulfillable: orders.filter(o => o.status === "unfulfillable").length,
      totalCostUsd: Math.round(orders.reduce((s, o) => s + (o.costUsd ?? 0), 0) * 100) / 100,
      bySupplier,
    };
  }
}
