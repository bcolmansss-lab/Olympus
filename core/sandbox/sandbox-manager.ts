/**
 * SandboxManager — demo/trial sandbox environments: provisioning with a TTL
 * and resource tier, activity-based TTL extension with a hard cap, expiry
 * sweeps, and capacity reporting against a fleet limit.
 *
 * Events:
 *   - "sandbox.provisioned": { sandboxId, ownerId, expiresAt }
 *   - "sandbox.extended": { sandboxId, expiresAt }
 *   - "sandbox.expired": { sandboxId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SandboxStatus = "active" | "expired" | "destroyed";
export type SandboxTier = "small" | "medium" | "large";

export interface Sandbox {
  id: string;
  ownerId: string;
  tier: SandboxTier;
  status: SandboxStatus;
  provisionedAt: string;
  expiresAt: string;
  extensions: number;
}

export interface SandboxSummary {
  totalProvisioned: number;
  active: number;
  expired: number;
  capacityUsedPct: number;
  byTier: Record<SandboxTier, number>;
}

export class SandboxManager {
  private sandboxes: Map<string, Sandbox> = new Map();
  private maxActive: number;
  private maxExtensions: number;

  constructor(private readonly bus: EventBus, maxActive = 50, maxExtensions = 2) {
    this.maxActive = maxActive;
    this.maxExtensions = maxExtensions;
  }

  /** Provision a sandbox with a TTL in hours; fails at fleet capacity. */
  provision(ownerId: string, tier: SandboxTier, provisionedAt: string, ttlHours: number): Sandbox | undefined {
    if (this.listSandboxes("active").length >= this.maxActive || ttlHours <= 0) return undefined;
    const expiresAt = new Date(new Date(provisionedAt).getTime() + ttlHours * 3600000).toISOString();
    const sandbox: Sandbox = { id: randomUUID(), ownerId, tier, status: "active", provisionedAt, expiresAt, extensions: 0 };
    this.sandboxes.set(sandbox.id, sandbox);
    this.bus.publish("sandbox.provisioned", { sandboxId: sandbox.id, ownerId, expiresAt });
    return sandbox;
  }

  /** Extend an active sandbox's TTL; capped at maxExtensions. */
  extend(sandboxId: string, extraHours: number): Sandbox | undefined {
    const sb = this.sandboxes.get(sandboxId);
    if (!sb || sb.status !== "active" || sb.extensions >= this.maxExtensions || extraHours <= 0) return undefined;
    sb.expiresAt = new Date(new Date(sb.expiresAt).getTime() + extraHours * 3600000).toISOString();
    sb.extensions += 1;
    this.bus.publish("sandbox.extended", { sandboxId, expiresAt: sb.expiresAt });
    return sb;
  }

  /** Expire all active sandboxes past their TTL as of the given time. */
  sweep(asOf: string): Sandbox[] {
    const now = new Date(asOf).getTime();
    const expired: Sandbox[] = [];
    for (const sb of this.sandboxes.values()) {
      if (sb.status === "active" && new Date(sb.expiresAt).getTime() <= now) {
        sb.status = "expired";
        expired.push(sb);
        this.bus.publish("sandbox.expired", { sandboxId: sb.id });
      }
    }
    return expired;
  }

  destroy(sandboxId: string): Sandbox | undefined {
    const sb = this.sandboxes.get(sandboxId);
    if (!sb || sb.status === "destroyed") return undefined;
    sb.status = "destroyed";
    return sb;
  }

  getSandbox(id: string): Sandbox | undefined { return this.sandboxes.get(id); }
  listSandboxes(status?: SandboxStatus, ownerId?: string): Sandbox[] {
    let all = Array.from(this.sandboxes.values());
    if (status) all = all.filter(s => s.status === status);
    if (ownerId) all = all.filter(s => s.ownerId === ownerId);
    return all;
  }

  summary(): SandboxSummary {
    const all = Array.from(this.sandboxes.values());
    const active = all.filter(s => s.status === "active");
    const byTier: Record<SandboxTier, number> = { small: 0, medium: 0, large: 0 };
    for (const s of active) byTier[s.tier] += 1;
    return {
      totalProvisioned: all.length,
      active: active.length,
      expired: all.filter(s => s.status === "expired").length,
      capacityUsedPct: Math.round((active.length / this.maxActive) * 100),
      byTier,
    };
  }
}
