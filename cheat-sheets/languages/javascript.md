# JavaScript

**Category:** Languages · **Tier:** Tier 1 · Core · **Tags:** dynamic, interpreted, web, async, event-loop, frontend, backend · **First released:** 1995 · **Author:** Brendan Eich · **Last updated:** 2026-11

> The only native language of the browser — runs the web front-end and, via Node.js, a vast slice of back-ends and tooling.

---

## TL;DR

- JavaScript is a single-threaded, dynamically-typed, garbage-collected language with first-class functions and prototype-based object orientation, originally built in ten days to make web pages interactive.
- It is the only programming language natively executed by web browsers, and via Node.js/Bun/Deno it is now a dominant choice for back-end services, CLIs, build tooling, and edge runtimes.
- Reach for JavaScript when you write anything that runs in a browser, when you want one language across the whole stack, or when you are scripting against the npm ecosystem (the largest package registry in existence).
- Avoid JavaScript for CPU-bound numerics (typed arrays + WebAssembly are better), hard-realtime systems, and code where compile-time type safety is non-negotiable — use TypeScript or a wasm-targeting language instead.

## Core Mental Model

**A single-threaded event loop over a prototype graph.** Every JavaScript runtime has one call stack and one heap; asynchronous work (timers, I/O, promises) is queued onto task and microtask queues that the event loop drains only when the stack is empty. There are no thread-level data races — but a single slow synchronous function blocks everything. Objects are maps of string→value with an internal [[Prototype]] link; `class` is sugar over constructor functions and Object.create. `this` is not lexical — it is determined by the call site (arrow functions are the exception: they capture `this` from their enclosing scope). Internalize these three facts and 80% of JS behavior follows: callbacks queue rather than block, prototypes resolve property lookups up the chain, and `this` is call-site bound.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| const f = (a, b = 1) => a + b | Arrow function — no own `this`/`arguments`, cannot be `new`'d. | Callbacks, short pure transforms; never as object methods that need rebinding `this`. |
| const { a, b: renamed = 0 } = obj | Destructuring with rename and default. | Pulling named fields out of options objects and props. |
| async function f() { return await p } | Async function always returns a Promise; `await` suspends without blocking the event loop. | Any I/O — fetch, fs, DB calls. Never mix with .then chains. |
| class C extends B { #x = 0; get x(){return this.#x} } | Class with private field and getter; `#` is runtime-enforced privacy. | Encapsulating object state; replaces the closure-per-instance pattern. |
| try { ... } catch (e) { ... } finally { ... } | Exception handling; `finally` runs even on return/throw. | Resource cleanup when no RAII/using resource exists yet. |
| Promise.allSettled([p1, p2]) | Resolves after all promises settle; never rejects. | Fan-out I/O where partial failure is acceptable. |
| const m = new Map([['k', 1]]) | Insertion-ordered keyed collection accepting any key type. | Caches, registries — never use a plain object as a map (prototype keys collide). |
| for await (const x of stream) { ... } | Async iteration over an AsyncIterable. | Streaming NDJSON, paginated APIs, readable streams. |
| const sym = Symbol('id') | Globally unique, non-enumerable object key. | Metadata on objects you don't own; brand-checking classes. |
| const tag = (s, ...v) => ... | Tagged template literal — function receives raw string parts and interpolations. | DSLs: styled-components, html``/sql`` safe interpolation. |
| using handle = acquire() | `using` declaration (TC39 Stage 3) calls Symbol.dispose at scope exit. | Deterministic cleanup of file handles, connections, locks. |

## Idiomatic Patterns

**Modern async error handling — Result type via discriminated unions**

```javascript
const Ok = (value) => ({ ok: true, value });
const Err = (error) => ({ ok: false, error });

async function fetchUser(id) {
  try {
    const r = await fetch(`/api/users/${id}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return Err(`HTTP ${r.status}`);
    return Ok(await r.json());
  } catch (e) {
    return Err(e instanceof Error ? e.message : String(e));
  }
}

