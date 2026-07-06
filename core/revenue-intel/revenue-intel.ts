/**
 * RevenueIntel — cohort analysis, LTV modeling, expansion revenue tracking,
 * and revenue attribution across channels and segments.
 *
 * Events:
 *   - "revenue.cohort_analyzed": { cohortId, period, avgLtvUsd, retentionPct }
 *   - "revenue.expansion_detected": { accountId, previousArrUsd, newArrUsd, expansionUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CohortPeriod = "monthly" | "quarterly" | "annual";
export type RevenueSegment = "smb" | "mid_market" | "enterprise" | "startup";
export type ExpansionType = "upsell" | "cross_sell" | "seat_expansion" | "usage_overage";

export interface RevenueCohort {
  id: string;
  period: string; // e.g. "2024-Q1"
  cohortPeriod: CohortPeriod;
  segment: RevenueSegment;
  accountCount: number;
  initialArrUsd: number;
  currentArrUsd: number;
  retentionPct: number; // currentArr / initialArr * 100
  avgLtvUsd: number;
  churnedCount: number;
  expandedCount: number;
  createdAt: string;
}

export interface ExpansionEvent {
  id: string;
  accountId: string;
  type: ExpansionType;
  previousArrUsd: number;
  newArrUsd: number;
  expansionUsd: number;
  occurredAt: string;
  sourceModule?: string; // which module triggered this
}

export interface LtvModel {
  segment: RevenueSegment;
  avgContractLengthMonths: number;
  avgMrrUsd: number;
  avgChurnRateMonthly: number;
  predictedLtvUsd: number; // avgMrr / churnRate
  confidenceScore: number; // 0-100
}

export interface RevenueIntelSummary {
  totalCohorts: number;
  avgRetentionPct: number;
  totalExpansionUsd: number;
  expansionCount: number;
  bestCohort?: string; // period with highest retention
  ltvBySegment: Partial<Record<RevenueSegment, number>>;
}

export class RevenueIntelEngine {
  private cohorts = new Map<string, RevenueCohort>();
  private expansions = new Map<string, ExpansionEvent>();
  private ltvModels = new Map<RevenueSegment, LtvModel>();

  constructor(private readonly bus: EventBus) {}

  addCohort(
    input: Omit<RevenueCohort, "id" | "createdAt" | "retentionPct"> & { id?: string },
  ): RevenueCohort {
    const retentionPct = input.initialArrUsd > 0
      ? (input.currentArrUsd / input.initialArrUsd) * 100
      : 0;
    const cohort: RevenueCohort = {
      id: input.id ?? randomUUID(),
      period: input.period,
      cohortPeriod: input.cohortPeriod,
      segment: input.segment,
      accountCount: input.accountCount,
      initialArrUsd: input.initialArrUsd,
      currentArrUsd: input.currentArrUsd,
      retentionPct,
      avgLtvUsd: input.avgLtvUsd,
      churnedCount: input.churnedCount,
      expandedCount: input.expandedCount,
      createdAt: new Date().toISOString(),
    };
    this.cohorts.set(cohort.id, cohort);
    this.bus.publish("revenue.cohort_analyzed", {
      cohortId: cohort.id,
      period: cohort.period,
      avgLtvUsd: cohort.avgLtvUsd,
      retentionPct: cohort.retentionPct,
    });
    return cohort;
  }

  recordExpansion(input: Omit<ExpansionEvent, "id"> & { id?: string }): ExpansionEvent {
    const event: ExpansionEvent = {
      id: input.id ?? randomUUID(),
      accountId: input.accountId,
      type: input.type,
      previousArrUsd: input.previousArrUsd,
      newArrUsd: input.newArrUsd,
      expansionUsd: input.expansionUsd,
      occurredAt: input.occurredAt,
      sourceModule: input.sourceModule,
    };
    this.expansions.set(event.id, event);
    this.bus.publish("revenue.expansion_detected", {
      accountId: event.accountId,
      previousArrUsd: event.previousArrUsd,
      newArrUsd: event.newArrUsd,
      expansionUsd: event.expansionUsd,
    });
    return event;
  }

  setLtvModel(model: LtvModel): LtvModel {
    const predictedLtvUsd = model.avgChurnRateMonthly > 0
      ? model.avgMrrUsd / model.avgChurnRateMonthly
      : model.avgMrrUsd * model.avgContractLengthMonths;
    const stored: LtvModel = { ...model, predictedLtvUsd };
    this.ltvModels.set(model.segment, stored);
    return stored;
  }

  getLtvModel(segment: RevenueSegment): LtvModel | undefined {
    return this.ltvModels.get(segment);
  }

  getCohort(id: string): RevenueCohort | undefined {
    return this.cohorts.get(id);
  }

  listCohorts(segment?: RevenueSegment): RevenueCohort[] {
    const list = Array.from(this.cohorts.values());
    if (segment !== undefined) return list.filter((c) => c.segment === segment);
    return list;
  }

  listExpansions(accountId?: string): ExpansionEvent[] {
    const list = Array.from(this.expansions.values());
    if (accountId !== undefined) return list.filter((e) => e.accountId === accountId);
    return list;
  }

  summary(): RevenueIntelSummary {
    const cohorts = Array.from(this.cohorts.values());
    const expansions = Array.from(this.expansions.values());

    const avgRetentionPct = cohorts.length > 0
      ? cohorts.reduce((sum, c) => sum + c.retentionPct, 0) / cohorts.length
      : 0;

    const totalExpansionUsd = expansions.reduce((sum, e) => sum + e.expansionUsd, 0);

    let bestCohort: string | undefined;
    if (cohorts.length > 0) {
      const best = cohorts.reduce((a, b) => (a.retentionPct >= b.retentionPct ? a : b));
      bestCohort = best.period;
    }

    const ltvBySegment: Partial<Record<RevenueSegment, number>> = {};
    for (const [segment, model] of this.ltvModels) {
      ltvBySegment[segment] = model.predictedLtvUsd;
    }

    return {
      totalCohorts: cohorts.length,
      avgRetentionPct,
      totalExpansionUsd,
      expansionCount: expansions.length,
      bestCohort,
      ltvBySegment,
    };
  }
}
