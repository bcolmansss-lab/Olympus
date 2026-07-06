/**
 * AccessControl — role-based and attribute-based access control, permission management,
 * API key lifecycle, and security policy enforcement.
 *
 * Events:
 *   - "access.permission_granted": { principalId, resource, action }
 *   - "access.permission_denied": { principalId, resource, action, reason }
 *   - "access.api_key_created": { keyId, principalId, scopes }
 *   - "access.suspicious_activity": { principalId, reason, riskScore }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PrincipalType = "user" | "service" | "agent" | "api_key";
export type PermissionEffect = "allow" | "deny";

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  inheritsFrom?: string[]; // role IDs
  createdAt: string;
}

export interface Permission {
  resource: string; // e.g. "incidents", "finance", "*"
  actions: string[]; // e.g. ["read","write"] or ["*"]
  effect: PermissionEffect;
  conditions?: Record<string, unknown>; // attribute conditions
}

export interface Principal {
  id: string;
  type: PrincipalType;
  name: string;
  roleIds: string[];
  directPermissions: Permission[];
  attributes?: Record<string, string>; // for ABAC: { department: "eng", level: "L5" }
  active: boolean;
  createdAt: string;
  lastSeenAt?: string;
}

export interface ApiKey {
  id: string;
  principalId: string;
  name: string;
  keyPrefix: string; // e.g. "sk_live_abc123" (prefix only, never store full key)
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  matchedRule?: Permission;
}

export interface AccessSummary {
  totalPrincipals: number;
  activePrincipals: number;
  totalRoles: number;
  activeApiKeys: number;
  recentDenials: number; // last 24h
}

export class AccessControl {
  private readonly roles: Map<string, Role> = new Map();
  private readonly principals: Map<string, Principal> = new Map();
  private readonly apiKeys: Map<string, ApiKey> = new Map();
  private readonly denialLog: Array<{ principalId: string; resource: string; action: string; at: string }> = [];

  constructor(private readonly bus: EventBus) {}

  createRole(input: Omit<Role, "id" | "createdAt"> & { id?: string }): Role {
    const role: Role = {
      id: input.id ?? randomUUID(),
      name: input.name,
      description: input.description,
      permissions: input.permissions,
      inheritsFrom: input.inheritsFrom,
      createdAt: new Date().toISOString(),
    };
    this.roles.set(role.id, role);
    return role;
  }

  createPrincipal(input: Omit<Principal, "id" | "createdAt"> & { id?: string }): Principal {
    const principal: Principal = {
      id: input.id ?? randomUUID(),
      type: input.type,
      name: input.name,
      roleIds: input.roleIds,
      directPermissions: input.directPermissions,
      attributes: input.attributes,
      active: input.active,
      createdAt: new Date().toISOString(),
      lastSeenAt: input.lastSeenAt,
    };
    this.principals.set(principal.id, principal);
    return principal;
  }

  assignRole(principalId: string, roleId: string): Principal | undefined {
    const principal = this.principals.get(principalId);
    if (!principal) return undefined;
    if (!principal.roleIds.includes(roleId)) {
      principal.roleIds.push(roleId);
    }
    return principal;
  }

  private collectRolePermissions(roleId: string, visited = new Set<string>()): Permission[] {
    if (visited.has(roleId)) return [];
    visited.add(roleId);
    const role = this.roles.get(roleId);
    if (!role) return [];
    const perms: Permission[] = [...role.permissions];
    for (const parentId of role.inheritsFrom ?? []) {
      perms.push(...this.collectRolePermissions(parentId, visited));
    }
    return perms;
  }

  private matchesResource(pattern: string, resource: string): boolean {
    return pattern === "*" || pattern === resource;
  }

  private matchesAction(pattern: string, action: string): boolean {
    return pattern === "*" || pattern === action;
  }

  check(principalId: string, resource: string, action: string): AccessDecision {
    const principal = this.principals.get(principalId);
    if (!principal || !principal.active) {
      const reason = principal ? "principal is inactive" : "principal not found";
      this.bus.publish("access.permission_denied", { principalId, resource, action, reason });
      this.denialLog.push({ principalId, resource, action, at: new Date().toISOString() });
      return { allowed: false, reason };
    }

    // Collect all permissions
    const allPerms: Permission[] = [...principal.directPermissions];
    for (const roleId of principal.roleIds) {
      allPerms.push(...this.collectRolePermissions(roleId));
    }

    // Explicit DENY overrides ALLOW
    for (const perm of allPerms) {
      if (perm.effect === "deny" && this.matchesResource(perm.resource, resource)) {
        if (perm.actions.some((a) => this.matchesAction(a, action))) {
          const reason = "explicitly denied by policy";
          this.bus.publish("access.permission_denied", { principalId, resource, action, reason });
          this.denialLog.push({ principalId, resource, action, at: new Date().toISOString() });
          return { allowed: false, reason, matchedRule: perm };
        }
      }
    }

    // Check for ALLOW
    for (const perm of allPerms) {
      if (perm.effect === "allow" && this.matchesResource(perm.resource, resource)) {
        if (perm.actions.some((a) => this.matchesAction(a, action))) {
          this.bus.publish("access.permission_granted", { principalId, resource, action });
          return { allowed: true, reason: "allowed by policy", matchedRule: perm };
        }
      }
    }

    const reason = "no matching allow rule";
    this.bus.publish("access.permission_denied", { principalId, resource, action, reason });
    this.denialLog.push({ principalId, resource, action, at: new Date().toISOString() });
    return { allowed: false, reason };
  }

  createApiKey(principalId: string, name: string, scopes: string[], expiresAt?: string): ApiKey {
    const key: ApiKey = {
      id: randomUUID(),
      principalId,
      name,
      keyPrefix: "sk_" + randomUUID().slice(0, 8),
      scopes,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.apiKeys.set(key.id, key);
    this.bus.publish("access.api_key_created", { keyId: key.id, principalId, scopes });
    return key;
  }

  revokeApiKey(keyId: string): ApiKey | undefined {
    const key = this.apiKeys.get(keyId);
    if (!key) return undefined;
    key.revokedAt = new Date().toISOString();
    return key;
  }

  flagSuspiciousActivity(principalId: string, reason: string, riskScore: number): void {
    this.bus.publish("access.suspicious_activity", { principalId, reason, riskScore });
  }

  getPrincipal(id: string): Principal | undefined {
    return this.principals.get(id);
  }

  listPrincipals(active?: boolean): Principal[] {
    const all = Array.from(this.principals.values());
    if (active === undefined) return all;
    return all.filter((p) => p.active === active);
  }

  getRole(id: string): Role | undefined {
    return this.roles.get(id);
  }

  listRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  listApiKeys(principalId?: string): ApiKey[] {
    const all = Array.from(this.apiKeys.values());
    if (principalId === undefined) return all;
    return all.filter((k) => k.principalId === principalId);
  }

  summary(): AccessSummary {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const recentDenials = this.denialLog.filter((d) => now - new Date(d.at).getTime() < oneDayMs).length;
    const activeApiKeys = Array.from(this.apiKeys.values()).filter((k) => !k.revokedAt).length;
    return {
      totalPrincipals: this.principals.size,
      activePrincipals: Array.from(this.principals.values()).filter((p) => p.active).length,
      totalRoles: this.roles.size,
      activeApiKeys,
      recentDenials,
    };
  }
}
