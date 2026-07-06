/**
 * MembershipManager — membership/association management: tiered memberships,
 * enrollment, renewal, lapse detection, and member directory.
 *
 * Events:
 *   - "membership.enrolled": { membershipId, memberId, tier, expiresAt }
 *   - "membership.renewed": { membershipId, newExpiresAt }
 *   - "membership.lapsed": { membershipId, memberId, expiredAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MembershipTier = "basic" | "premium" | "vip" | "lifetime" | "corporate";
export type MembershipStatus = "active" | "lapsed" | "cancelled";

export interface Membership {
  id: string;
  memberId: string;
  memberName: string;
  tier: MembershipTier;
  status: MembershipStatus;
  annualDuesUsd: number;
  joinedAt: string;
  expiresAt: string;
  renewalCount: number;
}

export interface MembershipSummary {
  totalMembers: number;
  active: number;
  lapsed: number;
  totalAnnualDuesUsd: number;
  byTier: Partial<Record<MembershipTier, number>>;
  retentionRatePct: number;
}

export class MembershipManager {
  private memberships: Map<string, Membership> = new Map();

  constructor(private readonly bus: EventBus) {}

  enroll(input: { memberId: string; memberName: string; tier: MembershipTier; annualDuesUsd: number; joinedAt: string; expiresAt: string }): Membership {
    const membership: Membership = { ...input, id: randomUUID(), status: "active", renewalCount: 0 };
    this.memberships.set(membership.id, membership);
    this.bus.publish("membership.enrolled", { membershipId: membership.id, memberId: membership.memberId, tier: membership.tier, expiresAt: membership.expiresAt });
    return membership;
  }

  renew(membershipId: string, newExpiresAt: string): Membership | undefined {
    const m = this.memberships.get(membershipId);
    if (!m || m.status === "cancelled") return undefined;
    m.expiresAt = newExpiresAt;
    m.status = "active";
    m.renewalCount += 1;
    this.bus.publish("membership.renewed", { membershipId, newExpiresAt });
    return m;
  }

  cancel(membershipId: string): Membership | undefined {
    const m = this.memberships.get(membershipId);
    if (!m) return undefined;
    m.status = "cancelled";
    return m;
  }

  /** Mark active memberships past expiry as lapsed. */
  checkLapsed(asOf: string): Membership[] {
    const cutoff = new Date(asOf).getTime();
    const lapsed = Array.from(this.memberships.values()).filter(m => m.status === "active" && m.tier !== "lifetime" && new Date(m.expiresAt).getTime() < cutoff);
    for (const m of lapsed) {
      m.status = "lapsed";
      this.bus.publish("membership.lapsed", { membershipId: m.id, memberId: m.memberId, expiredAt: m.expiresAt });
    }
    return lapsed;
  }

  getMembership(id: string): Membership | undefined { return this.memberships.get(id); }
  listMemberships(status?: MembershipStatus, tier?: MembershipTier): Membership[] {
    let all = Array.from(this.memberships.values());
    if (status) all = all.filter(m => m.status === status);
    if (tier) all = all.filter(m => m.tier === tier);
    return all;
  }

  summary(): MembershipSummary {
    const memberships = Array.from(this.memberships.values());
    const byTier: Partial<Record<MembershipTier, number>> = {};
    for (const m of memberships) { byTier[m.tier] = (byTier[m.tier] ?? 0) + 1; }
    const renewable = memberships.filter(m => m.status !== "cancelled").length;
    const retained = memberships.filter(m => m.renewalCount > 0).length;
    return {
      totalMembers: memberships.length,
      active: memberships.filter(m => m.status === "active").length,
      lapsed: memberships.filter(m => m.status === "lapsed").length,
      totalAnnualDuesUsd: memberships.filter(m => m.status === "active").reduce((s, m) => s + m.annualDuesUsd, 0),
      byTier,
      retentionRatePct: renewable > 0 ? Math.round((retained / renewable) * 100) : 0,
    };
  }
}
