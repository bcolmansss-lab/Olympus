/**
 * HealthBenefitsManager — employee health plan enrollment, claims tracking,
 * benefit utilization analytics, FSA/HSA management, and open enrollment.
 *
 * Events:
 *   - "benefits.enrollment_confirmed": { employeeId, planId, planName, effectiveDate }
 *   - "benefits.claim_submitted": { employeeId, claimId, amountUsd, claimType }
 *   - "benefits.open_enrollment_opened": { periodId, startDate, endDate }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BenefitPlanType = "medical" | "dental" | "vision" | "life" | "disability" | "fsa" | "hsa" | "401k";
export type ClaimType = "medical" | "dental" | "vision" | "rx" | "mental_health" | "preventive";
export type ClaimStatus = "submitted" | "under_review" | "approved" | "denied" | "paid";

export interface BenefitPlan {
  id: string;
  name: string;
  type: BenefitPlanType;
  provider: string;
  employeePremiumMonthly: number;
  employerPremiumMonthly: number;
  deductibleUsd: number;
  outOfPocketMaxUsd: number;
  active: boolean;
}

export interface BenefitEnrollment {
  id: string;
  employeeId: string;
  planId: string;
  planName: string;
  planType: BenefitPlanType;
  effectiveDate: string;
  endDate?: string;
  dependents: string[];
  createdAt: string;
}

export interface BenefitClaim {
  id: string;
  employeeId: string;
  enrollmentId: string;
  claimType: ClaimType;
  status: ClaimStatus;
  amountUsd: number;
  approvedUsd?: number;
  serviceDate: string;
  submittedAt: string;
  resolvedAt?: string;
}

export interface BenefitsSummary {
  totalEnrollments: number;
  totalClaims: number;
  pendingClaims: number;
  totalClaimsUsd: number;
  totalApprovedUsd: number;
  byPlanType: Partial<Record<BenefitPlanType, number>>;
  monthlyCostUsd: number;
}

export class HealthBenefitsManager {
  private plans: Map<string, BenefitPlan> = new Map();
  private enrollments: Map<string, BenefitEnrollment> = new Map();
  private claims: Map<string, BenefitClaim> = new Map();

  constructor(private readonly bus: EventBus) {}

  addPlan(input: Omit<BenefitPlan, "id"> & { id?: string }): BenefitPlan {
    const plan: BenefitPlan = { ...input, id: input.id ?? randomUUID() };
    this.plans.set(plan.id, plan);
    return plan;
  }

  enroll(employeeId: string, planId: string, effectiveDate: string, dependents: string[] = []): BenefitEnrollment | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const enrollment: BenefitEnrollment = { id: randomUUID(), employeeId, planId, planName: plan.name, planType: plan.type, effectiveDate, dependents, createdAt: new Date().toISOString() };
    this.enrollments.set(enrollment.id, enrollment);
    this.bus.publish("benefits.enrollment_confirmed", { employeeId, planId, planName: plan.name, effectiveDate });
    return enrollment;
  }

  submitClaim(input: Omit<BenefitClaim, "id"> & { id?: string }): BenefitClaim | undefined {
    if (!this.enrollments.get(input.enrollmentId)) return undefined;
    const claim: BenefitClaim = { ...input, id: input.id ?? randomUUID() };
    this.claims.set(claim.id, claim);
    this.bus.publish("benefits.claim_submitted", { employeeId: claim.employeeId, claimId: claim.id, amountUsd: claim.amountUsd, claimType: claim.claimType });
    return claim;
  }

  resolveClaim(claimId: string, status: ClaimStatus, approvedUsd?: number): BenefitClaim | undefined {
    const claim = this.claims.get(claimId);
    if (!claim) return undefined;
    claim.status = status;
    claim.approvedUsd = approvedUsd;
    claim.resolvedAt = new Date().toISOString();
    return claim;
  }

  listPlans(activeOnly = false): BenefitPlan[] {
    const all = Array.from(this.plans.values());
    return activeOnly ? all.filter(p => p.active) : all;
  }
  listEnrollments(employeeId?: string): BenefitEnrollment[] {
    const all = Array.from(this.enrollments.values());
    return employeeId ? all.filter(e => e.employeeId === employeeId) : all;
  }
  listClaims(employeeId?: string, status?: ClaimStatus): BenefitClaim[] {
    let all = Array.from(this.claims.values());
    if (employeeId) all = all.filter(c => c.employeeId === employeeId);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(): BenefitsSummary {
    const enrollments = Array.from(this.enrollments.values());
    const claims = Array.from(this.claims.values());
    const byPlanType: Partial<Record<BenefitPlanType, number>> = {};
    for (const e of enrollments) { byPlanType[e.planType] = (byPlanType[e.planType] ?? 0) + 1; }
    const totalCost = enrollments.reduce((s, e) => {
      const plan = this.plans.get(e.planId);
      return s + (plan ? plan.employerPremiumMonthly : 0);
    }, 0);
    return {
      totalEnrollments: enrollments.length,
      totalClaims: claims.length,
      pendingClaims: claims.filter(c => c.status === "submitted" || c.status === "under_review").length,
      totalClaimsUsd: claims.reduce((s, c) => s + c.amountUsd, 0),
      totalApprovedUsd: claims.reduce((s, c) => s + (c.approvedUsd ?? 0), 0),
      byPlanType,
      monthlyCostUsd: totalCost,
    };
  }
}
