# @lumetra/engram-ax

First-party [Engram](https://lumetra.io) memory adapter for the [`@ax-llm/ax`](https://github.com/ax-llm/ax) agent framework.

Engram is durable, explainable long-term memory for AI agents. This package exposes Engram's REST API as ax-compatible tool definitions you can drop into any `ax()` generator or agent.

## Install

```bash
npm install @lumetra/engram-ax @ax-llm/ax
```

## Quick start

```ts
import { ax, ai } from "@ax-llm/ax";
import { EngramClient, engramTools } from "@lumetra/engram-ax";

const engram = new EngramClient({
  apiKey: process.env.ENGRAM_API_KEY!,
  defaultBucket: "my-app",
});

const llm = ai({ name: "openai", apiKey: process.env.OPENAI_API_KEY! });

const assistant = ax(
  "userMessage:string -> reply:string",
  { functions: engramTools(engram) },
);

const { reply } = await assistant.forward(llm, {
  userMessage: "Remember that I prefer dark mode, then tell me what you know about my preferences.",
});

console.log(reply);
```

## What you get

`engramTools(client)` returns ax `AxFunction` definitions for:

| Tool            | What it does                                                            |
|-----------------|-------------------------------------------------------------------------|
| `store_memory`  | Save a fact / decision / preference to a bucket.                        |
| `query_memory`  | Retrieve a synthesized answer over memories (semantic + graph search).  |

By default only those two tools are exposed (the destructive ones are footguns when handed to an LLM). Opt in to more if you need them:

```ts
engramTools(engram, {
  include: [
    "store_memory",
    "query_memory",
    "list_buckets",
    "list_memories",
    "delete_memory",
    "clear_bucket",
  ],
});
```

## Direct REST client

You can also use the wrapper directly without ax:

```ts
import { EngramClient } from "@lumetra/engram-ax";

const engram = new EngramClient({ apiKey: process.env.ENGRAM_API_KEY! });

await engram.storeMemory("Jacob prefers dark mode", "prefs");
const { answer } = await engram.queryMemory("What UI mode does Jacob like?", "prefs");
```

Methods: `storeMemory`, `queryMemory`, `listBuckets`, `listMemories`, `deleteMemory`, `clearBucket`.

## Configuration

`EngramClient` accepts:

- `apiKey` — your Engram API key (`eng_live_...`). Required.
- `baseUrl` — defaults to `https://api.lumetra.io`. Override for self-hosted.
- `defaultBucket` — used when a tool call omits `bucket`. Defaults to `"default"`.
- `fetch` — optional custom `fetch` implementation.

## License

MIT — Lumetra.

See [PRIVACY.md](./PRIVACY.md).
