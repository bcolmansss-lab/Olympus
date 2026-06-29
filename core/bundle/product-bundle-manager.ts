/**
 * ProductBundleManager — product bundles/kits: component composition, bundle
 * pricing with discount vs sum-of-parts, availability from component stock,
 * and bundle sales tracking.
 *
 * Events:
 *   - "bundle.created": { bundleId, name, componentCount, priceUsd }
 *   - "bundle.sold": { bundleId, quantity, revenueUsd }
 *   - "bundle.out_of_stock": { bundleId, limitingSku }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BundleStatus = "active" | "discontinued";

export interface BundleComponent {
  sku: string;
  quantity: number;
  unitPriceUsd: number;
}

export interface ProductBundle {
  id: string;
  name: string;
  sku: string;
  components: BundleComponent[];
  bundlePriceUsd: number;
  status: BundleStatus;
  unitsSold: number;
  createdAt: string;
}

export interface BundleSummary {
  totalBundles: number;
  active: number;
  totalUnitsSold: number;
  totalRevenueUsd: number;
  avgDiscountPct: number;
}

export class ProductBundleManager {
  private bundles: Map<string, ProductBundle> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { name: string; sku: string; components: BundleComponent[]; bundlePriceUsd: number }): ProductBundle {
    const bundle: ProductBundle = { ...input, id: randomUUID(), status: "active", unitsSold: 0, createdAt: new Date().toISOString() };
    this.bundles.set(bundle.id, bundle);
    this.bus.publish("bundle.created", { bundleId: bundle.id, name: bundle.name, componentCount: bundle.components.length, priceUsd: bundle.bundlePriceUsd });
    return bundle;
  }

  sumOfParts(bundleId: string): number {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return 0;
    return Math.round(bundle.components.reduce((s, c) => s + c.quantity * c.unitPriceUsd, 0) * 100) / 100;
  }

  discountPct(bundleId: string): number {
    const sop = this.sumOfParts(bundleId);
    const bundle = this.bundles.get(bundleId);
    if (!bundle || sop === 0) return 0;
    return Math.round(((sop - bundle.bundlePriceUsd) / sop) * 100);
  }

  /** Determine how many bundles can be built from available per-SKU stock. */
  buildableUnits(bundleId: string, stock: Record<string, number>): number {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return 0;
    let min = Infinity;
    for (const c of bundle.components) {
      const available = stock[c.sku] ?? 0;
      min = Math.min(min, Math.floor(available / c.quantity));
    }
    return min === Infinity ? 0 : min;
  }

  sell(bundleId: string, quantity: number, stock: Record<string, number>): boolean {
    const bundle = this.bundles.get(bundleId);
    if (!bundle || bundle.status !== "active" || quantity <= 0) return false;
    const buildable = this.buildableUnits(bundleId, stock);
    if (quantity > buildable) {
      const limiting = bundle.components.reduce((worst, c) => {
        const units = Math.floor((stock[c.sku] ?? 0) / c.quantity);
        return units < worst.units ? { sku: c.sku, units } : worst;
      }, { sku: bundle.components[0]?.sku ?? "", units: Infinity });
      this.bus.publish("bundle.out_of_stock", { bundleId, limitingSku: limiting.sku });
      return false;
    }
    bundle.unitsSold += quantity;
    this.bus.publish("bundle.sold", { bundleId, quantity, revenueUsd: Math.round(bundle.bundlePriceUsd * quantity * 100) / 100 });
    return true;
  }

  discontinue(bundleId: string): ProductBundle | undefined {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return undefined;
    bundle.status = "discontinued";
    return bundle;
  }

  getBundle(id: string): ProductBundle | undefined { return this.bundles.get(id); }
  listBundles(status?: BundleStatus): ProductBundle[] {
    const all = Array.from(this.bundles.values());
    return status ? all.filter(b => b.status === status) : all;
  }

  summary(): BundleSummary {
    const bundles = Array.from(this.bundles.values());
    const discounts = bundles.map(b => this.discountPct(b.id));
    return {
      totalBundles: bundles.length,
      active: bundles.filter(b => b.status === "active").length,
      totalUnitsSold: bundles.reduce((s, b) => s + b.unitsSold, 0),
      totalRevenueUsd: Math.round(bundles.reduce((s, b) => s + b.unitsSold * b.bundlePriceUsd, 0) * 100) / 100,
      avgDiscountPct: discounts.length > 0 ? Math.round(discounts.reduce((s, d) => s + d, 0) / discounts.length) : 0,
    };
  }
}
