/**
 * Autonomy Engine — governed action layer (BLUEPRINT.md §18).
 *
 * Sits between a decision recommendation and any real-world action. Autonomy is
 * a dial, not a switch (first principle P5): trust is earned per-domain,
 * per-capability, and is reversible.
 *
 * Levels:
 *   L0 Observe            read-only, surfaces insight only
 *   L1 Advise             recommends with reasoning; no action
 *   L2 Draft              prepares artifacts for approval
 *   L3 Act-with-approval  executes after explicit per-action human approval
 *   L4 Act-within-bounds  acts within policy/blast-radius; human notified
 *   L5 Act-and-report     acts; batched periodic human review
 *   L6 Self-govern        adjusts own sub-policies within charter
 *   L7 Autonomous         full domain ownership within mandate
 *
 * Hard rules enforced here:
 *   - Simulation precedes action for L3+ (no L3+ action without a forward sim).
 *   - Blast-radius caps (max amount, max actions/day) are checked per grant.
 *   - Hard ceilings: certain capabilities are capped regardless of granted level
 *     and require a named human accountability token.
 *   - Kill switch: instant global revert to L0.
 *   - Auto-demotion: accuracy drift / policy breach drops a grant to L0.
 */

import type { EventBus } from "../events/event-bus.js";
import type { Domain, UUID } from "../knowledge/graph/schema.js";

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BlastRadius {
  /** Max monetary exposure per single action. */
  maxAmount?: number;
  /** Max actions of this capability per rolling day. */
  maxPerDay?: number;
}

export interface AutonomyGrant {
  domain: Domain;
  capability: string;
  level: AutonomyLevel;
  blastRadius?: BlastRadius;
  /** Reasons the grant could be auto-demoted (tracked by the engine). */
  grantedAt: string;
}

/** Capabilities capped regardless of granted level — require a human token. */
export interface HardCeiling {
  capability: string;
  maxLevel: AutonomyLevel;
  reason: string;
}

export interface ActionRequest {
  decisionId: UUID;
  domain: Domain;
  capability: string;
  /** Level at which the action is being attempted (e.g. orchestrator-resolved). */
  attemptedLevel: AutonomyLevel;
  /** Monetary exposure of this specific action, if any. */
  amount?: number;
  /** True when a forward simulation has been run for this action. */
  simulated?: boolean;
  /** Named human accountability owner, when required by a hard ceiling. */
  humanToken?: string;
  /** Arbitrary action payload, passed through on approval. */
  payload?: Record<string, unknown>;
}

export type GateDisposition =
  | "execute"            // within grant + bounds: proceed autonomously
  | "execute_notify"     // proceed but notify humans (L4)
  | "queue_for_approval" // route to human Decision Inbox (L2/L3)
  | "advise_only"        // surface as advice (L0/L1)
  | "deny";              // policy violation / breach

export interface GateResult {
  disposition: GateDisposition;
  /** Effective level after applying grants + ceilings. */
  effectiveLevel: AutonomyLevel;
  reasons: string[];
}

const DEFAULT_HARD_CEILINGS: HardCeiling[] = [
  { capability: "terminate_employee", maxLevel: 2, reason: "People decisions require human accountability." },
  { capability: "raise_capital", maxLevel: 2, reason: "Fundraising requires named human owner." },
  { capability: "mna_commit", maxLevel: 2, reason: "M&A requires board-level human decision." },
  { capability: "legal_admission", maxLevel: 2, reason: "Legal admissions require human counsel." },
];

function grantKey(domain: Domain, capability: string): string {
  return `${domain}:${capability}`;
}

export class AutonomyEngine {
  private readonly grants = new Map<string, AutonomyGrant>();
  private readonly hardCeilings: Map<string, HardCeiling>;
  /** capability -> rolling day -> count, for blast-radius rate limiting. */
  private readonly dailyCounts = new Map<string, { day: string; count: number }>();
  private killed = false;

  constructor(
    private readonly bus?: EventBus,
    hardCeilings: HardCeiling[] = DEFAULT_HARD_CEILINGS,
  ) {
    this.hardCeilings = new Map(hardCeilings.map((c) => [c.capability, c]));
  }

  // -- grant management -----------------------------------------------------

  setGrant(grant: Omit<AutonomyGrant, "grantedAt">): AutonomyGrant {
    const full: AutonomyGrant = { ...grant, grantedAt: new Date().toISOString() };
    this.grants.set(grantKey(grant.domain, grant.capability), full);
    this.bus?.publish("autonomy.granted", { domain: grant.domain, capability: grant.capability, level: grant.level });
    return full;
  }

  getGrant(domain: Domain, capability: string): AutonomyGrant | undefined {
    return this.grants.get(grantKey(domain, capability));
  }

  /** All active grants (for inspection / the autonomy API). */
  listGrants(): AutonomyGrant[] {
    return [...this.grants.values()];
  }

