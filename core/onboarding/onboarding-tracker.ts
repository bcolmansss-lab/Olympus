/**
 * OnboardingTracker — customer onboarding journeys, milestone completion, time-to-value tracking.
 *
 * Events:
 *   - "onboarding.started": { journeyId, accountId, planId }
 *   - "onboarding.milestone_completed": { journeyId, accountId, milestoneId, title }
 *   - "onboarding.completed": { journeyId, accountId, daysToComplete, healthScore }
 *   - "onboarding.stalled": { journeyId, accountId, daysSinceActivity, blockedAt }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "stalled" | "cancelled";
export type MilestoneCategory = "technical" | "training" | "integration" | "go_live" | "adoption" | "success_criteria";

export interface OnboardingPlan {
  id: string;
  name: string; // e.g. "Enterprise Onboarding", "SMB Fast Track"
  estimatedDays: number;
  milestones: PlanMilestone[];
  createdAt: string;
}

export interface PlanMilestone {
  id: string;
  title: string;
  category: MilestoneCategory;
  dueOffsetDays: number; // days after journey start
  required: boolean;
  description?: string;
}

export interface OnboardingJourney {
  id: string;
  accountId: string;
  planId: string;
  status: OnboardingStatus;
  startedAt: string;
  completedAt?: string;
  lastActivityAt: string;
  assignedCsmId?: string;
  healthScore: number; // 0-100 (decreases with delays, increases with completions)
  completedMilestoneIds: string[];
  blockedReason?: string;
}

export interface OnboardingSummary {
  totalJourneys: number;
  activeJourneys: number;
  completedJourneys: number;
  stalledJourneys: number;
  avgDaysToComplete: number;
  avgHealthScore: number;
  completionRate: number; // completed / (completed + cancelled) * 100
}

export class OnboardingTracker {
  private readonly plans = new Map<string, OnboardingPlan>();
  private readonly journeys = new Map<string, OnboardingJourney>();

  constructor(private readonly bus: EventBus) {}

  createPlan(input: Omit<OnboardingPlan, "id" | "createdAt"> & { id?: string }): OnboardingPlan {
    const plan: OnboardingPlan = {
      id: input.id ?? randomUUID(),
      name: input.name,
      estimatedDays: input.estimatedDays,
      milestones: input.milestones,
      createdAt: new Date().toISOString(),
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  startJourney(input: {
    accountId: string;
    planId: string;
    assignedCsmId?: string;
    id?: string;
    startedAt?: string;
  }): OnboardingJourney {
    const now = input.startedAt ?? new Date().toISOString();
    const journey: OnboardingJourney = {
      id: input.id ?? randomUUID(),
      accountId: input.accountId,
      planId: input.planId,
      status: "in_progress",
      startedAt: now,
      lastActivityAt: now,
      assignedCsmId: input.assignedCsmId,
      healthScore: 100,
      completedMilestoneIds: [],
    };
    this.journeys.set(journey.id, journey);
    this.bus.publish("onboarding.started", {
      journeyId: journey.id,
      accountId: journey.accountId,
      planId: journey.planId,
    });
    return journey;
  }

  completeMilestone(journeyId: string, milestoneId: string): OnboardingJourney | undefined {
    const journey = this.journeys.get(journeyId);
    if (!journey) return undefined;

    if (!journey.completedMilestoneIds.includes(milestoneId)) {
      journey.completedMilestoneIds.push(milestoneId);
    }
    journey.lastActivityAt = new Date().toISOString();

    const plan = this.plans.get(journey.planId);
    const milestone = plan?.milestones.find((m) => m.id === milestoneId);

    // Recalculate healthScore: completedRequired / totalRequired * 100
    if (plan) {
      const requiredMilestones = plan.milestones.filter((m) => m.required);
      const completedRequired = requiredMilestones.filter((m) =>
        journey.completedMilestoneIds.includes(m.id)
      ).length;
      journey.healthScore = requiredMilestones.length > 0
        ? Math.round((completedRequired / requiredMilestones.length) * 100)
        : 100;
    }

    this.bus.publish("onboarding.milestone_completed", {
      journeyId: journey.id,
      accountId: journey.accountId,
      milestoneId,
      title: milestone?.title ?? milestoneId,
    });

    // Check if all required milestones complete
    if (plan) {
      const requiredMilestones = plan.milestones.filter((m) => m.required);
      const allDone = requiredMilestones.every((m) =>
        journey.completedMilestoneIds.includes(m.id)
      );
      if (allDone && journey.status !== "completed") {
        journey.status = "completed";
        journey.completedAt = new Date().toISOString();
        const startMs = new Date(journey.startedAt).getTime();
        const daysToComplete = Math.round(
          (new Date(journey.completedAt).getTime() - startMs) / (1000 * 60 * 60 * 24)
        );
        this.bus.publish("onboarding.completed", {
          journeyId: journey.id,
          accountId: journey.accountId,
          daysToComplete,
          healthScore: journey.healthScore,
        });
      }
    }

    return journey;
  }

  markStalled(journeyId: string, reason: string): OnboardingJourney | undefined {
    const journey = this.journeys.get(journeyId);
    if (!journey) return undefined;

    journey.status = "stalled";
    journey.blockedReason = reason;

    const now = Date.now();
    const lastActivity = new Date(journey.lastActivityAt).getTime();
    const daysSinceActivity = Math.round((now - lastActivity) / (1000 * 60 * 60 * 24));

    this.bus.publish("onboarding.stalled", {
      journeyId: journey.id,
      accountId: journey.accountId,
      daysSinceActivity,
      blockedAt: new Date().toISOString(),
    });

    return journey;
  }

  getJourney(id: string): OnboardingJourney | undefined {
    return this.journeys.get(id);
  }

  listJourneys(status?: OnboardingStatus): OnboardingJourney[] {
    const all = Array.from(this.journeys.values());
    return status ? all.filter((j) => j.status === status) : all;
  }

  getPlan(id: string): OnboardingPlan | undefined {
    return this.plans.get(id);
  }

  listPlans(): OnboardingPlan[] {
    return Array.from(this.plans.values());
  }

  summary(): OnboardingSummary {
    const all = Array.from(this.journeys.values());
    const completed = all.filter((j) => j.status === "completed");
    const stalled = all.filter((j) => j.status === "stalled");
    const active = all.filter((j) => j.status === "in_progress");
    const cancelled = all.filter((j) => j.status === "cancelled");

    const avgDaysToComplete = completed.length > 0
      ? completed.reduce((sum, j) => {
          const ms = new Date(j.completedAt!).getTime() - new Date(j.startedAt).getTime();
          return sum + ms / (1000 * 60 * 60 * 24);
        }, 0) / completed.length
      : 0;

    const avgHealthScore = all.length > 0
      ? all.reduce((sum, j) => sum + j.healthScore, 0) / all.length
      : 0;

    const completionDenominator = completed.length + cancelled.length;
    const completionRate = completionDenominator > 0
      ? (completed.length / completionDenominator) * 100
      : 0;

    return {
      totalJourneys: all.length,
      activeJourneys: active.length,
      completedJourneys: completed.length,
      stalledJourneys: stalled.length,
      avgDaysToComplete,
      avgHealthScore,
      completionRate,
    };
  }
}
