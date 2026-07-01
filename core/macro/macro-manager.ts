/**
 * MacroManager — canned support responses (macros): templated replies with
 * {{placeholder}} substitution, category organization, usage tracking, and
 * rendering for agent use.
 *
 * Events:
 *   - "macro.created": { macroId, name, category }
 *   - "macro.applied": { macroId, ticketRef }
 *   - "macro.archived": { macroId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MacroStatus = "active" | "archived";

export interface Macro {
  id: string;
  name: string;
  category: string;
  body: string;
  placeholders: string[];
  status: MacroStatus;
  usageCount: number;
  createdAt: string;
}

export interface MacroSummary {
  totalMacros: number;
  active: number;
  totalUsages: number;
  byCategory: Record<string, number>;
  topUsed: { name: string; usageCount: number }[];
}

export class MacroManager {
  private macros: Map<string, Macro> = new Map();

  constructor(private readonly bus: EventBus) {}

  private extract(body: string): string[] {
    const matches = body.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
    return Array.from(new Set(matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, ""))));
  }

  create(name: string, category: string, body: string): Macro {
    const macro: Macro = { id: randomUUID(), name, category, body, placeholders: this.extract(body), status: "active", usageCount: 0, createdAt: new Date().toISOString() };
    this.macros.set(macro.id, macro);
    this.bus.publish("macro.created", { macroId: macro.id, name, category });
    return macro;
  }

  update(macroId: string, body: string): Macro | undefined {
    const macro = this.macros.get(macroId);
    if (!macro) return undefined;
    macro.body = body;
    macro.placeholders = this.extract(body);
    return macro;
  }

  archive(macroId: string): Macro | undefined {
    const macro = this.macros.get(macroId);
    if (!macro) return undefined;
    macro.status = "archived";
    this.bus.publish("macro.archived", { macroId });
    return macro;
  }

  /** Render a macro with placeholder values and record usage. */
  apply(macroId: string, values: Record<string, string>, ticketRef: string): { text: string; missing: string[] } | undefined {
    const macro = this.macros.get(macroId);
    if (!macro || macro.status !== "active") return undefined;
    const missing = macro.placeholders.filter(p => values[p] === undefined);
    const text = macro.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => values[k] ?? `{{${k}}}`);
    macro.usageCount += 1;
    this.bus.publish("macro.applied", { macroId, ticketRef });
    return { text, missing };
  }

  getMacro(id: string): Macro | undefined { return this.macros.get(id); }
  listMacros(category?: string, status?: MacroStatus): Macro[] {
    let all = Array.from(this.macros.values());
    if (category) all = all.filter(m => m.category === category);
    if (status) all = all.filter(m => m.status === status);
    return all;
  }

  summary(): MacroSummary {
    const macros = Array.from(this.macros.values());
    const byCategory: Record<string, number> = {};
    for (const m of macros) { byCategory[m.category] = (byCategory[m.category] ?? 0) + 1; }
    return {
      totalMacros: macros.length,
      active: macros.filter(m => m.status === "active").length,
      totalUsages: macros.reduce((s, m) => s + m.usageCount, 0),
      byCategory,
      topUsed: [...macros].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5).map(m => ({ name: m.name, usageCount: m.usageCount })),
    };
  }
}
