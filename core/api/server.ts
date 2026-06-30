/**
 * Olympus HTTP API — a thin, zero-dependency surface over the core.
 *
 * Built on Node's stdlib `http` (no Express, no deps) so the reference
 * skeleton stays dependency-free. Maps the BLUEPRINT §21 REST spec onto
 * the in-memory Olympus instance:
 *
 *   POST /v1/ask                 reasoned Q&A (the closed loop)
 *   POST /v1/decisions           open a decision session
 *   GET  /v1/decisions           list decision nodes
 *   GET  /v1/decisions/:id       full decision record
 *   POST /v1/simulate            run a digital-twin simulation
 *   GET  /v1/autonomy/grants     list active grants + kill-switch state
 *   PUT  /v1/autonomy/grants     set a per-domain capability grant
 *   GET  /v1/events              the event spine (append-only log)
 *   GET  /v1/audit               the tamper-evident MCP audit chain
 *   GET  /healthz                liveness
 *
 * Swap this for a production gateway (auth, rate limiting, GraphQL,
 * WebSocket streaming) without touching the core beneath it.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { Olympus, type OlympusOptions } from "../index.js";
import type { Domain } from "../knowledge/graph/schema.js";
import type { AutonomyLevel } from "../autonomy/autonomy-engine.js";
import type { AskOptions } from "../reasoning/executive-reasoning-engine.js";
import type { AddObjectiveInput } from "../goals/okr-tracker.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { compareScenarios } from "../simulation/scenario-compare.js";

interface Route {
  method: string;
  /** Path pattern; ":param" segments are captured. */
  pattern: string;
  handler: (req: ApiRequest, res: ApiResponse) => Promise<void> | void;
}

interface ApiRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

interface ApiResponse {
  json: (status: number, payload: unknown) => void;
}

export interface RateLimit {
  /** Sliding window length in ms. */
  windowMs: number;
  /** Max requests per caller per window. */
  max: number;
}

export interface ApiServerOptions extends OlympusOptions {
  olympus?: Olympus;
  /**
   * Bearer tokens that may call /v1/*. Map of token → human-readable caller
   * label. When omitted/empty, the API is open (zero-config demo mode).
   */
  apiKeys?: Record<string, string>;
  /** Per-caller rate limit. When omitted, requests are unlimited. */
  rateLimit?: RateLimit;
}

export class OlympusApiServer {
  readonly olympus: Olympus;
  private readonly routes: Route[] = [];
  private server?: Server;
  private readonly apiKeys: Record<string, string>;
  private readonly rateLimit?: RateLimit;
  /** caller label → recent request timestamps (sliding window). */
  private readonly hits = new Map<string, number[]>();

  constructor(opts: ApiServerOptions = {}) {
    this.olympus = opts.olympus ?? new Olympus(opts);
    this.apiKeys = opts.apiKeys ?? {};
    this.rateLimit = opts.rateLimit;
    this.registerRoutes();
  }

  private get authEnabled(): boolean {
    return Object.keys(this.apiKeys).length > 0;
  }

  /** Resolve the caller from a bearer token; returns label or null if unauthorized. */
  private authenticate(req: IncomingMessage): string | null {
    if (!this.authEnabled) return "anonymous";
    const header = req.headers["authorization"];
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
    return this.apiKeys[token] ?? null;
  }

