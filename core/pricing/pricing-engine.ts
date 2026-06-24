/**
 * PricingEngine — product catalog, pricing tiers, discounts, quote generation, and revenue optimization.
 *
 * Concepts:
 *   - Product: a sellable item with base price and billing model
 *   - PricingTier: volume/named tier with specific per-unit price
 *   - Discount: percentage or fixed discount rules (coupon codes, segment overrides)
 *   - Quote: a generated price proposal for a customer with line items
 *
 * Events:
 *   - "pricing.quote_generated": { quoteId, customerId, totalUsd, discountUsd }
 *   - "pricing.discount_applied": { quoteId, discountId, savingsUsd }
 *   - "pricing.price_updated": { productId, oldPriceUsd, newPriceUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BillingModel = "per_seat" | "usage_based" | "flat_fee" | "tiered" | "freemium";
export type DiscountType = "percentage" | "fixed_amount" | "free_months";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface PricingTier {
  minUnits: number;
  maxUnits?: number; // undefined = unlimited
  pricePerUnit: number;
  label?: string; // e.g. "Startup", "Growth", "Enterprise"
}

export interface Product {
  id: string;
  name: string;
  description: string;
  billingModel: BillingModel;
  basePriceUsd: number; // base monthly price
  tiers?: PricingTier[];
  annualDiscountPct: number; // e.g. 20 for 20% off annual
  currency: string; // "USD"
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Discount {
  id: string;
  code?: string;
  description: string;
  type: DiscountType;
  value: number; // percent for percentage, USD for fixed, months for free_months
  maxUsages?: number;
  usageCount: number;
  expiresAt?: string;
  applicableProductIds?: string[]; // undefined = applies to all
}

export interface QuoteLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceUsd: number;
  subtotalUsd: number;
  billingModel: BillingModel;
  annual: boolean;
}

export interface Quote {
  id: string;
  customerId: string;
  status: QuoteStatus;
  lineItems: QuoteLineItem[];
  discountIds: string[];
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  mrr: number; // monthly recurring revenue
  arr: number; // annual recurring revenue
  validUntil: string;
  createdAt: string;
  notes?: string;
}

export interface PricingSummary {
  totalProducts: number;
  totalQuotes: number;
  acceptedQuotes: number;
  winRate: number; // accepted / (accepted + rejected) * 100
  avgDealSizeUsd: number;
  totalPipelineUsd: number; // sum of draft+sent quote totals
  totalDiscountUsd: number; // total discounts given on accepted quotes
}

export class PricingEngine {
  private readonly products = new Map<string, Product>();
  private readonly discounts = new Map<string, Discount>();
  private readonly quotes = new Map<string, Quote>();

  constructor(private readonly bus: EventBus) {}

  addProduct(input: Omit<Product, "id" | "createdAt" | "updatedAt"> & { id?: string }): Product {
    const now = new Date().toISOString();
    const product: Product = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(product.id, product);
    return product;
  }

  updatePrice(productId: string, newPriceUsd: number): Product | undefined {
    const product = this.products.get(productId);
    if (!product) return undefined;
    const oldPriceUsd = product.basePriceUsd;
    const updated: Product = { ...product, basePriceUsd: newPriceUsd, updatedAt: new Date().toISOString() };
    this.products.set(productId, updated);
    this.bus.publish("pricing.price_updated", { productId, oldPriceUsd, newPriceUsd });
    return updated;
  }

  addDiscount(input: Omit<Discount, "id" | "usageCount"> & { id?: string }): Discount {
    const discount: Discount = {
      ...input,
      id: input.id ?? randomUUID(),
      usageCount: 0,
    };
    this.discounts.set(discount.id, discount);
    return discount;
  }

  generateQuote(input: {
    customerId: string;
    lineItems: Array<{ productId: string; quantity: number; annual?: boolean }>;
    discountCodes?: string[];
    notes?: string;
    validDays?: number;
    id?: string;
  }): Quote {
    const now = new Date();
    const validDays = input.validDays ?? 30;
    const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000).toISOString();

    // Build line items
    const lineItems: QuoteLineItem[] = [];
    for (const li of input.lineItems) {
      const product = this.products.get(li.productId);
      if (!product) continue;
      const annual = li.annual ?? false;
      const quantity = li.quantity;

      // Find unit price via tiers or base price
      let unitPriceUsd = product.basePriceUsd;
      if (product.tiers && product.tiers.length > 0) {
        const matchingTier = product.tiers.find((t) => {
          const aboveMin = quantity >= t.minUnits;
          const belowMax = t.maxUnits === undefined || quantity <= t.maxUnits;
          return aboveMin && belowMax;
        });
        if (matchingTier) {
          unitPriceUsd = matchingTier.pricePerUnit;
        }
      }

      // Apply annual discount (convert to monthly equivalent)
      if (annual && product.annualDiscountPct > 0) {
        unitPriceUsd = unitPriceUsd * (1 - product.annualDiscountPct / 100) / 12 * 12;
        // Actually: annual price = monthly * 12 * (1 - discount%)
        // Monthly equivalent = annual / 12 = monthly * (1 - discount%)
        unitPriceUsd = product.tiers && product.tiers.length > 0
          ? (() => {
              const matchingTier = product.tiers!.find((t) => {
                const aboveMin = quantity >= t.minUnits;
                const belowMax = t.maxUnits === undefined || quantity <= t.maxUnits;
                return aboveMin && belowMax;
              });
              const base = matchingTier ? matchingTier.pricePerUnit : product.basePriceUsd;
              return base * (1 - product.annualDiscountPct / 100);
            })()
          : product.basePriceUsd * (1 - product.annualDiscountPct / 100);
      }

      const subtotalUsd = unitPriceUsd * quantity;
      lineItems.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPriceUsd,
        subtotalUsd,
        billingModel: product.billingModel,
        annual,
      });
    }

    const subtotalUsd = lineItems.reduce((sum, li) => sum + li.subtotalUsd, 0);

    // Resolve discounts by code
    const appliedDiscountIds: string[] = [];
    let discountUsd = 0;

    if (input.discountCodes && input.discountCodes.length > 0) {
      // Build product ID set for applicability check
      const lineItemProductIds = new Set(lineItems.map((li) => li.productId));

      for (const code of input.discountCodes) {
        // Find discount by code
        const discount = [...this.discounts.values()].find((d) => d.code === code);
        if (!discount) continue;

        // Check expiry
        if (discount.expiresAt && new Date(discount.expiresAt) < now) continue;

        // Check max usages
        if (discount.maxUsages !== undefined && discount.usageCount >= discount.maxUsages) continue;

        // Check applicability — compute applicable subtotal
        let applicableSubtotal = subtotalUsd;
        if (discount.applicableProductIds && discount.applicableProductIds.length > 0) {
          applicableSubtotal = lineItems
            .filter((li) => discount.applicableProductIds!.includes(li.productId))
            .reduce((sum, li) => sum + li.subtotalUsd, 0);
          // Only apply if any applicable products are in the quote
          if (applicableSubtotal === 0) continue;
        }

        let savings = 0;
        if (discount.type === "percentage") {
          savings = applicableSubtotal * (discount.value / 100);
        } else if (discount.type === "fixed_amount") {
          savings = discount.value;
        } else if (discount.type === "free_months") {
          // monthly subtotal * free months
          savings = applicableSubtotal * discount.value;
        }

        discountUsd += savings;
        appliedDiscountIds.push(discount.id);
      }
    }

    const totalUsd = Math.max(0, subtotalUsd - discountUsd);

    // Compute MRR/ARR
    const allAnnual = lineItems.length > 0 && lineItems.every((li) => li.annual);
    const mrr = allAnnual ? totalUsd / 12 : totalUsd;
    const arr = mrr * 12;

    const quote: Quote = {
      id: input.id ?? randomUUID(),
      customerId: input.customerId,
      status: "draft",
      lineItems,
      discountIds: appliedDiscountIds,
      subtotalUsd,
      discountUsd,
      totalUsd,
      mrr,
      arr,
      validUntil,
      createdAt: now.toISOString(),
      notes: input.notes,
    };

    this.quotes.set(quote.id, quote);

    // Emit events
    this.bus.publish("pricing.quote_generated", {
      quoteId: quote.id,
      customerId: quote.customerId,
      totalUsd: quote.totalUsd,
      discountUsd: quote.discountUsd,
    });

    // Increment usages and emit discount events
    for (const discountId of appliedDiscountIds) {
      const discount = this.discounts.get(discountId);
      if (discount) {
        const savings =
          discount.type === "percentage"
            ? (discount.applicableProductIds
                ? lineItems.filter((li) => discount.applicableProductIds!.includes(li.productId)).reduce((s, li) => s + li.subtotalUsd, 0) * (discount.value / 100)
                : subtotalUsd * (discount.value / 100))
            : discount.type === "fixed_amount"
            ? discount.value
            : (discount.applicableProductIds
                ? lineItems.filter((li) => discount.applicableProductIds!.includes(li.productId)).reduce((s, li) => s + li.subtotalUsd, 0) * discount.value
                : subtotalUsd * discount.value);

        this.discounts.set(discountId, { ...discount, usageCount: discount.usageCount + 1 });
        this.bus.publish("pricing.discount_applied", {
          quoteId: quote.id,
          discountId,
          savingsUsd: savings,
        });
      }
    }

    return quote;
  }

  updateQuoteStatus(quoteId: string, status: QuoteStatus): Quote | undefined {
    const quote = this.quotes.get(quoteId);
    if (!quote) return undefined;
    const updated: Quote = { ...quote, status };
    this.quotes.set(quoteId, updated);
    return updated;
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  listProducts(): Product[] {
    return [...this.products.values()];
  }

  getQuote(id: string): Quote | undefined {
    return this.quotes.get(id);
  }

  listQuotes(status?: QuoteStatus): Quote[] {
    const all = [...this.quotes.values()];
    if (status === undefined) return all;
    return all.filter((q) => q.status === status);
  }

  summary(): PricingSummary {
    const allQuotes = [...this.quotes.values()];
    const accepted = allQuotes.filter((q) => q.status === "accepted");
    const rejected = allQuotes.filter((q) => q.status === "rejected");
    const winRate =
      accepted.length + rejected.length > 0
        ? (accepted.length / (accepted.length + rejected.length)) * 100
        : 0;

    const avgDealSizeUsd =
      accepted.length > 0
        ? accepted.reduce((sum, q) => sum + q.totalUsd, 0) / accepted.length
        : 0;

    const pipelineQuotes = allQuotes.filter((q) => q.status === "draft" || q.status === "sent");
    const totalPipelineUsd = pipelineQuotes.reduce((sum, q) => sum + q.totalUsd, 0);

    const totalDiscountUsd = accepted.reduce((sum, q) => sum + q.discountUsd, 0);

    return {
      totalProducts: this.products.size,
      totalQuotes: allQuotes.length,
      acceptedQuotes: accepted.length,
      winRate,
      avgDealSizeUsd,
      totalPipelineUsd,
      totalDiscountUsd,
    };
  }
}
