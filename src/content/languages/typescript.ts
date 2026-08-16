import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "typescript",
  name: "TypeScript",
  category: "languages",
  tier: 1,
  tags: ["static-typing", "structural", "gradual", "frontend", "backend", "javascript-superset"],
  tagline: "A statically-typed superset of JavaScript that compiles to portable JS — the default for large web codebases.",
  year: 2012,
  author: "Microsoft (Anders Hejlsberg)",

  tldr: [
    "TypeScript is a strict syntactic superset of JavaScript that adds optional static typing, generics, and rich type inference, then erases the types to emit idiomatic JavaScript.",
    "It dominates large front-end (React, Angular, Vue) and back-end (NestJS, tRPC, Hono) codebases because it catches whole classes of bugs at compile time while remaining a one-line install away from plain JS.",
    "Reach for TypeScript whenever a JavaScript codebase grows beyond a few files, when refactoring matters, or when you publish an SDK — types are the contract.",
    "Avoid TypeScript where the runtime you target doesn't speak JS (no point compiling to JS for embedded), and remember types are erased — runtime behavior is identical to JavaScript.",
  ],

  mentalModel: {
    title: "Structural types that vanish at runtime",
    body: "TypeScript uses structural (duck) typing: two types with the same shape are assignable, regardless of their names — there are no nominal tags unless you add a branded field. Types are a compile-time fiction: `tsc` removes them entirely, so what runs is plain JS. The single fact to internalize is that `type`/`interface`/generics exist only in your editor and CI — runtime code must still validate untrusted data with libraries like zod or valibot. This explains why `as` is a lie you tell the compiler, why `any` opts out of the whole game, and why a `Record<string, Foo>` is not the same thing as a Map at runtime.",
  },

  constructs: [
    { syntax: "type Result<T,E> = { ok: true, value: T } | { ok: false, error: E }", behavior: "Discriminated union with generic payload — exhaustive `switch` on `ok` is checked.", when: "Error handling without exceptions; API responses." },
    { syntax: "function f<T extends string>(x: T): `${T}-id`", behavior: "Template literal types + constraint — `f(\"user\")` returns the literal type `\"user-id\"`.", when: "Type-safe route builders, event names, brand keys." },
    { syntax: "interface User { readonly id: number; name?: string }", behavior: "Object shape contract; `?` for optional, `readonly` is shallow.", when: "Public API surfaces; prefer `interface` for objects you extend later." },
    { syntax: "type Fib = [0, 1, 1, 2, 3, 5][N]", behavior: "Tuple-indexed lookup type — the compiler resolves at compile time.", when: "Tutorial-grade demo of the type system; rarely in production." },
    { syntax: "const x = 5 as const", behavior: "Const assertion — `x` has literal type `5`, not `number`.", when: "Locking tuple/object values into literal types for exhaustiveness." },
    { syntax: "type T = keyof typeof obj", behavior: "Union of object keys as literal types.", when: "Mirroring runtime config/enum objects into the type system." },
    { syntax: "type Readonly<T> = { readonly [K in keyof T]: T[K] }", behavior: "Mapped type — applies a modifier to every key.", when: "Building utility types; the stdlib `Readonly`/`Partial`/`Pick`/`Omit` are this." },
    { syntax: "function f(x: string): x is number { ... }", behavior: "User-defined type guard — narrows the type at call sites.", when: "Validating unknown JSON; the bridge between runtime checks and types." },
    { syntax: "abstract class C<T> { abstract parse(x: T): unknown }", behavior: "Generic abstract class with abstract method.", when: "Library base classes — though interfaces + composition often fit better." },
    { syntax: "declare module \"x\" { interface X { y: number } }", behavior: "Module augmentation — merges into an existing module's types.", when: "Extending Express Request, Jest matchers, library plugin systems." },
    { syntax: "satisfies Foo", behavior: "Type-checks against `Foo` without widening — preserves literal types.", when: "Config objects where you want both verification and the narrow type." },
  ],

  patterns: [
    {
      lang: "typescript",
      caption: "Branded types — nominal typing on top of structural TS",
      code: `declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

type UserId = Brand<string, "UserId">;
type Email = Brand<string, "Email">;

const userId = (s: string) => s as UserId;
const email = (s: string) => (s.includes("@") ? (s as Email) : null);

function send(to: Email, body: string) { /* ... */ }

// send(userId("u_1"), "hi")  // ✗ Type 'UserId' is not assignable to 'Email'
// send(email("a@b.io")!, "hi") // ✓`,
    },
    {
      lang: "typescript",
      caption: "Runtime parsing with zod — single source of truth for type + validator",
      code: `import { z } from "zod";

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
}`,
    },
    {
      lang: "typescript",
      caption: "Exhaustive switch over a discriminated union",
      code: `type Event =
  | { type: "click"; x: number; y: number }
  | { type: "scroll"; delta: number }
  | { type: "input"; value: string };

function handle(e: Event): void {
  switch (e.type) {
    case "click":  return console.log(\`@\${e.x},\${e.y}\`);
    case "scroll": return console.log(\`Δ\${e.delta}\`);
    case "input":  return console.log(e.value);
    default:
      // Compile-time exhaustiveness check; fails to type-check
      // if any case is missing or a new variant is added.
      const _exhaustive: never = e;
      throw new Error(\`unhandled: \${_exhaustive}\`);
  }
}`,
    },
    {
      lang: "typescript",
      caption: "Conditional + mapped types — derive an API type from a route table",
      code: `type Routes = {
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
}`,
    },
  ],

  pitfalls: [
    {
      title: "Types are erased — runtime is plain JS",
      symptom: "`if (x instanceof MyInterface)` is a syntax error; `typeof x === 'MyType'` is always `'object'`. No type info survives compilation.",
      fix: "Validate untrusted boundaries with zod/valibot/ajv. Use `in` checks or user-defined guards for narrowing at runtime.",
    },
    {
      title: "`as` is an unchecked assertion, not a cast",
      symptom: "`const x = JSON.parse(res) as User` compiles — but `res` might be anything. The `as` makes the compiler trust you, hiding a real bug.",
      fix: "Never `as` over an untrusted boundary. Use `unknown` + narrowing or a schema parser. Reserve `as` for narrowing a known-supertype.",
    },
    {
      title: "Structural typing surprises",
      symptom: "An object with extra fields still satisfies a narrower type — `const u: User = { id: 1, name: 'a', evil: true }` works for direct assignment but is rejected as an object literal (excess property check).",
      fix: "Excess property checks only fire on literals, not on variables. Use `Pick`/`satisfies` to be explicit, or branded types for nominal distinctions.",
    },
    {
      title: "`any` silently spreads",
      symptom: "A function returning `any` makes anything downstream `any` — `JSON.parse` returns `any` in TS ≤4.x; one bad annotation can disable checking across a file.",
      fix: "Enable `noImplicitAny` and `strict`. Annotate `JSON.parse(x) as unknown` then narrow. Use `unknown` instead of `any` when you must defer types.",
    },
    {
      title: "Enum pitfalls: numeric enums are untyped-ish",
      symptom: "`enum E { A } const x: E = 3` compiles — any number assigns to a numeric enum. Reverse mapping exists for numeric enums only, breaking tree-shaking.",
      fix: "Use string enums, `as const` objects, or union types. `const Direction = { Up: 'up', Down: 'down' } as const` is the modern idiom.",
    },
    {
      title: "Generic inference fails on empty containers",
      symptom: "`const xs: number[] = []` works, but `useState()` infers `undefined` forever unless you give a type or initial value.",
      fix: "Always provide an explicit type argument or an initializer: `useState<number[]>([])`, `useRef<HTMLInputElement>(null)`.",
    },
    {
      title: "Declaration files lie",
      symptom: "An `@types/foo` mismatch or stale `.d.ts` makes the compiler accept code that fails at runtime — types say one thing, the actual library does another.",
      fix: "Pin `@types/*` versions to the matching library minor. Prefer libraries that ship their own types. Treat type defs as a contract to test against.",
    },
  ],

  quickReference: [
    { fact: "`strict: true` enables noImplicitAny, strictNullChecks, strictFunctionTypes, strictBindCallApply, strictPropertyInitialization, noImplicitThis, alwaysStrict, useUnknownInCatchVariables.", tag: "version" },
    { fact: "TypeScript 5.0 (2023) added `const` type parameters; 5.4 added NoInfer; 5.5 added inferred type predicates.", tag: "version" },
    { fact: "Compilation cost scales with project size and `any` count — `any` defeats memoization in the checker and can 10x incremental builds.", tag: "perf" },
    { fact: "`satisfies` (4.9+) checks a value against a type without widening it — use for config objects to keep literal types.", tag: "version" },
    { fact: "Tuple types are immutable-length by default; `[...T, ...U]` is variadic and supports spreads since 4.0.", tag: "version" },
    { fact: "Template literal types (\`${K}-${string}\`) enable type-safe string construction; pair with keyof for route/event maps.", tag: "style" },
    { fact: "`unknown` is the safe top type — must be narrowed before use; `any` opts out of checking entirely.", tag: "gotcha" },
    { fact: "Type-only imports (`import type { X }`) are erased at emit — required for some bundlers and ESM/CJS interop.", tag: "version" },
    { fact: "Discriminated unions with literal `type` fields give O(1) narrowing; non-discriminated unions degrade checker perf.", tag: "perf" },
    { fact: "Conditional types distribute over naked type parameters — `T extends U ? X : Y` on `T = A | B` yields `X_A | X_B`.", tag: "gotcha" },
    { fact: "`keyof` of an index signature is `string | number`; of a concrete object it's a literal union — different ergonomics.", tag: "gotcha" },
    { fact: "tsconfig `moduleResolution: bundler` (5.0+) is the modern default for app code; Node16/NodeNext for libraries.", tag: "version" },
    { fact: "Performance: `tsc --incremental` + project references cut rebuilds to seconds on 100k+ LOC monorepos.", tag: "perf" },
  ],

  goDeeper: [
    { title: "TypeScript Handbook — Official Docs", url: "https://www.typescriptlang.org/docs/handbook/intro.html", note: "The authoritative tutorial; the Type Manipulation section covers generics, mapped, conditional, and template literal types." },
    { title: "TypeScript Release Notes", url: "https://devblogs.microsoft.com/typescript/", note: "Per-version changes are the fastest way to learn what idioms are now safe to use." },
    { title: "Type-level TypeScript", url: "https://type-level-typescript.com/", note: "Free deep course on the type system as a programming language in its own right." },
    { title: "Effective TypeScript (Dan Vanderkam)", url: "https://effectivetypescript.com/", note: "62 concrete items; the canonical book on idiomatic, sound TS code." },
    { title: "Total TypeScript — Type Transformations", url: "https://www.totaltypescript.com/", note: "Matt Pocock's deep dives on narrowing, generics, and the checker's mental model." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "string", behavior: "Immutable UTF-16 sequence — same as JS. Literal types ('a' | 'b') are a TS feature, not a runtime one.", when: "All text. Use literal unions for closed sets of strings." },
      { syntax: "number", behavior: "IEEE-754 binary64. Literal types (1 | 2) collapse to number when widened.", when: "All numerics. Use `as const` to preserve literal types." },
      { syntax: "boolean", behavior: "true | false. Literal types preserved with `as const`.", when: "Flags. Branded boolean types prevent accidental cross-assignment." },
      { syntax: "bigint", behavior: "Arbitrary-precision integer — `123n`.", when: "Large IDs, crypto. No literal type support pre-4.8." },
      { syntax: "null", behavior: "Singleton. With strictNullChecks, must be explicitly allowed in types.", when: "Optional values. Use `T | null`, not `T?` for explicit absence." },
      { syntax: "undefined", behavior: "Singleton. Used for uninitialised values and optional fields.", when: "Optional fields (x?: T means T | undefined)." },
      { syntax: "symbol", behavior: "Unique value — `Symbol('x')`. `unique symbol` is the literal type.", when: "Brand keys, well-known symbols. Rare in app code." },
    ],
    collections: [
      { syntax: "Array<T> / T[]", behavior: "Dynamic array — runtime is JS Array. ReadonlyArray<T> / readonly T[] forbids mutation.", when: "Default sequence. Use readonly for inputs you don't mutate." },
      { syntax: "ReadonlyArray<T> / readonly T[]", behavior: "Immutable view of an array — no push/pop/splice on the type level.", when: "Function params, public API. Pair with `as const` for literal arrays." },
      { syntax: "Tuple: [T, U, V]", behavior: "Fixed-length array with per-index types. `readonly [T, U]` is immutable.", when: "Pairs (KV), return types, structured bindings. Use labeled tuples `[a: T, b: U]`." },
      { syntax: "Map<K, V> / Set<T>", behavior: "Same as JS at runtime; type-checked at compile time.", when: "Keyed lookups. Use ReadonlyMap for inputs." },
      { syntax: "Record<K, V>", behavior: "Object type with keys K and values V — equivalent to `{ [k: string]: V }` for string keys.", when: "Hash maps. Prefer Map at runtime for non-string keys." },
      { syntax: "object", behavior: "Any non-primitive value. Almost always too loose — prefer a concrete shape.", when: "Rejecting primitives; otherwise avoid." },
      { syntax: "Readonly<T> / Partial<T> / Pick<T,K> / Omit<T,K>", behavior: "Utility types — derived from T via mapped types.", when: "Transforming shapes without re-declaring them." },
    ],
    custom: [
      { syntax: "interface I { x: number }", behavior: "Named object shape; supports declaration merging & extension.", when: "Public API surfaces, object contracts you'll extend." },
      { syntax: "type T = { x: number }", behavior: "Type alias — works for any type, not just objects; cannot merge.", when: "Unions, intersections, utility types, tuples. Prefer for most app code." },
      { syntax: "type T = A | B | C", behavior: "Discriminated union if members share a literal `type`/`kind` field — exhaustive switch checked.", when: "Sum types, finite states, API responses. The TS answer to enums." },
      { syntax: "class C extends B { ... }", behavior: "Same as JS class plus TS type annotations. Abstract methods, parameter properties, visibility modifiers.", when: "OOP with runtime behavior. For pure data, prefer type/interface." },
      { syntax: "enum E { A, B }", behavior: "Numeric (untyped-ish) or string enum. Numeric enums have reverse mapping.", when: "Avoid numeric enums — use `as const` objects or union types instead." },
      { syntax: "const E = { A: 'a', B: 'b' } as const", behavior: "Object literal with literal types preserved — modern enum replacement.", when: "Closed value sets with both runtime and type-level access." },
      { syntax: "declare const __brand: unique symbol\ntype Brand<T, B> = T & { readonly [__brand]: B }", behavior: "Branded/flavor type — nominal typing on top of structural TS.", when: "UserId vs Email (both strings) — prevents accidental cross-use." },
      { syntax: "abstract class C<T> { abstract m(x: T): unknown }", behavior: "Generic abstract base — partial implementation, subtypes fill in.", when: "Library base classes. Prefer interface + composition in new code." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b, a % b, a ** b", behavior: "Same as JS — TS adds no behavior. Number literals can be narrowed via `as const`.", when: "Math. TS catches type errors (`'a' + 1` is rejected) but doesn't change semantics." },
    { syntax: "a === b, a !== b, a == b, a != b", behavior: "Equality — same JS semantics. TS rejects comparisons of unrelated types under strict mode.", when: "Always use `===` / `!==`. TS narrows types after `=== null` / `=== undefined`." },
    { syntax: "a < b, a > b, a <= b, a >=", behavior: "Comparison — TS allows only between comparable types under strict mode.", when: "Sorting, ranges. Use `localeCompare` for human-readable strings." },
    { syntax: "a && b, a || b", behavior: "Short-circuit, returns operand. TS narrows the result type: `x || default` removes nullish from x.", when: "Default values, null-guards. The narrowing is the killer feature." },
    { syntax: "a ?? b", behavior: "Nullish coalescing — TS narrows: `a ?? b` yields NonNullable<A> | B.", when: "Defaults where 0/'' are valid. StrictNullChecks turns ?? into a type-level guard." },
    { syntax: "a?.b?.c, a?.(), a?.[i]", behavior: "Optional chaining — TS adds the type: `T | undefined` if any link is optional.", when: "Deep property access. Type narrows after a non-undefined check." },
    { syntax: "a ? b : c", behavior: "Ternary — TS picks the type from each branch. `cond ? x : null` yields `T | null`.", when: "Conditional expressions. For type-level, use `T extends U ? X : Y`." },
    { syntax: "a as B", behavior: "Type assertion — UNSAFE, the compiler trusts you. Allowed only between overlapping types.", when: "Narrowing a supertype; never over an untrusted boundary. Use `unknown` first." },
    { syntax: "a satisfies B", behavior: "Type-checks `a` against `B` WITHOUT widening — preserves the literal type of `a`.", when: "Config objects, lookup tables where you want both validation and narrow types." },
    { syntax: "x is T", behavior: "User-defined type guard — function return type that narrows `x` at call sites.", when: "Validating unknown JSON, custom narrowing predicates." },
    { syntax: "keyof T", behavior: "Type operator — union of keys of T as literal types.", when: "Mirroring runtime config into types, building utility types." },
    { syntax: "typeof x", behavior: "Type operator — the type of a value at compile time. Pair with `as const` for literal types.", when: "Deriving types from constants; `typeof import('./mod')` for module types." },
    { syntax: "T extends U ? X : Y", behavior: "Conditional type — distributes over naked type parameters.", when: "Building utility types (Exclude, Extract, NonNullable are this)." },
    { syntax: "infer T", behavior: "Bind a type variable inside a conditional — extracts from a pattern.", when: "Unwrapping Promises (`Awaited<T>`), function return types (`ReturnType<F>`)." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "typescript",
      caption: "File I/O in Node — typed streams and async iterators",
      code: `import { readFile, open } from "node:fs/promises";
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
}`,
    },
    {
      lang: "typescript",
      caption: "Parsing untrusted input with zod — single source of truth",
      code: `import { z } from "zod";

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
const user: User = result.data;`,
    },
    {
      lang: "typescript",
      caption: "stdin / stdout in Deno / Bun — Web-standard streams",
      code: `// Deno — uses web-standard ReadableStream/WritableStream
const stdinText = await new Response(Deno.stdin.readable).text();
const payload = JSON.parse(stdinText) as unknown;

// Bun — uses the same web Streams API
const text = await Bun.stdin.text();

// Node 18+ — web streams available via node:stream/web
const stream = new Response(process.stdin).body;
const reader = stream?.getReader();

// All three runtimes converge on the WHATWG Streams spec.`,
    },
    {
      lang: "typescript",
      caption: "Typed fetch wrapper — generic over the response shape",
      code: `async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
  return (await r.json()) as T; // still untrusted — pair with zod for real safety
}

// Concrete call site — T is inferred from the type annotation
const user = await fetchJson<User>("/api/users/42");`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "typescript",
      caption: "for...of with type narrowing — exhaustive over a union",
      code: `type Event =
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
}`,
    },
    {
      lang: "typescript",
      caption: "Array methods — typed map/filter/reduce",
      code: `interface User { id: number; role: "admin" | "member"; active: boolean }

const users: User[] = [...];

// Map — element type carried through
const ids: number[] = users.map((u) => u.id);

// Filter — predicate must be a type guard to narrow the result
const admins: User[] = users.filter((u): u is User => u.role === "admin");
// Without the type guard, the result is still User[] (no narrowing)

// Reduce — typed accumulator
const byId: Record<number, User> = users.reduce((acc, u) => {
  acc[u.id] = u; return acc;
}, {} as Record<number, User>);`,
    },
    {
      lang: "typescript",
      caption: "Generators with IterableIterator and yield types",
      code: `function* naturals(start = 0): IterableIterator<number> {
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
async function* paginate<T>(url: string): AsyncIterable<T> { /* ... */ }`,
    },
    {
      lang: "typescript",
      caption: "Tuple destructuring with labeled types",
      code: `// Labeled tuple elements — self-documenting
function kv(): [key: string, value: number] {
  return ["count", 42];
}
const [key, value] = kv();        // key: string, value: number

// for...of over a Map<K, V> yields [K, V]
const m = new Map<string, User>([["u1", { id: 1, role: "admin", active: true }]]);
for (const [k, v] of m) {
  console.log(k, v.role); // v is narrowed to User
}`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "typescript",
      caption: "Function signatures — overloads, generics, defaults",
      code: `// Overloads — call signatures for distinct arg shapes; implementation is hidden
function fetch(id: number): Promise<User>;
function fetch(email: string): Promise<User>;
async function fetch(input: number | string): Promise<User> {
  const key = typeof input === "number" ? \`id=\${input}\` : \`email=\${input}\`;
  return fetchJson(\`/users?\${key}\`);
}

// Generic with constraint
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return keys.reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {} as Pick<T, K>);
}`,
    },
    {
      lang: "typescript",
      caption: "Function types — call signatures, constructs, conditional types",
      code: `// Call signature — type of a callable
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
type AsyncR = Awaited<Promise<Promise<User>>>; // User`,
    },
    {
      lang: "typescript",
      caption: "Decorators (5.0+) — class, method, field, accessor",
      code: `// TC39 decorators (TS 5.0+) — different from experimental legacy decorators
function logged<This, Args extends unknown[], R>(
  target: (this: This, ...args: Args) => R,
  ctx: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>
) {
  return function (this: This, ...args: Args): R {
    console.log(\`calling \${String(ctx.name)}\`);
    return target.call(this, ...args);
  };
}

class Service {
  @logged
  fetch(id: number) { return fetchJson(\`/u/\${id}\`); }
}`,
    },
    {
      lang: "typescript",
      caption: "Higher-kinded patterns — type-level functions, memoization",
      code: `// Memoize — preserves the function's parameter and return types
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
console.log(fib(45)); // fast — O(n) thanks to memoization`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "typescript",
      caption: "Result type — discriminated union with exhaustive switch",
      code: `type Result<T, E = Error> =
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
}`,
    },
    {
      lang: "typescript",
      caption: "Typed errors via class hierarchy + instanceof narrowing",
      code: `class AppError extends Error { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = this.constructor.name; } }
class NotFoundError extends AppError {}
class ValidationError extends AppError { constructor(m: string, readonly field: string) { super(m); } }

async function load(id: number): Promise<User> {
  const r = await fetch(\`/users/\${id}\`);
  if (r.status === 404) throw new NotFoundError(\`user \${id}\`);
  if (!r.ok) throw new AppError(\`HTTP \${r.status}\`);
  return r.json() as Promise<User>;
}

try { await load(42); }
catch (e) {
  if (e instanceof NotFoundError) respond(404, { error: e.message });
  else if (e instanceof ValidationError) respond(400, { field: e.field });
  else throw e; // re-throw unknown
}`,
    },
    {
      lang: "typescript",
      caption: "unknown — the safe top type for caught errors",
      code: `// useUnknownInCatchVariables (strict) makes catch bindings 'unknown', not 'any'
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
}`,
    },
    {
      lang: "typescript",
      caption: "Discriminated errors at the boundary — never throw across modules",
      code: `// Module A's API surface — every error is a tagged variant
type ApiError =
  | { kind: "not_found"; id: number }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "network"; cause: unknown };

export async function getUser(id: number): Promise<Result<User, ApiError>> {
  try {
    const r = await fetch(\`/users/\${id}\`);
    if (r.status === 404) return Err({ kind: "not_found", id });
    if (r.status === 429) return Err({ kind: "rate_limited", retryAfter: Number(r.headers.get("retry-after") ?? 1) });
    if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
    return Ok(await r.json() as User);
  } catch (cause) {
    return Err({ kind: "network", cause });
  }
}`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "typescript",
      caption: "async/await with typed errors and abort",
      code: `async function fetchWithTimeout(url: string, ms = 5000): Promise<Result<Response, Error>> {
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
if (!r.ok) process.exit(1);`,
    },
    {
      lang: "typescript",
      caption: "Worker threads with typed message protocol",
      code: `// Shared protocol between main and worker
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
}`,
    },
    {
      lang: "typescript",
      caption: "Async generators — typed streaming pipelines",
      code: `async function* paginate<T>(url: string, schema: { parse: (x: unknown) => T }): AsyncIterable<T> {
  let cursor: string | null = null;
  while (true) {
    const r = await fetch(cursor ? \`\${url}?cursor=\${cursor}\` : url);
    if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
    const body = await r.json() as { items: unknown[]; next: string | null };
    for (const item of body.items) yield schema.parse(item); // typed
    if (!body.next) return;
    cursor = body.next;
  }
}

for await (const user of paginate("/api/users", { parse: (x) => x as User })) {
  console.log(user.id);
}`,
    },
    {
      lang: "typescript",
      caption: "Bounded concurrency — typed pMap",
      code: `async function pMap<T, R>(
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
const ids: number[] = await pMap(users, async (u) => u.id);`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "typescript",
      caption: "Vitest — typed mocks, fixtures, expectTypeOf",
      code: `import { describe, it, expect, vi, expectTypeOf } from "vitest";

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
});`,
    },
    {
      lang: "typescript",
      caption: "Mocking with vi.mocked and module-level mocks",
      code: `import { vi } from "vitest";
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
});`,
    },
    {
      lang: "typescript",
      caption: "Property-based testing with fast-check + zod",
      code: `import { test, fc } from "@fast-check/vitest";
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
// fast-check shrinks failures to the minimal reproducer.`,
    },
    {
      lang: "typescript",
      caption: "tsd — type-level assertions in tests",
      code: `// types.test-d.ts — runs via tsd or vitest typecheck
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
});`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "`tsc` is single-threaded; project references + incremental mode cut rebuilds from minutes to seconds on 100k+ LOC monorepos.", tag: "perf" },
    { fact: "`any` defeats memoization in the checker — one bad annotation can 10x incremental build times.", tag: "perf" },
    { fact: "Discriminated unions with a literal `type` field give O(1) narrowing; non-discriminated unions degrade checker performance.", tag: "perf" },
    { fact: "`unknown` is the safe top type — forces narrowing, costs nothing at runtime (erased).", tag: "gotcha" },
    { fact: "Type-only imports (`import type { X }`) are erased at emit — required for some bundlers and ESM/CJS interop.", tag: "version" },
    { fact: "Conditional types distribute over naked type parameters — `T extends U ? X : Y` on `T = A | B` yields `X_A | X_B`.", tag: "gotcha" },
    { fact: "`keyof` of an index signature is `string | number`; of a concrete object it's a literal union — different ergonomics.", tag: "gotcha" },
    { fact: "TypeScript 5.0 switched to modules internally — ~10x faster builds; 5.5 added inferred type predicates for free narrowing.", tag: "version" },
    { fact: "tsbuildinfo (incremental) caches the checker graph — committing it speeds up CI but loses hermeticity.", tag: "perf" },
    { fact: "`satisfies` (4.9+) validates a value against a type without widening — preserves literal types for downstream code.", tag: "version" },
    { fact: "Tuple types are immutable-length by default; `[...T, ...U]` variadic spreads are evaluated eagerly and can blow up the checker.", tag: "complexity" },
    { fact: "Circular type references are allowed but cause infinite expansion if not carefully bounded — TS errors at depth 100.", tag: "gotcha" },
    { fact: "Module resolution: `bundler` (5.0+) for apps, `Node16`/`NodeNext` for libraries — pick wrong and imports fail subtly.", tag: "version" },
    { fact: "Project references + `composite: true` enable incremental builds across monorepos — pair with turbo/nx for caching.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "tsc", purpose: "The TypeScript compiler — also a type-checker; --noEmit for CI checks.", url: "https://www.typescriptlang.org/", category: "build" },
    { tool: "tsx", purpose: "Zero-config TS executor for Node — uses esbuild, no type-checking.", url: "https://tsx.is/", category: "build" },
    { tool: "tsup", purpose: "esbuild-based bundler for TS libraries — zero-config, fast, dual CJS/ESM.", url: "https://tsup.egoist.dev/", category: "build" },
    { tool: "ts-node", purpose: "Older TS executor — slower than tsx, still common in legacy codebases.", url: "https://typestrong.org/ts-node/", category: "build" },
    { tool: "pnpm", purpose: "Disk-efficient package manager — best for monorepos with workspaces.", url: "https://pnpm.io/", category: "package" },
    { tool: "npm", purpose: "The default Node package manager — largest registry, ubiquitous.", url: "https://www.npmjs.com/", category: "package" },
    { tool: "Biome", purpose: "Rust-based linter + formatter with native TS support — 10-100x faster than ESLint+Prettier.", url: "https://biomejs.dev/", category: "lint" },
    { tool: "ESLint + typescript-eslint", purpose: "Pluggable linter with TS-specific rules; flat config since v9.", url: "https://typescript-eslint.io/", category: "lint" },
    { tool: "Prettier", purpose: "Opinionated formatter — integrates with tsc and ESLint.", url: "https://prettier.io/", category: "lint" },
    { tool: "Vitest", purpose: "Vite-native test runner with first-class TS support; typecheck mode runs tsc on tests.", url: "https://vitest.dev/", category: "test" },
    { tool: "Jest + ts-jest", purpose: "Legacy TS test setup; ts-jest is slower than Vitest's esbuild pipeline.", url: "https://kulshekhar.github.io/ts-jest/", category: "test" },
    { tool: "Playwright", purpose: "Cross-browser E2E with built-in TS types and codegen.", url: "https://playwright.dev/", category: "test" },
    { tool: "fast-check", purpose: "Property-based testing — native TS types via @fast-check/vitest.", url: "https://fast-check.dev/", category: "test" },
    { tool: "tsd", purpose: "Type-level assertion tests — assert that code DOES or DOES NOT compile.", url: "https://github.com/tsdjs/tsd", category: "test" },
    { tool: "Zod", purpose: "Runtime schema validation — pair with z.infer for single-source-of-truth types.", url: "https://zod.dev/", category: "build" },
    { tool: "Valibot", purpose: "Tree-shakeable Zod alternative — smaller bundle for libraries/front-end.", url: "https://valibot.dev/", category: "build" },
    { tool: "tRPC", purpose: "End-to-end typesafe APIs — server types flow to the client with no codegen.", url: "https://trpc.io/", category: "build" },
    { tool: "Deno / Bun", purpose: "TS-native runtimes — no tsc step required; built-in test runners and formatters.", url: "https://deno.com/", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0",  year: 2012, highlight: "Initial public release — classes, modules, type declarations." },
    { version: "2.0",  year: 2014, highlight: "Generics, enums, `let`/`const`, async/await preview." },
    { version: "2.4",  year: 2017, highlight: "String enum support, weak type detection." },
    { version: "3.0",  year: 2018, highlight: "Project references, `--build` mode, tuple rest/spread." },
    { version: "3.7",  year: 2019, highlight: "Optional chaining `?.`, nullish coalescing `??`, recursive type aliases." },
    { version: "4.0",  year: 2020, highlight: "Variadic tuple types, labeled tuples, short-circuit assignment operators." },
    { version: "4.1",  year: 2020, highlight: "Template literal types, key remapping in mapped types, recursive conditional types." },
    { version: "4.3",  year: 2021, highlight: "Override keyword, separate read/write types on properties." },
    { version: "4.4",  year: 2021, highlight: "Control-flow narrowing on aliased conditions, `useUnknownInCatchVariables`." },
    { version: "4.7",  year: 2022, highlight: "ECMAScript module support in Node, instantiation expressions." },
    { version: "4.9",  year: 2022, highlight: "`satisfies` operator, narrowing on `in` operator." },
    { version: "5.0",  year: 2023, highlight: "TC39 decorators, `const` type parameters, new module resolution `bundler`." },
    { version: "5.2",  year: 2023, highlight: "Explicit resource management (`using`), named tuple auto-accessor." },
    { version: "5.4",  year: 2024, highlight: "`NoInfer<T>` utility, preserved narrowings in closures, `Object.groupBy` types." },
    { version: "5.5",  year: 2024, highlight: "Inferred type predicates, `@import` JSDoc, ECMA module spec compliance." },
    { version: "5.6",  year: 2024, highlight: "Disallow truthy bigint/string comparisons, `Iterator` global type." },
    { version: "5.7",  year: 2024, highlight: "`--rewriteRelativeImportExtensions`, path rewriting in emit." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between `interface` and `type`?", a: "Both define object shapes. `interface` supports declaration merging and is preferred for public APIs that may be extended. `type` can express unions, intersections, tuples, mapped types, and primitives — use it for everything else. They're often interchangeable for plain objects; pick by team convention.", difficulty: "easy" },
    { q: "Explain structural typing.", a: "TS uses structural (duck) typing: two types with the same shape are assignable regardless of their names. `type A = {x: number}; type B = {x: number}; const a: A = {} as B;` compiles. This differs from nominal typing (Java, C#) where type names matter. Use branded types for nominal distinctions.", difficulty: "medium" },
    { q: "Why are types erased at runtime, and what does that mean for production code?", a: "TS compiles to plain JS by removing all type annotations. No type info survives — `instanceof MyInterface` is a syntax error, `typeof x === 'MyType'` is always `'object'`. You must validate untrusted input at runtime with zod/valibot/ajv; types alone are not a runtime guarantee.", difficulty: "medium" },
    { q: "What's the difference between `any` and `unknown`?", a: "`any` opts out of type checking — you can do anything with it, and downstream code becomes `any` too. `unknown` is the safe top type — you MUST narrow it (via typeof, instanceof, in, or a schema) before use. Always prefer `unknown`; reserve `any` for migrations or third-party libs you can't fix.", difficulty: "easy" },
    { q: "How do discriminated unions work?", a: "A union of object types sharing a literal `type`/`kind` field. TS narrows the union by checking the discriminant: `switch (e.type) { case 'click': e.x; }`. Add `default: const _: never = e;` for compile-time exhaustiveness — if a new variant is added, the switch fails to compile.", difficulty: "medium" },
    { q: "What is `as const`, and when should you use it?", a: "`as const` makes the inferred type as narrow as possible: literal types instead of widened ones, `readonly` arrays instead of mutable. `const x = ['a', 'b'] as const` gives `readonly ['a', 'b']`. Use for config tables, enum replacements, and anywhere you want literal types preserved.", difficulty: "medium" },
    { q: "What does `satisfies` do, and how is it different from `as`?", a: "`satisfies T` type-checks a value against T WITHOUT widening — the value keeps its narrow inferred type. `as T` is an unchecked assertion that REPLACES the inferred type with T. Use `satisfies` for config objects where you want validation AND narrow types; reserve `as` for narrowing a known supertype.", difficulty: "medium" },
    { q: "Explain conditional types and `infer`.", a: "`T extends U ? X : Y` is a type-level if; distributes over naked type parameters (so `A | B extends U ? X : Y` gives `X_A | X_B`). `infer R` inside the condition binds a new type variable: `T extends Promise<infer R> ? R : never` extracts the inner type. The stdlib `Awaited<T>`, `ReturnType<F>`, `Parameters<F>` are built this way.", difficulty: "hard" },
    { q: "How do generics differ from `any`?", a: "Generics preserve the relationship between input and output types: `function id<T>(x: T): T` returns the same type as input. `function id(x: any): any` loses that. Generics are erased at runtime (no specialization), but the compile-time type flow catches real bugs — `id(5)` returns `number`, not `any`.", difficulty: "medium" },
    { q: "How do you type a function that overloads based on argument types?", a: "Declare multiple call signatures followed by a single implementation: `function f(n: number): string; function f(s: string): number; function f(x: any): any { ... }`. TS picks the correct signature at call sites; the implementation is hidden. Useful for APIs like `fetch` that return different types based on init options.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "JavaScript", whenThis: "Any codebase beyond a few files; SDKs; team projects where refactoring safety matters.", whenThat: "Tiny scripts, browser-only snippets, quick prototypes where a build step isn't worth it." },
    { vs: "Python", whenThis: "Full-stack web, frontend, anything that needs the npm/JS ecosystem.", whenThat: "Data science / ML, scientific computing, NumPy/Pandas/PyTorch workloads." },
    { vs: "Go", whenThis: "Large web codebases, SDKs, anything needing rich types and async-heavy I/O.", whenThat: "High-throughput microservices, CLIs, single-binary deploys where compile time + simplicity matter." },
    { vs: "Java", whenThis: "Modern web (React/Next/Nest), edge runtimes, anything that benefits from npm.", whenThat: "Large enterprise back-ends, Android (Kotlin now), JVM-bound infrastructure (Kafka, Spark)." },
    { vs: "Flow", whenThis: "Anything in 2024+ — Flow lost the ecosystem war; TS has all the momentum, libraries, and IDE support.", whenThat: "Legacy Meta-internal codebases only — not recommended for new projects." },
  ],
};

export default sheet;