  /** Sliding-window rate check; true when the caller is within budget. */
  private withinRateLimit(caller: string): boolean {
    if (!this.rateLimit) return true;
    const now = Date.now();
    const cutoff = now - this.rateLimit.windowMs;
    const recent = (this.hits.get(caller) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.rateLimit.max) {
      this.hits.set(caller, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(caller, recent);
    return true;
  }

  // -- routing --------------------------------------------------------------

  private registerRoutes(): void {
    this.routes.push(
      { method: "GET", pattern: "/healthz", handler: (_req, res) => res.json(200, { ok: true, killed: this.olympus.autonomy.isKilled() }) },

      { method: "POST", pattern: "/v1/ask", handler: (req, res) => this.handleAsk(req, res) },

      { method: "POST", pattern: "/v1/decisions", handler: (req, res) => this.handleOpenDecision(req, res) },
      { method: "GET", pattern: "/v1/decisions", handler: (_req, res) => this.handleListDecisions(res) },
      { method: "GET", pattern: "/v1/decisions/:id", handler: (req, res) => this.handleGetDecision(req, res) },

      { method: "POST", pattern: "/v1/simulate", handler: (req, res) => this.handleSimulate(req, res) },
      { method: "POST", pattern: "/v1/compare", handler: (req, res) => this.handleCompare(req, res) },
      { method: "POST", pattern: "/v1/diagnose", handler: (req, res) => this.handleDiagnose(req, res) },

      { method: "GET", pattern: "/v1/autonomy/grants", handler: (_req, res) => this.handleListGrants(res) },
      { method: "PUT", pattern: "/v1/autonomy/grants", handler: (req, res) => this.handleSetGrant(req, res) },

      { method: "GET", pattern: "/v1/briefing", handler: (_req, res) => res.json(200, this.olympus.briefing.generate()) },

      { method: "GET", pattern: "/v1/health", handler: (_req, res) => res.json(200, this.olympus.health.score()) },

      { method: "GET", pattern: "/v1/inbox", handler: (req, res) => this.handleInbox(req, res) },
      { method: "POST", pattern: "/v1/inbox/:id/resolve", handler: (req, res) => this.handleResolveInbox(req, res) },

      { method: "GET", pattern: "/v1/events", handler: (req, res) => this.handleEvents(req, res) },
      { method: "GET", pattern: "/v1/audit", handler: (_req, res) => this.handleAudit(res) },

      { method: "GET", pattern: "/v1/okr", handler: (_req, res) => res.json(200, this.olympus.okr.list()) },
      { method: "POST", pattern: "/v1/okr", handler: (req, res) => this.handleAddObjective(req, res) },

      { method: "GET", pattern: "/v1/risks", handler: (_req, res) => res.json(200, { risks: this.olympus.riskRegister.list(), top: this.olympus.riskRegister.topRisks(5) }) },
      { method: "GET", pattern: "/v1/finance", handler: (_req, res) => res.json(200, { burnRate: this.olympus.ledger.burnRate(), accounts: this.olympus.ledger.listAccounts(), netIncome: this.olympus.ledger.netIncome() }) },
      { method: "GET", pattern: "/v1/pipeline", handler: (_req, res) => res.json(200, { summary: this.olympus.pipeline.summary(), deals: this.olympus.pipeline.list() }) },
      { method: "GET", pattern: "/v1/sla", handler: (_req, res) => res.json(200, { slas: this.olympus.sla.list(), atRisk: this.olympus.sla.atRisk(), totalPenalties: this.olympus.sla.totalPenalties() }) },
      { method: "GET", pattern: "/v1/capacity", handler: (_req, res) => res.json(200, { summary: this.olympus.capacity.capacitySummary(), overallocated: this.olympus.capacity.overallocatedResources() }) },
      { method: "GET", pattern: "/v1/vendors", handler: (_req, res) => res.json(200, { vendors: this.olympus.vendors.list(), summary: this.olympus.vendors.summary() }) },
      { method: "GET", pattern: "/v1/people", handler: (_req, res) => res.json(200, { employees: this.olympus.people.listActive(), openRoles: this.olympus.people.listOpenRoles(), summary: this.olympus.people.orgSummary() }) },
      { method: "GET", pattern: "/v1/projects", handler: (_req, res) => res.json(200, { projects: this.olympus.sprints.listProjects() }) },
      { method: "GET", pattern: "/v1/customer-success", handler: (_req, res) => res.json(200, { accounts: this.olympus.customerSuccess.list(), churnRisk: this.olympus.customerSuccess.churnRiskAccounts(), summary: this.olympus.customerSuccess.summary() }) },
      { method: "GET", pattern: "/v1/product", handler: (_req, res) => res.json(200, { features: this.olympus.product.listFeatures(), adoption: this.olympus.product.listAdoption(), top: this.olympus.product.topFeatures() }) },
      { method: "GET", pattern: "/v1/compliance", handler: (_req, res) => res.json(200, { controls: this.olympus.compliance.list(), gaps: this.olympus.compliance.checkGaps(), summary: this.olympus.compliance.summary() }) },
      { method: "GET", pattern: "/v1/competitive", handler: (_req, res) => res.json(200, { competitors: this.olympus.competitive.listCompetitors(), recentSignals: this.olympus.competitive.recentSignals(5) }) },
      { method: "GET", pattern: "/v1/incidents", handler: (_req, res) => res.json(200, { incidents: this.olympus.incidents.list(), open: this.olympus.incidents.openIncidents(), metrics: this.olympus.incidents.metrics() }) },
      { method: "GET", pattern: "/v1/marketing", handler: (_req, res) => res.json(200, { summary: this.olympus.marketing.summary(), campaigns: this.olympus.marketing.listCampaigns() }) },
      { method: "GET", pattern: "/v1/forecast", handler: (_req, res) => res.json(200, this.olympus.forecasting.list()) },
      { method: "GET", pattern: "/v1/data-pipeline", handler: (_req, res) => res.json(200, { summary: this.olympus.dataPipeline.summary(), pipelines: this.olympus.dataPipeline.listPipelines() }) },
      { method: "GET", pattern: "/v1/support", handler: (_req, res) => res.json(200, { metrics: this.olympus.support.metrics(), openTickets: this.olympus.support.list("open") }) },
      { method: "GET", pattern: "/v1/comms", handler: (_req, res) => res.json(200, { summary: this.olympus.comms.summary(), sequences: this.olympus.comms.listSequences() }) },
      { method: "GET", pattern: "/v1/pricing", handler: (_req, res) => res.json(200, { summary: this.olympus.pricing.summary(), products: this.olympus.pricing.listProducts() }) },
      { method: "GET", pattern: "/v1/assets", handler: (_req, res) => res.json(200, { summary: this.olympus.assets.summary(), assets: this.olympus.assets.list() }) },
      { method: "GET", pattern: "/v1/expenses", handler: (_req, res) => res.json(200, { summary: this.olympus.expenses.summary(), pending: this.olympus.expenses.list("submitted") }) },
      { method: "GET", pattern: "/v1/recruitment", handler: (_req, res) => res.json(200, { metrics: this.olympus.recruitment.metrics(), openRoles: this.olympus.recruitment.listRequisitions("open") }) },
      { method: "GET", pattern: "/v1/kb", handler: (_req, res) => res.json(200, { summary: this.olympus.kb.summary(), collections: this.olympus.kb.listCollections() }) },
      { method: "GET", pattern: "/v1/contracts-mgmt", handler: (_req, res) => res.json(200, { summary: this.olympus.contractMgmt.summary(), expiring: this.olympus.contractMgmt.checkExpirations() }) },
      { method: "GET", pattern: "/v1/payroll", handler: (_req, res) => res.json(200, { summary: this.olympus.payroll.summary(), recentPeriods: this.olympus.payroll.listPeriods().slice(-3) }) },
      { method: "GET", pattern: "/v1/inventory", handler: (_req, res) => res.json(200, { summary: this.olympus.inventory.summary(), lowStock: this.olympus.inventory.listSKUs("low_stock") }) },
      { method: "GET", pattern: "/v1/partners", handler: (_req, res) => res.json(200, { summary: this.olympus.partners.summary(), partners: this.olympus.partners.listPartners() }) },
      { method: "GET", pattern: "/v1/events-mgmt", handler: (_req, res) => res.json(200, { summary: this.olympus.eventsMgmt.summary(), upcoming: this.olympus.eventsMgmt.list("registration_open") }) },
      { method: "GET", pattern: "/v1/billing", handler: (_req, res) => res.json(200, { summary: this.olympus.billing.summary(), openInvoices: this.olympus.billing.listInvoices().filter(i => i.status === "open") }) },
      { method: "GET", pattern: "/v1/analytics", handler: (_req, res) => res.json(200, { summary: this.olympus.analytics.summary(), metrics: this.olympus.analytics.listMetrics() }) },
      { method: "GET", pattern: "/v1/feedback", handler: (_req, res) => res.json(200, { summary: this.olympus.feedback.summary(), topRequests: this.olympus.feedback.listFeatureRequests("open").slice(0, 5) }) },
      { method: "GET", pattern: "/v1/flags", handler: (_req, res) => res.json(200, { summary: this.olympus.flags.summary(), flags: this.olympus.flags.listFlags("active") }) },
      { method: "GET", pattern: "/v1/access", handler: (_req, res) => res.json(200, { summary: this.olympus.access.summary(), roles: this.olympus.access.listRoles() }) },
      { method: "GET", pattern: "/v1/notif-center", handler: (_req, res) => res.json(200, { summary: this.olympus.notifCenter.summary() }) },
      { method: "GET", pattern: "/v1/strategy", handler: (_req, res) => res.json(200, { summary: this.olympus.strategy.summary(), pillars: this.olympus.strategy.listPillars() }) },
      { method: "GET", pattern: "/v1/org", handler: (_req, res) => res.json(200, { report: this.olympus.orgIntel.generateHealthReport(), teams: this.olympus.orgIntel.listTeams() }) },
      { method: "GET", pattern: "/v1/revenue-intel", handler: (_req, res) => res.json(200, { summary: this.olympus.revenueIntel.summary(), cohorts: this.olympus.revenueIntel.listCohorts() }) },
      { method: "GET", pattern: "/v1/churn", handler: (_req, res) => res.json(200, { summary: this.olympus.churnPredictor.summary(), highRisk: this.olympus.churnPredictor.listScores("high") }) },
      { method: "GET", pattern: "/v1/onboarding", handler: (_req, res) => res.json(200, { summary: this.olympus.onboarding.summary(), active: this.olympus.onboarding.listJourneys("in_progress") }) },
      { method: "GET", pattern: "/v1/engagement", handler: (_req, res) => res.json(200, { summary: this.olympus.engagement.summary(), surveys: this.olympus.engagement.listSurveys() }) },
      { method: "GET", pattern: "/v1/headcount-plan", handler: (_req, res) => res.json(200, { summary: this.olympus.headcountPlan.summary(), plans: this.olympus.headcountPlan.listPlans() }) },
      { method: "GET", pattern: "/v1/scenarios", handler: (_req, res) => res.json(200, { summary: this.olympus.scenarioSim.summary(), scenarios: this.olympus.scenarioSim.listScenarios() }) },
      { method: "GET", pattern: "/v1/supply-chain", handler: (_req, res) => res.json(200, { summary: this.olympus.supplyChain.summary(), suppliers: this.olympus.supplyChain.listSuppliers() }) },
      { method: "GET", pattern: "/v1/documents", handler: (_req, res) => res.json(200, { summary: this.olympus.docMgmt.summary(), documents: this.olympus.docMgmt.listDocuments() }) },
      { method: "GET", pattern: "/v1/roadmap", handler: (_req, res) => res.json(200, { summary: this.olympus.roadmap.summary(), items: this.olympus.roadmap.listItems(), releases: this.olympus.roadmap.listReleases() }) },
      { method: "GET", pattern: "/v1/journey", handler: (_req, res) => res.json(200, { summary: this.olympus.journey.summary(), journeys: this.olympus.journey.listJourneys() }) },
      { method: "GET", pattern: "/v1/legal", handler: (_req, res) => res.json(200, { summary: this.olympus.legal.summary(), cases: this.olympus.legal.listCases() }) },
      { method: "GET", pattern: "/v1/quality", handler: (_req, res) => res.json(200, { summary: this.olympus.quality.summary(), defects: this.olympus.quality.listDefects(), audits: this.olympus.quality.listAudits() }) },
      { method: "GET", pattern: "/v1/market-research", handler: (_req, res) => res.json(200, { summary: this.olympus.marketResearch.summary(), studies: this.olympus.marketResearch.listStudies(), competitors: this.olympus.marketResearch.listCompetitors() }) },
      { method: "GET", pattern: "/v1/pr", handler: (_req, res) => res.json(200, { summary: this.olympus.prComms.summary(), releases: this.olympus.prComms.listReleases(), crises: this.olympus.prComms.listCrises() }) },
      { method: "GET", pattern: "/v1/sales-intel", handler: (_req, res) => res.json(200, { summary: this.olympus.salesIntel.summary(), signals: this.olympus.salesIntel.listSignals() }) },
      { method: "GET", pattern: "/v1/product-usage", handler: (_req, res) => res.json(200, { summary: this.olympus.productUsage.summary(), adoptions: this.olympus.productUsage.listAdoptions() }) },
      { method: "GET", pattern: "/v1/data-warehouse", handler: (_req, res) => res.json(200, { summary: this.olympus.dataWarehouse.summary(), tables: this.olympus.dataWarehouse.listTables(), pipelines: this.olympus.dataWarehouse.listPipelines() }) },
      { method: "GET", pattern: "/v1/cost-centers", handler: (_req, res) => res.json(200, { summary: this.olympus.costCenter.summary(), centers: this.olympus.costCenter.listCenters() }) },
      { method: "GET", pattern: "/v1/grants", handler: (_req, res) => res.json(200, { summary: this.olympus.grants.summary(), grants: this.olympus.grants.listGrants() }) },
      { method: "GET", pattern: "/v1/esg", handler: (_req, res) => res.json(200, { summary: this.olympus.esg.summary(), metrics: this.olympus.esg.listMetrics(), reports: this.olympus.esg.listReports() }) },
      { method: "GET", pattern: "/v1/insurance", handler: (_req, res) => res.json(200, { summary: this.olympus.insurance.summary(), policies: this.olympus.insurance.listPolicies(), claims: this.olympus.insurance.listClaims() }) },
      { method: "GET", pattern: "/v1/workforce-schedule", handler: (_req, res) => res.json(200, { summary: this.olympus.workforceScheduler.summary(), shifts: this.olympus.workforceScheduler.listShifts() }) },
      { method: "GET", pattern: "/v1/treasury", handler: (_req, res) => res.json(200, { summary: this.olympus.treasury.summary(), accounts: this.olympus.treasury.listAccounts() }) },
      { method: "GET", pattern: "/v1/loyalty", handler: (_req, res) => res.json(200, { summary: this.olympus.loyalty.summary(), rewards: this.olympus.loyalty.listRewards(true) }) },
      { method: "GET", pattern: "/v1/m-and-a", handler: (_req, res) => res.json(200, { summary: this.olympus.mAndA.summary(), deals: this.olympus.mAndA.listDeals() }) },
      { method: "GET", pattern: "/v1/api-gateway", handler: (_req, res) => res.json(200, { summary: this.olympus.apiGateway.summary(), endpoints: this.olympus.apiGateway.listEndpoints() }) },
      { method: "GET", pattern: "/v1/international", handler: (_req, res) => res.json(200, { summary: this.olympus.international.summary(), markets: this.olympus.international.listMarkets() }) },
      { method: "GET", pattern: "/v1/pricing-optimizer", handler: (_req, res) => res.json(200, { summary: this.olympus.pricingOptimizer.summary(), recommendations: this.olympus.pricingOptimizer.listRecommendations(false) }) },
      { method: "GET", pattern: "/v1/talent-intel", handler: (_req, res) => res.json(200, { summary: this.olympus.talentIntel.summary(), successionPlans: this.olympus.talentIntel.listSuccessionPlans() }) },
      { method: "GET", pattern: "/v1/product-catalog", handler: (_req, res) => res.json(200, { summary: this.olympus.productCatalog.summary(), products: this.olympus.productCatalog.listProducts() }) },
      { method: "GET", pattern: "/v1/facilities", handler: (_req, res) => res.json(200, { summary: this.olympus.facilities.summary(), locations: this.olympus.facilities.listLocations() }) },
      { method: "GET", pattern: "/v1/budget-planner", handler: (_req, res) => res.json(200, { summary: this.olympus.budgetPlanner.summary(), budgets: this.olympus.budgetPlanner.listBudgets() }) },
      { method: "GET", pattern: "/v1/campaigns", handler: (_req, res) => res.json(200, { summary: this.olympus.campaignMgr.summary(), campaigns: this.olympus.campaignMgr.listCampaigns() }) },
      { method: "GET", pattern: "/v1/kpi-dashboard", handler: (_req, res) => res.json(200, { summary: this.olympus.kpiDashboard.summary(), kpis: this.olympus.kpiDashboard.listKPIs() }) },
      { method: "GET", pattern: "/v1/fleet", handler: (_req, res) => res.json(200, { summary: this.olympus.fleet.summary(), vehicles: this.olympus.fleet.listVehicles() }) },
      { method: "GET", pattern: "/v1/subscriptions", handler: (_req, res) => res.json(200, { summary: this.olympus.subscriptionMgr.summary(), subscriptions: this.olympus.subscriptionMgr.listSubscriptions() }) },
      { method: "GET", pattern: "/v1/real-estate", handler: (_req, res) => res.json(200, { summary: this.olympus.realEstate.summary(), properties: this.olympus.realEstate.listProperties() }) },
      { method: "GET", pattern: "/v1/permits", handler: (_req, res) => res.json(200, { summary: this.olympus.permits.summary(), permits: this.olympus.permits.listPermits() }) },
      { method: "GET", pattern: "/v1/tax", handler: (_req, res) => res.json(200, { summary: this.olympus.taxMgr.summary(), obligations: this.olympus.taxMgr.listObligations() }) },
      { method: "GET", pattern: "/v1/warehouse", handler: (_req, res) => res.json(200, { summary: this.olympus.warehouseMgr.summary(), warehouses: this.olympus.warehouseMgr.listWarehouses() }) },
      { method: "GET", pattern: "/v1/customer-feedback", handler: (_req, res) => res.json(200, { summary: this.olympus.customerFeedback.summary() }) },
      { method: "GET", pattern: "/v1/training", handler: (_req, res) => res.json(200, { summary: this.olympus.trainingMgr.summary(), courses: this.olympus.trainingMgr.listCourses("published") }) },
      { method: "GET", pattern: "/v1/procurement-engine", handler: (_req, res) => res.json(200, { summary: this.olympus.procurementEngine.summary(), rfqs: this.olympus.procurementEngine.listRFQs() }) },
      { method: "GET", pattern: "/v1/content", handler: (_req, res) => res.json(200, { summary: this.olympus.contentMgr.summary(), published: this.olympus.contentMgr.listContent("published") }) },
      { method: "GET", pattern: "/v1/project-portfolio", handler: (_req, res) => res.json(200, { summary: this.olympus.projectPortfolio.summary(), projects: this.olympus.projectPortfolio.listProjects() }) },
      { method: "GET", pattern: "/v1/crypto-treasury", handler: (_req, res) => res.json(200, { summary: this.olympus.cryptoTreasury.summary(), wallets: this.olympus.cryptoTreasury.listWallets() }) },
      { method: "GET", pattern: "/v1/board-governance", handler: (_req, res) => res.json(200, { summary: this.olympus.boardGovernance.summary(), directors: this.olympus.boardGovernance.listDirectors(true) }) },
      { method: "GET", pattern: "/v1/service-levels", handler: (_req, res) => res.json(200, { summary: this.olympus.serviceLevelMgr.summary(), tiers: this.olympus.serviceLevelMgr.listTiers() }) },
      { method: "GET", pattern: "/v1/digital-assets", handler: (_req, res) => res.json(200, { summary: this.olympus.digitalAssets.summary(), assets: this.olympus.digitalAssets.listAssets() }) },
      { method: "GET", pattern: "/v1/health-benefits", handler: (_req, res) => res.json(200, { summary: this.olympus.healthBenefits.summary(), plans: this.olympus.healthBenefits.listPlans() }) },
      { method: "GET", pattern: "/v1/commissions", handler: (_req, res) => res.json(200, { summary: this.olympus.commissionEngine.summary(), plans: this.olympus.commissionEngine.listPlans() }) },
      { method: "GET", pattern: "/v1/time-tracking", handler: (_req, res) => res.json(200, { summary: this.olympus.timeTracking.summary(), timesheets: this.olympus.timeTracking.listTimesheets() }) },
      { method: "GET", pattern: "/v1/vendor-risk", handler: (_req, res) => res.json(200, { summary: this.olympus.vendorRisk.summary(), assessments: this.olympus.vendorRisk.listAssessments() }) },
      { method: "GET", pattern: "/v1/warranties", handler: (_req, res) => res.json(200, { summary: this.olympus.warranty.summary(), warranties: this.olympus.warranty.listWarranties() }) },
      { method: "GET", pattern: "/v1/referrals", handler: (_req, res) => res.json(200, { summary: this.olympus.referral.summary(), programs: this.olympus.referral.listPrograms() }) },
      { method: "GET", pattern: "/v1/cap-table", handler: (_req, res) => res.json(200, { summary: this.olympus.capTable.summary(), shareClasses: this.olympus.capTable.listShareClasses() }) },
      { method: "GET", pattern: "/v1/approvals", handler: (_req, res) => res.json(200, { summary: this.olympus.approvalWorkflow.summary(), workflows: this.olympus.approvalWorkflow.listWorkflows() }) },
      { method: "GET", pattern: "/v1/dunning", handler: (_req, res) => res.json(200, { summary: this.olympus.dunning.summary(), receivables: this.olympus.dunning.listReceivables() }) },
      { method: "GET", pattern: "/v1/scheduled-events", handler: (_req, res) => res.json(200, { summary: this.olympus.eventScheduler.summary(), events: this.olympus.eventScheduler.listEvents() }) },
      { method: "GET", pattern: "/v1/promotions", handler: (_req, res) => res.json(200, { summary: this.olympus.promotion.summary(), promotions: this.olympus.promotion.listPromotions() }) },
      { method: "GET", pattern: "/v1/rebates", handler: (_req, res) => res.json(200, { summary: this.olympus.rebate.summary(), programs: this.olympus.rebate.listPrograms() }) },
      { method: "GET", pattern: "/v1/data-retention", handler: (_req, res) => res.json(200, { summary: this.olympus.dataRetention.summary(), policies: this.olympus.dataRetention.listPolicies() }) },
      { method: "GET", pattern: "/v1/access-reviews", handler: (_req, res) => res.json(200, { summary: this.olympus.accessReview.summary(), campaigns: this.olympus.accessReview.listCampaigns() }) },
      { method: "GET", pattern: "/v1/changes", handler: (_req, res) => res.json(200, { summary: this.olympus.changeMgmt.summary(), changes: this.olympus.changeMgmt.listChanges() }) },
      { method: "GET", pattern: "/v1/on-call", handler: (_req, res) => res.json(200, { summary: this.olympus.onCall.summary(), rotations: this.olympus.onCall.listRotations() }) },
      { method: "GET", pattern: "/v1/investor-relations", handler: (_req, res) => res.json(200, { summary: this.olympus.investorRelations.summary(), rounds: this.olympus.investorRelations.listRounds() }) },
      { method: "GET", pattern: "/v1/gift-cards", handler: (_req, res) => res.json(200, { summary: this.olympus.giftCard.summary(), cards: this.olympus.giftCard.listCards() }) },
      { method: "GET", pattern: "/v1/revenue-recognition", handler: (_req, res) => res.json(200, { summary: this.olympus.revRec.summary(), obligations: this.olympus.revRec.listObligations() }) },
      { method: "GET", pattern: "/v1/safety", handler: (_req, res) => res.json(200, { summary: this.olympus.safety.summary(), incidents: this.olympus.safety.listIncidents() }) },
      { method: "GET", pattern: "/v1/ethics", handler: (_req, res) => res.json(200, { summary: this.olympus.ethics.summary(), cases: this.olympus.ethics.listCases() }) },
      { method: "GET", pattern: "/v1/travel", handler: (_req, res) => res.json(200, { summary: this.olympus.travel.summary(), trips: this.olympus.travel.listTrips() }) },
      { method: "GET", pattern: "/v1/signatures", handler: (_req, res) => res.json(200, { summary: this.olympus.eSignature.summary(), envelopes: this.olympus.eSignature.listEnvelopes() }) },
      { method: "GET", pattern: "/v1/equipment-calibration", handler: (_req, res) => res.json(200, { summary: this.olympus.equipmentCalibration.summary(), equipment: this.olympus.equipmentCalibration.listEquipment() }) },
      { method: "GET", pattern: "/v1/localization", handler: (_req, res) => res.json(200, { summary: this.olympus.localization.summary(), projects: this.olympus.localization.listProjects().map(p => ({ id: p.id, name: p.name, sourceLocale: p.sourceLocale, keyCount: p.keys.size, localeCount: p.locales.size })) }) },
      { method: "GET", pattern: "/v1/affiliates", handler: (_req, res) => res.json(200, { summary: this.olympus.affiliate.summary(), affiliates: this.olympus.affiliate.listAffiliates() }) },
      { method: "GET", pattern: "/v1/webhook-delivery", handler: (_req, res) => res.json(200, { summary: this.olympus.webhookDelivery.summary(), endpoints: this.olympus.webhookDelivery.listEndpoints() }) },
      { method: "GET", pattern: "/v1/releases", handler: (_req, res) => res.json(200, { summary: this.olympus.release.summary(), releases: this.olympus.release.listReleases() }) },
      { method: "GET", pattern: "/v1/energy", handler: (_req, res) => res.json(200, { summary: this.olympus.energy.summary(), meters: this.olympus.energy.listMeters() }) },
      { method: "GET", pattern: "/v1/visitors", handler: (_req, res) => res.json(200, { summary: this.olympus.visitor.summary(), onSite: this.olympus.visitor.currentlyOnSite() }) },
      { method: "GET", pattern: "/v1/purchase-cards", handler: (_req, res) => res.json(200, { summary: this.olympus.purchaseCard.summary(), cards: this.olympus.purchaseCard.listCards() }) },
      { method: "GET", pattern: "/v1/cycle-counts", handler: (_req, res) => res.json(200, { summary: this.olympus.cycleCount.summary(), counts: this.olympus.cycleCount.listCounts() }) },
      { method: "GET", pattern: "/v1/reservations", handler: (_req, res) => res.json(200, { summary: this.olympus.reservation.summary(), resources: this.olympus.reservation.listResources() }) },
      { method: "GET", pattern: "/v1/complaints", handler: (_req, res) => res.json(200, { summary: this.olympus.complaint.summary(), complaints: this.olympus.complaint.listComplaints() }) },
      { method: "GET", pattern: "/v1/budget-transfers", handler: (_req, res) => res.json(200, { summary: this.olympus.budgetTransfer.summary(), pools: this.olympus.budgetTransfer.listPools() }) },
      { method: "GET", pattern: "/v1/asset-disposals", handler: (_req, res) => res.json(200, { summary: this.olympus.assetDisposal.summary(), disposals: this.olympus.assetDisposal.listDisposals() }) },
      { method: "GET", pattern: "/v1/petty-cash", handler: (_req, res) => res.json(200, { summary: this.olympus.pettyCash.summary(), funds: this.olympus.pettyCash.listFunds() }) },
      { method: "GET", pattern: "/v1/mileage", handler: (_req, res) => res.json(200, { summary: this.olympus.mileage.summary(), claims: this.olympus.mileage.listClaims() }) },
      { method: "GET", pattern: "/v1/document-templates", handler: (_req, res) => res.json(200, { summary: this.olympus.docTemplate.summary(), templates: this.olympus.docTemplate.listTemplates() }) },
      { method: "GET", pattern: "/v1/asset-transfers", handler: (_req, res) => res.json(200, { summary: this.olympus.assetTransfer.summary(), transfers: this.olympus.assetTransfer.listTransfers() }) },
      { method: "GET", pattern: "/v1/waitlists", handler: (_req, res) => res.json(200, { summary: this.olympus.waitlist.summary() }) },
      { method: "GET", pattern: "/v1/appointments", handler: (_req, res) => res.json(200, { summary: this.olympus.appointment.summary(), appointments: this.olympus.appointment.listAppointments() }) },
      { method: "GET", pattern: "/v1/supplier-scorecards", handler: (_req, res) => res.json(200, { summary: this.olympus.supplierScorecard.summary(), scorecards: this.olympus.supplierScorecard.listScorecards() }) },
      { method: "GET", pattern: "/v1/nonconformance", handler: (_req, res) => res.json(200, { summary: this.olympus.nonconformance.summary(), ncrs: this.olympus.nonconformance.listNCRs() }) },
      { method: "GET", pattern: "/v1/grievances", handler: (_req, res) => res.json(200, { summary: this.olympus.grievance.summary(), grievances: this.olympus.grievance.listGrievances() }) },
      { method: "GET", pattern: "/v1/asset-checkout", handler: (_req, res) => res.json(200, { summary: this.olympus.assetCheckout.summary(), items: this.olympus.assetCheckout.listItems() }) },
      { method: "GET", pattern: "/v1/sponsorships", handler: (_req, res) => res.json(200, { summary: this.olympus.sponsorship.summary(), sponsorships: this.olympus.sponsorship.listSponsorships() }) },
      { method: "GET", pattern: "/v1/memberships", handler: (_req, res) => res.json(200, { summary: this.olympus.membership.summary(), memberships: this.olympus.membership.listMemberships() }) },
      { method: "GET", pattern: "/v1/chargebacks", handler: (_req, res) => res.json(200, { summary: this.olympus.chargeback.summary(), chargebacks: this.olympus.chargeback.listChargebacks() }) },
      { method: "GET", pattern: "/v1/tax-exemptions", handler: (_req, res) => res.json(200, { summary: this.olympus.taxExemption.summary(), certificates: this.olympus.taxExemption.listCertificates() }) },
      { method: "GET", pattern: "/v1/background-checks", handler: (_req, res) => res.json(200, { summary: this.olympus.backgroundCheck.summary(), checks: this.olympus.backgroundCheck.listChecks() }) },
      { method: "GET", pattern: "/v1/insurance-certificates", handler: (_req, res) => res.json(200, { summary: this.olympus.insuranceCert.summary(), certificates: this.olympus.insuranceCert.listCerts() }) },
      { method: "GET", pattern: "/v1/requisitions", handler: (_req, res) => res.json(200, { summary: this.olympus.requisition.summary(), requisitions: this.olympus.requisition.listRequisitions() }) },
      { method: "GET", pattern: "/v1/goods-receipts", handler: (_req, res) => res.json(200, { summary: this.olympus.goodsReceipt.summary(), pos: this.olympus.goodsReceipt.listPOs() }) },
      { method: "GET", pattern: "/v1/physical-access", handler: (_req, res) => res.json(200, { summary: this.olympus.physicalAccess.summary(), badges: this.olympus.physicalAccess.listBadges() }) },
      { method: "GET", pattern: "/v1/asset-audits", handler: (_req, res) => res.json(200, { summary: this.olympus.assetAudit.summary(), audits: this.olympus.assetAudit.listAudits() }) },
      { method: "GET", pattern: "/v1/recalls", handler: (_req, res) => res.json(200, { summary: this.olympus.recall.summary(), recalls: this.olympus.recall.listRecalls() }) },
      { method: "GET", pattern: "/v1/service-contracts", handler: (_req, res) => res.json(200, { summary: this.olympus.serviceContract.summary(), contracts: this.olympus.serviceContract.listContracts() }) },
      { method: "GET", pattern: "/v1/escrows", handler: (_req, res) => res.json(200, { summary: this.olympus.escrow.summary(), escrows: this.olympus.escrow.listEscrows() }) },
      { method: "GET", pattern: "/v1/trade-deductions", handler: (_req, res) => res.json(200, { summary: this.olympus.tradeDeduction.summary(), deductions: this.olympus.tradeDeduction.listDeductions() }) },
      { method: "GET", pattern: "/v1/donations", handler: (_req, res) => res.json(200, { summary: this.olympus.donation.summary(), donations: this.olympus.donation.listDonations() }) },
      { method: "GET", pattern: "/v1/volunteering", handler: (_req, res) => res.json(200, { summary: this.olympus.volunteer.summary(), opportunities: this.olympus.volunteer.listOpportunities() }) },
      { method: "GET", pattern: "/v1/service-credits", handler: (_req, res) => res.json(200, { summary: this.olympus.serviceCredit.summary(), credits: this.olympus.serviceCredit.listCredits() }) },
      { method: "GET", pattern: "/v1/status-page", handler: (_req, res) => res.json(200, { overall: this.olympus.statusPage.overallStatus(), summary: this.olympus.statusPage.summary(), components: this.olympus.statusPage.listComponents() }) },
      { method: "GET", pattern: "/v1/webinars", handler: (_req, res) => res.json(200, { summary: this.olympus.webinar.summary(), webinars: this.olympus.webinar.listWebinars() }) },
      { method: "GET", pattern: "/v1/form-submissions", handler: (_req, res) => res.json(200, { summary: this.olympus.formSubmission.summary(), forms: this.olympus.formSubmission.listForms() }) },
      { method: "GET", pattern: "/v1/cash-advances", handler: (_req, res) => res.json(200, { summary: this.olympus.cashAdvance.summary(), advances: this.olympus.cashAdvance.listAdvances() }) },
      { method: "GET", pattern: "/v1/garnishments", handler: (_req, res) => res.json(200, { summary: this.olympus.garnishment.summary(), orders: this.olympus.garnishment.listOrders() }) },
      { method: "GET", pattern: "/v1/royalties", handler: (_req, res) => res.json(200, { summary: this.olympus.royalty.summary(), agreements: this.olympus.royalty.listAgreements() }) },
      { method: "GET", pattern: "/v1/seat-licenses", handler: (_req, res) => res.json(200, { summary: this.olympus.seatLicense.summary(), pools: this.olympus.seatLicense.listPools().map(p => ({ id: p.id, product: p.product, vendor: p.vendor, totalSeats: p.totalSeats, usedSeats: p.assignedTo.size, expiresAt: p.expiresAt })) }) },
      { method: "GET", pattern: "/v1/api-keys", handler: (_req, res) => res.json(200, { summary: this.olympus.apiKey.summary(), keys: this.olympus.apiKey.listKeys().map(k => ({ id: k.id, ownerId: k.ownerId, label: k.label, prefix: k.prefix, scopes: k.scopes, status: k.status })) }) },
      { method: "GET", pattern: "/v1/quotas", handler: (_req, res) => res.json(200, { summary: this.olympus.quotaUsage.summary(), quotas: this.olympus.quotaUsage.listQuotas() }) },
      { method: "GET", pattern: "/v1/consent", handler: (_req, res) => res.json(200, { summary: this.olympus.consent.summary(), records: this.olympus.consent.listRecords() }) },
      { method: "GET", pattern: "/v1/dsar", handler: (_req, res) => res.json(200, { summary: this.olympus.dsar.summary(), requests: this.olympus.dsar.listRequests() }) },
      { method: "GET", pattern: "/v1/carbon-credits", handler: (_req, res) => res.json(200, { summary: this.olympus.carbonCredit.summary(), lots: this.olympus.carbonCredit.listLots() }) },
      { method: "GET", pattern: "/v1/waste-streams", handler: (_req, res) => res.json(200, { summary: this.olympus.wasteStream.summary(), records: this.olympus.wasteStream.listRecords() }) },
      { method: "GET", pattern: "/v1/tax-nexus", handler: (_req, res) => res.json(200, { summary: this.olympus.taxNexus.summary(), obligations: this.olympus.taxNexus.obligations() }) },
      { method: "GET", pattern: "/v1/resellers", handler: (_req, res) => res.json(200, { summary: this.olympus.reseller.summary(), resellers: this.olympus.reseller.listResellers() }) },
      { method: "GET", pattern: "/v1/press-mentions", handler: (_req, res) => res.json(200, { summary: this.olympus.pressMention.summary(), mentions: this.olympus.pressMention.listMentions() }) },
      { method: "GET", pattern: "/v1/influencers", handler: (_req, res) => res.json(200, { summary: this.olympus.influencer.summary(), influencers: this.olympus.influencer.listInfluencers() }) },
      { method: "GET", pattern: "/v1/rfps", handler: (_req, res) => res.json(200, { summary: this.olympus.rfp.summary(), rfps: this.olympus.rfp.listRFPs() }) },
      { method: "GET", pattern: "/v1/case-studies", handler: (_req, res) => res.json(200, { summary: this.olympus.caseStudy.summary(), caseStudies: this.olympus.caseStudy.listCaseStudies() }) },
      { method: "GET", pattern: "/v1/partner-certifications", handler: (_req, res) => res.json(200, { summary: this.olympus.partnerCert.summary(), tracks: this.olympus.partnerCert.listTracks() }) },
      { method: "GET", pattern: "/v1/winback", handler: (_req, res) => res.json(200, { summary: this.olympus.winback.summary(), campaigns: this.olympus.winback.listCampaigns() }) },
      { method: "GET", pattern: "/v1/bundles", handler: (_req, res) => res.json(200, { summary: this.olympus.bundle.summary(), bundles: this.olympus.bundle.listBundles() }) },
      { method: "GET", pattern: "/v1/upsell", handler: (_req, res) => res.json(200, { summary: this.olympus.upsell.summary(), rules: this.olympus.upsell.listRules() }) },
      { method: "GET", pattern: "/v1/experiments", handler: (_req, res) => res.json(200, { summary: this.olympus.experiment.summary(), experiments: this.olympus.experiment.listExperiments() }) },
      { method: "GET", pattern: "/v1/nps-surveys", handler: (_req, res) => res.json(200, { summary: this.olympus.npsSurvey.summary(), surveys: this.olympus.npsSurvey.listSurveys().map(s => ({ id: s.id, name: s.name, state: s.state, responses: s.responses.length })) }) },
      { method: "GET", pattern: "/v1/delivery-routes", handler: (_req, res) => res.json(200, { summary: this.olympus.deliveryRoute.summary(), routes: this.olympus.deliveryRoute.listRoutes() }) },
      { method: "GET", pattern: "/v1/cold-chain", handler: (_req, res) => res.json(200, { summary: this.olympus.coldChain.summary(), shipments: this.olympus.coldChain.listShipments() }) },
      { method: "GET", pattern: "/v1/replenishment", handler: (_req, res) => res.json(200, { summary: this.olympus.replenishment.summary(), suggestions: this.olympus.replenishment.listSuggestions("open") }) },
      { method: "GET", pattern: "/v1/dropship", handler: (_req, res) => res.json(200, { summary: this.olympus.dropship.summary(), orders: this.olympus.dropship.listOrders() }) },
      { method: "GET", pattern: "/v1/capex", handler: (_req, res) => res.json(200, { summary: this.olympus.capex.summary(), requests: this.olympus.capex.listRequests() }) },
      { method: "GET", pattern: "/v1/asset-financing", handler: (_req, res) => res.json(200, { summary: this.olympus.assetFinancing.summary(), agreements: this.olympus.assetFinancing.listAgreements() }) },
      { method: "GET", pattern: "/v1/sales-sequences", handler: (_req, res) => res.json(200, { summary: this.olympus.salesSequence.summary(), sequences: this.olympus.salesSequence.listSequences() }) },
      { method: "GET", pattern: "/v1/lead-scoring", handler: (_req, res) => res.json(200, { summary: this.olympus.leadScoring.summary(), rules: this.olympus.leadScoring.listRules() }) },
      { method: "GET", pattern: "/v1/account-plans", handler: (_req, res) => res.json(200, { summary: this.olympus.accountPlan.summary(), plans: this.olympus.accountPlan.listPlans() }) },
      { method: "GET", pattern: "/v1/qbrs", handler: (_req, res) => res.json(200, { summary: this.olympus.qbr.summary(), qbrs: this.olympus.qbr.listQBRs() }) },
      { method: "GET", pattern: "/v1/renewals", handler: (_req, res) => res.json(200, { summary: this.olympus.renewal.summary(), renewals: this.olympus.renewal.listRenewals() }) },
      { method: "GET", pattern: "/v1/churn-save", handler: (_req, res) => res.json(200, { summary: this.olympus.churnSave.summary(), cases: this.olympus.churnSave.listCases() }) },
      { method: "GET", pattern: "/v1/marketplace", handler: (_req, res) => res.json(200, { summary: this.olympus.marketplace.summary(), listings: this.olympus.marketplace.listListings("published") }) },
      { method: "GET", pattern: "/v1/integrations", handler: (_req, res) => res.json(200, { summary: this.olympus.integration.summary(), connectors: this.olympus.integration.listConnectors() }) },
      { method: "GET", pattern: "/v1/field-service", handler: (_req, res) => res.json(200, { summary: this.olympus.fieldService.summary(), workOrders: this.olympus.fieldService.listWorkOrders() }) },
      { method: "GET", pattern: "/v1/preventive-maintenance", handler: (_req, res) => res.json(200, { summary: this.olympus.preventiveMaintenance.summary(), schedules: this.olympus.preventiveMaintenance.listSchedules() }) },
      { method: "GET", pattern: "/v1/product-reviews", handler: (_req, res) => res.json(200, { summary: this.olympus.productReview.summary(), reviews: this.olympus.productReview.listReviews(undefined, "approved") }) },
      { method: "GET", pattern: "/v1/product-qna", handler: (_req, res) => res.json(200, { summary: this.olympus.productQnA.summary(), unanswered: this.olympus.productQnA.unanswered() }) },
      { method: "GET", pattern: "/v1/store-credit", handler: (_req, res) => res.json(200, { summary: this.olympus.storeCredit.summary(), wallets: this.olympus.storeCredit.listWallets() }) },
      { method: "GET", pattern: "/v1/layaway", handler: (_req, res) => res.json(200, { summary: this.olympus.layaway.summary(), plans: this.olympus.layaway.listPlans("active") }) },
      { method: "GET", pattern: "/v1/fraud-detection", handler: (_req, res) => res.json(200, { summary: this.olympus.fraudDetection.summary(), rules: this.olympus.fraudDetection.listRules() }) },
      { method: "GET", pattern: "/v1/identity-verification", handler: (_req, res) => res.json(200, { summary: this.olympus.identityVerification.summary() }) },
      { method: "GET", pattern: "/v1/abandoned-carts", handler: (_req, res) => res.json(200, { summary: this.olympus.abandonedCart.summary() }) },
      { method: "GET", pattern: "/v1/wishlists", handler: (_req, res) => res.json(200, { summary: this.olympus.wishlist.summary() }) },
      { method: "GET", pattern: "/v1/preorders", handler: (_req, res) => res.json(200, { summary: this.olympus.preorder.summary(), campaigns: this.olympus.preorder.listCampaigns() }) },
      { method: "GET", pattern: "/v1/auctions", handler: (_req, res) => res.json(200, { summary: this.olympus.auction.summary(), auctions: this.olympus.auction.listAuctions("open") }) },
      { method: "GET", pattern: "/v1/clause-library", handler: (_req, res) => res.json(200, { summary: this.olympus.clauseLibrary.summary(), clauses: this.olympus.clauseLibrary.listClauses(undefined, "approved") }) },
      { method: "GET", pattern: "/v1/redlines", handler: (_req, res) => res.json(200, { summary: this.olympus.redline.summary(), open: this.olympus.redline.listRedlines(undefined, "open") }) },
      { method: "GET", pattern: "/v1/discount-approvals", handler: (_req, res) => res.json(200, { summary: this.olympus.discountApproval.summary(), pending: this.olympus.discountApproval.listRequests("pending") }) },
      { method: "GET", pattern: "/v1/margin-guard", handler: (_req, res) => res.json(200, { summary: this.olympus.marginGuard.summary(), blocked: this.olympus.marginGuard.listChecks("block") }) },
      { method: "GET", pattern: "/v1/deal-rooms", handler: (_req, res) => res.json(200, { summary: this.olympus.dealRoom.summary() }) },
      { method: "GET", pattern: "/v1/mutual-action-plans", handler: (_req, res) => res.json(200, { summary: this.olympus.mutualActionPlan.summary(), active: this.olympus.mutualActionPlan.listPlans("active") }) },

      { method: "GET", pattern: "/v1/forecast/scenarios", handler: (_req, res) => {
        const heliosAssumptions = {
          startingArrUsd: 3_200_000,
          startingCashUsd: 4_200_000,
          arrGrowthRate: 0.04,
          churnRate: 0.012,
          avgDealSizeUsd: 85_000,
          newDealsPerMonth: 2,
          monthlyOpexUsd: 95_000,
          opexGrowthRate: 0.02,
          monthlyPayrollUsd: 380_000,
          headcountGrowthRate: 0.03,
          grossMargin: 0.72,
        };
        return res.json(200, this.olympus.forecasting.compareScenarios(heliosAssumptions));
      } },
    );
  }

  private match(method: string, path: string): { route: Route; params: Record<string, string> } | undefined {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const rSeg = route.pattern.split("/").filter(Boolean);
      const pSeg = path.split("/").filter(Boolean);
      if (rSeg.length !== pSeg.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < rSeg.length; i++) {
        const r = rSeg[i]!;
        const p = pSeg[i]!;
        if (r.startsWith(":")) params[r.slice(1)] = decodeURIComponent(p);
        else if (r !== p) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return undefined;
  }

  // -- handlers -------------------------------------------------------------

  private async handleAsk(req: ApiRequest, res: ApiResponse): Promise<void> {
    const body = (req.body ?? {}) as {
      question?: string;
      domain?: Domain;
      options?: string[];
      depth?: AskOptions["depth"];
      intervention?: AskOptions["intervention"];
      capability?: string;
      exposureAmount?: number;
      simSeed?: number;
    };
    if (!body.question) return res.json(400, { error: "question is required" });

    const answer = await this.olympus.ere.ask(body.question, {
      domain: body.domain,
      options: body.options,
      depth: body.depth,
      intervention: body.intervention,
      capability: body.capability,
      exposureAmount: body.exposureAmount,
      simSeed: body.simSeed,
    });
    res.json(200, answer);
  }

  private handleOpenDecision(req: ApiRequest, res: ApiResponse): void {
    const body = (req.body ?? {}) as { question?: string; domain?: Domain; options?: string[] };
    if (!body.question) return res.json(400, { error: "question is required" });
    const domain: Domain = body.domain ?? "strategy";
    const decision = this.olympus.okg.addDecision(
      {
        question: body.question,
        domain,
        options: (body.options ?? ["proceed", "do-not-proceed"]).map((label) => ({ label })),
        autonomyLevel: 1,
        status: "proposed",
      },
      "api",
    );
    res.json(201, {
      decision_id: decision.id,
      status: decision.props.status,
      domain,
      convening_agents: this.olympus.roster.filter((a) => a.relevance(domain) > 0).map((a) => a.name),
    });
  }

  private handleListDecisions(res: ApiResponse): void {
    const decisions = this.olympus.okg.nodesByType("Decision").map((n) => ({
      decision_id: n.id,
      ...(n.props as Record<string, unknown>),
    }));
    res.json(200, { decisions });
  }

  private handleGetDecision(req: ApiRequest, res: ApiResponse): void {
    const node = this.olympus.okg.currentNode(req.params.id!);
    if (!node || node.type !== "Decision") return res.json(404, { error: "decision not found" });
    res.json(200, { decision_id: node.id, ...(node.props as Record<string, unknown>) });
  }

  private handleSimulate(req: ApiRequest, res: ApiResponse): void {
    if (!this.olympus.twin) return res.json(503, { error: "no digital twin configured" });
    const body = (req.body ?? {}) as {
      decisionId?: string;
      intervention?: { variable: string; delta: number };
      runs?: number;
      seed?: number;
    };
    if (!body.intervention) return res.json(400, { error: "intervention is required" });
    const sim = this.olympus.twin.run({
      type: "causal_intervention",
      decisionId: body.decisionId ?? "ad-hoc",
      intervention: body.intervention,
      runs: body.runs ?? 10_000,
      seed: body.seed ?? 42,
    });
    res.json(200, sim);
  }

  private handleCompare(req: ApiRequest, res: ApiResponse): void {
    if (!this.olympus.twin) return res.json(400, { error: "No digital twin configured" });
    const body = (req.body ?? {}) as {
      a?: { label?: string; intervention?: { variable: string; delta: number }; seed?: number };
      b?: { label?: string; intervention?: { variable: string; delta: number }; seed?: number };
    };
    if (!body.a?.intervention || !body.b?.intervention) {
      return res.json(400, { error: "a.intervention and b.intervention are required" });
    }
    const specA = { label: body.a.label ?? "a", intervention: body.a.intervention, seed: body.a.seed };
    const specB = { label: body.b.label ?? "b", intervention: body.b.intervention, seed: body.b.seed };
    const result = compareScenarios(this.olympus.twin, specA, specB);
    res.json(200, result);
  }

  private handleDiagnose(req: ApiRequest, res: ApiResponse): void {
    const body = (req.body ?? {}) as {
      query?: string;
      anchorIds?: string[];
      embedding?: number[];
      topK?: number;
    };
    if (!body.query) return res.json(400, { error: "query is required" });
    // Default to anchoring on the causal roots (Risk + Event nodes) so a
    // diagnosis walks the structure even when the caller has no node ids.
    const anchors =
      body.anchorIds && body.anchorIds.length > 0
        ? body.anchorIds
        : this.olympus.okg
            .snapshot()
            .filter((n) => n.type === "Risk" || n.type === "Event")
            .map((n) => n.id);
    const ctx = this.olympus.rag.retrieve(body.query, anchors, body.embedding, {}, body.topK ?? 12);
    res.json(200, ctx);
  }

  private handleListGrants(res: ApiResponse): void {
    res.json(200, {
      killed: this.olympus.autonomy.isKilled(),
      grants: this.olympus.autonomy.listGrants(),
    });
  }

  private handleSetGrant(req: ApiRequest, res: ApiResponse): void {
    const body = (req.body ?? {}) as {
      domain?: Domain;
      capability?: string;
      level?: number;
      blast_radius?: { max_amount?: number; max_per_day?: number };
      blastRadius?: { maxAmount?: number; maxPerDay?: number };
    };
    if (!body.domain || !body.capability || body.level === undefined) {
      return res.json(400, { error: "domain, capability, and level are required" });
    }
    const br = body.blastRadius
      ? body.blastRadius
      : body.blast_radius
        ? { maxAmount: body.blast_radius.max_amount, maxPerDay: body.blast_radius.max_per_day }
        : undefined;
    const grant = this.olympus.autonomy.setGrant({
      domain: body.domain,
      capability: body.capability,
      level: body.level as AutonomyLevel,
      blastRadius:
        br && br.maxAmount !== undefined && br.maxPerDay !== undefined
          ? { maxAmount: br.maxAmount, maxPerDay: br.maxPerDay }
          : undefined,
    });
    res.json(200, grant);
  }

  private handleInbox(req: ApiRequest, res: ApiResponse): void {
    const pendingOnly = req.query.get("pending") === "true";
    const items = pendingOnly ? this.olympus.inbox.pending() : this.olympus.inbox.all();
    res.json(200, { stats: this.olympus.inbox.stats(), items });
  }

  private handleResolveInbox(req: ApiRequest, res: ApiResponse): void {
    const ok = this.olympus.inbox.resolve(req.params.id!);
    if (!ok) return res.json(404, { error: "inbox item not found" });
    res.json(200, { decision_id: req.params.id, status: "resolved" });
  }

  private handleEvents(req: ApiRequest, res: ApiResponse): void {
    const limit = Number(req.query.get("limit") ?? "100");
    const all = this.olympus.bus.events();
    const slice = all.slice(Math.max(0, all.length - limit));
    res.json(200, { total: all.length, events: slice });
  }

  private handleAddObjective(req: ApiRequest, res: ApiResponse): void {
    const body = req.body as AddObjectiveInput | undefined;
    if (!body?.id || !body.label || !body.owner || !body.dueDate || !Array.isArray(body.keyResults)) {
      return res.json(400, { error: "id, label, owner, dueDate, and keyResults are required" });
    }
    const objective = this.olympus.okr.addObjective(body);
    res.json(200, objective);
  }

  private handleAudit(res: ApiResponse): void {
    res.json(200, {
      summary: this.olympus.auditLog.summary(),
      recent: this.olympus.auditLog.query({ limit: 20 }),
    });
  }

  // -- transport ------------------------------------------------------------

  private async readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (chunks.length === 0) return undefined;
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("invalid JSON body");
    }
  }

  /** Build (but don't start) the underlying Node server — useful for tests. */
  handler = async (raw: IncomingMessage, rawRes: ServerResponse): Promise<void> => {
    const url = new URL(raw.url ?? "/", "http://localhost");
    const res: ApiResponse = {
      json: (status, payload) => {
        const data = JSON.stringify(payload, null, 2);
        rawRes.writeHead(status, { "content-type": "application/json" });
        rawRes.end(data);
      },
    };

    // Operator console — a single self-contained HTML page.
    if ((raw.method ?? "GET") === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      rawRes.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      rawRes.end(DASHBOARD_HTML);
      return;
    }

    // Auth + rate limiting gate every /v1/* route (console + /healthz stay open).
    if (url.pathname.startsWith("/v1/")) {
      const caller = this.authenticate(raw);
      if (caller === null) {
        rawRes.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
        rawRes.end(JSON.stringify({ error: "unauthorized: valid Bearer token required" }));
        return;
      }
      if (!this.withinRateLimit(caller)) {
        const retryMs = this.rateLimit?.windowMs ?? 0;
        rawRes.writeHead(429, { "content-type": "application/json", "retry-after": String(Math.ceil(retryMs / 1000)) });
        rawRes.end(JSON.stringify({ error: "rate limit exceeded" }));
        return;
      }
    }

    // Executive board report — rendered Markdown, not JSON.
    if ((raw.method ?? "GET") === "GET" && url.pathname === "/v1/report") {
      const markdown = this.olympus.boardReport.render({ companyName: "Helios Robotics" });
      rawRes.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
      rawRes.end(markdown);
      return;
    }

    // Live event stream — Server-Sent Events over plain HTTP (zero deps).
    // The BLUEPRINT specifies a WebSocket; SSE is the dependency-free reference
    // for one-way event push and swaps cleanly for WS in production.
    if ((raw.method ?? "GET") === "GET" && url.pathname === "/v1/stream") {
      return this.streamEvents(raw, rawRes, url.searchParams.get("topic") ?? "*");
    }

    const matched = this.match(raw.method ?? "GET", url.pathname);
    if (!matched) return res.json(404, { error: `no route for ${raw.method} ${url.pathname}` });

    let body: unknown;
    try {
      body = await this.readBody(raw);
    } catch (err) {
      return res.json(400, { error: (err as Error).message });
    }

    try {
      await matched.route.handler({ params: matched.params, query: url.searchParams, body }, res);
    } catch (err) {
      res.json(500, { error: (err as Error).message });
    }
  };

  /** Hold an SSE connection open, pushing each matching bus event as it fires. */
  private streamEvents(raw: IncomingMessage, res: ServerResponse, topic: string): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ topic })}\n\n`);

    const unsubscribe = this.olympus.bus.subscribe(topic, (e) => {
      res.write(`event: ${e.topic}\ndata: ${JSON.stringify(e)}\n\n`);
    });

    // Heartbeat keeps proxies from closing an idle stream.
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    raw.on("close", cleanup);
    res.on("error", cleanup);
  }

  listen(port = 7777): Promise<number> {
    this.server = createServer(this.handler);
    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        const addr = this.server!.address();
        const actual = typeof addr === "object" && addr ? addr.port : port;
        resolve(actual);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

// Run directly: `tsx core/api/server.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const { DigitalTwin } = await import("../simulation/digital-twin.js");
  const twin = new DigitalTwin({
    metric: "q3_cash_usd",
    coefficients: { pipeline_conversion: 4_000_000, marketing_spend: -1.0, base_revenue: 1.0 },
    baseline: { pipeline_conversion: 0.22, marketing_spend: 900_000, base_revenue: 2_500_000 },
    noiseFraction: 0.08,
  });
  // Optional durable event log: set OLYMPUS_LOG to persist + replay across restarts.
  let sink: import("../events/event-bus.js").EventSink | undefined;
  let replayed = 0;
  if (process.env.OLYMPUS_LOG) {
    const { FileEventLog } = await import("../persistence/file-event-log.js");
    const log = new FileEventLog(process.env.OLYMPUS_LOG);
    replayed = log.count();
    sink = log;
  }

  // Use Claude when ANTHROPIC_API_KEY is set; otherwise the deterministic MockLLM.
  const { ClaudeClient } = await import("../llm/claude-client.js");
  const llm = ClaudeClient.fromEnv();

  // Optional auth: OLYMPUS_API_KEYS="key1:alice,key2:ci". Optional rate limit:
  // OLYMPUS_RATE_LIMIT="100/60000" (max/windowMs).
  const apiKeys: Record<string, string> = {};
  if (process.env.OLYMPUS_API_KEYS) {
    for (const pair of process.env.OLYMPUS_API_KEYS.split(",")) {
      const [key, label] = pair.split(":");
      if (key) apiKeys[key.trim()] = (label ?? key).trim();
    }
  }
  let rateLimit: RateLimit | undefined;
  if (process.env.OLYMPUS_RATE_LIMIT) {
    const [max, windowMs] = process.env.OLYMPUS_RATE_LIMIT.split("/").map(Number);
    if (max && windowMs) rateLimit = { max, windowMs };
  }

  const api = new OlympusApiServer({ twin, sink, llm, apiKeys, rateLimit });
  if (process.env.OLYMPUS_LOG && replayed > 0) {
    const { FileEventLog } = await import("../persistence/file-event-log.js");
    api.olympus.bus.hydrate(new FileEventLog(process.env.OLYMPUS_LOG).readAll());
    api.olympus.inbox.rebuild(api.olympus.bus);
  }
  api.olympus.autonomy.setGrant({
    domain: "finance",
    capability: "reallocate_budget",
    level: 5,
    blastRadius: { maxAmount: 250_000, maxPerDay: 10 },
  });
  // Seed the worked churn scenario so /v1/diagnose has a causal graph to walk.
  const { seedChurnScenario } = await import("../scenarios/churn.js");
  seedChurnScenario(api.olympus);
  // Seed a realistic demo company so the console + Health Score render against
  // real numbers on first load. Opt out with OLYMPUS_NO_SEED=1.
  if (!process.env.OLYMPUS_NO_SEED) {
    const { seedCompany } = await import("../scenarios/company.js");
    seedCompany(api.olympus);
  }
  const port = Number(process.env.PORT ?? 7777);
  const actual = await api.listen(port);
  console.log(`Olympus API listening on http://localhost:${actual}`);
  console.log(`Cognition: ${llm ? "Claude (ANTHROPIC_API_KEY detected)" : "MockLLM (deterministic; set ANTHROPIC_API_KEY for Claude)"}`);
  console.log(`Auth: ${Object.keys(apiKeys).length ? Object.keys(apiKeys).length + " API key(s)" : "open (set OLYMPUS_API_KEYS to require Bearer tokens)"}${rateLimit ? ` · rate limit ${rateLimit.max}/${rateLimit.windowMs}ms` : ""}`);
  if (process.env.OLYMPUS_LOG) console.log(`Durable log: ${process.env.OLYMPUS_LOG} (replayed ${replayed} events)`);
  console.log("Try: curl -s localhost:" + actual + "/healthz");
  console.log(`     curl -s -XPOST localhost:${actual}/v1/ask -d '{"question":"Cut Q3 spend 18%?","domain":"finance","options":["cut-18pct","hold"],"intervention":{"variable":"marketing_spend","delta":-0.18},"capability":"reallocate_budget","exposureAmount":162000,"simSeed":7}'`);
}
