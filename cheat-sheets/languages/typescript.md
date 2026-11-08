# TypeScript

**Category:** Languages · **Tier:** Tier 1 · Core · **Tags:** static-typing, structural, gradual, frontend, backend, javascript-superset · **First released:** 2012 · **Author:** Microsoft (Anders Hejlsberg) · **Last updated:** 2026-11

> A statically-typed superset of JavaScript that compiles to portable JS — the default for large web codebases.

---

## TL;DR

- TypeScript is a strict syntactic superset of JavaScript that adds optional static typing, generics, and rich type inference, then erases the types to emit idiomatic JavaScript.
- It dominates large front-end (React, Angular, Vue) and back-end (NestJS, tRPC, Hono) codebases because it catches whole classes of bugs at compile time while remaining a one-line install away from plain JS.
- Reach for TypeScript whenever a JavaScript codebase grows beyond a few files, when refactoring matters, or when you publish an SDK — types are the contract.
- Avoid TypeScript where the runtime you target doesn't speak JS (no point compiling to JS for embedded), and remember types are erased — runtime behavior is identical to JavaScript.

## Core Mental Model

**Structural types that vanish at runtime.** TypeScript uses structural (duck) typing: two types with the same shape are assignable, regardless of their names — there are no nominal tags unless you add a branded field. Types are a compile-time fiction: `tsc` removes them entirely, so what runs is plain JS. The single fact to internalize is that `type`/`interface`/generics exist only in your editor and CI — runtime code must still validate untrusted data with libraries like zod or valibot. This explains why `as` is a lie you tell the compiler, why `any` opts out of the whole game, and why a `Record<string, Foo>` is not the same thing as a Map at runtime.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| type Result<T,E> = { ok: true, value: T } \| { ok: false, error: E } | Discriminated union with generic payload — exhaustive `switch` on `ok` is checked. | Error handling without exceptions; API responses. |
| function f<T extends string>(x: T): `${T}-id` | Template literal types + constraint — `f("user")` returns the literal type `"user-id"`. | Type-safe route builders, event names, brand keys. |
| interface User { readonly id: number; name?: string } | Object shape contract; `?` for optional, `readonly` is shallow. | Public API surfaces; prefer `interface` for objects you extend later. |
| type Fib = [0, 1, 1, 2, 3, 5][N] | Tuple-indexed lookup type — the compiler resolves at compile time. | Tutorial-grade demo of the type system; rarely in production. |
| const x = 5 as const | Const assertion — `x` has literal type `5`, not `number`. | Locking tuple/object values into literal types for exhaustiveness. |
| type T = keyof typeof obj | Union of object keys as literal types. | Mirroring runtime config/enum objects into the type system. |
| type Readonly<T> = { readonly [K in keyof T]: T[K] } | Mapped type — applies a modifier to every key. | Building utility types; the stdlib `Readonly`/`Partial`/`Pick`/`Omit` are this. |
| function f(x: string): x is number { ... } | User-defined type guard — narrows the type at call sites. | Validating unknown JSON; the bridge between runtime checks and types. |
| abstract class C<T> { abstract parse(x: T): unknown } | Generic abstract class with abstract method. | Library base classes — though interfaces + composition often fit better. |
| declare module "x" { interface X { y: number } } | Module augmentation — merges into an existing module's types. | Extending Express Request, Jest matchers, library plugin systems. |
| satisfies Foo | Type-checks against `Foo` without widening — preserves literal types. | Config objects where you want both verification and the narrow type. |

## Idiomatic Patterns

**Branded types — nominal typing on top of structural TS**

```typescript
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

type UserId = Brand<string, "UserId">;
type Email = Brand<string, "Email">;

const userId = (s: string) => s as UserId;
const email = (s: string) => (s.includes("@") ? (s as Email) : null);

function send(to: Email, body: string) { /* ... */ }

// send(userId("u_1"), "hi")  // ✗ Type 'UserId' is not assignable to 'Email'
// send(email("a@b.io")!, "hi") // ✓
```

**Runtime parsing with zod — single source of truth for type + validator**

```typescript
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "member", "guest"]).default("member"),
  tags: z.array(z.string()).default([]),
});
type User = z.infer<typeof UserSchema>;

async function handler(req: Request): Promise<Response> {
  const json = await req.json();
  const parsed = UserSchema.safeParse(json); // never throws
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const user: User = parsed.data;
  return Response.json({ user });
}
```

**Exhaustive switch over a discriminated union**

```typescript
type Event =
  | { type: "click"; x: number; y: number }
  | { type: "scroll"; delta: number }
  | { type: "input"; value: string };

function handle(e: Event): void {
  switch (e.type) {
    case "click":  return console.log(`@${e.x},${e.y}`);
    case "scroll": return console.log(`Δ${e.delta}`);
    case "input":  return console.log(e.value);
    default:
      // Compile-time exhaustiveness check; fails to type-check
      // if any case is missing or a new variant is added.
      const _exhaustive: never = e;
      throw new Error(`unhandled: ${_exhaustive}`);
  }
}
```

