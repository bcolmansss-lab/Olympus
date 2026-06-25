/**
 * SupplierScorecardManager — periodic supplier performance scorecards across
 * weighted dimensions (quality, delivery, cost, responsiveness) with rating
 * tiers and trend tracking.
 *
 * Events:
 *   - "supplierscorecard.recorded": { scorecardId, supplierId, period, score, tier }
 *   - "supplierscorecard.downgraded": { supplierId, fromTier, toTier }
 *   - "supplierscorecard.flagged": { supplierId, score, tier }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SupplierTier = "preferred" | "approved" | "conditional" | "probation";

export interface ScoreDimension {
  name: string; // quality, delivery, cost, responsiveness
  scorePct: number; // 0-100
  weight: number;
}

export interface SupplierScorecard {
  id: string;
  supplierId: string;
  supplierName: string;
  period: string;
  dimensions: ScoreDimension[];
  score: number; // weighted 0-100
  tier: SupplierTier;
  recordedAt: string;
}

export interface SupplierScorecardSummary {
  totalScorecards: number;
  scoredSuppliers: number;
  avgScore: number;
  byTier: Partial<Record<SupplierTier, number>>;
  flaggedSuppliers: number;
}

export class SupplierScorecardManager {
  private scorecards: Map<string, SupplierScorecard> = new Map();
  private latestTier: Map<string, SupplierTier> = new Map();

  constructor(private readonly bus: EventBus) {}

  private tierFor(score: number): SupplierTier {
    if (score >= 90) return "preferred";
    if (score >= 75) return "approved";
    if (score >= 60) return "conditional";
    return "probation";
  }

  record(supplierId: string, supplierName: string, period: string, dimensions: ScoreDimension[]): SupplierScorecard {
    const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
    const score = Math.round(dimensions.reduce((s, d) => s + d.scorePct * d.weight, 0) / totalWeight);
    const tier = this.tierFor(score);
    const scorecard: SupplierScorecard = { id: randomUUID(), supplierId, supplierName, period, dimensions, score, tier, recordedAt: new Date().toISOString() };
    this.scorecards.set(scorecard.id, scorecard);
    const prevTier = this.latestTier.get(supplierId);
    this.bus.publish("supplierscorecard.recorded", { scorecardId: scorecard.id, supplierId, period, score, tier });
    const order: SupplierTier[] = ["probation", "conditional", "approved", "preferred"];
    if (prevTier && order.indexOf(tier) < order.indexOf(prevTier)) {
      this.bus.publish("supplierscorecard.downgraded", { supplierId, fromTier: prevTier, toTier: tier });
    }
    if (tier === "probation") {
      this.bus.publish("supplierscorecard.flagged", { supplierId, score, tier });
    }
    this.latestTier.set(supplierId, tier);
    return scorecard;
  }

  latestFor(supplierId: string): SupplierScorecard | undefined {
    return Array.from(this.scorecards.values())
      .filter(s => s.supplierId === supplierId)
      .sort((a, b) => (new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()) || b.period.localeCompare(a.period))[0];
  }

  trend(supplierId: string): number[] {
    return Array.from(this.scorecards.values())
      .filter(s => s.supplierId === supplierId)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(s => s.score);
  }

  getScorecard(id: string): SupplierScorecard | undefined { return this.scorecards.get(id); }
  listScorecards(supplierId?: string, tier?: SupplierTier): SupplierScorecard[] {
    let all = Array.from(this.scorecards.values());
    if (supplierId) all = all.filter(s => s.supplierId === supplierId);
    if (tier) all = all.filter(s => s.tier === tier);
    return all;
  }

  summary(): SupplierScorecardSummary {
    const scorecards = Array.from(this.scorecards.values());
    const byTier: Partial<Record<SupplierTier, number>> = {};
    for (const [, tier] of this.latestTier) { byTier[tier] = (byTier[tier] ?? 0) + 1; }
    const avg = scorecards.length > 0 ? Math.round(scorecards.reduce((s, c) => s + c.score, 0) / scorecards.length) : 0;
    return {
      totalScorecards: scorecards.length,
      scoredSuppliers: this.latestTier.size,
      avgScore: avg,
      byTier,
      flaggedSuppliers: Array.from(this.latestTier.values()).filter(t => t === "probation").length,
    };
  }
}
