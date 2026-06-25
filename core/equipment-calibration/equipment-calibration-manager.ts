/**
 * EquipmentCalibrationManager — regulated equipment registry, calibration
 * scheduling, calibration event logging, and due/overdue tracking.
 *
 * Events:
 *   - "equipcal.equipment_registered": { equipmentId, name, intervalDays }
 *   - "equipcal.calibration_recorded": { equipmentId, result, nextDueDate }
 *   - "equipcal.calibration_overdue": { equipmentId, name, dueDate }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CalibrationResult = "pass" | "pass_with_adjustment" | "fail";
export type EquipmentStatus = "in_service" | "out_of_service" | "retired";

export interface CalibrationEvent {
  id: string;
  equipmentId: string;
  result: CalibrationResult;
  technicianId: string;
  performedAt: string;
  nextDueDate: string;
  notes?: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  assetTag: string;
  location: string;
  status: EquipmentStatus;
  calibrationIntervalDays: number;
  lastCalibratedAt?: string;
  nextDueDate?: string;
  createdAt: string;
}

export interface CalibrationSummary {
  totalEquipment: number;
  inService: number;
  dueSoon: number; // within 30 days
  overdue: number;
  totalCalibrations: number;
  failureCount: number;
}

export class EquipmentCalibrationManager {
  private equipment: Map<string, EquipmentItem> = new Map();
  private events: CalibrationEvent[] = [];

  constructor(private readonly bus: EventBus) {}

  registerEquipment(input: { name: string; assetTag: string; location: string; calibrationIntervalDays: number }): EquipmentItem {
    const item: EquipmentItem = {
      id: randomUUID(),
      name: input.name,
      assetTag: input.assetTag,
      location: input.location,
      status: "in_service",
      calibrationIntervalDays: input.calibrationIntervalDays,
      createdAt: new Date().toISOString(),
    };
    this.equipment.set(item.id, item);
    this.bus.publish("equipcal.equipment_registered", { equipmentId: item.id, name: item.name, intervalDays: item.calibrationIntervalDays });
    return item;
  }

  recordCalibration(equipmentId: string, result: CalibrationResult, technicianId: string, performedAt: string, notes?: string): CalibrationEvent | undefined {
    const item = this.equipment.get(equipmentId);
    if (!item) return undefined;
    const next = new Date(performedAt);
    next.setUTCDate(next.getUTCDate() + item.calibrationIntervalDays);
    const nextDueDate = next.toISOString();
    const event: CalibrationEvent = { id: randomUUID(), equipmentId, result, technicianId, performedAt, nextDueDate, notes };
    this.events.push(event);
    item.lastCalibratedAt = performedAt;
    item.nextDueDate = nextDueDate;
    if (result === "fail") item.status = "out_of_service";
    this.bus.publish("equipcal.calibration_recorded", { equipmentId, result, nextDueDate });
    return event;
  }

  returnToService(equipmentId: string): EquipmentItem | undefined {
    const item = this.equipment.get(equipmentId);
    if (!item || item.status === "retired") return undefined;
    item.status = "in_service";
    return item;
  }

  retire(equipmentId: string): EquipmentItem | undefined {
    const item = this.equipment.get(equipmentId);
    if (!item) return undefined;
    item.status = "retired";
    return item;
  }

  /** Emit overdue events for in-service equipment past its next due date. */
  checkOverdue(asOf: string): EquipmentItem[] {
    const cutoff = new Date(asOf).getTime();
    const overdue = Array.from(this.equipment.values()).filter(e => e.status === "in_service" && e.nextDueDate && new Date(e.nextDueDate).getTime() < cutoff);
    for (const e of overdue) {
      this.bus.publish("equipcal.calibration_overdue", { equipmentId: e.id, name: e.name, dueDate: e.nextDueDate });
    }
    return overdue;
  }

  getEquipment(id: string): EquipmentItem | undefined { return this.equipment.get(id); }
  listEquipment(status?: EquipmentStatus): EquipmentItem[] {
    const all = Array.from(this.equipment.values());
    return status ? all.filter(e => e.status === status) : all;
  }
  listCalibrations(equipmentId?: string): CalibrationEvent[] {
    return equipmentId ? this.events.filter(e => e.equipmentId === equipmentId) : [...this.events];
  }

  summary(asOf?: string): CalibrationSummary {
    const items = Array.from(this.equipment.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    let dueSoon = 0, overdue = 0;
    for (const e of items) {
      if (e.status !== "in_service" || !e.nextDueDate) continue;
      const diffDays = (new Date(e.nextDueDate).getTime() - ref) / 86400000;
      if (diffDays < 0) overdue += 1;
      else if (diffDays <= 30) dueSoon += 1;
    }
    return {
      totalEquipment: items.length,
      inService: items.filter(e => e.status === "in_service").length,
      dueSoon,
      overdue,
      totalCalibrations: this.events.length,
      failureCount: this.events.filter(e => e.result === "fail").length,
    };
  }
}
