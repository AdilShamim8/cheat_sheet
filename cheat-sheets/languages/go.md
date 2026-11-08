# Go

**Category:** Languages · **Tier:** Tier 1 · Core · **Tags:** static-typing, compiled, concurrent, gc, backend, cloud-native, simple · **First released:** 2009 · **Author:** Google (Robert Griesemer, Rob Pike, Ken Thompson) · **Last updated:** 2026-11

> A small, statically-typed, GC'd language with built-in concurrency — the default for cloud-native back-ends and CLIs.

---

## TL;DR

- Go is a statically-typed, garbage-collected, compiled language with a tiny grammar, first-class concurrency via goroutines and channels, and fast single-binary builds — designed to make large teams productive at Google scale.
- It dominates cloud-native infrastructure (Kubernetes, Docker, Terraform, Prometheus, etcd, gRPC servers), CLI tools, and a large share of microservices at companies like Uber, Twitch, and Dropbox.
- Reach for Go when you build network services, CLIs, or distributed systems; when you want fast builds and single-binary deploys; when you value simplicity and stable APIs over expressive type-system features.
- Avoid Go for systems programming (GC pauses, no manual control), data science (poor ecosystem vs Python), GUI apps, or any domain where generics, enums, or exceptions matter enough to fight the language.

## Core Mental Model

**Goroutines communicating over channels share memory by passing it.** Go's concurrency model is Communicating Sequential Processes (CSP): goroutines are cheap (2KB stack, grows on demand) and channels are typed queues they synchronize on. The slogan is 'don't communicate by sharing memory; share memory by communicating.' Every Go type has a zero value, and `nil` is a typed zero — a nil slice is a valid empty slice, a nil map panics on write, a nil channel blocks forever. Interfaces are satisfied implicitly (structural) and hold a (type, value) pair — a nil pointer inside a non-nil interface is the most common Go bug. Errors are values, returned as the last result, never thrown; `if err != nil` is the heartbeat of every Go file.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| func f(x int, _ string) (int, error) | Multi-return function; `_` discards a parameter; errors come last. | Every function that can fail — the universal Go convention. |
| go f(args...) | Launches f as a goroutine on a new stack; the caller doesn't wait. | Concurrent work; pair with sync.WaitGroup or a channel for completion. |
| ch := make(chan T, n) | Typed channel with buffer of n; sends block when full, receives when empty. | Producer/consumer pipelines; unbuffered for handoff, buffered for batching. |
| select { case x := <-ch: ...; case ch <- y: ...; default: ... } | Multi-way channel op; picks one ready case at random; default makes it non-blocking. | Multiplexing channels, timeouts with `case <-time.After()`. |
| type S struct { ID int `json:"id"` } | Struct with field tag consumed by encoding/json via reflection. | JSON/DB serialization; tags are runtime metadata, not type system. |
| type I interface { M() } | Interface — implicitly satisfied by any type with the methods. | Decoupling; keep interfaces small (often one method) and defined at the consumer side. |
| defer cleanup() | Schedules a call for function return (LIFO); runs even on panic. | Resource cleanup, mutex unlock, response writing. |
| var p *T = &T{} | Pointer to a heap-allocated T (escape analysis decides actual location). | Mutation across boundaries; Go has no references, only pointers. |
| func Map[T, U any](xs []T, f func(T) U) []U | Generic function with type parameters (1.18+). | Reusable data structures and algorithms; prefer over `interface{}`. |
| ctx context.Context as first arg | Context carrying deadlines, cancellation, values across call chains. | Every long-running or I/O function in a service — non-negotiable convention. |
| switch t := x.(type) { case int: ...; case string: ... } | Type switch on an interface value, binding the underlying value. | Handling tagged unions / `any` values — Go's pattern matching. |

## Idiomatic Patterns

**Fan-out / fan-in with errgroup — bounded concurrency + error propagation**

```go
func crawl(ctx context.Context, urls []string) ([]string, error) {
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
}
```

**Context cancellation propagated through I/O**

