/**
 * AssetManager — hardware, software, and infrastructure asset lifecycle tracking.
 *
 * Lifecycle: procurement → active → maintenance → decommissioned → disposed
 *
 * Events:
 *   - "asset.registered": { assetId, name, type, valueUsd }
 *   - "asset.status_changed": { assetId, from, to }
 *   - "asset.depreciated": { assetId, bookValueUsd, depreciationUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AssetType = "hardware" | "software_license" | "infrastructure" | "vehicle" | "furniture" | "ip" | "other";
export type AssetStatus = "procurement" | "active" | "maintenance" | "decommissioned" | "disposed";
export type DepreciationMethod = "straight_line" | "declining_balance" | "none";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  serialNumber?: string;
  purchaseDate: string;
  purchasePriceUsd: number;
  currentValueUsd: number;
  depreciationMethod: DepreciationMethod;
  usefulLifeYears: number;
  assignedTo?: string;
  location?: string;
  vendor?: string;
  warrantyExpiresAt?: string;
  maintenanceSchedule?: string;
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepreciationRecord {
  assetId: string;
  period: string; // YYYY-MM
  depreciationUsd: number;
  bookValueUsd: number;
  method: DepreciationMethod;
}

export interface AssetSummary {
  totalAssets: number;
  activeAssets: number;
  totalPurchasePriceUsd: number;
  totalCurrentValueUsd: number;
  totalDepreciationUsd: number;
  byType: Record<AssetType, number>;
  warrantyExpiringSoon: number; // within 90 days
}

export class AssetManager {
  private readonly assets: Map<string, Asset> = new Map();
  private readonly depreciationHistory: DepreciationRecord[] = [];

  constructor(private readonly bus: EventBus) {}

  registerAsset(
    input: Omit<Asset, "id" | "createdAt" | "updatedAt" | "currentValueUsd"> & { id?: string; currentValueUsd?: number }
  ): Asset {
    const now = new Date().toISOString();
    const asset: Asset = {
      ...input,
      id: input.id ?? randomUUID(),
      currentValueUsd: input.currentValueUsd ?? input.purchasePriceUsd,
      createdAt: now,
      updatedAt: now,
    };
    this.assets.set(asset.id, asset);
    this.bus.publish("asset.registered", {
      assetId: asset.id,
      name: asset.name,
      type: asset.type,
      valueUsd: asset.currentValueUsd,
    });
    return asset;
  }

  updateStatus(id: string, status: AssetStatus): Asset | undefined {
    const asset = this.assets.get(id);
    if (!asset) return undefined;
    const from = asset.status;
    asset.status = status;
    asset.updatedAt = new Date().toISOString();
    this.bus.publish("asset.status_changed", { assetId: id, from, to: status });
    return asset;
  }

  assign(id: string, assignedTo: string): Asset | undefined {
    const asset = this.assets.get(id);
    if (!asset) return undefined;
    asset.assignedTo = assignedTo;
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  applyDepreciation(id: string, period: string): DepreciationRecord | undefined {
    const asset = this.assets.get(id);
    if (!asset) return undefined;
    if (asset.depreciationMethod === "none") {
      const record: DepreciationRecord = {
        assetId: id,
        period,
        depreciationUsd: 0,
        bookValueUsd: asset.currentValueUsd,
        method: "none",
      };
      this.depreciationHistory.push(record);
      return record;
    }

    let monthly: number;
    if (asset.depreciationMethod === "straight_line") {
      const annual = asset.purchasePriceUsd / asset.usefulLifeYears;
      monthly = annual / 12;
    } else {
      // declining_balance
      const rate = 2 / asset.usefulLifeYears;
      monthly = asset.currentValueUsd * (rate / 12);
    }

    const newValue = Math.max(0, asset.currentValueUsd - monthly);
    const actualDepreciation = asset.currentValueUsd - newValue;
    asset.currentValueUsd = newValue;
    asset.updatedAt = new Date().toISOString();

    const record: DepreciationRecord = {
      assetId: id,
      period,
      depreciationUsd: actualDepreciation,
      bookValueUsd: newValue,
      method: asset.depreciationMethod,
    };
    this.depreciationHistory.push(record);

    this.bus.publish("asset.depreciated", {
      assetId: id,
      bookValueUsd: newValue,
      depreciationUsd: actualDepreciation,
    });

    return record;
  }

  get(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  list(status?: AssetStatus): Asset[] {
    const all = Array.from(this.assets.values());
    return status ? all.filter((a) => a.status === status) : all;
  }

  getDepreciationHistory(assetId: string): DepreciationRecord[] {
    return this.depreciationHistory.filter((r) => r.assetId === assetId);
  }

  summary(): AssetSummary {
    const all = Array.from(this.assets.values());
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    const byType: Record<AssetType, number> = {
      hardware: 0,
      software_license: 0,
      infrastructure: 0,
      vehicle: 0,
      furniture: 0,
      ip: 0,
      other: 0,
    };
    for (const a of all) {
      byType[a.type]++;
    }

    const totalPurchasePriceUsd = all.reduce((s, a) => s + a.purchasePriceUsd, 0);
    const totalCurrentValueUsd = all.reduce((s, a) => s + a.currentValueUsd, 0);

    return {
      totalAssets: all.length,
      activeAssets: all.filter((a) => a.status === "active").length,
      totalPurchasePriceUsd,
      totalCurrentValueUsd,
      totalDepreciationUsd: totalPurchasePriceUsd - totalCurrentValueUsd,
      byType,
      warrantyExpiringSoon: all.filter((a) => {
        if (!a.warrantyExpiresAt) return false;
        const exp = new Date(a.warrantyExpiresAt).getTime();
        return exp > now && exp - now <= ninetyDaysMs;
      }).length,
    };
  }
}
