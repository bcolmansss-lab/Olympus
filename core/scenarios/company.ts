/**
 * Demo company seed — "Helios Robotics", a mid-stage SaaS startup.
 *
 * Populates every business module (finance, pipeline, risk, SLA, capacity, OKR)
 * with a coherent, deterministic dataset so the operator console and the
 * Company Health Score render against real numbers instead of empty state.
 *
 * The numbers are tuned so the composite Health Score lands in a realistic
 * "fair/good" band — strong growth and capacity, a healthy-but-tight runway,
 * mixed SLA reliability, and partially-attained OKRs. Nothing is random:
 * re-running this seed always produces the same world.
 */

import type { Olympus } from "../index.js";
import type { ForecastAssumptions } from "../forecasting/forecast-engine.js";

/** Format a Date as an ISO date (YYYY-MM-DD). */
function isoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

/** A date `daysAgo` days before now. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Seed the full Helios Robotics company dataset onto an Olympus instance.
 * Idempotency is NOT guaranteed — call once on a fresh instance.
 */
export function seedCompany(olympus: Olympus): void {
  seedFinance(olympus);
  seedPipeline(olympus);
  seedRisk(olympus);
  seedSla(olympus);
  seedCapacity(olympus);
  seedOkr(olympus);
  seedVendors(olympus);
  seedPeople(olympus);
  seedProjects(olympus);
  seedCustomerSuccess(olympus);
  seedProductAnalytics(olympus);
  seedCompliance(olympus);
  seedCompetitiveIntel(olympus);
  seedIncidents(olympus);
  seedMarketing(olympus);
  seedForecasting(olympus);
  seedDataPipeline(olympus);
  seedSupport(olympus);
  seedCommunication(olympus);
  seedPricing(olympus);
  seedAssets(olympus);
}

function seedFinance(olympus: Olympus): void {
  const ledger = olympus.ledger;
  // Opening balances: ~$4.2M cash in the bank.
  ledger.addAccount({ id: "cash", name: "Operating Cash", type: "asset", balance: 4_200_000 });
  ledger.addAccount({ id: "revenue", name: "Subscription Revenue", type: "revenue" });
  ledger.addAccount({ id: "opex", name: "Operating Expenses", type: "expense" });
  ledger.addAccount({ id: "payroll", name: "Payroll", type: "expense" });

  // ~2 months of activity. Each month: $380k revenue in, $520k spend out.
  // Net burn ≈ $140k/mo on payroll + opex split, against $4.2M cash.
  // Burn rate uses expense debits minus revenue credits over a 3mo window.
  const months = [55, 35, 12]; // three monthly cycles within the last ~60 days
  for (const offset of months) {
    const revDate = isoDate(daysAgo(offset));
    const payDate = isoDate(daysAgo(offset - 2));
    const opexDate = isoDate(daysAgo(offset - 4));

    // Revenue inflow: debit cash, credit revenue.
    ledger.post({
      date: revDate,
      description: "Monthly subscription revenue",
      debitAccountId: "cash",
      creditAccountId: "revenue",
      amount: 380_000,
    });
    // Payroll outflow: debit payroll expense, credit cash.
    ledger.post({
      date: payDate,
      description: "Monthly payroll run",
      debitAccountId: "payroll",
      creditAccountId: "cash",
      amount: 520_000,
    });
    // Other opex outflow: debit opex expense, credit cash.
    ledger.post({
      date: opexDate,
      description: "Cloud, tooling, and G&A",
      debitAccountId: "opex",
      creditAccountId: "cash",
      amount: 260_000,
    });
  }
}

function seedPipeline(olympus: Olympus): void {
  const pipeline = olympus.pipeline;

  pipeline.createDeal({ name: "Acme Manufacturing", arrUsd: 240_000, stage: "negotiation", owner: "Dana Reyes" });
  pipeline.createDeal({ name: "Northwind Logistics", arrUsd: 180_000, stage: "proposal", owner: "Dana Reyes" });
  pipeline.createDeal({ name: "Cascade Foods", arrUsd: 95_000, stage: "proposal", owner: "Sam Okafor" });
  pipeline.createDeal({ name: "Pinnacle Health", arrUsd: 60_000, stage: "qualified", owner: "Sam Okafor" });
  pipeline.createDeal({ name: "Vertex Components", arrUsd: 42_000, stage: "qualified", owner: "Dana Reyes" });
  pipeline.createDeal({ name: "Orion Freight", arrUsd: 150_000, stage: "closed_won", owner: "Sam Okafor" });
  pipeline.createDeal({ name: "Stellar Retail", arrUsd: 110_000, stage: "closed_lost", owner: "Dana Reyes" });
}

function seedRisk(olympus: Olympus): void {
  const reg = olympus.riskRegister;

  reg.raise({
    id: "risk-concentration",
    title: "Key customer concentration",
    description: "Top 3 accounts represent 48% of ARR; loss of one materially dents revenue.",
    category: "operational",
    domain: "sales",
    probability: 0.4,
    impact: 4,
    owner: "VP Sales",
  });

  reg.raise({
    id: "risk-cloud-cost",
    title: "Cloud cost overrun",
    description: "Inference compute spend trending 18% over budget as usage scales.",
    category: "financial",
    domain: "finance",
    probability: 0.6,
    impact: 2,
    owner: "Head of Infra",
  });

  reg.raise({
    id: "risk-attrition",
    title: "Senior engineer attrition",
    description: "Two staff engineers hold critical control-systems knowledge with thin coverage.",
    category: "operational",
    domain: "people",
    probability: 0.3,
    impact: 4,
    owner: "VP Engineering",
  });

  reg.raise({
    id: "risk-soc2",
    title: "SOC2 audit delay",
    description: "Type II audit window slipping; enterprise deals gate on the report.",
    category: "compliance",
    domain: "operations",
    probability: 0.5,
    impact: 3,
    owner: "Head of Security",
  });

  // Show the mitigation flow on the cloud-cost risk: add a mitigation and
  // record a reduced residual exposure.
  reg.addMitigation("risk-cloud-cost", {
    description: "Reserved-capacity commitments + per-tenant compute budgets and alerts.",
    owner: "Head of Infra",
    dueDate: isoDate(daysAgo(-30)),
  });
  reg.setResidual("risk-cloud-cost", 0.3, 2);
}

