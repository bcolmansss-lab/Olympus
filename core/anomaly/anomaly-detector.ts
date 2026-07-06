/**
 * AnomalyDetector — watches the event spine for metric observations and raises
 * Risk nodes in the OKG when a value deviates beyond a configurable Z-score
 * threshold from its rolling baseline.
 *
 * Algorithm: online Welford mean/variance for each metric key.
 * Default threshold: |z| > 3.0 (3-sigma rule).
 * Minimum observations before alerting: 5.
 *
 * Events consumed: "metric.observed" — payload { key: string; value: number; domain?: string }
 * Risk node raised: type "Risk", id "anomaly:<key>:<timestamp>", label "Anomaly: <key>",
 *   properties: { zScore, mean, stddev, observedValue, domain }
 * Event emitted: "anomaly.detected" — payload { key, value, zScore, mean, stddev, riskNodeId }
 */

import type { EventBus } from "../events/event-bus.js";
import type { OKG } from "../knowledge/graph/okg.js";

export interface AnomalyDetectorOptions {
  /** Z-score threshold for alerting. Default 3.0. */
  zThreshold?: number;
  /** Minimum observations before alerting. Default 5. */
  minObservations?: number;
}

interface WelfordState {
  n: number;
  mean: number;
  M2: number; // sum of squared deviations from mean
}

export class AnomalyDetector {
  private readonly zThreshold: number;
  private readonly minObservations: number;
  private readonly state = new Map<string, WelfordState>();
  private unsubscribe?: () => void;

  constructor(
    private readonly bus: EventBus,
    private readonly okg: OKG,
    opts?: AnomalyDetectorOptions
  ) {
    this.zThreshold = opts?.zThreshold ?? 3.0;
    this.minObservations = opts?.minObservations ?? 5;
  }

  attach(): this {
    const sub = this.bus.subscribe("metric.observed", (event) => {
      const { key, value, domain } = event.payload as {
        key: string;
        value: number;
        domain?: string;
      };
      this.observe(key, value, domain);
    });
    this.unsubscribe = sub;
    return this;
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /**
   * Record an observation and check for anomaly.
   * Returns the z-score if an anomaly was raised, undefined otherwise.
   */
  observe(key: string, value: number, domain?: string): number | undefined {
    let s = this.state.get(key);
    if (!s) {
      s = { n: 0, mean: 0, M2: 0 };
      this.state.set(key, s);
    }

    // Welford online update
    s.n++;
    const delta = value - s.mean;
    s.mean += delta / s.n;
    const delta2 = value - s.mean;
    s.M2 += delta * delta2;

    if (s.n < this.minObservations) return undefined;

    const variance = s.M2 / (s.n - 1);
    const stddev = Math.sqrt(variance);
    if (stddev === 0) return undefined;

    const zScore = (value - s.mean) / stddev;
    if (Math.abs(zScore) < this.zThreshold) return undefined;

    // Raise a Risk node in the OKG
    const ts = new Date().toISOString();
    const node = this.okg.addNode({
      type: "Risk",
      validFrom: ts,
      props: {
        label: `Anomaly: ${key}`,
        zScore,
        mean: s.mean,
        stddev,
        observedValue: value,
        ...(domain ? { domain } : {}),
      },
      createdBy: "anomaly-detector",
      provenance: [],
    });
    const riskNodeId = node.id;

    this.bus.publish("anomaly.detected", {
      key,
      value,
      zScore,
      mean: s.mean,
      stddev,
      riskNodeId,
      ...(domain ? { domain } : {}),
    });

    return zScore;
  }

  /** Return current Welford state for a metric key (for testing). */
  getState(key: string): WelfordState | undefined {
    return this.state.get(key);
  }
}
