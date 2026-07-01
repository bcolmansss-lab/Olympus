/**
 * SLOManager — service level objectives with error budgets: per-service SLO
 * targets, good/bad event ingestion, error-budget burn tracking, and budget
 * exhaustion alerts.
 *
 * Events:
 *   - "slo.created": { sloId, service, targetPct }
 *   - "slo.budget_burn": { sloId, service, budgetRemainingPct }
 *   - "slo.breached": { sloId, service, currentPct, targetPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SLOWindow = "7d" | "30d" | "90d";

export interface SLO {
  id: string;
  service: string;
  indicator: string; // e.g. "availability", "latency<200ms"
  targetPct: number; // e.g. 99.9
  window: SLOWindow;
  goodEvents: number;
  totalEvents: number;
  breachAlerted: boolean;
  createdAt: string;
}

export interface SLOSummary {
  totalSLOs: number;
  breached: number;
  atRisk: number; // budget < 25%
  avgAttainmentPct: number;
  byWindow: Partial<Record<SLOWindow, number>>;
}

export class SLOManager {
  private slos: Map<string, SLO> = new Map();
  private atRiskThresholdPct: number;

  constructor(private readonly bus: EventBus, atRiskThresholdPct = 25) {
    this.atRiskThresholdPct = atRiskThresholdPct;
  }

  create(input: { service: string; indicator: string; targetPct: number; window: SLOWindow }): SLO {
    const slo: SLO = { ...input, id: randomUUID(), goodEvents: 0, totalEvents: 0, breachAlerted: false, createdAt: new Date().toISOString() };
    this.slos.set(slo.id, slo);
    this.bus.publish("slo.created", { sloId: slo.id, service: slo.service, targetPct: slo.targetPct });
    return slo;
  }

  record(sloId: string, good: number, bad: number): SLO | undefined {
    const slo = this.slos.get(sloId);
    if (!slo || good < 0 || bad < 0) return undefined;
    slo.goodEvents += good;
    slo.totalEvents += good + bad;
    const budgetRemaining = this.errorBudgetRemainingPct(sloId);
    this.bus.publish("slo.budget_burn", { sloId, service: slo.service, budgetRemainingPct: budgetRemaining });
    if (this.attainmentPct(sloId) < slo.targetPct && !slo.breachAlerted) {
      slo.breachAlerted = true;
      this.bus.publish("slo.breached", { sloId, service: slo.service, currentPct: this.attainmentPct(sloId), targetPct: slo.targetPct });
    }
    return slo;
  }

  attainmentPct(sloId: string): number {
    const slo = this.slos.get(sloId);
    if (!slo || slo.totalEvents === 0) return 100;
    return Math.round((slo.goodEvents / slo.totalEvents) * 10000) / 100;
  }

  /** Remaining error budget as a percentage of the allowed error budget. */
  errorBudgetRemainingPct(sloId: string): number {
    const slo = this.slos.get(sloId);
    if (!slo || slo.totalEvents === 0) return 100;
    const allowedErrorRate = (100 - slo.targetPct) / 100;
    const budgetErrors = allowedErrorRate * slo.totalEvents;
    const actualErrors = slo.totalEvents - slo.goodEvents;
    if (budgetErrors === 0) return actualErrors > 0 ? 0 : 100;
    return Math.max(0, Math.round(((budgetErrors - actualErrors) / budgetErrors) * 100));
  }

  resetWindow(sloId: string): SLO | undefined {
    const slo = this.slos.get(sloId);
    if (!slo) return undefined;
    slo.goodEvents = 0;
    slo.totalEvents = 0;
    slo.breachAlerted = false;
    return slo;
  }

  getSLO(id: string): SLO | undefined { return this.slos.get(id); }
  listSLOs(service?: string): SLO[] {
    const all = Array.from(this.slos.values());
    return service ? all.filter(s => s.service === service) : all;
  }

  summary(): SLOSummary {
    const slos = Array.from(this.slos.values());
    const byWindow: Partial<Record<SLOWindow, number>> = {};
    for (const s of slos) { byWindow[s.window] = (byWindow[s.window] ?? 0) + 1; }
    const attainments = slos.map(s => this.attainmentPct(s.id));
    return {
      totalSLOs: slos.length,
      breached: slos.filter(s => this.attainmentPct(s.id) < s.targetPct).length,
      atRisk: slos.filter(s => this.errorBudgetRemainingPct(s.id) < this.atRiskThresholdPct).length,
      avgAttainmentPct: attainments.length > 0 ? Math.round((attainments.reduce((a, b) => a + b, 0) / attainments.length) * 100) / 100 : 100,
      byWindow,
    };
  }
}
