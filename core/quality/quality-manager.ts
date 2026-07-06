/**
 * QualityManager — quality control processes, defect tracking, test plans,
 * audits, corrective actions, and ISO/compliance readiness.
 *
 * Events:
 *   - "quality.defect_raised": { defectId, title, severity, productArea }
 *   - "quality.defect_resolved": { defectId, title, resolutionDays }
 *   - "quality.audit_completed": { auditId, score, findings }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DefectSeverity = "critical" | "major" | "minor" | "trivial";
export type DefectStatus = "open" | "in_progress" | "resolved" | "wont_fix" | "duplicate";
export type AuditType = "internal" | "external" | "supplier" | "process" | "product";

export interface Defect {
  id: string;
  title: string;
  description: string;
  severity: DefectSeverity;
  status: DefectStatus;
  productArea: string;
  reportedBy: string;
  assignedTo?: string;
  reportedAt: string;
  resolvedAt?: string;
  rootCause?: string;
  correctiveAction?: string;
}

export interface QualityAudit {
  id: string;
  title: string;
  type: AuditType;
  auditor: string;
  scheduledDate: string;
  completedDate?: string;
  score?: number; // 0-100
  findings: string[];
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
}

export interface QualitySummary {
  totalDefects: number;
  openDefects: number;
  criticalDefects: number;
  resolvedDefects: number;
  avgResolutionDays: number;
  totalAudits: number;
  avgAuditScore: number;
  byProductArea: Record<string, number>;
}

export class QualityManager {
  private defects: Map<string, Defect> = new Map();
  private audits: Map<string, QualityAudit> = new Map();

  constructor(private readonly bus: EventBus) {}

  raiseDefect(input: Omit<Defect, "id" | "reportedAt"> & { id?: string }): Defect {
    const defect: Defect = {
      id: input.id ?? randomUUID(),
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: input.status,
      productArea: input.productArea,
      reportedBy: input.reportedBy,
      assignedTo: input.assignedTo,
      reportedAt: new Date().toISOString(),
      rootCause: input.rootCause,
      correctiveAction: input.correctiveAction,
    };
    this.defects.set(defect.id, defect);
    this.bus.publish("quality.defect_raised", { defectId: defect.id, title: defect.title, severity: defect.severity, productArea: defect.productArea });
    return defect;
  }

  resolveDefect(defectId: string, rootCause: string, correctiveAction: string): Defect | undefined {
    const defect = this.defects.get(defectId);
    if (!defect) return undefined;
    defect.status = "resolved";
    defect.rootCause = rootCause;
    defect.correctiveAction = correctiveAction;
    defect.resolvedAt = new Date().toISOString();
    const resolutionDays = Math.round((new Date(defect.resolvedAt).getTime() - new Date(defect.reportedAt).getTime()) / 86400000);
    this.bus.publish("quality.defect_resolved", { defectId, title: defect.title, resolutionDays });
    return defect;
  }

  scheduleAudit(input: Omit<QualityAudit, "id"> & { id?: string }): QualityAudit {
    const audit: QualityAudit = { id: input.id ?? randomUUID(), ...input };
    this.audits.set(audit.id, audit);
    return audit;
  }

  completeAudit(auditId: string, score: number, findings: string[]): QualityAudit | undefined {
    const audit = this.audits.get(auditId);
    if (!audit) return undefined;
    audit.status = "completed";
    audit.score = score;
    audit.findings = findings;
    audit.completedDate = new Date().toISOString();
    this.bus.publish("quality.audit_completed", { auditId, score, findings: findings.length });
    return audit;
  }

  getDefect(id: string): Defect | undefined { return this.defects.get(id); }

  listDefects(status?: DefectStatus, severity?: DefectSeverity): Defect[] {
    let all = Array.from(this.defects.values());
    if (status) all = all.filter((d) => d.status === status);
    if (severity) all = all.filter((d) => d.severity === severity);
    return all;
  }

  listAudits(): QualityAudit[] { return Array.from(this.audits.values()); }

  summary(): QualitySummary {
    const defects = Array.from(this.defects.values());
    const audits = Array.from(this.audits.values());
    const resolved = defects.filter((d) => d.status === "resolved" && d.resolvedAt);
    const avgResolutionDays = resolved.length > 0
      ? Math.round(resolved.reduce((s, d) => {
          return s + Math.round((new Date(d.resolvedAt!).getTime() - new Date(d.reportedAt).getTime()) / 86400000);
        }, 0) / resolved.length)
      : 0;
    const completedAudits = audits.filter((a) => a.score !== undefined);
    const avgAuditScore = completedAudits.length > 0
      ? Math.round(completedAudits.reduce((s, a) => s + (a.score ?? 0), 0) / completedAudits.length)
      : 0;
    const byProductArea: Record<string, number> = {};
    for (const d of defects) { byProductArea[d.productArea] = (byProductArea[d.productArea] ?? 0) + 1; }
    return {
      totalDefects: defects.length,
      openDefects: defects.filter((d) => d.status === "open" || d.status === "in_progress").length,
      criticalDefects: defects.filter((d) => d.severity === "critical").length,
      resolvedDefects: resolved.length,
      avgResolutionDays,
      totalAudits: audits.length,
      avgAuditScore,
      byProductArea,
    };
  }
}
