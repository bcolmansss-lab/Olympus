/**
 * LoyaltyProgram — customer loyalty points, tier management, reward redemption,
 * referral tracking, and lifetime value optimization.
 *
 * Events:
 *   - "loyalty.points_earned": { customerId, points, reason, balance }
 *   - "loyalty.tier_upgraded": { customerId, fromTier, toTier }
 *   - "loyalty.reward_redeemed": { customerId, rewardId, pointsCost, value }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface LoyaltyMember {
  id: string;
  customerId: string;
  tier: LoyaltyTier;
  points: number;
  lifetimePoints: number;
  joinedAt: string;
  lastActivityAt: string;
  referralCount: number;
}

export interface PointsTransaction {
  id: string;
  customerId: string;
  delta: number; // positive = earned, negative = redeemed
  reason: string;
  balanceAfter: number;
  occurredAt: string;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  valueUsd: number;
  category: string;
  active: boolean;
  stockLimit?: number;
  redeemedCount: number;
}

export interface LoyaltySummary {
  totalMembers: number;
  byTier: Record<LoyaltyTier, number>;
  totalPointsOutstanding: number;
  totalRedemptions: number;
  totalRewardsAvailable: number;
}

const TIER_THRESHOLDS: Record<LoyaltyTier, number> = { bronze: 0, silver: 1000, gold: 5000, platinum: 20000, diamond: 100000 };

function tierFromPoints(lifetime: number): LoyaltyTier {
  if (lifetime >= 100000) return "diamond";
  if (lifetime >= 20000) return "platinum";
  if (lifetime >= 5000) return "gold";
  if (lifetime >= 1000) return "silver";
  return "bronze";
}

export class LoyaltyProgram {
  private members: Map<string, LoyaltyMember> = new Map(); // key: customerId
  private transactions: Map<string, PointsTransaction> = new Map();
  private rewards: Map<string, LoyaltyReward> = new Map();

  constructor(private readonly bus: EventBus) {}

  enroll(customerId: string): LoyaltyMember {
    const existing = this.members.get(customerId);
    if (existing) return existing;
    const member: LoyaltyMember = {
      id: randomUUID(),
      customerId,
      tier: "bronze",
      points: 0,
      lifetimePoints: 0,
      joinedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      referralCount: 0,
    };
    this.members.set(customerId, member);
    return member;
  }

  earnPoints(customerId: string, points: number, reason: string): LoyaltyMember | undefined {
    const member = this.members.get(customerId);
    if (!member || points <= 0) return undefined;
    member.points += points;
    member.lifetimePoints += points;
    member.lastActivityAt = new Date().toISOString();
    const tx: PointsTransaction = { id: randomUUID(), customerId, delta: points, reason, balanceAfter: member.points, occurredAt: new Date().toISOString() };
    this.transactions.set(tx.id, tx);
    this.bus.publish("loyalty.points_earned", { customerId, points, reason, balance: member.points });

    const newTier = tierFromPoints(member.lifetimePoints);
    if (newTier !== member.tier && TIER_THRESHOLDS[newTier] > TIER_THRESHOLDS[member.tier]) {
      const fromTier = member.tier;
      member.tier = newTier;
      this.bus.publish("loyalty.tier_upgraded", { customerId, fromTier, toTier: newTier });
    }
    return member;
  }

  redeemReward(customerId: string, rewardId: string): LoyaltyMember | undefined {
    const member = this.members.get(customerId);
    const reward = this.rewards.get(rewardId);
    if (!member || !reward || !reward.active) return undefined;
    if (member.points < reward.pointsCost) return undefined;
    if (reward.stockLimit !== undefined && reward.redeemedCount >= reward.stockLimit) return undefined;

    member.points -= reward.pointsCost;
    reward.redeemedCount++;
    member.lastActivityAt = new Date().toISOString();
    const tx: PointsTransaction = { id: randomUUID(), customerId, delta: -reward.pointsCost, reason: `Redeemed: ${reward.name}`, balanceAfter: member.points, occurredAt: new Date().toISOString() };
    this.transactions.set(tx.id, tx);
    this.bus.publish("loyalty.reward_redeemed", { customerId, rewardId, pointsCost: reward.pointsCost, value: reward.valueUsd });
    return member;
  }

  addReferral(referrerId: string, bonusPoints: number): LoyaltyMember | undefined {
    const member = this.members.get(referrerId);
    if (!member) return undefined;
    member.referralCount++;
    return this.earnPoints(referrerId, bonusPoints, "referral bonus");
  }

  addReward(input: Omit<LoyaltyReward, "id" | "redeemedCount"> & { id?: string }): LoyaltyReward {
    const reward: LoyaltyReward = { ...input, id: input.id ?? randomUUID(), redeemedCount: 0 };
    this.rewards.set(reward.id, reward);
    return reward;
  }

  getMember(customerId: string): LoyaltyMember | undefined { return this.members.get(customerId); }
  listMembers(tier?: LoyaltyTier): LoyaltyMember[] {
    const all = Array.from(this.members.values());
    return tier ? all.filter((m) => m.tier === tier) : all;
  }

  listTransactions(customerId: string): PointsTransaction[] {
    return Array.from(this.transactions.values()).filter((t) => t.customerId === customerId);
  }

  listRewards(active?: boolean): LoyaltyReward[] {
    const all = Array.from(this.rewards.values());
    return active !== undefined ? all.filter((r) => r.active === active) : all;
  }

  summary(): LoyaltySummary {
    const members = Array.from(this.members.values());
    const byTier: Record<LoyaltyTier, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 0 };
    for (const m of members) { byTier[m.tier]++; }
    const totalRedemptions = Array.from(this.rewards.values()).reduce((s, r) => s + r.redeemedCount, 0);
    return {
      totalMembers: members.length,
      byTier,
      totalPointsOutstanding: members.reduce((s, m) => s + m.points, 0),
      totalRedemptions,
      totalRewardsAvailable: Array.from(this.rewards.values()).filter((r) => r.active).length,
    };
  }
}
