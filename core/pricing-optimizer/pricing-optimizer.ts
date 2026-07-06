/**
 * PricingOptimizer — dynamic pricing recommendations, price elasticity modeling,
 * competitive price benchmarking, discount optimization, and revenue impact simulation.
 *
 * Events:
 *   - "pricing.recommendation_generated": { recId, sku, currentPrice, recommendedPrice, expectedRevenueDelta }
 *   - "pricing.discount_approved": { discountId, sku, discountPct, validUntil }
 *   - "pricing.elasticity_updated": { sku, elasticity, dataPoints }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PricingStrategy = "penetration" | "skimming" | "competitive" | "value_based" | "cost_plus" | "dynamic";
export type DiscountType = "percentage" | "flat" | "tiered" | "bundle";

export interface PriceElasticityModel {
  sku: string;
  elasticity: number; // price elasticity of demand (typically negative, e.g. -1.5)
  dataPoints: number;
  r2Score: number; // 0-1 model fit
  updatedAt: string;
}

export interface PricingRecommendation {
  id: string;
  sku: string;
  strategy: PricingStrategy;
  currentPriceUsd: number;
  recommendedPriceUsd: number;
  minPriceUsd: number;
  maxPriceUsd: number;
  expectedRevenueDeltaPct: number;
  competitorMinPrice?: number;
  competitorMaxPrice?: number;
  confidence: number; // 0-100
  rationale: string;
  generatedAt: string;
  applied: boolean;
}

export interface Discount {
  id: string;
  sku?: string; // null = applies to all
  code?: string;
  type: DiscountType;
  value: number; // pct for percentage, USD for flat
  minOrderUsd?: number;
  maxUsages?: number;
  usageCount: number;
  validFrom: string;
  validUntil: string;
  approved: boolean;
  approvedBy?: string;
  createdAt: string;
}

export interface PricingOptimizerSummary {
  totalRecommendations: number;
  applied: number;
  avgConfidence: number;
  activeDiscounts: number;
  totalRevenueDeltaIfApplied: number;
}

export class PricingOptimizer {
  private recommendations: Map<string, PricingRecommendation> = new Map();
  private discounts: Map<string, Discount> = new Map();
  private elasticityModels: Map<string, PriceElasticityModel> = new Map();

  constructor(private readonly bus: EventBus) {}

  generateRecommendation(input: Omit<PricingRecommendation, "id" | "generatedAt" | "applied"> & { id?: string }): PricingRecommendation {
    const rec: PricingRecommendation = { ...input, id: input.id ?? randomUUID(), generatedAt: new Date().toISOString(), applied: false };
    this.recommendations.set(rec.id, rec);
    this.bus.publish("pricing.recommendation_generated", { recId: rec.id, sku: rec.sku, currentPrice: rec.currentPriceUsd, recommendedPrice: rec.recommendedPriceUsd, expectedRevenueDelta: rec.expectedRevenueDeltaPct });
    return rec;
  }

  applyRecommendation(recId: string): PricingRecommendation | undefined {
    const rec = this.recommendations.get(recId);
    if (!rec) return undefined;
    rec.applied = true;
    return rec;
  }

  updateElasticity(sku: string, elasticity: number, dataPoints: number, r2Score: number): PriceElasticityModel {
    const model: PriceElasticityModel = { sku, elasticity, dataPoints, r2Score, updatedAt: new Date().toISOString() };
    this.elasticityModels.set(sku, model);
    this.bus.publish("pricing.elasticity_updated", { sku, elasticity, dataPoints });
    return model;
  }

  createDiscount(input: Omit<Discount, "id" | "usageCount" | "createdAt"> & { id?: string }): Discount {
    const discount: Discount = { ...input, id: input.id ?? randomUUID(), usageCount: 0, createdAt: new Date().toISOString() };
    this.discounts.set(discount.id, discount);
    if (discount.approved) {
      this.bus.publish("pricing.discount_approved", { discountId: discount.id, sku: discount.sku, discountPct: discount.type === "percentage" ? discount.value : null, validUntil: discount.validUntil });
    }
    return discount;
  }

  approveDiscount(discountId: string, approvedBy: string): Discount | undefined {
    const discount = this.discounts.get(discountId);
    if (!discount) return undefined;
    discount.approved = true;
    discount.approvedBy = approvedBy;
    this.bus.publish("pricing.discount_approved", { discountId, sku: discount.sku, discountPct: discount.type === "percentage" ? discount.value : null, validUntil: discount.validUntil });
    return discount;
  }

  useDiscount(discountId: string): boolean {
    const discount = this.discounts.get(discountId);
    if (!discount || !discount.approved) return false;
    if (discount.maxUsages !== undefined && discount.usageCount >= discount.maxUsages) return false;
    discount.usageCount++;
    return true;
  }

  simulatePriceChange(sku: string, newPriceUsd: number, currentRevenueUsd: number): { expectedRevenueDelta: number; confidence: number } {
    const model = this.elasticityModels.get(sku);
    if (!model) return { expectedRevenueDelta: 0, confidence: 0 };
    const recs = Array.from(this.recommendations.values()).filter((r) => r.sku === sku && !r.applied);
    const currentPrice = recs.length > 0 ? recs[0]!.currentPriceUsd : newPriceUsd;
    const pricePctChange = currentPrice > 0 ? (newPriceUsd - currentPrice) / currentPrice : 0;
    const demandChange = pricePctChange * model.elasticity;
    const revenueDelta = (pricePctChange + demandChange) * 100;
    return { expectedRevenueDelta: Math.round(revenueDelta * 100) / 100, confidence: Math.round(model.r2Score * 100) };
  }

  getRecommendation(id: string): PricingRecommendation | undefined { return this.recommendations.get(id); }
  listRecommendations(applied?: boolean): PricingRecommendation[] {
    const all = Array.from(this.recommendations.values());
    return applied !== undefined ? all.filter((r) => r.applied === applied) : all;
  }

  listDiscounts(activeOnly = false): Discount[] {
    const all = Array.from(this.discounts.values());
    if (!activeOnly) return all;
    const now = new Date().toISOString();
    return all.filter((d) => d.approved && d.validFrom <= now && d.validUntil >= now);
  }

  getElasticityModel(sku: string): PriceElasticityModel | undefined { return this.elasticityModels.get(sku); }

  summary(): PricingOptimizerSummary {
    const recs = Array.from(this.recommendations.values());
    const applied = recs.filter((r) => r.applied);
    const avgConfidence = recs.length > 0 ? Math.round(recs.reduce((s, r) => s + r.confidence, 0) / recs.length) : 0;
    const activeDiscounts = this.listDiscounts(true).length;
    const totalDelta = recs.filter((r) => !r.applied).reduce((s, r) => s + r.expectedRevenueDeltaPct, 0);
    return {
      totalRecommendations: recs.length,
      applied: applied.length,
      avgConfidence,
      activeDiscounts,
      totalRevenueDeltaIfApplied: Math.round(totalDelta * 100) / 100,
    };
  }
}
