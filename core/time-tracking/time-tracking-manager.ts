/**
 * TimeTrackingManager — employee time entries, timesheet approval workflow,
 * billable vs non-billable tracking, and project time utilization analytics.
 *
 * Events:
 *   - "timetracking.timesheet_submitted": { timesheetId, employeeId, period, totalHours }
 *   - "timetracking.timesheet_approved": { timesheetId, employeeId, approverId }
 *   - "timetracking.overtime_flagged": { employeeId, period, totalHours, threshold }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TimesheetStatus = "open" | "submitted" | "approved" | "rejected";

export interface TimeEntry {
  id: string;
  timesheetId: string;
  date: string;
  projectId?: string;
  taskDescription: string;
  hours: number;
  billable: boolean;
}

export interface Timesheet {
  id: string;
  employeeId: string;
  period: string; // e.g. "2026-W26"
  status: TimesheetStatus;
  entries: TimeEntry[];
  submittedAt?: string;
  approvedAt?: string;
  approverId?: string;
  createdAt: string;
}

export interface TimeTrackingSummary {
  totalTimesheets: number;
  pendingApproval: number;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  utilizationPct: number;
  byProject: Record<string, number>;
}

export class TimeTrackingManager {
  private timesheets: Map<string, Timesheet> = new Map();
  private overtimeThreshold: number;

  constructor(private readonly bus: EventBus, overtimeThreshold = 40) {
    this.overtimeThreshold = overtimeThreshold;
  }

  createTimesheet(employeeId: string, period: string): Timesheet {
    const ts: Timesheet = { id: randomUUID(), employeeId, period, status: "open", entries: [], createdAt: new Date().toISOString() };
    this.timesheets.set(ts.id, ts);
    return ts;
  }

  addEntry(timesheetId: string, input: Omit<TimeEntry, "id" | "timesheetId">): TimeEntry | undefined {
    const ts = this.timesheets.get(timesheetId);
    if (!ts || ts.status === "approved") return undefined;
    const entry: TimeEntry = { ...input, id: randomUUID(), timesheetId };
    ts.entries.push(entry);
    return entry;
  }

  submitTimesheet(timesheetId: string): Timesheet | undefined {
    const ts = this.timesheets.get(timesheetId);
    if (!ts) return undefined;
    ts.status = "submitted";
    ts.submittedAt = new Date().toISOString();
    const totalHours = ts.entries.reduce((s, e) => s + e.hours, 0);
    this.bus.publish("timetracking.timesheet_submitted", { timesheetId, employeeId: ts.employeeId, period: ts.period, totalHours });
    if (totalHours > this.overtimeThreshold) {
      this.bus.publish("timetracking.overtime_flagged", { employeeId: ts.employeeId, period: ts.period, totalHours, threshold: this.overtimeThreshold });
    }
    return ts;
  }

  approveTimesheet(timesheetId: string, approverId: string): Timesheet | undefined {
    const ts = this.timesheets.get(timesheetId);
    if (!ts) return undefined;
    ts.status = "approved";
    ts.approvedAt = new Date().toISOString();
    ts.approverId = approverId;
    this.bus.publish("timetracking.timesheet_approved", { timesheetId, employeeId: ts.employeeId, approverId });
    return ts;
  }

  rejectTimesheet(timesheetId: string): Timesheet | undefined {
    const ts = this.timesheets.get(timesheetId);
    if (!ts) return undefined;
    ts.status = "rejected";
    return ts;
  }

  getTimesheet(id: string): Timesheet | undefined { return this.timesheets.get(id); }
  listTimesheets(employeeId?: string, status?: TimesheetStatus): Timesheet[] {
    let all = Array.from(this.timesheets.values());
    if (employeeId) all = all.filter(t => t.employeeId === employeeId);
    if (status) all = all.filter(t => t.status === status);
    return all;
  }

  summary(): TimeTrackingSummary {
    const all = Array.from(this.timesheets.values());
    const entries = all.flatMap(t => t.entries);
    const totalHours = entries.reduce((s, e) => s + e.hours, 0);
    const billableHours = entries.filter(e => e.billable).reduce((s, e) => s + e.hours, 0);
    const byProject: Record<string, number> = {};
    for (const e of entries) {
      if (e.projectId) byProject[e.projectId] = (byProject[e.projectId] ?? 0) + e.hours;
    }
    return {
      totalTimesheets: all.length,
      pendingApproval: all.filter(t => t.status === "submitted").length,
      totalHours,
      billableHours,
      nonBillableHours: totalHours - billableHours,
      utilizationPct: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
      byProject,
    };
  }
}
