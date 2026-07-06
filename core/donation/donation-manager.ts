/**
 * DonationManager — corporate philanthropy: charitable donations, employee
 * matching-gift programs, and giving analytics by cause.
 *
 * Events:
 *   - "donation.recorded": { donationId, charity, amountUsd, cause }
 *   - "donation.match_approved": { donationId, matchUsd }
 *   - "donation.match_paid": { donationId, matchUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DonationCause = "education" | "health" | "environment" | "poverty" | "disaster_relief" | "arts" | "other";
export type MatchStatus = "none" | "requested" | "approved" | "paid" | "denied";

export interface Donation {
  id: string;
  charity: string;
  cause: DonationCause;
  amountUsd: number;
  donorEmployeeId?: string;
  matchRatio: number; // e.g. 1 = 1:1 match
  matchStatus: MatchStatus;
  matchUsd: number;
  recordedAt: string;
}

export interface DonationSummary {
  totalDonations: number;
  totalDonatedUsd: number;
  totalMatchedUsd: number;
  pendingMatches: number;
  byCause: Partial<Record<DonationCause, number>>;
  totalGivingUsd: number;
}

export class DonationManager {
  private donations: Map<string, Donation> = new Map();

  constructor(private readonly bus: EventBus) {}

  record(input: { charity: string; cause: DonationCause; amountUsd: number; donorEmployeeId?: string; matchRatio?: number }): Donation {
    const matchRatio = input.donorEmployeeId ? (input.matchRatio ?? 1) : 0;
    const donation: Donation = {
      id: randomUUID(),
      charity: input.charity,
      cause: input.cause,
      amountUsd: input.amountUsd,
      donorEmployeeId: input.donorEmployeeId,
      matchRatio,
      matchStatus: matchRatio > 0 ? "requested" : "none",
      matchUsd: 0,
      recordedAt: new Date().toISOString(),
    };
    this.donations.set(donation.id, donation);
    this.bus.publish("donation.recorded", { donationId: donation.id, charity: donation.charity, amountUsd: donation.amountUsd, cause: donation.cause });
    return donation;
  }

  approveMatch(donationId: string): Donation | undefined {
    const d = this.donations.get(donationId);
    if (!d || d.matchStatus !== "requested") return undefined;
    d.matchStatus = "approved";
    d.matchUsd = Math.round(d.amountUsd * d.matchRatio * 100) / 100;
    this.bus.publish("donation.match_approved", { donationId, matchUsd: d.matchUsd });
    return d;
  }

  denyMatch(donationId: string): Donation | undefined {
    const d = this.donations.get(donationId);
    if (!d || d.matchStatus !== "requested") return undefined;
    d.matchStatus = "denied";
    d.matchUsd = 0;
    return d;
  }

  payMatch(donationId: string): Donation | undefined {
    const d = this.donations.get(donationId);
    if (!d || d.matchStatus !== "approved") return undefined;
    d.matchStatus = "paid";
    this.bus.publish("donation.match_paid", { donationId, matchUsd: d.matchUsd });
    return d;
  }

  getDonation(id: string): Donation | undefined { return this.donations.get(id); }
  listDonations(cause?: DonationCause): Donation[] {
    const all = Array.from(this.donations.values());
    return cause ? all.filter(d => d.cause === cause) : all;
  }

  summary(): DonationSummary {
    const donations = Array.from(this.donations.values());
    const totalDonated = donations.reduce((s, d) => s + d.amountUsd, 0);
    const totalMatched = donations.filter(d => d.matchStatus === "paid").reduce((s, d) => s + d.matchUsd, 0);
    const byCause: Partial<Record<DonationCause, number>> = {};
    for (const d of donations) { byCause[d.cause] = (byCause[d.cause] ?? 0) + 1; }
    return {
      totalDonations: donations.length,
      totalDonatedUsd: Math.round(totalDonated * 100) / 100,
      totalMatchedUsd: Math.round(totalMatched * 100) / 100,
      pendingMatches: donations.filter(d => d.matchStatus === "requested" || d.matchStatus === "approved").length,
      byCause,
      totalGivingUsd: Math.round((totalDonated + totalMatched) * 100) / 100,
    };
  }
}
