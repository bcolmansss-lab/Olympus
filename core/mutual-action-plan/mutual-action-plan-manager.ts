/**
 * MutualActionPlanManager — joint buyer/seller close plans: milestone steps with
 * owner side and due dates, completion tracking, slippage detection, and
 * on-track scoring toward the target close date.
 *
 * Events:
 *   - "map.created": { mapId, dealId, targetCloseDate }
 *   - "map.step_completed": { mapId, stepId }
 *   - "map.at_risk": { mapId, overdueSteps }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type OwnerSide = "buyer" | "seller" | "joint";
export type MAPStatus = "active" | "won" | "lost";

export interface MAPStep {
  id: string;
  name: string;
  owner: OwnerSide;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
}

export interface MutualActionPlan {
  id: string;
  dealId: string;
  targetCloseDate: string;
  status: MAPStatus;
  steps: MAPStep[];
  createdAt: string;
}

export interface MAPSummary {
  totalPlans: number;
  active: number;
  won: number;
  totalSteps: number;
  completedSteps: number;
  overallProgressPct: number;
}

export class MutualActionPlanManager {
  private plans: Map<string, MutualActionPlan> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(dealId: string, targetCloseDate: string): MutualActionPlan {
    const plan: MutualActionPlan = { id: randomUUID(), dealId, targetCloseDate, status: "active", steps: [], createdAt: new Date().toISOString() };
    this.plans.set(plan.id, plan);
    this.bus.publish("map.created", { mapId: plan.id, dealId, targetCloseDate });
    return plan;
  }

  addStep(mapId: string, name: string, owner: OwnerSide, dueDate: string): MAPStep | undefined {
    const plan = this.plans.get(mapId);
    if (!plan || plan.status !== "active") return undefined;
    const step: MAPStep = { id: randomUUID(), name, owner, dueDate, completed: false };
    plan.steps.push(step);
    return step;
  }

  completeStep(mapId: string, stepId: string, asOf: string): MAPStep | undefined {
    const plan = this.plans.get(mapId);
    if (!plan) return undefined;
    const step = plan.steps.find(s => s.id === stepId);
    if (!step || step.completed) return undefined;
    step.completed = true;
    step.completedAt = asOf;
    this.bus.publish("map.step_completed", { mapId, stepId });
    return step;
  }

  progress(mapId: string): number {
    const plan = this.plans.get(mapId);
    if (!plan || plan.steps.length === 0) return 0;
    return Math.round((plan.steps.filter(s => s.completed).length / plan.steps.length) * 100);
  }

  overdueSteps(mapId: string, asOf: string): MAPStep[] {
    const plan = this.plans.get(mapId);
    if (!plan) return [];
    const cutoff = new Date(asOf).getTime();
    return plan.steps.filter(s => !s.completed && new Date(s.dueDate).getTime() < cutoff);
  }

  /** Flag plan at risk if it has overdue steps; emits event. */
  checkRisk(mapId: string, asOf: string): boolean {
    const overdue = this.overdueSteps(mapId, asOf);
    if (overdue.length > 0) {
      this.bus.publish("map.at_risk", { mapId, overdueSteps: overdue.length });
      return true;
    }
    return false;
  }

  close(mapId: string, status: "won" | "lost"): MutualActionPlan | undefined {
    const plan = this.plans.get(mapId);
    if (!plan || plan.status !== "active") return undefined;
    plan.status = status;
    return plan;
  }

  getPlan(id: string): MutualActionPlan | undefined { return this.plans.get(id); }
  listPlans(status?: MAPStatus): MutualActionPlan[] {
    const all = Array.from(this.plans.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): MAPSummary {
    const plans = Array.from(this.plans.values());
    const steps = plans.flatMap(p => p.steps);
    const completed = steps.filter(s => s.completed).length;
    return {
      totalPlans: plans.length,
      active: plans.filter(p => p.status === "active").length,
      won: plans.filter(p => p.status === "won").length,
      totalSteps: steps.length,
      completedSteps: completed,
      overallProgressPct: steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0,
    };
  }
}
