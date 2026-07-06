/**
 * AuditFindingManager — internal audit findings: rating, management response,
 * remediation action plans with owners/dates, and past-due tracking toward
 * closure.
 *
 * Events:
 *   - "auditfinding.raised": { findingId, area, rating }
 *   - "auditfinding.response_recorded": { findingId, accepted }
 *   - "auditfinding.closed": { findingId, daysOpen }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FindingRating = "low" | "medium" | "high" | "critical";
export type FindingStatus = "open" | "management_response" | "remediation" | "closed" | "risk_accepted";

export interface AuditFinding {
  id: string;
  auditRef: string;
  area: string;
  title: string;
  rating: FindingRating;
  status: FindingStatus;
  managementResponse?: string;
  remediationOwner?: string;
  remediationDue?: string;
  raisedAt: string;
  closedAt?: string;
}

export interface AuditFindingSummary {
  totalFindings: number;
  open: number;
  closed: number;
  pastDue: number;
  byRating: Partial<Record<FindingRating, number>>;
}

export class AuditFindingManager {
  private findings: Map<string, AuditFinding> = new Map();

  constructor(private readonly bus: EventBus) {}

  raise(input: { auditRef: string; area: string; title: string; rating: FindingRating; raisedAt: string }): AuditFinding {
    const finding: AuditFinding = { ...input, id: randomUUID(), status: "open" };
    this.findings.set(finding.id, finding);
    this.bus.publish("auditfinding.raised", { findingId: finding.id, area: finding.area, rating: finding.rating });
    return finding;
  }

  recordResponse(findingId: string, response: string, accepted: boolean): AuditFinding | undefined {
    const f = this.findings.get(findingId);
    if (!f || f.status !== "open") return undefined;
    f.managementResponse = response;
    f.status = accepted ? "management_response" : "risk_accepted";
    this.bus.publish("auditfinding.response_recorded", { findingId, accepted });
    return f;
  }

  planRemediation(findingId: string, owner: string, due: string): AuditFinding | undefined {
    const f = this.findings.get(findingId);
    if (!f || f.status !== "management_response") return undefined;
    f.status = "remediation";
    f.remediationOwner = owner;
    f.remediationDue = due;
    return f;
  }

  close(findingId: string, asOf: string): AuditFinding | undefined {
    const f = this.findings.get(findingId);
    if (!f || f.status === "closed") return undefined;
    f.status = "closed";
    f.closedAt = asOf;
    const daysOpen = Math.floor((new Date(asOf).getTime() - new Date(f.raisedAt).getTime()) / 86400000);
    this.bus.publish("auditfinding.closed", { findingId, daysOpen });
    return f;
  }

  getFinding(id: string): AuditFinding | undefined { return this.findings.get(id); }
  listFindings(status?: FindingStatus, rating?: FindingRating): AuditFinding[] {
    let all = Array.from(this.findings.values());
    if (status) all = all.filter(f => f.status === status);
    if (rating) all = all.filter(f => f.rating === rating);
    return all;
  }

  summary(asOf?: string): AuditFindingSummary {
    const findings = Array.from(this.findings.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const byRating: Partial<Record<FindingRating, number>> = {};
    for (const f of findings) { byRating[f.rating] = (byRating[f.rating] ?? 0) + 1; }
    return {
      totalFindings: findings.length,
      open: findings.filter(f => f.status !== "closed" && f.status !== "risk_accepted").length,
      closed: findings.filter(f => f.status === "closed").length,
      pastDue: findings.filter(f => f.status === "remediation" && f.remediationDue && new Date(f.remediationDue).getTime() < ref).length,
      byRating,
    };
  }
}
