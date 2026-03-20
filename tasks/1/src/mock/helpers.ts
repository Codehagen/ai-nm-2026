/**
 * Response helpers for Tripletex API envelope format.
 * Shapes match the real Tripletex v2 REST API as verified against sandbox.
 */

export interface ValidationMessage {
  field: string | null;
  message: string;
  path: string | null;
  rootId: number | null;
}

export interface TripletexError {
  status: number;
  code: number;
  message: string;
  link: string;
  developerMessage: string | null;
  validationMessages: ValidationMessage[] | null;
  requestId: string;
}

/** Wrap a single entity in Tripletex value envelope */
export function wrapValue<T>(entity: T): { value: T } {
  return { value: entity };
}

/** Wrap a list of entities in Tripletex list envelope */
export function wrapList<T>(
  entities: T[],
  from: number = 0,
  count?: number
): {
  fullResultSize: number;
  from: number;
  count: number;
  versionDigest: string;
  values: T[];
} {
  const total = entities.length;
  const sliced = entities.slice(from, count !== undefined ? from + count : undefined);
  return {
    fullResultSize: total,
    from,
    count: sliced.length,
    versionDigest: "'If-None-Match' header not specified",
    values: sliced,
  };
}

/** Pick only requested fields from an entity.
 *  Real Tripletex returns ONLY the requested fields — no auto-include of id/version. */
export function filterFields<T extends Record<string, unknown>>(
  entity: T,
  fields: string | undefined
): Partial<T> {
  if (!fields || fields === "*") return entity;

  const keys = fields.split(",").map((f) => f.trim());
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    // Skip sub-resource field syntax like "employee(firstName)"
    if (key.includes("(")) continue;
    if (key in entity) {
      result[key] = entity[key];
    }
  }
  return result as Partial<T>;
}

/** Convert simple validation messages to Tripletex format */
function toValidationMessages(
  errors: Array<{ field: string; message: string }>
): ValidationMessage[] {
  return errors.map((e) => ({
    field: e.field,
    message: e.message,
    path: e.field ? `null.${e.field}` : null,
    rootId: null,
  }));
}

/** Validate required fields, returns validation error response or null */
export function validateRequired(
  body: Record<string, unknown>,
  requiredFields: string[]
): TripletexError | null {
  const missing: Array<{ field: string; message: string }> = [];
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      missing.push({ field, message: "Kan ikke være null." });
    }
  }
  if (missing.length === 0) return null;
  return {
    status: 422,
    code: 18000,
    message: "Validering feilet.",
    link: "https://tripletex.no/v2-docs/",
    developerMessage: null,
    validationMessages: toValidationMessages(missing),
    requestId: "mock-request-id",
  };
}

/** Validate reference fields exist in the store */
export function validateRefs(
  body: Record<string, unknown>,
  refValidation: Record<string, string>,
  storeHas: (type: string, id: number) => boolean
): TripletexError | null {
  const errors: Array<{ field: string; message: string }> = [];
  for (const [fieldPath, entityType] of Object.entries(refValidation)) {
    const ref = body[fieldPath.split(".")[0]] as { id?: number } | undefined;
    if (ref && ref.id !== undefined) {
      if (!storeHas(entityType, ref.id)) {
        errors.push({ field: fieldPath, message: `${entityType} with id ${ref.id} not found` });
      }
    }
  }
  if (errors.length === 0) return null;
  return {
    status: 422,
    code: 18000,
    message: "Validering feilet.",
    link: "https://tripletex.no/v2-docs/",
    developerMessage: null,
    validationMessages: toValidationMessages(errors),
    requestId: "mock-request-id",
  };
}

/** Parse search/filter query params against entities */
export function parseSearch<T extends Record<string, unknown>>(
  params: Record<string, string>,
  entities: T[],
  searchFields: string[]
): T[] {
  let result = entities;
  for (const field of searchFields) {
    const val = params[field];
    if (val !== undefined) {
      result = result.filter((e) => {
        const entityVal = e[field];
        if (typeof entityVal === "string") {
          return entityVal.toLowerCase().includes(val.toLowerCase());
        }
        if (typeof entityVal === "number") {
          return entityVal === Number(val);
        }
        return false;
      });
    }
  }
  return result;
}

/** Build a Tripletex error response (matches real API shape) */
export function errorResponse(
  status: number,
  message: string,
  validationMessages?: Array<{ field: string; message: string }>
): TripletexError {
  const codeMap: Record<number, number> = {
    400: 10000,
    401: 1000,
    403: 2000,
    404: 12000,
    409: 8000,
    422: 18000,
  };
  return {
    status,
    code: codeMap[status] ?? 10000,
    message,
    link: "https://tripletex.no/v2-docs/",
    developerMessage: null,
    validationMessages: validationMessages ? toValidationMessages(validationMessages) : null,
    requestId: "mock-request-id",
  };
}
