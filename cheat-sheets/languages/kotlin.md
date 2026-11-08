# Kotlin

**Category:** Languages · **Tier:** Tier 2 · Domain · **Tags:** static, jvm, android, concise, coroutines, functional, null-safe · **First released:** 2011 · **Author:** JetBrains · **Last updated:** 2026-11

> Statically-typed JVM language with null safety, coroutines, and a conciseness bias — the default for Android and a strong server-side choice via Spring/Ktor.

---

## TL;DR

- Kotlin is a statically-typed, JVM-targeted language with full Java interop, nullable types baked into the type system, first-class functions, and structured concurrency via coroutines — designed to fix Java's verbosity without abandoning the JVM ecosystem.
- It is the official language for Android (since 2019) and is widely used for backend services via Spring Boot, Ktor, and Quarkus; it also compiles to JS and native binaries via Kotlin Multiplatform.
- Reach for Kotlin when you're on the JVM but want less boilerplate, when targeting Android, or when you want cross-platform business logic via KMP; it interoperates with any Java library unchanged.
- Avoid Kotlin for hot CPU-bound numerics where the JVM overhead matters equally (use C++/Rust), or for tiny scripts where the Gradle bootstrap is overkill (use Python/Go).

## Core Mental Model

**Nullability is a type, Java interop is a phase boundary.** Kotlin's type system distinguishes `String` (never null) from `String?` (maybe null) at compile time — `null` cannot flow into a non-null type without an explicit operator. This single feature eliminates the Billion-Dollar Mistake at the boundary of your Kotlin code. The catch: Java code returns platform types (`String!`) — neither `String` nor `String?` — so the compiler can't enforce nullability there and you must add explicit annotations or null checks. The other model to internalize: coroutines are not threads — they're continuations that suspend without blocking, multiplexed on a small pool of Dispatchers. A `suspend` function looks like synchronous code but yields at suspension points; blocking I/O inside a coroutine starves the dispatcher exactly like a blocked thread would.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| val x = 5 / var y = 5 | Immutable vs mutable local — type inferred. | Default to `val`; switch to `var` only when reassignment is essential. |
| fun f(x: Int, y: Int = 0): Int = x + y | Expression body + default arg. | Short pure functions; defaults make overloads redundant. |
| fun f(vararg xs: Int) | Variadic parameter — receives Array<out T>. | APIs like listOf(), setOf(); use spread `*arr` to forward. |
| data class User(val id: Int, val email: String) | Auto-generates equals/hashCode/toString/copy + componentN for destructuring. | Value types; the default for DTOs and domain models. |
| sealed interface Shape | Closed hierarchy — exhaustive when() enforced. | ADTs, state machines, results; enables compile-time totality checks. |
| when (x) { is Ok -> ...; 1,2 -> ...; else -> ... } | Switch expression with type + value patterns. | Replaces if/else chains; must be exhaustive over sealed types. |
| x?.let { ... } / x ?: default | Safe-call + elvis — null-safe chain with default. | Optional descent; `?:` for default values. |
| suspend fun fetch(): T | Marks a function as suspendable — can `await`/`delay` without blocking a thread. | All async I/O; pair with a CoroutineScope. |
| CoroutineScope(Dispatchers.IO).launch { } | Launches a coroutine on the IO dispatcher — fire-and-forget. | Fan-out work; lifecycle-bound to the scope. |
| async { } .await() | Starts a deferred — await to get the result. | Parallel fan-out; combine with awaitAll. |
| Flow<T> / channelFlow | Cold stream — async sequence of values over time. | Reactive pipelines, event streams, paged data. |
| inline fun <reified T> f() | Inline + reified type param — T is available at runtime. | Reflection-free type tokens, DI containers, gson/moshi. |

## Idiomatic Patterns

**Sealed hierarchy + when — the algebraic data type pattern**

```kotlin
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Err(val code: Int, val msg: String) : ApiResult<Nothing>
    data object Loading : ApiResult<Nothing>
}

fun <T> ApiResult<T>.fold(
    onOk: (T) -> Unit,
    onErr: (Int, String) -> Unit,
    onLoading: () -> Unit,
) = when (this) {
    is ApiResult.Ok      -> onOk(value)
    is ApiResult.Err     -> onErr(code, msg)
    ApiResult.Loading    -> onLoading()
    // No `else` needed — compiler knows the hierarchy is exhaustive.
}

val r: ApiResult<Int> = ApiResult.Ok(42)
r.fold(::println, { c, m -> println("err $c $m") }, { println("loading") })
```

**Coroutines — structured concurrency the right way**

```kotlin
class UserRepo(private val client: HttpClient, private val scope: CoroutineScope) {

    // suspend = no thread blocked. Dispatcher hops happen internally.
    suspend fun fetchUsers(ids: List<Int>): List<User> = coroutineScope {
        // Each async is a child — coroutineScope waits for all and cancels siblings on failure.
        ids.map { id ->
            async(Dispatchers.IO) {
                client.get("https://api/users/\$id").body<User>()
            }
        }.awaitAll()
    }

    // Flow = cold stream. Nothing runs until collected.
    fun watchUser(id: Int): Flow<User> = channelFlow {
        val ws = client.webSocket("wss://api/users/\$id/live")
        for (frame in ws.incoming) {
            send(decode(frame))
        }
    }
}

// Caller: runBlocking only in main(); in services use the framework's scope.
runBlocking { UserRepo(client, this).fetchUsers(listOf(1, 2, 3)) }
```

**Extension functions + scope functions for fluent DSLs**

```kotlin
// Extension on a third-party type — no subclassing needed.
fun String.isValidEmail(): Boolean =
    matches(Regex("^[^@]+@[^@]+\\.[^@]+$"))

// Scope functions: apply / let / run / also / with.
//  - apply: configure an object, returns receiver
//  - let:   transform, returns lambda result
//  - also:  side-effect (e.g. log), returns receiver
class ServerBuilder {
    var port: Int = 8080
    var host: String = "0.0.0.0"
    fun build(): Server = Server(host, port)
}

val s = ServerBuilder().apply {
    port = 9000
    host = "localhost"
}.also {
    log.info("building server on ${it.host}:${it.port}")
}.build()
```

