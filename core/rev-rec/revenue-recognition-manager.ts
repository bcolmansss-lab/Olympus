/**
 * RevenueRecognitionManager — ASC 606-style revenue recognition: performance
 * obligations with ratable or point-in-time recognition, deferred revenue
 * schedules, and period recognition.
 *
 * Events:
 *   - "revrec.obligation_created": { obligationId, contractId, amountUsd, method }
 *   - "revrec.revenue_recognized": { obligationId, period, amountUsd }
 *   - "revrec.obligation_completed": { obligationId, totalRecognizedUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RecognitionMethod = "ratable" | "point_in_time" | "milestone";
export type ObligationStatus = "active" | "completed";

export interface RecognitionEntry {
  period: string; // e.g. "2026-07"
  amountUsd: number;
  recognizedAt: string;
}

export interface PerformanceObligation {
  id: string;
  contractId: string;
  description: string;
  method: RecognitionMethod;
  totalAmountUsd: number;
  recognizedUsd: number;
  periods: number; // for ratable
  startPeriod: string;
  status: ObligationStatus;
  schedule: RecognitionEntry[];
  createdAt: string;
}

export interface RevRecSummary {
  totalObligations: number;
  activeObligations: number;
  totalContractValueUsd: number;
  totalRecognizedUsd: number;
  deferredRevenueUsd: number;
  byMethod: Partial<Record<RecognitionMethod, number>>;
}

export class RevenueRecognitionManager {
  private obligations: Map<string, PerformanceObligation> = new Map();

  constructor(private readonly bus: EventBus) {}

  createObligation(input: { contractId: string; description: string; method: RecognitionMethod; totalAmountUsd: number; periods?: number; startPeriod: string }): PerformanceObligation {
    const ob: PerformanceObligation = {
      id: randomUUID(),
      contractId: input.contractId,
      description: input.description,
      method: input.method,
      totalAmountUsd: input.totalAmountUsd,
      recognizedUsd: 0,
      periods: input.method === "ratable" ? Math.max(1, input.periods ?? 1) : 1,
      startPeriod: input.startPeriod,
      status: "active",
      schedule: [],
      createdAt: new Date().toISOString(),
    };
    this.obligations.set(ob.id, ob);
    this.bus.publish("revrec.obligation_created", { obligationId: ob.id, contractId: ob.contractId, amountUsd: ob.totalAmountUsd, method: ob.method });
    return ob;
  }

  /** Recognize revenue for a period. For ratable, recognizes the per-period share; otherwise the full remaining amount. */
  recognize(obligationId: string, period: string, asOf: string): RecognitionEntry | undefined {
    const ob = this.obligations.get(obligationId);
    if (!ob || ob.status !== "active") return undefined;
    let amount: number;
    if (ob.method === "ratable") {
      const perPeriod = Math.round((ob.totalAmountUsd / ob.periods) * 100) / 100;
      const remaining = Math.round((ob.totalAmountUsd - ob.recognizedUsd) * 100) / 100;
      amount = Math.min(perPeriod, remaining);
    } else {
      amount = Math.round((ob.totalAmountUsd - ob.recognizedUsd) * 100) / 100;
    }
    if (amount <= 0) return undefined;
    const entry: RecognitionEntry = { period, amountUsd: amount, recognizedAt: asOf };
    ob.schedule.push(entry);
    ob.recognizedUsd = Math.round((ob.recognizedUsd + amount) * 100) / 100;
    this.bus.publish("revrec.revenue_recognized", { obligationId, period, amountUsd: amount });
    if (ob.recognizedUsd >= ob.totalAmountUsd) {
      ob.status = "completed";
      this.bus.publish("revrec.obligation_completed", { obligationId, totalRecognizedUsd: ob.recognizedUsd });
    }
    return entry;
  }

  getObligation(id: string): PerformanceObligation | undefined { return this.obligations.get(id); }
  deferredRevenue(obligationId: string): number {
    const ob = this.obligations.get(obligationId);
    return ob ? Math.round((ob.totalAmountUsd - ob.recognizedUsd) * 100) / 100 : 0;
  }
  listObligations(contractId?: string, status?: ObligationStatus): PerformanceObligation[] {
    let all = Array.from(this.obligations.values());
    if (contractId) all = all.filter(o => o.contractId === contractId);
    if (status) all = all.filter(o => o.status === status);
    return all;
  }

  summary(): RevRecSummary {
    const obs = Array.from(this.obligations.values());
    const byMethod: Partial<Record<RecognitionMethod, number>> = {};
    for (const o of obs) { byMethod[o.method] = (byMethod[o.method] ?? 0) + 1; }
    const totalValue = obs.reduce((s, o) => s + o.totalAmountUsd, 0);
    const totalRecognized = obs.reduce((s, o) => s + o.recognizedUsd, 0);
    return {
      totalObligations: obs.length,
      activeObligations: obs.filter(o => o.status === "active").length,
      totalContractValueUsd: totalValue,
      totalRecognizedUsd: Math.round(totalRecognized * 100) / 100,
      deferredRevenueUsd: Math.round((totalValue - totalRecognized) * 100) / 100,
      byMethod,
    };
  }
}
