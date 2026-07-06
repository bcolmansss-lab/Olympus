/**
 * StoreLocatorManager — physical store directory: locations with coordinates,
 * hours and services, nearest-store search (haversine), and open-now checks.
 *
 * Events:
 *   - "storelocator.store_added": { storeId, name, city }
 *   - "storelocator.store_closed": { storeId }
 *   - "storelocator.hours_updated": { storeId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type StoreStatus = "open" | "temporarily_closed" | "permanently_closed";

export interface DayHours {
  day: number; // 0=Sunday..6=Saturday
  openMinute: number;  // minutes from midnight
  closeMinute: number;
}

export interface StoreLocation {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  status: StoreStatus;
  services: string[];
  hours: DayHours[];
  createdAt: string;
}

export interface StoreLocatorSummary {
  totalStores: number;
  open: number;
  permanentlyClosed: number;
  cities: number;
  byService: Record<string, number>;
}

export class StoreLocatorManager {
  private stores: Map<string, StoreLocation> = new Map();

  constructor(private readonly bus: EventBus) {}

  addStore(input: { name: string; city: string; lat: number; lng: number; services?: string[]; hours?: DayHours[] }): StoreLocation {
    const store: StoreLocation = { ...input, id: randomUUID(), status: "open", services: input.services ?? [], hours: input.hours ?? [], createdAt: new Date().toISOString() };
    this.stores.set(store.id, store);
    this.bus.publish("storelocator.store_added", { storeId: store.id, name: store.name, city: store.city });
    return store;
  }

  setStatus(storeId: string, status: StoreStatus): StoreLocation | undefined {
    const store = this.stores.get(storeId);
    if (!store) return undefined;
    store.status = status;
    if (status === "permanently_closed") this.bus.publish("storelocator.store_closed", { storeId });
    return store;
  }

  setHours(storeId: string, hours: DayHours[]): StoreLocation | undefined {
    const store = this.stores.get(storeId);
    if (!store) return undefined;
    store.hours = hours;
    this.bus.publish("storelocator.hours_updated", { storeId });
    return store;
  }

  private distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  }

  /** Nearest open stores to a point, optionally requiring a service. */
  nearest(lat: number, lng: number, limit = 5, service?: string): { store: StoreLocation; distanceKm: number }[] {
    return Array.from(this.stores.values())
      .filter(s => s.status === "open" && (!service || s.services.includes(service)))
      .map(store => ({ store, distanceKm: this.distanceKm(lat, lng, store.lat, store.lng) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  /** Is the store open at a given day/minute? */
  isOpenAt(storeId: string, day: number, minute: number): boolean {
    const store = this.stores.get(storeId);
    if (!store || store.status !== "open") return false;
    return store.hours.some(h => h.day === day && h.openMinute <= minute && minute < h.closeMinute);
  }

  getStore(id: string): StoreLocation | undefined { return this.stores.get(id); }
  listStores(city?: string, status?: StoreStatus): StoreLocation[] {
    let all = Array.from(this.stores.values());
    if (city) all = all.filter(s => s.city === city);
    if (status) all = all.filter(s => s.status === status);
    return all;
  }

  summary(): StoreLocatorSummary {
    const stores = Array.from(this.stores.values());
    const byService: Record<string, number> = {};
    for (const s of stores) for (const svc of s.services) byService[svc] = (byService[svc] ?? 0) + 1;
    return {
      totalStores: stores.length,
      open: stores.filter(s => s.status === "open").length,
      permanentlyClosed: stores.filter(s => s.status === "permanently_closed").length,
      cities: new Set(stores.map(s => s.city)).size,
      byService,
    };
  }
}
