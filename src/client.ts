/**
 * EngramClient — minimal REST wrapper around the Engram memory API.
 *
 * Auth: Bearer token (e.g. `eng_live_...`). Base URL defaults to
 * `https://api.lumetra.io` but can be overridden for self-hosted deployments.
 */

export interface EngramClientOptions {
  /** Engram API key (Bearer token). */
  apiKey: string;
  /** Base URL of the Engram API. Defaults to `https://api.lumetra.io`. */
  baseUrl?: string;
  /** Default bucket to use when the caller does not specify one. */
  defaultBucket?: string;
  /** Optional `fetch` implementation. Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

export interface EngramQueryResponse {
  success: boolean;
  answer?: string;
  [k: string]: unknown;
}

export interface EngramBucket {
  name: string;
  [k: string]: unknown;
}

export interface EngramMemory {
  id: string;
  content?: string;
  [k: string]: unknown;
}

export class EngramError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "EngramError";
    this.status = status;
    this.body = body;
  }
}

export class EngramClient {
  readonly baseUrl: string;
  readonly defaultBucket: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: EngramClientOptions) {
    if (!opts.apiKey) throw new Error("EngramClient: apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.lumetra.io").replace(/\/+$/, "");
    this.defaultBucket = opts.defaultBucket ?? "default";
    const f = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) {
      throw new Error(
        "EngramClient: no fetch implementation available. Pass `fetch` in options or run on Node >=18.",
      );
    }
    this.fetchImpl = f.bind(globalThis);
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      throw new EngramError(
        `Engram ${method} ${path} failed: ${res.status} ${res.statusText}`,
        res.status,
        parsed,
      );
    }
    return parsed as T;
  }

  /** Store a memory in the given bucket. */
  async storeMemory(content: string, bucket?: string): Promise<unknown> {
    const b = bucket ?? this.defaultBucket;
    return this.request("POST", `/v1/buckets/${encodeURIComponent(b)}/memories`, {
      content,
    });
  }

  /** Query memories — Engram returns a synthesized `answer` string. */
  async queryMemory(query: string, bucket?: string): Promise<EngramQueryResponse> {
    const b = bucket ?? this.defaultBucket;
    return this.request<EngramQueryResponse>("POST", `/v1/query`, {
      query,
      buckets: [b],
    });
  }

  /** List buckets on the tenant. */
  async listBuckets(limit = 50, offset = 0): Promise<unknown> {
    return this.request(
      "GET",
      `/v1/buckets?limit=${limit}&offset=${offset}`,
    );
  }

  /** List memories in a bucket. */
  async listMemories(bucket?: string, limit = 50): Promise<unknown> {
    const b = bucket ?? this.defaultBucket;
    return this.request(
      "GET",
      `/v1/buckets/${encodeURIComponent(b)}/memories?limit=${limit}`,
    );
  }

  /** Delete a single memory by id. */
  async deleteMemory(memoryId: string, bucket?: string): Promise<unknown> {
    const b = bucket ?? this.defaultBucket;
    return this.request(
      "DELETE",
      `/v1/buckets/${encodeURIComponent(b)}/memories/${encodeURIComponent(memoryId)}`,
    );
  }

  /** Clear every memory in a bucket. Destructive. */
  async clearBucket(bucket?: string): Promise<unknown> {
    const b = bucket ?? this.defaultBucket;
    return this.request(
      "DELETE",
      `/v1/buckets/${encodeURIComponent(b)}/memories`,
    );
  }
}
