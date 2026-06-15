/**
 * Memory architecture — six-layer memory system (BLUEPRINT.md §9).
 *
 * Layers:
 *   Episodic   — specific events as they happened (immutable, append-only log)
 *   Semantic   — generalized facts extracted from episodic streams
 *   Procedural — how-to / workflows (named skill sequences)
 *   Strategic  — long-horizon goals, bets, theses
 *   Operational— current live state (hot projection, rebuilt from log)
 *   Decision   — first-class Decision nodes + outcomes (lives in OKG; referenced here)
 *
 * Consolidation engine:
 *   - Nightly (or on-demand) promotes episodic episodes → semantic facts via
 *     simple pattern extraction (production: an LLM pass over clustered episodes).
 *   - Hebbian edge-weight reinforcement: repeated exposure strengthens; disuse decays.
 *   - Conflict detection: contradictory semantic facts route to the Synthesis agent.
 *   - Decision reconciliation feeds the calibration flywheel.
 */

import type { EventBus } from "../events/event-bus.js";
import type { UUID, Timestamp } from "../knowledge/graph/schema.js";

// ---------------------------------------------------------------------------
// Episodic memory — immutable event log
// ---------------------------------------------------------------------------

export interface Episode {
  id: UUID;
  ts: Timestamp;
  domain: string;
  /** Human-readable summary of what happened. */
  description: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Semantic memory — extracted generalizations
// ---------------------------------------------------------------------------

export interface SemanticFact {
  id: UUID;
  subject: string;
  predicate: string;
  object: string;
  /** Confidence/strength in [0, 1]; decays with disuse, reinforced on observation. */
  weight: number;
  /** How many episodes have reinforced this fact. */
  observationCount: number;
  firstSeen: Timestamp;
  lastSeen: Timestamp;
  /** Contradicted by another fact id — routes to Synthesis agent for resolution. */
  contradictedBy?: UUID;
}

// ---------------------------------------------------------------------------
// Procedural memory — named skill sequences
// ---------------------------------------------------------------------------

export interface ProcedureStep {
  action: string;
  params?: Record<string, unknown>;
}

export interface Procedure {
  id: UUID;
  name: string;
  description: string;
  steps: ProcedureStep[];
  usageCount: number;
  lastUsed: Timestamp;
}

// ---------------------------------------------------------------------------
// Strategic memory — long-range objectives & bets
// ---------------------------------------------------------------------------

export interface StrategicThesis {
  id: UUID;
  title: string;
  rationale: string;
  horizon: Timestamp;
  /** Confidence in [0, 1]. */
  confidence: number;
  status: "active" | "validated" | "invalidated";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Calibration record — predicted vs actual, feeds the flywheel
// ---------------------------------------------------------------------------

export interface CalibrationRecord {
  decisionId: UUID;
  domain: string;
  predictedMetric: string;
  predicted: number;
  actual: number;
  error: number;       // actual - predicted
  absError: number;    // |error|
  recordedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Memory store — single home for all six layers
// ---------------------------------------------------------------------------

export interface MemoryStats {
  episodeCount: number;
  semanticFactCount: number;
  procedureCount: number;
  strategicThesisCount: number;
  calibrationRecordCount: number;
  avgCalibrationError: number | null;
}

export class MemoryStore {
  private readonly episodes: Episode[] = [];
  private readonly semanticFacts = new Map<UUID, SemanticFact>();
  private readonly procedures = new Map<string, Procedure>();
  private readonly theses = new Map<UUID, StrategicThesis>();
  private readonly calibration: CalibrationRecord[] = [];

  constructor(private readonly bus?: EventBus) {}

  // -- Episodic ------------------------------------------------------------

  recordEpisode(ep: Omit<Episode, "id">): Episode {
    const episode: Episode = { id: crypto.randomUUID(), ...ep };
    this.episodes.push(episode);
    this.bus?.publish("memory.episode.recorded", { id: episode.id, domain: episode.domain });
    return episode;
  }

  episodesSince(since: Timestamp, domain?: string): Episode[] {
    return this.episodes.filter(
      (e) => e.ts >= since && (domain === undefined || e.domain === domain),
    );
  }

  // -- Semantic ------------------------------------------------------------

  assertFact(subj: string, pred: string, obj: string, weight = 0.7): SemanticFact {
    // Stable key so the same (subj, pred, obj) tuple is idempotent — reinforced, not duplicated.
    const key = `${subj}|${pred}|${obj}`;
    const now = new Date().toISOString();
    const existing = [...this.semanticFacts.values()].find(
      (f) => f.subject === subj && f.predicate === pred && f.object === obj,
    );
    if (existing) {
      existing.weight = Math.min(1, existing.weight + 0.05);  // Hebbian reinforcement
      existing.observationCount += 1;
      existing.lastSeen = now;
      this.bus?.publish("memory.semantic.reinforced", { id: existing.id, weight: existing.weight });
      return existing;
    }

    // Check for contradictions: same (subj, pred) but different object.
    const contradict = [...this.semanticFacts.values()].find(
      (f) => f.subject === subj && f.predicate === pred && f.object !== obj,
    );

    const fact: SemanticFact = {
      id: crypto.randomUUID(),
      subject: subj,
      predicate: pred,
      object: obj,
      weight,
      observationCount: 1,
      firstSeen: now,
      lastSeen: now,
      contradictedBy: contradict?.id,
    };
    if (contradict) {
      contradict.contradictedBy = fact.id;
      this.bus?.publish("memory.semantic.conflict", { a: fact.id, b: contradict.id, subject: subj, predicate: pred });
    }
    this.semanticFacts.set(key, fact);
    this.bus?.publish("memory.semantic.asserted", { id: fact.id });
    return fact;
  }

