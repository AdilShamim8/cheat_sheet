import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "kotlin",
  name: "Kotlin",
  category: "languages",
  tier: 2,
  tags: ["static", "jvm", "android", "concise", "coroutines", "functional", "null-safe"],
  tagline: "Statically-typed JVM language with null safety, coroutines, and a conciseness bias — the default for Android and a strong server-side choice via Spring/Ktor.",
  year: 2011,
  author: "JetBrains",

  tldr: [
    "Kotlin is a statically-typed, JVM-targeted language with full Java interop, nullable types baked into the type system, first-class functions, and structured concurrency via coroutines — designed to fix Java's verbosity without abandoning the JVM ecosystem.",
    "It is the official language for Android (since 2019) and is widely used for backend services via Spring Boot, Ktor, and Quarkus; it also compiles to JS and native binaries via Kotlin Multiplatform.",
    "Reach for Kotlin when you're on the JVM but want less boilerplate, when targeting Android, or when you want cross-platform business logic via KMP; it interoperates with any Java library unchanged.",
    "Avoid Kotlin for hot CPU-bound numerics where the JVM overhead matters equally (use C++/Rust), or for tiny scripts where the Gradle bootstrap is overkill (use Python/Go).",
  ],

  mentalModel: {
    title: "Nullability is a type, Java interop is a phase boundary",
    body: "Kotlin's type system distinguishes `String` (never null) from `String?` (maybe null) at compile time — `null` cannot flow into a non-null type without an explicit operator. This single feature eliminates the Billion-Dollar Mistake at the boundary of your Kotlin code. The catch: Java code returns platform types (`String!`) — neither `String` nor `String?` — so the compiler can't enforce nullability there and you must add explicit annotations or null checks. The other model to internalize: coroutines are not threads — they're continuations that suspend without blocking, multiplexed on a small pool of Dispatchers. A `suspend` function looks like synchronous code but yields at suspension points; blocking I/O inside a coroutine starves the dispatcher exactly like a blocked thread would.",
  },

  constructs: [
    { syntax: "val x = 5 / var y = 5", behavior: "Immutable vs mutable local — type inferred.", when: "Default to `val`; switch to `var` only when reassignment is essential." },
    { syntax: "fun f(x: Int, y: Int = 0): Int = x + y", behavior: "Expression body + default arg.", when: "Short pure functions; defaults make overloads redundant." },
    { syntax: "fun f(vararg xs: Int)", behavior: "Variadic parameter — receives Array<out T>.", when: "APIs like listOf(), setOf(); use spread `*arr` to forward." },
    { syntax: "data class User(val id: Int, val email: String)", behavior: "Auto-generates equals/hashCode/toString/copy + componentN for destructuring.", when: "Value types; the default for DTOs and domain models." },
    { syntax: "sealed interface Shape", behavior: "Closed hierarchy — exhaustive when() enforced.", when: "ADTs, state machines, results; enables compile-time totality checks." },
    { syntax: "when (x) { is Ok -> ...; 1,2 -> ...; else -> ... }", behavior: "Switch expression with type + value patterns.", when: "Replaces if/else chains; must be exhaustive over sealed types." },
    { syntax: "x?.let { ... } / x ?: default", behavior: "Safe-call + elvis — null-safe chain with default.", when: "Optional descent; `?:` for default values." },
    { syntax: "suspend fun fetch(): T", behavior: "Marks a function as suspendable — can `await`/`delay` without blocking a thread.", when: "All async I/O; pair with a CoroutineScope." },
    { syntax: "CoroutineScope(Dispatchers.IO).launch { }", behavior: "Launches a coroutine on the IO dispatcher — fire-and-forget.", when: "Fan-out work; lifecycle-bound to the scope." },
    { syntax: "async { } .await()", behavior: "Starts a deferred — await to get the result.", when: "Parallel fan-out; combine with awaitAll." },
    { syntax: "Flow<T> / channelFlow", behavior: "Cold stream — async sequence of values over time.", when: "Reactive pipelines, event streams, paged data." },
    { syntax: "inline fun <reified T> f()", behavior: "Inline + reified type param — T is available at runtime.", when: "Reflection-free type tokens, DI containers, gson/moshi." },
  ],

  patterns: [
    {
      lang: "kotlin",
      caption: "Sealed hierarchy + when — the algebraic data type pattern",
      code: `sealed interface ApiResult<out T> {
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
    // No \`else\` needed — compiler knows the hierarchy is exhaustive.
}

val r: ApiResult<Int> = ApiResult.Ok(42)
r.fold(::println, { c, m -> println("err $c $m") }, { println("loading") })`,
    },
    {
      lang: "kotlin",
      caption: "Coroutines — structured concurrency the right way",
      code: `class UserRepo(private val client: HttpClient, private val scope: CoroutineScope) {

    // suspend = no thread blocked. Dispatcher hops happen internally.
    suspend fun fetchUsers(ids: List<Int>): List<User> = coroutineScope {
        // Each async is a child — coroutineScope waits for all and cancels siblings on failure.
        ids.map { id ->
            async(Dispatchers.IO) {
                client.get("https://api/users/\\$id").body<User>()
            }
        }.awaitAll()
    }

    // Flow = cold stream. Nothing runs until collected.
    fun watchUser(id: Int): Flow<User> = channelFlow {
        val ws = client.webSocket("wss://api/users/\\$id/live")
        for (frame in ws.incoming) {
            send(decode(frame))
        }
    }
}

// Caller: runBlocking only in main(); in services use the framework's scope.
runBlocking { UserRepo(client, this).fetchUsers(listOf(1, 2, 3)) }`,
    },
    {
      lang: "kotlin",
      caption: "Extension functions + scope functions for fluent DSLs",
      code: `// Extension on a third-party type — no subclassing needed.
fun String.isValidEmail(): Boolean =
    matches(Regex("^[^@]+@[^@]+\\\\.[^@]+$"))

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
    log.info("building server on \${it.host}:\${it.port}")
}.build()`,
    },
    {
      lang: "kotlin",
      caption: "Kotlin Multiplatform — share business logic across iOS/Android/Web",
      code: `// commonMain — compiled to JVM, JS, and native (iOS) binaries.
expect class Platform { val name: String }
expect fun nowEpochMs(): Long

class Greeting {
    private val ph = Platform()

    fun greet(): String = "Hello from \${ph.name} at \${nowEpochMs()}"
}

// iosMain / jvmMain / jsMain provide actual implementations:
// actual class Platform { val name = "iOS" }
// actual fun nowEpochMs(): Long = System.currentTimeMillis()  // or NSDate
//
// Shared ViewModels, repositories, and domain models live in commonMain;
// UI stays native (SwiftUI on iOS, Compose on Android).`,
    },
  ],

  pitfalls: [
    {
      title: "Java interop returns platform types (`String!`)",
      symptom: "Calling a Java method that returns `String` compiles fine but throws NPE at runtime if the Java side returns null — the compiler had no way to know.",
      fix: "Add explicit nullability annotations (`@NotNull`/`@Nullable`) to Java code, or treat every Java return value as `T?` on the Kotlin side and null-check before use. JetBrains's `@NotNullByDefault` package-level annotation helps for legacy code.",
    },
    {
      title: "GlobalScope leaks coroutines",
      symptom: "`GlobalScope.launch { ... }` creates a coroutine with no parent — it outlives the activity/request, leaks memory, and is impossible to cancel cleanly.",
      fix: "Always use a scoped launcher: `lifecycleScope` in Android, the framework's CoroutineScope in Spring/Ktor, or `coroutineScope { }` for ad-hoc work. `GlobalScope` is essentially never correct.",
    },
    {
      title: "Blocking calls inside coroutines starve the dispatcher",
      symptom: "`suspend fun fetch() = Thread.sleep(1000)` blocks the underlying thread of the dispatcher — only N threads in Dispatchers.IO, so N concurrent calls lock the whole pool.",
      fix: "Use suspend equivalents (`delay()` instead of `Thread.sleep()`, JDBC with a dedicated dispatcher pool, Reactive drivers). Wrap unavoidable blocking calls in `withContext(Dispatchers.IO) { blockingCall() }` and size the pool.",
    },
    {
      title: "by lazy is not thread-safe by default... actually it is, but it locks",
      symptom: "`val x by lazy { ... }` uses `LazyThreadSafetyMode.SYNCHRONIZED` by default — every read after init takes a volatile read; under contention it serializes.",
      fix: "If you know initialization happens single-threaded, use `lazy(LazyThreadSafetyMode.NONE)`. For init-once in coroutines, `lazy(LazyThreadSafetyMode.PUBLICATION)` avoids the lock at the cost of duplicate computation.",
    },
    {
      title: "Mutable class properties exposed via `var`",
      symptom: "`class C { var items = listOf<Int>() }` is mutable from outside — callers can reassign the field. Combined with concurrent access, this is a data race waiting to happen.",
      fix: "Use `val` with a private `MutableStateFlow` / `mutableListOf` inside, or expose an immutable view: `val items: List<Int> get() = _items`. Kotlin's `var` on a public property is a footgun for library APIs.",
    },
    {
      title: "Collections are invariant — `List<Int>` is not `List<Number>`",
      symptom: "Passing `List<Int>` where `List<Number>` is expected fails to compile (mutable collections are invariant by design); people fall back to `List<Any?>` and lose type safety.",
      fix: "Use `out` variance in APIs: `fun process(items: List<Number>)` accepts `List<Int>` because `List` is covariant (declared `interface List<out E>`). For your own generic types, declare variance at the type, not the call site.",
    },
    {
      title: "`internal` visibility leaks across Gradle modules",
      symptom: "Marking a class `internal` in a Kotlin library does not prevent access from another module compiled into the same JVM — `internal` is module-scoped, but a fat JAR can collapse modules.",
      fix: "Understand that `internal` is per-Gradle-module, not per-JAR. Use `public` + sealed hierarchy to restrict construction, or move truly private types to a separate module not published.",
    },
  ],

  quickReference: [
    { fact: "Null safety: `String` is never null, `String?` may be. Platform types from Java (`String!`) bypass the check — annotate or null-check.", tag: "gotcha" },
    { fact: "Coroutines are ~10-100x cheaper than threads — a JVM can run 100k+ concurrent coroutines vs ~10k threads.", tag: "perf" },
    { fact: "Dispatchers: Default (CPU), IO (blocking I/O, ~64 threads default), Main (UI), Unconfined (testing). Pick by workload.", tag: "perf" },
    { fact: "Kotlin 1.9+ K2 compiler is ~2x faster; Kotlin 2.0 stabilized K2 as default.", tag: "version" },
    { fact: "Kotlin 2.1 has context parameters (replacement for context receivers), smart cast improvements, and nested generic nullability.", tag: "version" },
    { fact: "data class auto-generates equals/hashCode/toString/copy/componentN — limit: must have at least one ctor param, can't be open/abstract/sealed.", tag: "gotcha" },
    { fact: "Sealed classes/interfaces enforce exhaustive when() — add `data object Loading` for ad-hoc states.", tag: "style" },
    { fact: "Extension functions resolve statically — they don't dispatch by runtime type. `open` subclassing doesn't change which extension fires.", tag: "gotcha" },
    { fact: "inline fun with reified T preserves type info at runtime — powers gson/moshi/Koin DI without reflection.", tag: "perf" },
    { fact: "Flow is cold (no work until collected); SharedFlow/StateFlow are hot (independent of subscribers). Use StateFlow for UI state.", tag: "version" },
    { fact: "KMP (Kotlin Multiplatform) shares business logic; UI stays native. Stable for non-UI code since Kotlin 1.9.20.", tag: "version" },
    { fact: "Compose Multiplatform (JetBrains) extends Android's Compose to iOS/Desktop/Web — share UI in addition to logic.", tag: "version" },
    { fact: "kotlinx.serialization is the canonical JSON library — compile-time plugin generates serializers, no reflection.", tag: "style" },
    { fact: "Common style: 4-space indent, lowerCamelCase for funcs/vars, UpperCamelCase for types. ktlint + detekt enforce.", tag: "style" },
    { fact: "Gradle Kotlin DSL (*.gradle.kts) is the modern build config; version catalogs (libs.versions.toml) centralize dependencies.", tag: "style" },
  ],

  goDeeper: [
    { title: "Kotlin Documentation — Official", url: "https://kotlinlang.org/docs/home.html", note: "The canonical reference; the coroutines and null-safety pages are essential reading." },
    { title: "Kotlin Language Specification", url: "https://kotlinlang.org/spec/", note: "Formal grammar and semantics — useful when IntelliJ's red squiggle is mysterious." },
    { title: "Kotlin Coroutines (Roman Elizarov)", url: "https://elizarov.medium.com/", note: "Blog of the coroutines lead designer; deep design rationale for structured concurrency.", },
    { title: "Kotlin in Action (Dmitry Jemerov & Svetlana Isakova)", url: "https://www.manning.com/books/kotlin-in-action", note: "The canonical book; written by JetBrains engineers with deep rationale for design choices." },
    { title: "KEEP — Kotlin Evolution and Enhancement Process", url: "https://github.com/Kotlin/KEEP", note: "Every significant feature has a KEEP proposal; read for motivation, alternatives, and rejected designs." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "Byte / Short / Int / Long", behavior: "8/16/32/64-bit signed integer. Int is the default literal type.", when: "Numeric work. Long for timestamps/IDs, Int for general use." },
      { syntax: "Float / Double", behavior: "IEEE 754 32/64-bit float. Double is the default literal type.", when: "Math. Float only for graphics / huge arrays; BigDecimal for money." },
      { syntax: "Char", behavior: "Single UTF-16 code unit (NOT grapheme cluster).", when: "Single-char work. Use String for text — Char doesn't model Unicode properly." },
      { syntax: "Boolean", behavior: "true / false — strict, no truthiness coercion.", when: "Logic. 'if (x)' requires x to be Boolean." },
      { syntax: "String", behavior: "Immutable UTF-16 sequence (JVM String). Triple-quoted for raw multi-line.", when: "All text. Use trimIndent() on triple-quoted for clean formatting." },
      { syntax: "Unit", behavior: "Singleton 'no value' type — like void but is a real type.", when: "Function return type when there's nothing to return; the type of side effects." },
      { syntax: "Nothing", behavior: "Bottom type — a function returning Nothing never returns (throws, infinite loop).", when: "Type for 'this branch never completes': TODO(), fail(), infinite loops." },
      { syntax: "Any?", behavior: "Top of the type hierarchy — nullable version is the universal supertype.", when: "Avoid in new code; use specific types or generics. Any (non-null) for Java interop." },
    ],
    collections: [
      { syntax: "Array<T>", behavior: "JVM array wrapper — invariant, fixed-size, mutable cells.", when: "Java interop, low-level perf. Use List<T> for general-purpose work." },
      { syntax: "List<T> / MutableList<T>", behavior: "Read-only / mutable list interface — List is covariant (out T).", when: "Default ordered collection. listOf() returns an immutable view; mutableListOf for mutation." },
      { syntax: "Set<T> / MutableSet<T>", behavior: "Hash set — O(1) membership, no duplicates, unordered.", when: "Dedup, membership tests, set algebra." },
      { syntax: "Map<K, V> / MutableMap<K, V>", behavior: "Hash map — read-only / mutable. Subscript returns V? (null for missing).", when: "Keyed lookups, JSON, caches. getValue() throws on missing; getOrElse for default." },
      { syntax: "Sequence<T>", behavior: "Lazy stream — like Python generators. map/filter chain is single-pass.", when: "Large pipelines: asSequence().map{}.filter{}.toList(). Saves intermediate allocations." },
      { syntax: "Pair<A, B> / Triple<A, B, C>", behavior: "Anonymous tuple — destructured via (a, b) = pair.", when: "Quick pairs/triples. For >3 fields or named API, use a data class." },
      { syntax: "IntArray / DoubleArray / ...", behavior: "Primitive-typed array — no boxing, ~3-5x less memory than Array<Int>.", when: "Numerics, performance-critical loops. Maps to JVM int[]/double[] directly." },
      { syntax: "kotlinx.collections.immutable", behavior: "Persistent (immutable) collections — ImmutableList, ImmutableMap. Separate artifact.", when: "Functional pipelines, share-across-threads, undo/redo. PersistentHashMap is structural-sharing." },
    ],
    custom: [
      { syntax: "class C { }", behavior: "Standard class — single inheritance, reference type, JVM-interop.", when: "Default for behavior-rich types. Mark 'open' to allow subclassing." },
      { syntax: "data class User(val id: Int, val email: String)", behavior: "Auto-generates equals/hashCode/toString/copy/componentN for destructuring.", when: "Value types; the default for DTOs and domain models." },
      { syntax: "sealed interface Shape", behavior: "Closed hierarchy — exhaustive when() enforced at compile time.", when: "ADTs, state machines, results; enables totality checks across modules." },
      { syntax: "enum class Color { RED, GREEN }", behavior: "Classic enumeration — each value is a singleton instance of the class.", when: "Closed value sets; can have fields, methods, implement interfaces." },
      { syntax: "object Singleton { }", behavior: "Singleton object — also acts as a namespace and the companion of a class.", when: "Module pattern, factory methods, the home of const val and top-level functions." },
      { syntax: "interface I { fun f() }", behavior: "Interface — methods + properties. Can have default impls. Multiple inheritance OK.", when: "Contracts, polymorphism. Use over abstract class for new code." },
      { syntax: "annotation class Foo", behavior: "Custom annotation — applied via @Foo, read via reflection.", when: "DI, codegen, framework configuration. Often paired with ksp/kapt processors." },
      { syntax: "typealias UserID = Int", behavior: "Type alias — purely cosmetic, no new type created.", when: "Readability. For real type-safety use an inline value class (@JvmInline value class UserID(val v: Int))." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b", behavior: "Arithmetic — for Int, / is integer division. Float division if any operand is Float/Double.", when: "Math. Use BigDecimal for money; integer division rounds toward zero." },
    { syntax: "a % b", behavior: "Modulo — sign follows dividend (like C/Java).", when: "Parity checks, cycling. -7 % 2 == -1 (not 1)." },
    { syntax: "a == b, a != b", behavior: "Structural equality — calls .equals(). Null-safe: a == null works.", when: "Default comparisons. For reference identity use === / !==." },
    { syntax: "a === b, a !== b", behavior: "Reference identity — same object instance. Same as Java's ==.", when: "Detecting shared references; rare in business code." },
    { syntax: "a < b, a > b, a <= b, a >= b", behavior: "Comparison — requires Comparable. Auto-generated for data classes via compareTo.", when: "Sorting, ranges. Chaining: '1 < x && x < 10' (no '1 < x < 10')." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — strict Boolean, no truthiness.", when: "Logic. 'if (x)' requires x to be Boolean." },
    { syntax: "a ? b : c", behavior: "Ternary — Kotlin doesn't have one. Use if-else as expression: 'if (a) b else c'.", when: "Kotlin idiom: if-else IS the ternary. if-else can be assigned to a val." },
    { syntax: "a ?: b", behavior: "Elvis — a if non-null, else b. The default-value operator.", when: "Default values: val x = a ?: default. The Kotlin null-handling headline." },
    { syntax: "a?.b?.c", behavior: "Safe-call chain — short-circuits to null on any null. Returns nullable type.", when: "Optional descent. Combine with ??: 'a?.b ?: default'." },
    { syntax: "a!!", behavior: "Force-unwrap — throws NullPointerException if null. The escape hatch.", when: "Almost never. Use ?: or ?. instead. Acceptable in tests or with @NonNull contracts." },
    { syntax: "a as? B, a as B", behavior: "Cast: 'as?' returns null on failure, 'as' throws ClassCastException.", when: "Downcasting Any to a concrete type. Prefer generics over Any+as." },
    { syntax: "a is B, a !is B", behavior: "Type check — true if a is B (subclass/implementor). Smart-casts afterwards.", when: "Branching by runtime type. Smart-cast eliminates the need for explicit casts." },
    { syntax: "a..b, a until b, a downTo b step n", behavior: "Range — inclusive (..), half-open (until), descending (downTo).", when: "Iteration: for (i in 0 until n) / for (i in 10 downTo 0 step 2)." },
    { syntax: "a in b, a !in b", behavior: "Membership — works on ranges, collections, anything with contains().", when: "Interval checks: x in 0..10. Collection membership: x in set." },
    { syntax: "a..b step n, a..<b", behavior: "Range with step / exclusive end (Kotlin 1.7+ ..< syntax).", when: "Stepped iteration: for (i in 0..100 step 10). '0..<100' is half-open." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "kotlin",
      caption: "File I/O — small (read all) vs large (stream with use)",
      code: `import java.nio.file.Files
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

// Java NIO Files API is the modern way — avoid java.io.File when possible.`,
    },
    {
      lang: "kotlin",
      caption: "stdin / stdout / stderr — CLI tools",
      code: `// Read all of stdin
val data = System.\`in\`.readBytes()
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
println(Json.encodeToString(result))`,
    },
    {
      lang: "kotlin",
      caption: "JSON / kotlinx.serialization — compile-time safe",
      code: `import kotlinx.serialization.*
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

// ProtoBuf / CBOR via the same @Serializable — same data class, different format`,
    },
    {
      lang: "kotlin",
      caption: "HTTP client (Ktor) with retries + coroutines",
      code: `import io.ktor.client.*
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
                throw RuntimeException("HTTP \${resp.status}")
            } catch (e: Exception) {
                if (++attempts >= 3) throw e
                delay(500 * (1L shl (attempts - 1)))  // 0.5s, 1s, 2s
            }
        }
    }
}`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "kotlin",
      caption: "for-in + forEach + indices + withIndex — the holy trinity",
      code: `val items = listOf("a", "b", "c")
val scores = listOf(10, 20, 30)

// for-in — the default
for (item in items) println(item)

// forEach — functional form (no early return without label)
items.forEach { println(it) }

// With index — indices returns IntRange; withIndex returns IndexedValue
for (i in items.indices) println("\$i: \${items[i]}")
for ((i, item) in items.withIndex()) println("\$i: \$item")

// zip — parallel iteration (stops at shortest)
for ((item, score) in items.zip(scores)) println("\$item: \$score")`,
    },
    {
      lang: "kotlin",
      caption: "map / filter / reduce — functional trinity",
      code: `val nums = (1..10).toList()

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
    .sum()`,
    },
    {
      lang: "kotlin",
      caption: "while / do-while / ranges — explicit loops",
      code: `// while — runs while condition is true
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
for (i in 0..100 step 10) print(i)    // 0, 10, ..., 100`,
    },
    {
      lang: "kotlin",
      caption: "Sequences — lazy streams (Python generators, JS iterators)",
      code: `// Sequence is lazy — map/filter chain is single-pass, no intermediate lists.
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
fibs.take(10).toList()  // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "kotlin",
      caption: "Parameters, defaults, vararg, named args",
      code: `fun f(a: Int, b: Int = 10, vararg rest: String): List<Any> {
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
fun greet(name: String) = "Hello, \$name"`,
    },
    {
      lang: "kotlin",
      caption: "Lambdas + scope functions (apply / let / run / also / with)",
      code: `// Lambda — last param can go outside parens; 'it' is the implicit single param
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
    log.info("building on \${it.host}:\${it.port}")
}.build()

// Use let for null-check-and-transform: x?.let { ... }`,
    },
    {
      lang: "kotlin",
      caption: "Inline + reified — reflection-free type tokens",
      code: `// inline: copies the function body into the call site — no lambda allocation.
// reified: makes a generic type parameter available at runtime (normally erased).
inline fun <reified T> load(json: String): T =
    Json.decodeFromString<T>(json)  // T is concrete, not erased

val u: User = load("""{"id":1,"email":"a"}""")

// Common in DI containers, JSON libs, HTTP clients:
//   inline fun <reified T> HttpClient.get(url): T = ...
//   val users: List<User> = client.get("/users")

// Without inline+reified, you'd have to pass Class<T> manually (like Java).`,
    },
    {
      lang: "kotlin",
      caption: "Coroutines — suspend functions + structured concurrency",
      code: `import kotlinx.coroutines.*

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
}`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "kotlin",
      caption: "try / catch / finally — Java-style but expression-capable",
      code: `// try is an expression — returns the value of the last expression in try or catch
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

// Kotlin has no checked exceptions — the compiler doesn't force callers to catch.`,
    },
    {
      lang: "kotlin",
      caption: "Result<T> — typed errors as values",
      code: `// Result is a value type — .success(T) or .failure(Throwable).
// Useful for storing errors in collections (throws can't), or for APIs
// where you want branching instead of try/catch.

fun divide(a: Int, b: Int): Result<Int> =
    if (b == 0) Result.failure(ArithmeticException("div by zero"))
    else Result.success(a / b)

// Pattern-match via fold / getOrThrow / getOrElse
val msg = divide(10, 0).fold(
    onSuccess = { "got \$it" },
    onFailure = { "err: \${it.message}" },
)

// Or via getOrNull + ?.let / ?: elvis
val v: Int? = divide(10, 0).getOrNull()
val safe: Int = divide(10, 0).getOrElse { -1 }

// runCatching — wraps a throwing block in a Result
val r = runCatching { JSON.decode<User>(raw) }
val u = r.getOrThrow()  // re-throw on failure`,
    },
    {
      lang: "kotlin",
      caption: "Sealed Result — domain errors with exhaustive when",
      code: `// Sealed interface gives compile-time exhaustive when — better than Throwable.
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
// when that doesn't handle it — exhaustive-by-construction refactoring.`,
    },
    {
      lang: "kotlin",
      caption: "Custom exceptions + coroutine exception handling",
      code: `class AppException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
class ValidationException(message: String) : AppException(message)

// In coroutines, exceptions propagate to the parent scope's CoroutineExceptionHandler.
val handler = CoroutineExceptionHandler { ctx, t ->
    log.error("uncaught in \$ctx: \$t")
}

// SupervisorJob — children failures don't cancel siblings
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + handler)

// runCatching inside async — prevents one child from cancelling siblings
val results = ids.map { id ->
    async { runCatching { fetchUser(id) } }
}.awaitAll()

// Use supervisorScope { } for ad-hoc fault-tolerant fan-out.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "kotlin",
      caption: "Coroutines — structured concurrency the right way",
      code: `import kotlinx.coroutines.*

class UserRepo(private val client: HttpClient, private val scope: CoroutineScope) {

    // suspend = no thread blocked. Dispatcher hops happen internally.
    suspend fun fetchUsers(ids: List<Int>): List<User> = coroutineScope {
        // Each async is a child — coroutineScope waits for all, cancels on failure.
        ids.map { id ->
            async(Dispatchers.IO) {
                client.get("https://api/users/\$id").body<User>()
            }
        }.awaitAll()
    }

    // Flow = cold stream. Nothing runs until collected.
    fun watchUser(id: Int): Flow<User> = channelFlow {
        val ws = client.webSocket("wss://api/users/\$id/live")
        for (frame in ws.incoming) send(decode(frame))
    }
}

// Caller: runBlocking only in main(); in services use the framework's scope.
runBlocking { UserRepo(client, this).fetchUsers(listOf(1, 2, 3)) }`,
    },
    {
      lang: "kotlin",
      caption: "Dispatchers — pick by workload",
      code: `import kotlinx.coroutines.*

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
// NEVER call UI code from anywhere except Main — use withContext(Dispatchers.Main).`,
    },
    {
      lang: "kotlin",
      caption: "Flow — cold stream, backpressure, operators",
      code: `import kotlinx.coroutines.flow.*

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
    .onEach { log.info("got \$it") }
    .catch { e -> log.error("stream failed", e); emit(User.placeholder()) }
    .collect { println(it) }  // terminal — starts the flow

// StateFlow / SharedFlow — hot streams (independent of subscribers).
// StateFlow for UI state (always has a value), SharedFlow for events.`,
    },
    {
      lang: "kotlin",
      caption: "Channels — bounded producer/consumer with backpressure",
      code: `import kotlinx.coroutines.*
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
// Channel.UNLIMITED, Channel.CONFLATED (drop oldest), Channel.RENDEZVOUS (default)`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "kotlin",
      caption: "JUnit 5 + kotlin.test — the JVM standard",
      code: `import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import kotlin.test.assertEquals

class UserTest {
    private val user = User(id = 1, email = "a@b.io")

    @Test fun \`validates a real email\`() {
        assertTrue(user.isValid())
        assertEquals("a@b.io", user.email)
    }

    @Test fun \`rejects bad emails\`() {
        assertThrows<ValidationException> {
            User(id = 1, email = "nope")
        }
    }

    // Parametrized via @ParameterizedTest + @ValueSource / @MethodSource
    @ParameterizedTest
    @ValueSource(strings = ["", "nope", "a@@b.io"])
    fun \`rejects bad email: \$email\`(email: String) {
        assertThrows<ValidationException> { User(1, email) }
    }
}`,
    },
    {
      lang: "kotlin",
      caption: "Kotest — idiomatic Kotlin testing",
      code: `import io.kotest.core.spec.style.StringSpec
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
})`,
    },
    {
      lang: "kotlin",
      caption: "Mocks — MockK (Kotlin-first) vs Mockito-Kotlin",
      code: `import io.mockk.every
import io.mockk.mockk
import io.mockk.verify

class UserServiceTest {
    private val repo = mockk<UserRepository>()
    private val service = UserService(repo)

    @Test fun \`fetches user from repo\`() {
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
}`,
    },
    {
      lang: "kotlin",
      caption: "Coroutines test support (kotlinx-coroutines-test)",
      code: `import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import org.junit.jupiter.api.Test

class UserRepoTest {
    private val repo = UserRepo(mockk())

    @Test fun \`fetches users in parallel\`() = runTest {
        // runTest replaces real delays with virtual time — tests are fast.
        // All Dispatchers are auto-swapped to the test dispatcher.
        val users = repo.fetchUsers(listOf(1, 2, 3))
        users.size shouldBe 3
    }

    @Test fun \`handles delays via virtual time\`() = runTest {
        repo.refreshAfterDelay()  // suspend fun with delay(1_000)
        advanceUntilIdle()        // skip the delay
        // Test completes in microseconds, not seconds
    }
}`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Coroutines are ~10-100x cheaper than threads — a JVM can run 100k+ coroutines vs ~10k threads. Continuations, not OS threads.", tag: "perf" },
    { fact: "Dispatchers.Default CPU-bound ~cores threads; Dispatchers.IO ~64 threads for blocking. Pick by workload — never block Default.", tag: "perf" },
    { fact: "Inline functions eliminate lambda allocation — critical for hot paths. stdlib collection ops are inline for this reason.", tag: "perf" },
    { fact: "Reified generics via inline preserve type info at runtime — powers gson/moshi/Koin DI without reflection.", tag: "perf" },
    { fact: "IntArray/DoubleArray/etc. are primitive-typed (no boxing) — ~3-5x less memory than Array<Int>.", tag: "perf" },
    { fact: "Sequence is lazy — single-pass, no intermediate lists. For large pipelines use asSequence(); for small collections eager List is faster.", tag: "perf" },
    { fact: "by lazy default uses double-checked locking (LazyThreadSafetyMode.SYNCHRONIZED) — every read takes a volatile check. Use NONE for single-thread init.", tag: "perf" },
    { fact: "data class generates equals/hashCode/toString/copy — zero runtime cost vs hand-written. Limit: must have ctor param, can't be open/abstract/sealed.", tag: "perf" },
    { fact: "Extension functions resolve statically — they don't dispatch by runtime type. 'open' subclassing doesn't change which extension fires.", tag: "gotcha" },
    { fact: "K2 compiler (Kotlin 2.0) is ~2x faster than K1 — significant for big codebases and CI.", tag: "version" },
    { fact: "JIT warms up over ~30s-2min; cold-start Kotlin apps are slower than native binaries (use GraalVM native-image for instant start).", tag: "perf" },
    { fact: "StateFlow vs SharedFlow: StateFlow always has a value (good for UI state), SharedFlow doesn't (good for events). Wrong choice = subtle UI bugs.", tag: "gotcha" },
    { fact: "kotlinx.serialization is compile-time generated — no reflection, faster than Gson/Moshi, smaller binary.", tag: "perf" },
    { fact: "Avoid GlobalScope.launch — coroutines have no parent, leak forever. Use lifecycleScope (Android) or the framework's CoroutineScope.", tag: "gotcha" },
    { fact: "JMH (Java Microbenchmark Harness) is the standard for benchmarking Kotlin; Gradle plugins: kotlinx-benchmark.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Gradle", purpose: "Build tool + dependency manager — Kotlin DSL (*.gradle.kts) is the modern config.", url: "https://gradle.org/", category: "build" },
    { tool: "Kotlin Compiler", purpose: "kotlinc — official compiler. Bundled with Gradle/Maven plugins.", url: "https://kotlinlang.org/docs/command-line.html", category: "build" },
    { tool: "IntelliJ IDEA", purpose: "JetBrains' IDE — best Kotlin support, refactorings, debugger. CE is free.", url: "https://www.jetbrains.com/idea/", category: "build" },
    { tool: "Android Studio", purpose: "Google's Android IDE — IntelliJ-based, Kotlin-first since 2019.", url: "https://developer.android.com/studio", category: "build" },
    { tool: "kotlinx.coroutines", purpose: "Coroutines library — Dispatchers, Flow, channels. Required for any async code.", url: "https://github.com/Kotlin/kotlinx.coroutines", category: "build" },
    { tool: "kotlinx.serialization", purpose: "Compile-time JSON/ProtoBuf/CBOR — no reflection, type-safe.", url: "https://github.com/Kotlin/kotlinx.serialization", category: "build" },
    { tool: "Ktor", purpose: "JetBrains' async web framework — client + server, coroutine-based.", url: "https://ktor.io/", category: "build" },
    { tool: "Spring Boot", purpose: "JVM web framework — first-class Kotlin support since 5.0, coroutines since 5.2.", url: "https://spring.io/projects/spring-boot", category: "build" },
    { tool: "JUnit 5", purpose: "JVM test framework — the default. kotlin.test wraps it for cross-platform.", url: "https://junit.org/junit5/", category: "test" },
    { tool: "Kotest", purpose: "Kotlin-first test framework — multiple styles (StringSpec, BehaviorSpec), property testing built-in.", url: "https://kotest.io/", category: "test" },
    { tool: "MockK", purpose: "Kotlin-first mocking — handles final classes, suspend functions, extension functions better than Mockito-Kotlin.", url: "https://mockk.io/", category: "test" },
    { tool: "kotlinx-coroutines-test", purpose: "Test support for coroutines — runTest with virtual time, Dispatchers auto-swapped.", url: "https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-test/", category: "test" },
    { tool: "Detekt", purpose: "Static analyzer — Kotlin-specific code smells, complexity, style rules.", url: "https://detekt.dev/", category: "lint" },
    { tool: "ktlint", purpose: "Linter + formatter — enforces Kotlin coding conventions, no config needed.", url: "https://ktlint.github.io/", category: "lint" },
    { tool: "Kotlin Multiplatform (KMP)", purpose: "Share business logic across iOS/Android/Web/Desktop — UI stays native.", url: "https://kotlinlang.org/docs/multiplatform.html", category: "build" },
    { tool: "Compose Multiplatform", purpose: "JetBrains' declarative UI — extends Android's Compose to iOS/Desktop/Web.", url: "https://www.jetbrains.com/lp/compose-multiplatform/", category: "build" },
    { tool: "Koin", purpose: "Lightweight DI framework — pure Kotlin, no reflection, no codegen. The Kotlin Spring alternative.", url: "https://insert-koin.io/", category: "build" },
    { tool: "JetBrains Exposed", purpose: "SQL ORM — type-safe DSL over JDBC. JetBrains' answer to JOOQ + Hibernate.", url: "https://github.com/JetBrains/Exposed", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0",  year: 2016, highlight: "First stable release — declared Android's official language in 2017." },
    { version: "1.1",  year: 2017, highlight: "Coroutines (experimental), type aliases, JS target, destructuring in lambdas." },
    { version: "1.2",  year: 2017, highlight: "kotlinx.serialization, multiplatform projects (JVM + JS shared code)." },
    { version: "1.3",  year: 2018, highlight: "Coroutines stable, inline classes, unsigned numbers, stdlib multiplatform." },
    { version: "1.4",  year: 2020, highlight: "Kotlin 1.4 — SAM conversions for Kotlin interfaces, tailrec in delegation, JVM 14 target." },
    { version: "1.5",  year: 2021, highlight: "Unsigned arithmetic stable, JVM records interop, inline value classes stable." },
    { version: "1.6",  year: 2021, highlight: "Exhaustive when for sealed, stdlib deque, improved Kotlin/Native memory model (preview)." },
    { version: "1.7",  year: 2022, highlight: "K2 compiler (preview), ..< range operator, deferrable builder inference. Stable Kotlin/Native memory model." },
    { version: "1.8",  year: 2022, highlight: "JVM 21 target, recursive inline functions, structured concurrency improvements." },
    { version: "1.9",  year: 2023, highlight: "K2 beta, KMP stable for non-UI code, enum class entries, data object stable." },
    { version: "2.0",  year: 2024, highlight: "K2 compiler default (2x faster), smart cast improvements, context parameters (preview)." },
    { version: "2.1",  year: 2024, highlight: "Context parameters (replacement for context receivers), nested generic nullability, guard improvements." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between val and var, and why default to val?", a: "val is a read-only binding (assigned once); var is reassignable. Default to val because immutability prevents an entire class of bugs: race conditions on shared state, accidental reassignment, and 'what value does this have now?' reasoning. Mutable state is the root of most concurrency bugs; using val forces you to think in terms of transformations rather than in-place updates. Use var only when reassignment is genuinely required (loops, accumulators in performance-critical code).", difficulty: "easy" },
    { q: "How does Kotlin's null safety actually work?", a: "The type system distinguishes T (never null) from T? (maybe null). The compiler rejects 'val x: String = null' at compile time. For T?, you must unwrap via ?. (safe-call), !! (force-unwrap, throws NPE), ?: (elvis, default), or if-let. The catch: Java code returns platform types (T!) — neither T nor T? — so the compiler can't enforce nullability there. Add @Nullable/@NotNull annotations to Java, or treat every Java return as T? on the Kotlin side.", difficulty: "medium" },
    { q: "Explain coroutines and structured concurrency.", a: "A coroutine is a suspendable computation — it pauses at suspension points (await, delay) without blocking the underlying thread, multiplexed on a small Dispatcher pool. Structured concurrency means every coroutine has a parent scope, and the parent doesn't return until all children complete. This prevents leaks (no orphan coroutines after a request ends) and propagates cancellation. coroutineScope { } creates a scope; async { } creates a child. GlobalScope.launch is almost never correct because it has no parent.", difficulty: "medium" },
    { q: "What's the difference between a coroutine and a thread?", a: "A thread is an OS resource (~1MB stack, kernel-scheduled, ~10k max per JVM). A coroutine is a continuation (~1KB) that suspends without blocking the thread — you can have 100k+ coroutines per JVM. Coroutines are multiplexed on a small thread pool (Dispatchers.Default, ~cores). Blocking a coroutine's thread (with Thread.sleep or blocking I/O) starves all other coroutines on that thread — that's why suspend functions and Dispatchers.IO exist.", difficulty: "easy" },
    { q: "Explain the difference between Flow and SharedFlow/StateFlow.", a: "Flow is cold — it executes its body per collector, like Kotlin's Sequence. Nothing runs until .collect() is called. SharedFlow is hot — runs independently of collectors; multiple collectors share the same stream (think: EventBus). StateFlow is a specialized SharedFlow that always has a value and conflates emissions (collectors see only the latest) — the canonical choice for UI state in Android. Use Flow for one-shot pipelines, StateFlow for current-state, SharedFlow for events.", difficulty: "medium" },
    { q: "What are extension functions and what's their dispatch model?", a: "An extension function adds a method to a type without modifying it: 'fun String.slug() = lowercase().replace(' ', '-')'. Under the hood, it's compiled to a static function taking the receiver as the first argument — no runtime modification of the class. Crucially, extension functions resolve STATICALLY at compile time based on the declared type, not the runtime type. So 'open class A; class B: A(); fun A.foo() = 1; fun B.foo() = 2; val a: A = B(); a.foo()' calls A.foo() (the declared type), not B.foo(). This surprises OOP devs.", difficulty: "hard" },
    { q: "How do data classes differ from regular classes?", a: "data class auto-generates equals, hashCode, toString, copy, and componentN (for destructuring) from the constructor parameters. Limitations: must have at least one ctor param, can't be open/abstract/sealed (so no inheritance), and the generated methods work only on the ctor-declared properties. The generated equals/hashCode consider ALL ctor params — for partial identity, write it manually. data class is the default for DTOs and value types; use a regular class for behavior-rich types or when you need inheritance.", difficulty: "easy" },
    { q: "What is the difference between by lazy and by Delegates.observable?", a: "'by lazy' computes the value once on first access, then memoizes — it's a lazy val. Default mode is SYNCHRONIZED (thread-safe via double-checked locking); PUBLICATION allows multiple threads to compute (last one wins); NONE is single-threaded. 'by Delegates.observable' lets you observe and react to changes (initial value + onChange callback). 'by Delegates.vetoable' lets you reject changes. Both delegate the property's storage to a delegate object via Kotlin's property delegation mechanism.", difficulty: "medium" },
    { q: "How do sealed classes enforce exhaustive when()?", a: "A sealed class (or interface) has a closed hierarchy — all direct subtypes must be in the same package (Kotlin 1.5+ allows same-module). The compiler knows the complete set, so when() over a sealed type is exhaustive without an 'else' branch. Adding a new subtype makes the compiler flag every when() that doesn't handle it — exhaustive-by-construction refactoring. This is the closest Kotlin gets to Rust/Haskell-style ADTs. Use sealed for state machines, Results, parsing ASTs.", difficulty: "medium" },
    { q: "What is Kotlin Multiplatform and how does it work?", a: "KMP lets you write shared business logic (models, repositories, networking, validation) in commonMain, then compile it to JVM, JS, and native targets (iOS via Kotlin/Native, which compiles to LLVM). UI stays native — SwiftUI on iOS, Compose on Android. The 'expect/actual' mechanism lets commonMain declare a function/class and each platform provide the actual implementation. Stable for non-UI code since Kotlin 1.9.20. Compose Multiplatform extends Compose to iOS/Desktop/Web — share UI in addition to logic. The main alternative is React Native / Flutter, which use a single language+UI for all platforms.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Java", whenThis: "Android, anything on the JVM where you want less boilerplate (data classes, null safety, coroutines, extension functions).", whenThat: "Large enterprise codebases already in Java, teams with deep Java expertise, anywhere the Java library ecosystem matters more than syntax ergonomics." },
    { vs: "Scala", whenThis: "Android, anywhere you want pragmatic OOP+functional without Scala's compile-time complexity, anywhere you need fast builds.", whenThat: "Big-data pipelines (Spark/Flink), teams wanting full FP with typeclasses, anywhere Scala's type system complexity is a feature not a cost." },
    { vs: "Swift", whenThis: "Android + backend (KMP for shared logic with iOS), anywhere the JVM ecosystem matters.", whenThat: "iOS/macOS native apps, anywhere Apple SDKs are the actual product, anywhere ARC's no-pause model beats JVM GC for latency." },
    { vs: "Dart / Flutter", whenThis: "Android apps with native UI, backend services, anywhere you want full Java interop.", whenThat: "Cross-platform mobile + web + desktop from a single codebase, anywhere Flutter's widget model fits your UI needs." },
    { vs: "Go", whenThis: "JVM backends with rich domain models (ADTs, sealed hierarchies), Android, anywhere you need a richer type system.", whenThat: "High-throughput microservices, network daemons, ops tooling, single-binary deployment, anywhere goroutines + tiny runtime beat JVM." },
  ],
};

export default sheet;