function seedSla(olympus: Olympus): void {
  const sla = olympus.sla;

  sla.register({
    id: "sla-uptime",
    contractName: "Enterprise Platform SLA",
    metric: "api_uptime_pct",
    threshold: 99.9,
    direction: "above",
    penaltyUsd: 10_000,
    atRiskPct: 0.02,
  });
  sla.register({
    id: "sla-latency",
    contractName: "Enterprise Platform SLA",
    metric: "p99_latency_ms",
    threshold: 250,
    direction: "below",
    penaltyUsd: 5_000,
    atRiskPct: 10,
  });
  sla.register({
    id: "sla-support",
    contractName: "Premium Support SLA",
    metric: "support_response_hrs",
    threshold: 4,
    direction: "below",
    penaltyUsd: 2_000,
    atRiskPct: 10,
  });

  // Healthy: uptime comfortably above 99.9.
  sla.record("sla-uptime", 99.97, isoDate(daysAgo(1)));
  // At-risk: latency under 250 but within the 10% at-risk zone (225–250).
  sla.record("sla-latency", 238, isoDate(daysAgo(1)));
  // Breached: support response over the 4h commitment.
  sla.record("sla-support", 5.5, isoDate(daysAgo(1)));
}

function seedCapacity(olympus: Olympus): void {
  const cap = olympus.capacity;

  cap.addResource({ id: "eng-priya", name: "Priya Nair", role: "engineer", availability: 1.0 });
  cap.addResource({ id: "eng-marcus", name: "Marcus Lee", role: "engineer", availability: 1.0 });
  cap.addResource({ id: "eng-jo", name: "Jo Tanaka", role: "engineer", availability: 1.0 });
  cap.addResource({ id: "design-ines", name: "Ines Costa", role: "designer", availability: 1.0 });
  cap.addResource({ id: "pm-omar", name: "Omar Haddad", role: "pm", availability: 1.0 });

  cap.addProject({
    id: "proj-fleet",
    name: "Fleet Autonomy v2",
    startDate: isoDate(daysAgo(20)),
    endDate: isoDate(daysAgo(-70)),
    demands: { engineer: 2, designer: 0.5, pm: 0.5 },
  });
  cap.addProject({
    id: "proj-observability",
    name: "Observability Platform",
    startDate: isoDate(daysAgo(10)),
    endDate: isoDate(daysAgo(-50)),
    demands: { engineer: 1.5, pm: 0.5 },
  });
  cap.addProject({
    id: "proj-soc2",
    name: "SOC2 Readiness",
    startDate: isoDate(daysAgo(5)),
    endDate: isoDate(daysAgo(-40)),
    demands: { engineer: 0.5, pm: 0.5 },
  });

  // Priya is overallocated (0.8 + 0.5 = 1.3 > 1.0); everyone else fits.
  cap.allocate({ resourceId: "eng-priya", projectId: "proj-fleet", utilization: 0.8 });
  cap.allocate({ resourceId: "eng-priya", projectId: "proj-observability", utilization: 0.5 });
  cap.allocate({ resourceId: "eng-marcus", projectId: "proj-fleet", utilization: 0.7 });
  cap.allocate({ resourceId: "eng-jo", projectId: "proj-observability", utilization: 0.6 });
  cap.allocate({ resourceId: "eng-jo", projectId: "proj-soc2", utilization: 0.3 });
  cap.allocate({ resourceId: "design-ines", projectId: "proj-fleet", utilization: 0.5 });
  cap.allocate({ resourceId: "pm-omar", projectId: "proj-fleet", utilization: 0.4 });
  cap.allocate({ resourceId: "pm-omar", projectId: "proj-observability", utilization: 0.4 });
}

function seedVendors(olympus: Olympus): void {
  const v = olympus.vendors;

  const daysOut = (n: number): string =>
    new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const aws = v.add({ id: "vendor-aws", name: "AWS", category: "infrastructure", annualValueUsd: 480_000, renewalDate: daysOut(95) });
  const dd = v.add({ id: "vendor-datadog", name: "Datadog", category: "software", annualValueUsd: 96_000, renewalDate: daysOut(40) });
  v.add({ id: "vendor-salesforce", name: "Salesforce", category: "software", annualValueUsd: 144_000, renewalDate: daysOut(200) });
  v.add({ id: "vendor-wework", name: "WeWork", category: "facilities", annualValueUsd: 72_000, renewalDate: daysOut(18) });

  v.recordSpend(aws.id, 42_000);
  v.recordSpend(dd.id, 8_200);
}

function seedPeople(olympus: Olympus): void {
  const p = olympus.people;

  // Leadership
  const alice = p.hire({
    id: "emp-alice",
    name: "Alice Chen",
    role: "Chief Technology Officer",
    department: "engineering",
    level: "exec",
    baseCompUsd: 280_000,
    startDate: isoDate(daysAgo(730)),
    tags: ["leadership", "c-suite"],
  });

  const bob = p.hire({
    id: "emp-bob",
    name: "Bob Kim",
    role: "Engineering Manager",
    department: "engineering",
    level: "m1",
    baseCompUsd: 195_000,
    managerId: alice.id,
    startDate: isoDate(daysAgo(540)),
  });

  p.hire({
    id: "emp-priya",
    name: "Priya Shah",
    role: "Senior Software Engineer",
    department: "engineering",
    level: "ic4",
    baseCompUsd: 175_000,
    managerId: bob.id,
    startDate: isoDate(daysAgo(365)),
    tags: ["robotics", "controls"],
  });

  p.hire({
    id: "emp-lei",
    name: "Lei Zhang",
    role: "Software Engineer",
    department: "engineering",
    level: "ic3",
    baseCompUsd: 145_000,
    managerId: bob.id,
    startDate: isoDate(daysAgo(200)),
  });

  // Product
  const maya = p.hire({
    id: "emp-maya",
    name: "Maya Okonkwo",
    role: "VP of Product",
    department: "product",
    level: "m2",
    baseCompUsd: 220_000,
    startDate: isoDate(daysAgo(600)),
    tags: ["leadership"],
  });

  p.hire({
    id: "emp-daniel",
    name: "Daniel Torres",
    role: "Product Manager",
    department: "product",
    level: "ic3",
    baseCompUsd: 155_000,
    managerId: maya.id,
    startDate: isoDate(daysAgo(290)),
  });

  // Sales
  p.hire({
    id: "emp-dana",
    name: "Dana Reyes",
    role: "Account Executive",
    department: "sales",
    level: "ic3",
    baseCompUsd: 130_000,
    startDate: isoDate(daysAgo(400)),
    tags: ["enterprise"],
  });

  // Operations
  p.hire({
    id: "emp-omar-ops",
    name: "Omar Haddad",
    role: "Head of Operations",
    department: "operations",
    level: "m1",
    baseCompUsd: 180_000,
    startDate: isoDate(daysAgo(500)),
  });

  // Open roles
  p.addOpenRole({
    id: "role-ic5-eng",
    title: "Staff Software Engineer",
    department: "engineering",
    level: "ic5",
    targetCompUsd: 210_000,
    openedAt: isoDate(daysAgo(30)),
  });

  p.addOpenRole({
    id: "role-ic2-sales",
    title: "Sales Development Representative",
    department: "sales",
    level: "ic2",
    targetCompUsd: 90_000,
    openedAt: isoDate(daysAgo(14)),
  });

  p.addOpenRole({
    id: "role-ic3-product",
    title: "Product Manager — Autonomy",
    department: "product",
    level: "ic3",
    targetCompUsd: 160_000,
    openedAt: isoDate(daysAgo(21)),
  });
}

