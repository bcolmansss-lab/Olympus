/**
 * TipPoolManager — service tip pooling and distribution: collect tips into a
 * pool for a period, weight participants by hours/role points, and compute an
 * equitable payout split.
 *
 * Events:
 *   - "tippool.tips_added": { poolId, amountUsd, source }
 *   - "tippool.participant_added": { poolId, participantId, weight }
 *   - "tippool.distributed": { poolId, totalUsd, participantCount }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PoolStatus = "open" | "distributed";

export interface Participant {
  participantId: string;
  hoursWorked: number;
  rolePoints: number; // multiplier for role (e.g. server 1.0, busser 0.5)
  allocatedUsd: number;
}

export interface TipPool {
  id: string;
  period: string;
  status: PoolStatus;
  totalTipsUsd: number;
  participants: Participant[];
  createdAt: string;
  distributedAt?: string;
}

export interface TipPoolSummary {
  totalPools: number;
  openPools: number;
  totalTipsUsd: number;
  totalDistributedUsd: number;
  totalParticipants: number;
}

export class TipPoolManager {
  private pools: Map<string, TipPool> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPool(period: string): TipPool {
    const pool: TipPool = { id: randomUUID(), period, status: "open", totalTipsUsd: 0, participants: [], createdAt: new Date().toISOString() };
    this.pools.set(pool.id, pool);
    return pool;
  }

  addTips(poolId: string, amountUsd: number, source: string): TipPool | undefined {
    const pool = this.pools.get(poolId);
    if (!pool || pool.status !== "open" || amountUsd <= 0) return undefined;
    pool.totalTipsUsd = Math.round((pool.totalTipsUsd + amountUsd) * 100) / 100;
    this.bus.publish("tippool.tips_added", { poolId, amountUsd, source });
    return pool;
  }

  addParticipant(poolId: string, participantId: string, hoursWorked: number, rolePoints = 1): Participant | undefined {
    const pool = this.pools.get(poolId);
    if (!pool || pool.status !== "open" || hoursWorked < 0) return undefined;
    if (pool.participants.some(p => p.participantId === participantId)) return undefined;
    const participant: Participant = { participantId, hoursWorked, rolePoints, allocatedUsd: 0 };
    pool.participants.push(participant);
    this.bus.publish("tippool.participant_added", { poolId, participantId, weight: hoursWorked * rolePoints });
    return participant;
  }

  /** Distribute the pool proportionally to hours × rolePoints. */
  distribute(poolId: string, asOf: string): TipPool | undefined {
    const pool = this.pools.get(poolId);
    if (!pool || pool.status !== "open" || pool.participants.length === 0) return undefined;
    const totalWeight = pool.participants.reduce((s, p) => s + p.hoursWorked * p.rolePoints, 0);
    if (totalWeight <= 0) return undefined;
    let allocated = 0;
    for (const p of pool.participants) {
      const share = Math.round((pool.totalTipsUsd * (p.hoursWorked * p.rolePoints) / totalWeight) * 100) / 100;
      p.allocatedUsd = share;
      allocated += share;
    }
    // assign any rounding remainder to the highest-weight participant
    const remainder = Math.round((pool.totalTipsUsd - allocated) * 100) / 100;
    if (remainder !== 0 && pool.participants.length > 0) {
      const top = pool.participants.reduce((a, b) => (b.hoursWorked * b.rolePoints > a.hoursWorked * a.rolePoints ? b : a), pool.participants[0]!);
      top.allocatedUsd = Math.round((top.allocatedUsd + remainder) * 100) / 100;
    }
    pool.status = "distributed";
    pool.distributedAt = asOf;
    this.bus.publish("tippool.distributed", { poolId, totalUsd: pool.totalTipsUsd, participantCount: pool.participants.length });
    return pool;
  }

  getPool(id: string): TipPool | undefined { return this.pools.get(id); }
  listPools(status?: PoolStatus): TipPool[] {
    const all = Array.from(this.pools.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): TipPoolSummary {
    const pools = Array.from(this.pools.values());
    return {
      totalPools: pools.length,
      openPools: pools.filter(p => p.status === "open").length,
      totalTipsUsd: Math.round(pools.reduce((s, p) => s + p.totalTipsUsd, 0) * 100) / 100,
      totalDistributedUsd: Math.round(pools.filter(p => p.status === "distributed").reduce((s, p) => s + p.totalTipsUsd, 0) * 100) / 100,
      totalParticipants: pools.reduce((s, p) => s + p.participants.length, 0),
    };
  }
}
