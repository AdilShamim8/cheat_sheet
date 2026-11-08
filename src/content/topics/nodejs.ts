import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "nodejs",
  name: "Node.js",
  category: "topics",
  tier: "topic",
  tags: ["javascript-runtime", "server", "async", "event-loop", "backend", "v8", "npm"],
  tagline: "JavaScript on the server — a V8-powered, event-loop-first runtime for APIs, tooling, and everything npm touches.",
  year: 2009,
  author: "Ryan Dahl",
  lastUpdated: "2026-11",
  readingTime: 29,

  tldr: [
    "Node.js is a JavaScript runtime built on Chrome's V8 engine plus libuv: single-threaded event loop, non-blocking I/O, and an async-first standard library. It excels at I/O-heavy servers, tooling, and scripts that live close to the npm ecosystem.",
    "It powers a huge share of backend APIs (Express/Fastify/Hono/NestJS), BFF/SSR layers, CLI tooling, build systems, and desktop runtimes (Electron). TypeScript 7's Go rewrite and Bun/Deno have sharpened the tooling space, but Node remains the compatibility center of gravity.",
    "Reach for Node when the workload is I/O-bound (APIs, proxies, realtime), when you want one language across client and server, or when the npm ecosystem is the product (tooling, serverless functions).",
    "Avoid Node for CPU-bound number crunching (worker_threads help but C/Rust/Go win), hard-realtime systems, and memory-tiny containers — the baseline V8 heap is heavier than a Go binary.",
  ],

  mentalModel: {
    title: "One thread, one loop, zero blocking",
    body: "Every Node process runs a single JavaScript thread with an event loop: it takes a callback/promise from a queue, runs it to completion, then the next. Nothing ever preempts your code — that's why data races on plain JS objects don't exist. The trade-off: any synchronous work (JSON.parse of a 200MB file, a hot loop, a blocking regex) freezes EVERYTHING — every request, every timer. So the standard library and every serious library do I/O via libuv's thread pool and OS async APIs (epoll/kqueue/IOCP), handing results back as callbacks/promises. Master the loop phases (timers → pending → poll → check → close) and you can predict exactly when any callback runs.",
  },

  constructs: [
    { syntax: "const p = fs/promises.readFile(path)", behavior: "Promise-based stdlib module — all async stdlib APIs have promise forms.", when: "Default for new code: await, no callback pyramids, better stack traces." },
    { syntax: "const r = await fetch(url)", behavior: "Global fetch (undici) — HTTP/1.1 + HTTP/2 client with WHATWG API.", when: "All outbound HTTP from Node 18+. No more axios/node-fetch for basic cases." },
    { syntax: "const s = createServer((req,res) => {})", behavior: "Raw HTTP server — req/res streams with events.", when: "Learning, proxies, or behind a framework (Fastify/Hono build on this)." },
    { syntax: "new Worker(filename)", behavior: "worker_threads — real OS threads with isolated JS contexts, message-passing.", when: "CPU-bound work (hashing, parsing, ML preprocessing) without freezing the loop." },
    { syntax: "const c = new AbortController()", behavior: "Standard cancellation signal — fetch, timers, and most async APIs accept it.", when: "Request timeouts, client disconnects, shutting down cleanly." },
    { syntax: "stream.pipeline(src, ...transforms, dest)", behavior: "Composes streams with error propagation and cleanup.", when: "File/crypto/HTTP pipelines. NEVER pipe() manually in new code." },
    { syntax: "queueMicrotask(fn) / process.nextTick(fn)", behavior: "Run fn before the next macrotask (microtask queue / nextTick queue).", when: "Deferring work while keeping 'synchronous-ish' ordering — rare in app code." },
    { syntax: "node --watch app.js", behavior: "Built-in watch mode — restart on change, no nodemon.", when: "Development since Node 19." },
    { syntax: "node --test", behavior: "Built-in test runner (node:test) with assertions, mocks, coverage.", when: "Small-to-mid projects without adding vitest/jest." },
    { syntax: "ESM: import ... from './x.js'", behavior: "Native ES modules (.mjs or type:module) — sync resolution, top-level await.", when: "Default for new packages; CommonJS remains for legacy. Dual packages are pain — pick one." },
    { syntax: "import { schedule } from 'node:timers/promises'", behavior: "Promise timers: await setTimeout(100) / setInterval async iteration.", when: "Retry backoff, polling loops — replaces callback timers." },
  ],

  patterns: [
    {
      lang: "javascript",
      caption: "Fastify service with graceful shutdown (production shape)",
      code: `import Fastify from "fastify";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });

app.get("/users/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const user = await db.user.findById(id);
  if (!user) return reply.code(404).send({ error: "not_found" });
  return user;                    // serialized by fast-json-stringify
});

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, "request failed");
  const status = err.statusCode ?? 500;
  reply.code(status).send({ error: status === 500 ? "internal" : err.message });
});

// SIGTERM → stop accepting, finish in-flight, close DB — 10s budget
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    app.close().then(() => db.$pool.end()).then(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

await app.listen({ port: 3000, host: "0.0.0.0" });`,
    },
    {
      lang: "javascript",
      caption: "Fetch with timeout, retries, and backoff",
      code: `async function getJSON(url, { retries = 3, timeoutMs = 10_000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (res.status >= 500 && attempt < retries) throw new Error("5xx");
      if (!res.ok) throw new HTTPError(res.status, await res.text());
      return await res.json();
    } catch (err) {
      if (attempt === retries || !isRetryable(err)) throw err;
      await setTimeout(2 ** attempt * 250 + Math.random() * 100); // exp backoff + jitter
    } finally {
      clearTimeout(t);
    }
  }
}

const isRetryable = (e) => e?.name === "AbortError" || e?.name === "TypeError" || /5xx/.test(e?.message ?? "");`,
    },
    {
      lang: "javascript",
      caption: "Streams: process huge files without loading them",
      code: `import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { parse } from "csv-parse";

// 10GB CSV → gzip, line by line, constant memory
await pipeline(
  createReadStream("huge.csv"),
  parse({ columns: true }),
  async function* (rows) {
    for await (const row of rows) {
      if (row.status === "ok") yield JSON.stringify(row) + "\\n";
    }
  },
  createGzip(),
  createWriteStream("out.jsonl.gz"),
);

// Backpressure is handled by pipeline: if the disk is slow, the
// file read pauses automatically. No manual pause/resume.`,
    },
    {
      lang: "javascript",
      caption: "Worker threads for CPU-bound work",
      code: `import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./hash-worker.mjs", import.meta.url), {
      workerData: payload,
    });
    w.on("message", resolve);
    w.on("error", reject);
    w.on("exit", (code) => code !== 0 && reject(new Error("worker exit " + code)));
  });
}

// hash-worker.mjs:
//   import { parentPort, workerData } from "node:worker_threads";
//   parentPort.postMessage(heavyCompute(workerData));

// Pool for sustained CPU work: reuse piscina in production —
// it manages a worker pool with task queues and transferable buffers.
import { Piscina } from "piscina";
const pool = new Piscina({ filename: "./hash-worker.mjs" });
const results = await Promise.all(chunks.map((c) => pool.run(c)));`,
    },
    {
      lang: "javascript",
      caption: "Event loop health: the liveness pattern",
      code: `// Detect loop stalls > 500ms in production (leaky abstraction alert)
let last = performance.now();
setInterval(() => {
  const delta = performance.now() - last;
  if (delta > 500) metrics.histogram("event_loop_stall", delta);
  last = performance.now();
}, 100).unref();

// Blocked-loop smells to grep for:
//   JSON.parse on unbounded input   → stream + partial parse
//   sync fs.*                       → fs/promises
//   crypto.pbkdf2Sync               → promisified version
//   big regex on user input         → RE2 or timeouts
//   await in a for-loop of 10k IOs  → batch with Promise.all + limit

// pino with async logging keeps the loop free under load`,
    },
  ],

  pitfalls: [
    { title: "Blocking the event loop with sync code", symptom: "Every request and timer freezes while one handler runs — p99 latency spikes to seconds; health checks fail.", fix: "No sync fs/crypto/regex on hot paths. Use fs/promises, stream large inputs, move CPU work to worker_threads or a side service. Monitor event-loop delay (watchdog interval pattern)." },
    { title: "Unhandled promise rejections crash the process", symptom: "Node 15+: an un-awaited rejection with no handler terminates with ERR_UNHANDLED_REJECTION.", fix: "Always await or .catch; add process.on('unhandledRejection') as a safety net that logs and alerts; frameworks' error handlers only cover their own request scope." },
    { title: "Forgetting keep-alive on outbound fetch", symptom: "Every request pays TCP+TLS setup — throughput collapses and ephemeral ports exhaust under load.", fix: "Use an undici Agent with keepAlive, or a shared fetch dispatcher. For custom agents: set connections per origin and timeouts; never construct a new client per request." },
    { title: "Memory leaks via forgotten timers and listeners", symptom: "RSS grows until OOM after hours/days; heap snapshot shows thousands of Timeout/socket objects.", fix: "clearTimeout on shutdown paths; server.close() + track connections; EventEmitter has a max-listeners warning for a reason — never ignore it (leak signature)." },
    { title: "Callback-style APIs leaking into async code", symptom: "Mixed paradigms: callback pyramids around awaited code, race conditions from half-migrated code.", fix: "util.promisify legacy callbacks (or use fs/promises directly). New code: async/await only. Lint with no-floating-promises (TS) to catch un-awaited calls." },
    { title: "Naive JSON.parse on untrusted payloads", symptom: "A 500MB body or deeply nested JSON freezes the loop; prototype-pollution keys (__proto__) corrupt objects.", fix: "Enforce body limits at the framework layer, stream-parse big payloads (jsonparse), and harden with Object.create(null) / schemas for untrusted input." },
    { title: "Blocking startup with top-level awaits", symptom: "Service listens 30s after boot because config/DB/secret fetches are awaited inline.", fix: "Lazy-init clients (first-use), cache config with TTL, or await in the request path where acceptable. K8s readiness probes cover slow boots better than blocking init." },
    { title: "EPIPE/EMFILE crashes from uncapped concurrency", symptom: "Crashes under burst load: 'too many open files' or socket hang-ups.", fix: "Cap concurrent I/O with a semaphore (p-limit), retry with backoff, and set ulimit/conn limits explicitly. Inbound: framework/body limits; outbound: agent max sockets." },
  ],

  quickReference: [
    { fact: "Current lines (Nov 2026): Node 26 'Lithium' is Active LTS (26.13.0, Oct 2026); 24 'Krypton' and 22 'Jod' in maintenance. Node 26 shipped Temporal enabled by default + V8 14.6.", tag: "version" },
    { fact: "Node 26 (May 2026) enabled Temporal by default — the modern date/time API replacing moment/luxon; V8 14.6 adds Map.getOrInsert and Iterator.concat.", tag: "version" },
    { fact: "Global fetch/undici (Node 18+) and WebStreams make the WHATWG platform APIs first-class; Node implements more of the web platform every release.", tag: "version" },
    { fact: "Event loop order: timers → pending callbacks → poll (I/O) → check (setImmediate) → close; microtasks + process.nextTick drain between phases.", tag: "behavior" },
    { fact: "process.env is a real object but reads are cheap; still, validate+freeze config once at startup (envalid/zod), don't parse per-request.", tag: "perf" },
    { fact: "The stdlib test runner (node:test) covers most unit needs; vitest for UI-adjacent code; both run with zero config.", tag: "test" },
    { fact: "npm audit / better: pip-audit-style scanning via npm audit signatures or osv-scanner; lockfile (package-lock.json) must be committed.", tag: "security" },
    { fact: "Permissions system (Node 20+ --experimental-permission, stable path in later lines) runs with denied fs/child_process by default — defense in depth for CLIs.", tag: "security" },
    { fact: "Stack Overflow 2026: JavaScript used by 62% — the top language for the 12th straight year; Node-specific frameworks remain the top backend group.", tag: "usage" },
    { fact: "CommonJS vs ESM: type:'module' is the default for new packages; require() of ESM is supported from Node 22+ (synchronous). Dual-package hazard: avoid shipping both entry styles.", tag: "migration" },
    { fact: "Cluster mode (node:cluster) spawns per-core processes — still the simplest vertical scale; PM2/K8s replicas handle it at the deploy layer instead.", tag: "perf" },
    { fact: "ALT stack (2026): Node 26 + Fastify 5 + pino + @nestjs where structure is needed; Hono for edge-portable handlers.", tag: "ecosystem" },
    { fact: "V8 snapshots and compile cache (NODE_COMPILE_CACHE) cut startup 20-60% for CLI tools — zero-config since Node 22.", tag: "perf" },
  ],

  goDeeper: [
    { title: "Node.js official docs", url: "https://nodejs.org/docs/latest/api/", note: "The API reference is genuinely readable — the stream, event-loop, and worker_threads chapters are the ones that pay off." },
    { title: "Node.js Best Practices (goldbergyoni)", url: "https://github.com/goldbergyoni/nodebestpractices", note: "The 100k-star production checklist: error handling, security, structure, testing — audit your repo against it." },
    { title: "The Node.js Event Loop — official guide", url: "https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick", note: "Loop phases, nextTick vs microtasks, setImmediate vs setTimeout(0) — the canonical explanation." },
    { title: "undici — the HTTP client behind fetch", url: "https://undici.nodejs.org/", note: "Understand agents, interceptors, and why fetch in Node is not just 'curl'." },
    { title: "Node.js Release schedule", url: "https://github.com/nodejs/release", note: "LTS calendar — plan upgrades before your line hits maintenance." },
  ],

  // ─── §8 "Data types" — what flows through a Node program ──────────────────
  dataTypes: {
    primitives: [
      { syntax: "Buffer", behavior: "Fixed-length raw bytes; Uint8Array subclass with encoding helpers.", when: "Binary I/O: sockets, files, crypto. Convert to string only at the edges." },
      { syntax: "string", behavior: "UTF-16 internally; decode(buf, 'utf8') at boundaries.", when: "All text. Buffer.from(str) for wire formats — never concatenation tricks." },
      { syntax: "URL / URLSearchParams", behavior: "WHATWG URL parsing — global since Node 10.", when: "Always, instead of string-splitting URLs; handles edge cases correctly." },
      { syntax: "AbortSignal", behavior: "Cooperative cancellation primitive shared by fetch/timers/streams.", when: "Every network call with a deadline; request-scoped cancellation." },
    ],
    collections: [
      { syntax: "Map / Set", behavior: "Ordered keyed collections; keys by identity (objects OK).", when: "Caches with object keys, dedupe. Map over plain objects when keys aren't strings." },
      { syntax: "AsyncIterable", behavior: "for await ... of — streams implement it.", when: "Row-by-row consumption of sockets/files/queues with backpressure for free." },
      { syntax: "Web Streams (ReadableStream)", behavior: "WHATWG streams — interop with fetch bodies and the browser.", when: "Edge-portable code; Node streams when you need pipeline() power tools." },
      { syntax: "node:stream.Readable/Writable/Transform", behavior: "Event-emitting streams with backpressure (pause/resume).", when: "File pipelines, protocol handling — via stream/promises pipeline()." },
    ],
    custom: [
      { syntax: "EventEmitter", behavior: "Pub/sub base class: on/once/emit, max-listeners guard.", when: "Bridging callbacks to async (once(emitter, 'done')), SDKs. Prefer promises for new APIs." },
      { syntax: "workerdata messages", behavior: "Structured-clone messaging between threads; transferables move buffers zero-copy.", when: "CPU fan-out — pass ArrayBuffers, not JSON strings, for big payloads." },
      { syntax: "WeakMap/WeakRef caches", behavior: "Entries collectable when keys die — FinalizationRegistry hooks.", when: "Memoization keyed by request objects without leaks; careful: finalizers are not destructors." },
    ],
  },

  // ─── §9 Operators & expressions (async semantics) ─────────────────────────
  operators: [
    { syntax: "await p", behavior: "Suspends the async fn (not the loop/thread); resumes on settle.", when: "Sequential dependencies. Parallelism needs Promise.all, not a for-await." },
    { syntax: "Promise.all([a,b])", behavior: "All-or-nothing parallel join; rejects on first failure.", when: "Independent I/O fan-out (default choice)." },
    { syntax: "Promise.allSettled([a,b])", behavior: "Waits for all; returns {status, value/reason}.", when: "Best-effort batches where partial failure is acceptable (report + continue)." },
    { syntax: "Promise.race / Promise.any", behavior: "First settle (reject wins) / first fulfill (rejects ignored until all fail).", when: "Timeouts via race([fetch, timer]) / replica reads via any." },
    { syntax: "for await (const x of asyncIterable)", behavior: "Sequential consumption with backpressure.", when: "Streams, pagination, queues — never for parallel arrays." },
    { syntax: "p?.catch(fn) (floating)", behavior: "Attaches handler — the ONLY correct non-awaited form.", when: "Fire-and-forget with explicit logging. no-floating-promises keeps you honest." },
  ],

  // ─── §10 Input / Output ──────────────────────────────────────────────────
  inputOutput: [
    {
      lang: "javascript",
      caption: "HTTP server + client, the 2026 way",
      code: `// Server: raw node:http when you want zero deps
import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/echo") {
    // Stream body through — no buffering
    req.pipe(res);
    return;
  }
  res.writeHead(404).end();
});
server.keepAliveTimeout = 65_000;   // > LB idle timeout

// Client: fetch + AbortSignal + undici agent tuning
const ac = new AbortController();
setTimeout(() => ac.abort(), 5_000).unref();
const res = await fetch("https://api.example.com/v2/items?page=1", {
  signal: ac.signal,
  headers: { accept: "application/json" },
});
if (!res.ok) throw new Error("HTTP " + res.status);
const items = await res.json();`,
    },
    {
      lang: "javascript",
      caption: "Files, env, and config at startup",
      code: `import { readFile, writeFile, stat } from "node:fs/promises";
import { parseEnv } from "envalid";

// Config: parse and freeze ONCE at startup
const env = parseEnv({
  PORT: { type: "num", default: 3000 },
  DATABASE_URL: { type: "str" },        // throws if missing — fail fast
  LOG_LEVEL: { type: "enum", choices: ["debug","info","warn","error"], default: "info" },
});

// Atomic-ish file write (tmp + rename)
const tmp = path + ".tmp";
await writeFile(tmp, data, "utf8");
await rename(tmp, path);

// Read a file if it exists without try/catch noise
const pkg = await stat("package.json")
  .then(() => readFile("package.json", "utf8"))
  .then(JSON.parse)
  .catch(() => null);`,
    },
    {
      lang: "javascript",
      caption: "stdin/stdout CLI plumbing",
      code: `#!/usr/bin/env node
// Unix-filter style: cat big.json | ./transform.mjs > out.json
for await (const line of readline.createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const obj = JSON.parse(line);
  process.stdout.write(JSON.stringify(transform(obj)) + "\\n");
}

// Args parsing without deps
import { parseArgs } from "node:util";
const { values, positionals } = parseArgs({
  options: {
    out: { type: "string", short: "o" },
    verbose: { type: "boolean", short: "v", default: false },
  },
});`,
    },
  ],

  // ─── §11 Loops & iteration ────────────────────────────────────────────────
  loops: [
    {
      lang: "javascript",
      caption: "Bounded-concurrency patterns",
      code: `import pLimit from "p-limit";

// Process 200 URLs, 10 at a time — the single most useful loop
const limit = pLimit(10);
const results = await Promise.all(
  urls.map((u) => limit(() => getJSON(u)))
);

// Chunked sequential-with-parallelism (memory-capped batches)
const out = [];
for (const batch of chunk(rows, 500)) {
  out.push(...await Promise.all(batch.map(insertOne)));
}

// Infinite source, one-at-a-time (backpressure from consumer)
for await (const msg of subscription) {
  await handleMessage(msg);   // slow consumer → broker backs up, not memory
}`,
    },
    {
      lang: "javascript",
      caption: "Async generators: pagination and merged streams",
      code: `// Auto-paginating API reader
async function* page(url) {
  let next = url;
  while (next) {
    const { items, next_cursor } = await getJSON(next);
    yield* items;
    next = next_cursor ? url + "?cursor=" + next_cursor : null;
  }
}

for await (const item of page("https://api.example.com/items")) {
  await index(item);
}

// Merge two async sources with earliest-first ordering
async function* merge(a, b) {
  const [ra, rb] = [a[Symbol.asyncIterator](), b[Symbol.asyncIterator]()];
  let [pa, pb] = [ra.next(), rb.next()];
  while (!pa.done || !pb.done) {
    if (pb.done || (!pa.done && (await pa).at <= (await pb).at)) {
      yield (await pa).value; pa = ra.next();
    } else {
      yield (await pb).value; pb = rb.next();
    }
  }
}`,
    },
  ],

  // ─── §12 Functions & callables ────────────────────────────────────────────
  functions: [
    {
      lang: "javascript",
      caption: "Middleware / plugin composition",
      code: `// Compose middleware left-to-right with error propagation (fastify-style)
function compose(middleware) {
  return function wrapped(req, res, next) {
    let i = -1;
    function dispatch(idx) {
      if (idx <= i) return next(new Error("next() called twice"));
      i = idx;
      const fn = middleware[idx] ?? next;
      return Promise.resolve(fn(req, res, () => dispatch(idx + 1)));
    }
    return dispatch(0);
  };
}

const handler = compose([auth, rateLimit, validateBody, route]);
// Each layer may short-circuit (respond early) or decorate the
// request — the canonical Node server shape since Connect (2010).`,
    },
    {
      lang: "javascript",
      caption: "once / memoize / debounce — Node-flavored utilities",
      code: `import { once } from "node:events";

// Run an async bootstrap exactly once, share the promise
const getSecrets = once(async () => {
  const res = await fetch(vaultUrl, opts);
  return res.json();
});   // concurrent first-calls await the same result

// TTL memo for hot config
function memoTTL(fn, ttlMs = 60_000) {
  let t = 0, value;
  return async (...args) => {
    if (Date.now() - t > ttlMs) { value = await fn(...args); t = Date.now(); }
    return value;
  };
}`,
    },
  ],

  // ─── §13 Error handling ───────────────────────────────────────────────────
  errorHandling: [
    {
      lang: "javascript",
      caption: "The full production error strategy",
      code: `// 1) Typed errors — classification beats strings
class HTTPError extends Error {
  constructor(status, message, code) {
    super(message); this.status = status; this.code = code;
  }
}

// 2) Global safety nets (register FIRST, before app code)
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught — exiting");
  process.exit(1);            // restart is the supervisor's job
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandled rejection");
  metrics.increment("unhandled_rejection");
});

// 3) Exit the process only on unknown states — known request
//    errors stay in the framework handler:
app.setErrorHandler((err, req, reply) => {
  const status = err.status ?? 500;
  if (status >= 500) req.log.error({ err });
  reply.code(status).send({
    error: status >= 500 ? "internal_error" : err.code ?? "error",
  });
});`,
    },
    {
      lang: "javascript",
      caption: "Timeouts everywhere: wrap the await",
      code: `import { setTimeout as sleep } from "node:timers/promises";

async function withTimeout(promise, ms, label) {
  let ac;
  const timeout = sleep(ms).then(() => {
    throw new TimeoutError(label ?? "operation timed out after " + ms + "ms");
  });
  return Promise.race([promise, timeout]);
}

// Prefer native cancellation when the API supports it:
const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 3_000);
try {
  await fetch(url, { signal: ac.signal });
} finally {
  clearTimeout(timer);
}`,
    },
  ],

  // ─── §14 Concurrency ──────────────────────────────────────────────────────
  concurrency: [
    {
      lang: "javascript",
      caption: "The concurrency toolbox decision",
      code: `// I/O-bound, high fan-out          → async/await + Promise pools
await Promise.all(urls.map((u) => limit(() => fetchOne(u))));

// CPU-bound, in-process            → worker_threads (piscina pool)
const pool = new Piscina({ filename: "./worker.mjs", maxThreads: cpus().length });

// CPU-bound, process-level         → cluster or container replicas
//   (K8s horizontal scaling = simplest operational story)

// Long-lived daemons/queues         → separate process (BullMQ worker),
//   NOT setInterval in the web process

// Shared memory between threads:
import { SharedArrayBuffer, Atomics } from "node:worker_threads";
// Atomics.wait/notify for lock-free coordination — only after
// measuring; message-passing is fast enough for 95% of cases.`,
    },
    {
      lang: "javascript",
      caption: "Graceful shutdown choreography (K8s-ready)",
      code: `// 1. Stop accepting new connections
server.close();

// 2. Finish in-flight work with a deadline
await Promise.race([
  drainConnections(30_000),
  sleep(30_000),
]);

// 3. Close clients (DB, Redis, queues)
await Promise.allSettled([db.close(), redis.quit()]);

// 4. Flush logs/metrics before exit
await logger.flush();
process.exit(0);

// Wire to SIGTERM (K8s) + SIGINT (local Ctrl-C).
// readinessProbe flips false BEFORE step 1 so the LB reroutes.`,
    },
  ],

  // ─── §15 Testing ──────────────────────────────────────────────────────────
  testing: [
    {
      lang: "javascript",
      caption: "node:test with dependency injection",
      code: `import test from "node:test";
import assert from "node:assert/strict";

test("POST /users validates email", async (t) => {
  // Arrange — inject fakes, no mocking library needed
  const users = { insert: async (u) => ({ ...u, id: 1 }) };
  const app = buildApp({ users, mailer: { send: t.mock.fn() } });

  // Act
  const res = await app.inject({ method: "POST", url: "/users", payload: { email: "nope" } });

  // Assert
  assert.equal(res.statusCode, 422);
  assert.equal(t.mock.calls.length, 0);        // mailer untouched
});`,
    },
    {
      lang: "javascript",
      caption: "Integration test against real infra (testcontainers)",
      code: `import { GenericContainer } from "testcontainers";

let pg;

test.before(async () => {
  pg = await new GenericContainer("postgres:18-alpine")
    .withEnvironment({ POSTGRES_PASSWORD: "test" })
    .withExposedPorts(5432)
    .start();
});

test.after(() => pg?.stop());

test("order flow persists", async () => {
  const db = await connect({
    host: pg.getHost(), port: pg.getMappedPort(5432),
  });
  await migrate(db);
  const svc = buildService({ db });
  const id = await svc.createOrder({ sku: "A1", qty: 2 });
  assert.ok((await svc.getOrder(id)).total === 2 * 10);
});
// Real engine, disposable per run — catches SQL/migration drift
// that sqlite-in-memory fakes never will.`,
    },
  ],

  // ─── §16 Performance ──────────────────────────────────────────────────────
  performance: [
    { fact: "0x / clinic.js flame-graph the event loop — find the sync blocker in minutes; --cpu-prof for built-in profiles.", tag: "profiling" },
    { fact: "keep-alive agents + connection pools: 2-5x throughput on I/O-heavy services; check your fetch dispatcher actually reuses sockets.", tag: "network" },
    { fact: "pino logs 2-10x faster than alternatives; async destinations keep the loop free under load.", tag: "logging" },
    { fact: "JSON is the default serialization tax: for hot internal RPC try structured binary (protobuf/MessagePack) only after measuring.", tag: "serialization" },
    { fact: "NODE_COMPILE_CACHE + V8 snapshot caching: 20-60% faster cold start for CLIs and serverless.", tag: "startup" },
    { fact: "Worker pools beat spin-up-per-task: reuse via piscina keeps transfer overhead amortized.", tag: "cpu" },
    { fact: "Cluster mode scales linearly for I/O up to core count; beyond that it's a load balancer problem.", tag: "scale" },
    { fact: "Heap snapshots on OOM: --heapsnapshot-signal=SIGUSR2 + analyze in Chrome DevTools; look for retained timers and growing Maps.", tag: "memory" },
    { fact: "Steam pipelines over buffer-and-process: constant ~50MB RSS vs O(payload) — the difference between surviving spikes and OOM.", tag: "memory" },
    { fact: "GC pauses grow with heap: cap --max-old-space-size to what the container actually has (default may exceed cgroup limits).", tag: "memory" },
    { fact: "Measure with autocannon + 0x under production-shaped data; microbenchmarks mislead in event-loop land.", tag: "load" },
    { fact: "Node 26's V8 14.6 continues tier-up JIT improvements — pin your runtime and re-benchmark on major bumps.", tag: "version" },
  ],

  // ─── §17 Ecosystem & tooling ──────────────────────────────────────────────
  ecosystem: [
    { tool: "Fastify", purpose: "High-performance framework with schema-optimized serialization; the API default over Express.", url: "https://fastify.dev/", category: "framework" },
    { tool: "NestJS", purpose: "Opinionated DI/decorator architecture for large teams with Java/C# habits.", url: "https://docs.nestjs.com/", category: "framework" },
    { tool: "Hono", purpose: "Ultra-light router that runs on Node/Bun/Deno/edge — portable handlers.", url: "https://hono.dev/", category: "framework" },
    { tool: "Express", purpose: "The legacy default — still everywhere, but new builds should pick Fastify/Hono.", url: "https://expressjs.com/", category: "framework" },
    { tool: "pino", purpose: "Fast structured JSON logging with transports.", url: "https://getpino.io/", category: "observability" },
    { tool: "undici", purpose: "The HTTP client behind fetch — agents, interceptors, mocking.", url: "https://undici.nodejs.org/", category: "network" },
    { tool: "Vitest", purpose: "Fast TS-native test runner; pairs with node:test for stdlib coverage.", url: "https://vitest.dev/", category: "test" },
    { tool: "testcontainers-node", purpose: "Real Postgres/Redis/Kafka per test run via Docker.", url: "https://node.testcontainers.org/", category: "test" },
    { tool: "tsx", purpose: "Zero-config TS execution for scripts and dev; esbuild under the hood.", url: "https://tsx.is/", category: "build" },
    { tool: "Biome", purpose: "Rust-based lint+format in one binary — faster than ESLint+Prettier.", url: "https://biomejs.dev/", category: "lint" },
    { tool: "0x / clinic.js", purpose: "Flame graphs and event-loop diagnosis in production.", url: "https://clinicjs.org/", category: "debug" },
    { tool: "PM2", purpose: "Process manager (cluster, reload, logs) for non-K8s deploys.", url: "https://pm2.keymetrics.io/", category: "deploy" },
    { tool: "BullMQ", purpose: "Redis-backed job queues — durable async work outside the request path.", url: "https://bullmq.io/", category: "build" },
    { tool: "Socket.IO / ws", purpose: "WebSocket layers: ws for raw, Socket.IO for fallback/rooms semantics.", url: "https://github.com/websockets/ws", category: "network" },
  ],

  // ─── §18 Version history ──────────────────────────────────────────────────
  versionHistory: [
    { version: "0.1", year: 2009, highlight: "Ryan Dahl debuts Node at JSConf EU: V8 + libuv (then evcom), event-driven servers without threads." },
    { version: "0.10", year: 2013, highlight: "streams2 API — backpressure-correct streams; Node explodes via npm." },
    { version: "4 / io.js reunion", year: 2015, highlight: "io.js fork (io.js 1-3) merges back as Node 4; Node.js Foundation formed; LTS cycle begins." },
    { version: "8", year: 2017, highlight: "V8 5.8 with TurboFan — 2x; util.promisify; N-API stabilizes native addons." },
    { version: "10", year: 2018, highlight: "Stable N-API, fs promises, HTTP/2 stable, --experimental-worker (threads land)." },
    { version: "12", year: 2019, highlight: "Worker threads stable, private class fields, V8 7.4 with TLS 1.3 default." },
    { version: "14", year: 2020, highlight: "Optional chaining / nullish coalescing, diagnostic reports, top-level await behind flag (15 stable)." },
    { version: "18", year: 2022, highlight: "Global fetch + WebStreams + Blob (undici in core) — Node converges on the web platform; watch mode." },
    { version: "20", year: 2023, highlight: "Permission model preview, stable test runner, V8 11.3, single-executable apps push." },
    { version: "22 'Jod'", year: 2024, highlight: "require(esm) sync interop, --experimental-compile-cache, WebSocket client global, V8 12.4." },
    { version: "24 'Krypton'", year: 2025, highlight: "URLPattern global, permission model maturity, npm registry token automation, V8 13.x." },
    { version: "26 'Lithium'", year: 2026, highlight: "Temporal enabled by default, V8 14.6 (Map.getOrInsert, Iterator.concat), Undici 8, legacy _stream_* removed. Active LTS Oct 2026." },
  ],

  // ─── §19 Interview hot questions ──────────────────────────────────────────
  interview: [
    { q: "Explain the event loop and its phases.", a: "One JS thread cycles through phases: timers (setTimeout/interval callbacks) → pending callbacks (deferred OS errors) → poll (retrieves I/O events, blocks when idle) → check (setImmediate) → close (destroyed handles). Between each phase and each macrotask, two queues drain: process.nextTick first, then promise microtasks. Ordering answers: setImmediate vs setTimeout(0) is phase-dependent; nextTick runs before microtasks and can starve the loop if abused.", difficulty: "medium" },
    { q: "How does Node achieve concurrency with a single thread?", a: "Concurrency ≠ parallelism. The thread never blocks on I/O: syscalls go to libuv, which uses OS async APIs (epoll/kqueue/IOCP) plus a small thread pool (default 4) for operations without async kernel support (dns lookup, file I/O on some platforms, crypto.pbkdf2). Completions land on the loop queue as callbacks. Parallel CPU work requires worker_threads (separate V8 isolates, message passing) or processes.", difficulty: "medium" },
    { q: "What breaks if you JSON.parse a 100MB payload on the server?", a: "JSON.parse is synchronous — the main thread is blocked for the full parse (hundreds of ms to seconds). Every concurrent request, timer, and health check freezes; p99 explodes. Fixes: enforce body size limits at the proxy/framework, stream-parse with a incremental parser, or offload to a worker. Same reasoning applies to crypto, regex on untrusted input, and sync fs calls.", difficulty: "easy" },
    { q: "worker_threads vs child_process vs cluster — when each?", a: "worker_threads: shared process, isolated V8 contexts, cheap messaging, SharedArrayBuffer for hot data — right for CPU-bound helpers. child_process: full isolation, different runtimes OK, higher spawn cost — shells, ffmpeg, crash isolation. cluster: N processes sharing a port with built-in LB — vertical scale for HTTP servers. Default order for 'make my API faster under CPU load': first fix the algorithm, then workers, then cluster/replicas.", difficulty: "medium" },
    { q: "How would you handle a memory leak in production?", a: "Confirm with process.memoryUsage() trend + container RSS graphs. Take heap snapshots over time (--heapsnapshot-signal=SIGUSR2 or inspector), diff retainers in Chrome DevTools — look for growing Maps/arrays, retained closures (timers, listeners), un-ended responses. Common causes: max-listener EventEmitter accumulation, unclosed sockets on upstreams without agents, global caches without eviction. Fix, deploy, watch the slope.", difficulty: "hard" },
    { q: "Streams: why does backpressure matter?", a: "A fast reader feeding a slow writer must slow down, or data buffers in memory until OOM. Node streams implement this natively: pipe()/pipeline() pause the readable when the writable's buffer is full and resume on drain. The failure mode is collecting results in arrays instead of streaming (res.write without checking return, await-everything-in-a-loop patterns). pipeline() adds error propagation and cleanup that manual pipe() forgets.", difficulty: "medium" },
    { q: "CommonJS vs ESM — what actually differs at runtime?", a: "CJS loads synchronously with require() caching by resolved path; module.exports is a value snapshot — circular imports get partial objects. ESM parses statically first (enables tree-shaking, top-level await), bindings are live, imports are async and hoisted; file extensions are mandatory. Interop matured: require(esm) works from Node 22+. Pick one mode per package (type field), avoid dual shipping, and use .cjs/.mjs extensions to disambiguate legacy files.", difficulty: "medium" },
    { q: "Design a graceful shutdown for a Node service on Kubernetes.", a: "SIGTERM handler: (1) flip readiness to failing so the LB stops routing; (2) server.close() — stop accepting; (3) drain in-flight requests and queue consumers with a deadline (30s typical, must be < terminationGracePeriod); (4) close DB/Redis clients; (5) flush logs/metrics; exit 0. Add force-exit watchdog for step 3 overruns. On startup: only mark ready after migrations/caches — crash-loop beats half-serving.", difficulty: "hard" },
    { q: "Why is a leaked timer or listener a leak if GC exists?", a: "GC frees objects without references. An active setInterval holds its callback closure forever; an EventEmitter keeps strong refs to every listener; a pending request holds the response object. The objects ARE referenced — by the runtime, not your code. That's why max-listeners warnings exist and shutdown paths must clear timers/detach handlers; also why FinalizationRegistry is a diagnostic, not a cleanup mechanism.", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ──────────────────────────────────────────────────────
  comparisons: [
    { vs: "Deno", whenThis: "Maximum ecosystem compatibility (npm is the product), mature native addons, battle-tested LTS cadence for long-lived services.", whenThat: "Secure-by-default permissions, first-class TS/Web APIs, single-binary deploys; smaller module ecosystem (though npm compat narrowed the gap). Current: Deno 2.9." },
    { vs: "Bun", whenThis: "Conservative production posture, V8 stability, the reference runtime for CI/hosts.", whenThat: "All-in-one speed (install/test/run) and built-in SQLite/postgres clients; younger runtime with a smaller compat surface. Current: 1.4.4 with bun fmt and faster installs." },
    { vs: "Go (for APIs)", whenThis: "Shared TS code across front/back, npm ecosystem, fast iteration, serverless where cold start tooling matters.", whenThat: "CPU-tight microservices, predictable memory footprints, single-binary ops without runtime GC tuning." },
    { vs: "Python (FastAPI)", whenThis: "Realtime/websocket-heavy services, shared types with the frontend (tRPC), heavy JS tooling.", whenThat: "ML/data inference services colocated with Python-first model ecosystems." },
    { vs: "JVM (Spring)", whenThis: "Startup-sensitive deployments (serverless, scale-to-zero), JS-fullstack teams.", whenThat: "Massive stateful enterprise systems with mature GC tuning, decades of middleware, and heavy static-typing culture." },
  ],
};

export default sheet;
