/**
 * ReconciliationManager — payment/bank reconciliation: load internal ledger
 * entries and external (bank/processor) records, auto-match on reference+amount,
 * flag discrepancies, and track unreconciled items.
 *
 * Events:
 *   - "recon.matched": { internalId, externalId, amountUsd }
 *   - "recon.discrepancy": { reference, internalUsd, externalUsd }
 *   - "recon.unmatched": { source, reference, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EntrySource = "internal" | "external";
export type MatchStatus = "unmatched" | "matched" | "discrepancy";

export interface LedgerEntry {
  id: string;
  source: EntrySource;
  reference: string;
  amountUsd: number;
  date: string;
  matchStatus: MatchStatus;
  matchedWith?: string;
}

export interface ReconciliationSummary {
  totalInternal: number;
  totalExternal: number;
  matched: number;
  discrepancies: number;
  unmatchedInternal: number;
  unmatchedExternal: number;
  matchRatePct: number;
}

export class ReconciliationManager {
  private entries: Map<string, LedgerEntry> = new Map();

  constructor(private readonly bus: EventBus, private readonly toleranceUsd = 0) {}

  add(source: EntrySource, reference: string, amountUsd: number, date: string): LedgerEntry {
    const entry: LedgerEntry = { id: randomUUID(), source, reference, amountUsd, date, matchStatus: "unmatched" };
    this.entries.set(entry.id, entry);
    return entry;
  }

  /** Run auto-match across all unmatched entries by reference. */
  reconcile(): { matched: number; discrepancies: number } {
    let matched = 0, discrepancies = 0;
    const internal = Array.from(this.entries.values()).filter(e => e.source === "internal" && e.matchStatus === "unmatched");
    for (const i of internal) {
      const ext = Array.from(this.entries.values()).find(e => e.source === "external" && e.matchStatus === "unmatched" && e.reference === i.reference);
      if (!ext) continue;
      if (Math.abs(i.amountUsd - ext.amountUsd) <= this.toleranceUsd) {
        i.matchStatus = ext.matchStatus = "matched";
        i.matchedWith = ext.id;
        ext.matchedWith = i.id;
        matched += 1;
        this.bus.publish("recon.matched", { internalId: i.id, externalId: ext.id, amountUsd: i.amountUsd });
      } else {
        i.matchStatus = ext.matchStatus = "discrepancy";
        i.matchedWith = ext.id;
        ext.matchedWith = i.id;
        discrepancies += 1;
        this.bus.publish("recon.discrepancy", { reference: i.reference, internalUsd: i.amountUsd, externalUsd: ext.amountUsd });
      }
    }
    return { matched, discrepancies };
  }

  /** Emit events for still-unmatched entries. */
  flagUnmatched(): LedgerEntry[] {
    const unmatched = Array.from(this.entries.values()).filter(e => e.matchStatus === "unmatched");
    for (const e of unmatched) {
      this.bus.publish("recon.unmatched", { source: e.source, reference: e.reference, amountUsd: e.amountUsd });
    }
    return unmatched;
  }

  getEntry(id: string): LedgerEntry | undefined { return this.entries.get(id); }
  listEntries(source?: EntrySource, matchStatus?: MatchStatus): LedgerEntry[] {
    let all = Array.from(this.entries.values());
    if (source) all = all.filter(e => e.source === source);
    if (matchStatus) all = all.filter(e => e.matchStatus === matchStatus);
    return all;
  }

  summary(): ReconciliationSummary {
    const entries = Array.from(this.entries.values());
    const internal = entries.filter(e => e.source === "internal");
    const external = entries.filter(e => e.source === "external");
    const matched = internal.filter(e => e.matchStatus === "matched").length;
    return {
      totalInternal: internal.length,
      totalExternal: external.length,
      matched,
      discrepancies: internal.filter(e => e.matchStatus === "discrepancy").length,
      unmatchedInternal: internal.filter(e => e.matchStatus === "unmatched").length,
      unmatchedExternal: external.filter(e => e.matchStatus === "unmatched").length,
      matchRatePct: internal.length > 0 ? Math.round((matched / internal.length) * 100) : 0,
    };
  }
}
