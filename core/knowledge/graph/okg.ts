/**
 * Organizational Knowledge Graph — in-memory bitemporal store.
 *
 * Append-only: mutations create new versions and close the prior version's
 * transaction-time. Supports as-of queries on both time axes. This reference
 * implementation keeps everything in arrays for clarity; production backs the
 * same interface with a distributed property graph + vector + columnar stores.
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../../events/event-bus.js";
import type {
  DecisionNode,
  DecisionProps,
  EdgeType,
  NodeType,
  OKGEdge,
  OKGNode,
  SourceRef,
  Timestamp,
  UUID,
} from "./schema.js";

const now = (): Timestamp => new Date().toISOString();

/** As-of constraints for temporal queries. Defaults to "current belief, now". */
export interface AsOf {
  /** Transaction time: what the system knew as of this instant. */
  txTime?: Timestamp;
  /** Valid time: what was true in the world as of this instant. */
  validTime?: Timestamp;
}

function visibleAt<T extends OKGNode | OKGEdge>(item: T, asOf: AsOf): boolean {
  const tx = asOf.txTime ?? now();
  const valid = asOf.validTime ?? tx;
  const txOk = item.txFrom <= tx && (item.txTo === null || item.txTo > tx);
  const validOk =
    item.validFrom <= valid && (item.validTo === null || item.validTo > valid);
  return txOk && validOk;
}

export interface AddNodeInput<P> {
  type: NodeType;
  props: P;
  createdBy: UUID;
  provenance: SourceRef[];
  validFrom?: Timestamp;
}

export interface AddEdgeInput {
  type: EdgeType;
  src: UUID;
  dst: UUID;
  weight?: number;
  createdBy: UUID;
  sourceId: UUID;
  status?: "proposed" | "active";
  validFrom?: Timestamp;
}

export class OKG {
  /** All node versions ever written (append-only). */
  private readonly nodeVersions: OKGNode[] = [];
  /** All edge versions ever written (append-only). */
  private readonly edgeVersions: OKGEdge[] = [];

  constructor(private readonly bus?: EventBus) {}

  // -- writes ---------------------------------------------------------------

  addNode<P>(input: AddNodeInput<P>): OKGNode<P> {
    const ts = now();
    const node: OKGNode<P> = {
      id: randomUUID(),
      type: input.type,
      props: input.props,
      createdBy: input.createdBy,
      provenance: input.provenance,
      validFrom: input.validFrom ?? ts,
      validTo: null,
      txFrom: ts,
      txTo: null,
    };
    this.nodeVersions.push(node as OKGNode);
    this.bus?.publish("okg.node.versioned", { id: node.id, type: node.type });
    return node;
  }

  /** Append a new version of an existing node; closes the prior version's txTo. */
  updateNode<P>(id: UUID, props: P, createdBy: UUID, provenance: SourceRef[]): OKGNode<P> {
    const ts = now();
    const current = this.currentNode(id);
    if (!current) throw new Error(`updateNode: node ${id} not found`);
    current.txTo = ts; // close prior belief
    const next: OKGNode<P> = {
      id,
      type: current.type,
      props,
      createdBy,
      provenance,
      validFrom: current.validFrom,
      validTo: null,
      txFrom: ts,
      txTo: null,
    };
    this.nodeVersions.push(next as OKGNode);
    this.bus?.publish("okg.node.versioned", { id, type: current.type });
    return next;
  }

  addEdge(input: AddEdgeInput): OKGEdge {
    const ts = now();
    const edge: OKGEdge = {
      id: randomUUID(),
      type: input.type,
      src: input.src,
      dst: input.dst,
      weight: input.weight ?? 1,
      createdBy: input.createdBy,
      sourceId: input.sourceId,
      status: input.status ?? "active",
      validFrom: input.validFrom ?? ts,
      validTo: null,
      txFrom: ts,
      txTo: null,
    };
    this.edgeVersions.push(edge);
    this.bus?.publish("okg.edge.added", { id: edge.id, type: edge.type, status: edge.status });
    return edge;
  }

  /** Promote a proposed edge (asserted by an agent) to active. */
  promoteEdge(id: UUID): void {
    const edge = this.edgeVersions.find((e) => e.id === id && e.txTo === null);
    if (edge) {
      edge.status = "active";
      this.bus?.publish("okg.edge.promoted", { id });
    }
  }

  // -- reads ----------------------------------------------------------------

  /** Current belief of a node (most recent open transaction-time version). */
  currentNode(id: UUID): OKGNode | undefined {
    return this.nodeVersions.find((n) => n.id === id && n.txTo === null);
  }

  /** A node as the system knew it / as it was true at a point in time. */
  nodeAsOf(id: UUID, asOf: AsOf): OKGNode | undefined {
    return this.nodeVersions.find((n) => n.id === id && visibleAt(n, asOf));
  }

  /** All nodes of a type visible at a point in time (default: current). */
  nodesByType(type: NodeType, asOf: AsOf = {}): OKGNode[] {
    return this.nodeVersions.filter((n) => n.type === type && visibleAt(n, asOf));
  }

  /** Outgoing edges from a node, optionally filtered by type, at a point in time. */
  edgesFrom(src: UUID, type?: EdgeType, asOf: AsOf = {}): OKGEdge[] {
    return this.edgeVersions.filter(
      (e) =>
        e.src === src &&
        (type === undefined || e.type === type) &&
        e.status === "active" &&
        visibleAt(e, asOf),
    );
  }

  /** Neighbors reachable from a node along a given edge type. */
  neighbors(src: UUID, type: EdgeType, asOf: AsOf = {}): OKGNode[] {
    return this.edgesFrom(src, type, asOf)
      .map((e) => this.nodeAsOf(e.dst, asOf))
      .filter((n): n is OKGNode => n !== undefined);
  }

  // -- decision helpers -----------------------------------------------------

  addDecision(props: DecisionProps, createdBy: UUID, provenance: SourceRef[] = []): DecisionNode {
    const node = this.addNode<DecisionProps>({
      type: "Decision",
      props,
      createdBy,
      provenance,
    });
    this.bus?.publish("decision.opened", { id: node.id, question: props.question });
    return node as DecisionNode;
  }

  /**
   * Reconcile a decision against measured reality and write a
   * RECONCILED_AGAINST edge — the input to the calibration flywheel.
   */
  reconcileDecision(
    decisionId: UUID,
    actualOutcome: Record<string, unknown>,
    measuredBy: UUID,
  ): void {
    const current = this.currentNode(decisionId) as DecisionNode | undefined;
    if (!current) throw new Error(`reconcileDecision: decision ${decisionId} not found`);
    this.updateNode<DecisionProps>(
      decisionId,
      { ...current.props, actualOutcome, status: "reconciled" },
      measuredBy,
      current.provenance,
    );
    this.bus?.publish("decision.reconciled", { id: decisionId, actualOutcome });
  }

  /** Snapshot of all current node versions (for projections/debug). */
  snapshot(): OKGNode[] {
    return this.nodeVersions.filter((n) => n.txTo === null);
  }
}
