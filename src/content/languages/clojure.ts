import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "clojure",
  name: "Clojure",
  category: "languages",
  tier: 3,
  tags: ["functional", "dynamic", "lisp", "jvm", "immutable", "concurrent", "stm"],
  tagline: "A modern Lisp on the JVM — immutable data, software transactional memory, and the REPL-driven workflow that defined data engineering at scale.",
  year: 2007,
  author: "Rich Hickey",

  tldr: [
    "Clojure is a dynamically-typed, functional Lisp that compiles to JVM bytecode; persistent immutable data structures are the default, vars are mutable references, and identity is separated from value via four reference types (Var, Atom, Ref, Agent).",
    "It runs anywhere the JVM runs, reuses the entire Java ecosystem via interop, and powers production systems at Walmart (inventory), Cisco, Atlassian, and most of the Clojure-only consultancies; ClojureScript targets JS and runs apps like Groupon and CircleCI.",
    "Reach for Clojure when you want Lisp semantics with JVM performance, when data-transform pipelines (EDN, transit, JSON) are the core of your system, or when you value the REPL-driven workflow where you grow a running system incrementally.",
    "Avoid Clojure when startup time matters (the JVM cold-start), when teams want static types (Clojure's `core.typed` is research-grade, `clojure.spec` is design-by-contract not static typing), or when stack traces that point to compiled Java internals would alienate the team.",
  ],

  mentalModel: {
    title: "Values, identities, and time",
    body: "Clojure separates value (an immutable snapshot of data — a number, a persistent vector, a map) from identity (a stable reference whose value can change over time). Four reference types model how change happens: `def`/Var is mutable top-level binding (per-thread), `atom` is synchronous uncoordinated, `ref` is synchronous coordinated (STM, multi-ref transactions via `dosync`), `agent` is asynchronous. Most code uses pure functions over immutable values; only the edges of your system touch references. Data is `[]`, `{}`, `#{}`, `()` — persistent collections with structural sharing, so 'modifying' a 10M-element vector is O(log32 n) and allocates almost nothing. This is the design center Rich Hickey calls 'oriented around values': programs become a series of `(->> data transform transform transform)`.",
  },

  constructs: [
    { syntax: "(def x 1)", behavior: "Define a Var (top-level mutable binding in the current namespace).", when: "Top-level definitions; inside functions use `let`." },
    { syntax: "(let [x 1 y 2] (+ x y))", behavior: "Lexical binding form; pairs in a vector.", when: "Every function body — local scope." },
    { syntax: "(defn f [x y] ...)", behavior: "Define a function with a parameter vector; supports multi-arity and docstrings.", when: "Named functions; one per logical concept." },
    { syntax: "(fn [x] (* x x))  ; or #(* % %)", behavior: "Anonymous function; `#(...)` is reader sugar, `%` is the first arg.", when: "Callbacks, higher-order pipelines." },
    { syntax: "{:name \"a\" :age 30}", behavior: "Map literal — keywords (`:name`) are interned, fast-equality, idiomatically used as keys.", when: "All structured data; keywords are the primary 'type tag'." },
    { syntax: "(:name m)  ; (get m :name)", behavior: "Keyword as function — looks itself up in a map. Maps are also callable on keys.", when: "Field access; idiomatic over `get` for keyword keys." },
    { syntax: "(->> xs (map f) (filter p) (into []))", behavior: "Thread-last macro — pipelines the result as the LAST arg of each step.", when: "Data transforms; the central Clojure idiom." },
    { syntax: "(-> x (f a) (g b))", behavior: "Thread-first macro — pipelines as the FIRST arg. Used for Java interop chains.", when: "Object-oriented-style chains; less common than thread-last." },
    { syntax: "(doseq [x xs] (println x))", behavior: "Side-effect loop over a collection; returns nil.", when: "Performing effects; pure maps/filters return values." },
    { syntax: "(atom 0)  (swap! a inc)", behavior: "Atom — synchronous, independent mutable reference; `swap!` applies a function atomically (CAS).", when: "Single-value mutable state (caches, counters). The workhorse reference type." },
    { syntax: "(dosync (alter r inc) (alter r2 dec))", behavior: "STM transaction over Refs — atomic, isolated, retryable.", when: "Coordinated multi-reference updates — rare in practice." },
    { syntax: "(require '[clojure.data.json :as json])", behavior: "Namespace require with alias; uses `:as` or `:refer [names]`.", when: "Every file that uses another namespace's vars." },
  ],

  patterns: [
    {
      lang: "clojure",
      caption: "Thread-last pipeline — the Clojure idiom",
      code: `(ns sales.core
  (:require [clojure.string :as str]
            [clojure.set :as set]))

(defn top-customers
  "Return the top N customers by paid-order total."
  [orders n]
  (->> orders
       (filter #(= :paid (:status %)))
       (group-by :customer-id)
       (map (fn [[id ords]]
              {:id id :total (reduce + (map :amount ords))}))
       (sort-by :total)
       reverse
       (take n)
       vec))

;; Reads as a recipe: take orders, filter, group, project, sort, take.`,
    },
    {
      lang: "clojure",
      caption: "Atom — the synchronous mutable state workhorse",
      code: `(defn memoize-safe [f]
  (let [cache (atom {})]
    (fn [& args]
      ;; swap! is atomic CAS -- multiple threads cannot clobber each other.
      ;; Returns the value at the cache slot; nil means miss.
      (if-let [v (find @cache args)]
        (val v)
        (let [nv (apply f args)]
          (swap! cache assoc args nv)
          nv)))))

;; @cache is sugar for (deref cache) -- reads the current value.
;; Atoms are the right default for any mutable cell. Refs are for
;; coordinated multi-cell transactions; agents for async fire-and-forget.`,
    },
    {
      lang: "clojure",
      caption: "Java interop — calling Java from Clojure",
      code: `(import '[java.time Instant Duration])

(defn ago
  "Return an ISO-8601 string for n seconds ago."
  [n]
  (let [now (Instant/now)                       ; static method: / (or .)
        then (.minusSeconds now n)]             ; instance method: .method
    (.toString then)))

;; Field access:  (.-field obj)  or  (. obj -field)
;; Constructor:   (Duration/ofSeconds 60)       ; static method
;;                (java.util.ArrayList. 100)    ; constructor: ClassName.

;; Type hints avoid reflection for hot paths:
(defn parse-long-fast ^long [^CharSequence s]
  (Long/parseLong s))`,
    },
    {
      lang: "clojure",
      caption: "spec — design-by-contract, not static types",
      code: `(require '[clojure.spec.alpha :as s])

(s/def ::email (s/and string? #(re-find #"@" %)))
(s/def ::age (s/and int? #(<= 0 % 150)))
(s/def ::user (s/keys :req [::email ::age]))

(defn make-user [{:keys [email age]}]
  (if (s/valid? ::user {::email email ::age age})
    {::email email ::age age ::id (java.util.UUID/randomUUID)}
    (throw (ex-info "invalid user" (s/explain-data ::user
                          {::email email ::age age})))))

;; spec is runtime + generative: test.check generates random valid users
;; to property-test functions. It's NOT a static type system — values
;; are checked when you ask, not at compile time.`,
    },
  ],

  pitfalls: [
    {
      title: "Lazy sequences realized outside their scope",
      symptom: "A function returns a lazy `(map f xs)`; the caller doesn't realize it; the caller's caller does — and the work happens in a different dynamic scope, breaking `binding`, agents, or DB transactions.",
      fix: "Add `(doall ...)` at boundaries where laziness must end. Use `vec` or `into []` to force a vector. Don't return lazy sequences from public APIs unless documented.",
    },
    {
      title: "Transducers vs sequences — different semantics",
      symptom: "`(sequence (comp (map f) (filter p)) xs)` and `(into [] (comp (map f) (filter p)) xs)` look similar but `sequence` is still lazy and can defer side effects; `into` forces immediately. Side effects in transducers may fire 0 or N times.",
      fix: "Use `into` or `transduce` when you want a strict result. Use `eduction` for explicit lazy transducer application. Never put side effects (logging, IO) inside a transducer — wrap the result instead.",
    },
    {
      title: "`def` inside a function — shared mutable state by accident",
      symptom: "Writing `(defn f [x] (def y (* x 2)) ...)` defines `y` as a global Var on first call — subsequent calls rebind the same Var, race conditions across threads ensue.",
      fix: "Use `(let [y (* x 2)] ...)` for local scope. `def` is top-level only; some linters (eastwood, kibit) flag this. Beginners do this constantly.",
    },
    {
      title: "Keywords vs strings as map keys",
      symptom: "JSON round-trips turn keyword keys into strings — `(:foo m)` returns nil after `parse-string`, even though `(get m \"foo\")` works. Silent failure.",
      fix: "Use `clojure.walk/keywordize-keys` after JSON parse, or be explicit with string keys. Establish a project convention: keywords internally, strings at JSON boundaries.",
    },
    {
      title: "`=` on numbers, NaN, and big integers",
      symptom: "`(= 0.0 0)` is true in Clojure (numeric equality), but `NaN` is not equal to itself. `(= 1N 1)` is true (BigInt vs Long). Records are `=` to maps with the same keys — surprises Java interop code.",
      fix: "Use `==` for strict numeric equality (treats 1, 1.0, 1N as equal; NaN still NaN). Use `identical?` for reference identity. Document when records should be map-like vs type-like.",
    },
    {
      title: "Tail-call recursion — JVM doesn't have it",
      symptom: "Writing a tail-recursive `(defn f [n] (if (zero? n) :done (f (dec n))))` blows the stack at large n — the JVM doesn't optimize tail calls.",
      fix: "Use `recur` for explicit tail recursion (Clojure's compile-time-checked tail-call): `(defn f [n] (if (zero? n) :done (recur (dec n))))`. For mutual recursion, use `trampoline`.",
    },
    {
      title: "Dynamic binding (`binding`) leaks across threads",
      symptom: "`(binding [*out* (io/writer f)] (future (println \\\"hi\\\")))` — the future runs on a different thread; `*out*` is the original, not the bound one. The println goes to the console, not the file.",
      fix: "Use `binding` only for synchronous code on the same thread. For async work, explicitly pass the value as an argument. `with-redefs` is for tests only — it's globally visible and racy.",
    },
  ],

  quickReference: [
    { fact: "Clojure 1.11 / 1.12 (2024) target JVM 8+; ClojureScript targets ES5+; ClojureCLR targets .NET. All three share the language but not the runtime.", tag: "version" },
    { fact: "JVM startup is ~1-3s — fine for servers, painful for CLI tools. Babashka (native-image Clojure interpreter) starts in 10-20ms for scripts.", tag: "perf" },
    { fact: "Persistent collections use HAMT (hash array mapped tries) — O(log32 n) ≈ near-O(1) for practical sizes. `conj` on a 1M-element vector is ~5 hash comparisons.", tag: "complexity" },
    { fact: "Structural sharing: `(conj v x)` allocates ~6 nodes, not a new vector. Memory usage of N derived sequences is O(N * log32 size), not O(N * size).", tag: "perf" },
    { fact: "STM (Refs + dosync) is optimistic — transactions execute, then retry on conflict. Best for read-heavy coordinated state; rare in modern code.", tag: "complexity" },
    { fact: "`atom` + `swap!` uses CAS — no locks, scales linearly with contention-free reads. Bottlenecks at ~10^7 swaps/sec on contended atoms.", tag: "perf" },
    { fact: "core.async provides CSP-style channels (Go-style); not built into the language, but a stdlib-grade library.", tag: "version" },
    { fact: "spec.alpha is the design-by-contract layer — runtime validation + generative testing via test.check. NOT a static type system.", tag: "version" },
    { fact: "Destructuring: `{:keys [a b] :or {b 10} :as m}` in `let` / `defn` arglists. `:strs [a b]` for string-keyed maps, `:syms [a b]` for symbol keys.", tag: "gotcha" },
    { fact: "Reader conditionals (`#?`) enable cross-platform code — `#?(:clj jvm-code :cljs js-code)` — only one branch is read per platform.", tag: "version" },
    { fact: "`clojure.core/reduce` is faster than `(apply f xs)` for large sequences — no intermediate list materialization.", tag: "perf" },
    { fact: "Reflection warnings: enable `*warn-on-reflection*` or set `:global-vars {*warn-on-reflection* true}` in project.clj — untyped interop generates slow reflective calls otherwise.", tag: "gotcha" },
    { fact: "Naming: kebab-case (`my-fn`), keywords kebab-case-with-colon (`:customer-id`), namespaces dotted (`my.app.core`).", tag: "style" },
    { fact: "Tools: `clj` / `deps.edn` (CLI) vs Leiningen (`project.clj`) — both supported; deps.edn is the modern default for new projects since 2018.", tag: "style" },
    { fact: "nREPL + CIDER (Emacs) / Calva (VS Code) / Cursive (IntelliJ) are the standard IDE stacks; the REPL-driven workflow is the language's killer feature.", tag: "style" },
  ],

  goDeeper: [
    { title: "Clojure Documentation — clojure.org", url: "https://clojure.org/", note: "Official reference + the rationale essays ('Values and Change', 'State and Identity') that explain the design." },
    { title: "ClojureDocs Community Reference", url: "https://clojuredocs.org/", note: "Examples for every core function, community-curated; the fastest lookup while coding." },
    { title: "Clojure for the Brave and True (Daniel Higginbotham)", url: "https://www.braveclojure.com/clojure-for-the-brave-and-true/", note: "Free online intro book; covers the language, then a real project (web app). Best onboarding path." },
    { title: "Programming Clojure (Alex Miller et al.)", url: "https://pragprog.com/titles/shcloj3/", note: "The Pragmatic Programmers guide; covers core, reducers, transducers, spec — the closest to a definitive user manual." },
    { title: "Rich Hickey Talks (InfoQ archive)", url: "https://github.com/tallesl/Rich-Hickey-fanclub", note: "Transcripts and links to 'Simple Made Easy', 'Are We There Yet', 'The Value of Values' — required viewing for the design philosophy." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "Long (int64)", behavior: "64-bit signed integer — auto-promoted from int when overflow. Most numerics are Long.", when: "All integer math. For arbitrary precision use clojure.core/bigint or BigInteger." },
      { syntax: "Double (float64)", behavior: "IEEE 754 double — 3.14, 1e10. Single-precision via Float syntax rarely used.", when: "Math. For exact decimal use Decimal (BigDecimal via java.math)." },
      { syntax: "BigDecimal / clojure.core/bigdec", behavior: "Arbitrary-precision decimal — 1.0M. No float rounding.", when: "Money, financial calculations. Slower than Double but exact." },
      { syntax: "Ratio / clojure.core/ratio", behavior: "Exact fraction — 1/2 + 1/3 = 5/6. No float rounding.", when: "Math requiring exactness. Auto-promoted to Double if mixed." },
      { syntax: "Boolean", behavior: "true / false — java.lang.Boolean under the hood. nil and false are falsy; everything else is truthy.", when: "Logic. 0 and [] are TRUTHY in Clojure (unlike Python)." },
      { syntax: "nil", behavior: "Java null wrapped — the absence of value. Falsy. nil? predicate tests for it.", when: "Optional/absent. (if x ...) treats nil as false." },
      { syntax: "Char", behavior: "Single Unicode character — \\a, \\newline, \\u03c0. java.lang.Character under the hood.", when: "Text manipulation. Rare in Clojure; prefer strings." },
      { syntax: "Keyword (:foo)", behavior: "Interned symbol — fast equality (pointer compare), idiomatically used as map keys.", when: "Field names, enum-like values, dispatch. (:foo m) looks itself up in m." },
      { syntax: "Symbol ('foo)", behavior: "Identifier — evaluates to the var it names. Quote to use as data: 'foo.", when: "Code-as-data, macros, metaprogramming. Rare as values in runtime data." },
      { syntax: "String", behavior: "java.lang.String — immutable UTF-16. \"hello\".", when: "All text. Prefer to char arrays; use char-seq for big data." },
    ],
    collections: [
      { syntax: "[]  (vector)", behavior: "Indexed, persistent (immutable + structural sharing). O(log32 n) random access.", when: "Ordered sequences where index access matters. The default list-like." },
      { syntax: "()  (list)", behavior: "Singly-linked — O(1) cons (prepend), O(n) index. Persistent.", when: "Recursive code-as-data, macro args. Rare as runtime data structure." },
      { syntax: "{}  (map)", behavior: "Persistent hash map — O(log32 n) lookup/insert. Keys can be any value.", when: "Keyed data, JSON shapes. Keywords as keys idiomatic." },
      { syntax: "#{}  (set)", behavior: "Persistent hash set — O(log32 n) membership/insert/delete.", when: "Dedup, set algebra (union/intersection/difference via clojure.set)." },
      { syntax: "^:const metadata", behavior: "Metadata — attached to collections, not part of their value. ^:static ^:dynamic ^{:doc 'foo'}.", when: "Type hints, docstrings, hints to the compiler. Doesn't affect =." },
      { syntax: "transient  (mutable variant)", behavior: "Mutable in-place version of a persistent collection — for hot loops building large collections. persistent! to convert back.", when: "Performance — building a 1M-element vector via transient is O(n) vs O(n log32 n) for immutable conj." },
      { syntax: "Record  (defrecord)", behavior: "Named map-like type — fields are typed, has __tag. Faster than plain maps for fixed shapes.", when: "Domain objects, when you want type-based dispatch. Implements ILookup, so behaves like a map." },
      { syntax: "atom / ref / agent", behavior: "Reference types wrapping a value: atom (sync independent), ref (sync coordinated via STM), agent (async).", when: "Mutable state. atom is the workhorse; ref for transactions; agent for fire-and-forget." },
      { syntax: "lazy-seq", behavior: "Lazy sequence — produces elements on demand via a thunk. Used internally by map, filter, etc.", when: "Infinite sequences, generators, lazy I/O. Force with doall / dorun." },
    ],
    custom: [
      { syntax: "defn / defn-", behavior: "Define a function (public / private). Multi-arity, docstrings, destructuring in arglist.", when: "All named functions. The most common form in Clojure code." },
      { syntax: "defmacro", behavior: "Define a macro — receives unevaluated forms, returns forms. Code-as-data.", when: "DSLs, control-flow abstractions, performance annotations." },
      { syntax: "defrecord", behavior: "Define a record type — named, typed map-like. Positional + map constructors.", when: "Domain objects with type-based dispatch. Faster than plain maps." },
      { syntax: "deftype", behavior: "Lower-level than defrecord — bare type with fields, you implement interfaces. Faster, less ergonomic.", when: "Performance-critical types, custom collection implementations." },
      { syntax: "defmulti / defmethod", behavior: "Multimethod — dispatch on a function of the args, not just the receiver. Ad-hoc polymorphism.", when: "When dispatch logic doesn't fit a type hierarchy (e.g., dispatch on a value)." },
      { syntax: "defprotocol", behavior: "Protocol — interface (set of methods) that records/types can extend. Like Haskell typeclasses.", when: "Polymorphism across types. clojure.core/IReduce, ILookup are built-in protocols." },
      { syntax: "definterface", behavior: "Java-style interface — for high-perf polymorphism. Lower-level than defprotocol.", when: "Hot paths where protocol dispatch overhead matters." },
      { syntax: "ns / defprotocol / defrecord", behavior: "Module structure — ns is namespace declaration, organizes vars and imports.", when: "Every file starts with (ns my.ns ...)." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "+, -, *, /", behavior: "Arithmetic — auto-promote on overflow (int -> Long -> BigInt). / returns Ratio if exact.", when: "Math. For float division use (double (/ 1 3)) or (/ 1.0 3)." },
    { syntax: "quot, rem, mod", behavior: "Integer division (truncating), remainder, modulo. mod result has sign of divisor.", when: "Integer math. (mod -1 7) = 6, (rem -1 7) = -1." },
    { syntax: "=, not=", behavior: "Deep structural equality — recurses through collections. (= {:a 1} {:a 1}) is true.", when: "Most equality. (= 1 1.0) is FALSE (different types); use == for numeric equality." },
    { syntax: "==", behavior: "Numeric equality — promotes types: (== 1 1.0 1N) is true. NaN != NaN.", when: "When you want numeric coercion: 1N, 1, 1.0 all equal." },
    { syntax: "identical?", behavior: "Reference identity — same object in memory. Faster than = but rarely what you want.", when: "Performance-critical identity checks (interned keywords, symbols)." },
    { syntax: "<, >, <=, >=", behavior: "Comparison via java.lang.Comparable. Works across numeric types.", when: "Sorting, ordering. Strings compared lexicographically." },
    { syntax: "and, or, not", behavior: "Boolean — and/or return the first determining value (short-circuit). not always returns Boolean.", when: "Logic. (or x default) for defaults; (and x y) short-circuits on falsy." },
    { syntax: "inc, dec", behavior: "Add/subtract 1 — common enough to have own functions.", when: "Loop counters, recursion. More idiomatic than (+ x 1)." },
    { syntax: "->, ->>", behavior: "Thread-first / thread-last macro — pipelines value as first/last arg of each form.", when: "All data transforms. ->> is the central Clojure idiom for pipelines." },
    { syntax: "some->, some->>", behavior: "Thread with nil-short-circuit — stops if intermediate result is nil.", when: "Optional pipelines where any step might return nil." },
    { syntax: "comp, complement, partial", behavior: "Function combinators — composition, negation, partial application.", when: "Point-free style. (comp f g) = f(g(x)); (complement pred) = not pred; (partial f a) = f(a, ...)." },
    { syntax: "apply, reduce", behavior: "apply splats a list as args; reduce folds.", when: "Variadic dispatch: (apply max xs). reduce is the universal fold." },
    { syntax: "::  (namespaced keyword)", behavior: "Namespaced keyword — ::foo in current ns, ::bar/foo fully qualified.", when: "Avoiding key collisions across modules. Spec, Datomic, Component all use this." },
    { syntax: "^:hint ^Long  (metadata)", behavior: "Attach metadata to symbols/collections — ^Long for type hints, ^:private, ^:dynamic.", when: "Performance (type hints avoid reflection), documentation, scoping." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "clojure",
      caption: "stdout / stderr / println",
      code: `(println "hello" "world")              ; stdout with space sep + newline
(println {:a 1 :b 2})                ; pretty-prints maps
(prn {:a 1})                         ; raw form, not pretty
(print "no newline")

(binding [*out* *err*]
  (println "warning: bad input"))    ; to stderr

(printf "count=%d  rate=%.3f\\n" 42 3.14)   ; Java printf via varargs

; Read a line from stdin:
(def line (.readLine *in*))
; or via clojure.core/read-line (works in -main context)

; For REPL-friendly output, use clojure.pprint:
(clojure.pprint/pprint (range 20))   ; pretty, line-wrapped`,
    },
    {
      lang: "clojure",
      caption: "File I/O with slurp / spit + with-open",
      code: `; slurp = read entire file as String (small files only):
(def content (slurp "input.txt"))

; spit = write String to file (overwrites):
(spit "output.txt" "content\\n")
(spit "log.txt" "more\\n" :append true)   ; append mode

; Stream line by line (lazy seq + with-open for resource safety):
(with-open [rdr (clojure.java.io/reader "large.csv")]
  (doall                            ; force the lazy seq INSIDE with-open
    (for [line (line-seq rdr)
          :let [fields (clojure.string/split line #",")]
          :when (not (clojure.string/starts-with? line "#"))]
      (process fields))))

; Binary:
(with-open [in (clojure.java.io/input-stream "data.bin")
            out (clojure.java.io/output-stream "copy.bin")]
  (clojure.java.io/copy in out))

; The 'with-open' macro ensures close even on exception — Java's try-with-resources.`,
    },
    {
      lang: "clojure",
      caption: "JSON via cheshire (jsonista for perf)",
      code: `(require '[cheshire.core :as json])

; Encode (returns String):
(json/encode {:name "ada" :age 42 :tags ["a" "b"]})

; Pretty-printed:
(json/encode {:name "ada"} {:pretty true})

; Decode (returns map with string keys by default):
(json/decode "{\\"name\\":\\"ada\\"}")
; => {"name" "ada"}

; Decode with keyword keys:
(json/decode "{\\"name\\":\\"ada\\"}" true)
; => {:name "ada"}

; Stream parsing for huge JSON:
(with-open [r (clojure.java.io/reader "huge.json")]
  (doall
    (for [obj (json/parsed-seq r)]
      (process obj))))

; jsonista is ~3x faster than cheshire via Jackson — use for hot paths.
; Both produce the same API.`,
    },
    {
      lang: "clojure",
      caption: "HTTP via clj-http or http-kit",
      code: `(require '[clj-http.client :as http])

; Simple GET:
(let [resp (http/get "https://api.example.com/users")]
  (println (:status resp))      ; 200
  (println (:body resp))        ; string, or parsed if :as :json
  (println (:headers resp)))    ; map

; POST with JSON body:
(let [resp (http/post "https://api.example.com/users"
            {:body (json/encode {:name "ada"})
             :headers {"Content-Type" "application/json"}
             :as :json                  ; auto-decode response
             :throw-exceptions false    ; don't raise on 4xx/5xx
             :socket-timeout 5000
             :conn-timeout 5000})]
  (when (= 200 (:status resp))
    (process (:body resp))))

; http-kit for async / WebSocket:
(require '[org.httpkit.client :as http])
(let [resp @(http/get "https://example.com")]   ; returns a promise
  (:body resp))

; For new code, hato / http-kit are modern choices. clj-http is mature.`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "clojure",
      caption: "map / filter / reduce + threading macros",
      code: `; Functional transforms — return lazy seqs (or use mapv for vectors).
(map inc [1 2 3])                 ; (2 3 4)
(filter even? (range 10))         ; (0 2 4 6 8)
(reduce + (range 101))            ; 5050

; Thread-last pipeline:
(->> (range 100)
     (filter even?)
     (map #(* % 2))
     (take 10)
     (into []))
; [0 4 8 12 16 20 24 28 32 36]

; Thread-first (less common, used for Java interop chains):
(-> "hello"
    String/.toUpperCase
    (.substring 1)
    (.concat "!"))
; "ELLO!"

; doseq for side effects (returns nil):
(doseq [x [1 2 3]]
  (println x))`,
    },
    {
      lang: "clojure",
      caption: "for — list comprehension (NOT a loop!)",
      code: `; Clojure's 'for' is a LIST COMPREHENSION, not a for-loop.
; Returns a lazy seq.
(for [x [1 2 3] y [:a :b]]
  [x y])
; ([1 :a] [1 :b] [2 :a] [2 :b] [3 :a] [3 :b])

; With guards (:when) and let bindings (:let):
(for [x (range 10)
      :let [y (* x x)]
      :when (< y 30)]
  [x y])
; ([0 0] [1 1] [2 4] [3 9] [4 16] [5 25])

; :while stops at first false:
(for [x [1 2 3 4]
      :while (< x 4)]
  x)
; (1 2 3)

; For side-effect loops, use doseq (returns nil).
; for is for building collections.`,
    },
    {
      lang: "clojure",
      caption: "loop / recur — explicit tail recursion",
      code: `; loop is recur's target. recur is the only way to do TCO in Clojure
; (JVM doesn't support TCO, so Clojure enforces explicit recur).

(loop [i 0
       acc 0]
  (if (>= i 10)
    acc                              ; return value
    (recur (inc i) (+ acc i))))      ; tail-recursive call
; 45

; Equivalent to (reduce + (range 10)) but with explicit accumulator.

; recur MUST be in tail position — compiler errors if not.
; For mutual recursion, use trampoline (wraps fns that return fns).

; defn + recur:
(defn factorial [n]
  (loop [i n acc 1]
    (if (zero? i) acc (recur (dec i) (* acc i)))))`,
    },
    {
      lang: "clojure",
      caption: "Lazy sequences + doall/dorun",
      code: `; map/filter/for return LAZY seqs — work only when consumed.
(def result (map process (range 1000000)))
; Nothing has run yet!

; Force evaluation:
(doall result)        ; returns the full realized seq
(dorun result)        ; returns nil, but runs all side effects

; Realize inside a with-open block (resource-safety gotcha):
(with-open [rdr (reader "huge.txt")]
  (doall                              ; MUST force inside the with-open!
    (map process (line-seq rdr))))

; Common bug: returning a lazy seq from a with-open block — the file
; is closed when the seq tries to read. Always doall before returning.

; Build your own lazy seq with lazy-seq:
(defn naturals [n]
  (lazy-seq
    (cons n (naturals (inc n)))))
(take 5 (naturals 1))   ; (1 2 3 4 5)`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "clojure",
      caption: "defn + multi-arity + destructuring",
      code: `; Multi-arity — different argument counts dispatch to different bodies:
(defn greet
  ([] (greet "world"))
  ([name] (str "Hello, " name "!")))

(greet)         ; "Hello, world!"
(greet "Ada")   ; "Hello, Ada!"

; Destructuring in arglist:
(defn process-user [{:keys [name age] :or {age 0} :as user}]
  (str name " is " age " (" (count user) " fields)"))

(process-user {:name "ada" :age 42 :email "a@b.io"})
; "ada is 42 (3 fields)"

; Vector destructuring:
(defn point [[x y _ w]] [x y w])
(point [1 2 3 4])   ; [1 2 4]

; Variadic with &:
(defn sum-all [x & rest] (apply + x rest))
(sum-all 1 2 3 4)   ; 10`,
    },
    {
      lang: "clojure",
      caption: "Anonymous functions: fn vs #() reader macro",
      code: `; Long form (fn ...):
(def add (fn [a b] (+ a b)))
; or named (for stack traces):
(def add (fn add [a b] (+ a b)))

; Short form #() — % is first arg, %2 second, %& rest:
(def double #(* 2 %))
(double 5)         ; 10

(def add3 #(+ %1 %2 %3))
(add3 1 2 3)       ; 6

(def f #(apply + %&))   ; variadic
(f 1 2 3)          ; 6

; Short form is fine for short bodies; switch to (fn) for multi-line
; or when % is ambiguous. Don't nest #() (the % is confusing).`,
    },
    {
      lang: "clojure",
      caption: "Higher-order: comp, partial, complement, memoize",
      code: `; comp — composition (right-to-left):
(def shout (comp clojure.string/upper-case #(str % "!")))
(shout "hi")   ; "HI!"

; partial — fix leading args:
(def add5 (partial + 5))
(add5 3)       ; 8

; complement — logical NOT of a predicate:
(def non-empty? (complement empty?))
(non-empty? [1])   ; true

; memoize — cache results (single-arg keys):
(def slow-fib (memoize (fn [n] (if (< n 2) n (+ (slow-fib (dec n)) (slow-fib (- n 2)))))))
(slow-fib 100)   ; fast — cached

; juxt — apply multiple fns to one arg, return vector of results:
((juxt :first :last) {:first "ada" :last "lovelace"})   ; ["ada" "lovelace"]

; iterate — infinite lazy seq:
(take 5 (iterate inc 0))   ; (0 1 2 3 4)`,
    },
    {
      lang: "clojure",
      caption: "Macros — code that writes code",
      code: `; Macros receive unevaluated forms and return forms.
; The classic unless:
(defmacro unless [cond & body]
  \`(if (not ~cond) (do ~@body)))

(unless false (println "runs"))   ; prints "runs"
(unless true (println "skipped")) ; nothing

; Backtick (syntax-quote): like quote but ~ unquotes.
;   ~ is unquote (one form)
;   ~@ is unquote-splicing (inlines a list)

; defn is itself a macro:
(macroexpand '(defn f [x] x))
; => (def f (clojure.core/fn ([x] x)))

; Hygiene: use gensym or # suffix for local names to avoid capture:
(defmacro swap! [a b]
  (let [tmp (gensym "tmp")]
    \`(let [~tmp ~a] (set! ~a ~b) (set! ~b ~tmp))))

; Use macros sparingly — functions are simpler and easier to test.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "clojure",
      caption: "try / catch / finally + ex-info",
      code: `; try/catch catches Java exceptions and Clojure ex-info:
(try
  (do-something-risky)
  (catch java.io.IOException e
    (println "io error:" (.getMessage e))
    :io-error)
  (catch clojure.lang.ExceptionInfo e
    ;; ex-info: structured exception with data
    (println "ex-info:" (ex-data e))      ; the data map
    (println "msg:" (ex-message e))
    :app-error)
  (catch Exception e
    (println "unexpected:" e)
    (throw e))                              ; re-throw
  (finally
    (cleanup)))                              ; always runs

; Throw with structured data:
(throw (ex-info "user not found"
                {:user-id id :code 404}
                cause-exception))           ; optional cause

; ex-info creates clojure.lang.ExceptionInfo. Ex-data, ex-message, ex-cause
; access the structured fields.`,
    },
    {
      lang: "clojure",
      caption: "Either / nil-pun — error-as-value patterns",
      code: `; Clojure doesn't have a built-in Result type, but two patterns dominate:

; 1. nil-pun — return nil on failure; thread through with some->:
(defn find-user [id]
  (when-let [row (db/find-by-id id)]
    (parse-user row)))

(-> id find-user :name)   ; nil if any step returned nil

; 2. Tagged tuple — {:ok value} / {:error msg}:
(defn safe-parse [s]
  (try
    {:ok (edn/read-string s)}
    (catch Exception e
      {:error (.getMessage e)})))

; Or use the failjure library for :ok/:fail tagged values:
; (let [result (try-fn ...)]
;   (if (ok? result) ... ...))

; Convention: nil for 'not found', ex-info for 'something went wrong'.
; Be consistent within a codebase.`,
    },
    {
      lang: "clojure",
      caption: "with-open + slingshot for resource safety",
      code: `; with-open is Clojure's try-with-resources — closes at end of scope.
(with-open [r (reader "in.txt")
            w (writer "out.txt")]
  (doseq [line (line-seq r)]
    (.write w (process line))))
; r and w are guaranteed closed even on exception.

; slingshot library — richer pattern matching on exceptions:
(require '[slingshot.slingshot :refer [try+ throw+]])

(try+
  (do-risky-work)
  (catch [:type :business] {:keys [reason code]}
    (println "business error:" reason))
  (catch java.io.IOException e
    (println "io:" e))
  (catch Object e
    (println "other:" e)))

; throw+ lets you throw arbitrary maps + context.
; Built-in try/catch is fine for most code; slingshot for richer dispatch.`,
    },
    {
      lang: "clojure",
      caption: "Spec validation — guard at boundaries",
      code: `(require '[clojure.spec.alpha :as s])

(s/def ::email (s/and string? #(re-find #"@" %)))
(s/def ::age (s/and int? #(<= 0 % 150)))
(s/def ::user (s/keys :req [::email ::age]))

(defn make-user [input]
  (if (s/valid? ::user input)
    (assoc input ::id (java.util.UUID/randomUUID))
    (throw (ex-info "invalid user"
                    (s/explain-data ::user input)))))

; spec.explain returns human-readable error info.
; instrumentation via (clojure.spec.test.alpha/instrument) catches bad calls
; in dev/test.

; Conventions:
;   * spec at module boundaries (API, JSON, config)
;   * pure functions validate inputs explicitly
;   * internal code trusts callers (don't over-validate)`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "clojure",
      caption: "atom — synchronous independent state",
      code: `; atom = single-value mutable cell, updated atomically via CAS.
(def counter (atom 0))

; Read: deref or @
@counter            ; 0
(deref counter)     ; 0

; Update: swap! applies a function atomically (retries on contention):
(swap! counter inc)               ; 1
(swap! counter + 5)               ; 6
(swap! counter (fn [x] (* x 2)))  ; 12

; reset! overwrites unconditionally:
(reset! counter 0)

; compare-and-set! for explicit CAS:
(compare-and-set! counter 0 100)  ; true if was 0, now 100

; Atoms are the workhorse — for any mutable cell that doesn't need
; coordination with other cells. Lock-free, scales linearly with
; read-heavy access.`,
    },
    {
      lang: "clojure",
      caption: "refs + dosync — STM for coordinated updates",
      code: `; ref = coordinated mutable cell, only mutable inside a transaction.
(def balance-a (ref 100))
(def balance-b (ref 0))

; dosync wraps a transaction. All refs touched are coordinated:
(dosync
  (alter balance-a - 30)
  (alter balance-b + 30))

; Rules:
;   * Refs only change inside dosync
;   * Transactions are atomic + isolated
;   * On conflict (another txn changed a ref you read), retry
;   * No side effects in dosync (might run multiple times!)

; commute: weaker than alter — re-applies on retry, no conflict.
(dosync
  (commute total-hits inc))   ; OK to retry, idempotent

; ref-set: unconditional set inside transaction.
; io! macro inside dosync raises (prevents side effects).`,
    },
    {
      lang: "clojure",
      caption: "agents — async fire-and-forget",
      code: `; agent = async mutable cell. send/offload work to a thread pool.
(def logger (agent []))

; send queues a function to run on the agent's thread:
(send logger conj :event-1)   ; async, returns immediately
(send logger conj :event-2)
@logger                       ; might be [], [:event-1], or [:event-1 :event-2]

; send-off for blocking I/O (uses unbounded pool, vs send's bounded pool).
; await to block until all sends to specific agents complete:
(await logger)
@logger                       ; [:event-1 :event-2]

; Error handling: agent's error-mode is :continue (default) or :fail.
; On error, the agent stops processing; check agent-error before sending.

(set-error-mode! logger :fail)
(when (agent-error logger)
  (restart-agent logger [] :clear-actions true))

; Use agents for: logging, async writes, side-effect pipelines.`,
    },
    {
      lang: "clojure",
      caption: "core.async — CSP-style channels (Go-style)",
      code: `(require '[clojure.core.async :as a :refer [chan >!! <!! go alts!!]])

; Create a channel (buffered):
(def ch (chan 10))

; >!! / <!! are blocking puts/takes (outside go blocks):
(>!! ch :hello)
(<!! ch)            ; :hello

; Inside (go ...), use >! / <! for non-blocking:
(go
  (loop []
    (when-let [v (<! ch)]
      (println "got" v)
      (recur))))

; alts!! — non-deterministic select on multiple channels:
(let [[v port] (alts!! [ch timeout-ch])]
  ...)

; Pipeline:
(a/pipeline 4                  ; parallelism
            out-ch            ; output channel
            (map process)     ; transducer
            in-ch)            ; input channel

; core.async is excellent for: streaming pipelines, fan-out/fan-in,
; timeouts, backpressure. Not built-in — require it as a dependency.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "clojure",
      caption: "clojure.test — the bundled test framework",
      code: `(ns my-app.test.core
  (:require [clojure.test :refer [deftest is testing are run-all-tests]]
            [my-app.core :as app]))

(deftest add-test
  (is (= 3 (app/add 1 2)) "basic addition")
  (is (thrown? ArithmeticException (app/divide 1 0)))
  (is (nil? (app/find-missing))))

(deftest multi-case
  (testing "various inputs"
    (are [x y] (= x y)
      1     (app/inc 0)
      2     (app/inc 1)
      100   (app/inc 99))))

; Run from REPL:
;   (run-all-tests)          ; all namespaces
;   (clojure.test/run-tests) ; current ns
; Run from CLI:
;   clj -M:test              ; deps.edn alias
;   lein test                ; Leiningen`,
    },
    {
      lang: "clojure",
      caption: "test.check — property-based testing (QuickCheck port)",
      code: `(require '[clojure.test.check.clojure-test :refer [defspec]]
         '[clojure.test.check.generators :as gen]
         '[clojure.test.check.properties :as prop])

(defspec sort-is-idempotent
  100                                     ; 100 random trials
  (prop/for-all [v (gen/vector gen/int)]  ; generate random int vector
    (= (sort v) (sort (sort v)))))         ; property to check

; Custom generators:
(def email-gen
  (gen/fmap (fn [[u d]] (str u "@" d ".com"))
            (gen/tuple (gen/not-empty gen/string-alphanumeric)
                       (gen/not-empty gen/string-alphanumeric))))

; On failure, test.check shrinks to minimal counterexample:
;   "Smallest failing case: [3 1 2]"`,
    },
    {
      lang: "clojure",
      caption: "Mocks via with-redefs + reify",
      code: `; with-redefs temporarily replaces Vars (tests only — racy in prod):
(deftest fetch-test
  (with-redefs [app/http-get (fn [url] {:status 200 :body "mocked"})]
    (is (= "mocked" (app/fetch "http://x")))))

; For interfaces, create mocks via reify:
(defn mock-storage [data]
  (reify app/IStorage
    (read [_ k] (get data k))
    (write [_ k v] (reset! data (assoc @data k v)))))

; For complex mocking, use mocking library 'mock' or 'circleci/mock':
(require '[circleci.mock :as mock])
(mock/with-mock [app/http-get]
  (mock/return {:status 200})
  (app/fetch "http://x")
  (mock/assert-called-with app/http-get "http://x"))

; Prefer with-redefs for simple cases, reify for interface-based code.`,
    },
    {
      lang: "clojure",
      caption: "Kaocha — modern test runner",
      code: `; Kaocha is the modern test runner — fast, extensible, watch mode.
; deps.edn:
;   :test {:extra-paths ["test"]
;          :extra-deps {lambdaisland/kaocha {:mvn/version "1.91.1392"}}
;          :main-opts ["-m" "kaocha.runner"]}

; Run all tests:
;   clj -M:test

; Watch mode (re-run on file change):
;   clj -M:test --watch

; Filter by metadata:
;   clj -M:test --focus :integration

; Coverage via cloverage:
;   clj -M:cloverage --src-ns-path src --test-ns-path test

; CI: deps.edn + kaocha is the modern default. Leiningen still works;
; both share the same clojure.test backend.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Persistent collections use HAMT — O(log32 n) ops. For practical sizes (<1M elements), this is effectively O(1).", tag: "complexity" },
    { fact: "Structural sharing: (conj v x) on a 1M-element vector allocates ~6 nodes, not a new vector. Memory usage of N derived sequences is O(N log32 size).", tag: "perf" },
    { fact: "transient collections — mutable in-place variant. (persistent! (loop building transient)) is O(n) vs O(n log32 n) for plain conj.", tag: "perf" },
    { fact: "Type hints (^Long) avoid reflection — untyped Java interop generates slow reflective calls. Set *warn-on-reflection* true.", tag: "perf" },
    { fact: "JVM startup is 1-3s — fine for servers, painful for CLI. Babashka (native-image Clojure interpreter) starts in 10-20ms.", tag: "perf" },
    { fact: "Reducing over a vector is O(n) and fast; over a lazy seq is O(n) but slower (per-element allocation).", tag: "perf" },
    { fact: "doall realizes a lazy seq eagerly (O(n) memory). dorun runs side effects with O(1) memory.", tag: "gotcha" },
    { fact: "Lazy seqs escape their creating scope — file handles leak. Always doall before returning from with-open.", tag: "gotcha" },
    { fact: "atom + swap! uses CAS — no locks, scales linearly with read-heavy. ~10^7 swaps/sec on contended atoms is the bottleneck.", tag: "perf" },
    { fact: "STM (refs + dosync) is optimistic — retries on conflict. Best for read-heavy; rare in modern code (atom + agents cover most cases).", tag: "complexity" },
    { fact: "defrecord is faster than plain maps for fixed-shape data — typed field access, JVM-optimized equals/hashCode.", tag: "perf" },
    { fact: "defprotocol dispatch is faster than multimethods — Java interface dispatch vs hash lookup.", tag: "perf" },
    { fact: "Profile with Criterium (micro-benchmarks), VisualVM (sampling), or YourKit/JFR (production). clj-async-profiler for flame graphs.", tag: "perf" },
    { fact: "Math operations box/unbox primitives unless hinted. Use ^long / ^double in hot loops or use primitive arrays (areduce).", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Leiningen", purpose: "Classic build tool (project.clj) — mature, large plugin ecosystem. The 'bundler' for Clojure.", url: "https://leiningen.org/", category: "build" },
    { tool: "deps.edn + clj CLI", purpose: "Modern build tool (since 2018) — minimal config, fast, official. Replaces Leiningen for new projects.", url: "https://clojure.org/guides/deps_and_cli", category: "build" },
    { tool: "Babashka", purpose: "Native-image Clojure interpreter — 10-20ms startup, no JVM. For scripts and CLIs.", url: "https://babashka.org/", category: "build" },
    { tool: "Shadow-cljs", purpose: "ClojureScript build tool — hot-reload, code-splitting, JS interop. The default for new cljs apps.", url: "https://shadow-cljs.github.io/", category: "build" },
    { tool: "nREPL + CIDER / Calva / Cursive", purpose: "REPL-driven dev stacks. CIDER (Emacs), Calva (VS Code), Cursive (IntelliJ). The killer workflow.", url: "https://docs.cider.mx/", category: "build" },
    { tool: "clojure.test", purpose: "Bundled test framework — deftest, is, are. No install needed.", url: "https://clojure.github.io/clojure/clojure.test-api.html", category: "test" },
    { tool: "Kaocha", purpose: "Modern test runner — fast, watch mode, extensible. Replaces lein test for new projects.", url: "https://github.com/lambdaisland/kaocha", category: "test" },
    { tool: "test.check", purpose: "Property-based testing — QuickCheck port. Generates random inputs, shrinks counterexamples.", url: "https://github.com/clojure/test.check", category: "test" },
    { tool: "cloverage", purpose: "Code coverage — line + branch. Integrates with clojure.test.", url: "https://github.com/cloverage/cloverage", category: "test" },
    { tool: "Criterium", purpose: "Micro-benchmarking — statistical analysis, handles JVM warmup. The 'btime' for Clojure.", url: "https://github.com/hugoduncan/criterium", category: "test" },
    { tool: "clj-kondo", purpose: "Static analysis linter — fast, finds unused vars, shadowing, common bugs. CI-grade.", url: "https://github.com/clj-kondo/clj-kondo", category: "lint" },
    { tool: "eastwood", purpose: "Classic linter — finds more issues than kondo but slower. Use both.", url: "https://github.com/jonase/eastwood", category: "lint" },
    { tool: "zprint / cljfmt", purpose: "Code formatters — opinionated (zprint) or configurable (cljfmt).", url: "https://github.com/kkinnear/zprint", category: "lint" },
    { tool: "spec.alpha", purpose: "Design-by-contract — runtime validation + generative testing. NOT a static type system.", url: "https://clojure.org/about/spec", category: "lint" },
    { tool: "clojure.spec.test.alpha", purpose: "Spec instrumentation — catches spec violations at function boundaries in dev/test.", url: "https://clojure.org/guides/spec", category: "test" },
    { tool: "Pedestal / Reitit / Compojure", purpose: "Web routers/rings — Pedestal (full-stack), Reitit (fast router), Compojure (classic).", url: "https://github.com/metosin/reitit", category: "build" },
    { tool: "Ring", purpose: "The web server abstraction (like WSGI/Rack). Every Clojure web framework uses Ring handlers.", url: "https://github.com/ring-clojure/ring", category: "build" },
    { tool: "Component / Mount / Integrant", purpose: "Dependency injection / lifecycle — Component (explicit), Mount (global), Integrant (config-driven).", url: "https://github.com/stuartsierra/component", category: "build" },
    { tool: "Datomic", purpose: "Immutable, time-traveling database — designed by Rich Hickey. The 'Clojure-native' DB.", url: "https://www.datomic.com/", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0", year: 2007, highlight: "Rich Hickey releases Clojure — Lisp on the JVM, persistent immutable data structures." },
    { version: "1.2", year: 2010, highlight: "Protocols, records, types — first-class polymorphism abstractions. The 'modern' Clojure shape emerges." },
    { version: "1.3", year: 2011, highlight: "Performance work, *ns* is no longer a var, enhanced primitives. Major speedup." },
    { version: "1.4", year: 2012, highlight: "Reader conditionals groundwork, improved destructuring, EDN becomes the standard data format." },
    { version: "1.5", year: 2012, highlight: "Reducers — parallel collection ops via fold. 'reduce' becomes a first-class citizen." },
    { version: "1.6", year: 2014, highlight: "Java 7+ required, improved map destructuring, EDT improvements." },
    { version: "1.7", year: 2015, highlight: "Transducers — composable algorithmic transformations. Major abstraction for streaming pipelines." },
    { version: "1.8", year: 2016, highlight: "Direct linking, socket server, the 'clj' CLI tool begins (later matures in 1.9)." },
    { version: "1.9", year: 2017, highlight: "clojure.spec.alpha — design-by-contract + generative testing. The biggest addition since transducers." },
    { version: "1.10", year: 2018, highlight: "deps.edn + clj CLI officially recommended over Leiningen for new projects. Java 9+ module compat." },
    { version: "1.10.1+", year: 2019, highlight: "Stability releases, error message improvements, performance work." },
    { version: "1.11", year: 2022, highlight: "Namespace qualification helpers, keyword argument destructuring improvements, Java 17 LTS support." },
    { version: "1.12", year: 2024, highlight: "Interactive form evaluation (REPL 2.0), Java 21 virtual threads interop, perf work." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Explain values vs identities — the core Clojure design philosophy.", a: "A value is immutable data — the number 42, the persistent vector [1 2 3], a string. Two values are equal if their content is. An identity is a stable reference whose value can change over time — atoms, refs, agents, vars. Most code uses pure functions over values; only the system's edges touch identities. This separation lets you reason about most code as pure transforms, with state changes isolated to explicit reference cells. Rich Hickey calls this 'orienting around values'.", difficulty: "medium" },
    { q: "How do persistent data structures work, and why are they 'fast'?", a: "Persistent = immutable + structural sharing. When you (assoc m :k v), Clojure doesn't copy the whole map — it shares most of the internal tree nodes with the original, allocating only the path from root to the changed node (~6 nodes for a HAMT). HAMT (hash array mapped trie) gives O(log32 n) ops, which for practical sizes (<1M elements) is effectively O(1). The cost: each 'modification' allocates a few nodes, so it's slower than in-place mutation — but multiple 'versions' of a structure share most memory, which is impossible with mutable arrays.", difficulty: "medium" },
    { q: "What's the difference between atom, ref, agent, and var?", a: "atom: synchronous independent state — swap! returns the new value immediately, retries on contention. Use for caches, counters, single-value state. ref: synchronous COORDINATED state — dosync wraps transactions across multiple refs; STM handles atomicity + isolation. Use for multi-cell coordination (rare). agent: ASYNCHRONOUS — send queues work to a thread pool; the agent's value updates later. Use for logging, fire-and-forget. var: per-thread dynamic binding — def, defn. Used for dynamic scope (binding [*out* ...]), not for shared mutable state.", difficulty: "medium" },
    { q: "What's a lazy seq and what's the big gotcha?", a: "map, filter, for, etc. return lazy seqs — they don't compute elements until consumed. Great for infinite sequences (take 5 (iterate inc 0)) and for fusion. The big gotcha: lazy seqs hold onto resources (file handles, db connections) used in their construction. If you return a lazy seq from a with-open block, the file is closed when the seq tries to read — runtime error. Fix: doall inside the with-open to force realization before the resource closes. dorun for side-effect-only forcing with O(1) memory.", difficulty: "medium" },
    { q: "Explain transducers — what problem do they solve?", a: "A transducer is a composable transformation that's INDEPENDENT of the input/output context. (map f) is a transducer; (filter p) is a transducer. You compose them: (comp (map f) (filter p)) — and apply to ANY context: (sequence xf data) for lazy seq, (into [] xf data) for vector, (transduce xf + 0 data) for reduction, even core.async channels. The win: the transformation fuses — no intermediate lazy seqs. (map f (filter p xs)) builds two lazy seqs; (sequence (comp (map f) (filter p)) xs) does one pass.", difficulty: "hard" },
    { q: "How does Clojure interop with Java?", a: "Three forms: (1) Constructor: (java.util.ArrayList. 100) — dot after class name. (2) Instance method: (.substring s 0 5) or (.toUpperCase s), or via the syntactic sugar (.. s (toUpperCase) (substring 0 5)). (3) Static method/field: (System/getProperty \\\"java.version\\\") or Math/PI. Field access: (.-field obj). For type hints (perf): ^String, ^Long — avoid reflection. import at top of ns: (ns my.ns (:import [java.time Instant Duration])). All Java exceptions are catchable via try/catch.", difficulty: "easy" },
    { q: "What's the difference between defrecord, deftype, and plain maps?", a: "Plain map: persistent hash map, anonymous, slowest field access (hash lookup). Best for ad-hoc data. defrecord: named type with declared fields, implements IPersistentMap and ILookup — so it behaves like a map (assoc, get, destructuring work) but field access is faster (direct). Use for domain objects. deftype: lower-level — bare fields, must implement interfaces manually. Faster than defrecord but less ergonomic. Use for performance-critical custom collections. Records also support protocols (polymorphism) via defrecord+defprotocol.", difficulty: "medium" },
    { q: "How does Clojure handle macros differently from other Lisps?", a: "Clojure macros use syntax-quote (backtick) which is hygiene-aware: symbols resolve to their namespace, ~ unquotes, ~@ splices. Unlike Common Lisp, you can't easily shadow built-ins because of namespaces. macroexpand shows the expansion. The hygiene isn't fully automatic (capture is possible); convention is to use gensym or # suffix (let [x# ...]) for locals. Macros are typically defined with defmacro and called via reader expansion — code-as-data is fundamental to Clojure. Use macros sparingly — functions are easier to test and reason about.", difficulty: "hard" },
    { q: "How would you design a Clojure web service?", a: "Stack: Reitit (router) + Ring (handler abstraction) + Jetty/HTTP-kit (server) + next.jdbc (DB) + HugSQL or HoneySQL (SQL building) + component/integrant (DI/lifecycle) + Integrant-repl (dev workflow) + muuntaja (format negotiation). Architecture: pure functions for business rules (testable), wrapper Component system for DB/connection lifecycle, spec at API boundaries (validate inputs/outputs). Deploy: uberjar via deps.edn alias, or Docker image. Concurrency: atoms for caches, core.async for streams, virtual threads (Java 21) for blocking I/O. Watch out for: lazy-seq escaping with-open, reflection (warn-on-reflection), and untested side-effectful code.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "ClojureScript", whenThis: "Backend services, JVM ecosystem access, anything needing JDBC/JVM libraries, performance via JIT.", whenThat: "Browser apps, React/React-Native, isomorphic code sharing, anything needing npm packages." },
    { vs: "Scala", whenThis: "Lisp semantics (REPL-driven, code-as-data), pure FP focus, simpler type system (Clojure is dynamically typed).", whenThat: "Static typing, FP+OOP hybrid, Big Data (Spark, Akka), teams with Java/Scala background." },
    { vs: "Common Lisp", whenThis: "JVM ecosystem, modern package management, immutable data structures, real-world production usage at scale.", whenThat: "Academic/research, ANSI standard compliance, image-based development, CLOS multi-methods." },
    { vs: "Elixir", whenThis: "JVM library access, REPL-driven workflow, persistent data structures, anything needing Java interop.", whenThat: "Massive concurrent connections (BEAM), fault-tolerant supervision trees, anything wanting OTP-grade reliability." },
  ],
};

export default sheet;
