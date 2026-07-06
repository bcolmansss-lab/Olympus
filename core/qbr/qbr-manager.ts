/**
 * QBRManager — Quarterly Business Reviews: scheduling, agenda/metric capture,
 * action-item tracking, and sentiment outcome recording.
 *
 * Events:
 *   - "qbr.scheduled": { qbrId, accountId, period, scheduledFor }
 *   - "qbr.completed": { qbrId, sentiment, actionItemCount }
 *   - "qbr.action_item_closed": { qbrId, itemId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type QBRStatus = "scheduled" | "completed" | "cancelled";
export type QBRSentiment = "positive" | "neutral" | "at_risk";

export interface QBRMetric {
  name: string;
  value: number;
  target: number;
}

export interface ActionItem {
  id: string;
  description: string;
  ownerId: string;
  dueDate: string;
  closed: boolean;
}

export interface QBR {
  id: string;
  accountId: string;
  accountName: string;
  period: string;
  status: QBRStatus;
  scheduledFor: string;
  metrics: QBRMetric[];
  actionItems: ActionItem[];
  sentiment?: QBRSentiment;
  completedAt?: string;
}

export interface QBRSummary {
  totalQBRs: number;
  scheduled: number;
  completed: number;
  atRisk: number;
  openActionItems: number;
  metricsOnTargetPct: number;
}

export class QBRManager {
  private qbrs: Map<string, QBR> = new Map();

  constructor(private readonly bus: EventBus) {}

  schedule(input: { accountId: string; accountName: string; period: string; scheduledFor: string }): QBR {
    const qbr: QBR = { ...input, id: randomUUID(), status: "scheduled", metrics: [], actionItems: [] };
    this.qbrs.set(qbr.id, qbr);
    this.bus.publish("qbr.scheduled", { qbrId: qbr.id, accountId: qbr.accountId, period: qbr.period, scheduledFor: qbr.scheduledFor });
    return qbr;
  }

  addMetric(qbrId: string, name: string, value: number, target: number): QBR | undefined {
    const qbr = this.qbrs.get(qbrId);
    if (!qbr || qbr.status === "completed") return undefined;
    qbr.metrics.push({ name, value, target });
    return qbr;
  }

  addActionItem(qbrId: string, description: string, ownerId: string, dueDate: string): ActionItem | undefined {
    const qbr = this.qbrs.get(qbrId);
    if (!qbr || qbr.status === "cancelled") return undefined;
    const item: ActionItem = { id: randomUUID(), description, ownerId, dueDate, closed: false };
    qbr.actionItems.push(item);
    return item;
  }

  closeActionItem(qbrId: string, itemId: string): ActionItem | undefined {
    const qbr = this.qbrs.get(qbrId);
    if (!qbr) return undefined;
    const item = qbr.actionItems.find(i => i.id === itemId);
    if (!item || item.closed) return undefined;
    item.closed = true;
    this.bus.publish("qbr.action_item_closed", { qbrId, itemId });
    return item;
  }

  complete(qbrId: string, sentiment: QBRSentiment, asOf: string): QBR | undefined {
    const qbr = this.qbrs.get(qbrId);
    if (!qbr || qbr.status !== "scheduled") return undefined;
    qbr.status = "completed";
    qbr.sentiment = sentiment;
    qbr.completedAt = asOf;
    this.bus.publish("qbr.completed", { qbrId, sentiment, actionItemCount: qbr.actionItems.length });
    return qbr;
  }

  cancel(qbrId: string): QBR | undefined {
    const qbr = this.qbrs.get(qbrId);
    if (!qbr || qbr.status === "completed") return undefined;
    qbr.status = "cancelled";
    return qbr;
  }

  getQBR(id: string): QBR | undefined { return this.qbrs.get(id); }
  listQBRs(status?: QBRStatus, accountId?: string): QBR[] {
    let all = Array.from(this.qbrs.values());
    if (status) all = all.filter(q => q.status === status);
    if (accountId) all = all.filter(q => q.accountId === accountId);
    return all;
  }

  summary(): QBRSummary {
    const qbrs = Array.from(this.qbrs.values());
    const metrics = qbrs.flatMap(q => q.metrics);
    const onTarget = metrics.filter(m => m.value >= m.target).length;
    return {
      totalQBRs: qbrs.length,
      scheduled: qbrs.filter(q => q.status === "scheduled").length,
      completed: qbrs.filter(q => q.status === "completed").length,
      atRisk: qbrs.filter(q => q.sentiment === "at_risk").length,
      openActionItems: qbrs.flatMap(q => q.actionItems).filter(i => !i.closed).length,
      metricsOnTargetPct: metrics.length > 0 ? Math.round((onTarget / metrics.length) * 100) : 0,
    };
  }
}
