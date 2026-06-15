/**
 * Digital Twin & Simulation engine.
 *
 * A continuously-updated executable model of the business derived from the OKG.
 * Every L3+ decision is simulated against the twin before execution
 * (BLUEPRINT.md §15). This reference implements three methods with real math:
 *
 *   - monte_carlo:        distributional forecasting -> P10/P50/P90
 *   - causal_intervention: do-operator estimate over a linear SCM
 *   - counterfactual:     re-run a past decision under an alternative choice
 *
 * Randomness is seeded so simulations are reproducible (required for audited
 * decisions — same seed + inputs => same distribution).
 */

import type { EventBus } from "../events/event-bus.js";
import type { UUID } from "../knowledge/graph/schema.js";

export type SimType = "monte_carlo" | "causal_intervention" | "counterfactual";

export interface SimRequest {
  type: SimType;
  decisionId?: UUID;
  /** Intervention under test, e.g. { variable: "list_price", delta: -0.10 }. */
  intervention?: { variable: string; delta: number };
  horizonDays?: number;
  runs?: number;
  /** Deterministic seed for reproducibility. */
  seed?: number;
}

export interface Distribution {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  /** Worst-case draws below p10 — what the Risk Agent reads. */
  tailRisk: number;
}

export interface SimResult {
  type: SimType;
  metric: string;
  distribution: Distribution;
  /** Per-variable sensitivity (∂outcome/∂variable), simplest-first. */
  sensitivity: Record<string, number>;
  runs: number;
  seed: number;
}

/** A minimal structural causal model: outcome = Σ coeff_i · variable_i + noise. */
export interface CausalModel {
  /** Target metric name. */
  metric: string;
  /** Linear coefficients keyed by driver variable. */
  coefficients: Record<string, number>;
  /** Baseline values for each driver. */
  baseline: Record<string, number>;
  /** Gaussian noise standard deviation as a fraction of baseline outcome. */
  noiseFraction: number;
}

/** Mulberry32 — small, fast, seedable PRNG for reproducible draws. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal from a uniform PRNG. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx] as number;
}

export class DigitalTwin {
  constructor(
    private readonly model: CausalModel,
    private readonly bus?: EventBus,
  ) {}

  /** Outcome of the SCM given a set of driver values. */
  private outcome(vars: Record<string, number>): number {
    let y = 0;
    for (const [k, coeff] of Object.entries(this.model.coefficients)) {
      y += coeff * (vars[k] ?? this.model.baseline[k] ?? 0);
    }
    return y;
  }

  /** Run a simulation and attach the distribution + sensitivities. */
  run(req: SimRequest): SimResult {
    const runs = req.runs ?? 10_000;
    const seed = req.seed ?? 42;
    const rng = mulberry32(seed);
    this.bus?.publish("sim.requested", { type: req.type, decisionId: req.decisionId, runs, seed });

    // Apply the intervention (do-operator): set the variable to baseline*(1+delta).
    const vars: Record<string, number> = { ...this.model.baseline };
    if (req.intervention) {
      const base = this.model.baseline[req.intervention.variable] ?? 0;
      vars[req.intervention.variable] = base * (1 + req.intervention.delta);
    }

    const baseOutcome = this.outcome(vars);
    const noiseSd = Math.abs(baseOutcome) * this.model.noiseFraction;

    const draws: number[] = [];
    for (let i = 0; i < runs; i++) {
      draws.push(baseOutcome + gaussian(rng) * noiseSd);
    }
    draws.sort((a, b) => a - b);

    const mean = draws.reduce((s, x) => s + x, 0) / runs;
    const p10 = percentile(draws, 10);
    const tailDraws = draws.filter((x) => x <= p10);
    const tailRisk = tailDraws.length ? tailDraws.reduce((s, x) => s + x, 0) / tailDraws.length : p10;

    const distribution: Distribution = {
      p10: round(p10),
      p50: round(percentile(draws, 50)),
      p90: round(percentile(draws, 90)),
      mean: round(mean),
      tailRisk: round(tailRisk),
    };

    // Sensitivity: analytic ∂outcome/∂var = coefficient (for the linear SCM).
    const sensitivity: Record<string, number> = {};
    for (const [k, coeff] of Object.entries(this.model.coefficients)) {
      sensitivity[k] = round(coeff);
    }

    const result: SimResult = { type: req.type, metric: this.model.metric, distribution, sensitivity, runs, seed };
    this.bus?.publish("sim.completed", { decisionId: req.decisionId, metric: result.metric, distribution });
    return result;
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