**Conditional + mapped types — derive an API type from a route table**

```typescript
type Routes = {
  "GET /users": { query: { page?: number }; response: User[] };
  "POST /users": { body: { email: string }; response: User };
  "DELETE /users/:id": { params: { id: string }; response: void };
};

type RouteFor<K extends keyof Routes> = Routes[K];

function route<K extends keyof Routes>(
  path: K,
  init: Omit<RouteFor<K>, "response">,
): Promise<RouteFor<K>["response"]> {
  return fetch(path, init).then((r) => r.json()) as Promise<
    RouteFor<K>["response"]
  >;
}
```

## Common Pitfalls

1. **Types are erased — runtime is plain JS** — *Symptom:* `if (x instanceof MyInterface)` is a syntax error; `typeof x === 'MyType'` is always `'object'`. No type info survives compilation. *Fix:* Validate untrusted boundaries with zod/valibot/ajv. Use `in` checks or user-defined guards for narrowing at runtime.
2. **`as` is an unchecked assertion, not a cast** — *Symptom:* `const x = JSON.parse(res) as User` compiles — but `res` might be anything. The `as` makes the compiler trust you, hiding a real bug. *Fix:* Never `as` over an untrusted boundary. Use `unknown` + narrowing or a schema parser. Reserve `as` for narrowing a known-supertype.
3. **Structural typing surprises** — *Symptom:* An object with extra fields still satisfies a narrower type — `const u: User = { id: 1, name: 'a', evil: true }` works for direct assignment but is rejected as an object literal (excess property check). *Fix:* Excess property checks only fire on literals, not on variables. Use `Pick`/`satisfies` to be explicit, or branded types for nominal distinctions.
4. **`any` silently spreads** — *Symptom:* A function returning `any` makes anything downstream `any` — `JSON.parse` returns `any` in TS ≤4.x; one bad annotation can disable checking across a file. *Fix:* Enable `noImplicitAny` and `strict`. Annotate `JSON.parse(x) as unknown` then narrow. Use `unknown` instead of `any` when you must defer types.
5. **Enum pitfalls: numeric enums are untyped-ish** — *Symptom:* `enum E { A } const x: E = 3` compiles — any number assigns to a numeric enum. Reverse mapping exists for numeric enums only, breaking tree-shaking. *Fix:* Use string enums, `as const` objects, or union types. `const Direction = { Up: 'up', Down: 'down' } as const` is the modern idiom.
6. **Generic inference fails on empty containers** — *Symptom:* `const xs: number[] = []` works, but `useState()` infers `undefined` forever unless you give a type or initial value. *Fix:* Always provide an explicit type argument or an initializer: `useState<number[]>([])`, `useRef<HTMLInputElement>(null)`.
7. **Declaration files lie** — *Symptom:* An `@types/foo` mismatch or stale `.d.ts` makes the compiler accept code that fails at runtime — types say one thing, the actual library does another. *Fix:* Pin `@types/*` versions to the matching library minor. Prefer libraries that ship their own types. Treat type defs as a contract to test against.

## Production / Interview Quick Reference

- TypeScript 7.0.2 is current (npm latest) — Go-based compiler, ~10x faster, strict by default; 7.1 Beta (Oct 2026) adds the `es2026` target. `version`
- `strict: true` enables noImplicitAny, strictNullChecks, strictFunctionTypes, strictBindCallApply, strictPropertyInitialization, noImplicitThis, alwaysStrict, useUnknownInCatchVariables. `version`
- TypeScript 5.0 (2023) added `const` type parameters; 5.4 added NoInfer; 5.5 added inferred type predicates. `version`
- Compilation cost scales with project size and `any` count — `any` defeats memoization in the checker and can 10x incremental builds. `perf`
- `satisfies` (4.9+) checks a value against a type without widening it — use for config objects to keep literal types. `version`
- Tuple types are immutable-length by default; `[...T, ...U]` is variadic and supports spreads since 4.0. `version`
- Template literal types (`${K}-${string}`) enable type-safe string construction; pair with keyof for route/event maps. `style`
- `unknown` is the safe top type — must be narrowed before use; `any` opts out of checking entirely. `gotcha`
- Type-only imports (`import type { X }`) are erased at emit — required for some bundlers and ESM/CJS interop. `version`
- Discriminated unions with literal `type` fields give O(1) narrowing; non-discriminated unions degrade checker perf. `perf`
- Conditional types distribute over naked type parameters — `T extends U ? X : Y` on `T = A | B` yields `X_A | X_B`. `gotcha`
- `keyof` of an index signature is `string | number`; of a concrete object it's a literal union — different ergonomics. `gotcha`
- tsconfig `moduleResolution: bundler` (5.0+) is the modern default for app code; Node16/NodeNext for libraries. `version`
- Performance: `tsc --incremental` + project references cut rebuilds to seconds on 100k+ LOC monorepos. `perf`

