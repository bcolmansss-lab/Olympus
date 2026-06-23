/**
 * PeopleRegistry — tracks employees, their roles, levels, compensation, and org structure.
 *
 * Events:
 *   - "hr.employee_joined": { employeeId, name, role, department, level }
 *   - "hr.employee_departed": { employeeId, name, reason }
 *   - "hr.headcount_alert": { department, headcount, openRoles } — when openRoles > threshold
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EmploymentStatus = "active" | "on-leave" | "departed";
export type EmployeeLevel = "ic1" | "ic2" | "ic3" | "ic4" | "ic5" | "m1" | "m2" | "m3" | "exec";

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  level: EmployeeLevel;
  /** Annual base compensation in USD. */
  baseCompUsd: number;
  status: EmploymentStatus;
  /** Manager's employee ID. undefined for top-level. */
  managerId?: string;
  startDate: string;
  endDate?: string;
  tags?: string[];
}

export interface OpenRole {
  id: string;
  title: string;
  department: string;
  level: EmployeeLevel;
  targetCompUsd: number;
  openedAt: string;
}

export interface DepartmentSummary {
  department: string;
  headcount: number;
  openRoles: number;
  totalCompUsd: number;
  averageCompUsd: number;
}

export interface OrgSummary {
  totalHeadcount: number;
  totalOpenRoles: number;
  totalAnnualCompUsd: number;
  byDepartment: DepartmentSummary[];
  averageCompUsd: number;
}

export interface PeopleRegistryOptions {
  /** Number of open roles per department before emitting hr.headcount_alert. Default: 3. */
  headcountAlertThreshold?: number;
}

export class PeopleRegistry {
  private readonly employees = new Map<string, Employee>();
  private readonly openRoles = new Map<string, OpenRole>();
  private readonly threshold: number;

  constructor(private readonly bus: EventBus, opts: PeopleRegistryOptions = {}) {
    this.threshold = opts.headcountAlertThreshold ?? 3;
  }

  hire(input: Omit<Employee, "id" | "status"> & { id?: string }): Employee {
    const employee: Employee = {
      ...input,
      id: input.id ?? randomUUID(),
      status: "active",
    };
    this.employees.set(employee.id, employee);

    this.bus.publish("hr.employee_joined", {
      employeeId: employee.id,
      name: employee.name,
      role: employee.role,
      department: employee.department,
      level: employee.level,
    });

    this.checkHeadcountAlert(employee.department);
    return employee;
  }

  depart(employeeId: string, reason: string): Employee | undefined {
    const employee = this.employees.get(employeeId);
    if (!employee) return undefined;

    const updated: Employee = {
      ...employee,
      status: "departed",
      endDate: new Date().toISOString().split("T")[0]!,
    };
    this.employees.set(employeeId, updated);

    this.bus.publish("hr.employee_departed", {
      employeeId: updated.id,
      name: updated.name,
      reason,
    });

    return updated;
  }

  addOpenRole(input: Omit<OpenRole, "id"> & { id?: string }): OpenRole {
    const role: OpenRole = {
      ...input,
      id: input.id ?? randomUUID(),
    };
    this.openRoles.set(role.id, role);
    this.checkHeadcountAlert(role.department);
    return role;
  }

  fillOpenRole(roleId: string, _employeeId: string): boolean {
    if (!this.openRoles.has(roleId)) return false;
    this.openRoles.delete(roleId);
    return true;
  }

  getEmployee(id: string): Employee | undefined {
    return this.employees.get(id);
  }

  listActive(): Employee[] {
    return Array.from(this.employees.values()).filter(
      (e) => e.status === "active" || e.status === "on-leave",
    );
  }

  listByDepartment(dept: string): Employee[] {
    return Array.from(this.employees.values()).filter((e) => e.department === dept);
  }

  listOpenRoles(dept?: string): OpenRole[] {
    const all = Array.from(this.openRoles.values());
    return dept ? all.filter((r) => r.department === dept) : all;
  }

  orgSummary(): OrgSummary {
    const active = this.listActive();
    const deptMap = new Map<string, { employees: Employee[]; openRoles: number }>();

    for (const emp of active) {
      if (!deptMap.has(emp.department)) {
        deptMap.set(emp.department, { employees: [], openRoles: 0 });
      }
      deptMap.get(emp.department)!.employees.push(emp);
    }

    for (const role of this.openRoles.values()) {
      if (!deptMap.has(role.department)) {
        deptMap.set(role.department, { employees: [], openRoles: 0 });
      }
      deptMap.get(role.department)!.openRoles++;
    }

    const byDepartment: DepartmentSummary[] = Array.from(deptMap.entries()).map(([dept, data]) => {
      const totalCompUsd = data.employees.reduce((s, e) => s + e.baseCompUsd, 0);
      const headcount = data.employees.length;
      return {
        department: dept,
        headcount,
        openRoles: data.openRoles,
        totalCompUsd,
        averageCompUsd: headcount > 0 ? totalCompUsd / headcount : 0,
      };
    });

    const totalHeadcount = active.length;
    const totalAnnualCompUsd = active.reduce((s, e) => s + e.baseCompUsd, 0);

    return {
      totalHeadcount,
      totalOpenRoles: this.openRoles.size,
      totalAnnualCompUsd,
      byDepartment,
      averageCompUsd: totalHeadcount > 0 ? totalAnnualCompUsd / totalHeadcount : 0,
    };
  }

  reportingChain(employeeId: string): Employee[] {
    const chain: Employee[] = [];
    const visited = new Set<string>();
    let current = this.employees.get(employeeId);

    while (current && !visited.has(current.id) && chain.length < 10) {
      chain.push(current);
      visited.add(current.id);
      current = current.managerId ? this.employees.get(current.managerId) : undefined;
    }

    return chain;
  }

  private checkHeadcountAlert(department: string): void {
    const openInDept = Array.from(this.openRoles.values()).filter(
      (r) => r.department === department,
    ).length;

    if (openInDept > this.threshold) {
      const headcount = this.listActive().filter((e) => e.department === department).length;
      this.bus.publish("hr.headcount_alert", {
        department,
        headcount,
        openRoles: openInDept,
      });
    }
  }
}
