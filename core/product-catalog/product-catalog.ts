/**
 * ProductCatalog — product and SKU management, variant tracking, media assets,
 * category hierarchy, availability rules, and pricing tier linkage.
 *
 * Events:
 *   - "catalog.product_published": { productId, sku, name, basePrice }
 *   - "catalog.product_discontinued": { productId, sku, name, replacedBySku }
 *   - "catalog.variant_added": { productId, variantId, attributes }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ProductStatus = "draft" | "active" | "discontinued" | "archived";
export type ProductType = "physical" | "digital" | "service" | "bundle" | "subscription";

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, string>; // e.g. { color: "blue", size: "M" }
  additionalPriceUsd: number; // delta on top of base price
  stockQuantity: number;
  active: boolean;
}

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  type: ProductType;
  status: ProductStatus;
  categoryId?: string;
  basePriceUsd: number;
  costUsd?: number;
  variants: string[]; // ProductVariant IDs
  tags: string[];
  imageUrls: string[];
  weight?: number;
  dimensions?: { l: number; w: number; h: number };
  replacedBySku?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  parentId?: string;
  description: string;
}

export interface CatalogSummary {
  totalProducts: number;
  activeProducts: number;
  discontinued: number;
  totalVariants: number;
  byType: Partial<Record<ProductType, number>>;
  avgBasePrice: number;
}

export class ProductCatalog {
  private products: Map<string, CatalogProduct> = new Map();
  private variants: Map<string, ProductVariant> = new Map();
  private categories: Map<string, ProductCategory> = new Map();

  constructor(private readonly bus: EventBus) {}

  createProduct(input: Omit<CatalogProduct, "id" | "variants" | "createdAt" | "updatedAt"> & { id?: string }): CatalogProduct {
    const now = new Date().toISOString();
    const product: CatalogProduct = { ...input, id: input.id ?? randomUUID(), variants: [], createdAt: now, updatedAt: now };
    this.products.set(product.id, product);
    return product;
  }

  publishProduct(productId: string): CatalogProduct | undefined {
    const product = this.products.get(productId);
    if (!product) return undefined;
    product.status = "active";
    product.publishedAt = new Date().toISOString();
    product.updatedAt = product.publishedAt;
    this.bus.publish("catalog.product_published", { productId, sku: product.sku, name: product.name, basePrice: product.basePriceUsd });
    return product;
  }

  discontinueProduct(productId: string, replacedBySku?: string): CatalogProduct | undefined {
    const product = this.products.get(productId);
    if (!product) return undefined;
    product.status = "discontinued";
    product.replacedBySku = replacedBySku;
    product.updatedAt = new Date().toISOString();
    this.bus.publish("catalog.product_discontinued", { productId, sku: product.sku, name: product.name, replacedBySku });
    return product;
  }

  addVariant(input: Omit<ProductVariant, "id"> & { id?: string }): ProductVariant | undefined {
    const product = this.products.get(input.productId);
    if (!product) return undefined;
    const variant: ProductVariant = { ...input, id: input.id ?? randomUUID() };
    this.variants.set(variant.id, variant);
    product.variants.push(variant.id);
    product.updatedAt = new Date().toISOString();
    this.bus.publish("catalog.variant_added", { productId: input.productId, variantId: variant.id, attributes: variant.attributes });
    return variant;
  }

  addCategory(input: Omit<ProductCategory, "id"> & { id?: string }): ProductCategory {
    const category: ProductCategory = { ...input, id: input.id ?? randomUUID() };
    this.categories.set(category.id, category);
    return category;
  }

  updatePrice(productId: string, basePriceUsd: number): CatalogProduct | undefined {
    const product = this.products.get(productId);
    if (!product) return undefined;
    product.basePriceUsd = basePriceUsd;
    product.updatedAt = new Date().toISOString();
    return product;
  }

  getProduct(id: string): CatalogProduct | undefined { return this.products.get(id); }
  getProductBySku(sku: string): CatalogProduct | undefined {
    return Array.from(this.products.values()).find((p) => p.sku === sku);
  }

  listProducts(status?: ProductStatus, type?: ProductType): CatalogProduct[] {
    let all = Array.from(this.products.values());
    if (status) all = all.filter((p) => p.status === status);
    if (type) all = all.filter((p) => p.type === type);
    return all;
  }

  listVariants(productId?: string): ProductVariant[] {
    const all = Array.from(this.variants.values());
    return productId ? all.filter((v) => v.productId === productId) : all;
  }

  listCategories(): ProductCategory[] { return Array.from(this.categories.values()); }

  summary(): CatalogSummary {
    const products = Array.from(this.products.values());
    const byType: Partial<Record<ProductType, number>> = {};
    for (const p of products) { byType[p.type] = (byType[p.type] ?? 0) + 1; }
    const active = products.filter((p) => p.status === "active");
    const avgPrice = active.length > 0 ? Math.round(active.reduce((s, p) => s + p.basePriceUsd, 0) / active.length) : 0;
    return {
      totalProducts: products.length,
      activeProducts: active.length,
      discontinued: products.filter((p) => p.status === "discontinued").length,
      totalVariants: this.variants.size,
      byType,
      avgBasePrice: avgPrice,
    };
  }
}