```go
func fetch(ctx context.Context, url string) (string, error) {
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

// Caller cancels via context.WithTimeout — fetch returns immediately.
```

**Pipeline of goroutines connected by channels**

```go
func gen(ctx context.Context, nums ...int) <-chan int {
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

for v := range sq(ctx, gen(ctx, 1, 2, 3)) { fmt.Println(v) }
```

**Custom error type with errors.Is / errors.As**

```go
type NotFoundError struct {
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
}
```

## Common Pitfalls

1. **Nil interface is not the same as interface holding a nil pointer** — *Symptom:* `var p *T = nil; var i I = p; fmt.Println(i == nil)` prints `false` — the interface holds a (type=*T, value=nil) pair, which is not the nil interface. *Fix:* Return the concrete nil from functions returning an interface only when truly nothing went wrong. Or explicitly return `nil` (no interface) on the success path. This is the #1 Go bug in real codebases.
2. **Closing a channel twice panics** — *Symptom:* `close(ch); close(ch)` panics — there's no idempotent close. Multiple producers closing the same channel will crash the program. *Fix:* Close from exactly one producer. Use sync.Once for shared close. Or never close — readers can use a context for cancellation instead.
3. **Sending on a closed channel panics** — *Symptom:* A producer goroutine sends on a channel after a consumer closed it — runtime panic, crashes the program if not recovered. *Fix:* Senders close, never receivers. For multi-producer pipelines, use a separate sync.Once guarded closer or context-based cancellation.
4. **Loop variable capture (pre-1.22)** — *Symptom:* `for _, x := range xs { go func() { use(x) }() }` — all goroutines see the last x, because the loop variable is shared across iterations pre-Go-1.22. *Fix:* Upgrade to Go 1.22+ (per-iteration variable). For older code, shadow: `x := x` inside the loop, or pass as a parameter: `go func(x T) { ... }(x)`.
5. **Map is not concurrent-safe** — *Symptom:* Two goroutines writing the same map simultaneously — runtime panics with `concurrent map writes`, killing the program. *Fix:* Use `sync.Map` for high-read/low-write or `sync.RWMutex` around a regular map for general use. Never share a map across writers without synchronization.
6. **Goroutine leaks on unbounded producer/consumer** — *Symptom:* A producer goroutine sends on a channel that no one is reading from — it blocks forever, leaking the goroutine and its stack. *Fix:* Always use context cancellation; producers should `select { case out <- v: case <-ctx.Done(): return }`. Run go.uber.org/goleak in tests to catch leaks.
7. **fmt.Errorf without %w loses the cause** — *Symptom:* `fmt.Errorf("failed: %v", err)` makes the original error unreachable by errors.Is/As — error inspection breaks across the boundary. *Fix:* Use `%w` to wrap: `fmt.Errorf("failed: %w", err)`. Reserve `%v` for terminal formatting only. lint with `errorlint`.

## Production / Interview Quick Reference

- Go 1.27.3 (Oct 2026) is current — generic methods, encoding/json/v2, post-quantum crypto/mldsa, native uuid. `version`
- Go 1.22 (Feb 2024) fixed loop-variable capture and added range-over-int; 1.23 added range-over-func and unique; 1.21 added min/max/clear builtins. `version`
- Goroutine stack starts at 2KB and grows on demand — millions of goroutines fit in <10GB; the runtime multiplexes them onto OS threads (GOMAXPROCS). `perf`
- GC is concurrent, low-pause (~sub-ms for <1GB heap), targets 2x live heap growth; tunable via GOGC (default 100) or GOMEMLIMIT (1.19+). `perf`
- Escape analysis decides stack vs heap — `go build -gcflags=-m` shows what escapes; passing pointers can force heap allocation. `perf`
- Map lookup is O(1) avg; iteration order is randomized (intentional, do not rely on it). `gotcha`
- Slice header is 24 bytes (ptr, len, cap) — passed by value but shares the backing array; appends may reallocate and detach. `gotcha`
- Interfaces cost a (type, value) pair — small but real; hot loops should accept concrete types where possible. `perf`
- Reflection (`reflect`) is 10–100x slower than direct access; prefer code generation (e.g., easyjson) for hot paths. `perf`
- Generics (1.18+) use GC shape stenciling — value types are not boxed; performant, but compile time grows with type diversity. `version`
- `context.TODO()` is a smell in production code; every I/O function should accept a real context.Context as its first parameter. `style`
- Defer has near-zero cost since 1.14 (open-coded defers for ≤8 defers in a function); don't avoid it for perf. `perf`
- Build with `-trimpath -ldflags='-s -w'` for reproducible smaller binaries; CGO_ENABLED=0 for static binaries (cross-compile friendly). `style`
- Go modules: GOPROXY defaults to proxy.golang.org; GOVERSION/GOOS/GOARCH determine build target; reproducible builds use go.sum. `version`

