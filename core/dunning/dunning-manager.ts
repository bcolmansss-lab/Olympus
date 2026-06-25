/**
 * DunningManager — accounts-receivable collections: overdue invoice tracking,
 * escalating dunning stages, reminder dispatch, and aging analytics.
 *
 * Events:
 *   - "dunning.invoice_overdue": { invoiceId, customerId, amountUsd, daysOverdue }
 *   - "dunning.stage_advanced": { invoiceId, fromStage, toStage }
 *   - "dunning.invoice_recovered": { invoiceId, amountUsd, daysToRecover }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DunningStage = "current" | "reminder" | "first_notice" | "final_notice" | "collections" | "written_off";
export type ReceivableStatus = "open" | "overdue" | "paid" | "written_off";

const STAGE_ORDER: DunningStage[] = ["current", "reminder", "first_notice", "final_notice", "collections", "written_off"];

export interface Receivable {
  id: string;
  customerId: string;
  invoiceNumber: string;
  amountUsd: number;
  status: ReceivableStatus;
  stage: DunningStage;
  dueDate: string;
  createdAt: string;
  paidAt?: string;
}

export interface DunningSummary {
  totalReceivables: number;
  openCount: number;
  overdueCount: number;
  totalOutstandingUsd: number;
  totalOverdueUsd: number;
  byStage: Partial<Record<DunningStage, number>>;
  aging: { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number };
}

export class DunningManager {
  private receivables: Map<string, Receivable> = new Map();

  constructor(private readonly bus: EventBus) {}

  addReceivable(input: Omit<Receivable, "id" | "status" | "stage" | "createdAt"> & { id?: string }): Receivable {
    const r: Receivable = { ...input, id: input.id ?? randomUUID(), status: "open", stage: "current", createdAt: new Date().toISOString() };
    this.receivables.set(r.id, r);
    return r;
  }

  private daysOverdue(r: Receivable, asOf: string): number {
    return Math.floor((new Date(asOf).getTime() - new Date(r.dueDate).getTime()) / 86400000);
  }

  /** Recompute overdue status and dunning stage for all open receivables as of a date. */
  runDunningCycle(asOf: string): Receivable[] {
    const advanced: Receivable[] = [];
    for (const r of this.receivables.values()) {
      if (r.status === "paid" || r.status === "written_off") continue;
      const days = this.daysOverdue(r, asOf);
      if (days <= 0) continue;
      const targetStage: DunningStage =
        days >= 90 ? "collections" :
        days >= 60 ? "final_notice" :
        days >= 30 ? "first_notice" :
        "reminder";
      if (r.status !== "overdue") {
        r.status = "overdue";
        this.bus.publish("dunning.invoice_overdue", { invoiceId: r.id, customerId: r.customerId, amountUsd: r.amountUsd, daysOverdue: days });
      }
      if (STAGE_ORDER.indexOf(targetStage) > STAGE_ORDER.indexOf(r.stage)) {
        const fromStage = r.stage;
        r.stage = targetStage;
        this.bus.publish("dunning.stage_advanced", { invoiceId: r.id, fromStage, toStage: targetStage });
        advanced.push(r);
      }
    }
    return advanced;
  }

  recordPayment(receivableId: string, asOf: string): Receivable | undefined {
    const r = this.receivables.get(receivableId);
    if (!r || r.status === "paid") return undefined;
    r.status = "paid";
    r.stage = "current";
    r.paidAt = asOf;
    const daysToRecover = Math.max(0, this.daysOverdue(r, asOf));
    this.bus.publish("dunning.invoice_recovered", { invoiceId: r.id, amountUsd: r.amountUsd, daysToRecover });
    return r;
  }

  writeOff(receivableId: string): Receivable | undefined {
    const r = this.receivables.get(receivableId);
    if (!r) return undefined;
    r.status = "written_off";
    r.stage = "written_off";
    return r;
  }

  getReceivable(id: string): Receivable | undefined { return this.receivables.get(id); }
  listReceivables(customerId?: string, status?: ReceivableStatus): Receivable[] {
    let all = Array.from(this.receivables.values());
    if (customerId) all = all.filter(r => r.customerId === customerId);
    if (status) all = all.filter(r => r.status === status);
    return all;
  }

  summary(asOf?: string): DunningSummary {
    const all = Array.from(this.receivables.values());
    const ref = asOf ?? new Date().toISOString();
    const byStage: Partial<Record<DunningStage, number>> = {};
    const aging = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    let outstanding = 0, overdueUsd = 0;
    for (const r of all) {
      byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
      if (r.status === "open" || r.status === "overdue") {
        outstanding += r.amountUsd;
        const days = this.daysOverdue(r, ref);
        if (days <= 0) aging.current += r.amountUsd;
        else {
          overdueUsd += r.amountUsd;
          if (days <= 30) aging.days1to30 += r.amountUsd;
          else if (days <= 60) aging.days31to60 += r.amountUsd;
          else if (days <= 90) aging.days61to90 += r.amountUsd;
          else aging.days90plus += r.amountUsd;
        }
      }
    }
    return {
      totalReceivables: all.length,
      openCount: all.filter(r => r.status === "open").length,
      overdueCount: all.filter(r => r.status === "overdue").length,
      totalOutstandingUsd: outstanding,
      totalOverdueUsd: overdueUsd,
      byStage,
      aging,
    };
  }
}
