/**
 * ColdChainManager — temperature-controlled shipment monitoring: per-shipment
 * temperature range, sensor readings, excursion detection, and integrity
 * verdict on delivery.
 *
 * Events:
 *   - "coldchain.shipment_started": { shipmentId, product, minC, maxC }
 *   - "coldchain.excursion": { shipmentId, temperatureC, durationMinutes }
 *   - "coldchain.delivered": { shipmentId, integrity }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ShipmentState = "in_transit" | "delivered" | "rejected";
export type IntegrityVerdict = "intact" | "compromised";

export interface TempReading {
  temperatureC: number;
  at: string;
  withinRange: boolean;
}

export interface ColdChainShipment {
  id: string;
  product: string;
  minC: number;
  maxC: number;
  maxExcursionMinutes: number;
  state: ShipmentState;
  readings: TempReading[];
  excursionMinutes: number;
  integrity?: IntegrityVerdict;
  startedAt: string;
  deliveredAt?: string;
}

export interface ColdChainSummary {
  totalShipments: number;
  inTransit: number;
  delivered: number;
  compromised: number;
  totalExcursions: number;
  integrityRatePct: number;
}

export class ColdChainManager {
  private shipments: Map<string, ColdChainShipment> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(input: { product: string; minC: number; maxC: number; maxExcursionMinutes: number; startedAt: string }): ColdChainShipment {
    const shipment: ColdChainShipment = { ...input, id: randomUUID(), state: "in_transit", readings: [], excursionMinutes: 0 };
    this.shipments.set(shipment.id, shipment);
    this.bus.publish("coldchain.shipment_started", { shipmentId: shipment.id, product: shipment.product, minC: shipment.minC, maxC: shipment.maxC });
    return shipment;
  }

  /** Record a reading; intervalMinutes is the time since the previous reading. */
  recordReading(shipmentId: string, temperatureC: number, at: string, intervalMinutes = 0): TempReading | undefined {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.state !== "in_transit") return undefined;
    const withinRange = temperatureC >= shipment.minC && temperatureC <= shipment.maxC;
    const reading: TempReading = { temperatureC, at, withinRange };
    shipment.readings.push(reading);
    if (!withinRange) {
      shipment.excursionMinutes = Math.round((shipment.excursionMinutes + intervalMinutes) * 10) / 10;
      this.bus.publish("coldchain.excursion", { shipmentId, temperatureC, durationMinutes: shipment.excursionMinutes });
    }
    return reading;
  }

  deliver(shipmentId: string, asOf: string): ColdChainShipment | undefined {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.state !== "in_transit") return undefined;
    shipment.state = "delivered";
    shipment.deliveredAt = asOf;
    shipment.integrity = shipment.excursionMinutes > shipment.maxExcursionMinutes ? "compromised" : "intact";
    this.bus.publish("coldchain.delivered", { shipmentId, integrity: shipment.integrity });
    return shipment;
  }

  reject(shipmentId: string): ColdChainShipment | undefined {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.state === "delivered") return undefined;
    shipment.state = "rejected";
    return shipment;
  }

  getShipment(id: string): ColdChainShipment | undefined { return this.shipments.get(id); }
  listShipments(state?: ShipmentState): ColdChainShipment[] {
    const all = Array.from(this.shipments.values());
    return state ? all.filter(s => s.state === state) : all;
  }

  summary(): ColdChainSummary {
    const shipments = Array.from(this.shipments.values());
    const delivered = shipments.filter(s => s.state === "delivered");
    const compromised = delivered.filter(s => s.integrity === "compromised").length;
    return {
      totalShipments: shipments.length,
      inTransit: shipments.filter(s => s.state === "in_transit").length,
      delivered: delivered.length,
      compromised,
      totalExcursions: shipments.reduce((s, sh) => s + sh.readings.filter(r => !r.withinRange).length, 0),
      integrityRatePct: delivered.length > 0 ? Math.round(((delivered.length - compromised) / delivered.length) * 100) : 0,
    };
  }
}
