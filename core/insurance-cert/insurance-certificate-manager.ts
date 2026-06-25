/**
 * InsuranceCertificateManager — vendor/contractor Certificate of Insurance
 * (COI) tracking: coverage types, limits, expiry monitoring, and compliance
 * verification against required minimums.
 *
 * Events:
 *   - "insurancecert.recorded": { certId, vendorId, coverageType, limitUsd }
 *   - "insurancecert.expiring": { certId, vendorId, expiresAt, daysRemaining }
 *   - "insurancecert.noncompliant": { vendorId, coverageType, requiredUsd, actualUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CoverageType = "general_liability" | "workers_comp" | "auto" | "professional" | "umbrella" | "cyber";
export type CertStatus = "active" | "expired" | "revoked";

export interface InsuranceCert {
  id: string;
  vendorId: string;
  vendorName: string;
  carrier: string;
  coverageType: CoverageType;
  limitUsd: number;
  status: CertStatus;
  effectiveDate: string;
  expiresAt: string;
  createdAt: string;
}

export interface InsuranceCertSummary {
  totalCerts: number;
  active: number;
  expired: number;
  expiringIn30Days: number;
  byCoverageType: Partial<Record<CoverageType, number>>;
  vendorsCovered: number;
}

export class InsuranceCertificateManager {
  private certs: Map<string, InsuranceCert> = new Map();
  private requirements: Map<CoverageType, number> = new Map();

  constructor(private readonly bus: EventBus) {}

  setRequirement(coverageType: CoverageType, minLimitUsd: number): void {
    this.requirements.set(coverageType, minLimitUsd);
  }

  record(input: { vendorId: string; vendorName: string; carrier: string; coverageType: CoverageType; limitUsd: number; effectiveDate: string; expiresAt: string }): InsuranceCert {
    const cert: InsuranceCert = { ...input, id: randomUUID(), status: "active", createdAt: new Date().toISOString() };
    this.certs.set(cert.id, cert);
    this.bus.publish("insurancecert.recorded", { certId: cert.id, vendorId: cert.vendorId, coverageType: cert.coverageType, limitUsd: cert.limitUsd });
    const required = this.requirements.get(cert.coverageType);
    if (required !== undefined && cert.limitUsd < required) {
      this.bus.publish("insurancecert.noncompliant", { vendorId: cert.vendorId, coverageType: cert.coverageType, requiredUsd: required, actualUsd: cert.limitUsd });
    }
    return cert;
  }

  isCompliant(vendorId: string, coverageType: CoverageType, asOf: string): boolean {
    const required = this.requirements.get(coverageType);
    const now = new Date(asOf).getTime();
    const cert = Array.from(this.certs.values()).find(c =>
      c.vendorId === vendorId && c.coverageType === coverageType && c.status === "active" && new Date(c.expiresAt).getTime() >= now
    );
    if (!cert) return false;
    return required === undefined || cert.limitUsd >= required;
  }

  revoke(certId: string): InsuranceCert | undefined {
    const cert = this.certs.get(certId);
    if (!cert) return undefined;
    cert.status = "revoked";
    return cert;
  }

  /** Mark expired certs and emit expiring warnings within the window. */
  checkExpiry(asOf: string, warnDays = 30): InsuranceCert[] {
    const now = new Date(asOf).getTime();
    const expiringSoon: InsuranceCert[] = [];
    for (const cert of this.certs.values()) {
      if (cert.status !== "active") continue;
      const exp = new Date(cert.expiresAt).getTime();
      if (exp < now) {
        cert.status = "expired";
      } else {
        const daysRemaining = Math.floor((exp - now) / 86400000);
        if (daysRemaining <= warnDays) {
          this.bus.publish("insurancecert.expiring", { certId: cert.id, vendorId: cert.vendorId, expiresAt: cert.expiresAt, daysRemaining });
          expiringSoon.push(cert);
        }
      }
    }
    return expiringSoon;
  }

  getCert(id: string): InsuranceCert | undefined { return this.certs.get(id); }
  listCerts(vendorId?: string, status?: CertStatus): InsuranceCert[] {
    let all = Array.from(this.certs.values());
    if (vendorId) all = all.filter(c => c.vendorId === vendorId);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(asOf?: string): InsuranceCertSummary {
    const certs = Array.from(this.certs.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const byCoverageType: Partial<Record<CoverageType, number>> = {};
    for (const c of certs) { byCoverageType[c.coverageType] = (byCoverageType[c.coverageType] ?? 0) + 1; }
    const expiring = certs.filter(c => c.status === "active" && (new Date(c.expiresAt).getTime() - ref) / 86400000 <= 30 && new Date(c.expiresAt).getTime() >= ref).length;
    return {
      totalCerts: certs.length,
      active: certs.filter(c => c.status === "active").length,
      expired: certs.filter(c => c.status === "expired").length,
      expiringIn30Days: expiring,
      byCoverageType,
      vendorsCovered: new Set(certs.map(c => c.vendorId)).size,
    };
  }
}
