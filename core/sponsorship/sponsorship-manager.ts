/**
 * SponsorshipManager — sponsorship deals with tiers, contracted deliverables,
 * fulfillment tracking, and revenue/ROI reporting.
 *
 * Events:
 *   - "sponsorship.signed": { sponsorshipId, sponsorName, tier, amountUsd }
 *   - "sponsorship.deliverable_fulfilled": { sponsorshipId, deliverableId }
 *   - "sponsorship.completed": { sponsorshipId, fulfillmentPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SponsorTier = "title" | "platinum" | "gold" | "silver" | "bronze" | "in_kind";
export type SponsorshipStatus = "active" | "completed" | "cancelled";

export interface Deliverable {
  id: string;
  description: string;
  fulfilled: boolean;
  fulfilledAt?: string;
}

export interface Sponsorship {
  id: string;
  sponsorName: string;
  tier: SponsorTier;
  amountUsd: number;
  status: SponsorshipStatus;
  deliverables: Deliverable[];
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface SponsorshipSummary {
  totalSponsorships: number;
  active: number;
  totalRevenueUsd: number;
  byTier: Partial<Record<SponsorTier, number>>;
  avgFulfillmentPct: number;
}

export class SponsorshipManager {
  private sponsorships: Map<string, Sponsorship> = new Map();

  constructor(private readonly bus: EventBus) {}

  sign(input: { sponsorName: string; tier: SponsorTier; amountUsd: number; startDate: string; endDate: string; deliverables: string[] }): Sponsorship {
    const sponsorship: Sponsorship = {
      id: randomUUID(),
      sponsorName: input.sponsorName,
      tier: input.tier,
      amountUsd: input.amountUsd,
      status: "active",
      deliverables: input.deliverables.map(d => ({ id: randomUUID(), description: d, fulfilled: false })),
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: new Date().toISOString(),
    };
    this.sponsorships.set(sponsorship.id, sponsorship);
    this.bus.publish("sponsorship.signed", { sponsorshipId: sponsorship.id, sponsorName: sponsorship.sponsorName, tier: sponsorship.tier, amountUsd: sponsorship.amountUsd });
    return sponsorship;
  }

  fulfill(sponsorshipId: string, deliverableId: string, asOf: string): Sponsorship | undefined {
    const s = this.sponsorships.get(sponsorshipId);
    if (!s || s.status !== "active") return undefined;
    const deliverable = s.deliverables.find(d => d.id === deliverableId);
    if (!deliverable || deliverable.fulfilled) return undefined;
    deliverable.fulfilled = true;
    deliverable.fulfilledAt = asOf;
    this.bus.publish("sponsorship.deliverable_fulfilled", { sponsorshipId, deliverableId });
    if (s.deliverables.every(d => d.fulfilled)) {
      s.status = "completed";
      this.bus.publish("sponsorship.completed", { sponsorshipId, fulfillmentPct: 100 });
    }
    return s;
  }

  cancel(sponsorshipId: string): Sponsorship | undefined {
    const s = this.sponsorships.get(sponsorshipId);
    if (!s || s.status === "completed") return undefined;
    s.status = "cancelled";
    return s;
  }

  fulfillmentPct(sponsorshipId: string): number {
    const s = this.sponsorships.get(sponsorshipId);
    if (!s || s.deliverables.length === 0) return 0;
    return Math.round((s.deliverables.filter(d => d.fulfilled).length / s.deliverables.length) * 100);
  }

  getSponsorship(id: string): Sponsorship | undefined { return this.sponsorships.get(id); }
  listSponsorships(status?: SponsorshipStatus, tier?: SponsorTier): Sponsorship[] {
    let all = Array.from(this.sponsorships.values());
    if (status) all = all.filter(s => s.status === status);
    if (tier) all = all.filter(s => s.tier === tier);
    return all;
  }

  summary(): SponsorshipSummary {
    const sponsorships = Array.from(this.sponsorships.values());
    const byTier: Partial<Record<SponsorTier, number>> = {};
    for (const s of sponsorships) { byTier[s.tier] = (byTier[s.tier] ?? 0) + 1; }
    const avgFulfillment = sponsorships.length > 0 ? Math.round(sponsorships.reduce((sum, s) => sum + this.fulfillmentPct(s.id), 0) / sponsorships.length) : 0;
    return {
      totalSponsorships: sponsorships.length,
      active: sponsorships.filter(s => s.status === "active").length,
      totalRevenueUsd: sponsorships.filter(s => s.status !== "cancelled").reduce((sum, s) => sum + s.amountUsd, 0),
      byTier,
      avgFulfillmentPct: avgFulfillment,
    };
  }
}
