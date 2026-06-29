/**
 * TaxNexusManager — sales-tax economic nexus tracking by jurisdiction:
 * thresholds, rolling sales/transaction accumulation, nexus trigger detection,
 * and registration status.
 *
 * Events:
 *   - "taxnexus.threshold_crossed": { jurisdiction, salesUsd, transactions }
 *   - "taxnexus.registered": { jurisdiction, effectiveDate }
 *   - "taxnexus.approaching": { jurisdiction, pctOfThreshold }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type NexusStatus = "monitoring" | "triggered" | "registered" | "exempt";

export interface JurisdictionNexus {
  id: string;
  jurisdiction: string; // state code
  salesThresholdUsd: number;
  transactionThreshold: number;
  ytdSalesUsd: number;
  ytdTransactions: number;
  status: NexusStatus;
  registeredAt?: string;
  approachAlerted: boolean;
}

export interface TaxNexusSummary {
  totalJurisdictions: number;
  triggered: number;
  registered: number;
  monitoring: number;
  byStatus: Partial<Record<NexusStatus, number>>;
}

export class TaxNexusManager {
  private jurisdictions: Map<string, JurisdictionNexus> = new Map();
  private approachPct: number;

  constructor(private readonly bus: EventBus, approachPct = 80) {
    this.approachPct = approachPct;
  }

  defineJurisdiction(jurisdiction: string, salesThresholdUsd: number, transactionThreshold: number): JurisdictionNexus {
    const nexus: JurisdictionNexus = {
      id: randomUUID(),
      jurisdiction,
      salesThresholdUsd,
      transactionThreshold,
      ytdSalesUsd: 0,
      ytdTransactions: 0,
      status: "monitoring",
      approachAlerted: false,
    };
    this.jurisdictions.set(jurisdiction, nexus);
    return nexus;
  }

  recordSale(jurisdiction: string, amountUsd: number): JurisdictionNexus | undefined {
    const nexus = this.jurisdictions.get(jurisdiction);
    if (!nexus || amountUsd <= 0) return undefined;
    nexus.ytdSalesUsd = Math.round((nexus.ytdSalesUsd + amountUsd) * 100) / 100;
    nexus.ytdTransactions += 1;
    const salesPct = nexus.salesThresholdUsd > 0 ? (nexus.ytdSalesUsd / nexus.salesThresholdUsd) * 100 : 0;
    const txPct = nexus.transactionThreshold > 0 ? (nexus.ytdTransactions / nexus.transactionThreshold) * 100 : 0;
    const pct = Math.max(salesPct, txPct);
    if (nexus.status === "monitoring") {
      if (nexus.ytdSalesUsd >= nexus.salesThresholdUsd || nexus.ytdTransactions >= nexus.transactionThreshold) {
        nexus.status = "triggered";
        this.bus.publish("taxnexus.threshold_crossed", { jurisdiction, salesUsd: nexus.ytdSalesUsd, transactions: nexus.ytdTransactions });
      } else if (!nexus.approachAlerted && pct >= this.approachPct) {
        nexus.approachAlerted = true;
        this.bus.publish("taxnexus.approaching", { jurisdiction, pctOfThreshold: Math.round(pct) });
      }
    }
    return nexus;
  }

  register(jurisdiction: string, effectiveDate: string): JurisdictionNexus | undefined {
    const nexus = this.jurisdictions.get(jurisdiction);
    if (!nexus) return undefined;
    nexus.status = "registered";
    nexus.registeredAt = effectiveDate;
    this.bus.publish("taxnexus.registered", { jurisdiction, effectiveDate });
    return nexus;
  }

  markExempt(jurisdiction: string): JurisdictionNexus | undefined {
    const nexus = this.jurisdictions.get(jurisdiction);
    if (!nexus) return undefined;
    nexus.status = "exempt";
    return nexus;
  }

  resetYear(jurisdiction: string): JurisdictionNexus | undefined {
    const nexus = this.jurisdictions.get(jurisdiction);
    if (!nexus) return undefined;
    nexus.ytdSalesUsd = 0;
    nexus.ytdTransactions = 0;
    nexus.approachAlerted = false;
    if (nexus.status === "triggered") nexus.status = "monitoring";
    return nexus;
  }

  getNexus(jurisdiction: string): JurisdictionNexus | undefined { return this.jurisdictions.get(jurisdiction); }
  listNexus(status?: NexusStatus): JurisdictionNexus[] {
    const all = Array.from(this.jurisdictions.values());
    return status ? all.filter(n => n.status === status) : all;
  }
  obligations(): JurisdictionNexus[] {
    return Array.from(this.jurisdictions.values()).filter(n => n.status === "triggered" || n.status === "registered");
  }

  summary(): TaxNexusSummary {
    const all = Array.from(this.jurisdictions.values());
    const byStatus: Partial<Record<NexusStatus, number>> = {};
    for (const n of all) { byStatus[n.status] = (byStatus[n.status] ?? 0) + 1; }
    return {
      totalJurisdictions: all.length,
      triggered: all.filter(n => n.status === "triggered").length,
      registered: all.filter(n => n.status === "registered").length,
      monitoring: all.filter(n => n.status === "monitoring").length,
      byStatus,
    };
  }
}
