/**
 * PromotionManager — promotional codes and discount campaigns with redemption
 * limits, validity windows, and redemption analytics.
 *
 * Events:
 *   - "promotion.created": { promotionId, code, discountKind, value }
 *   - "promotion.redeemed": { promotionId, code, customerId, discountUsd }
 *   - "promotion.exhausted": { promotionId, code, maxRedemptions }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DiscountKind = "percentage" | "fixed_amount";
export type PromotionStatus = "active" | "paused" | "expired" | "exhausted";

export interface Promotion {
  id: string;
  code: string;
  description: string;
  discountKind: DiscountKind;
  value: number; // percent (0-100) or USD amount
  maxRedemptions: number; // 0 = unlimited
  redemptionCount: number;
  startsAt: string;
  endsAt: string;
  status: PromotionStatus;
  createdAt: string;
}

export interface Redemption {
  id: string;
  promotionId: string;
  customerId: string;
  orderSubtotalUsd: number;
  discountUsd: number;
  redeemedAt: string;
}

export interface PromotionSummary {
  totalPromotions: number;
  active: number;
  totalRedemptions: number;
  totalDiscountUsd: number;
  byDiscountKind: Partial<Record<DiscountKind, number>>;
}

export class PromotionManager {
  private promotions: Map<string, Promotion> = new Map();
  private byCode: Map<string, string> = new Map();
  private redemptions: Map<string, Redemption> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPromotion(input: Omit<Promotion, "id" | "redemptionCount" | "status" | "createdAt"> & { id?: string }): Promotion | undefined {
    if (this.byCode.has(input.code)) return undefined;
    const promo: Promotion = { ...input, id: input.id ?? randomUUID(), redemptionCount: 0, status: "active", createdAt: new Date().toISOString() };
    this.promotions.set(promo.id, promo);
    this.byCode.set(promo.code, promo.id);
    this.bus.publish("promotion.created", { promotionId: promo.id, code: promo.code, discountKind: promo.discountKind, value: promo.value });
    return promo;
  }

  pause(promotionId: string): Promotion | undefined {
    const p = this.promotions.get(promotionId);
    if (!p) return undefined;
    p.status = "paused";
    return p;
  }

  resume(promotionId: string): Promotion | undefined {
    const p = this.promotions.get(promotionId);
    if (!p || p.status !== "paused") return undefined;
    p.status = "active";
    return p;
  }

  private computeDiscount(p: Promotion, subtotal: number): number {
    if (p.discountKind === "percentage") return Math.round(subtotal * (p.value / 100) * 100) / 100;
    return Math.min(p.value, subtotal);
  }

  redeem(code: string, customerId: string, orderSubtotalUsd: number, asOf: string): Redemption | undefined {
    const id = this.byCode.get(code);
    if (!id) return undefined;
    const p = this.promotions.get(id)!;
    const now = new Date(asOf).getTime();
    if (p.status !== "active") return undefined;
    if (now < new Date(p.startsAt).getTime() || now > new Date(p.endsAt).getTime()) return undefined;
    if (p.maxRedemptions > 0 && p.redemptionCount >= p.maxRedemptions) return undefined;
    const discountUsd = this.computeDiscount(p, orderSubtotalUsd);
    const redemption: Redemption = { id: randomUUID(), promotionId: p.id, customerId, orderSubtotalUsd, discountUsd, redeemedAt: asOf };
    this.redemptions.set(redemption.id, redemption);
    p.redemptionCount += 1;
    this.bus.publish("promotion.redeemed", { promotionId: p.id, code: p.code, customerId, discountUsd });
    if (p.maxRedemptions > 0 && p.redemptionCount >= p.maxRedemptions) {
      p.status = "exhausted";
      this.bus.publish("promotion.exhausted", { promotionId: p.id, code: p.code, maxRedemptions: p.maxRedemptions });
    }
    return redemption;
  }

  getPromotion(id: string): Promotion | undefined { return this.promotions.get(id); }
  findByCode(code: string): Promotion | undefined { const id = this.byCode.get(code); return id ? this.promotions.get(id) : undefined; }
  listPromotions(status?: PromotionStatus): Promotion[] {
    const all = Array.from(this.promotions.values());
    return status ? all.filter(p => p.status === status) : all;
  }
  listRedemptions(promotionId?: string): Redemption[] {
    const all = Array.from(this.redemptions.values());
    return promotionId ? all.filter(r => r.promotionId === promotionId) : all;
  }

  summary(): PromotionSummary {
    const promos = Array.from(this.promotions.values());
    const redemptions = Array.from(this.redemptions.values());
    const byDiscountKind: Partial<Record<DiscountKind, number>> = {};
    for (const p of promos) { byDiscountKind[p.discountKind] = (byDiscountKind[p.discountKind] ?? 0) + 1; }
    return {
      totalPromotions: promos.length,
      active: promos.filter(p => p.status === "active").length,
      totalRedemptions: redemptions.length,
      totalDiscountUsd: redemptions.reduce((s, r) => s + r.discountUsd, 0),
      byDiscountKind,
    };
  }
}
