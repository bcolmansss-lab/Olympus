/**
 * POSTerminalManager — point-of-sale register sessions: shift open with a
 * starting float, sale/refund/payout cash movements, expected-vs-counted
 * reconciliation at close, and over/short variance.
 *
 * Events:
 *   - "pos.session_opened": { sessionId, terminalId, cashierId, floatUsd }
 *   - "pos.movement": { sessionId, kind, amountUsd }
 *   - "pos.session_closed": { sessionId, expectedUsd, countedUsd, varianceUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SessionStatus = "open" | "closed";
export type MovementKind = "cash_sale" | "cash_refund" | "paid_in" | "paid_out";

export interface CashMovement {
  id: string;
  kind: MovementKind;
  amountUsd: number;
  at: string;
}

export interface POSSession {
  id: string;
  terminalId: string;
  cashierId: string;
  status: SessionStatus;
  floatUsd: number;
  movements: CashMovement[];
  openedAt: string;
  closedAt?: string;
  countedUsd?: number;
  varianceUsd?: number;
}

export interface POSSummary {
  totalSessions: number;
  openSessions: number;
  totalCashSalesUsd: number;
  totalVarianceUsd: number;
  shortSessions: number;
  overSessions: number;
}

export class POSTerminalManager {
  private sessions: Map<string, POSSession> = new Map();

  constructor(private readonly bus: EventBus) {}

  open(terminalId: string, cashierId: string, floatUsd: number, asOf: string): POSSession | undefined {
    if (floatUsd < 0) return undefined;
    // one open session per terminal
    if (Array.from(this.sessions.values()).some(s => s.terminalId === terminalId && s.status === "open")) return undefined;
    const session: POSSession = { id: randomUUID(), terminalId, cashierId, status: "open", floatUsd, movements: [], openedAt: asOf };
    this.sessions.set(session.id, session);
    this.bus.publish("pos.session_opened", { sessionId: session.id, terminalId, cashierId, floatUsd });
    return session;
  }

  record(sessionId: string, kind: MovementKind, amountUsd: number, at: string): CashMovement | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "open" || amountUsd <= 0) return undefined;
    const movement: CashMovement = { id: randomUUID(), kind, amountUsd, at };
    session.movements.push(movement);
    this.bus.publish("pos.movement", { sessionId, kind, amountUsd });
    return movement;
  }

  /** Expected drawer cash = float + sales + paid-in − refunds − paid-out. */
  expectedCash(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    let cash = session.floatUsd;
    for (const m of session.movements) {
      if (m.kind === "cash_sale" || m.kind === "paid_in") cash += m.amountUsd;
      else cash -= m.amountUsd;
    }
    return Math.round(cash * 100) / 100;
  }

  close(sessionId: string, countedUsd: number, asOf: string): POSSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "open") return undefined;
    const expected = this.expectedCash(sessionId);
    session.status = "closed";
    session.closedAt = asOf;
    session.countedUsd = countedUsd;
    session.varianceUsd = Math.round((countedUsd - expected) * 100) / 100;
    this.bus.publish("pos.session_closed", { sessionId, expectedUsd: expected, countedUsd, varianceUsd: session.varianceUsd });
    return session;
  }

  getSession(id: string): POSSession | undefined { return this.sessions.get(id); }
  listSessions(status?: SessionStatus, terminalId?: string): POSSession[] {
    let all = Array.from(this.sessions.values());
    if (status) all = all.filter(s => s.status === status);
    if (terminalId) all = all.filter(s => s.terminalId === terminalId);
    return all;
  }

  summary(): POSSummary {
    const sessions = Array.from(this.sessions.values());
    const closed = sessions.filter(s => s.status === "closed");
    const cashSales = sessions.flatMap(s => s.movements).filter(m => m.kind === "cash_sale").reduce((s, m) => s + m.amountUsd, 0);
    return {
      totalSessions: sessions.length,
      openSessions: sessions.filter(s => s.status === "open").length,
      totalCashSalesUsd: Math.round(cashSales * 100) / 100,
      totalVarianceUsd: Math.round(closed.reduce((s, x) => s + (x.varianceUsd ?? 0), 0) * 100) / 100,
      shortSessions: closed.filter(s => (s.varianceUsd ?? 0) < 0).length,
      overSessions: closed.filter(s => (s.varianceUsd ?? 0) > 0).length,
    };
  }
}
