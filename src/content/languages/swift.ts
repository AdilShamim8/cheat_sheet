import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "swift",
  name: "Swift",
  category: "languages",
  tier: 2,
  tags: ["static", "compiled", "apple", "ios", "systems", "value-types", "actor"],
  tagline: "Apple's static, type-safe systems language for iOS/macOS — value semantics, protocol-oriented design, and structured concurrency.",
  year: 2014,
  author: "Chris Lattner (Apple)",

  tldr: [
    "Swift is a statically-typed, compiled language with type inference, automatic reference counting (ARC, not tracing GC), and a strong value-type bias — designed to replace Objective-C on Apple platforms and now usable on Linux/Windows for servers and tooling.",
    "It dominates iOS/macOS/watchOS/visionOS development and is increasingly used for server-side (Vapor, Hummingbird) and systems work where ABI stability, low latency, and C interop matter.",
    "Reach for Swift when targeting Apple platforms, when you want native performance with safety guarantees (optionals, overflow checks), or when you need C/C++ interop without the C footguns.",
    "Avoid Swift for cross-platform UIs that must run on Android/Web, for tiny scripts (slow compile), or when you need a tracing GC for cyclical data — ARC's retain cycles bite when you ignore `[weak self]`.",
  ],

  mentalModel: {
    title: "Value types by default, protocols over inheritance",
    body: "Swift structs are copied on assignment and on parameter passing — there is no shared mutable state by default, which eliminates an entire class of concurrency bugs and reasoning overhead. Classes exist for reference semantics and identity, but the language biases hard toward structs/enums. Generics are reified and monomorphized (no type erasure at runtime for the common case). The idiomatic design pattern is protocol-oriented programming: define a protocol (interface) with associated types and constraints, then write generic algorithms over it — this gets you ad-hoc polymorphism without runtime dispatch in most cases. Combined with ARC for classes and structured concurrency (async/await + actors) for isolation, Swift's model is 'if it compiles, you usually don't have a data race'.",
  },

  constructs: [
    { syntax: "let x = 5 / var y = 5", behavior: "Immutable vs mutable binding — inferred at declaration.", when: "Use `let` by default; switch to `var` only when you must mutate." },
    { syntax: "Int? / String!", behavior: "Optional — either a value or nil. `!` force-unwraps (crashes on nil).", when: "Model absence explicitly; never force-unwrap outside tests/asserts." },
    { syntax: "guard let x = opt else { return }", behavior: "Early-exit unwrap — bind a non-optional in the rest of scope.", when: "The default for input validation; reads top-down." },
    { syntax: "if let x = opt { ... }", behavior: "Bind optional in a scoped block.", when: "When the failure path is the local continuation." },
    { syntax: "struct User { let id: Int; var name: String }", behavior: "Value type — copied on assignment, mutating methods need `mutating`.", when: "Default for data; ~80% of types should be structs." },
    { syntax: "enum Result<T, E> { case ok(T); case err(E) }", behavior: "Sum type with payload — first-class pattern matching.", when: "Modeled errors, state machines, ASTs." },
    { syntax: "protocol Drawable { func draw() }", behavior: "Protocol — like a trait/interface; can have associated types and defaults.", when: "Polymorphism without inheritance; generic constraints." },
    { syntax: "func f<T>(_ x: T) -> T where T: Equatable", behavior: "Generic with constraint — monomorphized, no boxing.", when: "Default for reusable code; prefer over Any." },
    { syntax: "actor Counter { var n = 0; func inc() { n += 1 } }", behavior: "Reference type with serialized access — mutual exclusion for free.", when: "Swift 5.5+ structured concurrency; shared mutable state." },
    { syntax: "Task { await f() } / TaskGroup", behavior: "Structured async — cancellation propagates, awaiting waits for children.", when: "Concurrent work that should die with the parent scope." },
    { syntax: "x?.y?.z ?? 'default'", behavior: "Optional chaining with coalescing — short-circuits on nil.", when: "Traversing graphs of optional references." },
    { syntax: "@MainActor / nonisolated", behavior: "Actor isolation annotation — methods run on the main queue / outside isolation.", when: "UI code, global actor constraints in 5.5+." },
  ],

  patterns: [
    {
      lang: "swift",
      caption: "Value types + Result — the model layer pattern",
      code: `struct User: Identifiable, Equatable {
    let id: UUID
    var email: String
    var role: Role

    enum Role: String, Codable {
        case admin, member, guest
    }
}

enum UserError: Error {
    case notFound(id: UUID)
    case invalidEmail(String)
}

func fetchUser(id: UUID) async throws -> User {
    let raw = try await db.find(id)
    guard let raw else { throw UserError.notFound(id: id) }
    guard raw.email.contains("@") else {
        throw UserError.invalidEmail(raw.email)
    }
    return User(id: raw.id, email: raw.email, role: .init(rawValue: raw.role) ?? .guest)
}

// Callers must handle both branches — no silent failure.
let result = await Result(catching: { try await fetchUser(id: id) })
switch result {
case .success(let u):  print("ok \\(u.email)")
case .failure(let e):  print("err \\(e)")
}`,
    },
    {
      lang: "swift",
      caption: "Actor isolation — shared mutable state without locks",
      code: `actor ImageCache {
    private var entries: [URL: Data] = [:]
    private var inflight: [URL: Task<Data, Error>] = [:]

    func data(for url: URL) async throws -> Data {
        if let cached = entries[url] { return cached }

        if let task = inflight[url] {
            return try await task.value   // coalesce duplicate fetches
        }

        let task = Task<Data, Error> {
            let (bytes, _) = try await URLSession.shared.data(from: url)
            return bytes
        }
        inflight[url] = task
        defer { inflight[url] = nil }

        let data = try await task.value
        entries[url] = data
        return data
    }
}`,
    },
    {
      lang: "swift",
      caption: "Protocol-oriented programming with associated types",
      code: `protocol Repository {
    associatedtype Entity: Identifiable
    associatedtype ID = Entity.ID

    func get(_ id: ID) async throws -> Entity?
    func save(_ entity: Entity) async throws
}

struct UserRepository: Repository {
    typealias Entity = User

    private let db: Database

    func get(_ id: UUID) async throws -> User? {
        try await db.find(User.self, id: id)
    }

    func save(_ user: User) async throws {
        try await db.upsert(user)
    }
}

// Generic over any Repository — monomorphized at compile time.
func sync<R: Repository>(_ remote: R) async throws where R.Entity: Codable {
    if let local = try await remote.get(/* ... */) {
        try await remote.save(local)
    }
}`,
    },
    {
      lang: "swift",
      caption: "Structured concurrency with TaskGroup — fan-out, fan-in",
      code: `func downloadAll(_ urls: [URL]) async throws -> [Data] {
    try await withThrowingTaskGroup(of: (Int, Data).self) { group in
        for (i, url) in urls.enumerated() {
            group.addTask {
                let (data, _) = try await URLSession.shared.data(from: url)
                return (i, data)
            }
        }

        var ordered = Array<Data?>(repeating: nil, count: urls.count)
        for try await (i, data) in group {
            ordered[i] = data
        }
        return ordered.compactMap { $0 }
    }
    // Cancellation: if any child throws, the group cancels siblings.
}`,
    },
  ],

  pitfalls: [
    {
      title: "Retain cycles with `self` in closures",
      symptom: "`network.call { self.handle() }` captures self strongly — combined with a class that holds the network client, neither is ever deallocated; memory grows.",
      fix: "Use `[weak self]` (or `[unowned self]` when lifecycle is guaranteed) and `guard let self else { return }` inside the closure. ARC doesn't break cycles; you must.",
    },
    {
      title: "Force-unwrapping `!` crashes the process",
      symptom: "`optional!` aborts with `Fatal error: Unexpectedly found nil` — a single bad API response takes down the app.",
      fix: "Never use `!` outside unit tests or `@IBOutlet` connections. Use `guard let` / `if let` or `??` for defaults. Enable SwiftLint's `force_unwrapping` rule in CI.",
    },
    {
      title: "Implicitly-unwrapped optionals from Objective-C interop",
      symptom: "Imported Obj-C APIs surface as `String!` — they compile like non-optionals but can be nil at runtime, crashing on access.",
      fix: "Annotate Obj-C APIs with nullability (`nullable`/`nonnull`) or `NS_ASSUME_NONNULL_BEGIN`. On the Swift side, treat `!` as a red flag and prefer explicit `?`.",
    },
    {
      title: "Value-type mutation semantics surprise C/Java devs",
      symptom: "`var u = user; u.email = 'x'` does NOT modify `user` — structs are copied. Mutations to a struct field inside a method need `mutating` or they won't compile, but assignment-copy semantics still surprise.",
      fix: "Use `inout` parameters when you want to mutate the caller's copy: `func update(_ u: inout User)`. For shared mutable state, use a `class` or `actor` deliberately.",
    },
    {
      title: "String substring indices are not integers",
      symptom: "`s[0]` does not compile — String indices are opaque `String.Index` types because of UTF-8/UTF-16 grapheme clusters.",
      fix: "Use `s.startIndex`, `s.index(after:)`, `s.index(_:offsetBy:)`. For ASCII-heavy parsing, convert via `Array(s)` only when you accept the O(n) cost.",
    },
    {
      title: "Async functions run on the global executor by default",
      symptom: "Calling `await f()` from a non-isolated context hops to a background executor; touching UI requires `@MainActor` or `DispatchQueue.main.async`. Crashes or stale-UI bugs follow.",
      fix: "Mark UI-bound functions `@MainActor`. Run Swift 6 language mode (`SWIFT_STRICT_CONCURRENCY=complete`) to surface isolation violations at compile time.",
    },
    {
      title: "Global `let` constants are lazily initialized and not thread-safe pre-5.5",
      symptom: "A `let cache = buildCache()` at file scope initializes on first access; pre-5.5 the dispatch_once semantic was implicit but not guaranteed for `var` globals.",
      fix: "Use `static let` inside a struct/enum namespace for true lazy thread-safe singletons (the dispatch_once pattern). In Swift 6, global-actor isolation makes this explicit.",
    },
  ],

  quickReference: [
    { fact: "ARC (Automatic Reference Counting) — no tracing GC; insert `weak`/`unowned` to break cycles. Cost is paid at assignment, not pause.", tag: "perf" },
    { fact: "Structs are value types — copied on assignment. Classes are reference types — ARC-managed. Default to struct.", tag: "gotcha" },
    { fact: "Swift 5.5 introduced structured concurrency (async/await, actors, TaskGroup); Swift 6 enforces data-race safety at compile time.", tag: "version" },
    { fact: "Generics are reified and monomorphized — no type erasure unless you explicitly use `any Protocol`.", tag: "perf" },
    { fact: "Existential types (`any Protocol`) add indirection + dynamic dispatch; Swift 6 warns when you mean `some Protocol` instead.", tag: "perf" },
    { fact: "String is UTF-8 backed; indexing is O(n) because grapheme clusters can span bytes. Don't use s[i] for hot loops.", tag: "gotcha" },
    { fact: "Optionals are enums (.some/.none) — zero-cost when unwrapped via `if let`; force-unwrap is a runtime trap.", tag: "gotcha" },
    { fact: "Result<T, E> + throws are the two error paths; `throws` is untyped pre-6, typed throws (`throws(MyError)`) arrive in Swift 6.", tag: "version" },
    { fact: "Compile times explode with complex type inference in long chains of ?? and conditional expressions — break into locals.", tag: "perf" },
    { fact: "Whole-module optimization (-wmo / release mode) is required for cross-file generic specialization; debug builds skip it.", tag: "perf" },
    { fact: "actors serialize access via a hidden queue — `await` is the only sync point. Reentrancy is allowed; don't assume invariants hold across awaits.", tag: "gotcha" },
    { fact: "`@MainActor` runs on the main queue; UI code must be MainActor-isolated or you get purple runtime warnings.", tag: "version" },
    { fact: "Sendable conformance marks types safe to cross actor boundaries; Swift 6 enforces it as a compile-time check.", tag: "version" },
    { fact: "Common style: 4-space indent, camelCase, types PascalCase, protocols can be -able/-ing or nouns (Swift API guidelines).", tag: "style" },
    { fact: "SwiftFormat + SwiftLint are the de-facto formatters/linters; Xcode 16 integrates swift-format natively.", tag: "style" },
  ],

  goDeeper: [
    { title: "The Swift Programming Language — Official Book", url: "https://docs.swift.org/swift-book/", note: "Apple's canonical language guide; the Language Reference chapter is the spec-lite." },
    { title: "Swift Evolution — SE Proposals", url: "https://github.com/swiftlang/swift-evolution", note: "Every language feature has an SE number; read proposals to understand motivation and trade-offs." },
    { title: "Swift.org — Official Site", url: "https://www.swift.org/", note: "Open-source Swift, downloads, blog, and working group notes (server, embedded, etc.)." },
    { title: "Point-Free — Episodes on Swift", url: "https://www.pointfree.co/", note: "Best deep dives on protocol-oriented programming, concurrency, and combinator design." },
    { title: "Swift by Sundell (John Sundell)", url: "https://www.swiftbysundell.com/", note: "Practical articles on architecture, testing, and tooling for Apple-platform engineers." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "Int / UInt", behavior: "Platform-word-sized integer (64-bit on modern platforms). Prefer Int everywhere — even when values are non-negative.", when: "Counting, IDs, indexes. UInt is for bit-twiddling / FFI." },
      { syntax: "Int8 / Int16 / Int32 / Int64", behavior: "Fixed-width integers — explicit size for FFI / binary protocols.", when: "Binary parsing, C interop. Avoid in app code — Int is the default." },
      { syntax: "Double / Float", behavior: "IEEE 754 64-bit / 32-bit float. Double is the default for fractional.", when: "Math. Float only for graphics / huge arrays where memory matters." },
      { syntax: "Bool", behavior: "true / false — strict, no truthiness coercion like JS/Python.", when: "Logic. 'if x' where x is non-Bool doesn't compile." },
      { syntax: "String", behavior: "UTF-8 backed (5.x+), value type (copied on assignment), grapheme-cluster-aware.", when: "All text. Indexing is O(n) — don't treat as array of chars." },
      { syntax: "Character", behavior: "Single grapheme cluster — what a user perceives as one 'character'.", when: "Unicode-aware iteration. Array(s) for byte/code-unit access." },
      { syntax: "T (Tuple)", behavior: "Anonymous fixed-size record — (Int, String) or (name: String, age: Int).", when: "Quick pairs/triples. For >3 fields or named API, use a struct." },
      { syntax: "Optional<T>", behavior: "Enum with .some(T) / .none — represents absence. nil == .none.", when: "Any value that might be missing. The language's headline feature." },
      { syntax: "Result<T, E>", behavior: "Enum with .success(T) / .failure(E) — typed error channel.", when: "Async APIs that can fail; storing errors in collections (throws can't)." },
      { syntax: "Range<ClosedRange>", behavior: "(1..<5) exclusive, (1...5) inclusive — generic over Comparable.", when: "Iteration, slicing, validation. Ranges are values, not iterables per se." },
    ],
    collections: [
      { syntax: "Array<T>", behavior: "Contiguous, value-type (COW) — O(1) append/pop, O(n) insert at front.", when: "Ordered, indexable sequences. The default workhorse." },
      { syntax: "Dictionary<K, V>", behavior: "Hash map — value-type (COW), subscript returns Optional (nil for missing key).", when: "Keyed lookups, JSON, caches. Subscript-with-default: d[k, default: 0]." },
      { syntax: "Set<T>", behavior: "Hash set — O(1) membership, no duplicates, unordered.", when: "Dedup, membership tests, set algebra (union, intersection)." },
      { syntax: "Range<T> / ClosedRange<T>", behavior: "Half-open (a..<b) or closed (a...b) — generic over Comparable.", when: "Iteration bounds, slice ranges, interval checks." },
      { syntax: "AsyncStream<T>", behavior: "Async sequence — push-based values over time, cancellable.", when: "Wrapping delegate/callback APIs into for-await loops (5.5+)." },
      { syntax: "LazySequence", behavior: "Lazy map/filter — only computes on iteration.", when: "Large pipelines: arr.lazy.map { ... }.filter { ... }.forEach { ... }." },
      { syntax: "AnyCollection<T>", behavior: "Type-erased collection — for hiding concrete type across module boundaries.", when: "Rare; the existential 'any Collection<T>' is simpler in 5.7+." },
      { syntax: "Foundation.NSArray/NSDictionary", behavior: "Reference-type legacy from Obj-C — bridged to Array/Dictionary.", when: "Avoid in new Swift; only for Obj-C interop." },
    ],
    custom: [
      { syntax: "struct S { let id: Int }", behavior: "Value type — copied on assignment; default for data.", when: "~80% of types. Use for DTOs, models, anything without identity." },
      { syntax: "class C: SuperClass { }", behavior: "Reference type — ARC-managed, single inheritance, has identity.", when: "When you need shared mutable state, Obj-C interop, or identity semantics." },
      { syntax: "enum E { case a, b(Int) }", behavior: "Sum type with payload — first-class pattern matching, no inheritance.", when: "ADTs, state machines, Result, Optional. Add 'indirect' for recursive." },
      { syntax: "protocol P { associatedtype T }", behavior: "Generic interface with associated types — powers POP.", when: "Polymorphism without inheritance; the core of protocol-oriented design." },
      { syntax: "actor Counter { var n = 0 }", behavior: "Reference type with serialized access — mutual exclusion for free (5.5+).", when: "Shared mutable state across tasks; replaces manual locks." },
      { syntax: "extension String { func slug() -> String { } }", behavior: "Add methods to existing types — even ones you don't own.", when: "Ad-hoc API on third-party/stdlib types. Cannot add stored properties." },
      { syntax: "@propertyWrapper struct Cached<V>", behavior: "Custom property behavior — wraps get/set with custom logic.", when: "Caching, validation, defaults — used by SwiftUI @State, @AppStorage." },
      { syntax: "typealias UserID = Int", behavior: "Type alias — purely cosmetic, no new type created.", when: "Readability. For real type-safety use a wrapper struct, not typealias." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b", behavior: "Arithmetic — overflow traps at runtime by default (use &+/&-/&* for wrapping).", when: "Math. For arithmetic on user input, use overflow operators deliberately." },
    { syntax: "a % b", behavior: "Remainder — sign follows dividend (like C). Floating-point: use .truncatingRemainder.", when: "Modulo, parity checks. -7 % 2 == -1 (not 1)." },
    { syntax: "a == b, a != b", behavior: "Value equality — requires Equatable conformance. Auto-synthesized for structs/enums.", when: "Default comparisons. Synthesized == checks all stored properties." },
    { syntax: "a === b, a !== b", behavior: "Identity — same object reference. Only on class types (reference identity).", when: "Detecting shared references; rare in app code, common in tests/debugging." },
    { syntax: "a < b, a > b, a <= b, a >= b", behavior: "Comparison — requires Comparable. Auto-synthesized for enums/structs.", when: "Sorting, ranges. Chaining: '1 < x && x < 10' (no Python-style 1 < x < 10)." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — strict Bool, no truthiness coercion.", when: "Logic. Ints/optionals are not Bool — 'if x' fails to compile." },
    { syntax: "a ?? b", behavior: "Nil-coalescing — unwraps Optional, returns b if nil.", when: "Default values: 'x ?? 0' is the same as guard-let for defaulting." },
    { syntax: "a ? b : c", behavior: "Ternary — only one branch evaluated.", when: "Concise conditional. Prefer if-let/guard-let for optionals." },
    { syntax: "a?.b?.c", behavior: "Optional chaining — short-circuits to nil on any nil. Returns Optional.", when: "Traversing graphs of optional references. Combines with ??: 'a?.b ?? default'." },
    { syntax: "try?, try!", behavior: "Convert throws to Optional (try?) or crash on throw (try!).", when: "try? for 'don't care' paths; try! only in tests/assertions." },
    { syntax: "a as? B, a as! B, a as B", behavior: "Cast: conditional / forced / upcast. as? returns Optional, as! traps on failure.", when: "Downcasting Any to concrete type. Prefer generics over Any+as." },
    { syntax: "a is B", behavior: "Type check — true if a is a B (or subclass/implementor).", when: "Branching by runtime type. Rare in idiomatic Swift — prefer protocols." },
    { syntax: "a & b, a | b, a ^ b", behavior: "Bitwise AND/OR/XOR — on integer types.", when: "Bit flags. OptionSet protocol for typed flag sets." },
    { syntax: "~a, a << n, a >> n", behavior: "Bitwise NOT, left/right shift.", when: "Low-level bit ops; rare in business code." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "swift",
      caption: "File I/O — small (read all) vs large (stream)",
      code: `import Foundation

// Small file — read all at once (String is UTF-8 backed)
let text = try String(contentsOf: URL(fileURLWithPath: "small.txt"), encoding: .utf8)
let data = try Data(contentsOf: URL(fileURLWithPath: "data.bin"))

// Large file — stream line by line
let url = URL(fileURLWithPath: "huge.csv")
guard let stream = InputStream(url: url) else { fatalError("missing") }
stream.open()
defer { stream.close() }

let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
defer { buffer.deallocate() }

while stream.hasBytesAvailable {
    let n = stream.read(buffer, maxLength: 4096)
    let chunk = String(bytes: UnsafeBufferPointer(start: buffer, count: n), encoding: .utf8)
    // process chunk
}

// Even better for line-based work — use URL session's async bytes:
// for try await line in url.lines { process(line) }  // 5.5+`,
    },
    {
      lang: "swift",
      caption: "stdin / stdout / stderr — CLI tools",
      code: `import Foundation

// Read all of stdin
let data = FileHandle.standardInput.readDataToEndOfFile()
let input = String(data: data, encoding: .utf8) ?? ""

// Stream stdin line by line (async, 5.5+)
for try await line in FileHandle.standardInput.bytes.lines {
    print(line.uppercased())
}

// Print to stderr
FileHandle.standardError.write(Data("warning: deprecated\\n".utf8))

// JSON over stdin/stdout — the standard CLI interop pattern
struct Payload: Codable { let k: Int; let list: [Int] }
let payload = try JSONDecoder().decode(Payload.self, from: data)
let result = transform(payload)
let out = try JSONEncoder().encode(result)
FileHandle.standardOutput.write(out)`,
    },
    {
      lang: "swift",
      caption: "JSON / Codable / PropertyList — serialization tiers",
      code: `import Foundation

struct User: Codable, Equatable {
    let id: Int
    let email: String
    let role: String
    let tags: [String]
}

// JSON — text, portable, the default
let encoded = try JSONEncoder().encode(User(id: 1, email: "a@b.io", role: "admin", tags: []))
let str = String(data: encoded, encoding: .utf8)!
let user = try JSONDecoder().decode(User.self, from: encoded)

// Customize: snake_case JSON ↔ camelCase Swift
let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase

// PropertyList — Apple-specific, faster than JSON for Apple platforms
let plist = try PropertyListEncoder().encode(user)
let back = try PropertyListDecoder().decode(User.self, from: plist)`,
    },
    {
      lang: "swift",
      caption: "HTTP client (async URLSession) with retries",
      code: `import Foundation

func getJSON<T: Decodable>(_ url: URL, as type: T.Type) async throws -> T {
    var req = URLRequest(url: url, timeoutInterval: 10)
    req.setValue("application/json", forHTTPHeaderField: "Accept")

    var attempts = 0
    while true {
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            attempts += 1
            if attempts >= 3 { throw error }
            try await Task.sleep(nanoseconds: UInt64(0.5 * pow(2, Double(attempts - 1)) * 1_000_000_000))
        }
    }
}

let u: User = try await getJSON(URL(string: "https://api/users/1")!, as: User.self)`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "swift",
      caption: "for-in + enumerated + zip — the holy trinity",
      code: `let items = ["a", "b", "c"]
let scores = [10, 20, 30]

// for-in is the default — no index needed
for item in items {
    print(item)
}

// enumerated — index + value (returns (offset, element) tuples)
for (i, item) in items.enumerated() {
    print("\\(i): \\(item)")
}

// zip — parallel iteration (stops at shortest)
for (item, score) in zip(items, scores) {
    print("\\(item): \\(score)")
}

// Don't use range+subscript unless you need to mutate by index.`,
    },
    {
      lang: "swift",
      caption: "map / filter / reduce — functional trinity",
      code: `let nums = Array(1...10)

// map — transform each element
let squares = nums.map { $0 * $0 }

// compactMap — map + drop nils (great for fallible transforms)
let ints = ["1", "2", "x"].compactMap(Int.init)

// flatMap — map + flatten one level
let nested = [[1, 2], [3, 4]].flatMap { $0 }  // [1, 2, 3, 4]

// filter — keep elements matching predicate
let evens = nums.filter { $0.isMultiple(of: 2) }

// reduce — fold left
let sum = nums.reduce(0, +)  // operator as closure — clean!

// Chained pipelines read top-to-bottom
nums.filter { $0.isMultiple(of: 2) }
    .map { $0 * $0 }
    .reduce(0, +)`,
    },
    {
      lang: "swift",
      caption: "while / repeat-while / stride — explicit loops",
      code: `// while — runs while condition is true
var n = 0
while n < 10 {
    if found(n) { break }
    n += 1
}

// repeat-while — runs body at least once (do-while in C)
var result: String
repeat {
    result = tryOnce()
} while result == "retry"

// stride — replaces for (i = 0; i < n; i += step)
for i in stride(from: 0, to: 100, by: 5) { print(i) }       // 0, 5, ..., 95
for i in stride(from: 100, through: 0, by: -10) { print(i) } // 100, 90, ..., 0`,
    },
    {
      lang: "swift",
      caption: "AsyncSequence — async iteration (5.5+)",
      code: `// AsyncSequence is the async equivalent of Sequence — values arrive over time.
// URL.lines, URLSession.bytes, AsyncStream all conform.

for try await line in URL(fileURLWithPath: "log.txt").lines {
    process(line)
}

// Build your own AsyncStream — wraps a callback API into for-await
func ticker() -> AsyncStream<Date> {
    AsyncStream { continuation in
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            continuation.yield(Date())
        }
    }
}

for await tick in ticker() {
    print(tick)
    if shouldStop() { break }   // cancellation propagates
}`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "swift",
      caption: "Parameters, defaults, variadic, inout, labels",
      code: `// External label vs internal name: 'to' is the call-site label, 'dest' is the param
func move(_ item: Item, to dest: Box, count: Int = 1, others: Item...) -> Bool {
    // _         : no external label (call as move(item, to: box))
    // to        : external label 'to', internal name 'dest'
    // count     : default value
    // others    : variadic — received as [Item]
    return true
}

// inout — pass-by-reference (mutates caller's value)
func increment(_ n: inout Int) { n += 1 }
var x = 5
increment(&x)  // x is now 6

// Trailing closure syntax — last closure arg goes outside parens
[1, 2, 3].map { $0 * 2 }  // parens omitted entirely`,
    },
    {
      lang: "swift",
      caption: "Closures + capture semantics + escaping",
      code: `// Closures capture by reference — but value types are COW-copied on mutation
var counter = 0
let increment = { counter += 1 }   // captures counter by reference
increment()  // counter == 1

// @escaping — closure outlives the function (stored or async)
func load(_ completion: @escaping (Result<Data, Error>) -> Void) {
    DispatchQueue.global().async {
        completion(.success(Data()))
    }
}

// @Sendable — closure is safe to send across actors (no mutable captures)
func parallel(_ work: @Sendable @escaping () -> Void) { /* ... */ }

// Capture list — control retention explicitly
network.call { [weak self] result in
    guard let self else { return }   // weak self to break retain cycles
    self.handle(result)
}`,
    },
    {
      lang: "swift",
      caption: "Generics + constraints + keypaths",
      code: `// Generic function with constraint — monomorphized at compile time
func first<T: Equatable>(_ xs: [T], matching needle: T) -> T? {
    xs.first { $0 == needle }
}

// Generic over associated-type protocol
func sort<S: Sequence>(_ xs: S) -> [S.Element] where S.Element: Comparable {
    xs.sorted()
}

// KeyPath — first-class reference to a property
struct User { let id: Int; let email: String }
let users = [User(id: 1, email: "a"), User(id: 2, email: "b")]
let emails = users.map(\\.email)  // ["a", "b"] — via keypath

// Sort by keypath — concise
let sorted = users.sorted(by: \\.id)  // requires KeyPathsorting helpers
let ids = users.map(\\.id)  // [1, 2]`,
    },
    {
      lang: "swift",
      caption: "Result builders — DSL for declarative APIs (powers SwiftUI)",
      code: `// A result builder transforms a block of statements into a single value.
// SwiftUI's ViewBuilder is the famous example — this is how VStack { ... } works.

@resultBuilder
enum StringBuilder {
    static func buildBlock(_ parts: String...) -> String {
        parts.joined(separator: "\\n")
    }
}

func makeText(@StringBuilder content: () -> String) -> String { content() }

let text = makeText {
    "line 1"
    "line 2"
    "line 3"
}
// text == "line 1\\nline 2\\nline 3"

// This is how SwiftUI composes views: ViewBuilder turns a block of
// view expressions into a TupleView, which gets flattened into the tree.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "swift",
      caption: "do / try / catch + typed errors (Swift 6)",
      code: `// throws is untyped pre-6 — catches any Error.
// Swift 6 adds typed throws: func f() throws(MyError) -> T

enum UserError: Error {
    case notFound(id: UUID)
    case invalidEmail(String)
    case unauthorized
}

func fetchUser(id: UUID) async throws -> User {
    let raw = try await db.find(id)
    guard let raw else { throw UserError.notFound(id: id) }
    guard raw.email.contains("@") else { throw UserError.invalidEmail(raw.email) }
    return raw
}

do {
    let u = try await fetchUser(id: id)
    print(u.email)
} catch UserError.notFound(let id) {
    print("missing \\(id)")
} catch UserError.invalidEmail(let email) {
    print("bad email \\(email)")
} catch {
    // catch-all — required since throws is untyped pre-6
    print("unexpected: \\(error)")
}`,
    },
    {
      lang: "swift",
      caption: "guard let — early exit (the Swift idiom)",
      code: `// guard let: bind an unwrapped optional for the rest of scope, or exit.
func process(_ data: Data?) throws {
    guard let data, !data.isEmpty else {
        throw UserError.invalidEmail("empty")
    }
    // data is non-optional here — no shadowing
    guard let str = String(data: data, encoding: .utf8) else { return }
    guard let user = parse(str) else { return }
    use(user)
}

// guard with multiple bindings + condition — all must pass:
guard let a = optA,
      let b = optB,
      a < b else { return }
// a and b are non-optional past the guard`,
    },
    {
      lang: "swift",
      caption: "Result<T, E> — typed errors as values",
      code: `// Result is useful when you need to STORE an error (throws can't).
// Also for sync APIs where callers want branching instead of do/catch.

func divide(_ a: Int, _ b: Int) -> Result<Int, UserError> {
    guard b != 0 else { return .failure(.invalidEmail("div by zero")) }
    return .success(a / b)
}

// Pattern-match on the result
switch divide(10, 0) {
case .success(let v):  print(v)
case .failure(let e):  print("err \\(e)")
}

// .map and .flatMap compose Results
let upper: Result<String, UserError> = divide(10, 2).map { "result: \\($0)" }

// Result(catching:) wraps a throwing closure:
let r = Result { try JSONDecoder().decode(User.self, from: data) }`,
    },
    {
      lang: "swift",
      caption: "defer — guaranteed cleanup",
      code: `// defer runs when scope exits — return, throw, or break. LIFO.
func process(_ url: URL) throws {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }  // always close, even on throw

    let data = handle.readDataToEndOfFile()
    if data.isEmpty { throw UserError.invalidEmail("empty") }
    // ...
}

// Multiple defers run in reverse order:
{
    defer { print("1") }
    defer { print("2") }
    defer { print("3") }
    print("body")
}()
// Prints: body, 3, 2, 1

// Don't put expensive work in defer — readers expect cleanup to be cheap.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "swift",
      caption: "async / await — structured concurrency (5.5+)",
      code: `func fetchUser(id: UUID) async throws -> User {
    let (data, _) = try await URLSession.shared.data(from: endpoint(id))
    return try JSONDecoder().decode(User.self, from: data)
}

func loadAll(_ ids: [UUID]) async throws -> [User] {
    // Sequential — each await blocks
    var users: [User] = []
    for id in ids {
        users.append(try await fetchUser(id: id))
    }
    return users
}

// Parallel with TaskGroup — children race, parent awaits all
func loadAllParallel(_ ids: [UUID]) async throws -> [User] {
    try await withThrowingTaskGroup(of: (Int, User).self) { group in
        for (i, id) in ids.enumerated() {
            group.addTask { (i, try await fetchUser(id: id)) }
        }
        var ordered = Array<User?>(repeating: nil, count: ids.count)
        for try await (i, u) in group { ordered[i] = u }
        return ordered.compactMap { $0 }
    }
}`,
    },
    {
      lang: "swift",
      caption: "Actor — shared mutable state without locks",
      code: `// Actors serialize access — only one method runs at a time per instance.
// No locks, no race conditions on actor-isolated state.
actor Counter {
    private var count = 0
    func increment() { count += 1 }
    func value() -> Int { count }
}

let c = Counter()
Task {
    await c.increment()       // awaits access to the actor
    print(await c.value())    // 1
}

// 'await' is required even for reads — actor methods are async.
// Reentrancy is allowed: a method awaiting another task can be re-entered
// by a different caller. Don't assume invariants hold across awaits.

// @MainActor — global actor that runs on the main queue (UI code)
@MainActor final class ViewModel: ObservableObject {
    @Published var users: [User] = []
}`,
    },
    {
      lang: "swift",
      caption: "async let — concurrent fan-out, scoped",
      code: `// async let runs the work concurrently with the rest of the function.
// Scope-bound — cancellation propagates if the enclosing scope exits.
func loadProfile(id: UUID) async throws -> Profile {
    async let user = fetchUser(id: id)
    async let posts = fetchPosts(userID: id)
    async let friends = fetchFriends(userID: id)

    // All three run concurrently — 'try await' gathers results in order
    return try await Profile(user: user, posts: posts, friends: friends)
}

// For unbounded fan-out, use TaskGroup instead — async let is for
// a fixed, small number of concurrent operations.`,
    },
    {
      lang: "swift",
      caption: "Sendable + structured concurrency (Swift 6)",
      code: `// Sendable marks a type as safe to send across actor boundaries.
// Value types (structs, enums) with Sendable members are auto-Sendable.
struct User: Sendable, Codable { let id: UUID; let email: String }

// Classes need either 'final class' with no mutable state, or manual care.
final class Counter: Sendable {  // requires @unchecked Sendable if mutable
    private let lock = NSLock()
    private var _count = 0
    func increment() { lock.lock(); _count += 1; lock.unlock() }
    // Mark @unchecked Sendable because the compiler can't verify the lock.
}

// Swift 6 language mode: data-race safety is a compile-time check.
// Shared mutable state MUST be actor-isolated or marked Sendable.
// 'SWIFT_STRICT_CONCURRENCY=complete' surfaces violations in Swift 5.x.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "swift",
      caption: "XCTest — the classic Apple test framework",
      code: `import XCTest
@testable import MyApp

final class UserTests: XCTestCase {
    var user: User!

    override func setUp() {  // runs before each test
        super.setUp()
        user = User(id: UUID(), email: "a@b.io")
    }

    func testValidatesEmail() {
        XCTAssertTrue(user.isValid())
        XCTAssertEqual(user.email, "a@b.io")
    }

    func testRejectsBadEmail() throws {
        user.email = "nope"
        XCTAssertFalse(user.isValid())
        XCTAssertNotNil(user.errors["email"])
    }

    // Async test — use async throws
    func testFetchUser() async throws {
        let u = try await fetchUser(id: user.id)
        XCTAssertEqual(u.email, "a@b.io")
    }
}`,
    },
    {
      lang: "swift",
      caption: "Swift Testing (2024+) — modern DSL",
      code: `import Testing
@testable import MyApp

@Suite("User validation")
struct UserTests {
    @Test("accepts a real email")
    func validEmail() {
        let u = User(id: UUID(), email: "a@b.io")
        #expect(u.isValid())
    }

    @Test("rejects bad emails", arguments: ["", "nope", "a@@b.io"])
    func rejectsBadEmail(_ email: String) {
        let u = User(id: UUID(), email: email)
        #expect(!u.isValid())
    }

    @Test("loads user from API")
    func fetchUser() async throws {
        let u = try await fetchUser(id: UUID())
        #expect(u.email == "a@b.io")
    }
}

// Swift Testing is the modern Apple framework (2024+) — parallel by default,
// trait-based, integrates with XCTest via @Test. Prefer it for new code.`,
    },
    {
      lang: "swift",
      caption: "Mocks & stubs — protocols are the seam",
      code: `// Swift has no built-in mock library — design for testability with protocols.
protocol NetworkClient: Sendable {
    func get(_ url: URL) async throws -> Data
}

final class ProductionClient: NetworkClient {
    func get(_ url: URL) async throws -> Data {
        let (data, _) = try await URLSession.shared.data(from: url)
        return data
    }
}

final class MockClient: NetworkClient {
    var responses: [URL: Data] = [:]
    var recordedRequests: [URL] = []
    func get(_ url: URL) async throws -> Data {
        recordedRequests.append(url)
        return responses[url] ?? Data()
    }
}

// Tests inject the mock; production injects the real one.
let mock = MockClient()
mock.responses[url] = jsonData
let service = UserService(client: mock)`,
    },
    {
      lang: "swift",
      caption: "Coverage + CI config in Xcode / xcodebuild",
      code: `// Enable coverage in Xcode: Edit Scheme → Test → Options → Code Coverage.
// CLI:
//   xcodebuild test \\
//     -scheme MyApp \\
//     -destination 'platform=iOS Simulator,name=iPhone 15' \\
//     -enableCodeCoverage YES

// Export coverage:
//   xcrun xccov view --report --json MyApp.xcresult > coverage.json

// Common CI pattern (GitHub Actions):
//   - uses: maxim-lobanov/setup-xcode@v1
//     with: { xcode-version: '16.0' }
//   - run: xcodebuild test -scheme MyApp -destination '...'
//   - uses: kishikawakatsumi/xcresulttool@latest
//     with: { path: MyApp.xcresult }

// For SPM-only projects: 'swift test --enable-codecoverage'`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "ARC (Automatic Reference Counting) — no tracing GC; cost paid at assignment, no pause. Insert weak/unowned to break cycles.", tag: "perf" },
    { fact: "Structs are value types — copied on assignment (COW for collections). No locks needed for cross-thread sharing.", tag: "perf" },
    { fact: "Generics are reified and monomorphized — no type erasure, no boxing, full optimization across calls.", tag: "perf" },
    { fact: "Existential types ('any Protocol') add indirection + dynamic dispatch — Swift 6 warns. Use 'some Protocol' where possible.", tag: "perf" },
    { fact: "String is UTF-8 backed (5.x+); indexing is O(n) because grapheme clusters can span bytes. Don't use s[i] in hot loops.", tag: "gotcha" },
    { fact: "Whole-module optimization (-wmo / release mode) is required for cross-file generic specialization; debug builds skip it.", tag: "perf" },
    { fact: "Compile times explode with complex type inference in long chains of ?? and conditional expressions — break into locals.", tag: "perf" },
    { fact: "actors serialize access via a hidden queue — 'await' is the only sync point. Reentrancy is allowed; don't assume invariants across awaits.", tag: "gotcha" },
    { fact: "Sendable conformance is checked at compile time in Swift 6 — eliminates data races by construction.", tag: "version" },
    { fact: "AsyncSequence has per-yield allocation overhead — for tight inner loops, prefer plain Sequence + collections.", tag: "perf" },
    { fact: "Final classes devirtualize; non-final classes use vtable dispatch. Mark classes 'final' by default (perf + safety).", tag: "perf" },
    { fact: "Lazy properties ('lazy var') incur a dispatch_once-like check on every read; avoid in tight loops.", tag: "perf" },
    { fact: "Array COW: 'var b = a; b.append(x)' clones the storage only when mutation happens. Reads share.", tag: "perf" },
    { fact: "Instruments (Xcode) is the standard profiler — Time Profiler for CPU, Allocations for memory, Leaks for retain cycles.", tag: "perf" },
    { fact: "Float80 / 128-bit SIMD via swift-numerics / Accelerate for math-heavy code — 4-16x speedups for vectorizable loops.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Xcode", purpose: "Apple's IDE — editor, simulator, debugger, Instruments profiler. Required for iOS dev.", url: "https://developer.apple.com/xcode/", category: "build" },
    { tool: "Swift Package Manager (SPM)", purpose: "Official build + dependency tool — Package.swift, integrates with Xcode.", url: "https://www.swift.org/package-manager/", category: "package" },
    { tool: "SwiftLint", purpose: "Linter — enforces Swift API guidelines + project rules. Open source by Realm.", url: "https://github.com/realm/SwiftLint", category: "lint" },
    { tool: "SwiftFormat", purpose: "Code formatter — opinionated, fast, integrates with Xcode build phases.", url: "https://github.com/nicklockwood/SwiftFormat", category: "lint" },
    { tool: "XCTest", purpose: "Classic test framework — ships with Xcode. XCTestCase + setUp/tearDown.", url: "https://developer.apple.com/documentation/xctest", category: "test" },
    { tool: "Swift Testing", purpose: "Modern Apple test framework (2024+) — @Test / @Suite / #expect. Parallel by default.", url: "https://developer.apple.com/documentation/testing", category: "test" },
    { tool: "Instruments", purpose: "Xcode profiler — Time Profiler, Allocations, Leaks, SwiftUI view body counts.", url: "https://developer.apple.com/documentation/instruments", category: "debug" },
    { tool: "CocoaPods", purpose: "Legacy dependency manager — pre-SPM. Still common in older iOS codebases.", url: "https://cocoapods.org/", category: "package" },
    { tool: "Carthage", purpose: "Decentralized dependency manager — builds frameworks, no central registry.", url: "https://github.com/Carthage/Carthage", category: "package" },
    { tool: "SwiftUI", purpose: "Declarative UI framework (iOS 13+) — replaces UIKit for new apps.", url: "https://developer.apple.com/documentation/swiftui", category: "build" },
    { tool: "UIKit", purpose: "Imperative UI framework — the foundation of every pre-SwiftUI iOS app.", url: "https://developer.apple.com/documentation/uikit", category: "build" },
    { tool: "Vapor", purpose: "Server-side Swift web framework — async, based on SwiftNIO.", url: "https://vapor.codes/", category: "build" },
    { tool: "Hummingbird", purpose: "Modern minimal server-side framework — async/await-first, lighter than Vapor.", url: "https://hummingbird.codes/", category: "build" },
    { tool: "Combine", purpose: "Apple's reactive framework — Deprecated-ish; async/await + AsyncStream replaces it for new code.", url: "https://developer.apple.com/documentation/combine", category: "build" },
    { tool: "swift-format", purpose: "Apple's official formatter (separate from SwiftFormat) — less common, IDE integration.", url: "https://github.com/apple/swift-format", category: "lint" },
    { tool: "SwiftNIO", purpose: "Low-level event-driven network framework — the foundation of Vapor/Hummingbird.", url: "https://github.com/apple/swift-nio", category: "build" },
    { tool: "Tuist", purpose: "Xcode project generator — modularizes large apps, avoids .xcodeproj merge conflicts.", url: "https://tuist.io/", category: "build" },
    { tool: "fastlane", purpose: "CI/CD for iOS — screenshots, beta distribution, App Store deployment.", url: "https://fastlane.tools/", category: "deploy" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0",  year: 2014, highlight: "First release — replaced Objective-C for new Apple-platform development." },
    { version: "2.0",  year: 2015, highlight: "Open-sourced under Apache 2.0; Linux port began. protocol extensions, error handling redesign." },
    { version: "3.0",  year: 2016, highlight: "Major breaking changes — SE proposals process formalized. Swift Package Manager stable." },
    { version: "4.0",  year: 2017, highlight: "Codable, multi-line string literals, KeyPath, split String/Substring. ABI stability groundwork." },
    { version: "4.2",  year: 2018, highlight: "Hashable synthesis, CaseIterable, inline functions, SIMD groundwork." },
    { version: "5.0",  year: 2019, highlight: "ABI stability — Swift runtime shipped in OS. Binary compatibility across app versions." },
    { version: "5.1",  year: 2019, highlight: "Module stability (import binary frameworks), property wrappers, opaque return types (some)." },
    { version: "5.3",  year: 2020, highlight: "Multi-statement trailing closures, SDK overlays, Swift Collections preview." },
    { version: "5.4",  year: 2021, highlight: "Inline functions in result builders (improved SwiftUI), implicit 'self' in closures." },
    { version: "5.5",  year: 2021, highlight: "Structured concurrency (async/await, actors, TaskGroup), AsyncSequence, Sendable. The big one." },
    { version: "5.6",  year: 2022, highlight: "Existential 'any Protocol', plugins (SwiftGen-style), incremental code-size wins." },
    { version: "5.7",  year: 2022, highlight: "Regex literals, generic parameter packs (partial), distributed actors (preview)." },
    { version: "5.8",  year: 2023, highlight: "Inline array initializers, lightweight type syntax, incremental compilation improvements." },
    { version: "5.9",  year: 2023, highlight: "Macros (SE-0382, powers Observable), if/switch expressions, noncopyable types (preview)." },
    { version: "5.10", year: 2024, highlight: "Noncopyable generics, strict concurrency checking complete-ier, Swift Testing released." },
    { version: "6.0",  year: 2024, highlight: "Data-race safety enforced by default, typed throws, USDs of concurrency migration. Major." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between a struct and a class in Swift?", a: "Structs are value types — copied on assignment, COW for collections, no shared mutable state, no locks needed across threads. Classes are reference types — ARC-managed, single inheritance, have identity (===). Default to structs (~80% of types). Use classes for: Obj-C interop, when you need shared mutable state via identity, or for model objects with lifetime semantics. Even ObservableObject in SwiftUI is a class only because @Published requires reference semantics.", difficulty: "easy" },
    { q: "Explain ARC and retain cycles.", a: "ARC (Automatic Reference Counting) inserts retain/release at compile time — no tracing GC, no pause. Every strong reference increments; deallocation happens at zero. The trap: two objects referencing each other strongly (e.g., self in a closure held by a property) never reach zero — leak. Fix with [weak self] (becomes nil when the referent deallocates) or [unowned self] (assumes referent outlives reference, traps if wrong). Closures capture by reference, so they're the most common cycle source.", difficulty: "medium" },
    { q: "What's the difference between 'some' and 'any' Protocol?", a: "'some Protocol' is an opaque type — the compiler knows the concrete type, just hides it from the caller. Zero-cost: inlined, monomorphized, no boxing. 'any Protocol' is an existential — a type-erased box that holds any conforming type; each call goes through dynamic dispatch + indirection. Swift 5.7+ warns when you wrote 'Protocol' (implicitly any) but meant 'some Protocol'. Use 'some' for return types where the impl is fixed but you want to hide it; use 'any' only when you genuinely need to store heterogeneous types in a collection.", difficulty: "medium" },
    { q: "How do Swift actors prevent data races?", a: "An actor is a reference type whose methods are serialized — only one executes at a time per actor instance. Reads and writes to actor-isolated state require 'await', which hops through the actor's mailbox. This guarantees no two threads touch the state simultaneously — no locks, no races. The catch: reentrancy is allowed — an actor method awaiting another task can be re-entered by a different caller before the await completes. So don't assume invariants hold across 'await' boundaries; keep critical sections sync.", difficulty: "medium" },
    { q: "Explain the difference between throws and typed throws (Swift 6).", a: "Pre-6, 'throws' is untyped — any Error can propagate, and callers must use a catch-all. Swift 6 adds typed throws: 'func f() throws(MyError) -> T'. The caller only catches MyError; the compiler verifies that's all you throw. This makes error handling more like Rust's Result — exhaustive, type-safe. Use typed throws when the error set is closed and known; use untyped throws for generic libraries where errors come from arbitrary subsystems.", difficulty: "hard" },
    { q: "How does Optional work under the hood?", a: "Optional<T> is a two-case enum: case none (== nil), case some(T). 'if let x = opt' pattern-matches .some and binds the wrapped value. Force-unwrap (opt!) traps if the value is .none. The compiler optimizes Optionals heavily — at the SIL/IR level, an Optional<Class> is just a nullable pointer (zero-cost), Optional<Int> is a (value, hasValue) pair, etc. So 'String?' is essentially free vs an unchecked nullable — the runtime cost is paid only in pattern-match exhaustiveness.", difficulty: "medium" },
    { q: "What's protocol-oriented programming and how does it differ from OOP?", a: "POP emphasizes protocols (interfaces) with associated types, default implementations, and generic constraints over class inheritance. You write generic algorithms over protocols: 'func sort<S: Sequence>(_ xs: S) where S.Element: Comparable'. This gets you ad-hoc polymorphism without runtime dispatch in most cases (generics are monomorphized), and without the rigid single-inheritance hierarchy of classes. The classic talk is 'Protocol-Oriented Programming in Swift' (WWDC 2015) — still the canonical reference.", difficulty: "medium" },
    { q: "How do KeyPaths work and when are they useful?", a: "A KeyPath is a first-class reference to a property — \\User.email refers to the email property of User without reading it. The compiler desugars it to a KeyPath<User, String> value. Use cases: data binding (SwiftUI @ObservedObject), functional lenses (chaining \\a.\\.b.\\.c), and meta-programming (sorting/filtering by a keypath without a closure). They're zero-cost in release builds — the compiler specializes accessors per concrete keypath type.", difficulty: "hard" },
    { q: "What is Sendable and why does it matter?", a: "Sendable is a marker protocol (no requirements) that promises a type is safe to send across actor boundaries — either because it's a value type with no mutable state, or because the author manually verified thread-safety (marked @unchecked Sendable). In Swift 6 language mode, the compiler enforces Sendable at every actor crossing — if you pass a non-Sendable type to another actor, it's a compile error. This eliminates data races by construction, similar to Rust's Send/Sync.", difficulty: "medium" },
    { q: "Explain the difference between 'try?' and 'try!'.", a: "try? converts a throwing expression to Optional — on throw, returns nil instead of propagating. Useful when you don't care about the error, just whether it worked. try! traps the process on throw — like force-unwrapping Optional. Never use try! outside tests or assertions where the throw is provably impossible (e.g., decoding a hard-coded literal). The default 'try' (without ?/!) propagates errors normally and requires do/catch.", difficulty: "easy" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Objective-C", whenThis: "All new Apple-platform development, anywhere you want type safety + value semantics + structured concurrency.", whenThat: "Maintaining legacy iOS apps, C++ interop-heavy codebases, anywhere the existing Obj-C ecosystem (libraries, patterns) is the actual product." },
    { vs: "Kotlin", whenThis: "Apple-platform apps (iOS/macOS), server-side on Linux/Windows, anywhere ARC's no-pause model beats JVM's GC for latency.", whenThat: "Android apps, backend services on the JVM, anywhere you want full Java interop + Kotlin Multiplatform across mobile + web." },
    { vs: "Rust", whenThis: "Apple-platform UIs, anywhere the Apple SDK is the actual product, when you want safety without borrow-checker friction.", whenThat: "Systems programming, embedded, WebAssembly, anywhere memory-safety without runtime cost is non-negotiable." },
    { vs: "TypeScript", whenThis: "Native mobile/desktop apps via SwiftUI, anywhere you need true native performance + Apple SDKs.", whenThat: "Web frontends, SSR, isomorphic code, anywhere npm's ecosystem and the browser platform are the actual product." },
    { vs: "Go", whenThis: "Apple-platform apps, anywhere you want a richer type system (ADTs, protocols, generics) for domain modeling.", whenThat: "Server backends, network daemons, ops tooling, anywhere single-binary deployment + goroutines + tiny runtime beats Apple SDK lock-in." },
  ],
};

export default sheet;
