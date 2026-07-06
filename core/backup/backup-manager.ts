/**
 * BackupManager — backup job scheduling and execution: per-system backup
 * policies, run success/failure logging, retention pruning, and restore-test
 * verification.
 *
 * Events:
 *   - "backup.policy_created": { policyId, system, frequency }
 *   - "backup.run_failed": { policyId, system, error }
 *   - "backup.restore_tested": { policyId, success }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BackupFrequency = "hourly" | "daily" | "weekly" | "monthly";
export type RunResult = "success" | "failure";

export interface BackupRun {
  id: string;
  result: RunResult;
  sizeGb: number;
  at: string;
  error?: string;
}

export interface BackupPolicy {
  id: string;
  system: string;
  frequency: BackupFrequency;
  retentionDays: number;
  runs: BackupRun[];
  lastRestoreTestAt?: string;
  lastRestoreTestPassed?: boolean;
  createdAt: string;
}

export interface BackupSummary {
  totalPolicies: number;
  totalRuns: number;
  failedRuns: number;
  successRatePct: number;
  policiesNeedingRestoreTest: number;
  totalStoredGb: number;
}

export class BackupManager {
  private policies: Map<string, BackupPolicy> = new Map();

  constructor(private readonly bus: EventBus) {}

  createPolicy(input: { system: string; frequency: BackupFrequency; retentionDays: number }): BackupPolicy {
    const policy: BackupPolicy = { ...input, id: randomUUID(), runs: [], createdAt: new Date().toISOString() };
    this.policies.set(policy.id, policy);
    this.bus.publish("backup.policy_created", { policyId: policy.id, system: policy.system, frequency: policy.frequency });
    return policy;
  }

  recordRun(policyId: string, result: RunResult, sizeGb: number, at: string, error?: string): BackupRun | undefined {
    const policy = this.policies.get(policyId);
    if (!policy) return undefined;
    const run: BackupRun = { id: randomUUID(), result, sizeGb, at, error };
    policy.runs.push(run);
    if (result === "failure") this.bus.publish("backup.run_failed", { policyId, system: policy.system, error: error ?? "unknown" });
    return run;
  }

  /** Remove runs older than retentionDays relative to asOf. Returns count pruned. */
  pruneExpired(policyId: string, asOf: string): number {
    const policy = this.policies.get(policyId);
    if (!policy) return 0;
    const cutoff = new Date(asOf).getTime() - policy.retentionDays * 86400000;
    const before = policy.runs.length;
    policy.runs = policy.runs.filter(r => new Date(r.at).getTime() >= cutoff);
    return before - policy.runs.length;
  }

  testRestore(policyId: string, success: boolean, asOf: string): BackupPolicy | undefined {
    const policy = this.policies.get(policyId);
    if (!policy) return undefined;
    policy.lastRestoreTestAt = asOf;
    policy.lastRestoreTestPassed = success;
    this.bus.publish("backup.restore_tested", { policyId, success });
    return policy;
  }

  lastSuccessfulRun(policyId: string): BackupRun | undefined {
    const policy = this.policies.get(policyId);
    if (!policy) return undefined;
    return [...policy.runs].reverse().find(r => r.result === "success");
  }

  getPolicy(id: string): BackupPolicy | undefined { return this.policies.get(id); }
  listPolicies(): BackupPolicy[] { return Array.from(this.policies.values()); }

  summary(asOf?: string): BackupSummary {
    const policies = Array.from(this.policies.values());
    const runs = policies.flatMap(p => p.runs);
    const failed = runs.filter(r => r.result === "failure").length;
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const needsTest = policies.filter(p => !p.lastRestoreTestAt || (ref - new Date(p.lastRestoreTestAt).getTime()) / 86400000 > 90).length;
    return {
      totalPolicies: policies.length,
      totalRuns: runs.length,
      failedRuns: failed,
      successRatePct: runs.length > 0 ? Math.round(((runs.length - failed) / runs.length) * 100) : 0,
      policiesNeedingRestoreTest: needsTest,
      totalStoredGb: Math.round(runs.filter(r => r.result === "success").reduce((s, r) => s + r.sizeGb, 0) * 100) / 100,
    };
  }
}
