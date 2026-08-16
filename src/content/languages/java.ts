import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "java",
  name: "Java",
  category: "languages",
  tier: 1,
  tags: ["static-typing", "jvm", "gc", "oop", "enterprise", "backend", "portable"],
  tagline: "A statically-typed, GC'd, JVM-based language with a vast enterprise ecosystem — the default for large back-end systems on the JVM.",
  year: 1995,
  author: "James Gosling (Sun Microsystems)",

  tldr: [
    "Java is a statically-typed, garbage-collected, class-based object-oriented language that compiles to JVM bytecode — write once, run anywhere, modulo the JVM version you target.",
    "It dominates large enterprise back-ends (banking, telecom, government), the entire Android ecosystem (via ART), big-data infra (Hadoop, Spark, Kafka, Cassandra, Elasticsearch), and a huge slice of corporate application development.",
    "Reach for Java when you need rock-solid long-term library support, when the Spring ecosystem fits your problem, or when you're operating at a scale where stability and tooling matter more than terseness.",
    "Avoid Java for systems-level code (no value types until Project Valhalla), CLI tools with fast startup (though GraalVM native-image helps), or domains where its verbosity is a real cost — Kotlin is the modern sibling for the JVM.",
  ],

  mentalModel: {
    title: "Objects on the JVM heap, references everywhere",
    body: "Every non-primitive value is a reference to an object on the GC-managed heap — there are no stack-allocated objects, no copy semantics for instances, and `==` compares references, not contents (use `.equals()`). Methods are virtual by default and dispatched via a per-class vtable; `final` opts out. The classpath is the unit of code organization, and the classloader hierarchy determines visibility. Generics are erased at compile time: `List<String>` and `List<Integer>` share one runtime class. Exceptions split into checked (must declare or catch) and unchecked — checked exceptions are unique to Java and increasingly considered a mistake by modern style.",
  },

  constructs: [
    { syntax: "public record Point(int x, int y) {}", behavior: "Immutable data carrier with auto equals/hashCode/toString (Java 16+).", when: "DTOs, value tuples; replaces boilerplate POJOs." },
    { syntax: "var x = compute()", behavior: "Local type inference (Java 10+) — type inferred from initializer; not dynamic.", when: "Local variables where the type is obvious from the right-hand side." },
    { syntax: "Optional<T> find(String id)", behavior: "Container for a maybe-absent value; forces explicit handling at call site.", when: "Return type for lookups. Never as a field or parameter type." },
    { syntax: "try (Resource r = open()) { ... }", behavior: "Try-with-resources — auto-closes anything implementing AutoCloseable, even on throw.", when: "Files, streams, connections, locks — replaces finally blocks." },
    { syntax: "sealed interface Shape permits Circle, Square {}", behavior: "Closed hierarchy — only permitted classes can implement (Java 17+).", when: "Domain modeling with exhaustive switch; algebraic data types." },
    { syntax: "CompletableFuture.supplyAsync(s).thenApply(f)", behavior: "Composable async pipeline running on the ForkJoinPool common pool.", when: "Async orchestration in pre-virtual-thread code; replaces callback chains." },
    { syntax: "interface Fn<T,R> { R apply(T t); }", behavior: "Functional interface — SAM type usable as a lambda target.", when: "Callbacks, strategies; java.util.function supplies Function/Supplier/Predicate/Consumer." },
    { syntax: "Stream.of(xs).map(...).filter(...).collect(toList())", behavior: "Lazy, declarative pipeline over a source; terminal op triggers execution.", when: "Collection transforms; prefer over explicit for-loops for clarity, not always for speed." },
    { syntax: "synchronized (lock) { ... }", behavior: "Mutual exclusion on the lock object's monitor; reentrant per thread.", when: "Coarse-grained thread safety. Prefer java.util.concurrent primitives for new code." },
    { syntax: "@FunctionalInterface\ninterface ...", behavior: "Annotation asserting exactly one abstract method; compiler enforces.", when: "Documenting intent for lambdas; not required, but catches accidental additions." },
    { syntax: "Thread.startVirtualThread(() -> ...)", behavior: "Lightweight coroutine scheduled by the JVM (Java 21+); millions are feasible.", when: "Blocking I/O services — one virtual thread per request, blocking calls are fine." },
  ],

  patterns: [
    {
      lang: "java",
      caption: "Sealed interface + record + switch — algebraic data types",
      code: `sealed interface Shape permits Circle, Rectangle, Triangle {}
record Circle(double r) implements Shape {}
record Rectangle(double w, double h) implements Shape {}
record Triangle(double a, double b, double c) implements Shape {}

double area(Shape s) {
  return switch (s) {
    case Circle c       -> Math.PI * c.r() * c.r();
    case Rectangle r    -> r.w() * r.h();
    case Triangle t     -> {
      double s2 = (t.a() + t.b() + t.c()) / 2;
      yield Math.sqrt(s2 * (s2 - t.a()) * (s2 - t.b()) * (s2 - t.c()));
    }
  };  // exhaustive — no default needed
}`,
    },
    {
      lang: "java",
      caption: "Virtual threads — synchronous code, async throughput (Java 21+)",
      code: `void serve(ServerSocket server) throws IOException {
  try (server) {
    while (!server.isClosed()) {
      Socket client = server.accept();
      // Each request runs on a virtual thread — millions are fine.
      // Blocking calls (InputStream.read) yield, not stall the carrier.
      Thread.startVirtualThread(() -> handle(client));
    }
  }
}

void handle(Socket client) {
  try (client; var in = client.getInputStream();
       var out = client.getOutputStream()) {
    // Synchronous, readable code — but with async-style throughput.
    var req = readRequest(in);
    var res = process(req);
    out.write(res);
  } catch (IOException e) {
    // try-with-resources closed client; nothing else to do
  }
}`,
    },
    {
      lang: "java",
      caption: "Try-with-resources + custom AutoCloseable",
      code: `class DbTx implements AutoCloseable {
  private final Connection conn;
  private boolean committed = false;

  DbTx(Connection c) { this.conn = c; }

  void commit() throws SQLException {
    conn.commit();
    committed = true;
  }

  @Override
  public void close() throws SQLException {
    if (!committed) conn.rollback();   // auto-rollback on exception
    conn.close();
  }
}

try (var tx = new DbTx(dataSource.getConnection())) {
  // ... do work ...
  tx.commit();
}  // rollback runs automatically if commit was never reached`,
    },
    {
      lang: "java",
      caption: "CompletableFuture composition — async fan-out + merge",
      code: `CompletableFuture<User> userF = CompletableFuture.supplyAsync(
    () -> userService.findById(id), executor);

CompletableFuture<List<Order>> ordersF = userF.thenComposeAsync(
    u -> CompletableFuture.supplyAsync(() -> orderRepo.forUser(u.id())));

CompletableFuture<Profile> profileF = userF.thenComposeAsync(
    u -> CompletableFuture.supplyAsync(() -> profileService.fetch(u.id())));

CompletableFuture.allOf(ordersF, profileF).join();
Response res = new Response(userF.join(), ordersF.join(), profileF.join());`,
    },
  ],

  pitfalls: [
    {
      title: "`==` compares references, not contents",
      symptom: "`new String(\"a\") == new String(\"a\")` is false; `Integer.valueOf(127) == Integer.valueOf(127)` is true (cached) but `128 == 128` (boxed) is false — comparisons silently succeed or fail.",
      fix: "Always use `.equals()` for objects. For boxed primitives, unbox first or use `Objects.equals(a, b)`. Enable IntelliJ/SpotBugs warnings on `==` for reference types.",
    },
    {
      title: "Autoboxing allocates silently",
      symptom: "`Map<Integer, Integer>` boxed keys/values cause per-put allocation; tight loops over boxed primitives are 5–20x slower than primitive arrays.",
      fix: "Use `int[]`/`long[]` or fastutil/Trove primitive collections. The JIT cannot always elide boxing. Project Valhalla (value types) will eventually fix this.",
    },
    {
      title: "Checked exceptions leak across abstraction boundaries",
      symptom: "A method throws `IOException` deep in a service; every caller up the chain must declare or wrap, leading to `throws Exception` or generic `RuntimeException` rewraps that lose the original.",
      fix: "Catch at the boundary (controller/adapter); convert to a domain-specific unchecked exception with the cause attached. Modern libraries (Spring, Reactor) use unchecked exclusively.",
    },
    {
      title: "HashMap resize storms under concurrent writes",
      symptom: "Pre-Java-8 HashMap, concurrent put could create cycles in the bucket list — 100% CPU forever. Java 8 fixes the cycle but a HashMap is still not thread-safe; ConcurrentModificationException on read-during-write.",
      fix: "Use `ConcurrentHashMap` for any map shared across threads. `Collections.synchronizedMap` is a coarse lock — strictly worse.",
    },
    {
      title: "Closing resources in finally leaks on exception",
      symptom: "`try { ... } finally { r.close(); }` — if the try throws and close() also throws, the original exception is swallowed by the close exception.",
      fix: "Use try-with-resources; the JVM tracks suppressed exceptions correctly. Never write finally-close boilerplate in modern Java.",
    },
    {
      title: "Object finals do not run promptly (or at all)",
      symptom: "`finalize()` runs at GC time, which may be never — finalization can be delayed indefinitely and runs on a low-priority thread.",
      fix: "Use try-with-resources or `Cleaner` (Java 9+) for deterministic cleanup. `finalize()` is deprecated for removal; never rely on it.",
    },
    {
      title: "Date/Calendar were broken until java.time",
      symptom: "`java.util.Date` is mutable, months are 0-indexed, timezones are inconsistent — `new Date(2024, 1, 1)` is February 1, 1900-something.",
      fix: "Use `java.time.*` (Instant, LocalDate, ZonedDateTime) — immutable, ISO-correct, introduced in Java 8. Never touch Date/Calendar in new code.",
    },
  ],

  quickReference: [
    { fact: "Java 21 (LTS, Sep 2023) added virtual threads, sequenced collections, pattern matching for switch; Java 17 (LTS, 2021) added sealed classes, records.", tag: "version" },
    { fact: "LTS cadence: 8, 11, 17, 21, 25 (every 2 years); non-LTS versions are 6-month releases, unsupported for production.", tag: "version" },
    { fact: "HotSpot escape analysis can scalar-replace short-lived objects — microbenchmarks showing allocation may be free in practice; verify with `-XX:+PrintEscapeAnalysis`.", tag: "perf" },
    { fact: "G1 is the default GC since Java 9; ZGC and Shenandoah offer sub-millisecond pauses on multi-TB heaps (Java 21+).", tag: "perf" },
    { fact: "HashMap: O(1) avg, O(log n) worst case since Java 8 (tree bins at ≥8 entries); resize doubles capacity.", tag: "complexity" },
    { fact: "String deduplication (`-XX:+UseStringDeduplication`) can cut heap 10–25% on string-heavy workloads (G1 only).", tag: "perf" },
    { fact: "Reflection is 10–100x slower than direct calls; use MethodHandles or code-generation (ByteBuddy, ASM) for hot paths.", tag: "perf" },
    { fact: "Generics are erased: `new T()` is impossible; you pass a `Class<T>` and call `clazz.getDeclaredConstructor().newInstance()`.", tag: "gotcha" },
    { fact: "Classpath vs module path: JPMS modules (Java 9+) give strong encapsulation; the classpath remains the legacy mode and most apps still use it.", tag: "version" },
    { fact: "Catching Throwable catches OutOfMemoryError and StackOverflowError — almost always wrong; catch Exception.", tag: "gotcha" },
    { fact: "Integer cache covers -128..127 by default (JLS mandated); `Integer.valueOf(200) == Integer.valueOf(200)` is false.", tag: "gotcha" },
    { fact: "Virtual threads should NOT be pooled — create one per task, blocking is the point; pinning happens inside synchronized blocks (fixed in Java 21 with JEP 491).", tag: "gotcha" },
    { fact: "GraalVM native-image compiles AOT to a standalone binary — sub-50ms startup, but reflection/config required; ideal for AWS Lambda/CLI.", tag: "version" },
    { fact: "JIT compiles hot methods after ~10k invocations (C1) and ~15k (C2); microbenchmarks must use JMH with proper warmup.", tag: "perf" },
  ],

  goDeeper: [
    { title: "The Java Language Specification (JLS)", url: "https://docs.oracle.com/javase/specs/jls/se21/html/index.html", note: "The authoritative language reference; definitive on generics erasure, memory model, and concurrency semantics." },
    { title: "Effective Java (Joshua Bloch, 3rd ed.)", url: "https://www.oreilly.com/library/view/effective-java-3rd/9780134686097/", note: "The canonical book on idiomatic modern Java — items on equals/hashCode, generics, and concurrency are required reading." },
    { title: "Java SE Documentation — Oracle", url: "https://docs.oracle.com/en/java/javase/21/", note: "Official API docs, developer guides, and migration notes per version." },
    { title: "Project Loom / JEP 444: Virtual Threads", url: "https://openjdk.org/jeps/444", note: "The design doc behind the biggest concurrency shift since java.util.concurrent." },
    { title: "The Well-Grounded Java Developer (Benjamin Evans & Martijn Verburg)", url: "https://www.manning.com/books/the-well-grounded-java-developer-second-edition", note: "Modern Java tour — records, sealed types, pattern matching, virtual threads, GraalVM." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "byte", behavior: "Signed 8-bit integer (-128..127). Stored inline; never autoboxed unless used as Object.", when: "Binary protocols, I/O buffers. Rare in app code." },
      { syntax: "short", behavior: "Signed 16-bit integer. Rarely used; int is the default.", when: "Memory-tight arrays of small ints. Otherwise prefer int." },
      { syntax: "int", behavior: "Signed 32-bit integer. The default integer type. Wrapper is Integer (cached -128..127).", when: "Default integer math. Use long for IDs to avoid 2038 / overflow." },
      { syntax: "long", behavior: "Signed 64-bit integer. Suffix `L`. Wrapper is Long.", when: "Timestamps, IDs, large counters. Use BigInteger for >2^63." },
      { syntax: "float / double", behavior: "IEEE-754 single/double. double is the default. Wrapper is Double.", when: "Math. For money use BigDecimal; never float/double for currency." },
      { syntax: "char", behavior: "16-bit UTF-16 code unit — NOT a code point. Unsigned 0..65535.", when: "Single UTF-16 units. For code points use String.codePoints() or Character.toCodePoint()." },
      { syntax: "boolean", behavior: "true/false only — no int↔bool conversion. Wrapper is Boolean.", when: "Logic. Autoboxing to Boolean allocates — avoid in tight loops." },
    ],
    collections: [
      { syntax: "ArrayList<T>", behavior: "Dynamic array — O(1) get/append, O(n) insert/remove at front. Default List.", when: "Random access, iteration. Use LinkedList only for genuine queues/deques." },
      { syntax: "LinkedList<T>", behavior: "Doubly-linked list — O(1) at ends, O(n) random access. Cache-unfriendly.", when: "Rarely. Almost always slower than ArrayList in real workloads." },
      { syntax: "HashMap<K, V>", behavior: "Hash map — O(1) avg, tree bins at ≥8 entries since Java 8 (O(log n) worst).", when: "Default key-value store. Not thread-safe; use ConcurrentHashMap for shared maps." },
      { syntax: "LinkedHashMap<K, V>", behavior: "HashMap with insertion/access order; supports LRU via removeEldestEntry.", when: "Caches (LRU), ordered configs." },
      { syntax: "TreeMap<K, V>", behavior: "Red-black tree — O(log n) ops, sorted by key. Requires Comparable or Comparator.", when: "Range queries, sorted iteration. Slower than HashMap for plain lookup." },
      { syntax: "HashSet<T> / TreeSet<T>", behavior: "Hash / tree-backed sets. HashSet is O(1) avg; TreeSet is sorted, O(log n).", when: "Dedup, membership. Use EnumSet for enum types (bit vector, fastest)." },
      { syntax: "ArrayDeque<T>", behavior: "Resizable-array deque — O(1) at both ends. Faster than Stack (synchronized) and LinkedList.", when: "Stacks, queues, worklists. The default deque in modern Java." },
      { syntax: "ConcurrentHashMap<K, V>", behavior: "Lock-striped concurrent map — reads lock-free, writes stripe-bounded.", when: "Any map shared across threads. Strictly better than synchronizedMap." },
      { syntax: "EnumSet<E> / EnumMap<K, V>", behavior: "Bit-vector set / array map keyed by enum — fastest collection for enums.", when: "Enum-keyed data. Always prefer over HashSet/HashMap for enum types." },
    ],
    custom: [
      { syntax: "class C { ... }", behavior: "Reference type on the heap; single inheritance; virtual methods by default.", when: "Default object type. Use records or sealed types for pure data." },
      { syntax: "interface I { ... }", behavior: "Type contract — multiple interfaces per class. Default + static + private methods since Java 8.", when: "APIs, polymorphism. Prefer over abstract class for new code." },
      { syntax: "record Point(int x, int y) {}", behavior: "Immutable data carrier with auto equals/hashCode/toString (Java 16+).", when: "DTOs, value tuples. Final and immutable by default — replaces boilerplate POJOs." },
      { syntax: "enum E { A, B }", behavior: "Full class — values are singletons, can have fields/methods, implement interfaces.", when: "Closed value sets. Prefer over int constants. Most powerful enum of any mainstream lang." },
      { syntax: "sealed interface Shape permits Circle, Square {}", behavior: "Closed hierarchy — only permitted classes can implement (Java 17+).", when: "Algebraic data types, exhaustive switch, domain modeling." },
      { syntax: "abstract class C { abstract void m(); }", behavior: "Partial implementation — subclass completes it. Single inheritance only.", when: "Library base classes. Prefer interface + default methods in new code." },
      { syntax: "annotation @interface Ann", behavior: "Marker/metadata — retained at SOURCE, CLASS, or RUNTIME via @Retention.", when: "DI (@Inject), validation (@NotNull), codegen (@Override). Read via reflection at runtime." },
      { syntax: "Optional<T>", behavior: "Container for a maybe-absent value. Forces explicit handling at call site.", when: "Return type for lookups. NEVER as a field or parameter type — that's an antipattern." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b, a % b", behavior: "Arithmetic — int overflow wraps silently (no UB). Integer / truncates; mixed promotes per widening rules.", when: "Math. Use Math.addExact / multiplyExact (Java 8+) for checked arithmetic." },
    { syntax: "a++, ++a, a--, --a", behavior: "Pre/post increment — pre returns the new value, post returns the old.", when: "Iteration. The classic `i++` vs `++i` perf debate is dead — JIT eliminates the difference." },
    { syntax: "a == b, a != b", behavior: "For primitives: value equality. For references: identity (same object). Footgun for Integer cache (-128..127).", when: "Primitives only. For reference equality use `==`; for content use `.equals()`." },
    { syntax: "a.equals(b)", behavior: "Content equality — calls Object.equals (identity) unless overridden. Contract: reflexive, symmetric, transitive, consistent.", when: "Reference types. Always override equals + hashCode together — breaking the contract breaks HashMaps." },
    { syntax: "a < b, a > b, a <= b, a >=", behavior: "Numeric comparison only — no operator overloading. Strings use .compareTo().", when: "Primitives. For sorting, use Comparator.comparing(...)." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — operands must be boolean (no truthy/falsy).", when: "Logic. No footguns like JS — `if (x)` is a compile error if x isn't boolean." },
    { syntax: "a & b, a | b, a ^ b, ~a", behavior: "Bitwise AND/OR/XOR/NOT — int/long only. Boolean operands allowed (no short-circuit).", when: "Bit flags, masks. `&` and `|` on booleans evaluate both sides — usually a bug." },
    { syntax: "a << n, a >> n, a >>> n", behavior: "Left / sign-extending right / zero-fill right shift. int promoted to int, long to long.", when: "Low-level bit ops. `>>>` is the unsigned-right-shift escape hatch." },
    { syntax: "a ? b : c", behavior: "Ternary — both branches must be compatible types. Numeric branches promote together (footgun).", when: "Concise conditional. Avoid nesting; the type promotion rules are a footgun." },
    { syntax: "a = b, a += b, a -= b, a *= b, a /= b, a %= b", behavior: "Compound assignment — `a OP= b` is `a = (T)(a OP b)` (implicit cast!).", when: "Mutation. The implicit cast means `byte b = 1; b += 1;` compiles (b = (byte)(b + 1))." },
    { syntax: "instanceof", behavior: "Type test — `x instanceof Foo` is true if x is assignable to Foo. Java 16+ pattern form: `x instanceof Foo f` binds f.", when: "Type narrowing. Prefer pattern form + sealed types for exhaustive dispatch." },
    { syntax: "new", behavior: "Object allocation + constructor call. Always heap-allocated (no stack objects until Valhalla).", when: "Object creation. Value types (Project Valhalla) will eventually allow stack-allocated." },
    { syntax: "(Type) x", behavior: "Cast — checked at runtime, throws ClassCastException on failure. Primitives: narrowing conversion (may lose data).", when: "Downcasting after instanceof. Use generics to avoid casts in modern code." },
    { syntax: "switch (e) { case X -> ... }", behavior: "Switch — arrow form (Java 14+) doesn't fall through. Pattern matching (Java 21+) on types.", when: "Multi-branch dispatch. Use sealed types + pattern switch for ADTs." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "java",
      caption: "Files / Path — modern NIO.2 API",
      code: `import java.nio.file.*;
import java.nio.charset.StandardCharsets;

// Small file — read all at once
String text = Files.readString(Path.of("cfg.json"), StandardCharsets.UTF_8);
List<String> lines = Files.readAllLines(Path.of("huge.log"));

// Large file — stream line by line, lazy
try (var stream = Files.lines(Path.of("huge.log"))) {
  stream.filter(l -> l.contains("ERROR"))
        .forEach(System.err::println);
}  // try-with-resources closes the stream

// Write — atomic move via temp file pattern
Files.writeString(Path.of("out.txt"), "hello", StandardCharsets.UTF_8,
    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);`,
    },
    {
      lang: "java",
      caption: "stdin / stdout / stderr — System.in / out / err",
      code: `import java.util.Scanner;
import java.io.*;

// BufferedReader over stdin — fast for line-by-line
try (var br = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
  String line;
  while ((line = br.readLine()) != null) {
    System.out.println(line.toUpperCase());
  }
}

// Scanner — convenient for tokenized parsing; slower than BufferedReader
Scanner sc = new Scanner(System.in);
int n = sc.nextInt();

// stderr — separate stream
System.err.println("warning: deprecated API");`,
    },
    {
      lang: "java",
      caption: "Serialization — Jackson for JSON, Serializable for legacy",
      code: `import com.fasterxml.jackson.databind.ObjectMapper;

// Jackson — the de-facto JSON library; thread-safe after configuration
ObjectMapper mapper = new ObjectMapper();
String json = mapper.writeValueAsString(new User(42, "alice"));
User u = mapper.readValue(json, User.class);

// Reading from a file
User u2 = mapper.readValue(Path.of("user.json").toFile(), User.class);

// NEVER use java.io.Serializable for untrusted data — ObjectInputStream
// is a remote code execution vector. Always Jackson / Protobuf / etc.`,
    },
    {
      lang: "java",
      caption: "HTTP client (Java 11+) — sync and async",
      code: `import java.net.http.*;
import java.time.Duration;

HttpClient client = HttpClient.newBuilder()
    .connectTimeout(Duration.ofSeconds(5))
    .build();

HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users/42"))
    .header("Accept", "application/json")
    .timeout(Duration.ofSeconds(10))
    .GET().build();

// Sync
HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
if (resp.statusCode() == 200) System.out.println(resp.body());

// Async — returns CompletableFuture
client.sendAsync(req, HttpResponse.BodyHandlers.ofString())
      .thenApply(HttpResponse::body)
      .thenAccept(System.out::println);`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "java",
      caption: "Enhanced for, Iterable.forEach, indexed",
      code: `List<String> items = List.of("a", "b", "c");

// Enhanced for — most readable, no index
for (String s : items) {
  System.out.println(s);
}

// forEach with method reference — concise, but no early break
items.forEach(System.out::println);

// Indexed — for when you need the position
for (int i = 0; i < items.size(); i++) {
  System.out.println(i + ": " + items.get(i));
}`,
    },
    {
      lang: "java",
      caption: "Streams — declarative pipelines (Java 8+)",
      code: `record User(int id, String role, boolean active) {}
List<User> users = List.of(new User(1, "admin", true), new User(2, "member", false));

// Lazy pipeline — runs only on terminal op (toList, collect, count)
List<Integer> activeAdminIds = users.stream()
    .filter(u -> u.role().equals("admin"))
    .filter(User::active)
    .map(User::id)
    .sorted()
    .toList();  // Java 16+ unmodifiable

// Parallel stream — for CPU-bound work; pool is shared (ForkJoinPool.commonPool)
long total = users.parallelStream().mapToInt(User::id).sum();

// Avoid side effects in stream lambdas — they break the pipeline's purity.`,
    },
    {
      lang: "java",
      caption: "while, do-while, labeled break/continue",
      code: `// while — condition checked first
while (iterator.hasNext()) {
  var item = iterator.next();
  if (item.isSkip()) continue;
  if (item.isExit()) break;
  process(item);
}

// do-while — body runs at least once
int c;
do { c = readChar(); } while (c != 'y' && c != 'n');

// Labeled break — escape nested loops (rare; refactor if you need it)
outer:
for (var row : grid) {
  for (var cell : row) {
    if (cell.equals("exit")) break outer;
  }
}`,
    },
    {
      lang: "java",
      caption: "Iterator / ListIterator / Spliterator",
      code: `// Iterator — manual iteration with remove()
var it = list.iterator();
while (it.hasNext()) {
  var x = it.next();
  if (shouldRemove(x)) it.remove();  // safe removal during iteration
}

// ListIterator — bidirectional, add/set supported
var li = list.listIterator();
while (li.hasNext()) li.set(transform(li.next()));

// Spliterator — for parallel streams; trySplit for fork-join
Spliterator<Integer> split = list.spliterator();
Spliterator<Integer> other = split.trySplit();  // for parallel processing`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "java",
      caption: "Lambdas, method references, functional interfaces",
      code: `import java.util.function.*;

// Functional interface — exactly one abstract method (SAM)
@FunctionalInterface
interface Transformer<T, R> { R apply(T input); }

// Lambda — infers the target type
Transformer<String, Integer> len = s -> s.length();

// Method reference — even more concise
Transformer<String, Integer> lenRef = String::length;

// Built-in functional interfaces (java.util.function):
Function<T, R>     // T -> R
Predicate<T>       // T -> boolean
Consumer<T>        // T -> void
Supplier<T>        // () -> T
BiFunction<T,U,R>  // (T, U) -> R`,
    },
    {
      lang: "java",
      caption: "Generics — bounds, wildcards, type erasure",
      code: `// Upper bound — T must be Number or subtype
<T extends Number> double sum(List<T> nums) {
  return nums.stream().mapToDouble(Number::doubleValue).sum();
}

// PECS: Producer Extends, Consumer Super
// Read from List<? extends T>  (producer)
// Write to  List<? super T>    (consumer)
void copy(List<? extends T> src, List<? super T> dst) {
  for (T t : src) dst.add(t);
}

// Type erasure — generics exist only at compile time.
// new T() is impossible; pass Class<T> for runtime type tokens.
<T> T instantiate(Class<T> clazz) throws Exception {
  return clazz.getDeclaredConstructor().newInstance();
}`,
    },
    {
      lang: "java",
      caption: "Varargs + records + default args via overloads",
      code: `// Varargs — last parameter; compiler builds an array
String join(String sep, String... parts) {
  return String.join(sep, parts);
}
join(", ", "a", "b", "c");  // "a, b, c"

// No default args — simulate via overloads (verbose)
void log(String msg)              { log(msg, Level.INFO); }
void log(String msg, Level level) { /* ... */ }

// Records make multi-return clean (Java 16+)
record Result(int code, String body) {}
Result fetch() { return new Result(200, "ok"); }`,
    },
    {
      lang: "java",
      caption: "Stream collectors + grouping",
      code: `import java.util.stream.Collectors;
import java.util.*;

Map<String, List<User>> byRole = users.stream()
    .collect(Collectors.groupingBy(User::role));

Map<String, Long> countByRole = users.stream()
    .collect(Collectors.groupingBy(User::role, Collectors.counting()));

Map<String, Integer> sumOfIdsByRole = users.stream()
    .collect(Collectors.groupingBy(
        User::role,
        Collectors.summingInt(User::id)));

// toMap — throws on duplicate keys unless you provide a merge fn
Map<Integer, String> idToName = users.stream()
    .collect(Collectors.toMap(User::id, User::name, (a, b) -> a));`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "java",
      caption: "Checked vs unchecked — the Java distinction",
      code: `// Checked — must declare or catch; compiler-enforced
void read() throws IOException { /* ... */ }

// Unchecked — RuntimeException subclasses; not enforced
void validate(String s) {
  if (s == null) throw new IllegalArgumentException("null");
}

// Modern style: throw unchecked, catch at the boundary
// Checked exceptions are widely considered a mistake (they leak
// implementation details up the call chain). Spring, Reactor, and
// most modern frameworks use unchecked exclusively.`,
    },
    {
      lang: "java",
      caption: "try-with-resources — auto-close on scope exit (Java 7+)",
      code: `// Any AutoCloseable is closed in reverse order, even on throw
try (var conn = dataSource.getConnection();
     var stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?")) {
  stmt.setInt(1, 42);
  try (var rs = stmt.executeQuery()) {
    if (rs.next()) return map(rs);
  }
} catch (SQLException e) {
  throw new RuntimeException("query failed", e);  // chain via cause
}
// conn, stmt, rs all closed automatically

// Suppressed exceptions are tracked if close() also throws.`,
    },
    {
      lang: "java",
      caption: "Custom exception hierarchy — derive from RuntimeException",
      code: `public class AppException extends RuntimeException {
  private final String code;
  public AppException(String msg, String code) { super(msg); this.code = code; }
  public AppException(String msg, String code, Throwable cause) { super(msg, cause); this.code = code; }
  public String code() { return code; }
}

public class NotFoundException extends AppException {
  public NotFoundException(String what, Object id) {
    super(what + " " + id + " not found", "NOT_FOUND");
  }
}

// Throw by class, catch by class — keeps the API simple
throw new NotFoundException("user", 42);`,
    },
    {
      lang: "java",
      caption: "Optional<T> — explicit absence without null",
      code: `// Optional is a return type only — never a field or parameter
Optional<User> find(int id) {
  return Optional.ofNullable(db.get(id));
}

// Consumer — explicit handling of the absent case
User u = find(42)
    .orElseThrow(() -> new NotFoundException("user", 42));

// Or provide a default
User u2 = find(42).orElse(defaultUser);

// Or transform if present
String name = find(42).map(User::name).orElse("anonymous");

// Anti-pattern: Optional.get() without isPresent() — use orElseThrow`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "java",
      caption: "Virtual threads (Java 21+) — synchronous code, async throughput",
      code: `// One virtual thread per request — millions feasible
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
  List<Future<String>> futures = urls.stream()
      .map(url -> executor.submit(() -> fetch(url)))
      .toList();
  for (var f : futures) System.out.println(f.get());
}

// Or spawn a single virtual thread
Thread.startVirtualThread(() -> {
  var user = fetchUser(id);     // blocking call — yields, doesn't stall carrier
  var orders = fetchOrders(id); // blocking again — same story
  respond(user, orders);
});

// Rule: virtual threads should NOT be pooled — one per task, blocking is fine.`,
    },
    {
      lang: "java",
      caption: "CompletableFuture — composable async (pre-virtual-thread)",
      code: `ExecutorService pool = Executors.newFixedThreadPool(8);

CompletableFuture<User> userF = CompletableFuture.supplyAsync(() -> fetchUser(id), pool);
CompletableFuture<List<Order>> ordersF = userF.thenComposeAsync(
    u -> CompletableFuture.supplyAsync(() -> fetchOrders(u.id()), pool));
CompletableFuture<Profile> profileF = userF.thenComposeAsync(
    u -> CompletableFuture.supplyAsync(() -> fetchProfile(u.id()), pool));

CompletableFuture.allOf(ordersF, profileF).join();
Response res = new Response(userF.join(), ordersF.join(), profileF.join());

// With virtual threads (Java 21+), prefer plain blocking calls instead — simpler, equally fast.`,
    },
    {
      lang: "java",
      caption: "Locks — synchronized vs ReentrantLock vs StampedLock",
      code: `// synchronized — built-in, reentrant, can't time out or interrupt
synchronized (lock) { /* ... */ }

// ReentrantLock — explicit, supports tryLock / interrupt / fairness
ReentrantLock lock = new ReentrantLock();
lock.lock();
try { /* ... */ } finally { lock.unlock(); }   // MUST unlock in finally

// StampedLock — optimistic reads, ~2x faster than ReentrantReadWriteLock
// for read-heavy workloads. Caveat: not reentrant.
StampedLock sl = new StampedLock();
long stamp = sl.tryOptimisticRead();
int x = data;
if (!sl.validate(stamp)) {
  stamp = sl.readLock();
  try { x = data; } finally { sl.unlockRead(stamp); }
}`,
    },
    {
      lang: "java",
      caption: "java.util.concurrent — ExecutorService, queues, atomic",
      code: `// Bounded thread pool — for CPU-bound work; size = numCores
ExecutorService pool = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());

// BlockingQueue — producer/consumer with backpressure
BlockingQueue<Task> q = new ArrayBlockingQueue<>(100);
new Thread(() -> { q.put(task); }).start();     // blocks when full
new Thread(() -> { Task t = q.take(); }).start(); // blocks when empty

// AtomicXxx — lock-free counters and CAS
AtomicLong counter = new AtomicLong();
counter.incrementAndGet();
counter.compareAndSet(5, 10);  // CAS — true if swap happened

// Always shutdown pools — otherwise the JVM hangs at exit
pool.shutdown();
pool.awaitTermination(10, TimeUnit.SECONDS);`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "java",
      caption: "JUnit 5 — Jupiter API",
      code: `import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

class CartTest {
  private Cart cart;

  @BeforeEach    // runs before each test
  void setUp() { cart = new Cart(); }

  @Test
  @DisplayName("adds items to total")
  void addsItem() {
    cart.add(new Item("x", 100));
    assertEquals(100, cart.total());
    assertTrue(cart.size() == 1);
  }

  @ParameterizedTest
  @CsvSource({ "1, 2, 3", "10, 5, 15", "-1, 1, 0" })
  void adds(int a, int b, int expected) {
    assertEquals(expected, a + b);
  }
}`,
    },
    {
      lang: "java",
      caption: "AssertJ + Mockito — fluent assertions + mocking",
      code: `import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

// AssertJ — fluent, readable, rich failure messages
assertThat(cart.total()).isEqualTo(100).isNotNegative();
assertThat(users).extracting(User::name).containsExactly("alice", "bob");

// Mockito — mock collaborators at the boundary
UserRepo mockRepo = mock(UserRepo.class);
when(mockRepo.findById(42)).thenReturn(Optional.of(new User(42, "alice")));

UserService svc = new UserService(mockRepo);
assertThat(svc.getName(42)).isEqualTo("alice");
verify(mockRepo, times(1)).findById(42);`,
    },
    {
      lang: "java",
      caption: "jqwik — property-based testing",
      code: `import net.jqwik.api.*;
import static org.assertj.core.api.Assertions.*;

class SortProperties {
  @Property
  void idempotent(@ForAll("intList") List<Integer> xs) {
    List<Integer> once = sorted(xs);
    assertThat(sorted(once)).isEqualTo(once);
  }

  @Provide
  Arbitrary<List<Integer>> intList() {
    return Arbitraries.integers().list().ofMaxSize(100);
  }

  // Run: ./gradlew test — jqwik shrinks failing cases to minimal reproducers.
}`,
    },
    {
      lang: "java",
      caption: "Testcontainers — real dependencies in tests",
      code: `import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;

@Testcontainers
class UserRepositoryTest {
  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

  @Test
  void findsById() {
    var ds = setupDataSource(postgres);  // real Postgres, ephemeral
    var repo = new UserRepository(ds);
    repo.save(new User(1, "alice"));
    assertThat(repo.find(1)).isPresent();
  }
}`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "HotSpot escape analysis can scalar-replace short-lived objects — microbenchmarks showing allocation may be free in practice; verify with `-XX:+PrintEscapeAnalysis`.", tag: "perf" },
    { fact: "G1 is the default GC since Java 9; ZGC and Shenandoah offer sub-millisecond pauses on multi-TB heaps (Java 21+).", tag: "perf" },
    { fact: "HashMap: O(1) avg, O(log n) worst case since Java 8 (tree bins at ≥8 entries); resize doubles capacity.", tag: "complexity" },
    { fact: "String deduplication (`-XX:+UseStringDeduplication`) can cut heap 10–25% on string-heavy workloads (G1 only).", tag: "perf" },
    { fact: "Reflection is 10–100x slower than direct calls; use MethodHandles or code-generation (ByteBuddy, ASM) for hot paths.", tag: "perf" },
    { fact: "Generics are erased: `new T()` is impossible; you pass a `Class<T>` and call `clazz.getDeclaredConstructor().newInstance()`.", tag: "gotcha" },
    { fact: "JIT compiles hot methods after ~10k invocations (C1) and ~15k (C2); microbenchmarks must use JMH with proper warmup.", tag: "perf" },
    { fact: "Virtual threads should NOT be pooled — create one per task, blocking is the point; pinning happens inside synchronized blocks (fixed in Java 21 with JEP 491).", tag: "gotcha" },
    { fact: "GraalVM native-image compiles AOT to a standalone binary — sub-50ms startup, but reflection/config required; ideal for AWS Lambda/CLI.", tag: "version" },
    { fact: "Integer cache covers -128..127 by default (JLS mandated); `Integer.valueOf(200) == Integer.valueOf(200)` is false.", tag: "gotcha" },
    { fact: "Catching Throwable catches OutOfMemoryError and StackOverflowError — almost always wrong; catch Exception.", tag: "gotcha" },
    { fact: "Autoboxing allocates silently — `Map<Integer, Integer>` boxed keys/values cause per-put allocation; use int[]/long[] or fastutil primitive collections.", tag: "perf" },
    { fact: "Classpath vs module path: JPMS modules (Java 9+) give strong encapsulation; the classpath remains the legacy mode and most apps still use it.", tag: "version" },
    { fact: "JMH (Java Microbenchmark Harness) is the only valid way to microbenchmark — never use System.currentTimeMillis(); the JIT will fool you.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "JDK (OpenJDK)", purpose: "The reference Java implementation — Oracle JDK and most others are built on it.", url: "https://openjdk.org/", category: "build" },
    { tool: "Maven", purpose: "Build + dependency manager; XML config (pom.xml); ubiquitous in enterprise.", url: "https://maven.apache.org/", category: "build" },
    { tool: "Gradle", purpose: "Build tool with Groovy/Kotlin DSL — flexible, faster than Maven via incremental builds.", url: "https://gradle.org/", category: "build" },
    { tool: "Bazel", purpose: "Google's hermetic build system — best for large Java monorepos (used internally at Google).", url: "https://bazel.build/", category: "build" },
    { tool: "Ant + Ivy", purpose: "Legacy build tools — mostly replaced by Maven/Gradle; rare in new code.", url: "https://ant.apache.org/", category: "build" },
    { tool: "JitPack", purpose: "Package directly from Git repos — popular for libraries not on Maven Central.", url: "https://jitpack.io/", category: "package" },
    { tool: "Maven Central", purpose: "The default artifact repository — largest Java package registry.", url: "https://central.sonatype.com/", category: "package" },
    { tool: "SpotBugs / Error Prone", purpose: "Static analyzers — SpotBugs from bytecode, Error Prone at compile time.", url: "https://errorprone.info/", category: "lint" },
    { tool: "Checkstyle", purpose: "Style enforcer — configures per-project conventions; pairs with Maven/Gradle plugins.", url: "https://checkstyle.sourceforge.io/", category: "lint" },
    { tool: "Spotless / google-java-format", purpose: "Code formatters — opinionated, integrates with CI and editors.", url: "https://github.com/diffplug/spotless", category: "lint" },
    { tool: "JUnit 5", purpose: "The standard test framework — Jupiter API, parameterized tests, extensions.", url: "https://junit.org/junit5/", category: "test" },
    { tool: "Mockito", purpose: "Mocking framework — mock collaborators at the boundary; record/verify interactions.", url: "https://site.mockito.org/", category: "test" },
    { tool: "AssertJ", purpose: "Fluent assertions — far more readable than JUnit's built-in assertEquals.", url: "https://assertj.github.io/doc/", category: "test" },
    { tool: "jqwik", purpose: "Property-based testing — Hypothesis-style shrinking for Java.", url: "https://jqwik.net/", category: "test" },
    { tool: "Testcontainers", purpose: "Spin up real Docker dependencies (Postgres, Kafka, Redis) for integration tests.", url: "https://www.testcontainers.org/", category: "test" },
    { tool: "JMH", purpose: "Java Microbenchmark Harness — the only valid way to microbenchmark Java.", url: "https://openjdk.org/projects/code-tools/jmh/", category: "test" },
    { tool: "Async Profiler / JFR", purpose: "Low-overhead profilers — JFR is built into the JDK, async-profiler is the gold standard.", url: "https://github.com/async-profiler/async-profiler", category: "debug" },
    { tool: "VisualVM / JMC", purpose: "GUI profilers + heap analyzers — JMC is Oracle's mission control.", url: "https://visualvm.github.io/", category: "debug" },
    { tool: "Spring Boot", purpose: "Opinionated web/service framework — embedded Tomcat, autoconfig, huge ecosystem.", url: "https://spring.io/projects/spring-boot", category: "deploy" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "JDK 1.0", year: 1996, highlight: "First public release — applets, AWT, the original JVM." },
    { version: "JDK 1.1", year: 1997, highlight: "Inner classes, JDBC, reflection, JavaBeans." },
    { version: "J2SE 1.2", year: 1998, highlight: "Collections framework, Swing, JIT in HotSpot, strictfp." },
    { version: "J2SE 1.4", year: 2002, highlight: "assert, NIO, regex, logging, JSSE (SSL)." },
    { version: "J2SE 5.0", year: 2004, highlight: "Generics, annotations, enums, varargs, enhanced for, autoboxing — the big modernization." },
    { version: "Java 6", year: 2006, highlight: "Scripting API (javax.script), JDBC 4, performance work; long stabilization era." },
    { version: "Java 7", year: 2011, highlight: "try-with-resources, diamond operator, NIO.2, switch-on-String, Project Coin." },
    { version: "Java 8 (LTS)", year: 2014, highlight: "Lambdas, Streams, Optional, java.time, default methods — the second big modernization." },
    { version: "Java 9", year: 2017, highlight: "JPMS modules, JShell, reactive Streams, collection factory methods (List.of). Long delay from legal battles." },
    { version: "Java 11 (LTS)", year: 2018, highlight: "var, HttpClient, Flight Recorder open-sourced, Nashorn deprecated." },
    { version: "Java 17 (LTS)", year: 2021, highlight: "Records, sealed types, pattern matching for instanceof, switch expressions." },
    { version: "Java 21 (LTS)", year: 2023, highlight: "Virtual threads, sequenced collections, pattern matching for switch, generational ZGC." },
    { version: "Java 25 (LTS)", year: 2025, highlight: "Scoped values, structured concurrency, statement patterns, AOT caching improvements." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between `==` and `.equals()`?", a: "`==` compares references (identity) for objects, values for primitives. `.equals()` compares content, but only if overridden (Object.equals falls back to `==`). Always use `.equals()` for objects; pair with `hashCode()` to keep the contract. For boxed primitives, unbox first or use `Objects.equals(a, b)`.", difficulty: "easy" },
    { q: "Explain the JVM memory model — heap, stack, metaspace.", a: "Heap is GC-managed, holds all objects (young gen for new allocations, old gen for survivors). Stack is per-thread, holds primitive locals and references to heap objects. Metaspace (Java 8+) holds class metadata, off-heap. Native memory also includes thread stacks and direct ByteBuffers. The JMM defines happens-before relationships for safe publication across threads.", difficulty: "medium" },
    { q: "What is type erasure, and what does it cost?", a: "Generics exist only at compile time — the compiler erases type parameters to their bounds (or Object). `List<String>` and `List<Integer>` share one runtime class. Costs: can't `new T()`, can't do `instanceof List<String>` (only `List<?>`), can't have overloaded methods that differ only by erasure. Benefits: backward compatibility with pre-Java-5 code; one List class at runtime.", difficulty: "medium" },
    { q: "Explain checked vs unchecked exceptions.", a: "Checked exceptions (Exception subclasses except RuntimeException) must be declared or caught — compiler-enforced. Unchecked (RuntimeException + Error) aren't. Checked exceptions leak implementation details up the call chain and are widely considered a mistake. Modern code throws unchecked, catches at the boundary (controller/adapter), and converts to domain errors with the cause attached.", difficulty: "easy" },
    { q: "How do virtual threads work?", a: "Virtual threads (Java 21+) are lightweight, scheduled by the JVM onto carrier (OS) threads. When a virtual thread blocks on I/O, it's unmounted from the carrier, which can run other virtual threads — millions feasible. Code looks synchronous but achieves async throughput. Don't pool them (create one per task, blocking is the point). Caveat: pinned inside `synchronized` blocks (fixed in JEP 491 for Java 21).", difficulty: "medium" },
    { q: "Explain the Java Memory Model (happens-before).", a: "The JMM defines when one thread's writes are visible to another. Actions form a happens-before order: program order within a thread, plus synchronizes-with edges (lock release → acquire, volatile write → read, thread start → first action, etc.). Without a happens-before edge, one thread may never see another's writes — the JIT can reorder freely. Use volatile, synchronized, or java.util.concurrent atomics to establish edges.", difficulty: "hard" },
    { q: "What is the difference between HashMap and ConcurrentHashMap?", a: "HashMap is not thread-safe — concurrent put could corrupt the structure (pre-Java-8: cycles; Java-8+: ConcurrentModificationException on read-during-write). ConcurrentHashMap is lock-striped: reads are lock-free, writes lock only the affected bucket. Use ConcurrentHashMap for any map shared across threads. `Collections.synchronizedMap` is a coarse lock — strictly worse.", difficulty: "medium" },
    { q: "How does the JIT compiler work?", a: "HotSpot has two JITs: C1 (client, fast compile, basic opts) and C2 (server, slow compile, aggressive opts). Methods start interpreted; after ~10k invocations they tier to C1, after ~15k to C2. The JIT inlines, escapes-analysis-eliminates allocations, devirtualizes, vectorizes. Microbenchmarks must use JMH with proper warmup to let the JIT settle; otherwise you measure interpreter speed.", difficulty: "hard" },
    { q: "What is a record, and how does it differ from a class?", a: "Records (Java 16+) are immutable data carriers — auto-generates constructor, accessor, equals, hashCode, toString. They're final and can't be subclassed. Use for DTOs, value tuples, configs. For richer behavior, use a regular class or add compact constructors. Records replace the boilerplate POJOs that IDEs used to generate.", difficulty: "easy" },
    { q: "How does try-with-resources work?", a: "Any AutoCloseable declared in the try header is closed in reverse order at scope exit, even on throw. Suppressed exceptions (from close()) are attached to the primary. Java 9+ allows effectively-final variables in the header. Replaces manual try/finally/close boilerplate — never write the latter in modern Java.", difficulty: "easy" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Kotlin", whenThis: "Enterprise back-ends with mature Spring/Jakarta EE ecosystem, large existing Java codebases, teams valuing stability.", whenThat: "New JVM projects wanting concise syntax, null safety, coroutines; Android (where Kotlin is now the default)." },
    { vs: "C#", whenThis: "Cross-platform back-ends (Spring, Quarkus), big-data infrastructure (Hadoop, Spark, Kafka), Android (legacy).", whenThat: "Windows-first shops, Unity game development, anything targeting the .NET runtime." },
    { vs: "Go", whenThis: "Large enterprise systems, big-data infrastructure, anywhere Spring/Jakarta EE fits.", whenThat: "Cloud-native microservices, CLIs, single-binary deploys — anywhere simplicity and fast startup win." },
    { vs: "Python", whenThis: "Enterprise back-ends, Android, anything needing the JVM ecosystem (Kafka, Spark, Cassandra).", whenThat: "Data science / ML, scripting, rapid prototyping — anywhere NumPy/Pandas/PyTorch matter." },
    { vs: "Rust", whenThis: "Enterprise systems, big-data infrastructure, anywhere stability + library maturity matter.", whenThat: "Systems software, embedded, memory-safety-critical code, anywhere latency budgets are in microseconds." },
  ],
};

export default sheet;
