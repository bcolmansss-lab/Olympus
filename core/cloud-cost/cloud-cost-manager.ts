/**
 * CloudCostManager — FinOps cloud spend tracking: per-service/account daily
 * cost ingestion, budget alerts, month-over-month anomaly detection, and
 * showback by team.
 *
 * Events:
 *   - "cloudcost.recorded": { entryId, service, amountUsd }
 *   - "cloudcost.budget_exceeded": { account, spendUsd, budgetUsd }
 *   - "cloudcost.anomaly": { service, amountUsd, baselineUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CloudProvider = "aws" | "gcp" | "azure" | "other";

export interface CostEntry {
  id: string;
  provider: CloudProvider;
  account: string;
  service: string;
  team: string;
  amountUsd: number;
  date: string;
}

export interface CloudCostSummary {
  totalEntries: number;
  totalSpendUsd: number;
  byService: Record<string, number>;
  byTeam: Record<string, number>;
  byProvider: Partial<Record<CloudProvider, number>>;
}

export class CloudCostManager {
  private entries: CostEntry[] = [];
  private budgets: Map<string, number> = new Map(); // account -> monthly budget
  private anomalyFactor: number;

  constructor(private readonly bus: EventBus, anomalyFactor = 2) {
    this.anomalyFactor = anomalyFactor;
  }

  setBudget(account: string, monthlyBudgetUsd: number): void {
    this.budgets.set(account, monthlyBudgetUsd);
  }

  record(input: { provider: CloudProvider; account: string; service: string; team: string; amountUsd: number; date: string }): CostEntry {
    // anomaly check vs prior baseline for this service before recording
    const priorForService = this.entries.filter(e => e.service === input.service);
    const baseline = priorForService.length > 0 ? priorForService.reduce((s, e) => s + e.amountUsd, 0) / priorForService.length : 0;
    const entry: CostEntry = { ...input, id: randomUUID() };
    this.entries.push(entry);
    this.bus.publish("cloudcost.recorded", { entryId: entry.id, service: entry.service, amountUsd: entry.amountUsd });
    if (baseline > 0 && input.amountUsd > baseline * this.anomalyFactor) {
      this.bus.publish("cloudcost.anomaly", { service: input.service, amountUsd: input.amountUsd, baselineUsd: Math.round(baseline * 100) / 100 });
    }
    const budget = this.budgets.get(input.account);
    if (budget !== undefined) {
      const monthSpend = this.accountSpend(input.account, input.date.slice(0, 7));
      if (monthSpend > budget) {
        this.bus.publish("cloudcost.budget_exceeded", { account: input.account, spendUsd: monthSpend, budgetUsd: budget });
      }
    }
    return entry;
  }

  accountSpend(account: string, yearMonth: string): number {
    return Math.round(this.entries.filter(e => e.account === account && e.date.startsWith(yearMonth)).reduce((s, e) => s + e.amountUsd, 0) * 100) / 100;
  }

  serviceSpend(service: string): number {
    return Math.round(this.entries.filter(e => e.service === service).reduce((s, e) => s + e.amountUsd, 0) * 100) / 100;
  }

  listEntries(service?: string, team?: string): CostEntry[] {
    let all = [...this.entries];
    if (service) all = all.filter(e => e.service === service);
    if (team) all = all.filter(e => e.team === team);
    return all;
  }

  summary(): CloudCostSummary {
    const byService: Record<string, number> = {};
    const byTeam: Record<string, number> = {};
    const byProvider: Partial<Record<CloudProvider, number>> = {};
    for (const e of this.entries) {
      byService[e.service] = Math.round(((byService[e.service] ?? 0) + e.amountUsd) * 100) / 100;
      byTeam[e.team] = Math.round(((byTeam[e.team] ?? 0) + e.amountUsd) * 100) / 100;
      byProvider[e.provider] = Math.round(((byProvider[e.provider] ?? 0) + e.amountUsd) * 100) / 100;
    }
    return {
      totalEntries: this.entries.length,
      totalSpendUsd: Math.round(this.entries.reduce((s, e) => s + e.amountUsd, 0) * 100) / 100,
      byService,
      byTeam,
      byProvider,
    };
  }
}
