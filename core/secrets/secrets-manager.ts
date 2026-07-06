/**
 * SecretsManager — secret/credential lifecycle metadata (never stores secret
 * values): rotation scheduling, versioning, access grants, and stale-secret
 * detection.
 *
 * Events:
 *   - "secret.created": { secretId, name, rotationDays }
 *   - "secret.rotated": { secretId, version }
 *   - "secret.rotation_overdue": { secretId, name, daysOverdue }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SecretType = "api_key" | "password" | "certificate" | "token" | "ssh_key" | "connection_string";

export interface SecretMeta {
  id: string;
  name: string;
  type: SecretType;
  version: number;
  rotationDays: number;
  lastRotatedAt: string;
  nextRotationAt: string;
  grantedTo: Set<string>;
  createdAt: string;
}

export interface SecretsSummary {
  totalSecrets: number;
  overdue: number;
  dueSoon: number;
  byType: Partial<Record<SecretType, number>>;
}

export class SecretsManager {
  private secrets: Map<string, SecretMeta> = new Map();

  constructor(private readonly bus: EventBus) {}

  private nextRotation(from: string, rotationDays: number): string {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + rotationDays);
    return d.toISOString();
  }

  create(input: { name: string; type: SecretType; rotationDays: number; createdAt: string }): SecretMeta {
    const secret: SecretMeta = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      version: 1,
      rotationDays: input.rotationDays,
      lastRotatedAt: input.createdAt,
      nextRotationAt: this.nextRotation(input.createdAt, input.rotationDays),
      grantedTo: new Set(),
      createdAt: input.createdAt,
    };
    this.secrets.set(secret.id, secret);
    this.bus.publish("secret.created", { secretId: secret.id, name: secret.name, rotationDays: secret.rotationDays });
    return secret;
  }

  rotate(secretId: string, asOf: string): SecretMeta | undefined {
    const s = this.secrets.get(secretId);
    if (!s) return undefined;
    s.version += 1;
    s.lastRotatedAt = asOf;
    s.nextRotationAt = this.nextRotation(asOf, s.rotationDays);
    this.bus.publish("secret.rotated", { secretId, version: s.version });
    return s;
  }

  grant(secretId: string, principalId: string): SecretMeta | undefined {
    const s = this.secrets.get(secretId);
    if (!s) return undefined;
    s.grantedTo.add(principalId);
    return s;
  }

  revoke(secretId: string, principalId: string): SecretMeta | undefined {
    const s = this.secrets.get(secretId);
    if (!s) return undefined;
    s.grantedTo.delete(principalId);
    return s;
  }

  /** Emit overdue events for secrets past their next rotation date. */
  checkRotations(asOf: string): SecretMeta[] {
    const now = new Date(asOf).getTime();
    const overdue = Array.from(this.secrets.values()).filter(s => new Date(s.nextRotationAt).getTime() < now);
    for (const s of overdue) {
      const daysOverdue = Math.floor((now - new Date(s.nextRotationAt).getTime()) / 86400000);
      this.bus.publish("secret.rotation_overdue", { secretId: s.id, name: s.name, daysOverdue });
    }
    return overdue;
  }

  getSecret(id: string): SecretMeta | undefined { return this.secrets.get(id); }
  listSecrets(type?: SecretType): SecretMeta[] {
    const all = Array.from(this.secrets.values());
    return type ? all.filter(s => s.type === type) : all;
  }

  summary(asOf?: string): SecretsSummary {
    const secrets = Array.from(this.secrets.values());
    const ref = asOf ? new Date(asOf).getTime() : Date.now();
    const byType: Partial<Record<SecretType, number>> = {};
    for (const s of secrets) { byType[s.type] = (byType[s.type] ?? 0) + 1; }
    return {
      totalSecrets: secrets.length,
      overdue: secrets.filter(s => new Date(s.nextRotationAt).getTime() < ref).length,
      dueSoon: secrets.filter(s => { const diff = (new Date(s.nextRotationAt).getTime() - ref) / 86400000; return diff >= 0 && diff <= 14; }).length,
      byType,
    };
  }
}