function seedOkr(olympus: Olympus): void {
  const okr = olympus.okr;

  okr.addObjective({
    id: "okr-arr",
    label: "Reach $5M ARR",
    owner: "CEO",
    dueDate: isoDate(daysAgo(-180)),
    keyResults: [
      { id: "kr-arr", label: "Grow ARR to $5M", metricKey: "arr", baseline: 3_200_000, target: 5_000_000 },
    ],
  });

  okr.addObjective({
    id: "okr-retention",
    label: "Improve net retention",
    owner: "VP Customer Success",
    dueDate: isoDate(daysAgo(-180)),
    keyResults: [
      { id: "kr-nrr", label: "Lift NRR to 120%", metricKey: "nrr", baseline: 105, target: 120 },
    ],
  });

  // Record partial progress (deterministic, not random):
  //   ARR: 3.2M → 4.3M  ≈ 61% of the way to 5M.
  //   NRR: 105  → 114    = 60% of the way to 120.
  okr.recordMetric("arr", 4_300_000);
  okr.recordMetric("nrr", 114);
}

function seedProjects(olympus: Olympus): void {
  const tracker = olympus.sprints;

  // --- Project 1: Platform v2 ---
  const platform = tracker.addProject({
    id: "proj-platform-v2",
    name: "Platform v2",
    description: "Next-generation fleet autonomy platform with improved reliability and observability.",
    status: "active",
    ownerId: "emp-alice",
  });

  // Completed sprint (Sprint 1) — shows historical velocity
  tracker.addSprint({
    id: "sprint-platform-1",
    projectId: platform.id,
    name: "Sprint 1 — Foundation",
    startDate: isoDate(daysAgo(42)),
    endDate: isoDate(daysAgo(28)),
    status: "completed",
    plannedPoints: 40,
    completedPoints: 36,
    velocity: 0.9,
  });

  // Active sprint (Sprint 2)
  tracker.addSprint({
    id: "sprint-platform-2",
    projectId: platform.id,
    name: "Sprint 2 — Core APIs",
    startDate: isoDate(daysAgo(14)),
    endDate: isoDate(daysAgo(-0)),
    status: "active",
    plannedPoints: 38,
  });

  // Work items for Sprint 2
  const doneItem1 = tracker.addItem({ id: "item-p2-1", title: "Design REST API schema for fleet telemetry", type: "story", status: "in-progress", priority: "high", projectId: platform.id, sprintId: "sprint-platform-2", storyPoints: 5, assigneeId: "emp-priya" });
  const doneItem2 = tracker.addItem({ id: "item-p2-2", title: "Implement telemetry ingestion endpoint", type: "story", status: "in-progress", priority: "high", projectId: platform.id, sprintId: "sprint-platform-2", storyPoints: 8, assigneeId: "emp-priya" });
  tracker.addItem({ id: "item-p2-3", title: "Add authentication middleware", type: "task", status: "in-progress", priority: "critical", projectId: platform.id, sprintId: "sprint-platform-2", storyPoints: 5, assigneeId: "emp-lei" });
  tracker.addItem({ id: "item-p2-4", title: "Fix race condition in state machine transitions", type: "bug", status: "in-progress", priority: "critical", projectId: platform.id, sprintId: "sprint-platform-2", storyPoints: 3, assigneeId: "emp-lei" });
  tracker.addItem({ id: "item-p2-5", title: "Write integration tests for telemetry pipeline", type: "task", status: "review", priority: "medium", projectId: platform.id, sprintId: "sprint-platform-2", storyPoints: 5, assigneeId: "emp-priya" });
  tracker.addItem({ id: "item-p2-6", title: "Update API documentation", type: "task", status: "backlog", priority: "low", projectId: platform.id, sprintId: "sprint-platform-2", storyPoints: 2, assigneeId: "emp-daniel" });

  // Mark done items
  tracker.updateItemStatus(doneItem1.id, "done");
  tracker.updateItemStatus(doneItem2.id, "done");

  // Backlog items not in a sprint yet
  tracker.addItem({ id: "item-p2-7", title: "Implement WebSocket streaming for real-time telemetry", type: "story", status: "backlog", priority: "high", projectId: platform.id, storyPoints: 13 });
  tracker.addItem({ id: "item-p2-8", title: "Performance benchmarking — 10k concurrent fleets", type: "story", status: "backlog", priority: "medium", projectId: platform.id, storyPoints: 8 });

  // --- Project 2: Developer Experience ---
  const dx = tracker.addProject({
    id: "proj-dx",
    name: "Developer Experience",
    description: "Improve internal tooling, onboarding docs, and CI/CD pipelines.",
    status: "active",
    ownerId: "emp-bob",
  });

  // One completed sprint with perfect velocity
  tracker.addSprint({
    id: "sprint-dx-1",
    projectId: dx.id,
    name: "Sprint 1 — CI/CD Overhaul",
    startDate: isoDate(daysAgo(28)),
    endDate: isoDate(daysAgo(14)),
    status: "completed",
    plannedPoints: 20,
    completedPoints: 20,
    velocity: 1.0,
  });

  // Active sprint
  tracker.addSprint({
    id: "sprint-dx-2",
    projectId: dx.id,
    name: "Sprint 2 — Onboarding",
    startDate: isoDate(daysAgo(7)),
    endDate: isoDate(daysAgo(-7)),
    status: "active",
    plannedPoints: 18,
  });

  const dxDoneItem = tracker.addItem({ id: "item-dx-1", title: "Create new-hire onboarding runbook", type: "task", status: "in-progress", priority: "high", projectId: dx.id, sprintId: "sprint-dx-2", storyPoints: 3, assigneeId: "emp-bob" });
  tracker.addItem({ id: "item-dx-2", title: "Set up preview environments for PRs", type: "story", status: "in-progress", priority: "high", projectId: dx.id, sprintId: "sprint-dx-2", storyPoints: 8, assigneeId: "emp-lei" });
  tracker.addItem({ id: "item-dx-3", title: "Add lint and type-check to pre-commit hooks", type: "task", status: "backlog", priority: "medium", projectId: dx.id, sprintId: "sprint-dx-2", storyPoints: 3 });

  tracker.updateItemStatus(dxDoneItem.id, "done");
}

