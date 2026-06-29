/**
 * RenewalManager — subscription renewal pipeline: upcoming renewals with risk
 * forecasting, renewal stages, uplift/downsell capture, and renewal-rate
 * analytics.
 *
 * Events:
 *   - "renewal.created": { renewalId, accountId, arrUsd, renewalDate }
 *   - "renewal.renewed": { renewalId, newArrUsd, upliftPct }
 *   - "renewal.churned": { renewalId, lostArrUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RenewalStage = "upcoming" | "in_negotiation" | "renewed" | "churned";
export type RenewalRisk = "low" | "medium" | "high";

export interface Renewal {
  id: string;
  accountId: string;
  accountName: string;
  currentArrUsd: number;
  renewedArrUsd?: number;
  renewalDate: string;
  stage: RenewalStage;
  risk: RenewalRisk;
  ownerId: string;
  createdAt: string;
  closedAt?: string;
}

export interface RenewalSummary {
  totalRenewals: number;
  upcoming: number;
  renewed: number;
  churned: number;
  grossRetentionPct: number;
  netRetentionPct: number;
  atRiskArrUsd: number;
}

export class RenewalManager {
  private renewals: Map<string, Renewal> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { accountId: string; accountName: string; currentArrUsd: number; renewalDate: string; ownerId: string; risk?: RenewalRisk }): Renewal {
    const renewal: Renewal = { ...input, id: randomUUID(), stage: "upcoming", risk: input.risk ?? "low", createdAt: new Date().toISOString() };
    this.renewals.set(renewal.id, renewal);
    this.bus.publish("renewal.created", { renewalId: renewal.id, accountId: renewal.accountId, arrUsd: renewal.currentArrUsd, renewalDate: renewal.renewalDate });
    return renewal;
  }

  setRisk(renewalId: string, risk: RenewalRisk): Renewal | undefined {
    const r = this.renewals.get(renewalId);
    if (!r || r.stage === "renewed" || r.stage === "churned") return undefined;
    r.risk = risk;
    return r;
  }

  startNegotiation(renewalId: string): Renewal | undefined {
    const r = this.renewals.get(renewalId);
    if (!r || r.stage !== "upcoming") return undefined;
    r.stage = "in_negotiation";
    return r;
  }

  renew(renewalId: string, newArrUsd: number, asOf: string): Renewal | undefined {
    const r = this.renewals.get(renewalId);
    if (!r || (r.stage !== "upcoming" && r.stage !== "in_negotiation")) return undefined;
    r.stage = "renewed";
    r.renewedArrUsd = newArrUsd;
    r.closedAt = asOf;
    const upliftPct = r.currentArrUsd > 0 ? Math.round(((newArrUsd - r.currentArrUsd) / r.currentArrUsd) * 100) : 0;
    this.bus.publish("renewal.renewed", { renewalId, newArrUsd, upliftPct });
    return r;
  }

  churn(renewalId: string, asOf: string): Renewal | undefined {
    const r = this.renewals.get(renewalId);
    if (!r || (r.stage !== "upcoming" && r.stage !== "in_negotiation")) return undefined;
    r.stage = "churned";
    r.renewedArrUsd = 0;
    r.closedAt = asOf;
    this.bus.publish("renewal.churned", { renewalId, lostArrUsd: r.currentArrUsd });
    return r;
  }

  getRenewal(id: string): Renewal | undefined { return this.renewals.get(id); }
  listRenewals(stage?: RenewalStage, risk?: RenewalRisk): Renewal[] {
    let all = Array.from(this.renewals.values());
    if (stage) all = all.filter(r => r.stage === stage);
    if (risk) all = all.filter(r => r.risk === risk);
    return all;
  }

  summary(): RenewalSummary {
    const renewals = Array.from(this.renewals.values());
    const closed = renewals.filter(r => r.stage === "renewed" || r.stage === "churned");
    const closedArr = closed.reduce((s, r) => s + r.currentArrUsd, 0);
    const retainedArr = closed.reduce((s, r) => s + Math.min(r.currentArrUsd, r.renewedArrUsd ?? 0), 0);
    const renewedArr = closed.reduce((s, r) => s + (r.renewedArrUsd ?? 0), 0);
    return {
      totalRenewals: renewals.length,
      upcoming: renewals.filter(r => r.stage === "upcoming" || r.stage === "in_negotiation").length,
      renewed: renewals.filter(r => r.stage === "renewed").length,
      churned: renewals.filter(r => r.stage === "churned").length,
      grossRetentionPct: closedArr > 0 ? Math.round((retainedArr / closedArr) * 100) : 0,
      netRetentionPct: closedArr > 0 ? Math.round((renewedArr / closedArr) * 100) : 0,
      atRiskArrUsd: Math.round(renewals.filter(r => (r.stage === "upcoming" || r.stage === "in_negotiation") && r.risk === "high").reduce((s, r) => s + r.currentArrUsd, 0) * 100) / 100,
    };
  }
}
