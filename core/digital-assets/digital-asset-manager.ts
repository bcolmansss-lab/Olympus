/**
 * DigitalAssetManager — domain names, SSL certificates, brand assets,
 * software licenses, API keys, and digital IP portfolio management.
 *
 * Events:
 *   - "digitalassets.domain_expiring": { assetId, name, expiresAt, daysRemaining }
 *   - "digitalassets.certificate_expiring": { assetId, domain, expiresAt, daysRemaining }
 *   - "digitalassets.license_expiring": { assetId, name, vendor, expiresAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DigitalAssetCategory = "domain" | "ssl_certificate" | "brand_asset" | "software_license" | "api_key" | "trademark" | "patent";
export type DigitalAssetStatus = "active" | "expiring" | "expired" | "revoked" | "pending_renewal";

export interface DigitalAsset {
  id: string;
  name: string;
  category: DigitalAssetCategory;
  status: DigitalAssetStatus;
  vendor?: string;
  domain?: string;
  annualCostUsd: number;
  purchasedAt: string;
  expiresAt: string;
  autoRenew: boolean;
  notes?: string;
  createdAt: string;
}

export interface DigitalAssetSummary {
  totalAssets: number;
  active: number;
  expiringIn30Days: number;
  expired: number;
  totalAnnualCostUsd: number;
  byCategory: Partial<Record<DigitalAssetCategory, number>>;
}

export class DigitalAssetManager {
  private assets: Map<string, DigitalAsset> = new Map();

  constructor(private readonly bus: EventBus) {}

  addAsset(input: Omit<DigitalAsset, "id" | "createdAt"> & { id?: string }): DigitalAsset {
    const asset: DigitalAsset = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.assets.set(asset.id, asset);
    const daysRemaining = Math.floor((new Date(asset.expiresAt).getTime() - Date.now()) / 86400000);
    if (daysRemaining <= 30 && asset.status === "active") {
      if (asset.category === "domain") {
        this.bus.publish("digitalassets.domain_expiring", { assetId: asset.id, name: asset.name, expiresAt: asset.expiresAt, daysRemaining });
      } else if (asset.category === "ssl_certificate") {
        this.bus.publish("digitalassets.certificate_expiring", { assetId: asset.id, domain: asset.domain ?? asset.name, expiresAt: asset.expiresAt, daysRemaining });
      } else if (asset.category === "software_license") {
        this.bus.publish("digitalassets.license_expiring", { assetId: asset.id, name: asset.name, vendor: asset.vendor, expiresAt: asset.expiresAt });
      }
    }
    return asset;
  }

  renewAsset(assetId: string, newExpiresAt: string): DigitalAsset | undefined {
    const asset = this.assets.get(assetId);
    if (!asset) return undefined;
    asset.expiresAt = newExpiresAt;
    asset.status = "active";
    return asset;
  }

  revokeAsset(assetId: string): DigitalAsset | undefined {
    const asset = this.assets.get(assetId);
    if (!asset) return undefined;
    asset.status = "revoked";
    return asset;
  }

  getAsset(id: string): DigitalAsset | undefined { return this.assets.get(id); }
  listAssets(category?: DigitalAssetCategory, status?: DigitalAssetStatus): DigitalAsset[] {
    let all = Array.from(this.assets.values());
    if (category) all = all.filter(a => a.category === category);
    if (status) all = all.filter(a => a.status === status);
    return all;
  }

  summary(): DigitalAssetSummary {
    const assets = Array.from(this.assets.values());
    const now = Date.now();
    const active = assets.filter(a => a.status === "active");
    const expiring30 = active.filter(a => (new Date(a.expiresAt).getTime() - now) / 86400000 <= 30).length;
    const byCategory: Partial<Record<DigitalAssetCategory, number>> = {};
    for (const a of assets) { byCategory[a.category] = (byCategory[a.category] ?? 0) + 1; }
    return {
      totalAssets: assets.length,
      active: active.length,
      expiringIn30Days: expiring30,
      expired: assets.filter(a => a.status === "expired").length,
      totalAnnualCostUsd: active.reduce((s, a) => s + a.annualCostUsd, 0),
      byCategory,
    };
  }
}
