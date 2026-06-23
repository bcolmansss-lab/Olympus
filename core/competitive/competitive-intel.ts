/**
 * CompetitiveIntel — tracks competitors, win/loss analysis, and market signals.
 *
 * Events:
 *   - "competitive.signal_added": { signalId, competitor, type, sentiment }
 *   - "competitive.win_loss_recorded": { dealId, outcome, competitor, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SignalType = "pricing_change" | "product_launch" | "funding" | "exec_hire" | "partnership" | "news" | "customer_win" | "customer_loss";
export type Sentiment = "positive" | "neutral" | "negative"; // positive = good for us (competitor struggling)
export type WinLossOutcome = "win" | "loss" | "no_decision";

export interface Competitor {
  id: string;
  name: string;
  website?: string;
  /** Our estimated win rate against this competitor (0–1). */
  winRate: number;
  tags?: string[];
  addedAt: string;
}

export interface CompetitiveSignal {
  id: string;
  competitorId: string;
  type: SignalType;
  title: string;
  summary: string;
  sentiment: Sentiment;
  source?: string;
  recordedAt: string;
}

export interface WinLossRecord {
  id: string;
  dealId: string;
  competitorId: string;
  outcome: WinLossOutcome;
  reason: string;
  dealArrUsd?: number;
  recordedAt: string;
}

export interface CompetitorSummary {
  competitor: Competitor;
  signals: CompetitiveSignal[];
  winLoss: WinLossRecord[];
  wins: number;
  losses: number;
  computedWinRate: number; // wins / (wins + losses) or 0
}

export class CompetitiveIntel {
  private readonly competitors = new Map<string, Competitor>();
  private readonly signals: CompetitiveSignal[] = [];
  private readonly winLossRecords: WinLossRecord[] = [];

  constructor(private readonly bus: EventBus) {}

  addCompetitor(input: Omit<Competitor, "id" | "winRate" | "addedAt"> & { id?: string }): Competitor {
    const competitor: Competitor = {
      id: input.id ?? randomUUID(),
      name: input.name,
      website: input.website,
      winRate: 0,
      tags: input.tags,
      addedAt: new Date().toISOString(),
    };
    this.competitors.set(competitor.id, competitor);
    return competitor;
  }

  addSignal(input: Omit<CompetitiveSignal, "id" | "recordedAt">): CompetitiveSignal | undefined {
    const competitor = this.competitors.get(input.competitorId);
    if (!competitor) return undefined;

    const signal: CompetitiveSignal = {
      id: randomUUID(),
      competitorId: input.competitorId,
      type: input.type,
      title: input.title,
      summary: input.summary,
      sentiment: input.sentiment,
      source: input.source,
      recordedAt: new Date().toISOString(),
    };
    this.signals.push(signal);

    this.bus.publish("competitive.signal_added", {
      signalId: signal.id,
      competitor: competitor.name,
      type: signal.type,
      sentiment: signal.sentiment,
    });

    return signal;
  }

  recordWinLoss(input: Omit<WinLossRecord, "id" | "recordedAt">): WinLossRecord | undefined {
    const competitor = this.competitors.get(input.competitorId);
    if (!competitor) return undefined;

    const record: WinLossRecord = {
      id: randomUUID(),
      dealId: input.dealId,
      competitorId: input.competitorId,
      outcome: input.outcome,
      reason: input.reason,
      dealArrUsd: input.dealArrUsd,
      recordedAt: new Date().toISOString(),
    };
    this.winLossRecords.push(record);

    // Recompute win rate from all records for this competitor
    const forCompetitor = this.winLossRecords.filter((r) => r.competitorId === input.competitorId);
    const wins = forCompetitor.filter((r) => r.outcome === "win").length;
    const losses = forCompetitor.filter((r) => r.outcome === "loss").length;
    const total = wins + losses;
    competitor.winRate = total > 0 ? wins / total : 0;

    this.bus.publish("competitive.win_loss_recorded", {
      dealId: record.dealId,
      outcome: record.outcome,
      competitor: competitor.name,
      reason: record.reason,
    });

    return record;
  }

  getCompetitor(id: string): Competitor | undefined {
    return this.competitors.get(id);
  }

  listCompetitors(): Competitor[] {
    return Array.from(this.competitors.values());
  }

  signalsFor(competitorId: string): CompetitiveSignal[] {
    return this.signals.filter((s) => s.competitorId === competitorId);
  }

  winLossFor(competitorId: string): WinLossRecord[] {
    return this.winLossRecords.filter((r) => r.competitorId === competitorId);
  }

  summaryFor(competitorId: string): CompetitorSummary | undefined {
    const competitor = this.competitors.get(competitorId);
    if (!competitor) return undefined;

    const signals = this.signalsFor(competitorId);
    const winLoss = this.winLossFor(competitorId);
    const wins = winLoss.filter((r) => r.outcome === "win").length;
    const losses = winLoss.filter((r) => r.outcome === "loss").length;
    const total = wins + losses;
    const computedWinRate = total > 0 ? wins / total : 0;

    return { competitor, signals, winLoss, wins, losses, computedWinRate };
  }

  recentSignals(n = 10): CompetitiveSignal[] {
    return [...this.signals]
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, n);
  }
}
