/**
 * Calibration Monitor — self-governing autonomy (BLUEPRINT §15.4, §19).
 *
 * Autonomy is earned, not granted once and forgotten. This monitor watches the
 * calibration flywheel: every time a decision's prediction is reconciled against
 * the actual outcome, it recomputes the domain's mean absolute error. When a
 * domain's predictions drift past a threshold, it auto-demotes every grant in
 * that domain to L0 — the system removes its own authority when it stops being
 * trustworthy, without waiting for a human.
 *
 * It reads from the memory store (MAE) and acts on the autonomy engine
 * (demote). Like everything else, the demotion is an event on the spine.
 */

import type { EventBus, BusEvent } from "../events/event-bus.js";
import type { MemoryStore } from "../memory/memory-store.js";
import type { AutonomyEngine } from "./autonomy-engine.js";
import type { Domain } from "../knowledge/graph/schema.js";

export interface CalibrationMonitorOptions {
  /** MAE above which a domain's grants are auto-demoted. Default 0.5. */
  maeThreshold?: number;
  /** Minimum calibration observations before drift can trigger demotion. Default 3. */
  minObservations?: number;
}

export class CalibrationMonitor {
  private readonly threshold: number;
  private readonly minObservations: number;
  private readonly observations = new Map<string, number>();
  private unsubscribe?: () => void;

  constructor(
    private readonly memory: MemoryStore,
    private readonly autonomy: AutonomyEngine,
    private readonly bus: EventBus,
    opts: CalibrationMonitorOptions = {},
  ) {
    this.threshold = opts.maeThreshold ?? 0.5;
    this.minObservations = opts.minObservations ?? 3;
  }

  /** Begin watching the calibration flywheel. */
  attach(): this {
    this.unsubscribe = this.bus.subscribe("memory.calibration.recorded", (e) => this.onCalibration(e));
    return this;
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private onCalibration(e: BusEvent): void {
    const { domain } = e.payload as { domain: Domain; absError: number };
    this.observations.set(domain, (this.observations.get(domain) ?? 0) + 1);

    // Don't act on a single noisy data point.
    if ((this.observations.get(domain) ?? 0) < this.minObservations) return;

    const mae = this.memory.maeByDomain()[domain];
    if (mae === undefined || mae <= this.threshold) return;

    // Drift detected: revoke autonomy in this domain until a human re-grants it.
    const demoted = this.autonomy
      .listGrants()
      .filter((g) => g.domain === domain && g.level > 0);
    for (const g of demoted) {
      this.autonomy.demote(g.domain, g.capability, `calibration drift: MAE ${mae.toFixed(2)} > ${this.threshold}`);
    }
    if (demoted.length > 0) {
      this.bus.publish("autonomy.calibration_demotion", { domain, mae: Number(mae.toFixed(3)), demoted: demoted.length });
    }
  }
}
