/**
 * SalesIntelligence — account intelligence, buying signals, contact enrichment,
 * territory management, quota tracking, and sales activity logging.
 *
 * Events:
 *   - "sales.buying_signal": { accountId, signal, score, detectedAt }
 *   - "sales.quota_achieved": { repId, period, achievedPct }
 *   - "sales.territory_assigned": { repId, territory, accountCount }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SignalType = "job_change" | "funding_round" | "expansion" | "tech_change" | "intent_data" | "social_mention" | "renewal_risk";
export type ActivityType = "call" | "email" | "meeting" | "demo" | "proposal" | "negotiation" | "close";

export interface BuyingSignal {
  id: string;
  accountId: string;
  type: SignalType;
  score: number; // 0-100
  description: string;
  detectedAt: string;
  source: string;
}

export interface SalesActivity {
  id: string;
  accountId: string;
  repId: string;
  type: ActivityType;
  notes: string;
  outcome?: string;
  occurredAt: string;
  nextStepDate?: string;
}

export interface QuotaRecord {
  id: string;
  repId: string;
  period: string; // e.g. "2026-Q3"
  targetUsd: number;
  achievedUsd: number;
  achievedPct: number;
}

export interface Territory {
  id: string;
  name: string;
  repId: string;
  regions: string[];
  accountIds: string[];
  createdAt: string;
}

export interface SalesIntelSummary {
  totalSignals: number;
  highScoreSignals: number;
  totalActivities: number;
  avgQuotaAchievementPct: number;
  territories: number;
}

export class SalesIntelligence {
  private signals: Map<string, BuyingSignal> = new Map();
  private activities: Map<string, SalesActivity> = new Map();
  private quotas: Map<string, QuotaRecord> = new Map();
  private territories: Map<string, Territory> = new Map();

  constructor(private readonly bus: EventBus) {}

  recordSignal(input: Omit<BuyingSignal, "id"> & { id?: string }): BuyingSignal {
    const signal: BuyingSignal = { ...input, id: input.id ?? randomUUID() };
    this.signals.set(signal.id, signal);
    if (signal.score >= 70) {
      this.bus.publish("sales.buying_signal", { accountId: signal.accountId, signal: signal.type, score: signal.score, detectedAt: signal.detectedAt });
    }
    return signal;
  }

  logActivity(input: Omit<SalesActivity, "id"> & { id?: string }): SalesActivity {
    const activity: SalesActivity = { ...input, id: input.id ?? randomUUID() };
    this.activities.set(activity.id, activity);
    return activity;
  }

  setQuota(repId: string, period: string, targetUsd: number): QuotaRecord {
    const existing = Array.from(this.quotas.values()).find((q) => q.repId === repId && q.period === period);
    if (existing) { existing.targetUsd = targetUsd; return existing; }
    const record: QuotaRecord = { id: randomUUID(), repId, period, targetUsd, achievedUsd: 0, achievedPct: 0 };
    this.quotas.set(record.id, record);
    return record;
  }

  recordAttainment(repId: string, period: string, achievedUsd: number): QuotaRecord | undefined {
    const record = Array.from(this.quotas.values()).find((q) => q.repId === repId && q.period === period);
    if (!record) return undefined;
    record.achievedUsd = achievedUsd;
    record.achievedPct = Math.round((achievedUsd / record.targetUsd) * 100);
    if (record.achievedPct >= 100) {
      this.bus.publish("sales.quota_achieved", { repId, period, achievedPct: record.achievedPct });
    }
    return record;
  }

  assignTerritory(input: Omit<Territory, "id" | "createdAt"> & { id?: string }): Territory {
    const territory: Territory = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.territories.set(territory.id, territory);
    this.bus.publish("sales.territory_assigned", { repId: territory.repId, territory: territory.name, accountCount: territory.accountIds.length });
    return territory;
  }

  listSignals(accountId?: string): BuyingSignal[] {
    const all = Array.from(this.signals.values());
    return accountId ? all.filter((s) => s.accountId === accountId) : all;
  }

  listActivities(repId?: string): SalesActivity[] {
    const all = Array.from(this.activities.values());
    return repId ? all.filter((a) => a.repId === repId) : all;
  }

  listQuotas(repId?: string): QuotaRecord[] {
    const all = Array.from(this.quotas.values());
    return repId ? all.filter((q) => q.repId === repId) : all;
  }

  summary(): SalesIntelSummary {
    const signals = Array.from(this.signals.values());
    const quotas = Array.from(this.quotas.values());
    const avgQuota = quotas.length > 0 ? Math.round(quotas.reduce((s, q) => s + q.achievedPct, 0) / quotas.length) : 0;
    return {
      totalSignals: signals.length,
      highScoreSignals: signals.filter((s) => s.score >= 70).length,
      totalActivities: this.activities.size,
      avgQuotaAchievementPct: avgQuota,
      territories: this.territories.size,
    };
  }
}
