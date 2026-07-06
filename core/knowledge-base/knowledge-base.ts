/**
 * KnowledgeBase — internal wiki, runbooks, playbooks, and documentation management.
 *
 * Concepts:
 *   - Article: a document with versioned content, tags, and ownership
 *   - Collection: a named grouping of articles (like a wiki space)
 *   - Search: full keyword search across titles and content
 *   - Freshness: articles flagged stale after configurable days without review
 *
 * Events:
 *   - "kb.article_published": { articleId, title, collectionId, authorId }
 *   - "kb.article_stale": { articleId, title, daysSinceReview }
 *   - "kb.article_viewed": { articleId, viewerId }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ArticleStatus = "draft" | "published" | "archived" | "stale";
export type ArticleType = "runbook" | "playbook" | "policy" | "howto" | "reference" | "adr" | "postmortem_template" | "other";

export interface Article {
  id: string;
  title: string;
  content: string; // markdown
  type: ArticleType;
  status: ArticleStatus;
  collectionId: string;
  authorId: string;
  reviewedBy?: string;
  version: number;
  viewCount: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  lastReviewedAt?: string;
  reviewIntervalDays: number; // flag stale after this many days
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  ownerTeam: string;
  parentCollectionId?: string;
  createdAt: string;
}

export interface KBSummary {
  totalArticles: number;
  publishedArticles: number;
  staleArticles: number;
  totalCollections: number;
  totalViews: number;
  topArticles: Array<{ id: string; title: string; viewCount: number }>;
}

export class KnowledgeBase {
  private readonly articles = new Map<string, Article>();
  private readonly collections = new Map<string, Collection>();
  private readonly bus: EventBus;
  private readonly stalenessThresholdDays: number;

  constructor(bus: EventBus, stalenessThresholdDays = 90) {
    this.bus = bus;
    this.stalenessThresholdDays = stalenessThresholdDays;
  }

  createCollection(input: Omit<Collection, "id" | "createdAt"> & { id?: string }): Collection {
    const col: Collection = {
      id: input.id ?? randomUUID(),
      name: input.name,
      description: input.description,
      ownerTeam: input.ownerTeam,
      ...(input.parentCollectionId !== undefined ? { parentCollectionId: input.parentCollectionId } : {}),
      createdAt: new Date().toISOString(),
    };
    this.collections.set(col.id, col);
    return col;
  }

  publishArticle(
    input: Omit<Article, "id" | "status" | "version" | "viewCount" | "createdAt" | "updatedAt"> & { id?: string; status?: ArticleStatus }
  ): Article {
    const now = new Date().toISOString();
    const article: Article = {
      id: input.id ?? randomUUID(),
      title: input.title,
      content: input.content,
      type: input.type,
      status: input.status ?? "published",
      collectionId: input.collectionId,
      authorId: input.authorId,
      version: 1,
      viewCount: 0,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
      reviewIntervalDays: input.reviewIntervalDays,
      ...(input.reviewedBy !== undefined ? { reviewedBy: input.reviewedBy } : {}),
      ...(input.lastReviewedAt !== undefined ? { lastReviewedAt: input.lastReviewedAt } : {}),
    };
    this.articles.set(article.id, article);
    this.bus.publish("kb.article_published", {
      articleId: article.id,
      title: article.title,
      collectionId: article.collectionId,
      authorId: article.authorId,
    });
    return article;
  }

  updateArticle(
    id: string,
    updates: Partial<Pick<Article, "title" | "content" | "tags" | "reviewedBy" | "reviewIntervalDays">>
  ): Article | undefined {
    const article = this.articles.get(id);
    if (!article) return undefined;
    const now = new Date().toISOString();
    const updated: Article = {
      ...article,
      ...updates,
      version: article.version + 1,
      updatedAt: now,
      ...(updates.reviewedBy !== undefined ? { lastReviewedAt: now } : {}),
    };
    this.articles.set(id, updated);
    return updated;
  }

  recordView(id: string, viewerId: string): Article | undefined {
    const article = this.articles.get(id);
    if (!article) return undefined;
    const updated: Article = { ...article, viewCount: article.viewCount + 1 };
    this.articles.set(id, updated);
    this.bus.publish("kb.article_viewed", { articleId: id, viewerId });
    return updated;
  }

  checkStaleness(): Article[] {
    const nowMs = Date.now();
    const staled: Article[] = [];
    for (const article of this.articles.values()) {
      if (article.status !== "published") continue;
      const refDate = article.lastReviewedAt ?? article.createdAt;
      const ageMs = nowMs - new Date(refDate).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const threshold = article.reviewIntervalDays ?? this.stalenessThresholdDays;
      if (ageDays > threshold) {
        const updated: Article = { ...article, status: "stale" };
        this.articles.set(article.id, updated);
        this.bus.publish("kb.article_stale", {
          articleId: article.id,
          title: article.title,
          daysSinceReview: Math.floor(ageDays),
        });
        staled.push(updated);
      }
    }
    return staled;
  }

  search(query: string): Article[] {
    const q = query.toLowerCase();
    return Array.from(this.articles.values()).filter((a) => {
      if (a.status !== "published" && a.status !== "stale") return false;
      if (a.title.toLowerCase().includes(q)) return true;
      if (a.content.toLowerCase().includes(q)) return true;
      if (a.tags?.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  get(id: string): Article | undefined {
    return this.articles.get(id);
  }

  list(collectionId?: string, status?: ArticleStatus): Article[] {
    return Array.from(this.articles.values()).filter((a) => {
      if (collectionId !== undefined && a.collectionId !== collectionId) return false;
      if (status !== undefined && a.status !== status) return false;
      return true;
    });
  }

  getCollection(id: string): Collection | undefined {
    return this.collections.get(id);
  }

  listCollections(): Collection[] {
    return Array.from(this.collections.values());
  }

  summary(): KBSummary {
    const all = Array.from(this.articles.values());
    const published = all.filter((a) => a.status === "published");
    const stale = all.filter((a) => a.status === "stale");
    const totalViews = all.reduce((sum, a) => sum + a.viewCount, 0);
    const topArticles = all
      .slice()
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 5)
      .map((a) => ({ id: a.id, title: a.title, viewCount: a.viewCount }));
    return {
      totalArticles: all.length,
      publishedArticles: published.length,
      staleArticles: stale.length,
      totalCollections: this.collections.size,
      totalViews,
      topArticles,
    };
  }
}
