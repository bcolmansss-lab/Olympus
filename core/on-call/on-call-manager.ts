/**
 * OnCallScheduleManager — on-call rotation schedules, shift assignment,
 * current responder resolution, and page/escalation tracking.
 *
 * Events:
 *   - "oncall.rotation_created": { rotationId, name, memberCount }
 *   - "oncall.paged": { rotationId, responderId, severity }
 *   - "oncall.escalated": { rotationId, fromResponderId, toResponderId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PageSeverity = "info" | "warning" | "critical";

export interface OnCallShift {
  responderId: string;
  responderName: string;
  startsAt: string;
  endsAt: string;
}

export interface OnCallRotation {
  id: string;
  name: string;
  members: string[]; // ordered responder ids for escalation
  shifts: OnCallShift[];
  createdAt: string;
}

export interface PageRecord {
  id: string;
  rotationId: string;
  responderId: string;
  severity: PageSeverity;
  message: string;
  acknowledged: boolean;
  pagedAt: string;
  acknowledgedAt?: string;
}

export interface OnCallSummary {
  totalRotations: number;
  totalShifts: number;
  totalPages: number;
  acknowledgedPages: number;
  unacknowledgedPages: number;
  bySeverity: Partial<Record<PageSeverity, number>>;
}

export class OnCallScheduleManager {
  private rotations: Map<string, OnCallRotation> = new Map();
  private pages: Map<string, PageRecord> = new Map();

  constructor(private readonly bus: EventBus) {}

  createRotation(name: string, members: string[]): OnCallRotation {
    const rotation: OnCallRotation = { id: randomUUID(), name, members, shifts: [], createdAt: new Date().toISOString() };
    this.rotations.set(rotation.id, rotation);
    this.bus.publish("oncall.rotation_created", { rotationId: rotation.id, name, memberCount: members.length });
    return rotation;
  }

  addShift(rotationId: string, shift: OnCallShift): OnCallRotation | undefined {
    const rotation = this.rotations.get(rotationId);
    if (!rotation) return undefined;
    rotation.shifts.push(shift);
    rotation.shifts.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return rotation;
  }

  currentResponder(rotationId: string, asOf: string): OnCallShift | undefined {
    const rotation = this.rotations.get(rotationId);
    if (!rotation) return undefined;
    const now = new Date(asOf).getTime();
    return rotation.shifts.find(s => new Date(s.startsAt).getTime() <= now && now < new Date(s.endsAt).getTime());
  }

  page(rotationId: string, severity: PageSeverity, message: string, asOf: string): PageRecord | undefined {
    const shift = this.currentResponder(rotationId, asOf);
    if (!shift) return undefined;
    const record: PageRecord = { id: randomUUID(), rotationId, responderId: shift.responderId, severity, message, acknowledged: false, pagedAt: asOf };
    this.pages.set(record.id, record);
    this.bus.publish("oncall.paged", { rotationId, responderId: shift.responderId, severity });
    return record;
  }

  acknowledge(pageId: string, asOf: string): PageRecord | undefined {
    const record = this.pages.get(pageId);
    if (!record) return undefined;
    record.acknowledged = true;
    record.acknowledgedAt = asOf;
    return record;
  }

  /** Escalate an unacknowledged page to the next member in the rotation order. */
  escalate(pageId: string): PageRecord | undefined {
    const record = this.pages.get(pageId);
    if (!record || record.acknowledged) return undefined;
    const rotation = this.rotations.get(record.rotationId);
    if (!rotation) return undefined;
    const idx = rotation.members.indexOf(record.responderId);
    const next = rotation.members[idx + 1];
    if (!next) return undefined;
    const from = record.responderId;
    record.responderId = next;
    this.bus.publish("oncall.escalated", { rotationId: record.rotationId, fromResponderId: from, toResponderId: next });
    return record;
  }

  getRotation(id: string): OnCallRotation | undefined { return this.rotations.get(id); }
  listRotations(): OnCallRotation[] { return Array.from(this.rotations.values()); }
  listPages(rotationId?: string, acknowledged?: boolean): PageRecord[] {
    let all = Array.from(this.pages.values());
    if (rotationId) all = all.filter(p => p.rotationId === rotationId);
    if (acknowledged !== undefined) all = all.filter(p => p.acknowledged === acknowledged);
    return all;
  }

  summary(): OnCallSummary {
    const rotations = Array.from(this.rotations.values());
    const pages = Array.from(this.pages.values());
    const bySeverity: Partial<Record<PageSeverity, number>> = {};
    for (const p of pages) { bySeverity[p.severity] = (bySeverity[p.severity] ?? 0) + 1; }
    return {
      totalRotations: rotations.length,
      totalShifts: rotations.reduce((s, r) => s + r.shifts.length, 0),
      totalPages: pages.length,
      acknowledgedPages: pages.filter(p => p.acknowledged).length,
      unacknowledgedPages: pages.filter(p => !p.acknowledged).length,
      bySeverity,
    };
  }
}
