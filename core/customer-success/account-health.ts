/**
 * CustomerSuccessTracker — tracks account health, churn risk, NPS, and QBR cadence.
 *
 * Health Score (0–100) per account computed from:
 *   - Product engagement (usage frequency, feature adoption)
 *   - Support ticket volume (high = unhealthy)
 *   - NPS score
 *   - Payment status (current vs overdue)
 *   - QBR recency
 *
 * Events:
 *   - "cs.account_health_updated": { accountId, name, healthScore, riskTier }
 *   - "cs.churn_risk_flagged": { accountId, name, healthScore, arrUsd, reason }
 *     when healthScore drops below churnRiskThreshold (default 40)
 *   - "cs.nps_recorded": { accountId, score, category }
 */
import type { EventBus } from "../events/event-bus.js";

export type RiskTier = "healthy" | "at-risk" | "red-zone" | "churned";
export type NPSCategory = "promoter" | "passive" | "detractor";
export type PaymentStatus = "current" | "overdue" | "suspended";

export interface AccountHealth {
  accountId: string;
  name: string;
  arrUsd: number;
  healthScore: number; // 0–100
  riskTier: RiskTier;
  /** 0–100, last NPS survey response */
  npsScore?: number;
  /** Number of open support tickets. */
  openTickets: number;
  /** Days since last meaningful product activity. */
  daysSinceLastActivity: number;
  paymentStatus: PaymentStatus;
  /** ISO date of last quarterly business review. */
  lastQbrDate?: string;
  updatedAt: string;
}

export interface AddAccountInput {
  accountId?: string;
  name: string;
  arrUsd: number;
  openTickets?: number;
  daysSinceLastActivity?: number;
  paymentStatus?: PaymentStatus;
  npsScore?: number;
  lastQbrDate?: string;
}

export interface CSSummary {
  totalAccounts: number;
  totalArrUsd: number;
  byRiskTier: Record<RiskTier, { count: number; arrUsd: number }>;
  averageHealthScore: number;
  churnRiskArrUsd: number; // ARR in at-risk + red-zone + churned
}

export class CustomerSuccessTracker {
  private readonly accounts = new Map<string, AccountHealth>();
  private seq = 0;
  private readonly churnRiskThreshold: number;

  constructor(
    private readonly bus: EventBus,
    opts?: { churnRiskThreshold?: number },
  ) {
    this.churnRiskThreshold = opts?.churnRiskThreshold ?? 40;
  }

  private nextId(): string {
    return `cs-acct-${++this.seq}`;
  }

