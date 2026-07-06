/**
 * WarehouseManager — warehouse operations, bin/zone management,
 * inbound/outbound shipments, pick-pack-ship workflow, and capacity analytics.
 *
 * Events:
 *   - "warehouse.shipment_received": { warehouseId, shipmentId, skuCount, totalUnits }
 *   - "warehouse.shipment_dispatched": { warehouseId, shipmentId, orderId, totalUnits }
 *   - "warehouse.capacity_alert": { warehouseId, name, usedPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WarehouseStatus = "operational" | "maintenance" | "closed";
export type ShipmentDirection = "inbound" | "outbound";
export type ShipmentStatus = "pending" | "in_transit" | "received" | "dispatched" | "cancelled";

export interface Warehouse {
  id: string;
  name: string;
  address: string;
  country: string;
  status: WarehouseStatus;
  totalSqft: number;
  usedSqft: number;
  maxCapacityUnits: number;
  currentUnits: number;
  createdAt: string;
}

export interface WHShipment {
  id: string;
  warehouseId: string;
  direction: ShipmentDirection;
  status: ShipmentStatus;
  orderId?: string;
  carrier: string;
  trackingNumber?: string;
  skuCount: number;
  totalUnits: number;
  estimatedArrival?: string;
  receivedAt?: string;
  dispatchedAt?: string;
  createdAt: string;
}

export interface WarehouseSummary {
  totalWarehouses: number;
  operational: number;
  totalCapacityUnits: number;
  totalCurrentUnits: number;
  utilizationPct: number;
  pendingInbound: number;
  pendingOutbound: number;
}

export class WarehouseManager {
  private warehouses: Map<string, Warehouse> = new Map();
  private shipments: Map<string, WHShipment> = new Map();

  constructor(private readonly bus: EventBus) {}

  addWarehouse(input: Omit<Warehouse, "id" | "createdAt"> & { id?: string }): Warehouse {
    const warehouse: Warehouse = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.warehouses.set(warehouse.id, warehouse);
    return warehouse;
  }

  receiveShipment(input: Omit<WHShipment, "id" | "createdAt" | "receivedAt" | "dispatchedAt"> & { id?: string }): WHShipment | undefined {
    const warehouse = this.warehouses.get(input.warehouseId);
    if (!warehouse) return undefined;
    const shipment: WHShipment = { ...input, id: input.id ?? randomUUID(), status: "received", receivedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    this.shipments.set(shipment.id, shipment);
    warehouse.currentUnits += shipment.totalUnits;
    this.bus.publish("warehouse.shipment_received", { warehouseId: input.warehouseId, shipmentId: shipment.id, skuCount: shipment.skuCount, totalUnits: shipment.totalUnits });
    const usedPct = warehouse.maxCapacityUnits > 0 ? (warehouse.currentUnits / warehouse.maxCapacityUnits) * 100 : 0;
    if (usedPct >= 90) {
      this.bus.publish("warehouse.capacity_alert", { warehouseId: input.warehouseId, name: warehouse.name, usedPct: Math.round(usedPct) });
    }
    return shipment;
  }

  dispatchShipment(shipmentId: string, orderId: string): WHShipment | undefined {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment) return undefined;
    const warehouse = this.warehouses.get(shipment.warehouseId);
    shipment.status = "dispatched";
    shipment.orderId = orderId;
    shipment.dispatchedAt = new Date().toISOString();
    if (warehouse) { warehouse.currentUnits = Math.max(0, warehouse.currentUnits - shipment.totalUnits); }
    this.bus.publish("warehouse.shipment_dispatched", { warehouseId: shipment.warehouseId, shipmentId, orderId, totalUnits: shipment.totalUnits });
    return shipment;
  }

  getWarehouse(id: string): Warehouse | undefined { return this.warehouses.get(id); }
  listWarehouses(status?: WarehouseStatus): Warehouse[] {
    const all = Array.from(this.warehouses.values());
    return status ? all.filter(w => w.status === status) : all;
  }
  listShipments(warehouseId?: string, direction?: ShipmentDirection): WHShipment[] {
    let all = Array.from(this.shipments.values());
    if (warehouseId) all = all.filter(s => s.warehouseId === warehouseId);
    if (direction) all = all.filter(s => s.direction === direction);
    return all;
  }

  summary(): WarehouseSummary {
    const warehouses = Array.from(this.warehouses.values());
    const operational = warehouses.filter(w => w.status === "operational");
    const totalCap = operational.reduce((s, w) => s + w.maxCapacityUnits, 0);
    const totalCur = operational.reduce((s, w) => s + w.currentUnits, 0);
    const shipments = Array.from(this.shipments.values());
    return {
      totalWarehouses: warehouses.length,
      operational: operational.length,
      totalCapacityUnits: totalCap,
      totalCurrentUnits: totalCur,
      utilizationPct: totalCap > 0 ? Math.round((totalCur / totalCap) * 100) : 0,
      pendingInbound: shipments.filter(s => s.direction === "inbound" && s.status === "pending").length,
      pendingOutbound: shipments.filter(s => s.direction === "outbound" && s.status === "pending").length,
    };
  }
}