  /** Decay all semantic fact weights; call periodically (simulated nightly). */
  decay(rate = 0.01): void {
    for (const f of this.semanticFacts.values()) {
      f.weight = Math.max(0.01, f.weight - rate);
    }
    this.bus?.publish("memory.semantic.decayed", { count: this.semanticFacts.size });
  }

  factsAbout(subject: string): SemanticFact[] {
    return [...this.semanticFacts.values()].filter((f) => f.subject === subject);
  }

  conflicts(): SemanticFact[] {
    return [...this.semanticFacts.values()].filter((f) => f.contradictedBy !== undefined);
  }

  // -- Procedural ----------------------------------------------------------

  registerProcedure(proc: Omit<Procedure, "id" | "usageCount" | "lastUsed">): Procedure {
    const now = new Date().toISOString();
    const stored: Procedure = {
      id: crypto.randomUUID(),
      ...proc,
      usageCount: 0,
      lastUsed: now,
    };
    this.procedures.set(proc.name, stored);
    this.bus?.publish("memory.procedure.registered", { name: proc.name });
    return stored;
  }

  invokeProce(name: string): Procedure | undefined {
    const p = this.procedures.get(name);
    if (p) {
      p.usageCount += 1;
      p.lastUsed = new Date().toISOString();
      this.bus?.publish("memory.procedure.invoked", { name });
    }
    return p;
  }

  // -- Strategic -----------------------------------------------------------

  addThesis(t: Omit<StrategicThesis, "id" | "createdAt" | "updatedAt">): StrategicThesis {
    const now = new Date().toISOString();
    const thesis: StrategicThesis = { id: crypto.randomUUID(), ...t, createdAt: now, updatedAt: now };
    this.theses.set(thesis.id, thesis);
    this.bus?.publish("memory.strategic.thesis_added", { id: thesis.id, title: thesis.title });
    return thesis;
  }

  updateThesis(id: UUID, patch: Partial<Pick<StrategicThesis, "confidence" | "status">>): void {
    const t = this.theses.get(id);
    if (!t) throw new Error(`Thesis ${id} not found`);
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    this.bus?.publish("memory.strategic.thesis_updated", { id, ...patch });
  }

  activeTheses(): StrategicThesis[] {
    return [...this.theses.values()].filter((t) => t.status === "active");
  }

  // -- Calibration flywheel ------------------------------------------------

  recordCalibration(rec: Omit<CalibrationRecord, "absError" | "recordedAt">): CalibrationRecord {
    const full: CalibrationRecord = {
      ...rec,
      absError: Math.abs(rec.error),
      recordedAt: new Date().toISOString(),
    };
    this.calibration.push(full);
    this.bus?.publish("memory.calibration.recorded", {
      decisionId: rec.decisionId,
      domain: rec.domain,
      absError: full.absError,
    });
    return full;
  }

  /** Mean absolute error per domain — tells you which agents need recalibration. */
  maeByDomain(): Record<string, number> {
    const groups: Record<string, number[]> = {};
    for (const r of this.calibration) {
      (groups[r.domain] ??= []).push(r.absError);
    }
    const result: Record<string, number> = {};
    for (const [d, errs] of Object.entries(groups)) {
      result[d] = Math.round((errs.reduce((s, e) => s + e, 0) / errs.length) * 1000) / 1000;
    }
    return result;
  }

  // -- Consolidation -------------------------------------------------------

  /**
   * Consolidation pass: extract semantic facts from recent episodic events.
   * Production: LLM clustering over episode embeddings; here: pattern matching.
   */
  consolidate(since: Timestamp): { extracted: number; conflicts: number } {
    const eps = this.episodesSince(since);
    let extracted = 0;
    for (const ep of eps) {
      // Pattern: "X metric averaged N units" type episodes -> semantic fact.
      const m = ep.description.match(/^(\w[\w\s]+ (?:averaged?|is approximately)) ([\d.]+\s?\w+)$/i);
      if (m) {
        this.assertFact(ep.domain, "has_average", m[2] ?? "");
        extracted++;
      }
      // Any episode adds a temporal semantic fact that the domain was active.
      this.assertFact(ep.domain, "was_active_on", ep.ts.slice(0, 10));
    }
    const conflictCount = this.conflicts().length;
    this.bus?.publish("memory.consolidation.completed", { since, extracted, conflicts: conflictCount });
    return { extracted, conflicts: conflictCount };
  }

  stats(): MemoryStats {
    const errs = this.calibration.map((r) => r.absError);
    return {
      episodeCount: this.episodes.length,
      semanticFactCount: this.semanticFacts.size,
      procedureCount: this.procedures.size,
      strategicThesisCount: this.theses.size,
      calibrationRecordCount: this.calibration.length,
      avgCalibrationError: errs.length ? errs.reduce((s, e) => s + e, 0) / errs.length : null,
    };
  }
}
