/**
 * DisasterRecoveryManager — DR plans with RTO/RPO targets, runbook steps,
 * DR-test execution against targets, and readiness scoring.
 *
 * Events:
 *   - "dr.plan_created": { planId, system, rtoMinutes, rpoMinutes }
 *   - "dr.test_completed": { planId, achievedRtoMinutes, metRto }
 *   - "dr.invoked": { planId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PlanStatus = "draft" | "active" | "invoked";
export type Tier = "tier1" | "tier2" | "tier3";

export interface RunbookStep {
  order: number;
  action: string;
  ownerRole: string;
}

export interface DRTest {
  id: string;
  achievedRtoMinutes: number;
  achievedRpoMinutes: number;
  metRto: boolean;
  metRpo: boolean;
  testedAt: string;
}

export interface DRPlan {
  id: string;
  system: string;
  tier: Tier;
  status: PlanStatus;
  rtoMinutes: number;
  rpoMinutes: number;
  runbook: RunbookStep[];
  tests: DRTest[];
  createdAt: string;
}

export interface DRSummary {
  totalPlans: number;
  active: number;
  tested: number;
  plansMeetingTargets: number;
  readinessPct: number;
  byTier: Partial<Record<Tier, number>>;
}

export class DisasterRecoveryManager {
  private plans: Map<string, DRPlan> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPlan(input: { system: string; tier: Tier; rtoMinutes: number; rpoMinutes: number }): DRPlan {
    const plan: DRPlan = { ...input, id: randomUUID(), status: "draft", runbook: [], tests: [], createdAt: new Date().toISOString() };
    this.plans.set(plan.id, plan);
    this.bus.publish("dr.plan_created", { planId: plan.id, system: plan.system, rtoMinutes: plan.rtoMinutes, rpoMinutes: plan.rpoMinutes });
    return plan;
  }

  addStep(planId: string, action: string, ownerRole: string): DRPlan | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    plan.runbook.push({ order: plan.runbook.length + 1, action, ownerRole });
    return plan;
  }

  activate(planId: string): DRPlan | undefined {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "draft" || plan.runbook.length === 0) return undefined;
    plan.status = "active";
    return plan;
  }

  runTest(planId: string, achievedRtoMinutes: number, achievedRpoMinutes: number, testedAt: string): DRTest | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const test: DRTest = {
      id: randomUUID(),
      achievedRtoMinutes,
      achievedRpoMinutes,
      metRto: achievedRtoMinutes <= plan.rtoMinutes,
      metRpo: achievedRpoMinutes <= plan.rpoMinutes,
      testedAt,
    };
    plan.tests.push(test);
    this.bus.publish("dr.test_completed", { planId, achievedRtoMinutes, metRto: test.metRto });
    return test;
  }

  invoke(planId: string, reason: string): DRPlan | undefined {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "active") return undefined;
    plan.status = "invoked";
    this.bus.publish("dr.invoked", { planId, reason });
    return plan;
  }

  /** Whether the latest test met both RTO and RPO. */
  meetsTargets(planId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan || plan.tests.length === 0) return false;
    const latest = plan.tests[plan.tests.length - 1]!;
    return latest.metRto && latest.metRpo;
  }

  getPlan(id: string): DRPlan | undefined { return this.plans.get(id); }
  listPlans(status?: PlanStatus, tier?: Tier): DRPlan[] {
    let all = Array.from(this.plans.values());
    if (status) all = all.filter(p => p.status === status);
    if (tier) all = all.filter(p => p.tier === tier);
    return all;
  }

  summary(): DRSummary {
    const plans = Array.from(this.plans.values());
    const tested = plans.filter(p => p.tests.length > 0);
    const meeting = plans.filter(p => this.meetsTargets(p.id)).length;
    const byTier: Partial<Record<Tier, number>> = {};
    for (const p of plans) { byTier[p.tier] = (byTier[p.tier] ?? 0) + 1; }
    return {
      totalPlans: plans.length,
      active: plans.filter(p => p.status === "active").length,
      tested: tested.length,
      plansMeetingTargets: meeting,
      readinessPct: plans.length > 0 ? Math.round((meeting / plans.length) * 100) : 0,
      byTier,
    };
  }
}
