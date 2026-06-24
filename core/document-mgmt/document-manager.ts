/**
 * DocumentManager — document lifecycle, version control, approval workflows,
 * access tagging, and expiration tracking.
 *
 * Events:
 *   - "document.published": { docId, title, version, authorId }
 *   - "document.approved": { docId, title, approverId }
 *   - "document.expired": { docId, title, expiredAt }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DocStatus = "draft" | "in_review" | "approved" | "published" | "archived" | "expired";
export type DocCategory = "policy" | "procedure" | "template" | "report" | "contract" | "technical" | "legal" | "other";

export interface DocumentVersion {
  version: string;
  content: string;
  authorId: string;
  createdAt: string;
  changeNote?: string;
}

export interface Document {
  id: string;
  title: string;
  category: DocCategory;
  status: DocStatus;
  ownerId: string;
  tags: string[];
  versions: DocumentVersion[];
  currentVersion: string;
  expiresAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocSummary {
  totalDocs: number;
  published: number;
  drafts: number;
  expired: number;
  byCategory: Partial<Record<DocCategory, number>>;
}

export class DocumentManager {
  private docs: Map<string, Document> = new Map();

  constructor(private readonly bus: EventBus) {}

  createDocument(input: {
    title: string;
    category: DocCategory;
    ownerId: string;
    content: string;
    tags?: string[];
    expiresAt?: string;
    id?: string;
  }): Document {
    const now = new Date().toISOString();
    const version: DocumentVersion = {
      version: "1.0",
      content: input.content,
      authorId: input.ownerId,
      createdAt: now,
    };
    const doc: Document = {
      id: input.id ?? randomUUID(),
      title: input.title,
      category: input.category,
      status: "draft",
      ownerId: input.ownerId,
      tags: input.tags ?? [],
      versions: [version],
      currentVersion: "1.0",
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    this.docs.set(doc.id, doc);
    return doc;
  }

  addVersion(docId: string, content: string, authorId: string, changeNote?: string): Document | undefined {
    const doc = this.docs.get(docId);
    if (!doc) return undefined;
    const parts = doc.currentVersion.split(".");
    const minor = parseInt(parts[1] ?? "0", 10) + 1;
    const newVersion = `${parts[0]}.${minor}`;
    doc.versions.push({ version: newVersion, content, authorId, createdAt: new Date().toISOString(), changeNote });
    doc.currentVersion = newVersion;
    doc.status = "draft";
    doc.updatedAt = new Date().toISOString();
    return doc;
  }

  approveDocument(docId: string, approverId: string): Document | undefined {
    const doc = this.docs.get(docId);
    if (!doc) return undefined;
    doc.status = "approved";
    doc.approvedBy = approverId;
    doc.approvedAt = new Date().toISOString();
    doc.updatedAt = doc.approvedAt;
    this.bus.publish("document.approved", { docId, title: doc.title, approverId });
    return doc;
  }

  publishDocument(docId: string): Document | undefined {
    const doc = this.docs.get(docId);
    if (!doc || doc.status !== "approved") return undefined;
    doc.status = "published";
    doc.updatedAt = new Date().toISOString();
    this.bus.publish("document.published", {
      docId,
      title: doc.title,
      version: doc.currentVersion,
      authorId: doc.ownerId,
    });
    return doc;
  }

  expireDocument(docId: string): Document | undefined {
    const doc = this.docs.get(docId);
    if (!doc) return undefined;
    doc.status = "expired";
    doc.updatedAt = new Date().toISOString();
    this.bus.publish("document.expired", { docId, title: doc.title, expiredAt: doc.updatedAt });
    return doc;
  }

  getDocument(id: string): Document | undefined { return this.docs.get(id); }

  listDocuments(status?: DocStatus, category?: DocCategory): Document[] {
    let all = Array.from(this.docs.values());
    if (status) all = all.filter((d) => d.status === status);
    if (category) all = all.filter((d) => d.category === category);
    return all;
  }

  searchByTag(tag: string): Document[] {
    return Array.from(this.docs.values()).filter((d) => d.tags.includes(tag));
  }

  summary(): DocSummary {
    const all = Array.from(this.docs.values());
    const byCategory: Partial<Record<DocCategory, number>> = {};
    for (const d of all) {
      byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    }
    return {
      totalDocs: all.length,
      published: all.filter((d) => d.status === "published").length,
      drafts: all.filter((d) => d.status === "draft").length,
      expired: all.filter((d) => d.status === "expired").length,
      byCategory,
    };
  }
}
