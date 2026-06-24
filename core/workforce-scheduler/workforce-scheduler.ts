/**
 * WorkforceScheduler — shift scheduling, availability management,
 * overtime tracking, coverage gap detection, and labor cost forecasting.
 *
 * Events:
 *   - "workforce.shift_assigned": { shiftId, employeeId, date, role }
 *   - "workforce.coverage_gap": { date, role, requiredCount, assignedCount }
 *   - "workforce.overtime_alert": { employeeId, weekOf, scheduledHours }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ShiftStatus = "scheduled" | "confirmed" | "completed" | "no_show" | "cancelled";
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface ShiftTemplate {
  id: string;
  name: string;
  role: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  durationHours: number;
  requiredCount: number;
  daysOfWeek: DayOfWeek[];
}

export interface Shift {
  id: string;
  templateId?: string;
  employeeId: string;
  role: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  durationHours: number;
  status: ShiftStatus;
  locationId?: string;
  notes?: string;
  createdAt: string;
}

export interface EmployeeAvailability {
  employeeId: string;
  weekOf: string; // YYYY-MM-DD (Monday)
  availableDays: DayOfWeek[];
  maxHoursPerWeek: number;
  preferredRole?: string;
}

export interface ScheduleSummary {
  totalShifts: number;
  confirmedShifts: number;
  coverageGaps: number;
  avgDailyHours: number;
  overtimeEmployees: number;
  estimatedLaborCostUsd: number;
}

export class WorkforceScheduler {
  private templates: Map<string, ShiftTemplate> = new Map();
  private shifts: Map<string, Shift> = new Map();
  private availability: Map<string, EmployeeAvailability> = new Map(); // key: employeeId:weekOf

  constructor(private readonly bus: EventBus) {}

  createTemplate(input: Omit<ShiftTemplate, "id"> & { id?: string }): ShiftTemplate {
    const template: ShiftTemplate = { ...input, id: input.id ?? randomUUID() };
    this.templates.set(template.id, template);
    return template;
  }

  assignShift(input: Omit<Shift, "id" | "createdAt"> & { id?: string }): Shift {
    const shift: Shift = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.shifts.set(shift.id, shift);
    this.bus.publish("workforce.shift_assigned", { shiftId: shift.id, employeeId: shift.employeeId, date: shift.date, role: shift.role });

    // Check overtime: sum hours for this employee in the same week
    const weekStart = this.getWeekStart(shift.date);
    const weekShifts = Array.from(this.shifts.values()).filter((s) => s.employeeId === shift.employeeId && this.getWeekStart(s.date) === weekStart && s.status !== "cancelled");
    const totalHours = weekShifts.reduce((sum, s) => sum + s.durationHours, 0);
    if (totalHours > 40) {
      this.bus.publish("workforce.overtime_alert", { employeeId: shift.employeeId, weekOf: weekStart, scheduledHours: totalHours });
    }

    return shift;
  }

  setAvailability(input: EmployeeAvailability): void {
    this.availability.set(`${input.employeeId}:${input.weekOf}`, input);
  }

  checkCoverageGap(date: string, role: string, requiredCount: number): boolean {
    const assigned = Array.from(this.shifts.values()).filter((s) => s.date === date && s.role === role && s.status !== "cancelled").length;
    if (assigned < requiredCount) {
      this.bus.publish("workforce.coverage_gap", { date, role, requiredCount, assignedCount: assigned });
      return true;
    }
    return false;
  }

  updateShiftStatus(shiftId: string, status: ShiftStatus): Shift | undefined {
    const shift = this.shifts.get(shiftId);
    if (!shift) return undefined;
    shift.status = status;
    return shift;
  }

  getShift(id: string): Shift | undefined { return this.shifts.get(id); }
  listShifts(date?: string, employeeId?: string): Shift[] {
    let all = Array.from(this.shifts.values());
    if (date) all = all.filter((s) => s.date === date);
    if (employeeId) all = all.filter((s) => s.employeeId === employeeId);
    return all;
  }

  listTemplates(): ShiftTemplate[] { return Array.from(this.templates.values()); }

  private getWeekStart(date: string): string {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  summary(hourlyRateUsd = 30): ScheduleSummary {
    const shifts = Array.from(this.shifts.values()).filter((s) => s.status !== "cancelled");
    const dates = [...new Set(shifts.map((s) => s.date))];
    const avgDaily = dates.length > 0 ? shifts.reduce((s, sh) => s + sh.durationHours, 0) / dates.length : 0;
    // Count employees who have >40 hrs in any week
    const byEmployeeWeek: Record<string, number> = {};
    for (const s of shifts) {
      const key = `${s.employeeId}:${this.getWeekStart(s.date)}`;
      byEmployeeWeek[key] = (byEmployeeWeek[key] ?? 0) + s.durationHours;
    }
    const overtimeEmployees = new Set(Object.entries(byEmployeeWeek).filter(([, h]) => h > 40).map(([k]) => k.split(":")[0])).size;
    return {
      totalShifts: shifts.length,
      confirmedShifts: shifts.filter((s) => s.status === "confirmed" || s.status === "completed").length,
      coverageGaps: 0,
      avgDailyHours: Math.round(avgDaily),
      overtimeEmployees,
      estimatedLaborCostUsd: shifts.reduce((s, sh) => s + sh.durationHours * hourlyRateUsd, 0),
    };
  }
}
