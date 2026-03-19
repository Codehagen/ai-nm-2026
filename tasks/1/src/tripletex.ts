import type { TripletexCredentials } from "./dtos.js";

export type TxResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      message: string;
      validationMessages?: Array<{ field: string; message: string }>;
      rawBody?: unknown;
    };

/**
 * Tripletex API client. Uses Basic Auth with username "0" and session token.
 * All calls go through the provided proxy base_url.
 * Returns structured results (never throws on HTTP errors).
 * Accepts AbortSignal for timeout propagation.
 */
export class TripletexClient {
  private baseUrl: string;
  private authHeader: string;
  private signal?: AbortSignal;

  constructor(credentials: TripletexCredentials, signal?: AbortSignal) {
    this.baseUrl = credentials.base_url.replace(/\/$/, "");
    this.authHeader =
      "Basic " +
      Buffer.from(`0:${credentials.session_token}`).toString("base64");
    this.signal = signal;
  }

  private async request(
    method: string,
    path: string,
    options?: { params?: Record<string, string>; body?: unknown }
  ): Promise<TxResult> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.params) {
      for (const [k, v] of Object.entries(options.params)) {
        url.searchParams.set(k, v);
      }
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: this.signal,
      });
    } catch (err: unknown) {
      // Re-throw AbortError so the timeout handler catches it
      if (err instanceof Error && err.name === "AbortError") throw err;
      return {
        ok: false,
        status: 0,
        message: `Network error on ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 204 No Content (DELETE, actions)
    if (res.status === 204) {
      return { ok: true, data: null };
    }

    const contentType = res.headers.get("content-type");
    let body: unknown;
    try {
      body = contentType?.includes("application/json")
        ? await res.json()
        : await res.text();
    } catch {
      body = null;
    }

    if (!res.ok) {
      // Return structured error so the LLM can read validationMessages
      const errBody = body as Record<string, unknown> | null;
      return {
        ok: false,
        status: res.status,
        message:
          (errBody?.message as string) ||
          `${method} ${path} → ${res.status}`,
        validationMessages:
          (errBody?.validationMessages as Array<{
            field: string;
            message: string;
          }>) || undefined,
        rawBody: body,
      };
    }

    return { ok: true, data: body };
  }

  async get(path: string, params?: Record<string, string>) {
    return this.request("GET", path, { params });
  }

  async post(path: string, body: unknown, params?: Record<string, string>) {
    return this.request("POST", path, { body, params });
  }

  async put(path: string, body: unknown, params?: Record<string, string>) {
    return this.request("PUT", path, { body, params });
  }

  async delete(path: string) {
    return this.request("DELETE", path);
  }
}
