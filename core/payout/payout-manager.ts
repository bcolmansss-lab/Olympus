/**
 * PayoutManager — marketplace/seller payouts: accrue earnings per payee from
 * sales minus platform fees, schedule payouts on a minimum threshold, and
 * track paid/on-hold balances.
 *
 * Events:
 *   - "payout.earning_accrued": { payeeId, grossUsd, feeUsd, netUsd }
 *   - "payout.scheduled": { payoutId, payeeId, amountUsd }
 *   - "payout.paid": { payoutId, payeeId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PayoutStatus = "scheduled" | "paid" | "failed";

export interface PayeeAccount {
  payeeId: string;
  balanceUsd: number; // available to pay out
  lifetimeEarnedUsd: number;
  lifetimePaidUsd: number;
  onHold: boolean;
}

export interface Payout {
  id: string;
  payeeId: string;
  amountUsd: number;
  status: PayoutStatus;
  scheduledAt: string;
  paidAt?: string;
}

export interface PayoutSummary {
  totalPayees: number;
  totalBalanceUsd: number;
  totalPaidUsd: number;
  scheduledPayouts: number;
  totalFeesCollectedUsd: number;
}

export class PayoutManager {
  private accounts: Map<string, PayeeAccount> = new Map();
  private payouts: Map<string, Payout> = new Map();
  private feePct: number;
  private minPayoutUsd: number;
  private feesCollected = 0;

  constructor(private readonly bus: EventBus, feePct = 10, minPayoutUsd = 50) {
    this.feePct = feePct;
    this.minPayoutUsd = minPayoutUsd;
  }

  private ensureAccount(payeeId: string): PayeeAccount {
    let acct = this.accounts.get(payeeId);
    if (!acct) {
      acct = { payeeId, balanceUsd: 0, lifetimeEarnedUsd: 0, lifetimePaidUsd: 0, onHold: false };
      this.accounts.set(payeeId, acct);
    }
    return acct;
  }

  accrueEarning(payeeId: string, grossUsd: number): PayeeAccount | undefined {
    if (grossUsd <= 0) return undefined;
    const acct = this.ensureAccount(payeeId);
    const feeUsd = Math.round(grossUsd * (this.feePct / 100) * 100) / 100;
    const netUsd = Math.round((grossUsd - feeUsd) * 100) / 100;
    acct.balanceUsd = Math.round((acct.balanceUsd + netUsd) * 100) / 100;
    acct.lifetimeEarnedUsd = Math.round((acct.lifetimeEarnedUsd + netUsd) * 100) / 100;
    this.feesCollected = Math.round((this.feesCollected + feeUsd) * 100) / 100;
    this.bus.publish("payout.earning_accrued", { payeeId, grossUsd, feeUsd, netUsd });
    return acct;
  }

  setHold(payeeId: string, onHold: boolean): PayeeAccount | undefined {
    const acct = this.accounts.get(payeeId);
    if (!acct) return undefined;
    acct.onHold = onHold;
    return acct;
  }

  /** Schedule a payout of the full available balance if it meets the minimum. */
  schedulePayout(payeeId: string, asOf: string): Payout | undefined {
    const acct = this.accounts.get(payeeId);
    if (!acct || acct.onHold || acct.balanceUsd < this.minPayoutUsd) return undefined;
    const amount = acct.balanceUsd;
    acct.balanceUsd = 0;
    const payout: Payout = { id: randomUUID(), payeeId, amountUsd: amount, status: "scheduled", scheduledAt: asOf };
    this.payouts.set(payout.id, payout);
    this.bus.publish("payout.scheduled", { payoutId: payout.id, payeeId, amountUsd: amount });
    return payout;
  }

  markPaid(payoutId: string, asOf: string): Payout | undefined {
    const payout = this.payouts.get(payoutId);
    if (!payout || payout.status !== "scheduled") return undefined;
    payout.status = "paid";
    payout.paidAt = asOf;
    const acct = this.accounts.get(payout.payeeId);
    if (acct) acct.lifetimePaidUsd = Math.round((acct.lifetimePaidUsd + payout.amountUsd) * 100) / 100;
    this.bus.publish("payout.paid", { payoutId, payeeId: payout.payeeId, amountUsd: payout.amountUsd });
    return payout;
  }

  /** Failed payout returns funds to the payee balance. */
  markFailed(payoutId: string): Payout | undefined {
    const payout = this.payouts.get(payoutId);
    if (!payout || payout.status !== "scheduled") return undefined;
    payout.status = "failed";
    const acct = this.accounts.get(payout.payeeId);
    if (acct) acct.balanceUsd = Math.round((acct.balanceUsd + payout.amountUsd) * 100) / 100;
    return payout;
  }

  getAccount(payeeId: string): PayeeAccount | undefined { return this.accounts.get(payeeId); }
  getPayout(id: string): Payout | undefined { return this.payouts.get(id); }
  listAccounts(): PayeeAccount[] { return Array.from(this.accounts.values()); }
  listPayouts(status?: PayoutStatus): Payout[] {
    const all = Array.from(this.payouts.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): PayoutSummary {
    const accounts = Array.from(this.accounts.values());
    return {
      totalPayees: accounts.length,
      totalBalanceUsd: Math.round(accounts.reduce((s, a) => s + a.balanceUsd, 0) * 100) / 100,
      totalPaidUsd: Math.round(accounts.reduce((s, a) => s + a.lifetimePaidUsd, 0) * 100) / 100,
      scheduledPayouts: Array.from(this.payouts.values()).filter(p => p.status === "scheduled").length,
      totalFeesCollectedUsd: this.feesCollected,
    };
  }
}
