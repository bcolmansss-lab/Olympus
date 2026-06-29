/**
 * ResellerManager — channel reseller program: partner tiers, deal registration
 * with conflict protection, margin/discount entitlement, and sales attribution.
 *
 * Events:
 *   - "reseller.onboarded": { resellerId, name, tier }
 *   - "reseller.deal_registered": { dealId, resellerId, valueUsd }
 *   - "reseller.deal_won": { dealId, resellerId, marginUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ResellerTier = "registered" | "silver" | "gold" | "platinum";
export type DealStatus = "registered" | "approved" | "won" | "lost" | "expired";

const TIER_MARGIN: Record<ResellerTier, number> = { registered: 5, silver: 10, gold: 15, platinum: 20 };

export interface Reseller {
  id: string;
  name: string;
  tier: ResellerTier;
  region: string;
  active: boolean;
  createdAt: string;
}

export interface RegisteredDeal {
  id: string;
  resellerId: string;
  endCustomer: string;
  valueUsd: number;
  status: DealStatus;
  marginPct: number;
  marginUsd: number;
  registeredAt: string;
  expiresAt: string;
}

export interface ResellerSummary {
  totalResellers: number;
  activeResellers: number;
  totalDeals: number;
  wonDeals: number;
  totalPipelineUsd: number;
  totalWonUsd: number;
  totalMarginUsd: number;
  byTier: Partial<Record<ResellerTier, number>>;
}

export class ResellerManager {
  private resellers: Map<string, Reseller> = new Map();
  private deals: Map<string, RegisteredDeal> = new Map();

  constructor(private readonly bus: EventBus) {}

  onboard(name: string, tier: ResellerTier, region: string): Reseller {
    const reseller: Reseller = { id: randomUUID(), name, tier, region, active: true, createdAt: new Date().toISOString() };
    this.resellers.set(reseller.id, reseller);
    this.bus.publish("reseller.onboarded", { resellerId: reseller.id, name, tier });
    return reseller;
  }

  setTier(resellerId: string, tier: ResellerTier): Reseller | undefined {
    const reseller = this.resellers.get(resellerId);
    if (!reseller) return undefined;
    reseller.tier = tier;
    return reseller;
  }

  /** Register a deal; rejects if another active deal exists for the same end customer (conflict protection). */
  registerDeal(resellerId: string, endCustomer: string, valueUsd: number, registeredAt: string, expiresAt: string): RegisteredDeal | undefined {
    const reseller = this.resellers.get(resellerId);
    if (!reseller || !reseller.active) return undefined;
    const conflict = Array.from(this.deals.values()).some(d =>
      d.endCustomer.toLowerCase() === endCustomer.toLowerCase() && (d.status === "registered" || d.status === "approved")
    );
    if (conflict) return undefined;
    const marginPct = TIER_MARGIN[reseller.tier];
    const deal: RegisteredDeal = {
      id: randomUUID(), resellerId, endCustomer, valueUsd, status: "registered", marginPct,
      marginUsd: Math.round(valueUsd * (marginPct / 100) * 100) / 100, registeredAt, expiresAt,
    };
    this.deals.set(deal.id, deal);
    this.bus.publish("reseller.deal_registered", { dealId: deal.id, resellerId, valueUsd });
    return deal;
  }

  approveDeal(dealId: string): RegisteredDeal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal || deal.status !== "registered") return undefined;
    deal.status = "approved";
    return deal;
  }

  winDeal(dealId: string): RegisteredDeal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal || (deal.status !== "approved" && deal.status !== "registered")) return undefined;
    deal.status = "won";
    this.bus.publish("reseller.deal_won", { dealId, resellerId: deal.resellerId, marginUsd: deal.marginUsd });
    return deal;
  }

  loseDeal(dealId: string): RegisteredDeal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal || deal.status === "won") return undefined;
    deal.status = "lost";
    return deal;
  }

  getReseller(id: string): Reseller | undefined { return this.resellers.get(id); }
  getDeal(id: string): RegisteredDeal | undefined { return this.deals.get(id); }
  listResellers(tier?: ResellerTier): Reseller[] {
    const all = Array.from(this.resellers.values());
    return tier ? all.filter(r => r.tier === tier) : all;
  }
  listDeals(resellerId?: string, status?: DealStatus): RegisteredDeal[] {
    let all = Array.from(this.deals.values());
    if (resellerId) all = all.filter(d => d.resellerId === resellerId);
    if (status) all = all.filter(d => d.status === status);
    return all;
  }

  summary(): ResellerSummary {
    const resellers = Array.from(this.resellers.values());
    const deals = Array.from(this.deals.values());
    const won = deals.filter(d => d.status === "won");
    const byTier: Partial<Record<ResellerTier, number>> = {};
    for (const r of resellers) { byTier[r.tier] = (byTier[r.tier] ?? 0) + 1; }
    return {
      totalResellers: resellers.length,
      activeResellers: resellers.filter(r => r.active).length,
      totalDeals: deals.length,
      wonDeals: won.length,
      totalPipelineUsd: Math.round(deals.filter(d => d.status === "registered" || d.status === "approved").reduce((s, d) => s + d.valueUsd, 0) * 100) / 100,
      totalWonUsd: Math.round(won.reduce((s, d) => s + d.valueUsd, 0) * 100) / 100,
      totalMarginUsd: Math.round(won.reduce((s, d) => s + d.marginUsd, 0) * 100) / 100,
      byTier,
    };
  }
}
