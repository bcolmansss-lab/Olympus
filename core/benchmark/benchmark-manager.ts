/**
 * BenchmarkManager — competitive benchmarking: metric definitions with a
 * better-direction, competitor score recording per period, our-score
 * comparison with win/loss verdicts, and scorecard rollups.
 *
 * Events:
 *   - "benchmark.recorded": { metricId, subject, value }
 *   - "benchmark.scorecard": { period, wins, losses }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BenchmarkDirection = "higher_is_better" | "lower_is_better";

export interface BenchmarkMetric {
  id: string;
  name: string;
  unit: string;
  direction: BenchmarkDirection;
}

export interface BenchmarkEntry {
  metricId: string;
  subject: string;
  value: number;
  period: string;
}

export interface BenchmarkScorecard {
  period: string;
  wins: number;
  losses: number;
  ties: number;
  details: Array<{ metric: string; us: number; bestCompetitor: string; theirValue: number; verdict: "win" | "loss" | "tie" }>;
}

export interface BenchmarkSummary {
  totalMetrics: number;
  totalEntries: number;
  competitorsTracked: number;
}

export class BenchmarkManager {
  private metrics: Map<string, BenchmarkMetric> = new Map();
  private entries: BenchmarkEntry[] = [];

  constructor(private readonly bus: EventBus) {}

  defineMetric(name: string, unit: string, direction: BenchmarkDirection): BenchmarkMetric {
    const metric: BenchmarkMetric = { id: randomUUID(), name, unit, direction };
    this.metrics.set(metric.id, metric);
    return metric;
  }

  /** Record a score for "us" or a competitor name for a period. */
  record(metricId: string, subject: string, value: number, period: string): BenchmarkEntry | undefined {
    if (!this.metrics.has(metricId)) return undefined;
    const entry: BenchmarkEntry = { metricId, subject, value, period };
    this.entries.push(entry);
    this.bus.publish("benchmark.recorded", { metricId, subject, value });
    return entry;
  }

  /**
   * Compare "us" against the best competitor per metric for a period.
   * Metrics without both our score and a competitor score are skipped.
   */
  scorecard(period: string): BenchmarkScorecard {
    const details: BenchmarkScorecard["details"] = [];
    let wins = 0, losses = 0, ties = 0;
    for (const metric of this.metrics.values()) {
      const inPeriod = this.entries.filter(e => e.metricId === metric.id && e.period === period);
      const us = inPeriod.find(e => e.subject === "us");
      const competitors = inPeriod.filter(e => e.subject !== "us");
      if (!us || competitors.length === 0) continue;
      const better = (a: number, b: number) => (metric.direction === "higher_is_better" ? a > b : a < b);
      const best = competitors.reduce((acc, e) => (better(e.value, acc.value) ? e : acc));
      let verdict: "win" | "loss" | "tie";
      if (us.value === best.value) { verdict = "tie"; ties += 1; }
      else if (better(us.value, best.value)) { verdict = "win"; wins += 1; }
      else { verdict = "loss"; losses += 1; }
      details.push({ metric: metric.name, us: us.value, bestCompetitor: best.subject, theirValue: best.value, verdict });
    }
    this.bus.publish("benchmark.scorecard", { period, wins, losses });
    return { period, wins, losses, ties, details };
  }

  getMetric(id: string): BenchmarkMetric | undefined { return this.metrics.get(id); }
  listEntries(metricId?: string, period?: string): BenchmarkEntry[] {
    let all = [...this.entries];
    if (metricId) all = all.filter(e => e.metricId === metricId);
    if (period) all = all.filter(e => e.period === period);
    return all;
  }

  summary(): BenchmarkSummary {
    const competitors = new Set(this.entries.filter(e => e.subject !== "us").map(e => e.subject));
    return {
      totalMetrics: this.metrics.size,
      totalEntries: this.entries.length,
      competitorsTracked: competitors.size,
    };
  }
}
