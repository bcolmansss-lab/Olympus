/**
 * ChurnSaveManager — proactive retention: at-risk accounts flagged for save
 * plays, retention offer assignment, save-attempt outcomes, and saved-ARR
 * analytics.
 *
 * Events:
 *   - "churnsave.case_opened": { caseId, accountId, riskScore, arrAtRiskUsd }
 *   - "churnsave.offer_extended": { caseId, offer, discountPct }
 *   - "churnsave.saved": { caseId, savedArrUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SaveStatus = "open" | "offer_extended" | "saved" | "lost";
export type SavePlay = "discount" | "downgrade" | "pause" | "exec_sponsor" | "feature_commit";

export interface ChurnSaveCase {
  id: string;
  accountId: string;
  accountName: string;
  riskScore: number; // 0-100
  arrAtRiskUsd: number;
  reason: string;
  status: SaveStatus;
  play?: SavePlay;
  discountPct?: number;
  savedArrUsd?: number;
  openedAt: string;
  resolvedAt?: string;
}

export interface ChurnSaveSummary {
  totalCases: number;
  open: number;
  saved: number;
  lost: number;
  saveRatePct: number;
  savedArrUsd: number;
  lostArrUsd: number;
}

export class ChurnSaveManager {
  private cases: Map<string, ChurnSaveCase> = new Map();

  constructor(private readonly bus: EventBus) {}

  openCase(input: { accountId: string; accountName: string; riskScore: number; arrAtRiskUsd: number; reason: string }): ChurnSaveCase {
    const c: ChurnSaveCase = { ...input, id: randomUUID(), status: "open", openedAt: new Date().toISOString() };
    this.cases.set(c.id, c);
    this.bus.publish("churnsave.case_opened", { caseId: c.id, accountId: c.accountId, riskScore: c.riskScore, arrAtRiskUsd: c.arrAtRiskUsd });
    return c;
  }

  extendOffer(caseId: string, play: SavePlay, discountPct = 0): ChurnSaveCase | undefined {
    const c = this.cases.get(caseId);
    if (!c || (c.status !== "open" && c.status !== "offer_extended")) return undefined;
    c.status = "offer_extended";
    c.play = play;
    c.discountPct = discountPct;
    this.bus.publish("churnsave.offer_extended", { caseId, offer: play, discountPct });
    return c;
  }

  markSaved(caseId: string, savedArrUsd: number, asOf: string): ChurnSaveCase | undefined {
    const c = this.cases.get(caseId);
    if (!c || c.status === "saved" || c.status === "lost") return undefined;
    c.status = "saved";
    c.savedArrUsd = savedArrUsd;
    c.resolvedAt = asOf;
    this.bus.publish("churnsave.saved", { caseId, savedArrUsd });
    return c;
  }

  markLost(caseId: string, asOf: string): ChurnSaveCase | undefined {
    const c = this.cases.get(caseId);
    if (!c || c.status === "saved" || c.status === "lost") return undefined;
    c.status = "lost";
    c.savedArrUsd = 0;
    c.resolvedAt = asOf;
    return c;
  }

  getCase(id: string): ChurnSaveCase | undefined { return this.cases.get(id); }
  listCases(status?: SaveStatus): ChurnSaveCase[] {
    const all = Array.from(this.cases.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): ChurnSaveSummary {
    const cases = Array.from(this.cases.values());
    const saved = cases.filter(c => c.status === "saved");
    const lost = cases.filter(c => c.status === "lost");
    const resolved = saved.length + lost.length;
    return {
      totalCases: cases.length,
      open: cases.filter(c => c.status === "open" || c.status === "offer_extended").length,
      saved: saved.length,
      lost: lost.length,
      saveRatePct: resolved > 0 ? Math.round((saved.length / resolved) * 100) : 0,
      savedArrUsd: Math.round(saved.reduce((s, c) => s + (c.savedArrUsd ?? 0), 0) * 100) / 100,
      lostArrUsd: Math.round(lost.reduce((s, c) => s + c.arrAtRiskUsd, 0) * 100) / 100,
    };
  }
}
