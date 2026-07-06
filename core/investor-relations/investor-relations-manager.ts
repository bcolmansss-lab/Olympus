/**
 * InvestorRelationsManager — investor registry, funding rounds, capital
 * commitments, and periodic investor updates.
 *
 * Events:
 *   - "ir.round_opened": { roundId, stage, targetUsd }
 *   - "ir.commitment_recorded": { roundId, investorId, amountUsd }
 *   - "ir.round_closed": { roundId, raisedUsd, investorCount }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RoundStage = "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "bridge";
export type RoundStatus = "open" | "closed" | "cancelled";
export type InvestorType = "angel" | "vc" | "corporate" | "family_office" | "crowdfunding";

export interface Investor {
  id: string;
  name: string;
  type: InvestorType;
  contactEmail?: string;
  createdAt: string;
}

export interface Commitment {
  id: string;
  roundId: string;
  investorId: string;
  amountUsd: number;
  committedAt: string;
}

export interface FundingRound {
  id: string;
  stage: RoundStage;
  status: RoundStatus;
  targetUsd: number;
  preMoneyValuationUsd: number;
  openedAt: string;
  closedAt?: string;
}

export interface InvestorUpdate {
  id: string;
  title: string;
  period: string;
  highlights: string[];
  sentAt: string;
}

export interface IRSummary {
  totalInvestors: number;
  totalRounds: number;
  openRounds: number;
  totalRaisedUsd: number;
  totalCommitments: number;
  byStage: Partial<Record<RoundStage, number>>;
  updatesSent: number;
}

export class InvestorRelationsManager {
  private investors: Map<string, Investor> = new Map();
  private rounds: Map<string, FundingRound> = new Map();
  private commitments: Map<string, Commitment> = new Map();
  private updates: Map<string, InvestorUpdate> = new Map();

  constructor(private readonly bus: EventBus) {}

  addInvestor(input: Omit<Investor, "id" | "createdAt"> & { id?: string }): Investor {
    const investor: Investor = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.investors.set(investor.id, investor);
    return investor;
  }

  openRound(stage: RoundStage, targetUsd: number, preMoneyValuationUsd: number): FundingRound {
    const round: FundingRound = { id: randomUUID(), stage, status: "open", targetUsd, preMoneyValuationUsd, openedAt: new Date().toISOString() };
    this.rounds.set(round.id, round);
    this.bus.publish("ir.round_opened", { roundId: round.id, stage, targetUsd });
    return round;
  }

  recordCommitment(roundId: string, investorId: string, amountUsd: number): Commitment | undefined {
    const round = this.rounds.get(roundId);
    if (!round || round.status !== "open") return undefined;
    if (!this.investors.get(investorId)) return undefined;
    const commitment: Commitment = { id: randomUUID(), roundId, investorId, amountUsd, committedAt: new Date().toISOString() };
    this.commitments.set(commitment.id, commitment);
    this.bus.publish("ir.commitment_recorded", { roundId, investorId, amountUsd });
    return commitment;
  }

  roundRaised(roundId: string): number {
    return Array.from(this.commitments.values()).filter(c => c.roundId === roundId).reduce((s, c) => s + c.amountUsd, 0);
  }

  closeRound(roundId: string): FundingRound | undefined {
    const round = this.rounds.get(roundId);
    if (!round || round.status !== "open") return undefined;
    round.status = "closed";
    round.closedAt = new Date().toISOString();
    const commitments = Array.from(this.commitments.values()).filter(c => c.roundId === roundId);
    this.bus.publish("ir.round_closed", { roundId, raisedUsd: this.roundRaised(roundId), investorCount: new Set(commitments.map(c => c.investorId)).size });
    return round;
  }

  sendUpdate(title: string, period: string, highlights: string[]): InvestorUpdate {
    const update: InvestorUpdate = { id: randomUUID(), title, period, highlights, sentAt: new Date().toISOString() };
    this.updates.set(update.id, update);
    return update;
  }

  getRound(id: string): FundingRound | undefined { return this.rounds.get(id); }
  listInvestors(type?: InvestorType): Investor[] {
    const all = Array.from(this.investors.values());
    return type ? all.filter(i => i.type === type) : all;
  }
  listRounds(status?: RoundStatus): FundingRound[] {
    const all = Array.from(this.rounds.values());
    return status ? all.filter(r => r.status === status) : all;
  }
  listCommitments(roundId?: string): Commitment[] {
    const all = Array.from(this.commitments.values());
    return roundId ? all.filter(c => c.roundId === roundId) : all;
  }
  listUpdates(): InvestorUpdate[] { return Array.from(this.updates.values()); }

  summary(): IRSummary {
    const rounds = Array.from(this.rounds.values());
    const commitments = Array.from(this.commitments.values());
    const byStage: Partial<Record<RoundStage, number>> = {};
    for (const r of rounds) { byStage[r.stage] = (byStage[r.stage] ?? 0) + 1; }
    return {
      totalInvestors: this.investors.size,
      totalRounds: rounds.length,
      openRounds: rounds.filter(r => r.status === "open").length,
      totalRaisedUsd: commitments.reduce((s, c) => s + c.amountUsd, 0),
      totalCommitments: commitments.length,
      byStage,
      updatesSent: this.updates.size,
    };
  }
}
