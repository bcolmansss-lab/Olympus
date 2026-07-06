/**
 * AlertRoutingManager — alert ingestion with dedup, severity-based routing to
 * teams/channels, grouping, and acknowledgement/resolution tracking.
 *
 * Events:
 *   - "alertrouting.fired": { alertId, severity, routedTo }
 *   - "alertrouting.deduped": { fingerprint, count }
 *   - "alertrouting.resolved": { alertId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AlertSeverity = "info" | "warning" | "error" | "critical";
export type AlertState = "firing" | "acknowledged" | "resolved";

export interface RoutingRule {
  id: string;
  severity: AlertSeverity;
  routeTo: string; // team/channel
}

export interface Alert {
  id: string;
  fingerprint: string;
  title: string;
  severity: AlertSeverity;
  source: string;
  state: AlertState;
  routedTo?: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
}

export interface AlertRoutingSummary {
  totalAlerts: number;
  firing: number;
  acknowledged: number;
  resolved: number;
  bySeverity: Partial<Record<AlertSeverity, number>>;
  dedupedTotal: number;
}

export class AlertRoutingManager {
  private rules: Map<AlertSeverity, string> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private byFingerprint: Map<string, string> = new Map();
  private dedupedTotal = 0;

  constructor(private readonly bus: EventBus) {}

  setRoute(severity: AlertSeverity, routeTo: string): void {
    this.rules.set(severity, routeTo);
  }

  /** Ingest an alert; dedups on fingerprint (increments occurrence and refreshes). */
  ingest(input: { fingerprint: string; title: string; severity: AlertSeverity; source: string; at: string }): Alert {
    const existingId = this.byFingerprint.get(input.fingerprint);
    if (existingId) {
      const existing = this.alerts.get(existingId)!;
      if (existing.state !== "resolved") {
        existing.occurrences += 1;
        existing.lastSeenAt = input.at;
        this.dedupedTotal += 1;
        this.bus.publish("alertrouting.deduped", { fingerprint: input.fingerprint, count: existing.occurrences });
        return existing;
      }
    }
    const routedTo = this.rules.get(input.severity);
    const alert: Alert = {
      id: randomUUID(),
      fingerprint: input.fingerprint,
      title: input.title,
      severity: input.severity,
      source: input.source,
      state: "firing",
      routedTo,
      occurrences: 1,
      firstSeenAt: input.at,
      lastSeenAt: input.at,
    };
    this.alerts.set(alert.id, alert);
    this.byFingerprint.set(input.fingerprint, alert.id);
    this.bus.publish("alertrouting.fired", { alertId: alert.id, severity: alert.severity, routedTo });
    return alert;
  }

  acknowledge(alertId: string): Alert | undefined {
    const a = this.alerts.get(alertId);
    if (!a || a.state !== "firing") return undefined;
    a.state = "acknowledged";
    return a;
  }

  resolve(alertId: string, asOf: string): Alert | undefined {
    const a = this.alerts.get(alertId);
    if (!a || a.state === "resolved") return undefined;
    a.state = "resolved";
    a.resolvedAt = asOf;
    this.bus.publish("alertrouting.resolved", { alertId });
    return a;
  }

  getAlert(id: string): Alert | undefined { return this.alerts.get(id); }
  listAlerts(state?: AlertState, severity?: AlertSeverity): Alert[] {
    let all = Array.from(this.alerts.values());
    if (state) all = all.filter(a => a.state === state);
    if (severity) all = all.filter(a => a.severity === severity);
    return all;
  }

  summary(): AlertRoutingSummary {
    const alerts = Array.from(this.alerts.values());
    const bySeverity: Partial<Record<AlertSeverity, number>> = {};
    for (const a of alerts) { bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1; }
    return {
      totalAlerts: alerts.length,
      firing: alerts.filter(a => a.state === "firing").length,
      acknowledged: alerts.filter(a => a.state === "acknowledged").length,
      resolved: alerts.filter(a => a.state === "resolved").length,
      bySeverity,
      dedupedTotal: this.dedupedTotal,
    };
  }
}
