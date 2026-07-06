/**
 * HeadcountPlanner — strategic headcount modeling, hiring plans, cost projections,
 * and team growth scenarios.
 *
 * Events:
 *   - "headcount.plan_updated": { planId, totalHeadcount, totalCostUsd }
 *   - "headcount.hire_approved": { roleId, department, level, startDate }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type HireStatus = "planned" | "approved" | "in_progress" | "filled" | "cancelled";
export type PlanningHorizon = "q1" | "q2" | "q3" | "q4" | "h1" | "h2" | "annual";

export interface PlannedRole {
  id: string;
  planId: string;
  title: string;
  department: string;
  level: string;
  status: HireStatus;
  targetStartDate: string;
  annualSalaryUsd: number;
  benefits_multiplier: number; // e.g. 1.25 for 25% benefits on top of salary
  totalCostUsd: number; // annualSalaryUsd * benefits_multiplier
  priority: "critical" | "high" | "medium" | "low";
  backfill: boolean; // replacing departing employee
  requisitionId?: string; // links to ApplicantTracker
}

export interface HeadcountPlan {
  id: string;
  name: string;
  horizon: PlanningHorizon;
  year: number;
  status: "draft" | "approved" | "active" | "archived";
  roles: string[]; // PlannedRole IDs
  totalHeadcount: number;
  totalAnnualCostUsd: number;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HeadcountSummary {
  totalPlans: number;
  activePlans: number;
  totalPlannedHires: number;
  approvedHires: number;
  totalPlannedCostUsd: number;
  byDepartment: Record<string, number>;
  byPriority: Record<string, number>;
}

export class HeadcountPlanner {
  private plans: Map<string, HeadcountPlan> = new Map();
  private roles: Map<string, PlannedRole> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPlan(
    input: Omit<HeadcountPlan, "id" | "createdAt" | "updatedAt" | "roles" | "totalHeadcount" | "totalAnnualCostUsd"> & { id?: string },
  ): HeadcountPlan {
    const now = new Date().toISOString();
    const plan: HeadcountPlan = {
      id: input.id ?? randomUUID(),
      name: input.name,
      horizon: input.horizon,
      year: input.year,
      status: input.status,
      approvedBy: input.approvedBy,
      roles: [],
      totalHeadcount: 0,
      totalAnnualCostUsd: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  addRole(
    planId: string,
    input: Omit<PlannedRole, "id" | "planId" | "totalCostUsd"> & { id?: string },
  ): PlannedRole | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;

    const totalCostUsd = input.annualSalaryUsd * input.benefits_multiplier;
    const role: PlannedRole = {
      id: input.id ?? randomUUID(),
      planId,
      title: input.title,
      department: input.department,
      level: input.level,
      status: input.status,
      targetStartDate: input.targetStartDate,
      annualSalaryUsd: input.annualSalaryUsd,
      benefits_multiplier: input.benefits_multiplier,
      totalCostUsd,
      priority: input.priority,
      backfill: input.backfill,
      requisitionId: input.requisitionId,
    };
    this.roles.set(role.id, role);
    plan.roles.push(role.id);
    plan.totalHeadcount++;
    plan.totalAnnualCostUsd += totalCostUsd;
    plan.updatedAt = new Date().toISOString();

    this.bus.publish("headcount.plan_updated", {
      planId,
      totalHeadcount: plan.totalHeadcount,
      totalCostUsd: plan.totalAnnualCostUsd,
    });

    return role;
  }

  approveRole(roleId: string): PlannedRole | undefined {
    const role = this.roles.get(roleId);
    if (!role) return undefined;
    role.status = "approved";
    this.bus.publish("headcount.hire_approved", {
      roleId: role.id,
      department: role.department,
      level: role.level,
      startDate: role.targetStartDate,
    });
    return role;
  }

  updatePlanStatus(
    planId: string,
    status: HeadcountPlan["status"],
    approvedBy?: string,
  ): HeadcountPlan | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    plan.status = status;
    if (approvedBy !== undefined) plan.approvedBy = approvedBy;
    plan.updatedAt = new Date().toISOString();
    return plan;
  }

  getPlan(id: string): HeadcountPlan | undefined {
    return this.plans.get(id);
  }

  listPlans(status?: HeadcountPlan["status"]): HeadcountPlan[] {
    const all = Array.from(this.plans.values());
    return status ? all.filter((p) => p.status === status) : all;
  }

  getRole(id: string): PlannedRole | undefined {
    return this.roles.get(id);
  }

  listRoles(planId?: string, status?: HireStatus): PlannedRole[] {
    let all = Array.from(this.roles.values());
    if (planId) all = all.filter((r) => r.planId === planId);
    if (status) all = all.filter((r) => r.status === status);
    return all;
  }

  summary(): HeadcountSummary {
    const plans = Array.from(this.plans.values());
    const roles = Array.from(this.roles.values());
    const byDepartment: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const r of roles) {
      byDepartment[r.department] = (byDepartment[r.department] ?? 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
    }
    return {
      totalPlans: plans.length,
      activePlans: plans.filter((p) => p.status === "active").length,
      totalPlannedHires: roles.length,
      approvedHires: roles.filter((r) => r.status === "approved").length,
      totalPlannedCostUsd: roles.reduce((sum, r) => sum + r.totalCostUsd, 0),
      byDepartment,
      byPriority,
    };
  }
}
