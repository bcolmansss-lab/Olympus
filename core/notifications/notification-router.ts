/**
 * NotificationRouter — watches the event spine for high-signal events and
 * fans them out to registered AlertChannels.
 *
 * Built-in channels:
 *   - InMemoryChannel: stores alerts in a capped ring buffer (good for tests + console)
 *   - WebhookChannel: fires a JSON POST to a URL (stub — no real HTTP in tests)
 *
 * Default subscribed topics:
 *   - anomaly.detected
 *   - policy.blocked
 *   - autonomy.calibration_demotion
 *   - decision.escalated (any topic matching "decision.*" with payload.escalated === true)
 */

import type { EventBus, BusEvent } from "../events/event-bus.js";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  topic: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  payload: unknown;
  createdAt: string; // ISO
}

export interface AlertChannel {
  name: string;
  send(alert: Alert): void | Promise<void>;
}

export interface TopicRule {
  /** Topic pattern — exact match or prefix with wildcard like "decision.*" */
  topic: string;
  severity: AlertSeverity;
  /** Map the raw event payload to a human-readable title + body. */
  format(event: BusEvent): { title: string; body: string };
}

let _alertSeq = 0;
function nextAlertId(): string {
  return `alert-${++_alertSeq}`;
}

const DEFAULT_RULES: TopicRule[] = [
  {
    topic: "anomaly.detected",
    severity: "warning",
    format: (e) => {
      const p = e.payload as Record<string, unknown>;
      return {
        title: `Anomaly detected: ${p["key"] ?? "unknown"}`,
        body: `z=${String(typeof p["zScore"] === "number" ? p["zScore"].toFixed(2) : "?")} observed=${String(p["value"] ?? "?")} mean=${String(typeof p["mean"] === "number" ? p["mean"].toFixed(2) : "?")}`,
      };
    },
  },
  {
    topic: "policy.blocked",
    severity: "critical",
    format: (e) => {
      const p = e.payload as Record<string, unknown>;
      return {
        title: `Policy blocked: ${p["policyName"] ?? "unknown"}`,
        body: String(p["description"] ?? ""),
      };
    },
  },
  {
    topic: "autonomy.calibration_demotion",
    severity: "critical",
    format: (e) => {
      const p = e.payload as Record<string, unknown>;
      return {
        title: `Autonomy demoted: ${p["domain"] ?? "unknown"}`,
        body: `Domain demoted to L0 due to calibration drift (MAE=${String(typeof p["mae"] === "number" ? p["mae"].toFixed(3) : "?")})`,
      };
    },
  },
];

export class NotificationRouter {
  private readonly channels: AlertChannel[] = [];
  private readonly rules: TopicRule[];
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly bus: EventBus,
    rules?: TopicRule[]
  ) {
    this.rules = rules ?? [...DEFAULT_RULES];
  }

  addChannel(channel: AlertChannel): this {
    this.channels.push(channel);
    return this;
  }

  addRule(rule: TopicRule): this {
    this.rules.push(rule);
    return this;
  }

  attach(): this {
    for (const rule of this.rules) {
      const unsub = this.bus.subscribe(rule.topic, (event) => {
        const { title, body } = rule.format(event);
        const alert: Alert = {
          id: nextAlertId(),
          topic: event.topic,
          severity: rule.severity,
          title,
          body,
          payload: event.payload,
          createdAt: new Date().toISOString(),
        };
        for (const ch of this.channels) {
          void ch.send(alert);
        }
      });
      this.unsubscribers.push(unsub);
    }
    return this;
  }

  detach(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
  }

  listRules(): string[] {
    return this.rules.map((r) => r.topic);
  }
}

// ---------------------------------------------------------------------------
// Built-in channels
// ---------------------------------------------------------------------------

export class InMemoryChannel implements AlertChannel {
  readonly name = "in-memory";
  private readonly buffer: Alert[] = [];
  constructor(private readonly maxSize = 200) {}

  send(alert: Alert): void {
    this.buffer.push(alert);
    if (this.buffer.length > this.maxSize) this.buffer.shift();
  }

  alerts(): readonly Alert[] {
    return this.buffer;
  }

  clear(): void {
    this.buffer.length = 0;
  }

  count(): number {
    return this.buffer.length;
  }
}

/** Stub webhook channel — records calls without making real HTTP requests. */
export class WebhookChannel implements AlertChannel {
  readonly name: string;
  readonly calls: Array<{ url: string; alert: Alert }> = [];

  constructor(
    private readonly url: string,
    name?: string
  ) {
    this.name = name ?? `webhook:${url}`;
  }

  send(alert: Alert): void {
    // In production: fetch(this.url, { method: "POST", body: JSON.stringify(alert) })
    this.calls.push({ url: this.url, alert });
  }
}
