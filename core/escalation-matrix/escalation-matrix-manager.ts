/**
 * EscalationMatrixManager — tiered escalation paths: per-severity ladders of
 * levels with response-time targets, active escalation tracking that climbs
 * levels when unacknowledged, and time-to-acknowledge analytics.
 *
 * Events:
 *   - "escalation.opened": { escalationId, severity, level, contact }
 *   - "escalation.climbed": { escalationId, level, contact }
 *   - "escalation.acknowledged": { escalationId, level, minutesToAck }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EscalationSeverity = "low" | "medium" | "high" | "critical";
export type EscalationStatus = "open" | "acknowledged" | "exhausted";

export interface MatrixLevel {
  level: number;
  contact: string; // person/team
  respondWithinMinutes: number;
}

export interface ActiveEscalation {
  id: string;
  subject: string;
  severity: EscalationSeverity;
  status: EscalationStatus;
  currentLevel: number;
  openedAt: string;
  lastEscalatedAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface EscalationMatrixSummary {
  totalEscalations: number;
  open: number;
  acknowledged: number;
  exhausted: number;
  avgMinutesToAck: number;
}

export class EscalationMatrixManager {
  private matrices: Map<EscalationSeverity, MatrixLevel[]> = new Map();
  private escalations: Map<string, ActiveEscalation> = new Map();

  constructor(private readonly bus: EventBus) {}

  defineMatrix(severity: EscalationSeverity, levels: { contact: string; respondWithinMinutes: number }[]): MatrixLevel[] {
    const matrix = levels.map((l, i) => ({ level: i + 1, contact: l.contact, respondWithinMinutes: l.respondWithinMinutes }));
    this.matrices.set(severity, matrix);
    return matrix;
  }

  open(subject: string, severity: EscalationSeverity, asOf: string): ActiveEscalation | undefined {
    const matrix = this.matrices.get(severity);
    if (!matrix || matrix.length === 0) return undefined;
    const escalation: ActiveEscalation = { id: randomUUID(), subject, severity, status: "open", currentLevel: 1, openedAt: asOf, lastEscalatedAt: asOf };
    this.escalations.set(escalation.id, escalation);
    this.bus.publish("escalation.opened", { escalationId: escalation.id, severity, level: 1, contact: matrix[0]!.contact });
    return escalation;
  }

  /** Climb overdue escalations to the next level (or exhaust). */
  tick(asOf: string): ActiveEscalation[] {
    const now = new Date(asOf).getTime();
    const climbed: ActiveEscalation[] = [];
    for (const e of this.escalations.values()) {
      if (e.status !== "open") continue;
      const matrix = this.matrices.get(e.severity)!;
      const level = matrix[e.currentLevel - 1]!;
      const dueAt = new Date(e.lastEscalatedAt).getTime() + level.respondWithinMinutes * 60000;
      if (now < dueAt) continue;
      if (e.currentLevel >= matrix.length) {
        e.status = "exhausted";
      } else {
        e.currentLevel += 1;
        e.lastEscalatedAt = asOf;
        const next = matrix[e.currentLevel - 1]!;
        this.bus.publish("escalation.climbed", { escalationId: e.id, level: e.currentLevel, contact: next.contact });
        climbed.push(e);
      }
    }
    return climbed;
  }

  acknowledge(escalationId: string, by: string, asOf: string): ActiveEscalation | undefined {
    const e = this.escalations.get(escalationId);
    if (!e || e.status !== "open") return undefined;
    e.status = "acknowledged";
    e.acknowledgedBy = by;
    e.acknowledgedAt = asOf;
    const minutesToAck = Math.round((new Date(asOf).getTime() - new Date(e.openedAt).getTime()) / 60000);
    this.bus.publish("escalation.acknowledged", { escalationId, level: e.currentLevel, minutesToAck });
    return e;
  }

  currentContact(escalationId: string): string | undefined {
    const e = this.escalations.get(escalationId);
    if (!e) return undefined;
    return this.matrices.get(e.severity)?.[e.currentLevel - 1]?.contact;
  }

  getEscalation(id: string): ActiveEscalation | undefined { return this.escalations.get(id); }
  listEscalations(status?: EscalationStatus): ActiveEscalation[] {
    const all = Array.from(this.escalations.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): EscalationMatrixSummary {
    const escalations = Array.from(this.escalations.values());
    const acked = escalations.filter(e => e.acknowledgedAt);
    const times = acked.map(e => Math.round((new Date(e.acknowledgedAt!).getTime() - new Date(e.openedAt).getTime()) / 60000));
    return {
      totalEscalations: escalations.length,
      open: escalations.filter(e => e.status === "open").length,
      acknowledged: acked.length,
      exhausted: escalations.filter(e => e.status === "exhausted").length,
      avgMinutesToAck: times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0,
    };
  }
}
