/**
 * ServiceLevelManager — service tier definitions, entitlement tracking,
 * usage-based escalation, support priority routing, and SLA breach analytics.
 *
 * Events:
 *   - "servicelevel.tier_upgraded": { customerId, fromTier, toTier, effectiveAt }
 *   - "servicelevel.entitlement_exceeded": { customerId, entitlement, usage, limit }
 *   - "servicelevel.renewal_due": { customerId, tierId, expiresAt, daysRemaining }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ServiceTierLevel = "free" | "starter" | "growth" | "professional" | "enterprise" | "custom";

export interface ServiceTierDefinition {
  id: string;
  name: ServiceTierLevel;
  description: string;
  monthlyPriceUsd: number;
  entitlements: Record<string, number>; // feature → limit (e.g. api_calls: 10000)
  supportPriority: number; // 1=low, 5=critical
  slaUptimePct: number;
}

export interface CustomerServiceLevel {
  id: string;
  customerId: string;
  tierId: string;
  tierName: ServiceTierLevel;
  startDate: string;
  endDate: string;
  usageThisPeriod: Record<string, number>;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceLevelSummary {
  totalCustomers: number;
  byTier: Partial<Record<ServiceTierLevel, number>>;
  expiringIn30Days: number;
  entitlementBreaches: number;
  avgTierPrice: number;
}

export class ServiceLevelManager {
  private tiers: Map<string, ServiceTierDefinition> = new Map();
  private customerLevels: Map<string, CustomerServiceLevel> = new Map(); // key: customerId

  constructor(private readonly bus: EventBus) {}

  defineTier(input: Omit<ServiceTierDefinition, "id"> & { id?: string }): ServiceTierDefinition {
    const tier: ServiceTierDefinition = { ...input, id: input.id ?? randomUUID() };
    this.tiers.set(tier.id, tier);
    return tier;
  }

  assignTier(customerId: string, tierId: string, startDate: string, endDate: string, autoRenew = true): CustomerServiceLevel | undefined {
    const tier = this.tiers.get(tierId);
    if (!tier) return undefined;
    const now = new Date().toISOString();
    const existing = this.customerLevels.get(customerId);
    const level: CustomerServiceLevel = { id: existing?.id ?? randomUUID(), customerId, tierId, tierName: tier.name, startDate, endDate, usageThisPeriod: {}, autoRenew, createdAt: existing?.createdAt ?? now, updatedAt: now };
    if (existing && existing.tierName !== tier.name) {
      this.bus.publish("servicelevel.tier_upgraded", { customerId, fromTier: existing.tierName, toTier: tier.name, effectiveAt: now });
    }
    this.customerLevels.set(customerId, level);
    const daysRemaining = Math.floor((new Date(endDate).getTime() - Date.now()) / 86400000);
    if (daysRemaining <= 30) {
      this.bus.publish("servicelevel.renewal_due", { customerId, tierId, expiresAt: endDate, daysRemaining });
    }
    return level;
  }

  recordUsage(customerId: string, entitlement: string, units: number): CustomerServiceLevel | undefined {
    const level = this.customerLevels.get(customerId);
    if (!level) return undefined;
    const tier = this.tiers.get(level.tierId);
    level.usageThisPeriod[entitlement] = (level.usageThisPeriod[entitlement] ?? 0) + units;
    level.updatedAt = new Date().toISOString();
    if (tier) {
      const limit = tier.entitlements[entitlement];
      if (limit !== undefined && level.usageThisPeriod[entitlement]! > limit) {
        this.bus.publish("servicelevel.entitlement_exceeded", { customerId, entitlement, usage: level.usageThisPeriod[entitlement], limit });
      }
    }
    return level;
  }

  getCustomerLevel(customerId: string): CustomerServiceLevel | undefined { return this.customerLevels.get(customerId); }
  listCustomerLevels(tierName?: ServiceTierLevel): CustomerServiceLevel[] {
    const all = Array.from(this.customerLevels.values());
    return tierName ? all.filter(l => l.tierName === tierName) : all;
  }
  listTiers(): ServiceTierDefinition[] { return Array.from(this.tiers.values()); }

  summary(): ServiceLevelSummary {
    const levels = Array.from(this.customerLevels.values());
    const byTier: Partial<Record<ServiceTierLevel, number>> = {};
    for (const l of levels) { byTier[l.tierName] = (byTier[l.tierName] ?? 0) + 1; }
    const now = Date.now();
    const expiring30 = levels.filter(l => (new Date(l.endDate).getTime() - now) / 86400000 <= 30).length;
    const tiers = Array.from(this.tiers.values());
    const avgPrice = tiers.length > 0 ? tiers.reduce((s, t) => s + t.monthlyPriceUsd, 0) / tiers.length : 0;
    return {
      totalCustomers: levels.length,
      byTier,
      expiringIn30Days: expiring30,
      entitlementBreaches: 0,
      avgTierPrice: Math.round(avgPrice),
    };
  }
}
