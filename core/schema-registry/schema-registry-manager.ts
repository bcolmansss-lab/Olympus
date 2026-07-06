/**
 * SchemaRegistryManager — event/message schema registry: named subjects with
 * versioned field definitions, additive-only compatibility checking, and
 * consumer registration for impact analysis.
 *
 * Events:
 *   - "schemaregistry.registered": { subject, version }
 *   - "schemaregistry.incompatible": { subject, reason }
 *   - "schemaregistry.deprecated": { subject, version }
 */
import type { EventBus } from "../events/event-bus.js";

export interface FieldDef {
  name: string;
  type: string; // "string" | "number" | "boolean" | ...
  required: boolean;
}

export interface SchemaVersion {
  version: number;
  fields: FieldDef[];
  deprecated: boolean;
  registeredAt: string;
}

export interface Subject {
  subject: string;
  versions: SchemaVersion[];
  consumers: Set<string>;
}

export interface SchemaRegistrySummary {
  totalSubjects: number;
  totalVersions: number;
  deprecatedVersions: number;
  totalConsumers: number;
}

export class SchemaRegistryManager {
  private subjects: Map<string, Subject> = new Map();

  constructor(private readonly bus: EventBus) {}

  /** Register a new version; enforces backwards compatibility (no removing/retyping fields, new fields optional). */
  register(subjectName: string, fields: FieldDef[], asOf: string): SchemaVersion | undefined {
    let subject = this.subjects.get(subjectName);
    if (!subject) {
      subject = { subject: subjectName, versions: [], consumers: new Set() };
      this.subjects.set(subjectName, subject);
    }
    const latest = subject.versions[subject.versions.length - 1];
    if (latest) {
      for (const prev of latest.fields) {
        const next = fields.find(f => f.name === prev.name);
        if (!next) {
          this.bus.publish("schemaregistry.incompatible", { subject: subjectName, reason: `field removed: ${prev.name}` });
          return undefined;
        }
        if (next.type !== prev.type) {
          this.bus.publish("schemaregistry.incompatible", { subject: subjectName, reason: `field retyped: ${prev.name}` });
          return undefined;
        }
      }
      for (const next of fields) {
        const prev = latest.fields.find(f => f.name === next.name);
        if (!prev && next.required) {
          this.bus.publish("schemaregistry.incompatible", { subject: subjectName, reason: `new required field: ${next.name}` });
          return undefined;
        }
      }
    }
    const version: SchemaVersion = { version: subject.versions.length + 1, fields, deprecated: false, registeredAt: asOf };
    subject.versions.push(version);
    this.bus.publish("schemaregistry.registered", { subject: subjectName, version: version.version });
    return version;
  }

  deprecate(subjectName: string, version: number): boolean {
    const subject = this.subjects.get(subjectName);
    const v = subject?.versions.find(x => x.version === version);
    if (!v || v.deprecated) return false;
    v.deprecated = true;
    this.bus.publish("schemaregistry.deprecated", { subject: subjectName, version });
    return true;
  }

  addConsumer(subjectName: string, consumerId: string): boolean {
    const subject = this.subjects.get(subjectName);
    if (!subject) return false;
    subject.consumers.add(consumerId);
    return true;
  }

  /** Validate a payload against the latest non-deprecated version. */
  validate(subjectName: string, payload: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const subject = this.subjects.get(subjectName);
    const latest = subject?.versions.filter(v => !v.deprecated).slice(-1)[0];
    if (!latest) return { valid: false, errors: ["no schema registered"] };
    const errors: string[] = [];
    for (const field of latest.fields) {
      const value = payload[field.name];
      if (field.required && value === undefined) errors.push(`missing required field: ${field.name}`);
      else if (value !== undefined && typeof value !== field.type) errors.push(`wrong type for ${field.name}: expected ${field.type}`);
    }
    return { valid: errors.length === 0, errors };
  }

  latest(subjectName: string): SchemaVersion | undefined {
    return this.subjects.get(subjectName)?.versions.slice(-1)[0];
  }
  getSubject(name: string): Subject | undefined { return this.subjects.get(name); }
  listSubjects(): Subject[] { return Array.from(this.subjects.values()); }

  summary(): SchemaRegistrySummary {
    const subjects = Array.from(this.subjects.values());
    const versions = subjects.flatMap(s => s.versions);
    return {
      totalSubjects: subjects.length,
      totalVersions: versions.length,
      deprecatedVersions: versions.filter(v => v.deprecated).length,
      totalConsumers: subjects.reduce((s, x) => s + x.consumers.size, 0),
    };
  }
}
