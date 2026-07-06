/**
 * ErgonomicsManager — workstation ergonomic assessments: scheduled
 * assessments per employee, issue findings with severity, remediation
 * tracking with equipment orders, and open-issue reporting.
 *
 * Events:
 *   - "ergonomics.assessed": { assessmentId, employeeId, issueCount }
 *   - "ergonomics.issue_resolved": { assessmentId, issueId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ErgoIssueSeverity = "minor" | "moderate" | "serious";

export interface ErgoIssue {
  id: string;
  description: string;
  severity: ErgoIssueSeverity;
  resolved: boolean;
  equipmentOrdered?: string;
}

export interface ErgoAssessment {
  id: string;
  employeeId: string;
  assessor: string;
  issues: ErgoIssue[];
  assessedAt: string;
}

export interface ErgonomicsSummary {
  totalAssessments: number;
  totalIssues: number;
  openIssues: number;
  seriousOpenIssues: number;
  resolutionRatePct: number;
}

export class ErgonomicsManager {
  private assessments: Map<string, ErgoAssessment> = new Map();

  constructor(private readonly bus: EventBus) {}

  recordAssessment(employeeId: string, assessor: string, findings: Array<{ description: string; severity: ErgoIssueSeverity }>, assessedAt: string): ErgoAssessment {
    const assessment: ErgoAssessment = {
      id: randomUUID(),
      employeeId,
      assessor,
      issues: findings.map(f => ({ id: randomUUID(), description: f.description, severity: f.severity, resolved: false })),
      assessedAt,
    };
    this.assessments.set(assessment.id, assessment);
    this.bus.publish("ergonomics.assessed", { assessmentId: assessment.id, employeeId, issueCount: assessment.issues.length });
    return assessment;
  }

  orderEquipment(assessmentId: string, issueId: string, equipment: string): ErgoIssue | undefined {
    const issue = this.assessments.get(assessmentId)?.issues.find(i => i.id === issueId);
    if (!issue || issue.resolved) return undefined;
    issue.equipmentOrdered = equipment;
    return issue;
  }

  resolveIssue(assessmentId: string, issueId: string): ErgoIssue | undefined {
    const issue = this.assessments.get(assessmentId)?.issues.find(i => i.id === issueId);
    if (!issue || issue.resolved) return undefined;
    issue.resolved = true;
    this.bus.publish("ergonomics.issue_resolved", { assessmentId, issueId });
    return issue;
  }

  getAssessment(id: string): ErgoAssessment | undefined { return this.assessments.get(id); }
  latestFor(employeeId: string): ErgoAssessment | undefined {
    return Array.from(this.assessments.values())
      .filter(a => a.employeeId === employeeId)
      .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))[0];
  }
  openIssues(severity?: ErgoIssueSeverity): Array<{ assessmentId: string; issue: ErgoIssue }> {
    const out: Array<{ assessmentId: string; issue: ErgoIssue }> = [];
    for (const a of this.assessments.values()) {
      for (const i of a.issues) {
        if (!i.resolved && (severity === undefined || i.severity === severity)) out.push({ assessmentId: a.id, issue: i });
      }
    }
    return out;
  }

  summary(): ErgonomicsSummary {
    const all = Array.from(this.assessments.values()).flatMap(a => a.issues);
    const resolved = all.filter(i => i.resolved).length;
    return {
      totalAssessments: this.assessments.size,
      totalIssues: all.length,
      openIssues: all.length - resolved,
      seriousOpenIssues: all.filter(i => !i.resolved && i.severity === "serious").length,
      resolutionRatePct: all.length > 0 ? Math.round((resolved / all.length) * 100) : 0,
    };
  }
}