function seedProductAnalytics(olympus: Olympus): void {
  const product = olympus.product;

  // Set total tracked accounts denominator
  product.setTotalAccounts(12);

  // Register features
  product.registerFeature({
    key: "sso",
    name: "Single Sign-On",
    description: "SAML/OIDC-based SSO for enterprise accounts.",
    launchedAt: isoDate(daysAgo(180)),
    gated: false,
  });

  product.registerFeature({
    key: "api_v2",
    name: "API v2",
    description: "Next-generation REST API with improved pagination and webhooks.",
    launchedAt: isoDate(daysAgo(90)),
    gated: false,
  });

  product.registerFeature({
    key: "bulk_export",
    name: "Bulk Export",
    description: "Export large datasets as CSV or JSON in the background.",
    launchedAt: isoDate(daysAgo(60)),
    gated: false,
  });

  product.registerFeature({
    key: "advanced_analytics",
    name: "Advanced Analytics",
    description: "Custom dashboards and cohort analysis (beta, gated to select accounts).",
    launchedAt: isoDate(daysAgo(30)),
    gated: true,
    allowedAccounts: ["cs-acme", "cs-northwind"],
  });

  // Record usage across accounts
  const accounts = ["cs-acme", "cs-northwind", "cs-cascade", "cs-pinnacle"];

  // SSO: broadly used by 4 accounts
  for (const acc of accounts) {
    for (let i = 0; i < 5; i++) product.recordUsage("sso", acc);
  }

  // API v2: heavy usage by 3 accounts
  for (const acc of ["cs-acme", "cs-northwind", "cs-cascade"]) {
    for (let i = 0; i < 8; i++) product.recordUsage("api_v2", acc);
  }

  // Bulk export: light usage by 2 accounts
  product.recordUsage("bulk_export", "cs-acme");
  product.recordUsage("bulk_export", "cs-acme");
  product.recordUsage("bulk_export", "cs-northwind");

  // Advanced analytics: gated — only allowed accounts can use it
  for (let i = 0; i < 6; i++) product.recordUsage("advanced_analytics", "cs-acme");
  for (let i = 0; i < 4; i++) product.recordUsage("advanced_analytics", "cs-northwind");
  // cs-cascade is not in allowedAccounts — this call is silently rejected
  product.recordUsage("advanced_analytics", "cs-cascade");
}

function seedCustomerSuccess(olympus: Olympus): void {
  const cs = olympus.customerSuccess;

  // Healthy accounts: engaged, current payment, recent QBR
  cs.addAccount({
    accountId: "cs-acme",
    name: "Acme Manufacturing",
    arrUsd: 240_000,
    openTickets: 1,
    daysSinceLastActivity: 2,
    paymentStatus: "current",
    npsScore: 85,
    lastQbrDate: isoDate(daysAgo(30)),
  });

  cs.addAccount({
    accountId: "cs-northwind",
    name: "Northwind Logistics",
    arrUsd: 180_000,
    openTickets: 0,
    daysSinceLastActivity: 5,
    paymentStatus: "current",
    npsScore: 72,
    lastQbrDate: isoDate(daysAgo(45)),
  });

  // At-risk: inactive, no recent QBR
  cs.addAccount({
    accountId: "cs-cascade",
    name: "Cascade Foods",
    arrUsd: 95_000,
    openTickets: 3,
    daysSinceLastActivity: 40,
    paymentStatus: "current",
    lastQbrDate: isoDate(daysAgo(100)),
  });

  // Red-zone: overdue payment, many tickets
  cs.addAccount({
    accountId: "cs-pinnacle",
    name: "Pinnacle Health",
    arrUsd: 60_000,
    openTickets: 5,
    daysSinceLastActivity: 20,
    paymentStatus: "overdue",
  });

  // Churned: suspended, very inactive
  cs.addAccount({
    accountId: "cs-vertex",
    name: "Vertex Components",
    arrUsd: 42_000,
    openTickets: 6,
    daysSinceLastActivity: 90,
    paymentStatus: "suspended",
  });
}

function seedCompetitiveIntel(olympus: Olympus): void {
  const ci = olympus.competitive;

  // Competitors
  const apex = ci.addCompetitor({ id: "comp-apex", name: "Apex Systems", website: "https://apexsystems.io", tags: ["enterprise", "automation"] });
  const nova = ci.addCompetitor({ id: "comp-nova", name: "NovaTech", website: "https://novatech.ai", tags: ["ai", "startup"] });
  const legacy = ci.addCompetitor({ id: "comp-legacy", name: "LegacyCorp", website: "https://legacycorp.com", tags: ["legacy", "on-prem"] });

  // Signals for Apex Systems — pricing change (negative for us, positive for them)
  ci.addSignal({
    competitorId: apex.id,
    type: "pricing_change",
    title: "Apex cuts enterprise pricing by 15%",
    summary: "Apex Systems announced a 15% reduction in enterprise tier pricing, likely to win deals in mid-market.",
    sentiment: "negative",
    source: "press release",
  });

  // Signals for NovaTech — product launch (neutral)
  ci.addSignal({
    competitorId: nova.id,
    type: "product_launch",
    title: "NovaTech launches AI-powered fleet analytics",
    summary: "NovaTech shipped a new AI analytics module that competes directly with our observability features.",
    sentiment: "negative",
    source: "techcrunch.com",
  });

  // Signals for LegacyCorp — funding round (positive for us — competitor struggles)
  ci.addSignal({
    competitorId: legacy.id,
    type: "funding",
    title: "LegacyCorp fails to close Series C",
    summary: "LegacyCorp's Series C fell through; engineering layoffs expected. Opportunity to win their unhappy customers.",
    sentiment: "positive",
    source: "bloomberg",
  });

  // Win/loss records — 4 records showing mixed win rate
  // Apex: 1 win, 1 loss → 50% win rate
  ci.recordWinLoss({ dealId: "deal-acme", competitorId: apex.id, outcome: "win", reason: "Superior integration and support quality", dealArrUsd: 240_000 });
  ci.recordWinLoss({ dealId: "deal-stellar", competitorId: apex.id, outcome: "loss", reason: "Apex undercut on price by 20% at last minute", dealArrUsd: 110_000 });

  // NovaTech: 1 win → 100% win rate
  ci.recordWinLoss({ dealId: "deal-northwind", competitorId: nova.id, outcome: "win", reason: "Enterprise features and compliance certifications tipped the deal", dealArrUsd: 180_000 });

  // LegacyCorp: 1 loss → 0% win rate (customer chose legacy vendor familiarity)
  ci.recordWinLoss({ dealId: "deal-pinnacle", competitorId: legacy.id, outcome: "loss", reason: "Customer locked into existing LegacyCorp contracts for 2 more years", dealArrUsd: 60_000 });
}