  /** Whether the global kill switch is currently engaged. */
  isKilled(): boolean {
    return this.killed;
  }

  /** Auto-demote a grant to L0 on accuracy drift or policy breach. */
  demote(domain: Domain, capability: string, reason: string): void {
    const g = this.grants.get(grantKey(domain, capability));
    if (g) {
      g.level = 0;
      this.bus?.publish("autonomy.auto_demoted", { domain, capability, reason });
    }
  }

  /** Kill switch: instant global revert to L0. */
  killSwitch(reason: string): void {
    this.killed = true;
    this.bus?.publish("autonomy.revoked", { scope: "global", reason });
  }

  /** Re-arm after a kill switch (requires explicit human re-enable). */
  rearm(): void {
    this.killed = false;
    this.bus?.publish("autonomy.rearmed", {});
  }

  // -- the gate -------------------------------------------------------------

  /**
   * Evaluate an action request against grants, ceilings, blast-radius, and the
   * simulation precondition. Returns the disposition the caller must honor.
   */
  evaluate(req: ActionRequest): GateResult {
    const reasons: string[] = [];

    // Kill switch overrides everything.
    if (this.killed) {
      return { disposition: "advise_only", effectiveLevel: 0, reasons: ["Kill switch active — global L0."] };
    }

    const grant = this.getGrant(req.domain, req.capability);
    const grantedLevel: AutonomyLevel = grant?.level ?? 0;

    // Apply hard ceiling.
    const ceiling = this.hardCeilings.get(req.capability);
    let effectiveLevel: AutonomyLevel = grantedLevel;
    if (ceiling && grantedLevel > ceiling.maxLevel) {
      effectiveLevel = ceiling.maxLevel;
      reasons.push(`Hard ceiling: ${ceiling.reason} (capped at L${ceiling.maxLevel}).`);
    }

    // Hard-ceilinged capabilities at action time require a human token.
    if (ceiling && req.attemptedLevel > ceiling.maxLevel && !req.humanToken) {
      reasons.push(`Capability "${req.capability}" requires a human accountability token.`);
      return { disposition: "deny", effectiveLevel, reasons };
    }

    // L0/L1: advisory only.
    if (effectiveLevel <= 1) {
      reasons.push(`Effective level L${effectiveLevel}: advisory only.`);
      return { disposition: "advise_only", effectiveLevel, reasons };
    }

    // L2/L3: human in the loop.
    if (effectiveLevel === 2) {
      reasons.push("L2: artifact prepared, queued for human approval.");
      return { disposition: "queue_for_approval", effectiveLevel, reasons };
    }

    // L3+ requires a forward simulation (hard rule).
    if (effectiveLevel >= 3 && !req.simulated) {
      reasons.push("L3+ action blocked: no forward simulation provided.");
      return { disposition: "deny", effectiveLevel, reasons };
    }

    if (effectiveLevel === 3) {
      reasons.push("L3: simulated; queued for per-action human approval.");
      return { disposition: "queue_for_approval", effectiveLevel, reasons };
    }

    // L4+: check blast radius before autonomous execution.
    const br = grant?.blastRadius;
    if (br?.maxAmount !== undefined && req.amount !== undefined && req.amount > br.maxAmount) {
      reasons.push(`Blast-radius breach: amount ${req.amount} > max ${br.maxAmount}. Escalating.`);
      return { disposition: "queue_for_approval", effectiveLevel, reasons };
    }
    if (br?.maxPerDay !== undefined) {
      const today = new Date().toISOString().slice(0, 10);
      const key = grantKey(req.domain, req.capability);
      const entry = this.dailyCounts.get(key);
      const count = entry && entry.day === today ? entry.count : 0;
      if (count >= br.maxPerDay) {
        reasons.push(`Blast-radius breach: ${count} actions today >= max ${br.maxPerDay}/day. Escalating.`);
        return { disposition: "queue_for_approval", effectiveLevel, reasons };
      }
    }

    // Within bounds — record the action against the daily counter and execute.
    this.bumpDailyCount(req.domain, req.capability);

    if (effectiveLevel === 4) {
      reasons.push("L4: within bounds — executing autonomously, human notified.");
      this.bus?.publish("action.gated", { decisionId: req.decisionId, disposition: "execute_notify", level: 4 });
      return { disposition: "execute_notify", effectiveLevel, reasons };
    }

    // L5–L7: autonomous execution (periodic / charter / board oversight).
    reasons.push(`L${effectiveLevel}: autonomous execution within mandate.`);
    this.bus?.publish("action.gated", { decisionId: req.decisionId, disposition: "execute", level: effectiveLevel });
    return { disposition: "execute", effectiveLevel, reasons };
  }

  private bumpDailyCount(domain: Domain, capability: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const key = grantKey(domain, capability);
    const entry = this.dailyCounts.get(key);
    if (entry && entry.day === today) {
      entry.count += 1;
    } else {
      this.dailyCounts.set(key, { day: today, count: 1 });
    }
  }
}
