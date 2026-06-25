/**
 * BudgetTransferManager — inter-department budget reallocation: department
 * budget pools, transfer requests with approval, and balance tracking.
 *
 * Events:
 *   - "budgettransfer.pool_created": { poolId, department, amountUsd }
 *   - "budgettransfer.requested": { transferId, fromPoolId, toPoolId, amountUsd }
 *   - "budgettransfer.approved": { transferId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TransferStatus = "pending" | "approved" | "rejected";

export interface BudgetPool {
  id: string;
  department: string;
  fiscalPeriod: string;
  allocatedUsd: number;
  spentUsd: number;
  createdAt: string;
}

export interface BudgetTransfer {
  id: string;
  fromPoolId: string;
  toPoolId: string;
  amountUsd: number;
  reason: string;
  status: TransferStatus;
  requestedBy: string;
  approvedBy?: string;
  requestedAt: string;
  resolvedAt?: string;
}

export interface BudgetTransferSummary {
  totalPools: number;
  totalAllocatedUsd: number;
  totalAvailableUsd: number;
  totalTransfers: number;
  pendingTransfers: number;
  approvedTransfers: number;
}

export class BudgetTransferManager {
  private pools: Map<string, BudgetPool> = new Map();
  private transfers: Map<string, BudgetTransfer> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPool(department: string, fiscalPeriod: string, allocatedUsd: number): BudgetPool {
    const pool: BudgetPool = { id: randomUUID(), department, fiscalPeriod, allocatedUsd, spentUsd: 0, createdAt: new Date().toISOString() };
    this.pools.set(pool.id, pool);
    this.bus.publish("budgettransfer.pool_created", { poolId: pool.id, department, amountUsd: allocatedUsd });
    return pool;
  }

  available(poolId: string): number {
    const pool = this.pools.get(poolId);
    return pool ? Math.round((pool.allocatedUsd - pool.spentUsd) * 100) / 100 : 0;
  }

  recordSpend(poolId: string, amountUsd: number): BudgetPool | undefined {
    const pool = this.pools.get(poolId);
    if (!pool || amountUsd <= 0 || amountUsd > this.available(poolId)) return undefined;
    pool.spentUsd = Math.round((pool.spentUsd + amountUsd) * 100) / 100;
    return pool;
  }

  requestTransfer(fromPoolId: string, toPoolId: string, amountUsd: number, reason: string, requestedBy: string): BudgetTransfer | undefined {
    if (fromPoolId === toPoolId) return undefined;
    const from = this.pools.get(fromPoolId);
    const to = this.pools.get(toPoolId);
    if (!from || !to || amountUsd <= 0 || amountUsd > this.available(fromPoolId)) return undefined;
    const transfer: BudgetTransfer = { id: randomUUID(), fromPoolId, toPoolId, amountUsd, reason, status: "pending", requestedBy, requestedAt: new Date().toISOString() };
    this.transfers.set(transfer.id, transfer);
    this.bus.publish("budgettransfer.requested", { transferId: transfer.id, fromPoolId, toPoolId, amountUsd });
    return transfer;
  }

  approveTransfer(transferId: string, approvedBy: string): BudgetTransfer | undefined {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.status !== "pending") return undefined;
    const from = this.pools.get(transfer.fromPoolId)!;
    const to = this.pools.get(transfer.toPoolId)!;
    if (transfer.amountUsd > this.available(transfer.fromPoolId)) return undefined;
    from.allocatedUsd = Math.round((from.allocatedUsd - transfer.amountUsd) * 100) / 100;
    to.allocatedUsd = Math.round((to.allocatedUsd + transfer.amountUsd) * 100) / 100;
    transfer.status = "approved";
    transfer.approvedBy = approvedBy;
    transfer.resolvedAt = new Date().toISOString();
    this.bus.publish("budgettransfer.approved", { transferId, amountUsd: transfer.amountUsd });
    return transfer;
  }

  rejectTransfer(transferId: string, approvedBy: string): BudgetTransfer | undefined {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.status !== "pending") return undefined;
    transfer.status = "rejected";
    transfer.approvedBy = approvedBy;
    transfer.resolvedAt = new Date().toISOString();
    return transfer;
  }

  getPool(id: string): BudgetPool | undefined { return this.pools.get(id); }
  getTransfer(id: string): BudgetTransfer | undefined { return this.transfers.get(id); }
  listPools(department?: string): BudgetPool[] {
    const all = Array.from(this.pools.values());
    return department ? all.filter(p => p.department === department) : all;
  }
  listTransfers(status?: TransferStatus): BudgetTransfer[] {
    const all = Array.from(this.transfers.values());
    return status ? all.filter(t => t.status === status) : all;
  }

  summary(): BudgetTransferSummary {
    const pools = Array.from(this.pools.values());
    const transfers = Array.from(this.transfers.values());
    return {
      totalPools: pools.length,
      totalAllocatedUsd: Math.round(pools.reduce((s, p) => s + p.allocatedUsd, 0) * 100) / 100,
      totalAvailableUsd: Math.round(pools.reduce((s, p) => s + (p.allocatedUsd - p.spentUsd), 0) * 100) / 100,
      totalTransfers: transfers.length,
      pendingTransfers: transfers.filter(t => t.status === "pending").length,
      approvedTransfers: transfers.filter(t => t.status === "approved").length,
    };
  }
}
