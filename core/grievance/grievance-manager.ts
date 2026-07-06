/**
 * GrievanceManager — formal employee grievance intake, multi-step resolution
 * (acknowledgement → investigation → hearing → decision), and appeal handling.
 *
 * Events:
 *   - "grievance.filed": { grievanceId, employeeId, category }
 *   - "grievance.stage_changed": { grievanceId, stage }
 *   - "grievance.resolved": { grievanceId, outcome, upheld }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type GrievanceCategory = "compensation" | "working_conditions" | "discrimination" | "management" | "policy" | "other";
export type GrievanceStage = "filed" | "acknowledged" | "investigating" | "hearing" | "resolved" | "appealed";
export type GrievanceOutcome = "upheld" | "partially_upheld" | "denied" | "withdrawn";

export interface Grievance {
  id: string;
  employeeId: string;
  category: GrievanceCategory;
  description: string;
  stage: GrievanceStage;
  outcome?: GrievanceOutcome;
  assignedTo?: string;
  filedAt: string;
  resolvedAt?: string;
  appealedAt?: string;
}

export interface GrievanceSummary {
  totalGrievances: number;
  open: number;
  resolved: number;
  appealed: number;
  upheldCount: number;
  byCategory: Partial<Record<GrievanceCategory, number>>;
}

const STAGE_FLOW: GrievanceStage[] = ["filed", "acknowledged", "investigating", "hearing", "resolved"];

export class GrievanceManager {
  private grievances: Map<string, Grievance> = new Map();

  constructor(private readonly bus: EventBus) {}

  file(input: { employeeId: string; category: GrievanceCategory; description: string; filedAt: string }): Grievance {
    const grievance: Grievance = { ...input, id: randomUUID(), stage: "filed" };
    this.grievances.set(grievance.id, grievance);
    this.bus.publish("grievance.filed", { grievanceId: grievance.id, employeeId: grievance.employeeId, category: grievance.category });
    return grievance;
  }

  assign(grievanceId: string, handlerId: string): Grievance | undefined {
    const g = this.grievances.get(grievanceId);
    if (!g || g.stage === "resolved") return undefined;
    g.assignedTo = handlerId;
    return g;
  }

  /** Advance to the next stage in the standard flow. */
  advance(grievanceId: string): Grievance | undefined {
    const g = this.grievances.get(grievanceId);
    if (!g) return undefined;
    const idx = STAGE_FLOW.indexOf(g.stage);
    const next = STAGE_FLOW[idx + 1];
    if (idx < 0 || !next) return undefined;
    g.stage = next;
    this.bus.publish("grievance.stage_changed", { grievanceId, stage: next });
    return g;
  }

  resolve(grievanceId: string, outcome: GrievanceOutcome, asOf: string): Grievance | undefined {
    const g = this.grievances.get(grievanceId);
    if (!g || g.stage === "resolved") return undefined;
    g.stage = "resolved";
    g.outcome = outcome;
    g.resolvedAt = asOf;
    const upheld = outcome === "upheld" || outcome === "partially_upheld";
    this.bus.publish("grievance.resolved", { grievanceId, outcome, upheld });
    return g;
  }

  appeal(grievanceId: string, asOf: string): Grievance | undefined {
    const g = this.grievances.get(grievanceId);
    if (!g || g.stage !== "resolved") return undefined;
    g.stage = "appealed";
    g.appealedAt = asOf;
    this.bus.publish("grievance.stage_changed", { grievanceId, stage: "appealed" });
    return g;
  }

  getGrievance(id: string): Grievance | undefined { return this.grievances.get(id); }
  listGrievances(stage?: GrievanceStage, category?: GrievanceCategory): Grievance[] {
    let all = Array.from(this.grievances.values());
    if (stage) all = all.filter(g => g.stage === stage);
    if (category) all = all.filter(g => g.category === category);
    return all;
  }

  summary(): GrievanceSummary {
    const grievances = Array.from(this.grievances.values());
    const byCategory: Partial<Record<GrievanceCategory, number>> = {};
    for (const g of grievances) { byCategory[g.category] = (byCategory[g.category] ?? 0) + 1; }
    return {
      totalGrievances: grievances.length,
      open: grievances.filter(g => g.stage !== "resolved").length,
      resolved: grievances.filter(g => g.stage === "resolved").length,
      appealed: grievances.filter(g => g.stage === "appealed").length,
      upheldCount: grievances.filter(g => g.outcome === "upheld" || g.outcome === "partially_upheld").length,
      byCategory,
    };
  }
}
