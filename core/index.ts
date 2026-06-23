/**
 * Olympus core — composition root.
 *
 * Wires the foundational layers into a single Olympus instance:
 *   event bus -> OKG -> LLM -> memory -> RAG -> twin -> autonomy ->
 *   agent roster -> reasoning engine -> MCP server.
 * The reasoning engine closes the loop: a single ask() flows
 *   reason -> simulate (twin) -> risk veto -> autonomy gate -> (execute | escalate).
 * Swap any implementation (LLM, graph store, bus) behind its interface without
 * touching the layers above.
 */

import { EventBus, type EventSink } from "./events/event-bus.js";
import { OKG } from "./knowledge/graph/okg.js";
import { MockLLM, type LLMClient } from "./llm/client.js";
import { defaultRoster } from "./agents/executive-agent.js";
import type { Agent, AgentContext } from "./agents/types.js";
import { ExecutiveReasoningEngine } from "./reasoning/executive-reasoning-engine.js";
import { OlympusMCPServer } from "./mcp/olympus-mcp-server.js";
import { MemoryStore } from "./memory/memory-store.js";
import { GraphRAG } from "./retrieval/graph-rag.js";
import { AutonomyEngine } from "./autonomy/autonomy-engine.js";
import { DigitalTwin } from "./simulation/digital-twin.js";
import { DecisionInbox } from "./projections/decision-inbox.js";
import { BriefingEngine } from "./briefing/briefing-engine.js";
import { WorkflowEngine } from "./workflow/workflow-engine.js";
import { CalibrationMonitor } from "./autonomy/calibration-monitor.js";
import { AnomalyDetector } from "./anomaly/anomaly-detector.js";
import { PolicyEngine } from "./policy/policy-engine.js";
import { NotificationRouter, InMemoryChannel } from "./notifications/notification-router.js";
import { OKRTracker } from "./goals/okr-tracker.js";
import { CapacityPlanner } from "./capacity/capacity-planner.js";
import { FinancialLedger } from "./finance/ledger.js";
import { SLATracker } from "./contracts/sla-tracker.js";
import { DealPipeline } from "./crm/pipeline.js";
import { RiskRegister } from "./risk/risk-register.js";
import { HealthScorer } from "./health/health-score.js";
import { OutcomeTracker } from "./learning/outcome-tracker.js";
import { BoardReportGenerator } from "./reporting/board-report.js";
import { VendorRegistry } from "./procurement/vendor-registry.js";
import { PeopleRegistry } from "./hr/people-registry.js";
import { SprintTracker } from "./projects/sprint-tracker.js";
import { CustomerSuccessTracker } from "./customer-success/account-health.js";
import { ProductAnalytics } from "./product/index.js";
import { ComplianceTracker } from "./compliance/index.js";
import { CompetitiveIntel } from "./competitive/index.js";
import { IncidentManager } from "./incidents/incident-manager.js";
import { MarketingAttributionEngine } from "./marketing/attribution-engine.js";
import { ForecastEngine } from "./forecasting/forecast-engine.js";
import { DataPipelineManager } from "./pipeline/data-pipeline.js";
import { SupportTicketManager } from "./support/ticket-manager.js";

export interface OlympusOptions {
  llm?: LLMClient;
  roster?: Agent[];
  /** Optional digital twin; when present the reasoning engine simulates interventions. */
  twin?: DigitalTwin;
  /** Optional durable event sink; every event is persisted for replay on restart. */
  sink?: EventSink;
}

