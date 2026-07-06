/**
 * Event bus — the architectural spine.
 *
 * Every layer publishes and consumes events here. The event log is the source
 * of truth; the OKG and all read models are *projections* that can be rebuilt
 * from the log. This in-memory implementation models the contract; production
 * swaps it for a durable, ordered, exactly-once log (Kafka/Redpanda-class)
 * behind the same interface.
 *
 * Topic taxonomy (see BLUEPRINT.md §22):
 *   fact.*  okg.*  decision.*  agent.*  sim.*  action.*  autonomy.*  audit.*
 */

import { randomUUID } from "node:crypto";
import type { Timestamp } from "../knowledge/graph/schema.js";

export interface BusEvent<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  ts: Timestamp;
}

export type Handler = (event: BusEvent) => void | Promise<void>;

/**
 * A durable sink for the event log. The in-memory bus is a projection of the
 * sink; production swaps a file/Kafka-backed sink behind this interface.
 */
export interface EventSink {
  append(event: BusEvent): void;
}

/** Matches "okg.node.versioned" against patterns like "okg.*" or "okg.node.versioned" or "*". */
function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === "*") return true;
  if (pattern === topic) return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1); // keep trailing "."
    return topic.startsWith(prefix);
  }
  return false;
}

export class EventBus {
  private readonly log: BusEvent[] = [];
  private readonly subscriptions: { pattern: string; handler: Handler }[] = [];

  /** Optional durable sink; every published event is appended to it. */
  constructor(private readonly sink?: EventSink) {}

  /** Append an event to the durable log and fan it out to subscribers. */
  publish<T>(topic: string, payload: T): BusEvent<T> {
    const event: BusEvent<T> = {
      id: randomUUID(),
      topic,
      payload,
      ts: new Date().toISOString(),
    };
    this.log.push(event);
    this.sink?.append(event);
    for (const sub of this.subscriptions) {
      if (topicMatches(sub.pattern, topic)) {
        // Fire-and-forget; projection handlers must be idempotent.
        void sub.handler(event);
      }
    }
    return event;
  }

  /**
   * Load prior events into the in-memory log without re-fanning them out to
   * subscribers (replaying a durable log on startup). Side effects already
   * happened in the originating session; here we only rebuild read state.
   */
  hydrate(events: readonly BusEvent[]): void {
    for (const e of events) this.log.push(e);
  }

  /** Subscribe to a topic or wildcard pattern (e.g. "decision.*"). */
  subscribe(pattern: string, handler: Handler): () => void {
    const sub = { pattern, handler };
    this.subscriptions.push(sub);
    return () => {
      const i = this.subscriptions.indexOf(sub);
      if (i >= 0) this.subscriptions.splice(i, 1);
    };
  }

  /** Full event log — the source of truth, used for replay / projection rebuilds. */
  events(): readonly BusEvent[] {
    return this.log;
  }
}
