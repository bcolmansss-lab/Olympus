/**
 * ConsentManager — privacy consent records per data subject and purpose, with
 * grant/withdraw history, versioned policy, and current-consent checks.
 *
 * Events:
 *   - "consent.granted": { subjectId, purpose, policyVersion }
 *   - "consent.withdrawn": { subjectId, purpose }
 *   - "consent.expired": { subjectId, purpose }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ConsentPurpose = "marketing" | "analytics" | "personalization" | "third_party_sharing" | "essential";
export type ConsentState = "granted" | "withdrawn" | "expired";

export interface ConsentRecord {
  id: string;
  subjectId: string;
  purpose: ConsentPurpose;
  state: ConsentState;
  policyVersion: string;
  channel: string; // web, email, app
  grantedAt: string;
  withdrawnAt?: string;
  expiresAt?: string;
}

export interface ConsentSummary {
  totalRecords: number;
  granted: number;
  withdrawn: number;
  byPurpose: Partial<Record<ConsentPurpose, number>>;
  uniqueSubjects: number;
}

export class ConsentManager {
  private records: Map<string, ConsentRecord> = new Map();

  constructor(private readonly bus: EventBus) {}

  private currentKey(subjectId: string, purpose: ConsentPurpose): ConsentRecord | undefined {
    return Array.from(this.records.values())
      .filter(r => r.subjectId === subjectId && r.purpose === purpose)
      .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime())[0];
  }

  grant(subjectId: string, purpose: ConsentPurpose, policyVersion: string, channel: string, grantedAt: string, expiresAt?: string): ConsentRecord {
    const record: ConsentRecord = { id: randomUUID(), subjectId, purpose, state: "granted", policyVersion, channel, grantedAt, expiresAt };
    this.records.set(record.id, record);
    this.bus.publish("consent.granted", { subjectId, purpose, policyVersion });
    return record;
  }

  withdraw(subjectId: string, purpose: ConsentPurpose, asOf: string): ConsentRecord | undefined {
    const current = this.currentKey(subjectId, purpose);
    if (!current || current.state !== "granted") return undefined;
    current.state = "withdrawn";
    current.withdrawnAt = asOf;
    this.bus.publish("consent.withdrawn", { subjectId, purpose });
    return current;
  }

  hasConsent(subjectId: string, purpose: ConsentPurpose, asOf: string): boolean {
    const current = this.currentKey(subjectId, purpose);
    if (!current || current.state !== "granted") return false;
    if (current.expiresAt && new Date(asOf).getTime() > new Date(current.expiresAt).getTime()) return false;
    return true;
  }

  /** Expire granted consents past their expiry. */
  checkExpiry(asOf: string): ConsentRecord[] {
    const cutoff = new Date(asOf).getTime();
    const expired = Array.from(this.records.values()).filter(r => r.state === "granted" && r.expiresAt && new Date(r.expiresAt).getTime() < cutoff);
    for (const r of expired) {
      r.state = "expired";
      this.bus.publish("consent.expired", { subjectId: r.subjectId, purpose: r.purpose });
    }
    return expired;
  }

  getRecord(id: string): ConsentRecord | undefined { return this.records.get(id); }
  subjectConsents(subjectId: string): ConsentRecord[] {
    return Array.from(this.records.values()).filter(r => r.subjectId === subjectId);
  }
  listRecords(purpose?: ConsentPurpose, state?: ConsentState): ConsentRecord[] {
    let all = Array.from(this.records.values());
    if (purpose) all = all.filter(r => r.purpose === purpose);
    if (state) all = all.filter(r => r.state === state);
    return all;
  }

  summary(): ConsentSummary {
    const records = Array.from(this.records.values());
    const byPurpose: Partial<Record<ConsentPurpose, number>> = {};
    for (const r of records) { byPurpose[r.purpose] = (byPurpose[r.purpose] ?? 0) + 1; }
    return {
      totalRecords: records.length,
      granted: records.filter(r => r.state === "granted").length,
      withdrawn: records.filter(r => r.state === "withdrawn").length,
      byPurpose,
      uniqueSubjects: new Set(records.map(r => r.subjectId)).size,
    };
  }
}
