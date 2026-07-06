/**
 * TradeInManager — product/device trade-ins: condition-based quote generation
 * from a base-value table, customer acceptance, physical inspection with
 * requote on mismatch, and credit issuance.
 *
 * Events:
 *   - "tradein.quoted": { tradeInId, product, quoteUsd }
 *   - "tradein.requoted": { tradeInId, originalUsd, revisedUsd }
 *   - "tradein.credited": { tradeInId, customerId, creditUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type Condition = "like_new" | "good" | "fair" | "poor";
export type TradeInStatus = "quoted" | "accepted" | "received" | "requoted" | "credited" | "rejected";

const CONDITION_FACTOR: Record<Condition, number> = { like_new: 1.0, good: 0.8, fair: 0.55, poor: 0.3 };

export interface TradeIn {
  id: string;
  customerId: string;
  product: string;
  claimedCondition: Condition;
  inspectedCondition?: Condition;
  baseValueUsd: number;
  quoteUsd: number;
  finalCreditUsd?: number;
  status: TradeInStatus;
  createdAt: string;
  creditedAt?: string;
}

export interface TradeInSummary {
  totalTradeIns: number;
  pending: number;
  credited: number;
  totalCreditedUsd: number;
  requoteRatePct: number;
}

export class TradeInManager {
  private tradeIns: Map<string, TradeIn> = new Map();
  private baseValues: Map<string, number> = new Map();

  constructor(private readonly bus: EventBus) {}

  setBaseValue(product: string, baseValueUsd: number): void {
    this.baseValues.set(product, baseValueUsd);
  }

  quote(customerId: string, product: string, claimedCondition: Condition): TradeIn | undefined {
    const base = this.baseValues.get(product);
    if (base === undefined) return undefined;
    const quoteUsd = Math.round(base * CONDITION_FACTOR[claimedCondition] * 100) / 100;
    const tradeIn: TradeIn = { id: randomUUID(), customerId, product, claimedCondition, baseValueUsd: base, quoteUsd, status: "quoted", createdAt: new Date().toISOString() };
    this.tradeIns.set(tradeIn.id, tradeIn);
    this.bus.publish("tradein.quoted", { tradeInId: tradeIn.id, product, quoteUsd });
    return tradeIn;
  }

  accept(tradeInId: string): TradeIn | undefined {
    const t = this.tradeIns.get(tradeInId);
    if (!t || t.status !== "quoted") return undefined;
    t.status = "accepted";
    return t;
  }

  /** Inspect on receipt; a worse condition triggers a requote. */
  inspect(tradeInId: string, inspectedCondition: Condition): TradeIn | undefined {
    const t = this.tradeIns.get(tradeInId);
    if (!t || t.status !== "accepted") return undefined;
    t.inspectedCondition = inspectedCondition;
    if (inspectedCondition !== t.claimedCondition) {
      const revised = Math.round(t.baseValueUsd * CONDITION_FACTOR[inspectedCondition] * 100) / 100;
      this.bus.publish("tradein.requoted", { tradeInId, originalUsd: t.quoteUsd, revisedUsd: revised });
      t.quoteUsd = revised;
      t.status = "requoted";
    } else {
      t.status = "received";
    }
    return t;
  }

  /** Customer accepts the revised quote (or original) and credit is issued. */
  credit(tradeInId: string, asOf: string): TradeIn | undefined {
    const t = this.tradeIns.get(tradeInId);
    if (!t || (t.status !== "received" && t.status !== "requoted")) return undefined;
    t.status = "credited";
    t.finalCreditUsd = t.quoteUsd;
    t.creditedAt = asOf;
    this.bus.publish("tradein.credited", { tradeInId, customerId: t.customerId, creditUsd: t.finalCreditUsd });
    return t;
  }

  reject(tradeInId: string): TradeIn | undefined {
    const t = this.tradeIns.get(tradeInId);
    if (!t || t.status === "credited") return undefined;
    t.status = "rejected";
    return t;
  }

  getTradeIn(id: string): TradeIn | undefined { return this.tradeIns.get(id); }
  listTradeIns(status?: TradeInStatus): TradeIn[] {
    const all = Array.from(this.tradeIns.values());
    return status ? all.filter(t => t.status === status) : all;
  }

  summary(): TradeInSummary {
    const tradeIns = Array.from(this.tradeIns.values());
    const requoted = tradeIns.filter(t => t.inspectedCondition && t.inspectedCondition !== t.claimedCondition).length;
    const inspected = tradeIns.filter(t => t.inspectedCondition).length;
    return {
      totalTradeIns: tradeIns.length,
      pending: tradeIns.filter(t => t.status !== "credited" && t.status !== "rejected").length,
      credited: tradeIns.filter(t => t.status === "credited").length,
      totalCreditedUsd: Math.round(tradeIns.reduce((s, t) => s + (t.finalCreditUsd ?? 0), 0) * 100) / 100,
      requoteRatePct: inspected > 0 ? Math.round((requoted / inspected) * 100) : 0,
    };
  }
}
