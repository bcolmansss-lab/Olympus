/**
 * LoanServicingManager — installment loan servicing: amortized loan origination,
 * payment application (interest then principal), balance/delinquency tracking,
 * and payoff detection.
 *
 * Events:
 *   - "loan.originated": { loanId, borrowerId, principalUsd, termMonths }
 *   - "loan.payment_applied": { loanId, principalPaid, interestPaid, balanceUsd }
 *   - "loan.paid_off": { loanId, totalInterestPaidUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type LoanStatus = "current" | "delinquent" | "paid_off" | "defaulted";

export interface LoanPayment {
  id: string;
  amountUsd: number;
  principalPaid: number;
  interestPaid: number;
  at: string;
}

export interface Loan {
  id: string;
  borrowerId: string;
  principalUsd: number;
  annualRatePct: number;
  termMonths: number;
  monthlyPaymentUsd: number;
  balanceUsd: number;
  interestPaidUsd: number;
  paymentsMade: number;
  status: LoanStatus;
  payments: LoanPayment[];
  originatedAt: string;
}

export interface LoanServicingSummary {
  totalLoans: number;
  current: number;
  delinquent: number;
  paidOff: number;
  totalOutstandingUsd: number;
  totalInterestCollectedUsd: number;
}

export class LoanServicingManager {
  private loans: Map<string, Loan> = new Map();

  constructor(private readonly bus: EventBus) {}

  private monthlyPayment(principal: number, annualRatePct: number, termMonths: number): number {
    if (termMonths <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return Math.round((principal / termMonths) * 100) / 100;
    return Math.round(((principal * r) / (1 - Math.pow(1 + r, -termMonths))) * 100) / 100;
  }

  originate(input: { borrowerId: string; principalUsd: number; annualRatePct: number; termMonths: number; originatedAt: string }): Loan {
    const monthlyPaymentUsd = this.monthlyPayment(input.principalUsd, input.annualRatePct, input.termMonths);
    const loan: Loan = { ...input, id: randomUUID(), monthlyPaymentUsd, balanceUsd: input.principalUsd, interestPaidUsd: 0, paymentsMade: 0, status: "current", payments: [] };
    this.loans.set(loan.id, loan);
    this.bus.publish("loan.originated", { loanId: loan.id, borrowerId: loan.borrowerId, principalUsd: loan.principalUsd, termMonths: loan.termMonths });
    return loan;
  }

  applyPayment(loanId: string, amountUsd: number, at: string): LoanPayment | undefined {
    const loan = this.loans.get(loanId);
    if (!loan || loan.status === "paid_off" || amountUsd <= 0) return undefined;
    const monthlyInterest = Math.round((loan.balanceUsd * (loan.annualRatePct / 100 / 12)) * 100) / 100;
    const interestPaid = Math.min(monthlyInterest, amountUsd);
    const principalPaid = Math.min(loan.balanceUsd, Math.round((amountUsd - interestPaid) * 100) / 100);
    loan.balanceUsd = Math.round((loan.balanceUsd - principalPaid) * 100) / 100;
    loan.interestPaidUsd = Math.round((loan.interestPaidUsd + interestPaid) * 100) / 100;
    loan.paymentsMade += 1;
    if (loan.status === "delinquent") loan.status = "current";
    const payment: LoanPayment = { id: randomUUID(), amountUsd, principalPaid, interestPaid, at };
    loan.payments.push(payment);
    this.bus.publish("loan.payment_applied", { loanId, principalPaid, interestPaid, balanceUsd: loan.balanceUsd });
    if (loan.balanceUsd <= 0) {
      loan.balanceUsd = 0;
      loan.status = "paid_off";
      this.bus.publish("loan.paid_off", { loanId, totalInterestPaidUsd: loan.interestPaidUsd });
    }
    return payment;
  }

  markDelinquent(loanId: string): Loan | undefined {
    const loan = this.loans.get(loanId);
    if (!loan || loan.status !== "current") return undefined;
    loan.status = "delinquent";
    return loan;
  }

  markDefaulted(loanId: string): Loan | undefined {
    const loan = this.loans.get(loanId);
    if (!loan || loan.status === "paid_off") return undefined;
    loan.status = "defaulted";
    return loan;
  }

  getLoan(id: string): Loan | undefined { return this.loans.get(id); }
  listLoans(status?: LoanStatus, borrowerId?: string): Loan[] {
    let all = Array.from(this.loans.values());
    if (status) all = all.filter(l => l.status === status);
    if (borrowerId) all = all.filter(l => l.borrowerId === borrowerId);
    return all;
  }

  summary(): LoanServicingSummary {
    const loans = Array.from(this.loans.values());
    return {
      totalLoans: loans.length,
      current: loans.filter(l => l.status === "current").length,
      delinquent: loans.filter(l => l.status === "delinquent").length,
      paidOff: loans.filter(l => l.status === "paid_off").length,
      totalOutstandingUsd: Math.round(loans.filter(l => l.status !== "paid_off").reduce((s, l) => s + l.balanceUsd, 0) * 100) / 100,
      totalInterestCollectedUsd: Math.round(loans.reduce((s, l) => s + l.interestPaidUsd, 0) * 100) / 100,
    };
  }
}
