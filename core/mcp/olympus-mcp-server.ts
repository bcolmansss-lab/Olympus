/**
 * Olympus MCP layer — internal tool surface with ABAC gating + mandatory audit.
 *
 * Agents reach the OKG, memory, simulation, and skills exclusively through MCP
 * tools (BLUEPRINT.md §23). Every call is policy-evaluated (ABAC) and written
 * to a cryptographically hash-chained audit log (§11.4) before it can take
 * effect. External-write tools additionally require an autonomy grant.
 *
 * This reference implements the contract with an in-process tool registry and a
 * hash-chained in-memory audit log.
 */

import { createHash, randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";
import type { OKG } from "../knowledge/graph/okg.js";

export type SideEffect = "read" | "internal_write" | "external_write";

export interface ToolDescriptor {
  name: string;
  sideEffect: SideEffect;
  /** Minimum autonomy level required to invoke (0–7). */
  requiresAutonomy: number;
  handler: (input: Record<string, unknown>, caller: Caller) => Promise<unknown>;
}

export interface Caller {
  /** Agent or person id. */
  id: string;
  kind: "agent" | "human";
  /** Granted autonomy level for the relevant domain. */
  autonomyLevel: number;
}

export interface AuditRecord {
  seq: number;
  ts: string;
  actor: string;
  actorKind: "agent" | "human";
  action: string;
  policyDecision: "allow" | "deny";
  reason?: string;
  prevHash: string;
  thisHash: string;
}

export class OlympusMCPServer {
  private readonly tools = new Map<string, ToolDescriptor>();
  private readonly audit: AuditRecord[] = [];
  private lastHash = "GENESIS";

  constructor(
    private readonly okg: OKG,
    private readonly bus: EventBus,
  ) {
    this.registerCoreTools();
  }

  register(tool: ToolDescriptor): void {
    this.tools.set(tool.name, tool);
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()];
  }

  /** Invoke a tool through the policy gate + audit chain. */
  async invoke(name: string, input: Record<string, unknown>, caller: Caller): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      this.recordAudit(caller, `invoke:${name}`, "deny", "unknown tool");
      throw new Error(`MCP: unknown tool "${name}"`);
    }

    // ABAC gate: autonomy level must cover the tool's requirement.
    if (caller.autonomyLevel < tool.requiresAutonomy) {
      this.recordAudit(
        caller,
        `invoke:${name}`,
        "deny",
        `autonomy L${caller.autonomyLevel} < required L${tool.requiresAutonomy}`,
      );
      throw new Error(
        `MCP: "${name}" requires autonomy L${tool.requiresAutonomy}, caller has L${caller.autonomyLevel}`,
      );
    }

    this.recordAudit(caller, `invoke:${name}`, "allow");
    this.bus.publish("action.executed", { tool: name, actor: caller.id, sideEffect: tool.sideEffect });
    return tool.handler(input, caller);
  }

  /** Tamper-evident, append-only audit trail. */
  auditLog(): readonly AuditRecord[] {
    return this.audit;
  }

  /** Verify the hash chain has not been tampered with. */
  verifyAuditChain(): boolean {
    let prev = "GENESIS";
    for (const rec of this.audit) {
      if (rec.prevHash !== prev) return false;
      const { thisHash, ...base } = rec;
      if (thisHash !== hashRecord(base, prev)) return false;
      prev = thisHash;
    }
    return true;
  }

  private recordAudit(caller: Caller, action: string, decision: "allow" | "deny", reason?: string): void {
    const seq = this.audit.length + 1;
    const ts = new Date().toISOString();
    const base = { seq, ts, actor: caller.id, actorKind: caller.kind, action, policyDecision: decision, reason, prevHash: this.lastHash };
    const thisHash = hashRecord(base, this.lastHash);
    const record: AuditRecord = { ...base, thisHash } as AuditRecord;
    this.audit.push(record);
    this.lastHash = thisHash;
    this.bus.publish("audit.recorded", { seq, action, decision });
  }

  private registerCoreTools(): void {
    this.register({
      name: "okg.query",
      sideEffect: "read",
      requiresAutonomy: 0,
      handler: async (input) => {
        const type = String(input.type ?? "Decision");
        return this.okg.nodesByType(type as never);
      },
    });

    this.register({
      name: "okg.assert_edge",
      sideEffect: "internal_write",
      requiresAutonomy: 1,
      handler: async (input, caller) => {
        return this.okg.addEdge({
          type: input.type as never,
          src: String(input.src),
          dst: String(input.dst),
          weight: Number(input.weight ?? 0.7),
          createdBy: caller.id,
          sourceId: randomUUID(),
          status: "proposed", // agent assertions start proposed
        });
      },
    });

    // External-write example: gated behind autonomy L4 (act-within-bounds).
    this.register({
      name: "comms.send_email",
      sideEffect: "external_write",
      requiresAutonomy: 4,
      handler: async (input) => {
        return { sent: true, to: input.to, subject: input.subject };
      },
    });
  }
}

function hashRecord(rec: Omit<AuditRecord, "thisHash">, prevHash: string): string {
  const payload = JSON.stringify({ ...rec, prevHash });
  return createHash("sha256").update(payload).digest("hex");
}
