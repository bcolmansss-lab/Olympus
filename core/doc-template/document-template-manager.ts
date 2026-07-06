/**
 * DocumentTemplateManager — reusable document templates with {{merge_field}}
 * placeholders, versioning, and field-substituted rendering.
 *
 * Events:
 *   - "doctemplate.created": { templateId, name, fieldCount }
 *   - "doctemplate.version_published": { templateId, version }
 *   - "doctemplate.rendered": { templateId, missingFields }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TemplateCategory = "contract" | "letter" | "invoice" | "proposal" | "policy" | "email" | "other";

export interface DocumentTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  body: string;
  version: number;
  fields: string[]; // discovered merge fields
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RenderResult {
  templateId: string;
  output: string;
  missingFields: string[];
  complete: boolean;
}

export interface TemplateSummary {
  totalTemplates: number;
  activeTemplates: number;
  byCategory: Partial<Record<TemplateCategory, number>>;
  totalRenders: number;
}

export class DocumentTemplateManager {
  private templates: Map<string, DocumentTemplate> = new Map();
  private renderCount = 0;

  constructor(private readonly bus: EventBus) {}

  private extractFields(body: string): string[] {
    const matches = body.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
    const fields = matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, ""));
    return Array.from(new Set(fields));
  }

  createTemplate(name: string, category: TemplateCategory, body: string): DocumentTemplate {
    const now = new Date().toISOString();
    const fields = this.extractFields(body);
    const template: DocumentTemplate = { id: randomUUID(), name, category, body, version: 1, fields, active: true, createdAt: now, updatedAt: now };
    this.templates.set(template.id, template);
    this.bus.publish("doctemplate.created", { templateId: template.id, name, fieldCount: fields.length });
    return template;
  }

  publishVersion(templateId: string, newBody: string): DocumentTemplate | undefined {
    const template = this.templates.get(templateId);
    if (!template) return undefined;
    template.body = newBody;
    template.fields = this.extractFields(newBody);
    template.version += 1;
    template.updatedAt = new Date().toISOString();
    this.bus.publish("doctemplate.version_published", { templateId, version: template.version });
    return template;
  }

  setActive(templateId: string, active: boolean): DocumentTemplate | undefined {
    const template = this.templates.get(templateId);
    if (!template) return undefined;
    template.active = active;
    return template;
  }

  render(templateId: string, values: Record<string, string>): RenderResult | undefined {
    const template = this.templates.get(templateId);
    if (!template) return undefined;
    const missingFields = template.fields.filter(f => values[f] === undefined);
    const output = template.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, field: string) => values[field] ?? `{{${field}}}`);
    this.renderCount += 1;
    this.bus.publish("doctemplate.rendered", { templateId, missingFields });
    return { templateId, output, missingFields, complete: missingFields.length === 0 };
  }

  getTemplate(id: string): DocumentTemplate | undefined { return this.templates.get(id); }
  listTemplates(category?: TemplateCategory, activeOnly = false): DocumentTemplate[] {
    let all = Array.from(this.templates.values());
    if (category) all = all.filter(t => t.category === category);
    if (activeOnly) all = all.filter(t => t.active);
    return all;
  }

  summary(): TemplateSummary {
    const templates = Array.from(this.templates.values());
    const byCategory: Partial<Record<TemplateCategory, number>> = {};
    for (const t of templates) { byCategory[t.category] = (byCategory[t.category] ?? 0) + 1; }
    return {
      totalTemplates: templates.length,
      activeTemplates: templates.filter(t => t.active).length,
      byCategory,
      totalRenders: this.renderCount,
    };
  }
}
