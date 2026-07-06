/**
 * RedlineManager — contract negotiation redlines: per-contract proposed edits
 * with party attribution, accept/reject/counter rounds, and open-issue tracking
 * toward execution readiness.
 *
 * Events:
 *   - "redline.proposed": { redlineId, contractId, party, section }
 *   - "redline.resolved": { redlineId, resolution }
 *   - "redline.contract_clean": { contractId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type Party = "us" | "counterparty";
export type RedlineStatus = "open" | "accepted" | "rejected" | "countered";

export interface Redline {
  id: string;
  contractId: string;
  section: string;
  proposedBy: Party;
  originalText: string;
  proposedText: string;
  status: RedlineStatus;
  rounds: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface RedlineSummary {
  totalRedlines: number;
  open: number;
  accepted: number;
  rejected: number;
  byParty: Partial<Record<Party, number>>;
  contractsClean: number;
}

export class RedlineManager {
  private redlines: Map<string, Redline> = new Map();
  private contracts: Set<string> = new Set();

  constructor(private readonly bus: EventBus) {}

  propose(input: { contractId: string; section: string; proposedBy: Party; originalText: string; proposedText: string }): Redline {
    const redline: Redline = { ...input, id: randomUUID(), status: "open", rounds: 1, createdAt: new Date().toISOString() };
    this.redlines.set(redline.id, redline);
    this.contracts.add(redline.contractId);
    this.bus.publish("redline.proposed", { redlineId: redline.id, contractId: redline.contractId, party: redline.proposedBy, section: redline.section });
    return redline;
  }

  accept(redlineId: string, asOf: string): Redline | undefined {
    const r = this.redlines.get(redlineId);
    if (!r || r.status !== "open") return undefined;
    r.status = "accepted";
    r.resolvedAt = asOf;
    this.bus.publish("redline.resolved", { redlineId, resolution: "accepted" });
    this.maybeClean(r.contractId);
    return r;
  }

  reject(redlineId: string, asOf: string): Redline | undefined {
    const r = this.redlines.get(redlineId);
    if (!r || r.status !== "open") return undefined;
    r.status = "rejected";
    r.resolvedAt = asOf;
    this.bus.publish("redline.resolved", { redlineId, resolution: "rejected" });
    this.maybeClean(r.contractId);
    return r;
  }

  counter(redlineId: string, counterText: string): Redline | undefined {
    const r = this.redlines.get(redlineId);
    if (!r || r.status !== "open") return undefined;
    r.status = "countered";
    // create a fresh open redline representing the counter, flipping the party
    const counter: Redline = {
      id: randomUUID(),
      contractId: r.contractId,
      section: r.section,
      proposedBy: r.proposedBy === "us" ? "counterparty" : "us",
      originalText: r.proposedText,
      proposedText: counterText,
      status: "open",
      rounds: r.rounds + 1,
      createdAt: new Date().toISOString(),
    };
    this.redlines.set(counter.id, counter);
    this.bus.publish("redline.proposed", { redlineId: counter.id, contractId: counter.contractId, party: counter.proposedBy, section: counter.section });
    return counter;
  }

  private maybeClean(contractId: string): void {
    const open = Array.from(this.redlines.values()).filter(r => r.contractId === contractId && r.status === "open");
    if (open.length === 0) this.bus.publish("redline.contract_clean", { contractId });
  }

  openIssues(contractId: string): Redline[] {
    return Array.from(this.redlines.values()).filter(r => r.contractId === contractId && r.status === "open");
  }
  isClean(contractId: string): boolean { return this.contracts.has(contractId) && this.openIssues(contractId).length === 0; }

  getRedline(id: string): Redline | undefined { return this.redlines.get(id); }
  listRedlines(contractId?: string, status?: RedlineStatus): Redline[] {
    let all = Array.from(this.redlines.values());
    if (contractId) all = all.filter(r => r.contractId === contractId);
    if (status) all = all.filter(r => r.status === status);
    return all;
  }

  summary(): RedlineSummary {
    const redlines = Array.from(this.redlines.values());
    const byParty: Partial<Record<Party, number>> = {};
    for (const r of redlines) { byParty[r.proposedBy] = (byParty[r.proposedBy] ?? 0) + 1; }
    const clean = Array.from(this.contracts).filter(c => this.openIssues(c).length === 0).length;
    return {
      totalRedlines: redlines.length,
      open: redlines.filter(r => r.status === "open").length,
      accepted: redlines.filter(r => r.status === "accepted").length,
      rejected: redlines.filter(r => r.status === "rejected").length,
      byParty,
      contractsClean: clean,
    };
  }
}
