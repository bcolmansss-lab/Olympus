/**
 * ProductRecallManager — product recall campaigns: affected lot/serial
 * registration, customer notification, remedy tracking (repair/replace/refund),
 * and completion-rate analytics.
 *
 * Events:
 *   - "recall.initiated": { recallId, product, severity, affectedUnits }
 *   - "recall.unit_remediated": { recallId, unitId, remedy }
 *   - "recall.closed": { recallId, completionPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RecallSeverity = "low" | "medium" | "high" | "critical";
export type RecallStatus = "initiated" | "in_progress" | "closed";
export type Remedy = "repair" | "replace" | "refund" | "disposed";

export interface RecallUnit {
  unitId: string; // serial or lot
  customerId?: string;
  notified: boolean;
  remediated: boolean;
  remedy?: Remedy;
}

export interface Recall {
  id: string;
  product: string;
  reason: string;
  severity: RecallSeverity;
  status: RecallStatus;
  units: RecallUnit[];
  initiatedAt: string;
  closedAt?: string;
}

export interface RecallSummary {
  totalRecalls: number;
  active: number;
  closed: number;
  totalAffectedUnits: number;
  remediatedUnits: number;
  overallCompletionPct: number;
  bySeverity: Partial<Record<RecallSeverity, number>>;
}

export class ProductRecallManager {
  private recalls: Map<string, Recall> = new Map();

  constructor(private readonly bus: EventBus) {}

  initiate(input: { product: string; reason: string; severity: RecallSeverity; affectedUnits: { unitId: string; customerId?: string }[]; initiatedAt: string }): Recall {
    const recall: Recall = {
      id: randomUUID(),
      product: input.product,
      reason: input.reason,
      severity: input.severity,
      status: "initiated",
      units: input.affectedUnits.map(u => ({ unitId: u.unitId, customerId: u.customerId, notified: false, remediated: false })),
      initiatedAt: input.initiatedAt,
    };
    this.recalls.set(recall.id, recall);
    this.bus.publish("recall.initiated", { recallId: recall.id, product: recall.product, severity: recall.severity, affectedUnits: recall.units.length });
    return recall;
  }

  notify(recallId: string, unitId: string): RecallUnit | undefined {
    const recall = this.recalls.get(recallId);
    if (!recall) return undefined;
    const unit = recall.units.find(u => u.unitId === unitId);
    if (!unit) return undefined;
    unit.notified = true;
    if (recall.status === "initiated") recall.status = "in_progress";
    return unit;
  }

  remediate(recallId: string, unitId: string, remedy: Remedy): RecallUnit | undefined {
    const recall = this.recalls.get(recallId);
    if (!recall || recall.status === "closed") return undefined;
    const unit = recall.units.find(u => u.unitId === unitId);
    if (!unit || unit.remediated) return undefined;
    unit.remediated = true;
    unit.remedy = remedy;
    if (recall.status === "initiated") recall.status = "in_progress";
    this.bus.publish("recall.unit_remediated", { recallId, unitId, remedy });
    return unit;
  }

  completionPct(recallId: string): number {
    const recall = this.recalls.get(recallId);
    if (!recall || recall.units.length === 0) return 0;
    return Math.round((recall.units.filter(u => u.remediated).length / recall.units.length) * 100);
  }

  close(recallId: string, asOf: string): Recall | undefined {
    const recall = this.recalls.get(recallId);
    if (!recall || recall.status === "closed") return undefined;
    recall.status = "closed";
    recall.closedAt = asOf;
    this.bus.publish("recall.closed", { recallId, completionPct: this.completionPct(recallId) });
    return recall;
  }

  getRecall(id: string): Recall | undefined { return this.recalls.get(id); }
  listRecalls(status?: RecallStatus, severity?: RecallSeverity): Recall[] {
    let all = Array.from(this.recalls.values());
    if (status) all = all.filter(r => r.status === status);
    if (severity) all = all.filter(r => r.severity === severity);
    return all;
  }

  summary(): RecallSummary {
    const recalls = Array.from(this.recalls.values());
    const allUnits = recalls.flatMap(r => r.units);
    const remediated = allUnits.filter(u => u.remediated).length;
    const bySeverity: Partial<Record<RecallSeverity, number>> = {};
    for (const r of recalls) { bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1; }
    return {
      totalRecalls: recalls.length,
      active: recalls.filter(r => r.status !== "closed").length,
      closed: recalls.filter(r => r.status === "closed").length,
      totalAffectedUnits: allUnits.length,
      remediatedUnits: remediated,
      overallCompletionPct: allUnits.length > 0 ? Math.round((remediated / allUnits.length) * 100) : 0,
      bySeverity,
    };
  }
}
