/**
 * RFPResponseManager — sales-side RFP/proposal response pipeline: opportunity
 * intake, section assignment to contributors, completion tracking, submission,
 * and win/loss analytics.
 *
 * Events:
 *   - "rfp.created": { rfpId, prospect, valueUsd, dueDate }
 *   - "rfp.submitted": { rfpId, completionPct }
 *   - "rfp.outcome_recorded": { rfpId, outcome, valueUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RFPStatus = "drafting" | "in_review" | "submitted" | "won" | "lost" | "no_bid";

export interface RFPSection {
  id: string;
  title: string;
  ownerId: string;
  complete: boolean;
}

export interface RFP {
  id: string;
  prospect: string;
  title: string;
  valueUsd: number;
  status: RFPStatus;
  sections: RFPSection[];
  dueDate: string;
  createdAt: string;
  submittedAt?: string;
}

export interface RFPSummary {
  totalRFPs: number;
  active: number;
  submitted: number;
  won: number;
  lost: number;
  winRatePct: number;
  pipelineValueUsd: number;
  wonValueUsd: number;
}

export class RFPResponseManager {
  private rfps: Map<string, RFP> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { prospect: string; title: string; valueUsd: number; dueDate: string }): RFP {
    const rfp: RFP = { ...input, id: randomUUID(), status: "drafting", sections: [], createdAt: new Date().toISOString() };
    this.rfps.set(rfp.id, rfp);
    this.bus.publish("rfp.created", { rfpId: rfp.id, prospect: rfp.prospect, valueUsd: rfp.valueUsd, dueDate: rfp.dueDate });
    return rfp;
  }

  addSection(rfpId: string, title: string, ownerId: string): RFPSection | undefined {
    const rfp = this.rfps.get(rfpId);
    if (!rfp || rfp.status !== "drafting") return undefined;
    const section: RFPSection = { id: randomUUID(), title, ownerId, complete: false };
    rfp.sections.push(section);
    return section;
  }

  completeSection(rfpId: string, sectionId: string): RFPSection | undefined {
    const rfp = this.rfps.get(rfpId);
    if (!rfp) return undefined;
    const section = rfp.sections.find(s => s.id === sectionId);
    if (!section) return undefined;
    section.complete = true;
    if (rfp.sections.every(s => s.complete) && rfp.status === "drafting") rfp.status = "in_review";
    return section;
  }

  completionPct(rfpId: string): number {
    const rfp = this.rfps.get(rfpId);
    if (!rfp || rfp.sections.length === 0) return 0;
    return Math.round((rfp.sections.filter(s => s.complete).length / rfp.sections.length) * 100);
  }

  submit(rfpId: string, asOf: string): RFP | undefined {
    const rfp = this.rfps.get(rfpId);
    if (!rfp || (rfp.status !== "drafting" && rfp.status !== "in_review")) return undefined;
    if (!rfp.sections.every(s => s.complete)) return undefined;
    rfp.status = "submitted";
    rfp.submittedAt = asOf;
    this.bus.publish("rfp.submitted", { rfpId, completionPct: 100 });
    return rfp;
  }

  recordOutcome(rfpId: string, outcome: "won" | "lost" | "no_bid"): RFP | undefined {
    const rfp = this.rfps.get(rfpId);
    if (!rfp) return undefined;
    if (outcome !== "no_bid" && rfp.status !== "submitted") return undefined;
    rfp.status = outcome;
    this.bus.publish("rfp.outcome_recorded", { rfpId, outcome, valueUsd: rfp.valueUsd });
    return rfp;
  }

  getRFP(id: string): RFP | undefined { return this.rfps.get(id); }
  listRFPs(status?: RFPStatus): RFP[] {
    const all = Array.from(this.rfps.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): RFPSummary {
    const rfps = Array.from(this.rfps.values());
    const won = rfps.filter(r => r.status === "won");
    const lost = rfps.filter(r => r.status === "lost");
    const decided = won.length + lost.length;
    return {
      totalRFPs: rfps.length,
      active: rfps.filter(r => r.status === "drafting" || r.status === "in_review").length,
      submitted: rfps.filter(r => r.status === "submitted").length,
      won: won.length,
      lost: lost.length,
      winRatePct: decided > 0 ? Math.round((won.length / decided) * 100) : 0,
      pipelineValueUsd: Math.round(rfps.filter(r => ["drafting", "in_review", "submitted"].includes(r.status)).reduce((s, r) => s + r.valueUsd, 0) * 100) / 100,
      wonValueUsd: Math.round(won.reduce((s, r) => s + r.valueUsd, 0) * 100) / 100,
    };
  }
}
