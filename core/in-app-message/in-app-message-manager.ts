/**
 * InAppMessageManager — in-product messages (modals, tooltips, tours):
 * audience-targeted messages with display rules, impression/interaction
 * tracking, frequency capping, and dismissal handling.
 *
 * Events:
 *   - "inapp.message_published": { messageId, kind, audience }
 *   - "inapp.impression": { messageId, userId }
 *   - "inapp.converted": { messageId, userId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MessageKind = "modal" | "tooltip" | "banner" | "tour" | "slideout";
export type MessageState = "draft" | "live" | "paused" | "archived";

export interface InAppMessage {
  id: string;
  kind: MessageKind;
  title: string;
  audience: string; // segment key, "all"
  state: MessageState;
  maxImpressionsPerUser: number;
  impressions: Map<string, number>; // userId -> count
  conversions: Set<string>;
  dismissals: Set<string>;
  createdAt: string;
}

export interface InAppSummary {
  totalMessages: number;
  live: number;
  totalImpressions: number;
  totalConversions: number;
  conversionRatePct: number;
  dismissalRatePct: number;
}

export class InAppMessageManager {
  private messages: Map<string, InAppMessage> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { kind: MessageKind; title: string; audience: string; maxImpressionsPerUser?: number }): InAppMessage {
    const message: InAppMessage = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title,
      audience: input.audience,
      state: "draft",
      maxImpressionsPerUser: input.maxImpressionsPerUser ?? 3,
      impressions: new Map(),
      conversions: new Set(),
      dismissals: new Set(),
      createdAt: new Date().toISOString(),
    };
    this.messages.set(message.id, message);
    return message;
  }

  publish(messageId: string): InAppMessage | undefined {
    const m = this.messages.get(messageId);
    if (!m || m.state !== "draft") return undefined;
    m.state = "live";
    this.bus.publish("inapp.message_published", { messageId, kind: m.kind, audience: m.audience });
    return m;
  }

  pause(messageId: string): InAppMessage | undefined {
    const m = this.messages.get(messageId);
    if (!m || m.state !== "live") return undefined;
    m.state = "paused";
    return m;
  }

  /** Should the message display for this user? Respects state, dismissal, and frequency cap. */
  shouldDisplay(messageId: string, userId: string): boolean {
    const m = this.messages.get(messageId);
    if (!m || m.state !== "live") return false;
    if (m.dismissals.has(userId)) return false;
    return (m.impressions.get(userId) ?? 0) < m.maxImpressionsPerUser;
  }

  recordImpression(messageId: string, userId: string): boolean {
    const m = this.messages.get(messageId);
    if (!m || !this.shouldDisplay(messageId, userId)) return false;
    m.impressions.set(userId, (m.impressions.get(userId) ?? 0) + 1);
    this.bus.publish("inapp.impression", { messageId, userId });
    return true;
  }

  recordConversion(messageId: string, userId: string): boolean {
    const m = this.messages.get(messageId);
    if (!m || !m.impressions.has(userId) || m.conversions.has(userId)) return false;
    m.conversions.add(userId);
    this.bus.publish("inapp.converted", { messageId, userId });
    return true;
  }

  dismiss(messageId: string, userId: string): boolean {
    const m = this.messages.get(messageId);
    if (!m) return false;
    m.dismissals.add(userId);
    return true;
  }

  getMessage(id: string): InAppMessage | undefined { return this.messages.get(id); }
  listMessages(state?: MessageState): InAppMessage[] {
    const all = Array.from(this.messages.values());
    return state ? all.filter(m => m.state === state) : all;
  }

  summary(): InAppSummary {
    const messages = Array.from(this.messages.values());
    const impressions = messages.reduce((s, m) => s + Array.from(m.impressions.values()).reduce((a, b) => a + b, 0), 0);
    const uniqueViewers = messages.reduce((s, m) => s + m.impressions.size, 0);
    const conversions = messages.reduce((s, m) => s + m.conversions.size, 0);
    const dismissals = messages.reduce((s, m) => s + m.dismissals.size, 0);
    return {
      totalMessages: messages.length,
      live: messages.filter(m => m.state === "live").length,
      totalImpressions: impressions,
      totalConversions: conversions,
      conversionRatePct: uniqueViewers > 0 ? Math.round((conversions / uniqueViewers) * 100) : 0,
      dismissalRatePct: uniqueViewers > 0 ? Math.round((dismissals / uniqueViewers) * 100) : 0,
    };
  }
}
