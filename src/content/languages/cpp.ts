import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "cpp",
  name: "C++",
  category: "languages",
  tier: 1,
  tags: ["static-typing", "compiled", "systems", "zero-overhead", "manual-memory", "performance"],
  tagline: "A zero-overhead, multi-parademic systems language — the default when you need performance, control, and a vast library ecosystem at once.",
  year: 1985,
  author: "Bjarne Stroustrup",

  tldr: [
    "C++ is a statically-typed, compiled, multi-paradigm language that extends C with classes, templates, exceptions, RAII, and a sprawling standard library — all while preserving the zero-overhead principle: you don't pay for what you don't use.",
    "It dominates game engines (Unreal), browsers (V8, Chromium), databases (MongoDB, MySQL), operating systems, finance (HFT), embedded systems, and ML infrastructure (PyTorch core, CUDA).",
    "Reach for C++ when you need both high performance and a rich type system, when you must ship on top of C/C++ ecosystems, or when latency budgets are measured in microseconds.",
    "Avoid C++ for greenfield web services, scripting, or quick prototyping — its compile times, ABI complexity, and footgun surface (UB, lifetime) make it the wrong tool when raw speed isn't the constraint.",
  ],

  mentalModel: {
    title: "RAII + value semantics + templates = zero-overhead abstraction",
    body: "Every resource (memory, file, lock, socket) is owned by an object whose constructor acquires and destructor releases it — Resource Acquisition Is Initialization. Stack objects destruct in reverse order at scope exit, so even exception paths clean up correctly without `finally`. Value semantics dominate: copying is deep by default, and `move` transfers ownership of internals without copying. Templates are compile-time code generation: the compiler stamps out a new function per type used, enabling inlining and specialization that no runtime dispatch can match. This trinity explains unique_ptr vs shared_ptr, why pass-by-const-ref is the default argument convention, and why header-only libraries are so common.",
  },

  constructs: [
    { syntax: "std::unique_ptr<T> p = std::make_unique<T>(args)", behavior: "Single-owner smart pointer; zero overhead vs raw pointer; deleter runs at scope exit.", when: "Default heap ownership. Never use raw `new`/`delete` in application code." },
    { syntax: "std::shared_ptr<T> p = std::make_shared<T>()", behavior: "Atomic refcounted shared ownership; thread-safe count, not thread-safe object.", when: "Shared graphs, async callbacks; prefer unique_ptr when one owner suffices." },
    { syntax: "template<typename T> void f(T&& x)", behavior: "Forwarding reference — collapses to lvalue or rvalue per call site.", when: "Generic factories, perfect forwarding. Pair with std::forward<T>." },
    { syntax: "auto v = std::move(x)", behavior: "Cast to rvalue reference; enables move constructor/assignment; leaves x in valid-but-unspecified state.", when: "Transferring ownership of expensive-to-copy resources." },
    { syntax: "class C : public Base { public: virtual ~C() = default; };", behavior: "Polymorphic base with virtual destructor — derived destructors run correctly through base pointer.", when: "Runtime polymorphism. Without `virtual ~`, deleting via Base* is UB." },
    { syntax: "constexpr int f(int n) { return n*2; }", behavior: "Evaluable at compile time if inputs are constant expressions; also valid at runtime.", when: "Lookup tables, fixed-point math, tag dispatch." },
    { syntax: "std::optional<T> f()", behavior: "Value-or-nothing; checked with `if (auto r = f())`.", when: "Functions that may not return a value — replaces sentinel/pointer-nullable patterns." },
    { syntax: "std::variant<A,B,C> v", behavior: "Type-safe union; visit with std::visit + overloaded lambda.", when: "Tagged unions without inheritance; pattern matching pre-C++23." },
    { syntax: "concept Eq = requires(T a, T b) { a == b; };", behavior: "Named compile-time constraint on a type's interface.", when: "Self-documenting template requirements; clearer errors than SFINAE." },
    { syntax: "namespace ns::a::b { ... }", behavior: "Nested namespace declaration (C++17).", when: "Module organization; pair with `using namespace` sparingly." },
    { syntax: "auto [k, v] = pair", behavior: "Structured bindings — unpack tuple/pair/array/struct into named locals.", when: "Map iteration, multi-return values." },
    { syntax: "coroutine handle (co_await)", behavior: "Stackless coroutine suspended at await points (C++20).", when: "Async I/O, generators — needs a library (cppcoro/asio) for scheduling." },
  ],

  patterns: [
    {
      lang: "cpp",
      caption: "RAII wrapper — exception-safe resource management",
      code: `class File {
  std::FILE* fh_;
public:
  explicit File(const char* path) : fh_(std::fopen(path, "r")) {
    if (!fh_) throw std::runtime_error("open failed");
  }
  ~File() { if (fh_) std::fclose(fh_); }   // runs on scope exit AND on throw

  File(const File&) = delete;              // non-copyable: owns a handle
  File& operator=(const File&) = delete;
  File(File&& o) noexcept : fh_(o.fh_) { o.fh_ = nullptr; }
  File& operator=(File&& o) noexcept {
    std::swap(fh_, o.fh_); return *this;
  }
  std::FILE* get() const noexcept { return fh_; }
};`,
    },
    {
      lang: "cpp",
      caption: "Move semantics + perfect forwarding — zero-copy factory",
      code: `template<typename T, typename... Args>
std::unique_ptr<T> make(Args&&... args) {
  return std::unique_ptr<T>(new T(std::forward<Args>(args)...));
}

class Buffer {
  std::vector<char> data_;
public:
  explicit Buffer(std::vector<char> d) : data_(std::move(d)) {}  // move on construct
  Buffer(Buffer&&) noexcept = default;
  Buffer& operator=(Buffer&&) noexcept = default;
  std::span<const char> view() const noexcept { return data_; }
};

auto buf = make<Buffer>(std::vector<char>(4096));  // no copies`,
    },
    {
      lang: "cpp",
      caption: "Concept-constrained template with CRTP for static polymorphism",
      code: `template<typename T>
concept Drawable = requires(const T& x) { { x.draw() } -> std::same_as<void>; };

template<typename Derived>
class Shape {
public:
  void render() const { static_cast<const Derived*>(this)->draw(); }
};

class Circle : public Shape<Circle> {
public:
  void draw() const { /* ... */ }
};

template<Drawable D>
void render_all(const std::vector<D>& shapes) {
  for (const auto& s : shapes) s.draw();   // static dispatch, inlined
}`,
    },
    {
      lang: "cpp",
      caption: "std::variant + std::visit — sum types without inheritance",
      code: `using Event = std::variant<Click, Scroll, KeyPress>;

struct Handler {
  void operator()(const Click& e)    const { /* ... */ }
  void operator()(const Scroll& e)   const { /* ... */ }
  void operator()(const KeyPress& e) const { /* ... */ }
};

void dispatch(const std::vector<Event>& events) {
  for (const auto& e : events) {
    std::visit(Handler{}, e);   // compiler emits exhaustive switch
  }
}`,
    },
  ],

  pitfalls: [
    {
      title: "Undefined behavior is not a runtime error",
      symptom: "Signed overflow, use-after-free, reading uninitialized memory, out-of-bounds access — the compiler is permitted to do anything, including deleting surrounding checks. Code may pass in debug and corrupt data in release.",
      fix: "Build with `-fsanitize=address,undefined` in CI. Treat warnings as errors (`-Werror -Wall -Wextra`). Use gsl::span instead of pointer+length.",
    },
    {
      title: "Iterator invalidation",
      symptom: "`for (auto& x : vec) vec.push_back(...)` reads freed memory — push_back may reallocate, invalidating the iterator held by the range-for.",
      fix: "Reserve capacity before loops, collect changes and apply after, or use indices. Read the standard's iterator invalidation rules per container.",
    },
    {
      title: "Slicing on pass-by-value of a base class",
      symptom: "`void f(Base b);` called with a `Derived` copies only the Base portion — virtual methods dispatch to Base, derived data is gone.",
      fix: "Pass by reference or pointer (`const Base&` or `unique_ptr<Base>`). Make base classes abstract or protected constructors to forbid copying.",
    },
    {
      title: "Missing virtual destructor on polymorphic base",
      symptom: "`Base* p = new Derived; delete p;` runs only `~Base()` — derived members leak, behavior is undefined.",
      fix: "Any class with at least one virtual function needs `virtual ~Base() = default;`. The rule is simple: virtual functions ⇒ virtual destructor.",
    },
    {
      title: "Static initialization order fiasco",
      symptom: "Two translation units each have a static object whose constructor calls into the other — order across TUs is unspecified, so one may see an uninitialized object.",
      fix: "Use the Construct On First Use idiom: wrap in a function returning a reference to a function-local static. Or use constexpr / inline initialization.",
    },
    {
      title: "shared_ptr cycle leaks",
      symptom: "Two objects hold shared_ptr to each other — refcounts never hit zero, memory leaks silently.",
      fix: "Break cycles with weak_ptr for back-references. Reserve shared_ptr for genuinely shared ownership; unique_ptr should be the default.",
    },
    {
      title: "Move-from object is not empty",
      symptom: "After `auto y = std::move(x)`, `x` is in a valid-but-unspecified state — calling methods that assume content (e.g. `.size()` returning 0 is typical but not guaranteed) can mislead.",
      fix: "Never read from a moved-from object except to assign or destroy. Standard library types document their post-move state — read it.",
    },
  ],

  quickReference: [
    { fact: "C++26 adds reflection (P2996) and contracts; C++23 added std::expected, std::print, std::mdspan; C++20 added concepts, ranges, modules, coroutines.", tag: "version" },
    { fact: "ABI stability freeze on libstdc++/libc++ makes some std types (std::string, std::regex) effectively unfixable — libraries like fmt and re2 exist for this reason.", tag: "gotcha" },
    { fact: "std::vector growth is amortized O(1) append via 1.5–2x capacity doubling; reserve() before bulk inserts to avoid reallocation.", tag: "complexity" },
    { fact: "Pass-by-const-ref (`const T&`) for objects larger than two pointers; pass-by-value for small + sink arguments (then move internally).", tag: "perf" },
    { fact: "Branch prediction: branchless code (std::conditional, ternary, std::min/max) beats predictable branches only when the branch is unpredictable — profile, don't guess.", tag: "perf" },
    { fact: "Templates emit a new specialization per type used — large generic code can bloat binary size; use extern template or non-template pimpl to cut.", tag: "perf" },
    { fact: "exceptions are ~zero cost on the happy path (table-driven) but bloat binaries; many game/embedded shops build with -fno-exceptions and use std::expected.", tag: "version" },
    { fact: "std::unordered_map is a chained hash — cache-unfriendly; absl::flat_hash_map or boost::unordered_flat_map are 2–4x faster in practice.", tag: "perf" },
    { fact: "constexpr / consteval functions run at compile time — large arrays computed this way land in .rodata with zero runtime cost.", tag: "perf" },
    { fact: "std::move is just a cast — it doesn't itself move anything. The move happens in the receiving constructor/assignment.", tag: "gotcha" },
    { fact: "C++ name lookup is two-phase for templates; ADL (Koenig lookup) finds operators via argument namespaces — explains why `cout << x` works without `std::`.", tag: "gotcha" },
    { fact: "ODR (One Definition Rule) violation is UB and undiagnosable in general — different translation units must see identical definitions for the same entity.", tag: "gotcha" },
    { fact: "Link-Time Optimization (LTO) enables cross-TU inlining; build release with `-flto=thin` for ~5–10% speedup at the cost of link time.", tag: "perf" },
  ],

  goDeeper: [
    { title: "cppreference.com", url: "https://en.cppreference.com/", note: "The de-facto standard library reference; exhaustive, version-tagged, and accurate." },
    { title: "ISO C++ Official Site — Standard & FAQ", url: "https://isocpp.org/", note: "Spec pointer, committee papers, and the official Core Guidelines." },
    { title: "Effective Modern C++ (Scott Meyers)", url: "https://www.oreilly.com/library/view/effective-modern-c/9781491908419/", note: "The canonical guide to move semantics, smart pointers, and type deduction." },
    { title: "The C++ Core Guidelines", url: "https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines", note: "Stroustrup & Sutter's evolving rule set; ground truth for idiomatic code." },
    { title: "C++ Reference — cppfront / Herb Sutter on C++", url: "https://github.com/hsutter/cppfront", note: "Forward-looking experiment showing what a cleaner C++ syntax could look like; clarifies intent of many current rules." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "bool", behavior: "Single byte; true/false. sizeof(bool) is 1, not 4.", when: "Logic. std::vector<bool> is a packed specialization — avoid." },
      { syntax: "char", behavior: "1 byte; char/signed char/unsigned char are 3 distinct types.", when: "ASCII text, raw memory (unsigned char). char8_t for UTF-8." },
      { syntax: "short / int / long / long long", behavior: "Signed integers; widths are platform-defined (int = 32 bits on most).", when: "Use <cstdint> typedefs (int32_t, int64_t) for portable widths." },
      { syntax: "unsigned types", behavior: "Wraps on overflow (well-defined). Mixing signed/unsigned promotes to unsigned.", when: "Bit patterns, sizes (size_t). Avoid for general arithmetic — gotcha-prone." },
      { syntax: "float / double / long double", behavior: "IEEE-754 single/double/extended. float usually 32-bit, double 64-bit.", when: "Math. Use double by default; float only when memory matters and precision tolerates it." },
      { syntax: "char8_t / char16_t / char32_t", behavior: "Distinct types for UTF-8/16/32 code units (C++20).", when: "Unicode text. Prefer std::u8string for UTF-8." },
      { syntax: "std::byte", behavior: "Type-safe byte — no arithmetic, only bit ops (C++17).", when: "Raw memory buffers. Replaces unsigned char for non-character data." },
      { syntax: "nullptr_t", behavior: "Type of nullptr literal. Implicitly converts to any pointer type, never to int.", when: "Null pointer constants. Replaces NULL / 0 — safer overload resolution." },
    ],
    collections: [
      { syntax: "std::array<T, N>", behavior: "Fixed-size stack array with STL interface — zero overhead vs raw array.", when: "Known-size arrays. Prefer over C arrays for STL algorithm compatibility." },
      { syntax: "std::vector<T>", behavior: "Dynamic contiguous array — amortized O(1) push_back, O(n) insert.", when: "Default dynamic sequence. reserve() before bulk inserts to avoid realloc." },
      { syntax: "std::deque<T>", behavior: "Double-ended queue — O(1) push/pop both ends; non-contiguous.", when: "Queues, worklists. Higher per-element overhead than vector." },
      { syntax: "std::list<T> / std::forward_list<T>", behavior: "Doubly / singly linked list — O(1) splice, cache-unfriendly.", when: "Rarely. Almost always slower than vector for real workloads." },
      { syntax: "std::map<K, V> / std::set<T>", behavior: "Ordered red-black tree — O(log n) ops, no hash requirement.", when: "Ordered data, range queries. Slower than unordered_* for pure lookup." },
      { syntax: "std::unordered_map<K, V> / std::unordered_set<T>", behavior: "Chained hash map — O(1) avg; cache-unfriendly chains.", when: "Hash lookup. Prefer absl::flat_hash_map for 2-4x speed." },
      { syntax: "std::span<T> (C++20)", behavior: "Non-owning view over a contiguous range — pointer + length.", when: "Function args replacing (T*, size). Replaces string_view for bytes." },
      { syntax: "std::string_view", behavior: "Non-owning view over a char range — never allocate.", when: "Function args. NEVER return one from a function that owns its buffer." },
      { syntax: "std::tuple<Ts...>", behavior: "Heterogeneous fixed-size collection; unpack via std::get<I> or structured bindings.", when: "Multi-return values, type lists. Slower than struct for runtime access." },
    ],
    custom: [
      { syntax: "struct S { int x; };", behavior: "Aggregate with public members by default; POD if trivial.", when: "Plain data carriers. Add constructor/methods only when needed." },
      { syntax: "class C { ... };", behavior: "Class with private members by default; supports inheritance, virtuals.", when: "Behavior-rich types. Use struct for pure data, class for encapsulation." },
      { syntax: "enum class E : int { A, B }", behavior: "Scoped enumeration with fixed underlying type (C++11).", when: "Closed value sets. Always prefer over unscoped `enum`." },
      { syntax: "union U { int i; float f; };", behavior: "Members share storage; only one active at a time (UB to read wrong one).", when: "Tagged unions (paired with enum), ABI-compatible structs, type punning." },
      { syntax: "std::variant<A, B, C>", behavior: "Type-safe union — visit with std::visit, valueless_by_exception possible.", when: "Sum types without inheritance; pre-C++23 pattern matching." },
      { syntax: "std::optional<T>", behavior: "Holds T or nothing — checked with has_value(), operator bool().", when: "Maybe-absent values. Replaces sentinel (-1) and T* nullable patterns." },
      { syntax: "std::expected<T, E> (C++23)", behavior: "Holds T or an error E — Result type, no exceptions needed.", when: "Fallible operations in -fno-exceptions builds; replaces error codes." },
      { syntax: "template<typename T> struct S { ... };", behavior: "Compile-time code generation — one specialization per type used.", when: "Generic containers, algorithms. Pair with concepts for clear requirements." },
      { syntax: "concept C = requires(T x) { x.f(); };", behavior: "Named compile-time constraint on a type's interface (C++20).", when: "Self-documenting template requirements; clearer errors than SFINAE." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b", behavior: "Arithmetic — signed overflow is UB. Integral / truncates; mixed promotes per usual conversions.", when: "Math. Use std::numeric_limits<T> to check before operations." },
    { syntax: "a % b", behavior: "Remainder — sign follows dividend. Floating-point % is a compile error.", when: "Modular arithmetic. NOTE: not the same as Python's floor mod for negatives." },
    { syntax: "a == b, a != b, a < b, a > b, a <= b, a >=", behavior: "Comparison — mixed signed/unsigned promotes to unsigned (footgun).", when: "Comparisons. Use std::cmp_less etc. (C++20) for safe cross-sign compares." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — returns bool, not operand (unlike C).", when: "Logic. Overloadable but should never be overloaded (mangles short-circuit)." },
    { syntax: "a & b, a | b, a ^ b, ~a", behavior: "Bitwise AND/OR/XOR/NOT — integer types only; usual arithmetic conversions apply.", when: "Bit flags, masks. Wrap in a typed enum or std::byte for safety." },
    { syntax: "a << n, a >> n", behavior: "Left shift / right shift. Negative shift count is UB; shifting into sign bit (signed) is UB pre-C++20.", when: "Low-level bit ops, fast multiplication by powers of 2." },
    { syntax: "a ? b : c", behavior: "Ternary — both branches must have compatible types; one branch evaluated.", when: "Concise conditional. Avoid as lvalue unless you mean it." },
    { syntax: "a = b, a += b, a -= b, a *= b, a /= b, a %= b", behavior: "Compound assignment — `a OP= b` is `a = a OP b` (evaluates a once).", when: "Mutation. Prefer over `a = a OP b` — clearer and faster for complex lvalues." },
    { syntax: "a++, ++a, a--, --a", behavior: "Pre-increment returns the new value; post returns the old. Pre is preferred for non-trivial iterators (no copy).", when: "Iterators, loops. Prefer pre-increment by convention." },
    { syntax: "a, b", behavior: "Comma operator — evaluates a, discards, returns b. Overloadable but don't.", when: "Almost never use. The most overused operator in C++ — usually a bug." },
    { syntax: "a->b, a.b, a->*b, a.*b", behavior: "Member access — `->` for pointers, `.` for values; `->*`/`.*` for pointer-to-member.", when: "Member access. Overload `->` for smart pointers (unique_ptr does)." },
    { syntax: "static_cast<T>(x)", behavior: "Checked-at-compile-time cast — explicit conversion between related types.", when: "Default cast. Use for upcast/downcast (no virtual check), arithmetic conversion." },
    { syntax: "dynamic_cast<T>(x)", behavior: "Runtime-checked cast down a virtual hierarchy — returns nullptr or throws on failure.", when: "Polymorphic downcasts. Slow (RTTI); prefer visitor pattern in hot paths." },
    { syntax: "reinterpret_cast<T>(x), const_cast<T>(x)", behavior: "Bit reinterpretation / strip const. Both are sharp knives — UB if misused.", when: "FFI, ABI work. Avoid in app code; their presence usually signals a design smell." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "cpp",
      caption: "<fstream> — buffered file I/O with RAII",
      code: `#include <fstream>
#include <vector>

// Read entire file as bytes
std::vector<char> read_file(const std::string& path) {
  std::ifstream f(path, std::ios::binary | std::ios::ate);
  if (!f) throw std::runtime_error("open failed: " + path);
  auto size = f.tellg();
  f.seekg(0);
  std::vector<char> buf(size);
  f.read(buf.data(), size);
  return buf;
}

// Stream line by line — O(1) memory
std::ifstream in("huge.log");
std::string line;
while (std::getline(in, line)) {
  if (line.contains("ERROR")) std::println("{}", line);
}`,
    },
    {
      lang: "cpp",
      caption: "<iostream> — stdin/stdout (slow by default)",
      code: `#include <iostream>

// stdin — synced with C stdio by default (slow); untie for speed
std::ios_base::sync_with_stdio(false);
std::cin.tie(nullptr);

int n;
while (std::cin >> n) {                 // skips whitespace, parses int
  std::cout << n * 2 << '\\n';
}

// std::println (C++23) — type-safe, no format string bugs, faster than endl
std::println("count = {}", count);      // never use std::endl (flushes)`,
    },
    {
      lang: "cpp",
      caption: "Serialization — nlohmann/json, protobuf, raw bytes",
      code: `#include <nlohmann/json.hpp>
using json = nlohmann::json;

// JSON — human-readable, the default for APIs
json j = {{"user", "alice"}, {"id", 42}, {"tags", {"a", "b"}}};
std::string s = j.dump(2);              // pretty-print
auto parsed = json::parse(s);           // throws on error

// Binary — memory layout, fast, non-portable across architectures
#pragma pack(push, 1)
struct Header { uint32_t magic; uint16_t version; };
#pragma pack(pop)
static_assert(sizeof(Header) == 6);

// For portable binary, use Protobuf / FlatBuffers / Cap'n Proto.`,
    },
    {
      lang: "cpp",
      caption: "Memory-mapped files — zero-copy large file reads",
      code: `#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>

class MappedFile {
  void* data_; size_t size_; int fd_;
public:
  explicit MappedFile(const char* path) : fd_(::open(path, O_RDONLY)) {
    struct stat st; ::fstat(fd_, &st); size_ = st.st_size;
    data_ = ::mmap(nullptr, size_, PROT_READ, MAP_PRIVATE, fd_, 0);
  }
  ~MappedFile() { ::munmap(data_, size_); ::close(fd_); }
  MappedFile(const MappedFile&) = delete;
  std::span<const std::byte> bytes() const {
    return {static_cast<const std::byte*>(data_), size_};
  }
};`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "cpp",
      caption: "Range-for, structured bindings, iterators",
      code: `std::vector<int> v = {1, 2, 3};

// Range-for (C++11) — preferred for plain iteration
for (int x : v) std::print("{} ", x);

// By reference if you mutate
for (int& x : v) x *= 2;

// Index + value: structured bindings (C++17) on a vector doesn't work directly;
// use views::enumerate (C++23) or a manual zip
for (auto [i, x] : v | std::views::enumerate) {
  std::println("[{}] = {}", i, x);
}`,
    },
    {
      lang: "cpp",
      caption: "std::views / ranges — lazy functional pipelines (C++20)",
      code: `#include <ranges>
#include <algorithm>

auto squares_of_evens = std::views::iota(1)
  | std::views::filter([](int n) { return n % 2 == 0; })
  | std::views::transform([](int n) { return n * n; })
  | std::views::take(10);

// Lazy — O(1) memory, no allocation; consumes on demand
for (int x : squares_of_evens) std::println("{}", x);

// Materialize when you need a container
std::vector<int> vec(squares_of_evens.begin(), squares_of_evens.end());`,
    },
    {
      lang: "cpp",
      caption: "std::for_each, accumulate, transform_reduce",
      code: `#include <numeric>
#include <algorithm>

std::vector<int> v = {1, 2, 3, 4, 5};

// for_each — reads as intent, allows in-place mutation
std::for_each(v.begin(), v.end(), [](int& x) { x *= 2; });

// accumulate / reduce — fold over a binary op
int sum   = std::accumulate(v.begin(), v.end(), 0);
int prod  = std::accumulate(v.begin(), v.end(), 1, std::multiplies<>{});
// transform_reduce — parallelizable (C++17 execution policy)
int total = std::transform_reduce(
    std::execution::par, v.begin(), v.end(), 0, std::plus<>{},
    [](int x) { return x * x; });`,
    },
    {
      lang: "cpp",
      caption: "Iterators + sentinel + coroutines (C++20 generators)",
      code: `#include <generator>

// C++23 std::generator — stackless, lazy, infinite
std::generator<int> naturals(int start = 0) {
  while (true) co_yield start++;
}

// Take first N
auto first10 = naturals() | std::views::take(10);
for (int x : first10) std::println("{}", x);

// Sentinel-based ranges — works with C-strings, istreams
std::string s = "hello";
auto r = std::ranges::subrange(s.begin(), std::unreachable_sentinel);`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "cpp",
      caption: "Function signatures — overloads, defaults, references",
      code: `// Pass-by-const-ref is the default for objects larger than two pointers
void process(const std::string& s);     // in: read-only
void sink(std::vector<int> v);          // sink: take by value, move internally
void fill(std::span<int> out);          // out: mutable view
int  compute(int a, int b = 10);        // default arg (must be at the end)

// Overloads — distinct signatures; ambiguity is a compile error
void log(int x);
void log(std::string_view s);

// noexcept — promise not to throw; lets optimizers skip exception tables
void hot_path() noexcept;`,
    },
    {
      lang: "cpp",
      caption: "Lambdas — closures, captures, generic (C++14)",
      code: `int threshold = 10;
std::vector<int> v = {5, 15, 25};

// Capture by value [=], reference [&], or explicitly [threshold], [&threshold]
auto above = [threshold](int x) { return x > threshold; };
auto count = std::ranges::count_if(v, above);

// Generic lambda (C++14) — operator() is a template
auto add = [](auto a, auto b) { return a + b; };

// Mutable lambda — can modify by-value captures
auto counter = [n = 0]() mutable { return ++n; };

// std::function — type-erased callable; ~30ns overhead, avoid in hot paths
std::function<int(int)> fn = [](int x) { return x * 2; };`,
    },
    {
      lang: "cpp",
      caption: "Templates + concepts + fold expressions (C++20)",
      code: `template<typename T>
concept Addable = requires(T a, T b) { a + b; };

template<Addable T>
T sum(std::initializer_list<T> xs) {
  T acc{};
  for (auto x : xs) acc += x;
  return acc;
}

// Variadic + fold expression
template<typename... Ts>
auto sum_all(Ts... xs) {
  return (xs + ... + 0);                // right fold with initial value
}

// Concept-constrained auto parameter (C++20 abbreviated function template
void log(Addable auto x) { std::println("{}", x); }`,
    },
    {
      lang: "cpp",
      caption: "Coroutines (C++20) — co_await / co_yield / co_return",
      code: `#include <coroutine>
#include <generator>

std::generator<int> counter(int n) {
  for (int i = 0; i < n; ++i) co_yield i;  // suspend + yield value
}

// Async coroutine — needs a library (cppcoro, asio, folly) for scheduling
Task<int> fetch_int(std::string url) {
  auto bytes = co_await http_get(url);      // suspend until ready
  co_return parse_int(bytes);               // completion value
}

// Coroutines are zero-overhead — compile to state machines; no thread switch.
// The language provides the suspension machinery; the framework provides scheduling.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "cpp",
      caption: "try / catch / noexcept — exceptions are zero-cost on the happy path",
      code: `try {
  auto data = parse(input);                  // throws ParseError
  process(data);
} catch (const ParseError& e) {
  std::println("parse failed: {}", e.what());
} catch (const std::exception& e) {
  std::println("unexpected: {}", e.what());  // catch by const ref
}

// noexcept — promise not to throw; if you do, std::terminate is called
void swap_impl(T& a, T& b) noexcept {
  // Exception-safe: build the new state, then commit with no-throw ops
  T tmp = std::move(a);
  a = std::move(b);
  b = std::move(tmp);
}`,
    },
    {
      lang: "cpp",
      caption: "std::expected — Result type without exceptions (C++23)",
      code: `#include <expected>

std::expected<User, ParseError> parse(std::string_view json) {
  if (json.empty()) return std::unexpected(ParseError{"empty"});
  // ...
  return User{/* ... */};
}

auto r = parse(input);
if (!r) return handle_error(r.error());
use(r.value());

// Monadic operations (C++23): and_then, or_else, transform
parse(input)
  .and_then(validate)
  .transform(to_dto)
  .or_else([](auto e) { return fallback; });`,
    },
    {
      lang: "cpp",
      caption: "Custom error hierarchy — derive from std::exception",
      code: `class AppError : public std::runtime_error {
public:
  explicit AppError(const std::string& m, int code = 0)
    : std::runtime_error(m), code_(code) {}
  int code() const noexcept { return code_; }
private:
  int code_;
};

class NotFoundError : public AppError {
public:
  explicit NotFoundError(int id) : AppError("not found: " + std::to_string(id), 404) {}
};

// throw by value, catch by const reference — slicing is the classic bug
throw NotFoundError(42);`,
    },
    {
      lang: "cpp",
      caption: "RAII — guaranteed cleanup, no finally needed",
      code: `// Every resource is wrapped in a type whose destructor releases it.
// Stack unwinding calls destructors in reverse construction order,
// even when an exception is in flight.

class File {
  std::FILE* fh_;
public:
  explicit File(const char* path) : fh_(std::fopen(path, "r")) {
    if (!fh_) throw std::runtime_error("open failed");
  }
  ~File() { if (fh_) std::fclose(fh_); }
  File(const File&) = delete;
  File& operator=(const File&) = delete;
  std::FILE* get() const noexcept { return fh_; }
};

// No finally — destructor handles cleanup even on throw
{
  File f("cfg.txt");
  process(f.get());   // if this throws, ~File still runs
}`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "cpp",
      caption: "std::thread + join — the low-level primitive",
      code: `#include <thread>
#include <vector>

void worker(int id) { /* ... */ }

int main() {
  std::vector<std::thread> ts;
  for (int i = 0; i < 8; ++i) ts.emplace_back(worker, i);
  for (auto& t : ts) t.join();    // MUST join or detach before ~thread (else std::terminate)
  return 0;
}

// In real code, prefer std::async, thread pools (BS::thread_pool, TBB),
// or task systems — bare std::thread is too low-level for application code.`,
    },
    {
      lang: "cpp",
      caption: "std::async + futures — fire-and-forget with return value",
      code: `#include <future>

std::future<int> f = std::async(std::launch::async, [] {
  return expensive_compute();
});

// ... do other work ...

int result = f.get();     // blocks until ready; rethrows stored exception

// Caveats:
// - std::launch::async forces a new thread; ::deferred is lazy (runs on get())
// - std::async's destructor WAITs if you don't store the future (surprising!)
// - For real workloads use a thread pool — std::async unbounded threads are a footgun.`,
    },
    {
      lang: "cpp",
      caption: "std::mutex / lock_guard / scoped_lock — RAII locking",
      code: `#include <mutex>

std::mutex m;
std::vector<int> shared;

void append(int x) {
  std::lock_guard lock(m);             // RAII: unlocks at scope exit (C++17 CTAD)
  shared.push_back(x);
}

// Acquire multiple locks atomically — deadlock-free with std::scoped_lock
void transfer(Account& a, Account& b, int amt) {
  std::scoped_lock lock(a.mtx, b.mtx); // acquires both with deadlock-avoidance
  a.balance -= amt;
  b.balance += amt;
}

// shared_mutex for read-heavy data — RLock for reads, WLock for writes
std::shared_mutex sm;
{ std::shared_lock rlock(sm); /* read */ }
{ std::unique_lock wlock(sm); /* write */ }`,
    },
    {
      lang: "cpp",
      caption: "std::atomic + memory orders — lock-free primitives",
      code: `#include <atomic>

std::atomic<int> counter{0};

void bump() {
  counter.fetch_add(1, std::memory_order_relaxed);   // no ordering, just atomicity
}

// Seq-cst (default) is the strongest, slowest. Use relaxed/acquire/release
// when you understand the memory model. Release-acquire pairing:
std::atomic<bool> ready{false};
int data = 0;

// Thread A:
data = 42;
ready.store(true, std::memory_order_release);

// Thread B:
while (!ready.load(std::memory_order_acquire)) ;
assert(data == 42);   // guaranteed — release/acquire establishes happens-before`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "cpp",
      caption: "GoogleTest — fixtures, parameterized, death tests",
      code: `#include <gtest/gtest.h>

TEST(Cart, AddsItem) {
  Cart c;
  c.add({"x", 100});
  EXPECT_EQ(c.total(), 100);     // non-fatal
  ASSERT_EQ(c.size(), 1);        // fatal — stops the test on failure
}

// Fixture — shared setup/teardown
class DbTest : public ::testing::Test {
protected:
  void SetUp() override { db_.connect("test.db"); }
  Db db_;
};

TEST_F(DbTest, InsertWorks) { /* ... */ }

// Parameterized — one test, many cases
INSTANTIATE_TEST_SUITE_P(Basic, AddTest,
  ::testing::Values(std::make_tuple(1, 2, 3), std::make_tuple(10, 5, 15)));`,
    },
    {
      lang: "cpp",
      caption: "Catch2 — single-header, BDD-style",
      code: `#define CATCH_CONFIG_MAIN
#include <catch2/catch_all.hpp>

TEST_CASE("Cart adds items", "[cart]") {
  Cart c;
  SECTION("single item") {
    c.add({"x", 100});
    REQUIRE(c.total() == 100);
  }
  SECTION("multiple items") {
    c.add({"x", 100});
    c.add({"y", 50});
    REQUIRE(c.total() == 150);
  }
}

// SECTIONs run independently from the TEST_CASE start — re-entered per branch.
// Compile times are slower than GoogleTest; nicer ergonomics for new projects.`,
    },
    {
      lang: "cpp",
      caption: "rapidcheck — property-based testing",
      code: `#include <rapidcheck.h>
#include <rapidcheck/gtest.h>

RC_GTEST_PROP(SortTest, Idempotent, (std::vector<int> xs)) {
  auto once = sorted(xs);
  auto twice = sorted(once);
  RC_ASSERT(once == twice);
}

RC_GTEST_PROP(SortTest, LengthPreserved, (std::vector<int> xs)) {
  RC_ASSERT(sorted(xs).size() == xs.size());
}

// rapidcheck shrinks failing cases to the minimal reproducer
// (e.g. {3, 1, 2} shrinking to {1, 0})`,
    },
    {
      lang: "cpp",
      caption: "Sanitizers + fuzzing — the C++ testing stack",
      code: `// CMakeLists.txt — enable in debug builds
add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
add_link_options(-fsanitize=address,undefined)

// Coverage:
add_compile_options(--coverage -O0)
add_link_options(--coverage)

// libFuzzer — coverage-guided fuzz testing (Clang)
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size) {
  if (size < 4) return 0;
  parse(std::string_view(reinterpret_cast<const char*>(data), size));
  return 0;
}
// Build: clang++ -fsanitize=fuzzer,address fuzz.cpp -o fuzz`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Pass-by-const-ref (`const T&`) for objects larger than two pointers; pass-by-value for small + sink args, then move internally.", tag: "perf" },
    { fact: "std::vector growth is amortized O(1) append via 1.5–2x capacity doubling; reserve() before bulk inserts to avoid reallocation.", tag: "complexity" },
    { fact: "std::unordered_map is a chained hash — cache-unfriendly; absl::flat_hash_map or boost::unordered_flat_map are 2–4x faster in practice.", tag: "perf" },
    { fact: "constexpr / consteval functions run at compile time — large arrays computed this way land in .rodata with zero runtime cost.", tag: "perf" },
    { fact: "Templates emit a new specialization per type used — large generic code can bloat binary size; use extern template or non-template pimpl to cut.", tag: "perf" },
    { fact: "Exceptions are ~zero cost on the happy path (table-driven) but bloat binaries; many game/embedded shops build with -fno-exceptions and use std::expected.", tag: "version" },
    { fact: "Link-Time Optimization (LTO) enables cross-TU inlining; build release with `-flto=thin` for ~5–10% speedup at the cost of link time.", tag: "perf" },
    { fact: "Branch prediction: branchless code (std::conditional, ternary, std::min/max) beats predictable branches only when the branch is unpredictable — profile, don't guess.", tag: "perf" },
    { fact: "std::move is just a cast — it doesn't itself move anything. The move happens in the receiving constructor/assignment.", tag: "gotcha" },
    { fact: "std::sort is O(n log n) (introsort); std::stable_sort preserves order. Both can be parallelized via std::execution::par (C++17).", tag: "complexity" },
    { fact: "Alignas / alignof let you control struct layout — useful for SIMD (16/32/64-byte alignment) and false-sharing avoidance in multithreading.", tag: "perf" },
    { fact: "small_vector (Folly, abseil) stores N elements inline — avoids heap allocation for the common case; 2-5x faster than std::vector for short arrays.", tag: "perf" },
    { fact: "C++ name lookup is two-phase for templates; ADL (Koenig lookup) finds operators via argument namespaces — explains why `cout << x` works without `std::`.", tag: "gotcha" },
    { fact: "ODR (One Definition Rule) violation is UB and undiagnosable in general — different translation units must see identical definitions for the same entity.", tag: "gotcha" },
    { fact: "Perf benchmarking requires Google Benchmark or nanobench; never trust `clock()` — use `std::chrono::steady_clock` and disable CPU frequency scaling.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "CMake", purpose: "The de-facto build system — verbose but universal; pair with modern CMake (targets, not dirs).", url: "https://cmake.org/", category: "build" },
    { tool: "Ninja", purpose: "Fast, minimal build backend — CMake's default on most platforms; ~10x faster than Make.", url: "https://ninja-build.org/", category: "build" },
    { tool: "Bazel", purpose: "Google's hermetic, reproducible build system — best for large monorepos.", url: "https://bazel.build/", category: "build" },
    { tool: "Meson", purpose: "User-friendly alternative to CMake — used by GNOME, Xorg, systemd.", url: "https://mesonbuild.com/", category: "build" },
    { tool: "vcpkg", purpose: "Microsoft's C++ package manager — CMake-integrated, large port catalog.", url: "https://vcpkg.io/", category: "package" },
    { tool: "Conan", purpose: "Decentralized package manager — works with any build system, strong for embedded.", url: "https://conan.io/", category: "package" },
    { tool: "Build2", purpose: "Build + package + test in one — most cohesive, smallest ecosystem.", url: "https://build2.org/", category: "package" },
    { tool: "clang-format", purpose: "Opinionated formatter — integrates with all editors and CI.", url: "https://clang.llvm.org/docs/ClangFormat.html", category: "lint" },
    { tool: "clang-tidy", purpose: "Static analyzer + linter — catches modernize, performance, concurrency, bugprone issues.", url: "https://clang.llvm.org/extra/clang-tidy/", category: "lint" },
    { tool: "cppcheck", purpose: "Static analyzer — focuses on bugs over style; complementary to clang-tidy.", url: "https://cppcheck.sourceforge.io/", category: "lint" },
    { tool: "GoogleTest", purpose: "Google's test framework — fixtures, parameterized, death tests; the industry default.", url: "https://google.github.io/googletest/", category: "test" },
    { tool: "Catch2", purpose: "Single-header BDD-style test framework — slower compiles, nicer ergonomics.", url: "https://github.com/catchorg/Catch2", category: "test" },
    { tool: "rapidcheck", purpose: "Property-based testing — Hypothesis-style shrinking for C++.", url: "https://github.com/emil-e/rapidcheck", category: "test" },
    { tool: "Google Benchmark", purpose: "Microbenchmark library with statistics; the C++ equivalent of JMH.", url: "https://github.com/google/benchmark", category: "perf" },
    { tool: "ASan / UBSan / TSan / MSan", purpose: "Compiler-instrumented sanitizers — memory, UB, threads, uninitialized memory.", url: "https://clang.llvm.org/docs/AddressSanitizer.html", category: "debug" },
    { tool: "Valgrind", purpose: "Runtime memory + cache profiler — slower than ASan but no recompile.", url: "https://valgrind.org/", category: "debug" },
    { tool: "Perf / VTune / Tracy", purpose: "CPU profilers — Tracy for real-time frame analysis (games), VTune for HPC.", url: "https://github.com/wolfpld/tracy", category: "debug" },
    { tool: "Docker", purpose: "Container packaging — the deploy artifact for most C++ services; pair with multi-stage builds for small images.", url: "https://www.docker.com/", category: "deploy" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "C++98", year: 1998, highlight: "First ISO standard — templates, exceptions, namespaces, RTTI, STL." },
    { version: "C++03", year: 2003, highlight: "Bugfix release; value initialization clarified." },
    { version: "C++11", year: 2011, highlight: "Auto, lambdas, move semantics, smart pointers, concurrency, range-for, variadic templates — the big jump." },
    { version: "C++14", year: 2014, highlight: "Generic lambdas, std::make_unique, binary literals, decltype(auto), relaxed constexpr." },
    { version: "C++17", year: 2017, highlight: "Structured bindings, std::optional/variant/any, string_view, filesystem, parallel algorithms." },
    { version: "C++20", year: 2020, highlight: "Concepts, ranges, modules, coroutines, <=> spaceship, designated initializers, calendar/timezone." },
    { version: "C++23", year: 2023, highlight: "std::expected, std::print/println, std::generator, std::mdspan, ranges improvements, if consteval." },
    { version: "C++26", year: 2026, highlight: "Reflection (P2996), contracts, hazard pointers, RCU, linear algebra (BLAS), std::execution senders." },
    { version: "C++98 ARM", year: 1985, highlight: "Bjarne Stroustrup's 'C with Classes' becomes 'C++'; the pre-standard era." },
    { version: "Boost (2001)", year: 2001, highlight: "Boost founded — the incubator for many std features (filesystem, asio, smart_ptr, variant)." },
    { version: "STL (1994)", year: 1994, highlight: "HP's Standard Template Library adopted into the C++ standard draft — Stepanov & Lee." },
    { version: "ABI freeze (2014)", year: 2014, highlight: "GCC 5 libstdc++ adopts the new C++11 ABI (dual ABI); the C++ ABI is now effectively frozen." },
    { version: "CMake 3.0", year: 2014, highlight: "Modern CMake era — target-based dependencies replace global include dirs." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Explain RAII and why it matters.", a: "Resource Acquisition Is Initialization: every resource (memory, file, lock) is owned by an object whose constructor acquires and destructor releases it. Stack unwinding calls destructors in reverse order, even on exceptions — so cleanup is automatic and exception-safe. This is why unique_ptr, lock_guard, and ifstream are zero-overhead and never leak.", difficulty: "easy" },
    { q: "What's the difference between `std::unique_ptr` and `std::shared_ptr`?", a: "unique_ptr is single-owner, zero-overhead (same size as a raw pointer), and movable but not copyable. shared_ptr is atomic-refcounted shared ownership — multiple owners, thread-safe count but not thread-safe object. Use unique_ptr by default; reserve shared_ptr for genuinely shared graphs and break cycles with weak_ptr.", difficulty: "easy" },
    { q: "What is undefined behavior, and why does it matter?", a: "UB means the standard imposes no requirements — the compiler can do anything, including deleting surrounding checks. Examples: signed overflow, use-after-free, reading uninitialized memory, data races. Code may pass in debug and corrupt data in release because optimizers assume UB doesn't happen. Build with `-fsanitize=address,undefined` in CI.", difficulty: "medium" },
    { q: "Explain move semantics and perfect forwarding.", a: "Move semantics let you transfer ownership of a resource (e.g. a heap buffer) instead of copying — `T(T&&)` steals the source's internals, leaving it valid-but-unspecified. `std::move` is just a cast to `T&&`. Perfect forwarding uses forwarding references (`T&&` in a template) + `std::forward<T>` to preserve the value category through a generic function — the foundation of std::make_unique, emplace_back, etc.", difficulty: "medium" },
    { q: "What is the Rule of Zero / Rule of Five?", a: "Rule of Five: if a class manages a resource, you likely need destructor, copy ctor, copy assign, move ctor, move assign. Rule of Zero: prefer to compose from RAII types (unique_ptr, vector, string) so the compiler-generated defaults do the right thing — write zero special members. The Rule of Zero is modern C++ best practice.", difficulty: "medium" },
    { q: "Why does a polymorphic base class need a virtual destructor?", a: "Deleting a Derived through a Base* runs Base's destructor only — unless ~Base is virtual, in which case the call dispatches to Derived's destructor first. Without a virtual destructor, derived members leak and behavior is undefined. The rule: any class with at least one virtual function needs `virtual ~Base() = default;`.", difficulty: "easy" },
    { q: "Explain the iterator invalidation rules.", a: "Each container has rules. std::vector: iterators invalidate on reallocation (push_back past capacity), insert/erase at or before the point. std::list: only the erased element's iterator is invalidated. std::unordered_map: insert may invalidate all iterators if rehashing; erase invalidates only the erased one. Read the standard's per-container rules; `for (auto& x : v) v.push_back(...)` is a classic UB.", difficulty: "medium" },
    { q: "What are concepts, and why were they added in C++20?", a: "Concepts are named compile-time constraints on template parameters — `template<Eq T>`. They replace SFINAE with readable intent and dramatically better error messages. They also enable overloaded function templates by constraint and abbreviated templates (`void f(Eq auto x)`). Concepts were the missing piece that made generic code approachable.", difficulty: "medium" },
    { q: "What's the difference between std::async, std::thread, and coroutines?", a: "std::thread is the bare OS-thread primitive — you must join/detach. std::async returns a future; it MAY spawn a thread (with std::launch::async) or run lazily (deferred). Coroutines (C++20) are stackless — suspend at co_await/co_yield without blocking a thread; the language provides the machinery, a library (asio, cppcoro) provides the scheduler. Use coroutines for I/O, threads for CPU-bound parallelism.", difficulty: "hard" },
    { q: "Explain the C++ memory model — acquire/release/seq_cst.", a: "Atomic operations have memory orders. Relaxed: atomicity only, no ordering. Release-acquire: a release store synchronizes-with an acquire load of the same atomic — non-atomic writes before the release are visible after the acquire. Seq_cst (default): adds a single total order over all seq_cst operations, strongest but slowest. Use relaxed for counters, release-acquire for flags, seq_cst when in doubt.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Rust", whenThis: "Existing C++ codebases, game engines (Unreal), ML infrastructure, anywhere the ecosystem is C++.", whenThat: "Greenfield systems software, security-sensitive code (browsers, kernels), anywhere you'd otherwise pay for UB hunting." },
    { vs: "C", whenThis: "Anything above the kernel boundary — generics, RAII, STL containers, rich type system.", whenThat: "Kernels, embedded firmware, FFI libraries, anywhere ABI stability and tiny toolchain matter most." },
    { vs: "Java / C#", whenThis: "Game engines, HFT, browsers, ML cores — anywhere latency budgets are in microseconds.", whenThat: "Enterprise back-ends, server applications where GC pauses are acceptable and developer productivity matters." },
    { vs: "Go", whenThis: "Performance-critical compute, game engines, anywhere complex generics + zero-overhead matter.", whenThat: "Cloud-native microservices, CLIs, network daemons where simplicity and single-binary deploys win." },
    { vs: "Zig", whenThis: "Mature ecosystem, existing libraries, anywhere you need C++ tooling stability.", whenThat: "New systems code where you want simpler semantics, no hidden control flow, and C interop as a first-class goal." },
  ],
};

export default sheet;
