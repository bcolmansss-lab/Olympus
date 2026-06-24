/**
 * APIGateway — internal API registry, endpoint catalog, rate limit tracking,
 * SLA monitoring, deprecation management, and API usage analytics.
 *
 * Events:
 *   - "api.endpoint_registered": { endpointId, path, version, owner }
 *   - "api.rate_limit_exceeded": { endpointId, consumerId, limitPerMin, requestCount }
 *   - "api.deprecation_notice": { endpointId, path, sunsetDate, replacedBy }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type EndpointStatus = "active" | "deprecated" | "sunset" | "beta";
export type AuthScheme = "api_key" | "oauth2" | "jwt" | "basic" | "none";

export interface APIEndpoint {
  id: string;
  path: string;
  method: HttpMethod;
  version: string;
  status: EndpointStatus;
  owner: string;
  description: string;
  authScheme: AuthScheme;
  rateLimitPerMin: number;
  avgLatencyMs?: number;
  slaLatencyMs: number;
  sunsetDate?: string;
  replacedBy?: string;
  tags: string[];
  createdAt: string;
}

export interface APIUsageRecord {
  id: string;
  endpointId: string;
  consumerId: string;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
  period: string; // YYYY-MM-DD
  recordedAt: string;
}

export interface GatewayConsumer {
  id: string;
  name: string;
  apiKey: string;
  rateMultiplier: number; // 1 = standard, 2 = 2x rate limit
  allowedEndpoints: string[]; // endpoint IDs, empty = all
  createdAt: string;
}

export interface GatewaySummary {
  totalEndpoints: number;
  activeEndpoints: number;
  deprecatedEndpoints: number;
  totalConsumers: number;
  totalRequests: number;
  slaViolations: number;
}

export class APIGateway {
  private endpoints: Map<string, APIEndpoint> = new Map();
  private usageRecords: Map<string, APIUsageRecord> = new Map();
  private consumers: Map<string, GatewayConsumer> = new Map();

  constructor(private readonly bus: EventBus) {}

  registerEndpoint(input: Omit<APIEndpoint, "id" | "createdAt"> & { id?: string }): APIEndpoint {
    const endpoint: APIEndpoint = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.endpoints.set(endpoint.id, endpoint);
    this.bus.publish("api.endpoint_registered", { endpointId: endpoint.id, path: endpoint.path, version: endpoint.version, owner: endpoint.owner });
    return endpoint;
  }

  deprecateEndpoint(endpointId: string, sunsetDate: string, replacedBy?: string): APIEndpoint | undefined {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) return undefined;
    endpoint.status = "deprecated";
    endpoint.sunsetDate = sunsetDate;
    if (replacedBy) endpoint.replacedBy = replacedBy;
    this.bus.publish("api.deprecation_notice", { endpointId, path: endpoint.path, sunsetDate, replacedBy });
    return endpoint;
  }

  recordUsage(input: Omit<APIUsageRecord, "id" | "recordedAt"> & { id?: string }): APIUsageRecord | undefined {
    const endpoint = this.endpoints.get(input.endpointId);
    if (!endpoint) return undefined;
    const record: APIUsageRecord = { ...input, id: input.id ?? randomUUID(), recordedAt: new Date().toISOString() };
    this.usageRecords.set(record.id, record);

    if (input.requestCount > endpoint.rateLimitPerMin) {
      this.bus.publish("api.rate_limit_exceeded", { endpointId: input.endpointId, consumerId: input.consumerId, limitPerMin: endpoint.rateLimitPerMin, requestCount: input.requestCount });
    }

    // Update avg latency on endpoint
    if (input.avgLatencyMs) {
      endpoint.avgLatencyMs = input.avgLatencyMs;
    }

    return record;
  }

  registerConsumer(input: Omit<GatewayConsumer, "id" | "createdAt"> & { id?: string }): GatewayConsumer {
    const consumer: GatewayConsumer = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.consumers.set(consumer.id, consumer);
    return consumer;
  }

  getEndpoint(id: string): APIEndpoint | undefined { return this.endpoints.get(id); }
  listEndpoints(status?: EndpointStatus): APIEndpoint[] {
    const all = Array.from(this.endpoints.values());
    return status ? all.filter((e) => e.status === status) : all;
  }

  listUsage(endpointId?: string): APIUsageRecord[] {
    const all = Array.from(this.usageRecords.values());
    return endpointId ? all.filter((r) => r.endpointId === endpointId) : all;
  }

  listConsumers(): GatewayConsumer[] { return Array.from(this.consumers.values()); }

  summary(): GatewaySummary {
    const endpoints = Array.from(this.endpoints.values());
    const usageRecords = Array.from(this.usageRecords.values());
    const slaViolations = usageRecords.filter((r) => {
      const ep = this.endpoints.get(r.endpointId);
      return ep && r.avgLatencyMs > ep.slaLatencyMs;
    }).length;
    return {
      totalEndpoints: endpoints.length,
      activeEndpoints: endpoints.filter((e) => e.status === "active").length,
      deprecatedEndpoints: endpoints.filter((e) => e.status === "deprecated").length,
      totalConsumers: this.consumers.size,
      totalRequests: usageRecords.reduce((s, r) => s + r.requestCount, 0),
      slaViolations,
    };
  }
}
