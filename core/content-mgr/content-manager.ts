/**
 * ContentManager — content creation workflow, editorial calendar,
 * version control, publication scheduling, and SEO performance tracking.
 *
 * Events:
 *   - "content.published": { contentId, title, type, publishedAt, authorId }
 *   - "content.scheduled": { contentId, title, scheduledAt }
 *   - "content.review_requested": { contentId, title, reviewerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ContentType = "blog_post" | "whitepaper" | "case_study" | "video" | "infographic" | "press_release" | "social_post" | "email";
export type ContentStatus = "draft" | "in_review" | "approved" | "scheduled" | "published" | "archived";

export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  authorId: string;
  reviewerId?: string;
  tags: string[];
  targetAudience: string;
  wordCount?: number;
  slug?: string;
  scheduledAt?: string;
  publishedAt?: string;
  pageViews: number;
  seoScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EditorialCalendarEntry {
  id: string;
  contentId: string;
  title: string;
  type: ContentType;
  targetDate: string;
  assignedTo: string;
  campaign?: string;
}

export interface ContentSummary {
  totalContent: number;
  published: number;
  inReview: number;
  scheduled: number;
  totalPageViews: number;
  avgSeoScore: number;
  byType: Partial<Record<ContentType, number>>;
}

export class ContentManager {
  private content: Map<string, ContentItem> = new Map();
  private calendar: Map<string, EditorialCalendarEntry> = new Map();

  constructor(private readonly bus: EventBus) {}

  createContent(input: Omit<ContentItem, "id" | "pageViews" | "createdAt" | "updatedAt"> & { id?: string }): ContentItem {
    const now = new Date().toISOString();
    const item: ContentItem = { ...input, id: input.id ?? randomUUID(), pageViews: 0, createdAt: now, updatedAt: now };
    this.content.set(item.id, item);
    return item;
  }

  requestReview(contentId: string, reviewerId: string): ContentItem | undefined {
    const item = this.content.get(contentId);
    if (!item) return undefined;
    item.status = "in_review";
    item.reviewerId = reviewerId;
    item.updatedAt = new Date().toISOString();
    this.bus.publish("content.review_requested", { contentId, title: item.title, reviewerId });
    return item;
  }

  scheduleContent(contentId: string, scheduledAt: string): ContentItem | undefined {
    const item = this.content.get(contentId);
    if (!item) return undefined;
    item.status = "scheduled";
    item.scheduledAt = scheduledAt;
    item.updatedAt = new Date().toISOString();
    this.bus.publish("content.scheduled", { contentId, title: item.title, scheduledAt });
    return item;
  }

  publishContent(contentId: string): ContentItem | undefined {
    const item = this.content.get(contentId);
    if (!item) return undefined;
    item.status = "published";
    item.publishedAt = new Date().toISOString();
    item.updatedAt = item.publishedAt;
    this.bus.publish("content.published", { contentId, title: item.title, type: item.type, publishedAt: item.publishedAt, authorId: item.authorId });
    return item;
  }

  recordPageView(contentId: string, views = 1): ContentItem | undefined {
    const item = this.content.get(contentId);
    if (!item) return undefined;
    item.pageViews += views;
    return item;
  }

  addCalendarEntry(input: Omit<EditorialCalendarEntry, "id"> & { id?: string }): EditorialCalendarEntry {
    const entry: EditorialCalendarEntry = { ...input, id: input.id ?? randomUUID() };
    this.calendar.set(entry.id, entry);
    return entry;
  }

  getContent(id: string): ContentItem | undefined { return this.content.get(id); }
  listContent(status?: ContentStatus, type?: ContentType): ContentItem[] {
    let all = Array.from(this.content.values());
    if (status) all = all.filter(c => c.status === status);
    if (type) all = all.filter(c => c.type === type);
    return all;
  }
  listCalendar(): EditorialCalendarEntry[] { return Array.from(this.calendar.values()); }

  summary(): ContentSummary {
    const items = Array.from(this.content.values());
    const published = items.filter(c => c.status === "published");
    const withSeo = items.filter(c => c.seoScore !== undefined);
    const avgSeo = withSeo.length > 0 ? Math.round(withSeo.reduce((s, c) => s + (c.seoScore ?? 0), 0) / withSeo.length) : 0;
    const byType: Partial<Record<ContentType, number>> = {};
    for (const c of items) { byType[c.type] = (byType[c.type] ?? 0) + 1; }
    return {
      totalContent: items.length,
      published: published.length,
      inReview: items.filter(c => c.status === "in_review").length,
      scheduled: items.filter(c => c.status === "scheduled").length,
      totalPageViews: items.reduce((s, c) => s + c.pageViews, 0),
      avgSeoScore: avgSeo,
      byType,
    };
  }
}
