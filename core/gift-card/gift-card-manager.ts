/**
 * GiftCardManager — gift card issuance, balance tracking, redemption,
 * reloading, and outstanding-liability analytics.
 *
 * Events:
 *   - "giftcard.issued": { cardId, code, initialBalanceUsd }
 *   - "giftcard.redeemed": { cardId, amountUsd, remainingBalanceUsd }
 *   - "giftcard.depleted": { cardId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type GiftCardStatus = "active" | "depleted" | "expired" | "void";

export interface GiftCard {
  id: string;
  code: string;
  initialBalanceUsd: number;
  balanceUsd: number;
  status: GiftCardStatus;
  recipientId?: string;
  issuedAt: string;
  expiresAt?: string;
}

export interface GiftCardTransaction {
  id: string;
  cardId: string;
  kind: "issue" | "redeem" | "reload";
  amountUsd: number;
  balanceAfterUsd: number;
  at: string;
}

export interface GiftCardSummary {
  totalCards: number;
  activeCards: number;
  totalIssuedUsd: number;
  outstandingLiabilityUsd: number;
  totalRedeemedUsd: number;
  redemptionRatePct: number;
}

export class GiftCardManager {
  private cards: Map<string, GiftCard> = new Map();
  private byCode: Map<string, string> = new Map();
  private transactions: GiftCardTransaction[] = [];

  constructor(private readonly bus: EventBus) {}

  issue(code: string, initialBalanceUsd: number, recipientId?: string, expiresAt?: string): GiftCard | undefined {
    if (this.byCode.has(code) || initialBalanceUsd <= 0) return undefined;
    const card: GiftCard = { id: randomUUID(), code, initialBalanceUsd, balanceUsd: initialBalanceUsd, status: "active", recipientId, issuedAt: new Date().toISOString(), expiresAt };
    this.cards.set(card.id, card);
    this.byCode.set(code, card.id);
    this.transactions.push({ id: randomUUID(), cardId: card.id, kind: "issue", amountUsd: initialBalanceUsd, balanceAfterUsd: initialBalanceUsd, at: card.issuedAt });
    this.bus.publish("giftcard.issued", { cardId: card.id, code, initialBalanceUsd });
    return card;
  }

  redeem(code: string, amountUsd: number, asOf: string): GiftCardTransaction | undefined {
    const id = this.byCode.get(code);
    if (!id) return undefined;
    const card = this.cards.get(id)!;
    if (card.status !== "active" || amountUsd <= 0 || amountUsd > card.balanceUsd) return undefined;
    if (card.expiresAt && new Date(asOf).getTime() > new Date(card.expiresAt).getTime()) {
      card.status = "expired";
      return undefined;
    }
    card.balanceUsd = Math.round((card.balanceUsd - amountUsd) * 100) / 100;
    const tx: GiftCardTransaction = { id: randomUUID(), cardId: card.id, kind: "redeem", amountUsd, balanceAfterUsd: card.balanceUsd, at: asOf };
    this.transactions.push(tx);
    this.bus.publish("giftcard.redeemed", { cardId: card.id, amountUsd, remainingBalanceUsd: card.balanceUsd });
    if (card.balanceUsd === 0) {
      card.status = "depleted";
      this.bus.publish("giftcard.depleted", { cardId: card.id });
    }
    return tx;
  }

  reload(code: string, amountUsd: number, asOf: string): GiftCardTransaction | undefined {
    const id = this.byCode.get(code);
    if (!id) return undefined;
    const card = this.cards.get(id)!;
    if (card.status === "void" || amountUsd <= 0) return undefined;
    card.balanceUsd = Math.round((card.balanceUsd + amountUsd) * 100) / 100;
    if (card.status === "depleted") card.status = "active";
    const tx: GiftCardTransaction = { id: randomUUID(), cardId: card.id, kind: "reload", amountUsd, balanceAfterUsd: card.balanceUsd, at: asOf };
    this.transactions.push(tx);
    return tx;
  }

  voidCard(code: string): GiftCard | undefined {
    const id = this.byCode.get(code);
    if (!id) return undefined;
    const card = this.cards.get(id)!;
    card.status = "void";
    return card;
  }

  findByCode(code: string): GiftCard | undefined { const id = this.byCode.get(code); return id ? this.cards.get(id) : undefined; }
  listCards(status?: GiftCardStatus): GiftCard[] {
    const all = Array.from(this.cards.values());
    return status ? all.filter(c => c.status === status) : all;
  }
  listTransactions(cardId?: string): GiftCardTransaction[] {
    return cardId ? this.transactions.filter(t => t.cardId === cardId) : [...this.transactions];
  }

  summary(): GiftCardSummary {
    const cards = Array.from(this.cards.values());
    const totalIssued = cards.reduce((s, c) => s + c.initialBalanceUsd, 0);
    const outstanding = cards.filter(c => c.status === "active" || c.status === "depleted").reduce((s, c) => s + c.balanceUsd, 0);
    const totalRedeemed = this.transactions.filter(t => t.kind === "redeem").reduce((s, t) => s + t.amountUsd, 0);
    return {
      totalCards: cards.length,
      activeCards: cards.filter(c => c.status === "active").length,
      totalIssuedUsd: totalIssued,
      outstandingLiabilityUsd: Math.round(outstanding * 100) / 100,
      totalRedeemedUsd: totalRedeemed,
      redemptionRatePct: totalIssued > 0 ? Math.round((totalRedeemed / totalIssued) * 100) : 0,
    };
  }
}
