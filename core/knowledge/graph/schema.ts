/**
 * Organizational Knowledge Graph (OKG) — schema.
 *
 * The OKG is a bitemporal, multi-modal property graph. Every node and edge
 * carries two independent time axes (valid-time and transaction-time) so the
 * system can answer:
 *   - "What did we believe was true on date X?"  (transaction time)
 *   - "What was actually true on date X?"         (valid time, corrected later)
 *   - replay any past Decision against the world-state known at decision-time.
 *
 * First principle (P3): the Decision is the atomic unit of the business, so it
 * is modeled as a first-class node type, not a side effect of a record change.
 */

export type UUID = string;
/** ISO-8601 timestamp string. */
export type Timestamp = string;

/**
 * Bitemporal versioning columns. An "update" never overwrites: it closes the
 * prior version's `txTo` and inserts a new version. The graph is append-only.
 */
export interface Bitemporal {
  /** When the fact becomes true in the real world. */
  validFrom: Timestamp;
  /** When the fact stops being true in the real world. null = still valid. */
  validTo: Timestamp | null;
  /** When the system first knew the fact. */
  txFrom: Timestamp;
  /** When this version was superseded. null = current belief. */
  txTo: Timestamp | null;
}

/** Core ontology — node types (entities). */
export type NodeType =
  | "Person"
  | "Customer"
  | "Deal"
  | "Product"
  | "Money"
  | "Objective"
  | "WorkItem"
  | "Decision"
  | "Document"
  | "Event"
  | "Asset"
  | "Contract"
  | "Risk"
  | "Capability"
  | "Market"
  | "Agent"
  | "Policy";

/** Core ontology — edge types (relationships). */
export type EdgeType =
  | "EMPLOYS"
  | "REPORTS_TO"
  | "OWNS"
  | "RESPONSIBLE_FOR"
  | "INVOLVES"
  | "PARTICIPATES_IN"
  | "INFLUENCES"
  | "CAUSES"
  | "CORRELATES_WITH"
  | "BLOCKS"
  | "DEPENDS_ON"
  | "DERIVED_FROM"
  | "EVIDENCED_BY"
  | "DECIDED_BY"
  | "RECONCILED_AGAINST"
  | "RELATES_TO"
  | "COMPETES_WITH"
  | "SUPPLIES"
  | "ALLOCATED_TO"
  | "FUNDED_BY"
  | "MEASURES"
  | "SUPERSEDES"
  | "PREDICTS";

/** Business domains, used to route reasoning to specialist agents. */
export type Domain =
  | "finance"
  | "sales"
  | "ops"
  | "people"
  | "strategy"
  | "legal"
  | "risk"
  | "tech";

/** Provenance: no fact enters the OKG without a source (P: provenance mandatory). */
export interface SourceRef {
  sourceId: UUID;
  /** Human-readable description of where this fact came from. */
  description?: string;
}

/** A node in the OKG. Props are type-specific (see DecisionProps, etc.). */
export interface OKGNode<P = Record<string, unknown>> extends Bitemporal {
  id: UUID;
  type: NodeType;
  props: P;
  /** Person or Agent node id that asserted this version. */
  createdBy: UUID;
  provenance: SourceRef[];
}

/** An edge in the OKG. */
export interface OKGEdge extends Bitemporal {
  id: UUID;
  type: EdgeType;
  src: UUID;
  dst: UUID;
  /** Confidence / strength in [0, 1]. */
  weight: number;
  createdBy: UUID;
  sourceId: UUID;
  /**
   * Agent-asserted edges enter `proposed` and are promoted to `active` by the
   * Synthesis agent. Ingested facts are `active` immediately.
   */
  status: "proposed" | "active";
}

// ---------------------------------------------------------------------------
// First-class Decision node
// ---------------------------------------------------------------------------

export interface DecisionOption {
  label: string;
  predictedOutcome?: Record<string, unknown>;
  evidenceIds?: UUID[];
}

export type DecisionStatus =
  | "proposed"
  | "approved"
  | "executed"
  | "reconciled"
  | "reverted";

export interface DecisionProps {
  question: string;
  domain: Domain;
  options: DecisionOption[];
  chosenOption?: string;
  /** Person or Agent id that decided. */
  decidedBy?: UUID;
  /** Autonomy level (0–7) at which the decision was made. */
  autonomyLevel: number;
  confidence?: number;
  predictedOutcome?: Record<string, unknown>;
  /** Filled at reconciliation time, feeds the calibration flywheel. */
  actualOutcome?: Record<string, unknown>;
  status: DecisionStatus;
  /** Links to the DecisionSession that produced it. */
  sessionId?: UUID;
}

export type DecisionNode = OKGNode<DecisionProps>;

/** Convenience guard. */
export function isDecision(node: OKGNode<Record<string, unknown>>): node is OKGNode<DecisionProps & Record<string, unknown>> {
  return node.type === "Decision";
}
