/**
 * DataSubjectRequestManager — privacy data-subject requests (DSAR): access,
 * erasure, rectification, portability; statutory deadline tracking and
 * fulfillment workflow.
 *
 * Events:
 *   - "dsar.received": { requestId, subjectId, type, dueBy }
 *   - "dsar.overdue": { requestId, type, dueBy }
 *   - "dsar.fulfilled": { requestId, type, daysToFulfill }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DSARType = "access" | "erasure" | "rectification" | "portability" | "restriction" | "objection";
export type DSARStatus = "received" | "verifying" | "in_progress" | "fulfilled" | "rejected";

export interface DataSubjectRequest {
  id: string;
  subjectId: string;
  type: DSARType;
  status: DSARStatus;
  identityVerified: boolean;
  receivedAt: string;
  dueBy: string;
  fulfilledAt?: string;
  rejectionReason?: string;
}

export interface DSARSummary {
  totalRequests: number;
  open: number;
  fulfilled: number;
  overdue: number;
  byType: Partial<Record<DSARType, number>>;
  avgDaysToFulfill: number;
}

export class DataSubjectRequestManager {
  private requests: Map<string, DataSubjectRequest> = new Map();
  private statutoryDays: number;

  constructor(private readonly bus: EventBus, statutoryDays = 30) {
    this.statutoryDays = statutoryDays;
  }

  receive(subjectId: string, type: DSARType, receivedAt: string): DataSubjectRequest {
    const due = new Date(receivedAt);
    due.setUTCDate(due.getUTCDate() + this.statutoryDays);
    const request: DataSubjectRequest = { id: randomUUID(), subjectId, type, status: "received", identityVerified: false, receivedAt, dueBy: due.toISOString() };
    this.requests.set(request.id, request);
    this.bus.publish("dsar.received", { requestId: request.id, subjectId, type, dueBy: request.dueBy });
    return request;
  }

  verifyIdentity(requestId: string): DataSubjectRequest | undefined {
    const r = this.requests.get(requestId);
    if (!r || r.status === "fulfilled" || r.status === "rejected") return undefined;
    r.identityVerified = true;
    r.status = "in_progress";
    return r;
  }

  fulfill(requestId: string, asOf: string): DataSubjectRequest | undefined {
    const r = this.requests.get(requestId);
    if (!r || !r.identityVerified || r.status === "fulfilled" || r.status === "rejected") return undefined;
    r.status = "fulfilled";
    r.fulfilledAt = asOf;
    const daysToFulfill = Math.floor((new Date(asOf).getTime() - new Date(r.receivedAt).getTime()) / 86400000);
    this.bus.publish("dsar.fulfilled", { requestId, type: r.type, daysToFulfill });
    return r;
  }

  reject(requestId: string, reason: string): DataSubjectRequest | undefined {
    const r = this.requests.get(requestId);
    if (!r || r.status === "fulfilled") return undefined;
    r.status = "rejected";
    r.rejectionReason = reason;
    return r;
  }

  /** Emit overdue events for open requests past their deadline. */
  checkOverdue(asOf: string): DataSubjectRequest[] {
    const cutoff = new Date(asOf).getTime();
    const overdue = Array.from(this.requests.values()).filter(r => (r.status !== "fulfilled" && r.status !== "rejected") && new Date(r.dueBy).getTime() < cutoff);
    for (const r of overdue) {
      this.bus.publish("dsar.overdue", { requestId: r.id, type: r.type, dueBy: r.dueBy });
    }
    return overdue;
  }

  getRequest(id: string): DataSubjectRequest | undefined { return this.requests.get(id); }
  listRequests(status?: DSARStatus, type?: DSARType): DataSubjectRequest[] {
    let all = Array.from(this.requests.values());
    if (status) all = all.filter(r => r.status === status);
    if (type) all = all.filter(r => r.type === type);
    return all;
  }

  summary(asOf?: string): DSARSummary {
    const requests = Array.from(this.requests.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const fulfilled = requests.filter(r => r.status === "fulfilled" && r.fulfilledAt);
    const days = fulfilled.map(r => Math.floor((new Date(r.fulfilledAt!).getTime() - new Date(r.receivedAt).getTime()) / 86400000));
    const byType: Partial<Record<DSARType, number>> = {};
    for (const r of requests) { byType[r.type] = (byType[r.type] ?? 0) + 1; }
    return {
      totalRequests: requests.length,
      open: requests.filter(r => r.status !== "fulfilled" && r.status !== "rejected").length,
      fulfilled: fulfilled.length,
      overdue: requests.filter(r => (r.status !== "fulfilled" && r.status !== "rejected") && new Date(r.dueBy).getTime() < ref).length,
      byType,
      avgDaysToFulfill: days.length > 0 ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : 0,
    };
  }
}
