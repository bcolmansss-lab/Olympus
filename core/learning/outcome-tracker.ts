/**
 * OutcomeTracker — closes the decision learning loop.
 *
 * 1. recordPrediction(decisionId, domain, predictedValue, metadata?) — log what we expect.
 * 2. recordOutcome(decisionId, actualValue) — when reality is known, compute error
 *    and feed (predicted, actual) into the MemoryStore calibration flywheel for the domain.
 *
 * Emits:
 *   - "outcome.recorded": { decisionId, domain, predicted, actual, absError, signedError }
 *
 * The calibration feed lets the existing CalibrationMonitor auto-demote autonomy
 * when a domain's predictions drift — so this module literally drives governance.
 */

import type { EventBus } from "../events/event-bus.js";
import type { MemoryStore } from "../memory/memory-store.js";

export interface PredictionRecord {
  decisionId: string;
  domain: string;
  predicted: number;
  predictedAt: string;
  metadata?: Record<string, unknown>;
}

export interface OutcomeRecord {
  decisionId: string;
  domain: string;
  predicted: number;
  actual: number;
  absError: number;
  signedError: number; // actual - predicted
  recordedAt: string;
}

export class OutcomeTracker {
  private readonly predictions = new Map<string, PredictionRecord>();
  private readonly outcomes: OutcomeRecord[] = [];

  constructor(
    private readonly bus: EventBus,
    private readonly memory: MemoryStore,
  ) {}

  recordPrediction(
    decisionId: string,
    domain: string,
    predicted: number,
    metadata?: Record<string, unknown>,
  ): PredictionRecord {
    const record: PredictionRecord = {
      decisionId,
      domain,
      predicted,
      predictedAt: new Date().toISOString(),
      metadata,
    };
    this.predictions.set(decisionId, record);
    return record;
  }

  /**
   * Record the realized outcome for a previously-predicted decision.
   * Returns undefined if no prediction was logged for that decisionId.
   * Feeds (predicted, actual) into the calibration flywheel.
   */
  recordOutcome(decisionId: string, actual: number): OutcomeRecord | undefined {
    const prediction = this.predictions.get(decisionId);
    if (!prediction) return undefined;

    const signedError = actual - prediction.predicted;
    const absError = Math.abs(signedError);

    const outcome: OutcomeRecord = {
      decisionId,
      domain: prediction.domain,
      predicted: prediction.predicted,
      actual,
      absError,
      signedError,
      recordedAt: new Date().toISOString(),
    };
    this.outcomes.push(outcome);

    // Feed the calibration flywheel. MemoryStore.recordCalibration takes a single
    // record object and publishes "memory.calibration.recorded", which the
    // CalibrationMonitor subscribes to. `error` is the signed (actual - predicted)
    // residual; the store derives absError itself.
    const metric = typeof prediction.metadata?.["metric"] === "string"
      ? (prediction.metadata["metric"] as string)
      : "outcome";
    this.memory.recordCalibration({
      decisionId: prediction.decisionId,
      domain: prediction.domain,
      predictedMetric: metric,
      predicted: prediction.predicted,
      actual,
      error: signedError,
    });

    this.bus.publish("outcome.recorded", {
      decisionId,
      domain: prediction.domain,
      predicted: prediction.predicted,
      actual,
      absError,
      signedError,
    });

    return outcome;
  }

  getPrediction(decisionId: string): PredictionRecord | undefined {
    return this.predictions.get(decisionId);
  }

  outcomesForDomain(domain: string): OutcomeRecord[] {
    return this.outcomes.filter((o) => o.domain === domain);
  }

  allOutcomes(): OutcomeRecord[] {
    return [...this.outcomes];
  }

  /** Mean absolute error across all recorded outcomes (or a domain). */
  meanAbsError(domain?: string): number {
    const set = domain ? this.outcomesForDomain(domain) : this.outcomes;
    if (set.length === 0) return 0;
    return set.reduce((s, o) => s + o.absError, 0) / set.length;
  }

  pendingPredictions(): PredictionRecord[] {
    const resolved = new Set(this.outcomes.map((o) => o.decisionId));
    return [...this.predictions.values()].filter((p) => !resolved.has(p.decisionId));
  }
}
