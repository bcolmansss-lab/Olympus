/**
 * UpsellManager — cross-sell/upsell recommendation rules: product-affinity
 * rules, per-customer recommendations, presentation tracking, and acceptance
 * conversion analytics.
 *
 * Events:
 *   - "upsell.rule_created": { ruleId, triggerSku, recommendedSku, type }
 *   - "upsell.recommended": { recId, customerId, recommendedSku }
 *   - "upsell.accepted": { recId, customerId, revenueUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RecommendationType = "cross_sell" | "upsell" | "add_on";
export type RecState = "presented" | "accepted" | "dismissed";

export interface UpsellRule {
  id: string;
  triggerSku: string;
  recommendedSku: string;
  type: RecommendationType;
  priceUsd: number;
  confidencePct: number;
  active: boolean;
}

export interface Recommendation {
  id: string;
  customerId: string;
  ruleId: string;
  recommendedSku: string;
  state: RecState;
  presentedAt: string;
  resolvedAt?: string;
  revenueUsd: number;
}

export interface UpsellSummary {
  totalRules: number;
  totalRecommendations: number;
  accepted: number;
  acceptanceRatePct: number;
  attributedRevenueUsd: number;
  byType: Partial<Record<RecommendationType, number>>;
}

export class UpsellManager {
  private rules: Map<string, UpsellRule> = new Map();
  private recs: Map<string, Recommendation> = new Map();

  constructor(private readonly bus: EventBus) {}

  createRule(input: { triggerSku: string; recommendedSku: string; type: RecommendationType; priceUsd: number; confidencePct?: number }): UpsellRule {
    const rule: UpsellRule = { ...input, id: randomUUID(), confidencePct: input.confidencePct ?? 50, active: true };
    this.rules.set(rule.id, rule);
    this.bus.publish("upsell.rule_created", { ruleId: rule.id, triggerSku: rule.triggerSku, recommendedSku: rule.recommendedSku, type: rule.type });
    return rule;
  }

  setActive(ruleId: string, active: boolean): UpsellRule | undefined {
    const rule = this.rules.get(ruleId);
    if (!rule) return undefined;
    rule.active = active;
    return rule;
  }

  /** Given a customer's cart SKUs, return matching active recommendation rules ranked by confidence. */
  recommendationsFor(cartSkus: string[]): UpsellRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.active && cartSkus.includes(r.triggerSku) && !cartSkus.includes(r.recommendedSku))
      .sort((a, b) => b.confidencePct - a.confidencePct);
  }

  present(ruleId: string, customerId: string, presentedAt: string): Recommendation | undefined {
    const rule = this.rules.get(ruleId);
    if (!rule || !rule.active) return undefined;
    const rec: Recommendation = { id: randomUUID(), customerId, ruleId, recommendedSku: rule.recommendedSku, state: "presented", presentedAt, revenueUsd: 0 };
    this.recs.set(rec.id, rec);
    this.bus.publish("upsell.recommended", { recId: rec.id, customerId, recommendedSku: rule.recommendedSku });
    return rec;
  }

  accept(recId: string, asOf: string): Recommendation | undefined {
    const rec = this.recs.get(recId);
    if (!rec || rec.state !== "presented") return undefined;
    const rule = this.rules.get(rec.ruleId)!;
    rec.state = "accepted";
    rec.resolvedAt = asOf;
    rec.revenueUsd = rule.priceUsd;
    this.bus.publish("upsell.accepted", { recId, customerId: rec.customerId, revenueUsd: rule.priceUsd });
    return rec;
  }

  dismiss(recId: string, asOf: string): Recommendation | undefined {
    const rec = this.recs.get(recId);
    if (!rec || rec.state !== "presented") return undefined;
    rec.state = "dismissed";
    rec.resolvedAt = asOf;
    return rec;
  }

  getRule(id: string): UpsellRule | undefined { return this.rules.get(id); }
  getRecommendation(id: string): Recommendation | undefined { return this.recs.get(id); }
  listRules(type?: RecommendationType): UpsellRule[] {
    const all = Array.from(this.rules.values());
    return type ? all.filter(r => r.type === type) : all;
  }
  listRecommendations(customerId?: string, state?: RecState): Recommendation[] {
    let all = Array.from(this.recs.values());
    if (customerId) all = all.filter(r => r.customerId === customerId);
    if (state) all = all.filter(r => r.state === state);
    return all;
  }

  summary(): UpsellSummary {
    const recs = Array.from(this.recs.values());
    const accepted = recs.filter(r => r.state === "accepted");
    const byType: Partial<Record<RecommendationType, number>> = {};
    for (const r of recs) {
      const rule = this.rules.get(r.ruleId);
      if (rule) byType[rule.type] = (byType[rule.type] ?? 0) + 1;
    }
    return {
      totalRules: this.rules.size,
      totalRecommendations: recs.length,
      accepted: accepted.length,
      acceptanceRatePct: recs.length > 0 ? Math.round((accepted.length / recs.length) * 100) : 0,
      attributedRevenueUsd: Math.round(accepted.reduce((s, r) => s + r.revenueUsd, 0) * 100) / 100,
      byType,
    };
  }
}
