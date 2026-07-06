/**
 * InternationalExpansion — market entry tracking, localization management,
 * regulatory compliance by country, entity setup, and go-to-market readiness.
 *
 * Events:
 *   - "intl.market_entered": { marketId, country, entryDate, entityType }
 *   - "intl.compliance_gap": { marketId, country, requirement, dueDate }
 *   - "intl.entity_registered": { entityId, country, entityType, registrationId }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MarketStatus = "evaluating" | "planning" | "entering" | "active" | "paused" | "exited";
export type EntityType = "subsidiary" | "branch" | "representative_office" | "partnership" | "distributor";
export type ComplianceStatus = "not_started" | "in_progress" | "compliant" | "non_compliant" | "exempted";

export interface ComplianceRequirement {
  id: string;
  marketId: string;
  category: string;
  title: string;
  status: ComplianceStatus;
  dueDate?: string;
  notes?: string;
}

export interface LegalEntity {
  id: string;
  marketId: string;
  country: string;
  entityType: EntityType;
  registrationId: string;
  name: string;
  incorporatedAt?: string;
  status: "active" | "dormant" | "dissolved";
}

export interface Market {
  id: string;
  country: string;
  countryCode: string; // ISO 3166-1 alpha-2
  region: string;
  status: MarketStatus;
  currency: string;
  language: string;
  entryDate?: string;
  gmv?: number; // gross merchandise value in local currency
  entities: string[]; // LegalEntity IDs
  requirements: string[]; // ComplianceRequirement IDs
  gtmScore: number; // 0-100 readiness score
  notes: string;
  createdAt: string;
}

export interface ExpansionSummary {
  totalMarkets: number;
  activeMarkets: number;
  enteringMarkets: number;
  totalEntities: number;
  openComplianceGaps: number;
  avgGtmScore: number;
}

export class InternationalExpansion {
  private markets: Map<string, Market> = new Map();
  private entities: Map<string, LegalEntity> = new Map();
  private requirements: Map<string, ComplianceRequirement> = new Map();

  constructor(private readonly bus: EventBus) {}

  addMarket(input: Omit<Market, "id" | "entities" | "requirements" | "createdAt"> & { id?: string }): Market {
    const market: Market = { ...input, id: input.id ?? randomUUID(), entities: [], requirements: [], createdAt: new Date().toISOString() };
    this.markets.set(market.id, market);
    if (market.status === "active" && market.entryDate) {
      this.bus.publish("intl.market_entered", { marketId: market.id, country: market.country, entryDate: market.entryDate, entityType: "subsidiary" });
    }
    return market;
  }

  enterMarket(marketId: string, entryDate: string): Market | undefined {
    const market = this.markets.get(marketId);
    if (!market) return undefined;
    market.status = "active";
    market.entryDate = entryDate;
    this.bus.publish("intl.market_entered", { marketId, country: market.country, entryDate, entityType: "subsidiary" });
    return market;
  }

  registerEntity(input: Omit<LegalEntity, "id"> & { id?: string }): LegalEntity | undefined {
    const market = this.markets.get(input.marketId);
    if (!market) return undefined;
    const entity: LegalEntity = { ...input, id: input.id ?? randomUUID() };
    this.entities.set(entity.id, entity);
    market.entities.push(entity.id);
    this.bus.publish("intl.entity_registered", { entityId: entity.id, country: entity.country, entityType: entity.entityType, registrationId: entity.registrationId });
    return entity;
  }

  addRequirement(input: Omit<ComplianceRequirement, "id"> & { id?: string }): ComplianceRequirement | undefined {
    const market = this.markets.get(input.marketId);
    if (!market) return undefined;
    const req: ComplianceRequirement = { ...input, id: input.id ?? randomUUID() };
    this.requirements.set(req.id, req);
    market.requirements.push(req.id);
    if (req.status === "non_compliant" && req.dueDate) {
      this.bus.publish("intl.compliance_gap", { marketId: input.marketId, country: market.country, requirement: req.title, dueDate: req.dueDate });
    }
    return req;
  }

  updateRequirementStatus(reqId: string, status: ComplianceStatus): ComplianceRequirement | undefined {
    const req = this.requirements.get(reqId);
    if (!req) return undefined;
    req.status = status;
    return req;
  }

  updateGtmScore(marketId: string, score: number): Market | undefined {
    const market = this.markets.get(marketId);
    if (!market) return undefined;
    market.gtmScore = Math.min(100, Math.max(0, score));
    return market;
  }

  getMarket(id: string): Market | undefined { return this.markets.get(id); }
  listMarkets(status?: MarketStatus): Market[] {
    const all = Array.from(this.markets.values());
    return status ? all.filter((m) => m.status === status) : all;
  }

  listEntities(marketId?: string): LegalEntity[] {
    const all = Array.from(this.entities.values());
    return marketId ? all.filter((e) => e.marketId === marketId) : all;
  }

  listRequirements(marketId?: string): ComplianceRequirement[] {
    const all = Array.from(this.requirements.values());
    return marketId ? all.filter((r) => r.marketId === marketId) : all;
  }

  summary(): ExpansionSummary {
    const markets = Array.from(this.markets.values());
    const reqs = Array.from(this.requirements.values());
    const active = markets.filter((m) => m.status === "active");
    const avgGtm = active.length > 0 ? Math.round(active.reduce((s, m) => s + m.gtmScore, 0) / active.length) : 0;
    return {
      totalMarkets: markets.length,
      activeMarkets: active.length,
      enteringMarkets: markets.filter((m) => m.status === "entering").length,
      totalEntities: this.entities.size,
      openComplianceGaps: reqs.filter((r) => r.status === "non_compliant" || r.status === "in_progress").length,
      avgGtmScore: avgGtm,
    };
  }
}
