/**
 * EmailDeliverabilityManager — sender-reputation protection: send/bounce/
 * complaint event ingestion, automatic suppression list (hard bounces &
 * complaints), and per-domain deliverability health.
 *
 * Events:
 *   - "deliverability.suppressed": { email, reason }
 *   - "deliverability.domain_degraded": { domain, bounceRatePct }
 *   - "deliverability.send_blocked": { email }
 */
import type { EventBus } from "../events/event-bus.js";

export type EmailEventKind = "sent" | "delivered" | "soft_bounce" | "hard_bounce" | "complaint" | "unsubscribe";
export type SuppressionReason = "hard_bounce" | "complaint" | "unsubscribe" | "manual";

export interface DomainStats {
  domain: string;
  sent: number;
  delivered: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
}

export interface SuppressionEntry {
  email: string;
  reason: SuppressionReason;
  at: string;
}

export interface DeliverabilitySummary {
  totalSent: number;
  deliveredRatePct: number;
  bounceRatePct: number;
  complaintRatePct: number;
  suppressedCount: number;
  degradedDomains: number;
}

export class EmailDeliverabilityManager {
  private domains: Map<string, DomainStats> = new Map();
  private suppressions: Map<string, SuppressionEntry> = new Map();
  private degradedThresholdPct: number;
  private degraded: Set<string> = new Set();

  constructor(private readonly bus: EventBus, degradedThresholdPct = 5) {
    this.degradedThresholdPct = degradedThresholdPct;
  }

  private domainOf(email: string): string { return email.split("@")[1] ?? "unknown"; }

  private stats(domain: string): DomainStats {
    let s = this.domains.get(domain);
    if (!s) {
      s = { domain, sent: 0, delivered: 0, hardBounces: 0, softBounces: 0, complaints: 0 };
      this.domains.set(domain, s);
    }
    return s;
  }

  /** Returns false (blocked) when the address is suppressed. */
  canSend(email: string): boolean {
    if (this.suppressions.has(email.toLowerCase())) {
      this.bus.publish("deliverability.send_blocked", { email });
      return false;
    }
    return true;
  }

  record(email: string, kind: EmailEventKind, at: string): void {
    const stats = this.stats(this.domainOf(email));
    if (kind === "sent") stats.sent += 1;
    if (kind === "delivered") stats.delivered += 1;
    if (kind === "soft_bounce") stats.softBounces += 1;
    if (kind === "hard_bounce") {
      stats.hardBounces += 1;
      this.suppress(email, "hard_bounce", at);
    }
    if (kind === "complaint") {
      stats.complaints += 1;
      this.suppress(email, "complaint", at);
    }
    if (kind === "unsubscribe") this.suppress(email, "unsubscribe", at);
    const bounceRate = stats.sent > 0 ? ((stats.hardBounces + stats.softBounces) / stats.sent) * 100 : 0;
    if (bounceRate >= this.degradedThresholdPct && stats.sent >= 10 && !this.degraded.has(stats.domain)) {
      this.degraded.add(stats.domain);
      this.bus.publish("deliverability.domain_degraded", { domain: stats.domain, bounceRatePct: Math.round(bounceRate) });
    }
  }

  suppress(email: string, reason: SuppressionReason, at: string): SuppressionEntry {
    const key = email.toLowerCase();
    let entry = this.suppressions.get(key);
    if (!entry) {
      entry = { email: key, reason, at };
      this.suppressions.set(key, entry);
      this.bus.publish("deliverability.suppressed", { email: key, reason });
    }
    return entry;
  }

  unsuppress(email: string): boolean { return this.suppressions.delete(email.toLowerCase()); }
  isSuppressed(email: string): boolean { return this.suppressions.has(email.toLowerCase()); }
  listSuppressions(reason?: SuppressionReason): SuppressionEntry[] {
    const all = Array.from(this.suppressions.values());
    return reason ? all.filter(s => s.reason === reason) : all;
  }
  domainStats(domain: string): DomainStats | undefined { return this.domains.get(domain); }

  summary(): DeliverabilitySummary {
    const stats = Array.from(this.domains.values());
    const sent = stats.reduce((s, x) => s + x.sent, 0);
    const delivered = stats.reduce((s, x) => s + x.delivered, 0);
    const bounces = stats.reduce((s, x) => s + x.hardBounces + x.softBounces, 0);
    const complaints = stats.reduce((s, x) => s + x.complaints, 0);
    return {
      totalSent: sent,
      deliveredRatePct: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
      bounceRatePct: sent > 0 ? Math.round((bounces / sent) * 100) : 0,
      complaintRatePct: sent > 0 ? Math.round((complaints / sent) * 10000) / 100 : 0,
      suppressedCount: this.suppressions.size,
      degradedDomains: this.degraded.size,
    };
  }
}
