/**
 * PreventiveMaintenanceManager — recurring PM schedules for assets: interval
 * or usage-based triggers, due/overdue detection, completion logging, and
 * compliance rate.
 *
 * Events:
 *   - "pm.schedule_created": { scheduleId, assetTag, intervalDays }
 *   - "pm.due": { scheduleId, assetTag, dueDate }
 *   - "pm.completed": { scheduleId, nextDueDate }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PMTriggerType = "calendar" | "usage";
export type PMStatus = "scheduled" | "due" | "completed";

export interface PMLog {
  performedAt: string;
  technicianId: string;
  notes?: string;
}

export interface PMSchedule {
  id: string;
  assetTag: string;
  task: string;
  triggerType: PMTriggerType;
  intervalDays: number; // for calendar
  usageInterval: number; // for usage (e.g. hours/miles)
  usageSinceLast: number;
  nextDueDate: string;
  status: PMStatus;
  history: PMLog[];
  createdAt: string;
}

export interface PMSummary {
  totalSchedules: number;
  due: number;
  completedTotal: number;
  overdue: number;
  complianceRatePct: number;
}

export class PreventiveMaintenanceManager {
  private schedules: Map<string, PMSchedule> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { assetTag: string; task: string; triggerType: PMTriggerType; intervalDays?: number; usageInterval?: number; firstDueDate: string }): PMSchedule {
    const schedule: PMSchedule = {
      id: randomUUID(),
      assetTag: input.assetTag,
      task: input.task,
      triggerType: input.triggerType,
      intervalDays: input.intervalDays ?? 0,
      usageInterval: input.usageInterval ?? 0,
      usageSinceLast: 0,
      nextDueDate: input.firstDueDate,
      status: "scheduled",
      history: [],
      createdAt: new Date().toISOString(),
    };
    this.schedules.set(schedule.id, schedule);
    this.bus.publish("pm.schedule_created", { scheduleId: schedule.id, assetTag: schedule.assetTag, intervalDays: schedule.intervalDays });
    return schedule;
  }

  recordUsage(scheduleId: string, units: number): PMSchedule | undefined {
    const s = this.schedules.get(scheduleId);
    if (!s || s.triggerType !== "usage") return undefined;
    s.usageSinceLast += units;
    if (s.status === "scheduled" && s.usageSinceLast >= s.usageInterval) {
      s.status = "due";
      this.bus.publish("pm.due", { scheduleId, assetTag: s.assetTag, dueDate: s.nextDueDate });
    }
    return s;
  }

  /** Evaluate calendar schedules against a date and mark due. */
  evaluate(asOf: string): PMSchedule[] {
    const cutoff = new Date(asOf).getTime();
    const due: PMSchedule[] = [];
    for (const s of this.schedules.values()) {
      if (s.triggerType === "calendar" && s.status === "scheduled" && new Date(s.nextDueDate).getTime() <= cutoff) {
        s.status = "due";
        this.bus.publish("pm.due", { scheduleId: s.id, assetTag: s.assetTag, dueDate: s.nextDueDate });
        due.push(s);
      }
    }
    return due;
  }

  complete(scheduleId: string, technicianId: string, asOf: string, notes?: string): PMSchedule | undefined {
    const s = this.schedules.get(scheduleId);
    if (!s) return undefined;
    s.history.push({ performedAt: asOf, technicianId, notes });
    s.usageSinceLast = 0;
    const next = new Date(asOf);
    next.setUTCDate(next.getUTCDate() + (s.intervalDays || 30));
    s.nextDueDate = next.toISOString();
    s.status = "scheduled";
    this.bus.publish("pm.completed", { scheduleId, nextDueDate: s.nextDueDate });
    return s;
  }

  getSchedule(id: string): PMSchedule | undefined { return this.schedules.get(id); }
  listSchedules(status?: PMStatus, assetTag?: string): PMSchedule[] {
    let all = Array.from(this.schedules.values());
    if (status) all = all.filter(s => s.status === status);
    if (assetTag) all = all.filter(s => s.assetTag === assetTag);
    return all;
  }

  summary(asOf?: string): PMSummary {
    const schedules = Array.from(this.schedules.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const completedTotal = schedules.reduce((s, x) => s + x.history.length, 0);
    const overdue = schedules.filter(s => s.status !== "completed" && new Date(s.nextDueDate).getTime() < ref && s.status === "due").length;
    const due = schedules.filter(s => s.status === "due").length;
    return {
      totalSchedules: schedules.length,
      due,
      completedTotal,
      overdue,
      complianceRatePct: schedules.length > 0 ? Math.round(((schedules.length - due) / schedules.length) * 100) : 0,
    };
  }
}
