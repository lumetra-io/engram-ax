/**
 * Ax-compatible tool definitions for Engram.
 *
 * These follow the canonical `AxFunction` shape used by `@ax-llm/ax`:
 *
 *   { name, description, parameters (JSON Schema), func }
 *
 * The shape is intentionally a plain object (rather than the `fn()` builder)
 * so the package has zero hard dependency on `@ax-llm/ax` — consumers pass
 * the returned objects straight into `ax(..., { functions })` or
 * `agent(..., { functions })`.
 */

import type { EngramClient } from "./client.js";

/**
 * Minimal structural type matching `AxFunction` from `@ax-llm/ax` without
 * importing it (kept as a peer dep). The real type lives at
 * `@ax-llm/ax`'s `src/ai/types.ts`.
 */
/**
 * JSON Schema shape compatible with ax's `AxFunctionJSONSchema`.
 * Each property carries a required `description` (ax enforces this).
 */
export interface EngramJSONSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: EngramJSONSchemaProperty;
}

export interface EngramAxFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, EngramJSONSchemaProperty>;
    required?: string[];
  };
  func: (args?: unknown) => Promise<unknown>;
}

export interface EngramToolsOptions {
  /**
   * Restrict which Engram tools are exposed to the agent. Defaults to the
   * two write/read tools (`store_memory`, `query_memory`) since exposing the
   * destructive ops to an LLM is usually a footgun.
   */
  include?: Array<
    | "store_memory"
    | "query_memory"
    | "list_buckets"
    | "list_memories"
    | "delete_memory"
    | "clear_bucket"
  >;
}

const DEFAULT_INCLUDE: NonNullable<EngramToolsOptions["include"]> = [
  "store_memory",
  "query_memory",
];

/**
 * Build ax-compatible tool definitions backed by an `EngramClient`.
 *
 * @example
 * ```ts
 * import { ax } from "@ax-llm/ax";
 * import { EngramClient, engramTools } from "@lumetra/engram-ax";
 *
 * const client = new EngramClient({ apiKey: process.env.ENGRAM_API_KEY! });
 * const agent = ax("question:string -> answer:string", {
 *   functions: engramTools(client),
 * });
 * ```
 */
export function engramTools(
  client: EngramClient,
  opts: EngramToolsOptions = {},
): EngramAxFunction[] {
  const include = new Set(opts.include ?? DEFAULT_INCLUDE);

  const all: Record<string, EngramAxFunction> = {
    store_memory: {
      name: "store_memory",
      description:
        "Save a fact, decision, or piece of context to Engram durable memory. " +
        "Use this when the user shares a fact, preference, or important detail " +
        "you'll want to recall later.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The fact or context to remember. One concept per call works best.",
          },
          bucket: {
            type: "string",
            description:
              "Optional bucket name to scope the memory. Defaults to the client's default bucket.",
          },
        },
        required: ["content"],
      },
      func: async (args: unknown) => {
        const { content, bucket } = (args ?? {}) as {
          content?: string;
          bucket?: string;
        };
        if (!content) throw new Error("store_memory: `content` is required");
        await client.storeMemory(content, bucket);
        return { ok: true };
      },
    },

    query_memory: {
      name: "query_memory",
      description:
        "Search Engram durable memory for facts and context relevant to a " +
        "question. Returns a synthesized answer string. Call this BEFORE " +
        "answering whenever the user might be referring to prior context.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language question to search memory for.",
          },
          bucket: {
            type: "string",
            description:
              "Optional bucket name to search. Defaults to the client's default bucket.",
          },
        },
        required: ["query"],
      },
      func: async (args: unknown) => {
        const { query, bucket } = (args ?? {}) as {
          query?: string;
          bucket?: string;
        };
        if (!query) throw new Error("query_memory: `query` is required");
        const res = await client.queryMemory(query, bucket);
        return { answer: res.answer ?? "", success: res.success ?? true };
      },
    },

    list_buckets: {
      name: "list_buckets",
      description: "List Engram memory buckets on the current tenant.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max buckets to return (default 50)." },
          offset: { type: "number", description: "Pagination offset (default 0)." },
        },
      },
      func: async (args: unknown) => {
        const { limit, offset } = (args ?? {}) as { limit?: number; offset?: number };
        return client.listBuckets(limit, offset);
      },
    },

    list_memories: {
      name: "list_memories",
      description: "List recent memories in an Engram bucket.",
      parameters: {
        type: "object",
        properties: {
          bucket: { type: "string", description: "Bucket name." },
          limit: { type: "number", description: "Max memories to return (default 50)." },
        },
      },
      func: async (args: unknown) => {
        const { bucket, limit } = (args ?? {}) as { bucket?: string; limit?: number };
        return client.listMemories(bucket, limit);
      },
    },

    delete_memory: {
      name: "delete_memory",
      description: "Delete a single Engram memory by id. Destructive.",
      parameters: {
        type: "object",
        properties: {
          memory_id: { type: "string", description: "Memory id to delete." },
          bucket: { type: "string", description: "Bucket the memory lives in." },
        },
        required: ["memory_id"],
      },
      func: async (args: unknown) => {
        const { memory_id, bucket } = (args ?? {}) as {
          memory_id?: string;
          bucket?: string;
        };
        if (!memory_id) throw new Error("delete_memory: `memory_id` is required");
        await client.deleteMemory(memory_id, bucket);
        return { ok: true };
      },
    },

    clear_bucket: {
      name: "clear_bucket",
      description:
        "Delete EVERY memory in an Engram bucket. Highly destructive — do not " +
        "call this unless the user has explicitly asked to wipe the bucket.",
      parameters: {
        type: "object",
        properties: {
          bucket: { type: "string", description: "Bucket to wipe." },
        },
      },
      func: async (args: unknown) => {
        const { bucket } = (args ?? {}) as { bucket?: string };
        await client.clearBucket(bucket);
        return { ok: true };
      },
    },
  };

  return Object.values(all).filter((t) => include.has(t.name as never));
}
