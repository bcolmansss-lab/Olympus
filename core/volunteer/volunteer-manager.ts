/**
 * VolunteerManager — employee volunteering: opportunity registry, hour
 * logging with verification, and participation/impact analytics.
 *
 * Events:
 *   - "volunteer.opportunity_added": { opportunityId, title, cause }
 *   - "volunteer.hours_logged": { logId, employeeId, hours }
 *   - "volunteer.hours_verified": { logId, hours }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type VolunteerCause = "education" | "environment" | "community" | "health" | "disaster_relief" | "other";
export type LogStatus = "pending" | "verified" | "rejected";

export interface VolunteerOpportunity {
  id: string;
  title: string;
  organization: string;
  cause: VolunteerCause;
  date: string;
  active: boolean;
}

export interface VolunteerLog {
  id: string;
  opportunityId: string;
  employeeId: string;
  hours: number;
  status: LogStatus;
  loggedAt: string;
  verifiedAt?: string;
}

export interface VolunteerSummary {
  totalOpportunities: number;
  totalLogs: number;
  verifiedHours: number;
  pendingLogs: number;
  uniqueVolunteers: number;
  byCause: Partial<Record<VolunteerCause, number>>;
}

export class VolunteerManager {
  private opportunities: Map<string, VolunteerOpportunity> = new Map();
  private logs: Map<string, VolunteerLog> = new Map();

  constructor(private readonly bus: EventBus) {}

  addOpportunity(input: { title: string; organization: string; cause: VolunteerCause; date: string }): VolunteerOpportunity {
    const opp: VolunteerOpportunity = { ...input, id: randomUUID(), active: true };
    this.opportunities.set(opp.id, opp);
    this.bus.publish("volunteer.opportunity_added", { opportunityId: opp.id, title: opp.title, cause: opp.cause });
    return opp;
  }

  closeOpportunity(opportunityId: string): VolunteerOpportunity | undefined {
    const opp = this.opportunities.get(opportunityId);
    if (!opp) return undefined;
    opp.active = false;
    return opp;
  }

  logHours(opportunityId: string, employeeId: string, hours: number, loggedAt: string): VolunteerLog | undefined {
    const opp = this.opportunities.get(opportunityId);
    if (!opp || hours <= 0) return undefined;
    const log: VolunteerLog = { id: randomUUID(), opportunityId, employeeId, hours, status: "pending", loggedAt };
    this.logs.set(log.id, log);
    this.bus.publish("volunteer.hours_logged", { logId: log.id, employeeId, hours });
    return log;
  }

  verify(logId: string, asOf: string): VolunteerLog | undefined {
    const log = this.logs.get(logId);
    if (!log || log.status !== "pending") return undefined;
    log.status = "verified";
    log.verifiedAt = asOf;
    this.bus.publish("volunteer.hours_verified", { logId, hours: log.hours });
    return log;
  }

  reject(logId: string): VolunteerLog | undefined {
    const log = this.logs.get(logId);
    if (!log || log.status !== "pending") return undefined;
    log.status = "rejected";
    return log;
  }

  getOpportunity(id: string): VolunteerOpportunity | undefined { return this.opportunities.get(id); }
  listOpportunities(activeOnly = false): VolunteerOpportunity[] {
    const all = Array.from(this.opportunities.values());
    return activeOnly ? all.filter(o => o.active) : all;
  }
  listLogs(employeeId?: string, status?: LogStatus): VolunteerLog[] {
    let all = Array.from(this.logs.values());
    if (employeeId) all = all.filter(l => l.employeeId === employeeId);
    if (status) all = all.filter(l => l.status === status);
    return all;
  }
  employeeHours(employeeId: string): number {
    return Array.from(this.logs.values()).filter(l => l.employeeId === employeeId && l.status === "verified").reduce((s, l) => s + l.hours, 0);
  }

  summary(): VolunteerSummary {
    const opps = Array.from(this.opportunities.values());
    const logs = Array.from(this.logs.values());
    const verifiedHours = logs.filter(l => l.status === "verified").reduce((s, l) => s + l.hours, 0);
    const byCause: Partial<Record<VolunteerCause, number>> = {};
    for (const o of opps) { byCause[o.cause] = (byCause[o.cause] ?? 0) + 1; }
    return {
      totalOpportunities: opps.length,
      totalLogs: logs.length,
      verifiedHours: Math.round(verifiedHours * 10) / 10,
      pendingLogs: logs.filter(l => l.status === "pending").length,
      uniqueVolunteers: new Set(logs.map(l => l.employeeId)).size,
      byCause,
    };
  }
}
