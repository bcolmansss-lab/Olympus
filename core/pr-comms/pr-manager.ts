/**
 * PRManager — press release drafting, media relations, crisis communications,
 * coverage tracking, and brand sentiment monitoring.
 *
 * Events:
 *   - "pr.release_published": { releaseId, title, channel, publishedAt }
 *   - "pr.coverage_recorded": { coverageId, outlet, sentiment, reachEstimate }
 *   - "pr.crisis_escalated": { crisisId, severity, summary }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReleaseStatus = "draft" | "review" | "approved" | "published" | "archived";
export type PRChannel = "wire" | "direct_email" | "social" | "blog" | "podcast" | "event";
export type CoverageSentiment = "positive" | "neutral" | "negative";
export type CrisisSeverity = "low" | "medium" | "high" | "critical";

export interface PressRelease {
  id: string;
  title: string;
  content: string;
  status: ReleaseStatus;
  channel: PRChannel;
  authorId: string;
  embargo?: string; // ISO date
  publishedAt?: string;
  createdAt: string;
  tags: string[];
}

export interface MediaCoverage {
  id: string;
  releaseId?: string;
  outlet: string;
  journalist?: string;
  headline: string;
  url?: string;
  sentiment: CoverageSentiment;
  reachEstimate: number; // unique visitors/viewers
  publishedAt: string;
  notes?: string;
}

export interface CrisisRecord {
  id: string;
  title: string;
  summary: string;
  severity: CrisisSeverity;
  status: "monitoring" | "active" | "contained" | "resolved";
  detectedAt: string;
  resolvedAt?: string;
  responseActions: string[];
}

export interface PRSummary {
  totalReleases: number;
  published: number;
  totalCoverage: number;
  positiveCoverage: number;
  negativeCoverage: number;
  totalReach: number;
  activeCrises: number;
}

export class PRManager {
  private releases: Map<string, PressRelease> = new Map();
  private coverage: Map<string, MediaCoverage> = new Map();
  private crises: Map<string, CrisisRecord> = new Map();

  constructor(private readonly bus: EventBus) {}

  createRelease(input: Omit<PressRelease, "id" | "createdAt"> & { id?: string }): PressRelease {
    const release: PressRelease = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.releases.set(release.id, release);
    return release;
  }

  publishRelease(releaseId: string): PressRelease | undefined {
    const release = this.releases.get(releaseId);
    if (!release || release.status !== "approved") return undefined;
    release.status = "published";
    release.publishedAt = new Date().toISOString();
    this.bus.publish("pr.release_published", { releaseId, title: release.title, channel: release.channel, publishedAt: release.publishedAt });
    return release;
  }

  recordCoverage(input: Omit<MediaCoverage, "id"> & { id?: string }): MediaCoverage {
    const coverage: MediaCoverage = { ...input, id: input.id ?? randomUUID() };
    this.coverage.set(coverage.id, coverage);
    this.bus.publish("pr.coverage_recorded", { coverageId: coverage.id, outlet: coverage.outlet, sentiment: coverage.sentiment, reachEstimate: coverage.reachEstimate });
    return coverage;
  }

  openCrisis(input: Omit<CrisisRecord, "id" | "detectedAt" | "responseActions"> & { id?: string }): CrisisRecord {
    const crisis: CrisisRecord = { ...input, id: input.id ?? randomUUID(), detectedAt: new Date().toISOString(), responseActions: [] };
    this.crises.set(crisis.id, crisis);
    if (crisis.severity === "high" || crisis.severity === "critical") {
      this.bus.publish("pr.crisis_escalated", { crisisId: crisis.id, severity: crisis.severity, summary: crisis.summary });
    }
    return crisis;
  }

  addResponseAction(crisisId: string, action: string): CrisisRecord | undefined {
    const crisis = this.crises.get(crisisId);
    if (!crisis) return undefined;
    crisis.responseActions.push(action);
    return crisis;
  }

  resolveCrisis(crisisId: string): CrisisRecord | undefined {
    const crisis = this.crises.get(crisisId);
    if (!crisis) return undefined;
    crisis.status = "resolved";
    crisis.resolvedAt = new Date().toISOString();
    return crisis;
  }

  getRelease(id: string): PressRelease | undefined { return this.releases.get(id); }
  listReleases(status?: ReleaseStatus): PressRelease[] {
    const all = Array.from(this.releases.values());
    return status ? all.filter((r) => r.status === status) : all;
  }

  listCoverage(releaseId?: string): MediaCoverage[] {
    const all = Array.from(this.coverage.values());
    return releaseId ? all.filter((c) => c.releaseId === releaseId) : all;
  }

  listCrises(): CrisisRecord[] { return Array.from(this.crises.values()); }

  summary(): PRSummary {
    const releases = Array.from(this.releases.values());
    const coverage = Array.from(this.coverage.values());
    const crises = Array.from(this.crises.values());
    return {
      totalReleases: releases.length,
      published: releases.filter((r) => r.status === "published").length,
      totalCoverage: coverage.length,
      positiveCoverage: coverage.filter((c) => c.sentiment === "positive").length,
      negativeCoverage: coverage.filter((c) => c.sentiment === "negative").length,
      totalReach: coverage.reduce((s, c) => s + c.reachEstimate, 0),
      activeCrises: crises.filter((c) => c.status === "active" || c.status === "monitoring").length,
    };
  }
}
