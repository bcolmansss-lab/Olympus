/**
 * PartnerManager — channel partners, referral programs, co-sell tracking, and partner performance.
 *
 * Partner tiers: silver → gold → platinum → elite
 *
 * Events:
 *   - "partner.registered": { partnerId, name, tier }
 *   - "partner.deal_registered": { partnerId, dealId, valueUsd, type }
 *   - "partner.tier_upgraded": { partnerId, from, to }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PartnerTier = "silver" | "gold" | "platinum" | "elite";
export type PartnerType = "reseller" | "referral" | "technology" | "implementation" | "oem" | "affiliate";
export type DealRegistrationType = "referral" | "co_sell" | "resell" | "influenced";

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  tier: PartnerTier;
  region: string;
  contactName: string;
  contactEmail: string;
  joinedAt: string;
  lastActivityAt: string;
  certifiedProducts: string[];
  commissionRate: number; // percentage e.g. 15
  ytdRevenueUsd: number;
  totalDealsRegistered: number;
  tags?: string[];
}

export interface PartnerDeal {
  id: string;
  partnerId: string;
  dealName: string;
  customerName: string;
  type: DealRegistrationType;
  valueUsd: number;
  status: "registered" | "approved" | "closed_won" | "closed_lost";
  registeredAt: string;
  closedAt?: string;
  commissionUsd?: number;
}

export interface PartnerSummary {
  totalPartners: number;
  byTier: Record<PartnerTier, number>;
  totalDeals: number;
  totalPartnerRevenueUsd: number;
  avgDealSizeUsd: number;
  topPartner?: string; // name of highest ytdRevenue partner
}

const TIER_ORDER: PartnerTier[] = ["silver", "gold", "platinum", "elite"];

function nextTier(current: PartnerTier, ytdRevenue: number): PartnerTier | undefined {
  if (current === "silver" && ytdRevenue >= 50_000) return "gold";
  if (current === "gold" && ytdRevenue >= 200_000) return "platinum";
  if (current === "platinum" && ytdRevenue >= 500_000) return "elite";
  return undefined;
}

export class PartnerManager {
  private partners: Map<string, Partner> = new Map();
  private deals: Map<string, PartnerDeal> = new Map();

  constructor(private readonly bus: EventBus) {}

  registerPartner(
    input: Omit<Partner, "id" | "joinedAt" | "lastActivityAt" | "ytdRevenueUsd" | "totalDealsRegistered"> & { id?: string }
  ): Partner {
    const now = new Date().toISOString();
    const partner: Partner = {
      ...input,
      id: input.id ?? randomUUID(),
      joinedAt: now,
      lastActivityAt: now,
      ytdRevenueUsd: 0,
      totalDealsRegistered: 0,
    };
    this.partners.set(partner.id, partner);
    this.bus.publish("partner.registered", { partnerId: partner.id, name: partner.name, tier: partner.tier });
    return partner;
  }

  registerDeal(
    input: Omit<PartnerDeal, "id" | "registeredAt"> & { id?: string }
  ): PartnerDeal {
    const now = new Date().toISOString();
    const deal: PartnerDeal = {
      ...input,
      id: input.id ?? randomUUID(),
      registeredAt: now,
    };
    this.deals.set(deal.id, deal);

    const partner = this.partners.get(deal.partnerId);
    if (partner) {
      partner.totalDealsRegistered += 1;
      partner.lastActivityAt = now;
    }

    this.bus.publish("partner.deal_registered", {
      partnerId: deal.partnerId,
      dealId: deal.id,
      valueUsd: deal.valueUsd,
      type: deal.type,
    });

    return deal;
  }

  closeDeal(dealId: string, won: boolean): PartnerDeal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal) return undefined;

    const now = new Date().toISOString();
    deal.closedAt = now;

    if (won) {
      deal.status = "closed_won";
      const partner = this.partners.get(deal.partnerId);
      if (partner) {
        deal.commissionUsd = deal.valueUsd * partner.commissionRate / 100;
        partner.ytdRevenueUsd += deal.valueUsd;

        const upgraded = nextTier(partner.tier, partner.ytdRevenueUsd);
        if (upgraded) {
          const from = partner.tier;
          partner.tier = upgraded;
          this.bus.publish("partner.tier_upgraded", { partnerId: partner.id, from, to: upgraded });
        }
      }
    } else {
      deal.status = "closed_lost";
    }

    return deal;
  }

  get(id: string): Partner | undefined {
    return this.partners.get(id);
  }

  listPartners(tier?: PartnerTier): Partner[] {
    const all = Array.from(this.partners.values());
    if (tier) return all.filter((p) => p.tier === tier);
    return all;
  }

  listDeals(partnerId?: string): PartnerDeal[] {
    const all = Array.from(this.deals.values());
    if (partnerId) return all.filter((d) => d.partnerId === partnerId);
    return all;
  }

  summary(): PartnerSummary {
    const partners = Array.from(this.partners.values());
    const deals = Array.from(this.deals.values());

    const byTier: Record<PartnerTier, number> = { silver: 0, gold: 0, platinum: 0, elite: 0 };
    for (const p of partners) {
      byTier[p.tier] += 1;
    }

    const totalPartnerRevenueUsd = partners.reduce((sum, p) => sum + p.ytdRevenueUsd, 0);
    const avgDealSizeUsd = deals.length > 0
      ? deals.reduce((sum, d) => sum + d.valueUsd, 0) / deals.length
      : 0;

    let topPartner: string | undefined;
    if (partners.length > 0) {
      const top = partners.reduce((best, p) => p.ytdRevenueUsd > best.ytdRevenueUsd ? p : best, partners[0]!);
      topPartner = top.name;
    }

    return {
      totalPartners: partners.length,
      byTier,
      totalDeals: deals.length,
      totalPartnerRevenueUsd,
      avgDealSizeUsd,
      topPartner,
    };
  }
}
