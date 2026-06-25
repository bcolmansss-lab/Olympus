/**
 * TaxExemptionManager — customer tax-exemption certificate registry with
 * validation, expiry tracking, jurisdiction scope, and exemption verification
 * at point of sale.
 *
 * Events:
 *   - "taxexemption.registered": { certId, customerId, exemptionType, expiresAt }
 *   - "taxexemption.verified": { certId, valid }
 *   - "taxexemption.expired": { certId, customerId, expiredAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ExemptionType = "resale" | "nonprofit" | "government" | "agricultural" | "manufacturing" | "diplomatic";
export type ExemptionStatus = "active" | "expired" | "revoked";

export interface ExemptionCertificate {
  id: string;
  customerId: string;
  exemptionType: ExemptionType;
  certificateNumber: string;
  jurisdictions: string[]; // state/region codes
  status: ExemptionStatus;
  issuedAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface TaxExemptionSummary {
  totalCertificates: number;
  active: number;
  expired: number;
  revoked: number;
  byType: Partial<Record<ExemptionType, number>>;
  expiringIn30Days: number;
}

export class TaxExemptionManager {
  private certificates: Map<string, ExemptionCertificate> = new Map();

  constructor(private readonly bus: EventBus) {}

  register(input: { customerId: string; exemptionType: ExemptionType; certificateNumber: string; jurisdictions: string[]; issuedAt: string; expiresAt: string }): ExemptionCertificate {
    const cert: ExemptionCertificate = { ...input, id: randomUUID(), status: "active", createdAt: new Date().toISOString() };
    this.certificates.set(cert.id, cert);
    this.bus.publish("taxexemption.registered", { certId: cert.id, customerId: cert.customerId, exemptionType: cert.exemptionType, expiresAt: cert.expiresAt });
    return cert;
  }

  /** Verify a customer's exemption is valid for a jurisdiction as of a date. */
  verify(customerId: string, jurisdiction: string, asOf: string): { valid: boolean; certId?: string } {
    const now = new Date(asOf).getTime();
    const cert = Array.from(this.certificates.values()).find(c =>
      c.customerId === customerId &&
      c.status === "active" &&
      c.jurisdictions.includes(jurisdiction) &&
      new Date(c.expiresAt).getTime() >= now
    );
    const result = { valid: !!cert, certId: cert?.id };
    if (cert) this.bus.publish("taxexemption.verified", { certId: cert.id, valid: true });
    return result;
  }

  revoke(certId: string): ExemptionCertificate | undefined {
    const cert = this.certificates.get(certId);
    if (!cert) return undefined;
    cert.status = "revoked";
    return cert;
  }

  /** Mark active certificates past expiry as expired. */
  checkExpired(asOf: string): ExemptionCertificate[] {
    const cutoff = new Date(asOf).getTime();
    const expired = Array.from(this.certificates.values()).filter(c => c.status === "active" && new Date(c.expiresAt).getTime() < cutoff);
    for (const c of expired) {
      c.status = "expired";
      this.bus.publish("taxexemption.expired", { certId: c.id, customerId: c.customerId, expiredAt: c.expiresAt });
    }
    return expired;
  }

  getCertificate(id: string): ExemptionCertificate | undefined { return this.certificates.get(id); }
  listCertificates(customerId?: string, status?: ExemptionStatus): ExemptionCertificate[] {
    let all = Array.from(this.certificates.values());
    if (customerId) all = all.filter(c => c.customerId === customerId);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(asOf?: string): TaxExemptionSummary {
    const certs = Array.from(this.certificates.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const byType: Partial<Record<ExemptionType, number>> = {};
    for (const c of certs) { byType[c.exemptionType] = (byType[c.exemptionType] ?? 0) + 1; }
    const expiring = certs.filter(c => c.status === "active" && (new Date(c.expiresAt).getTime() - ref) / 86400000 <= 30 && new Date(c.expiresAt).getTime() >= ref).length;
    return {
      totalCertificates: certs.length,
      active: certs.filter(c => c.status === "active").length,
      expired: certs.filter(c => c.status === "expired").length,
      revoked: certs.filter(c => c.status === "revoked").length,
      byType,
      expiringIn30Days: expiring,
    };
  }
}
