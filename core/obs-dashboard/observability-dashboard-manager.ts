/**
 * ObservabilityDashboardManager — metric dashboards: dashboards with widgets
 * bound to metrics, latest-value ingestion, threshold breach evaluation, and
 * health rollup.
 *
 * Events:
 *   - "obsdash.created": { dashboardId, name }
 *   - "obsdash.threshold_breached": { widgetId, metric, value, threshold }
 *   - "obsdash.recovered": { widgetId, metric, value }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type Comparator = "gt" | "lt";
export type WidgetHealth = "ok" | "breached" | "no_data";

export interface Widget {
  id: string;
  title: string;
  metric: string;
  comparator: Comparator;
  threshold: number;
  latestValue?: number;
  health: WidgetHealth;
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
  createdAt: string;
}

export interface DashboardSummary {
  totalDashboards: number;
  totalWidgets: number;
  breachedWidgets: number;
  healthyWidgets: number;
  noDataWidgets: number;
}

export class ObservabilityDashboardManager {
  private dashboards: Map<string, Dashboard> = new Map();

  constructor(private readonly bus: EventBus) {}

  createDashboard(name: string): Dashboard {
    const dashboard: Dashboard = { id: randomUUID(), name, widgets: [], createdAt: new Date().toISOString() };
    this.dashboards.set(dashboard.id, dashboard);
    this.bus.publish("obsdash.created", { dashboardId: dashboard.id, name });
    return dashboard;
  }

  addWidget(dashboardId: string, input: { title: string; metric: string; comparator: Comparator; threshold: number }): Widget | undefined {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return undefined;
    const widget: Widget = { ...input, id: randomUUID(), health: "no_data" };
    dashboard.widgets.push(widget);
    return widget;
  }

  private breached(widget: Widget, value: number): boolean {
    return widget.comparator === "gt" ? value > widget.threshold : value < widget.threshold;
  }

  /** Push a metric value; updates all widgets bound to that metric across dashboards. */
  ingestMetric(metric: string, value: number): number {
    let updated = 0;
    for (const dashboard of this.dashboards.values()) {
      for (const widget of dashboard.widgets) {
        if (widget.metric !== metric) continue;
        const wasBreached = widget.health === "breached";
        widget.latestValue = value;
        const nowBreached = this.breached(widget, value);
        widget.health = nowBreached ? "breached" : "ok";
        updated += 1;
        if (nowBreached && !wasBreached) {
          this.bus.publish("obsdash.threshold_breached", { widgetId: widget.id, metric, value, threshold: widget.threshold });
        } else if (!nowBreached && wasBreached) {
          this.bus.publish("obsdash.recovered", { widgetId: widget.id, metric, value });
        }
      }
    }
    return updated;
  }

  dashboardHealth(dashboardId: string): WidgetHealth {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard || dashboard.widgets.length === 0) return "no_data";
    if (dashboard.widgets.some(w => w.health === "breached")) return "breached";
    if (dashboard.widgets.every(w => w.health === "no_data")) return "no_data";
    return "ok";
  }

  getDashboard(id: string): Dashboard | undefined { return this.dashboards.get(id); }
  listDashboards(): Dashboard[] { return Array.from(this.dashboards.values()); }

  summary(): DashboardSummary {
    const dashboards = Array.from(this.dashboards.values());
    const widgets = dashboards.flatMap(d => d.widgets);
    return {
      totalDashboards: dashboards.length,
      totalWidgets: widgets.length,
      breachedWidgets: widgets.filter(w => w.health === "breached").length,
      healthyWidgets: widgets.filter(w => w.health === "ok").length,
      noDataWidgets: widgets.filter(w => w.health === "no_data").length,
    };
  }
}
