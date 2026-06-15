/**
 * Decision Inbox — a read-model projection over the event spine.
 *
 * BLUEPRINT §22.3: "the log is the source of truth; OKG and read models are
 * projections rebuildable from the log." This is the canonical worked example.
 *
 * The inbox is the human's queue of decisions that need attention — anything
 * the autonomy gate routed to `queue_for_approval` or `escalated_to_human`,
 * plus a record of what auto-executed (for awareness, not action). It is built
 * purely by folding `decision.*` events; it holds no authoritative state of its
 * own and can be dropped and rebuilt from the log at any time.
 *
 * Each projector handler is idempotent (keyed by decisionId), so replaying the
 * log yields the same inbox — the projection contract.
 */

import type { EventBus, BusEvent } from "../events/event-bus.js";
import type { OKG } from "../knowledge/graph/okg.js";
import type { UUID } from "../knowledge/graph/schema.js";

export type InboxStatus =
  | "needs_approval"   // gate routed to queue_for_approval
  | "escalated"        // risk veto / low consensus / hard ceiling
  | "auto_executed"    // acted autonomously; shown for awareness
  | "resolved";        // human acted, or decision reconciled

export interface InboxItem {
  decisionId: UUID;
  question: string;
  status: InboxStatus;
  recommendation?: string;
  consensusScore?: number;
  /** When the item entered its current status. */
  updatedAt: string;
  /** Human-facing one-liner explaining why it's here. */
  note: string;
}

interface ResolvedPayload {
  decisionId: UUID;
  outcome: "recommended" | "auto_executed" | "queued_for_approval" | "escalated_to_human";
  recommendation?: string;
  consensusScore?: number;
}

const OUTCOME_TO_STATUS: Record<ResolvedPayload["outcome"], InboxStatus | undefined> = {
  recommended: undefined,          // advisory only — not an inbox item
  auto_executed: "auto_executed",
  queued_for_approval: "needs_approval",
  escalated_to_human: "escalated",
};

export class DecisionInbox {
  private readonly items = new Map<UUID, InboxItem>();
  /** Cache of question text seen on decision.opened, for enrichment. */
  private readonly questions = new Map<UUID, string>();
  private unsubscribe?: () => void;

  constructor(private readonly okg?: OKG) {}

  /** Begin folding live events from the bus into the inbox. */
  attach(bus: EventBus): this {
    this.unsubscribe = bus.subscribe("decision.*", (e) => this.apply(e));
    return this;
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** Rebuild the inbox from scratch by replaying the durable log. */
  rebuild(bus: EventBus): this {
    this.items.clear();
    this.questions.clear();
    for (const e of bus.events()) {
      if (e.topic.startsWith("decision.")) this.apply(e);
    }
    return this;
  }

  /** Idempotent fold of a single event. */
  private apply(e: BusEvent): void {
    switch (e.topic) {
      case "decision.opened": {
        const p = e.payload as { id: UUID; question: string };
        this.questions.set(p.id, p.question);
        break;
      }
      case "decision.session.resolved": {
        const p = e.payload as ResolvedPayload;
        const status = OUTCOME_TO_STATUS[p.outcome];
        if (!status) {
          this.items.delete(p.decisionId); // advisory → not actionable
          return;
        }
        this.items.set(p.decisionId, {
          decisionId: p.decisionId,
          question: this.resolveQuestion(p.decisionId),
          status,
          recommendation: p.recommendation,
          consensusScore: p.consensusScore,
          updatedAt: e.ts,
          note: this.noteFor(status, p),
        });
        break;
      }
      case "decision.reconciled": {
        const p = e.payload as { id: UUID };
        const item = this.items.get(p.id);
        if (item) {
          item.status = "resolved";
          item.updatedAt = e.ts;
          item.note = "Outcome reconciled against prediction.";
        }
        break;
      }
      default:
        break;
    }
  }

  private resolveQuestion(id: UUID): string {
    return (
      this.questions.get(id) ??
      (this.okg?.currentNode(id)?.props as { question?: string } | undefined)?.question ??
      "(unknown decision)"
    );
  }

  private noteFor(status: InboxStatus, p: ResolvedPayload): string {
    switch (status) {
      case "needs_approval":
        return `Artifact prepared for "${p.recommendation}" — exceeds blast-radius, awaiting human approval.`;
      case "escalated":
        return `Escalated to human review (consensus ${p.consensusScore ?? "n/a"}).`;
      case "auto_executed":
        return `Auto-executed "${p.recommendation}" within charter (consensus ${p.consensusScore ?? "n/a"}).`;
      default:
        return "";
    }
  }

  // -- read API -------------------------------------------------------------

  /** Items requiring human action (needs_approval + escalated), newest first. */
  pending(): InboxItem[] {
    return this.all().filter((i) => i.status === "needs_approval" || i.status === "escalated");
  }

  /** Full inbox feed, newest first. */
  all(): InboxItem[] {
    return [...this.items.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  get(decisionId: UUID): InboxItem | undefined {
    return this.items.get(decisionId);
  }

  /** Mark a queued/escalated item resolved once a human has acted. */
  resolve(decisionId: UUID): boolean {
    const item = this.items.get(decisionId);
    if (!item) return false;
    item.status = "resolved";
    item.updatedAt = new Date().toISOString();
    item.note = "Resolved by human.";
    return true;
  }

  stats(): { total: number; pending: number; autoExecuted: number; resolved: number } {
    const all = this.all();
    return {
      total: all.length,
      pending: all.filter((i) => i.status === "needs_approval" || i.status === "escalated").length,
      autoExecuted: all.filter((i) => i.status === "auto_executed").length,
      resolved: all.filter((i) => i.status === "resolved").length,
    };
  }
}
