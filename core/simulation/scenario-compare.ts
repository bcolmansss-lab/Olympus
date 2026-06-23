/**
 * compareScenarios — runs two DigitalTwin simulations and produces a
 * structured comparison: per-metric winner, delta, and a composite score.
 */

import type { DigitalTwin } from "./digital-twin.js";

export interface ScenarioSpec {
  label: string;
  intervention: { variable: string; delta: number };
  seed?: number;
}

export interface MetricComparison {
  metric: string;
  a: { p10: number; p50: number; p90: number };
  b: { p10: number; p50: number; p90: number };
  /** Which scenario wins on p50. "tie" if within 0.1% relative difference. */
  winner: "a" | "b" | "tie";
  /** (b.p50 - a.p50) / |a.p50|, or 0 if a.p50 === 0 */
  relativeDelta: number;
}

export interface ComparisonResult {
  a: ScenarioSpec;
  b: ScenarioSpec;
  metrics: MetricComparison[];
  /** Scenario with more metric wins. "tie" if equal. */
  overallWinner: "a" | "b" | "tie";
  /** ISO timestamp */
  comparedAt: string;
}

export function compareScenarios(
  twin: DigitalTwin,
  a: ScenarioSpec,
  b: ScenarioSpec,
): ComparisonResult {
  const resultA = twin.run({
    type: "causal_intervention",
    intervention: a.intervention,
    seed: a.seed ?? 1,
  });
  const resultB = twin.run({
    type: "causal_intervention",
    intervention: b.intervention,
    seed: b.seed ?? 2,
  });

  // Both results share the same metric name (single outcome from the SCM).
  // Build a single MetricComparison for that outcome metric.
  const aVals = { p10: resultA.distribution.p10, p50: resultA.distribution.p50, p90: resultA.distribution.p90 };
  const bVals = { p10: resultB.distribution.p10, p50: resultB.distribution.p50, p90: resultB.distribution.p90 };

  const relativeDelta = aVals.p50 !== 0
    ? (bVals.p50 - aVals.p50) / Math.abs(aVals.p50)
    : 0;

  const winner: "a" | "b" | "tie" =
    Math.abs(relativeDelta) < 0.001
      ? "tie"
      : aVals.p50 > bVals.p50
        ? "a"
        : "b";

  const metrics: MetricComparison[] = [
    {
      metric: resultA.metric,
      a: aVals,
      b: bVals,
      winner,
      relativeDelta,
    },
  ];

  let aWins = 0;
  let bWins = 0;
  for (const m of metrics) {
    if (m.winner === "a") aWins++;
    else if (m.winner === "b") bWins++;
  }

  return {
    a,
    b,
    metrics,
    overallWinner: aWins > bWins ? "a" : bWins > aWins ? "b" : "tie",
    comparedAt: new Date().toISOString(),
  };
}
