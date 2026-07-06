/**
 * FieldServiceManager — field technician work orders: creation, technician
 * assignment by skill, dispatch, completion with labor/parts, and first-time-fix
 * analytics.
 *
 * Events:
 *   - "fieldservice.created": { workOrderId, priority, skill }
 *   - "fieldservice.dispatched": { workOrderId, technicianId }
 *   - "fieldservice.completed": { workOrderId, firstTimeFix, durationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WorkOrderPriority = "low" | "medium" | "high" | "emergency";
export type WorkOrderStatus = "created" | "assigned" | "dispatched" | "completed" | "cancelled";

export interface Technician {
  id: string;
  name: string;
  skills: string[];
  available: boolean;
}

export interface WorkOrder {
  id: string;
  customerId: string;
  description: string;
  requiredSkill: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  technicianId?: string;
  laborHours?: number;
  partsCostUsd?: number;
  firstTimeFix?: boolean;
  createdAt: string;
  dispatchedAt?: string;
  completedAt?: string;
}

export interface FieldServiceSummary {
  totalWorkOrders: number;
  open: number;
  completed: number;
  firstTimeFixRatePct: number;
  totalLaborHours: number;
  totalPartsCostUsd: number;
}

export class FieldServiceManager {
  private technicians: Map<string, Technician> = new Map();
  private workOrders: Map<string, WorkOrder> = new Map();

  constructor(private readonly bus: EventBus) {}

  addTechnician(name: string, skills: string[]): Technician {
    const tech: Technician = { id: randomUUID(), name, skills, available: true };
    this.technicians.set(tech.id, tech);
    return tech;
  }

  createWorkOrder(input: { customerId: string; description: string; requiredSkill: string; priority: WorkOrderPriority }): WorkOrder {
    const wo: WorkOrder = { ...input, id: randomUUID(), status: "created", createdAt: new Date().toISOString() };
    this.workOrders.set(wo.id, wo);
    this.bus.publish("fieldservice.created", { workOrderId: wo.id, priority: wo.priority, skill: wo.requiredSkill });
    return wo;
  }

  /** Auto-assign an available technician with the required skill. */
  autoAssign(workOrderId: string): WorkOrder | undefined {
    const wo = this.workOrders.get(workOrderId);
    if (!wo || wo.status !== "created") return undefined;
    const tech = Array.from(this.technicians.values()).find(t => t.available && t.skills.includes(wo.requiredSkill));
    if (!tech) return undefined;
    wo.technicianId = tech.id;
    wo.status = "assigned";
    tech.available = false;
    return wo;
  }

  dispatch(workOrderId: string, asOf: string): WorkOrder | undefined {
    const wo = this.workOrders.get(workOrderId);
    if (!wo || wo.status !== "assigned") return undefined;
    wo.status = "dispatched";
    wo.dispatchedAt = asOf;
    this.bus.publish("fieldservice.dispatched", { workOrderId, technicianId: wo.technicianId });
    return wo;
  }

  complete(workOrderId: string, input: { laborHours: number; partsCostUsd: number; firstTimeFix: boolean; asOf: string }): WorkOrder | undefined {
    const wo = this.workOrders.get(workOrderId);
    if (!wo || wo.status !== "dispatched") return undefined;
    wo.status = "completed";
    wo.laborHours = input.laborHours;
    wo.partsCostUsd = input.partsCostUsd;
    wo.firstTimeFix = input.firstTimeFix;
    wo.completedAt = input.asOf;
    if (wo.technicianId) {
      const tech = this.technicians.get(wo.technicianId);
      if (tech) tech.available = true;
    }
    const durationMinutes = wo.dispatchedAt ? Math.round((new Date(input.asOf).getTime() - new Date(wo.dispatchedAt).getTime()) / 60000) : 0;
    this.bus.publish("fieldservice.completed", { workOrderId, firstTimeFix: input.firstTimeFix, durationMinutes });
    return wo;
  }

  cancel(workOrderId: string): WorkOrder | undefined {
    const wo = this.workOrders.get(workOrderId);
    if (!wo || wo.status === "completed") return undefined;
    wo.status = "cancelled";
    if (wo.technicianId) {
      const tech = this.technicians.get(wo.technicianId);
      if (tech) tech.available = true;
    }
    return wo;
  }

  getWorkOrder(id: string): WorkOrder | undefined { return this.workOrders.get(id); }
  listTechnicians(availableOnly = false): Technician[] {
    const all = Array.from(this.technicians.values());
    return availableOnly ? all.filter(t => t.available) : all;
  }
  listWorkOrders(status?: WorkOrderStatus, priority?: WorkOrderPriority): WorkOrder[] {
    let all = Array.from(this.workOrders.values());
    if (status) all = all.filter(w => w.status === status);
    if (priority) all = all.filter(w => w.priority === priority);
    return all;
  }

  summary(): FieldServiceSummary {
    const wos = Array.from(this.workOrders.values());
    const completed = wos.filter(w => w.status === "completed");
    const ftf = completed.filter(w => w.firstTimeFix).length;
    return {
      totalWorkOrders: wos.length,
      open: wos.filter(w => w.status !== "completed" && w.status !== "cancelled").length,
      completed: completed.length,
      firstTimeFixRatePct: completed.length > 0 ? Math.round((ftf / completed.length) * 100) : 0,
      totalLaborHours: Math.round(completed.reduce((s, w) => s + (w.laborHours ?? 0), 0) * 100) / 100,
      totalPartsCostUsd: Math.round(completed.reduce((s, w) => s + (w.partsCostUsd ?? 0), 0) * 100) / 100,
    };
  }
}
