/**
 * PriceMatchManager — competitor price-match claims: eligible-competitor
 * registry, claim submission with competitor price evidence, policy-bounded
 * approval (max match percentage), and adjustment issuance.
 *
 * Events:
 *   - "pricematch.claimed": { claimId, sku, ourPriceUsd, competitorPriceUsd }
 *   - "pricematch.approved": { claimId, adjustmentUsd }
 *   - "pricematch.denied": { claimId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ClaimStatus = "submitted" | "approved" | "denied";

export interface PriceMatchClaim {
  id: string;
  customerId: string;
  sku: string;
  ourPriceUsd: number;
  competitorPriceUsd: number;
  competitor: string;
  status: ClaimStatus;
  adjustmentUsd?: number;
  denialReason?: string;
  submittedAt: string;
  decidedAt?: string;
}

export interface PriceMatchSummary {
  totalClaims: number;
  approved: number;
  denied: number;
  approvalRatePct: number;
  totalAdjustmentsUsd: number;
  byCompetitor: Record<string, number>;
}

export class PriceMatchManager {
  private eligibleCompetitors: Set<string> = new Set();
  private claims: Map<string, PriceMatchClaim> = new Map();
  private maxMatchPct: number;

  constructor(private readonly bus: EventBus, maxMatchPct = 20) {
    this.maxMatchPct = maxMatchPct;
  }

  addCompetitor(name: string): void { this.eligibleCompetitors.add(name.toLowerCase()); }

  submit(input: { customerId: string; sku: string; ourPriceUsd: number; competitorPriceUsd: number; competitor: string; submittedAt: string }): PriceMatchClaim {
    const claim: PriceMatchClaim = { ...input, id: randomUUID(), status: "submitted" };
    this.claims.set(claim.id, claim);
    this.bus.publish("pricematch.claimed", { claimId: claim.id, sku: claim.sku, ourPriceUsd: claim.ourPriceUsd, competitorPriceUsd: claim.competitorPriceUsd });
    return claim;
  }

  /** Auto-adjudicate: approve within policy, deny otherwise with a reason. */
  adjudicate(claimId: string, asOf: string): PriceMatchClaim | undefined {
    const c = this.claims.get(claimId);
    if (!c || c.status !== "submitted") return undefined;
    c.decidedAt = asOf;
    if (!this.eligibleCompetitors.has(c.competitor.toLowerCase())) {
      c.status = "denied";
      c.denialReason = "competitor_not_eligible";
    } else if (c.competitorPriceUsd >= c.ourPriceUsd) {
      c.status = "denied";
      c.denialReason = "not_cheaper";
    } else {
      const diff = c.ourPriceUsd - c.competitorPriceUsd;
      const maxAdjust = c.ourPriceUsd * (this.maxMatchPct / 100);
      if (diff > maxAdjust) {
        c.status = "denied";
        c.denialReason = "exceeds_policy_cap";
      } else {
        c.status = "approved";
        c.adjustmentUsd = Math.round(diff * 100) / 100;
        this.bus.publish("pricematch.approved", { claimId, adjustmentUsd: c.adjustmentUsd });
        return c;
      }
    }
    this.bus.publish("pricematch.denied", { claimId, reason: c.denialReason });
    return c;
  }

  getClaim(id: string): PriceMatchClaim | undefined { return this.claims.get(id); }
  listClaims(status?: ClaimStatus): PriceMatchClaim[] {
    const all = Array.from(this.claims.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): PriceMatchSummary {
    const claims = Array.from(this.claims.values());
    const approved = claims.filter(c => c.status === "approved");
    const decided = claims.filter(c => c.status !== "submitted").length;
    const byCompetitor: Record<string, number> = {};
    for (const c of claims) { byCompetitor[c.competitor] = (byCompetitor[c.competitor] ?? 0) + 1; }
    return {
      totalClaims: claims.length,
      approved: approved.length,
      denied: claims.filter(c => c.status === "denied").length,
      approvalRatePct: decided > 0 ? Math.round((approved.length / decided) * 100) : 0,
      totalAdjustmentsUsd: Math.round(approved.reduce((s, c) => s + (c.adjustmentUsd ?? 0), 0) * 100) / 100,
      byCompetitor,
    };
  }
}