export class Olympus {
  readonly bus: EventBus;
  readonly okg: OKG;
  readonly llm: LLMClient;
  readonly roster: Agent[];
  readonly memory: MemoryStore;
  readonly rag: GraphRAG;
  readonly autonomy: AutonomyEngine;
  readonly twin?: DigitalTwin;
  readonly ere: ExecutiveReasoningEngine;
  readonly mcp: OlympusMCPServer;
  /** Read-model projection of decisions needing human attention. */
  readonly inbox: DecisionInbox;
  /** Proactive intelligence — synthesizes the live state into an executive briefing. */
  readonly briefing: BriefingEngine;
  /** Executes procedural memory as autonomy-gated, audited MCP calls. */
  readonly workflow: WorkflowEngine;
  /** Auto-demotes autonomy grants when a domain's predictions drift. */
  readonly calibrationMonitor: CalibrationMonitor;
  /** Watches the event spine for metric anomalies and raises Risk nodes. */
  readonly anomalyDetector: AnomalyDetector;
  /** Operator-defined business rule enforcement at the autonomy gate. */
  readonly policy: PolicyEngine;
  /** Alerting backbone — fans high-signal events out to registered channels. */
  readonly notifications: NotificationRouter;
  /** In-memory alert log wired into the notification router by default. */
  readonly alertLog: InMemoryChannel;
  /** OKR goal tracking layer — tracks objectives and key results from metric.observed events. */
  readonly okr: OKRTracker;
  /** Capacity planner — models team headcount, project demands, and detects overallocation. */
  readonly capacity: CapacityPlanner;
  /** Financial ledger — double-entry bookkeeping, burn rate, and runway projection. */
  readonly ledger: FinancialLedger;
  /** SLA tracker — service level agreement monitoring with breach detection and penalty tracking. */
  readonly sla: SLATracker;
  /** CRM deal pipeline — tracks deals through sales stages with weighted ARR projection. */
  readonly pipeline: DealPipeline;
  /** Risk register — formal risk catalog with P×I scoring, mitigation tracking, and auto-escalation. */
  readonly riskRegister: RiskRegister;
  /** Unified company health index (0–100) aggregating every business module. */
  readonly health: HealthScorer;
  /** Synthesizes every module into a single executive board report in Markdown. */
  readonly boardReport: BoardReportGenerator;
  /** Closes the predict-act-observe-learn loop into the calibration flywheel. */
  readonly outcomes: OutcomeTracker;
  /** Vendor / procurement registry — catalog, contracts, spend tracking, and renewal alerts. */
  readonly vendors: VendorRegistry;
  /** HR / People registry — employee headcount, org structure, and compensation bands. */
  readonly people: PeopleRegistry;
  /** Sprint tracker — project work items, sprints, velocity, and burn-down. */
  readonly sprints: SprintTracker;
  /** Customer success — account health scoring, churn risk, NPS, and QBR cadence. */
  readonly customerSuccess: CustomerSuccessTracker;
  /** Product analytics — feature adoption, gated flags, usage tracking, and milestone events. */
  readonly product: ProductAnalytics;
  /** Compliance tracker — controls, evidence collection, gap detection, and compliance scoring. */
  readonly compliance: ComplianceTracker;
  /** Competitive intelligence — competitor tracking, win/loss analysis, and market signals. */
  readonly competitive: CompetitiveIntel;
  /** Incident manager — production incident lifecycle, post-mortems, and MTTD/MTTA/MTTR metrics. */
  readonly incidents: IncidentManager;
  /** Marketing attribution engine — multi-touch attribution, channel ROI, and campaign performance. */
  readonly marketing: MarketingAttributionEngine;
  /** Financial forecast engine — ARR projections, scenario modeling, and sensitivity analysis. */
  readonly forecasting: ForecastEngine;
  /** Data pipeline manager — ingestion sources, transforms, lineage tracking, and quality scoring. */
  readonly dataPipeline: DataPipelineManager;
  /** Support ticket manager — helpdesk lifecycle, SLA enforcement, CSAT, and agent workload. */
  readonly support: SupportTicketManager;

  constructor(opts: OlympusOptions = {}) {
    this.bus = new EventBus(opts.sink);
    this.okg = new OKG(this.bus);
    this.llm = opts.llm ?? new MockLLM();
    this.roster = opts.roster ?? defaultRoster();
    this.memory = new MemoryStore(this.bus);
    this.outcomes = new OutcomeTracker(this.bus, this.memory);
    this.rag = new GraphRAG(this.okg, this.memory);
    this.autonomy = new AutonomyEngine(this.bus);
    this.twin = opts.twin;

    const ctx: AgentContext = { okg: this.okg, bus: this.bus, llm: this.llm, autonomy: this.autonomy };
    this.ere = new ExecutiveReasoningEngine(this.roster, ctx, this.twin);
    this.mcp = new OlympusMCPServer(this.okg, this.bus);
    this.inbox = new DecisionInbox(this.okg).attach(this.bus);
    this.briefing = new BriefingEngine(this);
    this.workflow = new WorkflowEngine(this.mcp, this.memory, this.bus);
    this.calibrationMonitor = new CalibrationMonitor(this.memory, this.autonomy, this.bus).attach();
    this.anomalyDetector = new AnomalyDetector(this.bus, this.okg).attach();
    this.policy = new PolicyEngine(this.bus);
    this.alertLog = new InMemoryChannel();
    this.notifications = new NotificationRouter(this.bus).addChannel(this.alertLog).attach();
    this.okr = new OKRTracker(this.bus).attach();
    this.capacity = new CapacityPlanner(this.bus);
    this.ledger = new FinancialLedger(this.bus);
    this.sla = new SLATracker(this.bus);
    this.pipeline = new DealPipeline(this.bus);
    this.riskRegister = new RiskRegister(this.bus);
    this.vendors = new VendorRegistry(this.bus);
    this.people = new PeopleRegistry(this.bus);
    this.sprints = new SprintTracker(this.bus);
    this.customerSuccess = new CustomerSuccessTracker(this.bus);
    this.product = new ProductAnalytics(this.bus);
    this.compliance = new ComplianceTracker(this.bus);
    this.competitive = new CompetitiveIntel(this.bus);
    this.incidents = new IncidentManager(this.bus);
    this.marketing = new MarketingAttributionEngine(this.bus);
    this.forecasting = new ForecastEngine(this.bus);
    this.dataPipeline = new DataPipelineManager(this.bus);
    this.support = new SupportTicketManager(this.bus);
    this.health = new HealthScorer(this);
    this.boardReport = new BoardReportGenerator(this);
  }
}

