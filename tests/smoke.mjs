// End-to-end smoke test for @lumetra/engram-ax.
//
// Strategy:
//   1. Build a real EngramClient against the live Engram API.
//   2. Instantiate the ax tool definitions via engramTools(client).
//   3. Invoke each tool's `.func()` handler directly with realistic args,
//      assert that the underlying REST endpoints respond 2xx (or that we
//      get the synthesized `answer` back from /v1/query).
//
// We skip driving a full AxAgent.forward() because that requires a real
// OpenAI/Anthropic/etc. provider key — which is out of scope for the
// adapter smoke test. The handlers we exercise here are byte-for-byte
// the same code paths ax invokes when an LLM emits a tool call.

import { EngramClient, engramTools } from "../dist/index.js";

const apiKey = process.env.ENGRAM_API_KEY;
if (!apiKey) {
  console.error("ENGRAM_API_KEY env var required to run the smoke test.");
  process.exit(2);
}

const bucket = `ax-smoke-${Date.now()}`;

const client = new EngramClient({ apiKey, defaultBucket: bucket });

const tools = engramTools(client, {
  include: [
    "store_memory",
    "query_memory",
    "list_buckets",
    "list_memories",
    "delete_memory",
    "clear_bucket",
  ],
});

const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

const expectedNames = [
  "store_memory",
  "query_memory",
  "list_buckets",
  "list_memories",
  "delete_memory",
  "clear_bucket",
];
for (const n of expectedNames) {
  if (!byName[n]) throw new Error(`missing tool: ${n}`);
  const t = byName[n];
  if (!t.description) throw new Error(`tool ${n} missing description`);
  if (!t.parameters || t.parameters.type !== "object") {
    throw new Error(`tool ${n} parameters not object schema`);
  }
  if (typeof t.func !== "function") throw new Error(`tool ${n} missing func`);
}
console.log(`[ok] engramTools() returned all 6 tools with valid AxFunction shape`);

// ---- store_memory ----
const storeRes = await byName.store_memory.func({
  content: "ax adapter smoke test: the magic word is xyzzy-42",
  bucket,
});
console.log("[ok] store_memory ->", JSON.stringify(storeRes));

// give the indexer a beat
await new Promise((r) => setTimeout(r, 1500));

// ---- query_memory ----
const queryRes = await byName.query_memory.func({
  query: "what is the magic word from the ax adapter smoke test?",
  bucket,
});
if (typeof queryRes.answer !== "string") {
  throw new Error(`query_memory: expected answer string, got ${JSON.stringify(queryRes)}`);
}
console.log("[ok] query_memory.answer:", queryRes.answer.slice(0, 120).replace(/\n/g, " "));

// ---- list_buckets ----
const lb = await byName.list_buckets.func({ limit: 5 });
console.log("[ok] list_buckets keys:", Object.keys(lb ?? {}).join(",") || "(array)");

// ---- list_memories ----
const lm = await byName.list_memories.func({ bucket, limit: 10 });
const memories = lm?.memories ?? lm?.data ?? lm ?? [];
const memId = Array.isArray(memories) ? memories[0]?.id : memories?.[0]?.id;
console.log("[ok] list_memories -> count=", Array.isArray(memories) ? memories.length : "?", "first=", memId);

// ---- delete_memory ----
if (memId) {
  const del = await byName.delete_memory.func({ memory_id: memId, bucket });
  console.log("[ok] delete_memory ->", JSON.stringify(del));
} else {
  console.log("[skip] delete_memory: no memory_id available");
}

// ---- clear_bucket ----
const clr = await byName.clear_bucket.func({ bucket });
console.log("[ok] clear_bucket ->", JSON.stringify(clr));

console.log("\nall tool handlers exercised cleanly. adapter is wired correctly.");
