/**
 * FirmwareManager — firmware release management: version publishing per
 * device model, staged rollouts with percentage gates, per-device update
 * results, failure-rate-based automatic halt, and rollout reporting.
 *
 * Events:
 *   - "firmware.published": { releaseId, model, version }
 *   - "firmware.rollout_advanced": { releaseId, stagePct }
 *   - "firmware.rollout_halted": { releaseId, failureRatePct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RolloutStatus = "published" | "rolling_out" | "halted" | "complete";

export interface FirmwareRelease {
  id: string;
  model: string;
  version: string;
  status: RolloutStatus;
  stagePct: number;
  successCount: number;
  failureCount: number;
  publishedAt: string;
}

export interface FirmwareSummary {
  totalReleases: number;
  rollingOut: number;
  halted: number;
  complete: number;
  overallSuccessRatePct: number;
}

export class FirmwareManager {
  private releases: Map<string, FirmwareRelease> = new Map();
  private maxFailureRatePct: number;

  constructor(private readonly bus: EventBus, maxFailureRatePct = 10) {
    this.maxFailureRatePct = maxFailureRatePct;
  }

  publish(model: string, version: string, publishedAt: string): FirmwareRelease | undefined {
    const dup = Array.from(this.releases.values()).some(r => r.model === model && r.version === version);
    if (dup) return undefined;
    const release: FirmwareRelease = { id: randomUUID(), model, version, status: "published", stagePct: 0, successCount: 0, failureCount: 0, publishedAt };
    this.releases.set(release.id, release);
    this.bus.publish("firmware.published", { releaseId: release.id, model, version });
    return release;
  }

  /** Advance the rollout stage; must strictly increase, 100% completes. */
  advanceStage(releaseId: string, stagePct: number): FirmwareRelease | undefined {
    const r = this.releases.get(releaseId);
    if (!r || (r.status !== "published" && r.status !== "rolling_out")) return undefined;
    if (stagePct <= r.stagePct || stagePct > 100) return undefined;
    r.stagePct = stagePct;
    r.status = stagePct === 100 ? "complete" : "rolling_out";
    this.bus.publish("firmware.rollout_advanced", { releaseId, stagePct });
    return r;
  }

  /**
   * Record a device update result; once at least 10 results exist, a failure
   * rate above the cap halts the rollout automatically.
   */
  recordResult(releaseId: string, success: boolean): FirmwareRelease | undefined {
    const r = this.releases.get(releaseId);
    if (!r || (r.status !== "rolling_out" && r.status !== "published")) return undefined;
    if (success) r.successCount += 1;
    else r.failureCount += 1;
    const total = r.successCount + r.failureCount;
    const failureRatePct = (r.failureCount / total) * 100;
    if (total >= 10 && failureRatePct > this.maxFailureRatePct) {
      r.status = "halted";
      this.bus.publish("firmware.rollout_halted", { releaseId, failureRatePct: Math.round(failureRatePct * 100) / 100 });
    }
    return r;
  }

  resume(releaseId: string): FirmwareRelease | undefined {
    const r = this.releases.get(releaseId);
    if (!r || r.status !== "halted") return undefined;
    r.status = "rolling_out";
    r.successCount = 0;
    r.failureCount = 0;
    return r;
  }

  getRelease(id: string): FirmwareRelease | undefined { return this.releases.get(id); }
  latestFor(model: string): FirmwareRelease | undefined {
    return Array.from(this.releases.values())
      .filter(r => r.model === model)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  }
  listReleases(status?: RolloutStatus): FirmwareRelease[] {
    const all = Array.from(this.releases.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): FirmwareSummary {
    const releases = Array.from(this.releases.values());
    const success = releases.reduce((s, r) => s + r.successCount, 0);
    const total = releases.reduce((s, r) => s + r.successCount + r.failureCount, 0);
    return {
      totalReleases: releases.length,
      rollingOut: releases.filter(r => r.status === "rolling_out").length,
      halted: releases.filter(r => r.status === "halted").length,
      complete: releases.filter(r => r.status === "complete").length,
      overallSuccessRatePct: total > 0 ? Math.round((success / total) * 100) : 100,
    };
  }
}
