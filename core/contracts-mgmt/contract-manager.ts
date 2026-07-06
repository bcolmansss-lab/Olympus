/**
 * ContractManager — full contract lifecycle: drafting, negotiation, execution, renewal, termination.
 *
 * Lifecycle: draft → review → negotiation → pending_signature → active → expired | terminated | renewed
 *
 * Events:
 *   - "contract.executed": { contractId, title, type, counterparty, valueUsd }
 *   - "contract.expiring_soon": { contractId, title, daysUntilExpiry }
 *   - "contract.terminated": { contractId, title, reason }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ContractType = "msa" | "sow" | "nda" | "saas_subscription" | "employment" | "partnership" | "lease" | "other";
export type ContractStatus = "draft" | "review" | "negotiation" | "pending_signature" | "active" | "expired" | "terminated" | "renewed";
export type ContractParty = "customer" | "vendor" | "partner" | "employee" | "landlord" | "other";

export interface Contract {
  id: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  counterpartyName: string;
  counterpartyType: ContractParty;
  ownerId: string; // internal owner (employee id)
  valueUsd?: number; // total contract value
  annualValueUsd?: number;
  startDate?: string;
  endDate?: string;
  autoRenews: boolean;
  renewalNoticeDays: number; // days before expiry to send renewal notice
  executedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractSummary {
  totalContracts: number;
  activeContracts: number;
  totalActiveValueUsd: number;
  expiringSoon: number; // within 90 days
  byType: Partial<Record<ContractType, number>>;
  byStatus: Partial<Record<ContractStatus, number>>;
}

export class ContractManager {
  private contracts: Map<string, Contract> = new Map();
  private bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  createContract(input: Omit<Contract, "id" | "createdAt" | "updatedAt"> & { id?: string }): Contract {
    const now = new Date().toISOString();
    const contract: Contract = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.contracts.set(contract.id, contract);
    return contract;
  }

  advanceStatus(id: string, status: ContractStatus): Contract | undefined {
    const contract = this.contracts.get(id);
    if (!contract) return undefined;
    const now = new Date().toISOString();
    contract.status = status;
    contract.updatedAt = now;
    if (status === "active") {
      contract.executedAt = now;
      this.bus.publish("contract.executed", {
        contractId: contract.id,
        title: contract.title,
        type: contract.type,
        counterparty: contract.counterpartyName,
        valueUsd: contract.valueUsd,
      });
    }
    if (status === "terminated") {
      contract.terminatedAt = now;
    }
    return contract;
  }

  terminate(id: string, reason: string): Contract | undefined {
    const contract = this.contracts.get(id);
    if (!contract) return undefined;
    const now = new Date().toISOString();
    contract.status = "terminated";
    contract.terminationReason = reason;
    contract.terminatedAt = now;
    contract.updatedAt = now;
    this.bus.publish("contract.terminated", {
      contractId: contract.id,
      title: contract.title,
      reason,
    });
    return contract;
  }

  checkExpirations(warningDays = 90): Contract[] {
    const now = Date.now();
    const expiring: Contract[] = [];
    for (const contract of this.contracts.values()) {
      if (contract.status !== "active" || !contract.endDate) continue;
      const msUntilExpiry = new Date(contract.endDate).getTime() - now;
      const daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= warningDays) {
        expiring.push(contract);
        this.bus.publish("contract.expiring_soon", {
          contractId: contract.id,
          title: contract.title,
          daysUntilExpiry,
        });
      }
    }
    return expiring;
  }

  renew(id: string, newEndDate: string, newValueUsd?: number): Contract | undefined {
    const contract = this.contracts.get(id);
    if (!contract) return undefined;
    const now = new Date().toISOString();
    contract.status = "renewed";
    contract.endDate = newEndDate;
    contract.updatedAt = now;
    if (newValueUsd !== undefined) {
      contract.valueUsd = newValueUsd;
      contract.annualValueUsd = newValueUsd;
    }
    return contract;
  }

  get(id: string): Contract | undefined {
    return this.contracts.get(id);
  }

  list(status?: ContractStatus, type?: ContractType): Contract[] {
    return Array.from(this.contracts.values()).filter((c) => {
      if (status !== undefined && c.status !== status) return false;
      if (type !== undefined && c.type !== type) return false;
      return true;
    });
  }

  summary(): ContractSummary {
    const all = Array.from(this.contracts.values());
    const active = all.filter((c) => c.status === "active");
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    const expiringSoon = active.filter((c) => {
      if (!c.endDate) return false;
      const msUntilExpiry = new Date(c.endDate).getTime() - now;
      return msUntilExpiry <= ninetyDaysMs;
    }).length;

    const totalActiveValueUsd = active.reduce((sum, c) => {
      return sum + (c.annualValueUsd ?? c.valueUsd ?? 0);
    }, 0);

    const byType: Partial<Record<ContractType, number>> = {};
    for (const c of all) {
      byType[c.type] = (byType[c.type] ?? 0) + 1;
    }

    const byStatus: Partial<Record<ContractStatus, number>> = {};
    for (const c of all) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }

    return {
      totalContracts: all.length,
      activeContracts: active.length,
      totalActiveValueUsd,
      expiringSoon,
      byType,
      byStatus,
    };
  }
}
