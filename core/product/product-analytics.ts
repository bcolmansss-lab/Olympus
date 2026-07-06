/**
 * ProductAnalytics — tracks feature usage, adoption rates, and retention cohorts.
 *
 * Features are identified by a string key (e.g. "sso", "api_v2", "bulk_export").
 * Usage events record which account used which feature at what timestamp.
 *
 * Events:
 *   - "product.feature_used": { featureKey, accountId, timestamp }
 *   - "product.milestone_reached": { featureKey, accountId, usageCount, milestone }
 *     when an account crosses a usage milestone (10, 100, 1000 uses)
 */
import type { EventBus } from "../events/event-bus.js";

export interface Feature {
  key: string;
  name: string;
  description?: string;
  /** Launch date ISO string. */
  launchedAt: string;
  /** Whether the feature is gated (feature flag). */
  gated: boolean;
  /** Account IDs that have access when gated. Empty set = all when not gated. */
  allowedAccounts: Set<string>;
}

export interface UsageEvent {
  featureKey: string;
  accountId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface FeatureAdoption {
  featureKey: string;
  featureName: string;
  totalUses: number;
  uniqueAccounts: number;
  /** Fraction of total tracked accounts using this feature. */
  adoptionRate: number;
  /** Last 30-day usage count. */
  recentUses: number;
}

export interface RetentionCohort {
  /** ISO week or month key, e.g. "2026-W01" */
  cohortKey: string;
  accountIds: string[];
  /** Fraction still active in subsequent period. */
  retentionRate: number;
}

const MILESTONES = [10, 100, 1000] as const;

export class ProductAnalytics {
  private readonly features: Map<string, Feature> = new Map();
  private readonly usageLog: UsageEvent[] = [];
  private totalTrackedAccounts = 0;

  constructor(private readonly bus: EventBus) {}

  registerFeature(
    input: Omit<Feature, "allowedAccounts"> & { allowedAccounts?: string[] },
  ): Feature {
    const feature: Feature = {
      key: input.key,
      name: input.name,
      description: input.description,
      launchedAt: input.launchedAt,
      gated: input.gated,
      allowedAccounts: new Set(input.allowedAccounts ?? []),
    };
    this.features.set(feature.key, feature);
    return feature;
  }

  setTotalAccounts(n: number): void {
    this.totalTrackedAccounts = n;
  }

  recordUsage(
    featureKey: string,
    accountId: string,
    metadata?: Record<string, unknown>,
  ): UsageEvent | undefined {
    const feature = this.features.get(featureKey);
    if (!feature) return undefined;
    if (feature.gated && !feature.allowedAccounts.has(accountId)) return undefined;

    const timestamp = new Date().toISOString();
    const event: UsageEvent = { featureKey, accountId, timestamp, metadata };
    this.usageLog.push(event);

    this.bus.publish("product.feature_used", { featureKey, accountId, timestamp });

    // Count per-account usage for this feature
    const accountCount = this.usageLog.filter(
      (e) => e.featureKey === featureKey && e.accountId === accountId,
    ).length;

    for (const milestone of MILESTONES) {
      if (accountCount === milestone) {
        this.bus.publish("product.milestone_reached", {
          featureKey,
          accountId,
          usageCount: accountCount,
          milestone,
        });
        break;
      }
    }

    return event;
  }

  grantAccess(featureKey: string, accountId: string): void {
    const feature = this.features.get(featureKey);
    if (feature) feature.allowedAccounts.add(accountId);
  }

  revokeAccess(featureKey: string, accountId: string): void {
    const feature = this.features.get(featureKey);
    if (feature) feature.allowedAccounts.delete(accountId);
  }

  getAdoption(featureKey: string): FeatureAdoption | undefined {
    const feature = this.features.get(featureKey);
    if (!feature) return undefined;

    const entries = this.usageLog.filter((e) => e.featureKey === featureKey);
    const totalUses = entries.length;
    const uniqueAccounts = new Set(entries.map((e) => e.accountId)).size;
    const adoptionRate =
      this.totalTrackedAccounts > 0 ? uniqueAccounts / this.totalTrackedAccounts : 0;

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentUses = entries.filter((e) => e.timestamp >= cutoff).length;

    return {
      featureKey,
      featureName: feature.name,
      totalUses,
      uniqueAccounts,
      adoptionRate,
      recentUses,
    };
  }

  listAdoption(): FeatureAdoption[] {
    return Array.from(this.features.keys())
      .map((key) => this.getAdoption(key)!)
      .sort((a, b) => b.adoptionRate - a.adoptionRate);
  }

  usageByAccount(accountId: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const e of this.usageLog) {
      if (e.accountId === accountId) {
        result[e.featureKey] = (result[e.featureKey] ?? 0) + 1;
      }
    }
    return result;
  }

  topFeatures(n = 5): FeatureAdoption[] {
    return Array.from(this.features.keys())
      .map((key) => this.getAdoption(key)!)
      .sort((a, b) => b.totalUses - a.totalUses)
      .slice(0, n);
  }

  getFeature(key: string): Feature | undefined {
    return this.features.get(key);
  }

  listFeatures(): Feature[] {
    return Array.from(this.features.values());
  }
}
