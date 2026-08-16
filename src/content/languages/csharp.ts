import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "csharp",
  name: "C#",
  category: "languages",
  tier: 1,
  tags: ["static-typing", "dotnet", "gc", "oop", "enterprise", "backend", "game-dev"],
  tagline: "A statically-typed, multi-paradigm .NET language — the default for Windows desktop, game engines (Unity), and modern back-ends.",
  year: 2000,
  author: "Anders Hejlsberg (Microsoft)",

  tldr: [
    "C# is a statically-typed, garbage-collected, multi-paradigm language for the .NET runtime — initially Microsoft's answer to Java, now substantially more expressive thanks to LINQ, async, pattern matching, and source generators.",
    "It dominates Windows desktop (WPF, WinUI), game development via Unity and Godot, enterprise back-ends on ASP.NET Core, and a growing slice of cloud-native services on Azure.",
    "Reach for C# when you target Windows or the .NET ecosystem, when you build Unity games, or when you want a mature statically-typed language with first-class async and a rich BCL.",
    "Avoid C# for systems programming (GC pauses, no manual control of value-type layout beyond structs), or where cross-vendor portability matters more than the Microsoft stack does.",
  ],

  mentalModel: {
    title: "Reference types on the GC heap, value types inline",
    body: "C# has a hard split: `class` types are references on the GC heap, `struct` types are values copied inline at every assignment or call. Boxing a struct wraps it in a heap object — silent allocation. Methods are virtual only when marked `virtual`; the default is non-virtual dispatch (faster than Java's). Generic types are reified: `List<int>` is a distinct type from `List<string>`, and the JIT specializes per value type, avoiding boxing. Async methods compile to state machines via `Task` — `await` is a suspension point, not a block. LINQ is a uniform query syntax over IEnumerable/IQueryable that defers execution until enumeration.",
  },

  constructs: [
    { syntax: "public record User(int Id, string Email);", behavior: "Immutable reference record with value-based equality (C# 9+).", when: "DTOs, value types; pair with `with` for non-destructive mutation." },
    { syntax: "var u = new { Id = 1, Name = \"a\" };", behavior: "Anonymous type — compiler generates an immutable class.", when: "LINQ projections; never cross method boundaries." },
    { syntax: "async Task<T> F() => await x;", behavior: "Async method returning a hot task; `await` suspends without blocking the thread.", when: "All I/O — file, network, DB. Never block on async (`.Result`)." },
    { syntax: "using var fs = new FileStream(p);", behavior: "Using declaration — Dispose called at scope exit (C# 8+).", when: "Files, connections, anything IDisposable; replaces try/finally." },
    { syntax: "int? x = null;", behavior: "Nullable<T> value type; `x.HasValue`/`x.Value` to access.", when: "Optional values from DBs, APIs, JSON. Nullable reference types (8+) are a separate feature." },
    { syntax: "switch (e) { case int i: ...; case [1, .., 5]: ... }", behavior: "Pattern-matching switch (C# 8+) with type, property, list, and positional patterns.", when: "Replacing if-else chains; exhaustive over enums when default is rejected." },
    { syntax: "IEnumerable<T> Gen() { yield return x; }", behavior: "Iterator method — lazy, state-machine backed.", when: "Streaming sequences; pipeline stages." },
    { syntax: "Span<T> s = stackalloc int[8];", behavior: "Stack-allocated buffer wrapped in a span — no heap allocation.", when: "Hot paths, parsing, interop; the modern way to write allocation-free code." },
    { syntax: "[GeneratedRegex(@\"\\d+\")] static partial Regex R();", behavior: "Source generator emits a compiled regex at build time (C# 10+, .NET 7).", when: "Regex hot paths — 5–10x faster than runtime compilation." },
    { syntax: "interface I { static virtual int M() => 0; }", behavior: "Static interface members (C# 11+) — enables trait-like abstraction.", when: "Generic math, operator constraints; self-implementing interface defaults." },
  ],

  patterns: [
    {
      lang: "csharp",
      caption: "Record + pattern matching — algebraic data types in C#",
      code: `public abstract record Shape;

public record Circle(double Radius) : Shape;
public record Rectangle(double Width, double Height) : Shape;
public record Triangle(double A, double B, double C) : Shape;

public double Area(Shape s) => s switch
{
    Circle c    => Math.PI * c.Radius * c.Radius,
    Rectangle r => r.Width * r.Height,
    Triangle t  => Heron(t.A, t.B, t.C),
    _           => throw new ArgumentOutOfRangeException(nameof(s))
};

// Non-destructive mutation
var big = new Circle(5) with { Radius = 10 };`,
    },
    {
      lang: "csharp",
      caption: "async/await with cancellation and ConfigureAwait",
      code: `public async Task<User> LoadAsync(
    int id, CancellationToken ct = default)
{
    using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
    cts.CancelAfter(TimeSpan.FromSeconds(5));

    var user = await _db.Users
        .AsNoTracking()
        .FirstOrDefaultAsync(u => u.Id == id, cts.Token)
        .ConfigureAwait(false);              // library code: drop sync context

    return user ?? throw new NotFoundException($"user {id}");
}

// Library author rule: ALWAYS use ConfigureAwait(false)
// App code (UI): NEVER use it, you need the sync context back.`,
    },
    {
      lang: "csharp",
      caption: "Span<T> + stackalloc — zero-allocation parsing",
      code: `public static int ParseInt(ReadOnlySpan<char> s)
{
    int result = 0;
    bool neg = false;
    int i = 0;
    if (s.Length > 0 && s[0] == '-') { neg = true; i = 1; }

    for (; i < s.Length; i++)
    {
        if ((uint)(s[i] - '0') > 9)
            throw new FormatException("not a digit");
        result = result * 10 + (s[i] - '0');
    }
    return neg ? -result : result;
}

// Caller: no heap allocation at all
Span<char> buf = stackalloc char[16];
"12345".AsSpan().CopyTo(buf);
int n = ParseInt(buf);`,
    },
    {
      lang: "csharp",
      caption: "IDisposable + using declaration — deterministic cleanup",
      code: `public sealed class DbTx : IDisposable
{
    private readonly DbConnection _conn;
    private bool _committed;
    private bool _disposed;

    public DbTx(DbConnection c) => _conn = c;

    public void Commit() { _conn.Commit(); _committed = true; }

    public void Dispose()
    {
        if (_disposed) return;
        if (!_committed) _conn.Rollback();
        _conn.Dispose();
        _disposed = true;
    }
}

using var tx = new DbTx(conn);
// ... work ...
tx.Commit();   // rollback runs at scope exit if we throw before here`,
    },
  ],

  pitfalls: [
    {
      title: "Blocking on async code deadlocks",
      symptom: "Calling `.Result` or `.Wait()` on a Task in a context with a SynchronizationContext (ASP.NET classic, WinForms, WPF) deadlocks — the continuation waits for the context you're blocking.",
      fix: "Use `await` all the way up. If you must block, use `.GetAwaiter().GetResult()` and `.ConfigureAwait(false)` everywhere below. ASP.NET Core has no sync context, so this trap is gone there.",
    },
    {
      title: "Struct mutation through interface copies",
      symptom: "Casting a struct to an interface boxes it; mutating via the interface mutates the boxed copy, not the original — silent no-op for the caller.",
      fix: "Make structs immutable (record struct or readonly struct). Avoid mutable structs entirely; the cost of subtle bugs dwarfs any perf benefit.",
    },
    {
      title: "LINQ hides multiple enumeration and allocations",
      symptom: "`var q = xs.Where(...).Select(...);` enumerates twice if used twice; `Count()` on an `IEnumerable` may walk the whole sequence; closures over locals allocate per-call.",
      fix: "Materialize with `.ToList()` if used more than once. Use `.ToLookup`/`.ToDictionary` to avoid re-scans. For hot paths, write explicit loops — LINQ is ~3–10x slower.",
    },
    {
      title: "Nullable reference types are not enforced at runtime",
      symptom: "`string x = null!` compiles; the `!` lies to the compiler. JSON deserialization can put null into a non-nullable reference. The NRT feature is compile-time only.",
      fix: "Validate at boundaries: `ArgumentNullException.ThrowIfNull(x)`. Treat NRTs as static analysis, not a runtime guarantee. Annotate your DTOs.",
    },
    {
      title: "Closing over loop variable captures the variable, not the value",
      symptom: "`foreach (var x in xs) actions.Add(() => x);` — all lambdas return the last x (pre-C# 5 fixed this for `foreach`; the trap survives in `for` loops with captures).",
      fix: "C# `foreach` since C# 5 creates a fresh variable per iteration. For `for` loops, copy: `var local = i; actions.Add(() => local);`.",
    },
    {
      title: "Event handler leaks keep subscribers alive",
      symptom: "Subscribing `publisher.Event += subscriber.Handler` without unsubscribing keeps the subscriber rooted through the publisher — memory leak across the lifetime of the publisher.",
      fix: "Always pair `+=` with `-=` in Dispose. For weak coupling, use weak event patterns (WeakReference or `WeakEventManager`).",
    },
    {
      title: "`==` operator is not `Equals`",
      symptom: "`==` for reference types compares references by default (unless overloaded — String does, most classes don't). `String.Equals` and `==` agree, but `Object.ReferenceEquals(a,b)` is the only safe identity check.",
      fix: "Use `Equals(a, b)` for content equality. Override `==` only on immutable value-like types, and always implement `IEquatable<T>`.",
    },
  ],

  quickReference: [
    { fact: ".NET 8 (LTS, Nov 2023) added primary constructors, collection expressions; .NET 9 (Nov 2024) adds `field` keyword, more source generators; cadence is annual LTS every even year.", tag: "version" },
    { fact: "JIT compiles per-method on first call; tiered compilation (default since .NET Core 3) tiers C1→C2 — microbenchmarks need explicit warmup.", tag: "perf" },
    { fact: "Span<T> / Memory<T> are zero-allocation views over arrays/strings/native memory — the foundation of modern perf-oriented BCL.", tag: "perf" },
    { fact: "Value types (struct) are copied on assignment and boxed when boxed as object — avoid in hot paths that touch `object`.", tag: "perf" },
    { fact: "Generics are reified — `List<int>` has no boxing; the JIT generates specialized code per value type.", tag: "perf" },
    { fact: "Dictionary<K,V>: O(1) average lookup, may degrade with bad hashers; ConcurrentDictionary is striped (faster than a single lock).", tag: "complexity" },
    { fact: "async/await compiles to a state machine per method; allocation of the state machine box is elided when the task completes synchronously.", tag: "perf" },
    { fact: "String interning: literal strings are interned; `string.Intern(s)` adds runtime strings — usually not worth it.", tag: "gotcha" },
    { fact: "ObjectDisposedException is thrown by a disposed object's methods if you implemented the pattern correctly — never swallow it; it's a sign of a use-after-dispose bug.", tag: "gotcha" },
    { fact: "Source generators run at compile time, emit additional C# — used for regex, JSON, logging, dependency injection; the modern alternative to reflection.", tag: "version" },
    { fact: "Native AOT (NET 8+) produces a single self-contained binary with sub-50ms startup — but no runtime codegen, so reflection-emit is unsupported.", tag: "version" },
    { fact: "`Task.Run` for CPU-bound work only; for I/O, use the natural async API — `Task.Run(() => ReadAsync())` adds a thread-pool hop for nothing.", tag: "perf" },
    { fact: "C# naming: PascalCase for public members, camelCase for locals/params, _camelCase for private fields. StyleCop/Analyzers enforce.", tag: "style" },
  ],

  goDeeper: [
    { title: "C# Language Specification — Microsoft Learn", url: "https://learn.microsoft.com/dotnet/csharp/language-reference/", note: "Authoritative language reference; the definitive source for operator precedence, patterns, and async semantics." },
    { title: "C# in Depth (Jon Skeet, 4th ed.)", url: "https://csharpindepth.com/", note: "The canonical book on the evolution from C# 1 to modern — best treatment of generics, delegates, and async internals." },
    { title: ".NET Docs — Microsoft Learn", url: "https://learn.microsoft.com/dotnet/", note: "Official API reference, runtime design notes, and per-version migration guides." },
    { title: "CLR via C# (Jeffrey Richter)", url: "https://www.oreilly.com/library/view/clr-via-c/9780735668733/", note: "The deep dive into the runtime — GC, assembly loading, AppDomains, threading internals." },
    { title: "Performance Tips — .NET GitHub", url: "https://github.com/dotnet/performance/blob/main/docs/microbenchmark-design.md", note: "Microsoft's own guidance on writing accurate .NET microbenchmarks; benchmarkdotnet is the standard tool." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "sbyte / byte", behavior: "Signed / unsigned 8-bit integer. byte is unsigned by default (unlike C/C++).", when: "Binary protocols, byte buffers. Span<byte> is the modern idiom." },
      { syntax: "short / ushort", behavior: "Signed / unsigned 16-bit integer.", when: "Interop, binary formats. Rare in app code — int is the default." },
      { syntax: "int / uint", behavior: "Signed / unsigned 32-bit integer. int is the default integer type.", when: "Default integer math. uint for bit patterns and sizes." },
      { syntax: "long / ulong", behavior: "Signed / unsigned 64-bit integer. Suffix `L` / `UL`.", when: "Timestamps, IDs, large counters. BigInteger for >2^63." },
      { syntax: "float / double", behavior: "IEEE-754 single/double. double is the default. Suffix `f` for float.", when: "Math. For money use decimal; never float/double for currency." },
      { syntax: "decimal", behavior: "128-bit base-10 decimal — 28-29 significant digits, no float rounding for money.", when: "Money, financial calculations. Slower than double but exact." },
      { syntax: "char", behavior: "16-bit UTF-16 code unit — NOT a code point. 0..65535.", when: "Single UTF-16 units. For code points use StringInfo or Rune (System.Text)." },
      { syntax: "bool", behavior: "true/false only. Default is false (not 0). Cannot convert to/from int.", when: "Logic. No truthy/falsy — `if (count)` is a compile error." },
    ],
    collections: [
      { syntax: "T[] / Array<T>", behavior: "Fixed-size contiguous array. Bounds-checked by the runtime (Corruption-free).", when: "Default sequence. Span<T> for views, List<T> for dynamic." },
      { syntax: "List<T>", behavior: "Dynamic array — amortized O(1) Add, O(n) Insert at front. Default dynamic collection.", when: "Default mutable list. Use Capacity to preallocate." },
      { syntax: "IReadOnlyList<T>", behavior: "Read-only interface over List<T>/arrays — no mutation contract.", when: "Public API surface. Prefer over List<T> in return types." },
      { syntax: "Dictionary<K, V>", behavior: "Hash map — O(1) avg lookup/insert. Insertion order NOT preserved (unlike Java).", when: "Default key-value store. Use ConcurrentDictionary for shared maps." },
      { syntax: "HashSet<T> / SortedSet<T>", behavior: "Hash / red-black tree set. HashSet is O(1) avg; SortedSet is sorted, O(log n).", when: "Dedup, membership. SortedSet for range queries." },
      { syntax: "Queue<T> / Stack<T>", behavior: "FIFO / LIFO — backed by arrays, O(1) enqueue/dequeue.", when: "Worklists, BFS, DFS. ConcurrentQueue for cross-thread." },
      { syntax: "Span<T> / ReadOnlySpan<T>", behavior: "Stack-only view over contiguous memory — array, string, native.", when: "Hot paths, parsing, interop. The foundation of modern perf BCL." },
      { syntax: "Memory<T> / ReadOnlyMemory<T>", behavior: "Heap-ownable counterpart to Span<T> — can be stored in fields, awaited.", when: "Async I/O buffers, pipelines. Pair with IMemoryOwner<T> for pooling." },
      { syntax: "ImmutableArray<T> / ImmutableList<T>", behavior: "Immutable collections — structural sharing, thread-safe by construction.", when: "Functional pipelines, snapshots, pure data flows." },
    ],
    custom: [
      { syntax: "class C : B { ... }", behavior: "Reference type on the GC heap; single inheritance; methods non-virtual by default.", when: "Default object type. Use struct/record for value semantics." },
      { syntax: "struct S { ... }", behavior: "Value type — copied on assignment, boxed on cast to object. Stack-allocated (mostly).", when: "Small (<16 bytes), immutable data. Avoid mutable structs." },
      { syntax: "record class C(int X, int Y);", behavior: "Immutable reference record with value-based equality (C# 9+).", when: "DTOs, value types. Pair with `with` for non-destructive mutation." },
      { syntax: "readonly record struct S(int X);", behavior: "Immutable value record with value-based equality (C# 10+).", when: "Small value DTOs. Preferred over plain struct for new code." },
      { syntax: "interface I { void M(); }", behavior: "Type contract — multiple interfaces per class; default methods since C# 8.", when: "APIs, polymorphism. Static virtual members (C# 11+) enable trait-like math." },
      { syntax: "enum E { A, B, C }", behavior: "Named integer constants; underlying type int by default. No methods, no namespaces.", when: "Closed value sets. Add [Flags] for bit-flag enums." },
      { syntax: "delegate void D(int x);", behavior: "Named function pointer type — the pre-lambda callback idiom.", when: "Event handlers, .NET BCL APIs. Mostly replaced by Func/Action in modern code." },
      { syntax: "abstract class C { abstract void M(); }", behavior: "Partial implementation — subclass completes it. Single inheritance only.", when: "Library base classes. Prefer interface + default methods in new code." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b, a % b", behavior: "Arithmetic — int overflow wraps silently in unchecked mode (default), throws in checked. Integer / truncates.", when: "Math. Use `checked { ... }` for overflow detection; Math.BigMul for 64-bit products." },
    { syntax: "a++, ++a, a--, --a", behavior: "Pre/post increment — pre returns the new value, post returns the old.", when: "Iteration. Pre-increment is marginally faster for non-trivial indexers (no temp copy)." },
    { syntax: "a == b, a != b", behavior: "Equality — for value types compares content; for reference types compares references (unless overloaded).", when: "Use Object.ReferenceEquals for identity; `==` for value-types and overloaded refs (string)." },
    { syntax: "a.Equals(b)", behavior: "Virtual content equality — overridden in record/string/value types; identity in object.", when: "Reference types where `==` is overloaded but you need a virtual call." },
    { syntax: "a < b, a > b, a <= b, a >=", behavior: "Comparison — primitives only; no operator overloading for reference types unless defined.", when: "Primitives. Implement IComparable<T> for sorting custom types." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — operands must be bool (no truthy/falsy).", when: "Logic. `&` and `|` evaluate both sides — usually a bug on bools." },
    { syntax: "a & b, a | b, a ^ b, ~a", behavior: "Bitwise AND/OR/XOR/NOT — int/long only. Bool operands allowed (no short-circuit).", when: "Bit flags, masks. Pair with [Flags] enum for type safety." },
    { syntax: "a << n, a >> n", behavior: "Left / right shift. Right shift on signed is arithmetic (sign-extending), on unsigned is logical.", when: "Low-level bit ops. C# has no `>>>` — use unsigned types for logical shift." },
    { syntax: "a ? b : c", behavior: "Ternary — both branches must have a common type. Conditional ref returns since C# 7.2.", when: "Concise conditional expression. Avoid nesting." },
    { syntax: "a ?? b", behavior: "Null-coalescing — returns b only if a is null. C# 8+ form `a ??= b` assigns when null.", when: "Default values. `??` doesn't trigger `||`-style falsy — only null." },
    { syntax: "a?.b?.c, a?[i]", behavior: "Null-conditional — short-circuits to null if any link is null. Returns Nullable<T> for value types.", when: "Deep property access on nullable graphs. `obj?.Method()` returns a Task? if async." },
    { syntax: "is, as", behavior: "`x is T` is a type test returning bool; `x as T` returns T or null (no throw). Pattern form `x is T t` binds.", when: "Type narrowing. Prefer `is` pattern over `as` + null check." },
    { syntax: "switch (e) { case X => ... }", behavior: "Switch — arrow form (C# 8+) doesn't fall through. Patterns: type, property, list, positional.", when: "Multi-branch dispatch. Use with records + sealed hierarchies for ADT-style exhaustiveness." },
    { syntax: "=> (expression-bodied)", behavior: "Expression-bodied members — `int X => _x;` for properties, `void M() => ...;` for methods.", when: "Single-expression members. Concise but don't overuse for complex logic." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "csharp",
      caption: "File I/O — File, FileStream, StreamReader (with async)",
      code: `using System.IO;

// Small file — read all at once
string text = await File.ReadAllTextAsync("cfg.json");
string[] lines = await File.ReadAllLinesAsync("huge.log");

// Large file — stream line by line, async
using var sr = new StreamReader("huge.log");
while (await sr.ReadLineAsync() is { } line) {
  if (line.Contains("ERROR")) Console.Error.WriteLine(line);
}

// Write — atomic move via temp file pattern
await File.WriteAllTextAsync("out.txt", "hello");`,
    },
    {
      lang: "csharp",
      caption: "stdin / stdout / stderr — Console",
      code: `// Stream stdin to uppercased stdout
string line;
while ((line = Console.ReadLine()) is not null) {
  Console.WriteLine(line.ToUpper());
}

// stderr — separate stream
Console.Error.WriteLine("warning: deprecated API");

// JSON over stdin/stdout — common in CLI tools invoked from other langs
using var stdin = Console.OpenStandardInput();
using var stdout = Console.OpenStandardOutput();
var payload = await JsonSerializer.DeserializeAsync<Request>(stdin);
await JsonSerializer.SerializeAsync(stdout, Transform(payload));`,
    },
    {
      lang: "csharp",
      caption: "JSON — System.Text.Json with source generation",
      code: `using System.Text.Json;
using System.Text.Json.Serialization;

// Source generator — compile-time serialization code (no runtime reflection)
[JsonSerializable(typeof(User))]
public partial class AppContext : JsonSerializerContext {}

public record User(int Id, string Email, string Role);

var user = new User(42, "a@b.io", "admin");
string json = JsonSerializer.Serialize(user, AppContext.Default.User);
User back = JsonSerializer.Deserialize(json, AppContext.Default.User)!;

// Stream-based — for large payloads
await using var fs = File.OpenWrite("users.json");
await JsonSerializer.SerializeAsync(fs, users, AppContext.Default.IEnumerableUser);`,
    },
    {
      lang: "csharp",
      caption: "HttpClient — typed clients, retry via Polly",
      code: `// HttpClient — should NOT be disposed; use IHttpClientFactory in DI
services.AddHttpClient<ApiService>(c => {
  c.BaseAddress = new Uri("https://api.example.com");
  c.Timeout = TimeSpan.FromSeconds(10);
})
.AddTransientHttpErrorPolicy(p => p.WaitAndRetryAsync(3,
    attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt))));

// Or with Microsoft.Extensions.Http.Resilience (.NET 8+)
services.AddHttpClient<ApiService>()
  .AddStandardResilienceHandler();

// Inside the service
public class ApiService(HttpClient http) {
  public async Task<User?> GetUser(int id) =>
    await http.GetFromJsonAsync<User>($"/users/{id}");
}`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "csharp",
      caption: "foreach, LINQ, indexed",
      code: `var items = new[] { "a", "b", "c" };

// foreach — works on anything IEnumerable<T>; no index
foreach (var s in items) {
  Console.WriteLine(s);
}

// Index + value — using LINQ Select (slower) or .NET 9 Index()
foreach (var (i, s) in items.Index()) {
  Console.WriteLine($"{i}: {s}");
}

// Span-based iteration — zero-allocation, fastest
ReadOnlySpan<string> span = items;
foreach (var s in span) Console.WriteLine(s);`,
    },
    {
      lang: "csharp",
      caption: "LINQ — declarative pipelines (lazy)",
      code: `using System.Linq;

var users = new[] {
  new User(1, "admin", true),
  new User(2, "member", false),
};

// Lazy pipeline — runs only on enumeration (ToList, ToArray, Count, etc.)
var activeAdminIds = users
  .Where(u => u.Role == "admin")
  .Where(u => u.Active)
  .Select(u => u.Id)
  .OrderBy(id => id)
  .ToArray();

// GroupBy — deferred until enumerated
var byRole = users.GroupBy(u => u.Role)
  .ToDictionary(g => g.Key, g => g.ToArray());

// Avoid LINQ in hot paths — explicit loops are 3-10x faster.`,
    },
    {
      lang: "csharp",
      caption: "Iterators + yield — lazy generators",
      code: `// Iterator method — compiled to a state machine; lazy
IEnumerable<int> Naturals(int start = 0) {
  while (true) yield return start++;
}

IEnumerable<int> Take<T>(IEnumerable<T> source, int n) {
  int i = 0;
  foreach (var x in source) {
    if (i++ >= n) yield break;
    yield return x;
  }
}

// First 10 squares — O(1) memory
var squares = Take(Naturals().Select(n => n * n), 10).ToArray();

// async streams (C# 8) — IAsyncEnumerable<T>
async IAsyncEnumerable<int> PaginateAsync(string url, [EnumeratorCancellation] CancellationToken ct = default) {
  // ... yield items as they arrive
}`,
    },
    {
      lang: "csharp",
      caption: "while, do-while, ref returns",
      code: `// while — condition checked first
while (queue.TryDequeue(out var item)) {
  Process(item);
}

// do-while — body runs at least once
int c;
do { c = Console.Read(); } while (c != 'y' && c != 'n');

// ref return — return aliases to a slot (C# 7)
ref int Find(int[] arr, int target) {
  for (int i = 0; i < arr.Length; i++)
    if (arr[i] == target) return ref arr[i];
  throw new InvalidOperationException();
}
Find(arr, 42) = 99;  // mutates arr in place`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "csharp",
      caption: "Lambdas, delegates,Func/Action",
      code: `using System;

// Func<T, R> — input -> output
Func<int, int> square = x => x * x;

// Action<T> — input -> void
Action<string> log = msg => Console.WriteLine(msg);

// Closure — captures variables by reference
int threshold = 10;
Func<int, bool> above = x => x > threshold;

// Multi-statement lambda
Func<int, int> fib = n => {
  if (n < 2) return n;
  int a = 0, b = 1;
  for (int i = 0; i < n; i++) (a, b) = (b, a + b);
  return a;
};

// Method group conversion — concise delegate creation
Func<string, int> len = GetStringLength;  // or just s => s.Length`,
    },
    {
      lang: "csharp",
      caption: "Generics — constraints, variance, reified types",
      code: `// Constraint — T must implement IComparable<T>
T Max<T>(T a, T b) where T : IComparable<T> =>
  a.CompareTo(b) >= 0 ? a : b;

// Reified at runtime — List<int> and List<string> are distinct types
Type t1 = typeof(List<int>);     // List<int>
Type t2 = typeof(List<string>);  // List<string>
Console.WriteLine(t1 == t2);     // False

// Variance — out (covariant), in (contravariant)
interface IEnumerable<out T> { ... }  // T appears only in output positions
interface IComparer<in T> { ... }     // T appears only in input positions

// 'new()' constraint — allows new T()
T Factory<T>() where T : new() => new T();`,
    },
    {
      lang: "csharp",
      caption: "Local functions + static lambdas",
      code: `// Local function — visible only inside the containing method
int SumOfSquares(int[] xs) {
  int sq(int x) => x * x;        // local function
  return xs.Sum(sq);
}

// Static lambda — cannot capture locals (C# 9)
// Prevents accidental closure allocations in hot paths
Func<int, int> square = static x => x * x;

// Async iterators + local functions
async Task ProcessAsync(IEnumerable<int> xs) {
  foreach (var x in xs) await Task.Delay(x);
}`,
    },
    {
      lang: "csharp",
      caption: "Pattern matching — switch expressions, property patterns",
      code: `decimal CalcFee(Subscription s) => s switch {
  { Tier: Tier.Free }                       => 0m,
  { Tier: Tier.Pro, Annual: true }          => 99m,
  { Tier: Tier.Pro }                        => 10m,
  { Tier: Tier.Enterprise, Seats: var n }   => n * 25m,
  _ => throw new ArgumentException("unknown tier")
};

// List patterns (C# 11)
int SumHead(int[] arr) => arr switch {
  []              => 0,
  [var h, ..]     => h,
  _               => 0
};

// Tuple patterns
string Classify(int x, int y) => (x, y) switch {
  (0, 0)   => "origin",
  (0, _)   => "y-axis",
  (_, 0)   => "x-axis",
  _        => "other",
};`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "csharp",
      caption: "try / catch / finally + exception filters",
      code: `try {
  var data = Parse(input);
  Process(data);
} catch (ParseException ex) when (ex.Line is > 0) {
  Console.Error.WriteLine($"parse failed at line {ex.Line}: {ex.Message}");
} catch (Exception ex) {
  Console.Error.WriteLine($"unexpected: {ex}");
  throw;  // re-throw preserving the stack
} finally {
  Cleanup();  // always runs, even on return
}

// 'when' filters — examine context before catching; useful for logging
// without swallowing, or for conditional recovery.`,
    },
    {
      lang: "csharp",
      caption: "Custom exception hierarchy",
      code: `public class AppException : Exception {
  public string Code { get; }
  public AppException(string msg, string code, Exception? inner = null)
    : base(msg, inner) { Code = code; }
}

public class NotFoundException : AppException {
  public NotFoundException(string what, object id)
    : base($"{what} {id} not found", "NOT_FOUND") {}
}

// Throw:
throw new NotFoundException("user", 42);

// Caller-side: catch by type; .InnerException walks the chain
try { await Load(id); }
catch (NotFoundException ex) when (ex.Code == "NOT_FOUND") {
  return Results.NotFound(ex.Message);
}`,
    },
    {
      lang: "csharp",
      caption: "Result type via discriminated union (OneOf library)",
      code: `using OneOf;

// OneOf<T0, T1, ...> — discriminated union; pattern-match on .Match
public OneOf<User, NotFound, ValidationError> FindUser(int id) {
  if (id < 0) return new ValidationError("negative id");
  var user = _db.Find(id);
  return user is null ? new NotFound(id) : user;
}

var result = FindUser(42);
result.Switch(
  user => Console.WriteLine(user.Name),
  notFound => Console.Error.WriteLine($"not found: {notFound.Id}"),
  error => Console.Error.WriteLine(error.Message)
);

// Or TIE — Task<OneOf<T, E>> for async, no exceptions across boundaries.`,
    },
    {
      lang: "csharp",
      caption: "IDisposable + using declaration — deterministic cleanup",
      code: `public sealed class DbTx : IDisposable {
  private readonly DbConnection _conn;
  private bool _committed, _disposed;

  public DbTx(DbConnection c) => _conn = c;
  public void Commit() { _conn.Commit(); _committed = true; }

  public void Dispose() {
    if (_disposed) return;
    if (!_committed) _conn.Rollback();
    _conn.Dispose();
    _disposed = true;
  }
}

// C# 8+ using declaration — Dispose at scope exit
using var tx = new DbTx(conn);
// ... work ...
tx.Commit();   // rollback runs at scope exit if we throw before here

// IAsyncDisposable — for async cleanup (DbConnection, Stream)
await using var conn = new SqlConnection(cs);`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "csharp",
      caption: "async/await — Task, ConfigureAwait, cancellation",
      code: `public async Task<User> LoadAsync(int id, CancellationToken ct = default) {
  using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
  cts.CancelAfter(TimeSpan.FromSeconds(5));

  var user = await _db.Users
      .AsNoTracking()
      .FirstOrDefaultAsync(u => u.Id == id, cts.Token)
      .ConfigureAwait(false);   // library code: drop sync context

  return user ?? throw new NotFoundException("user", id);
}

// Library author rule: ALWAYS use ConfigureAwait(false)
// App code (UI): NEVER use it — you need the sync context back.`,
    },
    {
      lang: "csharp",
      caption: "Task.WhenAll / WhenAny — fan-out + merge",
      code: `// WhenAll — waits for all; throws AggregateException on any failure
var users = await Task.WhenAll(ids.Select(id => GetUserAsync(id)));

// WhenAny — first to complete wins
var first = await Task.WhenAny(urls.Select(u => FetchAsync(u)));
var body = await first;  // unwrap

// Parallel.ForEach — for CPU-bound work (not async)
Parallel.ForEach(items, new ParallelOptions {
  MaxDegreeOfParallelism = Environment.ProcessorCount,
}, item => Compute(item));

// Parallel.ForEachAsync (.NET 6+) — async-friendly
await Parallel.ForEachAsync(urls, async (url, ct) => {
  await FetchAsync(url, ct);
});`,
    },
    {
      lang: "csharp",
      caption: "Channels — bounded producer/consumer",
      code: `using System.Threading.Channels;

var channel = Channel.CreateBounded<int>(100);

// Producer
async Task ProduceAsync() {
  for (int i = 0; ; i++) {
    await channel.Writer.WriteAsync(i);
    if (i == 1000) { channel.Writer.Complete(); return; }
  }
}

// Consumer
async Task ConsumeAsync() {
  await foreach (var item in channel.Reader.ReadAllAsync()) {
    Process(item);
  }
}

await Task.WhenAll(ProduceAsync(), ConsumeAsync());`,
    },
    {
      lang: "csharp",
      caption: "lock vs Monitor vs ReaderWriterLockSlim",
      code: `// lock — built-in, reentrant, simplest
lock (_sync) { /* ... */ }

// Monitor — explicit, supports TryEnter / Wait / Pulse
Monitor.TryEnter(_sync, TimeSpan.FromSeconds(1), ref gotLock);

// ReaderWriterLockSlim — multiple readers OR one writer
using var rw = new ReaderWriterLockSlim();
rw.EnterReadLock();
try { /* read */ } finally { rw.ExitReadLock(); }
rw.EnterWriteLock();
try { /* write */ } finally { rw.ExitWriteLock(); }

// SemaphoreSlim — async-friendly cross-thread counter
using var sem = new SemaphoreSlim(8);
await sem.WaitAsync();
try { /* ... */ } finally { sem.Release(); }`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "csharp",
      caption: "xUnit — facts, theories, async",
      code: `using Xunit;

public class CartTests {
  [Fact]
  public void AddsItem() {
    var cart = new Cart();
    cart.Add(new Item("x", 100));
    Assert.Equal(100, cart.Total());
  }

  [Theory]
  [InlineData(1, 2, 3)]
  [InlineData(10, 5, 15)]
  public void Adds(int a, int b, int expected) =>
    Assert.Equal(expected, a + b);

  [Fact]
  public async Task LoadsAsync() {
    var svc = new UserService(_db);
    var u = await svc.LoadAsync(42);
    Assert.NotNull(u);
  }
}`,
    },
    {
      lang: "csharp",
      caption: "FluentAssertions + NSubstitute + Moq",
      code: `using FluentAssertions;
using NSubstitute;

// FluentAssertions — readable, rich failure messages
cart.Total().Should().Be(100).And.NotBeNegative();
users.Should().HaveCount(2).And.OnlyContain(u => u.Active);

// NSubstitute — terse mocking syntax
var repo = Substitute.For<IUserRepo>();
repo.FindById(42).Returns(new User(42, "alice"));

var svc = new UserService(repo);
svc.GetName(42).Should().Be("alice");
repo.Received(1).FindById(42);

// Moq — alternative; more explicit but more verbose
var mock = new Mock<IUserRepo>();
mock.Setup(r => r.FindById(42)).Returns(new User(42, "alice"));`,
    },
    {
      lang: "csharp",
      caption: "FsCheck / csharp property-based testing",
      code: `using FsCheck;
using FsCheck.Xunit;

// Property — framework generates inputs
[Property]
public bool SortIsIdempotent(int[] xs) {
  var once = xs.OrderBy(x => x).ToArray();
  var twice = once.OrderBy(x => x).ToArray();
  return once.SequenceEqual(twice);
}

// Run: dotnet test --filter "FullyQualifiedName~SortIsIdempotent"
// FsCheck shrinks failing cases to the minimal reproducer.`,
    },
    {
      lang: "csharp",
      caption: "BenchmarkDotNet — the only valid .NET microbenchmark",
      code: `using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Running;

[MemoryDiagnoser]
public class SumBench {
  private int[] _data = Enumerable.Range(0, 1000).ToArray();

  [Benchmark]
  public int Linq() => _data.Sum();

  [Benchmark]
  public int ForLoop() {
    int s = 0;
    for (int i = 0; i < _data.Length; i++) s += _data[i];
    return s;
  }
}

// Run: BenchmarkRunner.Run<SumBench>();
// Output: mean, std dev, allocations, GC gen-0 collections — never trust a stopwatch.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "JIT compiles per-method on first call; tiered compilation (default since .NET Core 3) tiers C1→C2 — microbenchmarks need explicit warmup.", tag: "perf" },
    { fact: "Span<T> / Memory<T> are zero-allocation views over arrays/strings/native memory — the foundation of modern perf-oriented BCL.", tag: "perf" },
    { fact: "Value types (struct) are copied on assignment and boxed when cast to object — avoid in hot paths that touch `object`.", tag: "perf" },
    { fact: "Generics are reified — `List<int>` has no boxing; the JIT generates specialized code per value type.", tag: "perf" },
    { fact: "Dictionary<K,V>: O(1) average lookup, may degrade with bad hashers; ConcurrentDictionary is striped (faster than a single lock).", tag: "complexity" },
    { fact: "async/await compiles to a state machine per method; allocation of the state machine box is elided when the task completes synchronously.", tag: "perf" },
    { fact: "String interning: literal strings are interned; `string.Intern(s)` adds runtime strings — usually not worth it.", tag: "gotcha" },
    { fact: "ObjectDisposedException is thrown by a disposed object's methods if you implemented the pattern correctly — never swallow it; it's a sign of a use-after-dispose bug.", tag: "gotcha" },
    { fact: "Source generators run at compile time, emit additional C# — used for regex, JSON, logging, dependency injection; the modern alternative to reflection.", tag: "version" },
    { fact: "Native AOT (NET 8+) produces a single self-contained binary with sub-50ms startup — but no runtime codegen, so reflection-emit is unsupported.", tag: "version" },
    { fact: "`Task.Run` for CPU-bound work only; for I/O, use the natural async API — `Task.Run(() => ReadAsync())` adds a thread-pool hop for nothing.", tag: "perf" },
    { fact: "LINQ hides multiple enumeration and allocations — materialize with ToList if used more than once; closures over locals allocate per-call.", tag: "gotcha" },
    { fact: "C# naming: PascalCase for public members, camelCase for locals/params, _camelCase for private fields. StyleCop/Analyzers enforce.", tag: "version" },
    { fact: "BenchmarkDotNet is the standard microbenchmark tool — never trust a Stopwatch; the JIT will fool you.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: ".NET SDK", purpose: "The runtime + SDK — includes Roslyn compiler, JIT, GC, BCL. Cross-platform since .NET Core.", url: "https://dotnet.microsoft.com/", category: "build" },
    { tool: "MSBuild", purpose: "The default build system — verbose, XML-based; project files (.csproj).", url: "https://learn.microsoft.com/visualstudio/msbuild/", category: "build" },
    { tool: "dotnet CLI", purpose: "Command-line interface for building, testing, packaging — `dotnet build`, `dotnet test`, `dotnet publish`.", url: "https://learn.microsoft.com/dotnet/core/tools/", category: "build" },
    { tool: "NuGet", purpose: "The .NET package manager — `dotnet add package` — largest .NET package registry.", url: "https://www.nuget.org/", category: "package" },
    { tool: "Paket", purpose: "Alternative package manager — better version resolution; used in F# community.", url: "https://fsprojects.github.io/Paket/", category: "package" },
    { tool: "Roslyn analyzers", purpose: "Live static analyzers built into the compiler — Code Quality, Style, Performance rules.", url: "https://learn.microsoft.com/visualstudio/code-quality/", category: "lint" },
    { tool: "StyleCop", purpose: "Style enforcer — configurable rules for naming, layout, documentation.", url: "https://github.com/StyleCop/StyleCop", category: "lint" },
    { tool: "SonarAnalyzer", purpose: "Code-quality analyzer — bugs, vulnerabilities, code smells; integrates with SonarQube.", url: "https://www.sonarsource.com/csharp/", category: "lint" },
    { tool: "xUnit", purpose: "The standard test framework for modern .NET — facts, theories, async support.", url: "https://xunit.net/", category: "test" },
    { tool: "NUnit", purpose: "Older test framework — still common; parameterized tests, classic assertions.", url: "https://nunit.org/", category: "test" },
    { tool: "Moq / NSubstitute", purpose: "Mocking frameworks — NSubstitute is terser, Moq is more explicit.", url: "https://nsubstitute.github.io/", category: "test" },
    { tool: "FluentAssertions", purpose: "Fluent assertion library — far more readable than xUnit's built-in Assert.", url: "https://fluentassertions.com/", category: "test" },
    { tool: "FsCheck", purpose: "Property-based testing — F#-origin, usable from C#; Hypothesis-style shrinking.", url: "https://fscheck.github.io/FsCheck/", category: "test" },
    { tool: "BenchmarkDotNet", purpose: "The standard .NET microbenchmark library — statistically rigorous, the only valid benchmark tool.", url: "https://benchmarkdotnet.org/", category: "test" },
    { tool: "Testcontainers", purpose: "Spin up real Docker dependencies (Postgres, Kafka, Redis) for integration tests.", url: "https://dotnet.testcontainers.org/", category: "test" },
    { tool: "dotnet-trace / dotnet-dump / PerfView", purpose: "Diagnostic tools — dotnet-trace for CPU profiles, PerfView for ETW analysis on Windows.", url: "https://learn.microsoft.com/dotnet/core/diagnostics/", category: "debug" },
    { tool: "Visual Studio / Rider", purpose: "Primary IDEs — VS is Microsoft's, Rider is JetBrains' cross-platform alternative.", url: "https://www.jetbrains.com/rider/", category: "debug" },
    { tool: "ASP.NET Core", purpose: "Web/service framework — Kestrel server, MVC/minimal APIs, EF Core, DI built in.", url: "https://learn.microsoft.com/aspnet/core/", category: "deploy" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "C# 1.0",  year: 2002, highlight: "First release with .NET Framework 1.0 — classes, structs, delegates, exceptions." },
    { version: "C# 2.0",  year: 2005, highlight: "Generics (reified), nullable types, anonymous methods, iterators (yield)." },
    { version: "C# 3.0",  year: 2007, highlight: "LINQ, lambdas, extension methods, anonymous types, var — the language-defining release." },
    { version: "C# 4.0",  year: 2010, highlight: "Dynamic typing (dynamic keyword), named/optional args, COM interop improvements." },
    { version: "C# 5.0",  year: 2012, highlight: "async/await, caller info attributes — the async revolution." },
    { version: "C# 6.0",  year: 2015, highlight: "Roslyn compiler; string interpolation, null-conditional, expression-bodied members, using static." },
    { version: "C# 7.0",  year: 2017, highlight: "Tuples, pattern matching (basic), local functions, ref returns, deconstruction." },
    { version: "C# 8.0",  year: 2019, highlight: "Nullable reference types, async streams, indices/ranges, switch expressions, default interface methods." },
    { version: "C# 9.0",  year: 2020, highlight: "Records, init-only setters, top-level statements, target-typed new, pattern-matching improvements." },
    { version: "C# 10.0", year: 2021, highlight: "Global usings, file-scoped namespaces, record structs, const interpolated strings." },
    { version: "C# 11.0", year: 2022, highlight: "Static virtual interface members, list patterns, raw string literals, required members." },
    { version: "C# 12.0", year: 2023, highlight: "Primary constructors, collection expressions, inline arrays, ref struct interfaces." },
    { version: "C# 13.0", year: 2024, highlight: "params collections, `field` contextual keyword, partial properties, lock object improvements." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between `class` and `struct` in C#?", a: "Classes are reference types on the GC heap (heap-allocated, garbage-collected, default reference equality). Structs are value types (copied on assignment, stack-allocated for locals, boxed when cast to object). Use structs for small (<16 byte) immutable values; never make mutable structs (silent copy bugs). Always override Equals/GetHashCode for struct performance (default uses reflection).", difficulty: "easy" },
    { q: "Explain async/await — what does it actually do?", a: "An async method compiles to a state machine. `await` checks if the awaited task is complete; if so it returns the result synchronously, otherwise it suspends the method, registers a continuation, and returns control to the caller (without blocking the thread). When the task completes, the continuation runs — usually on the captured SynchronizationContext (UI) or the thread pool (server). Use ConfigureAwait(false) in library code to drop the context.", difficulty: "medium" },
    { q: "What are nullable reference types, and how are they enforced?", a: "NRTs (C# 8+) are compile-time annotations: `string?` may be null, `string` should not be. The compiler emits warnings for unsafe dereferences. They're NOT enforced at runtime — deserialization can put null into a non-nullable reference. Use ArgumentNullException.ThrowIfNull at boundaries. Treat NRTs as static analysis, not a runtime guarantee.", difficulty: "medium" },
    { q: "Explain records and the `with` expression.", a: "Records (C# 9+) are reference types with value-based equality and immutability by default. The compiler generates Equals, GetHashCode, ToString, and a copy constructor. `with` creates a new instance with specified changes: `var u2 = u1 with { Email = \"new\" };`. Use for DTOs, value types. `record struct` (C# 10) gives the same for value types.", difficulty: "easy" },
    { q: "What does `ConfigureAwait(false)` do, and when should you use it?", a: "It tells the awaiter NOT to capture the SynchronizationContext — the continuation runs on the thread pool instead of marshaling back to the UI thread. Use it in every library's async code (libraries shouldn't depend on the host's sync context). Never use it in UI app code where you need to update controls after the await. ASP.NET Core has no sync context, so it's a no-op there but harmless.", difficulty: "medium" },
    { q: "How does the .NET GC work?", a: "Generational (gen 0, 1, 2) + large object heap (LOH for ≥85k bytes). Gen-0 collections are frequent and cheap (short-lived objects); gen-2 is full GC and expensive. Server GC vs workstation GC affects throughput. Objects arecompacted (gen 0/1) or just swept (LOH). Pinning (fixed, GCHandle) prevents compaction — avoid long-lived pins. .NET 5+ has LOH compaction on demand.", difficulty: "hard" },
    { q: "What is Span<T>, and why is it important?", a: "Span<T> (C# 7.2) is a stack-only ref struct wrapping a pointer + length — a view over contiguous memory (arrays, strings, native). It enables zero-allocation parsing, slicing, and interop. The ref-struct constraint keeps it off the heap (no boxing, no fields of non-span types). Memory<T> is the heap-storable counterpart. The BCL was rewritten around Span<T> in .NET Core 2.1 — major perf win.", difficulty: "hard" },
    { q: "How are C# generics different from Java's?", a: "C# generics are reified — `List<int>` is a distinct type at runtime, with specialized JIT code per value type (no boxing). Java's are erased — `List<Integer>` and `List<String>` share one runtime class, requiring autoboxing. C# can do `new T()`, `typeof(T)`, runtime reflection on type args; Java cannot. C# wins on performance (no boxing) and runtime introspection.", difficulty: "medium" },
    { q: "What are source generators, and why do they matter?", a: "Source generators (C# 9+) run at compile time and emit additional C# code — `Regex`, `JsonSerializerContext`, logging, DI registration. They replace runtime reflection (slow, trim-unfriendly) with compile-time codegen (fast, AOT-compatible). Native AOT requires source-generated code for JSON and DI; reflection-based code is incompatible with trimming.", difficulty: "medium" },
    { q: "Explain the difference between `Task` and `ValueTask`.", a: "Task is a reference type — always allocates unless cached. ValueTask<T> is a struct that can wrap either a T (synchronous success) or a Task<T> (async). Use ValueTask when the method usually completes synchronously (cache hits, fast paths) to avoid allocation. Caveat: ValueTask can only be awaited once; don't store it or await twice. Most code should use Task.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Java", whenThis: "Windows-first shops, Unity game development, modern back-ends wanting LINQ + async + records + source generators.", whenThat: "Cross-platform enterprise back-ends, big-data infrastructure (Kafka, Spark), Android (Java/Kotlin)." },
    { vs: "F#", whenThis: "Mainstream C-family projects, teams wanting OOP-first with functional features as seasoning.", whenThat: "Functional-first data-heavy domains (finance, data science, ETL), anywhere algebraic data types + type inference shine." },
    { vs: "TypeScript", whenThis: "Back-end services, Windows desktop, Unity games, anything on the .NET runtime.", whenThat: "Frontend web, full-stack JS, edge runtimes — anywhere npm + the browser runtime matter." },
    { vs: "Go", whenThis: "Enterprise back-ends needing rich types + LINQ + async, Windows desktop, game dev.", whenThat: "Cloud-native microservices, CLIs, single-binary deploys — anywhere simplicity wins." },
    { vs: "Python", whenThis: "Performance-critical back-ends, Unity, Windows desktop, anything needing the .NET ecosystem.", whenThat: "Data science / ML, scripting, rapid prototyping — anywhere NumPy/Pandas/PyTorch matter." },
  ],
};

export default sheet;
