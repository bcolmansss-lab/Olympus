/**
 * ApiKeyManager — developer API credential lifecycle: key issuance with
 * scopes, prefix-based lookup, rotation, revocation, and last-used tracking.
 *
 * Events:
 *   - "apikey.issued": { keyId, ownerId, scopes }
 *   - "apikey.rotated": { keyId, newPrefix }
 *   - "apikey.revoked": { keyId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ApiKeyStatus = "active" | "revoked";

export interface DeveloperApiKey {
  id: string;
  ownerId: string;
  label: string;
  prefix: string; // public identifier (first chars)
  scopes: string[];
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface ApiKeySummary {
  totalKeys: number;
  active: number;
  revoked: number;
  expiringIn30Days: number;
  byScope: Record<string, number>;
}

export class ApiKeyManager {
  private keys: Map<string, DeveloperApiKey> = new Map();
  private byPrefix: Map<string, string> = new Map();
  private seq = 0;

  constructor(private readonly bus: EventBus) {}

  private nextPrefix(): string {
    this.seq += 1;
    return `ak_${this.seq.toString(36).padStart(6, "0")}`;
  }

  issue(ownerId: string, label: string, scopes: string[], expiresAt?: string): DeveloperApiKey {
    const prefix = this.nextPrefix();
    const key: DeveloperApiKey = { id: randomUUID(), ownerId, label, prefix, scopes, status: "active", createdAt: new Date().toISOString(), expiresAt };
    this.keys.set(key.id, key);
    this.byPrefix.set(prefix, key.id);
    this.bus.publish("apikey.issued", { keyId: key.id, ownerId, scopes });
    return key;
  }

  /** Resolve a key by prefix and record usage; returns undefined if invalid/expired/revoked. */
  authenticate(prefix: string, asOf: string): DeveloperApiKey | undefined {
    const id = this.byPrefix.get(prefix);
    if (!id) return undefined;
    const key = this.keys.get(id)!;
    if (key.status !== "active") return undefined;
    if (key.expiresAt && new Date(asOf).getTime() > new Date(key.expiresAt).getTime()) return undefined;
    key.lastUsedAt = asOf;
    return key;
  }

  hasScope(prefix: string, scope: string): boolean {
    const id = this.byPrefix.get(prefix);
    if (!id) return false;
    const key = this.keys.get(id)!;
    return key.status === "active" && (key.scopes.includes(scope) || key.scopes.includes("*"));
  }

  rotate(keyId: string): DeveloperApiKey | undefined {
    const key = this.keys.get(keyId);
    if (!key || key.status !== "active") return undefined;
    this.byPrefix.delete(key.prefix);
    key.prefix = this.nextPrefix();
    this.byPrefix.set(key.prefix, key.id);
    this.bus.publish("apikey.rotated", { keyId, newPrefix: key.prefix });
    return key;
  }

  revoke(keyId: string): DeveloperApiKey | undefined {
    const key = this.keys.get(keyId);
    if (!key) return undefined;
    key.status = "revoked";
    this.bus.publish("apikey.revoked", { keyId });
    return key;
  }

  getKey(id: string): DeveloperApiKey | undefined { return this.keys.get(id); }
  listKeys(ownerId?: string, status?: ApiKeyStatus): DeveloperApiKey[] {
    let all = Array.from(this.keys.values());
    if (ownerId) all = all.filter(k => k.ownerId === ownerId);
    if (status) all = all.filter(k => k.status === status);
    return all;
  }

  summary(asOf?: string): ApiKeySummary {
    const keys = Array.from(this.keys.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const byScope: Record<string, number> = {};
    for (const k of keys) { for (const sc of k.scopes) { byScope[sc] = (byScope[sc] ?? 0) + 1; } }
    const expiring = keys.filter(k => k.status === "active" && k.expiresAt && (new Date(k.expiresAt).getTime() - ref) / 86400000 <= 30 && new Date(k.expiresAt).getTime() >= ref).length;
    return {
      totalKeys: keys.length,
      active: keys.filter(k => k.status === "active").length,
      revoked: keys.filter(k => k.status === "revoked").length,
      expiringIn30Days: expiring,
      byScope,
    };
  }
}
