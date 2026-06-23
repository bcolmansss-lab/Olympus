// Tenant resolution middleware for the HTTP API.
// Reads X-Org-Id header (or ?orgId query param) and attaches the resolved
// Olympus instance to the request context, or returns 404 if not found.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantRegistry } from "./tenant-registry.js";
import type { Olympus } from "../index.js";

/** Resolve the orgId from the request. Header takes precedence over query param. */
export function resolveOrgId(req: IncomingMessage): string | undefined {
  const header = req.headers["x-org-id"];
  if (typeof header === "string" && header.length > 0) return header;
  const url = new URL(req.url ?? "/", "http://localhost");
  const param = url.searchParams.get("orgId");
  return param ?? undefined;
}

/**
 * Resolve the tenant's Olympus instance from the request.
 * Returns undefined and sends a 404 JSON error if the tenant is not found.
 * When no orgId is provided, returns undefined without sending a response
 * (caller should fall back to the default Olympus instance).
 */
export function resolveTenant(
  req: IncomingMessage,
  res: ServerResponse,
  registry: TenantRegistry
): Olympus | undefined {
  const orgId = resolveOrgId(req);
  if (!orgId) return undefined;
  const tenant = registry.get(orgId);
  if (!tenant) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Tenant not found: ${orgId}` }));
    return undefined;
  }
  return tenant.olympus;
}
