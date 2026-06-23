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
