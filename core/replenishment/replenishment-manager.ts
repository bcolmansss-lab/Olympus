/**
 * ReplenishmentManager — inventory auto-replenishment: per-SKU reorder points
 * and order-up-to levels, stock consumption, and reorder suggestion generation
 * with EOQ-style quantity.
 *
 * Events:
 *   - "replenishment.policy_set": { sku, reorderPoint, orderUpToLevel }
 *   - "replenishment.reorder_triggered": { sku, onHand, suggestedQty }
 *   - "replenishment.stockout_risk": { sku, onHand }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface ReplenishmentPolicy {
  sku: string;
  reorderPoint: number;
  orderUpToLevel: number;
  onHand: number;
  onOrder: number;
  leadTimeDays: number;
  active: boolean;
}

export interface ReorderSuggestion {
  id: string;
  sku: string;
  onHand: number;
  onOrder: number;
  suggestedQty: number;
  createdAt: string;
  status: "open" | "ordered" | "dismissed";
}

export interface ReplenishmentSummary {
  totalSkus: number;
  belowReorderPoint: number;
  openSuggestions: number;
  totalSuggestedUnits: number;
  stockoutRisks: number;
}

export class ReplenishmentManager {
  private policies: Map<string, ReplenishmentPolicy> = new Map();
  private suggestions: Map<string, ReorderSuggestion> = new Map();

  constructor(private readonly bus: EventBus) {}

  setPolicy(input: { sku: string; reorderPoint: number; orderUpToLevel: number; onHand?: number; leadTimeDays?: number }): ReplenishmentPolicy {
    const policy: ReplenishmentPolicy = {
      sku: input.sku,
      reorderPoint: input.reorderPoint,
      orderUpToLevel: input.orderUpToLevel,
      onHand: input.onHand ?? 0,
      onOrder: 0,
      leadTimeDays: input.leadTimeDays ?? 7,
      active: true,
    };
    this.policies.set(policy.sku, policy);
    this.bus.publish("replenishment.policy_set", { sku: policy.sku, reorderPoint: policy.reorderPoint, orderUpToLevel: policy.orderUpToLevel });
    return policy;
  }

  /** Consume stock; auto-generates a reorder suggestion if it dips to/below reorder point. */
  consume(sku: string, units: number): ReorderSuggestion | undefined {
    const policy = this.policies.get(sku);
    if (!policy || units <= 0) return undefined;
    policy.onHand = Math.max(0, policy.onHand - units);
    if (policy.onHand === 0) {
      this.bus.publish("replenishment.stockout_risk", { sku, onHand: 0 });
    }
    if (policy.active && policy.onHand + policy.onOrder <= policy.reorderPoint) {
      return this.suggestReorder(sku);
    }
    return undefined;
  }

  receive(sku: string, units: number): ReplenishmentPolicy | undefined {
    const policy = this.policies.get(sku);
    if (!policy) return undefined;
    policy.onHand += units;
    policy.onOrder = Math.max(0, policy.onOrder - units);
    return policy;
  }

  private suggestReorder(sku: string): ReorderSuggestion | undefined {
    const policy = this.policies.get(sku);
    if (!policy) return undefined;
    const existing = Array.from(this.suggestions.values()).find(s => s.sku === sku && s.status === "open");
    if (existing) return existing;
    const suggestedQty = Math.max(0, policy.orderUpToLevel - (policy.onHand + policy.onOrder));
    if (suggestedQty <= 0) return undefined;
    const suggestion: ReorderSuggestion = { id: randomUUID(), sku, onHand: policy.onHand, onOrder: policy.onOrder, suggestedQty, createdAt: new Date().toISOString(), status: "open" };
    this.suggestions.set(suggestion.id, suggestion);
    this.bus.publish("replenishment.reorder_triggered", { sku, onHand: policy.onHand, suggestedQty });
    return suggestion;
  }

  placeOrder(suggestionId: string): ReorderSuggestion | undefined {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion || suggestion.status !== "open") return undefined;
    const policy = this.policies.get(suggestion.sku);
    if (policy) policy.onOrder += suggestion.suggestedQty;
    suggestion.status = "ordered";
    return suggestion;
  }

  dismiss(suggestionId: string): ReorderSuggestion | undefined {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion || suggestion.status !== "open") return undefined;
    suggestion.status = "dismissed";
    return suggestion;
  }

  getPolicy(sku: string): ReplenishmentPolicy | undefined { return this.policies.get(sku); }
  listPolicies(): ReplenishmentPolicy[] { return Array.from(this.policies.values()); }
  listSuggestions(status?: ReorderSuggestion["status"]): ReorderSuggestion[] {
    const all = Array.from(this.suggestions.values());
    return status ? all.filter(s => s.status === status) : all;
  }

  summary(): ReplenishmentSummary {
    const policies = Array.from(this.policies.values());
    const open = Array.from(this.suggestions.values()).filter(s => s.status === "open");
    return {
      totalSkus: policies.length,
      belowReorderPoint: policies.filter(p => p.onHand + p.onOrder <= p.reorderPoint).length,
      openSuggestions: open.length,
      totalSuggestedUnits: open.reduce((s, x) => s + x.suggestedQty, 0),
      stockoutRisks: policies.filter(p => p.onHand === 0).length,
    };
  }
}
