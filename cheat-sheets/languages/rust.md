# Rust

**Category:** Languages · **Tier:** Tier 1 · Core · **Tags:** static-typing, compiled, memory-safe, zero-cost, ownership, systems, concurrent · **First released:** 2010 · **Author:** Mozilla (Graydon Hoare) · **Last updated:** 2026-11

> A memory-safe systems language with no GC — the modern default for performance-critical, low-latency, and security-sensitive code.

---

## TL;DR

- Rust is a statically-typed, compiled, memory-safe systems language that achieves safety without a garbage collector through ownership, borrowing, and lifetimes — all enforced at compile time.
- It has become the default for new systems software: browsers (Firefox Servo/Quantum), operating systems (Linux kernel modules, Windows core, Redox), CLI tools (ripgrep, fd, bat), crypto (Solana, Diem), embedded, WebAssembly, and high-performance daemons (Cloudflare, Discord, AWS Firecracker).
- Reach for Rust when you need C++-level performance without UB footguns, when memory safety is a hard requirement (security, embedded, kernels), or when you target WebAssembly with predictable performance.
- Avoid Rust for prototyping where iteration speed matters, for domains with rich ecosystems in other languages (data science — Python), or when compile times and learning curve aren't worth the safety payoff.

## Core Mental Model

**Every value has one owner; borrows are checked at compile time.** Rust's central rule: each value has exactly one owning variable, and when that variable goes out of scope the value is dropped (deterministic, no GC). You can lend the value via `&T` (shared, read-only, many at once) or `&mut T` (exclusive, writable, one at a time) — the borrow checker enforces these aliasing rules at compile time, which is why a Rust program that compiles will not have data races or use-after-free. Lifetimes (`'a`) track how long a reference is valid relative to other references; most are inferred, but function signatures sometimes need explicit ones. This trinity — ownership, borrows, lifetimes — replaces RAII + smart pointers + manual reasoning, and is what makes Rust safe without runtime cost.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| let mut x = String::new(); | Mutable binding — x owns the String, dropped at scope end. | Default for owned, mutable data. Use `let` (immutable) unless you need mutation. |
| fn f(s: &str) -> usize | Borrows a string slice; no ownership transfer, no allocation. | Reading strings — always prefer `&str` over `&String` in function signatures. |
| fn f<T: Clone>(x: &T) | Generic with trait bound — T must implement Clone. | Reusable algorithms. Use `where` clause for complex bounds. |
| Box<T>, Rc<T>, Arc<T> | Heap single-owner / shared / atomic-shared reference-counted pointers. | Box for recursion/sizing, Rc for single-threaded graphs, Arc for cross-thread sharing. |
| enum Result<T, E> { Ok(T), Err(E) } | Sum type returned by fallible operations; never throws. | All recoverable errors — `?` propagates automatically. |
| impl Trait for Type { ... } | Adds methods to a type satisfying a trait; can be in any crate with orphan rules. | Type classes, polymorphism — the Rust equivalent of interfaces + extension methods. |
| match x { Some(n) => n, None => 0 } | Exhaustive pattern match; compiler enforces all cases covered. | Branching on enums, destructuring, type narrowing. |
| async fn f() -> Result<T, E> | Returns a Future that resolves to Result; `await` drives it. | Async I/O — Tokio/async-std runtime required. |
| trait Iterator { type Item; fn next(&mut self) -> Option<Self::Item> } | Associated type — one Item per implementing type, no need to parameterize. | Traits with one logical output type; cleaner than generic params. |
| &'a T, &'a mut T | Lifetime parameter — reference valid for at least 'a. | Function signatures returning references; mostly inferred for locals. |
| Arc<Mutex<T>> / Arc<RwLock<T>> | Interior mutability behind shared ownership — lock to mutate across threads. | Cross-thread shared mutable state; the standard recipe for concurrent data. |
| #[derive(Debug, Clone, Serialize)] | Derive macro — auto-implements traits. | Boilerplate elimination; serde uses this for (de)serialization. |

## Idiomatic Patterns

**Ownership + borrow + lifetime — the canonical owned-vs-borrowed split**

```rust
struct User<'a> {
    name: &'a str,           // borrows, doesn't own
    email: String,           // owns
}

impl<'a> User<'a> {
    fn display(&self) -> String {
        format!("{} <{}>", self.name, self.email)
    }
}

fn main() {
    let name = String::from("Alice");        // owned String on the heap
    let u = User { name: &name, email: name.clone() };
    // name outlives u — borrow checker verifies this
    println!("{}", u.display());
}  // u dropped, then name dropped — order is reverse of declaration
```

**Result + `?` operator — error propagation without macros**

```rust
#[derive(Debug)]
enum AppError {
    Io(std::io::Error),
    Parse(serde_json::Error),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { Self::Io(e) }
}
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self { Self::Parse(e) }
}

fn load_config(path: &str) -> Result<Config, AppError> {
    let raw = std::fs::read_to_string(path)?;   // io::Error → AppError
    let cfg: Config = serde_json::from_str(&raw)?; // json::Error → AppError
    Ok(cfg)
}

// Caller decides strategy:
match load_config("app.json") {
    Ok(c) => run(c),
    Err(e) => eprintln!("error: {e:?}"),
}
```

**Trait + generics — static dispatch with zero-cost abstraction**

```rust
trait Repository {
    type Item;
    fn get(&self, id: u64) -> Option<&Self::Item>;
}

struct UserRepo {
    users: Vec<User>,
}

impl Repository for UserRepo {
    type Item = User;
    fn get(&self, id: u64) -> Option<&User> {
        self.users.iter().find(|u| u.id == id)
    }
}

