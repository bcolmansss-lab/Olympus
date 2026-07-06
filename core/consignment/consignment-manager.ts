/**
 * ConsignmentManager — consigned inventory: intake of consignor items with a
 * commission split, listing, sale recording with automatic split calculation,
 * unsold-item return, and consignor payout accrual.
 *
 * Events:
 *   - "consignment.intake": { itemId, consignorId, listPriceUsd }
 *   - "consignment.sold": { itemId, salePriceUsd, consignorShareUsd }
 *   - "consignment.returned": { itemId, consignorId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ConsignmentStatus = "intake" | "listed" | "sold" | "returned";

export interface ConsignmentItem {
  id: string;
  consignorId: string;
  description: string;
  listPriceUsd: number;
  commissionPct: number;
  status: ConsignmentStatus;
  salePriceUsd?: number;
  consignorShareUsd?: number;
  storeShareUsd?: number;
  receivedAt: string;
  soldAt?: string;
}

export interface ConsignmentSummary {
  totalItems: number;
  listed: number;
  sold: number;
  sellThroughPct: number;
  totalConsignorPayoutsUsd: number;
  totalStoreRevenueUsd: number;
}

export class ConsignmentManager {
  private items: Map<string, ConsignmentItem> = new Map();
  private defaultCommissionPct: number;

  constructor(private readonly bus: EventBus, defaultCommissionPct = 40) {
    this.defaultCommissionPct = defaultCommissionPct;
  }

  intake(input: { consignorId: string; description: string; listPriceUsd: number; receivedAt: string; commissionPct?: number }): ConsignmentItem {
    const item: ConsignmentItem = {
      id: randomUUID(),
      consignorId: input.consignorId,
      description: input.description,
      listPriceUsd: input.listPriceUsd,
      commissionPct: input.commissionPct ?? this.defaultCommissionPct,
      status: "intake",
      receivedAt: input.receivedAt,
    };
    this.items.set(item.id, item);
    this.bus.publish("consignment.intake", { itemId: item.id, consignorId: item.consignorId, listPriceUsd: item.listPriceUsd });
    return item;
  }

  list(itemId: string): ConsignmentItem | undefined {
    const item = this.items.get(itemId);
    if (!item || item.status !== "intake") return undefined;
    item.status = "listed";
    return item;
  }

  recordSale(itemId: string, salePriceUsd: number, asOf: string): ConsignmentItem | undefined {
    const item = this.items.get(itemId);
    if (!item || item.status !== "listed") return undefined;
    item.status = "sold";
    item.salePriceUsd = salePriceUsd;
    item.storeShareUsd = Math.round(salePriceUsd * (item.commissionPct / 100) * 100) / 100;
    item.consignorShareUsd = Math.round((salePriceUsd - item.storeShareUsd) * 100) / 100;
    item.soldAt = asOf;
    this.bus.publish("consignment.sold", { itemId, salePriceUsd, consignorShareUsd: item.consignorShareUsd });
    return item;
  }

  returnToConsignor(itemId: string): ConsignmentItem | undefined {
    const item = this.items.get(itemId);
    if (!item || item.status === "sold" || item.status === "returned") return undefined;
    item.status = "returned";
    this.bus.publish("consignment.returned", { itemId, consignorId: item.consignorId });
    return item;
  }

  getItem(id: string): ConsignmentItem | undefined { return this.items.get(id); }
  listItems(status?: ConsignmentStatus, consignorId?: string): ConsignmentItem[] {
    let all = Array.from(this.items.values());
    if (status) all = all.filter(i => i.status === status);
    if (consignorId) all = all.filter(i => i.consignorId === consignorId);
    return all;
  }

  /** Total accrued payout owed to one consignor across their sold items. */
  payoutOwed(consignorId: string): number {
    const owed = this.listItems("sold", consignorId).reduce((s, i) => s + (i.consignorShareUsd ?? 0), 0);
    return Math.round(owed * 100) / 100;
  }

  summary(): ConsignmentSummary {
    const items = Array.from(this.items.values());
    const sold = items.filter(i => i.status === "sold");
    const closed = items.filter(i => i.status === "sold" || i.status === "returned").length;
    return {
      totalItems: items.length,
      listed: items.filter(i => i.status === "listed").length,
      sold: sold.length,
      sellThroughPct: closed > 0 ? Math.round((sold.length / closed) * 100) : 0,
      totalConsignorPayoutsUsd: Math.round(sold.reduce((s, i) => s + (i.consignorShareUsd ?? 0), 0) * 100) / 100,
      totalStoreRevenueUsd: Math.round(sold.reduce((s, i) => s + (i.storeShareUsd ?? 0), 0) * 100) / 100,
    };
  }
}
