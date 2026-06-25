/**
 * ChargebackManager — payment chargeback/dispute lifecycle: case intake,
 * representment (evidence submission), bank decision, and win-rate analytics.
 *
 * Events:
 *   - "chargeback.opened": { chargebackId, transactionId, amountUsd, reasonCode }
 *   - "chargeback.represented": { chargebackId, evidenceCount }
 *   - "chargeback.resolved": { chargebackId, won, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ChargebackReason = "fraud" | "product_not_received" | "product_unacceptable" | "duplicate" | "subscription_canceled" | "other";
export type ChargebackStatus = "open" | "represented" | "won" | "lost" | "accepted";

export interface Chargeback {
  id: string;
  transactionId: string;
  customerId: string;
  amountUsd: number;
  reasonCode: ChargebackReason;
  status: ChargebackStatus;
  evidence: string[];
  openedAt: string;
  dueBy: string;
  resolvedAt?: string;
}

export interface ChargebackSummary {
  totalChargebacks: number;
  open: number;
  won: number;
  lost: number;
  totalDisputedUsd: number;
  recoveredUsd: number;
  winRatePct: number;
  byReason: Partial<Record<ChargebackReason, number>>;
}

export class ChargebackManager {
  private chargebacks: Map<string, Chargeback> = new Map();

  constructor(private readonly bus: EventBus) {}

  open(input: { transactionId: string; customerId: string; amountUsd: number; reasonCode: ChargebackReason; openedAt: string; dueBy: string }): Chargeback {
    const chargeback: Chargeback = { ...input, id: randomUUID(), status: "open", evidence: [] };
    this.chargebacks.set(chargeback.id, chargeback);
    this.bus.publish("chargeback.opened", { chargebackId: chargeback.id, transactionId: chargeback.transactionId, amountUsd: chargeback.amountUsd, reasonCode: chargeback.reasonCode });
    return chargeback;
  }

  represent(chargebackId: string, evidence: string[]): Chargeback | undefined {
    const cb = this.chargebacks.get(chargebackId);
    if (!cb || cb.status !== "open" || evidence.length === 0) return undefined;
    cb.evidence.push(...evidence);
    cb.status = "represented";
    this.bus.publish("chargeback.represented", { chargebackId, evidenceCount: cb.evidence.length });
    return cb;
  }

  accept(chargebackId: string, asOf: string): Chargeback | undefined {
    const cb = this.chargebacks.get(chargebackId);
    if (!cb || cb.status === "won" || cb.status === "lost") return undefined;
    cb.status = "accepted";
    cb.resolvedAt = asOf;
    this.bus.publish("chargeback.resolved", { chargebackId, won: false, amountUsd: cb.amountUsd });
    return cb;
  }

  resolve(chargebackId: string, won: boolean, asOf: string): Chargeback | undefined {
    const cb = this.chargebacks.get(chargebackId);
    if (!cb || cb.status !== "represented") return undefined;
    cb.status = won ? "won" : "lost";
    cb.resolvedAt = asOf;
    this.bus.publish("chargeback.resolved", { chargebackId, won, amountUsd: cb.amountUsd });
    return cb;
  }

  getChargeback(id: string): Chargeback | undefined { return this.chargebacks.get(id); }
  listChargebacks(status?: ChargebackStatus, reason?: ChargebackReason): Chargeback[] {
    let all = Array.from(this.chargebacks.values());
    if (status) all = all.filter(c => c.status === status);
    if (reason) all = all.filter(c => c.reasonCode === reason);
    return all;
  }

  summary(): ChargebackSummary {
    const chargebacks = Array.from(this.chargebacks.values());
    const won = chargebacks.filter(c => c.status === "won");
    const decided = chargebacks.filter(c => c.status === "won" || c.status === "lost");
    const byReason: Partial<Record<ChargebackReason, number>> = {};
    for (const c of chargebacks) { byReason[c.reasonCode] = (byReason[c.reasonCode] ?? 0) + 1; }
    return {
      totalChargebacks: chargebacks.length,
      open: chargebacks.filter(c => c.status === "open" || c.status === "represented").length,
      won: won.length,
      lost: chargebacks.filter(c => c.status === "lost").length,
      totalDisputedUsd: Math.round(chargebacks.reduce((s, c) => s + c.amountUsd, 0) * 100) / 100,
      recoveredUsd: Math.round(won.reduce((s, c) => s + c.amountUsd, 0) * 100) / 100,
      winRatePct: decided.length > 0 ? Math.round((won.length / decided.length) * 100) : 0,
      byReason,
    };
  }
}
