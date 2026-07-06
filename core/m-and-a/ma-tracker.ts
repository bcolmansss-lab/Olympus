/**
 * MATracker — merger & acquisition deal tracking, due diligence checklists,
 * valuation modeling, integration planning, and closing milestones.
 *
 * Events:
 *   - "ma.deal_opened": { dealId, targetName, dealType, estimatedValueUsd }
 *   - "ma.due_diligence_completed": { dealId, targetName, score }
 *   - "ma.deal_closed": { dealId, targetName, finalValueUsd, outcome }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DealType = "acquisition" | "merger" | "strategic_investment" | "divestiture" | "joint_venture";
export type DealStatus = "identifying" | "nda_signed" | "loi_signed" | "due_diligence" | "negotiating" | "closed" | "terminated";

export interface DDItem {
  id: string;
  dealId: string;
  category: string;
  title: string;
  completed: boolean;
  risk?: "low" | "medium" | "high";
  notes?: string;
}

export interface ValuationModel {
  method: "dcf" | "ebitda_multiple" | "revenue_multiple" | "asset_based";
  valueUsd: number;
  assumptions: Record<string, number>;
}

export interface MADeal {
  id: string;
  targetName: string;
  targetDescription: string;
  dealType: DealType;
  status: DealStatus;
  estimatedValueUsd: number;
  finalValueUsd?: number;
  leadAdvisor: string;
  ddItems: string[]; // DDItem IDs
  valuations: ValuationModel[];
  synergiesUsd?: number;
  integrationPlanNotes: string;
  outcome?: "completed" | "terminated" | "withdrawn";
  createdAt: string;
  closedAt?: string;
}

export interface MASummary {
  totalDeals: number;
  activeDeals: number;
  closedDeals: number;
  totalEstimatedValueUsd: number;
  avgDueDiligenceCompletionPct: number;
}

export class MATracker {
  private deals: Map<string, MADeal> = new Map();
  private ddItems: Map<string, DDItem> = new Map();

  constructor(private readonly bus: EventBus) {}

  openDeal(input: Omit<MADeal, "id" | "ddItems" | "valuations" | "createdAt"> & { id?: string }): MADeal {
    const deal: MADeal = {
      ...input,
      id: input.id ?? randomUUID(),
      ddItems: [],
      valuations: [],
      createdAt: new Date().toISOString(),
    };
    this.deals.set(deal.id, deal);
    this.bus.publish("ma.deal_opened", { dealId: deal.id, targetName: deal.targetName, dealType: deal.dealType, estimatedValueUsd: deal.estimatedValueUsd });
    return deal;
  }

  addDDItem(input: Omit<DDItem, "id"> & { id?: string }): DDItem | undefined {
    const deal = this.deals.get(input.dealId);
    if (!deal) return undefined;
    const item: DDItem = { ...input, id: input.id ?? randomUUID() };
    this.ddItems.set(item.id, item);
    deal.ddItems.push(item.id);
    return item;
  }

  completeDDItem(itemId: string, risk?: DDItem["risk"], notes?: string): DDItem | undefined {
    const item = this.ddItems.get(itemId);
    if (!item) return undefined;
    item.completed = true;
    if (risk) item.risk = risk;
    if (notes) item.notes = notes;

    // Check if all DD items for the deal are complete
    const deal = this.deals.get(item.dealId);
    if (deal) {
      const allItems = deal.ddItems.map((id) => this.ddItems.get(id)).filter(Boolean) as DDItem[];
      const allDone = allItems.length > 0 && allItems.every((i) => i.completed);
      if (allDone) {
        const highRisk = allItems.filter((i) => i.risk === "high").length;
        const score = Math.max(0, 100 - highRisk * 15);
        this.bus.publish("ma.due_diligence_completed", { dealId: deal.id, targetName: deal.targetName, score });
      }
    }
    return item;
  }

  addValuation(dealId: string, valuation: ValuationModel): MADeal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal) return undefined;
    deal.valuations.push(valuation);
    return deal;
  }

  closeDeal(dealId: string, finalValueUsd: number, outcome: MADeal["outcome"]): MADeal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal) return undefined;
    deal.status = "closed";
    deal.finalValueUsd = finalValueUsd;
    deal.outcome = outcome;
    deal.closedAt = new Date().toISOString();
    this.bus.publish("ma.deal_closed", { dealId, targetName: deal.targetName, finalValueUsd, outcome });
    return deal;
  }

  updateStatus(dealId: string, status: DealStatus): MADeal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal) return undefined;
    deal.status = status;
    return deal;
  }

  getDeal(id: string): MADeal | undefined { return this.deals.get(id); }
  listDeals(status?: DealStatus): MADeal[] {
    const all = Array.from(this.deals.values());
    return status ? all.filter((d) => d.status === status) : all;
  }

  getDDCompletion(dealId: string): number {
    const deal = this.deals.get(dealId);
    if (!deal || deal.ddItems.length === 0) return 0;
    const done = deal.ddItems.map((id) => this.ddItems.get(id)).filter((i) => i?.completed).length;
    return Math.round((done / deal.ddItems.length) * 100);
  }

  summary(): MASummary {
    const deals = Array.from(this.deals.values());
    const active = deals.filter((d) => d.status !== "closed" && d.status !== "terminated");
    const closed = deals.filter((d) => d.status === "closed");
    const ddCompletions = deals.filter((d) => d.ddItems.length > 0).map((d) => this.getDDCompletion(d.id));
    const avgDD = ddCompletions.length > 0 ? Math.round(ddCompletions.reduce((s, p) => s + p, 0) / ddCompletions.length) : 0;
    return {
      totalDeals: deals.length,
      activeDeals: active.length,
      closedDeals: closed.length,
      totalEstimatedValueUsd: deals.reduce((s, d) => s + d.estimatedValueUsd, 0),
      avgDueDiligenceCompletionPct: avgDD,
    };
  }
}
