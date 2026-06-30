/**
 * MarketplaceManager — app/integration marketplace: partner-published listings
 * with review/approval, install tracking, ratings, and revenue-share accrual.
 *
 * Events:
 *   - "marketplace.listing_submitted": { listingId, partnerId, name }
 *   - "marketplace.listing_published": { listingId, name }
 *   - "marketplace.installed": { listingId, customerId, installs }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ListingStatus = "draft" | "in_review" | "published" | "suspended";
export type ListingCategory = "analytics" | "crm" | "finance" | "productivity" | "security" | "marketing";

export interface Listing {
  id: string;
  partnerId: string;
  name: string;
  category: ListingCategory;
  status: ListingStatus;
  monthlyPriceUsd: number;
  revSharePct: number;
  installs: number;
  ratingSum: number;
  ratingCount: number;
  submittedAt: string;
  publishedAt?: string;
}

export interface MarketplaceSummary {
  totalListings: number;
  published: number;
  totalInstalls: number;
  totalRevShareUsd: number;
  byCategory: Partial<Record<ListingCategory, number>>;
  avgRating: number;
}

export class MarketplaceManager {
  private listings: Map<string, Listing> = new Map();

  constructor(private readonly bus: EventBus) {}

  submit(input: { partnerId: string; name: string; category: ListingCategory; monthlyPriceUsd: number; revSharePct?: number }): Listing {
    const listing: Listing = {
      id: randomUUID(),
      partnerId: input.partnerId,
      name: input.name,
      category: input.category,
      status: "in_review",
      monthlyPriceUsd: input.monthlyPriceUsd,
      revSharePct: input.revSharePct ?? 20,
      installs: 0,
      ratingSum: 0,
      ratingCount: 0,
      submittedAt: new Date().toISOString(),
    };
    this.listings.set(listing.id, listing);
    this.bus.publish("marketplace.listing_submitted", { listingId: listing.id, partnerId: listing.partnerId, name: listing.name });
    return listing;
  }

  publish(listingId: string, asOf: string): Listing | undefined {
    const l = this.listings.get(listingId);
    if (!l || l.status !== "in_review") return undefined;
    l.status = "published";
    l.publishedAt = asOf;
    this.bus.publish("marketplace.listing_published", { listingId, name: l.name });
    return l;
  }

  suspend(listingId: string): Listing | undefined {
    const l = this.listings.get(listingId);
    if (!l) return undefined;
    l.status = "suspended";
    return l;
  }

  install(listingId: string, customerId: string): Listing | undefined {
    const l = this.listings.get(listingId);
    if (!l || l.status !== "published") return undefined;
    l.installs += 1;
    this.bus.publish("marketplace.installed", { listingId, customerId, installs: l.installs });
    return l;
  }

  rate(listingId: string, stars: number): Listing | undefined {
    const l = this.listings.get(listingId);
    if (!l || stars < 1 || stars > 5) return undefined;
    l.ratingSum += stars;
    l.ratingCount += 1;
    return l;
  }

  rating(listingId: string): number {
    const l = this.listings.get(listingId);
    if (!l || l.ratingCount === 0) return 0;
    return Math.round((l.ratingSum / l.ratingCount) * 100) / 100;
  }

  /** Monthly revenue share owed to the platform across published listings. */
  monthlyRevShareUsd(): number {
    return Math.round(Array.from(this.listings.values())
      .filter(l => l.status === "published")
      .reduce((s, l) => s + l.installs * l.monthlyPriceUsd * (l.revSharePct / 100), 0) * 100) / 100;
  }

  getListing(id: string): Listing | undefined { return this.listings.get(id); }
  listListings(status?: ListingStatus, category?: ListingCategory): Listing[] {
    let all = Array.from(this.listings.values());
    if (status) all = all.filter(l => l.status === status);
    if (category) all = all.filter(l => l.category === category);
    return all;
  }

  summary(): MarketplaceSummary {
    const listings = Array.from(this.listings.values());
    const byCategory: Partial<Record<ListingCategory, number>> = {};
    for (const l of listings) { byCategory[l.category] = (byCategory[l.category] ?? 0) + 1; }
    const rated = listings.filter(l => l.ratingCount > 0);
    const avgRating = rated.length > 0 ? Math.round((rated.reduce((s, l) => s + this.rating(l.id), 0) / rated.length) * 100) / 100 : 0;
    return {
      totalListings: listings.length,
      published: listings.filter(l => l.status === "published").length,
      totalInstalls: listings.reduce((s, l) => s + l.installs, 0),
      totalRevShareUsd: this.monthlyRevShareUsd(),
      byCategory,
      avgRating,
    };
  }
}
