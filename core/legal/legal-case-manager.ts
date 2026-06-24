/**
 * LegalCaseManager — tracks legal matters, litigation, regulatory filings,
 * IP management, and outside counsel engagements.
 *
 * Events:
 *   - "legal.case_opened": { caseId, title, type, priority }
 *   - "legal.case_resolved": { caseId, title, outcome, costUsd }
 *   - "legal.deadline_approaching": { caseId, title, deadlineDate, daysRemaining }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type LegalCaseType = "litigation" | "contract_dispute" | "ip" | "regulatory" | "employment" | "corporate" | "privacy" | "other";
export type LegalCaseStatus = "open" | "in_discovery" | "negotiating" | "resolved" | "dismissed" | "appealed";
export type CasePriority = "low" | "medium" | "high" | "critical";

export interface LegalDeadline {
  label: string;
  dueDate: string;
  completed: boolean;
}

export interface LegalCase {
  id: string;
  title: string;
  type: LegalCaseType;
  status: LegalCaseStatus;
  priority: CasePriority;
  description: string;
  assignedCounsel: string;
  outsideCounsel?: string;
  estimatedCostUsd: number;
  actualCostUsd: number;
  openedAt: string;
  resolvedAt?: string;
  outcome?: string;
  deadlines: LegalDeadline[];
  relatedContractIds: string[];
  tags: string[];
}

export interface LegalSummary {
  totalCases: number;
  openCases: number;
  resolvedCases: number;
  totalActualCostUsd: number;
  totalEstimatedCostUsd: number;
  byType: Partial<Record<LegalCaseType, number>>;
  criticalCases: number;
}

export class LegalCaseManager {
  private cases: Map<string, LegalCase> = new Map();

  constructor(private readonly bus: EventBus) {}

  openCase(input: Omit<LegalCase, "id" | "openedAt" | "actualCostUsd" | "deadlines" | "relatedContractIds"> & { id?: string }): LegalCase {
    const lcase: LegalCase = {
      id: input.id ?? randomUUID(),
      title: input.title,
      type: input.type,
      status: input.status,
      priority: input.priority,
      description: input.description,
      assignedCounsel: input.assignedCounsel,
      outsideCounsel: input.outsideCounsel,
      estimatedCostUsd: input.estimatedCostUsd,
      actualCostUsd: 0,
      openedAt: new Date().toISOString(),
      outcome: input.outcome,
      deadlines: [],
      relatedContractIds: [],
      tags: input.tags,
    };
    this.cases.set(lcase.id, lcase);
    this.bus.publish("legal.case_opened", { caseId: lcase.id, title: lcase.title, type: lcase.type, priority: lcase.priority });
    return lcase;
  }

  resolveCase(caseId: string, outcome: string, actualCostUsd: number): LegalCase | undefined {
    const lcase = this.cases.get(caseId);
    if (!lcase) return undefined;
    lcase.status = "resolved";
    lcase.outcome = outcome;
    lcase.actualCostUsd = actualCostUsd;
    lcase.resolvedAt = new Date().toISOString();
    this.bus.publish("legal.case_resolved", { caseId, title: lcase.title, outcome, costUsd: actualCostUsd });
    return lcase;
  }

  addDeadline(caseId: string, label: string, dueDate: string): LegalCase | undefined {
    const lcase = this.cases.get(caseId);
    if (!lcase) return undefined;
    lcase.deadlines.push({ label, dueDate, completed: false });
    const daysRemaining = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000);
    if (daysRemaining <= 14 && daysRemaining >= 0) {
      this.bus.publish("legal.deadline_approaching", { caseId, title: lcase.title, deadlineDate: dueDate, daysRemaining });
    }
    return lcase;
  }

  completeDeadline(caseId: string, label: string): LegalCase | undefined {
    const lcase = this.cases.get(caseId);
    if (!lcase) return undefined;
    const dl = lcase.deadlines.find((d) => d.label === label);
    if (dl) dl.completed = true;
    return lcase;
  }

  updateStatus(caseId: string, status: LegalCaseStatus): LegalCase | undefined {
    const lcase = this.cases.get(caseId);
    if (!lcase) return undefined;
    lcase.status = status;
    return lcase;
  }

  getCase(id: string): LegalCase | undefined { return this.cases.get(id); }

  listCases(status?: LegalCaseStatus, type?: LegalCaseType): LegalCase[] {
    let all = Array.from(this.cases.values());
    if (status) all = all.filter((c) => c.status === status);
    if (type) all = all.filter((c) => c.type === type);
    return all;
  }

  summary(): LegalSummary {
    const all = Array.from(this.cases.values());
    const byType: Partial<Record<LegalCaseType, number>> = {};
    for (const c of all) { byType[c.type] = (byType[c.type] ?? 0) + 1; }
    return {
      totalCases: all.length,
      openCases: all.filter((c) => c.status === "open" || c.status === "in_discovery" || c.status === "negotiating").length,
      resolvedCases: all.filter((c) => c.status === "resolved" || c.status === "dismissed").length,
      totalActualCostUsd: all.reduce((s, c) => s + c.actualCostUsd, 0),
      totalEstimatedCostUsd: all.reduce((s, c) => s + c.estimatedCostUsd, 0),
      byType,
      criticalCases: all.filter((c) => c.priority === "critical").length,
    };
  }
}
