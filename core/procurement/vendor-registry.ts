/**
 * VendorRegistry — tracks vendors, their contracts, spend, and renewal dates.
 *
 * Events:
 *   - "vendor.added": { vendorId, name, category }
 *   - "vendor.spend_recorded": { vendorId, amount, runningTotal }
 *   - "vendor.renewal_due": { vendorId, name, renewalDate, annualValue, daysUntil }
 */
import type { EventBus } from "../events/event-bus.js";
import { randomUUID } from "node:crypto";

export type VendorCategory = "infrastructure" | "software" | "services" | "marketing" | "facilities" | "other";
export type ContractStatus = "active" | "expiring" | "expired" | "cancelled";

export interface Vendor {
  id: string; name: string; category: VendorCategory;
  annualValueUsd: number; renewalDate: string; status: ContractStatus;
  totalSpendUsd: number; addedAt: string; tags?: string[];
}

export interface AddVendorInput {
  id?: string; name: string; category: VendorCategory;
  annualValueUsd: number; renewalDate: string; tags?: string[];
}

export interface ProcurementSummary {
  vendorCount: number; totalAnnualCommitUsd: number; totalSpendUsd: number;
  byCategory: Record<string, { count: number; annualUsd: number }>;
  upcomingRenewals: Vendor[];
}

export class VendorRegistry {
  private readonly vendors = new Map<string, Vendor>();
  private readonly renewalWindowDays: number;
  /** Track which vendors have already had renewal_due emitted to avoid duplicates. */
  private readonly renewalEmitted = new Set<string>();

  constructor(private readonly bus: EventBus, opts?: { renewalWindowDays?: number }) {
    this.renewalWindowDays = opts?.renewalWindowDays ?? 60;
  }

  add(input: AddVendorInput): Vendor {
    const vendor: Vendor = {
      id: input.id ?? randomUUID(),
      name: input.name,
      category: input.category,
      annualValueUsd: input.annualValueUsd,
      renewalDate: input.renewalDate,
      status: "active",
      totalSpendUsd: 0,
      addedAt: new Date().toISOString(),
      tags: input.tags,
    };
    this.vendors.set(vendor.id, vendor);
    this.evaluateRenewal(vendor.id);
    this.bus.publish("vendor.added", { vendorId: vendor.id, name: vendor.name, category: vendor.category });
    return vendor;
  }

  recordSpend(vendorId: string, amountUsd: number): Vendor | undefined {
    const vendor = this.vendors.get(vendorId);
    if (!vendor) return undefined;
    vendor.totalSpendUsd += amountUsd;
    this.bus.publish("vendor.spend_recorded", {
      vendorId: vendor.id,
      amount: amountUsd,
      runningTotal: vendor.totalSpendUsd,
    });
    return vendor;
  }

  evaluateRenewal(vendorId: string, asOf?: Date): number | undefined {
    const vendor = this.vendors.get(vendorId);
    if (!vendor) return undefined;
    const now = asOf ?? new Date();
    const renewal = new Date(vendor.renewalDate);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntil = Math.floor((renewal.getTime() - now.getTime()) / msPerDay);

    const wasExpiring = vendor.status === "expiring";

    if (daysUntil < 0) {
      vendor.status = "expired";
    } else if (daysUntil <= this.renewalWindowDays) {
      vendor.status = "expiring";
      if (!wasExpiring && !this.renewalEmitted.has(vendorId)) {
        this.renewalEmitted.add(vendorId);
        this.bus.publish("vendor.renewal_due", {
          vendorId: vendor.id,
          name: vendor.name,
          renewalDate: vendor.renewalDate,
          annualValue: vendor.annualValueUsd,
          daysUntil,
        });
      }
    } else {
      vendor.status = "active";
    }

    return daysUntil;
  }

  cancel(vendorId: string): Vendor | undefined {
    const vendor = this.vendors.get(vendorId);
    if (!vendor) return undefined;
    vendor.status = "cancelled";
    return vendor;
  }

  get(vendorId: string): Vendor | undefined {
    return this.vendors.get(vendorId);
  }

  list(category?: VendorCategory): Vendor[] {
    const all = Array.from(this.vendors.values());
    if (category === undefined) return all;
    return all.filter((v) => v.category === category);
  }

  upcomingRenewals(asOf?: Date): Vendor[] {
    for (const vendor of this.vendors.values()) {
      if (vendor.status !== "cancelled") {
        this.evaluateRenewal(vendor.id, asOf);
      }
    }
    return Array.from(this.vendors.values())
      .filter((v) => v.status === "expiring")
      .sort((a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime());
  }

  summary(): ProcurementSummary {
    const active = Array.from(this.vendors.values()).filter((v) => v.status !== "cancelled");
    const byCategory: Record<string, { count: number; annualUsd: number }> = {};
    let totalAnnualCommitUsd = 0;
    let totalSpendUsd = 0;
    for (const v of active) {
      const cat = byCategory[v.category] ?? { count: 0, annualUsd: 0 };
      cat.count++;
      cat.annualUsd += v.annualValueUsd;
      byCategory[v.category] = cat;
      totalAnnualCommitUsd += v.annualValueUsd;
      totalSpendUsd += v.totalSpendUsd;
    }
    return {
      vendorCount: active.length,
      totalAnnualCommitUsd,
      totalSpendUsd,
      byCategory,
      upcomingRenewals: this.upcomingRenewals(),
    };
  }
}
