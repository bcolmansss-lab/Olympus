/**
 * ExperimentManager — A/B/n experiments: variant allocation, exposure and
 * conversion tracking, lift calculation, and a simple winner determination.
 *
 * Events:
 *   - "experiment.started": { experimentId, name, variants }
 *   - "experiment.exposure": { experimentId, variant }
 *   - "experiment.concluded": { experimentId, winner, liftPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ExperimentStatus = "draft" | "running" | "concluded";

export interface Variant {
  key: string;
  weight: number;
  exposures: number;
  conversions: number;
}

export interface ABExperiment {
  id: string;
  name: string;
  hypothesis: string;
  metric: string;
  status: ExperimentStatus;
  variants: Variant[];
  controlKey: string;
  startedAt?: string;
  concludedAt?: string;
  winner?: string;
}

export interface ExperimentSummary {
  totalExperiments: number;
  running: number;
  concluded: number;
  totalExposures: number;
  totalConversions: number;
}

export class ExperimentManager {
  private experiments: Map<string, ABExperiment> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { name: string; hypothesis: string; metric: string; variants: { key: string; weight: number }[]; controlKey: string }): ABExperiment | undefined {
    if (input.variants.length < 2 || !input.variants.some(v => v.key === input.controlKey)) return undefined;
    const exp: ABExperiment = {
      id: randomUUID(),
      name: input.name,
      hypothesis: input.hypothesis,
      metric: input.metric,
      status: "draft",
      variants: input.variants.map(v => ({ key: v.key, weight: v.weight, exposures: 0, conversions: 0 })),
      controlKey: input.controlKey,
    };
    this.experiments.set(exp.id, exp);
    return exp;
  }

  start(experimentId: string, asOf: string): ABExperiment | undefined {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "draft") return undefined;
    exp.status = "running";
    exp.startedAt = asOf;
    this.bus.publish("experiment.started", { experimentId, name: exp.name, variants: exp.variants.map(v => v.key) });
    return exp;
  }

  /** Deterministic variant assignment by hashing the subject id against weights. */
  assign(experimentId: string, subjectId: string): string | undefined {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "running") return undefined;
    const totalWeight = exp.variants.reduce((s, v) => s + v.weight, 0);
    let hash = 0;
    for (let i = 0; i < subjectId.length; i++) hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
    let point = (hash % 10000) / 10000 * totalWeight;
    for (const v of exp.variants) {
      point -= v.weight;
      if (point < 0) { return v.key; }
    }
    return exp.variants[exp.variants.length - 1]!.key;
  }

  recordExposure(experimentId: string, variantKey: string): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "running") return false;
    const v = exp.variants.find(x => x.key === variantKey);
    if (!v) return false;
    v.exposures += 1;
    this.bus.publish("experiment.exposure", { experimentId, variant: variantKey });
    return true;
  }

  recordConversion(experimentId: string, variantKey: string): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "running") return false;
    const v = exp.variants.find(x => x.key === variantKey);
    if (!v) return false;
    v.conversions += 1;
    return true;
  }

  conversionRate(experimentId: string, variantKey: string): number {
    const exp = this.experiments.get(experimentId);
    const v = exp?.variants.find(x => x.key === variantKey);
    if (!v || v.exposures === 0) return 0;
    return Math.round((v.conversions / v.exposures) * 10000) / 100;
  }

  conclude(experimentId: string, asOf: string): ABExperiment | undefined {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "running") return undefined;
    exp.status = "concluded";
    exp.concludedAt = asOf;
    const best = exp.variants.reduce((w, v) => this.conversionRate(experimentId, v.key) > this.conversionRate(experimentId, w.key) ? v : w, exp.variants[0]!);
    exp.winner = best.key;
    const controlRate = this.conversionRate(experimentId, exp.controlKey);
    const winnerRate = this.conversionRate(experimentId, best.key);
    const liftPct = controlRate > 0 ? Math.round(((winnerRate - controlRate) / controlRate) * 100) : 0;
    this.bus.publish("experiment.concluded", { experimentId, winner: best.key, liftPct });
    return exp;
  }

  getExperiment(id: string): ABExperiment | undefined { return this.experiments.get(id); }
  listExperiments(status?: ExperimentStatus): ABExperiment[] {
    const all = Array.from(this.experiments.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): ExperimentSummary {
    const exps = Array.from(this.experiments.values());
    const variants = exps.flatMap(e => e.variants);
    return {
      totalExperiments: exps.length,
      running: exps.filter(e => e.status === "running").length,
      concluded: exps.filter(e => e.status === "concluded").length,
      totalExposures: variants.reduce((s, v) => s + v.exposures, 0),
      totalConversions: variants.reduce((s, v) => s + v.conversions, 0),
    };
  }
}
