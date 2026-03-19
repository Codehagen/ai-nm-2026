import type { TripletexCredentials } from "./dtos.js";

export type TxResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/**
 * Tripletex API client. Uses Basic Auth with username "0" and session token.
 * All calls go through the provided proxy base_url.
 * Returns results as data (never throws on HTTP errors).
 */
export class TripletexClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(credentials: TripletexCredentials) {
    this.baseUrl = credentials.base_url.replace(/\/$/, "");
    this.authHeader =
      "Basic " + Buffer.from(`0:${credentials.session_token}`).toString("base64");
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

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: `${method} ${path} → ${res.status}: ${text}` };
    }

    const contentType = res.headers.get("content-type");
    const data = contentType?.includes("application/json")
      ? await res.json()
      : await res.text();
    return { ok: true, data };
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