  private computeHealthScore(account: Omit<AccountHealth, "healthScore" | "riskTier" | "updatedAt">): number {
    let score = 100;

    // Support ticket penalty (max -30)
    score -= Math.min(30, account.openTickets * 5);

    // Inactivity penalty (max -25), only kicks in after 7 days
    score -= Math.min(25, Math.max(0, account.daysSinceLastActivity - 7) * 1);

    // Payment status penalty
    if (account.paymentStatus === "overdue") {
      score -= 20;
    } else if (account.paymentStatus === "suspended") {
      score -= 40;
    }

    // NPS bonus/penalty: NPS 0 = -10, NPS 100 = +10
    if (account.npsScore !== undefined) {
      score += (account.npsScore / 100) * 20 - 10;
    }

    // QBR recency — penalize if no QBR in 90 days
    if (!account.lastQbrDate) {
      score -= 10;
    } else {
      const daysSinceQbr = (Date.now() - new Date(account.lastQbrDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceQbr > 90) {
        score -= 10;
      }
    }

    // Clamp to [0, 100]
    return Math.max(0, Math.min(100, score));
  }

  private assignRiskTier(score: number): RiskTier {
    if (score >= 70) return "healthy";
    if (score >= 50) return "at-risk";
    if (score >= 30) return "red-zone";
    return "churned";
  }

  private npsCategory(score: number): NPSCategory {
    if (score >= 70) return "promoter";
    if (score >= 50) return "passive";
    return "detractor";
  }

  addAccount(input: AddAccountInput): AccountHealth {
    const accountId = input.accountId ?? this.nextId();
    const partial = {
      accountId,
      name: input.name,
      arrUsd: input.arrUsd,
      npsScore: input.npsScore,
      openTickets: input.openTickets ?? 0,
      daysSinceLastActivity: input.daysSinceLastActivity ?? 0,
      paymentStatus: input.paymentStatus ?? "current",
      lastQbrDate: input.lastQbrDate,
    };
    const healthScore = this.computeHealthScore(partial);
    const riskTier = this.assignRiskTier(healthScore);
    const account: AccountHealth = {
      ...partial,
      healthScore,
      riskTier,
      updatedAt: new Date().toISOString(),
    };
    this.accounts.set(accountId, account);

    this.bus.publish("cs.account_health_updated", {
      accountId: account.accountId,
      name: account.name,
      healthScore: account.healthScore,
      riskTier: account.riskTier,
    });

    if (healthScore < this.churnRiskThreshold) {
      this.bus.publish("cs.churn_risk_flagged", {
        accountId: account.accountId,
        name: account.name,
        healthScore: account.healthScore,
        arrUsd: account.arrUsd,
        reason: `Health score ${healthScore} below threshold ${this.churnRiskThreshold}`,
      });
    }

    return account;
  }

  updateAccount(
    accountId: string,
    updates: Partial<Omit<AccountHealth, "accountId" | "name" | "healthScore" | "riskTier" | "updatedAt">>,
  ): AccountHealth | undefined {
    const existing = this.accounts.get(accountId);
    if (!existing) return undefined;

    const merged = { ...existing, ...updates };
    const healthScore = this.computeHealthScore(merged);
    const riskTier = this.assignRiskTier(healthScore);
    const account: AccountHealth = {
      ...merged,
      healthScore,
      riskTier,
      updatedAt: new Date().toISOString(),
    };
    this.accounts.set(accountId, account);

    this.bus.publish("cs.account_health_updated", {
      accountId: account.accountId,
      name: account.name,
      healthScore: account.healthScore,
      riskTier: account.riskTier,
    });

    if (healthScore < this.churnRiskThreshold) {
      this.bus.publish("cs.churn_risk_flagged", {
        accountId: account.accountId,
        name: account.name,
        healthScore: account.healthScore,
        arrUsd: account.arrUsd,
        reason: `Health score ${healthScore} below threshold ${this.churnRiskThreshold}`,
      });
    }

    return account;
  }

  recordNPS(accountId: string, npsScore: number): AccountHealth | undefined {
    const existing = this.accounts.get(accountId);
    if (!existing) return undefined;

    const merged = { ...existing, npsScore };
    const healthScore = this.computeHealthScore(merged);
    const riskTier = this.assignRiskTier(healthScore);
    const account: AccountHealth = {
      ...merged,
      healthScore,
      riskTier,
      updatedAt: new Date().toISOString(),
    };
    this.accounts.set(accountId, account);

    this.bus.publish("cs.nps_recorded", {
      accountId: account.accountId,
      score: npsScore,
      category: this.npsCategory(npsScore),
    });

    this.bus.publish("cs.account_health_updated", {
      accountId: account.accountId,
      name: account.name,
      healthScore: account.healthScore,
      riskTier: account.riskTier,
    });

    return account;
  }

  recordQBR(accountId: string): AccountHealth | undefined {
    return this.updateAccount(accountId, { lastQbrDate: new Date().toISOString().split("T")[0]! });
  }

  get(accountId: string): AccountHealth | undefined {
    return this.accounts.get(accountId);
  }

  list(riskTier?: RiskTier): AccountHealth[] {
    const all = Array.from(this.accounts.values());
    if (riskTier === undefined) return all;
    return all.filter((a) => a.riskTier === riskTier);
  }

  summary(): CSSummary {
    const all = Array.from(this.accounts.values());
    const byRiskTier: Record<RiskTier, { count: number; arrUsd: number }> = {
      healthy: { count: 0, arrUsd: 0 },
      "at-risk": { count: 0, arrUsd: 0 },
      "red-zone": { count: 0, arrUsd: 0 },
      churned: { count: 0, arrUsd: 0 },
    };

    let totalArrUsd = 0;
    let totalHealthScore = 0;

    for (const a of all) {
      totalArrUsd += a.arrUsd;
      totalHealthScore += a.healthScore;
      byRiskTier[a.riskTier].count++;
      byRiskTier[a.riskTier].arrUsd += a.arrUsd;
    }

    const churnRiskArrUsd =
      byRiskTier["at-risk"].arrUsd + byRiskTier["red-zone"].arrUsd + byRiskTier["churned"].arrUsd;

    return {
      totalAccounts: all.length,
      totalArrUsd,
      byRiskTier,
      averageHealthScore: all.length > 0 ? totalHealthScore / all.length : 0,
      churnRiskArrUsd,
    };
  }

  churnRiskAccounts(): AccountHealth[] {
    return this.list()
      .filter((a) => a.riskTier === "at-risk" || a.riskTier === "red-zone" || a.riskTier === "churned")
      .sort((a, b) => b.arrUsd - a.arrUsd);
  }
}
