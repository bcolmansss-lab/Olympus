/**
 * ClauseLibraryManager — standard contract clause library: approved/fallback
 * clause variants by category, risk rating, approval workflow, and usage
 * tracking for contract assembly.
 *
 * Events:
 *   - "clause.created": { clauseId, category, riskLevel }
 *   - "clause.approved": { clauseId, approverId }
 *   - "clause.used": { clauseId, contractRef }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ClauseCategory = "liability" | "indemnity" | "termination" | "payment" | "confidentiality" | "ip" | "warranty" | "dispute";
export type ClauseRisk = "standard" | "moderate" | "high";
export type ClauseStatus = "draft" | "approved" | "deprecated";

export interface Clause {
  id: string;
  category: ClauseCategory;
  title: string;
  body: string;
  riskLevel: ClauseRisk;
  isFallback: boolean;
  status: ClauseStatus;
  usageCount: number;
  createdAt: string;
}

export interface ClauseLibrarySummary {
  totalClauses: number;
  approved: number;
  byCategory: Partial<Record<ClauseCategory, number>>;
  byRisk: Partial<Record<ClauseRisk, number>>;
  totalUsages: number;
}

export class ClauseLibraryManager {
  private clauses: Map<string, Clause> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { category: ClauseCategory; title: string; body: string; riskLevel: ClauseRisk; isFallback?: boolean }): Clause {
    const clause: Clause = { ...input, id: randomUUID(), isFallback: input.isFallback ?? false, status: "draft", usageCount: 0, createdAt: new Date().toISOString() };
    this.clauses.set(clause.id, clause);
    this.bus.publish("clause.created", { clauseId: clause.id, category: clause.category, riskLevel: clause.riskLevel });
    return clause;
  }

  approve(clauseId: string, approverId: string): Clause | undefined {
    const c = this.clauses.get(clauseId);
    if (!c || c.status !== "draft") return undefined;
    c.status = "approved";
    this.bus.publish("clause.approved", { clauseId, approverId });
    return c;
  }

  deprecate(clauseId: string): Clause | undefined {
    const c = this.clauses.get(clauseId);
    if (!c) return undefined;
    c.status = "deprecated";
    return c;
  }

  /** Pick the preferred approved clause for a category (standard risk, non-fallback first). */
  preferred(category: ClauseCategory): Clause | undefined {
    const approved = Array.from(this.clauses.values()).filter(c => c.category === category && c.status === "approved");
    return approved.sort((a, b) => {
      const riskOrder = { standard: 0, moderate: 1, high: 2 };
      if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1;
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    })[0];
  }

  use(clauseId: string, contractRef: string): Clause | undefined {
    const c = this.clauses.get(clauseId);
    if (!c || c.status !== "approved") return undefined;
    c.usageCount += 1;
    this.bus.publish("clause.used", { clauseId, contractRef });
    return c;
  }

  getClause(id: string): Clause | undefined { return this.clauses.get(id); }
  listClauses(category?: ClauseCategory, status?: ClauseStatus): Clause[] {
    let all = Array.from(this.clauses.values());
    if (category) all = all.filter(c => c.category === category);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(): ClauseLibrarySummary {
    const clauses = Array.from(this.clauses.values());
    const byCategory: Partial<Record<ClauseCategory, number>> = {};
    const byRisk: Partial<Record<ClauseRisk, number>> = {};
    for (const c of clauses) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      byRisk[c.riskLevel] = (byRisk[c.riskLevel] ?? 0) + 1;
    }
    return {
      totalClauses: clauses.length,
      approved: clauses.filter(c => c.status === "approved").length,
      byCategory,
      byRisk,
      totalUsages: clauses.reduce((s, c) => s + c.usageCount, 0),
    };
  }
}
