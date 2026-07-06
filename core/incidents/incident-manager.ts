/**
 * IncidentManager — tracks production incidents, their lifecycle, and post-mortems.
 *
 * Severity:
 *   SEV1 = total outage, SEV2 = major degradation, SEV3 = minor impact, SEV4 = cosmetic
 *
 * Lifecycle: detected → acknowledged → mitigated → resolved → closed
 *
 * Metrics computed:
 *   - MTTD (mean time to detect, ms from occurrence to detection)
 *   - MTTA (mean time to acknowledge)
 *   - MTTR (mean time to resolve, ms from detection to resolution)
 *
 * Events:
 *   - "incident.opened": { incidentId, title, severity, detectedAt }
 *   - "incident.resolved": { incidentId, title, severity, mttdMs, mttaMs, mttrMs }
 *   - "incident.postmortem_published": { incidentId, title, actionItems }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type IncidentSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
export type IncidentStatus = "detected" | "acknowledged" | "mitigated" | "resolved" | "closed";

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  /** ISO — when the incident actually started (may be before detection). */
  occurredAt: string;
  detectedAt: string;
  acknowledgedAt?: string;
  mitigatedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  commander?: string;
  affectedServices: string[];
  tags?: string[];
  postmortem?: Postmortem;
}

export interface Postmortem {
  incidentId: string;
  summary: string;
  rootCause: string;
  timeline: string;
  actionItems: string[];
  publishedAt: string;
  publishedBy: string;
}

export interface IncidentMetrics {
  /** Mean time to detect (ms). */
  mttdMs: number;
  /** Mean time to acknowledge (ms). */
  mttaMs: number;
  /** Mean time to resolve (ms). */
  mttrMs: number;
  totalIncidents: number;
  bySeverity: Record<IncidentSeverity, number>;
  openIncidents: number;
}

const OPEN_STATUSES = new Set<IncidentStatus>(["detected", "acknowledged", "mitigated"]);

export class IncidentManager {
  private readonly incidents = new Map<string, Incident>();

  constructor(private readonly bus: EventBus) {}

  openIncident(
    input: Omit<Incident, "id" | "status" | "postmortem"> & { id?: string },
  ): Incident {
    const incident: Incident = {
      ...input,
      id: input.id ?? randomUUID(),
      status: "detected",
    };
    this.incidents.set(incident.id, incident);
    this.bus.publish("incident.opened", {
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
      detectedAt: incident.detectedAt,
    });
    return incident;
  }

  acknowledge(id: string, commander?: string): Incident | undefined {
    const incident = this.incidents.get(id);
    if (!incident) return undefined;
    incident.acknowledgedAt = new Date().toISOString();
    incident.status = "acknowledged";
    if (commander !== undefined) incident.commander = commander;
    return incident;
  }

  mitigate(id: string): Incident | undefined {
    const incident = this.incidents.get(id);
    if (!incident) return undefined;
    incident.mitigatedAt = new Date().toISOString();
    incident.status = "mitigated";
    return incident;
  }

  resolve(id: string): Incident | undefined {
    const incident = this.incidents.get(id);
    if (!incident) return undefined;
    incident.resolvedAt = new Date().toISOString();
    incident.status = "resolved";

    const mttdMs = new Date(incident.detectedAt).getTime() - new Date(incident.occurredAt).getTime();
    const mttaMs = incident.acknowledgedAt
      ? new Date(incident.acknowledgedAt).getTime() - new Date(incident.detectedAt).getTime()
      : 0;
    const mttrMs = new Date(incident.resolvedAt).getTime() - new Date(incident.detectedAt).getTime();

    this.bus.publish("incident.resolved", {
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
      mttdMs,
      mttaMs,
      mttrMs,
    });
    return incident;
  }

  close(id: string): Incident | undefined {
    const incident = this.incidents.get(id);
    if (!incident) return undefined;
    incident.closedAt = new Date().toISOString();
    incident.status = "closed";
    return incident;
  }

  publishPostmortem(
    id: string,
    pm: Omit<Postmortem, "incidentId" | "publishedAt">,
  ): Postmortem | undefined {
    const incident = this.incidents.get(id);
    if (!incident) return undefined;
    const postmortem: Postmortem = {
      ...pm,
      incidentId: id,
      publishedAt: new Date().toISOString(),
    };
    incident.postmortem = postmortem;
    this.bus.publish("incident.postmortem_published", {
      incidentId: id,
      title: incident.title,
      actionItems: postmortem.actionItems,
    });
    return postmortem;
  }

  get(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  list(status?: IncidentStatus): Incident[] {
    const all = Array.from(this.incidents.values());
    return status ? all.filter((i) => i.status === status) : all;
  }

  openIncidents(): Incident[] {
    return Array.from(this.incidents.values()).filter((i) => OPEN_STATUSES.has(i.status));
  }

  metrics(): IncidentMetrics {
    const all = Array.from(this.incidents.values());
    const resolved = all.filter((i) => i.status === "resolved" || i.status === "closed");

    let totalMttd = 0;
    let totalMtta = 0;
    let totalMttr = 0;
    let mttaCount = 0;

    for (const inc of resolved) {
      totalMttd += new Date(inc.detectedAt).getTime() - new Date(inc.occurredAt).getTime();
      if (inc.acknowledgedAt) {
        totalMtta += new Date(inc.acknowledgedAt).getTime() - new Date(inc.detectedAt).getTime();
        mttaCount++;
      }
      if (inc.resolvedAt) {
        totalMttr += new Date(inc.resolvedAt).getTime() - new Date(inc.detectedAt).getTime();
      }
    }

    const n = resolved.length;
    const bySeverity: Record<IncidentSeverity, number> = { SEV1: 0, SEV2: 0, SEV3: 0, SEV4: 0 };
    for (const inc of all) bySeverity[inc.severity]++;

    return {
      mttdMs: n > 0 ? totalMttd / n : 0,
      mttaMs: mttaCount > 0 ? totalMtta / mttaCount : 0,
      mttrMs: n > 0 ? totalMttr / n : 0,
      totalIncidents: all.length,
      bySeverity,
      openIncidents: this.openIncidents().length,
    };
  }
}
