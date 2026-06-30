/**
 * LayawayManager — layaway/installment purchase plans: plan creation with
 * deposit, scheduled installments, payment recording, and fulfillment on
 * completion (with cancellation/restocking-fee handling).
 *
 * Events:
 *   - "layaway.created": { planId, customerId, totalUsd, installments }
 *   - "layaway.payment_recorded": { planId, amountUsd, remainingUsd }
 *   - "layaway.completed": { planId, customerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type LayawayStatus = "active" | "completed" | "cancelled" | "defaulted";

export interface LayawayPayment {
  id: string;
  amountUsd: number;
  at: string;
}

export interface LayawayPlan {
  id: string;
  customerId: string;
  itemSku: string;
  totalUsd: number;
  installments: number;
  paidUsd: number;
  status: LayawayStatus;
  payments: LayawayPayment[];
  restockingFeePct: number;
  createdAt: string;
  completedAt?: string;
}

export interface LayawaySummary {
  totalPlans: number;
  active: number;
  completed: number;
  cancelled: number;
  totalCollectedUsd: number;
  outstandingUsd: number;
}

export class LayawayManager {
  private plans: Map<string, LayawayPlan> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { customerId: string; itemSku: string; totalUsd: number; installments: number; depositUsd?: number; restockingFeePct?: number }): LayawayPlan | undefined {
    if (input.totalUsd <= 0 || input.installments < 1) return undefined;
    const plan: LayawayPlan = {
      id: randomUUID(),
      customerId: input.customerId,
      itemSku: input.itemSku,
      totalUsd: input.totalUsd,
      installments: input.installments,
      paidUsd: 0,
      status: "active",
      payments: [],
      restockingFeePct: input.restockingFeePct ?? 10,
      createdAt: new Date().toISOString(),
    };
    this.plans.set(plan.id, plan);
    this.bus.publish("layaway.created", { planId: plan.id, customerId: plan.customerId, totalUsd: plan.totalUsd, installments: plan.installments });
    if (input.depositUsd && input.depositUsd > 0) this.recordPayment(plan.id, input.depositUsd, plan.createdAt);
    return plan;
  }

  installmentAmount(planId: string): number {
    const plan = this.plans.get(planId);
    if (!plan) return 0;
    return Math.round((plan.totalUsd / plan.installments) * 100) / 100;
  }

  recordPayment(planId: string, amountUsd: number, at: string): LayawayPlan | undefined {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "active" || amountUsd <= 0) return undefined;
    const applied = Math.min(amountUsd, plan.totalUsd - plan.paidUsd);
    plan.paidUsd = Math.round((plan.paidUsd + applied) * 100) / 100;
    plan.payments.push({ id: randomUUID(), amountUsd: applied, at });
    const remaining = Math.round((plan.totalUsd - plan.paidUsd) * 100) / 100;
    this.bus.publish("layaway.payment_recorded", { planId, amountUsd: applied, remainingUsd: remaining });
    if (remaining <= 0) {
      plan.status = "completed";
      plan.completedAt = at;
      this.bus.publish("layaway.completed", { planId, customerId: plan.customerId });
    }
    return plan;
  }

  /** Cancel; returns refund due to customer (paid minus restocking fee). */
  cancel(planId: string): number {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "active") return 0;
    plan.status = "cancelled";
    const fee = Math.round(plan.totalUsd * (plan.restockingFeePct / 100) * 100) / 100;
    return Math.max(0, Math.round((plan.paidUsd - fee) * 100) / 100);
  }

  markDefaulted(planId: string): LayawayPlan | undefined {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "active") return undefined;
    plan.status = "defaulted";
    return plan;
  }

  remaining(planId: string): number {
    const plan = this.plans.get(planId);
    return plan ? Math.max(0, Math.round((plan.totalUsd - plan.paidUsd) * 100) / 100) : 0;
  }

  getPlan(id: string): LayawayPlan | undefined { return this.plans.get(id); }
  listPlans(status?: LayawayStatus, customerId?: string): LayawayPlan[] {
    let all = Array.from(this.plans.values());
    if (status) all = all.filter(p => p.status === status);
    if (customerId) all = all.filter(p => p.customerId === customerId);
    return all;
  }

  summary(): LayawaySummary {
    const plans = Array.from(this.plans.values());
    const active = plans.filter(p => p.status === "active");
    return {
      totalPlans: plans.length,
      active: active.length,
      completed: plans.filter(p => p.status === "completed").length,
      cancelled: plans.filter(p => p.status === "cancelled").length,
      totalCollectedUsd: Math.round(plans.reduce((s, p) => s + p.paidUsd, 0) * 100) / 100,
      outstandingUsd: Math.round(active.reduce((s, p) => s + (p.totalUsd - p.paidUsd), 0) * 100) / 100,
    };
  }
}
