/**
 * CommissionEngine — sales commission plans, rep performance tracking,
 * tier-based commission rates, payout calculation, and dispute management.
 *
 * Events:
 *   - "commission.plan_activated": { planId, name, effectiveDate }
 *   - "commission.payout_calculated": { repId, period, amountUsd, dealCount }
 *   - "commission.dispute_opened": { disputeId, repId, payoutId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CommissionPlanStatus = "draft" | "active" | "archived";
export type PayoutStatus = "pending" | "approved" | "paid" | "disputed";
export type DisputeStatus = "open" | "resolved" | "rejected";

export interface CommissionTier {
  thresholdUsd: number; // cumulative attainment at which this rate applies
  ratePct: number; // commission percentage
}

export interface CommissionPlan {
  id: string;
  name: string;
  status: CommissionPlanStatus;
  baseRatePct: number;
  tiers: CommissionTier[];
  effectiveDate: string;
  createdAt: string;
}

export interface CommissionDeal {
  id: string;
  repId: string;
  planId: string;
  period: string; // e.g. "2026-Q2"
  dealValueUsd: number;
  closedAt: string;
}

export interface CommissionPayout {
  id: string;
  repId: string;
  planId: string;
  period: string;
  totalSalesUsd: number;
  dealCount: number;
  commissionUsd: number;
  status: PayoutStatus;
  calculatedAt: string;
}

export interface CommissionDispute {
  id: string;
  payoutId: string;
  repId: string;
  reason: string;
  status: DisputeStatus;
  resolutionNote?: string;
  openedAt: string;
  resolvedAt?: string;
}

export interface CommissionSummary {
  totalPlans: number;
  activePlans: number;
  totalDeals: number;
  totalPayouts: number;
  totalCommissionUsd: number;
  openDisputes: number;
  totalSalesUsd: number;
}

export class CommissionEngine {
  private plans: Map<string, CommissionPlan> = new Map();
  private deals: Map<string, CommissionDeal> = new Map();
  private payouts: Map<string, CommissionPayout> = new Map();
  private disputes: Map<string, CommissionDispute> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPlan(input: Omit<CommissionPlan, "id" | "createdAt" | "status"> & { id?: string; status?: CommissionPlanStatus }): CommissionPlan {
    const plan: CommissionPlan = {
      ...input,
      id: input.id ?? randomUUID(),
      status: input.status ?? "draft",
      tiers: [...input.tiers].sort((a, b) => a.thresholdUsd - b.thresholdUsd),
      createdAt: new Date().toISOString(),
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  activatePlan(planId: string): CommissionPlan | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    plan.status = "active";
    this.bus.publish("commission.plan_activated", { planId: plan.id, name: plan.name, effectiveDate: plan.effectiveDate });
    return plan;
  }

  recordDeal(input: Omit<CommissionDeal, "id"> & { id?: string }): CommissionDeal | undefined {
    if (!this.plans.get(input.planId)) return undefined;
    const deal: CommissionDeal = { ...input, id: input.id ?? randomUUID() };
    this.deals.set(deal.id, deal);
    return deal;
  }

  private rateForAttainment(plan: CommissionPlan, totalSalesUsd: number): number {
    let rate = plan.baseRatePct;
    for (const tier of plan.tiers) {
      if (totalSalesUsd >= tier.thresholdUsd) rate = tier.ratePct;
    }
    return rate;
  }

  calculatePayout(repId: string, planId: string, period: string): CommissionPayout | undefined {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    const deals = Array.from(this.deals.values()).filter(d => d.repId === repId && d.planId === planId && d.period === period);
    const totalSalesUsd = deals.reduce((s, d) => s + d.dealValueUsd, 0);
    const rate = this.rateForAttainment(plan, totalSalesUsd);
    const commissionUsd = Math.round(totalSalesUsd * (rate / 100) * 100) / 100;
    const payout: CommissionPayout = {
      id: randomUUID(),
      repId,
      planId,
      period,
      totalSalesUsd,
      dealCount: deals.length,
      commissionUsd,
      status: "pending",
      calculatedAt: new Date().toISOString(),
    };
    this.payouts.set(payout.id, payout);
    this.bus.publish("commission.payout_calculated", { repId, period, amountUsd: commissionUsd, dealCount: deals.length });
    return payout;
  }

  approvePayout(payoutId: string): CommissionPayout | undefined {
    const payout = this.payouts.get(payoutId);
    if (!payout) return undefined;
    payout.status = "approved";
    return payout;
  }

  markPaid(payoutId: string): CommissionPayout | undefined {
    const payout = this.payouts.get(payoutId);
    if (!payout) return undefined;
    payout.status = "paid";
    return payout;
  }

  openDispute(payoutId: string, reason: string): CommissionDispute | undefined {
    const payout = this.payouts.get(payoutId);
    if (!payout) return undefined;
    payout.status = "disputed";
    const dispute: CommissionDispute = { id: randomUUID(), payoutId, repId: payout.repId, reason, status: "open", openedAt: new Date().toISOString() };
    this.disputes.set(dispute.id, dispute);
    this.bus.publish("commission.dispute_opened", { disputeId: dispute.id, repId: payout.repId, payoutId, reason });
    return dispute;
  }

  resolveDispute(disputeId: string, status: "resolved" | "rejected", resolutionNote?: string): CommissionDispute | undefined {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) return undefined;
    dispute.status = status;
    dispute.resolutionNote = resolutionNote;
    dispute.resolvedAt = new Date().toISOString();
    return dispute;
  }

  getPlan(id: string): CommissionPlan | undefined { return this.plans.get(id); }
  listPlans(status?: CommissionPlanStatus): CommissionPlan[] {
    const all = Array.from(this.plans.values());
    return status ? all.filter(p => p.status === status) : all;
  }
  listDeals(repId?: string): CommissionDeal[] {
    const all = Array.from(this.deals.values());
    return repId ? all.filter(d => d.repId === repId) : all;
  }
  listPayouts(repId?: string): CommissionPayout[] {
    const all = Array.from(this.payouts.values());
    return repId ? all.filter(p => p.repId === repId) : all;
  }
  listDisputes(status?: DisputeStatus): CommissionDispute[] {
    const all = Array.from(this.disputes.values());
    return status ? all.filter(d => d.status === status) : all;
  }

  summary(): CommissionSummary {
    const plans = Array.from(this.plans.values());
    const deals = Array.from(this.deals.values());
    const payouts = Array.from(this.payouts.values());
    const disputes = Array.from(this.disputes.values());
    return {
      totalPlans: plans.length,
      activePlans: plans.filter(p => p.status === "active").length,
      totalDeals: deals.length,
      totalPayouts: payouts.length,
      totalCommissionUsd: payouts.reduce((s, p) => s + p.commissionUsd, 0),
      openDisputes: disputes.filter(d => d.status === "open").length,
      totalSalesUsd: deals.reduce((s, d) => s + d.dealValueUsd, 0),
    };
  }
}
