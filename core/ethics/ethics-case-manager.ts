/**
 * EthicsCaseManager — confidential ethics/whistleblower case intake,
 * anonymous reporting, investigation workflow, and substantiation tracking.
 *
 * Events:
 *   - "ethics.case_opened": { caseId, category, anonymous, severity }
 *   - "ethics.case_assigned": { caseId, investigatorId }
 *   - "ethics.case_resolved": { caseId, outcome, substantiated }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EthicsCategory = "harassment" | "fraud" | "safety" | "discrimination" | "conflict_of_interest" | "retaliation" | "other";
export type CaseSeverity = "low" | "medium" | "high" | "critical";
export type EthicsCaseState = "open" | "assigned" | "investigating" | "resolved";
export type CaseOutcome = "substantiated" | "unsubstantiated" | "partially_substantiated" | "withdrawn";

export interface EthicsCaseNote {
  id: string;
  authorId: string;
  text: string;
  at: string;
}

export interface EthicsCase {
  id: string;
  caseNumber: string;
  category: EthicsCategory;
  severity: CaseSeverity;
  anonymous: boolean;
  reporterId?: string;
  summary: string;
  state: EthicsCaseState;
  investigatorId?: string;
  outcome?: CaseOutcome;
  notes: EthicsCaseNote[];
  openedAt: string;
  resolvedAt?: string;
}

export interface EthicsSummary {
  totalCases: number;
  openCases: number;
  resolvedCases: number;
  substantiatedCount: number;
  anonymousCount: number;
  byCategory: Partial<Record<EthicsCategory, number>>;
  bySeverity: Partial<Record<CaseSeverity, number>>;
}

export class EthicsCaseManager {
  private cases: Map<string, EthicsCase> = new Map();
  private seq = 0;

  constructor(private readonly bus: EventBus) {}

  openCase(input: { category: EthicsCategory; severity: CaseSeverity; summary: string; anonymous: boolean; reporterId?: string }): EthicsCase {
    this.seq += 1;
    const caseNumber = `ETH-${String(this.seq).padStart(5, "0")}`;
    const ethicsCase: EthicsCase = {
      id: randomUUID(),
      caseNumber,
      category: input.category,
      severity: input.severity,
      anonymous: input.anonymous,
      reporterId: input.anonymous ? undefined : input.reporterId,
      summary: input.summary,
      state: "open",
      notes: [],
      openedAt: new Date().toISOString(),
    };
    this.cases.set(ethicsCase.id, ethicsCase);
    this.bus.publish("ethics.case_opened", { caseId: ethicsCase.id, category: input.category, anonymous: input.anonymous, severity: input.severity });
    return ethicsCase;
  }

  assign(caseId: string, investigatorId: string): EthicsCase | undefined {
    const c = this.cases.get(caseId);
    if (!c || c.state === "resolved") return undefined;
    c.investigatorId = investigatorId;
    c.state = "investigating";
    this.bus.publish("ethics.case_assigned", { caseId, investigatorId });
    return c;
  }

  addNote(caseId: string, authorId: string, text: string): EthicsCaseNote | undefined {
    const c = this.cases.get(caseId);
    if (!c) return undefined;
    const note: EthicsCaseNote = { id: randomUUID(), authorId, text, at: new Date().toISOString() };
    c.notes.push(note);
    return note;
  }

  resolve(caseId: string, outcome: CaseOutcome, asOf: string): EthicsCase | undefined {
    const c = this.cases.get(caseId);
    if (!c || c.state === "resolved") return undefined;
    c.state = "resolved";
    c.outcome = outcome;
    c.resolvedAt = asOf;
    const substantiated = outcome === "substantiated" || outcome === "partially_substantiated";
    this.bus.publish("ethics.case_resolved", { caseId, outcome, substantiated });
    return c;
  }

  getCase(id: string): EthicsCase | undefined { return this.cases.get(id); }
  listCases(state?: EthicsCaseState, category?: EthicsCategory): EthicsCase[] {
    let all = Array.from(this.cases.values());
    if (state) all = all.filter(c => c.state === state);
    if (category) all = all.filter(c => c.category === category);
    return all;
  }

  summary(): EthicsSummary {
    const cases = Array.from(this.cases.values());
    const byCategory: Partial<Record<EthicsCategory, number>> = {};
    const bySeverity: Partial<Record<CaseSeverity, number>> = {};
    for (const c of cases) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;
    }
    return {
      totalCases: cases.length,
      openCases: cases.filter(c => c.state !== "resolved").length,
      resolvedCases: cases.filter(c => c.state === "resolved").length,
      substantiatedCount: cases.filter(c => c.outcome === "substantiated" || c.outcome === "partially_substantiated").length,
      anonymousCount: cases.filter(c => c.anonymous).length,
      byCategory,
      bySeverity,
    };
  }
}
