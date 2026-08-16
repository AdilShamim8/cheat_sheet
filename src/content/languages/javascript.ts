import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "javascript",
  name: "JavaScript",
  category: "languages",
  tier: 1,
  tags: ["dynamic", "interpreted", "web", "async", "event-loop", "frontend", "backend"],
  tagline: "The only native language of the browser — runs the web front-end and, via Node.js, a vast slice of back-ends and tooling.",
  year: 1995,
  author: "Brendan Eich",

  tldr: [
    "JavaScript is a single-threaded, dynamically-typed, garbage-collected language with first-class functions and prototype-based object orientation, originally built in ten days to make web pages interactive.",
    "It is the only programming language natively executed by web browsers, and via Node.js/Bun/Deno it is now a dominant choice for back-end services, CLIs, build tooling, and edge runtimes.",
    "Reach for JavaScript when you write anything that runs in a browser, when you want one language across the whole stack, or when you are scripting against the npm ecosystem (the largest package registry in existence).",
    "Avoid JavaScript for CPU-bound numerics (typed arrays + WebAssembly are better), hard-realtime systems, and code where compile-time type safety is non-negotiable — use TypeScript or a wasm-targeting language instead.",
  ],

  mentalModel: {
    title: "A single-threaded event loop over a prototype graph",
    body: "Every JavaScript runtime has one call stack and one heap; asynchronous work (timers, I/O, promises) is queued onto task and microtask queues that the event loop drains only when the stack is empty. There are no thread-level data races — but a single slow synchronous function blocks everything. Objects are maps of string→value with an internal [[Prototype]] link; `class` is sugar over constructor functions and Object.create. `this` is not lexical — it is determined by the call site (arrow functions are the exception: they capture `this` from their enclosing scope). Internalize these three facts and 80% of JS behavior follows: callbacks queue rather than block, prototypes resolve property lookups up the chain, and `this` is call-site bound.",
  },

  constructs: [
    { syntax: "const f = (a, b = 1) => a + b", behavior: "Arrow function — no own `this`/`arguments`, cannot be `new`'d.", when: "Callbacks, short pure transforms; never as object methods that need rebinding `this`." },
    { syntax: "const { a, b: renamed = 0 } = obj", behavior: "Destructuring with rename and default.", when: "Pulling named fields out of options objects and props." },
    { syntax: "async function f() { return await p }", behavior: "Async function always returns a Promise; `await` suspends without blocking the event loop.", when: "Any I/O — fetch, fs, DB calls. Never mix with .then chains." },
    { syntax: "class C extends B { #x = 0; get x(){return this.#x} }", behavior: "Class with private field and getter; `#` is runtime-enforced privacy.", when: "Encapsulating object state; replaces the closure-per-instance pattern." },
    { syntax: "try { ... } catch (e) { ... } finally { ... }", behavior: "Exception handling; `finally` runs even on return/throw.", when: "Resource cleanup when no RAII/using resource exists yet." },
    { syntax: "Promise.allSettled([p1, p2])", behavior: "Resolves after all promises settle; never rejects.", when: "Fan-out I/O where partial failure is acceptable." },
    { syntax: "const m = new Map([['k', 1]])", behavior: "Insertion-ordered keyed collection accepting any key type.", when: "Caches, registries — never use a plain object as a map (prototype keys collide)." },
    { syntax: "for await (const x of stream) { ... }", behavior: "Async iteration over an AsyncIterable.", when: "Streaming NDJSON, paginated APIs, readable streams." },
    { syntax: "const sym = Symbol('id')", behavior: "Globally unique, non-enumerable object key.", when: "Metadata on objects you don't own; brand-checking classes." },
    { syntax: "const tag = (s, ...v) => ...", behavior: "Tagged template literal — function receives raw string parts and interpolations.", when: "DSLs: styled-components, html``/sql`` safe interpolation." },
    { syntax: "using handle = acquire()", behavior: "`using` declaration (TC39 Stage 3) calls Symbol.dispose at scope exit.", when: "Deterministic cleanup of file handles, connections, locks." },
  ],

  patterns: [
    {
      lang: "javascript",
      caption: "Modern async error handling — Result type via discriminated unions",
      code: `const Ok = (value) => ({ ok: true, value });
const Err = (error) => ({ ok: false, error });

async function fetchUser(id) {
  try {
    const r = await fetch(\`/api/users/\${id}\`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return Err(\`HTTP \${r.status}\`);
    return Ok(await r.json());
  } catch (e) {
    return Err(e instanceof Error ? e.message : String(e));
  }
}

// Caller is forced to handle both branches
const result = await fetchUser(42);
if (!result.ok) return respond(500, { error: result.error });
return respond(200, { user: result.value });`,
    },
    {
      lang: "javascript",
      caption: "P-limit concurrency — bound parallelism without a dependency",
      code: `async function pMap(items, mapper, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// 8 concurrent fetches, output preserves input order
const urls = [...];
const bodies = await pMap(urls, (u) => fetch(u).then((r) => r.text()), 8);`,
    },
    {
      lang: "javascript",
      caption: "AbortController — cooperative cancellation for fetch + timers",
      code: `function withTimeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

async function loadWithCutoff(url, ms) {
  const { signal, cancel } = withTimeout(ms);
  try {
    const r = await fetch(url, { signal });
    return await r.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error(\`timed out after \${ms}ms\`);
    throw e;
  } finally {
    cancel(); // release the timer even on success
  }
}`,
    },
    {
      lang: "javascript",
      caption: "Revealing module + private fields — encapsulation without closures",
      code: `class Counter {
  #count = 0;
  #listeners = new Set();

  constructor(initial = 0) { this.#count = initial; }

  increment(by = 1) {
    this.#count += by;
    this.#emit();
    return this.#count;
  }

  #emit() {
    for (const fn of this.#listeners) fn(this.#count);
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn); // disposer
  }
}`,
    },
  ],

  pitfalls: [
    {
      title: "`this` is rebound at the call site",
      symptom: "A method passed as a callback (`btn.onclick = obj.method`) loses its receiver — `this` becomes `undefined` (strict mode) or the global object.",
      fix: "Use arrow functions for callbacks, `.bind(this)` for stored method references, or `obj.method.bind(obj)` explicitly. Class fields `method = () => {...}` bind at construction.",
    },
    {
      title: "== does type coercion; NaN !== NaN",
      symptom: "`0 == '' == false` are all equal under `==`, and `NaN === NaN` is false — comparisons silently succeed or fail in surprising ways.",
      fix: "Always use `===` and `!==`. For NaN, use `Number.isNaN(x)`. Enable ESLint `eqeqeq` rule.",
    },
    {
      title: "Closures capture the loop variable by reference",
      symptom: "`for (var i=0; i<3; i++) setTimeout(()=>console.log(i), 0)` logs 3, 3, 3 — the closure sees the final value.",
      fix: "Use `let` (block-scoped, fresh binding per iteration) or wrap in an IIFE: `((i)=>...)(i)`.",
    },
    {
      title: "Floating point is IEEE-754 binary64",
      symptom: "`0.1 + 0.2 === 0.3` is false (returns 0.30000000000000004); money calculations silently drift.",
      fix: "Use integer cents (`Math.round(x*100)`) or a decimal library (decimal.js, dnd5e). Never store money as a float.",
    },
    {
      title: "await inside a forEach does not pause",
      symptom: "`items.forEach(async (x) => await fetch(x))` fires all requests in parallel and returns immediately — the parent function thinks it's done.",
      fix: "Use `for...of` for sequential await, or `Promise.all(items.map(...))` for parallel. Never `forEach` with async callbacks.",
    },
    {
      title: "Prototype pollution from unsafe merges",
      symptom: "`Object.assign({}, JSON.parse(input))` is fine, but recursive deep-mergers that assign onto `__proto__` let attackers inject methods into every object.",
      fix: "Use `Object.create(null)` for hash maps, block `__proto__`/`constructor` keys, or use Map. JSON.parse ignores `__proto__` since the spec but custom mergers often don't.",
    },
    {
      title: "Microtasks drain before macrotasks",
      symptom: "An infinite `Promise.resolve().then(loop)` starves the event loop — timers never fire, the UI hangs.",
      fix: "Yield with `await new Promise(r => setTimeout(r, 0))` periodically, or use `scheduler.yield()` (Chrome 129+). Microtasks have no built-in quota.",
    },
  ],

  quickReference: [
    { fact: "Numbers are IEEE-754 double — integers up to 2^53 are exact (Number.MAX_SAFE_INTEGER); use BigInt beyond that.", tag: "gotcha" },
    { fact: "Array.prototype.sort() default comparator coerces to string — `[10, 9, 1].sort()` gives [1, 10, 9]. Always pass a comparator.", tag: "gotcha" },
    { fact: "Modern engines (V8 12+) compile hot functions with TurboFan; warmup is ~10–1000 invocations. Microbenchmarks lie cold.", tag: "perf" },
    { fact: "Promise.all rejects on first rejection; Promise.allSettled waits for all; Promise.race takes first settle; Promise.any takes first fulfillment.", tag: "version" },
    { fact: "Top-level await is allowed in ESM modules since ES2022 — not in CommonJS.", tag: "version" },
    { fact: "`??` (nullish coalescing) only falls back on null/undefined; `||` falls back on all falsy (0, '', NaN) — they differ for numbers and strings.", tag: "gotcha" },
    { fact: "WeakRef + FinalizationRegistry exist but are non-deterministic — never rely on them for correctness, only for caches.", tag: "gotcha" },
    { fact: "Typed arrays (Uint8Array, Float64Array) are contiguous memory — use for binary protocols, WASM interop, and high-throughput numerics.", tag: "perf" },
    { fact: "Optional chaining `a?.b?.c` short-circuits to undefined; do not use it to swallow errors that should be caught.", tag: "style" },
    { fact: "ESM is the standard module format (Node 12+ supports it natively); CommonJS is legacy but interoperable via cjs-module-lexer.", tag: "version" },
    { fact: "AbortSignal.timeout(ms) is supported in Node 17.3+ and all modern browsers — replaces hand-rolled timer+abort patterns.", tag: "version" },
    { fact: "Object.keys returns only own enumerable string keys; for-in walks the prototype chain — use Object.keys for hash maps.", tag: "gotcha" },
    { fact: "structuredClone(obj) deep-copies plain data + Maps/Sets/ArrayBuffers since 2022 — replaces JSON.parse(JSON.stringify(x)) for most cases.", tag: "version" },
    { fact: "`new Array(n)` is holes-aware; `[...new Array(n)]` materializes — pick deliberately when preallocating.", tag: "perf" },
  ],

  goDeeper: [
    { title: "ECMAScript® 2024 Language Specification", url: "https://tc39.es/ecma262/", note: "The authoritative spec; the abstract operations explain coercion and prototype semantics." },
    { title: "MDN Web Docs — JavaScript Reference", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", note: "Best browser-side reference; covers API availability matrix per engine." },
    { title: "You Don't Know JS Yet (Kyle Simpson)", url: "https://github.com/getify/You-Dont-Know-JS", note: "Free, deep treatment of scope, closures, this, types, and async." },
    { title: "Node.js Official Documentation", url: "https://nodejs.org/docs/latest/api/", note: "Canonical reference for the non-browser runtime, streams, and the event loop in libuv." },
    { title: "TC39 Proposals Repository", url: "https://github.com/tc39/proposals", note: "Track language evolution; what is stage 3 today ships next year." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "number", behavior: "IEEE-754 binary64. Integers up to 2^53 are exact (Number.MAX_SAFE_INTEGER); beyond that, precision is lost.", when: "All numerics. Use BigInt for >2^53, decimal libs (decimal.js) for money." },
      { syntax: "bigint", behavior: "Arbitrary-precision integer — `123n`. Cannot implicitly mix with number; `+` is allowed, `/` truncates.", when: "Large IDs, crypto, exact integer math beyond 2^53." },
      { syntax: "string", behavior: "Immutable UTF-16 sequence. `.length` counts 16-bit code units, not code points or graphemes.", when: "All text. For Unicode-correct ops, use `[...str]` or `Intl.Segmenter`." },
      { syntax: "boolean", behavior: "true / false. Falsy values: false, 0, -0, 0n, '', null, undefined, NaN.", when: "Logic. Don't `!!x` inside `if (x)` — already coerced." },
      { syntax: "null", behavior: "Intentional absence — a literal, not a keyword. `typeof null === 'object'` (legacy bug).", when: "Explicit 'no value' sentinel. Coerces to 0 in numeric context — gotcha." },
      { syntax: "undefined", behavior: "Uninitialized variable, missing arg, missing property. Default return for functions.", when: "Engine-provided 'not set'. Prefer null for intentional absence." },
      { syntax: "symbol", behavior: "Globally unique, non-enumerable key. `Symbol('x')` is unique; `Symbol.for('x')` is registry-shared.", when: "Metadata on objects you don't own; brand-checking (`#private` is now preferred)." },
    ],
    collections: [
      { syntax: "Array<T>", behavior: "Dynamic sparse array. O(1) push/pop, O(n) shift/unshift. Holes are real (not undefined slots).", when: "Default ordered sequence. Preallocate with `new Array(n)` for known sizes." },
      { syntax: "Map<K, V>", behavior: "Insertion-ordered KV store, any key type (objects included). O(1) avg ops.", when: "Caches, registries. Never use a plain object as a map (prototype pollution)." },
      { syntax: "Set<T>", behavior: "Insertion-ordered unique values. O(1) add/has/delete.", when: "Dedup, membership. Spread into array for index access." },
      { syntax: "WeakMap<K, V>", behavior: "Keys must be objects; entries GC'd when key unreachable. Not iterable.", when: "Per-object metadata, memoization caches that don't leak." },
      { syntax: "WeakSet<T>", behavior: "Holds objects weakly; not iterable.", when: "Brand-checking, marking visited nodes without retention." },
      { syntax: "Object", behavior: "String/symbol-keyed map with [[Prototype]] link. `{}` literal gets Object.prototype.", when: "Records/DTOs. Use `Object.create(null)` for hash maps with arbitrary keys." },
      { syntax: "TypedArray (Uint8Array, Float64Array, ...)", behavior: "Contiguous fixed-length binary view over an ArrayBuffer.", when: "Binary protocols, WASM interop, WebGPU buffers, high-throughput numerics." },
      { syntax: "DataView", behavior: "Byte-order-aware view over ArrayBuffer — get/setInt32 with explicit endianness.", when: "Cross-platform binary file formats, network protocols." },
    ],
    custom: [
      { syntax: "class C extends B { #x = 0; m() {} }", behavior: "Syntactic sugar over constructor functions + prototypes. `#` private fields are runtime-enforced.", when: "Behavior-rich objects. Always prefer over closures for instance methods." },
      { syntax: "function f() {} / const f = () => {}", behavior: "First-class callable. `function` has own `this`/`arguments`; arrow captures lexical `this`.", when: "Callbacks (arrow), constructors (function). Never use `function` as a callback method." },
      { syntax: "Closure", behavior: "Function + captured variable bindings. Captured by reference, not value — classic loop gotcha pre-`let`.", when: "Encapsulation (factory pattern), partial application, memoization." },
      { syntax: "[Symbol.iterator]() { ... }", behavior: "Interface for `for...of`, spread, destructuring, `Array.from`.", when: "Custom iterables: linked lists, lazy sequences, paginated APIs." },
      { syntax: "Proxy(target, handler)", behavior: "Meta-object with traps for get/set/has/deleteProperty/defineProperty/etc.", when: "Reactive systems (Vue 3, MobX), validation, virtual object hierarchies." },
      { syntax: "function* gen() { yield x }", behavior: "Generator — lazy, pull-based iterator. Can be infinite.", when: "Streams, pipelines, lazy sequences. Use `for...of` to consume." },
      { syntax: "async function* agen() { yield await p }", behavior: "Async generator yielding awaited values in order.", when: "Streaming NDJSON, paginated fetches, ReadableStream pipelines." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b", behavior: "Addition OR string concat depending on operand types — `'1' + 2 === '12'`.", when: "Math. Explicitly coerce with Number() or String() to disambiguate." },
    { syntax: "a - b, a * b, a / b", behavior: "Arithmetic — always numeric, even on string operands (`'5' - 2 === 3`). Division always returns a float.", when: "Math. Use `Math.trunc` or `Math.floor` for integer division." },
    { syntax: "a % b", behavior: "Remainder — sign follows dividend. `-7 % 3 === -1`.", when: "Modular arithmetic. For floor mod use `((a % b) + b) % b`." },
    { syntax: "a ** b", behavior: "Exponentiation — `2 ** 10 === 1024`. Right-associative (`2 ** 3 ** 2 === 512`).", when: "Powers. Faster than Math.pow for literals." },
    { syntax: "a === b, a !== b", behavior: "Strict equality — no coercion. Different types are always unequal.", when: "ALWAYS use this in new code. `===` is the only safe equality." },
    { syntax: "a == b, a != b", behavior: "Loose equality — coerces operands. `0 == '' == false` are all equal. Footgun.", when: "Never use in new code. Enable ESLint `eqeqeq` rule." },
    { syntax: "a < b, a > b, a <= b, a >=", behavior: "Comparison — coerces to number; two strings compare lexically.", when: "Sorting. Use `localeCompare` for human-readable strings." },
    { syntax: "a && b, a || b", behavior: "Short-circuit — returns the operand, not a boolean. `a || default` is the default-value idiom.", when: "Default values, null-guards. Remember `0 || 'fallback'` returns 'fallback'." },
    { syntax: "a ?? b", behavior: "Nullish coalescing — only null/undefined trigger fallback, NOT 0 or ''.", when: "Defaults where 0/'' are valid: `count ?? 0`, `name ?? 'anonymous'`." },
    { syntax: "a?.b?.c, a?.(), a?.[i]", behavior: "Optional chaining — short-circuits to undefined if any link is nullish.", when: "Deep property access on API responses. Don't use to swallow real errors." },
    { syntax: "a ? b : c", behavior: "Ternary — only one branch evaluated. Right-associative.", when: "Concise conditional expression. Avoid nesting — use `if` or `switch`." },
    { syntax: "a & b, a | b, a ^ b, ~a", behavior: "Bitwise AND/OR/XOR/NOT — coerces to int32. Bigints have their own non-coercing ops.", when: "Bit flags, masks. Rare in app code; common in graphics/protocols." },
    { syntax: "a << n, a >> n, a >>> n", behavior: "Left / sign-extending right / zero-fill right shift.", when: "Low-level bit manipulation. `x >>> 0` converts to uint32." },
    { syntax: "...spread", behavior: "Spread — expands an iterable into individual elements.", when: "Array/object clones, variadic args. Allocates — avoid in hot paths." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "javascript",
      caption: "File I/O in Node — small reads vs streaming",
      code: `import { readFile, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

// Small file — read all at once
const text = await readFile("small.txt", "utf8");

// Large file — stream line by line, O(1) memory
const rl = createInterface({
  input: createReadStream("huge.log", "utf8"),
  crlfDelay: Infinity,
});
for await (const line of rl) {
  if (line.includes("ERROR")) console.error(line);
}

// Binary — open + read chunks with file handle
const fh = await open("data.bin");
try {
  const buf = Buffer.alloc(4096);
  const { bytesRead } = await fh.read(buf, 0, 4096, 0);
  console.log("read", bytesRead, "bytes");
} finally {
  await fh.close();
}`,
    },
    {
      lang: "javascript",
      caption: "stdin / stdout / stderr — CLI scripts and pipes",
      code: `import process from "node:process";

// Stream stdin to uppercased stdout (Unix-pipe friendly)
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  process.stdout.write(chunk.toUpperCase());
}

// JSON over stdin/stdout — common in CLI tools invoked from other langs
const payload = JSON.parse(await readAllStdin());
const result = transform(payload);
process.stdout.write(JSON.stringify(result));

// stderr — separate from stdout for piping / logging
process.stderr.write(\`pid=\${process.pid} ready\\n\`);`,
    },
    {
      lang: "javascript",
      caption: "JSON / structuredClone / TextEncoder — serialization tiers",
      code: `// JSON — text, portable, the default. Loses Date, Map, Set, undefined, BigInt.
const json = JSON.stringify({ ts: new Date() });   // ts becomes ISO string
const back = JSON.parse(json);                      // ts is a string, not Date

// structuredClone — deep copy with Map/Set/Date/ArrayBuffer/cycles (Node 17+, all browsers)
const cloned = structuredClone(complexObject);

// Reviver for JSON.parse — restore Date instances
const restored = JSON.parse(json, (k, v) =>
  k.endsWith("_at") && typeof v === "string" ? new Date(v) : v
);

// Binary — TextEncoder/Decoder for UTF-8 bytes
const bytes = new TextEncoder().encode("hello");
const text = new TextDecoder().decode(bytes);`,
    },
    {
      lang: "javascript",
      caption: "fetch with timeout, retries, and abort",
      code: `async function getJSON(url, { timeoutMs = 5000, retries = 3 } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
      return await r.json();
    } catch (e) {
      if (attempt === retries - 1) throw e;
      if (e.name === "AbortError") throw e; // don't retry timeouts forever
      await new Promise((r) => setTimeout(r, 2 ** attempt * 200));
    } finally {
      clearTimeout(t);
    }
  }
}`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "javascript",
      caption: "for...of, entries(), and Object.entries — idiomatic iteration",
      code: `const items = ["a", "b", "c"];

// Index + value — Array.prototype.entries (don't use 'for (let i...)' unless you need the index)
for (const [i, item] of items.entries()) {
  console.log(i, item);
}

// Object iteration — Object.entries/keys/values (insertion-ordered since ES2015)
const scores = { a: 10, b: 20 };
for (const [key, val] of Object.entries(scores)) {
  console.log(key, val);
}

// Map iterates as [key, value] natively
const m = new Map([["a", 1]]);
for (const [k, v] of m) console.log(k, v);`,
    },
    {
      lang: "javascript",
      caption: "Map/filter/reduce — the functional pipeline",
      code: `const users = [
  { id: 1, role: "admin", active: true },
  { id: 2, role: "member", active: false },
  { id: 3, role: "admin", active: true },
];

// Pipeline — lazy-looking but each step materializes a new array
const activeAdminIds = users
  .filter((u) => u.role === "admin")
  .map((u) => u.id)
  .sort((a, b) => a - b);

// Reduce — anything you can do with map+filter, you can do with reduce
const byRole = users.reduce((acc, u) => {
  (acc[u.role] ??= []).push(u);
  return acc;
}, {});

// Iterator helpers proposal (Stage 3) — lazy pipelines without intermediate arrays:
// users.values().filter(u => u.role === "admin").map(u => u.id).toArray();`,
    },
    {
      lang: "javascript",
      caption: "Generators — lazy, possibly infinite sequences",
      code: `function* naturals(start = 0) {
  while (true) yield start++;
}

function* map(iter, fn) {
  for (const x of iter) yield fn(x);
}

function* take(iter, n) {
  let i = 0;
  for (const x of iter) {
    if (i++ >= n) return;
    yield x;
  }
}

// First 10 squares — O(1) memory, no infinite loop
const squares = [...take(map(naturals(), (x) => x * x), 10)];

// for await...of works on async generators the same way`,
    },
    {
      lang: "javascript",
      caption: "Labeled break/continue and the rare `do...while`",
      code: `// Labeled loops — escape nested loops cleanly (avoid in app code; refactor instead)
outer: for (const row of grid) {
  for (const cell of row) {
    if (cell === "exit") break outer;
    if (cell === "skip") continue;
    process(cell);
  }
}

// do...while — runs the body at least once; rare but right for "prompt until valid"
let input;
do {
  input = await prompt("enter yes/no:");
} while (input !== "yes" && input !== "no");

// Array.every/some — short-circuit boolean loops
const allValid = items.every((x) => x.ok);
const anyInvalid = items.some((x) => !x.ok);`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "javascript",
      caption: "Destructured params with defaults — options-bag pattern",
      code: `// Options object pattern — extensible, all params named at call site
function fetchUser({ id, fields = ["name", "email"], signal, retries = 3 } = {}) {
  if (id == null) throw new TypeError("id is required");
  // ...
}

fetchUser({ id: 42, retries: 5 });

// Positional + rest + defaults — full ES2015+ signature
function log(level, ...parts) {
  console[level]("[app]", ...parts);
}`,
    },
    {
      lang: "javascript",
      caption: "Closures + IIFE + module pattern (pre-ESM, still common in libs)",
      code: `// IIFE — Immediately Invoked Function Expression: scopes privates
const counter = (() => {
  let count = 0;                  // private — captured by closure
  return {
    inc: () => ++count,
    get: () => count,
    reset: () => { count = 0; },
  };
})();

counter.inc(); counter.inc();
counter.get();  // 2

// Module pattern with revealing submodules
const api = (() => {
  const baseUrl = "https://api.x.com";
  async function get(path) { return fetch(\`\${baseUrl}\${path}\`); }
  return { get };   // expose only what's public
})();`,
    },
    {
      lang: "javascript",
      caption: "Curry / partial application / compose — functional utilities",
      code: `const curry = (fn) =>
  function curried(...args) {
    return args.length >= fn.length
      ? fn(...args)
      : (...next) => curried(...args, ...next);
  };

const add = curry((a, b, c) => a + b + c);
add(1)(2)(3);    // 6
add(1, 2)(3);    // 6

// compose — right-to-left, pipe — left-to-right
const compose = (...fs) => (x) => fs.reduceRight((acc, f) => f(acc), x);
const pipe = (...fs) => (x) => fs.reduce((acc, f) => f(acc), x);

const shout = pipe((s) => s.trim(), (s) => s.toUpperCase(), (s) => s + "!");
shout("  hello  ");  // "HELLO!"`,
    },
    {
      lang: "javascript",
      caption: "Async generators + for await — streaming pipelines",
      code: `// Stream paginated API as an async generator
async function* paginate(url) {
  let next = url;
  while (next) {
    const r = await fetch(next);
    if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
    const body = await r.json();
    yield* body.items;          // delegate each item
    next = body.next_cursor ? \`\${url}?cursor=\${body.next_cursor}\` : null;
  }
}

// Consume lazily — break early, no over-fetching
for await (const item of paginate("/api/items")) {
  if (item.id > 1000) break;
  process(item);
}`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "javascript",
      caption: "try / catch / finally — sync and async forms",
      code: `// try/catch is sync-only pre-ES2019; since ES2019 catch bindings are optional
try {
  const data = JSON.parse(input);
  return data;
} catch {
  // No binding needed if you don't use the error
  return null;
} finally {
  // Always runs — cleanup, even on return/throw
  cleanup();
}

// Top-level await + try/catch in ESM modules
try {
  const cfg = await loadConfig();
} catch (e) {
  console.error("startup failed:", e);
  process.exit(1);
}`,
    },
    {
      lang: "javascript",
      caption: "Custom error classes with cause chaining (ES2022)",
      code: `class AppError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message, { cause });      // ES2022: chain the original
    this.name = this.constructor.name;
    this.code = code;
  }
}

class NotFoundError extends AppError {}

async function loadUser(id) {
  try {
    const r = await fetch(\`/users/\${id}\`);
    if (r.status === 404) throw new NotFoundError("user missing", { code: "USER_404" });
    return await r.json();
  } catch (e) {
    // Wrap, preserving the original cause for debugging
    throw new AppError(\`failed to load \${id}\`, { cause: e, code: "LOAD_FAIL" });
  }
}

// Caller: e.cause walks the chain; console.error shows it automatically`,
    },
    {
      lang: "javascript",
      caption: "Result type via discriminated unions — errors as values",
      code: `const Ok = (value) => ({ ok: true, value });
const Err = (error) => ({ ok: false, error });

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return Err(\`HTTP \${r.status}\`);
    return Ok(await r.json());
  } catch (e) {
    return Err(e instanceof Error ? e.message : String(e));
  }
}

// Caller MUST check both branches — no unhandled rejection possible
const result = await fetchJson("/api/x");
if (!result.ok) return respond(500, { error: result.error });
return respond(200, result.value);

// Similar to neverthrow, fp-ts Either, Rust Result — pick the idiom your team agrees on.`,
    },
    {
      lang: "javascript",
      caption: "Global error handlers — last resort for uncaught errors",
      code: `// Node: unhandled promise rejections crash the process since Node 15
process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection:", reason);
  process.exit(1);
});

// Browser: window-level error capture (Sentry / Datadog hooks here)
window.addEventListener("unhandledrejection", (e) => {
  reportToTelemetry(e.reason);
});

// Always let the runtime exit on programmer errors — DON'T swallow them.
// Recoverable errors should be caught at their source, not at the global level.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "javascript",
      caption: "Promise.all / allSettled / race / any — the four combinators",
      code: `// Promise.all — rejects on first rejection; preserves order
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);

// allSettled — waits for all; never rejects; you inspect each
const results = await Promise.allSettled(urls.map((u) => fetch(u)));
const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason);

// race — first to settle (fulfilled OR rejected) wins; others keep running
// any — first to FULFILL wins; rejects if all reject (AggregateError)`,
    },
    {
      lang: "javascript",
      caption: "Bounded concurrency — pool pattern without a dependency",
      code: `async function pMap(items, mapper, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// Or use the battle-tested p-limit package — same idea, smaller surface area
const bodies = await pMap(urls, (u) => fetch(u).then((r) => r.text()), 8);`,
    },
    {
      lang: "javascript",
      caption: "Worker threads (Node) / Web Workers (browser) — true parallelism",
      code: `// Node worker_threads — for CPU-bound work; JSON-serializable messages
import { Worker } from "node:worker_threads";

function runWorker(file, data) {
  return new Promise((resolve, reject) => {
    const w = new Worker(file, { workerData: data });
    w.on("message", resolve);
    w.on("error", reject);
  });
}

const hashes = await Promise.all(
  chunks.map((c) => runWorker("./hash-worker.js", c))
);

// Browser equivalent: const w = new Worker("hash-worker.js");
// Workers have their own event loop — communicate via postMessage, no shared memory
// (SharedArrayBuffer + Atomics is the escape hatch for shared-state parallelism.)`,
    },
    {
      lang: "javascript",
      caption: "Event loop — microtasks vs macrotasks, and yielding",
      code: `// Microtasks (Promise.then, queueMicrotask) drain BEFORE the next macrotask
// Macrotasks (setTimeout, setInterval, I/O, postMessage) are scheduled by the runtime
console.log("1 sync");
setTimeout(() => console.log("4 timeout"));     // macrotask
Promise.resolve().then(() => console.log("3 microtask")); // microtask
console.log("2 sync");
// Output: 1, 2, 3, 4 — microtasks drain before setTimeout fires

// Infinite microtask recursion STARVES the event loop — timers never fire
// Yield with setTimeout(0) or scheduler.yield() (Chrome 129+) when you might loop long`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "javascript",
      caption: "Vitest / Jest — describe/it/expect + fixtures",
      code: `import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Cart", () => {
  let cart;
  beforeEach(() => { cart = new Cart(); });   // fresh per test

  it("adds items", () => {
    cart.add({ id: 1, price: 100 });
    expect(cart.total()).toBe(100);
  });

  it("handles empty cart", () => {
    expect(() => cart.checkout()).toThrow("empty");
  });

  // Snapshot — write once, regression-check forever (use sparingly)
  it("matches snapshot", () => {
    expect(cart.receipt()).toMatchInlineSnapshot();
  });
});`,
    },
    {
      lang: "javascript",
      caption: "Mocking — vi.fn, vi.spyOn, module mocks",
      code: `import { vi } from "vitest";
import { fetchUser } from "./users";
import * as db from "./db";

// Mock a whole module
vi.mock("./db", () => ({
  findById: vi.fn(async (id) => ({ id, name: "test" })),
}));

// Spy on an existing function — keeps original unless you mockReturnValue
const spy = vi.spyOn(db, "findById");
db.findById.mockResolvedValueOnce({ id: 99, name: "alice" });

await fetchUser(99);
expect(db.findById).toHaveBeenCalledWith(99);
expect(db.findById).toHaveBeenCalledTimes(1);

// Restore after the test
afterEach(() => vi.restoreAllMocks());`,
    },
    {
      lang: "javascript",
      caption: "Property-based testing with fast-check",
      code: `import { test, prop } from "fast-check";
import { sort } from "./sort";

// Hypothesis-style: framework generates edge cases you didn't think of
test.prop([fc.array(fc.integer())])(
  "sort is idempotent",
  (xs) => sort(sort(xs)).toString() === sort(xs).toString()
);

test.prop([fc.array(fc.integer())])(
  "sort preserves length",
  (xs) => sort(xs).length === xs.length
);

// Run: vitest -- --reporter=verbose
// Fast-check shrinks failing cases to the minimal reproducer.`,
    },
    {
      lang: "javascript",
      caption: "Coverage config + integration tests in vitest.config.ts",
      code: `// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",          // or "istanbul"
      reporter: ["text", "lcov"],
      exclude: ["**/*.config.*", "**/tests/**", "dist/**"],
      thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
    },
    environment: "node",       // or "jsdom" / "happy-dom" for browser APIs
    setupFiles: ["./tests/setup.ts"],
    pool: "threads",           // or "forks" for heavy CPU work
  },
});`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "V8 ignites (interpreter) → Sparkplug (baseline) → Maglev → TurboFan (optimizing); hot functions take ~1000 calls to tier up.", tag: "perf" },
    { fact: "Microbenchmarks in JS are useless without warmup + many iterations — use mitata, tinybench, or benchmark.js; never eyeball `Date.now()` deltas.", tag: "perf" },
    { fact: "Hidden classes: assigning properties in the same order across instances keeps V8's shape consistent; dynamic `delete` or out-of-order init deoptimizes.", tag: "gotcha" },
    { fact: "Array push is amortized O(1); `unshift` is O(n) — for front-inserts use a deque or reverse the array.", tag: "complexity" },
    { fact: "Object.create(null) is faster than `{}` for hash maps: no prototype chain to walk, but loses `hasOwnProperty` (use `Object.hasOwn`).", tag: "perf" },
    { fact: "Typed arrays are 5-50x faster than regular arrays for numeric workloads — they skip the boxing and stay cache-friendly.", tag: "perf" },
    { fact: "Closures capture variables, not values; in hot loops, copy to locals so V8 can keep them in registers.", tag: "perf" },
    { fact: "`await` in a tight loop serializes — `Promise.all(arr.map(asyncFn))` parallelizes I/O-bound work.", tag: "perf" },
    { fact: "JSON.parse is one of the fastest JSON parsers in any language (V8's). For huge payloads, consider JSONBig for BigInt or stream-json for memory.", tag: "perf" },
    { fact: "Garbage collection is generational; short-lived objects are nearly free, but megabyte-sized allocations trigger major GC pauses.", tag: "gotcha" },
    { fact: "`Array.from({ length: n }, (_, i) => f(i))` is 2x faster than `new Array(n).fill(0).map(...)` because it skips the fill.", tag: "perf" },
    { fact: "`String.indexOf` outperforms `RegExp.test` for literal substrings — regex compilation is real cost.", tag: "perf" },
    { fact: "Bytecode inlining caps at ~600 chars per function; giant functions are never inlined — split them.", tag: "gotcha" },
    { fact: "Node 22+ ships `--experimental-strip-types` and faster `fetch`; Bun and Deno are 2-5x faster on cold-start CLI workloads.", tag: "version" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Node.js", purpose: "The dominant JS runtime — built on V8 + libuv; the foundation of server-side JS.", url: "https://nodejs.org/", category: "build" },
    { tool: "Deno", purpose: "Secure-by-default runtime with native TS, web-standard APIs, and a curated stdlib.", url: "https://deno.com/", category: "build" },
    { tool: "Bun", purpose: "All-in-one runtime + bundler + test runner + package manager; 2-5x faster startup than Node.", url: "https://bun.sh/", category: "build" },
    { tool: "npm / pnpm / yarn", purpose: "Package managers. pnpm is fastest and disk-efficient (content-addressed store).", url: "https://pnpm.io/", category: "package" },
    { tool: "esbuild", purpose: "Go-based bundler — 100x faster than webpack/rollup for transpilation; the bundler in Vite.", url: "https://esbuild.github.io/", category: "build" },
    { tool: "Vite", purpose: "Frontend dev server + bundler; uses esbuild for dev, Rollup for prod.", url: "https://vitejs.dev/", category: "build" },
    { tool: "Rollup", purpose: "Library-focused bundler with tree-shaking; output is cleaner than webpack.", url: "https://rollupjs.org/", category: "build" },
    { tool: "webpack", purpose: "Incumbent bundler — huge plugin ecosystem, slower than esbuild/Rollup.", url: "https://webpack.js.org/", category: "build" },
    { tool: "ESLint", purpose: "Pluggable linter; flat config since v9. Pair with typescript-eslint for TS code.", url: "https://eslint.org/", category: "lint" },
    { tool: "Prettier", purpose: "Opinionated code formatter — no configuration, integrates with everything.", url: "https://prettier.io/", category: "lint" },
    { tool: "Biome", purpose: "Rust-based linter + formatter — replaces ESLint + Prettier in one binary, 10-100x faster.", url: "https://biomejs.dev/", category: "lint" },
    { tool: "Vitest", purpose: "Vite-native test runner — Jest-compatible API, ESM-first, watches faster.", url: "https://vitest.dev/", category: "test" },
    { tool: "Jest", purpose: "Incumbent test runner; still common in React codebases, ESM support is incomplete.", url: "https://jestjs.io/", category: "test" },
    { tool: "Playwright", purpose: "Cross-browser E2E testing — Microsoft's successor to Puppeteer.", url: "https://playwright.dev/", category: "test" },
    { tool: "fast-check", purpose: "Property-based testing for JS/TS — Hypothesis-style shrinking.", url: "https://fast-check.dev/", category: "test" },
    { tool: "Chrome DevTools / Node --inspect", purpose: "Debugger + profiler. The CPU profiler is the most accurate way to find hot functions.", url: "https://developer.chrome.com/docs/devtools/", category: "debug" },
    { tool: "clinic.js", purpose: "Node.js performance flamegraphs + bubble graphs; great for finding event-loop bottlenecks.", url: "https://clinicjs.org/", category: "debug" },
    { tool: "Docker", purpose: "Container packaging — the de-facto deploy artifact for Node services.", url: "https://www.docker.com/", category: "deploy" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "ES1",   year: 1997, highlight: "First standardized edition — based on Netscape's JavaScript 1.1." },
    { version: "ES3",   year: 1999, highlight: "Regular expressions, try/catch, switch — the baseline for over a decade." },
    { version: "ES5",   year: 2009, highlight: "Strict mode, JSON, getters/setters, Array methods (map/filter/reduce)." },
    { version: "ES2015 (ES6)", year: 2015, highlight: "let/const, classes, modules, arrows, Promises, generators, Map/Set, destructuring — the big jump." },
    { version: "ES2016", year: 2016, highlight: "** exponentiation, Array.includes." },
    { version: "ES2017", year: 2017, highlight: "async/await, Object.entries/values, SharedArrayBuffer." },
    { version: "ES2018", year: 2018, highlight: "Rest/spread for objects, async iteration, regex improvements." },
    { version: "ES2019", year: 2019, highlight: "Optional catch binding, Array.flat/flatMap, Object.fromEntries." },
    { version: "ES2020", year: 2020, highlight: "Optional chaining `?.`, nullish coalescing `??`, BigInt, dynamic import, Promise.allSettled." },
    { version: "ES2021", year: 2021, highlight: "Logical assignment `||=`/`&&=`/`??=`, WeakRef, Promise.any, String.replaceAll." },
    { version: "ES2022", year: 2022, highlight: "Top-level await, class fields (#private), Error.cause, Object.hasOwn, Array.at." },
    { version: "ES2023", year: 2023, highlight: "Array.findLast/findLastIndex, toSorted/toReversed (non-mutating), Hashbang grammar." },
    { version: "ES2024", year: 2024, highlight: "Promise.withResolvers, Object.groupBy, Map.groupBy, well-formed Unicode strings." },
    { version: "ES2025", year: 2025, highlight: "Iterator helpers (map/filter/take on iterators), Set methods (union/intersection), import attributes, RegExp.escape." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between `==` and `===`?", a: "`===` is strict — no type coercion, different types are always unequal. `==` coerces operands before comparing (`0 == '' == false` are all equal). Always use `===`; enable ESLint `eqeqeq` to enforce.", difficulty: "easy" },
    { q: "Explain the event loop.", a: "JS is single-threaded with a call stack + heap. Async ops (timers, I/O, promises) are queued; the event loop drains the microtask queue (Promise.then, queueMicrotask) completely before processing one macrotask (setTimeout, I/O callback). Microtasks can starve the loop — yield with setTimeout(0) or scheduler.yield() if needed.", difficulty: "medium" },
    { q: "What's the difference between `var`, `let`, and `const`?", a: "`var` is function-scoped and hoisted (initialized as undefined); `let`/`const` are block-scoped and in the temporal dead zone until declaration. `const` forbids reassignment (but objects/arrays are still mutable). Always use `const` by default, `let` when you must reassign, never `var`.", difficulty: "easy" },
    { q: "How do closures work, and what's the classic loop bug?", a: "A closure captures variable bindings by reference, not value. Pre-`let`, `for (var i = 0; i < 3; i++) setTimeout(() => console.log(i))` logs 3, 3, 3 because all closures share the same `i`. Fix: `let` (block-scoped, fresh binding per iteration) or an IIFE `((i) => ...)(i)`.", difficulty: "medium" },
    { q: "Explain `this` in JavaScript.", a: "`this` is determined by the call site, not the definition. (1) Default: `undefined` (strict) or global. (2) `obj.method()` → `obj`. (3) `.call/.apply/.bind` → the bound this. (4) `new Foo()` → the new instance. Arrow functions are the exception — they capture `this` lexically from the enclosing scope.", difficulty: "medium" },
    { q: "What's the difference between `Promise.all`, `allSettled`, `race`, and `any`?", a: "`Promise.all` rejects on first rejection (all-or-nothing). `allSettled` waits for all, never rejects (returns `{status, value/reason}[]`). `race` returns the first to settle (reject OR fulfill). `any` returns the first to FULFILL; rejects with AggregateError only if all reject.", difficulty: "medium" },
    { q: "How does prototypal inheritance work?", a: "Every object has an internal [[Prototype]] link (accessed via `Object.getPrototypeOf`). Property lookups walk the chain until found or null. `class extends` is sugar over `Object.setPrototypeOf` and `super`. Classes themselves are functions with a `prototype` object; instances inherit from `Class.prototype`.", difficulty: "medium" },
    { q: "Why does `0.1 + 0.2 !== 0.3`?", a: "Numbers are IEEE-754 binary64 doubles — 0.1 and 0.2 aren't exactly representable, so the sum is 0.30000000000000004. For money, use integer cents, decimal.js, or BigInt with a scale factor. `Number.EPSILON` is the minimum safe tolerance for comparisons.", difficulty: "medium" },
    { q: "Explain async/await vs raw Promises.", a: "async/await is syntactic sugar over Promises — `await` pauses the async function (returns to the event loop) until the Promise settles. It's equivalent to chaining `.then` but reads linearly. Error handling uses try/catch instead of `.catch`. Top-level await is allowed in ESM modules since ES2022.", difficulty: "easy" },
    { q: "How do you avoid callback hell / pyramid of doom?", a: "Three ways: (1) named functions instead of anonymous — each callback is a flat function. (2) async/await — linear flow with try/catch. (3) Promise chains with `.then` — flat but still promise-y. Modern code uses async/await exclusively; callbacks are only for event emitters and pre-Promise APIs.", difficulty: "easy" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "TypeScript", whenThis: "Quick prototypes, small scripts, browser-only code, anything where build step overhead isn't worth it.", whenThat: "Any codebase beyond a few files; SDKs; refactoring-heavy apps; team projects where the contract matters." },
    { vs: "Python", whenThis: "Browser code, full-stack JS, real-time web, anything that benefits from npm's ecosystem.", whenThat: "Data science / ML, scientific computing, scripting when NumPy/Pandas/PyTorch are the actual product." },
    { vs: "Go", whenThis: "Frontend, serverless functions, edge runtimes, anything that needs the npm ecosystem or async-heavy I/O.", whenThat: "High-throughput microservices, network daemons, single-binary CLI tools, ops infrastructure." },
    { vs: "Rust", whenThis: "Web apps, tooling, anything where dev iteration speed beats runtime speed.", whenThat: "Systems software, WebAssembly with predictable perf, latency-critical or memory-safety-sensitive code." },
    { vs: "Deno / Bun", whenThis: "Production services with mature ecosystem needs — Node has the largest library compatibility.", whenThat: "Modern all-in-one runtime, native TS, faster cold starts, fewer dependencies for new greenfield projects." },
  ],
};

export default sheet;
