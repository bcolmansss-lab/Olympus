/**
 * ReleaseManager — software release lifecycle: version planning, environment
 * promotion (dev→staging→prod), deployment outcome tracking, and rollback.
 *
 * Events:
 *   - "release.created": { releaseId, version, plannedDate }
 *   - "release.promoted": { releaseId, version, environment }
 *   - "release.rolled_back": { releaseId, version, environment, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReleaseStage = "planned" | "dev" | "staging" | "production" | "rolled_back";
export type DeploymentOutcome = "success" | "failed";

const PROMOTION_PATH: ReleaseStage[] = ["planned", "dev", "staging", "production"];

export interface ReleaseChangeItem {
  ref: string; // PR/ticket id
  description: string;
}

export interface Deployment {
  id: string;
  environment: ReleaseStage;
  outcome: DeploymentOutcome;
  deployedAt: string;
  notes?: string;
}

export interface SoftwareRelease {
  id: string;
  version: string;
  stage: ReleaseStage;
  plannedDate: string;
  changes: ReleaseChangeItem[];
  deployments: Deployment[];
  createdAt: string;
  shippedAt?: string;
}

export interface ReleaseSummary {
  totalReleases: number;
  inProduction: number;
  rolledBack: number;
  totalDeployments: number;
  failedDeployments: number;
  byStage: Partial<Record<ReleaseStage, number>>;
}

export class ReleaseManager {
  private releases: Map<string, SoftwareRelease> = new Map();

  constructor(private readonly bus: EventBus) {}

  createRelease(version: string, plannedDate: string, changes: ReleaseChangeItem[] = []): SoftwareRelease {
    const release: SoftwareRelease = { id: randomUUID(), version, stage: "planned", plannedDate, changes, deployments: [], createdAt: new Date().toISOString() };
    this.releases.set(release.id, release);
    this.bus.publish("release.created", { releaseId: release.id, version, plannedDate });
    return release;
  }

  addChange(releaseId: string, change: ReleaseChangeItem): SoftwareRelease | undefined {
    const release = this.releases.get(releaseId);
    if (!release || release.stage === "production" || release.stage === "rolled_back") return undefined;
    release.changes.push(change);
    return release;
  }

  /** Promote a release to the next environment in the path, recording a deployment. */
  promote(releaseId: string, outcome: DeploymentOutcome, asOf: string, notes?: string): SoftwareRelease | undefined {
    const release = this.releases.get(releaseId);
    if (!release || release.stage === "production" || release.stage === "rolled_back") return undefined;
    const currentIdx = PROMOTION_PATH.indexOf(release.stage);
    const nextStage = PROMOTION_PATH[currentIdx + 1];
    if (!nextStage) return undefined;
    release.deployments.push({ id: randomUUID(), environment: nextStage, outcome, deployedAt: asOf, notes });
    if (outcome === "success") {
      release.stage = nextStage;
      if (nextStage === "production") release.shippedAt = asOf;
      this.bus.publish("release.promoted", { releaseId, version: release.version, environment: nextStage });
    }
    return release;
  }

  rollback(releaseId: string, reason: string, asOf: string): SoftwareRelease | undefined {
    const release = this.releases.get(releaseId);
    if (!release || release.stage === "planned" || release.stage === "rolled_back") return undefined;
    const env = release.stage;
    release.stage = "rolled_back";
    release.deployments.push({ id: randomUUID(), environment: env, outcome: "failed", deployedAt: asOf, notes: `rollback: ${reason}` });
    this.bus.publish("release.rolled_back", { releaseId, version: release.version, environment: env, reason });
    return release;
  }

  getRelease(id: string): SoftwareRelease | undefined { return this.releases.get(id); }
  listReleases(stage?: ReleaseStage): SoftwareRelease[] {
    const all = Array.from(this.releases.values());
    return stage ? all.filter(r => r.stage === stage) : all;
  }

  summary(): ReleaseSummary {
    const releases = Array.from(this.releases.values());
    const byStage: Partial<Record<ReleaseStage, number>> = {};
    for (const r of releases) { byStage[r.stage] = (byStage[r.stage] ?? 0) + 1; }
    const deployments = releases.flatMap(r => r.deployments);
    return {
      totalReleases: releases.length,
      inProduction: releases.filter(r => r.stage === "production").length,
      rolledBack: releases.filter(r => r.stage === "rolled_back").length,
      totalDeployments: deployments.length,
      failedDeployments: deployments.filter(d => d.outcome === "failed").length,
      byStage,
    };
  }
}
