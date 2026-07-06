/**
 * BannerManager — site-wide banners (maintenance notices, promos, alerts):
 * scheduled banners with priority, one-active-per-slot resolution, and
 * click-through tracking.
 *
 * Events:
 *   - "banner.scheduled": { bannerId, slot, start, end }
 *   - "banner.clicked": { bannerId }
 *   - "banner.expired": { bannerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BannerTone = "info" | "promo" | "warning" | "critical";
export type BannerStatus = "scheduled" | "expired" | "cancelled";

export interface SiteBanner {
  id: string;
  slot: string; // e.g. "top", "checkout"
  message: string;
  tone: BannerTone;
  priority: number; // higher wins
  status: BannerStatus;
  start: string;
  end: string;
  clicks: number;
  createdAt: string;
}

export interface BannerSummary {
  totalBanners: number;
  scheduled: number;
  expired: number;
  totalClicks: number;
  byTone: Partial<Record<BannerTone, number>>;
}

export class BannerManager {
  private banners: Map<string, SiteBanner> = new Map();

  constructor(private readonly bus: EventBus) {}

  schedule(input: { slot: string; message: string; tone: BannerTone; priority?: number; start: string; end: string }): SiteBanner | undefined {
    if (new Date(input.start).getTime() >= new Date(input.end).getTime()) return undefined;
    const banner: SiteBanner = { ...input, id: randomUUID(), priority: input.priority ?? 0, status: "scheduled", clicks: 0, createdAt: new Date().toISOString() };
    this.banners.set(banner.id, banner);
    this.bus.publish("banner.scheduled", { bannerId: banner.id, slot: banner.slot, start: banner.start, end: banner.end });
    return banner;
  }

  /** Highest-priority active banner for a slot at a given time. */
  activeFor(slot: string, asOf: string): SiteBanner | undefined {
    const now = new Date(asOf).getTime();
    return Array.from(this.banners.values())
      .filter(b => b.slot === slot && b.status === "scheduled" && new Date(b.start).getTime() <= now && now <= new Date(b.end).getTime())
      .sort((a, b) => b.priority - a.priority)[0];
  }

  recordClick(bannerId: string): SiteBanner | undefined {
    const b = this.banners.get(bannerId);
    if (!b || b.status !== "scheduled") return undefined;
    b.clicks += 1;
    this.bus.publish("banner.clicked", { bannerId });
    return b;
  }

  cancel(bannerId: string): SiteBanner | undefined {
    const b = this.banners.get(bannerId);
    if (!b || b.status !== "scheduled") return undefined;
    b.status = "cancelled";
    return b;
  }

  /** Expire banners past their end time. */
  expireStale(asOf: string): SiteBanner[] {
    const now = new Date(asOf).getTime();
    const expired = Array.from(this.banners.values()).filter(b => b.status === "scheduled" && new Date(b.end).getTime() < now);
    for (const b of expired) {
      b.status = "expired";
      this.bus.publish("banner.expired", { bannerId: b.id });
    }
    return expired;
  }

  getBanner(id: string): SiteBanner | undefined { return this.banners.get(id); }
  listBanners(slot?: string, status?: BannerStatus): SiteBanner[] {
    let all = Array.from(this.banners.values());
    if (slot) all = all.filter(b => b.slot === slot);
    if (status) all = all.filter(b => b.status === status);
    return all;
  }

  summary(): BannerSummary {
    const banners = Array.from(this.banners.values());
    const byTone: Partial<Record<BannerTone, number>> = {};
    for (const b of banners) { byTone[b.tone] = (byTone[b.tone] ?? 0) + 1; }
    return {
      totalBanners: banners.length,
      scheduled: banners.filter(b => b.status === "scheduled").length,
      expired: banners.filter(b => b.status === "expired").length,
      totalClicks: banners.reduce((s, b) => s + b.clicks, 0),
      byTone,
    };
  }
}
