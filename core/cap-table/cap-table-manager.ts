/**
 * CapTableManager — equity ownership ledger, share classes, issuance,
 * vesting schedules, and ownership/dilution analytics.
 *
 * Events:
 *   - "captable.shares_issued": { grantId, holderId, shareClass, shares }
 *   - "captable.shares_vested": { grantId, holderId, vestedShares }
 *   - "captable.transfer_recorded": { fromHolderId, toHolderId, shares }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ShareClassName = "common" | "preferred_a" | "preferred_b" | "preferred_c" | "options" | "safe";

export interface ShareClass {
  id: string;
  name: ShareClassName;
  authorizedShares: number;
  parValueUsd: number;
  liquidationPreference: number; // multiple, e.g. 1 = 1x
}

export interface EquityGrant {
  id: string;
  holderId: string;
  holderName: string;
  shareClassId: string;
  shareClassName: ShareClassName;
  shares: number;
  vestedShares: number;
  vestingMonths: number; // 0 = fully vested at issue
  cliffMonths: number;
  issuedAt: string;
  pricePerShareUsd: number;
}

export interface CapTableSummary {
  totalShareholders: number;
  totalSharesIssued: number;
  totalVestedShares: number;
  byShareClass: Partial<Record<ShareClassName, number>>;
  fullyDilutedValueUsd: number;
  ownership: { holderId: string; holderName: string; shares: number; pct: number }[];
}

export class CapTableManager {
  private shareClasses: Map<string, ShareClass> = new Map();
  private grants: Map<string, EquityGrant> = new Map();

  constructor(private readonly bus: EventBus) {}

  defineShareClass(input: Omit<ShareClass, "id"> & { id?: string }): ShareClass {
    const sc: ShareClass = { ...input, id: input.id ?? randomUUID() };
    this.shareClasses.set(sc.id, sc);
    return sc;
  }

  issueGrant(input: Omit<EquityGrant, "id" | "shareClassName" | "vestedShares" | "issuedAt"> & { id?: string; vestedShares?: number; issuedAt?: string }): EquityGrant | undefined {
    const sc = this.shareClasses.get(input.shareClassId);
    if (!sc) return undefined;
    const issued = Array.from(this.grants.values()).filter(g => g.shareClassId === sc.id).reduce((s, g) => s + g.shares, 0);
    if (issued + input.shares > sc.authorizedShares) return undefined;
    const grant: EquityGrant = {
      ...input,
      id: input.id ?? randomUUID(),
      shareClassName: sc.name,
      vestedShares: input.vestedShares ?? (input.vestingMonths === 0 ? input.shares : 0),
      issuedAt: input.issuedAt ?? new Date().toISOString(),
    };
    this.grants.set(grant.id, grant);
    this.bus.publish("captable.shares_issued", { grantId: grant.id, holderId: grant.holderId, shareClass: sc.name, shares: grant.shares });
    return grant;
  }

  vest(grantId: string, additionalShares: number): EquityGrant | undefined {
    const grant = this.grants.get(grantId);
    if (!grant) return undefined;
    grant.vestedShares = Math.min(grant.shares, grant.vestedShares + additionalShares);
    this.bus.publish("captable.shares_vested", { grantId, holderId: grant.holderId, vestedShares: grant.vestedShares });
    return grant;
  }

  transfer(grantId: string, toHolderId: string, toHolderName: string, shares: number): EquityGrant | undefined {
    const grant = this.grants.get(grantId);
    if (!grant || shares > grant.shares) return undefined;
    grant.shares -= shares;
    grant.vestedShares = Math.min(grant.vestedShares, grant.shares);
    const newGrant: EquityGrant = { ...grant, id: randomUUID(), holderId: toHolderId, holderName: toHolderName, shares, vestedShares: shares };
    this.grants.set(newGrant.id, newGrant);
    this.bus.publish("captable.transfer_recorded", { fromHolderId: grant.holderId, toHolderId, shares });
    return newGrant;
  }

  listShareClasses(): ShareClass[] { return Array.from(this.shareClasses.values()); }
  listGrants(holderId?: string): EquityGrant[] {
    const all = Array.from(this.grants.values());
    return holderId ? all.filter(g => g.holderId === holderId) : all;
  }

  summary(): CapTableSummary {
    const grants = Array.from(this.grants.values());
    const totalShares = grants.reduce((s, g) => s + g.shares, 0);
    const byShareClass: Partial<Record<ShareClassName, number>> = {};
    for (const g of grants) { byShareClass[g.shareClassName] = (byShareClass[g.shareClassName] ?? 0) + g.shares; }
    const byHolder = new Map<string, { holderId: string; holderName: string; shares: number }>();
    for (const g of grants) {
      const existing = byHolder.get(g.holderId);
      if (existing) existing.shares += g.shares;
      else byHolder.set(g.holderId, { holderId: g.holderId, holderName: g.holderName, shares: g.shares });
    }
    const ownership = Array.from(byHolder.values()).map(h => ({ ...h, pct: totalShares > 0 ? Math.round((h.shares / totalShares) * 10000) / 100 : 0 }));
    return {
      totalShareholders: byHolder.size,
      totalSharesIssued: totalShares,
      totalVestedShares: grants.reduce((s, g) => s + g.vestedShares, 0),
      byShareClass,
      fullyDilutedValueUsd: grants.reduce((s, g) => s + g.shares * g.pricePerShareUsd, 0),
      ownership,
    };
  }
}
