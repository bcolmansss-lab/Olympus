/**
 * PostmortemManager — blameless incident retrospectives: timeline, root-cause
 * (5-whys), contributing factors, action items with owners, and completion
 * tracking toward a published, actioned postmortem.
 *
 * Events:
 *   - "postmortem.created": { postmortemId, incidentRef, severity }
 *   - "postmortem.action_added": { postmortemId, actionId, ownerId }
 *   - "postmortem.published": { postmortemId, actionCount }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PMStatus = "draft" | "in_review" | "published";
export type Severity = "sev1" | "sev2" | "sev3";

export interface TimelineEvent {
  at: string;
  description: string;
}

export interface ActionItem {
  id: string;
  description: string;
  ownerId: string;
  dueDate: string;
  completed: boolean;
}

export interface PostmortemDoc {
  id: string;
  incidentRef: string;
  title: string;
  severity: Severity;
  status: PMStatus;
  summary: string;
  rootCause?: string;
  contributingFactors: string[];
  timeline: TimelineEvent[];
  actions: ActionItem[];
  createdAt: string;
  publishedAt?: string;
}

export interface PostmortemSummary {
  totalPostmortems: number;
  published: number;
  openActions: number;
  completedActions: number;
  actionCompletionPct: number;
  bySeverity: Partial<Record<Severity, number>>;
}

export class PostmortemManager {
  private docs: Map<string, PostmortemDoc> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { incidentRef: string; title: string; severity: Severity; summary: string }): PostmortemDoc {
    const doc: PostmortemDoc = {
      id: randomUUID(),
      incidentRef: input.incidentRef,
      title: input.title,
      severity: input.severity,
      status: "draft",
      summary: input.summary,
      contributingFactors: [],
      timeline: [],
      actions: [],
      createdAt: new Date().toISOString(),
    };
    this.docs.set(doc.id, doc);
    this.bus.publish("postmortem.created", { postmortemId: doc.id, incidentRef: doc.incidentRef, severity: doc.severity });
    return doc;
  }

  addTimelineEvent(pmId: string, at: string, description: string): PostmortemDoc | undefined {
    const doc = this.docs.get(pmId);
    if (!doc || doc.status === "published") return undefined;
    doc.timeline.push({ at, description });
    doc.timeline.sort((a, b) => a.at.localeCompare(b.at));
    return doc;
  }

  setRootCause(pmId: string, rootCause: string, contributingFactors: string[] = []): PostmortemDoc | undefined {
    const doc = this.docs.get(pmId);
    if (!doc || doc.status === "published") return undefined;
    doc.rootCause = rootCause;
    doc.contributingFactors = contributingFactors;
    if (doc.status === "draft") doc.status = "in_review";
    return doc;
  }

  addAction(pmId: string, description: string, ownerId: string, dueDate: string): ActionItem | undefined {
    const doc = this.docs.get(pmId);
    if (!doc || doc.status === "published") return undefined;
    const action: ActionItem = { id: randomUUID(), description, ownerId, dueDate, completed: false };
    doc.actions.push(action);
    this.bus.publish("postmortem.action_added", { postmortemId: pmId, actionId: action.id, ownerId });
    return action;
  }

  completeAction(pmId: string, actionId: string): ActionItem | undefined {
    const doc = this.docs.get(pmId);
    const action = doc?.actions.find(a => a.id === actionId);
    if (!action || action.completed) return undefined;
    action.completed = true;
    return action;
  }

  publish(pmId: string, asOf: string): PostmortemDoc | undefined {
    const doc = this.docs.get(pmId);
    if (!doc || doc.status === "published" || !doc.rootCause) return undefined;
    doc.status = "published";
    doc.publishedAt = asOf;
    this.bus.publish("postmortem.published", { postmortemId: pmId, actionCount: doc.actions.length });
    return doc;
  }

  getPostmortem(id: string): PostmortemDoc | undefined { return this.docs.get(id); }
  listPostmortems(status?: PMStatus, severity?: Severity): PostmortemDoc[] {
    let all = Array.from(this.docs.values());
    if (status) all = all.filter(d => d.status === status);
    if (severity) all = all.filter(d => d.severity === severity);
    return all;
  }

  summary(): PostmortemSummary {
    const docs = Array.from(this.docs.values());
    const actions = docs.flatMap(d => d.actions);
    const completed = actions.filter(a => a.completed).length;
    const bySeverity: Partial<Record<Severity, number>> = {};
    for (const d of docs) { bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1; }
    return {
      totalPostmortems: docs.length,
      published: docs.filter(d => d.status === "published").length,
      openActions: actions.filter(a => !a.completed).length,
      completedActions: completed,
      actionCompletionPct: actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0,
      bySeverity,
    };
  }
}
