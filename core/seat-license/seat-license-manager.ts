/**
 * SeatLicenseManager — software license pools with seat allocation/reclaim,
 * over-allocation prevention, utilization, and renewal tracking.
 *
 * Events:
 *   - "seatlicense.pool_created": { poolId, product, totalSeats }
 *   - "seatlicense.assigned": { poolId, userId, seatsUsed, totalSeats }
 *   - "seatlicense.reclaimed": { poolId, userId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface LicensePool {
  id: string;
  product: string;
  vendor: string;
  totalSeats: number;
  assignedTo: Set<string>; // userIds
  annualCostUsd: number;
  expiresAt: string;
  createdAt: string;
}

export interface SeatAssignment {
  poolId: string;
  userId: string;
  assignedAt: string;
}

export interface SeatLicenseSummary {
  totalPools: number;
  totalSeats: number;
  usedSeats: number;
  utilizationPct: number;
  totalAnnualCostUsd: number;
  expiringIn30Days: number;
}

export class SeatLicenseManager {
  private pools: Map<string, LicensePool> = new Map();
  private assignments: SeatAssignment[] = [];

  constructor(private readonly bus: EventBus) {}

  createPool(input: { product: string; vendor: string; totalSeats: number; annualCostUsd: number; expiresAt: string }): LicensePool {
    const pool: LicensePool = { ...input, id: randomUUID(), assignedTo: new Set(), createdAt: new Date().toISOString() };
    this.pools.set(pool.id, pool);
    this.bus.publish("seatlicense.pool_created", { poolId: pool.id, product: pool.product, totalSeats: pool.totalSeats });
    return pool;
  }

  assign(poolId: string, userId: string, assignedAt: string): boolean {
    const pool = this.pools.get(poolId);
    if (!pool) return false;
    if (pool.assignedTo.has(userId)) return true; // idempotent
    if (pool.assignedTo.size >= pool.totalSeats) return false;
    pool.assignedTo.add(userId);
    this.assignments.push({ poolId, userId, assignedAt });
    this.bus.publish("seatlicense.assigned", { poolId, userId, seatsUsed: pool.assignedTo.size, totalSeats: pool.totalSeats });
    return true;
  }

  reclaim(poolId: string, userId: string): boolean {
    const pool = this.pools.get(poolId);
    if (!pool || !pool.assignedTo.has(userId)) return false;
    pool.assignedTo.delete(userId);
    this.bus.publish("seatlicense.reclaimed", { poolId, userId });
    return true;
  }

  resize(poolId: string, newTotalSeats: number): LicensePool | undefined {
    const pool = this.pools.get(poolId);
    if (!pool || newTotalSeats < pool.assignedTo.size) return undefined;
    pool.totalSeats = newTotalSeats;
    return pool;
  }

  availableSeats(poolId: string): number {
    const pool = this.pools.get(poolId);
    return pool ? pool.totalSeats - pool.assignedTo.size : 0;
  }

  getPool(id: string): LicensePool | undefined { return this.pools.get(id); }
  listPools(): LicensePool[] { return Array.from(this.pools.values()); }
  poolsForUser(userId: string): LicensePool[] {
    return Array.from(this.pools.values()).filter(p => p.assignedTo.has(userId));
  }

  summary(asOf?: string): SeatLicenseSummary {
    const pools = Array.from(this.pools.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const totalSeats = pools.reduce((s, p) => s + p.totalSeats, 0);
    const usedSeats = pools.reduce((s, p) => s + p.assignedTo.size, 0);
    const expiring = pools.filter(p => (new Date(p.expiresAt).getTime() - ref) / 86400000 <= 30 && new Date(p.expiresAt).getTime() >= ref).length;
    return {
      totalPools: pools.length,
      totalSeats,
      usedSeats,
      utilizationPct: totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0,
      totalAnnualCostUsd: Math.round(pools.reduce((s, p) => s + p.annualCostUsd, 0) * 100) / 100,
      expiringIn30Days: expiring,
    };
  }
}
