/**
 * KPIDashboard — KPI definition, target tracking, threshold alerting,
 * dashboard composition, and trend analysis.
 *
 * Events:
 *   - "kpi.threshold_breached": { kpiId, name, value, threshold, direction }
 *   - "kpi.target_achieved": { kpiId, name, value, target }
 *   - "kpi.snapshot_recorded": { kpiId, name, value, timestamp }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type KPIDirection = "higher_is_better" | "lower_is_better";
export type KPIFrequency = "realtime" | "daily" | "weekly" | "monthly";

export interface KPIDefinition {
  id: string;
  name: string;
  description: string;
  unit: string; // e.g. "USD", "%", "count"
  direction: KPIDirection;
  frequency: KPIFrequency;
  target: number;
  warningThreshold: number;
  criticalThreshold: number;
  ownerId: string;
  createdAt: string;
}

export interface KPISnapshot {
  id: string;
  kpiId: string;
  value: number;
  timestamp: string;
  note?: string;
}

export interface KPIDashboardConfig {
  id: string;
  name: string;
  kpiIds: string[];
  ownerId: string;
  createdAt: string;
}

export interface KPISummary {
  totalKPIs: number;
  onTarget: number;
  atRisk: number;
  critical: number;
  totalSnapshots: number;
}

export class KPIDashboard {
  private kpis: Map<string, KPIDefinition> = new Map();
  private snapshots: Map<string, KPISnapshot> = new Map();
  private dashboards: Map<string, KPIDashboardConfig> = new Map();

  constructor(private readonly bus: EventBus) {}

  defineKPI(input: Omit<KPIDefinition, "id" | "createdAt"> & { id?: string }): KPIDefinition {
    const kpi: KPIDefinition = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.kpis.set(kpi.id, kpi);
    return kpi;
  }

  recordSnapshot(kpiId: string, value: number, note?: string): KPISnapshot | undefined {
    const kpi = this.kpis.get(kpiId);
    if (!kpi) return undefined;
    const snapshot: KPISnapshot = { id: randomUUID(), kpiId, value, timestamp: new Date().toISOString(), note };
    this.snapshots.set(snapshot.id, snapshot);
    this.bus.publish("kpi.snapshot_recorded", { kpiId, name: kpi.name, value, timestamp: snapshot.timestamp });

    // Check thresholds
    const breached = kpi.direction === "higher_is_better"
      ? value < kpi.criticalThreshold
      : value > kpi.criticalThreshold;
    if (breached) {
      this.bus.publish("kpi.threshold_breached", { kpiId, name: kpi.name, value, threshold: kpi.criticalThreshold, direction: kpi.direction });
    }

    // Check target
    const achieved = kpi.direction === "higher_is_better" ? value >= kpi.target : value <= kpi.target;
    if (achieved) {
      this.bus.publish("kpi.target_achieved", { kpiId, name: kpi.name, value, target: kpi.target });
    }
    return snapshot;
  }

  createDashboard(input: Omit<KPIDashboardConfig, "id" | "createdAt"> & { id?: string }): KPIDashboardConfig {
    const dashboard: KPIDashboardConfig = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.dashboards.set(dashboard.id, dashboard);
    return dashboard;
  }

  getKPI(id: string): KPIDefinition | undefined { return this.kpis.get(id); }
  listKPIs(): KPIDefinition[] { return Array.from(this.kpis.values()); }
  listSnapshots(kpiId?: string): KPISnapshot[] {
    const all = Array.from(this.snapshots.values());
    return kpiId ? all.filter(s => s.kpiId === kpiId) : all;
  }
  listDashboards(): KPIDashboardConfig[] { return Array.from(this.dashboards.values()); }

  latestValue(kpiId: string): number | undefined {
    const snaps = this.listSnapshots(kpiId).sort((a, b) => a.timestamp < b.timestamp ? 1 : -1);
    return snaps[0]?.value;
  }

  summary(): KPISummary {
    const kpis = Array.from(this.kpis.values());
    let onTarget = 0, atRisk = 0, critical = 0;
    for (const kpi of kpis) {
      const latest = this.latestValue(kpi.id);
      if (latest === undefined) continue;
      const metTarget = kpi.direction === "higher_is_better" ? latest >= kpi.target : latest <= kpi.target;
      const isCritical = kpi.direction === "higher_is_better" ? latest < kpi.criticalThreshold : latest > kpi.criticalThreshold;
      const isWarning = !metTarget && !isCritical;
      if (metTarget) onTarget++;
      else if (isCritical) critical++;
      else if (isWarning) atRisk++;
    }
    return { totalKPIs: kpis.length, onTarget, atRisk, critical, totalSnapshots: this.snapshots.size };
  }
}
