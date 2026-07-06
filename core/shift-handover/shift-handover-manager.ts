/**
 * ShiftHandoverManager — operational shift pass-down: per-shift handover notes,
 * open items carried across shifts, acknowledgement by the incoming operator,
 * and unacknowledged-item tracking.
 *
 * Events:
 *   - "handover.created": { handoverId, fromOperator, shift }
 *   - "handover.acknowledged": { handoverId, toOperator }
 *   - "handover.item_carried": { handoverId, itemId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type HandoverStatus = "open" | "acknowledged";
export type ItemPriority = "info" | "watch" | "action_required";

export interface HandoverItem {
  id: string;
  description: string;
  priority: ItemPriority;
  resolved: boolean;
}

export interface Handover {
  id: string;
  team: string;
  shift: string; // e.g. "2026-06-01-night"
  fromOperator: string;
  toOperator?: string;
  status: HandoverStatus;
  items: HandoverItem[];
  createdAt: string;
  acknowledgedAt?: string;
}

export interface HandoverSummary {
  totalHandovers: number;
  open: number;
  acknowledged: number;
  openActionItems: number;
  unacknowledgedHandovers: number;
}

export class ShiftHandoverManager {
  private handovers: Map<string, Handover> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { team: string; shift: string; fromOperator: string }): Handover {
    const handover: Handover = { ...input, id: randomUUID(), status: "open", items: [], createdAt: new Date().toISOString() };
    this.handovers.set(handover.id, handover);
    this.bus.publish("handover.created", { handoverId: handover.id, fromOperator: handover.fromOperator, shift: handover.shift });
    return handover;
  }

  addItem(handoverId: string, description: string, priority: ItemPriority): HandoverItem | undefined {
    const handover = this.handovers.get(handoverId);
    if (!handover || handover.status === "acknowledged") return undefined;
    const item: HandoverItem = { id: randomUUID(), description, priority, resolved: false };
    handover.items.push(item);
    return item;
  }

  resolveItem(handoverId: string, itemId: string): HandoverItem | undefined {
    const handover = this.handovers.get(handoverId);
    const item = handover?.items.find(i => i.id === itemId);
    if (!item || item.resolved) return undefined;
    item.resolved = true;
    return item;
  }

  acknowledge(handoverId: string, toOperator: string, asOf: string): Handover | undefined {
    const handover = this.handovers.get(handoverId);
    if (!handover || handover.status !== "open") return undefined;
    handover.status = "acknowledged";
    handover.toOperator = toOperator;
    handover.acknowledgedAt = asOf;
    this.bus.publish("handover.acknowledged", { handoverId, toOperator });
    return handover;
  }

  /** Create a follow-on handover carrying unresolved items forward. */
  carryForward(handoverId: string, nextShift: string, fromOperator: string): Handover | undefined {
    const prev = this.handovers.get(handoverId);
    if (!prev) return undefined;
    const next = this.create({ team: prev.team, shift: nextShift, fromOperator });
    for (const item of prev.items.filter(i => !i.resolved)) {
      next.items.push({ id: randomUUID(), description: item.description, priority: item.priority, resolved: false });
      this.bus.publish("handover.item_carried", { handoverId: next.id, itemId: item.id });
    }
    return next;
  }

  getHandover(id: string): Handover | undefined { return this.handovers.get(id); }
  openItems(handoverId: string): HandoverItem[] {
    return this.handovers.get(handoverId)?.items.filter(i => !i.resolved) ?? [];
  }
  listHandovers(team?: string, status?: HandoverStatus): Handover[] {
    let all = Array.from(this.handovers.values());
    if (team) all = all.filter(h => h.team === team);
    if (status) all = all.filter(h => h.status === status);
    return all;
  }

  summary(): HandoverSummary {
    const handovers = Array.from(this.handovers.values());
    const items = handovers.flatMap(h => h.items);
    return {
      totalHandovers: handovers.length,
      open: handovers.filter(h => h.status === "open").length,
      acknowledged: handovers.filter(h => h.status === "acknowledged").length,
      openActionItems: items.filter(i => !i.resolved && i.priority === "action_required").length,
      unacknowledgedHandovers: handovers.filter(h => h.status === "open").length,
    };
  }
}