// Monomorphized per concrete repo — fully inlined, no vtable.
fn handler<R: Repository>(repo: &R, id: u64) -> Option<&R::Item> {
    repo.get(id)
}
```

**Arc + Mutex — shared mutable state across threads**

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counters = Arc::new(Mutex::new(vec![0u64; 10]));

    let handles: Vec<_> = (0..8)
        .map(|_| {
            let c = Arc::clone(&counters);
            thread::spawn(move || {
                for _ in 0..1000 {
                    let mut guard = c.lock().unwrap();
                    guard[0] += 1;
                }  // guard dropped here, mutex unlocked
            })
        })
        .collect();

    for h in handles { h.join().unwrap(); }
    println!("{}", counters.lock().unwrap()[0]);  // 8000
}
```

## Common Pitfalls

1. **Fighting the borrow checker on aliasing** — *Symptom:* `let r = &v[0]; v.push(1);` is rejected: `v.push` needs `&mut v`, but `r` holds `&v`. Real code hits this with iterators that borrow the same collection they're modifying. *Fix:* Scope borrows tightly; collect into a Vec first; restructure to compute indices, drop the borrow, then mutate. The borrow checker is right — it's catching a real potential UB.
2. **Lifetime mismatch on returned references** — *Symptom:* `fn f(x: &A, y: &B) -> &C` — the compiler can't tell which input the output lives as long as. Error: 'missing lifetime specifier'. *Fix:* Annotate explicitly: `fn f<'a>(x: &'a A, y: &B) -> &'a C` — declare that the output's lifetime is tied to `x`. Most lifetimes are inferred; only function signatures sometimes need annotation.
3. **Clone hides algorithmic inefficiency** — *Symptom:* Sprinkling `.clone()` to satisfy the borrow checker turns O(n) into O(n²) — e.g. cloning a Vec in a hot loop. *Fix:* Reach for `&`/`&mut` first; only clone when you genuinely need a copy. Run clippy with `-W clippy::redundant_clone`. Clone on String/Vec is O(n).
4. **Deadlock via nested Mutex locks** — *Symptom:* Acquiring two locks in different orders across threads deadlocks — Rust's safety guarantees do not extend to lock ordering. *Fix:* Lock in a consistent global order; prefer a single coarse Mutex over fine-grained locks; use `parking_lot::Mutex` (no poisoning, faster) and channels for message-passing designs.
5. **Blocking inside async stalls the runtime** — *Symptom:* `std::thread::sleep` or `std::fs::read` inside an async function blocks the worker thread — Tokio's other tasks on that thread stall, latency spikes. *Fix:* Use `tokio::time::sleep`, `tokio::fs::read`, or `spawn_blocking` for CPU-bound or sync-IO work. The runtime doesn't preempt — cooperation is mandatory.
6. **`unwrap()` panics in production** — *Symptom:* `x.unwrap()` aborts the thread on None/Err — fine in tests, often catastrophic in a server. Parse errors and missing keys kill the whole process if the panic propagates. *Fix:* Use `?` in fallible functions, `.unwrap_or(default)` for harmless cases, `.expect("context")` when you truly can't recover. Audit with `#![deny(clippy::unwrap_used)]` in libraries.
7. **Trait object vs generic — performance split** — *Symptom:* `fn f(x: &dyn Trait)` uses dynamic dispatch (vtable, harder to inline, ~5ns/call); `fn f<T: Trait>(x: &T)` uses static dispatch (monomorphized, inlined, but binary bloat). *Fix:* Default to generics for hot paths; use `dyn Trait` when you need type erasure (heterogeneous collections) or want to cut binary size. `Box<dyn Trait>` is the standard escape hatch.

## Production / Interview Quick Reference

- Rust 1.99.1 (Oct 2026) is current — C-variadic definitions, LLVM 23; next up is 1.100.0 (semver 1.x continues). `version`
- Edition 2021 (default) closes capture patterns in closures, fixes panic semantics; Edition 2024 (1.85+, Feb 2025) adds `gen` blocks, unsafe attributes, and stricter async fn lifetimes. `version`
- Cargo is the build tool — `cargo build --release` enables optimizations; debug builds are 10–100x slower and skip inlining. `perf`
- LLVM produces code on par with C/C++ in release mode; aggressive inlining + monomorphization are why — binary size grows with type diversity. `perf`
- Arc<T> atomic refcount increment is ~5ns; Mutex lock/unlock is ~20ns under contention — design for low contention. `perf`
- Stack vs heap: structs with known size are stack-allocated; Box/Rc/Arc/Vec/String heap-allocate. The compiler decides via escape analysis for closures. `perf`
- `String` is 24 bytes (ptr+len+cap); `&str` is 16 (ptr+len). Borrow `&str` in function signatures. `gotcha`
- Iterators compile to the same machine code as hand-written for-loops — `vec.iter().map().filter().sum()` is zero-cost vs imperative form. `perf`
- Result/Option are 1-word-larger than the inner type (discriminant + niche optimization makes Option<NonNull<T>> 8 bytes, not 16). `perf`
- `unsafe` opts out of borrow checking only at the marked block — Rust's safety is a closed-world property; one `unsafe` block can break the whole program. `gotcha`
- Miri (`cargo +nightly miri test`) interprets your code to catch UB in unsafe code — run it for any `unsafe` block. `gotcha`
- Async functions are zero-cost — they compile to state machines; no allocation if not boxed (Box<dyn Future> or Pin<Box<...>>). `perf`
- Crates.io is the registry; semver is enforced by cargo; MSRV (minimum supported Rust version) is a real contract — declare it in Cargo.toml. `version`
- Cross-compilation via `cargo build --target` plus cross-toolchain; `cross` Docker container handles most targets out of the box. `style`

## Go Deeper

- [The Rust Programming Language (The Book)](https://doc.rust-lang.org/book/) — The official, free canonical introduction — required reading for ownership, borrows, and lifetimes.
- [Rust Reference](https://doc.rust-lang.org/reference/) — The authoritative language reference; definitive on type system, memory model, and unsafe semantics.
- [Rustonomicon](https://doc.rust-lang.org/nomicon/) — The dark-arts manual for unsafe Rust — required reading before writing any `unsafe` block.
- [Rust for Rustaceans (Jon Gjengset)](https://rust-for-rustaceans.com/) — The advanced follow-up to The Book — interior mutability, async internals, and production patterns.
- [Zero To Production in Rust (Luca Palmieri)](https://www.zero2prod.com/) — Best end-to-end treatment of building a real production web service in Rust (axum + sqlx + tracing).

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| i8 / i16 / i32 / i64 / i128 / isize | Signed integers of fixed width; isize is pointer-sized (32 or 64 bits). | Default i32. Use usize for indices, i64 for IDs/timestamps, i128 for big numbers. |
| u8 / u16 / u32 / u64 / u128 / usize | Unsigned integers. usize is the canonical index/length type — required for indexing. | Indices, sizes, raw bytes (u8). Use usize for any array index. |
| f32 / f64 | IEEE-754 single/double. f64 is the default. | Math. Rust has no implicit float promotion — annotate the literal. |
| bool | true / false. 1 byte. No truthy/falsy — `if x` requires bool. | Logic. `if 0` is a compile error, not false. |
| char | 4-byte Unicode SCALAR VALUE (not a UTF-16 unit, not a grapheme). | Single code points. Strings are UTF-8 bytes — char ≠ byte. For graphemes use unicode-segmentation. |
| &str / String | &str is a borrowed UTF-8 slice (ptr+len); String is an owned, growable UTF-8 buffer (ptr+len+cap). | Borrow &str in function args; own String when you need to mutate or store. Never use String for byte buffers — Vec<u8>. |
| [T; N] / &[T] / &mut [T] | Fixed-size array / shared slice / mutable slice. Slices are fat pointers (ptr+len). | Fixed-size arrays for buffers; slices as function args (borrow any array/Vec). |
| () | Unit type — the type with exactly one value, also written (). The default return type. | Functions that return nothing. Comparable to void in C, but is a real type. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Vec<T> | Dynamic heap array — amortized O(1) push, O(n) insert. Default dynamic collection. | Default dynamic sequence. reserve() before bulk pushes to avoid realloc. |
| &[T] / &mut [T] | Borrowed slice — fat pointer (ptr+len). Works on Vec, array, or any contiguous storage. | Function arguments — accept &[T] for read, &mut [T] for in-place mutation. |
| String | Owned UTF-8 string. Deref to &str for borrowing. 24 bytes (ptr+len+cap). | Owned text. Use String::from or .to_string() to construct; push_str/extend to grow. |
| HashMap<K, V> / BTreeMap<K, V> | Hash map (O(1) avg) / red-black tree (O(log n), sorted by key). | HashMap for plain lookup; BTreeMap for sorted iteration or range queries. |
| HashSet<T> / BTreeSet<T> | Hash / tree-backed set — no duplicates. | Dedup, membership. HashSet is O(1) avg; BTreeSet is sorted, O(log n). |
| VecDeque<T> | Ring buffer — O(1) push/pop at both ends. Backed by a contiguous ring. | Queues, worklists. Faster than LinkedList (which is rare in Rust). |
| LinkedList<T> | Doubly-linked list — exists for API completeness; almost always the wrong choice. | Almost never. Use VecDeque or Vec. Pinning + interior mutability makes linked lists awkward in safe Rust. |
| &str (slice) | Borrowed UTF-8 string slice — 16 bytes (ptr+len). Always valid UTF-8. | Function arguments. The fundamental text-borrowing type — never take &String in signatures. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| struct S { x: i32 } | Named-field struct — value type, dropped at scope end. Default derive: nothing. | Default composite type. Add #[derive(Debug, Clone)] for ergonomics. |
| tuple struct S(i32, String); | Struct with unnamed fields — accessed by .0, .1. Like a tuple with a name. | Newtypes (S(i32) wraps an i32) — distinguishes types at compile time. |
| enum E { A, B(i32), C { x: i32 } } | Sum type — each variant may carry data. Pattern match exhaustively with match. | Closed value sets, sum types, state machines. The killer Rust feature. |
| Option<T> | enum Option<T> { Some(T), None } — the idiomatic maybe-absent. | Optional values, null replacement. The compiler forces you to handle None. |
| Result<T, E> | enum Result<T, E> { Ok(T), Err(E) } — the error type. `?` propagates Err. | All recoverable errors. Never panic for expected failures — return Result. |
| trait T { fn m(&self); } | Trait — a set of methods a type can implement. Used as bounds or trait objects. | Polymorphism, type classes. The Rust equivalent of interfaces + extension methods. |
| impl Trait for Type { ... } | Implement a trait on a type — anywhere in the same crate (orphan rule). | Adding methods to existing types; satisfying generic bounds. |
| type Alias = T; | Type alias — same type, just a new name. No new methods, no nominal distinction. | Shortening long signatures. For nominal distinctions, use a newtype (tuple struct). |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b, a % b | Arithmetic — panics on overflow in debug, wraps in release. Integer / truncates. | Math. Use checked_/wrapping_/saturating_ methods for explicit overflow behavior. |
| a == b, a != b | Equality — derived for types that implement PartialEq. Compares by value, not identity. | Use derive(PartialEq, Eq) for custom types. Floats implement only PartialEq (NaN != NaN). |
| a < b, a > b, a <= b, a >= | Comparison — derived for types that implement PartialOrd / Ord. | Use derive(Ord) for total orderings; PartialOrd for floats (NaN has no order). |
| a && b, a \|\| b, !a | Short-circuit boolean — operands must be bool. `!` is also bitwise NOT on integers. | Logic. No truthy/falsy — `if x` is a compile error if x isn't bool. |
| a & b, a \| b, a ^ b, !a, a << n, a >> n | Bitwise AND/OR/XOR/NOT/shifts — integer types only. Signed >> is arithmetic. | Bit manipulation. The same `!` is logical NOT on bools, bitwise NOT on integers. |
| &a, &mut a, *p | Borrow (shared) / borrow (mutable) / dereference. Borrow checker enforces aliasing rules. | Passing references. `*p` is only safe inside unsafe or after deref coercion. |
| a = b, a += b, a -= b, a *= b, a /= b, a %= | Assignment / compound assignment — `a OP= b` is `a = a OP b`. | Mutation. Compiles only on mutable bindings (`let mut`). Compound ops take &mut self. |
| a ? b : c (no ternary) | Rust has NO ternary — use `if c { a } else { b }` which is an expression. | Always. `let x = if c { 1 } else { 2 };` — expressions, not statements. |
| a ? (postfix) | Error propagation — `a?` returns Err(e) if a is Err, unwraps Ok. Inside main, returns Result. | Propagating errors from fallible calls. The Rust equivalent of `try` in Swift / `?` in Swift. |
| a..b, a..=b, ..b, a.. | Range — exclusive `a..b`, inclusive `a..=b`, open `..b` / `a..`. Used in slices, for loops, match. | Slicing `xs[1..3]`, iteration `for i in 0..n`, match arms `1..=10 => ...`. |
| a.b, a.b(), a::b | Method call (.) / associated item access (::). `::` is for paths, `.` is for values. | Use `::` for static/associated items (`Vec::new()`, `String::from`); `.` for methods on values. |
| a as T | Type cast — primitive numerics only. Lossy conversions allowed (i64 → i32 truncates). | Numeric casts. For trait casts use `as &dyn Trait`; for safe conversions use From/Into. |
| &a as *const T, &mut a as *mut T | Cast reference to raw pointer — required for unsafe pointer operations. | FFI, low-level memory manipulation. The escape hatch from safe Rust. |
| match x { Pat => arm, ... } | Pattern match — exhaustive; arms checked at compile time. Refutable patterns need if let / let else. | Branching on enums, destructuring. The most important control flow in Rust. |

## Input / Output

**std::fs — small files vs streaming**

```rust
use std::fs;
use std::io::{BufRead, BufReader};

// Small file — read all at once
let text = fs::read_to_string("cfg.json")?;   // returns Result<String>
let bytes = fs::read("data.bin")?;             // returns Result<Vec<u8>>

// Large file — stream line by line, O(1) memory
let f = fs::File::open("huge.log")?;
for line in BufReader::new(f).lines() {
  let line = line?;
  if line.contains("ERROR") {
    eprintln!("{line}");
  }
}
```

**stdin / stdout / stderr**

```rust
use std::io::{self, BufRead, Write};

// Stream stdin to uppercased stdout
let stdin = io::stdin();
for line in stdin.lock().lines() {
  let line = line?;
  println!("{}", line.to_uppercase());
}

// stderr — separate stream
eprintln!("warning: deprecated API");

// Buffered writes — faster for many small writes
let stdout = io::stdout();
let mut lock = stdout.lock();
writeln!(lock, "pid={}", std::process::id())?;
```

**serde — JSON / TOML / bincode, single derive**

```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
struct User {
  id: u64,
  email: String,
  #[serde(default)] role: String,           // optional, defaults if absent
  #[serde(skip_serializing_if = "Vec::is_empty")]
  tags: Vec<String>,
}

// JSON
let json = serde_json::to_string_pretty(&user)?;
let back: User = serde_json::from_str(&json)?;

// TOML
let toml = toml::to_string(&user)?;

// bincode — compact binary, 5-10x smaller than JSON
let bytes = bincode::serialize(&user)?;
```

**reqwest — HTTP client with timeout + retries**

```rust
use reqwest::Client;
use std::time::Duration;

let client = Client::builder()
  .timeout(Duration::from_secs(10))
  .build()?;

let resp = client.get("https://api.example.com/users/42")
  .header("Accept", "application/json")
  .send().await?
  .error_for_status()?;     // returns Err on 4xx/5xx

let user: User = resp.json().await?;
// Or streaming for large bodies:
// let mut stream = resp.bytes_stream();
// while let Some(chunk) = stream.next().await { ... }
```

## Loops & Iteration

**for, while, loop — three constructs**

```rust
let v = vec![1, 2, 3];

// for over anything Iterable — idiomatic
for x in &v {              // borrow — v still usable
  println!("{x}");
}
for x in v {               // consume — v moved
  println!("{x}");
}

// Range
for i in 0..10 { /* 0..9 */ }
for i in 0..=10 { /* 0..10 */ }

// while
while queue.len() > 0 {
  process(queue.pop().unwrap());
}

// loop — infinite, break with value
let n = loop {
  if cond() { break 42; }
};
```

**Iterator trait — lazy, zero-cost pipelines**

```rust
let v = vec![1, 2, 3, 4, 5];

// Lazy pipeline — no allocation until collect()
let squares_of_evens: Vec<i32> = v.iter()
  .filter(|&&x| x % 2 == 0)
  .map(|&x| x * x)
  .collect();

// Sum / fold / reduce
let total: i32 = v.iter().sum();
let max: Option<&i32> = v.iter().max();

// take / skip / chain / zip — combinators
let first10: Vec<i32> = (1..).take(10).collect();
let pairs: Vec<_> = (0..3).zip(['a', 'b', 'c']).collect();

// Iterators compile to the same machine code as hand-written for-loops.
```

**Recursion — depth bounded by stack size**

```rust
// Recursive tree walk
fn walk(n: &Node) {
  if let Some(l) = &n.left { walk(l); }
  visit(n);
  if let Some(r) = &n.right { walk(r); }
}

// Tail-recursion is NOT optimized — convert to a loop with explicit stack
fn walk_iter(root: &Node) {
  let mut stack = vec![root];
  while let Some(n) = stack.pop() {
    visit(n);
    if let Some(r) = &n.right { stack.push(r); }
    if let Some(l) = &n.left { stack.push(l); }
  }
}

// Fibonacci — recursive is O(2^n); use iteration or memoize
fn fib(n: u64) -> u64 {
  let (mut a, mut b) = (0, 1);
  for _ in 0..n { (a, b) = (b, a + b); }
  a
}
```

**match + if let + let else — pattern dispatch**

```rust
// Exhaustive match — compiler enforces all cases
match opt {
  Some(x) => println!("got {x}"),
  None => println!("nothing"),
}

// if let — single-pattern, non-exhaustive
if let Some(x) = opt {
  println!("got {x}");
}

// let else (1.65+) — early-return on a failed pattern
let Some(x) = opt else {
  return;  // or break, or panic
};
// x is bound here

// Range patterns in match
match n {
  0 => "zero",
  1..=9 => "single digit",
  10..=99 => "double digit",
  _ => "big",
}
```

## Functions & Callables

**Functions — ownership, borrows, lifetimes**

```rust
// Borrow — function takes a reference, no ownership transfer
fn len(s: &str) -> usize { s.len() }

// Own — function takes the value, caller gives it up
fn shout(s: String) -> String { format!("{}!", s.to_uppercase()) }

// Mut borrow — function can mutate through the reference
fn push(buf: &mut Vec<u8>, byte: u8) { buf.push(byte); }

// Lifetime annotation — output lives as long as input
fn first<'a>(s: &'a str) -> &'a str {
  s.split(',').next().unwrap_or(s)
}

// Default return is unit (); explicit -> T for anything else
fn add(a: i32, b: i32) -> i32 { a + b }
```

**Closures + Fn / FnMut / FnOnce**

```rust
// Closure — captures variables by reference (default), or move
let n = 10;
let above = |x: i32| x > n;          // borrows n
let above_move = move |x: i32| x > n; // moves n in

// Three closure traits (the function-call hierarchy):
// FnOnce  — consumes captured vars; callable at most once
// FnMut   — mutates captured vars; callable multiple times
// Fn      — only reads captured vars; callable any number of times

// Higher-order functions
fn map<T, U>(xs: Vec<T>, f: impl Fn(T) -> U) -> Vec<U> {
  xs.into_iter().map(f).collect()
}
```

**Generics — bounds, where clauses, lifetimes**

```rust
// Generic with trait bound
fn max<T: PartialOrd>(a: T, b: T) -> T {
  if a > b { a } else { b }
}

// where clause — cleaner for complex bounds
fn sum<T>(xs: &[T]) -> T
where T: Copy + std::ops::Add<Output = T> + Default
{
  xs.iter().copied().fold(T::default(), |a, b| a + b)
}

// Lifetime + generic together
fn first_match<'a, T: PartialEq>(haystack: &'a [T], needle: &T) -> Option<&'a T> {
  haystack.iter().find(|x| **x == *needle)
}

// Trait objects (dynamic dispatch) vs generics (static dispatch, monomorphized)
fn dyn_dispatch(xs: &mut [Box<dyn Display>]) { /* ... */ }
fn stat_dispatch<T: Display>(xs: &mut [T]) { /* ... */ }
```

**Iterators + combinators — the functional style**

```rust
// Custom iterator — implement Iterator trait
struct Counter { count: u32 }
impl Iterator for Counter {
  type Item = u32;
  fn next(&mut self) -> Option<Self::Item> {
    self.count += 1;
    if self.count <= 5 { Some(self.count) } else { None }
  }
}

// Use with all the combinators
let total: u32 = Counter { count: 0 }
  .map(|x| x * x)
  .filter(|x| x % 2 == 0)
  .sum();
// total = 4 + 16 = 20

// collect into different containers via turbofish
let v: Vec<_> = (1..=5).collect();
let s: std::collections::HashSet<_> = (1..=5).collect();
```

## Error Handling

**Result<T, E> + ? — error propagation without macros**

```rust
use std::fs;
use std::io;

// ? operator — propagates Err, unwraps Ok
fn read_config(path: &str) -> io::Result<String> {
  let text = fs::read_to_string(path)?;   // io::Error propagates
  Ok(text)
}

// Multiple error types — convert via From
fn load(path: &str) -> Result<Config, AppError> {
  let text = fs::read_to_string(path)?;   // io::Error -> AppError via From
  let cfg: Config = serde_json::from_str(&text)?;  // json::Error -> AppError
  Ok(cfg)
}

// Main can return Result — exit code on Err
fn main() -> Result<(), Box<dyn std::error::Error>> {
  let cfg = load("app.json")?;
  run(cfg)
}
```

**Custom error enum + thiserror for derive**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),

  #[error("parse error: {0}")]
  Parse(#[from] serde_json::Error),

  #[error("not found: {what} {id}")]
  NotFound { what: String, id: u64 },

  #[error("unauthorized")]
  Unauthorized,
}

// Use like any error
fn find_user(id: u64) -> Result<User, AppError> {
  let text = std::fs::read_to_string("users.json")?;  // io -> AppError
  let users: Vec<User> = serde_json::from_str(&text)?;  // json -> AppError
  users.into_iter().find(|u| u.id == id)
    .ok_or(AppError::NotFound { what: "user".into(), id })
}
```

**Option<T> — null replacement, must be handled**

```rust
// Option<T> — Some(t) or None. No null references in Rust.
fn find(xs: &[i32], target: i32) -> Option<usize> {
  xs.iter().position(|&x| x == target)
}

// Match
match find(&v, 42) {
  Some(i) => println!("at {i}"),
  None => println!("not found"),
}

// if let
if let Some(i) = find(&v, 42) {
  println!("at {i}");
}

// Convenience — unwrap_or / unwrap_or_else / map / and_then
let v = find(&v, 42).unwrap_or(0);
let name = user.map(|u| u.name).unwrap_or_default();

// NEVER use unwrap() in production — panics on None. Use ?, unwrap_or, or expect.
```

**panic! / catch_unwind — for unrecoverable bugs only**

```rust
// panic! — aborts the current thread, unwinds the stack
panic!("should never happen: {x}");

// assert! / assert_eq! / unreachable! / todo! — all panic
assert!(x > 0);
unreachable!();  // documents impossible states
todo!();         // not-yet-implemented; panics if hit

// catch_unwind — like try/catch; only catches panics, NOT unsafe UB
let result = std::panic::catch_unwind(|| risky_call());
match result {
  Ok(v) => println!("got {v:?}"),
  Err(_) => println!("panicked"),
}

// Rule: panic for programmer errors (invariants, indexing).
// Result for recoverable errors. catch_unwind only at FFI boundaries.
```

## Concurrency Model

**Threads — std::thread::spawn**

```rust
use std::thread;
use std::sync::{Arc, Mutex};

// Spawn an OS thread — must be 'static + Send
let data = Arc::new(Mutex::new(vec![0u64; 10]));

let handles: Vec<_> = (0..8).map(|_| {
  let data = Arc::clone(&data);
  thread::spawn(move || {
    for _ in 0..1000 {
      let mut guard = data.lock().unwrap();
      guard[0] += 1;
    }  // guard dropped here, mutex unlocked
  })
}).collect();

for h in handles { h.join().unwrap(); }
println!("{}", data.lock().unwrap()[0]);  // 8000
```

**Channels — std::sync::mpsc + crossbeam**

```rust
use std::sync::mpsc;
use std::thread;

// mpsc — multiple producer, single consumer
let (tx, rx) = mpsc::channel();
for i in 0..4 {
  let tx = tx.clone();
  thread::spawn(move || tx.send(i).unwrap());
}
drop(tx);  // close — rx ends when all senders drop

while let Ok(v) = rx.recv() {
  println!("got {v}");
}

// crossbeam-channel — multi-producer multi-consumer, faster
// let (s, r) = crossbeam_channel::unbounded();
```

**async/await + Tokio — the standard async stack**

```rust
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let listener = TcpListener::bind("127.0.0.1:8080").await?;

  loop {
    let (socket, _) = listener.accept().await?;
    // Each connection runs as a task — cooperatively scheduled
    tokio::spawn(async move {
      // ... handle socket ...
    });
  }
}

// '?' works in async; await suspends without blocking the worker thread.
// NEVER call std::thread::sleep or std::fs::read in async —
// use tokio::time::sleep / tokio::fs::read instead, or spawn_blocking.
```

**Send + Sync — the trait bounds for thread safety**

```rust
// Send — a type can be moved across thread boundaries
// Sync — &T can be shared across threads (i.e., T is Send via reference)

// Most types are Send + Sync automatically if all their fields are.
// Examples of NOT Sync:
//   - Rc<T>  (refcount not atomic) — use Arc<T> for cross-thread
//   - Cell<T>/RefCell<T> (no synchronization) — use Mutex<T>/RwLock<T>

// Arc<Mutex<T>> — the standard recipe for shared mutable state
use std::sync::{Arc, Mutex};
let state = Arc::new(Mutex::new(0));
let s2 = Arc::clone(&state);  // atomic refcount bump
std::thread::spawn(move || {
  *s2.lock().unwrap() = 42;
});

// RwLock<T> — multiple readers OR one writer; better for read-heavy
let r = Arc::new(std::sync::RwLock::new(0));
*r.write().unwrap() = 42;     // exclusive
let _ = *r.read().unwrap();   // shared, multiple readers OK
```

## Testing Patterns

**Built-in #[test] + assert macros**

```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn add_works() {
    assert_eq!(add(1, 2), 3);
    assert!(add(0, 0) == 0);
  }

  #[test]
  #[should_panic(expected = "empty")]
  fn empty_panics() {
    pop_empty_stack();
  }

  #[test]
  fn result_return() -> Result<(), String> {
    if add(1, 1) == 2 { Ok(()) } else { Err("bad".into()) }
  }
}

// Run: cargo test
// Single test: cargo test add_works
```

**rstest + proptest — parameterized + property-based**

```rust
use rstest::rstest;

#[rstest]
#[case(1, 2, 3)]
#[case(10, 5, 15)]
#[case(-1, 1, 0)]
fn add_cases(#[case] a: i32, #[case] b: i32, #[case] expected: i32) {
  assert_eq!(add(a, b), expected);
}

use proptest::prelude::*;

proptest! {
  #[test]
  fn sort_idempotent(ref xs in prop::collection::vec(-1000i32..1000, 0..100)) {
    let once: Vec<i32> = xs.iter().copied().collect();
    let sorted: Vec<i32> = once.iter().copied().collect();
    let twice: Vec<i32> = sorted.iter().copied().collect();
    prop_assert_eq!(sorted, twice);
  }
}
```

**tokio::test + mockall — async + mocking**

```rust
use mockall::automock;

#[automock]   // generates a MockRepo with mockable methods
trait Repo {
  fn find(&self, id: u64) -> Option<User>;
}

#[tokio::test]
async fn loads_user() {
  let mut repo = MockRepo::new();
  repo.expect_find().with(eq(42))
      .returning(|_| Some(User { id: 42, name: "alice".into() }));

  let svc = UserService::new(Arc::new(repo));
  let u = svc.load(42).await.unwrap();
  assert_eq!(u.name, "alice");
}
```

**Coverage + criterion — the testing stack**

```rust
# Cargo.toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "my_bench"
harness = false

// benches/my_bench.rs
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_sum(c: &mut Criterion) {
  let v: Vec<i32> = (0..1000).collect();
  c.bench_function("sum_iter", |b| b.iter(|| v.iter().sum::<i32>()));
}

criterion_group!(benches, bench_sum);
criterion_main!(benches);

// Coverage: cargo install cargo-tarpaulin; cargo tarpaulin
```

## Performance Tuning

- Cargo is the build tool — `cargo build --release` enables optimizations; debug builds are 10–100x slower and skip inlining.
- LLVM produces code on par with C/C++ in release mode; aggressive inlining + monomorphization are why — binary size grows with type diversity.
- Arc<T> atomic refcount increment is ~5ns; Mutex lock/unlock is ~20ns under contention — design for low contention.
- Stack vs heap: structs with known size are stack-allocated; Box/Rc/Arc/Vec/String heap-allocate. The compiler decides via escape analysis for closures.
- `String` is 24 bytes (ptr+len+cap); `&str` is 16 (ptr+len). Borrow `&str` in function signatures.
- Iterators compile to the same machine code as hand-written for-loops — `vec.iter().map().filter().sum()` is zero-cost vs imperative form.
- Result/Option are 1-word-larger than the inner type (discriminant + niche optimization makes Option<NonNull<T>> 8 bytes, not 16).
- `unsafe` opts out of borrow checking only at the marked block — Rust's safety is a closed-world property; one `unsafe` block can break the whole program.
- Miri (`cargo +nightly miri test`) interprets your code to catch UB in unsafe code — run it for any `unsafe` block.
- Async functions are zero-cost — they compile to state machines; no allocation if not boxed (Box<dyn Future> or Pin<Box<...>>).
- Crates.io is the registry; semver is enforced by cargo; MSRV (minimum supported Rust version) is a real contract — declare it in Cargo.toml.
- Cross-compilation via `cargo build --target` plus cross-toolchain; `cross` Docker container handles most targets out of the box.
- Clippy is the standard linter — `cargo clippy -- -W clippy::all` catches dozens of footguns; some teams enforce `#![deny(clippy::all)]`.
- Profile with `cargo flamegraph` (perf-based) or `cargo instruments` (macOS); avoid premature optimization — measure first.
- Smallvec stores N elements inline — avoids heap allocation in the common case; 2-5x faster than Vec for short arrays.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [cargo](https://doc.rust-lang.org/cargo/) | The build tool + package manager + test runner — `cargo build`, `cargo test`, `cargo run`. Batteries included. | build |
| [rustup](https://rustup.rs/) | Rust toolchain manager — installs Rust, manages versions, components, and targets. | build |
| [crates.io](https://crates.io/) | The Rust package registry — publishes and serves crates; cargo fetches from here by default. | package |
| [rust-analyzer](https://rust-analyzer.github.io/) | The LSP server for Rust — powers VS Code, Neovim, and other editors. Fast, accurate. | build |
| [clippy](https://doc.rust-lang.org/clippy/) | The standard linter — ~700 lints catching idiomatic and correctness issues. Run in CI. | lint |
| [rustfmt](https://github.com/rust-lang/rustfmt) | The official formatter — opinion-free, universal; one Rust format worldwide. | lint |
| [cargo-deny](https://embarkstudios.github.io/cargo-deny/) | Cargo plugin for license, advisory, and ban checks — pins dependencies and catches CVEs. | lint |
| [cargo-audit](https://rustsec.org/) | Scans Cargo.lock for known vulnerabilities in dependencies. | lint |
| [rustc (built-in)](https://doc.rust-lang.org/rustc/) | The compiler — `cargo test` runs #[test] functions; benchmark support via #[bench]. | test |
| [rstest](https://github.com/la10736/rstest) | Parameterized + fixture-based testing — pytest-style for Rust. | test |
| [proptest](https://proptest-rs.github.io/proptest/) | Property-based testing — Hypothesis-style shrinking for Rust. | test |
| [mockall](https://github.com/asomers/mockall) | Mocking framework — generates mockable versions of traits via #[automock]. | test |
| [criterion](https://bheisler.github.io/criterion.rs/) | Statistical microbenchmark library — the standard for Rust; HTML reports. | test |
| [cargo-tarpaulin](https://github.com/xd009642/tarpaulin) | Code coverage tool — runs tests and reports line/branch coverage. | test |
| [Miri](https://github.com/rust-lang/miri) | UB interpreter — runs your tests under an abstract machine to catch undefined behavior in unsafe code. | debug |
| [cargo-flamegraph](https://github.com/flamegraph-rs/flamegraph) | CPU profiler — generates flamegraphs via perf/DTrace. | debug |
| [rust-gdb / lldb](https://doc.rust-lang.org/gdb/) | Source-level debuggers — rust-gdb has Rust-specific pretty printers. | debug |
| [Docker / Kubernetes](https://kubernetes.io/) | Container packaging — most Rust services ship as a tiny static binary in a scratch/distroless image. | deploy |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.1 | 2012 | First public release by Mozilla (Graydon Hoare) — initially a personal project. |
| 1.0 | 2015 | First stable release — ownership, borrows, lifetimes, traits, sum types. Stability promise. |
| 1.0 Edition 2015 | 2015 | The original edition — established the stability promise (no breaking changes). |
| 1.15 | 2017 | rustup becomes the default installer; cargo install for binaries. |
| 1.26 | 2018 | impl Trait in return position, dyn Trait, closure capture improvements. |
| Edition 2018 | 2018 | Module system overhaul, non-lexical lifetimes (NLL), async/await preview. |
| 1.39 | 2019 | async/await stable — the biggest ergonomics improvement since 1.0. |
| Edition 2021 | 2021 | Closure capture disjoint fields, panic payloads, IntoIterator for arrays. |
| 1.58 | 2022 | Format strings capture identifiers (`{x}` instead of `{}`, x`). |
| 1.65 | 2022 | GATs (generic associated types), let-else, raw struct fields. |
| 1.70 | 2023 | OnceCell / OnceLock in std, named Cargo features. |
| 1.75 | 2023 | async fn in traits (without dyn dispatch), return-position impl Trait in traits. |
| Edition 2024 | 2025 | `gen` blocks, unsafe attributes, stricter async fn lifetimes, generic `expr` context. Released with 1.85. |
| 1.85 | 2025 | Edition 2024 stable, async closures, unsafe extern blocks formalized. |
| 1.99 | 2026 | C-variadic function definitions stable, `mod` in macro bodies, LLVM 23, Cargo `debug` profile — 1.100.0 follows on the same 1.x semver line. |

## Interview Hot Questions

1. **Explain ownership, borrows, and lifetimes.** *(medium)*

   Each value has exactly one owner; when the owner goes out of scope, the value is dropped. You can lend via `&T` (shared, many at once) or `&mut T` (exclusive, one at a time) — the borrow checker enforces aliasing rules at compile time. Lifetimes (`'a`) track how long a reference is valid relative to others; most are inferred, but function signatures sometimes need explicit ones. This trinity is what makes Rust memory-safe without a GC.

2. **What is the borrow checker, and why does it reject code?** *(hard)*

   The borrow checker is a compile-time analysis that enforces Rust's aliasing rules: many shared borrows OR one mutable borrow, never both. It rejects code that could lead to data races or use-after-free. Common rejections: holding a `&T` while mutating via `&mut T`, returning a borrow that outlives the borrowed value. The checker is conservative — sometimes you need to refactor (collect into a Vec, scope borrows tightly, use indices instead of references).

3. **What's the difference between `String` and `&str`?** *(easy)*

   `String` is an owned, growable UTF-8 buffer (24 bytes: ptr+len+cap, heap-allocated). `&str` is a borrowed slice (16 bytes: ptr+len, points into someone else's memory). Always take `&str` in function args — it accepts both `&String` (via Deref) and string literals. Return `String` when you produce text, `&str` when you slice existing text. Never use String for byte buffers — use `Vec<u8>`.

4. **Explain `Box<T>`, `Rc<T>`, and `Arc<T>`.** *(medium)*

   `Box<T>` is a single-owner heap pointer — when it drops, T drops. Use for recursion, sizing, or moving large values. `Rc<T>` is non-atomic shared ownership for single-threaded code — refcount increments on clone, T drops when count hits 0. `Arc<T>` is the atomic version for cross-thread sharing — same semantics, thread-safe (slightly slower). Break cycles with `Weak<T>`. Default to Box; use Rc/Arc only when you genuinely need shared ownership.

5. **How does Rust achieve memory safety without a GC?** *(medium)*

   Three mechanisms: (1) Ownership — every value has one owner; drop on scope exit. (2) Borrow checking — aliasing rules enforced at compile time prevent data races and use-after-free. (3) Lifetimes — track reference validity at compile time. No runtime cost; safety is a compile-time property. For cases the static checker can't handle (FFI, self-referential structs, graphs), use Rc/Arc/RefCell/unsafe — opt-in to runtime checks or escape hatches.

6. **What's the difference between `Send` and `Sync`?** *(medium)*

   `Send` means a type can be moved across thread boundaries (ownership transfer). `Sync` means `&T` can be shared across threads — equivalently, `T` is `Send` when accessed via a shared reference. Most types are Send+Sync automatically if all their fields are. Notable exceptions: `Rc<T>` is Send but not Sync (refcount not atomic); `Cell<T>`/`RefCell<T>` are Send but not Sync (no synchronization); `MutexGuard<T>` is Sync but not Send (tied to the current thread).

7. **How does async/await work in Rust?** *(hard)*

   An async function compiles to a state machine implementing `Future`. `await` is a suspension point — when the future can't make progress, it returns `Poll::Pending`; the runtime polls it again later. Futures are lazy — nothing runs until you `.await` or spawn them. Unlike JS/Python, Rust has no built-in runtime; you bring your own (Tokio, async-std). The Future trait is zero-cost — no allocation unless boxed, no thread switch unless spawned.

8. **When should you use `unsafe`?** *(hard)*

   Use `unsafe` only when: (1) calling external C functions via FFI, (2) implementing low-level data structures (Vec, HashMap internals), (3) performance-critical code that the compiler can't prove safe but you can (e.g., specialized SIMD), (4) interfacing with hardware. Always wrap unsafe in a safe abstraction — the public API of your module should be safe. Run Miri on any unsafe code. Document the safety invariant in a SAFETY comment.

9. **What's the difference between traits and interfaces?** *(medium)*

   Rust traits are like Haskell type classes, not Java interfaces. (1) Traits can have default methods, associated types, and constants. (2) Traits are implemented explicitly (`impl T for S`) — no implicit interface satisfaction. (3) Traits can be used as bounds (static dispatch via generics) OR trait objects (dynamic dispatch via `dyn T`). (4) Orphan rule: you can implement a trait on a type only if either is local to your crate — prevents conflicts.

10. **Explain the difference between `Vec::iter()`, `into_iter()`, and `iter_mut()`.** *(easy)*

   `iter()` borrows each element (`&T`) — the Vec is still usable after. `into_iter()` consumes the Vec and yields owned `T`s (or `&T` in recent editions — use `Vec::into_iter` for clarity). `iter_mut()` yields `&mut T` — you can mutate elements in place. Pick based on whether you need read-only, mutate-in-place, or consume. The for-loop desugars to `into_iter()`, so `for x in v` consumes.

## When to Choose This

- **vs C++:** use this — Greenfield systems software, security-sensitive code (browsers, kernels), WebAssembly with predictable perf.; use that — Existing C++ codebases, game engines (Unreal), ML infrastructure — anywhere the ecosystem is C++.
- **vs Go:** use this — Systems software, embedded, latency-critical hot paths, WebAssembly — anywhere zero-cost abstraction matters.; use that — Cloud-native microservices, CLIs, ops tooling — anywhere simplicity, fast builds, and goroutines win.
- **vs C:** use this — New systems code where memory safety matters; modern alternative to C with no UB footguns.; use that — Kernels (Linux), embedded firmware, FFI substrate, anywhere ABI stability and tiny toolchain matter most.
- **vs Python:** use this — Systems software, WebAssembly, embedded — anywhere runtime performance matters more than ecosystem.; use that — Data science / ML, scripting, NumPy/Pandas/PyTorch workloads — the ecosystem is the product.
- **vs Zig:** use this — Production systems software with mature ecosystem (Tokio, axum, serde); anywhere library availability matters.; use that — New systems code wanting simpler semantics, no hidden control flow, C interop as a first-class goal.

