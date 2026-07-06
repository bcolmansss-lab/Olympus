/**
 * AffiliateManager — affiliate partner registry, tracking-link click and
 * conversion attribution, commission accrual, and payout settlement.
 *
 * Events:
 *   - "affiliate.joined": { affiliateId, name, commissionPct }
 *   - "affiliate.conversion_recorded": { affiliateId, orderValueUsd, commissionUsd }
 *   - "affiliate.payout_settled": { affiliateId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AffiliateStatus = "active" | "suspended" | "terminated";

export interface Affiliate {
  id: string;
  name: string;
  trackingCode: string;
  commissionPct: number;
  status: AffiliateStatus;
  clicks: number;
  conversions: number;
  accruedCommissionUsd: number;
  paidCommissionUsd: number;
  createdAt: string;
}

export interface AffiliateConversion {
  id: string;
  affiliateId: string;
  orderValueUsd: number;
  commissionUsd: number;
  at: string;
}

export interface AffiliateSummary {
  totalAffiliates: number;
  activeAffiliates: number;
  totalClicks: number;
  totalConversions: number;
  conversionRatePct: number;
  totalAccruedUsd: number;
  totalPaidUsd: number;
  outstandingUsd: number;
}

export class AffiliateManager {
  private affiliates: Map<string, Affiliate> = new Map();
  private byCode: Map<string, string> = new Map();
  private conversions: AffiliateConversion[] = [];

  constructor(private readonly bus: EventBus) {}

  join(name: string, trackingCode: string, commissionPct: number): Affiliate | undefined {
    if (this.byCode.has(trackingCode)) return undefined;
    const affiliate: Affiliate = { id: randomUUID(), name, trackingCode, commissionPct, status: "active", clicks: 0, conversions: 0, accruedCommissionUsd: 0, paidCommissionUsd: 0, createdAt: new Date().toISOString() };
    this.affiliates.set(affiliate.id, affiliate);
    this.byCode.set(trackingCode, affiliate.id);
    this.bus.publish("affiliate.joined", { affiliateId: affiliate.id, name, commissionPct });
    return affiliate;
  }

  recordClick(trackingCode: string): Affiliate | undefined {
    const id = this.byCode.get(trackingCode);
    if (!id) return undefined;
    const affiliate = this.affiliates.get(id)!;
    if (affiliate.status !== "active") return undefined;
    affiliate.clicks += 1;
    return affiliate;
  }

  recordConversion(trackingCode: string, orderValueUsd: number, at: string): AffiliateConversion | undefined {
    const id = this.byCode.get(trackingCode);
    if (!id) return undefined;
    const affiliate = this.affiliates.get(id)!;
    if (affiliate.status !== "active") return undefined;
    const commissionUsd = Math.round(orderValueUsd * (affiliate.commissionPct / 100) * 100) / 100;
    const conversion: AffiliateConversion = { id: randomUUID(), affiliateId: affiliate.id, orderValueUsd, commissionUsd, at };
    this.conversions.push(conversion);
    affiliate.conversions += 1;
    affiliate.accruedCommissionUsd = Math.round((affiliate.accruedCommissionUsd + commissionUsd) * 100) / 100;
    this.bus.publish("affiliate.conversion_recorded", { affiliateId: affiliate.id, orderValueUsd, commissionUsd });
    return conversion;
  }

  settlePayout(affiliateId: string): number {
    const affiliate = this.affiliates.get(affiliateId);
    if (!affiliate) return 0;
    const payable = Math.round((affiliate.accruedCommissionUsd - affiliate.paidCommissionUsd) * 100) / 100;
    if (payable <= 0) return 0;
    affiliate.paidCommissionUsd = affiliate.accruedCommissionUsd;
    this.bus.publish("affiliate.payout_settled", { affiliateId, amountUsd: payable });
    return payable;
  }

  setStatus(affiliateId: string, status: AffiliateStatus): Affiliate | undefined {
    const affiliate = this.affiliates.get(affiliateId);
    if (!affiliate) return undefined;
    affiliate.status = status;
    return affiliate;
  }

  getAffiliate(id: string): Affiliate | undefined { return this.affiliates.get(id); }
  findByCode(code: string): Affiliate | undefined { const id = this.byCode.get(code); return id ? this.affiliates.get(id) : undefined; }
  listAffiliates(status?: AffiliateStatus): Affiliate[] {
    const all = Array.from(this.affiliates.values());
    return status ? all.filter(a => a.status === status) : all;
  }
  listConversions(affiliateId?: string): AffiliateConversion[] {
    return affiliateId ? this.conversions.filter(c => c.affiliateId === affiliateId) : [...this.conversions];
  }

  summary(): AffiliateSummary {
    const affiliates = Array.from(this.affiliates.values());
    const totalClicks = affiliates.reduce((s, a) => s + a.clicks, 0);
    const totalConversions = affiliates.reduce((s, a) => s + a.conversions, 0);
    const accrued = affiliates.reduce((s, a) => s + a.accruedCommissionUsd, 0);
    const paid = affiliates.reduce((s, a) => s + a.paidCommissionUsd, 0);
    return {
      totalAffiliates: affiliates.length,
      activeAffiliates: affiliates.filter(a => a.status === "active").length,
      totalClicks,
      totalConversions,
      conversionRatePct: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 100) : 0,
      totalAccruedUsd: Math.round(accrued * 100) / 100,
      totalPaidUsd: Math.round(paid * 100) / 100,
      outstandingUsd: Math.round((accrued - paid) * 100) / 100,
    };
  }
}
