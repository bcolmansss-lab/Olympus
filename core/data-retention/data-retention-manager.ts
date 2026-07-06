/**
 * DataRetentionManager — data lifecycle governance: retention policies by
 * data class, record registration, expiry evaluation, and purge/legal-hold.
 *
 * Events:
 *   - "retention.policy_created": { policyId, dataClass, retentionDays }
 *   - "retention.record_expired": { recordId, dataClass, expiresAt }
 *   - "retention.record_purged": { recordId, dataClass }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DataClass = "pii" | "financial" | "operational" | "marketing" | "logs" | "legal";
export type RecordLifecycleStatus = "active" | "expired" | "purged" | "legal_hold";

export interface RetentionPolicy {
  id: string;
  dataClass: DataClass;
  retentionDays: number;
  autoPurge: boolean;
  createdAt: string;
}

export interface DataRecord {
  id: string;
  dataClass: DataClass;
  reference: string;
  status: RecordLifecycleStatus;
  createdAt: string;
  expiresAt: string;
  purgedAt?: string;
}

export interface RetentionSummary {
  totalPolicies: number;
  totalRecords: number;
  active: number;
  expired: number;
  purged: number;
  legalHold: number;
  byDataClass: Partial<Record<DataClass, number>>;
}

export class DataRetentionManager {
  private policies: Map<DataClass, RetentionPolicy> = new Map();
  private records: Map<string, DataRecord> = new Map();

  constructor(private readonly bus: EventBus) {}

  setPolicy(dataClass: DataClass, retentionDays: number, autoPurge = false): RetentionPolicy {
    const policy: RetentionPolicy = { id: randomUUID(), dataClass, retentionDays, autoPurge, createdAt: new Date().toISOString() };
    this.policies.set(dataClass, policy);
    this.bus.publish("retention.policy_created", { policyId: policy.id, dataClass, retentionDays });
    return policy;
  }

  registerRecord(dataClass: DataClass, reference: string, createdAt: string): DataRecord | undefined {
    const policy = this.policies.get(dataClass);
    if (!policy) return undefined;
    const expires = new Date(createdAt);
    expires.setUTCDate(expires.getUTCDate() + policy.retentionDays);
    const record: DataRecord = { id: randomUUID(), dataClass, reference, status: "active", createdAt, expiresAt: expires.toISOString() };
    this.records.set(record.id, record);
    return record;
  }

  placeLegalHold(recordId: string): DataRecord | undefined {
    const r = this.records.get(recordId);
    if (!r || r.status === "purged") return undefined;
    r.status = "legal_hold";
    return r;
  }

  releaseLegalHold(recordId: string): DataRecord | undefined {
    const r = this.records.get(recordId);
    if (!r || r.status !== "legal_hold") return undefined;
    r.status = "active";
    return r;
  }

  /** Evaluate records against retention; mark expired and optionally purge. */
  evaluate(asOf: string): { expired: DataRecord[]; purged: DataRecord[] } {
    const cutoff = new Date(asOf).getTime();
    const expired: DataRecord[] = [];
    const purged: DataRecord[] = [];
    for (const r of this.records.values()) {
      if (r.status === "legal_hold" || r.status === "purged") continue;
      if (new Date(r.expiresAt).getTime() <= cutoff) {
        if (r.status === "active") {
          r.status = "expired";
          this.bus.publish("retention.record_expired", { recordId: r.id, dataClass: r.dataClass, expiresAt: r.expiresAt });
          expired.push(r);
        }
        const policy = this.policies.get(r.dataClass);
        if (policy?.autoPurge) {
          r.status = "purged";
          r.purgedAt = asOf;
          this.bus.publish("retention.record_purged", { recordId: r.id, dataClass: r.dataClass });
          purged.push(r);
        }
      }
    }
    return { expired, purged };
  }

  purge(recordId: string, asOf: string): DataRecord | undefined {
    const r = this.records.get(recordId);
    if (!r || r.status === "legal_hold") return undefined;
    r.status = "purged";
    r.purgedAt = asOf;
    this.bus.publish("retention.record_purged", { recordId: r.id, dataClass: r.dataClass });
    return r;
  }

  getRecord(id: string): DataRecord | undefined { return this.records.get(id); }
  listPolicies(): RetentionPolicy[] { return Array.from(this.policies.values()); }
  listRecords(dataClass?: DataClass, status?: RecordLifecycleStatus): DataRecord[] {
    let all = Array.from(this.records.values());
    if (dataClass) all = all.filter(r => r.dataClass === dataClass);
    if (status) all = all.filter(r => r.status === status);
    return all;
  }

  summary(): RetentionSummary {
    const records = Array.from(this.records.values());
    const byDataClass: Partial<Record<DataClass, number>> = {};
    for (const r of records) { byDataClass[r.dataClass] = (byDataClass[r.dataClass] ?? 0) + 1; }
    return {
      totalPolicies: this.policies.size,
      totalRecords: records.length,
      active: records.filter(r => r.status === "active").length,
      expired: records.filter(r => r.status === "expired").length,
      purged: records.filter(r => r.status === "purged").length,
      legalHold: records.filter(r => r.status === "legal_hold").length,
      byDataClass,
    };
  }
}
