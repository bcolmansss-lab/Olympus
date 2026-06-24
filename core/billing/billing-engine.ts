/**
 * BillingEngine — subscription invoicing, payment tracking, MRR/ARR movement, and dunning.
 *
 * MRR movements: new_business | expansion | contraction | churn | reactivation
 *
 * Events:
 *   - "billing.invoice_created": { invoiceId, customerId, amountUsd, dueDate }
 *   - "billing.payment_received": { invoiceId, customerId, amountUsd }
 *   - "billing.payment_failed": { invoiceId, customerId, attemptCount }
 *   - "billing.mrr_changed": { customerId, movement, deltaUsd, newMrrUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export type MrrMovement = "new_business" | "expansion" | "contraction" | "churn" | "reactivation";
export type PaymentMethod = "card" | "ach" | "wire" | "check" | "crypto";

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  planName: string;
  mrrUsd: number;
  status: "active" | "paused" | "cancelled" | "trial";
  billingCycleDay: number; // 1-28
  startDate: string;
  trialEndsAt?: string;
  cancelledAt?: string;
  paymentMethod: PaymentMethod;
  seats?: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  subscriptionId: string;
  status: InvoiceStatus;
  amountUsd: number;
  paidAmountUsd: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  paidAt?: string;
  attemptCount: number;
  lineItems: Array<{ description: string; quantity: number; unitPriceUsd: number; totalUsd: number }>;
  createdAt: string;
}

export interface MrrRecord {
  customerId: string;
  movement: MrrMovement;
  previousMrrUsd: number;
  newMrrUsd: number;
  deltaUsd: number;
  occurredAt: string;
}

export interface BillingSummary {
  totalMrrUsd: number;
  totalArrUsd: number;
  activeSubscriptions: number;
  openInvoicesUsd: number;
  overdueInvoicesUsd: number; // open past due date
  collectionRate: number; // paid / total invoiced * 100
  mrrMovements: { new_business: number; expansion: number; contraction: number; churn: number };
}

export class BillingEngine {
  private subscriptions: Map<string, Subscription> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  private mrrHistory: MrrRecord[] = [];

  constructor(private readonly bus: EventBus) {}

  addSubscription(input: Omit<Subscription, "id"> & { id?: string }): Subscription {
    const sub: Subscription = {
      ...input,
      id: input.id ?? randomUUID(),
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  createInvoice(input: Omit<Invoice, "id" | "createdAt" | "paidAmountUsd" | "attemptCount"> & { id?: string }): Invoice {
    const invoice: Invoice = {
      ...input,
      id: input.id ?? randomUUID(),
      paidAmountUsd: 0,
      attemptCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.invoices.set(invoice.id, invoice);
    this.bus.publish("billing.invoice_created", {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amountUsd: invoice.amountUsd,
      dueDate: invoice.dueDate,
    });
    return invoice;
  }

  recordPayment(invoiceId: string, amountUsd: number, paidAt?: string): Invoice | undefined {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return undefined;
    invoice.paidAmountUsd += amountUsd;
    if (invoice.paidAmountUsd >= invoice.amountUsd) {
      invoice.status = "paid";
      invoice.paidAt = paidAt ?? new Date().toISOString();
    }
    this.bus.publish("billing.payment_received", {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amountUsd,
    });
    return invoice;
  }

  recordFailedAttempt(invoiceId: string): Invoice | undefined {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return undefined;
    invoice.attemptCount += 1;
    this.bus.publish("billing.payment_failed", {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      attemptCount: invoice.attemptCount,
    });
    return invoice;
  }

  recordMrrMovement(customerId: string, movement: MrrMovement, newMrrUsd: number): MrrRecord {
    // Find current MRR for customer from their active subscription
    let previousMrrUsd = 0;
    for (const sub of this.subscriptions.values()) {
      if (sub.customerId === customerId && (sub.status === "active" || sub.status === "trial")) {
        previousMrrUsd = sub.mrrUsd;
        sub.mrrUsd = newMrrUsd;
        break;
      }
    }
    const deltaUsd = newMrrUsd - previousMrrUsd;
    const record: MrrRecord = {
      customerId,
      movement,
      previousMrrUsd,
      newMrrUsd,
      deltaUsd,
      occurredAt: new Date().toISOString(),
    };
    this.mrrHistory.push(record);
    this.bus.publish("billing.mrr_changed", {
      customerId,
      movement,
      deltaUsd,
      newMrrUsd,
    });
    return record;
  }

  getSubscription(id: string): Subscription | undefined {
    return this.subscriptions.get(id);
  }

  listSubscriptions(status?: string): Subscription[] {
    const all = Array.from(this.subscriptions.values());
    if (!status) return all;
    return all.filter((s) => s.status === status);
  }

  getInvoice(id: string): Invoice | undefined {
    return this.invoices.get(id);
  }

  listInvoices(customerId?: string): Invoice[] {
    const all = Array.from(this.invoices.values());
    if (!customerId) return all;
    return all.filter((i) => i.customerId === customerId);
  }

  getMrrHistory(customerId?: string): MrrRecord[] {
    if (!customerId) return [...this.mrrHistory];
    return this.mrrHistory.filter((r) => r.customerId === customerId);
  }

  summary(): BillingSummary {
    const now = new Date().toISOString();
    const activeSubs = Array.from(this.subscriptions.values()).filter((s) => s.status === "active");
    const totalMrrUsd = activeSubs.reduce((sum, s) => sum + s.mrrUsd, 0);

    const allInvoices = Array.from(this.invoices.values());
    const openInvoices = allInvoices.filter((i) => i.status === "open");
    const openInvoicesUsd = openInvoices.reduce((sum, i) => sum + i.amountUsd, 0);
    const overdueInvoicesUsd = openInvoices
      .filter((i) => i.dueDate < now)
      .reduce((sum, i) => sum + i.amountUsd, 0);

    const paidInvoices = allInvoices.filter((i) => i.status === "paid");
    const totalInvoiced = allInvoices.reduce((sum, i) => sum + i.amountUsd, 0);
    const totalPaid = paidInvoices.reduce((sum, i) => sum + i.amountUsd, 0);
    const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

    const mrrMovements = { new_business: 0, expansion: 0, contraction: 0, churn: 0 };
    for (const rec of this.mrrHistory) {
      if (rec.movement === "new_business") {
        mrrMovements.new_business += rec.deltaUsd > 0 ? rec.deltaUsd : 0;
      } else if (rec.movement === "expansion") {
        mrrMovements.expansion += rec.deltaUsd > 0 ? rec.deltaUsd : 0;
      } else if (rec.movement === "contraction") {
        mrrMovements.contraction += Math.abs(rec.deltaUsd);
      } else if (rec.movement === "churn") {
        mrrMovements.churn += Math.abs(rec.deltaUsd);
      }
    }

    return {
      totalMrrUsd,
      totalArrUsd: totalMrrUsd * 12,
      activeSubscriptions: activeSubs.length,
      openInvoicesUsd,
      overdueInvoicesUsd,
      collectionRate,
      mrrMovements,
    };
  }
}
