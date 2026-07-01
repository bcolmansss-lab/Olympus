/**
 * ChangeFreezeManager — change-freeze / blackout periods (e.g. holiday, peak
 * season): freeze windows with scope, exemption requests, and a check for
 * whether deploys are permitted at a given time.
 *
 * Events:
 *   - "freeze.declared": { freezeId, reason, start, end }
 *   - "freeze.exemption_requested": { exemptionId, freezeId, requesterId }
 *   - "freeze.exemption_decided": { exemptionId, approved }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FreezeStatus = "active" | "lifted";
export type ExemptionStatus = "pending" | "approved" | "rejected";

export interface Exemption {
  id: string;
  freezeId: string;
  requesterId: string;
  justification: string;
  status: ExemptionStatus;
  decidedBy?: string;
  requestedAt: string;
}

export interface ChangeFreeze {
  id: string;
  reason: string;
  scope: string[]; // affected systems ("*" = all)
  status: FreezeStatus;
  start: string;
  end: string;
  exemptions: Exemption[];
  createdAt: string;
}

export interface ChangeFreezeSummary {
  totalFreezes: number;
  active: number;
  pendingExemptions: number;
  approvedExemptions: number;
}

export class ChangeFreezeManager {
  private freezes: Map<string, ChangeFreeze> = new Map();

  constructor(private readonly bus: EventBus) {}

  declare(input: { reason: string; scope: string[]; start: string; end: string }): ChangeFreeze {
    const freeze: ChangeFreeze = { ...input, id: randomUUID(), status: "active", exemptions: [], createdAt: new Date().toISOString() };
    this.freezes.set(freeze.id, freeze);
    this.bus.publish("freeze.declared", { freezeId: freeze.id, reason: freeze.reason, start: freeze.start, end: freeze.end });
    return freeze;
  }

  lift(freezeId: string): ChangeFreeze | undefined {
    const f = this.freezes.get(freezeId);
    if (!f) return undefined;
    f.status = "lifted";
    return f;
  }

  requestExemption(freezeId: string, requesterId: string, justification: string): Exemption | undefined {
    const f = this.freezes.get(freezeId);
    if (!f || f.status !== "active") return undefined;
    const exemption: Exemption = { id: randomUUID(), freezeId, requesterId, justification, status: "pending", requestedAt: new Date().toISOString() };
    f.exemptions.push(exemption);
    this.bus.publish("freeze.exemption_requested", { exemptionId: exemption.id, freezeId, requesterId });
    return exemption;
  }

  decideExemption(freezeId: string, exemptionId: string, approverId: string, approved: boolean): Exemption | undefined {
    const f = this.freezes.get(freezeId);
    const exemption = f?.exemptions.find(e => e.id === exemptionId);
    if (!exemption || exemption.status !== "pending") return undefined;
    exemption.status = approved ? "approved" : "rejected";
    exemption.decidedBy = approverId;
    this.bus.publish("freeze.exemption_decided", { exemptionId, approved });
    return exemption;
  }

  /** Is a change to `system` permitted at `asOf`? Blocked if under an active in-window freeze without an approved exemption for the requester. */
  isChangeAllowed(system: string, asOf: string, requesterId?: string): boolean {
    const now = new Date(asOf).getTime();
    for (const f of this.freezes.values()) {
      if (f.status !== "active") continue;
      if (now < new Date(f.start).getTime() || now > new Date(f.end).getTime()) continue;
      const inScope = f.scope.includes("*") || f.scope.includes(system);
      if (!inScope) continue;
      const exempt = requesterId && f.exemptions.some(e => e.requesterId === requesterId && e.status === "approved");
      if (!exempt) return false;
    }
    return true;
  }

  getFreeze(id: string): ChangeFreeze | undefined { return this.freezes.get(id); }
  listFreezes(status?: FreezeStatus): ChangeFreeze[] {
    const all = Array.from(this.freezes.values());
    return status ? all.filter(f => f.status === status) : all;
  }

  summary(): ChangeFreezeSummary {
    const freezes = Array.from(this.freezes.values());
    const exemptions = freezes.flatMap(f => f.exemptions);
    return {
      totalFreezes: freezes.length,
      active: freezes.filter(f => f.status === "active").length,
      pendingExemptions: exemptions.filter(e => e.status === "pending").length,
      approvedExemptions: exemptions.filter(e => e.status === "approved").length,
    };
  }
}
