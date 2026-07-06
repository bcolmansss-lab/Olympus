/**
 * TreasuryManager — cash management, bank account tracking, liquidity monitoring,
 * FX exposure, investment portfolio, and cash flow forecasting.
 *
 * Events:
 *   - "treasury.low_balance_alert": { accountId, name, balanceUsd, thresholdUsd }
 *   - "treasury.transfer_executed": { fromAccountId, toAccountId, amountUsd, currency }
 *   - "treasury.fx_exposure_alert": { currency, exposureUsd, thresholdUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AccountType = "operating" | "payroll" | "reserve" | "investment" | "escrow" | "tax";
export type Currency = "USD" | "EUR" | "GBP" | "JPY" | "CAD" | "AUD";

export interface BankAccount {
  id: string;
  name: string;
  bank: string;
  accountType: AccountType;
  currency: Currency;
  balanceUsd: number;
  lowBalanceThresholdUsd: number;
  iban?: string;
  createdAt: string;
}

export interface CashTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountUsd: number;
  currency: Currency;
  purpose: string;
  executedAt: string;
  approvedBy?: string;
}

export interface FXPosition {
  currency: Currency;
  exposureUsd: number;
  direction: "long" | "short";
  hedged: boolean;
  alertThresholdUsd: number;
}

export interface TreasurySummary {
  totalCashUsd: number;
  operatingCashUsd: number;
  reserveCashUsd: number;
  totalAccounts: number;
  lowBalanceAccounts: number;
  totalFXExposureUsd: number;
}

export class TreasuryManager {
  private accounts: Map<string, BankAccount> = new Map();
  private transfers: Map<string, CashTransfer> = new Map();
  private fxPositions: Map<Currency, FXPosition> = new Map();

  constructor(private readonly bus: EventBus) {}

  addAccount(input: Omit<BankAccount, "id" | "createdAt"> & { id?: string }): BankAccount {
    const account: BankAccount = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.accounts.set(account.id, account);
    if (account.balanceUsd < account.lowBalanceThresholdUsd) {
      this.bus.publish("treasury.low_balance_alert", { accountId: account.id, name: account.name, balanceUsd: account.balanceUsd, thresholdUsd: account.lowBalanceThresholdUsd });
    }
    return account;
  }

  updateBalance(accountId: string, newBalanceUsd: number): BankAccount | undefined {
    const account = this.accounts.get(accountId);
    if (!account) return undefined;
    account.balanceUsd = newBalanceUsd;
    if (newBalanceUsd < account.lowBalanceThresholdUsd) {
      this.bus.publish("treasury.low_balance_alert", { accountId, name: account.name, balanceUsd: newBalanceUsd, thresholdUsd: account.lowBalanceThresholdUsd });
    }
    return account;
  }

  executeTransfer(input: Omit<CashTransfer, "id" | "executedAt"> & { id?: string }): CashTransfer | undefined {
    const from = this.accounts.get(input.fromAccountId);
    const to = this.accounts.get(input.toAccountId);
    if (!from || !to) return undefined;
    from.balanceUsd -= input.amountUsd;
    to.balanceUsd += input.amountUsd;
    const transfer: CashTransfer = { ...input, id: input.id ?? randomUUID(), executedAt: new Date().toISOString() };
    this.transfers.set(transfer.id, transfer);
    this.bus.publish("treasury.transfer_executed", { fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, amountUsd: input.amountUsd, currency: input.currency });
    return transfer;
  }

  setFXPosition(position: FXPosition): void {
    this.fxPositions.set(position.currency, position);
    if (position.exposureUsd > position.alertThresholdUsd) {
      this.bus.publish("treasury.fx_exposure_alert", { currency: position.currency, exposureUsd: position.exposureUsd, thresholdUsd: position.alertThresholdUsd });
    }
  }

  getAccount(id: string): BankAccount | undefined { return this.accounts.get(id); }
  listAccounts(type?: AccountType): BankAccount[] {
    const all = Array.from(this.accounts.values());
    return type ? all.filter((a) => a.accountType === type) : all;
  }

  listTransfers(): CashTransfer[] { return Array.from(this.transfers.values()); }
  listFXPositions(): FXPosition[] { return Array.from(this.fxPositions.values()); }

  summary(): TreasurySummary {
    const accounts = Array.from(this.accounts.values());
    const fxPositions = Array.from(this.fxPositions.values());
    return {
      totalCashUsd: accounts.reduce((s, a) => s + a.balanceUsd, 0),
      operatingCashUsd: accounts.filter((a) => a.accountType === "operating").reduce((s, a) => s + a.balanceUsd, 0),
      reserveCashUsd: accounts.filter((a) => a.accountType === "reserve").reduce((s, a) => s + a.balanceUsd, 0),
      totalAccounts: accounts.length,
      lowBalanceAccounts: accounts.filter((a) => a.balanceUsd < a.lowBalanceThresholdUsd).length,
      totalFXExposureUsd: fxPositions.reduce((s, p) => s + p.exposureUsd, 0),
    };
  }
}
