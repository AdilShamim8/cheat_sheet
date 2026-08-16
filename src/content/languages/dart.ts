import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "dart",
  name: "Dart",
  category: "languages",
  tier: 2,
  tags: ["static", "compiled", "flutter", "ui", "jvm-like", "async", "cross-platform"],
  tagline: "Statically-typed, GC'd language purpose-built for UI — the engine behind Flutter, with a sound null-safety system and an isolates-based concurrency model.",
  year: 2011,
  author: "Lars Bak & Kasper Lund (Google)",

  tldr: [
    "Dart is a statically-typed, garbage-collected, object-oriented language with sound null safety, ahead-of-time compilation to native ARM/x64, and a JIT for fast hot-reload during development — purpose-built to drive Flutter's UI layer.",
    "It dominates cross-platform mobile/desktop UIs via Flutter (one codebase → iOS, Android, web, desktop), and has a smaller footprint on the backend via Dart Frog and Shelf.",
    "Reach for Dart when building a Flutter app, when you want a single codebase for mobile + web + desktop with near-native performance, or when you want a Java/TS-like language with strict null safety.",
    "Avoid Dart for systems programming, hard-realtime, embedded, or backend services where the JVM/Go ecosystem is far richer — Dart's server ecosystem is small relative to its UI dominance.",
  ],

  mentalModel: {
    title: "Single-threaded event loop, isolates for true parallelism",
    body: "Dart code runs on a single thread driven by an event loop — async/await is cooperative, just like JS/Python. There is no shared-memory multithreading: 'isolates' are independent Dart programs with their own heap and event loop, communicating only via message passing (SendPort/ReceivePort). This eliminates data races by construction. The other mental model to internalize: Dart is soundly null-safe (since 2.12) — `String` cannot be null at runtime, full stop. The type system is also sound (no `ClassCastException` from casts that the type system allowed), so 'if it type-checks, the runtime won't surprise you' is more true here than in TypeScript or Java.",
  },

  constructs: [
    { syntax: "String x = 'hi'; / int? y;", behavior: "Non-nullable vs nullable type — null safety is sound since 2.12.", when: "Always annotate; `?` is opt-in nullability, not a hint." },
    { syntax: "x?.foo() ?? 'default'", behavior: "Null-aware chain + null-coalescing.", when: "Optional descent through graphs of nullable refs." },
    { syntax: "late final User u;", behavior: "Late init — first read must follow an assignment or it throws.", when: "Fields initialized in initState/init or by DI; saves nullable checks downstream." },
    { syntax: "var x = 5 / final y = 5", behavior: "Inferred mutable / inferred immutable local.", when: "Prefer `final` for locals; reserve `var` for true mutation." },
    { syntax: "class C { const C(); }", behavior: "Compile-time constant class — instances canonicalized.", when: "Flutter widget trees, theme values, anything that should be identical across rebuilds." },
    { syntax: "Future<T> fetch() async { return ...; }", behavior: "Async function returning a future — never blocks the event loop.", when: "All I/O; await is the only sync point." },
    { syntax: "Stream<T> / yield*", behavior: "Async sequence — push-based values over time.", when: "Reactive pipelines, WebSocket frames, debounced search." },
    { syntax: "await for (final x in stream)", behavior: "Consume a stream sequentially — loop body suspends on each event.", when: "Backpressure-friendly stream consumers." },
    { syntax: "Isolate.run(() => heavy())", behavior: "Spawn an isolate, run a function, get back a Future — no shared heap.", when: "True CPU parallelism; isolates cannot share mutable state." },
    { syntax: "enum Color { red, green, blue }", behavior: "Enhanced enums (2.17+) — can have fields, methods, const constructors.", when: "Tagged unions; enum with associated behavior." },
    { syntax: "sealed class Result", behavior: "Closed hierarchy — exhaustive switch enforced.", when: "Dart 3.0+; ADTs, state machines, Results." },
    { syntax: "switch (x) { case Ok(:final v) => v; }", behavior: "Pattern matching with destructuring (3.0+).", when: "Replacing if-cascade; pairs with sealed classes." },
  ],

  patterns: [
    {
      lang: "dart",
      caption: "Sealed class + pattern matching — the Result type",
      code: `sealed class Result<T> {
  const Result();
}

class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

class Err<T> extends Result<T> {
  const Err(this.error);
  final Object error;
}

String describe(Result<int> r) => switch (r) {
  Ok(:final value) when value > 0 => 'positive: \\$value',
  Ok(:final value)               => 'non-positive: \\$value',
  Err(:final error)              => 'error: \\$error',
};

// Switch is exhaustive — the compiler errors if any subtype is missing.
void main() => print(describe(const Ok(42)));`,
    },
    {
      lang: "dart",
      caption: "Isolate for CPU-bound work — no shared mutable state",
      code: `import 'dart:isolate';

Future<int> heavySum(int n) async {
  // Isolate.run spawns a fresh isolate, runs the callback, returns the result.
  // The callback cannot reference anything outside its closure-captured args
  // (no shared heap) — only the return value crosses the boundary.
  return Isolate.run(() {
    var sum = 0;
    for (var i = 0; i < n; i++) {
      sum += i;
    }
    return sum;
  });
}

// For long-lived workers, use Isolate.spawn + SendPort/ReceivePort.
Future<void> worker() async {
  final receive = ReceivePort();
  final isolate = await Isolate.spawn(_entry, receive.sendPort);
  receive.listen((msg) => print('got \\$msg'));
  isolate.kill(priority: Isolate.immediate);
}

void _entry(SendPort back) => back.send('hello from worker');`,
    },
    {
      lang: "dart",
      caption: "Async/await + Stream — a debounced search pipeline",
      code: `import 'dart:async';

Stream<String> search(String query, {Duration debounce = const Duration(milliseconds: 200)}) async* {
  // async* + yield = a Stream-returning generator.
  var last = '';
  await for (final q in _inputStream.debounce(debounce)) {
    if (q == last) continue;
    last = q;
    final results = await _fetchResults(q);   // awaited — no blocking
    for (final r in results) yield r;
  }
}

extension _Debounce<T> on Stream<T> {
  Stream<T> debounce(Duration d) => transform(_Debouncer(d));
}

Future<List<String>> _fetchResults(String q) async {
  // Network I/O runs on the platform's thread pool — no event-loop stall.
  await Future.delayed(const Duration(milliseconds: 50));
  return [for (var i = 0; i < 3; i++) '\\$q result \\$i'];
}`,
    },
    {
      lang: "dart",
      caption: "Flutter widget with const constructors — the rebuild optimization",
      code: `class UserCard extends StatelessWidget {
  const UserCard({super.key, required this.name, required this.role});

  final String name;
  final String role;

  @override
  Widget build(BuildContext context) {
    // const widgets are canonicalized — Flutter skips rebuild on parent update.
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),     // const constructor
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(role, style: TextStyle(color: Colors.grey[600])),
          ],
        ),
      ),
    );
  }
}`,
    },
  ],

  pitfalls: [
    {
      title: "Async without await silently drops the Future",
      symptom: "`fetch(); return;` returns before fetch completes — the result is silently lost (or worse, an error fires after the function returns, crashing the zone).",
      fix: "Always `await` or `unawaited(...)` (package:pedantic) Futures explicitly. Enable the `unawaited_futures` lint to force the decision at every call site.",
    },
    {
      title: "Blocking calls freeze the event loop",
      symptom: "`File().readAsStringSync()` or `await Future.delayed(...)` mixed with `sleep()` (from dart:io) blocks the isolate — UI freezes, network timeouts cascade.",
      fix: "Use async equivalents (`readAsString()` not `readAsStringSync()`). For unavoidable blocking, move to an isolate via `Isolate.run`.",
    },
    {
      title: "Mutating a list while `for (final x in list)` iterates",
      symptom: "Concurrent modification exception at runtime — Dart throws `Concurrent modification during iteration`.",
      fix: "Iterate over a copy: `for (final x in [...list])` if you're going to mutate. Or build a new list and replace the field.",
    },
    {
      title: "`late` field read before assignment throws LateInitializationError",
      symptom: "Declaring `late final User u;` and reading before init (e.g., in initState order) throws at runtime — not a compile error.",
      fix: "Use `late` only when you can guarantee initialization order. For nullable lifecycles, prefer `User? u;` with explicit null checks, or `late` with an initializer: `late final u = fetch();`.",
    },
    {
      title: "Isolate overhead vs in-isolate work mismatch",
      symptom: "Spawning an isolate takes 50-150ms + copy cost for arguments — small CPU tasks (~1ms) become slower, not faster, when parallelized.",
      fix: "Use `Isolate.run` only for tasks >50ms; for shorter work, keep it on the main isolate. For repeated work, use a long-lived worker isolate via `Isolate.spawn` + SendPort.",
    },
    {
      title: "Sound null safety doesn't apply to FFI or native returns",
      symptom: "Calling a native function via `dart:ffi` that returns `Pointer<Utf8>` and converting with `.toDartString()` can crash on null pointer — the type system can't see it.",
      fix: "Null-check all FFI pointers explicitly: `if (ptr == nullptr) return null;`. Annotate FFI bindings with `@FfiNative` for typed nullability when possible (3.3+).",
    },
    {
      title: "const constructors require all fields final + all args const",
      symptom: "Marking a class `const` but initializing with a runtime value (e.g., `const User(name: fetchedName)`) is a compile error — `const` requires compile-time-known args.",
      fix: "Drop `const` when the data is runtime-determined. Use `const` constructors only for static/compile-time-known widget trees (themes, paddings, immutable layouts).",
    },
  ],

  quickReference: [
    { fact: "Sound null safety (2.12+) — `String` cannot be null at runtime, no escape hatch like TS's `as any`.", tag: "version" },
    { fact: "Dart 3.0+ has records, patterns, and sealed classes — modern algebraic-data-type support.", tag: "version" },
    { fact: "Dart 3.2+ extension types replace `typedef` wrappers for zero-cost FFI/JS interop.", tag: "version" },
    { fact: "Dart 3.4+ wasm compilation is stable — Flutter web can target WasmGC for ~2-3x JS perf.", tag: "version" },
    { fact: "Single-threaded event loop — `async`/`await` is cooperative; a blocking call freezes the whole isolate.", tag: "gotcha" },
    { fact: "Isolates share no heap — communication via SendPort/ReceivePort. Spawning costs ~50-150ms; use long-lived workers for repeated work.", tag: "perf" },
    { fact: "AOT-compiled Dart binaries start in <10ms vs JVM's 200-500ms — better for CLIs and edge deployments.", tag: "perf" },
    { fact: "const widgets are canonicalized — Flutter skips rebuilding them on parent updates. Proliferate `const` aggressively.", tag: "perf" },
    { fact: "`late` defers initialization; reading before assignment throws LateInitializationError (runtime, not compile).", tag: "gotcha" },
    { fact: "Records (`(int, String)`, `({int x, String y})`) are value types with structural equality — Dart 3.0+.", tag: "version" },
    { fact: "`switch` is an expression in 3.0+ — exhaustive over sealed types, supports destructuring and guards (`when`).", tag: "version" },
    { fact: "Streams are single-subscription by default; `Stream.broadcast()` for multi-subscriber. Wrong choice = silent dropped events.", tag: "gotcha" },
    { fact: "Zone-based error handling: uncaught async errors go to `Zone.current.handleUncaughtError`. Wrap app in `runZonedGuarded`.", tag: "gotcha" },
    { fact: "Common style: 2-space indent, lowerCamelCase, UpperCamelCase types, lint via `flutter_lints` / `very_good_analysis`.", tag: "style" },
    { fact: "pub.dev is the package manager; `pubspec.yaml` + `dart pub get`. Versioning via semantic_version constraints.", tag: "style" },
  ],

  goDeeper: [
    { title: "Dart Documentation — Official", url: "https://dart.dev/guides", note: "The language tour + library tour are the canonical entry points; Effective Dart is the style guide." },
    { title: "Dart Language Spec (PDF)", url: "https://dart.dev/resources/language/spec", note: "Formal specification — useful for edge cases in null promotion and generic bounds." },
    { title: "Effective Dart", url: "https://dart.dev/effective-dart", note: "Style, documentation, usage, and design guidelines — the equivalent of PEP 8 + Effective Java." },
    { title: "Flutter Documentation", url: "https://docs.flutter.dev/", note: "Where 90% of Dart engineers live; the architecture and performance pages are essential." },
    { title: "Dart Issues & Design Discussions", url: "https://github.com/dart-lang/language/issues", note: "Language design repo — every feature has a tracked issue with rationale and rejected alternatives." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "int", behavior: "64-bit signed integer on native (32-bit on web JS). Arbitrary precision pre-2.0; now fixed.", when: "Counting, IDs. For huge numbers use BigInt; for fixed-size FFI use ffi.Int64." },
      { syntax: "double", behavior: "IEEE 754 64-bit float. The only fractional type — no float32 in the language.", when: "Math. For money use decimal package or store cents as int." },
      { syntax: "num", behavior: "Supertype of int and double — the parent class for both.", when: "APIs that accept either int or double. Prefer concrete types when possible." },
      { syntax: "bool", behavior: "true / false — strict, no truthiness coercion.", when: "Logic. 'if (x)' requires x to be bool — no JS-style truthiness." },
      { syntax: "String", behavior: "Immutable UTF-16 sequence. '==' compares by value. r'raw' and '''triple-quoted''' literals.", when: "All text. Code points via runes; bytes via codeUnits." },
      { syntax: "Symbol", behavior: "Opaque identifier for reflection — #foo. Rare in normal code.", when: "Mirror-based reflection (mostly web); avoid in new code." },
      { syntax: "Null (null)", behavior: "Singleton null — only assignable to nullable types (T?).", when: "Absence. Sound null safety means null can't sneak into a non-nullable type." },
      { syntax: "dynamic / Object?", behavior: "dynamic: opt out of type checking (JS-like). Object?: top nullable supertype.", when: "Avoid dynamic — use Object? + type checks. dynamic is for interop (JS, reflection)." },
      { syntax: "void", behavior: "Type of expressions with no useful value — like Unit, but more restrictive.", when: "Function return type. Can't be assigned to a variable (unlike Unit)." },
    ],
    collections: [
      { syntax: "List<T> / List<T>?", behavior: "Growable array — O(1) append/pop, O(n) insert at front. Subscript returns T (not T?).", when: "Default ordered collection. const [] for compile-time-known lists." },
      { syntax: "Set<T>", behavior: "Hash set — O(1) membership, no duplicates, insertion-ordered since 2.0.", when: "Dedup, membership tests, set algebra." },
      { syntax: "Map<K, V>", behavior: "Hash map — insertion-ordered. Subscript returns V? (null for missing key).", when: "Keyed lookups, JSON, config. putIfAbsent / update for safer writes." },
      { syntax: "Record (3.0+)", behavior: "Anonymous immutable tuple — (int, String) or ({int x, String y}). Value-type, structural equality.", when: "Quick pairs/triples with named fields. Replaces single-use classes." },
      { syntax: "Iterable<T> / Iterator<T>", behavior: "Abstract sequence — List/Set/Queue implement. The for-in contract.", when: "APIs that consume any sequence. Use sync* / yield for generators." },
      { syntax: "Stream<T>", behavior: "Async iterable — push-based values over time. Single-subscription by default.", when: "Reactive pipelines, WebSocket frames, debounced search." },
      { syntax: "Queue<T> (dart:collection)", behavior: "Double-ended queue — O(1) add/remove at both ends.", when: "Queues, stacks, sliding windows. ListQueue is the default impl." },
      { syntax: "SplayTreeMap / SplayTreeSet", behavior: "Self-balancing tree — ordered iteration, O(log n) ops.", when: "Ordered keyed access, range queries. Slower than hash for general use." },
    ],
    custom: [
      { syntax: "class C { }", behavior: "Single inheritance, reference type, GC-managed. Default constructor if none declared.", when: "Default for behavior-rich types. Mix with mixin via 'with'." },
      { syntax: "sealed class Result", behavior: "Closed hierarchy — exhaustive switch enforced (3.0+).", when: "ADTs, state machines, Results; the canonical pattern for typed errors." },
      { syntax: "abstract class A", behavior: "Cannot be instantiated — subclasses provide impl. Can have abstract methods.", when: "Base classes, interfaces (use 'interface class' or 'abstract interface class' in 3.0+)." },
      { syntax: "mixin M on BaseClass { }", behavior: "Reusable code unit — mixed into classes via 'with'. 'on' constrains target type.", when: "Sharing behavior across unrelated classes. Cleaner than multiple inheritance." },
      { syntax: "enum Color { red, green, blue }", behavior: "Enhanced enums (2.17+) — can have fields, methods, const constructors.", when: "Closed value sets; replaces 'static const' patterns." },
      { syntax: "extension StringExt on String", behavior: "Add methods to existing types — even ones you don't own.", when: "Ad-hoc API on third-party/stdlib types. Cannot add fields (only methods/getters)." },
      { syntax: "extension type Name(String _)", behavior: "Zero-cost wrapper (3.3+) — replaces typedef wrappers for FFI/JS interop.", when: "Typed IDs, FFI pointer wrappers, JS interop — no runtime overhead." },
      { syntax: "typedef Callback<T> = void Function(T)", behavior: "Type alias — for function types and complex generic names.", when: "Function type aliases (most common use). For type IDs use extension type." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b", behavior: "Arithmetic — int / int returns double (Dart-specific! Not floor division).", when: "Math. Use ~/ for integer floor division; ~/ is the Dart equivalent of Python //." },
    { syntax: "a ~/ b, a % b", behavior: "Integer floor division (~/) and modulo (%).", when: "Integer math. ~/ is what you want when dividing ints — / always returns double." },
    { syntax: "a == b, a != b", behavior: "Value equality — calls operator==. Strings, lists, maps compare by value.", when: "Default comparisons. Override operator== carefully — must match hashCode." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — strict bool, no truthiness.", when: "Logic. 'if (x)' requires x to be bool." },
    { syntax: "a ? b : c", behavior: "Ternary — only one branch evaluated.", when: "Concise conditional. Avoid nesting." },
    { syntax: "a ?? b", behavior: "Null-coalescing — a if non-null, else b.", when: "Default values: 'x = a ?? default'. Combines with ?.: 'a?.b ?? default'." },
    { syntax: "a?.b?.c", behavior: "Null-aware chain — short-circuits to null on any null. Returns nullable type.", when: "Optional descent through graphs of nullable refs." },
    { syntax: "a!.b", behavior: "Force-unwrap — asserts a is non-null, then accesses. Throws if null.", when: "Almost never. Acceptable in tests or with nullable FFI / when you have external knowledge." },
    { syntax: "a as B, a is B, a is! B", behavior: "Cast (throws on failure) / type check / negated type check.", when: "Downcasting Object to a concrete type. is B smart-casts afterwards (no manual cast needed)." },
    { syntax: "a < b, a > b, a <= b, a >= b", behavior: "Comparison — requires operator overloads. List/Map do NOT have these by default.", when: "Sorting, ranges. Custom classes override operators as needed." },
    { syntax: "a & b, a | b, a ^ b, ~a", behavior: "Bitwise AND/OR/XOR/NOT — on int only.", when: "Bit flags, low-level ops. Use BitField for typed flags." },
    { syntax: "a << n, a >> n", behavior: "Bitwise left/right shift — on int only. >>> is unsigned right shift (2.14+).", when: "Low-level bit ops; rare in business code." },
    { syntax: "a = b, a ??= b, a += b", behavior: "Assignment, null-aware assignment, compound assignment.", when: "Mutation. ??= sets only if currently null; +=, -=, etc. work on operator-overload types." },
    { syntax: "expr! (postfix)", behavior: "Null assertion — asserts expr is non-null, returns non-nullable type.", when: "When you have external knowledge that a value is non-null despite the type." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "dart",
      caption: "File I/O — small (read all) vs large (stream)",
      code: `import 'dart:io';

// Small file — read all at once
final text = File('small.txt').readAsStringSync(encoding: utf8);
final bytes = File('data.bin').readAsBytesSync();

// Large file — stream line by line (memory-friendly)
await File('huge.csv').openRead()
    .transform(utf8.decoder)
    .transform(LineSplitter())
    .forEach((line) => process(line));

// Even cleaner with File().readAsLines() (returns Future<List<String>>)
// but materializes all lines — only for medium files.

// Write file
await File('out.txt').writeAsString('hello', mode: FileMode.append);
await File('bin.bin').writeAsBytes([0, 1, 2, 3]);`,
    },
    {
      lang: "dart",
      caption: "stdin / stdout / stderr — CLI tools",
      code: `import 'dart:io';
import 'dart:convert';

// Read all of stdin
final input = stdin.transform(utf8.decoder).join();

// Stream stdin line by line (memory-friendly)
await stdin.transform(utf8.decoder)
    .transform(LineSplitter())
    .forEach((line) => stdout.writeln(line.toUpperCase()));

// Print to stderr
stderr.writeln('warning: deprecated');

// JSON over stdin/stdout — the standard CLI interop pattern
final payload = jsonDecode(await stdin.transform(utf8.decoder).join());
final result = transform(payload);
stdout.write(jsonEncode(result));`,
    },
    {
      lang: "dart",
      caption: "JSON / serialization with code generation",
      code: `// Hand-written (small projects, dynamic shapes)
final encoded = jsonEncode({'k': 1, 'list': [1, 2]});
final decoded = jsonDecode(encoded) as Map<String, dynamic>;
final k = decoded['k'] as int;

// Code-generated (production — json_serializable + build_runner)
// part 'user.g.dart';
//
// @JsonSerializable()
// class User {
//   final int id;
//   final String email;
//   User(this.id, this.email);
//   factory User.fromJson(Map<String, dynamic> j) => _\$UserFromJson(j);
//   Map<String, dynamic> toJson() => _\$UserToJson(this);
// }
//
// Run: dart run build_runner build
// Pros: type-safe, no manual casts, fast (no reflection at runtime).

// dart_mappable / freezed are alternatives with sealed-class support.`,
    },
    {
      lang: "dart",
      caption: "HTTP client (package:http) with retries",
      code: `import 'dart:async';
import 'package:http/http.dart' as http;

Future<String> getJson(Uri url, {int retries = 3}) async {
  var attempts = 0;
  while (true) {
    try {
      final resp = await http.get(url, headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 10));
      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        throw Exception('HTTP \${resp.statusCode}');
      }
      return resp.body;
    } catch (e) {
      if (++attempts >= retries) rethrow;
      await Future.delayed(Duration(milliseconds: 500 * (1 << (attempts - 1))));
    }
  }
}

// For streaming responses, multipart uploads, or HTTP/2, use package:dio
// or package:cupertino_http (native URL session on iOS).`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "dart",
      caption: "for-in + forEach + indexed — the holy trinity",
      code: `final items = ['a', 'b', 'c'];
final scores = [10, 20, 30];

// for-in — the default
for (final item in items) {
  print(item);
}

// forEach — functional form (no early return without label)
items.forEach(print);

// With index — use indexed (3.0+) or asMap()
for (final (i, item) in items.indexed) {
  print('\$i: \$item');
}

// zip — use package:collection's zip, or manual
for (var i = 0; i < items.length; i++) {
  print('\${items[i]}: \${scores[i]}');
}`,
    },
    {
      lang: "dart",
      caption: "map / where / fold — functional trinity",
      code: `final nums = List.generate(10, (i) => i + 1);  // [1..10]

// map — transform each element (returns Iterable, call .toList() to materialize)
final squares = nums.map((n) => n * n).toList();

// where — filter (returns Iterable)
final evens = nums.where((n) => n.isEven).toList();

// whereType — filter by type (from Iterable<Object?>)
final ints = [1, 'x', 2, true].whereType<int>().toList();  // [1, 2]

// fold — fold left with seed
final sum = nums.fold(0, (acc, n) => acc + n);

// Chained pipelines — call .toList() at the end to materialize
nums.where((n) => n.isEven).map((n) => n * n).fold(0, (a, b) => a + b);`,
    },
    {
      lang: "dart",
      caption: "while / do-while / for — explicit loops",
      code: `// while — runs while condition is true
var n = 0;
while (n < 10) {
  if (found(n)) break;
  n++;
}

// do-while — runs body at least once
String result;
do {
  result = tryOnce();
} while (result == 'retry');

// C-style for — when you need the index
for (var i = 0; i < items.length; i++) {
  process(items[i]);
}

// for-in with destructuring (3.0+) — pairs from map entries
for (final (k, v) in {'a': 1, 'b': 2}.entries.map((e) => (e.key, e.value))) {
  print('\$k=\$v');
}`,
    },
    {
      lang: "dart",
      caption: "Generators + Streams — sync and async iteration",
      code: `// Sync generator (Iterable) — sync* and yield
Iterable<int> naturals(int from) sync* {
  while (true) yield from++;
}

// Take first 5 of an infinite iterable
print(naturals(1).take(5).toList());  // [1, 2, 3, 4, 5]

// Recursive: yield from another generator
Iterable<int> tree(TreeNode n) sync* {
  yield n.value;
  yield* tree(n.left);
  yield* tree(n.right);
}

// Async generator (Stream) — async* and yield
Stream<int> ticker(Duration period) async* {
  var i = 0;
  while (true) {
    await Future.delayed(period);
    yield i++;
  }
}

// Consume: await for (final tick in ticker(Duration(seconds: 1))) { ... }`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "dart",
      caption: "Parameters, defaults, named args, required",
      code: `// Dart leans HARD into named arguments — they're the API default.
void f(int a, {required String b, int? c, bool flag = false}) {
  // a       : required positional
  // b       : required named (3.0+)
  // c       : optional named (nullable)
  // flag    : optional named with default
  print([a, b, c, flag]);
}

f(1, b: 'hi');                // [1, hi, null, false]
f(1, b: 'hi', c: 99, flag: true);  // [1, hi, 99, true]

// Positional optional (older style, less common now)
void g(int a, [int b = 10, int c = 20]) => print([a, b, c]);
g(1);          // [1, 10, 20]
g(1, 2);       // [1, 2, 20]

// Function as a value — typedef or inline
int Function(int) double = (x) => x * 2;`,
    },
    {
      lang: "dart",
      caption: "Closures, Function type, tear-offs",
      code: `// Closures capture by reference — but final locals only.
int counter = 0;
void increment() => counter++;
increment();
print(counter);  // 1

// Function type — first-class
typedef IntOp = int Function(int);
IntOp add(int n) => (x) => x + n;  // curried: add(5)(3) == 8

// Method tear-off — get a function reference from an instance
final upper = 'hi'.toUpperCase;  // String Function()
print(upper());  // HI

// Generic functions
T first<T>(List<T> xs) => xs.first;
print(first<int>([1, 2, 3]));  // 1

// Arrow syntax (=>) for single-expression
int square(int x) => x * x;`,
    },
    {
      lang: "dart",
      caption: "Async functions — Future, async, await",
      code: `import 'dart:async';

// async returns Future<T>; await unwraps without blocking the event loop.
Future<User> fetchUser(int id) async {
  final resp = await http.get(Uri.parse('/api/users/\$id'));
  if (resp.statusCode != 200) {
    throw Exception('HTTP \${resp.statusCode}');
  }
  return User.fromJson(jsonDecode(resp.body));
}

// Future.wait — parallel fan-out (like Promise.all)
Future<List<User>> loadAll(List<int> ids) async {
  final futures = ids.map(fetchUser);
  return Future.wait(futures);
}

// Future.any — race, first to complete wins (like Promise.race)

// Always await or unawaited() a Future — fire-and-forget silently
// drops errors, which crash the zone later.`,
    },
    {
      lang: "dart",
      caption: "Generators + extension methods — composable APIs",
      code: `// Extension methods — add API to existing types
extension StringSlug on String {
  String get slug => toLowerCase().replaceAll(' ', '-');
  bool get isEmail => contains('@') && contains('.');
}

print('Hello World'.slug);  // hello-world
print('a@b.io'.isEmail);    // true

// Builder pattern with cascades (..)
final server = Server()
  ..host = '0.0.0.0'
  ..port = 8080
  ..middleware.add(authMiddleware)
  ..start();

// Cascade returns the receiver, so you can chain mutations fluently.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "dart",
      caption: "try / catch / finally + stack traces",
      code: `try {
  final result = doRisky();
  persist(result);
} on SpecificException catch (e) {
  // Type-filtered catch — only SpecificException
  handle(e);
} on OtherException catch (e, stackTrace) {
  // Catch with stack trace — for logging
  log.severe('failed', e, stackTrace);
} catch (e, stackTrace) {
  // Catch-all — last resort
  log.severe('unexpected', e, stackTrace);
  rethrow;  // propagate up
} finally {
  // ALWAYS runs — cleanup, even on return/break/continue
  cleanup();
}

// Dart has no checked exceptions — all errors are unchecked.`,
    },
    {
      lang: "dart",
      caption: "Custom exceptions + Error vs Exception distinction",
      code: `// Convention: Exception = recoverable, Error = programmer mistake (don't catch)
class AppException implements Exception {
  final String message;
  AppException(this.message);
  @override String toString() => 'AppException: \$message';
}

class ValidationException extends AppException {
  final String field;
  ValidationException(this.field, String msg) : super(msg);
}

void parse(String raw) {
  if (raw.isEmpty) {
    throw ValidationException('input', 'cannot be empty');
  }
}

// AssertionError / ArgumentError / StateError are Errors — bugs, not flow control.`,
    },
    {
      lang: "dart",
      caption: "Sealed Result — typed errors via pattern matching (3.0+)",
      code: `sealed class Result<T> {
  const Result();
}

class Ok<T> extends Result<T> {
  final T value;
  const Ok(this.value);
}

class Err<T> extends Result<T> {
  final Object error;
  const Err(this.error);
}

Result<int> divide(int a, int b) =>
    b == 0 ? Err(ArithmeticException('div by zero')) : Ok(a ~/ b);

// Pattern match — exhaustive switch over the sealed hierarchy
String describe(Result<int> r) => switch (r) {
  Ok(:final value) when value > 0 => 'positive: \$value',
  Ok(:final value)               => 'non-positive: \$value',
  Err(:final error)              => 'error: \$error',
};

print(describe(divide(10, 0)));  // error: ArithmeticException: div by zero`,
    },
    {
      lang: "dart",
      caption: "Zone-based error handling — uncaught async errors",
      code: `import 'dart:async';

// Async errors that nothing awaits go to the Zone's error handler.
// Wrap your app in runZonedGuarded to catch them at the top level.

void main() {
  runZonedGuarded(() {
    // Your app entry — uncaught async errors land in onError
    runApp();
  }, (error, stack) {
    log.severe('uncaught async error', error, stack);
    // Optionally: report to Sentry, Crashlytics, etc.
  }, zoneSpecification: ZoneSpecification(
    print: (self, parent, zone, line) => parent.print(zone, '[\$zone] \$line'),
  ));
}

// Without runZonedGuarded, uncaught async errors crash the process.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "dart",
      caption: "async / await — single-threaded event loop",
      code: `import 'dart:async';

// Dart runs on a single thread with an event loop.
// async/await is cooperative — no preemption, no thread blocking.

Future<User> fetchUser(int id) async {
  final resp = await http.get(Uri.parse('/api/users/\$id'));
  return User.fromJson(jsonDecode(resp.body));
}

Future<List<User>> loadAll(List<int> ids) async {
  // Future.wait runs them concurrently — but all on the same thread.
  // I/O releases the event loop; CPU-bound work freezes it.
  return Future.wait(ids.map(fetchUser));
}

// NEVER use sleep() (dart:io) in async code — it blocks the whole isolate.
// Use Future.delayed() instead, which yields to the event loop.`,
    },
    {
      lang: "dart",
      caption: "Isolate — true CPU parallelism, share-nothing",
      code: `import 'dart:isolate';

// Isolates are independent Dart programs with their own heap + event loop.
// Communication via SendPort / ReceivePort — no shared mutable state.

Future<int> heavySum(int n) async {
  // Isolate.run spawns a fresh isolate, runs the callback, returns the result.
  // Arguments cross the boundary by deep-copy (no shared refs).
  return Isolate.run(() {
    var sum = 0;
    for (var i = 0; i < n; i++) sum += i;
    return sum;
  });
}

// For long-lived workers, use Isolate.spawn + SendPort/ReceivePort:
Future<void> worker() async {
  final receive = ReceivePort();
  final isolate = await Isolate.spawn(_entry, receive.sendPort);
  receive.listen((msg) => print('got \$msg'));
  isolate.kill(priority: Isolate.immediate);
}

void _entry(SendPort back) => back.send('hello from worker');`,
    },
    {
      lang: "dart",
      caption: "Stream — async sequences with backpressure",
      code: `import 'dart:async';

// Stream = async iterable. Two flavors:
//  - Single-subscription (default): one consumer, buffered.
//  - Broadcast (.asBroadcastStream / Stream.broadcast): many consumers.

Stream<int> counter({required int to}) async* {
  for (var i = 0; i < to; i++) {
    await Future.delayed(const Duration(milliseconds: 100));
    yield i;
  }
}

// Consume via await for
await for (final i in counter(to: 5)) {
  print(i);
}

// Operators: map, where, expand, take, skip, debounce, throttle, etc.
counter(to: 100)
  .where((i) => i.isEven)
  .map((i) => i * i)
  .take(5)
  .listen(print);  // 0, 4, 16, 36, 64

// Use rxdart for advanced operators (combineLatest, switchMap).`,
    },
    {
      lang: "dart",
      caption: "Completer + Zone — low-level async primitives",
      code: `import 'dart:async';

// Completer — manually complete a Future (for wrapping callback APIs)
Completer<String> completer = Completer<String>();
someCallbackAPI((result) => completer.complete(result));
final result = await completer.future;

// Zone — isolate side-effects within a scope (error handlers, print overrides)
runZoned(() {
  print('this print is intercepted');
}, zoneSpecification: ZoneSpecification(
  print: (self, parent, zone, line) => parent.print(zone, '[LOG] \$line'),
));

// Zones also catch uncaught async errors — see the errorHandling section.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "dart",
      caption: "package:test — Dart's standard test framework",
      code: `import 'package:test/test.dart';

void main() {
  setUp(() {
    // runs before each test
  });

  tearDown(() {
    // runs after each test
  });

  test('validates a real email', () {
    final user = User(email: 'a@b.io');
    expect(user.isValid, isTrue);
    expect(user.email, equals('a@b.io'));
  });

  // Parametrized via group + multiple test() calls or a loop
  for (final bad in ['', 'nope', 'a@@b.io']) {
    test('rejects bad email: \$bad', () {
      expect(() => User(email: bad), throwsA(isA<ValidationException>()));
    });
  }

  // Async test — just mark the body 'async'
  test('loads user from API', () async {
    final u = await fetchUser(1);
    expect(u.email, equals('a@b.io'));
  });
}`,
    },
    {
      lang: "dart",
      caption: "flutter_test — widget testing for Flutter",
      code: `import 'package:flutter_test/flutter_test.dart';
import 'package:myapp/main.dart';

void main() {
  testWidgets('UserCard displays name and role', (tester) async {
    // Pump the widget tree
    await tester.pumpWidget(MaterialApp(
      home: UserCard(name: 'Alice', role: 'admin'),
    ));

    // Find widgets by text, type, key
    expect(find.text('Alice'), findsOneWidget);
    expect(find.text('admin'), findsOneWidget);
    expect(find.byType(Card), findsOneWidget);

    // Tap and re-pump
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();  // wait for animations
  });
}`,
    },
    {
      lang: "dart",
      caption: "Mocks — mocktail (Dart-first) vs mockito",
      code: `import 'package:mocktail/mocktail.dart';
import 'package:test/test.dart';

class MockRepo extends Mock implements UserRepository {}

void main() {
  late MockRepo repo;

  setUp(() {
    repo = MockRepo();
    // Default stub — register fallback values for any args
    registerFallbackValue(User.placeholder());
  });

  test('fetches user from repo', () async {
    // Arrange
    when(() => repo.find(1)).thenAnswer((_) async => User(email: 'a@b.io'));
    when(() => repo.find(2)).thenAnswer((_) async => null);

    // Act
    final service = UserService(repo);

    // Assert
    expect(await service.getEmail(1), equals('a@b.io'));
    expect(await service.getEmail(2), isNull);

    verify(() => repo.find(any())).called(2);
  });
}`,
    },
    {
      lang: "dart",
      caption: "Coverage + CI config",
      code: `// pubspec.yaml dev_dependencies:
//   test: ^1.24.0
//   mocktail: ^1.0.0
//   build_runner: ^2.4.0

// Run tests with coverage:
//   dart test --coverage=coverage
//   dart run coverage:format_coverage --lcov --in=coverage --out=coverage/lcov.info
//   # Upload to codecov/coveralls

// CI pattern (GitHub Actions):
//   - uses: dart-lang/setup-dart@v1
//   - run: dart pub get
//   - run: dart test

// Flutter:
//   - uses: subosito/flutter-action@v2
//   - run: flutter test --coverage`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "AOT-compiled Dart binaries start in <10ms vs JVM's 200-500ms — better for CLIs and edge deployments.", tag: "perf" },
    { fact: "Sound null safety (2.12+) eliminates null checks at runtime in fully-safe code — compiler proves non-nullability.", tag: "perf" },
    { fact: "const widgets are canonicalized — Flutter skips rebuilding them on parent updates. Proliferate const aggressively.", tag: "perf" },
    { fact: "Isolates share no heap — spawning costs ~50-150ms + argument copy. Use long-lived workers (Isolate.spawn) for repeated work.", tag: "perf" },
    { fact: "Single-threaded event loop — blocking I/O (File.readAsStringSync, sleep) freezes the isolate. Always use async equivalents.", tag: "gotcha" },
    { fact: "JIT (dev) is fast to start but slower at peak; AOT (release) is slow to compile but ~2-3x faster at runtime.", tag: "perf" },
    { fact: "Dart 3.4+ wasm compilation is stable — Flutter web can target WasmGC for ~2-3x JS perf on numeric code.", tag: "version" },
    { fact: "Records (3.0+) are value types — no allocation overhead vs classes; structural equality is free.", tag: "perf" },
    { fact: "List<T> is growable; for fixed-size use List.filled(n, null, growable: false). Saves reallocation on append.", tag: "perf" },
    { fact: "for-in is faster than forEach for tight loops (avoids closure allocation). forEach is fine for non-hot paths.", tag: "perf" },
    { fact: "Cascade (..) vs fluent setters: cascade has zero runtime cost vs builder pattern — same bytecode.", tag: "perf" },
    { fact: "Dart 3.0 patterns compile to efficient switch expressions — no overhead vs hand-written if-cascade.", tag: "version" },
    { fact: "Streams are single-subscription by default — wrong choice (broadcast for single-consumer) wastes buffer memory.", tag: "gotcha" },
    { fact: "Flutter DevTools (CPU profiler, memory, widget inspector) is the standard debugging tool — built into IDEs.", tag: "perf" },
    { fact: "extension type (3.3+) is zero-cost wrapper — replaces typedef wrappers for FFI; no allocation, no virtual calls.", tag: "version" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "dart", purpose: "The Dart SDK CLI — run, compile, format, analyze, test. Bundled with Flutter.", url: "https://dart.dev/tools/dart-tool", category: "build" },
    { tool: "Flutter", purpose: "Cross-platform UI framework — iOS, Android, web, desktop from one codebase.", url: "https://flutter.dev/", category: "build" },
    { tool: "pub.dev", purpose: "Package registry — 'dart pub get' / 'flutter pub get'. The npm of Dart.", url: "https://pub.dev/", category: "package" },
    { tool: "package:test", purpose: "Standard test framework — test/expect/group. Used by both Dart and Flutter.", url: "https://pub.dev/packages/test", category: "test" },
    { tool: "flutter_test", purpose: "Flutter's test package — widget testing via testWidgets / pumpWidget.", url: "https://api.flutter.dev/flutter/flutter_test/flutter_test-library.html", category: "test" },
    { tool: "mocktail", purpose: "Dart-first mocking — null-safe, no codegen, simpler than mockito.", url: "https://pub.dev/packages/mocktail", category: "test" },
    { tool: "build_runner", purpose: "Code generation runner — runs json_serializable, freezed, drift generators.", url: "https://pub.dev/packages/build_runner", category: "build" },
    { tool: "freezed", purpose: "Code generator for immutable data classes + sealed unions — like Kotlin data class + sealed.", url: "https://pub.dev/packages/freezed", category: "build" },
    { tool: "json_serializable", purpose: "JSON (de)serialization codegen — type-safe, fast, no reflection.", url: "https://pub.dev/packages/json_serializable", category: "build" },
    { tool: "Dart DevTools", purpose: "Browser-based debugger/profiler — CPU, memory, network, Flutter inspector.", url: "https://pub.dev/packages/devtools", category: "debug" },
    { tool: "dart analyze", purpose: "Static analyzer — built into the SDK, catches type issues and code smells.", url: "https://dart.dev/tools/dart-analyze", category: "lint" },
    { tool: "dart format", purpose: "Official formatter — opinionated, like gofmt. Long lines, no config.", url: "https://dart.dev/tools/dart-format", category: "lint" },
    { tool: "very_good_analysis", purpose: "Opinionated lint ruleset from VGV — stricter than flutter_lints.", url: "https://pub.dev/packages/very_good_analysis", category: "lint" },
    { tool: "flutter_lints", purpose: "Flutter team's recommended lint set — the default for new Flutter projects.", url: "https://pub.dev/packages/flutter_lints", category: "lint" },
    { tool: "Dart Frog", purpose: "Minimal backend framework — quickly build REST APIs in Dart, VGV-maintained.", url: "https://dartfrog.vgv.dev/", category: "build" },
    { tool: "Shelf", purpose: "Low-level web server middleware — Google's official, powers Dart Frog.", url: "https://pub.dev/packages/shelf", category: "build" },
    { tool: "Melos", purpose: "Monorepo management for Dart/Flutter — workspaces, versioning, batch commands.", url: "https://pub.dev/packages/melos", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0",  year: 2011, highlight: "First release — Google's JavaScript replacement, originally 'Dash'." },
    { version: "2.0",  year: 2014, highlight: "Major redesign — Dart 1.x web-first; 2.0 added strong static types." },
    { version: "2.6",  year: 2019, highlight: "dart2native — AOT compile to standalone native binaries (no SDK needed at runtime)." },
    { version: "2.12", year: 2021, highlight: "Sound null safety — the headline feature. String cannot be null at runtime." },
    { version: "2.14", year: 2021, highlight: "Triple-shift >>>, faster pub, Apple Silicon support, lint updates." },
    { version: "2.15", year: 2021, highlight: "Constructor tear-offs, generic function aliases, faster isolate spawn." },
    { version: "2.16", year: 2022, highlight: "Enhanced enums (forward), extension type aliases, dart doc improvements." },
    { version: "2.17", year: 2022, highlight: "Enhanced enums with fields/methods, super parameters, named args anywhere." },
    { version: "2.18", year: 2022, highlight: "Improved FFI (structs, async), enhanced type inference, security improvements." },
    { version: "2.19", year: 2023, highlight: "Records (preview), patterns (preview), sealed classes (preview), named args anywhere." },
    { version: "3.0",  year: 2023, highlight: "Records, patterns, sealed classes — modern ADT support. Sound null safety mandatory." },
    { version: "3.2",  year: 2023, highlight: "Extension types (preview), JS interop improvements, faster compilation." },
    { version: "3.3",  year: 2024, highlight: "Extension types stable, WasmGC support, native code interop improvements." },
    { version: "3.4",  year: 2024, highlight: "WasmGC stable for Flutter web, improved JS interop, faster pub get." },
    { version: "3.5",  year: 2024, highlight: "Improved isolate API (Isolate.run), better concurrency primitives, dart:ffi improvements." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "How does Dart's null safety differ from TypeScript's?", a: "Dart's null safety is SOUND — the type system guarantees that a non-nullable type (String) cannot be null at runtime, with no escape hatch like TS's 'as any' or '!' (which is a runtime check, not a type assertion). TS's null safety is a hint — you can cast away nullability at any time. The trade-off: Dart requires full migration (mixed-mode is a transition state, not a steady state), but the guarantees are real. FFI/native returns can still surprise you, but that's the boundary.", difficulty: "medium" },
    { q: "Explain the isolate model and why it's not threads.", a: "An isolate is an independent Dart program with its own heap, GC, and event loop. There's NO shared mutable state between isolates — communication is via message passing (SendPort/ReceivePort), and messages are deep-copied across the boundary. This eliminates data races by construction. Threads (in other languages) share memory and require locks. The cost: spawning an isolate takes ~50-150ms + copy cost, so it's only worth it for >50ms of work. For long-lived workers, use Isolate.spawn and reuse.", difficulty: "medium" },
    { q: "What's the difference between async/await in Dart and threads in Java?", a: "Dart's async/await is cooperative — it runs on a single thread with an event loop. A Future yields to the loop at await points but never blocks a thread; I/O and timers run on the platform's thread pool underneath. Java threads are OS resources with their own stack; blocking one doesn't affect others. Dart's model is simpler (no locks, no races on shared state) but can't use threads for CPU parallelism — you need isolates for that. I/O concurrency is excellent; CPU concurrency requires isolate overhead.", difficulty: "medium" },
    { q: "Explain const in Dart — there are several kinds.", a: "'const' has three roles: (1) const variable — compile-time constant value (const x = 5); (2) const constructor — a constructor that produces a canonicalized instance (const Point(1, 2)); (3) const context — inside a const constructor or const list/map, all literals are const implicitly. const objects are canonicalized: two const Point(1,2) calls return the SAME instance. Flutter uses const widgets aggressively because the framework skips rebuilding them on parent updates — a major perf win.", difficulty: "easy" },
    { q: "What are Records (3.0+) and when should you use them?", a: "Records are anonymous immutable tuples — (int, String) positional or ({int x, String y}) named. They have structural equality (two (1, 'a') records are ==) and are value types (no shared identity). Use them for: returning multiple values from a function (replacing a one-off class), named return values, and as map keys (hashable). For >3 fields or when you need methods, use a class — records are for ad-hoc bundles. They replace the older 'class with final fields + toString + hashCode' boilerplate.", difficulty: "easy" },
    { q: "How do sealed classes work in Dart 3.0+?", a: "A sealed class has a closed hierarchy — all direct subtypes must be in the same library file. The compiler knows the complete set, so switch expressions over a sealed type are exhaustive without a default case. Adding a new subtype makes the compiler flag every switch that doesn't handle it — exhaustive-by-construction refactoring. This is the closest Dart gets to Rust's enums / Scala's sealed traits. Use sealed for: ADTs (Result, Option), state machines (Loading/Success/Error), parsing ASTs.", difficulty: "medium" },
    { q: "What's the difference between a Stream and an Iterable?", a: "Both are sequences, but Iterable is synchronous (pull-based — you ask for the next element) and Stream is asynchronous (push-based — the source pushes elements when ready). An Iterable's map/where run synchronously; a Stream's map/where return new Streams that compute on listen. Streams can be single-subscription (default, with backpressure) or broadcast (multi-subscriber, no backpressure). Use Iterable for in-memory data, Stream for I/O, events, or async-generated sequences.", difficulty: "medium" },
    { q: "Why use Isolate.run vs spawning a long-lived isolate?", a: "Isolate.run (3.0+) is a one-shot helper: spawn, run a callback, return the result, kill the isolate. It's clean and ergonomic but pays the spawn cost (~50-150ms) every time. For a single 1-second computation, that's fine. For repeated work (e.g., processing 1000 images), spawning 1000 isolates is wasteful — instead, spawn ONE long-lived worker via Isolate.spawn, send it messages via SendPort, and reuse it across tasks. The breakeven is roughly: if total work > 1 second, prefer a long-lived isolate.", difficulty: "medium" },
    { q: "What is extension type (3.3+) and how does it differ from extension methods?", a: "Extension type wraps an existing type at zero runtime cost — the wrapper IS the underlying value at the bytecode level (no allocation, no virtual dispatch). Use it for: typed IDs (UserId wrapping int), FFI pointer wrappers, JS interop. Extension methods add methods to an existing type WITHOUT wrapping — they're syntactic sugar for static functions. Extension type creates a new nominal type (different from the wrapped type); extension method just adds API surface to an existing type. Use extension type for type safety, extension method for ergonomics.", difficulty: "hard" },
    { q: "How does the Dart event loop work?", a: "Dart runs on a single thread with an event loop. Events arrive in two queues: microtask (highest priority — scheduled by Future.then, scheduleMicrotask) and event (timers, I/O, messages from other isolates). The loop drains ALL microtasks before processing one event. await schedules the rest of the function as a microtask; the event loop processes it before the next I/O event. This means: heavy CPU work blocks the loop (no events processed until it finishes), so move it to an isolate. Blocking I/O (File.readAsStringSync) also blocks — always use async equivalents.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "TypeScript", whenThis: "Cross-platform mobile + desktop via Flutter, anywhere you want sound null safety + native performance.", whenThat: "Web frontends, SSR, Node backends, anywhere npm's ecosystem and the browser platform are the actual product." },
    { vs: "Kotlin / Kotlin Multiplatform", whenThis: "Flutter UIs (one codebase for mobile + web + desktop), when you want Dart's faster iteration vs KMP.", whenThat: "Android apps with native UI, server backends, anywhere full Java interop matters." },
    { vs: "Swift", whenThis: "Cross-platform mobile (Flutter), anywhere you want one codebase for iOS + Android + web + desktop.", whenThat: "Apple-platform-only native apps, anywhere Apple SDKs are the actual product." },
    { vs: "JavaScript", whenThis: "Type-safe mobile/desktop via Flutter, anywhere you want AOT compilation + sound types.", whenThat: "Browser code, Node.js backends, anywhere JS's ubiquity and ecosystem matter." },
    { vs: "Go", whenThis: "Cross-platform UIs, anywhere you want a richer type system (sealed classes, records, patterns) for domain modeling.", whenThat: "Server backends, network daemons, single-binary deployment, anywhere goroutines + tiny runtime beat Dart's isolate overhead." },
  ],
};

export default sheet;
