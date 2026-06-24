/**
 * SubscriptionManager — recurring subscription lifecycle, plan management,
 * trial tracking, upgrade/downgrade workflows, and MRR analytics.
 *
 * Events:
 *   - "subscription.activated": { subscriptionId, customerId, planId, mrrUsd }
 *   - "subscription.cancelled": { subscriptionId, customerId, reason, mrrLostUsd }
 *   - "subscription.upgraded": { subscriptionId, customerId, fromPlanId, toPlanId, mrrDeltaUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled" | "paused";
export type BillingInterval = "monthly" | "quarterly" | "annual";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  features: string[];
  maxUsers: number;
  active: boolean;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  mrrUsd: number;
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionSummary {
  totalSubscriptions: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  totalMrrUsd: number;
  totalArrUsd: number;
  churnedThisMonth: number;
}

export class SubscriptionManager {
  private plans: Map<string, SubscriptionPlan> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPlan(input: Omit<SubscriptionPlan, "id"> & { id?: string }): SubscriptionPlan {
    const plan: SubscriptionPlan = { ...input, id: input.id ?? randomUUID() };
    this.plans.set(plan.id, plan);
    return plan;
  }

  subscribe(input: Omit<Subscription, "id" | "createdAt" | "updatedAt"> & { id?: string }): Subscription {
    const now = new Date().toISOString();
    const subscription: Subscription = { ...input, id: input.id ?? randomUUID(), createdAt: now, updatedAt: now };
    this.subscriptions.set(subscription.id, subscription);
    if (subscription.status === "active") {
      this.bus.publish("subscription.activated", { subscriptionId: subscription.id, customerId: subscription.customerId, planId: subscription.planId, mrrUsd: subscription.mrrUsd });
    }
    return subscription;
  }

  cancelSubscription(subscriptionId: string, reason: string): Subscription | undefined {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return undefined;
    const mrrLostUsd = sub.mrrUsd;
    sub.status = "cancelled";
    sub.cancelledAt = new Date().toISOString();
    sub.cancellationReason = reason;
    sub.updatedAt = sub.cancelledAt;
    this.bus.publish("subscription.cancelled", { subscriptionId, customerId: sub.customerId, reason, mrrLostUsd });
    return sub;
  }

  upgradePlan(subscriptionId: string, newPlanId: string, newMrrUsd: number): Subscription | undefined {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return undefined;
    const fromPlanId = sub.planId;
    const mrrDeltaUsd = newMrrUsd - sub.mrrUsd;
    sub.planId = newPlanId;
    sub.mrrUsd = newMrrUsd;
    sub.updatedAt = new Date().toISOString();
    this.bus.publish("subscription.upgraded", { subscriptionId, customerId: sub.customerId, fromPlanId, toPlanId: newPlanId, mrrDeltaUsd });
    return sub;
  }

  getSubscription(id: string): Subscription | undefined { return this.subscriptions.get(id); }
  listSubscriptions(status?: SubscriptionStatus): Subscription[] {
    const all = Array.from(this.subscriptions.values());
    return status ? all.filter(s => s.status === status) : all;
  }
  listPlans(activeOnly = false): SubscriptionPlan[] {
    const all = Array.from(this.plans.values());
    return activeOnly ? all.filter(p => p.active) : all;
  }

  summary(): SubscriptionSummary {
    const subs = Array.from(this.subscriptions.values());
    const active = subs.filter(s => s.status === "active");
    const trials = subs.filter(s => s.status === "trial");
    const totalMrr = active.reduce((s, sub) => s + sub.mrrUsd, 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const churnedThisMonth = subs.filter(s => s.status === "cancelled" && s.cancelledAt && s.cancelledAt >= monthStart).length;
    return {
      totalSubscriptions: subs.length,
      activeSubscriptions: active.length,
      trialSubscriptions: trials.length,
      totalMrrUsd: totalMrr,
      totalArrUsd: totalMrr * 12,
      churnedThisMonth,
    };
  }
}
