/**
 * RoadmapManager — product roadmap planning, feature prioritization,
 * release tracking, and stakeholder alignment.
 *
 * Events:
 *   - "roadmap.item_shipped": { itemId, title, releaseId, quarter }
 *   - "roadmap.release_published": { releaseId, name, itemCount, quarter }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RoadmapItemStatus = "idea" | "planned" | "in_progress" | "shipped" | "cancelled";
export type RoadmapItemType = "feature" | "improvement" | "bug_fix" | "tech_debt" | "experiment";
export type RoadmapQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  type: RoadmapItemType;
  status: RoadmapItemStatus;
  quarter: RoadmapQuarter;
  year: number;
  releaseId?: string;
  priority: number; // 1 (highest) to 5 (lowest)
  effortPoints: number; // story points / t-shirt estimate in numeric
  valueScore: number; // 0-100 business value score
  ownerId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Release {
  id: string;
  name: string;
  quarter: RoadmapQuarter;
  year: number;
  status: "planned" | "in_progress" | "shipped" | "cancelled";
  targetDate: string;
  items: string[]; // RoadmapItem IDs
  shippedAt?: string;
  createdAt: string;
}

export interface RoadmapSummary {
  totalItems: number;
  shipped: number;
  inProgress: number;
  planned: number;
  totalReleases: number;
  shippedReleases: number;
  byQuarter: Record<string, number>;
  avgValueScore: number;
}

export class RoadmapManager {
  private items: Map<string, RoadmapItem> = new Map();
  private releases: Map<string, Release> = new Map();

  constructor(private readonly bus: EventBus) {}

  addItem(input: Omit<RoadmapItem, "id" | "createdAt" | "updatedAt"> & { id?: string }): RoadmapItem {
    const now = new Date().toISOString();
    const item: RoadmapItem = { ...input, id: input.id ?? randomUUID(), createdAt: now, updatedAt: now };
    this.items.set(item.id, item);
    return item;
  }

  updateItemStatus(itemId: string, status: RoadmapItemStatus): RoadmapItem | undefined {
    const item = this.items.get(itemId);
    if (!item) return undefined;
    item.status = status;
    item.updatedAt = new Date().toISOString();
    if (status === "shipped" && item.releaseId) {
      this.bus.publish("roadmap.item_shipped", {
        itemId: item.id,
        title: item.title,
        releaseId: item.releaseId,
        quarter: item.quarter,
      });
    }
    return item;
  }

  createRelease(input: Omit<Release, "id" | "items" | "createdAt"> & { id?: string }): Release {
    const release: Release = {
      id: input.id ?? randomUUID(),
      name: input.name,
      quarter: input.quarter,
      year: input.year,
      status: input.status,
      targetDate: input.targetDate,
      items: [],
      shippedAt: input.shippedAt,
      createdAt: new Date().toISOString(),
    };
    this.releases.set(release.id, release);
    return release;
  }

  addItemToRelease(releaseId: string, itemId: string): boolean {
    const release = this.releases.get(releaseId);
    const item = this.items.get(itemId);
    if (!release || !item) return false;
    if (!release.items.includes(itemId)) {
      release.items.push(itemId);
      item.releaseId = releaseId;
      item.updatedAt = new Date().toISOString();
    }
    return true;
  }

  shipRelease(releaseId: string): Release | undefined {
    const release = this.releases.get(releaseId);
    if (!release) return undefined;
    release.status = "shipped";
    release.shippedAt = new Date().toISOString();
    for (const itemId of release.items) {
      this.updateItemStatus(itemId, "shipped");
    }
    this.bus.publish("roadmap.release_published", {
      releaseId,
      name: release.name,
      itemCount: release.items.length,
      quarter: release.quarter,
    });
    return release;
  }

  getItem(id: string): RoadmapItem | undefined { return this.items.get(id); }

  listItems(quarter?: RoadmapQuarter, status?: RoadmapItemStatus): RoadmapItem[] {
    let all = Array.from(this.items.values());
    if (quarter) all = all.filter((i) => i.quarter === quarter);
    if (status) all = all.filter((i) => i.status === status);
    return all.sort((a, b) => a.priority - b.priority);
  }

  getRelease(id: string): Release | undefined { return this.releases.get(id); }

  listReleases(): Release[] { return Array.from(this.releases.values()); }

  summary(): RoadmapSummary {
    const items = Array.from(this.items.values());
    const releases = Array.from(this.releases.values());
    const byQuarter: Record<string, number> = {};
    for (const i of items) {
      const k = `${i.quarter} ${i.year}`;
      byQuarter[k] = (byQuarter[k] ?? 0) + 1;
    }
    const avgValueScore = items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.valueScore, 0) / items.length)
      : 0;
    return {
      totalItems: items.length,
      shipped: items.filter((i) => i.status === "shipped").length,
      inProgress: items.filter((i) => i.status === "in_progress").length,
      planned: items.filter((i) => i.status === "planned").length,
      totalReleases: releases.length,
      shippedReleases: releases.filter((r) => r.status === "shipped").length,
      byQuarter,
      avgValueScore,
    };
  }
}