**Kotlin Multiplatform — share business logic across iOS/Android/Web**

```kotlin
// commonMain — compiled to JVM, JS, and native (iOS) binaries.
expect class Platform { val name: String }
expect fun nowEpochMs(): Long

class Greeting {
    private val ph = Platform()

    fun greet(): String = "Hello from ${ph.name} at ${nowEpochMs()}"
}

// iosMain / jvmMain / jsMain provide actual implementations:
// actual class Platform { val name = "iOS" }
// actual fun nowEpochMs(): Long = System.currentTimeMillis()  // or NSDate
//
// Shared ViewModels, repositories, and domain models live in commonMain;
// UI stays native (SwiftUI on iOS, Compose on Android).
```

## Common Pitfalls

1. **Java interop returns platform types (`String!`)** — *Symptom:* Calling a Java method that returns `String` compiles fine but throws NPE at runtime if the Java side returns null — the compiler had no way to know. *Fix:* Add explicit nullability annotations (`@NotNull`/`@Nullable`) to Java code, or treat every Java return value as `T?` on the Kotlin side and null-check before use. JetBrains's `@NotNullByDefault` package-level annotation helps for legacy code.
2. **GlobalScope leaks coroutines** — *Symptom:* `GlobalScope.launch { ... }` creates a coroutine with no parent — it outlives the activity/request, leaks memory, and is impossible to cancel cleanly. *Fix:* Always use a scoped launcher: `lifecycleScope` in Android, the framework's CoroutineScope in Spring/Ktor, or `coroutineScope { }` for ad-hoc work. `GlobalScope` is essentially never correct.
3. **Blocking calls inside coroutines starve the dispatcher** — *Symptom:* `suspend fun fetch() = Thread.sleep(1000)` blocks the underlying thread of the dispatcher — only N threads in Dispatchers.IO, so N concurrent calls lock the whole pool. *Fix:* Use suspend equivalents (`delay()` instead of `Thread.sleep()`, JDBC with a dedicated dispatcher pool, Reactive drivers). Wrap unavoidable blocking calls in `withContext(Dispatchers.IO) { blockingCall() }` and size the pool.
4. **by lazy is not thread-safe by default... actually it is, but it locks** — *Symptom:* `val x by lazy { ... }` uses `LazyThreadSafetyMode.SYNCHRONIZED` by default — every read after init takes a volatile read; under contention it serializes. *Fix:* If you know initialization happens single-threaded, use `lazy(LazyThreadSafetyMode.NONE)`. For init-once in coroutines, `lazy(LazyThreadSafetyMode.PUBLICATION)` avoids the lock at the cost of duplicate computation.
5. **Mutable class properties exposed via `var`** — *Symptom:* `class C { var items = listOf<Int>() }` is mutable from outside — callers can reassign the field. Combined with concurrent access, this is a data race waiting to happen. *Fix:* Use `val` with a private `MutableStateFlow` / `mutableListOf` inside, or expose an immutable view: `val items: List<Int> get() = _items`. Kotlin's `var` on a public property is a footgun for library APIs.
6. **Collections are invariant — `List<Int>` is not `List<Number>`** — *Symptom:* Passing `List<Int>` where `List<Number>` is expected fails to compile (mutable collections are invariant by design); people fall back to `List<Any?>` and lose type safety. *Fix:* Use `out` variance in APIs: `fun process(items: List<Number>)` accepts `List<Int>` because `List` is covariant (declared `interface List<out E>`). For your own generic types, declare variance at the type, not the call site.
7. **`internal` visibility leaks across Gradle modules** — *Symptom:* Marking a class `internal` in a Kotlin library does not prevent access from another module compiled into the same JVM — `internal` is module-scoped, but a fat JAR can collapse modules. *Fix:* Understand that `internal` is per-Gradle-module, not per-JAR. Use `public` + sealed hierarchy to restrict construction, or move truly private types to a separate module not published.

## Production / Interview Quick Reference

- Null safety: `String` is never null, `String?` may be. Platform types from Java (`String!`) bypass the check — annotate or null-check. `gotcha`
- Coroutines are ~10-100x cheaper than threads — a JVM can run 100k+ concurrent coroutines vs ~10k threads. `perf`
- Dispatchers: Default (CPU), IO (blocking I/O, ~64 threads default), Main (UI), Unconfined (testing). Pick by workload. `perf`
- Kotlin 1.9+ K2 compiler is ~2x faster; Kotlin 2.0 stabilized K2 as default. `version`
- Kotlin 2.1 has context parameters (replacement for context receivers), smart cast improvements, and nested generic nullability. `version`
- data class auto-generates equals/hashCode/toString/copy/componentN — limit: must have at least one ctor param, can't be open/abstract/sealed. `gotcha`
- Sealed classes/interfaces enforce exhaustive when() — add `data object Loading` for ad-hoc states. `style`
- Extension functions resolve statically — they don't dispatch by runtime type. `open` subclassing doesn't change which extension fires. `gotcha`
- inline fun with reified T preserves type info at runtime — powers gson/moshi/Koin DI without reflection. `perf`
- Flow is cold (no work until collected); SharedFlow/StateFlow are hot (independent of subscribers). Use StateFlow for UI state. `version`
- KMP (Kotlin Multiplatform) shares business logic; UI stays native. Stable for non-UI code since Kotlin 1.9.20. `version`
- Compose Multiplatform (JetBrains) extends Android's Compose to iOS/Desktop/Web — share UI in addition to logic. `version`
- kotlinx.serialization is the canonical JSON library — compile-time plugin generates serializers, no reflection. `style`
- Common style: 4-space indent, lowerCamelCase for funcs/vars, UpperCamelCase for types. ktlint + detekt enforce. `style`
- Gradle Kotlin DSL (*.gradle.kts) is the modern build config; version catalogs (libs.versions.toml) centralize dependencies. `style`

## Go Deeper

