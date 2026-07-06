/**
 * ContractManager — contract lifecycle, obligation tracking, renewal alerts,
 * e-signature workflow, counterparty management, and spend analytics.
 *
 * Events:
 *   - "contracts.contract_signed": { contractId, title, counterparty, valueUsd }
 *   - "contracts.contract_expiring": { contractId, title, expiresAt, daysRemaining }
 *   - "contracts.obligation_due": { contractId, obligationId, description, dueDate }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ContractStatus = "draft" | "pending_signature" | "active" | "expired" | "terminated" | "renewed";
export type ContractType = "vendor" | "customer" | "employment" | "nda" | "partnership" | "lease" | "service";
export type ObligationStatus = "pending" | "completed" | "overdue" | "waived";

export interface ContractObligation {
  id: string;
  contractId: string;
  description: string;
  dueDate: string;
  status: ObligationStatus;
  owner: string;
}

export interface ManagedContract {
  id: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  counterparty: string;
  valueUsd: number;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  signedAt?: string;
  obligations: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ContractSummary {
  totalContracts: number;
  activeContracts: number;
  totalValueUsd: number;
  expiringIn30Days: number;
  overdueObligations: number;
  byType: Partial<Record<ContractType, number>>;
}

export class ContractManager {
  private contracts: Map<string, ManagedContract> = new Map();
  private obligations: Map<string, ContractObligation> = new Map();

  constructor(private readonly bus: EventBus) {}

  createContract(input: Omit<ManagedContract, "id" | "obligations" | "createdAt" | "updatedAt"> & { id?: string }): ManagedContract {
    const now = new Date().toISOString();
    const contract: ManagedContract = { ...input, id: input.id ?? randomUUID(), obligations: [], createdAt: now, updatedAt: now };
    this.contracts.set(contract.id, contract);
    return contract;
  }

  signContract(contractId: string): ManagedContract | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract) return undefined;
    contract.status = "active";
    contract.signedAt = new Date().toISOString();
    contract.updatedAt = contract.signedAt;
    this.bus.publish("contracts.contract_signed", { contractId, title: contract.title, counterparty: contract.counterparty, valueUsd: contract.valueUsd });
    const daysRemaining = Math.floor((new Date(contract.endDate).getTime() - Date.now()) / 86400000);
    if (daysRemaining <= 30) {
      this.bus.publish("contracts.contract_expiring", { contractId, title: contract.title, expiresAt: contract.endDate, daysRemaining });
    }
    return contract;
  }

  addObligation(input: Omit<ContractObligation, "id"> & { id?: string }): ContractObligation | undefined {
    const contract = this.contracts.get(input.contractId);
    if (!contract) return undefined;
    const obligation: ContractObligation = { ...input, id: input.id ?? randomUUID() };
    this.obligations.set(obligation.id, obligation);
    contract.obligations.push(obligation.id);
    contract.updatedAt = new Date().toISOString();
    const daysUntilDue = Math.floor((new Date(obligation.dueDate).getTime() - Date.now()) / 86400000);
    if (daysUntilDue <= 7 && obligation.status === "pending") {
      this.bus.publish("contracts.obligation_due", { contractId: input.contractId, obligationId: obligation.id, description: obligation.description, dueDate: obligation.dueDate });
    }
    return obligation;
  }

  completeObligation(obligationId: string): ContractObligation | undefined {
    const ob = this.obligations.get(obligationId);
    if (!ob) return undefined;
    ob.status = "completed";
    return ob;
  }

  getContract(id: string): ManagedContract | undefined { return this.contracts.get(id); }
  listContracts(status?: ContractStatus, type?: ContractType): ManagedContract[] {
    let all = Array.from(this.contracts.values());
    if (status) all = all.filter(c => c.status === status);
    if (type) all = all.filter(c => c.type === type);
    return all;
  }
  listObligations(contractId?: string): ContractObligation[] {
    const all = Array.from(this.obligations.values());
    return contractId ? all.filter(o => o.contractId === contractId) : all;
  }

  summary(): ContractSummary {
    const contracts = Array.from(this.contracts.values());
    const active = contracts.filter(c => c.status === "active");
    const now = Date.now();
    const expiring30 = active.filter(c => (new Date(c.endDate).getTime() - now) / 86400000 <= 30).length;
    const overdue = Array.from(this.obligations.values()).filter(o => o.status === "overdue").length;
    const byType: Partial<Record<ContractType, number>> = {};
    for (const c of contracts) { byType[c.type] = (byType[c.type] ?? 0) + 1; }
    return {
      totalContracts: contracts.length,
      activeContracts: active.length,
      totalValueUsd: active.reduce((s, c) => s + c.valueUsd, 0),
      expiringIn30Days: expiring30,
      overdueObligations: overdue,
      byType,
    };
  }
}
