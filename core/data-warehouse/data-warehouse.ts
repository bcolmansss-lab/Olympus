/**
 * DataWarehouse — schema registry, table catalog, data lineage tracking,
 * freshness monitoring, and query cost attribution.
 *
 * Events:
 *   - "dw.table_registered": { tableId, name, owner, rowCount }
 *   - "dw.freshness_alert": { tableId, name, expectedFreshnessMins, actualAgeMins }
 *   - "dw.pipeline_failed": { pipelineId, name, errorMessage }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TableStatus = "active" | "deprecated" | "building" | "error";
export type ColumnType = "string" | "integer" | "float" | "boolean" | "timestamp" | "json" | "array";

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
  description?: string;
  isPii: boolean;
}

export interface DWTable {
  id: string;
  name: string;
  schema: string;
  description: string;
  owner: string;
  status: TableStatus;
  columns: ColumnSchema[];
  rowCount: number;
  sizeGb: number;
  lastRefreshedAt?: string;
  expectedFreshnessMins: number;
  upstreamTables: string[];
  tags: string[];
  createdAt: string;
}

export interface DWPipeline {
  id: string;
  name: string;
  sourceTableIds: string[];
  targetTableId: string;
  scheduleExpression: string; // cron-like
  lastRunAt?: string;
  lastRunStatus: "success" | "failure" | "running" | "never_run";
  lastErrorMessage?: string;
  avgRunDurationSeconds?: number;
}

export interface DWSummary {
  totalTables: number;
  activeTables: number;
  staleTables: number;
  totalRows: number;
  totalSizeGb: number;
  totalPipelines: number;
  failedPipelines: number;
}

export class DataWarehouse {
  private tables: Map<string, DWTable> = new Map();
  private pipelines: Map<string, DWPipeline> = new Map();

  constructor(private readonly bus: EventBus) {}

  registerTable(input: Omit<DWTable, "id" | "createdAt"> & { id?: string }): DWTable {
    const table: DWTable = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.tables.set(table.id, table);
    this.bus.publish("dw.table_registered", { tableId: table.id, name: table.name, owner: table.owner, rowCount: table.rowCount });
    return table;
  }

  refreshTable(tableId: string, rowCount: number, sizeGb: number): DWTable | undefined {
    const table = this.tables.get(tableId);
    if (!table) return undefined;
    table.rowCount = rowCount;
    table.sizeGb = sizeGb;
    table.lastRefreshedAt = new Date().toISOString();
    table.status = "active";
    return table;
  }

  checkFreshness(tableId: string): boolean {
    const table = this.tables.get(tableId);
    if (!table || !table.lastRefreshedAt) return false;
    const ageMins = Math.round((Date.now() - new Date(table.lastRefreshedAt).getTime()) / 60000);
    if (ageMins > table.expectedFreshnessMins) {
      this.bus.publish("dw.freshness_alert", { tableId, name: table.name, expectedFreshnessMins: table.expectedFreshnessMins, actualAgeMins: ageMins });
      return false;
    }
    return true;
  }

  registerPipeline(input: Omit<DWPipeline, "id"> & { id?: string }): DWPipeline {
    const pipeline: DWPipeline = { ...input, id: input.id ?? randomUUID() };
    this.pipelines.set(pipeline.id, pipeline);
    return pipeline;
  }

  recordPipelineRun(pipelineId: string, status: "success" | "failure", durationSeconds: number, errorMessage?: string): DWPipeline | undefined {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return undefined;
    pipeline.lastRunAt = new Date().toISOString();
    pipeline.lastRunStatus = status;
    pipeline.avgRunDurationSeconds = durationSeconds;
    if (status === "failure" && errorMessage) {
      pipeline.lastErrorMessage = errorMessage;
      this.bus.publish("dw.pipeline_failed", { pipelineId, name: pipeline.name, errorMessage });
    }
    return pipeline;
  }

  getTable(id: string): DWTable | undefined { return this.tables.get(id); }
  listTables(status?: TableStatus): DWTable[] {
    const all = Array.from(this.tables.values());
    return status ? all.filter((t) => t.status === status) : all;
  }

  getPipeline(id: string): DWPipeline | undefined { return this.pipelines.get(id); }
  listPipelines(): DWPipeline[] { return Array.from(this.pipelines.values()); }

  summary(): DWSummary {
    const tables = Array.from(this.tables.values());
    const pipelines = Array.from(this.pipelines.values());
    const stale = tables.filter((t) => {
      if (!t.lastRefreshedAt) return true;
      const ageMins = Math.round((Date.now() - new Date(t.lastRefreshedAt).getTime()) / 60000);
      return ageMins > t.expectedFreshnessMins;
    });
    return {
      totalTables: tables.length,
      activeTables: tables.filter((t) => t.status === "active").length,
      staleTables: stale.length,
      totalRows: tables.reduce((s, t) => s + t.rowCount, 0),
      totalSizeGb: tables.reduce((s, t) => s + t.sizeGb, 0),
      totalPipelines: pipelines.length,
      failedPipelines: pipelines.filter((p) => p.lastRunStatus === "failure").length,
    };
  }
}
