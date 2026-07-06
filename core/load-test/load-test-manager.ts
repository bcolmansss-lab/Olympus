/**
 * LoadTestManager — performance load testing: test-plan definition with
 * target RPS and latency SLO, run execution with recorded metrics, automatic
 * pass/fail verdicts against the SLO, and regression detection between runs.
 *
 * Events:
 *   - "loadtest.run_completed": { runId, planId, passed }
 *   - "loadtest.regression": { planId, metric, previous, current }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface LoadTestPlan {
  id: string;
  name: string;
  targetRps: number;
  p95LatencyBudgetMs: number;
  maxErrorRatePct: number;
}

export interface LoadTestRun {
  id: string;
  planId: string;
  achievedRps: number;
  p95LatencyMs: number;
  errorRatePct: number;
  passed: boolean;
  ranAt: string;
}

export interface LoadTestSummary {
  totalPlans: number;
  totalRuns: number;
  passRatePct: number;
  regressions: number;
}

export class LoadTestManager {
  private plans: Map<string, LoadTestPlan> = new Map();
  private runs: Map<string, LoadTestRun> = new Map();
  private regressionCount = 0;

  constructor(private readonly bus: EventBus) {}

  definePlan(name: string, targetRps: number, p95LatencyBudgetMs: number, maxErrorRatePct = 1): LoadTestPlan {
    const plan: LoadTestPlan = { id: randomUUID(), name, targetRps, p95LatencyBudgetMs, maxErrorRatePct };
    this.plans.set(plan.id, plan);
    return plan;
  }

  /**
   * Record a run; verdict passes when achieved RPS meets target, latency is
   * within budget, and error rate is under the cap. p95 latency regressions
   * of more than 20% versus the previous run raise a regression event.
   */
  recordRun(planId: string, achievedRps: number, p95LatencyMs: number, errorRatePct: number, ranAt: string): LoadTestRun | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const previous = this.latestRun(planId);
    const passed = achievedRps >= plan.targetRps && p95LatencyMs <= plan.p95LatencyBudgetMs && errorRatePct <= plan.maxErrorRatePct;
    const run: LoadTestRun = { id: randomUUID(), planId, achievedRps, p95LatencyMs, errorRatePct, passed, ranAt };
    this.runs.set(run.id, run);
    this.bus.publish("loadtest.run_completed", { runId: run.id, planId, passed });
    if (previous && p95LatencyMs > previous.p95LatencyMs * 1.2) {
      this.regressionCount += 1;
      this.bus.publish("loadtest.regression", { planId, metric: "p95LatencyMs", previous: previous.p95LatencyMs, current: p95LatencyMs });
    }
    return run;
  }

  latestRun(planId: string): LoadTestRun | undefined {
    return Array.from(this.runs.values())
      .filter(r => r.planId === planId)
      .sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
  }

  getPlan(id: string): LoadTestPlan | undefined { return this.plans.get(id); }
  listRuns(planId?: string): LoadTestRun[] {
    const all = Array.from(this.runs.values());
    return planId ? all.filter(r => r.planId === planId) : all;
  }

  summary(): LoadTestSummary {
    const runs = Array.from(this.runs.values());
    const passed = runs.filter(r => r.passed).length;
    return {
      totalPlans: this.plans.size,
      totalRuns: runs.length,
      passRatePct: runs.length > 0 ? Math.round((passed / runs.length) * 100) : 0,
      regressions: this.regressionCount,
    };
  }
}
