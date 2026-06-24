/**
 * FleetManager — vehicle/asset fleet management, maintenance scheduling,
 * utilization tracking, driver assignments, and cost analytics.
 *
 * Events:
 *   - "fleet.vehicle_assigned": { vehicleId, driverId, assignedAt }
 *   - "fleet.maintenance_due": { vehicleId, plate, maintenanceType, dueDate }
 *   - "fleet.incident_reported": { vehicleId, incidentId, severity, description }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type VehicleStatus = "available" | "assigned" | "in_maintenance" | "retired";
export type VehicleType = "sedan" | "suv" | "truck" | "van" | "motorcycle" | "electric";
export type IncidentSeverity = "minor" | "moderate" | "major" | "total_loss";

export interface Vehicle {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  status: VehicleStatus;
  assignedDriverId?: string;
  mileage: number;
  lastMaintenanceDate?: string;
  nextMaintenanceMileage: number;
  purchasePriceUsd: number;
  createdAt: string;
}

export interface FleetIncident {
  id: string;
  vehicleId: string;
  driverId?: string;
  severity: IncidentSeverity;
  description: string;
  repairCostUsd: number;
  reportedAt: string;
  resolvedAt?: string;
}

export interface FleetSummary {
  totalVehicles: number;
  available: number;
  assigned: number;
  inMaintenance: number;
  totalMileage: number;
  openIncidents: number;
  fleetValueUsd: number;
}

export class FleetManager {
  private vehicles: Map<string, Vehicle> = new Map();
  private incidents: Map<string, FleetIncident> = new Map();

  constructor(private readonly bus: EventBus) {}

  addVehicle(input: Omit<Vehicle, "id" | "createdAt"> & { id?: string }): Vehicle {
    const vehicle: Vehicle = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  assignDriver(vehicleId: string, driverId: string): Vehicle | undefined {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return undefined;
    vehicle.assignedDriverId = driverId;
    vehicle.status = "assigned";
    this.bus.publish("fleet.vehicle_assigned", { vehicleId, driverId, assignedAt: new Date().toISOString() });
    return vehicle;
  }

  scheduleMaintenance(vehicleId: string, maintenanceType: string, dueDate: string): Vehicle | undefined {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return undefined;
    vehicle.status = "in_maintenance";
    this.bus.publish("fleet.maintenance_due", { vehicleId, plate: vehicle.plate, maintenanceType, dueDate });
    return vehicle;
  }

  reportIncident(input: Omit<FleetIncident, "id"> & { id?: string }): FleetIncident | undefined {
    const vehicle = this.vehicles.get(input.vehicleId);
    if (!vehicle) return undefined;
    const incident: FleetIncident = { ...input, id: input.id ?? randomUUID() };
    this.incidents.set(incident.id, incident);
    this.bus.publish("fleet.incident_reported", { vehicleId: input.vehicleId, incidentId: incident.id, severity: incident.severity, description: incident.description });
    return incident;
  }

  updateMileage(vehicleId: string, mileage: number): Vehicle | undefined {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return undefined;
    vehicle.mileage = mileage;
    if (mileage >= vehicle.nextMaintenanceMileage) {
      this.bus.publish("fleet.maintenance_due", { vehicleId, plate: vehicle.plate, maintenanceType: "scheduled", dueDate: new Date().toISOString() });
    }
    return vehicle;
  }

  getVehicle(id: string): Vehicle | undefined { return this.vehicles.get(id); }
  listVehicles(status?: VehicleStatus): Vehicle[] {
    const all = Array.from(this.vehicles.values());
    return status ? all.filter(v => v.status === status) : all;
  }
  listIncidents(vehicleId?: string): FleetIncident[] {
    const all = Array.from(this.incidents.values());
    return vehicleId ? all.filter(i => i.vehicleId === vehicleId) : all;
  }

  summary(): FleetSummary {
    const vehicles = Array.from(this.vehicles.values());
    const incidents = Array.from(this.incidents.values());
    return {
      totalVehicles: vehicles.length,
      available: vehicles.filter(v => v.status === "available").length,
      assigned: vehicles.filter(v => v.status === "assigned").length,
      inMaintenance: vehicles.filter(v => v.status === "in_maintenance").length,
      totalMileage: vehicles.reduce((s, v) => s + v.mileage, 0),
      openIncidents: incidents.filter(i => !i.resolvedAt).length,
      fleetValueUsd: vehicles.reduce((s, v) => s + v.purchasePriceUsd, 0),
    };
  }
}
