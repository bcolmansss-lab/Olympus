/**
 * LocalizationManager — translation projects, per-locale string keys,
 * translation/review workflow, and locale coverage analytics.
 *
 * Events:
 *   - "localization.project_created": { projectId, name, sourceLocale }
 *   - "localization.locale_added": { projectId, locale }
 *   - "localization.string_translated": { projectId, locale, key }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TranslationState = "untranslated" | "translated" | "reviewed";

export interface TranslationEntry {
  key: string;
  value: string;
  state: TranslationState;
  updatedAt: string;
}

export interface LocaleBundle {
  locale: string;
  entries: Map<string, TranslationEntry>;
}

export interface LocalizationProject {
  id: string;
  name: string;
  sourceLocale: string;
  keys: Set<string>;
  locales: Map<string, LocaleBundle>;
  createdAt: string;
}

export interface LocaleCoverage {
  locale: string;
  totalKeys: number;
  translated: number;
  reviewed: number;
  coveragePct: number;
}

export interface LocalizationSummary {
  totalProjects: number;
  totalKeys: number;
  totalLocales: number;
  coverage: LocaleCoverage[];
}

export class LocalizationManager {
  private projects: Map<string, LocalizationProject> = new Map();

  constructor(private readonly bus: EventBus) {}

  createProject(name: string, sourceLocale: string): LocalizationProject {
    const project: LocalizationProject = { id: randomUUID(), name, sourceLocale, keys: new Set(), locales: new Map(), createdAt: new Date().toISOString() };
    this.projects.set(project.id, project);
    this.bus.publish("localization.project_created", { projectId: project.id, name, sourceLocale });
    return project;
  }

  addKey(projectId: string, key: string, sourceValue: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    project.keys.add(key);
    const sourceBundle = this.ensureLocale(project, project.sourceLocale);
    sourceBundle.entries.set(key, { key, value: sourceValue, state: "reviewed", updatedAt: new Date().toISOString() });
    return true;
  }

  private ensureLocale(project: LocalizationProject, locale: string): LocaleBundle {
    let bundle = project.locales.get(locale);
    if (!bundle) {
      bundle = { locale, entries: new Map() };
      project.locales.set(locale, bundle);
    }
    return bundle;
  }

  addLocale(projectId: string, locale: string): boolean {
    const project = this.projects.get(projectId);
    if (!project || project.locales.has(locale)) return false;
    this.ensureLocale(project, locale);
    this.bus.publish("localization.locale_added", { projectId, locale });
    return true;
  }

  translate(projectId: string, locale: string, key: string, value: string): boolean {
    const project = this.projects.get(projectId);
    if (!project || !project.keys.has(key)) return false;
    const bundle = this.ensureLocale(project, locale);
    bundle.entries.set(key, { key, value, state: "translated", updatedAt: new Date().toISOString() });
    this.bus.publish("localization.string_translated", { projectId, locale, key });
    return true;
  }

  review(projectId: string, locale: string, key: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    const entry = project.locales.get(locale)?.entries.get(key);
    if (!entry || entry.state !== "translated") return false;
    entry.state = "reviewed";
    entry.updatedAt = new Date().toISOString();
    return true;
  }

  coverage(projectId: string): LocaleCoverage[] {
    const project = this.projects.get(projectId);
    if (!project) return [];
    const totalKeys = project.keys.size;
    return Array.from(project.locales.values())
      .filter(b => b.locale !== project.sourceLocale)
      .map(b => {
        const entries = Array.from(b.entries.values()).filter(e => project.keys.has(e.key));
        const translated = entries.filter(e => e.state === "translated" || e.state === "reviewed").length;
        const reviewed = entries.filter(e => e.state === "reviewed").length;
        return { locale: b.locale, totalKeys, translated, reviewed, coveragePct: totalKeys > 0 ? Math.round((translated / totalKeys) * 100) : 0 };
      });
  }

  getProject(id: string): LocalizationProject | undefined { return this.projects.get(id); }
  listProjects(): LocalizationProject[] { return Array.from(this.projects.values()); }

  summary(): LocalizationSummary {
    const projects = Array.from(this.projects.values());
    return {
      totalProjects: projects.length,
      totalKeys: projects.reduce((s, p) => s + p.keys.size, 0),
      totalLocales: projects.reduce((s, p) => s + p.locales.size, 0),
      coverage: projects.flatMap(p => this.coverage(p.id)),
    };
  }
}