## Go Deeper

- [Effective Go — Official](https://go.dev/doc/effective_go) — The canonical guide to idiomatic Go; reading it once saves weeks of bad habits.
- [The Go Programming Language Specification](https://go.dev/ref/spec) — Authoritative language reference; definitive on memory model, channels, and interface semantics.
- [The Go Programming Language (Donovan & Kernighan)](https://www.gopl.io/) — The canonical book — exercises build real intuition for CSP-style concurrency.
- [Go Blog — official](https://go.dev/blog/) — Release notes and deep-dives by the Go team; the source of truth for new idioms.
- [100 Go Mistakes and How to Avoid Them (Teiva Harsanyi)](https://100go.co/) — Concrete, production-grade footguns with fixes — the practical companion to Effective Go.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| int / int8 / int16 / int32 / int64 | Signed integers. `int` is platform-defined (32 or 64 bits); others are fixed-width. | Default integer math. Use int64 for IDs/timestamps — `int` width varies. |
| uint / uint8 / uint16 / uint32 / uint64 / uintptr | Unsigned integers. uintptr is for unsafe pointer arithmetic. | Bit patterns, sizes. Avoid for general arithmetic — Go style prefers signed int. |
| byte / rune | Aliases for uint8 / int32. byte for raw bytes, rune for Unicode code points. | byte for I/O buffers; rune for characters. for-range over a string yields runes. |
| float32 / float64 | IEEE-754 single/double. float64 is the default. | Math. Use math/big.Rat for exact decimal (money). |
| complex64 / complex128 | Complex numbers — pair of float32/float64. | Scientific computing. Rare in business code. |
| bool | true / false. Default false. | Logic. No truthy/falsy — `if 0` is a compile error. |
| string | Immutable byte sequence (NOT UTF-8 by type, but conventionally UTF-8). Default empty string. | All text. Use []byte for mutation; strings.Builder for concatenation. |
| error | Built-in interface — `type error interface { Error() string }`. nil error means success. | Every fallible function returns error as the last result. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| array [N]T | Fixed-size array — value type (copied on assignment). Rare in app code. | Fixed-size buffers. Mostly used as the backing for slices. |
| slice []T | Dynamic view over an array — header (ptr+len+cap), passed by value but shares backing. | Default dynamic sequence. append() may reallocate and detach. |
| map[K]V | Hash map — O(1) avg. Iteration order is randomized (intentional). | Default key-value store. NOT thread-safe; use sync.Map or a Mutex. |
| struct { ... } | Aggregate of named fields — value type, copied on assignment. | The default composite type. Use pointer receiver for mutation methods. |
| chan T | Typed channel — synchronizes goroutines. Unbuffered blocks; buffered queues. | CSP-style concurrency, pipelines, signaling. |
| interface { ... } | Type contract — set of method signatures. Implicitly satisfied. | Decoupling; keep small (often one method) and defined at the consumer side. |
| sync.Map | Concurrent-safe map — optimized for read-heavy workloads. | Cross-goroutine maps with mostly reads. For write-heavy, use Mutex + map. |
| container/list | Doubly-linked list — rarely used; slices + append beat it in cache locality. | Genuine O(1) splice operations; otherwise prefer slice. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| type T struct { ... } | Named struct type — value semantics by default; methods on pointer receivers mutate. | Default composite type. Use pointer receivers when methods mutate or struct is large. |
| type T Existing | Named type alias — distinct type, can attach methods, convertible to underlying. | Domain-specific wrappers (UserId, Email) without nominal tags. |
| type I interface { M() } | Interface — implicit satisfaction; holds (type, value) pair. | APIs and decoupling. Define at the consumer side; keep small. |
| type E int32 // implicit enum via const + iota | Go has no enum keyword — use `type Role int` + `const ( ... = iota )`. | Closed value sets. Run stringer to generate String() methods. |
| type Op func(a, b int) int | Named function type — attach methods, pass as values, implement interfaces. | Strategy pattern, callbacks. The foundation of functional patterns in Go. |
| type Generic[T any] struct { ... } | Generic struct with type parameters (1.18+) — monomorphized at compile time. | Reusable data structures — sync.Map generics, custom containers. |
| go:generate stringer -type=E | //go:generate directive — runs tools at build time to emit boilerplate. | Enum String() methods, mock generation, anything repetitive. |
| embed.FS | Compile-time embedded file tree — //go:embed directive inits from build-time files. | Single-binary deploys with assets (templates, migrations, certs). |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b, a % b | Arithmetic — int overflow wraps silently. Integer / truncates toward zero. | Math. Use math/big for arbitrary precision; for checked ops compare before/after. |
| a++, a-- | Post-increment/decrement only — no pre-form, no expression context (`f(i++)` is a compile error). | Iteration. Statement-only — Go deliberately made this simple. |
| a == b, a != b | Equality — value types compared by content; slices/maps/funcs compared only to nil. | Use reflect.DeepEqual for slices/maps. Pointers compare by identity. |
| a < b, a > b, a <= b, a >= | Comparison — ordered types only (no operator overloading). Strings compare lexically. | Sorting. Implement sort.Interface or use slices.Sort with a cmp function. |
| a && b, a \|\| b, !a | Short-circuit boolean — operands must be bool (no truthy/falsy). | Logic. No footguns like JS — `if x` is a compile error if x isn't bool. |
| a & b, a \| b, a ^ b, &^ b | Bitwise AND/OR/XOR/AND-NOT. The `&^` (bit clear) is Go-specific. | Bit flags, masks. Go's `x &^ mask` clears the bits in mask from x. |
| a << n, a >> n | Left / right shift. Shift count must be non-negative uint. | Low-level bit ops. Negative shift count is a compile error. |
| &a, *p | Address-of / dereference — Go has pointers but no pointer arithmetic (except via unsafe). | Passing for mutation. Pointer arithmetic requires the unsafe package. |
| a := b | Short variable declaration — declares + assigns; required type inferred. | Inside functions. Use `var x T` for zero-value init or package-level decls. |
| a = b | Assignment — works on existing variables. Multi-assign: `a, b = b, a` swaps atomically-ish. | Mutation. Multi-return: `v, err := f()` is the universal pattern. |
| a, ok := m[k] | Map lookup with existence flag — `ok` is false if key absent. | Distinguishing zero-value from absent. Also used for type assertions: `v, ok := i.(T)`. |
| a <- ch, ch <- a | Channel receive / send — blocks until ready. `<-ch` alone discards the value. | CSP concurrency. Use select for non-blocking or multi-channel ops. |
| go f(args) | Launch f as a goroutine — caller doesn't wait. Stack starts at 2KB, grows on demand. | Concurrent work. Pair with sync.WaitGroup or a channel for completion. |
| defer cleanup() | Schedules call for function return (LIFO); runs even on panic. | Resource cleanup, mutex unlock, response writing. Open-coded defers are near-zero cost. |

## Input / Output

**os / bufio — file and stream I/O**

```go
import ("os"; "bufio"; "io")

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
return sc.Err()  // always check scan errors
```

**stdin / stdout / stderr — fmt and io**

```go
import ("fmt"; "os"; "bufio")

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
return json.NewEncoder(os.Stdout).Encode(Transform(req))
```

**encoding/json — struct tags and custom marshal**

```go
type User struct {
  ID    int    `json:"id"`
  Email string `json:"email"`
  Role  string `json:"role,omitempty"`  // omitempty skips zero values
  Internal string `json:"-"`             // never serialized
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
}
```

**net/http — server with timeouts and graceful shutdown**

```go
srv := &http.Server{
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
return srv.Shutdown(shutdownCtx)
```

## Loops & Iteration

**for — Go's only loop keyword (3 forms)**

```go
// Classic for
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
  fmt.Printf("[%d] %v\n", i, v)
}
for k, v := range m { /* map iteration, randomized order */ }
for i := range items { /* index only */ }
for _, v := range items { /* values only */ }
```

**iter package + range-over-func (Go 1.23+)**

```go
import "iter"

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
first10 := slices.Collect(limit(Naturals(), 10))
```

**Generators via channels — pre-1.23 idiom**

```go
// Pre-1.23 generators use a goroutine + channel
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
}
```

**Labeled break/continue + range-over-int (Go 1.22+)**

```go
// Labeled break — escape nested loops (rare; refactor if you need it)
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
}
```

## Functions & Callables

**Multiple returns + errors-as-values**

```go
// Multi-return — errors come last by convention
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
use(body)
```

**Closures + function values**

```go
// Functions are first-class — assign, pass, return
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
}
```

**Generics — type parameters (1.18+)**

```go
// Type parameters with constraints
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
// or use cmp.Ordered for comparable-with-< types
```

**Methods — value vs pointer receivers**

```go
type Counter struct{ n int }

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
fmt.Println(c.Get())  // 2
```

## Error Handling

**Errors are values — if err != nil is the heartbeat**

```go
// Convention: errors come last, nil = success
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
}
```

**Custom error types + errors.Is / errors.As**

```go
type NotFoundError struct {
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
}
```

**Wrapping with %w vs formatting with %v**

```go
// %w — wraps the error, keeps it reachable by errors.Is/As
return fmt.Errorf("fetch %s: %w", url, err)

// %v — formats the message, breaks the chain (the original is unreachable)
return fmt.Errorf("fetch %s: %v", url, err)

// Always use %w when you want callers to inspect the cause.
// Reserve %v for terminal wrapping at the very top of the call stack.

// Sentinel errors — defined once, compared with errors.Is
var ErrNotFound = errors.New("not found")
if errors.Is(err, ErrNotFound) { /* ... */ }
```

**panic / recover — for unrecoverable bugs only**

```go
// panic — aborts the goroutine; runs deferred funcs on the way out
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
// library init failures. NEVER for expected errors — return them.
```

## Concurrency Model

**Goroutines + channels — CSP fundamentals**

```go
// Goroutine — cheap (2KB stack, grows on demand); scheduled by the runtime
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
v, ok := <-bch  // ok=false if closed and empty
```

**select — multi-way channel op**

```go
select {
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
// For fan-in, loop over select until all sources close.
```

**errgroup — bounded concurrency + error propagation**

```go
import "golang.org/x/sync/errgroup"

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
}
```

**sync primitives — Mutex, WaitGroup, Once, Pool**

```go
// WaitGroup — wait for N goroutines to finish
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
defer bufPool.Put(buf)
```

## Testing Patterns

**testing package — table-driven tests**

```go
func TestAdd(t *testing.T) {
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
// Race detector: go test -race
```

**testify — assertions + mocks**

```go
import (
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
}
```

**rapid — property-based testing**

```go
import "pgregory.net/rapid"

func TestSortIdempotent(t *testing.T) {
  rapid.Check(t, func(t *rapid.T) {
    xs := rapid.SliceOf(rapid.Int()).Draw(t, "xs")
    once := Sorted(xs)
    twice := Sorted(once)
    assert.Equal(t, once, twice)
  })
}

// Run: go test -run TestSortIdempotent
// rapid shrinks failing cases to the minimal reproducer.
```

**httptest + goleak — HTTP + goroutine leak tests**

```go
import (
  "net/http/httptest"
  "go.uber.org/goleak"
)

// Mock HTTP server
srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  w.WriteHeader(200)
  w.Write([]byte(`{"id":42}`))
}))
defer srv.Close()

// Detect goroutine leaks in tests
func TestMain(m *testing.M) {
  goleak.VerifyTestMain(m)  // fails if any goroutine leaks
}
```

## Performance Tuning

- Goroutine stack starts at 2KB and grows on demand — millions of goroutines fit in <10GB; the runtime multiplexes them onto OS threads (GOMAXPROCS).
- GC is concurrent, low-pause (~sub-ms for <1GB heap), targets 2x live heap growth; tunable via GOGC (default 100) or GOMEMLIMIT (1.19+).
- Escape analysis decides stack vs heap — `go build -gcflags=-m` shows what escapes; passing pointers can force heap allocation.
- Map lookup is O(1) avg; iteration order is randomized (intentional, do not rely on it).
- Slice header is 24 bytes (ptr, len, cap) — passed by value but shares the backing array; appends may reallocate and detach.
- Interfaces cost a (type, value) pair — small but real; hot loops should accept concrete types where possible.
- Reflection (`reflect`) is 10–100x slower than direct access; prefer code generation (e.g., easyjson) for hot paths.
- Generics (1.18+) use GC shape stenciling — value types are not boxed; performant, but compile time grows with type diversity.
- `context.TODO()` is a smell in production code; every I/O function should accept a real context.Context as its first parameter.
- Defer has near-zero cost since 1.14 (open-coded defers for ≤8 defers in a function); don't avoid it for perf.
- Build with `-trimpath -ldflags='-s -w'` for reproducible smaller binaries; CGO_ENABLED=0 for static binaries (cross-compile friendly).
- Go modules: GOPROXY defaults to proxy.golang.org; GOVERSION/GOOS/GOARCH determine build target; reproducible builds use go.sum.
- pprof is built-in — `import _ "net/http/pprof"` + go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30.
- strings.Builder is 3-5x faster than `s += ...` in a loop — use it for any non-trivial concatenation.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [go (the toolchain)](https://go.dev/cmd/go/) | The Go tool — `go build`, `go test`, `go vet`, `go fmt`. Batteries included; no Makefile needed. | build |
| [Go modules](https://go.dev/ref/mod) | Built-in dependency manager — go.mod, go.sum, GOPROXY; replaced every previous attempt (dep, glide, godep). | package |
| [golangci-lint](https://golangci-lint.run/) | Meta-linter aggregating 50+ analyzers — the de-facto standard for Go CI. | lint |
| [go vet](https://pkg.go.dev/cmd/vet) | Built-in static analyzer — catches common mistakes (printf format, struct tags, locks). | lint |
| [gofmt / gofmt -s](https://pkg.go.dev/cmd/gofmt) | Built-in formatter — universal, opinion-free; one Go format worldwide. | lint |
| [testing (stdlib)](https://pkg.go.dev/testing) | Built-in test runner — `go test`; table-driven tests, benchmarks, race detector. | test |
| [testify](https://github.com/stretchr/testify) | Assertion + mock library — the most-used third-party test helper. | test |
| [rapid](https://github.com/flyingmutant/rapid) | Property-based testing for Go — Hypothesis-style shrinking. | test |
| [goleak](https://github.com/uber-go/goleak) | Goroutine leak detector for tests — Uber's standard for concurrent code. | test |
| [delve (dlv)](https://github.com/go-delve/delve) | Source-level debugger for Go — better than GDB for goroutines. | debug |
| [pprof](https://pkg.go.dev/net/http/pprof) | Built-in CPU/memory/goroutine profiler — net/http/pprof + go tool pprof. | debug |
| [go test -race](https://go.dev/doc/articles/race_detector) | Built-in race detector — catches data races at runtime; always run in CI. | debug |
| [Air / entr](https://github.com/cosmtrek/air) | Hot-reload dev servers — re-run on file change; common in local dev. | build |
| [ko / go-releaser](https://goreleaser.com/) | Build + release tools — ko for container images from Go source; goreleaser for cross-platform binaries. | deploy |
| [Docker / Kubernetes](https://kubernetes.io/) | Container packaging + orchestration — the dominant deploy target for Go services. | deploy |
| [buf](https://buf.build/) | Protobuf + gRPC toolchain — schema management, linting, breaking-change detection. | build |
| [sqlc](https://sqlc.dev/) | Generates type-safe Go from SQL — compiles queries to Go code at build time. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| Go 1.0 | 2012 | First stable release — goroutines, channels, GC, interfaces. |
| Go 1.5 | 2015 | Self-hosted compiler (bootstrapped), concurrent GC, vendoring experiment. |
| Go 1.7 | 2016 | context package moved to stdlib, sub-tests and sub-benchmarks. |
| Go 1.11 | 2018 | Go modules introduced (opt-in), WebAssembly support. |
| Go 1.13 | 2019 | Error wrapping with %w / errors.Is / errors.As; modules on by default. |
| Go 1.16 | 2021 | embed package (compile-time file embedding), io/fs, modules default-on. |
| Go 1.18 | 2022 | Generics (type parameters), fuzzing built-in, workspaces — the biggest release since 1.0. |
| Go 1.20 | 2023 | errors.Join, comparable type constraint, profile-guided optimization (PGO) preview. |
| Go 1.21 | 2023 | min/max/clear builtins, slices/maps/cmp stdlib packages, log/slog structured logging. |
| Go 1.22 | 2024 | Range-over-int, per-iteration loop variable fix (finally!), enhanced net/http routing with methods+patterns. |
| Go 1.23 | 2024 | Range-over-func (iter.Seq[T] iterators), unique package, timer behavior fixes. |
| Go 1.24 | 2025 | Generic type aliases, toolchain management via go.mod, swiss-table map implementation (2-3x faster). |
| Go 1.25 | 2025 | testing/synctest for deterministic concurrency tests, encoding/json/v2 experiment (GOEXPERIMENT), GC crash-resilience work. |
| Go 1.26 | 2026 | Green Tea garbage collector becomes default; encoding/json/v2 still experimental (GOEXPERIMENT=jsonv2). |
| Go 1.27 | 2026 | Generic methods (type parameters on methods), struct-field keys as any selector, encoding/json/v2 graduates to back encoding/json, crypto/mldsa post-quantum, native uuid package, up to 30% cheaper small allocations. |

## Interview Hot Questions

1. **Explain goroutines and how they differ from OS threads.** *(medium)*

   Goroutines are user-space coroutines scheduled cooperatively by the Go runtime onto OS threads (M:N scheduler). They start at 2KB stack (grows on demand) vs ~8MB for OS threads, so millions are feasible. The runtime multiplexes them onto GOMAXPROCS OS threads; blocking syscalls are intercepted and the OS thread is handed off so others can run. Channels synchronize them — share memory by communicating.

2. **How does Go's GC work?** *(medium)*

   Concurrent mark-and-sweep, tri-color, non-generational. Targets ~sub-ms pauses for <1GB heap. Tunable via GOGC (default 100 = trigger GC at 2x live heap) and GOMEMLIMIT (1.19+, soft memory cap). Write barriers run during mark; STW only at the very start (stack scan) and end (a few hundred microseconds). No compaction — fragmentation is mitigated by spans.

3. **Why are nil interfaces not the same as interfaces holding a nil pointer?** *(hard)*

   An interface value is a (type, value) pair. `var p *T = nil; var i I = p` makes i hold (type=*T, value=nil) — i is NOT the nil interface. `i == nil` is false. This is the #1 Go bug: a function returning a typed nil pointer wrapped in an interface returns a non-nil error. Fix: return bare nil from the function when there's no error, or check the concrete pointer for nil first.

4. **How do generics work in Go?** *(medium)*

   Go 1.18+ generics use type parameters with constraints (interfaces). The compiler uses GC shape stenciling: one specialization per GC shape (pointer-sized types share, distinct value types get distinct code) — avoids both monomorphization bloat and boxing. Constraints are interfaces; the `any` alias is `interface{}`. Standard constraints live in cmp (Ordered) and the exp packages. Compile time grows with type diversity but binary size stays modest.

5. **Explain context.Context — when and why?** *(medium)*

   Context carries deadlines, cancellation, and request-scoped values across API boundaries. Convention: first parameter, named ctx. Use context.WithTimeout/WithCancel for I/O timeouts, context.Background at the top of call chains (main, tests, request handlers). Never store contexts in structs. Cancellation propagates to children. Values are a last resort — prefer explicit parameters.

6. **What's the difference between `errors.Is` and `errors.As`?** *(easy)*

   errors.Is walks the wrap chain comparing identity to a target (sentinel error). errors.As walks the chain looking for an error assignable to a target type, and assigns it. Use Is for sentinel errors (io.EOF, context.DeadlineExceeded); use As for typed errors you want to inspect fields on (e.g. *NotFoundError). Both unwrap recursively via the optional Unwrap() method.

7. **Why does a slice share its backing array after append?** *(medium)*

   A slice header is (ptr, len, cap). Append writes to ptr[len] and increments len — if len < cap, no reallocation. So `s2 := append(s1, x)` may have s1 and s2 sharing storage; mutating s2 can affect s1's later elements. Append reallocates only when len reaches cap, doubling capacity. To detach: `s2 := append([]T(nil), s1...)` or `slices.Clone(s1)` (1.21+).

8. **How does the Go scheduler work?** *(hard)*

   M:N scheduler with G (goroutine), M (OS thread), and P (processor, a scheduling context). GOMAXPROCS Ps are active; each P has a local run queue (256 deep) plus a global queue. When a G blocks on a syscall, the M is parked and its P moves to another M to keep running Gs. Work-stealing: idle Ps steal from other Ps' queues. Preemption (1.14+) at function prologue + async safepoints, so tight loops no longer freeze the scheduler.

9. **How would you detect a goroutine leak?** *(medium)*

   Run go.uber.org/goleak in TestMain — it asserts no goroutines are left after each test. For production, expose pprof's goroutine endpoint (`/debug/pprof/goroutine`) and inspect with `go tool pprof`. Symptoms: rising goroutine count, climbing memory, eventual OOM. Common causes: unbuffered channels with no reader, missing context cancellation, time.After in a tight loop (leaks until the timer fires).

10. **When should you use a pointer receiver vs a value receiver?** *(easy)*

   Pointer receiver when the method mutates the receiver, the struct is large (avoid copy), or you need shared mutable state. Value receiver when the struct is small and immutable, or you want the method to work on both T and *T (Go auto-promotes value to pointer). Pick one per type and stick with it — mixing leads to interface-implementation confusion. The standard library mostly uses pointer receivers for non-trivial types.

## When to Choose This

- **vs Rust:** use this — Cloud-native services, CLIs, ops tooling — anywhere simplicity, fast builds, and goroutines beat static safety.; use that — Systems software, embedded, memory-safety-critical code, anywhere you'd pay for the borrow checker's safety.
- **vs Java:** use this — Microservices, CLIs, distributed systems — anywhere simplicity, single-binary deploys, and fast startup win.; use that — Large enterprise back-ends, big-data infrastructure (Kafka, Spark), anywhere the JVM ecosystem matters.
- **vs Python:** use this — High-throughput network services, CLIs, distributed systems — anywhere developer speed + runtime speed both matter.; use that — Data science / ML, scripting, NumPy/Pandas/PyTorch workloads — the ecosystem is the product.
- **vs Node.js / TypeScript:** use this — Network services, ops tooling, distributed systems where stable ABI + goroutines beat async ergonomics.; use that — Frontend + backend sharing one language, real-time web, anything that needs the npm ecosystem.
- **vs C:** use this — Application-level services, CLIs, network daemons — anywhere productivity + GC are acceptable.; use that — Kernels, embedded firmware, FFI libraries, anywhere ABI stability and tiny toolchain matter most.

