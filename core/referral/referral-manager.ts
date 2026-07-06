/**
 * ReferralProgramManager — referral program definitions, referral tracking,
 * conversion attribution, and reward issuance.
 *
 * Events:
 *   - "referral.created": { referralId, programId, referrerId, code }
 *   - "referral.converted": { referralId, refereeId, rewardUsd }
 *   - "referral.reward_issued": { referralId, referrerId, rewardUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReferralStatus = "pending" | "converted" | "rewarded" | "expired";
export type RewardType = "cash" | "credit" | "discount" | "points";

export interface ReferralProgram {
  id: string;
  name: string;
  rewardType: RewardType;
  referrerRewardUsd: number;
  refereeRewardUsd: number;
  active: boolean;
  createdAt: string;
}

export interface Referral {
  id: string;
  programId: string;
  referrerId: string;
  code: string;
  status: ReferralStatus;
  refereeId?: string;
  rewardUsd?: number;
  createdAt: string;
  convertedAt?: string;
  rewardedAt?: string;
}

export interface ReferralSummary {
  totalReferrals: number;
  converted: number;
  rewarded: number;
  conversionRatePct: number;
  totalRewardsIssuedUsd: number;
  byProgram: Record<string, number>;
}

export class ReferralProgramManager {
  private programs: Map<string, ReferralProgram> = new Map();
  private referrals: Map<string, Referral> = new Map();
  private byCode: Map<string, string> = new Map(); // code → referralId

  constructor(private readonly bus: EventBus) {}

  createProgram(input: Omit<ReferralProgram, "id" | "createdAt" | "active"> & { id?: string; active?: boolean }): ReferralProgram {
    const program: ReferralProgram = { ...input, id: input.id ?? randomUUID(), active: input.active ?? true, createdAt: new Date().toISOString() };
    this.programs.set(program.id, program);
    return program;
  }

  createReferral(programId: string, referrerId: string, code: string): Referral | undefined {
    const program = this.programs.get(programId);
    if (!program || !program.active) return undefined;
    if (this.byCode.has(code)) return undefined;
    const referral: Referral = { id: randomUUID(), programId, referrerId, code, status: "pending", createdAt: new Date().toISOString() };
    this.referrals.set(referral.id, referral);
    this.byCode.set(code, referral.id);
    this.bus.publish("referral.created", { referralId: referral.id, programId, referrerId, code });
    return referral;
  }

  convert(code: string, refereeId: string): Referral | undefined {
    const refId = this.byCode.get(code);
    if (!refId) return undefined;
    const referral = this.referrals.get(refId);
    if (!referral || referral.status !== "pending") return undefined;
    const program = this.programs.get(referral.programId)!;
    referral.status = "converted";
    referral.refereeId = refereeId;
    referral.rewardUsd = program.referrerRewardUsd;
    referral.convertedAt = new Date().toISOString();
    this.bus.publish("referral.converted", { referralId: referral.id, refereeId, rewardUsd: referral.rewardUsd });
    return referral;
  }

  issueReward(referralId: string): Referral | undefined {
    const referral = this.referrals.get(referralId);
    if (!referral || referral.status !== "converted") return undefined;
    referral.status = "rewarded";
    referral.rewardedAt = new Date().toISOString();
    this.bus.publish("referral.reward_issued", { referralId, referrerId: referral.referrerId, rewardUsd: referral.rewardUsd ?? 0 });
    return referral;
  }

  getReferral(id: string): Referral | undefined { return this.referrals.get(id); }
  listPrograms(activeOnly = false): ReferralProgram[] {
    const all = Array.from(this.programs.values());
    return activeOnly ? all.filter(p => p.active) : all;
  }
  listReferrals(referrerId?: string, status?: ReferralStatus): Referral[] {
    let all = Array.from(this.referrals.values());
    if (referrerId) all = all.filter(r => r.referrerId === referrerId);
    if (status) all = all.filter(r => r.status === status);
    return all;
  }

  summary(): ReferralSummary {
    const referrals = Array.from(this.referrals.values());
    const converted = referrals.filter(r => r.status === "converted" || r.status === "rewarded").length;
    const rewarded = referrals.filter(r => r.status === "rewarded");
    const byProgram: Record<string, number> = {};
    for (const r of referrals) { byProgram[r.programId] = (byProgram[r.programId] ?? 0) + 1; }
    return {
      totalReferrals: referrals.length,
      converted,
      rewarded: rewarded.length,
      conversionRatePct: referrals.length > 0 ? Math.round((converted / referrals.length) * 100) : 0,
      totalRewardsIssuedUsd: rewarded.reduce((s, r) => s + (r.rewardUsd ?? 0), 0),
      byProgram,
    };
  }
}
