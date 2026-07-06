// Multi-tenant registry — maps org IDs to isolated Olympus instances.
// Each tenant gets its own OKG, event bus, autonomy engine, memory, etc.
// The registry is the single source of truth for tenant lifecycle.

import { Olympus, type OlympusOptions } from "../index.js";

export interface TenantConfig {
  orgId: string;
  name: string;
  plan: "starter" | "growth" | "enterprise";
  createdAt: string; // ISO
  /** Max autonomy level allowed for this tenant. Defaults to 7. */
  maxAutonomyLevel?: number;
}

export interface Tenant {
  config: TenantConfig;
  olympus: Olympus;
}

export class TenantRegistry {
  private readonly tenants = new Map<string, Tenant>();

  /** Provision a new tenant with an isolated Olympus instance. */
  provision(config: TenantConfig, opts?: OlympusOptions): Tenant {
    if (this.tenants.has(config.orgId)) {
      throw new Error(`Tenant ${config.orgId} already exists`);
    }
    const olympus = new Olympus(opts ?? {});
    const tenant: Tenant = { config, olympus };
    this.tenants.set(config.orgId, tenant);
    return tenant;
  }

  get(orgId: string): Tenant | undefined {
    return this.tenants.get(orgId);
  }

  /** Require a tenant, throwing if not found. */
  require(orgId: string): Tenant {
    const t = this.tenants.get(orgId);
    if (!t) throw new Error(`Tenant not found: ${orgId}`);
    return t;
  }

  deprovision(orgId: string): boolean {
    return this.tenants.delete(orgId);
  }

  list(): TenantConfig[] {
    return [...this.tenants.values()].map((t) => t.config);
  }

  count(): number {
    return this.tenants.size;
  }
}
