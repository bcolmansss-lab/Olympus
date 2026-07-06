/**
 * MarketResearch — market sizing, competitive analysis, survey management,
 * TAM/SAM/SOM modeling, and win/loss tracking.
 *
 * Events:
 *   - "market.study_published": { studyId, title, tam, sam, som }
 *   - "market.win_loss_recorded": { dealId, outcome, competitor, reason }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type StudyType = "tam_sam_som" | "competitive" | "survey" | "win_loss" | "segment" | "trend";
export type WinLossOutcome = "won" | "lost" | "no_decision" | "deferred";

export interface MarketStudy {
  id: string;
  title: string;
  type: StudyType;
  status: "draft" | "in_progress" | "published" | "archived";
  summary: string;
  tamUsd?: number;
  samUsd?: number;
  somUsd?: number;
  confidence: number; // 0-100
  publishedAt?: string;
  createdAt: string;
  tags: string[];
}

export interface WinLossRecord {
  id: string;
  dealId: string;
  outcome: WinLossOutcome;
  competitor?: string;
  reason: string;
  dealValueUsd: number;
  segment: string;
  recordedAt: string;
  notes?: string;
}

export interface CompetitorProfile {
  id: string;
  name: string;
  category: string;
  strengths: string[];
  weaknesses: string[];
  estimatedArrUsd?: number;
  winRateAgainstUs: number; // 0-100
  updatedAt: string;
}

export interface MarketResearchSummary {
  totalStudies: number;
  publishedStudies: number;
  totalWinLoss: number;
  winRate: number; // %
  avgDealValueUsd: number;
  topCompetitors: string[];
}

export class MarketResearch {
  private studies: Map<string, MarketStudy> = new Map();
  private winLoss: Map<string, WinLossRecord> = new Map();
  private competitors: Map<string, CompetitorProfile> = new Map();

  constructor(private readonly bus: EventBus) {}

  createStudy(input: Omit<MarketStudy, "id" | "createdAt"> & { id?: string }): MarketStudy {
    const study: MarketStudy = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.studies.set(study.id, study);
    return study;
  }

  publishStudy(studyId: string): MarketStudy | undefined {
    const study = this.studies.get(studyId);
    if (!study) return undefined;
    study.status = "published";
    study.publishedAt = new Date().toISOString();
    this.bus.publish("market.study_published", { studyId, title: study.title, tam: study.tamUsd, sam: study.samUsd, som: study.somUsd });
    return study;
  }

  recordWinLoss(input: Omit<WinLossRecord, "id" | "recordedAt"> & { id?: string }): WinLossRecord {
    const record: WinLossRecord = { ...input, id: input.id ?? randomUUID(), recordedAt: new Date().toISOString() };
    this.winLoss.set(record.id, record);
    this.bus.publish("market.win_loss_recorded", { dealId: record.dealId, outcome: record.outcome, competitor: record.competitor, reason: record.reason });
    return record;
  }

  upsertCompetitor(input: Omit<CompetitorProfile, "id" | "updatedAt"> & { id?: string }): CompetitorProfile {
    const existing = input.id ? this.competitors.get(input.id) : undefined;
    const profile: CompetitorProfile = { ...input, id: input.id ?? randomUUID(), updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, profile);
    else this.competitors.set(profile.id, profile);
    return profile;
  }

  getStudy(id: string): MarketStudy | undefined { return this.studies.get(id); }
  listStudies(status?: MarketStudy["status"]): MarketStudy[] {
    const all = Array.from(this.studies.values());
    return status ? all.filter((s) => s.status === status) : all;
  }

  listWinLoss(outcome?: WinLossOutcome): WinLossRecord[] {
    const all = Array.from(this.winLoss.values());
    return outcome ? all.filter((r) => r.outcome === outcome) : all;
  }

  listCompetitors(): CompetitorProfile[] { return Array.from(this.competitors.values()); }

  summary(): MarketResearchSummary {
    const wl = Array.from(this.winLoss.values());
    const won = wl.filter((r) => r.outcome === "won");
    const closed = wl.filter((r) => r.outcome === "won" || r.outcome === "lost");
    const winRate = closed.length > 0 ? Math.round((won.length / closed.length) * 100) : 0;
    const avgDeal = wl.length > 0 ? Math.round(wl.reduce((s, r) => s + r.dealValueUsd, 0) / wl.length) : 0;
    const competitorCounts: Record<string, number> = {};
    for (const r of wl) { if (r.competitor) competitorCounts[r.competitor] = (competitorCounts[r.competitor] ?? 0) + 1; }
    const topCompetitors = Object.entries(competitorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    const studies = Array.from(this.studies.values());
    return {
      totalStudies: studies.length,
      publishedStudies: studies.filter((s) => s.status === "published").length,
      totalWinLoss: wl.length,
      winRate,
      avgDealValueUsd: avgDeal,
      topCompetitors,
    };
  }
}
