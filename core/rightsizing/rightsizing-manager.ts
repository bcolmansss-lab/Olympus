/**
 * RightsizingManager — cloud resource rightsizing: resource utilization
 * tracking, over/under-provisioning detection, sizing recommendations with
 * estimated savings, and recommendation lifecycle.
 *
 * Events:
 *   - "rightsizing.recommendation": { resourceId, action, monthlySavingsUsd }
 *   - "rightsizing.applied": { recommendationId, resourceId }
 *   - "rightsizing.dismissed": { recommendationId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ResourceType = "compute" | "database" | "storage" | "cache";
export type RecAction = "downsize" | "upsize" | "terminate" | "keep";
export type RecStatus = "open" | "applied" | "dismissed";

export interface CloudResource {
  id: string;
  name: string;
  type: ResourceType;
  currentSize: string;
  monthlyCostUsd: number;
  avgUtilizationPct: number;
}

export interface Recommendation {
  id: string;
  resourceId: string;
  action: RecAction;
  recommendedSize?: string;
  monthlySavingsUsd: number;
  status: RecStatus;
  createdAt: string;
}

export interface RightsizingSummary {
  totalResources: number;
  openRecommendations: number;
  appliedRecommendations: number;
  potentialMonthlySavingsUsd: number;
  realizedMonthlySavingsUsd: number;
}

export class RightsizingManager {
  private resources: Map<string, CloudResource> = new Map();
  private recommendations: Map<string, Recommendation> = new Map();
  private underThreshold: number;
  private overThreshold: number;

  constructor(private readonly bus: EventBus, underThreshold = 20, overThreshold = 85) {
    this.underThreshold = underThreshold;
    this.overThreshold = overThreshold;
  }

  registerResource(input: { name: string; type: ResourceType; currentSize: string; monthlyCostUsd: number; avgUtilizationPct: number }): CloudResource {
    const resource: CloudResource = { ...input, id: randomUUID() };
    this.resources.set(resource.id, resource);
    return resource;
  }

  /** Analyze a resource and generate a recommendation if warranted. */
  analyze(resourceId: string): Recommendation | undefined {
    const r = this.resources.get(resourceId);
    if (!r) return undefined;
    let action: RecAction = "keep";
    let savings = 0;
    if (r.avgUtilizationPct < 5) {
      action = "terminate";
      savings = r.monthlyCostUsd;
    } else if (r.avgUtilizationPct < this.underThreshold) {
      action = "downsize";
      savings = Math.round(r.monthlyCostUsd * 0.4 * 100) / 100; // assume ~40% saving downsizing
    } else if (r.avgUtilizationPct > this.overThreshold) {
      action = "upsize";
      savings = 0;
    }
    if (action === "keep") return undefined;
    const rec: Recommendation = { id: randomUUID(), resourceId, action, recommendedSize: action === "downsize" ? `${r.currentSize}-small` : action === "upsize" ? `${r.currentSize}-large` : undefined, monthlySavingsUsd: savings, status: "open", createdAt: new Date().toISOString() };
    this.recommendations.set(rec.id, rec);
    this.bus.publish("rightsizing.recommendation", { resourceId, action, monthlySavingsUsd: savings });
    return rec;
  }

  apply(recommendationId: string): Recommendation | undefined {
    const rec = this.recommendations.get(recommendationId);
    if (!rec || rec.status !== "open") return undefined;
    rec.status = "applied";
    const resource = this.resources.get(rec.resourceId);
    if (resource) {
      resource.monthlyCostUsd = Math.round((resource.monthlyCostUsd - rec.monthlySavingsUsd) * 100) / 100;
      if (rec.recommendedSize) resource.currentSize = rec.recommendedSize;
    }
    this.bus.publish("rightsizing.applied", { recommendationId, resourceId: rec.resourceId });
    return rec;
  }

  dismiss(recommendationId: string): Recommendation | undefined {
    const rec = this.recommendations.get(recommendationId);
    if (!rec || rec.status !== "open") return undefined;
    rec.status = "dismissed";
    this.bus.publish("rightsizing.dismissed", { recommendationId });
    return rec;
  }

  getResource(id: string): CloudResource | undefined { return this.resources.get(id); }
  getRecommendation(id: string): Recommendation | undefined { return this.recommendations.get(id); }
  listResources(type?: ResourceType): CloudResource[] {
    const all = Array.from(this.resources.values());
    return type ? all.filter(r => r.type === type) : all;
  }
  listRecommendations(status?: RecStatus): Recommendation[] {
    const all = Array.from(this.recommendations.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): RightsizingSummary {
    const recs = Array.from(this.recommendations.values());
    return {
      totalResources: this.resources.size,
      openRecommendations: recs.filter(r => r.status === "open").length,
      appliedRecommendations: recs.filter(r => r.status === "applied").length,
      potentialMonthlySavingsUsd: Math.round(recs.filter(r => r.status === "open").reduce((s, r) => s + r.monthlySavingsUsd, 0) * 100) / 100,
      realizedMonthlySavingsUsd: Math.round(recs.filter(r => r.status === "applied").reduce((s, r) => s + r.monthlySavingsUsd, 0) * 100) / 100,
    };
  }
}
