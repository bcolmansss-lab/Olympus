/**
 * SabbaticalManager — tenure-based sabbatical leave: employee tenure
 * registration, eligibility checks against a minimum-tenure policy, leave
 * request and approval with overlap-free scheduling per team, and status
 * tracking through return.
 *
 * Events:
 *   - "sabbatical.requested": { requestId, employeeId, startAt }
 *   - "sabbatical.approved": { requestId }
 *   - "sabbatical.returned": { requestId, employeeId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SabbaticalStatus = "requested" | "approved" | "denied" | "on_leave" | "returned";

export interface SabbaticalEmployee {
  id: string;
  name: string;
  team: string;
  hiredAt: string;
}

export interface SabbaticalRequest {
  id: string;
  employeeId: string;
  team: string;
  startAt: string;
  endAt: string;
  status: SabbaticalStatus;
  denialReason?: string;
}

export interface SabbaticalSummary {
  totalRequests: number;
  approved: number;
  denied: number;
  currentlyOnLeave: number;
  returned: number;
}

export class SabbaticalManager {
  private employees: Map<string, SabbaticalEmployee> = new Map();
  private requests: Map<string, SabbaticalRequest> = new Map();
  private minTenureYears: number;

  constructor(private readonly bus: EventBus, minTenureYears = 5) {
    this.minTenureYears = minTenureYears;
  }

  registerEmployee(name: string, team: string, hiredAt: string): SabbaticalEmployee {
    const employee: SabbaticalEmployee = { id: randomUUID(), name, team, hiredAt };
    this.employees.set(employee.id, employee);
    return employee;
  }

  isEligible(employeeId: string, asOf: string): boolean {
    const e = this.employees.get(employeeId);
    if (!e) return false;
    const tenureYears = (new Date(asOf).getTime() - new Date(e.hiredAt).getTime()) / (365.25 * 86400000);
    return tenureYears >= this.minTenureYears;
  }

  request(employeeId: string, startAt: string, endAt: string): SabbaticalRequest | undefined {
    const e = this.employees.get(employeeId);
    if (!e || new Date(endAt).getTime() <= new Date(startAt).getTime()) return undefined;
    const req: SabbaticalRequest = { id: randomUUID(), employeeId, team: e.team, startAt, endAt, status: "requested" };
    this.requests.set(req.id, req);
    this.bus.publish("sabbatical.requested", { requestId: req.id, employeeId, startAt });
    return req;
  }

  /**
   * Approve if eligible and no approved/on-leave teammate overlaps the window;
   * otherwise the request is denied with a reason.
   */
  decide(requestId: string, asOf: string): SabbaticalRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== "requested") return undefined;
    if (!this.isEligible(req.employeeId, asOf)) {
      req.status = "denied";
      req.denialReason = "insufficient_tenure";
      return req;
    }
    const overlap = Array.from(this.requests.values()).some(
      other =>
        other.id !== req.id &&
        other.team === req.team &&
        (other.status === "approved" || other.status === "on_leave") &&
        new Date(other.startAt).getTime() < new Date(req.endAt).getTime() &&
        new Date(req.startAt).getTime() < new Date(other.endAt).getTime(),
    );
    if (overlap) {
      req.status = "denied";
      req.denialReason = "team_overlap";
      return req;
    }
    req.status = "approved";
    this.bus.publish("sabbatical.approved", { requestId });
    return req;
  }

  startLeave(requestId: string): SabbaticalRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== "approved") return undefined;
    req.status = "on_leave";
    return req;
  }

  markReturned(requestId: string): SabbaticalRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== "on_leave") return undefined;
    req.status = "returned";
    this.bus.publish("sabbatical.returned", { requestId, employeeId: req.employeeId });
    return req;
  }

  getRequest(id: string): SabbaticalRequest | undefined { return this.requests.get(id); }
  listRequests(status?: SabbaticalStatus): SabbaticalRequest[] {
    const all = Array.from(this.requests.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): SabbaticalSummary {
    const requests = Array.from(this.requests.values());
    return {
      totalRequests: requests.length,
      approved: requests.filter(r => r.status === "approved").length,
      denied: requests.filter(r => r.status === "denied").length,
      currentlyOnLeave: requests.filter(r => r.status === "on_leave").length,
      returned: requests.filter(r => r.status === "returned").length,
    };
  }
}
