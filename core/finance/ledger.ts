/**
 * FinancialLedger — in-memory double-entry bookkeeping.
 *
 * Tracks:
 *   - Accounts (asset, liability, revenue, expense, equity)
 *   - Journal entries (debit/credit pairs that always balance)
 *   - Running balances per account
 *   - Burn rate = average monthly net cash outflow over a rolling window
 *   - Runway = current cash balance / monthly burn rate (in months)
 *
 * Events emitted:
 *   - "finance.entry_posted": { entryId, debitAccount, creditAccount, amount, description }
 *   - "finance.runway_warning": { runwayMonths, cashBalance, monthlyBurn } when runway < threshold
 */

import type { EventBus } from "../events/event-bus.js";

export type AccountType = "asset" | "liability" | "revenue" | "expense" | "equity";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Running balance. Positive = normal balance per account type. */
  balance: number;
}

export interface JournalEntry {
  id: string;
  date: string; // ISO date
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number; // always positive
  tags?: string[];
}

export interface BurnRateReport {
  /** Average monthly net cash outflow (positive = burning cash). */
  monthlyBurn: number;
  /** Current cash balance (sum of all asset accounts). */
  cashBalance: number;
  /** Estimated months of runway. Infinity if burn <= 0. */
  runwayMonths: number;
  /** Entries used for the calculation (last N months). */
  periodEntries: number;
}

export class FinancialLedger {
  private readonly accounts = new Map<string, Account>();
  private readonly entries: JournalEntry[] = [];
  private entrySeq = 0;
  /** Runway warning threshold in months. Default 6. */
  private readonly runwayWarningThreshold: number;

  constructor(
    private readonly bus: EventBus,
    opts?: { runwayWarningThreshold?: number }
  ) {
    this.runwayWarningThreshold = opts?.runwayWarningThreshold ?? 6;
  }

  addAccount(account: Omit<Account, "balance"> & { balance?: number }): this {
    this.accounts.set(account.id, { ...account, balance: account.balance ?? 0 });
    return this;
  }

  getAccount(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  listAccounts(): Account[] {
    return [...this.accounts.values()];
  }

  /**
   * Post a journal entry. Applies debit/credit to account balances.
   * Debit increases: asset, expense. Decreases: liability, revenue, equity.
   * Credit increases: liability, revenue, equity. Decreases: asset, expense.
   */
  post(input: Omit<JournalEntry, "id">): JournalEntry {
    const entry: JournalEntry = { ...input, id: `je-${++this.entrySeq}` };
    this.entries.push(entry);

    const debit = this.accounts.get(entry.debitAccountId);
    const credit = this.accounts.get(entry.creditAccountId);

    if (debit) {
      // Debit increases asset/expense, decreases liability/revenue/equity
      const sign = debit.type === "asset" || debit.type === "expense" ? 1 : -1;
      debit.balance += sign * entry.amount;
    }
    if (credit) {
      // Credit increases liability/revenue/equity, decreases asset/expense
      const sign = credit.type === "liability" || credit.type === "revenue" || credit.type === "equity" ? 1 : -1;
      credit.balance += sign * entry.amount;
    }

    this.bus.publish("finance.entry_posted", {
      entryId: entry.id,
      debitAccount: entry.debitAccountId,
      creditAccount: entry.creditAccountId,
      amount: entry.amount,
      description: entry.description,
    });

    // Check runway warning after every entry
    const report = this.burnRate();
    if (
      report.runwayMonths !== Infinity &&
      report.runwayMonths < this.runwayWarningThreshold
    ) {
      this.bus.publish("finance.runway_warning", {
        runwayMonths: report.runwayMonths,
        cashBalance: report.cashBalance,
        monthlyBurn: report.monthlyBurn,
      });
    }

    return entry;
  }

  /**
   * Compute burn rate over the last `windowMonths` months (default 3).
   * Monthly burn = total expense entries / windowMonths.
   * Runway = cashBalance / monthlyBurn.
   */
  burnRate(windowMonths = 3): BurnRateReport {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - windowMonths);
    const cutoffStr = cutoff.toISOString().split("T")[0]!;

    const windowEntries = this.entries.filter((e) => e.date >= cutoffStr);

    // Sum debits to expense accounts in window = cash outflow
    let totalExpenses = 0;
    for (const e of windowEntries) {
      const debitAcct = this.accounts.get(e.debitAccountId);
      if (debitAcct?.type === "expense") totalExpenses += e.amount;
    }

    // Sum credits to revenue accounts = cash inflow
    let totalRevenue = 0;
    for (const e of windowEntries) {
      const creditAcct = this.accounts.get(e.creditAccountId);
      if (creditAcct?.type === "revenue") totalRevenue += e.amount;
    }

    const monthlyBurn = Math.max(0, (totalExpenses - totalRevenue) / windowMonths);
    const cashBalance = [...this.accounts.values()]
      .filter((a) => a.type === "asset")
      .reduce((sum, a) => sum + a.balance, 0);

    const runwayMonths = monthlyBurn > 0 ? cashBalance / monthlyBurn : Infinity;

    return {
      monthlyBurn,
      cashBalance,
      runwayMonths,
      periodEntries: windowEntries.length,
    };
  }

  getEntries(): JournalEntry[] {
    return [...this.entries];
  }

  /** Net income = total revenue credits - total expense debits. */
  netIncome(): number {
    let revenue = 0;
    let expenses = 0;
    for (const e of this.entries) {
      const creditAcct = this.accounts.get(e.creditAccountId);
      if (creditAcct?.type === "revenue") revenue += e.amount;
      const debitAcct = this.accounts.get(e.debitAccountId);
      if (debitAcct?.type === "expense") expenses += e.amount;
    }
    return revenue - expenses;
  }
}
