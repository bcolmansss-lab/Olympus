/**
 * EventSchedulerManager — recurring business events and reminders (renewals,
 * compliance deadlines, reviews) with recurrence rules and due-date evaluation.
 *
 * Events:
 *   - "scheduler.event_due": { eventId, name, category, dueDate }
 *   - "scheduler.event_completed": { eventId, name, nextDueDate }
 *   - "scheduler.event_created": { eventId, name, recurrence }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RecurrencePattern = "once" | "daily" | "weekly" | "monthly" | "quarterly" | "annually";
export type ScheduledEventStatus = "scheduled" | "due" | "completed" | "cancelled";

export interface ScheduledEvent {
  id: string;
  name: string;
  category: string;
  recurrence: RecurrencePattern;
  nextDueDate: string;
  status: ScheduledEventStatus;
  ownerId?: string;
  lastCompletedAt?: string;
  createdAt: string;
}

export interface SchedulerSummary {
  totalEvents: number;
  scheduled: number;
  due: number;
  completed: number;
  byCategory: Record<string, number>;
  byRecurrence: Partial<Record<RecurrencePattern, number>>;
}

export class EventSchedulerManager {
  private events: Map<string, ScheduledEvent> = new Map();

  constructor(private readonly bus: EventBus) {}

  schedule(input: Omit<ScheduledEvent, "id" | "status" | "createdAt"> & { id?: string }): ScheduledEvent {
    const ev: ScheduledEvent = { ...input, id: input.id ?? randomUUID(), status: "scheduled", createdAt: new Date().toISOString() };
    this.events.set(ev.id, ev);
    this.bus.publish("scheduler.event_created", { eventId: ev.id, name: ev.name, recurrence: ev.recurrence });
    return ev;
  }

  private advanceDate(date: string, recurrence: RecurrencePattern): string {
    const d = new Date(date);
    switch (recurrence) {
      case "daily": d.setUTCDate(d.getUTCDate() + 1); break;
      case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
      case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
      case "quarterly": d.setUTCMonth(d.getUTCMonth() + 3); break;
      case "annually": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
      case "once": break;
    }
    return d.toISOString();
  }

  /** Mark events whose due date has passed as "due" and emit event_due. */
  evaluate(asOf: string): ScheduledEvent[] {
    const cutoff = new Date(asOf).getTime();
    const due: ScheduledEvent[] = [];
    for (const ev of this.events.values()) {
      if (ev.status === "scheduled" && new Date(ev.nextDueDate).getTime() <= cutoff) {
        ev.status = "due";
        this.bus.publish("scheduler.event_due", { eventId: ev.id, name: ev.name, category: ev.category, dueDate: ev.nextDueDate });
        due.push(ev);
      }
    }
    return due;
  }

  complete(eventId: string, asOf: string): ScheduledEvent | undefined {
    const ev = this.events.get(eventId);
    if (!ev || ev.status === "cancelled") return undefined;
    ev.lastCompletedAt = asOf;
    if (ev.recurrence === "once") {
      ev.status = "completed";
    } else {
      ev.nextDueDate = this.advanceDate(ev.nextDueDate, ev.recurrence);
      ev.status = "scheduled";
    }
    this.bus.publish("scheduler.event_completed", { eventId: ev.id, name: ev.name, nextDueDate: ev.nextDueDate });
    return ev;
  }

  cancel(eventId: string): ScheduledEvent | undefined {
    const ev = this.events.get(eventId);
    if (!ev) return undefined;
    ev.status = "cancelled";
    return ev;
  }

  getEvent(id: string): ScheduledEvent | undefined { return this.events.get(id); }
  listEvents(category?: string, status?: ScheduledEventStatus): ScheduledEvent[] {
    let all = Array.from(this.events.values());
    if (category) all = all.filter(e => e.category === category);
    if (status) all = all.filter(e => e.status === status);
    return all;
  }

  summary(): SchedulerSummary {
    const all = Array.from(this.events.values());
    const byCategory: Record<string, number> = {};
    const byRecurrence: Partial<Record<RecurrencePattern, number>> = {};
    for (const e of all) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
      byRecurrence[e.recurrence] = (byRecurrence[e.recurrence] ?? 0) + 1;
    }
    return {
      totalEvents: all.length,
      scheduled: all.filter(e => e.status === "scheduled").length,
      due: all.filter(e => e.status === "due").length,
      completed: all.filter(e => e.status === "completed").length,
      byCategory,
      byRecurrence,
    };
  }
}
