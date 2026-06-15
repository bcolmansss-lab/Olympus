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
import { DASHBOARD_HTML } from "./dashboard.js";

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

export interface ApiServerOptions extends OlympusOptions {
  olympus?: Olympus;
}

export class OlympusApiServer {
  readonly olympus: Olympus;
  private readonly routes: Route[] = [];
  private server?: Server;

  constructor(opts: ApiServerOptions = {}) {
    this.olympus = opts.olympus ?? new Olympus(opts);
    this.registerRoutes();
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
      { method: "POST", pattern: "/v1/diagnose", handler: (req, res) => this.handleDiagnose(req, res) },

      { method: "GET", pattern: "/v1/autonomy/grants", handler: (_req, res) => this.handleListGrants(res) },
      { method: "PUT", pattern: "/v1/autonomy/grants", handler: (req, res) => this.handleSetGrant(req, res) },

      { method: "GET", pattern: "/v1/inbox", handler: (req, res) => this.handleInbox(req, res) },
      { method: "POST", pattern: "/v1/inbox/:id/resolve", handler: (req, res) => this.handleResolveInbox(req, res) },

      { method: "GET", pattern: "/v1/events", handler: (req, res) => this.handleEvents(req, res) },
      { method: "GET", pattern: "/v1/audit", handler: (_req, res) => this.handleAudit(res) },
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

  private handleAudit(res: ApiResponse): void {
    res.json(200, {
      valid: this.olympus.mcp.verifyAuditChain(),
      records: this.olympus.mcp.auditLog(),
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

  const api = new OlympusApiServer({ twin, sink });
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
  const port = Number(process.env.PORT ?? 7777);
  const actual = await api.listen(port);
  console.log(`Olympus API listening on http://localhost:${actual}`);
  if (process.env.OLYMPUS_LOG) console.log(`Durable log: ${process.env.OLYMPUS_LOG} (replayed ${replayed} events)`);
  console.log("Try: curl -s localhost:" + actual + "/healthz");
  console.log(`     curl -s -XPOST localhost:${actual}/v1/ask -d '{"question":"Cut Q3 spend 18%?","domain":"finance","options":["cut-18pct","hold"],"intervention":{"variable":"marketing_spend","delta":-0.18},"capability":"reallocate_budget","exposureAmount":162000,"simSeed":7}'`);
}