- [Kotlin Documentation — Official](https://kotlinlang.org/docs/home.html) — The canonical reference; the coroutines and null-safety pages are essential reading.
- [Kotlin Language Specification](https://kotlinlang.org/spec/) — Formal grammar and semantics — useful when IntelliJ's red squiggle is mysterious.
- [Kotlin Coroutines (Roman Elizarov)](https://elizarov.medium.com/) — Blog of the coroutines lead designer; deep design rationale for structured concurrency.
- [Kotlin in Action (Dmitry Jemerov & Svetlana Isakova)](https://www.manning.com/books/kotlin-in-action) — The canonical book; written by JetBrains engineers with deep rationale for design choices.
- [KEEP — Kotlin Evolution and Enhancement Process](https://github.com/Kotlin/KEEP) — Every significant feature has a KEEP proposal; read for motivation, alternatives, and rejected designs.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Byte / Short / Int / Long | 8/16/32/64-bit signed integer. Int is the default literal type. | Numeric work. Long for timestamps/IDs, Int for general use. |
| Float / Double | IEEE 754 32/64-bit float. Double is the default literal type. | Math. Float only for graphics / huge arrays; BigDecimal for money. |
| Char | Single UTF-16 code unit (NOT grapheme cluster). | Single-char work. Use String for text — Char doesn't model Unicode properly. |
| Boolean | true / false — strict, no truthiness coercion. | Logic. 'if (x)' requires x to be Boolean. |
| String | Immutable UTF-16 sequence (JVM String). Triple-quoted for raw multi-line. | All text. Use trimIndent() on triple-quoted for clean formatting. |
| Unit | Singleton 'no value' type — like void but is a real type. | Function return type when there's nothing to return; the type of side effects. |
| Nothing | Bottom type — a function returning Nothing never returns (throws, infinite loop). | Type for 'this branch never completes': TODO(), fail(), infinite loops. |
| Any? | Top of the type hierarchy — nullable version is the universal supertype. | Avoid in new code; use specific types or generics. Any (non-null) for Java interop. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Array<T> | JVM array wrapper — invariant, fixed-size, mutable cells. | Java interop, low-level perf. Use List<T> for general-purpose work. |
| List<T> / MutableList<T> | Read-only / mutable list interface — List is covariant (out T). | Default ordered collection. listOf() returns an immutable view; mutableListOf for mutation. |
| Set<T> / MutableSet<T> | Hash set — O(1) membership, no duplicates, unordered. | Dedup, membership tests, set algebra. |
| Map<K, V> / MutableMap<K, V> | Hash map — read-only / mutable. Subscript returns V? (null for missing). | Keyed lookups, JSON, caches. getValue() throws on missing; getOrElse for default. |
| Sequence<T> | Lazy stream — like Python generators. map/filter chain is single-pass. | Large pipelines: asSequence().map{}.filter{}.toList(). Saves intermediate allocations. |
| Pair<A, B> / Triple<A, B, C> | Anonymous tuple — destructured via (a, b) = pair. | Quick pairs/triples. For >3 fields or named API, use a data class. |
| IntArray / DoubleArray / ... | Primitive-typed array — no boxing, ~3-5x less memory than Array<Int>. | Numerics, performance-critical loops. Maps to JVM int[]/double[] directly. |
| kotlinx.collections.immutable | Persistent (immutable) collections — ImmutableList, ImmutableMap. Separate artifact. | Functional pipelines, share-across-threads, undo/redo. PersistentHashMap is structural-sharing. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class C { } | Standard class — single inheritance, reference type, JVM-interop. | Default for behavior-rich types. Mark 'open' to allow subclassing. |
| data class User(val id: Int, val email: String) | Auto-generates equals/hashCode/toString/copy/componentN for destructuring. | Value types; the default for DTOs and domain models. |
| sealed interface Shape | Closed hierarchy — exhaustive when() enforced at compile time. | ADTs, state machines, results; enables totality checks across modules. |
| enum class Color { RED, GREEN } | Classic enumeration — each value is a singleton instance of the class. | Closed value sets; can have fields, methods, implement interfaces. |
| object Singleton { } | Singleton object — also acts as a namespace and the companion of a class. | Module pattern, factory methods, the home of const val and top-level functions. |
| interface I { fun f() } | Interface — methods + properties. Can have default impls. Multiple inheritance OK. | Contracts, polymorphism. Use over abstract class for new code. |
| annotation class Foo | Custom annotation — applied via @Foo, read via reflection. | DI, codegen, framework configuration. Often paired with ksp/kapt processors. |
| typealias UserID = Int | Type alias — purely cosmetic, no new type created. | Readability. For real type-safety use an inline value class (@JvmInline value class UserID(val v: Int)). |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b | Arithmetic — for Int, / is integer division. Float division if any operand is Float/Double. | Math. Use BigDecimal for money; integer division rounds toward zero. |
| a % b | Modulo — sign follows dividend (like C/Java). | Parity checks, cycling. -7 % 2 == -1 (not 1). |
| a == b, a != b | Structural equality — calls .equals(). Null-safe: a == null works. | Default comparisons. For reference identity use === / !==. |
| a === b, a !== b | Reference identity — same object instance. Same as Java's ==. | Detecting shared references; rare in business code. |
| a < b, a > b, a <= b, a >= b | Comparison — requires Comparable. Auto-generated for data classes via compareTo. | Sorting, ranges. Chaining: '1 < x && x < 10' (no '1 < x < 10'). |
| a && b, a \|\| b, !a | Short-circuit boolean — strict Boolean, no truthiness. | Logic. 'if (x)' requires x to be Boolean. |
| a ? b : c | Ternary — Kotlin doesn't have one. Use if-else as expression: 'if (a) b else c'. | Kotlin idiom: if-else IS the ternary. if-else can be assigned to a val. |
| a ?: b | Elvis — a if non-null, else b. The default-value operator. | Default values: val x = a ?: default. The Kotlin null-handling headline. |
| a?.b?.c | Safe-call chain — short-circuits to null on any null. Returns nullable type. | Optional descent. Combine with ??: 'a?.b ?: default'. |
| a!! | Force-unwrap — throws NullPointerException if null. The escape hatch. | Almost never. Use ?: or ?. instead. Acceptable in tests or with @NonNull contracts. |
| a as? B, a as B | Cast: 'as?' returns null on failure, 'as' throws ClassCastException. | Downcasting Any to a concrete type. Prefer generics over Any+as. |
| a is B, a !is B | Type check — true if a is B (subclass/implementor). Smart-casts afterwards. | Branching by runtime type. Smart-cast eliminates the need for explicit casts. |
| a..b, a until b, a downTo b step n | Range — inclusive (..), half-open (until), descending (downTo). | Iteration: for (i in 0 until n) / for (i in 10 downTo 0 step 2). |
| a in b, a !in b | Membership — works on ranges, collections, anything with contains(). | Interval checks: x in 0..10. Collection membership: x in set. |
| a..b step n, a..<b | Range with step / exclusive end (Kotlin 1.7+ ..< syntax). | Stepped iteration: for (i in 0..100 step 10). '0..<100' is half-open. |

## Input / Output

**File I/O — small (read all) vs large (stream with use)**

```kotlin
import java.nio.file.Files
import java.nio.file.Path
import java.io.BufferedReader

// Small file — read all at once (JVM underneath)
val text = Path.of("small.txt").toFile().readText(Charsets.UTF_8)
val bytes = Path.of("data.bin").toFile().readBytes()

// Large file — stream line by line. 'use' = try-with-resources.
Path.of("huge.csv").toFile().bufferedReader().use { reader ->
    reader.forEachLine { line -> process(line) }
}

// Even cleaner with Files.lines (Java 8+):
Files.lines(Path.of("huge.csv")).use { stream ->
    stream.filter { it.isNotBlank() }.forEach { process(it) }
}

// Java NIO Files API is the modern way — avoid java.io.File when possible.
```

**stdin / stdout / stderr — CLI tools**

```kotlin
// Read all of stdin
val data = System.`in`.readBytes()
val text = String(data, Charsets.UTF_8)

// Stream stdin line by line (memory-friendly)
generateSequence(::readLine).forEach { line ->
    println(line.uppercase())
}

// Print to stderr
System.err.println("warning: deprecated")

// JSON over stdin/stdout — the standard CLI interop pattern
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable data class Payload(val k: Int, val list: List<Int>)
val payload = Json.decodeFromString<Payload>(text)
val result = transform(payload)
println(Json.encodeToString(result))
```

**JSON / kotlinx.serialization — compile-time safe**

```kotlin
import kotlinx.serialization.*
import kotlinx.serialization.json.*

@Serializable
data class User(
    val id: Int,
    val email: String,
    val role: String = "member",
    val tags: List<String> = emptyList(),
)

// Encode / decode — serializer is generated at compile time, no reflection
val json = Json { prettyPrint = true; ignoreUnknownKeys = true }
val s = json.encodeToString(User(id = 1, email = "a@b.io"))
val u = json.decodeFromString<User>(s)

// Lenient parsing — ignore unknown keys (for evolving APIs)
val lenient = Json { ignoreUnknownKeys = true; coerceInputValues = true }

// ProtoBuf / CBOR via the same @Serializable — same data class, different format
```

**HTTP client (Ktor) with retries + coroutines**

```kotlin
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import kotlinx.coroutines.delay

suspend fun getJson(url: String): String {
    HttpClient(CIO) { config /* timeouts, headers */ }.use { client ->
        var attempts = 0
        while (true) {
            try {
                val resp: HttpResponse = client.get(url) {
                    header("Accept", "application/json")
                    timeout { requestTimeoutMillis = 10_000 }
                }
                if (resp.status.value in 200..299) return resp.bodyAsText()
                throw RuntimeException("HTTP ${resp.status}")
            } catch (e: Exception) {
                if (++attempts >= 3) throw e
                delay(500 * (1L shl (attempts - 1)))  // 0.5s, 1s, 2s
            }
        }
    }
}
```

## Loops & Iteration

**for-in + forEach + indices + withIndex — the holy trinity**

```kotlin
val items = listOf("a", "b", "c")
val scores = listOf(10, 20, 30)

// for-in — the default
for (item in items) println(item)

// forEach — functional form (no early return without label)
items.forEach { println(it) }

// With index — indices returns IntRange; withIndex returns IndexedValue
for (i in items.indices) println("$i: ${items[i]}")
for ((i, item) in items.withIndex()) println("$i: $item")

// zip — parallel iteration (stops at shortest)
for ((item, score) in items.zip(scores)) println("$item: $score")
```

**map / filter / reduce — functional trinity**

```kotlin
val nums = (1..10).toList()

// map — transform each element
val squares = nums.map { it * it }

// mapNotNull — map + drop nulls (great for fallible transforms)
val ints = listOf("1", "2", "x").mapNotNull { it.toIntOrNull() }

// filter — keep elements matching predicate
val evens = nums.filter { it % 2 == 0 }

// reduce / fold — fold left (fold takes initial seed)
val sum = nums.fold(0) { acc, n -> acc + n }
val product = nums.reduce { acc, n -> acc * n }

// Chained pipelines read top-to-bottom
nums.filter { it % 2 == 0 }
    .map { it * it }
    .sum()
```

**while / do-while / ranges — explicit loops**

```kotlin
// while — runs while condition is true
var n = 0
while (n < 10) {
    if (found(n)) break
    n++
}

// do-while — runs body at least once
var result: String
do {
    result = tryOnce()
} while (result == "retry")

// Ranges — idiomatic iteration
for (i in 0 until 10) print(i)        // 0..9 (exclusive)
for (i in 0..10) print(i)             // 0..10 (inclusive)
for (i in 0..<10) print(i)            // 0..9 (1.7+ half-open syntax)
for (i in 10 downTo 0) print(i)       // 10..0
for (i in 0..100 step 10) print(i)    // 0, 10, ..., 100
```

**Sequences — lazy streams (Python generators, JS iterators)**

```kotlin
// Sequence is lazy — map/filter chain is single-pass, no intermediate lists.
val result = (1..1_000_000).asSequence()
    .filter { it % 2 == 0 }
    .map { it * it }
    .take(10)
    .toList()  // [4, 16, 36, 64, 100, 144, 196, 256, 324, 400]

// For small collections, eager List is faster (no per-step indirection).
// For large collections or early-exit (take), Sequence wins.

// Infinite sequences — generate
val naturals = generateSequence(1) { it + 1 }
naturals.take(5).toList()  // [1, 2, 3, 4, 5]

// yield-style via sequence { } builder
val fibs = sequence {
    var (a, b) = 0 to 1
    while (true) {
        yield(a)
        a = b.also { b += a }
    }
}
fibs.take(10).toList()  // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

## Functions & Callables

**Parameters, defaults, vararg, named args**

```kotlin
fun f(a: Int, b: Int = 10, vararg rest: String): List<Any> {
    return listOf(a, b, rest.toList())
}

// Positional
f(1, 2, "x", "y")   // [1, 2, [x, y]]

// Named — skip defaults, reorder freely
f(a = 1, b = 2)
f(b = 2, a = 1)     // order doesn't matter with names

// Spread to forward an array (must use * spread operator)
val args = arrayOf("x", "y")
f(1, 2, *args)

// Single-expression function — concise
fun double(x: Int): Int = x * 2
fun greet(name: String) = "Hello, $name"
```

**Lambdas + scope functions (apply / let / run / also / with)**

```kotlin
// Lambda — last param can go outside parens; 'it' is the implicit single param
listOf(1, 2, 3).map { it * 2 }    // [2, 4, 6]
listOf(1, 2, 3).reduce { acc, n -> acc + n }  // 6

// Scope functions — the Kotlin idiom
//  apply : config builder, returns receiver (this)
//  let   : transform, returns lambda result (it)
//  run   : compute on receiver, returns result (this)
//  also  : side-effect (logging), returns receiver (it)
//  with  : call multiple methods on a value, returns result
val s = ServerBuilder().apply {
    port = 9000
    host = "localhost"
}.also {
    log.info("building on ${it.host}:${it.port}")
}.build()

// Use let for null-check-and-transform: x?.let { ... }
```

**Inline + reified — reflection-free type tokens**

```kotlin
// inline: copies the function body into the call site — no lambda allocation.
// reified: makes a generic type parameter available at runtime (normally erased).
inline fun <reified T> load(json: String): T =
    Json.decodeFromString<T>(json)  // T is concrete, not erased

val u: User = load("""{"id":1,"email":"a"}""")

// Common in DI containers, JSON libs, HTTP clients:
//   inline fun <reified T> HttpClient.get(url): T = ...
//   val users: List<User> = client.get("/users")

// Without inline+reified, you'd have to pass Class<T> manually (like Java).
```

**Coroutines — suspend functions + structured concurrency**

```kotlin
import kotlinx.coroutines.*

// suspend marks a function that can yield without blocking a thread.
suspend fun fetchUser(id: Int): User = withContext(Dispatchers.IO) {
    db.find(id)
}

// coroutineScope — structured: children must complete before parent returns
suspend fun loadAll(ids: List<Int>): List<User> = coroutineScope {
    ids.map { id ->
        async(Dispatchers.IO) { fetchUser(id) }  // fan-out
    }.awaitAll()  // wait for all, propagate first failure
}

// runBlocking — bridge from sync to async (use only in main / tests)
fun main() = runBlocking {
    val users = loadAll(listOf(1, 2, 3))
    println(users)
}

// Flow — cold stream (async sequence)
fun watchUsers(): Flow<User> = flow {
    for (id in 1..10) emit(fetchUser(id))
}
```

## Error Handling

**try / catch / finally — Java-style but expression-capable**

```kotlin
// try is an expression — returns the value of the last expression in try or catch
val n: Int = try {
    parse(input)
} catch (e: NumberFormatException) {
    -1  // fallback value
} finally {
    cleanup()  // always runs; doesn't affect the return value
}

// catch by type — multiple types in one catch (unlike Java's multi-catch)
try {
    risky()
} catch (e: IOException) {
    handle(e)
} catch (e: SQLException) {
    handle(e)
}

// Kotlin has no checked exceptions — the compiler doesn't force callers to catch.
```

**Result<T> — typed errors as values**

```kotlin
// Result is a value type — .success(T) or .failure(Throwable).
// Useful for storing errors in collections (throws can't), or for APIs
// where you want branching instead of try/catch.

fun divide(a: Int, b: Int): Result<Int> =
    if (b == 0) Result.failure(ArithmeticException("div by zero"))
    else Result.success(a / b)

// Pattern-match via fold / getOrThrow / getOrElse
val msg = divide(10, 0).fold(
    onSuccess = { "got $it" },
    onFailure = { "err: ${it.message}" },
)

// Or via getOrNull + ?.let / ?: elvis
val v: Int? = divide(10, 0).getOrNull()
val safe: Int = divide(10, 0).getOrElse { -1 }

// runCatching — wraps a throwing block in a Result
val r = runCatching { JSON.decode<User>(raw) }
val u = r.getOrThrow()  // re-throw on failure
```

**Sealed Result — domain errors with exhaustive when**

```kotlin
// Sealed interface gives compile-time exhaustive when — better than Throwable.
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Err(val code: Int, val msg: String) : ApiResult<Nothing>
    data object Loading : ApiResult<Nothing>
}

fun <T> ApiResult<T>.fold(
    onOk: (T) -> Unit,
    onErr: (Int, String) -> Unit,
    onLoading: () -> Unit,
) = when (this) {
    is ApiResult.Ok      -> onOk(value)
    is ApiResult.Err     -> onErr(code, msg)
    ApiResult.Loading    -> onLoading()
    // No 'else' needed — compiler knows the hierarchy is closed.
}

// Adding a new variant (e.g. Empty) makes the compiler flag every
// when that doesn't handle it — exhaustive-by-construction refactoring.
```

**Custom exceptions + coroutine exception handling**

```kotlin
class AppException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
class ValidationException(message: String) : AppException(message)

// In coroutines, exceptions propagate to the parent scope's CoroutineExceptionHandler.
val handler = CoroutineExceptionHandler { ctx, t ->
    log.error("uncaught in $ctx: $t")
}

// SupervisorJob — children failures don't cancel siblings
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + handler)

// runCatching inside async — prevents one child from cancelling siblings
val results = ids.map { id ->
    async { runCatching { fetchUser(id) } }
}.awaitAll()

// Use supervisorScope { } for ad-hoc fault-tolerant fan-out.
```

## Concurrency Model

**Coroutines — structured concurrency the right way**

```kotlin
import kotlinx.coroutines.*

class UserRepo(private val client: HttpClient, private val scope: CoroutineScope) {

    // suspend = no thread blocked. Dispatcher hops happen internally.
    suspend fun fetchUsers(ids: List<Int>): List<User> = coroutineScope {
        // Each async is a child — coroutineScope waits for all, cancels on failure.
        ids.map { id ->
            async(Dispatchers.IO) {
                client.get("https://api/users/$id").body<User>()
            }
        }.awaitAll()
    }

    // Flow = cold stream. Nothing runs until collected.
    fun watchUser(id: Int): Flow<User> = channelFlow {
        val ws = client.webSocket("wss://api/users/$id/live")
        for (frame in ws.incoming) send(decode(frame))
    }
}

// Caller: runBlocking only in main(); in services use the framework's scope.
runBlocking { UserRepo(client, this).fetchUsers(listOf(1, 2, 3)) }
```

**Dispatchers — pick by workload**

```kotlin
import kotlinx.coroutines.*

// Dispatchers.Default  — CPU-bound work, thread pool ~ CPU cores (min 2).
// Dispatchers.IO       — blocking I/O, larger pool (~64 threads default).
// Dispatchers.Main     — UI thread (Android main, JavaFX app, Swing EDT).
// Dispatchers.Unconfined — runs in the caller thread until first suspension.

suspend fun cpuHeavy() = withContext(Dispatchers.Default) {
    // Matrix multiply, parsing, crypto
}

suspend fun blockingCall() = withContext(Dispatchers.IO) {
    // JDBC, blocking HTTP, file I/O
}

// NEVER call blocking code from Default — it starves the CPU pool.
// NEVER call UI code from anywhere except Main — use withContext(Dispatchers.Main).
```

**Flow — cold stream, backpressure, operators**

```kotlin
import kotlinx.coroutines.flow.*

// Flow is cold — nothing runs until collected. Like Kotlin's Sequence but async.
fun userStream(ids: List<Int>): Flow<User> = flow {
    for (id in ids) {
        emit(fetchUser(id))  // suspends, naturally backpressured
    }
}

// Operators — same vocabulary as RxJava / Reactor
userStream(ids)
    .filter { it.email.endsWith("@corp.com") }
    .map { it.name }
    .distinctUntilChanged()
    .onEach { log.info("got $it") }
    .catch { e -> log.error("stream failed", e); emit(User.placeholder()) }
    .collect { println(it) }  // terminal — starts the flow

// StateFlow / SharedFlow — hot streams (independent of subscribers).
// StateFlow for UI state (always has a value), SharedFlow for events.
```

**Channels — bounded producer/consumer with backpressure**

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

// Channel = CSP-style queue. Buffered for backpressure, unbounded by default.
fun CoroutineScope.producer(): ReceiveChannel<Int> = produce {
    for (i in 1..100) send(i)  // suspends when buffer full (backpressure)
}

fun CoroutineScope.consumer(ch: ReceiveChannel<Int>) = launch {
    for (x in ch) process(x)  // suspends when empty
}

// Pipeline
val ch = producer()
consumer(ch)

// Bounded channel for explicit backpressure
val bounded = Channel<Int>(capacity = 10)
// Channel.UNLIMITED, Channel.CONFLATED (drop oldest), Channel.RENDEZVOUS (default)
```

## Testing Patterns

**JUnit 5 + kotlin.test — the JVM standard**

```kotlin
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import kotlin.test.assertEquals

class UserTest {
    private val user = User(id = 1, email = "a@b.io")

    @Test fun `validates a real email`() {
        assertTrue(user.isValid())
        assertEquals("a@b.io", user.email)
    }

    @Test fun `rejects bad emails`() {
        assertThrows<ValidationException> {
            User(id = 1, email = "nope")
        }
    }

    // Parametrized via @ParameterizedTest + @ValueSource / @MethodSource
    @ParameterizedTest
    @ValueSource(strings = ["", "nope", "a@@b.io"])
    fun `rejects bad email: $email`(email: String) {
        assertThrows<ValidationException> { User(1, email) }
    }
}
```

**Kotest — idiomatic Kotlin testing**

```kotlin
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.property.forAll
import io.kotest.property.Arb
import io.kotest.property.arbitrary.int

class UserTest : StringSpec({
    "validates a real email" {
        User(1, "a@b.io").isValid() shouldBe true
    }

    "rejects bad emails" {
        forAll(Arb.string()) { email ->
            User(1, email).isValid() == (email.contains("@"))
        }
    }

    // Property-based testing — Kotest generates edge cases
    "list reversal is idempotent" {
        forAll(Arb.list(Arb.int())) { xs ->
            xs.reversed().reversed() == xs
        }
    }
})
```

**Mocks — MockK (Kotlin-first) vs Mockito-Kotlin**

```kotlin
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify

class UserServiceTest {
    private val repo = mockk<UserRepository>()
    private val service = UserService(repo)

    @Test fun `fetches user from repo`() {
        // Arrange
        every { repo.find(1) } returns User(1, "a@b.io")
        every { repo.find(2) } returns null

        // Act + Assert
        service.getEmail(1) shouldBe "a@b.io"
        service.getEmail(2) shouldBe null

        // Verify
        verify(exactly = 2) { repo.find(any()) }
    }

    // MockK handles Kotlin specifics (final classes, extension functions,
    // suspend functions, coroutines) better than Mockito-Kotlin.
}
```

**Coroutines test support (kotlinx-coroutines-test)**

```kotlin
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import org.junit.jupiter.api.Test

class UserRepoTest {
    private val repo = UserRepo(mockk())

    @Test fun `fetches users in parallel`() = runTest {
        // runTest replaces real delays with virtual time — tests are fast.
        // All Dispatchers are auto-swapped to the test dispatcher.
        val users = repo.fetchUsers(listOf(1, 2, 3))
        users.size shouldBe 3
    }

    @Test fun `handles delays via virtual time`() = runTest {
        repo.refreshAfterDelay()  // suspend fun with delay(1_000)
        advanceUntilIdle()        // skip the delay
        // Test completes in microseconds, not seconds
    }
}
```

## Performance Tuning

- Coroutines are ~10-100x cheaper than threads — a JVM can run 100k+ coroutines vs ~10k threads. Continuations, not OS threads.
- Dispatchers.Default CPU-bound ~cores threads; Dispatchers.IO ~64 threads for blocking. Pick by workload — never block Default.
- Inline functions eliminate lambda allocation — critical for hot paths. stdlib collection ops are inline for this reason.
- Reified generics via inline preserve type info at runtime — powers gson/moshi/Koin DI without reflection.
- IntArray/DoubleArray/etc. are primitive-typed (no boxing) — ~3-5x less memory than Array<Int>.
- Sequence is lazy — single-pass, no intermediate lists. For large pipelines use asSequence(); for small collections eager List is faster.
- by lazy default uses double-checked locking (LazyThreadSafetyMode.SYNCHRONIZED) — every read takes a volatile check. Use NONE for single-thread init.
- data class generates equals/hashCode/toString/copy — zero runtime cost vs hand-written. Limit: must have ctor param, can't be open/abstract/sealed.
- Extension functions resolve statically — they don't dispatch by runtime type. 'open' subclassing doesn't change which extension fires.
- K2 compiler (Kotlin 2.0) is ~2x faster than K1 — significant for big codebases and CI.
- JIT warms up over ~30s-2min; cold-start Kotlin apps are slower than native binaries (use GraalVM native-image for instant start).
- StateFlow vs SharedFlow: StateFlow always has a value (good for UI state), SharedFlow doesn't (good for events). Wrong choice = subtle UI bugs.
- kotlinx.serialization is compile-time generated — no reflection, faster than Gson/Moshi, smaller binary.
- Avoid GlobalScope.launch — coroutines have no parent, leak forever. Use lifecycleScope (Android) or the framework's CoroutineScope.
- JMH (Java Microbenchmark Harness) is the standard for benchmarking Kotlin; Gradle plugins: kotlinx-benchmark.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Gradle](https://gradle.org/) | Build tool + dependency manager — Kotlin DSL (*.gradle.kts) is the modern config. | build |
| [Kotlin Compiler](https://kotlinlang.org/docs/command-line.html) | kotlinc — official compiler. Bundled with Gradle/Maven plugins. | build |
| [IntelliJ IDEA](https://www.jetbrains.com/idea/) | JetBrains' IDE — best Kotlin support, refactorings, debugger. CE is free. | build |
| [Android Studio](https://developer.android.com/studio) | Google's Android IDE — IntelliJ-based, Kotlin-first since 2019. | build |
| [kotlinx.coroutines](https://github.com/Kotlin/kotlinx.coroutines) | Coroutines library — Dispatchers, Flow, channels. Required for any async code. | build |
| [kotlinx.serialization](https://github.com/Kotlin/kotlinx.serialization) | Compile-time JSON/ProtoBuf/CBOR — no reflection, type-safe. | build |
| [Ktor](https://ktor.io/) | JetBrains' async web framework — client + server, coroutine-based. | build |
| [Spring Boot](https://spring.io/projects/spring-boot) | JVM web framework — first-class Kotlin support since 5.0, coroutines since 5.2. | build |
| [JUnit 5](https://junit.org/junit5/) | JVM test framework — the default. kotlin.test wraps it for cross-platform. | test |
| [Kotest](https://kotest.io/) | Kotlin-first test framework — multiple styles (StringSpec, BehaviorSpec), property testing built-in. | test |
| [MockK](https://mockk.io/) | Kotlin-first mocking — handles final classes, suspend functions, extension functions better than Mockito-Kotlin. | test |
| [kotlinx-coroutines-test](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-test/) | Test support for coroutines — runTest with virtual time, Dispatchers auto-swapped. | test |
| [Detekt](https://detekt.dev/) | Static analyzer — Kotlin-specific code smells, complexity, style rules. | lint |
| [ktlint](https://ktlint.github.io/) | Linter + formatter — enforces Kotlin coding conventions, no config needed. | lint |
| [Kotlin Multiplatform (KMP)](https://kotlinlang.org/docs/multiplatform.html) | Share business logic across iOS/Android/Web/Desktop — UI stays native. | build |
| [Compose Multiplatform](https://www.jetbrains.com/lp/compose-multiplatform/) | JetBrains' declarative UI — extends Android's Compose to iOS/Desktop/Web. | build |
| [Koin](https://insert-koin.io/) | Lightweight DI framework — pure Kotlin, no reflection, no codegen. The Kotlin Spring alternative. | build |
| [JetBrains Exposed](https://github.com/JetBrains/Exposed) | SQL ORM — type-safe DSL over JDBC. JetBrains' answer to JOOQ + Hibernate. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 2016 | First stable release — declared Android's official language in 2017. |
| 1.1 | 2017 | Coroutines (experimental), type aliases, JS target, destructuring in lambdas. |
| 1.2 | 2017 | kotlinx.serialization, multiplatform projects (JVM + JS shared code). |
| 1.3 | 2018 | Coroutines stable, inline classes, unsigned numbers, stdlib multiplatform. |
| 1.4 | 2020 | Kotlin 1.4 — SAM conversions for Kotlin interfaces, tailrec in delegation, JVM 14 target. |
| 1.5 | 2021 | Unsigned arithmetic stable, JVM records interop, inline value classes stable. |
| 1.6 | 2021 | Exhaustive when for sealed, stdlib deque, improved Kotlin/Native memory model (preview). |
| 1.7 | 2022 | K2 compiler (preview), ..< range operator, deferrable builder inference. Stable Kotlin/Native memory model. |
| 1.8 | 2022 | JVM 21 target, recursive inline functions, structured concurrency improvements. |
| 1.9 | 2023 | K2 beta, KMP stable for non-UI code, enum class entries, data object stable. |
| 2.0 | 2024 | K2 compiler default (2x faster), smart cast improvements, context parameters (preview). |
| 2.1 | 2024 | Guard conditions in when, non-local break/continue, multi-dollar string interpolation. |
| 2.2 | 2025 | Context parameters (replacement for context receivers) reach Beta. |
| 2.4.20 | 2026 | Sealed classes export as Swift enums with cross-language inheritance, allDistinct/allEqual stdlib additions, browser-testing DSL on Playwright. |

## Interview Hot Questions

1. **What's the difference between val and var, and why default to val?** *(easy)*

   val is a read-only binding (assigned once); var is reassignable. Default to val because immutability prevents an entire class of bugs: race conditions on shared state, accidental reassignment, and 'what value does this have now?' reasoning. Mutable state is the root of most concurrency bugs; using val forces you to think in terms of transformations rather than in-place updates. Use var only when reassignment is genuinely required (loops, accumulators in performance-critical code).

2. **How does Kotlin's null safety actually work?** *(medium)*

   The type system distinguishes T (never null) from T? (maybe null). The compiler rejects 'val x: String = null' at compile time. For T?, you must unwrap via ?. (safe-call), !! (force-unwrap, throws NPE), ?: (elvis, default), or if-let. The catch: Java code returns platform types (T!) — neither T nor T? — so the compiler can't enforce nullability there. Add @Nullable/@NotNull annotations to Java, or treat every Java return as T? on the Kotlin side.

3. **Explain coroutines and structured concurrency.** *(medium)*

   A coroutine is a suspendable computation — it pauses at suspension points (await, delay) without blocking the underlying thread, multiplexed on a small Dispatcher pool. Structured concurrency means every coroutine has a parent scope, and the parent doesn't return until all children complete. This prevents leaks (no orphan coroutines after a request ends) and propagates cancellation. coroutineScope { } creates a scope; async { } creates a child. GlobalScope.launch is almost never correct because it has no parent.

4. **What's the difference between a coroutine and a thread?** *(easy)*

   A thread is an OS resource (~1MB stack, kernel-scheduled, ~10k max per JVM). A coroutine is a continuation (~1KB) that suspends without blocking the thread — you can have 100k+ coroutines per JVM. Coroutines are multiplexed on a small thread pool (Dispatchers.Default, ~cores). Blocking a coroutine's thread (with Thread.sleep or blocking I/O) starves all other coroutines on that thread — that's why suspend functions and Dispatchers.IO exist.

5. **Explain the difference between Flow and SharedFlow/StateFlow.** *(medium)*

   Flow is cold — it executes its body per collector, like Kotlin's Sequence. Nothing runs until .collect() is called. SharedFlow is hot — runs independently of collectors; multiple collectors share the same stream (think: EventBus). StateFlow is a specialized SharedFlow that always has a value and conflates emissions (collectors see only the latest) — the canonical choice for UI state in Android. Use Flow for one-shot pipelines, StateFlow for current-state, SharedFlow for events.

6. **What are extension functions and what's their dispatch model?** *(hard)*

   An extension function adds a method to a type without modifying it: 'fun String.slug() = lowercase().replace(' ', '-')'. Under the hood, it's compiled to a static function taking the receiver as the first argument — no runtime modification of the class. Crucially, extension functions resolve STATICALLY at compile time based on the declared type, not the runtime type. So 'open class A; class B: A(); fun A.foo() = 1; fun B.foo() = 2; val a: A = B(); a.foo()' calls A.foo() (the declared type), not B.foo(). This surprises OOP devs.

7. **How do data classes differ from regular classes?** *(easy)*

   data class auto-generates equals, hashCode, toString, copy, and componentN (for destructuring) from the constructor parameters. Limitations: must have at least one ctor param, can't be open/abstract/sealed (so no inheritance), and the generated methods work only on the ctor-declared properties. The generated equals/hashCode consider ALL ctor params — for partial identity, write it manually. data class is the default for DTOs and value types; use a regular class for behavior-rich types or when you need inheritance.

8. **What is the difference between by lazy and by Delegates.observable?** *(medium)*

   'by lazy' computes the value once on first access, then memoizes — it's a lazy val. Default mode is SYNCHRONIZED (thread-safe via double-checked locking); PUBLICATION allows multiple threads to compute (last one wins); NONE is single-threaded. 'by Delegates.observable' lets you observe and react to changes (initial value + onChange callback). 'by Delegates.vetoable' lets you reject changes. Both delegate the property's storage to a delegate object via Kotlin's property delegation mechanism.

9. **How do sealed classes enforce exhaustive when()?** *(medium)*

   A sealed class (or interface) has a closed hierarchy — all direct subtypes must be in the same package (Kotlin 1.5+ allows same-module). The compiler knows the complete set, so when() over a sealed type is exhaustive without an 'else' branch. Adding a new subtype makes the compiler flag every when() that doesn't handle it — exhaustive-by-construction refactoring. This is the closest Kotlin gets to Rust/Haskell-style ADTs. Use sealed for state machines, Results, parsing ASTs.

10. **What is Kotlin Multiplatform and how does it work?** *(hard)*

   KMP lets you write shared business logic (models, repositories, networking, validation) in commonMain, then compile it to JVM, JS, and native targets (iOS via Kotlin/Native, which compiles to LLVM). UI stays native — SwiftUI on iOS, Compose on Android. The 'expect/actual' mechanism lets commonMain declare a function/class and each platform provide the actual implementation. Stable for non-UI code since Kotlin 1.9.20. Compose Multiplatform extends Compose to iOS/Desktop/Web — share UI in addition to logic. The main alternative is React Native / Flutter, which use a single language+UI for all platforms.

## When to Choose This

- **vs Java:** use this — Android, anything on the JVM where you want less boilerplate (data classes, null safety, coroutines, extension functions).; use that — Large enterprise codebases already in Java, teams with deep Java expertise, anywhere the Java library ecosystem matters more than syntax ergonomics.
- **vs Scala:** use this — Android, anywhere you want pragmatic OOP+functional without Scala's compile-time complexity, anywhere you need fast builds.; use that — Big-data pipelines (Spark/Flink), teams wanting full FP with typeclasses, anywhere Scala's type system complexity is a feature not a cost.
- **vs Swift:** use this — Android + backend (KMP for shared logic with iOS), anywhere the JVM ecosystem matters.; use that — iOS/macOS native apps, anywhere Apple SDKs are the actual product, anywhere ARC's no-pause model beats JVM GC for latency.
- **vs Dart / Flutter:** use this — Android apps with native UI, backend services, anywhere you want full Java interop.; use that — Cross-platform mobile + web + desktop from a single codebase, anywhere Flutter's widget model fits your UI needs.
- **vs Go:** use this — JVM backends with rich domain models (ADTs, sealed hierarchies), Android, anywhere you need a richer type system.; use that — High-throughput microservices, network daemons, ops tooling, single-binary deployment, anywhere goroutines + tiny runtime beat JVM.

