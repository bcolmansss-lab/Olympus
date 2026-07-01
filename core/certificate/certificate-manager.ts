/**
 * CertificateManager — TLS/SSL certificate lifecycle: issuance tracking,
 * expiry monitoring, auto-renewal eligibility, and revocation.
 *
 * Events:
 *   - "cert.issued": { certId, domain, expiresAt }
 *   - "cert.expiring": { certId, domain, daysRemaining }
 *   - "cert.renewed": { certId, domain, newExpiresAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CertStatus = "active" | "expired" | "revoked";
export type CertAuthority = "lets_encrypt" | "digicert" | "sectigo" | "internal" | "other";

export interface Certificate {
  id: string;
  domain: string;
  san: string[]; // subject alternative names
  authority: CertAuthority;
  status: CertStatus;
  autoRenew: boolean;
  issuedAt: string;
  expiresAt: string;
  renewalCount: number;
}

export interface CertificateSummary {
  totalCertificates: number;
  active: number;
  expiringIn30Days: number;
  expired: number;
  autoRenewEnabled: number;
  byAuthority: Partial<Record<CertAuthority, number>>;
}

export class CertificateManager {
  private certs: Map<string, Certificate> = new Map();

  constructor(private readonly bus: EventBus) {}

  issue(input: { domain: string; san?: string[]; authority: CertAuthority; issuedAt: string; expiresAt: string; autoRenew?: boolean }): Certificate {
    const cert: Certificate = {
      id: randomUUID(),
      domain: input.domain,
      san: input.san ?? [],
      authority: input.authority,
      status: "active",
      autoRenew: input.autoRenew ?? true,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      renewalCount: 0,
    };
    this.certs.set(cert.id, cert);
    this.bus.publish("cert.issued", { certId: cert.id, domain: cert.domain, expiresAt: cert.expiresAt });
    return cert;
  }

  renew(certId: string, newExpiresAt: string): Certificate | undefined {
    const cert = this.certs.get(certId);
    if (!cert || cert.status === "revoked") return undefined;
    cert.expiresAt = newExpiresAt;
    cert.status = "active";
    cert.renewalCount += 1;
    this.bus.publish("cert.renewed", { certId, domain: cert.domain, newExpiresAt });
    return cert;
  }

  revoke(certId: string): Certificate | undefined {
    const cert = this.certs.get(certId);
    if (!cert) return undefined;
    cert.status = "revoked";
    return cert;
  }

  /** Emit expiring warnings and mark expired certs. Returns renewal candidates. */
  checkExpiry(asOf: string, warnDays = 30): Certificate[] {
    const now = new Date(asOf).getTime();
    const renewCandidates: Certificate[] = [];
    for (const cert of this.certs.values()) {
      if (cert.status !== "active") continue;
      const exp = new Date(cert.expiresAt).getTime();
      if (exp < now) {
        cert.status = "expired";
      } else {
        const daysRemaining = Math.floor((exp - now) / 86400000);
        if (daysRemaining <= warnDays) {
          this.bus.publish("cert.expiring", { certId: cert.id, domain: cert.domain, daysRemaining });
          if (cert.autoRenew) renewCandidates.push(cert);
        }
      }
    }
    return renewCandidates;
  }

  coversDomain(domain: string, asOf: string): boolean {
    const now = new Date(asOf).getTime();
    return Array.from(this.certs.values()).some(c =>
      c.status === "active" && new Date(c.expiresAt).getTime() >= now &&
      (c.domain === domain || c.san.includes(domain))
    );
  }

  getCert(id: string): Certificate | undefined { return this.certs.get(id); }
  listCerts(status?: CertStatus): Certificate[] {
    const all = Array.from(this.certs.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(asOf?: string): CertificateSummary {
    const certs = Array.from(this.certs.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const byAuthority: Partial<Record<CertAuthority, number>> = {};
    for (const c of certs) { byAuthority[c.authority] = (byAuthority[c.authority] ?? 0) + 1; }
    return {
      totalCertificates: certs.length,
      active: certs.filter(c => c.status === "active").length,
      expiringIn30Days: certs.filter(c => c.status === "active" && (new Date(c.expiresAt).getTime() - ref) / 86400000 <= 30 && new Date(c.expiresAt).getTime() >= ref).length,
      expired: certs.filter(c => c.status === "expired").length,
      autoRenewEnabled: certs.filter(c => c.autoRenew).length,
      byAuthority,
    };
  }
}