export * from "./knowledge/graph/schema.js";
export { OKG } from "./knowledge/graph/okg.js";
export { EventBus } from "./events/event-bus.js";
export { ExecutiveReasoningEngine } from "./reasoning/executive-reasoning-engine.js";
export { Orchestrator } from "./agents/orchestrator/orchestrator.js";
export { OlympusMCPServer } from "./mcp/olympus-mcp-server.js";
export { DigitalTwin } from "./simulation/digital-twin.js";
export { MemoryStore } from "./memory/memory-store.js";
export { GraphRAG } from "./retrieval/graph-rag.js";
export { AutonomyEngine } from "./autonomy/autonomy-engine.js";
export { DecisionInbox } from "./projections/decision-inbox.js";
export { FileEventLog } from "./persistence/file-event-log.js";
export { BriefingEngine } from "./briefing/briefing-engine.js";
export { WorkflowEngine } from "./workflow/workflow-engine.js";
export { CalibrationMonitor } from "./autonomy/calibration-monitor.js";
export { AnomalyDetector, type AnomalyDetectorOptions } from "./anomaly/index.js";
export { ClaudeClient, DEFAULT_TIER_MODELS } from "./llm/claude-client.js";
export { MockLLM, type LLMClient, type LLMRequest, type LLMResponse, type CognitiveTier } from "./llm/client.js";
export { TenantRegistry, type TenantConfig, type Tenant } from "./tenancy/index.js";
export { resolveOrgId, resolveTenant } from "./tenancy/index.js";
export { PolicyEngine, exposureCeilingPolicy, blockedCapabilityPolicy, domainFreezePolicy, type Policy, type PolicyContext, type PolicyViolation } from "./policy/index.js";
export { NotificationRouter, InMemoryChannel, WebhookChannel, type Alert, type AlertChannel, type AlertSeverity } from "./notifications/index.js";
export { OKRTracker, type Objective, type KeyResult, type KRStatus } from "./goals/index.js";
export { CapacityPlanner, type Resource, type Project, type Allocation, type OverallocationReport } from "./capacity/index.js";
export { FinancialLedger, type Account, type AccountType, type JournalEntry, type BurnRateReport } from "./finance/index.js";
export { SLATracker, type SLADefinition, type SLAState, type SLADirection, type SLAStatus } from "./contracts/index.js";
export { DealPipeline, type Deal, type DealStage, type PipelineSummary } from "./crm/index.js";
export { RiskRegister, type RiskEntry, type RiskStatus, type RiskCategory } from "./risk/index.js";
export { HealthScorer, type HealthReport, type HealthDimension, type HealthGrade } from "./health/index.js";
export { OutcomeTracker, type PredictionRecord, type OutcomeRecord } from "./learning/index.js";
export { BoardReportGenerator, type BoardReportOptions } from "./reporting/index.js";
export { VendorRegistry, type VendorCategory, type ContractStatus, type Vendor, type AddVendorInput, type ProcurementSummary } from "./procurement/index.js";
export { PeopleRegistry, type Employee, type EmployeeLevel, type EmploymentStatus, type OpenRole, type DepartmentSummary, type OrgSummary } from "./hr/index.js";
export { SprintTracker, type WorkItem, type Sprint, type Project as SprintProject, type ProjectSummary, type ItemStatus, type ItemType, type ItemPriority } from "./projects/index.js";
export { CustomerSuccessTracker, type RiskTier, type NPSCategory, type PaymentStatus, type AccountHealth, type AddAccountInput, type CSSummary } from "./customer-success/index.js";
export { ProductAnalytics, type Feature, type UsageEvent, type FeatureAdoption, type RetentionCohort } from "./product/index.js";
export { ComplianceTracker, type Control, type Evidence, type ControlStatus, type EvidenceType, type Framework, type AddControlInput, type ComplianceSummary } from "./compliance/index.js";
export { CompetitiveIntel, type SignalType, type Sentiment, type WinLossOutcome, type Competitor, type CompetitiveSignal, type WinLossRecord, type CompetitorSummary } from "./competitive/index.js";
export { IncidentManager, type Incident, type Postmortem, type IncidentMetrics, type IncidentSeverity, type IncidentStatus } from "./incidents/index.js";
export { MarketingAttributionEngine, type AttributionModel, type ChannelType, type TouchPoint, type Conversion as MarketingConversion, type Campaign as MarketingCampaign, type ChannelSummary, type AttributionSummary } from "./marketing/index.js";
export { ForecastEngine, type ForecastScenario, type ForecastDriver, type ForecastAssumptions, type MonthlyProjection, type ForecastResult, type ScenarioComparison, type SensitivityResult } from "./forecasting/index.js";
export { DataPipelineManager, type SourceType, type PipelineStatus, type RunStatus, type QualityDimension, type DataSource, type Transform, type DataPipeline, type PipelineRun, type DataQualityScore, type LineageNode, type DataPipelineSummary } from "./pipeline/index.js";
export { SupportTicketManager, type TicketPriority, type TicketStatus, type TicketCategory, type Ticket as SupportTicket, type SLAConfig as SupportSLAConfig, type TicketMetrics as SupportTicketMetrics } from "./support/index.js";
