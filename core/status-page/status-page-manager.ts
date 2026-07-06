/**
 * StatusPageManager — public status page: monitored components, incident
 * lifecycle with timeline updates, and uptime/incident analytics.
 *
 * Events:
 *   - "statuspage.incident_opened": { incidentId, title, impact, components }
 *   - "statuspage.incident_updated": { incidentId, status }
 *   - "statuspage.incident_resolved": { incidentId, durationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ComponentStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";
export type IncidentImpact = "none" | "minor" | "major" | "critical";
export type IncidentPhase = "investigating" | "identified" | "monitoring" | "resolved";

export interface StatusComponent {
  id: string;
  name: string;
  status: ComponentStatus;
}

export interface IncidentUpdate {
  phase: IncidentPhase;
  message: string;
  at: string;
}

export interface StatusIncident {
  id: string;
  title: string;
  impact: IncidentImpact;
  components: string[];
  phase: IncidentPhase;
  updates: IncidentUpdate[];
  openedAt: string;
  resolvedAt?: string;
}

export interface StatusPageSummary {
  totalComponents: number;
  operational: number;
  activeIncidents: number;
  totalIncidents: number;
  resolvedIncidents: number;
  byImpact: Partial<Record<IncidentImpact, number>>;
}

export class StatusPageManager {
  private components: Map<string, StatusComponent> = new Map();
  private incidents: Map<string, StatusIncident> = new Map();

  constructor(private readonly bus: EventBus) {}

  addComponent(name: string): StatusComponent {
    const component: StatusComponent = { id: randomUUID(), name, status: "operational" };
    this.components.set(component.id, component);
    return component;
  }

  setComponentStatus(componentId: string, status: ComponentStatus): StatusComponent | undefined {
    const c = this.components.get(componentId);
    if (!c) return undefined;
    c.status = status;
    return c;
  }

  openIncident(input: { title: string; impact: IncidentImpact; components: string[]; message: string; openedAt: string }): StatusIncident {
    const incident: StatusIncident = {
      id: randomUUID(),
      title: input.title,
      impact: input.impact,
      components: input.components,
      phase: "investigating",
      updates: [{ phase: "investigating", message: input.message, at: input.openedAt }],
      openedAt: input.openedAt,
    };
    this.incidents.set(incident.id, incident);
    this.bus.publish("statuspage.incident_opened", { incidentId: incident.id, title: incident.title, impact: incident.impact, components: incident.components });
    return incident;
  }

  postUpdate(incidentId: string, phase: IncidentPhase, message: string, at: string): StatusIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.phase === "resolved") return undefined;
    incident.phase = phase;
    incident.updates.push({ phase, message, at });
    if (phase === "resolved") {
      incident.resolvedAt = at;
      const durationMinutes = Math.round((new Date(at).getTime() - new Date(incident.openedAt).getTime()) / 60000);
      this.bus.publish("statuspage.incident_resolved", { incidentId, durationMinutes });
    } else {
      this.bus.publish("statuspage.incident_updated", { incidentId, status: phase });
    }
    return incident;
  }

  getComponent(id: string): StatusComponent | undefined { return this.components.get(id); }
  getIncident(id: string): StatusIncident | undefined { return this.incidents.get(id); }
  listComponents(): StatusComponent[] { return Array.from(this.components.values()); }
  listIncidents(phase?: IncidentPhase): StatusIncident[] {
    const all = Array.from(this.incidents.values());
    return phase ? all.filter(i => i.phase === phase) : all;
  }
  overallStatus(): ComponentStatus {
    const statuses = Array.from(this.components.values()).map(c => c.status);
    if (statuses.includes("major_outage")) return "major_outage";
    if (statuses.includes("partial_outage")) return "partial_outage";
    if (statuses.includes("degraded")) return "degraded";
    if (statuses.includes("maintenance")) return "maintenance";
    return "operational";
  }

  summary(): StatusPageSummary {
    const components = Array.from(this.components.values());
    const incidents = Array.from(this.incidents.values());
    const byImpact: Partial<Record<IncidentImpact, number>> = {};
    for (const i of incidents) { byImpact[i.impact] = (byImpact[i.impact] ?? 0) + 1; }
    return {
      totalComponents: components.length,
      operational: components.filter(c => c.status === "operational").length,
      activeIncidents: incidents.filter(i => i.phase !== "resolved").length,
      totalIncidents: incidents.length,
      resolvedIncidents: incidents.filter(i => i.phase === "resolved").length,
      byImpact,
    };
  }
}
