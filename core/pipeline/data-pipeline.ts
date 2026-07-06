/**
 * DataPipelineManager — ingestion sources, transformation rules, lineage tracking, quality scoring.
 *
 * Concepts:
 *   - Source: an external data origin (database, API, file, stream)
 *   - Pipeline: ordered chain of source → transforms → sink
 *   - Run: a single execution of a pipeline with metrics (rows, errors, duration)
 *   - Lineage: which pipelines produced/consumed which datasets
 *   - Quality: completeness, freshness, validity scores per dataset
 *
 * Events:
 *   - "pipeline.run_completed": { pipelineId, runId, rowsProcessed, errorCount, durationMs }
 *   - "pipeline.run_failed": { pipelineId, runId, error }
 *   - "pipeline.quality_alert": { datasetId, dimension, score, threshold }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SourceType = "postgres" | "mysql" | "bigquery" | "s3" | "api" | "kafka" | "csv" | "webhook";
export type PipelineStatus = "active" | "paused" | "deprecated";
export type RunStatus = "running" | "completed" | "failed" | "cancelled";
export type QualityDimension = "completeness" | "freshness" | "validity" | "uniqueness" | "consistency";

export interface DataSource {
  id: string;
  name: string;
  type: SourceType;
  connectionString?: string;
  schema?: string;
  table?: string;
  tags?: string[];
  createdAt: string;
}

export interface Transform {
  id: string;
  name: string;
  type: "filter" | "map" | "aggregate" | "join" | "deduplicate" | "validate" | "enrich";
  description: string;
  config?: Record<string, unknown>;
}

export interface DataPipeline {
  id: string;
  name: string;
  description: string;
  sourceId: string;
  sinkDatasetId: string;
  transforms: Transform[];
  status: PipelineStatus;
  scheduleExpression?: string;
  createdAt: string;
  lastRunAt?: string;
  tags?: string[];
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  rowsRead: number;
  rowsWritten: number;
  rowsErrored: number;
  error?: string;
}

export interface DataQualityScore {
  datasetId: string;
  measuredAt: string;
  scores: Record<QualityDimension, number>;
  overallScore: number;
  issues: string[];
}

export interface LineageNode {
  datasetId: string;
  producedBy: string[];
  consumedBy: string[];
}

export interface PipelineSummary {
  totalPipelines: number;
  activePipelines: number;
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  datasets: number;
  avgQualityScore: number;
}

export class DataPipelineManager {
  private readonly sources = new Map<string, DataSource>();
  private readonly pipelines = new Map<string, DataPipeline>();
  private readonly runs = new Map<string, PipelineRun>();
  private readonly qualityScores = new Map<string, DataQualityScore>();
  private readonly lineage = new Map<string, LineageNode>();

  constructor(private readonly bus: EventBus) {}

  addSource(input: Omit<DataSource, "id" | "createdAt"> & { id?: string }): DataSource {
    const source: DataSource = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.sources.set(source.id, source);
    return source;
  }

  addPipeline(input: Omit<DataPipeline, "id" | "createdAt" | "transforms"> & { id?: string; transforms?: Transform[] }): DataPipeline {
    const pipeline: DataPipeline = {
      ...input,
      id: input.id ?? randomUUID(),
      transforms: input.transforms ?? [],
      createdAt: new Date().toISOString(),
    };
    this.pipelines.set(pipeline.id, pipeline);
    return pipeline;
  }

  recordRun(
    pipelineId: string,
    run: { rowsRead: number; rowsWritten: number; rowsErrored?: number; durationMs: number; status?: RunStatus; error?: string },
  ): PipelineRun {
    const runId = randomUUID();
    const now = new Date().toISOString();
    const failed = run.status === "failed" || run.error != null;
    const status: RunStatus = run.status ?? (failed ? "failed" : "completed");

    const pipelineRun: PipelineRun = {
      id: runId,
      pipelineId,
      status,
      startedAt: now,
      completedAt: now,
      durationMs: run.durationMs,
      rowsRead: run.rowsRead,
      rowsWritten: run.rowsWritten,
      rowsErrored: run.rowsErrored ?? 0,
      error: run.error,
    };
    this.runs.set(runId, pipelineRun);

    const pipeline = this.pipelines.get(pipelineId);
    if (pipeline) {
      pipeline.lastRunAt = now;

      // Update lineage
      const sinkId = pipeline.sinkDatasetId;
      if (!this.lineage.has(sinkId)) {
        this.lineage.set(sinkId, { datasetId: sinkId, producedBy: [], consumedBy: [] });
      }
      const sinkNode = this.lineage.get(sinkId)!;
      if (!sinkNode.producedBy.includes(pipelineId)) {
        sinkNode.producedBy.push(pipelineId);
      }

      // The source dataset is consumed by this pipeline
      const sourceId = pipeline.sourceId;
      if (!this.lineage.has(sourceId)) {
        this.lineage.set(sourceId, { datasetId: sourceId, producedBy: [], consumedBy: [] });
      }
      const sourceNode = this.lineage.get(sourceId)!;
      if (!sourceNode.consumedBy.includes(pipelineId)) {
        sourceNode.consumedBy.push(pipelineId);
      }
    }

    if (failed) {
      this.bus.publish("pipeline.run_failed", { pipelineId, runId, error: run.error });
    } else {
      this.bus.publish("pipeline.run_completed", {
        pipelineId,
        runId,
        rowsProcessed: run.rowsWritten,
        errorCount: run.rowsErrored ?? 0,
        durationMs: run.durationMs,
      });
    }

    return pipelineRun;
  }

  recordQuality(datasetId: string, scores: Record<QualityDimension, number>, issues: string[] = []): DataQualityScore {
    const dimensions: QualityDimension[] = ["completeness", "freshness", "validity", "uniqueness", "consistency"];
    const overallScore = dimensions.reduce((sum, d) => sum + scores[d], 0) / dimensions.length;

    const qualityScore: DataQualityScore = {
      datasetId,
      measuredAt: new Date().toISOString(),
      scores,
      overallScore,
      issues,
    };
    this.qualityScores.set(datasetId, qualityScore);

    for (const dimension of dimensions) {
      if (scores[dimension] < 70) {
        this.bus.publish("pipeline.quality_alert", { datasetId, dimension, score: scores[dimension], threshold: 70 });
      }
    }

    return qualityScore;
  }

  getLineage(datasetId: string): LineageNode | undefined {
    return this.lineage.get(datasetId);
  }

  getQuality(datasetId: string): DataQualityScore | undefined {
    return this.qualityScores.get(datasetId);
  }

  listRuns(pipelineId?: string): PipelineRun[] {
    const all = Array.from(this.runs.values());
    return pipelineId ? all.filter(r => r.pipelineId === pipelineId) : all;
  }

  getPipeline(id: string): DataPipeline | undefined {
    return this.pipelines.get(id);
  }

  listPipelines(status?: PipelineStatus): DataPipeline[] {
    const all = Array.from(this.pipelines.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  getSource(id: string): DataSource | undefined {
    return this.sources.get(id);
  }

  listSources(): DataSource[] {
    return Array.from(this.sources.values());
  }

  summary(): PipelineSummary {
    const allPipelines = Array.from(this.pipelines.values());
    const allRuns = Array.from(this.runs.values());
    const completedRuns = allRuns.filter(r => r.status === "completed");

    const successRate = allRuns.length > 0 ? (completedRuns.length / allRuns.length) * 100 : 0;
    const avgDurationMs = completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / completedRuns.length
      : 0;

    const uniqueDatasets = new Set(allPipelines.map(p => p.sinkDatasetId));
    const qualityRecords = Array.from(this.qualityScores.values());
    const avgQualityScore = qualityRecords.length > 0
      ? qualityRecords.reduce((sum, q) => sum + q.overallScore, 0) / qualityRecords.length
      : 0;

    return {
      totalPipelines: allPipelines.length,
      activePipelines: allPipelines.filter(p => p.status === "active").length,
      totalRuns: allRuns.length,
      successRate,
      avgDurationMs,
      datasets: uniqueDatasets.size,
      avgQualityScore,
    };
  }
}
