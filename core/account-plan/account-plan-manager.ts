/**
 * AccountPlanManager — strategic account planning: per-account goals, key
 * stakeholders, whitespace opportunities, and plan health scoring.
 *
 * Events:
 *   - "accountplan.created": { planId, accountId, targetRevenueUsd }
 *   - "accountplan.opportunity_added": { planId, opportunityId, valueUsd }
 *   - "accountplan.goal_achieved": { planId, goalId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type StakeholderRole = "champion" | "decision_maker" | "influencer" | "blocker" | "user";
export type OpportunityStatus = "identified" | "qualified" | "won" | "lost";

export interface Stakeholder {
  id: string;
  name: string;
  title: string;
  role: StakeholderRole;
  sentiment: "positive" | "neutral" | "negative";
}

export interface AccountGoal {
  id: string;
  description: string;
  targetDate: string;
  achieved: boolean;
}

export interface WhitespaceOpportunity {
  id: string;
  product: string;
  valueUsd: number;
  status: OpportunityStatus;
}

export interface AccountPlan {
  id: string;
  accountId: string;
  accountName: string;
  ownerId: string;
  currentArrUsd: number;
  targetRevenueUsd: number;
  stakeholders: Stakeholder[];
  goals: AccountGoal[];
  opportunities: WhitespaceOpportunity[];
  fiscalYear: string;
  createdAt: string;
}

export interface AccountPlanSummary {
  totalPlans: number;
  totalCurrentArrUsd: number;
  totalTargetRevenueUsd: number;
  totalPipelineUsd: number;
  goalsAchieved: number;
  avgHealthScore: number;
}

export class AccountPlanManager {
  private plans: Map<string, AccountPlan> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { accountId: string; accountName: string; ownerId: string; currentArrUsd: number; targetRevenueUsd: number; fiscalYear: string }): AccountPlan {
    const plan: AccountPlan = { ...input, id: randomUUID(), stakeholders: [], goals: [], opportunities: [], createdAt: new Date().toISOString() };
    this.plans.set(plan.id, plan);
    this.bus.publish("accountplan.created", { planId: plan.id, accountId: plan.accountId, targetRevenueUsd: plan.targetRevenueUsd });
    return plan;
  }

  addStakeholder(planId: string, input: Omit<Stakeholder, "id">): Stakeholder | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const stakeholder: Stakeholder = { ...input, id: randomUUID() };
    plan.stakeholders.push(stakeholder);
    return stakeholder;
  }

  addGoal(planId: string, description: string, targetDate: string): AccountGoal | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const goal: AccountGoal = { id: randomUUID(), description, targetDate, achieved: false };
    plan.goals.push(goal);
    return goal;
  }

  achieveGoal(planId: string, goalId: string): AccountGoal | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const goal = plan.goals.find(g => g.id === goalId);
    if (!goal || goal.achieved) return undefined;
    goal.achieved = true;
    this.bus.publish("accountplan.goal_achieved", { planId, goalId });
    return goal;
  }

  addOpportunity(planId: string, product: string, valueUsd: number): WhitespaceOpportunity | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const opp: WhitespaceOpportunity = { id: randomUUID(), product, valueUsd, status: "identified" };
    plan.opportunities.push(opp);
    this.bus.publish("accountplan.opportunity_added", { planId, opportunityId: opp.id, valueUsd });
    return opp;
  }

  updateOpportunity(planId: string, opportunityId: string, status: OpportunityStatus): WhitespaceOpportunity | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const opp = plan.opportunities.find(o => o.id === opportunityId);
    if (!opp) return undefined;
    opp.status = status;
    return opp;
  }

  /** Health: blend of champion coverage, goal progress, and pipeline-to-target. */
  healthScore(planId: string): number {
    const plan = this.plans.get(planId);
    if (!plan) return 0;
    const hasChampion = plan.stakeholders.some(s => s.role === "champion" && s.sentiment === "positive") ? 1 : 0;
    const goalProgress = plan.goals.length > 0 ? plan.goals.filter(g => g.achieved).length / plan.goals.length : 0;
    const pipeline = plan.opportunities.filter(o => o.status !== "lost").reduce((s, o) => s + o.valueUsd, 0);
    const pipelineCoverage = plan.targetRevenueUsd > 0 ? Math.min(1, pipeline / plan.targetRevenueUsd) : 0;
    return Math.round((hasChampion * 0.4 + goalProgress * 0.3 + pipelineCoverage * 0.3) * 100);
  }

  getPlan(id: string): AccountPlan | undefined { return this.plans.get(id); }
  listPlans(ownerId?: string): AccountPlan[] {
    const all = Array.from(this.plans.values());
    return ownerId ? all.filter(p => p.ownerId === ownerId) : all;
  }

  summary(): AccountPlanSummary {
    const plans = Array.from(this.plans.values());
    const pipeline = plans.flatMap(p => p.opportunities).filter(o => o.status !== "lost").reduce((s, o) => s + o.valueUsd, 0);
    const goalsAchieved = plans.flatMap(p => p.goals).filter(g => g.achieved).length;
    const avgHealth = plans.length > 0 ? Math.round(plans.reduce((s, p) => s + this.healthScore(p.id), 0) / plans.length) : 0;
    return {
      totalPlans: plans.length,
      totalCurrentArrUsd: Math.round(plans.reduce((s, p) => s + p.currentArrUsd, 0) * 100) / 100,
      totalTargetRevenueUsd: Math.round(plans.reduce((s, p) => s + p.targetRevenueUsd, 0) * 100) / 100,
      totalPipelineUsd: Math.round(pipeline * 100) / 100,
      goalsAchieved,
      avgHealthScore: avgHealth,
    };
  }
}
