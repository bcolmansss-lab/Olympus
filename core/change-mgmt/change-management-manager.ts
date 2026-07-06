/**
 * ChangeManagementManager — IT/ops change requests with risk classification,
 * Change Advisory Board (CAB) approval, scheduling, and implementation tracking.
 *
 * Events:
 *   - "change.submitted": { changeId, title, risk }
 *   - "change.approved": { changeId, approverId, scheduledFor }
 *   - "change.implemented": { changeId, outcome }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ChangeRisk = "low" | "medium" | "high" | "emergency";
export type ChangeStatus = "submitted" | "approved" | "rejected" | "scheduled" | "implemented" | "rolled_back";
export type ChangeOutcome = "success" | "failed" | "partial";

export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  risk: ChangeRisk;
  status: ChangeStatus;
  requesterId: string;
  approverId?: string;
  scheduledFor?: string;
  implementedAt?: string;
  outcome?: ChangeOutcome;
  rollbackPlan: string;
  createdAt: string;
}

export interface ChangeSummary {
  totalChanges: number;
  byStatus: Partial<Record<ChangeStatus, number>>;
  byRisk: Partial<Record<ChangeRisk, number>>;
  successRatePct: number;
  pendingApproval: number;
}

export class ChangeManagementManager {
  private changes: Map<string, ChangeRequest> = new Map();

  constructor(private readonly bus: EventBus) {}

  submit(input: Omit<ChangeRequest, "id" | "status" | "createdAt"> & { id?: string }): ChangeRequest {
    const change: ChangeRequest = { ...input, id: input.id ?? randomUUID(), status: "submitted", createdAt: new Date().toISOString() };
    this.changes.set(change.id, change);
    this.bus.publish("change.submitted", { changeId: change.id, title: change.title, risk: change.risk });
    return change;
  }

  approve(changeId: string, approverId: string, scheduledFor: string): ChangeRequest | undefined {
    const change = this.changes.get(changeId);
    if (!change || change.status !== "submitted") return undefined;
    change.status = "scheduled";
    change.approverId = approverId;
    change.scheduledFor = scheduledFor;
    this.bus.publish("change.approved", { changeId, approverId, scheduledFor });
    return change;
  }

  reject(changeId: string, approverId: string): ChangeRequest | undefined {
    const change = this.changes.get(changeId);
    if (!change || change.status !== "submitted") return undefined;
    change.status = "rejected";
    change.approverId = approverId;
    return change;
  }

  implement(changeId: string, outcome: ChangeOutcome, asOf: string): ChangeRequest | undefined {
    const change = this.changes.get(changeId);
    if (!change || change.status !== "scheduled") return undefined;
    change.status = outcome === "failed" ? "rolled_back" : "implemented";
    change.outcome = outcome;
    change.implementedAt = asOf;
    this.bus.publish("change.implemented", { changeId, outcome });
    return change;
  }

  getChange(id: string): ChangeRequest | undefined { return this.changes.get(id); }
  listChanges(status?: ChangeStatus, risk?: ChangeRisk): ChangeRequest[] {
    let all = Array.from(this.changes.values());
    if (status) all = all.filter(c => c.status === status);
    if (risk) all = all.filter(c => c.risk === risk);
    return all;
  }

  summary(): ChangeSummary {
    const changes = Array.from(this.changes.values());
    const byStatus: Partial<Record<ChangeStatus, number>> = {};
    const byRisk: Partial<Record<ChangeRisk, number>> = {};
    for (const c of changes) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      byRisk[c.risk] = (byRisk[c.risk] ?? 0) + 1;
    }
    const implemented = changes.filter(c => c.outcome !== undefined);
    const successful = implemented.filter(c => c.outcome === "success").length;
    return {
      totalChanges: changes.length,
      byStatus,
      byRisk,
      successRatePct: implemented.length > 0 ? Math.round((successful / implemented.length) * 100) : 0,
      pendingApproval: changes.filter(c => c.status === "submitted").length,
    };
  }
}
