/**
 * VendorRiskManager — third-party vendor risk assessments, due-diligence
 * scoring, criticality tiering, and remediation tracking.
 *
 * Events:
 *   - "vendorrisk.assessment_completed": { vendorId, vendorName, riskScore, tier }
 *   - "vendorrisk.high_risk_flagged": { vendorId, vendorName, riskScore }
 *   - "vendorrisk.remediation_overdue": { vendorId, finding, dueDate }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type VendorRiskTier = "low" | "moderate" | "high" | "critical";
export type RemediationStatus = "open" | "in_progress" | "resolved" | "accepted";

export interface VendorRiskDomain {
  domain: string; // e.g. "security", "financial", "compliance", "operational"
  scorePct: number; // 0-100, higher = riskier
  weight: number; // relative weight
}

export interface VendorRiskAssessment {
  id: string;
  vendorId: string;
  vendorName: string;
  domains: VendorRiskDomain[];
  riskScore: number; // 0-100 weighted
  tier: VendorRiskTier;
  assessedAt: string;
  assessorId: string;
}

export interface RemediationItem {
  id: string;
  vendorId: string;
  finding: string;
  severity: VendorRiskTier;
  status: RemediationStatus;
  dueDate: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface VendorRiskSummary {
  totalAssessments: number;
  byTier: Partial<Record<VendorRiskTier, number>>;
  avgRiskScore: number;
  openRemediations: number;
  overdueRemediations: number;
}

export class VendorRiskManager {
  private assessments: Map<string, VendorRiskAssessment> = new Map();
  private remediations: Map<string, RemediationItem> = new Map();

  constructor(private readonly bus: EventBus) {}

  private tierFor(score: number): VendorRiskTier {
    if (score >= 75) return "critical";
    if (score >= 50) return "high";
    if (score >= 25) return "moderate";
    return "low";
  }

  assess(vendorId: string, vendorName: string, domains: VendorRiskDomain[], assessorId: string): VendorRiskAssessment {
    const totalWeight = domains.reduce((s, d) => s + d.weight, 0) || 1;
    const riskScore = Math.round(domains.reduce((s, d) => s + d.scorePct * d.weight, 0) / totalWeight);
    const tier = this.tierFor(riskScore);
    const assessment: VendorRiskAssessment = { id: randomUUID(), vendorId, vendorName, domains, riskScore, tier, assessedAt: new Date().toISOString(), assessorId };
    this.assessments.set(assessment.id, assessment);
    this.bus.publish("vendorrisk.assessment_completed", { vendorId, vendorName, riskScore, tier });
    if (tier === "high" || tier === "critical") {
      this.bus.publish("vendorrisk.high_risk_flagged", { vendorId, vendorName, riskScore });
    }
    return assessment;
  }

  addRemediation(input: Omit<RemediationItem, "id" | "createdAt" | "status"> & { id?: string; status?: RemediationStatus }): RemediationItem {
    const item: RemediationItem = { ...input, id: input.id ?? randomUUID(), status: input.status ?? "open", createdAt: new Date().toISOString() };
    this.remediations.set(item.id, item);
    return item;
  }

  updateRemediation(id: string, status: RemediationStatus): RemediationItem | undefined {
    const item = this.remediations.get(id);
    if (!item) return undefined;
    item.status = status;
    if (status === "resolved" || status === "accepted") item.resolvedAt = new Date().toISOString();
    return item;
  }

  checkOverdue(asOf: string): RemediationItem[] {
    const cutoff = new Date(asOf).getTime();
    const overdue = Array.from(this.remediations.values()).filter(r => (r.status === "open" || r.status === "in_progress") && new Date(r.dueDate).getTime() < cutoff);
    for (const r of overdue) {
      this.bus.publish("vendorrisk.remediation_overdue", { vendorId: r.vendorId, finding: r.finding, dueDate: r.dueDate });
    }
    return overdue;
  }

  getAssessment(id: string): VendorRiskAssessment | undefined { return this.assessments.get(id); }
  listAssessments(tier?: VendorRiskTier): VendorRiskAssessment[] {
    const all = Array.from(this.assessments.values());
    return tier ? all.filter(a => a.tier === tier) : all;
  }
  listRemediations(vendorId?: string, status?: RemediationStatus): RemediationItem[] {
    let all = Array.from(this.remediations.values());
    if (vendorId) all = all.filter(r => r.vendorId === vendorId);
    if (status) all = all.filter(r => r.status === status);
    return all;
  }

  summary(): VendorRiskSummary {
    const assessments = Array.from(this.assessments.values());
    const remediations = Array.from(this.remediations.values());
    const byTier: Partial<Record<VendorRiskTier, number>> = {};
    for (const a of assessments) { byTier[a.tier] = (byTier[a.tier] ?? 0) + 1; }
    const avg = assessments.length > 0 ? Math.round(assessments.reduce((s, a) => s + a.riskScore, 0) / assessments.length) : 0;
    const now = Date.now();
    return {
      totalAssessments: assessments.length,
      byTier,
      avgRiskScore: avg,
      openRemediations: remediations.filter(r => r.status === "open" || r.status === "in_progress").length,
      overdueRemediations: remediations.filter(r => (r.status === "open" || r.status === "in_progress") && new Date(r.dueDate).getTime() < now).length,
    };
  }
}
