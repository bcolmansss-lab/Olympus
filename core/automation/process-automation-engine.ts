/**
 * ProcessAutomationEngine — the cross-module nervous system. Declarative
 * rules bind bus events (exact topic or wildcard pattern) to named actions,
 * so activity in one domain module drives behavior in another without the
 * modules knowing about each other.
 *
 * Each execution is logged; a throwing action lands in the dead-letter list
 * with its error instead of crashing the bus. Rules can be disabled and
 * re-enabled at runtime.
 *
 * Events:
 *   - "automation.executed": { ruleId, topic }
 *   - "automation.dead_letter": { ruleId, topic, error }
 */
import { randomUUID } from "node:crypto";
import type { BusEvent, EventBus } from "../events/event-bus.js";

export type AutomationAction = (event: BusEvent) => void;

export interface AutomationRule {
  id: string;
  name: string;
  pattern: string;
  enabled: boolean;
  executions: number;
  failures: number;
}

export interface AutomationExecution {
  ruleId: string;
  topic: string;
  ok: boolean;
  error?: string;
  at: string;
}

export interface AutomationSummary {
  totalRules: number;
  enabledRules: number;
  totalExecutions: number;
  deadLetters: number;
}

export class ProcessAutomationEngine {
  private rules: Map<string, AutomationRule> = new Map();
  private actions: Map<string, AutomationAction> = new Map();
  private executionLog: AutomationExecution[] = [];

  constructor(private readonly bus: EventBus) {}

  /**
   * Register a rule binding an event pattern to an action. Automation
   * meta-events ("automation.*") are never matched, preventing feedback loops.
   */
  addRule(name: string, pattern: string, action: AutomationAction): AutomationRule {
    const rule: AutomationRule = { id: randomUUID(), name, pattern, enabled: true, executions: 0, failures: 0 };
    this.rules.set(rule.id, rule);
    this.actions.set(rule.id, action);
    this.bus.subscribe(pattern, (event) => this.execute(rule.id, event));
    return rule;
  }

  private execute(ruleId: string, event: BusEvent): void {
    const rule = this.rules.get(ruleId);
    const action = this.actions.get(ruleId);
    if (!rule || !action || !rule.enabled || event.topic.startsWith("automation.")) return;
    rule.executions += 1;
    try {
      action(event);
      this.executionLog.push({ ruleId, topic: event.topic, ok: true, at: event.ts });
      this.bus.publish("automation.executed", { ruleId, topic: event.topic });
    } catch (err) {
      rule.failures += 1;
      const error = err instanceof Error ? err.message : String(err);
      this.executionLog.push({ ruleId, topic: event.topic, ok: false, error, at: event.ts });
      this.bus.publish("automation.dead_letter", { ruleId, topic: event.topic, error });
    }
  }

  setEnabled(ruleId: string, enabled: boolean): AutomationRule | undefined {
    const rule = this.rules.get(ruleId);
    if (!rule) return undefined;
    rule.enabled = enabled;
    return rule;
  }

  getRule(id: string): AutomationRule | undefined { return this.rules.get(id); }
  listRules(enabledOnly = false): AutomationRule[] {
    const all = Array.from(this.rules.values());
    return enabledOnly ? all.filter(r => r.enabled) : all;
  }
  executions(ruleId?: string): AutomationExecution[] {
    return ruleId ? this.executionLog.filter(e => e.ruleId === ruleId) : [...this.executionLog];
  }
  deadLetters(): AutomationExecution[] { return this.executionLog.filter(e => !e.ok); }

  summary(): AutomationSummary {
    const rules = Array.from(this.rules.values());
    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      totalExecutions: this.executionLog.length,
      deadLetters: this.executionLog.filter(e => !e.ok).length,
    };
  }
}
