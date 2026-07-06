/**
 * HealthScorer — a unified company health index (0–100) computed from the live
 * state of every business module. Each dimension contributes a sub-score; the
 * composite is a weighted average. This is the single executive metric.
 *
 * Dimensions (each 0–100):
 *   - financial:  based on runway months (>=18mo = 100, <=0 = 0, linear)
 *   - risk:       based on top residual risk scores (lower = healthier)
 *   - growth:     based on pipeline weighted ARR vs a baseline target
 *   - reliability: based on fraction of SLAs healthy (not breached/at-risk)
 *   - capacity:   based on fraction of resources NOT overallocated
 *   - goals:      based on average OKR overall progress
 */

import type { Olympus } from "../index.js";

export type HealthGrade = "excellent" | "good" | "fair" | "poor" | "critical";

export interface HealthDimension {
  name: string;
  score: number; // 0–100
  weight: number;
  detail: string;
}

export interface HealthReport {
  generatedAt: string;
  composite: number; // 0–100
  grade: HealthGrade;
  dimensions: HealthDimension[];
  /** Human-readable one-line summary. */
  headline: string;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function grade(score: number): HealthGrade {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  if (score >= 30) return "poor";
  return "critical";
}

export interface HealthScorerOptions {
  /** Pipeline weighted-ARR target used to normalize the growth dimension. Default 1_000_000. */
  arrTarget?: number;
}

export class HealthScorer {
  private readonly arrTarget: number;

  constructor(
    private readonly olympus: Olympus,
    opts?: HealthScorerOptions
  ) {
    this.arrTarget = opts?.arrTarget ?? 1_000_000;
  }

  score(): HealthReport {
    const dims: HealthDimension[] = [];

    // Financial — runway months, 18mo+ is full marks
    const burn = this.olympus.ledger.burnRate();
    const runway = burn.runwayMonths === Infinity ? 36 : burn.runwayMonths;
    const financialScore = clamp((runway / 18) * 100);
    dims.push({
      name: "financial",
      score: financialScore,
      weight: 0.25,
      detail: burn.runwayMonths === Infinity
        ? "Cash-flow positive (no burn)"
        : `${runway.toFixed(1)} months runway`,
    });

    // Risk — based on highest residual scores; residualScore is prob(0-1)*impact(1-5) => max 5
    const topRisks = this.olympus.riskRegister.topRisks(5);
    const avgTopRisk = topRisks.length
      ? topRisks.reduce((s, r) => s + r.residualScore, 0) / topRisks.length
      : 0;
    // residualScore max ~5; invert to a 0-100 health score
    const riskScore = clamp(100 - (avgTopRisk / 5) * 100);
    dims.push({
      name: "risk",
      score: riskScore,
      weight: 0.20,
      detail: topRisks.length
        ? `${topRisks.length} active risks, avg residual ${avgTopRisk.toFixed(2)}/5`
        : "No active risks",
    });

    // Growth — weighted ARR vs target
    const pipeline = this.olympus.pipeline.summary();
    const growthScore = clamp((pipeline.weightedArrUsd / this.arrTarget) * 100);
    dims.push({
      name: "growth",
      score: growthScore,
      weight: 0.20,
      detail: `$${Math.round(pipeline.weightedArrUsd).toLocaleString()} weighted ARR in pipeline`,
    });

    // Reliability — fraction of SLAs healthy
    const slas = this.olympus.sla.list();
    const healthySlas = slas.filter((s) => s.status === "healthy").length;
    const reliabilityScore = slas.length ? clamp((healthySlas / slas.length) * 100) : 100;
    dims.push({
      name: "reliability",
      score: reliabilityScore,
      weight: 0.15,
      detail: slas.length
        ? `${healthySlas}/${slas.length} SLAs healthy`
        : "No SLAs tracked",
    });

    // Capacity — fraction of resources NOT overallocated
    const overallocated = this.olympus.capacity.overallocatedResources();
    const allResources = this.olympus.capacity.listResources();
    const capacityScore = allResources.length
      ? clamp(((allResources.length - overallocated.length) / allResources.length) * 100)
      : 100;
    dims.push({
      name: "capacity",
      score: capacityScore,
      weight: 0.10,
      detail: allResources.length
        ? `${overallocated.length}/${allResources.length} resources overallocated`
        : "No resources tracked",
    });

    // Goals — average OKR overall progress
    const objectives = this.olympus.okr.list();
    const avgProgress = objectives.length
      ? objectives.reduce((s, o) => s + o.overallProgress, 0) / objectives.length
      : 0;
    const goalsScore = objectives.length ? clamp(avgProgress * 100) : 100;
    dims.push({
      name: "goals",
      score: goalsScore,
      weight: 0.10,
      detail: objectives.length
        ? `${objectives.length} objectives, ${(avgProgress * 100).toFixed(0)}% avg progress`
        : "No objectives set",
    });

    // Weighted composite
    const totalWeight = dims.reduce((s, d) => s + d.weight, 0);
    const composite = dims.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
    const g = grade(composite);

    return {
      generatedAt: new Date().toISOString(),
      composite: Math.round(composite * 10) / 10,
      grade: g,
      dimensions: dims,
      headline: `Company health: ${composite.toFixed(0)}/100 (${g}) — weakest: ${
        [...dims].sort((a, b) => a.score - b.score)[0]?.name ?? "n/a"
      }`,
    };
  }
}
