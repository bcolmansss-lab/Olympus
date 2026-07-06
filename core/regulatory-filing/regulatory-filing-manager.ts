/**
 * RegulatoryFilingManager — regulatory submission calendar: recurring filing
 * obligations by regulator, preparation workflow, submission with confirmation,
 * and deadline/late tracking.
 *
 * Events:
 *   - "filing.scheduled": { filingId, regulator, form, dueDate }
 *   - "filing.submitted": { filingId, confirmationNumber, onTime }
 *   - "filing.overdue": { filingId, regulator, dueDate }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FilingFrequency = "one_time" | "monthly" | "quarterly" | "annual";
export type FilingStatus = "scheduled" | "in_preparation" | "submitted" | "accepted" | "rejected";

export interface RegulatoryFiling {
  id: string;
  regulator: string;
  form: string;
  jurisdiction: string;
  frequency: FilingFrequency;
  status: FilingStatus;
  dueDate: string;
  submittedAt?: string;
  confirmationNumber?: string;
  createdAt: string;
}

export interface FilingSummary {
  totalFilings: number;
  upcoming: number;
  submitted: number;
  overdue: number;
  onTimeRatePct: number;
  byRegulator: Record<string, number>;
}

export class RegulatoryFilingManager {
  private filings: Map<string, RegulatoryFiling> = new Map();

  constructor(private readonly bus: EventBus) {}

  schedule(input: { regulator: string; form: string; jurisdiction: string; frequency: FilingFrequency; dueDate: string }): RegulatoryFiling {
    const filing: RegulatoryFiling = { ...input, id: randomUUID(), status: "scheduled", createdAt: new Date().toISOString() };
    this.filings.set(filing.id, filing);
    this.bus.publish("filing.scheduled", { filingId: filing.id, regulator: filing.regulator, form: filing.form, dueDate: filing.dueDate });
    return filing;
  }

  startPreparation(filingId: string): RegulatoryFiling | undefined {
    const f = this.filings.get(filingId);
    if (!f || f.status !== "scheduled") return undefined;
    f.status = "in_preparation";
    return f;
  }

  submit(filingId: string, confirmationNumber: string, asOf: string): RegulatoryFiling | undefined {
    const f = this.filings.get(filingId);
    if (!f || (f.status !== "scheduled" && f.status !== "in_preparation")) return undefined;
    f.status = "submitted";
    f.submittedAt = asOf;
    f.confirmationNumber = confirmationNumber;
    const onTime = new Date(asOf).getTime() <= new Date(f.dueDate).getTime();
    this.bus.publish("filing.submitted", { filingId, confirmationNumber, onTime });
    return f;
  }

  setOutcome(filingId: string, accepted: boolean): RegulatoryFiling | undefined {
    const f = this.filings.get(filingId);
    if (!f || f.status !== "submitted") return undefined;
    f.status = accepted ? "accepted" : "rejected";
    return f;
  }

  /** Emit overdue events for un-submitted filings past due. */
  checkOverdue(asOf: string): RegulatoryFiling[] {
    const cutoff = new Date(asOf).getTime();
    const overdue = Array.from(this.filings.values()).filter(f => (f.status === "scheduled" || f.status === "in_preparation") && new Date(f.dueDate).getTime() < cutoff);
    for (const f of overdue) {
      this.bus.publish("filing.overdue", { filingId: f.id, regulator: f.regulator, dueDate: f.dueDate });
    }
    return overdue;
  }

  getFiling(id: string): RegulatoryFiling | undefined { return this.filings.get(id); }
  listFilings(status?: FilingStatus, regulator?: string): RegulatoryFiling[] {
    let all = Array.from(this.filings.values());
    if (status) all = all.filter(f => f.status === status);
    if (regulator) all = all.filter(f => f.regulator === regulator);
    return all;
  }

  summary(asOf?: string): FilingSummary {
    const filings = Array.from(this.filings.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const submitted = filings.filter(f => f.submittedAt);
    const onTime = submitted.filter(f => new Date(f.submittedAt!).getTime() <= new Date(f.dueDate).getTime()).length;
    const byRegulator: Record<string, number> = {};
    for (const f of filings) { byRegulator[f.regulator] = (byRegulator[f.regulator] ?? 0) + 1; }
    return {
      totalFilings: filings.length,
      upcoming: filings.filter(f => f.status === "scheduled" || f.status === "in_preparation").length,
      submitted: submitted.length,
      overdue: filings.filter(f => (f.status === "scheduled" || f.status === "in_preparation") && new Date(f.dueDate).getTime() < ref).length,
      onTimeRatePct: submitted.length > 0 ? Math.round((onTime / submitted.length) * 100) : 0,
      byRegulator,
    };
  }
}
