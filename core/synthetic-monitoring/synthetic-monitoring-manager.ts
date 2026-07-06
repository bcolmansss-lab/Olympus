/**
 * SyntheticMonitoringManager — synthetic uptime probes: check definitions per
 * endpoint with expected latency, probe-result recording, consecutive-failure
 * alerting, recovery detection, and per-check availability reporting.
 *
 * Events:
 *   - "synthetic.check_failing": { checkId, consecutiveFailures }
 *   - "synthetic.check_recovered": { checkId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface SyntheticCheck {
  id: string;
  name: string;
  url: string;
  maxLatencyMs: number;
  consecutiveFailures: number;
  alerting: boolean;
}

export interface ProbeResult {
  checkId: string;
  ok: boolean;
  latencyMs: number;
  probedAt: string;
}

export interface SyntheticMonitoringSummary {
  totalChecks: number;
  alertingChecks: number;
  totalProbes: number;
  overallAvailabilityPct: number;
}

export class SyntheticMonitoringManager {
  private checks: Map<string, SyntheticCheck> = new Map();
  private results: ProbeResult[] = [];
  private failureThreshold: number;

  constructor(private readonly bus: EventBus, failureThreshold = 3) {
    this.failureThreshold = failureThreshold;
  }

  defineCheck(name: string, url: string, maxLatencyMs = 1000): SyntheticCheck {
    const check: SyntheticCheck = { id: randomUUID(), name, url, maxLatencyMs, consecutiveFailures: 0, alerting: false };
    this.checks.set(check.id, check);
    return check;
  }

  /**
   * Record a probe; success requires up=true and latency within budget.
   * Crossing the consecutive-failure threshold raises an alert; a success
   * while alerting publishes recovery.
   */
  recordProbe(checkId: string, up: boolean, latencyMs: number, probedAt: string): ProbeResult | undefined {
    const check = this.checks.get(checkId);
    if (!check) return undefined;
    const ok = up && latencyMs <= check.maxLatencyMs;
    const result: ProbeResult = { checkId, ok, latencyMs, probedAt };
    this.results.push(result);
    if (ok) {
      check.consecutiveFailures = 0;
      if (check.alerting) {
        check.alerting = false;
        this.bus.publish("synthetic.check_recovered", { checkId });
      }
    } else {
      check.consecutiveFailures += 1;
      if (check.consecutiveFailures >= this.failureThreshold && !check.alerting) {
        check.alerting = true;
        this.bus.publish("synthetic.check_failing", { checkId, consecutiveFailures: check.consecutiveFailures });
      }
    }
    return result;
  }

  availabilityPct(checkId: string): number {
    const probes = this.results.filter(r => r.checkId === checkId);
    if (probes.length === 0) return 100;
    return Math.round((probes.filter(r => r.ok).length / probes.length) * 10000) / 100;
  }

  getCheck(id: string): SyntheticCheck | undefined { return this.checks.get(id); }
  listChecks(alertingOnly = false): SyntheticCheck[] {
    const all = Array.from(this.checks.values());
    return alertingOnly ? all.filter(c => c.alerting) : all;
  }

  summary(): SyntheticMonitoringSummary {
    const checks = Array.from(this.checks.values());
    const okCount = this.results.filter(r => r.ok).length;
    return {
      totalChecks: checks.length,
      alertingChecks: checks.filter(c => c.alerting).length,
      totalProbes: this.results.length,
      overallAvailabilityPct: this.results.length > 0 ? Math.round((okCount / this.results.length) * 10000) / 100 : 100,
    };
  }
}
