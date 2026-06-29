/**
 * ServiceContractManager — maintenance/service agreements: coverage terms,
 * SLA response targets, service call logging against entitlement, and renewal.
 *
 * Events:
 *   - "servicecontract.activated": { contractId, customerId, tier, expiresAt }
 *   - "servicecontract.call_logged": { contractId, callId, withinSla }
 *   - "servicecontract.renewed": { contractId, newExpiresAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ServiceTier = "basic" | "standard" | "premium" | "platinum";
export type ServiceContractStatus = "active" | "expired" | "cancelled";

export interface ServiceCall {
  id: string;
  loggedAt: string;
  respondedAt?: string;
  responseHours?: number;
  withinSla: boolean;
  description: string;
}

export interface ServiceContract {
  id: string;
  customerId: string;
  tier: ServiceTier;
  status: ServiceContractStatus;
  slaResponseHours: number;
  annualFeeUsd: number;
  includedCalls: number; // 0 = unlimited
  calls: ServiceCall[];
  startDate: string;
  expiresAt: string;
  createdAt: string;
}

export interface ServiceContractSummary {
  totalContracts: number;
  active: number;
  totalCalls: number;
  slaBreaches: number;
  slaCompliancePct: number;
  totalAnnualValueUsd: number;
  byTier: Partial<Record<ServiceTier, number>>;
}

export class ServiceContractManager {
  private contracts: Map<string, ServiceContract> = new Map();

  constructor(private readonly bus: EventBus) {}

  activate(input: { customerId: string; tier: ServiceTier; slaResponseHours: number; annualFeeUsd: number; includedCalls: number; startDate: string; expiresAt: string }): ServiceContract {
    const contract: ServiceContract = { ...input, id: randomUUID(), status: "active", calls: [], createdAt: new Date().toISOString() };
    this.contracts.set(contract.id, contract);
    this.bus.publish("servicecontract.activated", { contractId: contract.id, customerId: contract.customerId, tier: contract.tier, expiresAt: contract.expiresAt });
    return contract;
  }

  logCall(contractId: string, description: string, loggedAt: string, respondedAt?: string): ServiceCall | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status !== "active") return undefined;
    if (contract.includedCalls > 0 && contract.calls.length >= contract.includedCalls) return undefined;
    let responseHours: number | undefined;
    let withinSla = true;
    if (respondedAt) {
      responseHours = Math.round((new Date(respondedAt).getTime() - new Date(loggedAt).getTime()) / 3600000 * 10) / 10;
      withinSla = responseHours <= contract.slaResponseHours;
    }
    const call: ServiceCall = { id: randomUUID(), loggedAt, respondedAt, responseHours, withinSla, description };
    contract.calls.push(call);
    this.bus.publish("servicecontract.call_logged", { contractId, callId: call.id, withinSla });
    return call;
  }

  renew(contractId: string, newExpiresAt: string): ServiceContract | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status === "cancelled") return undefined;
    contract.expiresAt = newExpiresAt;
    contract.status = "active";
    this.bus.publish("servicecontract.renewed", { contractId, newExpiresAt });
    return contract;
  }

  cancel(contractId: string): ServiceContract | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract) return undefined;
    contract.status = "cancelled";
    return contract;
  }

  remainingCalls(contractId: string): number {
    const contract = this.contracts.get(contractId);
    if (!contract) return 0;
    if (contract.includedCalls === 0) return Infinity;
    return Math.max(0, contract.includedCalls - contract.calls.length);
  }

  getContract(id: string): ServiceContract | undefined { return this.contracts.get(id); }
  listContracts(status?: ServiceContractStatus, tier?: ServiceTier): ServiceContract[] {
    let all = Array.from(this.contracts.values());
    if (status) all = all.filter(c => c.status === status);
    if (tier) all = all.filter(c => c.tier === tier);
    return all;
  }

  summary(): ServiceContractSummary {
    const contracts = Array.from(this.contracts.values());
    const allCalls = contracts.flatMap(c => c.calls);
    const responded = allCalls.filter(c => c.respondedAt);
    const breaches = responded.filter(c => !c.withinSla).length;
    const byTier: Partial<Record<ServiceTier, number>> = {};
    for (const c of contracts) { byTier[c.tier] = (byTier[c.tier] ?? 0) + 1; }
    return {
      totalContracts: contracts.length,
      active: contracts.filter(c => c.status === "active").length,
      totalCalls: allCalls.length,
      slaBreaches: breaches,
      slaCompliancePct: responded.length > 0 ? Math.round(((responded.length - breaches) / responded.length) * 100) : 0,
      totalAnnualValueUsd: contracts.filter(c => c.status === "active").reduce((s, c) => s + c.annualFeeUsd, 0),
      byTier,
    };
  }
}
