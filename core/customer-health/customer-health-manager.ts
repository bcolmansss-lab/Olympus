/**
 * CustomerHealthManager — composite account health scoring: weighted signal
 * dimensions (usage, support, engagement, billing), trend detection, and
 * red/yellow/green banding with change alerts.
 *
 * Events:
 *   - "customerhealth.scored": { accountId, score, band }
 *   - "customerhealth.band_changed": { accountId, fromBand, toBand }
 *   - "customerhealth.red_alert": { accountId, score }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type HealthBand = "green" | "yellow" | "red";

export interface HealthSignal {
  dimension: string; // usage, support, engagement, billing
  scorePct: number;  // 0-100
  weight: number;
}

export interface HealthSnapshot {
  id: string;
  accountId: string;
  score: number;
  band: HealthBand;
  signals: HealthSignal[];
  at: string;
}

export interface CustomerHealthSummary {
  totalAccounts: number;
  green: number;
  yellow: number;
  red: number;
  avgScore: number;
  decliningAccounts: number;
}

export class CustomerHealthManager {
  private snapshots: Map<string, HealthSnapshot[]> = new Map(); // accountId -> history

  constructor(private readonly bus: EventBus) {}

  private bandFor(score: number): HealthBand {
    if (score >= 70) return "green";
    if (score >= 40) return "yellow";
    return "red";
  }

  record(accountId: string, signals: HealthSignal[], at: string): HealthSnapshot {
    const totalWeight = signals.reduce((s, x) => s + x.weight, 0) || 1;
    const score = Math.round(signals.reduce((s, x) => s + x.scorePct * x.weight, 0) / totalWeight);
    const band = this.bandFor(score);
    const snapshot: HealthSnapshot = { id: randomUUID(), accountId, score, band, signals, at };
    const history = this.snapshots.get(accountId) ?? [];
    const prevBand = history.length > 0 ? history[history.length - 1]!.band : undefined;
    history.push(snapshot);
    this.snapshots.set(accountId, history);
    this.bus.publish("customerhealth.scored", { accountId, score, band });
    if (prevBand && prevBand !== band) {
      this.bus.publish("customerhealth.band_changed", { accountId, fromBand: prevBand, toBand: band });
    }
    if (band === "red") {
      this.bus.publish("customerhealth.red_alert", { accountId, score });
    }
    return snapshot;
  }

  latest(accountId: string): HealthSnapshot | undefined {
    const history = this.snapshots.get(accountId);
    return history && history.length > 0 ? history[history.length - 1] : undefined;
  }

  trend(accountId: string): number[] {
    return (this.snapshots.get(accountId) ?? []).map(s => s.score);
  }

  isDeclining(accountId: string): boolean {
    const scores = this.trend(accountId);
    if (scores.length < 2) return false;
    return scores[scores.length - 1]! < scores[scores.length - 2]!;
  }

  listAccounts(band?: HealthBand): { accountId: string; snapshot: HealthSnapshot }[] {
    const out: { accountId: string; snapshot: HealthSnapshot }[] = [];
    for (const [accountId] of this.snapshots) {
      const snapshot = this.latest(accountId);
      if (snapshot && (!band || snapshot.band === band)) out.push({ accountId, snapshot });
    }
    return out;
  }

  summary(): CustomerHealthSummary {
    const latests = this.listAccounts().map(a => a.snapshot);
    const declining = Array.from(this.snapshots.keys()).filter(id => this.isDeclining(id)).length;
    return {
      totalAccounts: latests.length,
      green: latests.filter(s => s.band === "green").length,
      yellow: latests.filter(s => s.band === "yellow").length,
      red: latests.filter(s => s.band === "red").length,
      avgScore: latests.length > 0 ? Math.round(latests.reduce((s, x) => s + x.score, 0) / latests.length) : 0,
      decliningAccounts: declining,
    };
  }
}
