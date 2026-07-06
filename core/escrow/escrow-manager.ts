/**
 * EscrowManager — escrow/holdback accounts: fund deposits held against
 * milestone or condition release, partial releases, and refund on failure.
 *
 * Events:
 *   - "escrow.opened": { escrowId, payerId, payeeId, amountUsd }
 *   - "escrow.released": { escrowId, amountUsd, remainingUsd }
 *   - "escrow.refunded": { escrowId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EscrowStatus = "open" | "funded" | "released" | "refunded" | "disputed";

export interface EscrowCondition {
  id: string;
  description: string;
  met: boolean;
  releaseAmountUsd: number;
}

export interface Escrow {
  id: string;
  payerId: string;
  payeeId: string;
  totalAmountUsd: number;
  releasedUsd: number;
  status: EscrowStatus;
  conditions: EscrowCondition[];
  createdAt: string;
  closedAt?: string;
}

export interface EscrowSummary {
  totalEscrows: number;
  open: number;
  totalHeldUsd: number;
  totalReleasedUsd: number;
  totalRefundedUsd: number;
  disputed: number;
}

export class EscrowManager {
  private escrows: Map<string, Escrow> = new Map();
  private refundedTotal = 0;

  constructor(private readonly bus: EventBus) {}

  open(input: { payerId: string; payeeId: string; totalAmountUsd: number; conditions: { description: string; releaseAmountUsd: number }[] }): Escrow {
    const escrow: Escrow = {
      id: randomUUID(),
      payerId: input.payerId,
      payeeId: input.payeeId,
      totalAmountUsd: input.totalAmountUsd,
      releasedUsd: 0,
      status: "open",
      conditions: input.conditions.map(c => ({ id: randomUUID(), description: c.description, met: false, releaseAmountUsd: c.releaseAmountUsd })),
      createdAt: new Date().toISOString(),
    };
    this.escrows.set(escrow.id, escrow);
    this.bus.publish("escrow.opened", { escrowId: escrow.id, payerId: escrow.payerId, payeeId: escrow.payeeId, amountUsd: escrow.totalAmountUsd });
    return escrow;
  }

  fund(escrowId: string): Escrow | undefined {
    const escrow = this.escrows.get(escrowId);
    if (!escrow || escrow.status !== "open") return undefined;
    escrow.status = "funded";
    return escrow;
  }

  /** Mark a condition met and release its associated amount. */
  meetCondition(escrowId: string, conditionId: string): Escrow | undefined {
    const escrow = this.escrows.get(escrowId);
    if (!escrow || escrow.status !== "funded") return undefined;
    const condition = escrow.conditions.find(c => c.id === conditionId);
    if (!condition || condition.met) return undefined;
    condition.met = true;
    const releaseAmount = Math.min(condition.releaseAmountUsd, escrow.totalAmountUsd - escrow.releasedUsd);
    escrow.releasedUsd = Math.round((escrow.releasedUsd + releaseAmount) * 100) / 100;
    this.bus.publish("escrow.released", { escrowId, amountUsd: releaseAmount, remainingUsd: Math.round((escrow.totalAmountUsd - escrow.releasedUsd) * 100) / 100 });
    if (escrow.conditions.every(c => c.met)) {
      escrow.status = "released";
      escrow.closedAt = new Date().toISOString();
    }
    return escrow;
  }

  refund(escrowId: string): Escrow | undefined {
    const escrow = this.escrows.get(escrowId);
    if (!escrow || escrow.status === "released" || escrow.status === "refunded") return undefined;
    const refundAmount = Math.round((escrow.totalAmountUsd - escrow.releasedUsd) * 100) / 100;
    escrow.status = "refunded";
    escrow.closedAt = new Date().toISOString();
    this.refundedTotal = Math.round((this.refundedTotal + refundAmount) * 100) / 100;
    this.bus.publish("escrow.refunded", { escrowId, amountUsd: refundAmount });
    return escrow;
  }

  dispute(escrowId: string): Escrow | undefined {
    const escrow = this.escrows.get(escrowId);
    if (!escrow || escrow.status === "released" || escrow.status === "refunded") return undefined;
    escrow.status = "disputed";
    return escrow;
  }

  getEscrow(id: string): Escrow | undefined { return this.escrows.get(id); }
  listEscrows(status?: EscrowStatus): Escrow[] {
    const all = Array.from(this.escrows.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): EscrowSummary {
    const escrows = Array.from(this.escrows.values());
    const held = escrows.filter(e => e.status === "funded" || e.status === "disputed").reduce((s, e) => s + (e.totalAmountUsd - e.releasedUsd), 0);
    return {
      totalEscrows: escrows.length,
      open: escrows.filter(e => e.status === "open" || e.status === "funded").length,
      totalHeldUsd: Math.round(held * 100) / 100,
      totalReleasedUsd: Math.round(escrows.reduce((s, e) => s + e.releasedUsd, 0) * 100) / 100,
      totalRefundedUsd: this.refundedTotal,
      disputed: escrows.filter(e => e.status === "disputed").length,
    };
  }
}
