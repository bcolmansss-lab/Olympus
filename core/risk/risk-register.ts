/**
 * RiskRegister — formal risk catalog with probability × impact scoring.
 *
 * Each Risk has:
 *   - probability: 0–1 (likelihood of occurring)
 *   - impact: 1–5 (business impact severity)
 *   - inherentScore = probability × impact (before mitigation)
 *   - residualScore = residualProbability × residualImpact (after mitigation)
 *   - status: open | mitigating | mitigated | accepted | closed
 *
 * Events:
 *   - "risk.raised": { riskId, title, inherentScore, domain }
 *   - "risk.mitigated": { riskId, title, residualScore }
 *   - "risk.escalated": { riskId, title, inherentScore, reason } — when score > escalationThreshold
 */

import type { EventBus } from "../events/event-bus.js";

export type RiskStatus = "open" | "mitigating" | "mitigated" | "accepted" | "closed";
export type RiskCategory = "strategic" | "operational" | "financial" | "compliance" | "reputational" | "technology";

export interface Mitigation {
  id: string;
  description: string;
  owner: string;
  dueDate: string;
  completedAt?: string;
}

export interface RiskEntry {
  id: string;
  title: string;
  description: string;
  category: RiskCategory;
  domain: string;
  probability: number;
  impact: number;
  inherentScore: number;
  residualProbability: number;
  residualImpact: number;
  residualScore: number;
  status: RiskStatus;
  owner: string;
  raisedAt: string;
  updatedAt: string;
  mitigations: Mitigation[];
  tags?: string[];
}

export interface AddRiskInput {
  id?: string;
  title: string;
  description: string;
  category: RiskCategory;
  domain: string;
  probability: number;
  impact: number;
  owner: string;
  tags?: string[];
}

export class RiskRegister {
  private readonly risks = new Map<string, RiskEntry>();
  private riskSeq = 0;
  private mitSeq = 0;
  private readonly escalationThreshold: number;

  constructor(
    private readonly bus: EventBus,
    opts?: { escalationThreshold?: number }
  ) {
    this.escalationThreshold = opts?.escalationThreshold ?? 3.0;
  }

  raise(input: AddRiskInput): RiskEntry {
    const now = new Date().toISOString();
    const inherentScore = input.probability * input.impact;
    const entry: RiskEntry = {
      id: input.id ?? `risk-${++this.riskSeq}`,
      title: input.title,
      description: input.description,
      category: input.category,
      domain: input.domain,
      probability: input.probability,
      impact: input.impact,
      inherentScore,
      residualProbability: input.probability,
      residualImpact: input.impact,
      residualScore: inherentScore,
      status: "open",
      owner: input.owner,
      raisedAt: now,
      updatedAt: now,
      mitigations: [],
      tags: input.tags,
    };

    this.risks.set(entry.id, entry);
    this.bus.publish("risk.raised", {
      riskId: entry.id,
      title: entry.title,
      inherentScore,
      domain: entry.domain,
    });

    if (inherentScore > this.escalationThreshold) {
      this.bus.publish("risk.escalated", {
        riskId: entry.id,
        title: entry.title,
        inherentScore,
        reason: `Inherent score ${inherentScore.toFixed(2)} exceeds threshold ${this.escalationThreshold}`,
      });
    }

    return entry;
  }

  addMitigation(riskId: string, mit: Omit<Mitigation, "id">): Mitigation | undefined {
    const risk = this.risks.get(riskId);
    if (!risk) return undefined;
    const mitigation: Mitigation = { ...mit, id: `mit-${++this.mitSeq}` };
    risk.mitigations.push(mitigation);
    risk.status = "mitigating";
    risk.updatedAt = new Date().toISOString();
    return mitigation;
  }

  setResidual(
    riskId: string,
    residualProbability: number,
    residualImpact: number
  ): RiskEntry | undefined {
    const risk = this.risks.get(riskId);
    if (!risk) return undefined;

    risk.residualProbability = residualProbability;
    risk.residualImpact = residualImpact;
    risk.residualScore = residualProbability * residualImpact;
    risk.status = risk.residualScore < risk.inherentScore ? "mitigated" : "mitigating";
    risk.updatedAt = new Date().toISOString();

    if (risk.residualScore < risk.inherentScore) {
      this.bus.publish("risk.mitigated", {
        riskId: risk.id,
        title: risk.title,
        residualScore: risk.residualScore,
      });
    }

    return risk;
  }

  updateStatus(riskId: string, status: RiskStatus): RiskEntry | undefined {
    const risk = this.risks.get(riskId);
    if (!risk) return undefined;
    risk.status = status;
    risk.updatedAt = new Date().toISOString();
    return risk;
  }

  get(riskId: string): RiskEntry | undefined {
    return this.risks.get(riskId);
  }

  list(status?: RiskStatus): RiskEntry[] {
    const all = [...this.risks.values()];
    return status ? all.filter((r) => r.status === status) : all;
  }

  topRisks(n = 10): RiskEntry[] {
    return [...this.risks.values()]
      .filter((r) => r.status !== "closed")
      .sort((a, b) => b.residualScore - a.residualScore)
      .slice(0, n);
  }

  count(): number { return this.risks.size; }
}
