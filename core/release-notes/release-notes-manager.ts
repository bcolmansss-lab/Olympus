/**
 * ReleaseNotesManager — public changelog / release notes: draft entries grouped
 * by version and category, publishing workflow, and reader reactions.
 *
 * Events:
 *   - "releasenotes.entry_added": { entryId, version, category }
 *   - "releasenotes.published": { version, entryCount }
 *   - "releasenotes.reaction": { entryId, reaction }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ChangeCategory = "feature" | "improvement" | "fix" | "security" | "deprecation" | "breaking";
export type ReleaseState = "draft" | "published";
export type Reaction = "thumbs_up" | "thumbs_down" | "celebrate";

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  body: string;
  category: ChangeCategory;
  reactions: Record<Reaction, number>;
  createdAt: string;
}

export interface Release {
  version: string;
  state: ReleaseState;
  entries: ChangelogEntry[];
  publishedAt?: string;
}

export interface ReleaseNotesSummary {
  totalReleases: number;
  published: number;
  totalEntries: number;
  byCategory: Partial<Record<ChangeCategory, number>>;
  totalReactions: number;
}

export class ReleaseNotesManager {
  private releases: Map<string, Release> = new Map();

  constructor(private readonly bus: EventBus) {}

  private ensureRelease(version: string): Release {
    let release = this.releases.get(version);
    if (!release) {
      release = { version, state: "draft", entries: [] };
      this.releases.set(version, release);
    }
    return release;
  }

  addEntry(input: { version: string; title: string; body: string; category: ChangeCategory }): ChangelogEntry | undefined {
    const release = this.ensureRelease(input.version);
    if (release.state === "published") return undefined;
    const entry: ChangelogEntry = { ...input, id: randomUUID(), reactions: { thumbs_up: 0, thumbs_down: 0, celebrate: 0 }, createdAt: new Date().toISOString() };
    release.entries.push(entry);
    this.bus.publish("releasenotes.entry_added", { entryId: entry.id, version: input.version, category: input.category });
    return entry;
  }

  publish(version: string, asOf: string): Release | undefined {
    const release = this.releases.get(version);
    if (!release || release.state === "published" || release.entries.length === 0) return undefined;
    release.state = "published";
    release.publishedAt = asOf;
    this.bus.publish("releasenotes.published", { version, entryCount: release.entries.length });
    return release;
  }

  react(version: string, entryId: string, reaction: Reaction): ChangelogEntry | undefined {
    const release = this.releases.get(version);
    const entry = release?.entries.find(e => e.id === entryId);
    if (!entry || release!.state !== "published") return undefined;
    entry.reactions[reaction] += 1;
    this.bus.publish("releasenotes.reaction", { entryId, reaction });
    return entry;
  }

  getRelease(version: string): Release | undefined { return this.releases.get(version); }
  listReleases(state?: ReleaseState): Release[] {
    const all = Array.from(this.releases.values());
    return state ? all.filter(r => r.state === state) : all;
  }
  publishedNotes(): Release[] {
    return Array.from(this.releases.values()).filter(r => r.state === "published").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  }

  summary(): ReleaseNotesSummary {
    const releases = Array.from(this.releases.values());
    const entries = releases.flatMap(r => r.entries);
    const byCategory: Partial<Record<ChangeCategory, number>> = {};
    for (const e of entries) { byCategory[e.category] = (byCategory[e.category] ?? 0) + 1; }
    return {
      totalReleases: releases.length,
      published: releases.filter(r => r.state === "published").length,
      totalEntries: entries.length,
      byCategory,
      totalReactions: entries.reduce((s, e) => s + e.reactions.thumbs_up + e.reactions.thumbs_down + e.reactions.celebrate, 0),
    };
  }
}
