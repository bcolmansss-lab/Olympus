/**
 * PolicyEngine — operator-defined business rules evaluated before autonomous execution.
 *
 * A Policy is a named predicate over a PolicyContext. When a policy fires (returns true),
 * the action is BLOCKED and the engine emits "policy.blocked" with the policy name and reason.
 *
 * Policies are evaluated in registration order. First match wins (block).
 *
 * Example policies:
 *   - Never cut headcount > 10% in any single action
 *   - Always escalate any budget reallocation > $500,000
 *   - Freeze all hiring decisions in domain "people" during a hiring freeze
 */

import type { EventBus } from "../events/event-bus.js";

export interface PolicyContext {
  /** The capability being invoked (e.g. "reallocate_budget", "hire_contractor") */
  capability: string;
  /** The domain of the decision (e.g. "finance", "people", "sales") */
  domain: string;
  /** The exposure amount in USD (if applicable) */
  exposureAmount?: number;
  /** Arbitrary key/value metadata from the decision */
  metadata?: Record<string, unknown>;
}

export interface Policy {
  name: string;
  description: string;
  /** Return true to BLOCK the action. */
  evaluate(ctx: PolicyContext): boolean;
}

export interface PolicyViolation {
  policyName: string;
  description: string;
  context: PolicyContext;
  blockedAt: string; // ISO
}

export class PolicyEngine {
  private readonly policies: Policy[] = [];

  constructor(private readonly bus: EventBus) {}

  /** Register a policy. Policies are evaluated in registration order. */
  register(policy: Policy): this {
    this.policies.push(policy);
    return this;
  }

  /** Unregister a policy by name. */
  unregister(name: string): this {
    const idx = this.policies.findIndex((p) => p.name === name);
    if (idx !== -1) this.policies.splice(idx, 1);
    return this;
  }

  /**
   * Evaluate all policies against the context.
   * Returns the first violation found, or undefined if all pass.
   * Emits "policy.blocked" event on violation.
   */
  evaluate(ctx: PolicyContext): PolicyViolation | undefined {
    for (const policy of this.policies) {
      if (policy.evaluate(ctx)) {
        const violation: PolicyViolation = {
          policyName: policy.name,
          description: policy.description,
          context: ctx,
          blockedAt: new Date().toISOString(),
        };
        this.bus.publish("policy.blocked", violation);
        return violation;
      }
    }
    return undefined;
  }

  /** List all registered policy names. */
  list(): string[] {
    return this.policies.map((p) => p.name);
  }

  count(): number {
    return this.policies.length;
  }
}

// ---------------------------------------------------------------------------
// Built-in policy factories — operators can use these as starting points.
// ---------------------------------------------------------------------------

/** Block any action whose exposureAmount exceeds the given USD ceiling. */
export function exposureCeilingPolicy(name: string, maxUsd: number): Policy {
  return {
    name,
    description: `Block any action with exposure > $${maxUsd.toLocaleString()}`,
    evaluate: (ctx) =>
      ctx.exposureAmount !== undefined && ctx.exposureAmount > maxUsd,
  };
}

/** Block a specific capability globally. */
export function blockedCapabilityPolicy(capability: string): Policy {
  return {
    name: `block:${capability}`,
    description: `Capability "${capability}" is globally disabled`,
    evaluate: (ctx) => ctx.capability === capability,
  };
}

/** Block all actions in a domain (e.g. a hiring freeze). */
export function domainFreezePolicy(domain: string): Policy {
  return {
    name: `freeze:${domain}`,
    description: `All autonomous actions in domain "${domain}" are frozen`,
    evaluate: (ctx) => ctx.domain === domain,
  };
}
