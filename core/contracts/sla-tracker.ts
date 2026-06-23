/**
 * SLATracker — models service level agreements and detects breaches.
 *
 * An SLA defines a metric commitment (e.g. uptime >= 99.9%, p99 latency <= 200ms).
 * Measurements are recorded and compared against the commitment.
 * A breach occurs when measurement violates the threshold.
 *
 * Events:
 *   - "sla.measurement_recorded": { slaId, metric, value, timestamp }
 *   - "sla.breached": { slaId, contractName, metric, threshold, direction, actualValue, penaltyUsd }
 *
 * Direction: "above" means value must be >= threshold (uptime). "below" means value must be <= threshold (latency).
 */

import type { EventBus } from "../events/event-bus.js";

export type SLADirection = "above" | "below";
export type SLAStatus = "healthy" | "at-risk" | "breached" | "unknown";

export interface SLADefinition {
  id: string;
  contractName: string;
  metric: string;
  /** The threshold value. */
  threshold: number;
  /** "above" = value must be >= threshold. "below" = value must be <= threshold. */
  direction: SLADirection;
  /** Financial penalty in USD per breach event. 0 if no penalty. */
  penaltyUsd: number;
  /** At-risk zone: within this % of threshold (e.g. 5 = within 5% of threshold). */
  atRiskPct?: number;
}

export interface SLAMeasurement {
  slaId: string;
  value: number;
  timestamp: string; // ISO
}

export interface SLAState {
  definition: SLADefinition;
  measurements: SLAMeasurement[];
  status: SLAStatus;
  lastValue?: number;
  lastTimestamp?: string;
  breachCount: number;
  totalPenaltyUsd: number;
}

export class SLATracker {
  private readonly slas = new Map<string, SLAState>();

  constructor(private readonly bus: EventBus) {}

  register(def: SLADefinition): this {
    this.slas.set(def.id, {
      definition: def,
      measurements: [],
      status: "unknown",
      breachCount: 0,
      totalPenaltyUsd: 0,
    });
    return this;
  }

  /**
   * Record a measurement for an SLA. Checks for breach and updates status.
   * Returns the updated SLAState.
   */
  record(slaId: string, value: number, timestamp?: string): SLAState | undefined {
    const state = this.slas.get(slaId);
    if (!state) return undefined;

    const ts = timestamp ?? new Date().toISOString();
    const measurement: SLAMeasurement = { slaId, value, timestamp: ts };
    state.measurements.push(measurement);
    state.lastValue = value;
    state.lastTimestamp = ts;

    const { threshold, direction, penaltyUsd, atRiskPct } = state.definition;
    const isBreached =
      direction === "above" ? value < threshold : value > threshold;

    if (isBreached) {
      state.status = "breached";
      state.breachCount++;
      state.totalPenaltyUsd += penaltyUsd;
      this.bus.publish("sla.breached", {
        slaId,
        contractName: state.definition.contractName,
        metric: state.definition.metric,
        threshold,
        direction,
        actualValue: value,
        penaltyUsd,
      });
    } else {
      // Check at-risk zone
      const riskPct = atRiskPct ?? 5;
      const riskZone = threshold * (riskPct / 100);
      const nearBreach =
        direction === "above"
          ? value < threshold + riskZone
          : value > threshold - riskZone;
      state.status = nearBreach ? "at-risk" : "healthy";
    }

    this.bus.publish("sla.measurement_recorded", {
      slaId,
      metric: state.definition.metric,
      value,
      timestamp: ts,
    });

    return state;
  }

  get(slaId: string): SLAState | undefined {
    return this.slas.get(slaId);
  }

  list(): SLAState[] {
    return [...this.slas.values()];
  }

  /** Return all SLAs with status "breached" or "at-risk". */
  atRisk(): SLAState[] {
    return this.list().filter(
      (s) => s.status === "breached" || s.status === "at-risk"
    );
  }

  /** Total accumulated penalties across all SLAs. */
  totalPenalties(): number {
    return this.list().reduce((sum, s) => sum + s.totalPenaltyUsd, 0);
  }
}
