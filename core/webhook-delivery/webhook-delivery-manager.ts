/**
 * WebhookDeliveryManager — outbound webhook endpoint registry, event
 * subscription matching, delivery attempt tracking, and retry/backoff with
 * automatic disabling of failing endpoints.
 *
 * Events:
 *   - "webhookdelivery.endpoint_registered": { endpointId, url, eventCount }
 *   - "webhookdelivery.delivered": { deliveryId, endpointId, eventType }
 *   - "webhookdelivery.endpoint_disabled": { endpointId, url, consecutiveFailures }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DeliveryStatus = "pending" | "delivered" | "failed" | "exhausted";

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[]; // event types subscribed to ("*" = all)
  active: boolean;
  consecutiveFailures: number;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  payload: unknown;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  deliveredAt?: string;
}

export interface WebhookDeliverySummary {
  totalEndpoints: number;
  activeEndpoints: number;
  totalDeliveries: number;
  delivered: number;
  failed: number;
  pending: number;
  deliveryRatePct: number;
}

export class WebhookDeliveryManager {
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private failureThreshold: number;

  constructor(private readonly bus: EventBus, failureThreshold = 5) {
    this.failureThreshold = failureThreshold;
  }

  registerEndpoint(url: string, events: string[]): WebhookEndpoint {
    const endpoint: WebhookEndpoint = { id: randomUUID(), url, events, active: true, consecutiveFailures: 0, createdAt: new Date().toISOString() };
    this.endpoints.set(endpoint.id, endpoint);
    this.bus.publish("webhookdelivery.endpoint_registered", { endpointId: endpoint.id, url, eventCount: events.length });
    return endpoint;
  }

  setActive(endpointId: string, active: boolean): WebhookEndpoint | undefined {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) return undefined;
    endpoint.active = active;
    if (active) endpoint.consecutiveFailures = 0;
    return endpoint;
  }

  private subscribedTo(endpoint: WebhookEndpoint, eventType: string): boolean {
    return endpoint.events.includes("*") || endpoint.events.includes(eventType);
  }

  /** Enqueue deliveries for all active endpoints subscribed to the event type. */
  enqueue(eventType: string, payload: unknown, maxAttempts = 3): WebhookDelivery[] {
    const created: WebhookDelivery[] = [];
    for (const endpoint of this.endpoints.values()) {
      if (!endpoint.active || !this.subscribedTo(endpoint, eventType)) continue;
      const delivery: WebhookDelivery = { id: randomUUID(), endpointId: endpoint.id, eventType, payload, status: "pending", attempts: 0, maxAttempts };
      this.deliveries.set(delivery.id, delivery);
      created.push(delivery);
    }
    return created;
  }

  /** Record the result of a delivery attempt. */
  attemptDelivery(deliveryId: string, success: boolean, asOf: string): WebhookDelivery | undefined {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery || delivery.status === "delivered" || delivery.status === "exhausted") return undefined;
    const endpoint = this.endpoints.get(delivery.endpointId);
    delivery.attempts += 1;
    delivery.lastAttemptAt = asOf;
    if (success) {
      delivery.status = "delivered";
      delivery.deliveredAt = asOf;
      if (endpoint) endpoint.consecutiveFailures = 0;
      this.bus.publish("webhookdelivery.delivered", { deliveryId, endpointId: delivery.endpointId, eventType: delivery.eventType });
    } else {
      delivery.status = delivery.attempts >= delivery.maxAttempts ? "exhausted" : "failed";
      if (endpoint) {
        endpoint.consecutiveFailures += 1;
        if (endpoint.consecutiveFailures >= this.failureThreshold && endpoint.active) {
          endpoint.active = false;
          this.bus.publish("webhookdelivery.endpoint_disabled", { endpointId: endpoint.id, url: endpoint.url, consecutiveFailures: endpoint.consecutiveFailures });
        }
      }
    }
    return delivery;
  }

  getEndpoint(id: string): WebhookEndpoint | undefined { return this.endpoints.get(id); }
  getDelivery(id: string): WebhookDelivery | undefined { return this.deliveries.get(id); }
  listEndpoints(activeOnly = false): WebhookEndpoint[] {
    const all = Array.from(this.endpoints.values());
    return activeOnly ? all.filter(e => e.active) : all;
  }
  listDeliveries(status?: DeliveryStatus): WebhookDelivery[] {
    const all = Array.from(this.deliveries.values());
    return status ? all.filter(d => d.status === status) : all;
  }
  retryable(): WebhookDelivery[] {
    return Array.from(this.deliveries.values()).filter(d => d.status === "failed" && d.attempts < d.maxAttempts);
  }

  summary(): WebhookDeliverySummary {
    const endpoints = Array.from(this.endpoints.values());
    const deliveries = Array.from(this.deliveries.values());
    const delivered = deliveries.filter(d => d.status === "delivered").length;
    const finished = deliveries.filter(d => d.status === "delivered" || d.status === "exhausted").length;
    return {
      totalEndpoints: endpoints.length,
      activeEndpoints: endpoints.filter(e => e.active).length,
      totalDeliveries: deliveries.length,
      delivered,
      failed: deliveries.filter(d => d.status === "failed" || d.status === "exhausted").length,
      pending: deliveries.filter(d => d.status === "pending").length,
      deliveryRatePct: finished > 0 ? Math.round((delivered / finished) * 100) : 0,
    };
  }
}
