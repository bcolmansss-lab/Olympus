/**
 * PurchaseCardManager — corporate purchasing card (P-card) issuance, spend
 * limits, transaction posting, merchant-category controls, and reconciliation.
 *
 * Events:
 *   - "pcard.issued": { cardId, holderId, monthlyLimitUsd }
 *   - "pcard.transaction_posted": { cardId, amountUsd, merchantCategory }
 *   - "pcard.limit_exceeded": { cardId, attemptedUsd, availableUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CardStatus = "active" | "frozen" | "cancelled";
export type TransactionState = "pending" | "reconciled" | "disputed";

export interface PurchaseCard {
  id: string;
  holderId: string;
  last4: string;
  status: CardStatus;
  monthlyLimitUsd: number;
  currentMonthSpendUsd: number;
  allowedCategories: string[]; // empty = all allowed
  createdAt: string;
}

export interface CardTransaction {
  id: string;
  cardId: string;
  amountUsd: number;
  merchant: string;
  merchantCategory: string;
  state: TransactionState;
  postedAt: string;
}

export interface PurchaseCardSummary {
  totalCards: number;
  activeCards: number;
  totalTransactions: number;
  totalSpendUsd: number;
  pendingReconciliation: number;
  disputed: number;
}

export class PurchaseCardManager {
  private cards: Map<string, PurchaseCard> = new Map();
  private transactions: Map<string, CardTransaction> = new Map();

  constructor(private readonly bus: EventBus) {}

  issueCard(holderId: string, last4: string, monthlyLimitUsd: number, allowedCategories: string[] = []): PurchaseCard {
    const card: PurchaseCard = { id: randomUUID(), holderId, last4, status: "active", monthlyLimitUsd, currentMonthSpendUsd: 0, allowedCategories, createdAt: new Date().toISOString() };
    this.cards.set(card.id, card);
    this.bus.publish("pcard.issued", { cardId: card.id, holderId, monthlyLimitUsd });
    return card;
  }

  setStatus(cardId: string, status: CardStatus): PurchaseCard | undefined {
    const card = this.cards.get(cardId);
    if (!card) return undefined;
    card.status = status;
    return card;
  }

  postTransaction(cardId: string, amountUsd: number, merchant: string, merchantCategory: string, postedAt: string): CardTransaction | undefined {
    const card = this.cards.get(cardId);
    if (!card || card.status !== "active" || amountUsd <= 0) return undefined;
    if (card.allowedCategories.length > 0 && !card.allowedCategories.includes(merchantCategory)) return undefined;
    const available = card.monthlyLimitUsd - card.currentMonthSpendUsd;
    if (amountUsd > available) {
      this.bus.publish("pcard.limit_exceeded", { cardId, attemptedUsd: amountUsd, availableUsd: Math.round(available * 100) / 100 });
      return undefined;
    }
    const tx: CardTransaction = { id: randomUUID(), cardId, amountUsd, merchant, merchantCategory, state: "pending", postedAt };
    this.transactions.set(tx.id, tx);
    card.currentMonthSpendUsd = Math.round((card.currentMonthSpendUsd + amountUsd) * 100) / 100;
    this.bus.publish("pcard.transaction_posted", { cardId, amountUsd, merchantCategory });
    return tx;
  }

  reconcile(transactionId: string): CardTransaction | undefined {
    const tx = this.transactions.get(transactionId);
    if (!tx || tx.state !== "pending") return undefined;
    tx.state = "reconciled";
    return tx;
  }

  dispute(transactionId: string): CardTransaction | undefined {
    const tx = this.transactions.get(transactionId);
    if (!tx) return undefined;
    tx.state = "disputed";
    return tx;
  }

  resetMonthlySpend(cardId: string): PurchaseCard | undefined {
    const card = this.cards.get(cardId);
    if (!card) return undefined;
    card.currentMonthSpendUsd = 0;
    return card;
  }

  getCard(id: string): PurchaseCard | undefined { return this.cards.get(id); }
  listCards(status?: CardStatus): PurchaseCard[] {
    const all = Array.from(this.cards.values());
    return status ? all.filter(c => c.status === status) : all;
  }
  listTransactions(cardId?: string, state?: TransactionState): CardTransaction[] {
    let all = Array.from(this.transactions.values());
    if (cardId) all = all.filter(t => t.cardId === cardId);
    if (state) all = all.filter(t => t.state === state);
    return all;
  }

  summary(): PurchaseCardSummary {
    const cards = Array.from(this.cards.values());
    const txs = Array.from(this.transactions.values());
    return {
      totalCards: cards.length,
      activeCards: cards.filter(c => c.status === "active").length,
      totalTransactions: txs.length,
      totalSpendUsd: Math.round(txs.reduce((s, t) => s + t.amountUsd, 0) * 100) / 100,
      pendingReconciliation: txs.filter(t => t.state === "pending").length,
      disputed: txs.filter(t => t.state === "disputed").length,
    };
  }
}
