/**
 * AssetAuditManager — physical asset verification audits: expected asset
 * registers per location, scan-based verification, and found/missing/misplaced
 * reconciliation.
 *
 * Events:
 *   - "assetaudit.started": { auditId, location, expectedCount }
 *   - "assetaudit.asset_scanned": { auditId, assetTag, outcome }
 *   - "assetaudit.completed": { auditId, found, missing, accuracyPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AuditStatus = "in_progress" | "completed";
export type ScanOutcome = "verified" | "misplaced" | "unexpected";

export interface AuditAssetLine {
  assetTag: string;
  expectedLocation: string;
  found: boolean;
  scannedLocation?: string;
}

export interface AssetAudit {
  id: string;
  location: string;
  status: AuditStatus;
  lines: AuditAssetLine[];
  unexpectedScans: string[];
  startedAt: string;
  completedAt?: string;
}

export interface AssetAuditSummary {
  totalAudits: number;
  inProgress: number;
  completed: number;
  totalAssetsAudited: number;
  totalMissing: number;
  avgAccuracyPct: number;
}

export class AssetAuditManager {
  private audits: Map<string, AssetAudit> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(location: string, expectedAssets: string[]): AssetAudit {
    const audit: AssetAudit = {
      id: randomUUID(),
      location,
      status: "in_progress",
      lines: expectedAssets.map(tag => ({ assetTag: tag, expectedLocation: location, found: false })),
      unexpectedScans: [],
      startedAt: new Date().toISOString(),
    };
    this.audits.set(audit.id, audit);
    this.bus.publish("assetaudit.started", { auditId: audit.id, location, expectedCount: expectedAssets.length });
    return audit;
  }

  scan(auditId: string, assetTag: string, scannedLocation: string): ScanOutcome | undefined {
    const audit = this.audits.get(auditId);
    if (!audit || audit.status === "completed") return undefined;
    const line = audit.lines.find(l => l.assetTag === assetTag);
    let outcome: ScanOutcome;
    if (!line) {
      audit.unexpectedScans.push(assetTag);
      outcome = "unexpected";
    } else {
      line.found = true;
      line.scannedLocation = scannedLocation;
      outcome = scannedLocation === line.expectedLocation ? "verified" : "misplaced";
    }
    this.bus.publish("assetaudit.asset_scanned", { auditId, assetTag, outcome });
    return outcome;
  }

  accuracy(auditId: string): number {
    const audit = this.audits.get(auditId);
    if (!audit || audit.lines.length === 0) return 0;
    const verified = audit.lines.filter(l => l.found && l.scannedLocation === l.expectedLocation).length;
    return Math.round((verified / audit.lines.length) * 100);
  }

  complete(auditId: string, asOf: string): AssetAudit | undefined {
    const audit = this.audits.get(auditId);
    if (!audit || audit.status === "completed") return undefined;
    audit.status = "completed";
    audit.completedAt = asOf;
    const found = audit.lines.filter(l => l.found).length;
    const missing = audit.lines.filter(l => !l.found).length;
    this.bus.publish("assetaudit.completed", { auditId, found, missing, accuracyPct: this.accuracy(auditId) });
    return audit;
  }

  missingAssets(auditId: string): string[] {
    const audit = this.audits.get(auditId);
    return audit ? audit.lines.filter(l => !l.found).map(l => l.assetTag) : [];
  }

  getAudit(id: string): AssetAudit | undefined { return this.audits.get(id); }
  listAudits(status?: AuditStatus): AssetAudit[] {
    const all = Array.from(this.audits.values());
    return status ? all.filter(a => a.status === status) : all;
  }

  summary(): AssetAuditSummary {
    const audits = Array.from(this.audits.values());
    const completed = audits.filter(a => a.status === "completed");
    const totalAssets = audits.reduce((s, a) => s + a.lines.length, 0);
    const totalMissing = audits.reduce((s, a) => s + a.lines.filter(l => !l.found).length, 0);
    const avgAccuracy = completed.length > 0 ? Math.round(completed.reduce((s, a) => s + this.accuracy(a.id), 0) / completed.length) : 0;
    return {
      totalAudits: audits.length,
      inProgress: audits.filter(a => a.status === "in_progress").length,
      completed: completed.length,
      totalAssetsAudited: totalAssets,
      totalMissing,
      avgAccuracyPct: avgAccuracy,
    };
  }
}
