/**
 * RebateManager — volume-based rebate programs: tiered rebate rates on
 * cumulative purchase volume, accrual tracking, and payout settlement.
 *
 * Events:
 *   - "rebate.program_created": { programId, name, tierCount }
 *   - "rebate.tier_reached": { programId, participantId, tierThreshold, ratePct }
 *   - "rebate.settled": { programId, participantId, periodVolumeUsd, rebateUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RebateProgramStatus = "active" | "closed";

export interface RebateTier {
  thresholdUsd: number; // cumulative volume at which this rate applies
  ratePct: number;
}

export interface RebateProgram {
  id: string;
  name: string;
  status: RebateProgramStatus;
  tiers: RebateTier[];
  createdAt: string;
}

export interface RebateAccrual {
  id: string;
  programId: string;
  participantId: string;
  cumulativeVolumeUsd: number;
  currentRatePct: number;
  accruedRebateUsd: number;
  settledRebateUsd: number;
  updatedAt: string;
}

export interface RebateSummary {
  totalPrograms: number;
  activePrograms: number;
  totalParticipants: number;
  totalVolumeUsd: number;
  totalAccruedUsd: number;
  totalSettledUsd: number;
}

export class RebateManager {
  private programs: Map<string, RebateProgram> = new Map();
  private accruals: Map<string, RebateAccrual> = new Map(); // key: `${programId}:${participantId}`

  constructor(private readonly bus: EventBus) {}

  private key(programId: string, participantId: string): string { return `${programId}:${participantId}`; }

  createProgram(name: string, tiers: RebateTier[]): RebateProgram {
    const program: RebateProgram = { id: randomUUID(), name, status: "active", tiers: [...tiers].sort((a, b) => a.thresholdUsd - b.thresholdUsd), createdAt: new Date().toISOString() };
    this.programs.set(program.id, program);
    this.bus.publish("rebate.program_created", { programId: program.id, name, tierCount: tiers.length });
    return program;
  }

  closeProgram(programId: string): RebateProgram | undefined {
    const p = this.programs.get(programId);
    if (!p) return undefined;
    p.status = "closed";
    return p;
  }

  private rateFor(program: RebateProgram, volume: number): number {
    let rate = 0;
    for (const tier of program.tiers) {
      if (volume >= tier.thresholdUsd) rate = tier.ratePct;
    }
    return rate;
  }

  recordPurchase(programId: string, participantId: string, amountUsd: number): RebateAccrual | undefined {
    const program = this.programs.get(programId);
    if (!program || program.status !== "active") return undefined;
    const k = this.key(programId, participantId);
    let accrual = this.accruals.get(k);
    if (!accrual) {
      accrual = { id: randomUUID(), programId, participantId, cumulativeVolumeUsd: 0, currentRatePct: 0, accruedRebateUsd: 0, settledRebateUsd: 0, updatedAt: new Date().toISOString() };
      this.accruals.set(k, accrual);
    }
    const prevRate = accrual.currentRatePct;
    accrual.cumulativeVolumeUsd += amountUsd;
    const newRate = this.rateFor(program, accrual.cumulativeVolumeUsd);
    accrual.currentRatePct = newRate;
    accrual.accruedRebateUsd += Math.round(amountUsd * (newRate / 100) * 100) / 100;
    accrual.updatedAt = new Date().toISOString();
    if (newRate > prevRate) {
      const tier = program.tiers.find(t => t.ratePct === newRate);
      this.bus.publish("rebate.tier_reached", { programId, participantId, tierThreshold: tier?.thresholdUsd ?? 0, ratePct: newRate });
    }
    return accrual;
  }

  settle(programId: string, participantId: string): RebateAccrual | undefined {
    const accrual = this.accruals.get(this.key(programId, participantId));
    if (!accrual) return undefined;
    const payable = accrual.accruedRebateUsd - accrual.settledRebateUsd;
    accrual.settledRebateUsd = accrual.accruedRebateUsd;
    accrual.updatedAt = new Date().toISOString();
    this.bus.publish("rebate.settled", { programId, participantId, periodVolumeUsd: accrual.cumulativeVolumeUsd, rebateUsd: payable });
    return accrual;
  }

  getAccrual(programId: string, participantId: string): RebateAccrual | undefined { return this.accruals.get(this.key(programId, participantId)); }
  listPrograms(status?: RebateProgramStatus): RebateProgram[] {
    const all = Array.from(this.programs.values());
    return status ? all.filter(p => p.status === status) : all;
  }
  listAccruals(programId?: string): RebateAccrual[] {
    const all = Array.from(this.accruals.values());
    return programId ? all.filter(a => a.programId === programId) : all;
  }

  summary(): RebateSummary {
    const programs = Array.from(this.programs.values());
    const accruals = Array.from(this.accruals.values());
    return {
      totalPrograms: programs.length,
      activePrograms: programs.filter(p => p.status === "active").length,
      totalParticipants: accruals.length,
      totalVolumeUsd: accruals.reduce((s, a) => s + a.cumulativeVolumeUsd, 0),
      totalAccruedUsd: accruals.reduce((s, a) => s + a.accruedRebateUsd, 0),
      totalSettledUsd: accruals.reduce((s, a) => s + a.settledRebateUsd, 0),
    };
  }
}