function seedIncidents(olympus: Olympus): void {
  const mgr = olympus.incidents;

  // SEV1 — 45 days ago, fully resolved with postmortem
  const sev1OccurredAt = new Date(Date.now() - 45 * 864e5);
  const sev1DetectedAt = new Date(sev1OccurredAt.getTime() + 5 * 60_000);
  const sev1AcknowledgedAt = new Date(sev1OccurredAt.getTime() + 15 * 60_000);
  const sev1ResolvedAt = new Date(sev1OccurredAt.getTime() + 2 * 3_600_000);
  const sev1ClosedAt = new Date(sev1OccurredAt.getTime() + 864e5);

  const sev1 = mgr.openIncident({
    title: "Total API outage — database connection pool exhausted",
    description: "All API endpoints returned 503 due to exhausted PostgreSQL connection pool.",
    severity: "SEV1",
    occurredAt: sev1OccurredAt.toISOString(),
    detectedAt: sev1DetectedAt.toISOString(),
    affectedServices: ["api", "database"],
    tags: ["database", "connection-pool"],
  });
  sev1.acknowledgedAt = sev1AcknowledgedAt.toISOString();
  sev1.status = "acknowledged";
  sev1.commander = "Alice Chen";
  sev1.mitigatedAt = new Date(sev1OccurredAt.getTime() + 90 * 60_000).toISOString();
  sev1.status = "mitigated";
  sev1.resolvedAt = sev1ResolvedAt.toISOString();
  sev1.status = "resolved";
  sev1.closedAt = sev1ClosedAt.toISOString();
  sev1.status = "closed";

  mgr.publishPostmortem(sev1.id, {
    summary: "Connection pool exhaustion caused a complete API outage lasting ~2 hours.",
    rootCause: "A missing index on a high-frequency query caused runaway connections under peak load.",
    timeline: "Occurred 00:00 → Detected 00:05 → Acknowledged 00:15 → Mitigated 01:30 → Resolved 02:00 → Closed +24h",
    actionItems: [
      "Add missing index on orders.user_id",
      "Set per-tenant connection pool caps",
      "Add connection saturation alerting at 80% threshold",
    ],
    publishedBy: "Alice Chen",
  });

  // SEV2 — 10 days ago, resolved, no postmortem
  const sev2OccurredAt = new Date(Date.now() - 10 * 864e5);
  const sev2DetectedAt = new Date(sev2OccurredAt.getTime() + 8 * 60_000);
  const sev2AcknowledgedAt = new Date(sev2OccurredAt.getTime() + 20 * 60_000);
  const sev2ResolvedAt = new Date(sev2OccurredAt.getTime() + 75 * 60_000);

  const sev2 = mgr.openIncident({
    title: "Elevated p99 latency — telemetry ingestion pipeline",
    description: "p99 API latency spiked to 4s due to a backlog in the telemetry ingestion pipeline.",
    severity: "SEV2",
    occurredAt: sev2OccurredAt.toISOString(),
    detectedAt: sev2DetectedAt.toISOString(),
    affectedServices: ["telemetry", "api"],
    tags: ["latency", "pipeline"],
  });
  sev2.acknowledgedAt = sev2AcknowledgedAt.toISOString();
  sev2.status = "acknowledged";
  sev2.commander = "Bob Kim";
  sev2.resolvedAt = sev2ResolvedAt.toISOString();
  sev2.status = "resolved";

  // SEV3 — 2 days ago, still open (detected)
  const sev3OccurredAt = new Date(Date.now() - 2 * 864e5);
  const sev3DetectedAt = new Date(sev3OccurredAt.getTime() + 30 * 60_000);

  mgr.openIncident({
    title: "Intermittent 404s on /v1/fleet/:id endpoint",
    description: "A subset of fleet device requests return 404 intermittently due to a cache invalidation race.",
    severity: "SEV3",
    occurredAt: sev3OccurredAt.toISOString(),
    detectedAt: sev3DetectedAt.toISOString(),
    affectedServices: ["api", "cache"],
    tags: ["cache", "race-condition"],
  });
}

function seedCompliance(olympus: Olympus): void {
  const c = olympus.compliance;

  // 1. SOC2 CC6.1 — Logical Access Controls (recent evidence → compliant)
  const ctrl1 = c.addControl({
    id: "ctrl-soc2-cc6-1",
    title: "Logical Access Controls",
    description: "Restrict logical access to systems and data to authorized users.",
    framework: "SOC2",
    category: "Access Control",
    reviewCycleDays: 90,
    owner: "security-team",
  });
  c.recordEvidence(ctrl1.id, {
    type: "log_export",
    description: "IAM access review — all accounts audited and confirmed.",
    collectedAt: isoDate(daysAgo(10)),
    collectedBy: "security-team",
  });

  // 2. SOC2 CC6.2 — Authentication (stale evidence → non-compliant)
  const ctrl2 = c.addControl({
    id: "ctrl-soc2-cc6-2",
    title: "Authentication",
    description: "Multi-factor authentication enforced for all privileged accounts.",
    framework: "SOC2",
    category: "Access Control",
    reviewCycleDays: 90,
    owner: "security-team",
  });
  c.recordEvidence(ctrl2.id, {
    type: "screenshot",
    description: "MFA enforcement screenshot from admin console.",
    collectedAt: "2026-03-15",
    collectedBy: "security-team",
  });

  // 3. ISO27001 A.12.6 — Patch Management (recent evidence → compliant)
  const ctrl3 = c.addControl({
    id: "ctrl-iso-a12-6",
    title: "Patch Management",
    description: "Technical vulnerabilities managed and patched in a timely manner.",
    framework: "ISO27001",
    category: "Operations Security",
    reviewCycleDays: 30,
    owner: "it-ops",
  });
  c.recordEvidence(ctrl3.id, {
    type: "report",
    description: "Patch compliance report — 100% of critical CVEs remediated within SLA.",
    collectedAt: isoDate(daysAgo(5)),
    collectedBy: "it-ops",
  });

  // 4. GDPR Art.32 — Encryption at Rest (recent evidence → compliant)
  const ctrl4 = c.addControl({
    id: "ctrl-gdpr-art32",
    title: "Encryption at Rest",
    description: "Personal data encrypted at rest using AES-256 or equivalent.",
    framework: "GDPR",
    category: "Data Security",
    reviewCycleDays: 180,
    owner: "engineering",
  });
  c.recordEvidence(ctrl4.id, {
    type: "attestation",
    description: "Engineering attestation: all datastores use AES-256 encryption at rest.",
    collectedAt: isoDate(daysAgo(30)),
    collectedBy: "engineering",
  });

  // 5. internal — Incident Response Plan (no evidence → not-started)
  c.addControl({
    id: "ctrl-internal-irp",
    title: "Incident Response Plan",
    description: "Documented and tested incident response plan covering detection, containment, and recovery.",
    framework: "internal",
    category: "Incident Management",
    reviewCycleDays: 365,
    owner: "security-team",
  });
}

