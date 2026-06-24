/**
 * InventoryManager — SKU catalog, stock levels, reorder alerts, and inventory valuation.
 *
 * Concepts:
 *   - SKU: a stockkeeping unit with cost and reorder config
 *   - StockMovement: any in/out transaction (purchase, sale, adjustment, write-off)
 *   - Reorder: auto-alert when quantity falls below reorder point
 *
 * Events:
 *   - "inventory.low_stock": { skuId, name, currentQty, reorderPoint }
 *   - "inventory.stock_movement": { skuId, type, quantity, newTotalQty }
 *   - "inventory.reorder_triggered": { skuId, name, reorderQty, supplierName }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MovementType = "purchase" | "sale" | "adjustment" | "write_off" | "transfer_in" | "transfer_out" | "return";
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "discontinued";

export interface SKU {
  id: string;
  name: string;
  sku: string; // SKU code e.g. "HW-001"
  description?: string;
  category: string;
  unitCostUsd: number;
  unitPriceUsd?: number; // selling price
  currentQty: number;
  reservedQty: number; // held for pending orders
  reorderPoint: number; // trigger reorder below this
  reorderQty: number; // how much to reorder
  supplierName?: string;
  supplierLeadTimeDays?: number;
  status: StockStatus;
  location?: string; // warehouse/shelf
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  skuId: string;
  type: MovementType;
  quantity: number; // positive = in, negative = out
  unitCostUsd?: number;
  referenceId?: string; // order id, PO number etc
  notes?: string;
  occurredAt: string;
}

export interface InventorySummary {
  totalSKUs: number;
  activeSKUs: number;
  lowStockSKUs: number;
  outOfStockSKUs: number;
  totalInventoryValueUsd: number; // sum(currentQty * unitCostUsd)
  totalMovements: number;
}

function computeStatus(currentQty: number, reorderPoint: number): StockStatus {
  if (currentQty === 0) return "out_of_stock";
  if (currentQty <= reorderPoint) return "low_stock";
  return "in_stock";
}

export class InventoryManager {
  private skus: Map<string, SKU> = new Map();
  private movements: StockMovement[] = [];
  private bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  addSKU(input: Omit<SKU, "id" | "createdAt" | "updatedAt" | "status"> & { id?: string }): SKU {
    const now = new Date().toISOString();
    const sku: SKU = {
      ...input,
      id: input.id ?? randomUUID(),
      status: computeStatus(input.currentQty, input.reorderPoint),
      createdAt: now,
      updatedAt: now,
    };
    this.skus.set(sku.id, sku);
    return sku;
  }

  recordMovement(
    skuId: string,
    type: MovementType,
    quantity: number,
    opts?: { unitCostUsd?: number; referenceId?: string; notes?: string; occurredAt?: string },
  ): StockMovement | undefined {
    const sku = this.skus.get(skuId);
    if (!sku) return undefined;

    const oldQty = sku.currentQty;
    const newQty = Math.max(0, sku.currentQty + quantity);
    sku.currentQty = newQty;
    sku.status = computeStatus(newQty, sku.reorderPoint);
    sku.updatedAt = new Date().toISOString();

    const movement: StockMovement = {
      id: randomUUID(),
      skuId,
      type,
      quantity,
      unitCostUsd: opts?.unitCostUsd,
      referenceId: opts?.referenceId,
      notes: opts?.notes,
      occurredAt: opts?.occurredAt ?? new Date().toISOString(),
    };
    this.movements.push(movement);

    this.bus.publish("inventory.stock_movement", { skuId, type, quantity, newTotalQty: newQty });

    if (newQty <= sku.reorderPoint && oldQty > sku.reorderPoint) {
      this.bus.publish("inventory.low_stock", { skuId, name: sku.name, currentQty: newQty, reorderPoint: sku.reorderPoint });
      this.bus.publish("inventory.reorder_triggered", { skuId, name: sku.name, reorderQty: sku.reorderQty, supplierName: sku.supplierName });
    }

    return movement;
  }

  reserve(skuId: string, qty: number): boolean {
    const sku = this.skus.get(skuId);
    if (!sku) return false;
    const available = sku.currentQty - sku.reservedQty;
    if (available < qty) return false;
    sku.reservedQty += qty;
    sku.updatedAt = new Date().toISOString();
    return true;
  }

  releaseReservation(skuId: string, qty: number): void {
    const sku = this.skus.get(skuId);
    if (!sku) return;
    sku.reservedQty = Math.max(0, sku.reservedQty - qty);
    sku.updatedAt = new Date().toISOString();
  }

  getSKU(id: string): SKU | undefined {
    return this.skus.get(id);
  }

  findBySKUCode(sku: string): SKU | undefined {
    for (const s of this.skus.values()) {
      if (s.sku === sku) return s;
    }
    return undefined;
  }

  listSKUs(status?: StockStatus): SKU[] {
    const all = Array.from(this.skus.values());
    if (status === undefined) return all;
    return all.filter((s) => s.status === status);
  }

  getMovements(skuId?: string): StockMovement[] {
    if (skuId === undefined) return this.movements.slice();
    return this.movements.filter((m) => m.skuId === skuId);
  }

  summary(): InventorySummary {
    const all = Array.from(this.skus.values());
    const active = all.filter((s) => s.status !== "discontinued");
    return {
      totalSKUs: all.length,
      activeSKUs: active.length,
      lowStockSKUs: all.filter((s) => s.status === "low_stock").length,
      outOfStockSKUs: all.filter((s) => s.status === "out_of_stock").length,
      totalInventoryValueUsd: all.reduce((sum, s) => sum + s.currentQty * s.unitCostUsd, 0),
      totalMovements: this.movements.length,
    };
  }
}
