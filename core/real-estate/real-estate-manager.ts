/**
 * RealEstateManager — property portfolio management, valuation tracking,
 * rental income analytics, occupancy metrics, and transaction records.
 *
 * Events:
 *   - "realestate.property_acquired": { propertyId, address, purchasePriceUsd }
 *   - "realestate.lease_signed": { propertyId, leaseId, tenant, monthlyRentUsd }
 *   - "realestate.valuation_updated": { propertyId, address, previousValueUsd, newValueUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PropertyType = "office" | "retail" | "industrial" | "residential" | "mixed_use" | "land";
export type PropertyStatus = "owned" | "leased_out" | "vacant" | "under_development" | "sold";
export type RELeaseStatus = "active" | "expired" | "terminated" | "pending";

export interface Property {
  id: string;
  address: string;
  city: string;
  country: string;
  type: PropertyType;
  status: PropertyStatus;
  sqft: number;
  purchasePriceUsd: number;
  currentValueUsd: number;
  annualTaxUsd: number;
  acquisitionDate: string;
  createdAt: string;
}

export interface RELease {
  id: string;
  propertyId: string;
  tenant: string;
  status: RELeaseStatus;
  monthlyRentUsd: number;
  startDate: string;
  endDate: string;
  depositUsd: number;
  createdAt: string;
}

export interface RealEstateSummary {
  totalProperties: number;
  occupiedProperties: number;
  vacantProperties: number;
  totalPortfolioValueUsd: number;
  totalPurchasePriceUsd: number;
  monthlyRentalIncomeUsd: number;
  unrealizedGainUsd: number;
}

export class RealEstateManager {
  private properties: Map<string, Property> = new Map();
  private leases: Map<string, RELease> = new Map();

  constructor(private readonly bus: EventBus) {}

  acquireProperty(input: Omit<Property, "id" | "createdAt"> & { id?: string }): Property {
    const property: Property = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.properties.set(property.id, property);
    this.bus.publish("realestate.property_acquired", { propertyId: property.id, address: property.address, purchasePriceUsd: property.purchasePriceUsd });
    return property;
  }

  signLease(input: Omit<RELease, "id" | "createdAt"> & { id?: string }): RELease | undefined {
    const property = this.properties.get(input.propertyId);
    if (!property) return undefined;
    const lease: RELease = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.leases.set(lease.id, lease);
    property.status = "leased_out";
    this.bus.publish("realestate.lease_signed", { propertyId: input.propertyId, leaseId: lease.id, tenant: lease.tenant, monthlyRentUsd: lease.monthlyRentUsd });
    return lease;
  }

  updateValuation(propertyId: string, newValueUsd: number): Property | undefined {
    const property = this.properties.get(propertyId);
    if (!property) return undefined;
    const previousValueUsd = property.currentValueUsd;
    property.currentValueUsd = newValueUsd;
    this.bus.publish("realestate.valuation_updated", { propertyId, address: property.address, previousValueUsd, newValueUsd });
    return property;
  }

  getProperty(id: string): Property | undefined { return this.properties.get(id); }
  listProperties(status?: PropertyStatus): Property[] {
    const all = Array.from(this.properties.values());
    return status ? all.filter(p => p.status === status) : all;
  }
  listLeases(propertyId?: string, status?: RELeaseStatus): RELease[] {
    let all = Array.from(this.leases.values());
    if (propertyId) all = all.filter(l => l.propertyId === propertyId);
    if (status) all = all.filter(l => l.status === status);
    return all;
  }

  summary(): RealEstateSummary {
    const props = Array.from(this.properties.values());
    const activeLeases = Array.from(this.leases.values()).filter(l => l.status === "active");
    const leasedPropertyIds = new Set(activeLeases.map(l => l.propertyId));
    return {
      totalProperties: props.length,
      occupiedProperties: leasedPropertyIds.size,
      vacantProperties: props.filter(p => p.status === "vacant").length,
      totalPortfolioValueUsd: props.reduce((s, p) => s + p.currentValueUsd, 0),
      totalPurchasePriceUsd: props.reduce((s, p) => s + p.purchasePriceUsd, 0),
      monthlyRentalIncomeUsd: activeLeases.reduce((s, l) => s + l.monthlyRentUsd, 0),
      unrealizedGainUsd: props.reduce((s, p) => s + (p.currentValueUsd - p.purchasePriceUsd), 0),
    };
  }
}