function seedMarketing(olympus: Olympus): void {
  const mkt = olympus.marketing;

  // 4 campaigns
  const googleAds = mkt.addCampaign({
    id: "mkt-google-ads-q2",
    name: "Google Ads Q2",
    channel: "paid_search",
    startDate: isoDate(daysAgo(90)),
    endDate: isoDate(daysAgo(-1)),
    budgetUsd: 15_000,
    spendUsd: 12_000,
    impressions: 45_000,
    clicks: 1_200,
    leads: 28,
  });

  const linkedIn = mkt.addCampaign({
    id: "mkt-linkedin-enterprise",
    name: "LinkedIn Enterprise",
    channel: "paid_social",
    startDate: isoDate(daysAgo(90)),
    endDate: isoDate(daysAgo(-1)),
    budgetUsd: 8_000,
    spendUsd: 7_500,
    impressions: 22_000,
    clicks: 340,
    leads: 12,
  });

  const seoBlog = mkt.addCampaign({
    id: "mkt-seo-blog",
    name: "SEO Blog Initiative",
    channel: "content",
    startDate: isoDate(daysAgo(180)),
    budgetUsd: 3_000,
    spendUsd: 2_800,
    impressions: 0,
    clicks: 5_200,
    leads: 45,
  });

  const emailNurture = mkt.addCampaign({
    id: "mkt-email-nurture-q2",
    name: "Q2 Nurture Sequence",
    channel: "email",
    startDate: isoDate(daysAgo(60)),
    endDate: isoDate(daysAgo(-1)),
    budgetUsd: 1_500,
    spendUsd: 1_400,
    impressions: 0,
    clicks: 890,
    leads: 18,
  });

  // 5 conversions with realistic touchpoints
  mkt.recordConversion({
    id: "conv-acme",
    dealId: "deal-acme",
    accountId: "cs-acme",
    touchPoints: [
      { channel: "organic_search", timestamp: new Date(Date.now() - 60 * 864e5).toISOString(), campaignId: seoBlog.id },
      { channel: "paid_search", timestamp: new Date(Date.now() - 45 * 864e5).toISOString(), campaignId: googleAds.id },
      { channel: "email", timestamp: new Date(Date.now() - 30 * 864e5).toISOString(), campaignId: emailNurture.id },
      { channel: "direct", timestamp: new Date(Date.now() - 15 * 864e5).toISOString() },
    ],
    convertedAt: new Date(Date.now() - 10 * 864e5).toISOString(),
    revenueUsd: 240_000,
    model: "linear",
  });

  mkt.recordConversion({
    id: "conv-northwind",
    dealId: "deal-northwind",
    accountId: "cs-northwind",
    touchPoints: [
      { channel: "paid_social", timestamp: new Date(Date.now() - 50 * 864e5).toISOString(), campaignId: linkedIn.id },
      { channel: "content", timestamp: new Date(Date.now() - 35 * 864e5).toISOString(), campaignId: seoBlog.id },
      { channel: "email", timestamp: new Date(Date.now() - 20 * 864e5).toISOString(), campaignId: emailNurture.id },
    ],
    convertedAt: new Date(Date.now() - 14 * 864e5).toISOString(),
    revenueUsd: 180_000,
    model: "time_decay",
  });

  mkt.recordConversion({
    id: "conv-cascade",
    accountId: "cs-cascade",
    touchPoints: [
      { channel: "paid_search", timestamp: new Date(Date.now() - 40 * 864e5).toISOString(), campaignId: googleAds.id },
      { channel: "direct", timestamp: new Date(Date.now() - 10 * 864e5).toISOString() },
    ],
    convertedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
    revenueUsd: 95_000,
    model: "first_touch",
  });

  mkt.recordConversion({
    id: "conv-pinnacle",
    accountId: "cs-pinnacle",
    touchPoints: [
      { channel: "referral", timestamp: new Date(Date.now() - 70 * 864e5).toISOString() },
      { channel: "paid_social", timestamp: new Date(Date.now() - 55 * 864e5).toISOString(), campaignId: linkedIn.id },
      { channel: "email", timestamp: new Date(Date.now() - 40 * 864e5).toISOString(), campaignId: emailNurture.id },
      { channel: "paid_search", timestamp: new Date(Date.now() - 25 * 864e5).toISOString(), campaignId: googleAds.id },
    ],
    convertedAt: new Date(Date.now() - 20 * 864e5).toISOString(),
    revenueUsd: 85_000,
    model: "position_based",
  });

  mkt.recordConversion({
    id: "conv-vertex",
    accountId: "cs-vertex",
    touchPoints: [
      { channel: "content", timestamp: new Date(Date.now() - 90 * 864e5).toISOString(), campaignId: seoBlog.id },
      { channel: "organic_search", timestamp: new Date(Date.now() - 75 * 864e5).toISOString() },
      { channel: "email", timestamp: new Date(Date.now() - 50 * 864e5).toISOString(), campaignId: emailNurture.id },
    ],
    convertedAt: new Date(Date.now() - 45 * 864e5).toISOString(),
    revenueUsd: 130_000,
    model: "last_touch",
  });
}

