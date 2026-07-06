/**
 * IPPortfolioManager — intellectual-property portfolio: patent/trademark/
 * copyright asset registration, jurisdiction tracking, renewal deadlines with
 * upcoming-renewal alerts, renewal recording, and abandonment.
 *
 * Events:
 *   - "ip.registered": { assetId, kind, jurisdiction }
 *   - "ip.renewed": { assetId, nextRenewalAt }
 *   - "ip.abandoned": { assetId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type IPAssetKind = "patent" | "trademark" | "copyright" | "trade_secret";
export type IPAssetStatus = "active" | "abandoned" | "expired";

export interface IPAsset {
  id: string;
  kind: IPAssetKind;
  title: string;
  jurisdiction: string;
  registrationNumber: string;
  status: IPAssetStatus;
  registeredAt: string;
  nextRenewalAt?: string;
  renewalCount: number;
}

export interface IPPortfolioSummary {
  totalAssets: number;
  active: number;
  byKind: Record<IPAssetKind, number>;
  totalRenewals: number;
}

export class IPPortfolioManager {
  private assets: Map<string, IPAsset> = new Map();

  constructor(private readonly bus: EventBus) {}

  register(input: { kind: IPAssetKind; title: string; jurisdiction: string; registrationNumber: string; registeredAt: string; nextRenewalAt?: string }): IPAsset {
    const asset: IPAsset = { ...input, id: randomUUID(), status: "active", renewalCount: 0 };
    this.assets.set(asset.id, asset);
    this.bus.publish("ip.registered", { assetId: asset.id, kind: asset.kind, jurisdiction: asset.jurisdiction });
    return asset;
  }

  /** Active assets whose renewal falls within the next `days` of `asOf`. */
  upcomingRenewals(asOf: string, days: number): IPAsset[] {
    const now = new Date(asOf).getTime();
    const horizon = now + days * 86400000;
    return Array.from(this.assets.values()).filter(a => {
      if (a.status !== "active" || !a.nextRenewalAt) return false;
      const due = new Date(a.nextRenewalAt).getTime();
      return due >= now && due <= horizon;
    });
  }

  renew(assetId: string, nextRenewalAt: string): IPAsset | undefined {
    const asset = this.assets.get(assetId);
    if (!asset || asset.status !== "active") return undefined;
    asset.nextRenewalAt = nextRenewalAt;
    asset.renewalCount += 1;
    this.bus.publish("ip.renewed", { assetId, nextRenewalAt });
    return asset;
  }

  abandon(assetId: string): IPAsset | undefined {
    const asset = this.assets.get(assetId);
    if (!asset || asset.status !== "active") return undefined;
    asset.status = "abandoned";
    this.bus.publish("ip.abandoned", { assetId });
    return asset;
  }

  /** Mark active assets with a renewal date before asOf as expired. */
  expireOverdue(asOf: string): IPAsset[] {
    const now = new Date(asOf).getTime();
    const expired: IPAsset[] = [];
    for (const a of this.assets.values()) {
      if (a.status === "active" && a.nextRenewalAt && new Date(a.nextRenewalAt).getTime() < now) {
        a.status = "expired";
        expired.push(a);
      }
    }
    return expired;
  }

  getAsset(id: string): IPAsset | undefined { return this.assets.get(id); }
  listAssets(kind?: IPAssetKind, status?: IPAssetStatus): IPAsset[] {
    let all = Array.from(this.assets.values());
    if (kind) all = all.filter(a => a.kind === kind);
    if (status) all = all.filter(a => a.status === status);
    return all;
  }

  summary(): IPPortfolioSummary {
    const assets = Array.from(this.assets.values());
    const byKind: Record<IPAssetKind, number> = { patent: 0, trademark: 0, copyright: 0, trade_secret: 0 };
    for (const a of assets) byKind[a.kind] += 1;
    return {
      totalAssets: assets.length,
      active: assets.filter(a => a.status === "active").length,
      byKind,
      totalRenewals: assets.reduce((s, a) => s + a.renewalCount, 0),
    };
  }
}
