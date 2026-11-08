# C#

**Category:** Languages · **Tier:** Tier 1 · Core · **Tags:** static-typing, dotnet, gc, oop, enterprise, backend, game-dev · **First released:** 2000 · **Author:** Anders Hejlsberg (Microsoft) · **Last updated:** 2026-11

> A statically-typed, multi-paradigm .NET language — the default for Windows desktop, game engines (Unity), and modern back-ends.

---

## TL;DR

- C# is a statically-typed, garbage-collected, multi-paradigm language for the .NET runtime — initially Microsoft's answer to Java, now substantially more expressive thanks to LINQ, async, pattern matching, and source generators.
- It dominates Windows desktop (WPF, WinUI), game development via Unity and Godot, enterprise back-ends on ASP.NET Core, and a growing slice of cloud-native services on Azure.
- Reach for C# when you target Windows or the .NET ecosystem, when you build Unity games, or when you want a mature statically-typed language with first-class async and a rich BCL.
- Avoid C# for systems programming (GC pauses, no manual control of value-type layout beyond structs), or where cross-vendor portability matters more than the Microsoft stack does.

## Core Mental Model

**Reference types on the GC heap, value types inline.** C# has a hard split: `class` types are references on the GC heap, `struct` types are values copied inline at every assignment or call. Boxing a struct wraps it in a heap object — silent allocation. Methods are virtual only when marked `virtual`; the default is non-virtual dispatch (faster than Java's). Generic types are reified: `List<int>` is a distinct type from `List<string>`, and the JIT specializes per value type, avoiding boxing. Async methods compile to state machines via `Task` — `await` is a suspension point, not a block. LINQ is a uniform query syntax over IEnumerable/IQueryable that defers execution until enumeration.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| public record User(int Id, string Email); | Immutable reference record with value-based equality (C# 9+). | DTOs, value types; pair with `with` for non-destructive mutation. |
| var u = new { Id = 1, Name = "a" }; | Anonymous type — compiler generates an immutable class. | LINQ projections; never cross method boundaries. |
| async Task<T> F() => await x; | Async method returning a hot task; `await` suspends without blocking the thread. | All I/O — file, network, DB. Never block on async (`.Result`). |
| using var fs = new FileStream(p); | Using declaration — Dispose called at scope exit (C# 8+). | Files, connections, anything IDisposable; replaces try/finally. |
| int? x = null; | Nullable<T> value type; `x.HasValue`/`x.Value` to access. | Optional values from DBs, APIs, JSON. Nullable reference types (8+) are a separate feature. |
| switch (e) { case int i: ...; case [1, .., 5]: ... } | Pattern-matching switch (C# 8+) with type, property, list, and positional patterns. | Replacing if-else chains; exhaustive over enums when default is rejected. |
| IEnumerable<T> Gen() { yield return x; } | Iterator method — lazy, state-machine backed. | Streaming sequences; pipeline stages. |
| Span<T> s = stackalloc int[8]; | Stack-allocated buffer wrapped in a span — no heap allocation. | Hot paths, parsing, interop; the modern way to write allocation-free code. |
| [GeneratedRegex(@"\d+")] static partial Regex R(); | Source generator emits a compiled regex at build time (C# 10+, .NET 7). | Regex hot paths — 5–10x faster than runtime compilation. |
| interface I { static virtual int M() => 0; } | Static interface members (C# 11+) — enables trait-like abstraction. | Generic math, operator constraints; self-implementing interface defaults. |

## Idiomatic Patterns

**Record + pattern matching — algebraic data types in C#**

```csharp
public abstract record Shape;

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
var big = new Circle(5) with { Radius = 10 };
```

**async/await with cancellation and ConfigureAwait**

```csharp
public async Task<User> LoadAsync(
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
// App code (UI): NEVER use it, you need the sync context back.
```

**Span<T> + stackalloc — zero-allocation parsing**

```csharp
public static int ParseInt(ReadOnlySpan<char> s)
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
int n = ParseInt(buf);
```

**IDisposable + using declaration — deterministic cleanup**

```csharp
public sealed class DbTx : IDisposable
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
tx.Commit();   // rollback runs at scope exit if we throw before here
```

## Common Pitfalls

1. **Blocking on async code deadlocks** — *Symptom:* Calling `.Result` or `.Wait()` on a Task in a context with a SynchronizationContext (ASP.NET classic, WinForms, WPF) deadlocks — the continuation waits for the context you're blocking. *Fix:* Use `await` all the way up. If you must block, use `.GetAwaiter().GetResult()` and `.ConfigureAwait(false)` everywhere below. ASP.NET Core has no sync context, so this trap is gone there.
2. **Struct mutation through interface copies** — *Symptom:* Casting a struct to an interface boxes it; mutating via the interface mutates the boxed copy, not the original — silent no-op for the caller. *Fix:* Make structs immutable (record struct or readonly struct). Avoid mutable structs entirely; the cost of subtle bugs dwarfs any perf benefit.
3. **LINQ hides multiple enumeration and allocations** — *Symptom:* `var q = xs.Where(...).Select(...);` enumerates twice if used twice; `Count()` on an `IEnumerable` may walk the whole sequence; closures over locals allocate per-call. *Fix:* Materialize with `.ToList()` if used more than once. Use `.ToLookup`/`.ToDictionary` to avoid re-scans. For hot paths, write explicit loops — LINQ is ~3–10x slower.
4. **Nullable reference types are not enforced at runtime** — *Symptom:* `string x = null!` compiles; the `!` lies to the compiler. JSON deserialization can put null into a non-nullable reference. The NRT feature is compile-time only. *Fix:* Validate at boundaries: `ArgumentNullException.ThrowIfNull(x)`. Treat NRTs as static analysis, not a runtime guarantee. Annotate your DTOs.
5. **Closing over loop variable captures the variable, not the value** — *Symptom:* `foreach (var x in xs) actions.Add(() => x);` — all lambdas return the last x (pre-C# 5 fixed this for `foreach`; the trap survives in `for` loops with captures). *Fix:* C# `foreach` since C# 5 creates a fresh variable per iteration. For `for` loops, copy: `var local = i; actions.Add(() => local);`.
6. **Event handler leaks keep subscribers alive** — *Symptom:* Subscribing `publisher.Event += subscriber.Handler` without unsubscribing keeps the subscriber rooted through the publisher — memory leak across the lifetime of the publisher. *Fix:* Always pair `+=` with `-=` in Dispose. For weak coupling, use weak event patterns (WeakReference or `WeakEventManager`).
7. **`==` operator is not `Equals`** — *Symptom:* `==` for reference types compares references by default (unless overloaded — String does, most classes don't). `String.Equals` and `==` agree, but `Object.ReferenceEquals(a,b)` is the only safe identity check. *Fix:* Use `Equals(a, b)` for content equality. Override `==` only on immutable value-like types, and always implement `IEquatable<T>`.

## Production / Interview Quick Reference

- .NET 10 is LTS (EOL Nov 2028); C# 15/.NET 11 at RC — pin LTS for services. `version`
- .NET 8 (LTS, Nov 2023) added primary constructors, collection expressions; C# 13/.NET 9 (Nov 2024) previewed the `field` keyword (stable in C# 14); cadence is annual LTS every even year. `version`
- JIT compiles per-method on first call; tiered compilation (default since .NET Core 3) tiers C1→C2 — microbenchmarks need explicit warmup. `perf`
- Span<T> / Memory<T> are zero-allocation views over arrays/strings/native memory — the foundation of modern perf-oriented BCL. `perf`
- Value types (struct) are copied on assignment and boxed when boxed as object — avoid in hot paths that touch `object`. `perf`
- Generics are reified — `List<int>` has no boxing; the JIT generates specialized code per value type. `perf`
- Dictionary<K,V>: O(1) average lookup, may degrade with bad hashers; ConcurrentDictionary is striped (faster than a single lock). `complexity`
- async/await compiles to a state machine per method; allocation of the state machine box is elided when the task completes synchronously. `perf`
- String interning: literal strings are interned; `string.Intern(s)` adds runtime strings — usually not worth it. `gotcha`
- ObjectDisposedException is thrown by a disposed object's methods if you implemented the pattern correctly — never swallow it; it's a sign of a use-after-dispose bug. `gotcha`
- Source generators run at compile time, emit additional C# — used for regex, JSON, logging, dependency injection; the modern alternative to reflection. `version`
- Native AOT (NET 8+) produces a single self-contained binary with sub-50ms startup — but no runtime codegen, so reflection-emit is unsupported. `version`
- `Task.Run` for CPU-bound work only; for I/O, use the natural async API — `Task.Run(() => ReadAsync())` adds a thread-pool hop for nothing. `perf`
- C# naming: PascalCase for public members, camelCase for locals/params, _camelCase for private fields. StyleCop/Analyzers enforce. `style`

## Go Deeper

- [C# Language Specification — Microsoft Learn](https://learn.microsoft.com/dotnet/csharp/language-reference/) — Authoritative language reference; the definitive source for operator precedence, patterns, and async semantics.
- [C# in Depth (Jon Skeet, 4th ed.)](https://csharpindepth.com/) — The canonical book on the evolution from C# 1 to modern — best treatment of generics, delegates, and async internals.
- [.NET Docs — Microsoft Learn](https://learn.microsoft.com/dotnet/) — Official API reference, runtime design notes, and per-version migration guides.
- [CLR via C# (Jeffrey Richter)](https://www.oreilly.com/library/view/clr-via-c/9780735668733/) — The deep dive into the runtime — GC, assembly loading, AppDomains, threading internals.
- [Performance Tips — .NET GitHub](https://github.com/dotnet/performance/blob/main/docs/microbenchmark-design.md) — Microsoft's own guidance on writing accurate .NET microbenchmarks; benchmarkdotnet is the standard tool.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| sbyte / byte | Signed / unsigned 8-bit integer. byte is unsigned by default (unlike C/C++). | Binary protocols, byte buffers. Span<byte> is the modern idiom. |
| short / ushort | Signed / unsigned 16-bit integer. | Interop, binary formats. Rare in app code — int is the default. |
| int / uint | Signed / unsigned 32-bit integer. int is the default integer type. | Default integer math. uint for bit patterns and sizes. |
| long / ulong | Signed / unsigned 64-bit integer. Suffix `L` / `UL`. | Timestamps, IDs, large counters. BigInteger for >2^63. |
| float / double | IEEE-754 single/double. double is the default. Suffix `f` for float. | Math. For money use decimal; never float/double for currency. |
| decimal | 128-bit base-10 decimal — 28-29 significant digits, no float rounding for money. | Money, financial calculations. Slower than double but exact. |
| char | 16-bit UTF-16 code unit — NOT a code point. 0..65535. | Single UTF-16 units. For code points use StringInfo or Rune (System.Text). |
| bool | true/false only. Default is false (not 0). Cannot convert to/from int. | Logic. No truthy/falsy — `if (count)` is a compile error. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| T[] / Array<T> | Fixed-size contiguous array. Bounds-checked by the runtime (Corruption-free). | Default sequence. Span<T> for views, List<T> for dynamic. |
| List<T> | Dynamic array — amortized O(1) Add, O(n) Insert at front. Default dynamic collection. | Default mutable list. Use Capacity to preallocate. |
| IReadOnlyList<T> | Read-only interface over List<T>/arrays — no mutation contract. | Public API surface. Prefer over List<T> in return types. |
| Dictionary<K, V> | Hash map — O(1) avg lookup/insert. Insertion order NOT preserved (unlike Java). | Default key-value store. Use ConcurrentDictionary for shared maps. |
| HashSet<T> / SortedSet<T> | Hash / red-black tree set. HashSet is O(1) avg; SortedSet is sorted, O(log n). | Dedup, membership. SortedSet for range queries. |
| Queue<T> / Stack<T> | FIFO / LIFO — backed by arrays, O(1) enqueue/dequeue. | Worklists, BFS, DFS. ConcurrentQueue for cross-thread. |
| Span<T> / ReadOnlySpan<T> | Stack-only view over contiguous memory — array, string, native. | Hot paths, parsing, interop. The foundation of modern perf BCL. |
| Memory<T> / ReadOnlyMemory<T> | Heap-ownable counterpart to Span<T> — can be stored in fields, awaited. | Async I/O buffers, pipelines. Pair with IMemoryOwner<T> for pooling. |
| ImmutableArray<T> / ImmutableList<T> | Immutable collections — structural sharing, thread-safe by construction. | Functional pipelines, snapshots, pure data flows. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class C : B { ... } | Reference type on the GC heap; single inheritance; methods non-virtual by default. | Default object type. Use struct/record for value semantics. |
| struct S { ... } | Value type — copied on assignment, boxed on cast to object. Stack-allocated (mostly). | Small (<16 bytes), immutable data. Avoid mutable structs. |
| record class C(int X, int Y); | Immutable reference record with value-based equality (C# 9+). | DTOs, value types. Pair with `with` for non-destructive mutation. |
| readonly record struct S(int X); | Immutable value record with value-based equality (C# 10+). | Small value DTOs. Preferred over plain struct for new code. |
| interface I { void M(); } | Type contract — multiple interfaces per class; default methods since C# 8. | APIs, polymorphism. Static virtual members (C# 11+) enable trait-like math. |
| enum E { A, B, C } | Named integer constants; underlying type int by default. No methods, no namespaces. | Closed value sets. Add [Flags] for bit-flag enums. |
| delegate void D(int x); | Named function pointer type — the pre-lambda callback idiom. | Event handlers, .NET BCL APIs. Mostly replaced by Func/Action in modern code. |
| abstract class C { abstract void M(); } | Partial implementation — subclass completes it. Single inheritance only. | Library base classes. Prefer interface + default methods in new code. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b, a % b | Arithmetic — int overflow wraps silently in unchecked mode (default), throws in checked. Integer / truncates. | Math. Use `checked { ... }` for overflow detection; Math.BigMul for 64-bit products. |
| a++, ++a, a--, --a | Pre/post increment — pre returns the new value, post returns the old. | Iteration. Pre-increment is marginally faster for non-trivial indexers (no temp copy). |
| a == b, a != b | Equality — for value types compares content; for reference types compares references (unless overloaded). | Use Object.ReferenceEquals for identity; `==` for value-types and overloaded refs (string). |
| a.Equals(b) | Virtual content equality — overridden in record/string/value types; identity in object. | Reference types where `==` is overloaded but you need a virtual call. |
| a < b, a > b, a <= b, a >= | Comparison — primitives only; no operator overloading for reference types unless defined. | Primitives. Implement IComparable<T> for sorting custom types. |
| a && b, a \|\| b, !a | Short-circuit boolean — operands must be bool (no truthy/falsy). | Logic. `&` and `\|` evaluate both sides — usually a bug on bools. |
| a & b, a \| b, a ^ b, ~a | Bitwise AND/OR/XOR/NOT — int/long only. Bool operands allowed (no short-circuit). | Bit flags, masks. Pair with [Flags] enum for type safety. |
| a << n, a >> n | Left / right shift. Right shift on signed is arithmetic (sign-extending), on unsigned is logical. | Low-level bit ops. C# has no `>>>` — use unsigned types for logical shift. |
| a ? b : c | Ternary — both branches must have a common type. Conditional ref returns since C# 7.2. | Concise conditional expression. Avoid nesting. |
| a ?? b | Null-coalescing — returns b only if a is null. C# 8+ form `a ??= b` assigns when null. | Default values. `??` doesn't trigger `\|\|`-style falsy — only null. |
| a?.b?.c, a?[i] | Null-conditional — short-circuits to null if any link is null. Returns Nullable<T> for value types. | Deep property access on nullable graphs. `obj?.Method()` returns a Task? if async. |
| is, as | `x is T` is a type test returning bool; `x as T` returns T or null (no throw). Pattern form `x is T t` binds. | Type narrowing. Prefer `is` pattern over `as` + null check. |
| switch (e) { case X => ... } | Switch — arrow form (C# 8+) doesn't fall through. Patterns: type, property, list, positional. | Multi-branch dispatch. Use with records + sealed hierarchies for ADT-style exhaustiveness. |
| => (expression-bodied) | Expression-bodied members — `int X => _x;` for properties, `void M() => ...;` for methods. | Single-expression members. Concise but don't overuse for complex logic. |

## Input / Output

**File I/O — File, FileStream, StreamReader (with async)**

```csharp
using System.IO;

// Small file — read all at once
string text = await File.ReadAllTextAsync("cfg.json");
string[] lines = await File.ReadAllLinesAsync("huge.log");

// Large file — stream line by line, async
using var sr = new StreamReader("huge.log");
while (await sr.ReadLineAsync() is { } line) {
  if (line.Contains("ERROR")) Console.Error.WriteLine(line);
}

// Write — atomic move via temp file pattern
await File.WriteAllTextAsync("out.txt", "hello");
```

**stdin / stdout / stderr — Console**

```csharp
// Stream stdin to uppercased stdout
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
await JsonSerializer.SerializeAsync(stdout, Transform(payload));
```

**JSON — System.Text.Json with source generation**

```csharp
using System.Text.Json;
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
await JsonSerializer.SerializeAsync(fs, users, AppContext.Default.IEnumerableUser);
```

**HttpClient — typed clients, retry via Polly**

```csharp
// HttpClient — should NOT be disposed; use IHttpClientFactory in DI
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
}
```

## Loops & Iteration

**foreach, LINQ, indexed**

```csharp
var items = new[] { "a", "b", "c" };

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
foreach (var s in span) Console.WriteLine(s);
```

**LINQ — declarative pipelines (lazy)**

```csharp
using System.Linq;

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

// Avoid LINQ in hot paths — explicit loops are 3-10x faster.
```

**Iterators + yield — lazy generators**

```csharp
// Iterator method — compiled to a state machine; lazy
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
}
```

**while, do-while, ref returns**

```csharp
// while — condition checked first
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
Find(arr, 42) = 99;  // mutates arr in place
```

## Functions & Callables

**Lambdas, delegates,Func/Action**

```csharp
using System;

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
Func<string, int> len = GetStringLength;  // or just s => s.Length
```

**Generics — constraints, variance, reified types**

```csharp
// Constraint — T must implement IComparable<T>
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
T Factory<T>() where T : new() => new T();
```

**Local functions + static lambdas**

```csharp
// Local function — visible only inside the containing method
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
}
```

**Pattern matching — switch expressions, property patterns**

```csharp
decimal CalcFee(Subscription s) => s switch {
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
};
```

## Error Handling

**try / catch / finally + exception filters**

```csharp
try {
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
// without swallowing, or for conditional recovery.
```

**Custom exception hierarchy**

```csharp
public class AppException : Exception {
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
}
```

**Result type via discriminated union (OneOf library)**

```csharp
using OneOf;

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

// Or TIE — Task<OneOf<T, E>> for async, no exceptions across boundaries.
```

**IDisposable + using declaration — deterministic cleanup**

```csharp
public sealed class DbTx : IDisposable {
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
await using var conn = new SqlConnection(cs);
```

## Concurrency Model

**async/await — Task, ConfigureAwait, cancellation**

```csharp
public async Task<User> LoadAsync(int id, CancellationToken ct = default) {
  using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
  cts.CancelAfter(TimeSpan.FromSeconds(5));

  var user = await _db.Users
      .AsNoTracking()
      .FirstOrDefaultAsync(u => u.Id == id, cts.Token)
      .ConfigureAwait(false);   // library code: drop sync context

  return user ?? throw new NotFoundException("user", id);
}

// Library author rule: ALWAYS use ConfigureAwait(false)
// App code (UI): NEVER use it — you need the sync context back.
```

**Task.WhenAll / WhenAny — fan-out + merge**

```csharp
// WhenAll — waits for all; throws AggregateException on any failure
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
});
```

**Channels — bounded producer/consumer**

```csharp
using System.Threading.Channels;

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

await Task.WhenAll(ProduceAsync(), ConsumeAsync());
```

**lock vs Monitor vs ReaderWriterLockSlim**

```csharp
// lock — built-in, reentrant, simplest
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
try { /* ... */ } finally { sem.Release(); }
```

## Testing Patterns

**xUnit — facts, theories, async**

```csharp
using Xunit;

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
}
```

**FluentAssertions + NSubstitute + Moq**

```csharp
using FluentAssertions;
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
mock.Setup(r => r.FindById(42)).Returns(new User(42, "alice"));
```

**FsCheck / csharp property-based testing**

```csharp
using FsCheck;
using FsCheck.Xunit;

// Property — framework generates inputs
[Property]
public bool SortIsIdempotent(int[] xs) {
  var once = xs.OrderBy(x => x).ToArray();
  var twice = once.OrderBy(x => x).ToArray();
  return once.SequenceEqual(twice);
}

// Run: dotnet test --filter "FullyQualifiedName~SortIsIdempotent"
// FsCheck shrinks failing cases to the minimal reproducer.
```

**BenchmarkDotNet — the only valid .NET microbenchmark**

```csharp
using BenchmarkDotNet.Attributes;
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
// Output: mean, std dev, allocations, GC gen-0 collections — never trust a stopwatch.
```

## Performance Tuning

- JIT compiles per-method on first call; tiered compilation (default since .NET Core 3) tiers C1→C2 — microbenchmarks need explicit warmup.
- Span<T> / Memory<T> are zero-allocation views over arrays/strings/native memory — the foundation of modern perf-oriented BCL.
- Value types (struct) are copied on assignment and boxed when cast to object — avoid in hot paths that touch `object`.
- Generics are reified — `List<int>` has no boxing; the JIT generates specialized code per value type.
- Dictionary<K,V>: O(1) average lookup, may degrade with bad hashers; ConcurrentDictionary is striped (faster than a single lock).
- async/await compiles to a state machine per method; allocation of the state machine box is elided when the task completes synchronously.
- String interning: literal strings are interned; `string.Intern(s)` adds runtime strings — usually not worth it.
- ObjectDisposedException is thrown by a disposed object's methods if you implemented the pattern correctly — never swallow it; it's a sign of a use-after-dispose bug.
- Source generators run at compile time, emit additional C# — used for regex, JSON, logging, dependency injection; the modern alternative to reflection.
- Native AOT (NET 8+) produces a single self-contained binary with sub-50ms startup — but no runtime codegen, so reflection-emit is unsupported.
- `Task.Run` for CPU-bound work only; for I/O, use the natural async API — `Task.Run(() => ReadAsync())` adds a thread-pool hop for nothing.
- LINQ hides multiple enumeration and allocations — materialize with ToList if used more than once; closures over locals allocate per-call.
- C# naming: PascalCase for public members, camelCase for locals/params, _camelCase for private fields. StyleCop/Analyzers enforce.
- BenchmarkDotNet is the standard microbenchmark tool — never trust a Stopwatch; the JIT will fool you.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [.NET SDK](https://dotnet.microsoft.com/) | The runtime + SDK — includes Roslyn compiler, JIT, GC, BCL. Cross-platform since .NET Core. | build |
| [MSBuild](https://learn.microsoft.com/visualstudio/msbuild/) | The default build system — verbose, XML-based; project files (.csproj). | build |
| [dotnet CLI](https://learn.microsoft.com/dotnet/core/tools/) | Command-line interface for building, testing, packaging — `dotnet build`, `dotnet test`, `dotnet publish`. | build |
| [NuGet](https://www.nuget.org/) | The .NET package manager — `dotnet add package` — largest .NET package registry. | package |
| [Paket](https://fsprojects.github.io/Paket/) | Alternative package manager — better version resolution; used in F# community. | package |
| [Roslyn analyzers](https://learn.microsoft.com/visualstudio/code-quality/) | Live static analyzers built into the compiler — Code Quality, Style, Performance rules. | lint |
| [StyleCop](https://github.com/StyleCop/StyleCop) | Style enforcer — configurable rules for naming, layout, documentation. | lint |
| [SonarAnalyzer](https://www.sonarsource.com/csharp/) | Code-quality analyzer — bugs, vulnerabilities, code smells; integrates with SonarQube. | lint |
| [xUnit](https://xunit.net/) | The standard test framework for modern .NET — facts, theories, async support. | test |
| [NUnit](https://nunit.org/) | Older test framework — still common; parameterized tests, classic assertions. | test |
| [Moq / NSubstitute](https://nsubstitute.github.io/) | Mocking frameworks — NSubstitute is terser, Moq is more explicit. | test |
| [FluentAssertions](https://fluentassertions.com/) | Fluent assertion library — far more readable than xUnit's built-in Assert. | test |
| [FsCheck](https://fscheck.github.io/FsCheck/) | Property-based testing — F#-origin, usable from C#; Hypothesis-style shrinking. | test |
| [BenchmarkDotNet](https://benchmarkdotnet.org/) | The standard .NET microbenchmark library — statistically rigorous, the only valid benchmark tool. | test |
| [Testcontainers](https://dotnet.testcontainers.org/) | Spin up real Docker dependencies (Postgres, Kafka, Redis) for integration tests. | test |
| [dotnet-trace / dotnet-dump / PerfView](https://learn.microsoft.com/dotnet/core/diagnostics/) | Diagnostic tools — dotnet-trace for CPU profiles, PerfView for ETW analysis on Windows. | debug |
| [Visual Studio / Rider](https://www.jetbrains.com/rider/) | Primary IDEs — VS is Microsoft's, Rider is JetBrains' cross-platform alternative. | debug |
| [ASP.NET Core](https://learn.microsoft.com/aspnet/core/) | Web/service framework — Kestrel server, MVC/minimal APIs, EF Core, DI built in. | deploy |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| C# 1.0 | 2002 | First release with .NET Framework 1.0 — classes, structs, delegates, exceptions. |
| C# 2.0 | 2005 | Generics (reified), nullable types, anonymous methods, iterators (yield). |
| C# 3.0 | 2007 | LINQ, lambdas, extension methods, anonymous types, var — the language-defining release. |
| C# 4.0 | 2010 | Dynamic typing (dynamic keyword), named/optional args, COM interop improvements. |
| C# 5.0 | 2012 | async/await, caller info attributes — the async revolution. |
| C# 6.0 | 2015 | Roslyn compiler; string interpolation, null-conditional, expression-bodied members, using static. |
| C# 7.0 | 2017 | Tuples, pattern matching (basic), local functions, ref returns, deconstruction. |
| C# 8.0 | 2019 | Nullable reference types, async streams, indices/ranges, switch expressions, default interface methods. |
| C# 9.0 | 2020 | Records, init-only setters, top-level statements, target-typed new, pattern-matching improvements. |
| C# 10.0 | 2021 | Global usings, file-scoped namespaces, record structs, const interpolated strings. |
| C# 11.0 | 2022 | Static virtual interface members, list patterns, raw string literals, required members. |
| C# 12.0 | 2023 | Primary constructors, collection expressions, inline arrays, ref struct interfaces. |
| C# 13.0 | 2024 | params collections, `field` contextual keyword (preview), partial properties, lock object improvements. |
| C# 14 / .NET 10 (LTS) | 2025 | Extension members (properties, static, operators), null-conditional assignment, first-class span conversions, `nameof(List<>)`, `field` keyword stable. |

## Interview Hot Questions

1. **What's the difference between `class` and `struct` in C#?** *(easy)*

   Classes are reference types on the GC heap (heap-allocated, garbage-collected, default reference equality). Structs are value types (copied on assignment, stack-allocated for locals, boxed when cast to object). Use structs for small (<16 byte) immutable values; never make mutable structs (silent copy bugs). Always override Equals/GetHashCode for struct performance (default uses reflection).

2. **Explain async/await — what does it actually do?** *(medium)*

   An async method compiles to a state machine. `await` checks if the awaited task is complete; if so it returns the result synchronously, otherwise it suspends the method, registers a continuation, and returns control to the caller (without blocking the thread). When the task completes, the continuation runs — usually on the captured SynchronizationContext (UI) or the thread pool (server). Use ConfigureAwait(false) in library code to drop the context.

3. **What are nullable reference types, and how are they enforced?** *(medium)*

   NRTs (C# 8+) are compile-time annotations: `string?` may be null, `string` should not be. The compiler emits warnings for unsafe dereferences. They're NOT enforced at runtime — deserialization can put null into a non-nullable reference. Use ArgumentNullException.ThrowIfNull at boundaries. Treat NRTs as static analysis, not a runtime guarantee.

4. **Explain records and the `with` expression.** *(easy)*

   Records (C# 9+) are reference types with value-based equality and immutability by default. The compiler generates Equals, GetHashCode, ToString, and a copy constructor. `with` creates a new instance with specified changes: `var u2 = u1 with { Email = "new" };`. Use for DTOs, value types. `record struct` (C# 10) gives the same for value types.

5. **What does `ConfigureAwait(false)` do, and when should you use it?** *(medium)*

   It tells the awaiter NOT to capture the SynchronizationContext — the continuation runs on the thread pool instead of marshaling back to the UI thread. Use it in every library's async code (libraries shouldn't depend on the host's sync context). Never use it in UI app code where you need to update controls after the await. ASP.NET Core has no sync context, so it's a no-op there but harmless.

6. **How does the .NET GC work?** *(hard)*

   Generational (gen 0, 1, 2) + large object heap (LOH for ≥85k bytes). Gen-0 collections are frequent and cheap (short-lived objects); gen-2 is full GC and expensive. Server GC vs workstation GC affects throughput. Objects arecompacted (gen 0/1) or just swept (LOH). Pinning (fixed, GCHandle) prevents compaction — avoid long-lived pins. .NET 5+ has LOH compaction on demand.

7. **What is Span<T>, and why is it important?** *(hard)*

   Span<T> (C# 7.2) is a stack-only ref struct wrapping a pointer + length — a view over contiguous memory (arrays, strings, native). It enables zero-allocation parsing, slicing, and interop. The ref-struct constraint keeps it off the heap (no boxing, no fields of non-span types). Memory<T> is the heap-storable counterpart. The BCL was rewritten around Span<T> in .NET Core 2.1 — major perf win.

8. **How are C# generics different from Java's?** *(medium)*

   C# generics are reified — `List<int>` is a distinct type at runtime, with specialized JIT code per value type (no boxing). Java's are erased — `List<Integer>` and `List<String>` share one runtime class, requiring autoboxing. C# can do `new T()`, `typeof(T)`, runtime reflection on type args; Java cannot. C# wins on performance (no boxing) and runtime introspection.

9. **What are source generators, and why do they matter?** *(medium)*

   Source generators (C# 9+) run at compile time and emit additional C# code — `Regex`, `JsonSerializerContext`, logging, DI registration. They replace runtime reflection (slow, trim-unfriendly) with compile-time codegen (fast, AOT-compatible). Native AOT requires source-generated code for JSON and DI; reflection-based code is incompatible with trimming.

10. **Explain the difference between `Task` and `ValueTask`.** *(hard)*

   Task is a reference type — always allocates unless cached. ValueTask<T> is a struct that can wrap either a T (synchronous success) or a Task<T> (async). Use ValueTask when the method usually completes synchronously (cache hits, fast paths) to avoid allocation. Caveat: ValueTask can only be awaited once; don't store it or await twice. Most code should use Task.

## When to Choose This

- **vs Java:** use this — Windows-first shops, Unity game development, modern back-ends wanting LINQ + async + records + source generators.; use that — Cross-platform enterprise back-ends, big-data infrastructure (Kafka, Spark), Android (Java/Kotlin).
- **vs F#:** use this — Mainstream C-family projects, teams wanting OOP-first with functional features as seasoning.; use that — Functional-first data-heavy domains (finance, data science, ETL), anywhere algebraic data types + type inference shine.
- **vs TypeScript:** use this — Back-end services, Windows desktop, Unity games, anything on the .NET runtime.; use that — Frontend web, full-stack JS, edge runtimes — anywhere npm + the browser runtime matter.
- **vs Go:** use this — Enterprise back-ends needing rich types + LINQ + async, Windows desktop, game dev.; use that — Cloud-native microservices, CLIs, single-binary deploys — anywhere simplicity wins.
- **vs Python:** use this — Performance-critical back-ends, Unity, Windows desktop, anything needing the .NET ecosystem.; use that — Data science / ML, scripting, rapid prototyping — anywhere NumPy/Pandas/PyTorch matter.