function seedForecasting(olympus: Olympus): void {
  const heliosAssumptions: ForecastAssumptions = {
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

  // Base 18-month forecast
  olympus.forecasting.generate(heliosAssumptions, 18, "base");

  // Optimistic 12-month forecast
  olympus.forecasting.generate(
    {
      ...heliosAssumptions,
      arrGrowthRate: 0.07,
      avgDealSizeUsd: 110_000,
      churnRate: 0.008,
    },
    12,
    "optimistic"
  );
}

function seedDataPipeline(olympus: Olympus): void {
  const dp = olympus.dataPipeline;

  // 3 sources
  const crmSource = dp.addSource({ name: "CRM Database", type: "postgres" });
  const warehouseSource = dp.addSource({ name: "Analytics Warehouse", type: "bigquery" });
  const s3Source = dp.addSource({ name: "Raw Event Bucket", type: "s3" });

  // 3 pipelines
  const crmPipeline = dp.addPipeline({
    name: "CRM to Warehouse",
    description: "Syncs CRM contacts and deals to the analytics warehouse",
    sourceId: crmSource.id,
    sinkDatasetId: "crm_contacts",
    status: "active",
    scheduleExpression: "0 0 * * *",
  });

  const eventsPipeline = dp.addPipeline({
    name: "Events Aggregation",
    description: "Aggregates raw S3 events into summary datasets",
    sourceId: s3Source.id,
    sinkDatasetId: "events_summary",
    status: "active",
    scheduleExpression: "0 * * * *",
  });

  dp.addPipeline({
    name: "Marketing Attribution Feed",
    description: "Pulls marketing attribution data from external API",
    sourceId: warehouseSource.id,
    sinkDatasetId: "marketing_attribution",
    status: "active",
    scheduleExpression: "0 */6 * * *",
  });

  // 4 runs: 2 completed for CRM, 1 failed + 1 completed for Events
  dp.recordRun(crmPipeline.id, { rowsRead: 50_000, rowsWritten: 50_000, rowsErrored: 0, durationMs: 12_000 });
  dp.recordRun(crmPipeline.id, { rowsRead: 50_000, rowsWritten: 50_000, rowsErrored: 0, durationMs: 11_500 });
  dp.recordRun(eventsPipeline.id, { rowsRead: 0, rowsWritten: 0, rowsErrored: 0, durationMs: 3_000, status: "failed", error: "schema mismatch" });
  dp.recordRun(eventsPipeline.id, { rowsRead: 48_000, rowsWritten: 48_000, rowsErrored: 0, durationMs: 9_800 });

  // Quality scores
  dp.recordQuality("crm_contacts", { completeness: 92, freshness: 88, validity: 95, uniqueness: 99, consistency: 91 });
  dp.recordQuality("events_summary", { completeness: 78, freshness: 95, validity: 65, uniqueness: 88, consistency: 72 });
}

export function seedSupport(olympus: Olympus): void {
  const support = olympus.support;

  const now = Date.now();
  const h = 3600000; // 1 hour in ms

  // 1. Critical bug — API authentication failing — resolved quickly within SLA, CSAT 5
  const t1 = support.openTicket({
    subject: "API authentication failing",
    description: "Users unable to authenticate via API tokens.",
    priority: "critical",
    category: "bug",
    customerId: "cascade-corp",
    createdAt: new Date(now - 3 * h).toISOString(),
  });
  support.assignTicket(t1.id, "eng-alice");
  support.recordFirstReply(t1.id, new Date(now - 2.8 * h).toISOString()); // ~12 min FRT, within 1h
  support.resolveTicket(t1.id, new Date(now - 1 * h).toISOString()); // 2h resolution, within 4h
  support.submitCsat(t1.id, 5);

  // 2. High — Export to CSV broken — resolved in 20h (within 24h SLA), CSAT 4
  const t2 = support.openTicket({
    subject: "Export to CSV broken",
    description: "CSV export button produces empty files.",
    priority: "high",
    category: "bug",
    customerId: "pinnacle-inc",
    createdAt: new Date(now - 22 * h).toISOString(),
  });
  support.assignTicket(t2.id, "eng-bob");
  support.recordFirstReply(t2.id, new Date(now - 21 * h).toISOString()); // ~1h FRT, within 4h
  support.resolveTicket(t2.id, new Date(now - 2 * h).toISOString()); // 20h resolution, within 24h
  support.submitCsat(t2.id, 4);

  // 3. Medium — Dashboard loading slowly — in_progress, no resolution yet
  const t3 = support.openTicket({
    subject: "Dashboard loading slowly",
    description: "Main dashboard takes 15+ seconds to load.",
    priority: "medium",
    category: "performance",
    customerId: "vertex-tech",
    createdAt: new Date(now - 5 * h).toISOString(),
  });
  support.assignTicket(t3.id, "eng-alice");
  support.recordFirstReply(t3.id, new Date(now - 4 * h).toISOString()); // ~1h FRT, within 8h

  // 4. High — Billing discrepancy Q2 invoice — open, no assignee (SLA risk)
  support.openTicket({
    subject: "Billing discrepancy Q2 invoice",
    description: "Invoice for Q2 shows incorrect charges.",
    priority: "high",
    category: "billing",
    customerId: "cascade-corp",
    createdAt: new Date(now - 6 * h).toISOString(),
  });

  // 5. Low — Feature request: dark mode — open
  support.openTicket({
    subject: "Feature request: dark mode",
    description: "Please add a dark mode option to the UI.",
    priority: "low",
    category: "feature_request",
    customerId: "nova-systems",
    createdAt: new Date(now - 2 * h).toISOString(),
  });

  // 6. Critical — Data export completely broken — resolved in 6h (breaches 4h SLA), CSAT 2
  const t6 = support.openTicket({
    subject: "Data export completely broken",
    description: "All data export functionality returns 500 errors.",
    priority: "critical",
    category: "bug",
    customerId: "vertex-tech",
    createdAt: new Date(now - 8 * h).toISOString(),
  });
  support.assignTicket(t6.id, "eng-bob");
  support.recordFirstReply(t6.id, new Date(now - 7.5 * h).toISOString()); // ~30 min FRT, within 1h
  support.resolveTicket(t6.id, new Date(now - 2 * h).toISOString()); // 6h resolution, breaches 4h SLA
  support.submitCsat(t6.id, 2);
}

export function seedCommunication(olympus: Olympus): void {
  const comms = olympus.comms;

  // Sequence 1: Enterprise Outbound Q3 (active)
  const seq1 = comms.createSequence({
    id: "seq-enterprise-q3",
    name: "Enterprise Outbound Q3",
    description: "Q3 enterprise outreach targeting mid-market accounts",
    status: "active",
    targetSegment: "mid-market",
    steps: [
      { stepNumber: 1, channel: "email", delayDays: 0, subject: "Intro from Helios Robotics", bodyTemplate: "Hi {{firstName}}, I wanted to reach out about how Helios could help {{company}}..." },
      { stepNumber: 2, channel: "email", delayDays: 3, subject: "Following up", bodyTemplate: "Hi {{firstName}}, just following up on my previous note..." },
      { stepNumber: 3, channel: "linkedin", delayDays: 7, subject: undefined, bodyTemplate: "Hi {{firstName}}, connecting to continue our conversation..." },
    ],
    tags: ["enterprise", "q3", "outbound"],
  });

  // Sequence 2: Product Launch (completed)
  const seq2 = comms.createSequence({
    id: "seq-product-launch",
    name: "Product Launch",
    description: "Product launch announcement sequence",
    status: "active",
    targetSegment: "all-customers",
    steps: [
      { stepNumber: 1, channel: "email", delayDays: 0, subject: "Introducing Helios 2.0", bodyTemplate: "We're thrilled to announce Helios 2.0, packed with new features..." },
      { stepNumber: 2, channel: "email", delayDays: 2, subject: "Have you tried Helios 2.0 yet?", bodyTemplate: "Hoping you had a chance to check out the new features..." },
    ],
    tags: ["product", "launch"],
  });

  const base = new Date().toISOString();

  // Enroll contacts 001-004 in sequence 1
  const contacts1 = ["contact-001", "contact-002", "contact-003", "contact-004"];
  for (const contactId of contacts1) {
    const msgs = comms.enrollContact(seq1.id, contactId, base);
    // Send step-1 messages for all 4
    comms.sendMessage(msgs[0]!.id);
  }

  // Record opens for 2 of them
  const msgs001 = comms.listMessages(seq1.id).filter((m) => m.contactId === "contact-001" && m.stepNumber === 1);
  const msgs002 = comms.listMessages(seq1.id).filter((m) => m.contactId === "contact-002" && m.stepNumber === 1);
  if (msgs001[0]) comms.recordEngagement(msgs001[0].id, "open");
  if (msgs002[0]) comms.recordEngagement(msgs002[0].id, "open");

  // Record reply for 1 of them
  if (msgs001[0]) comms.recordEngagement(msgs001[0].id, "reply");

  // Enroll 5 contacts in sequence 2; send all messages; high open rates
  const contacts2 = ["contact-101", "contact-102", "contact-103", "contact-104", "contact-105"];
  for (const contactId of contacts2) {
    const msgs = comms.enrollContact(seq2.id, contactId, base);
    for (const msg of msgs) {
      comms.sendMessage(msg.id);
    }
  }

  // Record opens for 4 of 5 contacts across step-1 messages
  const seq2Step1Msgs = comms.listMessages(seq2.id).filter((m) => m.stepNumber === 1);
  for (let i = 0; i < 4; i++) {
    if (seq2Step1Msgs[i]) comms.recordEngagement(seq2Step1Msgs[i]!.id, "open");
  }

  // Complete sequence 2
  comms.completeSequence(seq2.id);
}

export function seedPricing(olympus: Olympus): void {
  const pricing = olympus.pricing;

  // Products
  const helios = pricing.addProduct({
    id: "prod-helios-platform",
    name: "Helios Platform",
    description: "Core SaaS platform with per-seat billing",
    billingModel: "per_seat",
    basePriceUsd: 299,
    tiers: [
      { minUnits: 1, maxUnits: 10, pricePerUnit: 299, label: "Startup" },
      { minUnits: 11, maxUnits: 50, pricePerUnit: 249, label: "Growth" },
      { minUnits: 51, pricePerUnit: 199, label: "Enterprise" },
    ],
    annualDiscountPct: 20,
    currency: "USD",
    tags: ["core", "saas"],
  });

  const analytics = pricing.addProduct({
    id: "prod-analytics",
    name: "Analytics Add-on",
    description: "Advanced analytics dashboard",
    billingModel: "flat_fee",
    basePriceUsd: 499,
    annualDiscountPct: 0,
    currency: "USD",
    tags: ["addon"],
  });

  const support = pricing.addProduct({
    id: "prod-enterprise-support",
    name: "Enterprise Support",
    description: "24/7 enterprise support tier",
    billingModel: "flat_fee",
    basePriceUsd: 999,
    annualDiscountPct: 0,
    currency: "USD",
    tags: ["support"],
  });

  // Discounts
  pricing.addDiscount({
    id: "disc-launch20",
    code: "LAUNCH20",
    description: "Launch promotion — 20% off",
    type: "percentage",
    value: 20,
    maxUsages: 100,
  });

  pricing.addDiscount({
    id: "disc-partner50",
    code: "PARTNER50",
    description: "Partner discount — 50% off Helios Platform",
    type: "percentage",
    value: 50,
    applicableProductIds: [helios.id],
  });

  // Quote 1: accepted — 10 seats annual + analytics, LAUNCH20 applied
  const q1 = pricing.generateQuote({
    id: "quote-001",
    customerId: "cust-acme",
    lineItems: [
      { productId: helios.id, quantity: 10, annual: true },
      { productId: analytics.id, quantity: 1, annual: false },
    ],
    discountCodes: ["LAUNCH20"],
    notes: "Acme Corp onboarding deal",
  });
  pricing.updateQuoteStatus(q1.id, "accepted");

  // Quote 2: sent — 25 seats monthly
  const q2 = pricing.generateQuote({
    id: "quote-002",
    customerId: "cust-beta",
    lineItems: [
      { productId: helios.id, quantity: 25, annual: false },
    ],
    notes: "Beta Industries expansion",
  });
  pricing.updateQuoteStatus(q2.id, "sent");

  // Quote 3: draft — enterprise 60 seats + all add-ons
  pricing.generateQuote({
    id: "quote-003",
    customerId: "cust-gamma",
    lineItems: [
      { productId: helios.id, quantity: 60, annual: false },
      { productId: analytics.id, quantity: 1, annual: false },
      { productId: support.id, quantity: 1, annual: false },
    ],
    notes: "Gamma Corp enterprise evaluation",
  });
}

function seedAssets(olympus: Olympus): void {
  const assets = olympus.assets;

  // MacBook Pro fleet — 15 units modeled as one asset
  const macbook = assets.registerAsset({
    name: "MacBook Pro Fleet (15 units)",
    type: "hardware",
    status: "active",
    purchaseDate: isoDate(daysAgo(365)),
    purchasePriceUsd: 45_000,
    depreciationMethod: "straight_line",
    usefulLifeYears: 4,
    vendor: "Apple",
    location: "Helios HQ",
    tags: ["laptops", "engineering"],
  });

  // AWS infrastructure — modeled as IP (cloud subscription, $0 capital purchase)
  assets.registerAsset({
    name: "AWS Infrastructure",
    type: "infrastructure",
    status: "active",
    purchaseDate: isoDate(daysAgo(730)),
    purchasePriceUsd: 0,
    depreciationMethod: "none",
    usefulLifeYears: 5,
    vendor: "Amazon Web Services",
    notes: "$8k/mo cloud spend",
    tags: ["cloud", "infrastructure"],
  });

  // GitHub Enterprise license
  assets.registerAsset({
    name: "GitHub Enterprise License",
    type: "software_license",
    status: "active",
    purchaseDate: isoDate(daysAgo(180)),
    purchasePriceUsd: 12_000,
    depreciationMethod: "straight_line",
    usefulLifeYears: 1,
    vendor: "GitHub",
    warrantyExpiresAt: isoDate(new Date(Date.now() + 185 * 24 * 60 * 60 * 1000)),
    tags: ["developer-tools"],
  });

  // Office furniture
  assets.registerAsset({
    name: "Office Furniture",
    type: "furniture",
    status: "active",
    purchaseDate: isoDate(daysAgo(500)),
    purchasePriceUsd: 18_000,
    depreciationMethod: "straight_line",
    usefulLifeYears: 7,
    location: "Helios HQ",
    tags: ["office"],
  });

  // Company server rack — in maintenance, warranty expiring in ~60 days
  const serverRack = assets.registerAsset({
    name: "Company Server Rack",
    type: "hardware",
    status: "active",
    purchaseDate: isoDate(daysAgo(400)),
    purchasePriceUsd: 35_000,
    depreciationMethod: "declining_balance",
    usefulLifeYears: 5,
    vendor: "Dell",
    location: "Data Center",
    warrantyExpiresAt: isoDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)),
    maintenanceSchedule: "quarterly",
    tags: ["servers", "infrastructure"],
  });
  assets.updateStatus(serverRack.id, "maintenance");

  // Apply 2 months of depreciation to MacBook fleet and server rack
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const period1 = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, "0")}`;
  const period2 = `${oneMonthAgo.getFullYear()}-${String(oneMonthAgo.getMonth() + 1).padStart(2, "0")}`;

  assets.applyDepreciation(macbook.id, period1);
  assets.applyDepreciation(macbook.id, period2);
  assets.applyDepreciation(serverRack.id, period1);
  assets.applyDepreciation(serverRack.id, period2);
}
