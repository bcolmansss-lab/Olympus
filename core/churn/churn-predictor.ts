/**
 * ChurnPredictor — rule-based churn scoring, early warning signals, and retention playbooks.
 *
 * Scoring model: weighted signals → risk score 0-100
 * Signals: engagement drop, support tickets, NPS decline, payment failures, usage drop, contract age
 *
 * Events:
 *   - "churn.risk_scored": { accountId, score, tier, signals }
 *   - "churn.playbook_triggered": { accountId, playbookId, reason }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ChurnRiskTier = "low" | "medium" | "high" | "critical"; // <25, 25-50, 50-75, 75+
export type SignalType =
  | "engagement_drop"
  | "support_escalation"
  | "nps_decline"
  | "payment_failure"
  | "usage_drop"
  | "champion_left"
  | "competitive_eval"
  | "contract_aging";

export interface ChurnSignal {
  type: SignalType;
  accountId: string;
  severity: 1 | 2 | 3; // 1=low, 3=critical
  detail: string;
  detectedAt: string;
}

export interface ChurnScore {
  accountId: string;
  score: number; // 0-100
  tier: ChurnRiskTier;
  signals: ChurnSignal[];
  scoredAt: string;
  recommendedPlaybook?: string;
}

export interface RetentionPlaybook {
  id: string;
  name: string;
  triggerTier: ChurnRiskTier;
  steps: string[];
  owner: string;
}

export interface ChurnSummary {
  totalScored: number;
  byTier: Record<ChurnRiskTier, number>;
  avgScore: number;
  highRiskAccountIds: string[];
  playbooksTriggered: number;
}

const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  engagement_drop: 15,
  support_escalation: 10,
  nps_decline: 12,
  payment_failure: 20,
  usage_drop: 15,
  champion_left: 18,
  competitive_eval: 16,
  contract_aging: 5,
};

const TIER_ORDER: ChurnRiskTier[] = ["low", "medium", "high", "critical"];

function scoreToTier(score: number): ChurnRiskTier {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export class ChurnPredictor {
  private scores = new Map<string, ChurnScore>();
  private playbooks = new Map<string, RetentionPlaybook>();
  private signals: ChurnSignal[] = [];
  private playbooksTriggeredCount = 0;

  constructor(private readonly bus: EventBus) {}

  addPlaybook(input: Omit<RetentionPlaybook, "id"> & { id?: string }): RetentionPlaybook {
    const playbook: RetentionPlaybook = {
      id: input.id ?? randomUUID(),
      name: input.name,
      triggerTier: input.triggerTier,
      steps: input.steps,
      owner: input.owner,
    };
    this.playbooks.set(playbook.id, playbook);
    return playbook;
  }

  recordSignal(signal: Omit<ChurnSignal, "detectedAt"> & { detectedAt?: string }): ChurnSignal {
    const stored: ChurnSignal = {
      type: signal.type,
      accountId: signal.accountId,
      severity: signal.severity,
      detail: signal.detail,
      detectedAt: signal.detectedAt ?? new Date().toISOString(),
    };
    this.signals.push(stored);
    return stored;
  }

  scoreAccount(accountId: string): ChurnScore {
    const accountSignals = this.signals.filter((s) => s.accountId === accountId);

    const rawScore = accountSignals.reduce((sum, s) => {
      const weight = SIGNAL_WEIGHTS[s.type] ?? 0;
      return sum + s.severity * weight;
    }, 0);

    const score = Math.min(100, Math.max(0, rawScore));
    const tier = scoreToTier(score);

    // Find playbook matching tier or next higher tier
    let recommendedPlaybook: string | undefined;
    const tierIdx = TIER_ORDER.indexOf(tier);
    for (let i = tierIdx; i < TIER_ORDER.length; i++) {
      const t = TIER_ORDER[i]!;
      const pb = Array.from(this.playbooks.values()).find((p) => p.triggerTier === t);
      if (pb) {
        recommendedPlaybook = pb.id;
        break;
      }
    }

    const churnScore: ChurnScore = {
      accountId,
      score,
      tier,
      signals: accountSignals,
      scoredAt: new Date().toISOString(),
      recommendedPlaybook,
    };
    this.scores.set(accountId, churnScore);

    this.bus.publish("churn.risk_scored", {
      accountId,
      score,
      tier,
      signals: accountSignals,
    });

    if ((tier === "high" || tier === "critical") && recommendedPlaybook) {
      this.playbooksTriggeredCount++;
      this.bus.publish("churn.playbook_triggered", {
        accountId,
        playbookId: recommendedPlaybook,
        reason: `Account scored ${score} (${tier})`,
      });
    }

    return churnScore;
  }

  getScore(accountId: string): ChurnScore | undefined {
    return this.scores.get(accountId);
  }

  listScores(tier?: ChurnRiskTier): ChurnScore[] {
    const list = Array.from(this.scores.values());
    if (tier !== undefined) return list.filter((s) => s.tier === tier);
    return list;
  }

  getPlaybook(id: string): RetentionPlaybook | undefined {
    return this.playbooks.get(id);
  }

  listPlaybooks(): RetentionPlaybook[] {
    return Array.from(this.playbooks.values());
  }

  summary(): ChurnSummary {
    const scores = Array.from(this.scores.values());
    const byTier: Record<ChurnRiskTier, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const s of scores) {
      byTier[s.tier]++;
    }
    const avgScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
      : 0;
    const highRiskAccountIds = scores
      .filter((s) => s.tier === "high" || s.tier === "critical")
      .map((s) => s.accountId);

    return {
      totalScored: scores.length,
      byTier,
      avgScore,
      highRiskAccountIds,
      playbooksTriggered: this.playbooksTriggeredCount,
    };
  }
}
