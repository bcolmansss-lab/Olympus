/**
 * CustomerJourneyAnalytics — tracks customer touchpoints, stage progression,
 * conversion funnels, drop-off analysis, and time-to-value metrics.
 *
 * Events:
 *   - "journey.stage_advanced": { customerId, fromStage, toStage, daysInStage }
 *   - "journey.converted": { customerId, totalDays, touchpoints }
 *   - "journey.dropped": { customerId, dropStage, daysInStage }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type JourneyStage = "awareness" | "consideration" | "trial" | "onboarding" | "active" | "expansion" | "churned";
export type TouchpointChannel = "email" | "web" | "sales_call" | "demo" | "in_app" | "support" | "event" | "referral";

export interface Touchpoint {
  id: string;
  customerId: string;
  channel: TouchpointChannel;
  stage: JourneyStage;
  description: string;
  occurredAt: string;
  metadata?: Record<string, string | number>;
}

export interface CustomerJourney {
  customerId: string;
  currentStage: JourneyStage;
  stages: Array<{ stage: JourneyStage; enteredAt: string; exitedAt?: string; daysInStage?: number }>;
  touchpoints: string[]; // Touchpoint IDs
  startedAt: string;
  convertedAt?: string;
  totalDays?: number;
  isConverted: boolean;
  isDropped: boolean;
}

export interface FunnelAnalysis {
  stage: JourneyStage;
  count: number;
  enteredCount: number;
  conversionRate: number; // % who moved to next stage
  avgDaysInStage: number;
}

export interface JourneySummary {
  totalJourneys: number;
  converted: number;
  dropped: number;
  active: number;
  avgConversionDays: number;
  funnel: FunnelAnalysis[];
}

const STAGE_ORDER: JourneyStage[] = ["awareness", "consideration", "trial", "onboarding", "active", "expansion"];

export class CustomerJourneyAnalytics {
  private journeys: Map<string, CustomerJourney> = new Map();
  private touchpoints: Map<string, Touchpoint> = new Map();

  constructor(private readonly bus: EventBus) {}

  startJourney(customerId: string, initialStage: JourneyStage = "awareness"): CustomerJourney {
    const now = new Date().toISOString();
    const journey: CustomerJourney = {
      customerId,
      currentStage: initialStage,
      stages: [{ stage: initialStage, enteredAt: now }],
      touchpoints: [],
      startedAt: now,
      isConverted: false,
      isDropped: false,
    };
    this.journeys.set(customerId, journey);
    return journey;
  }

  advanceStage(customerId: string, toStage: JourneyStage): CustomerJourney | undefined {
    const journey = this.journeys.get(customerId);
    if (!journey || journey.isDropped) return undefined;

    const now = new Date().toISOString();
    const currentEntry = journey.stages[journey.stages.length - 1];
    if (currentEntry) {
      currentEntry.exitedAt = now;
      const entered = new Date(currentEntry.enteredAt).getTime();
      currentEntry.daysInStage = Math.round((new Date(now).getTime() - entered) / 86400000);
    }

    const fromStage = journey.currentStage;
    const daysInStage = currentEntry?.daysInStage ?? 0;

    journey.stages.push({ stage: toStage, enteredAt: now });
    journey.currentStage = toStage;

    this.bus.publish("journey.stage_advanced", { customerId, fromStage, toStage, daysInStage });

    if (toStage === "active") {
      journey.isConverted = true;
      journey.convertedAt = now;
      const started = new Date(journey.startedAt).getTime();
      journey.totalDays = Math.round((new Date(now).getTime() - started) / 86400000);
      this.bus.publish("journey.converted", { customerId, totalDays: journey.totalDays, touchpoints: journey.touchpoints.length });
    }

    return journey;
  }

  markDropped(customerId: string): CustomerJourney | undefined {
    const journey = this.journeys.get(customerId);
    if (!journey) return undefined;
    journey.isDropped = true;
    const currentEntry = journey.stages[journey.stages.length - 1];
    const daysInStage = currentEntry
      ? Math.round((Date.now() - new Date(currentEntry.enteredAt).getTime()) / 86400000)
      : 0;
    this.bus.publish("journey.dropped", { customerId, dropStage: journey.currentStage, daysInStage });
    return journey;
  }

  recordTouchpoint(input: Omit<Touchpoint, "id"> & { id?: string }): Touchpoint {
    const tp: Touchpoint = { ...input, id: input.id ?? randomUUID() };
    this.touchpoints.set(tp.id, tp);
    const journey = this.journeys.get(tp.customerId);
    if (journey) journey.touchpoints.push(tp.id);
    return tp;
  }

  getJourney(customerId: string): CustomerJourney | undefined { return this.journeys.get(customerId); }

  listJourneys(): CustomerJourney[] { return Array.from(this.journeys.values()); }

  funnelAnalysis(): FunnelAnalysis[] {
    const journeys = Array.from(this.journeys.values());
    return STAGE_ORDER.map((stage, idx) => {
      const inStage = journeys.filter((j) => j.stages.some((s) => s.stage === stage));
      const nextStage = STAGE_ORDER[idx + 1];
      const advanced = nextStage ? journeys.filter((j) => j.stages.some((s) => s.stage === nextStage)).length : 0;
      const stageDurations = journeys
        .flatMap((j) => j.stages.filter((s) => s.stage === stage && s.daysInStage !== undefined))
        .map((s) => s.daysInStage!);
      const avgDays = stageDurations.length > 0
        ? Math.round(stageDurations.reduce((a, b) => a + b, 0) / stageDurations.length)
        : 0;
      return {
        stage,
        count: inStage.length,
        enteredCount: inStage.length,
        conversionRate: inStage.length > 0 ? Math.round((advanced / inStage.length) * 100) : 0,
        avgDaysInStage: avgDays,
      };
    });
  }

  summary(): JourneySummary {
    const journeys = Array.from(this.journeys.values());
    const converted = journeys.filter((j) => j.isConverted);
    const avgConversionDays = converted.length > 0
      ? Math.round(converted.reduce((s, j) => s + (j.totalDays ?? 0), 0) / converted.length)
      : 0;
    return {
      totalJourneys: journeys.length,
      converted: converted.length,
      dropped: journeys.filter((j) => j.isDropped).length,
      active: journeys.filter((j) => !j.isConverted && !j.isDropped).length,
      avgConversionDays,
      funnel: this.funnelAnalysis(),
    };
  }
}
