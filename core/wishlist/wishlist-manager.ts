/**
 * WishlistManager — customer wishlists: multiple named lists per customer,
 * item add/remove with price-at-add, price-drop detection, and most-wished
 * product analytics.
 *
 * Events:
 *   - "wishlist.created": { wishlistId, customerId, name }
 *   - "wishlist.item_added": { wishlistId, sku }
 *   - "wishlist.price_drop": { wishlistId, sku, oldPriceUsd, newPriceUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface WishlistItem {
  sku: string;
  name: string;
  priceAtAddUsd: number;
  currentPriceUsd: number;
  addedAt: string;
}

export interface Wishlist {
  id: string;
  customerId: string;
  name: string;
  isPublic: boolean;
  items: WishlistItem[];
  createdAt: string;
}

export interface WishlistSummary {
  totalWishlists: number;
  totalItems: number;
  itemsOnSale: number;
  topWishedSkus: { sku: string; count: number }[];
}

export class WishlistManager {
  private wishlists: Map<string, Wishlist> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(customerId: string, name: string, isPublic = false): Wishlist {
    const wishlist: Wishlist = { id: randomUUID(), customerId, name, isPublic, items: [], createdAt: new Date().toISOString() };
    this.wishlists.set(wishlist.id, wishlist);
    this.bus.publish("wishlist.created", { wishlistId: wishlist.id, customerId, name });
    return wishlist;
  }

  addItem(wishlistId: string, input: { sku: string; name: string; priceUsd: number; asOf: string }): WishlistItem | undefined {
    const wishlist = this.wishlists.get(wishlistId);
    if (!wishlist || wishlist.items.some(i => i.sku === input.sku)) return undefined;
    const item: WishlistItem = { sku: input.sku, name: input.name, priceAtAddUsd: input.priceUsd, currentPriceUsd: input.priceUsd, addedAt: input.asOf };
    wishlist.items.push(item);
    this.bus.publish("wishlist.item_added", { wishlistId, sku: input.sku });
    return item;
  }

  removeItem(wishlistId: string, sku: string): boolean {
    const wishlist = this.wishlists.get(wishlistId);
    if (!wishlist) return false;
    const idx = wishlist.items.findIndex(i => i.sku === sku);
    if (idx < 0) return false;
    wishlist.items.splice(idx, 1);
    return true;
  }

  /** Update a SKU's price across all wishlists; emit price_drop where it fell. */
  updatePrice(sku: string, newPriceUsd: number): number {
    let drops = 0;
    for (const wishlist of this.wishlists.values()) {
      for (const item of wishlist.items) {
        if (item.sku === sku && newPriceUsd < item.currentPriceUsd) {
          const oldPrice = item.currentPriceUsd;
          item.currentPriceUsd = newPriceUsd;
          drops += 1;
          this.bus.publish("wishlist.price_drop", { wishlistId: wishlist.id, sku, oldPriceUsd: oldPrice, newPriceUsd });
        } else if (item.sku === sku) {
          item.currentPriceUsd = newPriceUsd;
        }
      }
    }
    return drops;
  }

  getWishlist(id: string): Wishlist | undefined { return this.wishlists.get(id); }
  listWishlists(customerId?: string): Wishlist[] {
    const all = Array.from(this.wishlists.values());
    return customerId ? all.filter(w => w.customerId === customerId) : all;
  }

  summary(): WishlistSummary {
    const wishlists = Array.from(this.wishlists.values());
    const items = wishlists.flatMap(w => w.items);
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.sku] = (counts[i.sku] ?? 0) + 1;
    const topWishedSkus = Object.entries(counts).map(([sku, count]) => ({ sku, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    return {
      totalWishlists: wishlists.length,
      totalItems: items.length,
      itemsOnSale: items.filter(i => i.currentPriceUsd < i.priceAtAddUsd).length,
      topWishedSkus,
    };
  }
}