## Go Deeper

- [TypeScript Handbook — Official Docs](https://www.typescriptlang.org/docs/handbook/intro.html) — The authoritative tutorial; the Type Manipulation section covers generics, mapped, conditional, and template literal types.
- [TypeScript Release Notes](https://devblogs.microsoft.com/typescript/) — Per-version changes are the fastest way to learn what idioms are now safe to use.
- [Type-level TypeScript](https://type-level-typescript.com/) — Free deep course on the type system as a programming language in its own right.
- [Effective TypeScript (Dan Vanderkam)](https://effectivetypescript.com/) — 62 concrete items; the canonical book on idiomatic, sound TS code.
- [Total TypeScript — Type Transformations](https://www.totaltypescript.com/) — Matt Pocock's deep dives on narrowing, generics, and the checker's mental model.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| string | Immutable UTF-16 sequence — same as JS. Literal types ('a' \| 'b') are a TS feature, not a runtime one. | All text. Use literal unions for closed sets of strings. |
| number | IEEE-754 binary64. Literal types (1 \| 2) collapse to number when widened. | All numerics. Use `as const` to preserve literal types. |
| boolean | true \| false. Literal types preserved with `as const`. | Flags. Branded boolean types prevent accidental cross-assignment. |
| bigint | Arbitrary-precision integer — `123n`. | Large IDs, crypto. No literal type support pre-4.8. |
| null | Singleton. With strictNullChecks, must be explicitly allowed in types. | Optional values. Use `T \| null`, not `T?` for explicit absence. |
| undefined | Singleton. Used for uninitialised values and optional fields. | Optional fields (x?: T means T \| undefined). |
| symbol | Unique value — `Symbol('x')`. `unique symbol` is the literal type. | Brand keys, well-known symbols. Rare in app code. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Array<T> / T[] | Dynamic array — runtime is JS Array. ReadonlyArray<T> / readonly T[] forbids mutation. | Default sequence. Use readonly for inputs you don't mutate. |
| ReadonlyArray<T> / readonly T[] | Immutable view of an array — no push/pop/splice on the type level. | Function params, public API. Pair with `as const` for literal arrays. |
| Tuple: [T, U, V] | Fixed-length array with per-index types. `readonly [T, U]` is immutable. | Pairs (KV), return types, structured bindings. Use labeled tuples `[a: T, b: U]`. |
| Map<K, V> / Set<T> | Same as JS at runtime; type-checked at compile time. | Keyed lookups. Use ReadonlyMap for inputs. |
| Record<K, V> | Object type with keys K and values V — equivalent to `{ [k: string]: V }` for string keys. | Hash maps. Prefer Map at runtime for non-string keys. |
| object | Any non-primitive value. Almost always too loose — prefer a concrete shape. | Rejecting primitives; otherwise avoid. |
| Readonly<T> / Partial<T> / Pick<T,K> / Omit<T,K> | Utility types — derived from T via mapped types. | Transforming shapes without re-declaring them. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| interface I { x: number } | Named object shape; supports declaration merging & extension. | Public API surfaces, object contracts you'll extend. |
| type T = { x: number } | Type alias — works for any type, not just objects; cannot merge. | Unions, intersections, utility types, tuples. Prefer for most app code. |
| type T = A \| B \| C | Discriminated union if members share a literal `type`/`kind` field — exhaustive switch checked. | Sum types, finite states, API responses. The TS answer to enums. |
| class C extends B { ... } | Same as JS class plus TS type annotations. Abstract methods, parameter properties, visibility modifiers. | OOP with runtime behavior. For pure data, prefer type/interface. |
| enum E { A, B } | Numeric (untyped-ish) or string enum. Numeric enums have reverse mapping. | Avoid numeric enums — use `as const` objects or union types instead. |
| const E = { A: 'a', B: 'b' } as const | Object literal with literal types preserved — modern enum replacement. | Closed value sets with both runtime and type-level access. |
| declare const __brand: unique symbol type Brand<T, B> = T & { readonly [__brand]: B } | Branded/flavor type — nominal typing on top of structural TS. | UserId vs Email (both strings) — prevents accidental cross-use. |
| abstract class C<T> { abstract m(x: T): unknown } | Generic abstract base — partial implementation, subtypes fill in. | Library base classes. Prefer interface + composition in new code. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b, a % b, a ** b | Same as JS — TS adds no behavior. Number literals can be narrowed via `as const`. | Math. TS catches type errors (`'a' + 1` is rejected) but doesn't change semantics. |
| a === b, a !== b, a == b, a != b | Equality — same JS semantics. TS rejects comparisons of unrelated types under strict mode. | Always use `===` / `!==`. TS narrows types after `=== null` / `=== undefined`. |
| a < b, a > b, a <= b, a >= | Comparison — TS allows only between comparable types under strict mode. | Sorting, ranges. Use `localeCompare` for human-readable strings. |
| a && b, a \|\| b | Short-circuit, returns operand. TS narrows the result type: `x \|\| default` removes nullish from x. | Default values, null-guards. The narrowing is the killer feature. |
| a ?? b | Nullish coalescing — TS narrows: `a ?? b` yields NonNullable<A> \| B. | Defaults where 0/'' are valid. StrictNullChecks turns ?? into a type-level guard. |
| a?.b?.c, a?.(), a?.[i] | Optional chaining — TS adds the type: `T \| undefined` if any link is optional. | Deep property access. Type narrows after a non-undefined check. |
| a ? b : c | Ternary — TS picks the type from each branch. `cond ? x : null` yields `T \| null`. | Conditional expressions. For type-level, use `T extends U ? X : Y`. |
| a as B | Type assertion — UNSAFE, the compiler trusts you. Allowed only between overlapping types. | Narrowing a supertype; never over an untrusted boundary. Use `unknown` first. |
| a satisfies B | Type-checks `a` against `B` WITHOUT widening — preserves the literal type of `a`. | Config objects, lookup tables where you want both validation and narrow types. |
| x is T | User-defined type guard — function return type that narrows `x` at call sites. | Validating unknown JSON, custom narrowing predicates. |
| keyof T | Type operator — union of keys of T as literal types. | Mirroring runtime config into types, building utility types. |
| typeof x | Type operator — the type of a value at compile time. Pair with `as const` for literal types. | Deriving types from constants; `typeof import('./mod')` for module types. |
| T extends U ? X : Y | Conditional type — distributes over naked type parameters. | Building utility types (Exclude, Extract, NonNullable are this). |
| infer T | Bind a type variable inside a conditional — extracts from a pattern. | Unwrapping Promises (`Awaited<T>`), function return types (`ReturnType<F>`). |

## Input / Output

**File I/O in Node — typed streams and async iterators**

```typescript
import { readFile, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

// Small file — typed return
const text: string = await readFile("cfg.json", "utf8");
const cfg: Config = JSON.parse(text) as Config; // UNSAFE — see zod block

// Large file — stream line by line with AsyncIterable
const rl = createInterface({ input: createReadStream("huge.log"), crlfDelay: Infinity });
const errors: string[] = [];
for await (const line of rl) {
  if (line.includes("ERROR")) errors.push(line);
}
```

**Parsing untrusted input with zod — single source of truth**

```typescript
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "member", "guest"]).default("member"),
  tags: z.array(z.string()).default([]),
});
type User = z.infer<typeof UserSchema>;       // type and validator share a source

// safeParse never throws — caller handles both branches
const result = UserSchema.safeParse(JSON.parse(text));
if (!result.success) {
  respond(400, { errors: result.error.flatten() });
  return;
}
const user: User = result.data;
```

**stdin / stdout in Deno / Bun — Web-standard streams**

```typescript
// Deno — uses web-standard ReadableStream/WritableStream
const stdinText = await new Response(Deno.stdin.readable).text();
const payload = JSON.parse(stdinText) as unknown;

// Bun — uses the same web Streams API
const text = await Bun.stdin.text();

// Node 18+ — web streams available via node:stream/web
const stream = new Response(process.stdin).body;
const reader = stream?.getReader();

// All three runtimes converge on the WHATWG Streams spec.
```

**Typed fetch wrapper — generic over the response shape**

```typescript
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T; // still untrusted — pair with zod for real safety
}

// Concrete call site — T is inferred from the type annotation
const user = await fetchJson<User>("/api/users/42");
```

## Loops & Iteration

**for...of with type narrowing — exhaustive over a union**

```typescript
type Event =
  | { type: "click"; x: number; y: number }
  | { type: "scroll"; delta: number }
  | { type: "input"; value: string };

function handle(events: Event[]) {
  for (const e of events) {
    // TS narrows e by the 'type' discriminant
    switch (e.type) {
      case "click":  console.log(e.x, e.y); break;
      case "scroll": console.log(e.delta); break;
      case "input":  console.log(e.value); break;
      default: const _: never = e; // exhaustiveness check
    }
  }
}
```

**Array methods — typed map/filter/reduce**

```typescript
interface User { id: number; role: "admin" | "member"; active: boolean }

const users: User[] = [...];

// Map — element type carried through
const ids: number[] = users.map((u) => u.id);

// Filter — predicate must be a type guard to narrow the result
const admins: User[] = users.filter((u): u is User => u.role === "admin");
// Without the type guard, the result is still User[] (no narrowing)

// Reduce — typed accumulator
const byId: Record<number, User> = users.reduce((acc, u) => {
  acc[u.id] = u; return acc;
}, {} as Record<number, User>);
```

**Generators with IterableIterator and yield types**

```typescript
function* naturals(start = 0): IterableIterator<number> {
  while (true) yield start++;
}

function* take<T>(iter: Iterable<T>, n: number): Generator<T> {
  let i = 0;
  for (const x of iter) {
    if (i++ >= n) return;
    yield x;
  }
}

// Type-checked: number[] because the generator yields number
const first10: number[] = [...take(naturals(), 10)];

// AsyncIterable<T> for async generators
async function* paginate<T>(url: string): AsyncIterable<T> { /* ... */ }
```

**Tuple destructuring with labeled types**

```typescript
// Labeled tuple elements — self-documenting
function kv(): [key: string, value: number] {
  return ["count", 42];
}
const [key, value] = kv();        // key: string, value: number

// for...of over a Map<K, V> yields [K, V]
const m = new Map<string, User>([["u1", { id: 1, role: "admin", active: true }]]);
for (const [k, v] of m) {
  console.log(k, v.role); // v is narrowed to User
}
```

## Functions & Callables

**Function signatures — overloads, generics, defaults**

```typescript
// Overloads — call signatures for distinct arg shapes; implementation is hidden
function fetch(id: number): Promise<User>;
function fetch(email: string): Promise<User>;
async function fetch(input: number | string): Promise<User> {
  const key = typeof input === "number" ? `id=${input}` : `email=${input}`;
  return fetchJson(`/users?${key}`);
}

// Generic with constraint
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return keys.reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {} as Pick<T, K>);
}
```

**Function types — call signatures, constructs, conditional types**

```typescript
// Call signature — type of a callable
type Fn<A, B> = (a: A) => B;
const strLen: Fn<string, number> = (s) => s.length;

// Construct signature — type of a class / newable
type Ctor<T> = new (...args: any[]) => T;
function make<T>(C: Ctor<T>): T { return new C(); }

// Parameters / ReturnType — extract from any function
type F = (x: number, y: string) => boolean;
type Args = Parameters<F>;     // [number, string]
type R = ReturnType<F>;        // boolean

// Awaited<T> unwraps a Promise — useful for async function return types
type AsyncR = Awaited<Promise<Promise<User>>>; // User
```

**Decorators (5.0+) — class, method, field, accessor**

```typescript
// TC39 decorators (TS 5.0+) — different from experimental legacy decorators
function logged<This, Args extends unknown[], R>(
  target: (this: This, ...args: Args) => R,
  ctx: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>
) {
  return function (this: This, ...args: Args): R {
    console.log(`calling ${String(ctx.name)}`);
    return target.call(this, ...args);
  };
}

class Service {
  @logged
  fetch(id: number) { return fetchJson(`/u/${id}`); }
}
```

**Higher-kinded patterns — type-level functions, memoization**

```typescript
// Memoize — preserves the function's parameter and return types
function memo<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const cache = new Map<string, R>();
  return (...args: A) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key)!;
  };
}

const slowFib = (n: number): number => n < 2 ? n : slowFib(n - 1) + slowFib(n - 2);
const fib = memo(slowFib);
console.log(fib(45)); // fast — O(n) thanks to memoization
```

## Error Handling

**Result type — discriminated union with exhaustive switch**

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

function parse(input: string): Result<number, "bad_input"> {
  const n = Number(input);
  return Number.isNaN(n) ? Err("bad_input" as const) : Ok(n);
}

const r = parse("42");
if (r.ok) {
  console.log(r.value); // TS knows r.value is number here
} else {
  console.log(r.error); // TS knows r.error is "bad_input"
}
```

**Typed errors via class hierarchy + instanceof narrowing**

```typescript
class AppError extends Error { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = this.constructor.name; } }
class NotFoundError extends AppError {}
class ValidationError extends AppError { constructor(m: string, readonly field: string) { super(m); } }

async function load(id: number): Promise<User> {
  const r = await fetch(`/users/${id}`);
  if (r.status === 404) throw new NotFoundError(`user ${id}`);
  if (!r.ok) throw new AppError(`HTTP ${r.status}`);
  return r.json() as Promise<User>;
}

try { await load(42); }
catch (e) {
  if (e instanceof NotFoundError) respond(404, { error: e.message });
  else if (e instanceof ValidationError) respond(400, { field: e.field });
  else throw e; // re-throw unknown
}
```

**unknown — the safe top type for caught errors**

```typescript
// useUnknownInCatchVariables (strict) makes catch bindings 'unknown', not 'any'
try {
  await risky();
} catch (e: unknown) {
  // Must narrow before use — no e.message access
  if (e instanceof Error) {
    console.error(e.message);
  } else if (typeof e === "string") {
    console.error(e);
  } else {
    console.error("unknown error:", e);
  }
}

// Wrap throws into Result with a helper
async function toResult<T>(p: Promise<T>): Promise<Result<T, Error>> {
  try { return Ok(await p); }
  catch (e) { return Err(e instanceof Error ? e : new Error(String(e))); }
}
```

**Discriminated errors at the boundary — never throw across modules**

```typescript
// Module A's API surface — every error is a tagged variant
type ApiError =
  | { kind: "not_found"; id: number }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "network"; cause: unknown };

export async function getUser(id: number): Promise<Result<User, ApiError>> {
  try {
    const r = await fetch(`/users/${id}`);
    if (r.status === 404) return Err({ kind: "not_found", id });
    if (r.status === 429) return Err({ kind: "rate_limited", retryAfter: Number(r.headers.get("retry-after") ?? 1) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Ok(await r.json() as User);
  } catch (cause) {
    return Err({ kind: "network", cause });
  }
}
```

## Concurrency Model

**async/await with typed errors and abort**

```typescript
async function fetchWithTimeout(url: string, ms = 5000): Promise<Result<Response, Error>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return { ok: true, value: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  } finally {
    clearTimeout(t);
  }
}

// Top-level await is allowed in ESM modules
const r = await fetchWithTimeout("https://api.example.com");
if (!r.ok) process.exit(1);
```

**Worker threads with typed message protocol**

```typescript
// Shared protocol between main and worker
type Req  = { id: number; chunk: Uint8Array };
type Resp = { id: number; hash: string } | { id: number; error: string };

// Main thread
function runWorker(chunk: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./hash-worker.ts", import.meta.url), { type: "module" });
    const req: Req = { id: 1, chunk };
    w.postMessage(req);
    w.on("message", (r: Resp) => {
      if ("hash" in r) resolve(r.hash); else reject(new Error(r.error));
      w.terminate();
    });
  });
}
```

**Async generators — typed streaming pipelines**

```typescript
async function* paginate<T>(url: string, schema: { parse: (x: unknown) => T }): AsyncIterable<T> {
  let cursor: string | null = null;
  while (true) {
    const r = await fetch(cursor ? `${url}?cursor=${cursor}` : url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json() as { items: unknown[]; next: string | null };
    for (const item of body.items) yield schema.parse(item); // typed
    if (!body.next) return;
    cursor = body.next;
  }
}

for await (const user of paginate("/api/users", { parse: (x) => x as User })) {
  console.log(user.id);
}
```

**Bounded concurrency — typed pMap**

```typescript
async function pMap<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency = 8
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// T is inferred from items; R from mapper return
const ids: number[] = await pMap(users, async (u) => u.id);
```

## Testing Patterns

**Vitest — typed mocks, fixtures, expectTypeOf**

```typescript
import { describe, it, expect, vi, expectTypeOf } from "vitest";

describe("Cart", () => {
  it("totals items", () => {
    const cart = new Cart();
    cart.add({ id: 1, price: 100 });
    expect(cart.total()).toBe(100);
  });

  it("type-checks the mock", () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    // TS enforces the call signature matches the real fetch
    fetchMock("https://x");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("type-level assertions", () => {
    expectTypeOf<ReturnType<typeof JSON.parse>>().toEqualTypeOf<unknown>();
  });
});
```

**Mocking with vi.mocked and module-level mocks**

```typescript
import { vi } from "vitest";
import * as db from "./db";
import { getUser } from "./users";

// Mock the entire module — return types must match the real module
vi.mock("./db", () => ({
  findById: vi.fn<(id: number) => Promise<User>>()
    .mockResolvedValue({ id: 1, role: "admin", active: true }),
}));

it("returns the user", async () => {
  const u = await getUser(1);
  expect(u.role).toBe("admin");

  // vi.mocked wraps with assertions
  expect(vi.mocked(db.findById)).toHaveBeenCalledWith(1);
});
```

**Property-based testing with fast-check + zod**

```typescript
import { test, fc } from "@fast-check/vitest";
import { z } from "zod";

const UserSchema = z.object({ id: z.number().int().positive(), email: z.string().email() });

test.prop([fc.record({ id: fc.integer({ min: 1, max: 1e6 }), email: fc.string({ minLength: 1 }) })])(
  "rejects non-email strings",
  (u) => {
    // Hypothesis-style — fast-check finds the failing case
    expect(() => UserSchema.parse({ ...u, email: u.email.replace("@", "") })).toThrow();
  }
);

// Run: vitest --reporter=verbose
// fast-check shrinks failures to the minimal reproducer.
```

**tsd — type-level assertions in tests**

```typescript
// types.test-d.ts — runs via tsd or vitest typecheck
import { expectType } from "tsd";
import { pick } from "./pick";

expectType<{ id: number }>(pick({ id: 1, name: "a" }, ["id"]));
// @ts-expect-error — must NOT compile (so this assertion passes)
pick({ id: 1 }, ["missing"]);

// In vitest:
import { assertType, describe, it } from "vitest";
describe("types", () => {
  it("pick returns the picked shape", () => {
    assertType<{ id: number }>(pick({ id: 1, name: "a" }, ["id"]));
  });
});
```

## Performance Tuning

- `tsc` is single-threaded; project references + incremental mode cut rebuilds from minutes to seconds on 100k+ LOC monorepos.
- `any` defeats memoization in the checker — one bad annotation can 10x incremental build times.
- Discriminated unions with a literal `type` field give O(1) narrowing; non-discriminated unions degrade checker performance.
- `unknown` is the safe top type — forces narrowing, costs nothing at runtime (erased).
- Type-only imports (`import type { X }`) are erased at emit — required for some bundlers and ESM/CJS interop.
- Conditional types distribute over naked type parameters — `T extends U ? X : Y` on `T = A | B` yields `X_A | X_B`.
- `keyof` of an index signature is `string | number`; of a concrete object it's a literal union — different ergonomics.
- TypeScript 5.0 switched to modules internally — ~10x faster builds; 5.5 added inferred type predicates for free narrowing.
- tsbuildinfo (incremental) caches the checker graph — committing it speeds up CI but loses hermeticity.
- `satisfies` (4.9+) validates a value against a type without widening — preserves literal types for downstream code.
- Tuple types are immutable-length by default; `[...T, ...U]` variadic spreads are evaluated eagerly and can blow up the checker.
- Circular type references are allowed but cause infinite expansion if not carefully bounded — TS errors at depth 100.
- Module resolution: `bundler` (5.0+) for apps, `Node16`/`NodeNext` for libraries — pick wrong and imports fail subtly.
- Project references + `composite: true` enable incremental builds across monorepos — pair with turbo/nx for caching.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [tsc](https://www.typescriptlang.org/) | The TypeScript compiler — also a type-checker; --noEmit for CI checks. | build |
| [tsx](https://tsx.is/) | Zero-config TS executor for Node — uses esbuild, no type-checking. | build |
| [tsup](https://tsup.egoist.dev/) | esbuild-based bundler for TS libraries — zero-config, fast, dual CJS/ESM. | build |
| [ts-node](https://typestrong.org/ts-node/) | Older TS executor — slower than tsx, still common in legacy codebases. | build |
| [pnpm](https://pnpm.io/) | Disk-efficient package manager — best for monorepos with workspaces. | package |
| [npm](https://www.npmjs.com/) | The default Node package manager — largest registry, ubiquitous. | package |
| [Biome](https://biomejs.dev/) | Rust-based linter + formatter with native TS support — 10-100x faster than ESLint+Prettier. | lint |
| [ESLint + typescript-eslint](https://typescript-eslint.io/) | Pluggable linter with TS-specific rules; flat config since v9. | lint |
| [Prettier](https://prettier.io/) | Opinionated formatter — integrates with tsc and ESLint. | lint |
| [Vitest](https://vitest.dev/) | Vite-native test runner with first-class TS support; typecheck mode runs tsc on tests. | test |
| [Jest + ts-jest](https://kulshekhar.github.io/ts-jest/) | Legacy TS test setup; ts-jest is slower than Vitest's esbuild pipeline. | test |
| [Playwright](https://playwright.dev/) | Cross-browser E2E with built-in TS types and codegen. | test |
| [fast-check](https://fast-check.dev/) | Property-based testing — native TS types via @fast-check/vitest. | test |
| [tsd](https://github.com/tsdjs/tsd) | Type-level assertion tests — assert that code DOES or DOES NOT compile. | test |
| [Zod](https://zod.dev/) | Runtime schema validation — pair with z.infer for single-source-of-truth types. | build |
| [Valibot](https://valibot.dev/) | Tree-shakeable Zod alternative — smaller bundle for libraries/front-end. | build |
| [tRPC](https://trpc.io/) | End-to-end typesafe APIs — server types flow to the client with no codegen. | build |
| [Deno / Bun](https://deno.com/) | TS-native runtimes — no tsc step required; built-in test runners and formatters. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 2012 | Initial public release — classes, modules, type declarations. |
| 2.0 | 2014 | Generics, enums, `let`/`const`, async/await preview. |
| 2.4 | 2017 | String enum support, weak type detection. |
| 3.0 | 2018 | Project references, `--build` mode, tuple rest/spread. |
| 3.7 | 2019 | Optional chaining `?.`, nullish coalescing `??`, recursive type aliases. |
| 4.0 | 2020 | Variadic tuple types, labeled tuples, short-circuit assignment operators. |
| 4.1 | 2020 | Template literal types, key remapping in mapped types, recursive conditional types. |
| 4.3 | 2021 | Override keyword, separate read/write types on properties. |
| 4.4 | 2021 | Control-flow narrowing on aliased conditions, `useUnknownInCatchVariables`. |
| 4.7 | 2022 | ECMAScript module support in Node, instantiation expressions. |
| 4.9 | 2022 | `satisfies` operator, narrowing on `in` operator. |
| 5.0 | 2023 | TC39 decorators, `const` type parameters, new module resolution `bundler`. |
| 5.2 | 2023 | Explicit resource management (`using`), named tuple auto-accessor. |
| 5.4 | 2024 | `NoInfer<T>` utility, preserved narrowings in closures, `Object.groupBy` types. |
| 5.5 | 2024 | Inferred type predicates, `@import` JSDoc, ECMA module spec compliance. |
| 5.6 | 2024 | Disallow truthy bigint/string comparisons, `Iterator` global type. |
| 5.7 | 2024 | `--rewriteRelativeImportExtensions`, path rewriting in emit. |
| 5.8 | 2025 | Granular checks for `--module nodenext`, `--erasableSyntaxOnly` for Node type-stripping. |
| 6.0 | 2026 | Last JavaScript-based compiler release (Mar 2026); `--target es2025`, library modernization — the transition release before the Go port. |
| 7.0 | 2026 | Compiler rewritten in Go (Jul 2026) — ~10x faster checks (VS Code: 125s → 10s), parallel `--checkers`/`--builders`, new watch mode, `strict` by default. Native port, same language. |

## Interview Hot Questions

1. **What's the difference between `interface` and `type`?** *(easy)*

   Both define object shapes. `interface` supports declaration merging and is preferred for public APIs that may be extended. `type` can express unions, intersections, tuples, mapped types, and primitives — use it for everything else. They're often interchangeable for plain objects; pick by team convention.

2. **Explain structural typing.** *(medium)*

   TS uses structural (duck) typing: two types with the same shape are assignable regardless of their names. `type A = {x: number}; type B = {x: number}; const a: A = {} as B;` compiles. This differs from nominal typing (Java, C#) where type names matter. Use branded types for nominal distinctions.

3. **Why are types erased at runtime, and what does that mean for production code?** *(medium)*

   TS compiles to plain JS by removing all type annotations. No type info survives — `instanceof MyInterface` is a syntax error, `typeof x === 'MyType'` is always `'object'`. You must validate untrusted input at runtime with zod/valibot/ajv; types alone are not a runtime guarantee.

4. **What's the difference between `any` and `unknown`?** *(easy)*

   `any` opts out of type checking — you can do anything with it, and downstream code becomes `any` too. `unknown` is the safe top type — you MUST narrow it (via typeof, instanceof, in, or a schema) before use. Always prefer `unknown`; reserve `any` for migrations or third-party libs you can't fix.

5. **How do discriminated unions work?** *(medium)*

   A union of object types sharing a literal `type`/`kind` field. TS narrows the union by checking the discriminant: `switch (e.type) { case 'click': e.x; }`. Add `default: const _: never = e;` for compile-time exhaustiveness — if a new variant is added, the switch fails to compile.

6. **What is `as const`, and when should you use it?** *(medium)*

   `as const` makes the inferred type as narrow as possible: literal types instead of widened ones, `readonly` arrays instead of mutable. `const x = ['a', 'b'] as const` gives `readonly ['a', 'b']`. Use for config tables, enum replacements, and anywhere you want literal types preserved.

7. **What does `satisfies` do, and how is it different from `as`?** *(medium)*

   `satisfies T` type-checks a value against T WITHOUT widening — the value keeps its narrow inferred type. `as T` is an unchecked assertion that REPLACES the inferred type with T. Use `satisfies` for config objects where you want validation AND narrow types; reserve `as` for narrowing a known supertype.

8. **Explain conditional types and `infer`.** *(hard)*

   `T extends U ? X : Y` is a type-level if; distributes over naked type parameters (so `A | B extends U ? X : Y` gives `X_A | X_B`). `infer R` inside the condition binds a new type variable: `T extends Promise<infer R> ? R : never` extracts the inner type. The stdlib `Awaited<T>`, `ReturnType<F>`, `Parameters<F>` are built this way.

9. **How do generics differ from `any`?** *(medium)*

   Generics preserve the relationship between input and output types: `function id<T>(x: T): T` returns the same type as input. `function id(x: any): any` loses that. Generics are erased at runtime (no specialization), but the compile-time type flow catches real bugs — `id(5)` returns `number`, not `any`.

10. **How do you type a function that overloads based on argument types?** *(hard)*

   Declare multiple call signatures followed by a single implementation: `function f(n: number): string; function f(s: string): number; function f(x: any): any { ... }`. TS picks the correct signature at call sites; the implementation is hidden. Useful for APIs like `fetch` that return different types based on init options.

## When to Choose This

- **vs JavaScript:** use this — Any codebase beyond a few files; SDKs; team projects where refactoring safety matters.; use that — Tiny scripts, browser-only snippets, quick prototypes where a build step isn't worth it.
- **vs Python:** use this — Full-stack web, frontend, anything that needs the npm/JS ecosystem.; use that — Data science / ML, scientific computing, NumPy/Pandas/PyTorch workloads.
- **vs Go:** use this — Large web codebases, SDKs, anything needing rich types and async-heavy I/O.; use that — High-throughput microservices, CLIs, single-binary deploys where compile time + simplicity matter.
- **vs Java:** use this — Modern web (React/Next/Nest), edge runtimes, anything that benefits from npm.; use that — Large enterprise back-ends, Android (Kotlin now), JVM-bound infrastructure (Kafka, Spark).
- **vs Flow:** use this — Anything in 2024+ — Flow lost the ecosystem war; TS has all the momentum, libraries, and IDE support.; use that — Legacy Meta-internal codebases only — not recommended for new projects.

