/**
 * NonconformanceManager — quality nonconformance reports (NCR) with disposition,
 * corrective/preventive action (CAPA) tracking, and closure verification.
 *
 * Events:
 *   - "ncr.raised": { ncrId, source, severity }
 *   - "ncr.capa_added": { ncrId, capaId, type }
 *   - "ncr.closed": { ncrId, disposition, daysOpen }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type NCRSeverity = "minor" | "major" | "critical";
export type NCRSource = "incoming_inspection" | "production" | "customer_return" | "audit" | "supplier";
export type NCRStatus = "open" | "investigating" | "capa_in_progress" | "closed";
export type Disposition = "rework" | "scrap" | "use_as_is" | "return_to_supplier" | "regrade";
export type CAPAType = "corrective" | "preventive";

export interface CAPA {
  id: string;
  type: CAPAType;
  description: string;
  ownerId: string;
  dueDate: string;
  completed: boolean;
}

export interface NCR {
  id: string;
  ncrNumber: string;
  source: NCRSource;
  severity: NCRSeverity;
  description: string;
  partRef: string;
  quantity: number;
  status: NCRStatus;
  disposition?: Disposition;
  capas: CAPA[];
  raisedAt: string;
  closedAt?: string;
}

export interface NonconformanceSummary {
  totalNCRs: number;
  open: number;
  closed: number;
  openCAPAs: number;
  bySeverity: Partial<Record<NCRSeverity, number>>;
  bySource: Partial<Record<NCRSource, number>>;
}

export class NonconformanceManager {
  private ncrs: Map<string, NCR> = new Map();
  private seq = 0;

  constructor(private readonly bus: EventBus) {}

  raise(input: { source: NCRSource; severity: NCRSeverity; description: string; partRef: string; quantity: number; raisedAt: string }): NCR {
    this.seq += 1;
    const ncr: NCR = { ...input, id: randomUUID(), ncrNumber: `NCR-${String(this.seq).padStart(5, "0")}`, status: "open", capas: [] };
    this.ncrs.set(ncr.id, ncr);
    this.bus.publish("ncr.raised", { ncrId: ncr.id, source: ncr.source, severity: ncr.severity });
    return ncr;
  }

  setDisposition(ncrId: string, disposition: Disposition): NCR | undefined {
    const ncr = this.ncrs.get(ncrId);
    if (!ncr || ncr.status === "closed") return undefined;
    ncr.disposition = disposition;
    if (ncr.status === "open") ncr.status = "investigating";
    return ncr;
  }

  addCAPA(ncrId: string, type: CAPAType, description: string, ownerId: string, dueDate: string): CAPA | undefined {
    const ncr = this.ncrs.get(ncrId);
    if (!ncr || ncr.status === "closed") return undefined;
    const capa: CAPA = { id: randomUUID(), type, description, ownerId, dueDate, completed: false };
    ncr.capas.push(capa);
    ncr.status = "capa_in_progress";
    this.bus.publish("ncr.capa_added", { ncrId, capaId: capa.id, type });
    return capa;
  }

  completeCAPA(ncrId: string, capaId: string): CAPA | undefined {
    const ncr = this.ncrs.get(ncrId);
    if (!ncr) return undefined;
    const capa = ncr.capas.find(c => c.id === capaId);
    if (!capa) return undefined;
    capa.completed = true;
    return capa;
  }

  close(ncrId: string, asOf: string): NCR | undefined {
    const ncr = this.ncrs.get(ncrId);
    if (!ncr || ncr.status === "closed" || !ncr.disposition) return undefined;
    if (ncr.capas.some(c => !c.completed)) return undefined;
    ncr.status = "closed";
    ncr.closedAt = asOf;
    const daysOpen = Math.floor((new Date(asOf).getTime() - new Date(ncr.raisedAt).getTime()) / 86400000);
    this.bus.publish("ncr.closed", { ncrId, disposition: ncr.disposition, daysOpen });
    return ncr;
  }

  getNCR(id: string): NCR | undefined { return this.ncrs.get(id); }
  listNCRs(status?: NCRStatus, severity?: NCRSeverity): NCR[] {
    let all = Array.from(this.ncrs.values());
    if (status) all = all.filter(n => n.status === status);
    if (severity) all = all.filter(n => n.severity === severity);
    return all;
  }

  summary(): NonconformanceSummary {
    const ncrs = Array.from(this.ncrs.values());
    const bySeverity: Partial<Record<NCRSeverity, number>> = {};
    const bySource: Partial<Record<NCRSource, number>> = {};
    for (const n of ncrs) {
      bySeverity[n.severity] = (bySeverity[n.severity] ?? 0) + 1;
      bySource[n.source] = (bySource[n.source] ?? 0) + 1;
    }
    return {
      totalNCRs: ncrs.length,
      open: ncrs.filter(n => n.status !== "closed").length,
      closed: ncrs.filter(n => n.status === "closed").length,
      openCAPAs: ncrs.flatMap(n => n.capas).filter(c => !c.completed).length,
      bySeverity,
      bySource,
    };
  }
}
