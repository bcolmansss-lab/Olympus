/**
 * GiftRegistryManager — gift registries (weddings, baby, events): registry
 * creation with item wishlists and quantities, guest purchases against items,
 * and fulfillment tracking with over-purchase protection.
 *
 * Events:
 *   - "registry.created": { registryId, occasion, ownerId }
 *   - "registry.purchase": { registryId, sku, quantity, purchaserId }
 *   - "registry.completed": { registryId, fulfilledPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RegistryStatus = "active" | "completed" | "closed";

export interface RegistryItem {
  sku: string;
  name: string;
  priceUsd: number;
  requestedQty: number;
  purchasedQty: number;
}

export interface GiftRegistry {
  id: string;
  ownerId: string;
  occasion: string;
  eventDate: string;
  status: RegistryStatus;
  items: RegistryItem[];
  purchasers: Set<string>;
  createdAt: string;
}

export interface GiftRegistrySummary {
  totalRegistries: number;
  active: number;
  totalItems: number;
  totalPurchasedUsd: number;
  avgFulfillmentPct: number;
}

export class GiftRegistryManager {
  private registries: Map<string, GiftRegistry> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(ownerId: string, occasion: string, eventDate: string): GiftRegistry {
    const registry: GiftRegistry = { id: randomUUID(), ownerId, occasion, eventDate, status: "active", items: [], purchasers: new Set(), createdAt: new Date().toISOString() };
    this.registries.set(registry.id, registry);
    this.bus.publish("registry.created", { registryId: registry.id, occasion, ownerId });
    return registry;
  }

  addItem(registryId: string, input: { sku: string; name: string; priceUsd: number; requestedQty: number }): RegistryItem | undefined {
    const registry = this.registries.get(registryId);
    if (!registry || registry.status !== "active") return undefined;
    if (registry.items.some(i => i.sku === input.sku)) return undefined;
    const item: RegistryItem = { ...input, purchasedQty: 0 };
    registry.items.push(item);
    return item;
  }

  removeItem(registryId: string, sku: string): boolean {
    const registry = this.registries.get(registryId);
    if (!registry || registry.status !== "active") return false;
    const idx = registry.items.findIndex(i => i.sku === sku && i.purchasedQty === 0);
    if (idx < 0) return false;
    registry.items.splice(idx, 1);
    return true;
  }

  /** Guest purchase; caps at remaining requested quantity. */
  purchase(registryId: string, sku: string, quantity: number, purchaserId: string): number {
    const registry = this.registries.get(registryId);
    if (!registry || registry.status !== "active" || quantity <= 0) return 0;
    const item = registry.items.find(i => i.sku === sku);
    if (!item) return 0;
    const applied = Math.min(quantity, item.requestedQty - item.purchasedQty);
    if (applied <= 0) return 0;
    item.purchasedQty += applied;
    registry.purchasers.add(purchaserId);
    this.bus.publish("registry.purchase", { registryId, sku, quantity: applied, purchaserId });
    if (registry.items.every(i => i.purchasedQty >= i.requestedQty)) {
      registry.status = "completed";
      this.bus.publish("registry.completed", { registryId, fulfilledPct: 100 });
    }
    return applied;
  }

  fulfillmentPct(registryId: string): number {
    const registry = this.registries.get(registryId);
    if (!registry) return 0;
    const requested = registry.items.reduce((s, i) => s + i.requestedQty, 0);
    if (requested === 0) return 0;
    const purchased = registry.items.reduce((s, i) => s + i.purchasedQty, 0);
    return Math.round((purchased / requested) * 100);
  }

  close(registryId: string): GiftRegistry | undefined {
    const registry = this.registries.get(registryId);
    if (!registry) return undefined;
    registry.status = "closed";
    return registry;
  }

  getRegistry(id: string): GiftRegistry | undefined { return this.registries.get(id); }
  listRegistries(status?: RegistryStatus): GiftRegistry[] {
    const all = Array.from(this.registries.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): GiftRegistrySummary {
    const registries = Array.from(this.registries.values());
    const purchasedUsd = registries.flatMap(r => r.items).reduce((s, i) => s + i.purchasedQty * i.priceUsd, 0);
    const fulfillments = registries.map(r => this.fulfillmentPct(r.id));
    return {
      totalRegistries: registries.length,
      active: registries.filter(r => r.status === "active").length,
      totalItems: registries.reduce((s, r) => s + r.items.length, 0),
      totalPurchasedUsd: Math.round(purchasedUsd * 100) / 100,
      avgFulfillmentPct: fulfillments.length > 0 ? Math.round(fulfillments.reduce((s, f) => s + f, 0) / fulfillments.length) : 0,
    };
  }
}
