/**
 * Generic CRUD route factory for Tripletex-style REST APIs.
 * Generates GET list, GET by ID, POST, PUT, DELETE for each entity config.
 */

import { Hono } from "hono";
import type { EntityConfig } from "./entities.js";
import type { EntityStore } from "./store.js";
import {
  wrapValue,
  wrapList,
  filterFields,
  validateRequired,
  validateRefs,
  parseSearch,
  errorResponse,
} from "./helpers.js";

export function registerCrudRoutes(app: Hono, config: EntityConfig, store: EntityStore): void {
  const { type, basePath, requiredFields, searchFields, refValidation, customValidation, deletable, requiredListParams } = config;

  // GET list — /basePath
  app.get(basePath, (c) => {
    const url = new URL(c.req.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });

    // Validate required list params (e.g., invoice requires date range)
    if (requiredListParams) {
      const missing = requiredListParams.filter((p) => !params[p]);
      if (missing.length > 0) {
        return c.json(errorResponse(422, "Validation failed", missing.map((p) => ({
          field: p,
          message: "Kan ikke være null.",
        }))), 422);
      }
    }

    const fields = params.fields;
    const from = parseInt(params.from || "0");
    const count = params.count ? parseInt(params.count) : undefined;

    let entities = store.list(type);

    // Apply search filters
    entities = parseSearch(params, entities, searchFields);

    // Apply field filtering
    const filtered = entities.map((e) => filterFields(e, fields));

    return c.json(wrapList(filtered, from, count));
  });

  // GET by ID — /basePath/:id
  app.get(`${basePath}/:id`, (c) => {
    const id = parseInt(c.req.param("id")!);
    const entity = store.getById(type, id);
    if (!entity) {
      return c.json(errorResponse(404, `${type} with id ${id} not found`), 404);
    }

    const fields = c.req.query("fields");
    return c.json(wrapValue(filterFields(entity, fields)));
  });

  // POST — /basePath
  app.post(basePath, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResponse(400, "Invalid JSON body"), 400);
    }

    // Validate required fields
    const reqError = validateRequired(body, requiredFields);
    if (reqError) return c.json(reqError, 422);

    // Validate references
    if (refValidation) {
      const refError = validateRefs(body, refValidation, (t, id) => store.has(t, id));
      if (refError) return c.json(refError, 422);
    }

    // Custom validation
    if (customValidation) {
      const errors = customValidation(body);
      if (errors) {
        return c.json(errorResponse(422, "Value Validation Exception", errors), 422);
      }
    }

    const entity = store.create(type, body);
    return c.json(wrapValue(entity), 201);
  });

  // PUT — /basePath/:id
  app.put(basePath + "/:id", async (c) => {
    const id = parseInt(c.req.param("id")!);
    const existing = store.getById(type, id);
    if (!existing) {
      return c.json(errorResponse(404, `${type} with id ${id} not found`), 404);
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResponse(400, "Invalid JSON body"), 400);
    }

    // Validate references if provided
    if (refValidation) {
      const refError = validateRefs(body, refValidation, (t, refId) => store.has(t, refId));
      if (refError) return c.json(refError, 422);
    }

    // Custom validation
    if (customValidation) {
      const errors = customValidation(body);
      if (errors) {
        return c.json(errorResponse(422, "Value Validation Exception", errors), 422);
      }
    }

    const expectedVersion = typeof body.version === "number" ? body.version : undefined;
    const result = store.update(type, id, body, expectedVersion);

    if (result === "version_conflict") {
      return c.json(
        errorResponse(409, `Version conflict: entity has been modified. Re-GET to obtain current version.`),
        409
      );
    }
    if (!result) {
      return c.json(errorResponse(404, `${type} with id ${id} not found`), 404);
    }

    return c.json(wrapValue(result));
  });

  // DELETE — /basePath/:id
  if (deletable !== false) {
    app.delete(`${basePath}/:id`, (c) => {
      const id = parseInt(c.req.param("id")!);
      const deleted = store.delete(type, id);
      if (!deleted) {
        return c.json(errorResponse(404, `${type} with id ${id} not found`), 404);
      }
      return c.body(null, 204);
    });
  }
}
