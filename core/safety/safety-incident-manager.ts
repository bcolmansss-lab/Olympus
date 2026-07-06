/**
 * SafetyIncidentManager — workplace safety incident reporting, OSHA
 * recordability classification, corrective actions, and safety metrics
 * (TRIR / lost-time tracking).
 *
 * Events:
 *   - "safety.incident_reported": { incidentId, severity, recordable }
 *   - "safety.corrective_action_added": { incidentId, actionId, dueDate }
 *   - "safety.incident_closed": { incidentId, daysOpen }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SafetySeverity = "near_miss" | "first_aid" | "medical_treatment" | "lost_time" | "fatality";
export type IncidentState = "open" | "investigating" | "closed";

export interface CorrectiveAction {
  id: string;
  description: string;
  ownerId: string;
  dueDate: string;
  completed: boolean;
}

export interface SafetyIncident {
  id: string;
  location: string;
  description: string;
  severity: SafetySeverity;
  recordable: boolean; // OSHA recordable
  lostDays: number;
  state: IncidentState;
  reportedBy: string;
  occurredAt: string;
  reportedAt: string;
  closedAt?: string;
  correctiveActions: CorrectiveAction[];
}

export interface SafetySummary {
  totalIncidents: number;
  openIncidents: number;
  recordableCount: number;
  lostTimeCount: number;
  totalLostDays: number;
  bySeverity: Partial<Record<SafetySeverity, number>>;
  openCorrectiveActions: number;
}

const RECORDABLE: SafetySeverity[] = ["medical_treatment", "lost_time", "fatality"];

export class SafetyIncidentManager {
  private incidents: Map<string, SafetyIncident> = new Map();

  constructor(private readonly bus: EventBus) {}

  report(input: { location: string; description: string; severity: SafetySeverity; lostDays?: number; reportedBy: string; occurredAt: string }): SafetyIncident {
    const recordable = RECORDABLE.includes(input.severity);
    const incident: SafetyIncident = {
      id: randomUUID(),
      location: input.location,
      description: input.description,
      severity: input.severity,
      recordable,
      lostDays: input.lostDays ?? 0,
      state: "open",
      reportedBy: input.reportedBy,
      occurredAt: input.occurredAt,
      reportedAt: new Date().toISOString(),
      correctiveActions: [],
    };
    this.incidents.set(incident.id, incident);
    this.bus.publish("safety.incident_reported", { incidentId: incident.id, severity: incident.severity, recordable });
    return incident;
  }

  addCorrectiveAction(incidentId: string, description: string, ownerId: string, dueDate: string): CorrectiveAction | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.state === "closed") return undefined;
    const action: CorrectiveAction = { id: randomUUID(), description, ownerId, dueDate, completed: false };
    incident.correctiveActions.push(action);
    if (incident.state === "open") incident.state = "investigating";
    this.bus.publish("safety.corrective_action_added", { incidentId, actionId: action.id, dueDate });
    return action;
  }

  completeAction(incidentId: string, actionId: string): CorrectiveAction | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) return undefined;
    const action = incident.correctiveActions.find(a => a.id === actionId);
    if (!action) return undefined;
    action.completed = true;
    return action;
  }

  close(incidentId: string, asOf: string): SafetyIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.state === "closed") return undefined;
    if (incident.correctiveActions.some(a => !a.completed)) return undefined;
    incident.state = "closed";
    incident.closedAt = asOf;
    const daysOpen = Math.floor((new Date(asOf).getTime() - new Date(incident.reportedAt).getTime()) / 86400000);
    this.bus.publish("safety.incident_closed", { incidentId, daysOpen });
    return incident;
  }

  /** Total Recordable Incident Rate per 100 full-time workers (200,000 hours). */
  trir(totalHoursWorked: number): number {
    if (totalHoursWorked <= 0) return 0;
    const recordable = Array.from(this.incidents.values()).filter(i => i.recordable).length;
    return Math.round((recordable * 200000 / totalHoursWorked) * 100) / 100;
  }

  getIncident(id: string): SafetyIncident | undefined { return this.incidents.get(id); }
  listIncidents(state?: IncidentState, severity?: SafetySeverity): SafetyIncident[] {
    let all = Array.from(this.incidents.values());
    if (state) all = all.filter(i => i.state === state);
    if (severity) all = all.filter(i => i.severity === severity);
    return all;
  }

  summary(): SafetySummary {
    const incidents = Array.from(this.incidents.values());
    const bySeverity: Partial<Record<SafetySeverity, number>> = {};
    for (const i of incidents) { bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1; }
    return {
      totalIncidents: incidents.length,
      openIncidents: incidents.filter(i => i.state !== "closed").length,
      recordableCount: incidents.filter(i => i.recordable).length,
      lostTimeCount: incidents.filter(i => i.severity === "lost_time").length,
      totalLostDays: incidents.reduce((s, i) => s + i.lostDays, 0),
      bySeverity,
      openCorrectiveActions: incidents.flatMap(i => i.correctiveActions).filter(a => !a.completed).length,
    };
  }
}
