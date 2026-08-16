import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "go",
  name: "Go",
  category: "languages",
  tier: 1,
  tags: ["static-typing", "compiled", "concurrent", "gc", "backend", "cloud-native", "simple"],
  tagline: "A small, statically-typed, GC'd language with built-in concurrency — the default for cloud-native back-ends and CLIs.",
  year: 2009,
  author: "Google (Robert Griesemer, Rob Pike, Ken Thompson)",

  tldr: [
    "Go is a statically-typed, garbage-collected, compiled language with a tiny grammar, first-class concurrency via goroutines and channels, and fast single-binary builds — designed to make large teams productive at Google scale.",
    "It dominates cloud-native infrastructure (Kubernetes, Docker, Terraform, Prometheus, etcd, gRPC servers), CLI tools, and a large share of microservices at companies like Uber, Twitch, and Dropbox.",
    "Reach for Go when you build network services, CLIs, or distributed systems; when you want fast builds and single-binary deploys; when you value simplicity and stable APIs over expressive type-system features.",
    "Avoid Go for systems programming (GC pauses, no manual control), data science (poor ecosystem vs Python), GUI apps, or any domain where generics, enums, or exceptions matter enough to fight the language.",
  ],

  mentalModel: {
    title: "Goroutines communicating over channels share memory by passing it",
    body: "Go's concurrency model is Communicating Sequential Processes (CSP): goroutines are cheap (2KB stack, grows on demand) and channels are typed queues they synchronize on. The slogan is 'don't communicate by sharing memory; share memory by communicating.' Every Go type has a zero value, and `nil` is a typed zero — a nil slice is a valid empty slice, a nil map panics on write, a nil channel blocks forever. Interfaces are satisfied implicitly (structural) and hold a (type, value) pair — a nil pointer inside a non-nil interface is the most common Go bug. Errors are values, returned as the last result, never thrown; `if err != nil` is the heartbeat of every Go file.",
  },

  constructs: [
    { syntax: "func f(x int, _ string) (int, error)", behavior: "Multi-return function; `_` discards a parameter; errors come last.", when: "Every function that can fail — the universal Go convention." },
    { syntax: "go f(args...)", behavior: "Launches f as a goroutine on a new stack; the caller doesn't wait.", when: "Concurrent work; pair with sync.WaitGroup or a channel for completion." },
    { syntax: "ch := make(chan T, n)", behavior: "Typed channel with buffer of n; sends block when full, receives when empty.", when: "Producer/consumer pipelines; unbuffered for handoff, buffered for batching." },
    { syntax: "select { case x := <-ch: ...; case ch <- y: ...; default: ... }", behavior: "Multi-way channel op; picks one ready case at random; default makes it non-blocking.", when: "Multiplexing channels, timeouts with `case <-time.After()`." },
    { syntax: "type S struct { ID int `json:\"id\"` }", behavior: "Struct with field tag consumed by encoding/json via reflection.", when: "JSON/DB serialization; tags are runtime metadata, not type system." },
    { syntax: "type I interface { M() }", behavior: "Interface — implicitly satisfied by any type with the methods.", when: "Decoupling; keep interfaces small (often one method) and defined at the consumer side." },
    { syntax: "defer cleanup()", behavior: "Schedules a call for function return (LIFO); runs even on panic.", when: "Resource cleanup, mutex unlock, response writing." },
    { syntax: "var p *T = &T{}", behavior: "Pointer to a heap-allocated T (escape analysis decides actual location).", when: "Mutation across boundaries; Go has no references, only pointers." },
    { syntax: "func Map[T, U any](xs []T, f func(T) U) []U", behavior: "Generic function with type parameters (1.18+).", when: "Reusable data structures and algorithms; prefer over `interface{}`." },
    { syntax: "ctx context.Context as first arg", behavior: "Context carrying deadlines, cancellation, values across call chains.", when: "Every long-running or I/O function in a service — non-negotiable convention." },
    { syntax: "switch t := x.(type) { case int: ...; case string: ... }", behavior: "Type switch on an interface value, binding the underlying value.", when: "Handling tagged unions / `any` values — Go's pattern matching." },
  ],

  patterns: [
    {
      lang: "go",
      caption: "Fan-out / fan-in with errgroup — bounded concurrency + error propagation",
      code: `func crawl(ctx context.Context, urls []string) ([]string, error) {
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(8)                       // bounded parallelism (1.20+)

    results := make([]string, len(urls))
    for i, u := range urls {
        i, u := i, u                    // capture per-iteration (pre-1.22)
        g.Go(func() error {
            body, err := fetch(ctx, u)
            if err != nil {
                return fmt.Errorf("fetch %s: %w", u, err)
            }
            results[i] = body
            return nil
        })
    }
    if err := g.Wait(); err != nil {
        return nil, err                 // first non-nil error wins
    }
    return results, nil
}`,
    },
    {
      lang: "go",
      caption: "Context cancellation propagated through I/O",
      code: `func fetch(ctx context.Context, url string) (string, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    if err != nil {
        return "", err
    }
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()
    if resp.StatusCode != 200 {
        return "", fmt.Errorf("status %d", resp.StatusCode)
    }
    body, err := io.ReadAll(resp.Body)
    return string(body), err
}

// Caller cancels via context.WithTimeout — fetch returns immediately.`,
    },
    {
      lang: "go",
      caption: "Pipeline of goroutines connected by channels",
      code: `func gen(ctx context.Context, nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for _, n := range nums {
            select {
            case out <- n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}

func sq(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            select {
            case out <- n * n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}

for v := range sq(ctx, gen(ctx, 1, 2, 3)) { fmt.Println(v) }`,
    },
    {
      lang: "go",
      caption: "Custom error type with errors.Is / errors.As",
      code: `type NotFoundError struct {
    What string
    ID   int
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("%s %d not found", e.What, e.ID)
}

func (e *NotFoundError) Unwrap() error { return nil }

// Caller side:
if err := load(id); err != nil {
    var nfe *NotFoundError
    if errors.As(err, &nfe) {
        return http.StatusNotFound, nfe
    }
    if errors.Is(err, context.DeadlineExceeded) {
        return http.StatusGatewayTimeout, err
    }
    return http.StatusInternalServerError, err
}`,
    },
  ],

  pitfalls: [
    {
      title: "Nil interface is not the same as interface holding a nil pointer",
      symptom: "`var p *T = nil; var i I = p; fmt.Println(i == nil)` prints `false` — the interface holds a (type=*T, value=nil) pair, which is not the nil interface.",
      fix: "Return the concrete nil from functions returning an interface only when truly nothing went wrong. Or explicitly return `nil` (no interface) on the success path. This is the #1 Go bug in real codebases.",
    },
    {
      title: "Closing a channel twice panics",
      symptom: "`close(ch); close(ch)` panics — there's no idempotent close. Multiple producers closing the same channel will crash the program.",
      fix: "Close from exactly one producer. Use sync.Once for shared close. Or never close — readers can use a context for cancellation instead.",
    },
    {
      title: "Sending on a closed channel panics",
      symptom: "A producer goroutine sends on a channel after a consumer closed it — runtime panic, crashes the program if not recovered.",
      fix: "Senders close, never receivers. For multi-producer pipelines, use a separate sync.Once guarded closer or context-based cancellation.",
    },
    {
      title: "Loop variable capture (pre-1.22)",
      symptom: "`for _, x := range xs { go func() { use(x) }() }` — all goroutines see the last x, because the loop variable is shared across iterations pre-Go-1.22.",
      fix: "Upgrade to Go 1.22+ (per-iteration variable). For older code, shadow: `x := x` inside the loop, or pass as a parameter: `go func(x T) { ... }(x)`.",
    },
    {
      title: "Map is not concurrent-safe",
      symptom: "Two goroutines writing the same map simultaneously — runtime panics with `concurrent map writes`, killing the program.",
      fix: "Use `sync.Map` for high-read/low-write or `sync.RWMutex` around a regular map for general use. Never share a map across writers without synchronization.",
    },
    {
      title: "Goroutine leaks on unbounded producer/consumer",
      symptom: "A producer goroutine sends on a channel that no one is reading from — it blocks forever, leaking the goroutine and its stack.",
      fix: "Always use context cancellation; producers should `select { case out <- v: case <-ctx.Done(): return }`. Run go.uber.org/goleak in tests to catch leaks.",
    },
    {
      title: "fmt.Errorf without %w loses the cause",
      symptom: "`fmt.Errorf(\"failed: %v\", err)` makes the original error unreachable by errors.Is/As — error inspection breaks across the boundary.",
      fix: "Use `%w` to wrap: `fmt.Errorf(\"failed: %w\", err)`. Reserve `%v` for terminal formatting only. lint with `errorlint`.",
    },
  ],

  quickReference: [
    { fact: "Go 1.22 (Feb 2024) fixed loop-variable capture and added range-over-int; 1.23 added range-over-func and unique; 1.21 added min/max/clear builtins.", tag: "version" },
    { fact: "Goroutine stack starts at 2KB and grows on demand — millions of goroutines fit in <10GB; the runtime multiplexes them onto OS threads (GOMAXPROCS).", tag: "perf" },
    { fact: "GC is concurrent, low-pause (~sub-ms for <1GB heap), targets 2x live heap growth; tunable via GOGC (default 100) or GOMEMLIMIT (1.19+).", tag: "perf" },
    { fact: "Escape analysis decides stack vs heap — `go build -gcflags=-m` shows what escapes; passing pointers can force heap allocation.", tag: "perf" },
    { fact: "Map lookup is O(1) avg; iteration order is randomized (intentional, do not rely on it).", tag: "gotcha" },
    { fact: "Slice header is 24 bytes (ptr, len, cap) — passed by value but shares the backing array; appends may reallocate and detach.", tag: "gotcha" },
    { fact: "Interfaces cost a (type, value) pair — small but real; hot loops should accept concrete types where possible.", tag: "perf" },
    { fact: "Reflection (`reflect`) is 10–100x slower than direct access; prefer code generation (e.g., easyjson) for hot paths.", tag: "perf" },
    { fact: "Generics (1.18+) use GC shape stenciling — value types are not boxed; performant, but compile time grows with type diversity.", tag: "version" },
    { fact: "`context.TODO()` is a smell in production code; every I/O function should accept a real context.Context as its first parameter.", tag: "style" },
    { fact: "Defer has near-zero cost since 1.14 (open-coded defers for ≤8 defers in a function); don't avoid it for perf.", tag: "perf" },
    { fact: "Build with `-trimpath -ldflags='-s -w'` for reproducible smaller binaries; CGO_ENABLED=0 for static binaries (cross-compile friendly).", tag: "style" },
    { fact: "Go modules: GOPROXY defaults to proxy.golang.org; GOVERSION/GOOS/GOARCH determine build target; reproducible builds use go.sum.", tag: "version" },
  ],

  goDeeper: [
    { title: "Effective Go — Official", url: "https://go.dev/doc/effective_go", note: "The canonical guide to idiomatic Go; reading it once saves weeks of bad habits." },
    { title: "The Go Programming Language Specification", url: "https://go.dev/ref/spec", note: "Authoritative language reference; definitive on memory model, channels, and interface semantics." },
    { title: "The Go Programming Language (Donovan & Kernighan)", url: "https://www.gopl.io/", note: "The canonical book — exercises build real intuition for CSP-style concurrency." },
    { title: "Go Blog — official", url: "https://go.dev/blog/", note: "Release notes and deep-dives by the Go team; the source of truth for new idioms." },
    { title: "100 Go Mistakes and How to Avoid Them (Teiva Harsanyi)", url: "https://100go.co/", note: "Concrete, production-grade footguns with fixes — the practical companion to Effective Go." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "int / int8 / int16 / int32 / int64", behavior: "Signed integers. `int` is platform-defined (32 or 64 bits); others are fixed-width.", when: "Default integer math. Use int64 for IDs/timestamps — `int` width varies." },
      { syntax: "uint / uint8 / uint16 / uint32 / uint64 / uintptr", behavior: "Unsigned integers. uintptr is for unsafe pointer arithmetic.", when: "Bit patterns, sizes. Avoid for general arithmetic — Go style prefers signed int." },
      { syntax: "byte / rune", behavior: "Aliases for uint8 / int32. byte for raw bytes, rune for Unicode code points.", when: "byte for I/O buffers; rune for characters. for-range over a string yields runes." },
      { syntax: "float32 / float64", behavior: "IEEE-754 single/double. float64 is the default.", when: "Math. Use math/big.Rat for exact decimal (money)." },
      { syntax: "complex64 / complex128", behavior: "Complex numbers — pair of float32/float64.", when: "Scientific computing. Rare in business code." },
      { syntax: "bool", behavior: "true / false. Default false.", when: "Logic. No truthy/falsy — `if 0` is a compile error." },
      { syntax: "string", behavior: "Immutable byte sequence (NOT UTF-8 by type, but conventionally UTF-8). Default empty string.", when: "All text. Use []byte for mutation; strings.Builder for concatenation." },
      { syntax: "error", behavior: "Built-in interface — `type error interface { Error() string }`. nil error means success.", when: "Every fallible function returns error as the last result." },
    ],
    collections: [
      { syntax: "array [N]T", behavior: "Fixed-size array — value type (copied on assignment). Rare in app code.", when: "Fixed-size buffers. Mostly used as the backing for slices." },
      { syntax: "slice []T", behavior: "Dynamic view over an array — header (ptr+len+cap), passed by value but shares backing.", when: "Default dynamic sequence. append() may reallocate and detach." },
      { syntax: "map[K]V", behavior: "Hash map — O(1) avg. Iteration order is randomized (intentional).", when: "Default key-value store. NOT thread-safe; use sync.Map or a Mutex." },
      { syntax: "struct { ... }", behavior: "Aggregate of named fields — value type, copied on assignment.", when: "The default composite type. Use pointer receiver for mutation methods." },
      { syntax: "chan T", behavior: "Typed channel — synchronizes goroutines. Unbuffered blocks; buffered queues.", when: "CSP-style concurrency, pipelines, signaling." },
      { syntax: "interface { ... }", behavior: "Type contract — set of method signatures. Implicitly satisfied.", when: "Decoupling; keep small (often one method) and defined at the consumer side." },
      { syntax: "sync.Map", behavior: "Concurrent-safe map — optimized for read-heavy workloads.", when: "Cross-goroutine maps with mostly reads. For write-heavy, use Mutex + map." },
      { syntax: "container/list", behavior: "Doubly-linked list — rarely used; slices + append beat it in cache locality.", when: "Genuine O(1) splice operations; otherwise prefer slice." },
    ],
    custom: [
      { syntax: "type T struct { ... }", behavior: "Named struct type — value semantics by default; methods on pointer receivers mutate.", when: "Default composite type. Use pointer receivers when methods mutate or struct is large." },
      { syntax: "type T Existing", behavior: "Named type alias — distinct type, can attach methods, convertible to underlying.", when: "Domain-specific wrappers (UserId, Email) without nominal tags." },
      { syntax: "type I interface { M() }", behavior: "Interface — implicit satisfaction; holds (type, value) pair.", when: "APIs and decoupling. Define at the consumer side; keep small." },
      { syntax: "type E int32 // implicit enum via const + iota", behavior: "Go has no enum keyword — use `type Role int` + `const ( ... = iota )`.", when: "Closed value sets. Run stringer to generate String() methods." },
      { syntax: "type Op func(a, b int) int", behavior: "Named function type — attach methods, pass as values, implement interfaces.", when: "Strategy pattern, callbacks. The foundation of functional patterns in Go." },
      { syntax: "type Generic[T any] struct { ... }", behavior: "Generic struct with type parameters (1.18+) — monomorphized at compile time.", when: "Reusable data structures — sync.Map generics, custom containers." },
      { syntax: "go:generate stringer -type=E", behavior: "//go:generate directive — runs tools at build time to emit boilerplate.", when: "Enum String() methods, mock generation, anything repetitive." },
      { syntax: "embed.FS", behavior: "Compile-time embedded file tree — //go:embed directive inits from build-time files.", when: "Single-binary deploys with assets (templates, migrations, certs)." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b, a % b", behavior: "Arithmetic — int overflow wraps silently. Integer / truncates toward zero.", when: "Math. Use math/big for arbitrary precision; for checked ops compare before/after." },
    { syntax: "a++, a--", behavior: "Post-increment/decrement only — no pre-form, no expression context (`f(i++)` is a compile error).", when: "Iteration. Statement-only — Go deliberately made this simple." },
    { syntax: "a == b, a != b", behavior: "Equality — value types compared by content; slices/maps/funcs compared only to nil.", when: "Use reflect.DeepEqual for slices/maps. Pointers compare by identity." },
    { syntax: "a < b, a > b, a <= b, a >=", behavior: "Comparison — ordered types only (no operator overloading). Strings compare lexically.", when: "Sorting. Implement sort.Interface or use slices.Sort with a cmp function." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — operands must be bool (no truthy/falsy).", when: "Logic. No footguns like JS — `if x` is a compile error if x isn't bool." },
    { syntax: "a & b, a | b, a ^ b, &^ b", behavior: "Bitwise AND/OR/XOR/AND-NOT. The `&^` (bit clear) is Go-specific.", when: "Bit flags, masks. Go's `x &^ mask` clears the bits in mask from x." },
    { syntax: "a << n, a >> n", behavior: "Left / right shift. Shift count must be non-negative uint.", when: "Low-level bit ops. Negative shift count is a compile error." },
    { syntax: "&a, *p", behavior: "Address-of / dereference — Go has pointers but no pointer arithmetic (except via unsafe).", when: "Passing for mutation. Pointer arithmetic requires the unsafe package." },
    { syntax: "a := b", behavior: "Short variable declaration — declares + assigns; required type inferred.", when: "Inside functions. Use `var x T` for zero-value init or package-level decls." },
    { syntax: "a = b", behavior: "Assignment — works on existing variables. Multi-assign: `a, b = b, a` swaps atomically-ish.", when: "Mutation. Multi-return: `v, err := f()` is the universal pattern." },
    { syntax: "a, ok := m[k]", behavior: "Map lookup with existence flag — `ok` is false if key absent.", when: "Distinguishing zero-value from absent. Also used for type assertions: `v, ok := i.(T)`." },
    { syntax: "a <- ch, ch <- a", behavior: "Channel receive / send — blocks until ready. `<-ch` alone discards the value.", when: "CSP concurrency. Use select for non-blocking or multi-channel ops." },
    { syntax: "go f(args)", behavior: "Launch f as a goroutine — caller doesn't wait. Stack starts at 2KB, grows on demand.", when: "Concurrent work. Pair with sync.WaitGroup or a channel for completion." },
    { syntax: "defer cleanup()", behavior: "Schedules call for function return (LIFO); runs even on panic.", when: "Resource cleanup, mutex unlock, response writing. Open-coded defers are near-zero cost." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "go",
      caption: "os / bufio — file and stream I/O",
      code: `import ("os"; "bufio"; "io")

// Small file — read all at once
data, err := os.ReadFile("cfg.json")
if err != nil { return err }

// Large file — stream line by line, O(1) memory
f, err := os.Open("huge.log")
if err != nil { return err }
defer f.Close()

sc := bufio.NewScanner(f)
for sc.Scan() {
  if line := sc.Text(); strings.Contains(line, "ERROR") {
    fmt.Fprintln(os.Stderr, line)
  }
}
return sc.Err()  // always check scan errors`,
    },
    {
      lang: "go",
      caption: "stdin / stdout / stderr — fmt and io",
      code: `import ("fmt"; "os"; "bufio")

// Stream stdin line by line
sc := bufio.NewScanner(os.Stdin)
for sc.Scan() {
  fmt.Println(strings.ToUpper(sc.Text()))
}

// Write to stderr (separate from stdout for piping)
fmt.Fprintln(os.Stderr, "warning: deprecated API")

// JSON over stdin/stdout — common in CLI tools invoked from other langs
var req Request
if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
  return err
}
return json.NewEncoder(os.Stdout).Encode(Transform(req))`,
    },
    {
      lang: "go",
      caption: "encoding/json — struct tags and custom marshal",
      code: `type User struct {
  ID    int    \`json:"id"\`
  Email string \`json:"email"\`
  Role  string \`json:"role,omitempty"\`  // omitempty skips zero values
  Internal string \`json:"-"\`             // never serialized
}

u := User{ID: 42, Email: "a@b.io"}
b, _ := json.Marshal(u)         // {"id":42,"email":"a@b.io"}
var v User
json.Unmarshal(b, &v)           // decode into struct

// Streaming for large payloads — uses io.Reader/Writer
dec := json.NewDecoder(file)
for dec.More() {
  var u User
  dec.Decode(&u)
}`,
    },
    {
      lang: "go",
      caption: "net/http — server with timeouts and graceful shutdown",
      code: `srv := &http.Server{
  Addr:              ":8080",
  Handler:           mux,
  ReadHeaderTimeout: 5 * time.Second,
  ReadTimeout:       30 * time.Second,
  WriteTimeout:      30 * time.Second,
  IdleTimeout:       120 * time.Second,
}

go func() {
  if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
    log.Fatal(err)
  }
}()

// Graceful shutdown on signal
<-ctx.Done()  // SIGTERM
shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
return srv.Shutdown(shutdownCtx)`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "go",
      caption: "for — Go's only loop keyword (3 forms)",
      code: `// Classic for
for i := 0; i < n; i++ {
  process(items[i])
}

// While-style (no semicolons)
for queue.Len() > 0 {
  process(queue.Pop())
}

// Infinite loop
for {
  if done() { break }
  work()
}

// Range — the universal iterator
for i, v := range items {
  fmt.Printf("[%d] %v\\n", i, v)
}
for k, v := range m { /* map iteration, randomized order */ }
for i := range items { /* index only */ }
for _, v := range items { /* values only */ }`,
    },
    {
      lang: "go",
      caption: "iter package + range-over-func (Go 1.23+)",
      code: `import "iter"

// Go 1.23+ iter.Seq[T] is func(yield func(T) bool) — the standard iterator type.
func Naturals() iter.Seq[int] {
  return func(yield func(int) bool) {
    for i := 0; ; i++ {
      if !yield(i) { return }  // caller broke out
    }
  }
}

// range-over-func — works with any iter.Seq
for v := range Naturals() {
  if v > 10 { break }
  fmt.Println(v)
}

// slices.Collect materializes an iter.Seq into a slice
first10 := slices.Collect(limit(Naturals(), 10))`,
    },
    {
      lang: "go",
      caption: "Generators via channels — pre-1.23 idiom",
      code: `// Pre-1.23 generators use a goroutine + channel
func naturals(ctx context.Context) <-chan int {
  out := make(chan int)
  go func() {
    defer close(out)
    for i := 0; ; i++ {
      select {
      case out <- i:
      case <-ctx.Done():
        return
      }
    }
  }()
  return out
}

// Consume — break early via context cancel
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
for v := range naturals(ctx) {
  if v > 10 { cancel(); break }
  fmt.Println(v)
}`,
    },
    {
      lang: "go",
      caption: "Labeled break/continue + range-over-int (Go 1.22+)",
      code: `// Labeled break — escape nested loops (rare; refactor if you need it)
outer:
for _, row := range grid {
  for _, cell := range row {
    if cell == "exit" { break outer }
    if cell == "skip" { continue }
    process(cell)
  }
}

// Range-over-int (Go 1.22+) — replaces 'for i := 0; i < n; i++'
for i := range 10 {
  fmt.Println(i)  // 0..9
}

// Per-iteration variable (1.22+) — no more 'i := i' shadow dance
for i, v := range items {
  go func() { use(i, v) }()  // each iteration gets fresh i, v
}`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "go",
      caption: "Multiple returns + errors-as-values",
      code: `// Multi-return — errors come last by convention
func fetch(url string) (string, error) {
  resp, err := http.Get(url)
  if err != nil {
    return "", fmt.Errorf("fetch %s: %w", url, err)
  }
  defer resp.Body.Close()
  body, err := io.ReadAll(resp.Body)
  return string(body), err
}

// Caller: check err immediately, never ignore
body, err := fetch(u)
if err != nil {
  return fmt.Errorf("load: %w", err)
}
use(body)`,
    },
    {
      lang: "go",
      caption: "Closures + function values",
      code: `// Functions are first-class — assign, pass, return
add := func(a, b int) int { return a + b }
add(1, 2)  // 3

// Closure — captures variables by reference
func counter() func() int {
  n := 0
  return func() int { n++; return n }
}
c := counter()
c()  // 1
c()  // 2

// Higher-order — funcs as args and returns
func mapFn[T, U any](xs []T, f func(T) U) []U {
  out := make([]U, len(xs))
  for i, x := range xs { out[i] = f(x) }
  return out
}`,
    },
    {
      lang: "go",
      caption: "Generics — type parameters (1.18+)",
      code: `// Type parameters with constraints
func Map[T, U any](xs []T, f func(T) U) []U {
  out := make([]U, len(xs))
  for i, x := range xs { out[i] = f(x) }
  return out
}

// Constraint via interface (union of types)
type Number interface {
  ~int | ~int64 | ~float64
}
func Sum[T Number](xs []T) T {
  var s T
  for _, x := range xs { s += x }
  return s
}

// Standard constraints in 'constraints' package (now golang.org/x/exp/constraints)
// or use cmp.Ordered for comparable-with-< types`,
    },
    {
      lang: "go",
      caption: "Methods — value vs pointer receivers",
      code: `type Counter struct{ n int }

// Pointer receiver — mutates, shares across calls
func (c *Counter) Inc() { c.n++ }

// Value receiver — operates on a copy, original unchanged
func (c Counter) Get() int { return c.n }

// Rule: pick one receiver type per type and stick with it.
// Pointer receivers when: methods mutate, struct is large, or you need
//   shared mutable state. Value receivers when: small immutable data.

c := &Counter{}
c.Inc()
c.Inc()
fmt.Println(c.Get())  // 2`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "go",
      caption: "Errors are values — if err != nil is the heartbeat",
      code: `// Convention: errors come last, nil = success
func loadConfig(path string) (*Config, error) {
  data, err := os.ReadFile(path)
  if err != nil {
    return nil, fmt.Errorf("read %s: %w", path, err)
  }
  var cfg Config
  if err := json.Unmarshal(data, &cfg); err != nil {
    return nil, fmt.Errorf("parse: %w", err)
  }
  return &cfg, nil
}

// Caller:
cfg, err := loadConfig("app.json")
if err != nil {
  log.Fatalf("startup: %+v", err)
}`,
    },
    {
      lang: "go",
      caption: "Custom error types + errors.Is / errors.As",
      code: `type NotFoundError struct {
  What string
  ID   int
}

func (e *NotFoundError) Error() string {
  return fmt.Sprintf("%s %d not found", e.What, e.ID)
}

// Caller side — unwrap the chain
if err := load(id); err != nil {
  var nfe *NotFoundError
  if errors.As(err, &nfe) {
    return http.StatusNotFound, nfe
  }
  if errors.Is(err, context.DeadlineExceeded) {
    return http.StatusGatewayTimeout, err
  }
  return http.StatusInternalServerError, err
}`,
    },
    {
      lang: "go",
      caption: "Wrapping with %w vs formatting with %v",
      code: `// %w — wraps the error, keeps it reachable by errors.Is/As
return fmt.Errorf("fetch %s: %w", url, err)

// %v — formats the message, breaks the chain (the original is unreachable)
return fmt.Errorf("fetch %s: %v", url, err)

// Always use %w when you want callers to inspect the cause.
// Reserve %v for terminal wrapping at the very top of the call stack.

// Sentinel errors — defined once, compared with errors.Is
var ErrNotFound = errors.New("not found")
if errors.Is(err, ErrNotFound) { /* ... */ }`,
    },
    {
      lang: "go",
      caption: "panic / recover — for unrecoverable bugs only",
      code: `// panic — aborts the goroutine; runs deferred funcs on the way out
panic("should never happen")

// recover — only useful inside a deferred func; catches panics in the same goroutine
func safeRun(f func()) (err error) {
  defer func() {
    if r := recover(); r != nil {
      err = fmt.Errorf("panic: %v", r)
    }
  }()
  f()
  return nil
}

// Use panic for: programmer errors (impossible states via invariants),
// library init failures. NEVER for expected errors — return them.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "go",
      caption: "Goroutines + channels — CSP fundamentals",
      code: `// Goroutine — cheap (2KB stack, grows on demand); scheduled by the runtime
go func() {
  // ... runs concurrently ...
}()

// Unbuffered channel — synchronous handoff
ch := make(chan int)
go func() { ch <- 42 }()  // blocks until receiver ready
v := <-ch                  // blocks until sender ready

// Buffered channel — async up to capacity
bch := make(chan int, 10)
bch <- 1                   // doesn't block (buffer has room)

// Close from exactly ONE producer; receivers check ok
close(bch)
v, ok := <-bch  // ok=false if closed and empty`,
    },
    {
      lang: "go",
      caption: "select — multi-way channel op",
      code: `select {
case v := <-ch1:
  process(v)
case ch2 <- 42:
  // sent
case <-time.After(5 * time.Second):
  return errors.New("timeout")
case <-ctx.Done():
  return ctx.Err()
default:
  // no channel ready (non-blocking)
}

// select picks one READY case at random; default makes it non-blocking.
// For fan-in, loop over select until all sources close.`,
    },
    {
      lang: "go",
      caption: "errgroup — bounded concurrency + error propagation",
      code: `import "golang.org/x/sync/errgroup"

func crawl(ctx context.Context, urls []string) ([]string, error) {
  g, ctx := errgroup.WithContext(ctx)
  g.SetLimit(8)  // bounded parallelism (1.20+)

  results := make([]string, len(urls))
  for i, u := range urls {
    i, u := i, u  // capture per-iteration (pre-1.22)
    g.Go(func() error {
      body, err := fetch(ctx, u)
      if err != nil {
        return fmt.Errorf("fetch %s: %w", u, err)
      }
      results[i] = body
      return nil
    })
  }
  if err := g.Wait(); err != nil {
    return nil, err  // first non-nil error wins
  }
  return results, nil
}`,
    },
    {
      lang: "go",
      caption: "sync primitives — Mutex, WaitGroup, Once, Pool",
      code: `// WaitGroup — wait for N goroutines to finish
var wg sync.WaitGroup
for i := 0; i < 8; i++ {
  wg.Add(1)
  go func() { defer wg.Done(); work() }()
}
wg.Wait()

// Mutex / RWMutex — protect shared state
var mu sync.Mutex
mu.Lock(); x++; mu.Unlock()

// Once — exactly-once init
var once sync.Once
once.Do(initOnce)

// Pool — reuse objects to reduce allocations
var bufPool = sync.Pool{New: func() any { return new(bytes.Buffer) }}
buf := bufPool.Get().(*bytes.Buffer)
defer bufPool.Put(buf)`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "go",
      caption: "testing package — table-driven tests",
      code: `func TestAdd(t *testing.T) {
  cases := []struct{ a, b, want int }{
    {1, 2, 3},
    {10, 5, 15},
    {-1, 1, 0},
  }
  for _, tc := range cases {
    got := Add(tc.a, tc.b)
    if got != tc.want {
      t.Errorf("Add(%d, %d) = %d, want %d", tc.a, tc.b, got, tc.want)
    }
  }
}

// Run: go test ./...
// Verbose: go test -v -run TestAdd
// Race detector: go test -race`,
    },
    {
      lang: "go",
      caption: "testify — assertions + mocks",
      code: `import (
  "github.com/stretchr/testify/assert"
  "github.com/stretchr/testify/mock"
)

func TestAdd(t *testing.T) {
  assert.Equal(t, 3, Add(1, 2))
  assert.NoError(t, err)
  require.NoError(t, err)  // fatal — stops test on failure
}

// Mock with testify/mock
type MockRepo struct{ mock.Mock }
func (m *MockRepo) Find(id int) (*User, error) {
  args := m.Called(id)
  return args.Get(0).(*User), args.Error(1)
}`,
    },
    {
      lang: "go",
      caption: "rapid — property-based testing",
      code: `import "pgregory.net/rapid"

func TestSortIdempotent(t *testing.T) {
  rapid.Check(t, func(t *rapid.T) {
    xs := rapid.SliceOf(rapid.Int()).Draw(t, "xs")
    once := Sorted(xs)
    twice := Sorted(once)
    assert.Equal(t, once, twice)
  })
}

// Run: go test -run TestSortIdempotent
// rapid shrinks failing cases to the minimal reproducer.`,
    },
    {
      lang: "go",
      caption: "httptest + goleak — HTTP + goroutine leak tests",
      code: `import (
  "net/http/httptest"
  "go.uber.org/goleak"
)

// Mock HTTP server
srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  w.WriteHeader(200)
  w.Write([]byte(\`{"id":42}\`))
}))
defer srv.Close()

// Detect goroutine leaks in tests
func TestMain(m *testing.M) {
  goleak.VerifyTestMain(m)  // fails if any goroutine leaks
}`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Goroutine stack starts at 2KB and grows on demand — millions of goroutines fit in <10GB; the runtime multiplexes them onto OS threads (GOMAXPROCS).", tag: "perf" },
    { fact: "GC is concurrent, low-pause (~sub-ms for <1GB heap), targets 2x live heap growth; tunable via GOGC (default 100) or GOMEMLIMIT (1.19+).", tag: "perf" },
    { fact: "Escape analysis decides stack vs heap — `go build -gcflags=-m` shows what escapes; passing pointers can force heap allocation.", tag: "perf" },
    { fact: "Map lookup is O(1) avg; iteration order is randomized (intentional, do not rely on it).", tag: "gotcha" },
    { fact: "Slice header is 24 bytes (ptr, len, cap) — passed by value but shares the backing array; appends may reallocate and detach.", tag: "gotcha" },
    { fact: "Interfaces cost a (type, value) pair — small but real; hot loops should accept concrete types where possible.", tag: "perf" },
    { fact: "Reflection (`reflect`) is 10–100x slower than direct access; prefer code generation (e.g., easyjson) for hot paths.", tag: "perf" },
    { fact: "Generics (1.18+) use GC shape stenciling — value types are not boxed; performant, but compile time grows with type diversity.", tag: "version" },
    { fact: "`context.TODO()` is a smell in production code; every I/O function should accept a real context.Context as its first parameter.", tag: "style" },
    { fact: "Defer has near-zero cost since 1.14 (open-coded defers for ≤8 defers in a function); don't avoid it for perf.", tag: "perf" },
    { fact: "Build with `-trimpath -ldflags='-s -w'` for reproducible smaller binaries; CGO_ENABLED=0 for static binaries (cross-compile friendly).", tag: "style" },
    { fact: "Go modules: GOPROXY defaults to proxy.golang.org; GOVERSION/GOOS/GOARCH determine build target; reproducible builds use go.sum.", tag: "version" },
    { fact: "pprof is built-in — `import _ \"net/http/pprof\"` + go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30.", tag: "perf" },
    { fact: "strings.Builder is 3-5x faster than `s += ...` in a loop — use it for any non-trivial concatenation.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "go (the toolchain)", purpose: "The Go tool — `go build`, `go test`, `go vet`, `go fmt`. Batteries included; no Makefile needed.", url: "https://go.dev/cmd/go/", category: "build" },
    { tool: "Go modules", purpose: "Built-in dependency manager — go.mod, go.sum, GOPROXY; replaced every previous attempt (dep, glide, godep).", url: "https://go.dev/ref/mod", category: "package" },
    { tool: "golangci-lint", purpose: "Meta-linter aggregating 50+ analyzers — the de-facto standard for Go CI.", url: "https://golangci-lint.run/", category: "lint" },
    { tool: "go vet", purpose: "Built-in static analyzer — catches common mistakes (printf format, struct tags, locks).", url: "https://pkg.go.dev/cmd/vet", category: "lint" },
    { tool: "gofmt / gofmt -s", purpose: "Built-in formatter — universal, opinion-free; one Go format worldwide.", url: "https://pkg.go.dev/cmd/gofmt", category: "lint" },
    { tool: "testing (stdlib)", purpose: "Built-in test runner — `go test`; table-driven tests, benchmarks, race detector.", url: "https://pkg.go.dev/testing", category: "test" },
    { tool: "testify", purpose: "Assertion + mock library — the most-used third-party test helper.", url: "https://github.com/stretchr/testify", category: "test" },
    { tool: "rapid", purpose: "Property-based testing for Go — Hypothesis-style shrinking.", url: "https://github.com/flyingmutant/rapid", category: "test" },
    { tool: "goleak", purpose: "Goroutine leak detector for tests — Uber's standard for concurrent code.", url: "https://github.com/uber-go/goleak", category: "test" },
    { tool: "delve (dlv)", purpose: "Source-level debugger for Go — better than GDB for goroutines.", url: "https://github.com/go-delve/delve", category: "debug" },
    { tool: "pprof", purpose: "Built-in CPU/memory/goroutine profiler — net/http/pprof + go tool pprof.", url: "https://pkg.go.dev/net/http/pprof", category: "debug" },
    { tool: "go test -race", purpose: "Built-in race detector — catches data races at runtime; always run in CI.", url: "https://go.dev/doc/articles/race_detector", category: "debug" },
    { tool: "Air / entr", purpose: "Hot-reload dev servers — re-run on file change; common in local dev.", url: "https://github.com/cosmtrek/air", category: "build" },
    { tool: "ko / go-releaser", purpose: "Build + release tools — ko for container images from Go source; goreleaser for cross-platform binaries.", url: "https://goreleaser.com/", category: "deploy" },
    { tool: "Docker / Kubernetes", purpose: "Container packaging + orchestration — the dominant deploy target for Go services.", url: "https://kubernetes.io/", category: "deploy" },
    { tool: "buf", purpose: "Protobuf + gRPC toolchain — schema management, linting, breaking-change detection.", url: "https://buf.build/", category: "build" },
    { tool: "sqlc", purpose: "Generates type-safe Go from SQL — compiles queries to Go code at build time.", url: "https://sqlc.dev/", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "Go 1.0",   year: 2012, highlight: "First stable release — goroutines, channels, GC, interfaces." },
    { version: "Go 1.5",   year: 2015, highlight: "Self-hosted compiler (bootstrapped), concurrent GC, vendoring experiment." },
    { version: "Go 1.7",   year: 2016, highlight: "context package moved to stdlib, sub-tests and sub-benchmarks." },
    { version: "Go 1.11",  year: 2018, highlight: "Go modules introduced (opt-in), WebAssembly support." },
    { version: "Go 1.13",  year: 2019, highlight: "Error wrapping with %w / errors.Is / errors.As; modules on by default." },
    { version: "Go 1.16",  year: 2021, highlight: "embed package (compile-time file embedding), io/fs, modules default-on." },
    { version: "Go 1.18",  year: 2022, highlight: "Generics (type parameters), fuzzing built-in, workspaces — the biggest release since 1.0." },
    { version: "Go 1.20",  year: 2023, highlight: "errors.Join, comparable type constraint, profile-guided optimization (PGO) preview." },
    { version: "Go 1.21",  year: 2023, highlight: "min/max/clear builtins, slices/maps/cmp stdlib packages, log/slog structured logging." },
    { version: "Go 1.22",  year: 2024, highlight: "Range-over-int, per-iteration loop variable fix (finally!), enhanced net/http routing with methods+patterns." },
    { version: "Go 1.23",  year: 2024, highlight: "Range-over-func (iter.Seq[T] iterators), unique package, timer behavior fixes." },
    { version: "Go 1.24",  year: 2025, highlight: "Generic type aliases, toolchain management via go.mod, swiss-table map implementation (2-3x faster)." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Explain goroutines and how they differ from OS threads.", a: "Goroutines are user-space coroutines scheduled cooperatively by the Go runtime onto OS threads (M:N scheduler). They start at 2KB stack (grows on demand) vs ~8MB for OS threads, so millions are feasible. The runtime multiplexes them onto GOMAXPROCS OS threads; blocking syscalls are intercepted and the OS thread is handed off so others can run. Channels synchronize them — share memory by communicating.", difficulty: "medium" },
    { q: "How does Go's GC work?", a: "Concurrent mark-and-sweep, tri-color, non-generational. Targets ~sub-ms pauses for <1GB heap. Tunable via GOGC (default 100 = trigger GC at 2x live heap) and GOMEMLIMIT (1.19+, soft memory cap). Write barriers run during mark; STW only at the very start (stack scan) and end (a few hundred microseconds). No compaction — fragmentation is mitigated by spans.", difficulty: "medium" },
    { q: "Why are nil interfaces not the same as interfaces holding a nil pointer?", a: "An interface value is a (type, value) pair. `var p *T = nil; var i I = p` makes i hold (type=*T, value=nil) — i is NOT the nil interface. `i == nil` is false. This is the #1 Go bug: a function returning a typed nil pointer wrapped in an interface returns a non-nil error. Fix: return bare nil from the function when there's no error, or check the concrete pointer for nil first.", difficulty: "hard" },
    { q: "How do generics work in Go?", a: "Go 1.18+ generics use type parameters with constraints (interfaces). The compiler uses GC shape stenciling: one specialization per GC shape (pointer-sized types share, distinct value types get distinct code) — avoids both monomorphization bloat and boxing. Constraints are interfaces; the `any` alias is `interface{}`. Standard constraints live in cmp (Ordered) and the exp packages. Compile time grows with type diversity but binary size stays modest.", difficulty: "medium" },
    { q: "Explain context.Context — when and why?", a: "Context carries deadlines, cancellation, and request-scoped values across API boundaries. Convention: first parameter, named ctx. Use context.WithTimeout/WithCancel for I/O timeouts, context.Background at the top of call chains (main, tests, request handlers). Never store contexts in structs. Cancellation propagates to children. Values are a last resort — prefer explicit parameters.", difficulty: "medium" },
    { q: "What's the difference between `errors.Is` and `errors.As`?", a: "errors.Is walks the wrap chain comparing identity to a target (sentinel error). errors.As walks the chain looking for an error assignable to a target type, and assigns it. Use Is for sentinel errors (io.EOF, context.DeadlineExceeded); use As for typed errors you want to inspect fields on (e.g. *NotFoundError). Both unwrap recursively via the optional Unwrap() method.", difficulty: "easy" },
    { q: "Why does a slice share its backing array after append?", a: "A slice header is (ptr, len, cap). Append writes to ptr[len] and increments len — if len < cap, no reallocation. So `s2 := append(s1, x)` may have s1 and s2 sharing storage; mutating s2 can affect s1's later elements. Append reallocates only when len reaches cap, doubling capacity. To detach: `s2 := append([]T(nil), s1...)` or `slices.Clone(s1)` (1.21+).", difficulty: "medium" },
    { q: "How does the Go scheduler work?", a: "M:N scheduler with G (goroutine), M (OS thread), and P (processor, a scheduling context). GOMAXPROCS Ps are active; each P has a local run queue (256 deep) plus a global queue. When a G blocks on a syscall, the M is parked and its P moves to another M to keep running Gs. Work-stealing: idle Ps steal from other Ps' queues. Preemption (1.14+) at function prologue + async safepoints, so tight loops no longer freeze the scheduler.", difficulty: "hard" },
    { q: "How would you detect a goroutine leak?", a: "Run go.uber.org/goleak in TestMain — it asserts no goroutines are left after each test. For production, expose pprof's goroutine endpoint (`/debug/pprof/goroutine`) and inspect with `go tool pprof`. Symptoms: rising goroutine count, climbing memory, eventual OOM. Common causes: unbuffered channels with no reader, missing context cancellation, time.After in a tight loop (leaks until the timer fires).", difficulty: "medium" },
    { q: "When should you use a pointer receiver vs a value receiver?", a: "Pointer receiver when the method mutates the receiver, the struct is large (avoid copy), or you need shared mutable state. Value receiver when the struct is small and immutable, or you want the method to work on both T and *T (Go auto-promotes value to pointer). Pick one per type and stick with it — mixing leads to interface-implementation confusion. The standard library mostly uses pointer receivers for non-trivial types.", difficulty: "easy" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Rust", whenThis: "Cloud-native services, CLIs, ops tooling — anywhere simplicity, fast builds, and goroutines beat static safety.", whenThat: "Systems software, embedded, memory-safety-critical code, anywhere you'd pay for the borrow checker's safety." },
    { vs: "Java", whenThis: "Microservices, CLIs, distributed systems — anywhere simplicity, single-binary deploys, and fast startup win.", whenThat: "Large enterprise back-ends, big-data infrastructure (Kafka, Spark), anywhere the JVM ecosystem matters." },
    { vs: "Python", whenThis: "High-throughput network services, CLIs, distributed systems — anywhere developer speed + runtime speed both matter.", whenThat: "Data science / ML, scripting, NumPy/Pandas/PyTorch workloads — the ecosystem is the product." },
    { vs: "Node.js / TypeScript", whenThis: "Network services, ops tooling, distributed systems where stable ABI + goroutines beat async ergonomics.", whenThat: "Frontend + backend sharing one language, real-time web, anything that needs the npm ecosystem." },
    { vs: "C", whenThis: "Application-level services, CLIs, network daemons — anywhere productivity + GC are acceptable.", whenThat: "Kernels, embedded firmware, FFI libraries, anywhere ABI stability and tiny toolchain matter most." },
  ],
};

export default sheet;