// Caller is forced to handle both branches
const result = await fetchUser(42);
if (!result.ok) return respond(500, { error: result.error });
return respond(200, { user: result.value });
```

**P-limit concurrency — bound parallelism without a dependency**

```javascript
async function pMap(items, mapper, concurrency = 8) {
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
const bodies = await pMap(urls, (u) => fetch(u).then((r) => r.text()), 8);
```

**AbortController — cooperative cancellation for fetch + timers**

```javascript
function withTimeout(ms) {
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
    if (e.name === "AbortError") throw new Error(`timed out after ${ms}ms`);
    throw e;
  } finally {
    cancel(); // release the timer even on success
  }
}
```

**Revealing module + private fields — encapsulation without closures**

```javascript
class Counter {
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
}
```

## Common Pitfalls

1. **`this` is rebound at the call site** — *Symptom:* A method passed as a callback (`btn.onclick = obj.method`) loses its receiver — `this` becomes `undefined` (strict mode) or the global object. *Fix:* Use arrow functions for callbacks, `.bind(this)` for stored method references, or `obj.method.bind(obj)` explicitly. Class fields `method = () => {...}` bind at construction.
2. **== does type coercion; NaN !== NaN** — *Symptom:* `0 == '' == false` are all equal under `==`, and `NaN === NaN` is false — comparisons silently succeed or fail in surprising ways. *Fix:* Always use `===` and `!==`. For NaN, use `Number.isNaN(x)`. Enable ESLint `eqeqeq` rule.
3. **Closures capture the loop variable by reference** — *Symptom:* `for (var i=0; i<3; i++) setTimeout(()=>console.log(i), 0)` logs 3, 3, 3 — the closure sees the final value. *Fix:* Use `let` (block-scoped, fresh binding per iteration) or wrap in an IIFE: `((i)=>...)(i)`.
4. **Floating point is IEEE-754 binary64** — *Symptom:* `0.1 + 0.2 === 0.3` is false (returns 0.30000000000000004); money calculations silently drift. *Fix:* Use integer cents (`Math.round(x*100)`) or a decimal library (decimal.js, dnd5e). Never store money as a float.
5. **await inside a forEach does not pause** — *Symptom:* `items.forEach(async (x) => await fetch(x))` fires all requests in parallel and returns immediately — the parent function thinks it's done. *Fix:* Use `for...of` for sequential await, or `Promise.all(items.map(...))` for parallel. Never `forEach` with async callbacks.
6. **Prototype pollution from unsafe merges** — *Symptom:* `Object.assign({}, JSON.parse(input))` is fine, but recursive deep-mergers that assign onto `__proto__` let attackers inject methods into every object. *Fix:* Use `Object.create(null)` for hash maps, block `__proto__`/`constructor` keys, or use Map. JSON.parse ignores `__proto__` since the spec but custom mergers often don't.
7. **Microtasks drain before macrotasks** — *Symptom:* An infinite `Promise.resolve().then(loop)` starves the event loop — timers never fire, the UI hangs. *Fix:* Yield with `await new Promise(r => setTimeout(r, 0))` periodically, or use `scheduler.yield()` (Chrome 129+). Microtasks have no built-in quota.

## Production / Interview Quick Reference

- ES2026 (approved Jun 2026): Map.getOrInsert upsert, JSON.parse source-text access, iterator sequencing, Uint8Array↔base64/hex, Math.sumPrecise, Error.isError, Array.fromAsync. `version`
- Numbers are IEEE-754 double — integers up to 2^53 are exact (Number.MAX_SAFE_INTEGER); use BigInt beyond that. `gotcha`
- Array.prototype.sort() default comparator coerces to string — `[10, 9, 1].sort()` gives [1, 10, 9]. Always pass a comparator. `gotcha`
- Modern engines (V8 12+) compile hot functions with TurboFan; warmup is ~10–1000 invocations. Microbenchmarks lie cold. `perf`
- Promise.all rejects on first rejection; Promise.allSettled waits for all; Promise.race takes first settle; Promise.any takes first fulfillment. `version`
- Top-level await is allowed in ESM modules since ES2022 — not in CommonJS. `version`
- `??` (nullish coalescing) only falls back on null/undefined; `||` falls back on all falsy (0, '', NaN) — they differ for numbers and strings. `gotcha`
- WeakRef + FinalizationRegistry exist but are non-deterministic — never rely on them for correctness, only for caches. `gotcha`
- Typed arrays (Uint8Array, Float64Array) are contiguous memory — use for binary protocols, WASM interop, and high-throughput numerics. `perf`
- Optional chaining `a?.b?.c` short-circuits to undefined; do not use it to swallow errors that should be caught. `style`
- ESM is the standard module format (Node 12+ supports it natively); CommonJS is legacy but interoperable via cjs-module-lexer. `version`
- AbortSignal.timeout(ms) is supported in Node 17.3+ and all modern browsers — replaces hand-rolled timer+abort patterns. `version`
- Object.keys returns only own enumerable string keys; for-in walks the prototype chain — use Object.keys for hash maps. `gotcha`
- structuredClone(obj) deep-copies plain data + Maps/Sets/ArrayBuffers since 2022 — replaces JSON.parse(JSON.stringify(x)) for most cases. `version`
- `new Array(n)` is holes-aware; `[...new Array(n)]` materializes — pick deliberately when preallocating. `perf`

## Go Deeper

- [ECMAScript® 2024 Language Specification](https://tc39.es/ecma262/) — The authoritative spec; the abstract operations explain coercion and prototype semantics.
- [MDN Web Docs — JavaScript Reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript) — Best browser-side reference; covers API availability matrix per engine.
- [You Don't Know JS Yet (Kyle Simpson)](https://github.com/getify/You-Dont-Know-JS) — Free, deep treatment of scope, closures, this, types, and async.
- [Node.js Official Documentation](https://nodejs.org/docs/latest/api/) — Canonical reference for the non-browser runtime, streams, and the event loop in libuv.
- [TC39 Proposals Repository](https://github.com/tc39/proposals) — Track language evolution; what is stage 3 today ships next year.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| number | IEEE-754 binary64. Integers up to 2^53 are exact (Number.MAX_SAFE_INTEGER); beyond that, precision is lost. | All numerics. Use BigInt for >2^53, decimal libs (decimal.js) for money. |
| bigint | Arbitrary-precision integer — `123n`. Cannot implicitly mix with number; `+` is allowed, `/` truncates. | Large IDs, crypto, exact integer math beyond 2^53. |
| string | Immutable UTF-16 sequence. `.length` counts 16-bit code units, not code points or graphemes. | All text. For Unicode-correct ops, use `[...str]` or `Intl.Segmenter`. |
| boolean | true / false. Falsy values: false, 0, -0, 0n, '', null, undefined, NaN. | Logic. Don't `!!x` inside `if (x)` — already coerced. |
| null | Intentional absence — a literal, not a keyword. `typeof null === 'object'` (legacy bug). | Explicit 'no value' sentinel. Coerces to 0 in numeric context — gotcha. |
| undefined | Uninitialized variable, missing arg, missing property. Default return for functions. | Engine-provided 'not set'. Prefer null for intentional absence. |
| symbol | Globally unique, non-enumerable key. `Symbol('x')` is unique; `Symbol.for('x')` is registry-shared. | Metadata on objects you don't own; brand-checking (`#private` is now preferred). |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Array<T> | Dynamic sparse array. O(1) push/pop, O(n) shift/unshift. Holes are real (not undefined slots). | Default ordered sequence. Preallocate with `new Array(n)` for known sizes. |
| Map<K, V> | Insertion-ordered KV store, any key type (objects included). O(1) avg ops. | Caches, registries. Never use a plain object as a map (prototype pollution). |
| Set<T> | Insertion-ordered unique values. O(1) add/has/delete. | Dedup, membership. Spread into array for index access. |
| WeakMap<K, V> | Keys must be objects; entries GC'd when key unreachable. Not iterable. | Per-object metadata, memoization caches that don't leak. |
| WeakSet<T> | Holds objects weakly; not iterable. | Brand-checking, marking visited nodes without retention. |
| Object | String/symbol-keyed map with [[Prototype]] link. `{}` literal gets Object.prototype. | Records/DTOs. Use `Object.create(null)` for hash maps with arbitrary keys. |
| TypedArray (Uint8Array, Float64Array, ...) | Contiguous fixed-length binary view over an ArrayBuffer. | Binary protocols, WASM interop, WebGPU buffers, high-throughput numerics. |
| DataView | Byte-order-aware view over ArrayBuffer — get/setInt32 with explicit endianness. | Cross-platform binary file formats, network protocols. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class C extends B { #x = 0; m() {} } | Syntactic sugar over constructor functions + prototypes. `#` private fields are runtime-enforced. | Behavior-rich objects. Always prefer over closures for instance methods. |
| function f() {} / const f = () => {} | First-class callable. `function` has own `this`/`arguments`; arrow captures lexical `this`. | Callbacks (arrow), constructors (function). Never use `function` as a callback method. |
| Closure | Function + captured variable bindings. Captured by reference, not value — classic loop gotcha pre-`let`. | Encapsulation (factory pattern), partial application, memoization. |
| [Symbol.iterator]() { ... } | Interface for `for...of`, spread, destructuring, `Array.from`. | Custom iterables: linked lists, lazy sequences, paginated APIs. |
| Proxy(target, handler) | Meta-object with traps for get/set/has/deleteProperty/defineProperty/etc. | Reactive systems (Vue 3, MobX), validation, virtual object hierarchies. |
| function* gen() { yield x } | Generator — lazy, pull-based iterator. Can be infinite. | Streams, pipelines, lazy sequences. Use `for...of` to consume. |
| async function* agen() { yield await p } | Async generator yielding awaited values in order. | Streaming NDJSON, paginated fetches, ReadableStream pipelines. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b | Addition OR string concat depending on operand types — `'1' + 2 === '12'`. | Math. Explicitly coerce with Number() or String() to disambiguate. |
| a - b, a * b, a / b | Arithmetic — always numeric, even on string operands (`'5' - 2 === 3`). Division always returns a float. | Math. Use `Math.trunc` or `Math.floor` for integer division. |
| a % b | Remainder — sign follows dividend. `-7 % 3 === -1`. | Modular arithmetic. For floor mod use `((a % b) + b) % b`. |
| a ** b | Exponentiation — `2 ** 10 === 1024`. Right-associative (`2 ** 3 ** 2 === 512`). | Powers. Faster than Math.pow for literals. |
| a === b, a !== b | Strict equality — no coercion. Different types are always unequal. | ALWAYS use this in new code. `===` is the only safe equality. |
| a == b, a != b | Loose equality — coerces operands. `0 == '' == false` are all equal. Footgun. | Never use in new code. Enable ESLint `eqeqeq` rule. |
| a < b, a > b, a <= b, a >= | Comparison — coerces to number; two strings compare lexically. | Sorting. Use `localeCompare` for human-readable strings. |
| a && b, a \|\| b | Short-circuit — returns the operand, not a boolean. `a \|\| default` is the default-value idiom. | Default values, null-guards. Remember `0 \|\| 'fallback'` returns 'fallback'. |
| a ?? b | Nullish coalescing — only null/undefined trigger fallback, NOT 0 or ''. | Defaults where 0/'' are valid: `count ?? 0`, `name ?? 'anonymous'`. |
| a?.b?.c, a?.(), a?.[i] | Optional chaining — short-circuits to undefined if any link is nullish. | Deep property access on API responses. Don't use to swallow real errors. |
| a ? b : c | Ternary — only one branch evaluated. Right-associative. | Concise conditional expression. Avoid nesting — use `if` or `switch`. |
| a & b, a \| b, a ^ b, ~a | Bitwise AND/OR/XOR/NOT — coerces to int32. Bigints have their own non-coercing ops. | Bit flags, masks. Rare in app code; common in graphics/protocols. |
| a << n, a >> n, a >>> n | Left / sign-extending right / zero-fill right shift. | Low-level bit manipulation. `x >>> 0` converts to uint32. |
| ...spread | Spread — expands an iterable into individual elements. | Array/object clones, variadic args. Allocates — avoid in hot paths. |

## Input / Output

**File I/O in Node — small reads vs streaming**

```javascript
import { readFile, open } from "node:fs/promises";
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
}
```

**stdin / stdout / stderr — CLI scripts and pipes**

```javascript
import process from "node:process";

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
process.stderr.write(`pid=${process.pid} ready\n`);
```

**JSON / structuredClone / TextEncoder — serialization tiers**

```javascript
// JSON — text, portable, the default. Loses Date, Map, Set, undefined, BigInt.
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
const text = new TextDecoder().decode(bytes);
```

**fetch with timeout, retries, and abort**

```javascript
async function getJSON(url, { timeoutMs = 5000, retries = 3 } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt === retries - 1) throw e;
      if (e.name === "AbortError") throw e; // don't retry timeouts forever
      await new Promise((r) => setTimeout(r, 2 ** attempt * 200));
    } finally {
      clearTimeout(t);
    }
  }
}
```

## Loops & Iteration

**for...of, entries(), and Object.entries — idiomatic iteration**

```javascript
const items = ["a", "b", "c"];

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
for (const [k, v] of m) console.log(k, v);
```

**Map/filter/reduce — the functional pipeline**

```javascript
const users = [
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
// users.values().filter(u => u.role === "admin").map(u => u.id).toArray();
```

**Generators — lazy, possibly infinite sequences**

```javascript
function* naturals(start = 0) {
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

// for await...of works on async generators the same way
```

**Labeled break/continue and the rare `do...while`**

```javascript
// Labeled loops — escape nested loops cleanly (avoid in app code; refactor instead)
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
const anyInvalid = items.some((x) => !x.ok);
```

## Functions & Callables

**Destructured params with defaults — options-bag pattern**

```javascript
// Options object pattern — extensible, all params named at call site
function fetchUser({ id, fields = ["name", "email"], signal, retries = 3 } = {}) {
  if (id == null) throw new TypeError("id is required");
  // ...
}

fetchUser({ id: 42, retries: 5 });

// Positional + rest + defaults — full ES2015+ signature
function log(level, ...parts) {
  console[level]("[app]", ...parts);
}
```

**Closures + IIFE + module pattern (pre-ESM, still common in libs)**

```javascript
// IIFE — Immediately Invoked Function Expression: scopes privates
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
  async function get(path) { return fetch(`${baseUrl}${path}`); }
  return { get };   // expose only what's public
})();
```

**Curry / partial application / compose — functional utilities**

```javascript
const curry = (fn) =>
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
shout("  hello  ");  // "HELLO!"
```

**Async generators + for await — streaming pipelines**

```javascript
// Stream paginated API as an async generator
async function* paginate(url) {
  let next = url;
  while (next) {
    const r = await fetch(next);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    yield* body.items;          // delegate each item
    next = body.next_cursor ? `${url}?cursor=${body.next_cursor}` : null;
  }
}

// Consume lazily — break early, no over-fetching
for await (const item of paginate("/api/items")) {
  if (item.id > 1000) break;
  process(item);
}
```

## Error Handling

**try / catch / finally — sync and async forms**

```javascript
// try/catch is sync-only pre-ES2019; since ES2019 catch bindings are optional
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
}
```

**Custom error classes with cause chaining (ES2022)**

```javascript
class AppError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message, { cause });      // ES2022: chain the original
    this.name = this.constructor.name;
    this.code = code;
  }
}

class NotFoundError extends AppError {}

async function loadUser(id) {
  try {
    const r = await fetch(`/users/${id}`);
    if (r.status === 404) throw new NotFoundError("user missing", { code: "USER_404" });
    return await r.json();
  } catch (e) {
    // Wrap, preserving the original cause for debugging
    throw new AppError(`failed to load ${id}`, { cause: e, code: "LOAD_FAIL" });
  }
}

// Caller: e.cause walks the chain; console.error shows it automatically
```

**Result type via discriminated unions — errors as values**

```javascript
const Ok = (value) => ({ ok: true, value });
const Err = (error) => ({ ok: false, error });

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return Err(`HTTP ${r.status}`);
    return Ok(await r.json());
  } catch (e) {
    return Err(e instanceof Error ? e.message : String(e));
  }
}

// Caller MUST check both branches — no unhandled rejection possible
const result = await fetchJson("/api/x");
if (!result.ok) return respond(500, { error: result.error });
return respond(200, result.value);

// Similar to neverthrow, fp-ts Either, Rust Result — pick the idiom your team agrees on.
```

**Global error handlers — last resort for uncaught errors**

```javascript
// Node: unhandled promise rejections crash the process since Node 15
process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection:", reason);
  process.exit(1);
});

// Browser: window-level error capture (Sentry / Datadog hooks here)
window.addEventListener("unhandledrejection", (e) => {
  reportToTelemetry(e.reason);
});

// Always let the runtime exit on programmer errors — DON'T swallow them.
// Recoverable errors should be caught at their source, not at the global level.
```

## Concurrency Model

**Promise.all / allSettled / race / any — the four combinators**

```javascript
// Promise.all — rejects on first rejection; preserves order
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);

// allSettled — waits for all; never rejects; you inspect each
const results = await Promise.allSettled(urls.map((u) => fetch(u)));
const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason);

// race — first to settle (fulfilled OR rejected) wins; others keep running
// any — first to FULFILL wins; rejects if all reject (AggregateError)
```

**Bounded concurrency — pool pattern without a dependency**

```javascript
async function pMap(items, mapper, concurrency = 8) {
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
const bodies = await pMap(urls, (u) => fetch(u).then((r) => r.text()), 8);
```

**Worker threads (Node) / Web Workers (browser) — true parallelism**

```javascript
// Node worker_threads — for CPU-bound work; JSON-serializable messages
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
// (SharedArrayBuffer + Atomics is the escape hatch for shared-state parallelism.)
```

**Event loop — microtasks vs macrotasks, and yielding**

```javascript
// Microtasks (Promise.then, queueMicrotask) drain BEFORE the next macrotask
// Macrotasks (setTimeout, setInterval, I/O, postMessage) are scheduled by the runtime
console.log("1 sync");
setTimeout(() => console.log("4 timeout"));     // macrotask
Promise.resolve().then(() => console.log("3 microtask")); // microtask
console.log("2 sync");
// Output: 1, 2, 3, 4 — microtasks drain before setTimeout fires

// Infinite microtask recursion STARVES the event loop — timers never fire
// Yield with setTimeout(0) or scheduler.yield() (Chrome 129+) when you might loop long
```

## Testing Patterns

**Vitest / Jest — describe/it/expect + fixtures**

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";

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
});
```

**Mocking — vi.fn, vi.spyOn, module mocks**

```javascript
import { vi } from "vitest";
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
afterEach(() => vi.restoreAllMocks());
```

**Property-based testing with fast-check**

```javascript
import { test, prop } from "fast-check";
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
// Fast-check shrinks failing cases to the minimal reproducer.
```

**Coverage config + integration tests in vitest.config.ts**

```javascript
// vitest.config.ts
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
});
```

## Performance Tuning

- V8 ignites (interpreter) → Sparkplug (baseline) → Maglev → TurboFan (optimizing); hot functions take ~1000 calls to tier up.
- Microbenchmarks in JS are useless without warmup + many iterations — use mitata, tinybench, or benchmark.js; never eyeball `Date.now()` deltas.
- Hidden classes: assigning properties in the same order across instances keeps V8's shape consistent; dynamic `delete` or out-of-order init deoptimizes.
- Array push is amortized O(1); `unshift` is O(n) — for front-inserts use a deque or reverse the array.
- Object.create(null) is faster than `{}` for hash maps: no prototype chain to walk, but loses `hasOwnProperty` (use `Object.hasOwn`).
- Typed arrays are 5-50x faster than regular arrays for numeric workloads — they skip the boxing and stay cache-friendly.
- Closures capture variables, not values; in hot loops, copy to locals so V8 can keep them in registers.
- `await` in a tight loop serializes — `Promise.all(arr.map(asyncFn))` parallelizes I/O-bound work.
- JSON.parse is one of the fastest JSON parsers in any language (V8's). For huge payloads, consider JSONBig for BigInt or stream-json for memory.
- Garbage collection is generational; short-lived objects are nearly free, but megabyte-sized allocations trigger major GC pauses.
- `Array.from({ length: n }, (_, i) => f(i))` is 2x faster than `new Array(n).fill(0).map(...)` because it skips the fill.
- `String.indexOf` outperforms `RegExp.test` for literal substrings — regex compilation is real cost.
- Bytecode inlining caps at ~600 chars per function; giant functions are never inlined — split them.
- Node 22+ ships `--experimental-strip-types` and faster `fetch`; Bun and Deno are 2-5x faster on cold-start CLI workloads.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | The dominant JS runtime — built on V8 + libuv; the foundation of server-side JS. | build |
| [Deno](https://deno.com/) | Secure-by-default runtime with native TS, web-standard APIs, and a curated stdlib. | build |
| [Bun](https://bun.sh/) | All-in-one runtime + bundler + test runner + package manager; 2-5x faster startup than Node. | build |
| [npm / pnpm / yarn](https://pnpm.io/) | Package managers. pnpm is fastest and disk-efficient (content-addressed store). | package |
| [esbuild](https://esbuild.github.io/) | Go-based bundler — 100x faster than webpack/rollup for transpilation; the bundler in Vite. | build |
| [Vite](https://vitejs.dev/) | Frontend dev server + bundler; uses esbuild for dev, Rollup for prod. | build |
| [Rollup](https://rollupjs.org/) | Library-focused bundler with tree-shaking; output is cleaner than webpack. | build |
| [webpack](https://webpack.js.org/) | Incumbent bundler — huge plugin ecosystem, slower than esbuild/Rollup. | build |
| [ESLint](https://eslint.org/) | Pluggable linter; flat config since v9. Pair with typescript-eslint for TS code. | lint |
| [Prettier](https://prettier.io/) | Opinionated code formatter — no configuration, integrates with everything. | lint |
| [Biome](https://biomejs.dev/) | Rust-based linter + formatter — replaces ESLint + Prettier in one binary, 10-100x faster. | lint |
| [Vitest](https://vitest.dev/) | Vite-native test runner — Jest-compatible API, ESM-first, watches faster. | test |
| [Jest](https://jestjs.io/) | Incumbent test runner; still common in React codebases, ESM support is incomplete. | test |
| [Playwright](https://playwright.dev/) | Cross-browser E2E testing — Microsoft's successor to Puppeteer. | test |
| [fast-check](https://fast-check.dev/) | Property-based testing for JS/TS — Hypothesis-style shrinking. | test |
| [Chrome DevTools / Node --inspect](https://developer.chrome.com/docs/devtools/) | Debugger + profiler. The CPU profiler is the most accurate way to find hot functions. | debug |
| [clinic.js](https://clinicjs.org/) | Node.js performance flamegraphs + bubble graphs; great for finding event-loop bottlenecks. | debug |
| [Docker](https://www.docker.com/) | Container packaging — the de-facto deploy artifact for Node services. | deploy |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| ES1 | 1997 | First standardized edition — based on Netscape's JavaScript 1.1. |
| ES3 | 1999 | Regular expressions, try/catch, switch — the baseline for over a decade. |
| ES5 | 2009 | Strict mode, JSON, getters/setters, Array methods (map/filter/reduce). |
| ES2015 (ES6) | 2015 | let/const, classes, modules, arrows, Promises, generators, Map/Set, destructuring — the big jump. |
| ES2016 | 2016 | ** exponentiation, Array.includes. |
| ES2017 | 2017 | async/await, Object.entries/values, SharedArrayBuffer. |
| ES2018 | 2018 | Rest/spread for objects, async iteration, regex improvements. |
| ES2019 | 2019 | Optional catch binding, Array.flat/flatMap, Object.fromEntries. |
| ES2020 | 2020 | Optional chaining `?.`, nullish coalescing `??`, BigInt, dynamic import, Promise.allSettled. |
| ES2021 | 2021 | Logical assignment `\|\|=`/`&&=`/`??=`, WeakRef, Promise.any, String.replaceAll. |
| ES2022 | 2022 | Top-level await, class fields (#private), Error.cause, Object.hasOwn, Array.at. |
| ES2023 | 2023 | Array.findLast/findLastIndex, toSorted/toReversed (non-mutating), Hashbang grammar. |
| ES2024 | 2024 | Promise.withResolvers, Object.groupBy, Map.groupBy, well-formed Unicode strings. |
| ES2025 | 2025 | Iterator helpers (map/filter/take on iterators), Set methods (union/intersection), import attributes, RegExp.escape, Float16Array, RegExp modifiers, Promise.try. |
| ES2026 | 2026 | Approved Jun 2026: Upsert (Map.getOrInsert), JSON.parse source-text access, Iterator sequencing, Uint8Array↔base64/hex, Math.sumPrecise, Error.isError, Array.fromAsync. |

## Interview Hot Questions

1. **What's the difference between `==` and `===`?** *(easy)*

   `===` is strict — no type coercion, different types are always unequal. `==` coerces operands before comparing (`0 == '' == false` are all equal). Always use `===`; enable ESLint `eqeqeq` to enforce.

2. **Explain the event loop.** *(medium)*

   JS is single-threaded with a call stack + heap. Async ops (timers, I/O, promises) are queued; the event loop drains the microtask queue (Promise.then, queueMicrotask) completely before processing one macrotask (setTimeout, I/O callback). Microtasks can starve the loop — yield with setTimeout(0) or scheduler.yield() if needed.

3. **What's the difference between `var`, `let`, and `const`?** *(easy)*

   `var` is function-scoped and hoisted (initialized as undefined); `let`/`const` are block-scoped and in the temporal dead zone until declaration. `const` forbids reassignment (but objects/arrays are still mutable). Always use `const` by default, `let` when you must reassign, never `var`.

4. **How do closures work, and what's the classic loop bug?** *(medium)*

   A closure captures variable bindings by reference, not value. Pre-`let`, `for (var i = 0; i < 3; i++) setTimeout(() => console.log(i))` logs 3, 3, 3 because all closures share the same `i`. Fix: `let` (block-scoped, fresh binding per iteration) or an IIFE `((i) => ...)(i)`.

5. **Explain `this` in JavaScript.** *(medium)*

   `this` is determined by the call site, not the definition. (1) Default: `undefined` (strict) or global. (2) `obj.method()` → `obj`. (3) `.call/.apply/.bind` → the bound this. (4) `new Foo()` → the new instance. Arrow functions are the exception — they capture `this` lexically from the enclosing scope.

6. **What's the difference between `Promise.all`, `allSettled`, `race`, and `any`?** *(medium)*

   `Promise.all` rejects on first rejection (all-or-nothing). `allSettled` waits for all, never rejects (returns `{status, value/reason}[]`). `race` returns the first to settle (reject OR fulfill). `any` returns the first to FULFILL; rejects with AggregateError only if all reject.

7. **How does prototypal inheritance work?** *(medium)*

   Every object has an internal [[Prototype]] link (accessed via `Object.getPrototypeOf`). Property lookups walk the chain until found or null. `class extends` is sugar over `Object.setPrototypeOf` and `super`. Classes themselves are functions with a `prototype` object; instances inherit from `Class.prototype`.

8. **Why does `0.1 + 0.2 !== 0.3`?** *(medium)*

   Numbers are IEEE-754 binary64 doubles — 0.1 and 0.2 aren't exactly representable, so the sum is 0.30000000000000004. For money, use integer cents, decimal.js, or BigInt with a scale factor. `Number.EPSILON` is the minimum safe tolerance for comparisons.

9. **Explain async/await vs raw Promises.** *(easy)*

   async/await is syntactic sugar over Promises — `await` pauses the async function (returns to the event loop) until the Promise settles. It's equivalent to chaining `.then` but reads linearly. Error handling uses try/catch instead of `.catch`. Top-level await is allowed in ESM modules since ES2022.

10. **How do you avoid callback hell / pyramid of doom?** *(easy)*

   Three ways: (1) named functions instead of anonymous — each callback is a flat function. (2) async/await — linear flow with try/catch. (3) Promise chains with `.then` — flat but still promise-y. Modern code uses async/await exclusively; callbacks are only for event emitters and pre-Promise APIs.

## When to Choose This

- **vs TypeScript:** use this — Quick prototypes, small scripts, browser-only code, anything where build step overhead isn't worth it.; use that — Any codebase beyond a few files; SDKs; refactoring-heavy apps; team projects where the contract matters.
- **vs Python:** use this — Browser code, full-stack JS, real-time web, anything that benefits from npm's ecosystem.; use that — Data science / ML, scientific computing, scripting when NumPy/Pandas/PyTorch are the actual product.
- **vs Go:** use this — Frontend, serverless functions, edge runtimes, anything that needs the npm ecosystem or async-heavy I/O.; use that — High-throughput microservices, network daemons, single-binary CLI tools, ops infrastructure.
- **vs Rust:** use this — Web apps, tooling, anything where dev iteration speed beats runtime speed.; use that — Systems software, WebAssembly with predictable perf, latency-critical or memory-safety-sensitive code.
- **vs Deno / Bun:** use this — Production services with mature ecosystem needs — Node has the largest library compatibility.; use that — Modern all-in-one runtime, native TS, faster cold starts, fewer dependencies for new greenfield projects.

