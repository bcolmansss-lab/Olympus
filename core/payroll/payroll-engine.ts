/**
 * PayrollEngine — pay period processing, compensation tracking, tax withholding, and payroll reporting.
 *
 * Concepts:
 *   - PayPeriod: a pay cycle (bi-weekly, semi-monthly, monthly)
 *   - PayStub: individual employee payment record for a period
 *   - CompensationRecord: employee salary/equity history
 *
 * Events:
 *   - "payroll.period_processed": { periodId, employeeCount, totalGrossUsd, totalNetUsd }
 *   - "payroll.compensation_updated": { employeeId, oldSalaryUsd, newSalaryUsd, effectiveDate }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type PayType = "salary" | "hourly" | "contractor";
export type CompensationComponent = "base" | "bonus" | "commission" | "equity_vest" | "overtime" | "reimbursement";

export interface CompensationRecord {
  employeeId: string;
  annualSalaryUsd: number;
  payType: PayType;
  payFrequency: PayFrequency;
  equityShares?: number;
  equityVestingMonths?: number;
  effectiveDate: string;
  updatedAt: string;
}

export interface PayStub {
  id: string;
  periodId: string;
  employeeId: string;
  grossPayUsd: number;
  federalTaxUsd: number;
  stateTaxUsd: number;
  ficaUsd: number; // social security + medicare
  healthInsuranceUsd: number;
  retirement401kUsd: number;
  otherDeductionsUsd: number;
  netPayUsd: number;
  components: Array<{ type: CompensationComponent; amountUsd: number }>;
  processedAt: string;
}

export interface PayPeriod {
  id: string;
  startDate: string;
  endDate: string;
  frequency: PayFrequency;
  status: "pending" | "processing" | "completed" | "cancelled";
  totalGrossUsd: number;
  totalNetUsd: number;
  employeeCount: number;
  processedAt?: string;
  stubs: string[]; // PayStub IDs
}

export interface PayrollSummary {
  totalEmployees: number;
  monthlyPayrollUsd: number;
  annualPayrollUsd: number;
  avgSalaryUsd: number;
  lastPeriodTotalUsd: number;
  ytdPayrollUsd: number;
}

function periodsPerYear(frequency: PayFrequency): number {
  switch (frequency) {
    case "weekly": return 52;
    case "biweekly": return 26;
    case "semimonthly": return 24;
    case "monthly": return 12;
  }
}

export class PayrollEngine {
  private readonly compensation: Map<string, CompensationRecord> = new Map();
  private readonly periods: Map<string, PayPeriod> = new Map();
  private readonly stubs: Map<string, PayStub> = new Map();

  constructor(private readonly bus: EventBus) {}

  setCompensation(
    input: Omit<CompensationRecord, "updatedAt"> & { previousSalaryUsd?: number }
  ): CompensationRecord {
    const { previousSalaryUsd, ...rest } = input;
    const record: CompensationRecord = {
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    this.compensation.set(record.employeeId, record);

    if (previousSalaryUsd !== undefined) {
      this.bus.publish("payroll.compensation_updated", {
        employeeId: record.employeeId,
        oldSalaryUsd: previousSalaryUsd,
        newSalaryUsd: record.annualSalaryUsd,
        effectiveDate: record.effectiveDate,
      });
    }

    return record;
  }

  processPayPeriod(period: {
    startDate: string;
    endDate: string;
    frequency: PayFrequency;
    employeeIds: string[];
    id?: string;
  }): PayPeriod {
    const periodId = period.id ?? randomUUID();
    const stubIds: string[] = [];
    let totalGrossUsd = 0;
    let totalNetUsd = 0;
    const processedAt = new Date().toISOString();

    for (const employeeId of period.employeeIds) {
      const comp = this.compensation.get(employeeId);
      if (!comp) continue;

      const grossPayUsd = comp.annualSalaryUsd / periodsPerYear(period.frequency);
      const federalTaxUsd = grossPayUsd * 0.22;
      const stateTaxUsd = grossPayUsd * 0.05;
      const ficaUsd = grossPayUsd * 0.0765;
      const healthInsuranceUsd = 250;
      const retirement401kUsd = grossPayUsd * 0.04;
      const otherDeductionsUsd = 0;
      const netPayUsd =
        grossPayUsd -
        federalTaxUsd -
        stateTaxUsd -
        ficaUsd -
        healthInsuranceUsd -
        retirement401kUsd -
        otherDeductionsUsd;

      const stub: PayStub = {
        id: randomUUID(),
        periodId,
        employeeId,
        grossPayUsd,
        federalTaxUsd,
        stateTaxUsd,
        ficaUsd,
        healthInsuranceUsd,
        retirement401kUsd,
        otherDeductionsUsd,
        netPayUsd,
        components: [{ type: "base", amountUsd: grossPayUsd }],
        processedAt,
      };

      this.stubs.set(stub.id, stub);
      stubIds.push(stub.id);
      totalGrossUsd += grossPayUsd;
      totalNetUsd += netPayUsd;
    }

    const payPeriod: PayPeriod = {
      id: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      frequency: period.frequency,
      status: "completed",
      totalGrossUsd,
      totalNetUsd,
      employeeCount: stubIds.length,
      processedAt,
      stubs: stubIds,
    };

    this.periods.set(periodId, payPeriod);

    this.bus.publish("payroll.period_processed", {
      periodId,
      employeeCount: stubIds.length,
      totalGrossUsd,
      totalNetUsd,
    });

    return payPeriod;
  }

  getCompensation(employeeId: string): CompensationRecord | undefined {
    return this.compensation.get(employeeId);
  }

  listPeriods(): PayPeriod[] {
    return Array.from(this.periods.values());
  }

  getStub(id: string): PayStub | undefined {
    return this.stubs.get(id);
  }

  getStubsForPeriod(periodId: string): PayStub[] {
    return Array.from(this.stubs.values()).filter((s) => s.periodId === periodId);
  }

  getStubsForEmployee(employeeId: string): PayStub[] {
    return Array.from(this.stubs.values()).filter((s) => s.employeeId === employeeId);
  }

  summary(): PayrollSummary {
    const records = Array.from(this.compensation.values());
    const totalEmployees = records.length;
    const annualPayrollUsd = records.reduce((sum, r) => sum + r.annualSalaryUsd, 0);
    const monthlyPayrollUsd = annualPayrollUsd / 12;
    const avgSalaryUsd = totalEmployees > 0 ? annualPayrollUsd / totalEmployees : 0;

    const completedPeriods = Array.from(this.periods.values()).filter((p) => p.status === "completed");
    const ytdPayrollUsd = completedPeriods.reduce((sum, p) => sum + p.totalGrossUsd, 0);

    const lastPeriod =
      completedPeriods.length > 0
        ? completedPeriods.reduce((latest, p) =>
            (p.processedAt ?? "") > (latest.processedAt ?? "") ? p : latest
          )
        : undefined;
    const lastPeriodTotalUsd = lastPeriod?.totalGrossUsd ?? 0;

    return {
      totalEmployees,
      monthlyPayrollUsd,
      annualPayrollUsd,
      avgSalaryUsd,
      lastPeriodTotalUsd,
      ytdPayrollUsd,
    };
  }
}
