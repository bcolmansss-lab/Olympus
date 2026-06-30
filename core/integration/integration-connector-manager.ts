/**
 * IntegrationConnectorManager — third-party integration connectors: connection
 * lifecycle, scheduled sync runs with success/failure, auth-expiry detection,
 * and health scoring.
 *
 * Events:
 *   - "integration.connected": { connectorId, provider }
 *   - "integration.sync_failed": { connectorId, error, consecutiveFailures }
 *   - "integration.disabled": { connectorId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ConnectorStatus = "connected" | "degraded" | "disconnected" | "auth_expired";
export type SyncResult = "success" | "failure";

export interface SyncRun {
  id: string;
  result: SyncResult;
  recordsSynced: number;
  error?: string;
  at: string;
}

export interface Connector {
  id: string;
  provider: string;
  status: ConnectorStatus;
  syncs: SyncRun[];
  consecutiveFailures: number;
  authExpiresAt?: string;
  connectedAt: string;
}

export interface IntegrationSummary {
  totalConnectors: number;
  connected: number;
  degraded: number;
  disconnected: number;
  totalSyncs: number;
  failedSyncs: number;
  syncSuccessRatePct: number;
}

export class IntegrationConnectorManager {
  private connectors: Map<string, Connector> = new Map();
  private failureThreshold: number;

  constructor(private readonly bus: EventBus, failureThreshold = 3) {
    this.failureThreshold = failureThreshold;
  }

  connect(provider: string, authExpiresAt?: string): Connector {
    const connector: Connector = { id: randomUUID(), provider, status: "connected", syncs: [], consecutiveFailures: 0, authExpiresAt, connectedAt: new Date().toISOString() };
    this.connectors.set(connector.id, connector);
    this.bus.publish("integration.connected", { connectorId: connector.id, provider });
    return connector;
  }

  recordSync(connectorId: string, result: SyncResult, recordsSynced: number, at: string, error?: string): SyncRun | undefined {
    const connector = this.connectors.get(connectorId);
    if (!connector || connector.status === "disconnected") return undefined;
    const run: SyncRun = { id: randomUUID(), result, recordsSynced, error, at };
    connector.syncs.push(run);
    if (result === "failure") {
      connector.consecutiveFailures += 1;
      this.bus.publish("integration.sync_failed", { connectorId, error: error ?? "unknown", consecutiveFailures: connector.consecutiveFailures });
      if (connector.consecutiveFailures >= this.failureThreshold) {
        connector.status = "disconnected";
        this.bus.publish("integration.disabled", { connectorId, reason: "consecutive_failures" });
      } else if (connector.status === "connected") {
        connector.status = "degraded";
      }
    } else {
      connector.consecutiveFailures = 0;
      if (connector.status === "degraded") connector.status = "connected";
    }
    return run;
  }

  checkAuthExpiry(asOf: string): Connector[] {
    const cutoff = new Date(asOf).getTime();
    const expired = Array.from(this.connectors.values()).filter(c => c.status !== "disconnected" && c.authExpiresAt && new Date(c.authExpiresAt).getTime() < cutoff);
    for (const c of expired) {
      c.status = "auth_expired";
      this.bus.publish("integration.disabled", { connectorId: c.id, reason: "auth_expired" });
    }
    return expired;
  }

  reconnect(connectorId: string, authExpiresAt?: string): Connector | undefined {
    const connector = this.connectors.get(connectorId);
    if (!connector) return undefined;
    connector.status = "connected";
    connector.consecutiveFailures = 0;
    connector.authExpiresAt = authExpiresAt;
    return connector;
  }

  healthScore(connectorId: string): number {
    const connector = this.connectors.get(connectorId);
    if (!connector || connector.syncs.length === 0) return connector?.status === "connected" ? 100 : 0;
    const recent = connector.syncs.slice(-10);
    const successes = recent.filter(s => s.result === "success").length;
    return Math.round((successes / recent.length) * 100);
  }

  getConnector(id: string): Connector | undefined { return this.connectors.get(id); }
  listConnectors(status?: ConnectorStatus): Connector[] {
    const all = Array.from(this.connectors.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): IntegrationSummary {
    const connectors = Array.from(this.connectors.values());
    const syncs = connectors.flatMap(c => c.syncs);
    const failed = syncs.filter(s => s.result === "failure").length;
    return {
      totalConnectors: connectors.length,
      connected: connectors.filter(c => c.status === "connected").length,
      degraded: connectors.filter(c => c.status === "degraded").length,
      disconnected: connectors.filter(c => c.status === "disconnected" || c.status === "auth_expired").length,
      totalSyncs: syncs.length,
      failedSyncs: failed,
      syncSuccessRatePct: syncs.length > 0 ? Math.round(((syncs.length - failed) / syncs.length) * 100) : 0,
    };
  }
}
