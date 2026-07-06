/**
 * RentalManager — equipment rentals: rentable asset catalog with daily rates,
 * checkout with due dates, return with automatic late-fee calculation, and
 * utilization reporting.
 *
 * Events:
 *   - "rental.checked_out": { rentalId, assetId, dueAt }
 *   - "rental.returned": { rentalId, totalUsd, lateFeeUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RentalStatus = "active" | "returned" | "overdue_flagged";

export interface RentableAsset {
  id: string;
  name: string;
  dailyRateUsd: number;
  available: boolean;
}

export interface Rental {
  id: string;
  assetId: string;
  customerId: string;
  dailyRateUsd: number;
  checkedOutAt: string;
  dueAt: string;
  returnedAt?: string;
  status: RentalStatus;
  baseChargeUsd?: number;
  lateFeeUsd?: number;
  totalUsd?: number;
}

export interface RentalSummary {
  totalAssets: number;
  assetsOut: number;
  activeRentals: number;
  completedRentals: number;
  totalRevenueUsd: number;
  totalLateFeesUsd: number;
}

export class RentalManager {
  private assets: Map<string, RentableAsset> = new Map();
  private rentals: Map<string, Rental> = new Map();
  private lateFeeMultiplier: number;

  constructor(private readonly bus: EventBus, lateFeeMultiplier = 1.5) {
    this.lateFeeMultiplier = lateFeeMultiplier;
  }

  addAsset(name: string, dailyRateUsd: number): RentableAsset {
    const asset: RentableAsset = { id: randomUUID(), name, dailyRateUsd, available: true };
    this.assets.set(asset.id, asset);
    return asset;
  }

  checkout(assetId: string, customerId: string, checkedOutAt: string, dueAt: string): Rental | undefined {
    const asset = this.assets.get(assetId);
    if (!asset || !asset.available) return undefined;
    asset.available = false;
    const rental: Rental = { id: randomUUID(), assetId, customerId, dailyRateUsd: asset.dailyRateUsd, checkedOutAt, dueAt, status: "active" };
    this.rentals.set(rental.id, rental);
    this.bus.publish("rental.checked_out", { rentalId: rental.id, assetId, dueAt });
    return rental;
  }

  /** Return the asset; late days are billed at dailyRate × lateFeeMultiplier. */
  processReturn(rentalId: string, returnedAt: string): Rental | undefined {
    const rental = this.rentals.get(rentalId);
    if (!rental || rental.status === "returned") return undefined;
    const days = Math.max(1, Math.ceil((new Date(returnedAt).getTime() - new Date(rental.checkedOutAt).getTime()) / 86400000));
    const lateDays = Math.max(0, Math.ceil((new Date(returnedAt).getTime() - new Date(rental.dueAt).getTime()) / 86400000));
    const billableDays = days - lateDays;
    rental.baseChargeUsd = Math.round(billableDays * rental.dailyRateUsd * 100) / 100;
    rental.lateFeeUsd = Math.round(lateDays * rental.dailyRateUsd * this.lateFeeMultiplier * 100) / 100;
    rental.totalUsd = Math.round((rental.baseChargeUsd + rental.lateFeeUsd) * 100) / 100;
    rental.returnedAt = returnedAt;
    rental.status = "returned";
    const asset = this.assets.get(rental.assetId);
    if (asset) asset.available = true;
    this.bus.publish("rental.returned", { rentalId, totalUsd: rental.totalUsd, lateFeeUsd: rental.lateFeeUsd });
    return rental;
  }

  /** Flag active rentals past due as of the given time. */
  flagOverdue(asOf: string): Rental[] {
    const flagged: Rental[] = [];
    for (const r of this.rentals.values()) {
      if (r.status === "active" && new Date(asOf).getTime() > new Date(r.dueAt).getTime()) {
        r.status = "overdue_flagged";
        flagged.push(r);
      }
    }
    return flagged;
  }

  getRental(id: string): Rental | undefined { return this.rentals.get(id); }
  getAsset(id: string): RentableAsset | undefined { return this.assets.get(id); }
  listRentals(status?: RentalStatus): Rental[] {
    const all = Array.from(this.rentals.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): RentalSummary {
    const rentals = Array.from(this.rentals.values());
    const completed = rentals.filter(r => r.status === "returned");
    return {
      totalAssets: this.assets.size,
      assetsOut: Array.from(this.assets.values()).filter(a => !a.available).length,
      activeRentals: rentals.filter(r => r.status === "active" || r.status === "overdue_flagged").length,
      completedRentals: completed.length,
      totalRevenueUsd: Math.round(completed.reduce((s, r) => s + (r.totalUsd ?? 0), 0) * 100) / 100,
      totalLateFeesUsd: Math.round(completed.reduce((s, r) => s + (r.lateFeeUsd ?? 0), 0) * 100) / 100,
    };
  }
}
