/**
 * StoreCreditManager — customer store-credit wallets: credit issuance (refunds,
 * goodwill, returns), redemption against purchases, expiry, and liability
 * tracking.
 *
 * Events:
 *   - "storecredit.issued": { walletId, customerId, amountUsd, reason }
 *   - "storecredit.redeemed": { walletId, amountUsd, balanceUsd }
 *   - "storecredit.expired": { walletId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CreditReason = "refund" | "goodwill" | "return" | "promotion" | "loyalty";

export interface CreditEntry {
  id: string;
  amountUsd: number;
  reason: CreditReason;
  issuedAt: string;
  expiresAt?: string;
  expired: boolean;
}

export interface CreditWallet {
  id: string;
  customerId: string;
  balanceUsd: number;
  entries: CreditEntry[];
  createdAt: string;
}

export interface StoreCreditSummary {
  totalWallets: number;
  totalOutstandingUsd: number;
  totalIssuedUsd: number;
  totalRedeemedUsd: number;
  totalExpiredUsd: number;
}

export class StoreCreditManager {
  private wallets: Map<string, CreditWallet> = new Map();
  private byCustomer: Map<string, string> = new Map();
  private issuedTotal = 0;
  private redeemedTotal = 0;
  private expiredTotal = 0;

  constructor(private readonly bus: EventBus) {}

  private ensureWallet(customerId: string): CreditWallet {
    const existingId = this.byCustomer.get(customerId);
    if (existingId) return this.wallets.get(existingId)!;
    const wallet: CreditWallet = { id: randomUUID(), customerId, balanceUsd: 0, entries: [], createdAt: new Date().toISOString() };
    this.wallets.set(wallet.id, wallet);
    this.byCustomer.set(customerId, wallet.id);
    return wallet;
  }

  issue(customerId: string, amountUsd: number, reason: CreditReason, expiresAt?: string): CreditWallet | undefined {
    if (amountUsd <= 0) return undefined;
    const wallet = this.ensureWallet(customerId);
    wallet.entries.push({ id: randomUUID(), amountUsd, reason, issuedAt: new Date().toISOString(), expiresAt, expired: false });
    wallet.balanceUsd = Math.round((wallet.balanceUsd + amountUsd) * 100) / 100;
    this.issuedTotal = Math.round((this.issuedTotal + amountUsd) * 100) / 100;
    this.bus.publish("storecredit.issued", { walletId: wallet.id, customerId, amountUsd, reason });
    return wallet;
  }

  redeem(customerId: string, amountUsd: number): boolean {
    const walletId = this.byCustomer.get(customerId);
    if (!walletId || amountUsd <= 0) return false;
    const wallet = this.wallets.get(walletId)!;
    if (amountUsd > wallet.balanceUsd) return false;
    wallet.balanceUsd = Math.round((wallet.balanceUsd - amountUsd) * 100) / 100;
    this.redeemedTotal = Math.round((this.redeemedTotal + amountUsd) * 100) / 100;
    this.bus.publish("storecredit.redeemed", { walletId, amountUsd, balanceUsd: wallet.balanceUsd });
    return true;
  }

  /** Expire credit entries past their expiry; reduce balance accordingly. */
  expireCredits(asOf: string): number {
    const cutoff = new Date(asOf).getTime();
    let totalExpired = 0;
    for (const wallet of this.wallets.values()) {
      for (const entry of wallet.entries) {
        if (!entry.expired && entry.expiresAt && new Date(entry.expiresAt).getTime() < cutoff) {
          entry.expired = true;
          const reduce = Math.min(entry.amountUsd, wallet.balanceUsd);
          wallet.balanceUsd = Math.round((wallet.balanceUsd - reduce) * 100) / 100;
          totalExpired += reduce;
          this.bus.publish("storecredit.expired", { walletId: wallet.id, amountUsd: reduce });
        }
      }
    }
    this.expiredTotal = Math.round((this.expiredTotal + totalExpired) * 100) / 100;
    return Math.round(totalExpired * 100) / 100;
  }

  balance(customerId: string): number {
    const walletId = this.byCustomer.get(customerId);
    return walletId ? this.wallets.get(walletId)!.balanceUsd : 0;
  }
  getWallet(customerId: string): CreditWallet | undefined {
    const walletId = this.byCustomer.get(customerId);
    return walletId ? this.wallets.get(walletId) : undefined;
  }
  listWallets(): CreditWallet[] { return Array.from(this.wallets.values()); }

  summary(): StoreCreditSummary {
    return {
      totalWallets: this.wallets.size,
      totalOutstandingUsd: Math.round(Array.from(this.wallets.values()).reduce((s, w) => s + w.balanceUsd, 0) * 100) / 100,
      totalIssuedUsd: this.issuedTotal,
      totalRedeemedUsd: this.redeemedTotal,
      totalExpiredUsd: this.expiredTotal,
    };
  }
}
