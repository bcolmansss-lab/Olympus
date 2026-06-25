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
import { CommunicationHub } from "./communication/communication-hub.js";
import { PricingEngine } from "./pricing/pricing-engine.js";
import { AssetManager } from "./assets/asset-manager.js";
import { ExpenseManager } from "./expenses/expense-manager.js";
import { ApplicantTracker } from "./recruitment/ats.js";
import { KnowledgeBase } from "./knowledge-base/knowledge-base.js";
import { ContractManager } from "./contracts-mgmt/contract-manager.js";
import { PayrollEngine } from "./payroll/payroll-engine.js";
import { InventoryManager } from "./inventory/inventory-manager.js";
import { PartnerManager } from "./partners/partner-manager.js";
import { EventManager } from "./events-mgmt/event-manager.js";
import { AuditLog } from "./audit/audit-log.js";
import { BillingEngine } from "./billing/billing-engine.js";
import { AnalyticsEngine } from "./analytics/analytics-engine.js";
import { FeedbackEngine } from "./feedback/feedback-engine.js";
import { FlagManager } from "./feature-flags/flag-manager.js";
import { AccessControl } from "./access/access-control.js";
import { NotificationCenter } from "./notifications-center/notification-center.js";
import { StrategyEngine } from "./strategy/strategy-engine.js";
import { OrgIntelligence } from "./org/org-intelligence.js";
import { RevenueIntelEngine } from "./revenue-intel/revenue-intel.js";
import { ChurnPredictor } from "./churn/churn-predictor.js";
import { OnboardingTracker } from "./onboarding/onboarding-tracker.js";
import { EngagementTracker } from "./engagement/engagement-tracker.js";
import { HeadcountPlanner } from "./headcount-plan/headcount-planner.js";
import { ScenarioSimulator } from "./scenario-sim/scenario-simulator.js";
import { SupplyChainManager } from "./supply-chain/supply-chain-manager.js";
import { DocumentManager } from "./document-mgmt/document-manager.js";
import { RoadmapManager } from "./roadmap/roadmap-manager.js";
import { CustomerJourneyAnalytics } from "./journey/customer-journey.js";
import { LegalCaseManager } from "./legal/legal-case-manager.js";
import { QualityManager } from "./quality/quality-manager.js";
import { MarketResearch } from "./market-research/market-research.js";
import { PRManager } from "./pr-comms/pr-manager.js";
import { SalesIntelligence } from "./sales-intel/sales-intel.js";
import { ProductUsageTracker } from "./product-usage/product-usage.js";
import { DataWarehouse } from "./data-warehouse/data-warehouse.js";
import { CostCenterManager } from "./cost-center/cost-center.js";
import { GrantManager } from "./grants/grant-manager.js";
import { ESGTracker } from "./esg/esg-tracker.js";
import { InsuranceManager } from "./insurance/insurance-manager.js";
import { WorkforceScheduler } from "./workforce-scheduler/workforce-scheduler.js";
import { TreasuryManager } from "./treasury/treasury-manager.js";
import { LoyaltyProgram } from "./loyalty/loyalty-program.js";
import { MATracker } from "./m-and-a/ma-tracker.js";
import { APIGateway } from "./api-gateway/api-gateway.js";
import { InternationalExpansion } from "./international/international-expansion.js";
import { PricingOptimizer } from "./pricing-optimizer/pricing-optimizer.js";
import { TalentIntelligence } from "./talent-intel/talent-intelligence.js";
import { ProductCatalog } from "./product-catalog/product-catalog.js";
import { FacilitiesManager } from "./facilities/facilities-manager.js";
import { ContractManager as NewContractManager } from "./contracts/contract-manager.js";
import { BudgetPlanner } from "./budget-planner/budget-planner.js";
import { CampaignManager } from "./campaign-mgr/campaign-manager.js";
import { KPIDashboard } from "./kpi-dashboard/kpi-dashboard.js";
import { FleetManager } from "./fleet/fleet-manager.js";
import { SubscriptionManager } from "./subscription-mgr/subscription-manager.js";
import { RealEstateManager } from "./real-estate/real-estate-manager.js";
import { PermitManager } from "./permits/permit-manager.js";
import { TaxManager } from "./tax-mgr/tax-manager.js";
import { WarehouseManager } from "./warehouse/warehouse-manager.js";
import { CustomerFeedbackEngine } from "./customer-feedback/customer-feedback.js";
import { TrainingManager } from "./training/training-manager.js";
import { ProcurementEngine } from "./procurement-engine/procurement-engine.js";
import { ContentManager } from "./content-mgr/content-manager.js";
import { ProjectPortfolio } from "./project-portfolio/project-portfolio.js";
import { CryptoTreasury } from "./crypto-treasury/crypto-treasury.js";
import { BoardGovernance } from "./board-governance/board-governance.js";
import { ServiceLevelManager } from "./service-level/service-level-manager.js";
import { DigitalAssetManager } from "./digital-assets/digital-asset-manager.js";
import { HealthBenefitsManager } from "./health-benefits/health-benefits-manager.js";
import { CommissionEngine } from "./commission-engine/commission-engine.js";
import { TimeTrackingManager } from "./time-tracking/time-tracking-manager.js";
import { VendorRiskManager } from "./vendor-risk/vendor-risk-manager.js";

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
  /** Communication hub — outbound sequences, engagement tracking, reply rate analytics. */
  readonly comms: CommunicationHub;
  /** Pricing engine — product catalog, tiered pricing, discounts, and quote generation. */
  readonly pricing: PricingEngine;
  /** Asset manager — hardware, software, and infrastructure asset lifecycle tracking. */
  readonly assets: AssetManager;
  /** Expense manager — employee expense submissions, approval workflows, policy enforcement, and reimbursement tracking. */
  readonly expenses: ExpenseManager;
  /** Applicant tracker — job requisitions, candidate pipeline, interview scheduling, offer management. */
  readonly recruitment: ApplicantTracker;
  /** Knowledge base — internal wiki, runbooks, playbooks, and documentation management. */
  readonly kb: KnowledgeBase;
  /** Contract lifecycle management — MSAs, SOWs, NDAs, and general contract tracking. */
  readonly contractMgmt: ContractManager;
  /** Payroll engine — pay period processing, compensation tracking, tax withholding, and payroll reporting. */
  readonly payroll: PayrollEngine;
  /** Inventory manager — SKU catalog, stock levels, reorder alerts, and inventory valuation. */
  readonly inventory: InventoryManager;
  /** Partner manager — channel partners, referral programs, co-sell tracking, and partner performance. */
  readonly partners: PartnerManager;
  /** Event & conference manager — tracks registrations, attendance, budget, leads, and ROI. */
  readonly eventsMgmt: EventManager;
  /** Audit log — immutable append-only record of all significant system actions. */
  readonly auditLog: AuditLog;
  /** Billing engine — subscription invoicing, payment tracking, MRR/ARR movement, and dunning. */
  readonly billing: BillingEngine;
  /** Analytics engine — cross-module KPI tracking, custom metrics, dashboards, and trend analysis. */
  readonly analytics: AnalyticsEngine;
  /** Feedback engine — NPS surveys, CSAT collection, feature requests, and sentiment analysis. */
  readonly feedback: FeedbackEngine;
  /** Flag manager — feature flags, gradual rollouts, A/B experiments, and kill switches. */
  readonly flags: FlagManager;
  /** Access control — RBAC/ABAC permission management, API key lifecycle, and security policy enforcement. */
  readonly access: AccessControl;
  /** Notification center — user notification preferences, digest scheduling, and delivery tracking. */
  readonly notifCenter: NotificationCenter;
  /** Strategy engine — company vision, strategic pillars, initiative tracking, and goal cascading. */
  readonly strategy: StrategyEngine;
  /** Org intelligence — org chart analysis, team topology, span of control, and org health metrics. */
  readonly orgIntel: OrgIntelligence;
  /** Revenue intelligence — cohort analysis, LTV modeling, and expansion revenue tracking. */
  readonly revenueIntel: RevenueIntelEngine;
  /** Churn predictor — rule-based churn scoring, early warning signals, and retention playbooks. */
  readonly churnPredictor: ChurnPredictor;
  /** Onboarding tracker — customer onboarding journeys, milestone completion, time-to-value tracking. */
  readonly onboarding: OnboardingTracker;
  /** Engagement tracker — eNPS pulse surveys, engagement scoring, manager effectiveness, and flight risk detection. */
  readonly engagement: EngagementTracker;
  /** Headcount planner — strategic hiring plans, role cost modeling, approval workflows. */
  readonly headcountPlan: HeadcountPlanner;
  /** Scenario simulator — what-if analysis, decision trees, and impact modeling for business decisions. */
  readonly scenarioSim: ScenarioSimulator;
  /** Supply chain manager — suppliers, purchase orders, lead times, delivery performance. */
  readonly supplyChain: SupplyChainManager;
  /** Document manager — document lifecycle, versioning, approvals, and expiration tracking. */
  readonly docMgmt: DocumentManager;
  /** Roadmap manager — feature prioritization, release planning, quarter-by-quarter tracking. */
  readonly roadmap: RoadmapManager;
  /** Customer journey analytics — touchpoint tracking, funnel analysis, conversion metrics. */
  readonly journey: CustomerJourneyAnalytics;
  /** Legal case manager — litigation, IP, regulatory matters, deadlines, outside counsel. */
  readonly legal: LegalCaseManager;
  /** Quality manager — defect tracking, audits, corrective actions, QA metrics. */
  readonly quality: QualityManager;
  /** Market research — TAM/SAM/SOM studies, win/loss tracking, competitor profiling. */
  readonly marketResearch: MarketResearch;
  /** PR & communications — press releases, media coverage, crisis management. */
  readonly prComms: PRManager;
  /** Sales intelligence — buying signals, activity logging, quota tracking, territory management. */
  readonly salesIntel: SalesIntelligence;
  /** Product usage tracker — feature adoption, DAU/MAU, power user detection, expansion signals. */
  readonly productUsage: ProductUsageTracker;
  /** Data warehouse — table catalog, schema registry, pipeline monitoring, freshness alerts. */
  readonly dataWarehouse: DataWarehouse;
  /** Cost center manager — departmental budgets, allocations, variance analysis, chargebacks. */
  readonly costCenter: CostCenterManager;
  /** Grant manager — grant applications, awards, milestone reporting, compliance tracking. */
  readonly grants: GrantManager;
  /** ESG tracker — environmental/social/governance metrics, carbon tracking, DEI reporting. */
  readonly esg: ESGTracker;
  /** Insurance manager — policy tracking, claims management, renewal alerts, coverage analysis. */
  readonly insurance: InsuranceManager;
  /** Workforce scheduler — shift scheduling, availability, overtime detection, labor cost forecasting. */
  readonly workforceScheduler: WorkforceScheduler;
  /** Treasury manager — bank accounts, cash transfers, FX exposure, liquidity monitoring. */
  readonly treasury: TreasuryManager;
  /** Loyalty program — points earning, tier upgrades, reward redemption, referral tracking. */
  readonly loyalty: LoyaltyProgram;
  /** M&A tracker — deal pipeline, due diligence checklists, valuation models, closing milestones. */
  readonly mAndA: MATracker;
  /** API gateway — endpoint catalog, rate limit tracking, SLA monitoring, deprecation management. */
  readonly apiGateway: APIGateway;
  /** International expansion — market entry tracking, legal entities, compliance requirements. */
  readonly international: InternationalExpansion;
  /** Pricing optimizer — dynamic recommendations, elasticity models, discount management. */
  readonly pricingOptimizer: PricingOptimizer;
  /** Talent intelligence — skills gap analysis, succession planning, learning path tracking. */
  readonly talentIntel: TalentIntelligence;
  /** Product catalog — SKU management, variants, category hierarchy, publish workflow. */
  readonly productCatalog: ProductCatalog;
  /** Facilities manager — office space, lease management, maintenance, room bookings. */
  readonly facilities: FacilitiesManager;
  /** Contract manager — contract lifecycle, obligations, renewal alerts, spend analytics. */
  readonly contracts: NewContractManager;
  /** Budget planner — annual/quarterly budget creation, variance tracking, reforecast workflows. */
  readonly budgetPlanner: BudgetPlanner;
  /** Campaign manager — marketing campaign lifecycle, A/B testing, spend management, ROI analytics. */
  readonly campaignMgr: CampaignManager;
  /** KPI dashboard — KPI definition, target tracking, threshold alerting, and trend analysis. */
  readonly kpiDashboard: KPIDashboard;
  /** Fleet manager — vehicle/asset fleet management, maintenance scheduling, and cost analytics. */
  readonly fleet: FleetManager;
  /** Subscription manager — recurring subscription lifecycle, plan management, trial tracking, and MRR analytics. */
  readonly subscriptionMgr: SubscriptionManager;
  /** Real estate manager — property portfolio management, valuation tracking, and rental income analytics. */
  readonly realEstate: RealEstateManager;
  readonly permits: PermitManager;
  readonly taxMgr: TaxManager;
  readonly warehouseMgr: WarehouseManager;
  readonly customerFeedback: CustomerFeedbackEngine;
  readonly trainingMgr: TrainingManager;
  readonly procurementEngine: ProcurementEngine;
  readonly contentMgr: ContentManager;
  readonly projectPortfolio: ProjectPortfolio;
  readonly cryptoTreasury: CryptoTreasury;
  readonly boardGovernance: BoardGovernance;
  readonly serviceLevelMgr: ServiceLevelManager;
  readonly digitalAssets: DigitalAssetManager;
  readonly healthBenefits: HealthBenefitsManager;
  readonly commissionEngine: CommissionEngine;
  readonly timeTracking: TimeTrackingManager;
  readonly vendorRisk: VendorRiskManager;

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
    this.comms = new CommunicationHub(this.bus);
    this.pricing = new PricingEngine(this.bus);
    this.assets = new AssetManager(this.bus);
    this.expenses = new ExpenseManager(this.bus);
    this.recruitment = new ApplicantTracker(this.bus);
    this.kb = new KnowledgeBase(this.bus);
    this.contractMgmt = new ContractManager(this.bus);
    this.payroll = new PayrollEngine(this.bus);
    this.inventory = new InventoryManager(this.bus);
    this.partners = new PartnerManager(this.bus);
    this.eventsMgmt = new EventManager(this.bus);
    this.auditLog = new AuditLog();
    this.billing = new BillingEngine(this.bus);
    this.analytics = new AnalyticsEngine(this.bus);
    this.feedback = new FeedbackEngine(this.bus);
    this.flags = new FlagManager(this.bus);
    this.access = new AccessControl(this.bus);
    this.notifCenter = new NotificationCenter(this.bus);
    this.strategy = new StrategyEngine(this.bus);
    this.orgIntel = new OrgIntelligence();
    this.revenueIntel = new RevenueIntelEngine(this.bus);
    this.churnPredictor = new ChurnPredictor(this.bus);
    this.onboarding = new OnboardingTracker(this.bus);
    this.engagement = new EngagementTracker(this.bus);
    this.headcountPlan = new HeadcountPlanner(this.bus);
    this.scenarioSim = new ScenarioSimulator(this.bus);
    this.supplyChain = new SupplyChainManager(this.bus);
    this.docMgmt = new DocumentManager(this.bus);
    this.roadmap = new RoadmapManager(this.bus);
    this.journey = new CustomerJourneyAnalytics(this.bus);
    this.legal = new LegalCaseManager(this.bus);
    this.quality = new QualityManager(this.bus);
    this.marketResearch = new MarketResearch(this.bus);
    this.prComms = new PRManager(this.bus);
    this.salesIntel = new SalesIntelligence(this.bus);
    this.productUsage = new ProductUsageTracker(this.bus);
    this.dataWarehouse = new DataWarehouse(this.bus);
    this.costCenter = new CostCenterManager(this.bus);
    this.grants = new GrantManager(this.bus);
    this.esg = new ESGTracker(this.bus);
    this.insurance = new InsuranceManager(this.bus);
    this.workforceScheduler = new WorkforceScheduler(this.bus);
    this.treasury = new TreasuryManager(this.bus);
    this.loyalty = new LoyaltyProgram(this.bus);
    this.mAndA = new MATracker(this.bus);
    this.apiGateway = new APIGateway(this.bus);
    this.international = new InternationalExpansion(this.bus);
    this.pricingOptimizer = new PricingOptimizer(this.bus);
    this.talentIntel = new TalentIntelligence(this.bus);
    this.productCatalog = new ProductCatalog(this.bus);
    this.facilities = new FacilitiesManager(this.bus);
    this.contracts = new NewContractManager(this.bus);
    this.budgetPlanner = new BudgetPlanner(this.bus);
    this.campaignMgr = new CampaignManager(this.bus);
    this.kpiDashboard = new KPIDashboard(this.bus);
    this.fleet = new FleetManager(this.bus);
    this.subscriptionMgr = new SubscriptionManager(this.bus);
    this.realEstate = new RealEstateManager(this.bus);
    this.permits = new PermitManager(this.bus);
    this.taxMgr = new TaxManager(this.bus);
    this.warehouseMgr = new WarehouseManager(this.bus);
    this.customerFeedback = new CustomerFeedbackEngine(this.bus);
    this.trainingMgr = new TrainingManager(this.bus);
    this.procurementEngine = new ProcurementEngine(this.bus);
    this.contentMgr = new ContentManager(this.bus);
    this.projectPortfolio = new ProjectPortfolio(this.bus);
    this.cryptoTreasury = new CryptoTreasury(this.bus);
    this.boardGovernance = new BoardGovernance(this.bus);
    this.serviceLevelMgr = new ServiceLevelManager(this.bus);
    this.digitalAssets = new DigitalAssetManager(this.bus);
    this.healthBenefits = new HealthBenefitsManager(this.bus);
    this.commissionEngine = new CommissionEngine(this.bus);
    this.timeTracking = new TimeTrackingManager(this.bus);
    this.vendorRisk = new VendorRiskManager(this.bus);
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
export { CommunicationHub, type CommChannel, type EngagementType, type SequenceStatus, type MessageStatus, type SequenceStep, type CommSequence, type CommMessage, type EngagementEvent, type SequenceAnalytics, type CommSummary } from "./communication/index.js";
export { PricingEngine, type BillingModel, type DiscountType, type QuoteStatus, type PricingTier, type Product as PricingProduct, type Discount as PricingDiscount, type QuoteLineItem, type Quote as PricingQuote, type PricingSummary } from "./pricing/index.js";
export { AssetManager, type AssetType, type AssetStatus, type DepreciationMethod, type Asset, type DepreciationRecord, type AssetSummary } from "./assets/index.js";
export { ExpenseManager, type ExpenseCategory, type ExpenseStatus, type Expense, type ExpensePolicy, type ExpenseSummary } from "./expenses/index.js";
export { ApplicantTracker, type CandidateStage, type JobStatus, type InterviewType, type JobRequisition, type Candidate as JobCandidate, type Scorecard, type RecruitmentMetrics } from "./recruitment/index.js";
export { KnowledgeBase, type ArticleStatus, type ArticleType, type Article as KBArticle, type Collection as KBCollection, type KBSummary } from "./knowledge-base/index.js";
export { ContractManager, type ContractType, type ContractStatus as ContractMgmtStatus, type ContractParty, type Contract as ManagedContract, type ContractSummary as ContractMgmtSummary } from "./contracts-mgmt/index.js";
export { PayrollEngine, type PayFrequency, type PayType, type CompensationComponent, type CompensationRecord, type PayStub, type PayPeriod, type PayrollSummary } from "./payroll/index.js";
export { InventoryManager, type MovementType, type StockStatus, type SKU, type StockMovement, type InventorySummary } from "./inventory/index.js";
export { PartnerManager, type PartnerTier, type PartnerType, type DealRegistrationType, type Partner, type PartnerDeal, type PartnerSummary } from "./partners/index.js";
export { EventManager, type EventType, type EventStatus, type AttendeeType, type ManagedEvent, type EventRegistration, type EventSummary as EventMgmtSummary } from "./events-mgmt/index.js";
export { AuditLog, type AuditAction, type AuditSeverity, type AuditEntry, type AuditQuery, type AuditSummary } from "./audit/index.js";
export { BillingEngine, type InvoiceStatus, type MrrMovement, type PaymentMethod, type Subscription as BillingSubscription, type Invoice, type MrrRecord, type BillingSummary } from "./billing/index.js";
export { AnalyticsEngine, type MetricType, type AggregationMethod, type TrendDirection, type MetricDefinition, type MetricDataPoint, type MetricSeries, type AnalyticsSummary } from "./analytics/index.js";
export { FeedbackEngine, type NpsCategory, type SurveyType, type FeedbackSentiment, type RequestStatus, type Survey, type SurveyResponse, type FeatureRequest, type FeedbackSummary } from "./feedback/index.js";
export { FlagManager, type FlagStatus, type RolloutStrategy, type TargetingRule, type FeatureFlag, type Experiment as FlagExperiment, type FlagSummary } from "./feature-flags/index.js";
export { AccessControl, type PrincipalType, type PermissionEffect, type Role, type Permission, type Principal, type ApiKey, type AccessDecision, type AccessSummary } from "./access/index.js";
export { NotificationCenter, type NotifChannel, type NotifCategory, type DigestFrequency, type NotifPreference, type NotifMessage, type DigestEntry, type NotifCenterSummary } from "./notifications-center/index.js";
export { StrategyEngine, type InitiativeStatus, type StrategicHorizon, type StrategicPillar, type Initiative, type Milestone, type StrategySummary } from "./strategy/index.js";
export { OrgIntelligence, type TeamTopology, type OrgHealthDimension, type Team as OrgTeam, type SpanAnalysis, type OrgHealthReport } from "./org/index.js";
export { RevenueIntelEngine, type CohortPeriod, type RevenueSegment, type ExpansionType, type RevenueCohort, type ExpansionEvent, type LtvModel, type RevenueIntelSummary } from "./revenue-intel/index.js";
export { ChurnPredictor, type ChurnRiskTier, type SignalType as ChurnSignalType, type ChurnSignal, type ChurnScore, type RetentionPlaybook, type ChurnSummary } from "./churn/index.js";
export { OnboardingTracker, type OnboardingStatus, type MilestoneCategory, type OnboardingPlan, type PlanMilestone, type OnboardingJourney, type OnboardingSummary } from "./onboarding/index.js";
export { EngagementTracker, type ENpsCategory, type FlightRiskLevel, type EngagementDriver, type PulseSurvey, type PulseResponse, type FlightRiskAssessment, type TeamEngagementScore, type EngagementSummary } from "./engagement/index.js";
export { HeadcountPlanner, type HireStatus, type PlanningHorizon, type PlannedRole, type HeadcountPlan, type HeadcountSummary } from "./headcount-plan/index.js";
export { ScenarioSimulator, type ScenarioType, type OutcomeMetric, type ScenarioVariable, type ScenarioOutcome, type Scenario, type ScenarioSummary } from "./scenario-sim/index.js";
export { SupplyChainManager, type OrderStatus, type SupplierStatus, type SupplyRiskLevel, type Supplier, type PurchaseOrderLine, type PurchaseOrder, type SupplyChainSummary } from "./supply-chain/index.js";
export { DocumentManager, type DocStatus, type DocCategory, type DocumentVersion, type ManagedDocument, type DocSummary } from "./document-mgmt/index.js";
export { RoadmapManager, type RoadmapItemStatus, type RoadmapItemType, type RoadmapQuarter, type RoadmapItem, type RoadmapRelease, type RoadmapSummary } from "./roadmap/index.js";
export { CustomerJourneyAnalytics, type JourneyStage, type TouchpointChannel, type Touchpoint, type CustomerJourney, type FunnelAnalysis, type JourneySummary } from "./journey/index.js";
export { LegalCaseManager, type LegalCaseType, type LegalCaseStatus, type CasePriority, type LegalDeadline, type LegalCase, type LegalSummary } from "./legal/index.js";
export { QualityManager, type DefectSeverity, type DefectStatus, type AuditType, type Defect, type QualityAudit, type QualitySummary } from "./quality/index.js";
export { MarketResearch, type StudyType, type WinLossOutcome as MRWinLossOutcome, type MarketStudy, type WinLossRecord as MRWinLossRecord, type CompetitorProfile, type MarketResearchSummary } from "./market-research/index.js";
export { PRManager, type ReleaseStatus, type PRChannel, type CoverageSentiment, type CrisisSeverity, type PressRelease, type MediaCoverage, type CrisisRecord, type PRSummary } from "./pr-comms/index.js";
export { SalesIntelligence, type SalesSignalType, type SalesActivityType, type BuyingSignal, type SalesActivity, type QuotaRecord, type SalesTerritory, type SalesIntelSummary } from "./sales-intel/index.js";
export { ProductUsageTracker, type FeatureEvent, type FeatureAdoption as PUFeatureAdoption, type UserSession, type UsageSummary } from "./product-usage/index.js";
export { DataWarehouse, type TableStatus, type ColumnType, type ColumnSchema, type DWTable, type DWPipeline, type DWSummary } from "./data-warehouse/index.js";
export { CostCenterManager, type CostCategory, type AllocationMethod, type CostCenter, type CostAllocation, type CostVarianceReport, type CostSummary } from "./cost-center/index.js";
export { GrantManager, type GrantStatus, type GrantType, type GrantMilestone, type Grant, type GrantSummary } from "./grants/index.js";
export { ESGTracker, type ESGCategory, type MetricFrequency, type ESGMetric, type ESGDataPoint, type ESGReport, type ESGSummary } from "./esg/index.js";
export { InsuranceManager, type InsuranceType, type PolicyStatus, type ClaimStatus, type InsurancePolicy, type InsuranceClaim, type InsuranceSummary } from "./insurance/index.js";
export { WorkforceScheduler, type ShiftStatus, type DayOfWeek, type ShiftTemplate, type Shift, type EmployeeAvailability, type ScheduleSummary } from "./workforce-scheduler/index.js";
export { TreasuryManager, type AccountType as BankAccountType, type Currency, type BankAccount, type CashTransfer, type FXPosition, type TreasurySummary } from "./treasury/index.js";
export { LoyaltyProgram, type LoyaltyTier, type LoyaltyMember, type PointsTransaction, type LoyaltyReward, type LoyaltySummary } from "./loyalty/index.js";
export { MATracker, type DealType, type DealStatus, type DDItem, type ValuationModel, type MADeal, type MASummary } from "./m-and-a/index.js";
export { APIGateway, type HttpMethod, type EndpointStatus, type AuthScheme, type APIEndpoint, type APIUsageRecord, type GatewayConsumer, type GatewaySummary } from "./api-gateway/index.js";
export { InternationalExpansion, type MarketStatus, type EntityType, type ComplianceStatus, type ComplianceRequirement, type LegalEntity, type Market, type ExpansionSummary } from "./international/index.js";
export { PricingOptimizer, type PricingStrategy, type DiscountType as PODiscountType, type PriceElasticityModel, type PricingRecommendation, type Discount as PODiscount, type PricingOptimizerSummary } from "./pricing-optimizer/index.js";
export { TalentIntelligence, type SkillLevel, type ReadinessLevel, type SkillProfile, type SuccessionPlan, type LearningRecord, type TalentSummary } from "./talent-intel/index.js";
export { ProductCatalog, type ProductStatus, type ProductType, type ProductVariant, type CatalogProduct, type ProductCategory, type CatalogSummary } from "./product-catalog/index.js";
export { FacilitiesManager, type LeaseStatus, type MaintenanceStatus, type MaintenancePriority, type FacilityLocation, type MaintenanceRequest, type RoomBooking, type FacilitiesSummary } from "./facilities/index.js";
export { BudgetPlanner, type BudgetStatus, type BudgetPeriod, type BudgetLineItem, type Budget, type BudgetSummary } from "./budget-planner/index.js";
export { CampaignManager, type CampaignStatus, type CampaignChannel, type CampaignVariant, type Campaign as MgrCampaign, type CampaignSummary } from "./campaign-mgr/index.js";
export { KPIDashboard, type KPIDirection, type KPIFrequency, type KPIDefinition, type KPISnapshot, type KPIDashboardConfig, type KPISummary } from "./kpi-dashboard/index.js";
export { FleetManager, type VehicleStatus, type VehicleType, type IncidentSeverity as FleetIncidentSeverity, type Vehicle, type FleetIncident, type FleetSummary } from "./fleet/index.js";
export { SubscriptionManager, type SubscriptionStatus, type BillingInterval, type SubscriptionPlan, type Subscription as SubMgrSubscription, type SubscriptionSummary } from "./subscription-mgr/index.js";
export { RealEstateManager, type PropertyType, type PropertyStatus, type RELeaseStatus, type Property, type RELease, type RealEstateSummary } from "./real-estate/index.js";
export { PermitManager, type PermitStatus, type PermitCategory, type BusinessPermit, type PermitInspection, type PermitSummary } from "./permits/index.js";
export { TaxManager, type TaxType, type TaxFilingStatus, type TaxFrequency, type TaxObligation, type TaxPayment, type TaxSummary } from "./tax-mgr/index.js";
export { WarehouseManager, type WarehouseStatus, type ShipmentDirection, type ShipmentStatus, type Warehouse, type WHShipment, type WarehouseSummary } from "./warehouse/index.js";
export { CustomerFeedbackEngine, type FeedbackType, type FeedbackSentiment as CFESentiment, type NPSCategory as CFENPSCategory, type FeedbackResponse, type FeedbackSurvey, type FeedbackSummary as CFEFeedbackSummary } from "./customer-feedback/index.js";
export { TrainingManager, type CourseStatus, type EnrollmentStatus, type DeliveryMode, type TrainingCourse, type TrainingEnrollment, type Certification, type TrainingSummary } from "./training/index.js";
export { ProcurementEngine, type RFQStatus, type BidStatus, type POApprovalStatus, type RFQ, type Bid, type ProcurementPO, type ProcurementSummary as PEProcurementSummary } from "./procurement-engine/index.js";
export { ContentManager, type ContentType, type ContentStatus, type ContentItem, type EditorialCalendarEntry, type ContentSummary } from "./content-mgr/index.js";
export { ProjectPortfolio, type PortfolioProjectStatus, type StrategicPillar as PPStrategicPillar, type PortfolioProject, type PortfolioSummary } from "./project-portfolio/index.js";
export { CryptoTreasury, type WalletType, type AssetType as CryptoAssetType, type TxDirection, type CryptoWallet, type CryptoTransaction, type StakingPosition, type CryptoTreasurySummary } from "./crypto-treasury/index.js";
export { BoardGovernance, type MeetingType, type MeetingStatus as BoardMeetingStatus, type DirectorRole, type ResolutionStatus, type BoardDirector, type BoardMeeting, type BoardResolution, type GovernanceSummary } from "./board-governance/index.js";
export { ServiceLevelManager, type ServiceTierLevel, type ServiceTierDefinition, type CustomerServiceLevel, type ServiceLevelSummary } from "./service-level/index.js";
export { DigitalAssetManager, type DigitalAssetCategory, type DigitalAssetStatus, type DigitalAsset, type DigitalAssetSummary } from "./digital-assets/index.js";
export { HealthBenefitsManager, type BenefitPlanType, type BenefitClaimType, type BenefitClaimStatus, type BenefitPlan, type BenefitEnrollment, type BenefitClaim, type BenefitsSummary } from "./health-benefits/index.js";
export { CommissionEngine, type CommissionPlanStatus, type PayoutStatus, type DisputeStatus, type CommissionTier, type CommissionPlan, type CommissionDeal, type CommissionPayout, type CommissionDispute, type CommissionSummary } from "./commission-engine/index.js";
export { TimeTrackingManager, type TimesheetStatus, type TimeEntry, type Timesheet, type TimeTrackingSummary } from "./time-tracking/index.js";
export { VendorRiskManager, type VendorRiskTier, type RemediationStatus, type VendorRiskDomain, type VendorRiskAssessment, type RemediationItem, type VendorRiskSummary } from "./vendor-risk/index.js";
