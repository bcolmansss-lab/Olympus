/**
 * Graph-Augmented Retrieval (GraphRAG) — BLUEPRINT.md §24.
 *
 * Combines three complementary retrieval strategies into a single grounded
 * context bundle. Every fact carries provenance; the reasoning engine may only
 * assert claims traceable to this bundle (the anti-hallucination contract).
 *
 *   1. Graph traversal — structurally relevant subgraph around query entities
 *      (walks CAUSES / INFLUENCES / DERIVED_FROM / MEASURES edges with
 *      temporal filtering).
 *
 *   2. Vector similarity — semantic recall over Document / memory embeddings.
 *      Uses cosine similarity on float32 embeddings; production uses HNSW.
 *
 *   3. Relational aggregation — exact numeric summaries from Money/ledger
 *      nodes; no LLM arithmetic on raw numbers.
 *
 * All three streams are fused and ranked by (relevance × recency × weight).
 */

import type { OKG, AsOf } from "../knowledge/graph/okg.js";
import type { OKGNode, EdgeType, Timestamp } from "../knowledge/graph/schema.js";
import type { MemoryStore, SemanticFact } from "../memory/memory-store.js";

export interface RetrievedFact {
  ref: string;             // "okg://node/<id>" | "mem://semantic/<id>" | "agg://<metric>"
  source: "graph" | "vector" | "aggregate" | "semantic";
  claim: string;
  /** Relevance × recency × edge-weight composite, [0, 1]. */
  score: number;
  /** Timestamp of the underlying evidence (for temporal-aware queries). */
  evidenceTs?: Timestamp;
}

export interface GroundedContext {
  query: string;
  facts: RetrievedFact[];
  /** True when every claim in `facts` has a traceable provenance ref. */
  fullyGrounded: boolean;
}

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  ts: Timestamp;
}

// Graph-traversal constants.
const CAUSAL_EDGES: EdgeType[] = ["CAUSES", "INFLUENCES", "DERIVED_FROM", "MEASURES", "PREDICTS"];
const MAX_HOPS = 3;

export class GraphRAG {
  private readonly vectorStore: VectorDocument[] = [];

  constructor(
    private readonly okg: OKG,
    private readonly memory: MemoryStore,
  ) {}

  /** Index a document with its embedding for vector retrieval. */
  indexDocument(doc: VectorDocument): void {
    this.vectorStore.push(doc);
  }

  /**
   * Retrieve a grounded context bundle for a query.
   *
   * @param query      Natural-language or structured query string.
   * @param anchorIds  OKG node ids to start graph traversal from.
   * @param embedding  Query embedding for vector search (optional).
   * @param asOf       Temporal constraints for graph traversal.
   * @param topK       Maximum facts to return.
   */
  retrieve(
    query: string,
    anchorIds: string[],
    embedding?: number[],
    asOf: AsOf = {},
    topK = 20,
  ): GroundedContext {
    const facts: RetrievedFact[] = [];

    // 1. Graph traversal -------------------------------------------------------
    const visited = new Set<string>();
    const queue: Array<{ id: string; hop: number; weight: number }> = anchorIds.map((id) => ({
      id,
      hop: 0,
      weight: 1,
    }));

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || visited.has(item.id)) continue;
      visited.add(item.id);

      const node = this.okg.nodeAsOf(item.id, asOf);
      if (!node) continue;

      const recency = recencyScore(node.validFrom);
      const score = item.weight * recency;
      facts.push({
        ref: `okg://node/${node.id}`,
        source: "graph",
        claim: nodeDescription(node),
        score: round(score),
        evidenceTs: node.validFrom,
      });

      if (item.hop < MAX_HOPS) {
        for (const edgeType of CAUSAL_EDGES) {
          const edges = this.okg.edgesFrom(item.id, edgeType, asOf);
          for (const edge of edges) {
            if (!visited.has(edge.dst)) {
              queue.push({ id: edge.dst, hop: item.hop + 1, weight: item.weight * edge.weight * 0.85 });
            }
          }
        }
      }
    }

    // 2. Vector similarity -----------------------------------------------------
    if (embedding && this.vectorStore.length > 0) {
      const scored = this.vectorStore
        .map((doc) => ({ doc, sim: cosine(embedding, doc.embedding) }))
        .filter((x) => x.sim > 0.5)
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 8);

      for (const { doc, sim } of scored) {
        facts.push({
          ref: `vec://doc/${doc.id}`,
          source: "vector",
          claim: doc.text.slice(0, 200),
          score: round(sim * recencyScore(doc.ts)),
          evidenceTs: doc.ts,
        });
      }
    }

    // 3. Semantic memory -------------------------------------------------------
    // Pull high-weight semantic facts relevant to terms in the query.
    const queryTerms = query.toLowerCase().split(/\s+/);
    const relevant = [...new Set(queryTerms)]
      .flatMap((term) => this.memory.factsAbout(term))
      .filter((f): f is SemanticFact => f.weight > 0.4);

    for (const f of relevant) {
      facts.push({
        ref: `mem://semantic/${f.id}`,
        source: "semantic",
        claim: `${f.subject} ${f.predicate} ${f.object}`,
        score: round(f.weight),
        evidenceTs: f.lastSeen,
      });
    }

    // 4. Relational aggregation ------------------------------------------------
    // Sum Money nodes for quick numeric grounding (no LLM arithmetic).
    const moneyNodes = this.okg.nodesByType("Money", asOf);
    if (moneyNodes.length > 0) {
      const total = moneyNodes.reduce((sum, n) => {
        const p = n.props as Record<string, unknown>;
        return sum + (typeof p.amount === "number" ? p.amount : 0);
      }, 0);
      facts.push({
        ref: `agg://money/total`,
        source: "aggregate",
        claim: `Total monetary transactions in scope: ${total.toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
        score: 0.9,
      });
    }

    // Rank and trim.
    const ranked = facts.sort((a, b) => b.score - a.score).slice(0, topK);

    return {
      query,
      facts: ranked,
      fullyGrounded: ranked.every((f) => f.ref.length > 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function nodeDescription(node: OKGNode): string {
  const p = node.props as Record<string, unknown>;
  const snippet = Object.entries(p)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
  return `[${node.type}] ${snippet}`;
}

/** Score recency: 1.0 for today, decaying to 0.1 over ~365 days. */
function recencyScore(ts: Timestamp): number {
  const ageMs = Date.now() - new Date(ts).getTime();
  const ageDays = ageMs / 86_400_000;
  return Math.max(0.1, Math.exp(-ageDays / 180));
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] as number) * (b[i] as number);
    normA += (a[i] as number) ** 2;
    normB += (b[i] as number) ** 2;
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
