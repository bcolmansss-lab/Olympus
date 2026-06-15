/**
 * File-backed append-only event log — a durable EventSink.
 *
 * Proves the core architectural claim (BLUEPRINT §22.2): "the log is the source
 * of truth; the OKG and all read models are projections rebuildable from the
 * log." Each event is written as one JSON line (JSONL). On restart, `readAll()`
 * replays the file and `EventBus.hydrate()` rebuilds in-memory state — no other
 * persistence is needed, because every layer derives from the log.
 *
 * This reference implementation uses synchronous appends for simplicity and
 * ordering guarantees; production swaps a segmented, fsync-batched, or
 * Kafka-class log behind the same EventSink interface.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { BusEvent, EventSink } from "../events/event-bus.js";

export class FileEventLog implements EventSink {
  constructor(private readonly path: string) {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /** Append one event as a JSON line. Ordered and durable. */
  append(event: BusEvent): void {
    appendFileSync(this.path, JSON.stringify(event) + "\n", "utf8");
  }

  /** Replay the entire log in write order. Empty if the file doesn't exist. */
  readAll(): BusEvent[] {
    if (!existsSync(this.path)) return [];
    const raw = readFileSync(this.path, "utf8");
    const events: BusEvent[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as BusEvent);
      } catch {
        // A torn final line (crash mid-write) is skipped — the log is otherwise intact.
      }
    }
    return events;
  }

  /** Number of durably persisted events. */
  count(): number {
    return this.readAll().length;
  }
}
