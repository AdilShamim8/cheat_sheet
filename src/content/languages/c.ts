import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "c",
  name: "C",
  category: "languages",
  tier: 1,
  tags: ["static-typing", "compiled", "systems", "manual-memory", "portable", "low-level"],
  tagline: "Portable assembly with types — the lingua franca of operating systems, embedded systems, and FFI boundaries.",
  year: 1972,
  author: "Dennis Ritchie",

  tldr: [
    "C is a small, statically-typed, compiled, procedural language with manual memory management, a tiny standard library, and a near-direct mapping to machine instructions — designed to make UNIX portable across hardware.",
    "It remains the implementation language of operating system kernels (Linux, Windows NT, macOS XNU), embedded firmware, language runtimes (CPython, Lua, SQLite), and the FFI substrate that every major language speaks.",
    "Reach for C when you write or extend a kernel, when you target tiny microcontrollers, when you ship a library consumed via FFI, or when you need a stable ABI that outlasts the source language.",
    "Avoid C for new application-level code — its lack of generics, namespaces, RAII, and bounds checking makes memory-safety bugs near-inevitable at scale; Rust, Zig, or Go are usually better choices today.",
  ],

  mentalModel: {
    title: "Pointers + arrays + structs, all the way down",
    body: "C has exactly one composite data structure — a contiguous block of memory you interpret through a typed pointer. Arrays decay to pointers on almost any use; `a[i]` is literally `*(a+i)`. Structs are layout-ordered memory with predictable offsets (mod padding). Every other abstraction (strings, lists, hash maps) is a convention built on these primitives — there is no built-in string type, no exceptions, no method dispatch. The mental model: a C program is a sequence of function calls operating on pointers to memory you allocated with malloc or declared on the stack; the compiler does not save you from writing past the end, freeing twice, or returning a pointer to a stack variable that no longer exists.",
  },

  constructs: [
    { syntax: "int *p = malloc(n * sizeof *p);", behavior: "Heap allocation returning void*, implicitly converted; returns NULL on failure.", when: "Dynamic-size buffers. Always pair with free(p) at one owner." },
    { syntax: "typedef struct { int x; char *s; } Foo;", behavior: "Anonymous struct typedef — defines a type name with struct fields.", when: "Grouping related fields; the default composite type." },
    { syntax: "void f(int n, int a[static n]);", behavior: "Function takes array with declared minimum size — compiler may optimize.", when: "Passing buffers whose length is another parameter." },
    { syntax: "static int counter = 0;", behavior: "File-scope or function-local with static storage duration and internal linkage.", when: "Module-private state, singletons without globals." },
    { syntax: "enum color { RED, GREEN = 5, BLUE };", behavior: "Named integer constants; BLUE becomes 6.", when: "Tagged dispatch, finite option sets. Underlying type is int." },
    { syntax: "int x = a ? b : c;", behavior: "Ternary expression; evaluates only the chosen branch.", when: "Concise conditional assignment; avoid nesting." },
    { syntax: "goto cleanup;", behavior: "Unconditional jump within a function (cannot cross function boundaries).", when: "Error-cleanup chains in C — idiomatic when used locally, not for loops." },
    { syntax: "union { int i; float f; } u;", behavior: "Members share storage; writing one reinterprets bits as the other.", when: "Type punning, tagged values, ABI-compatible structs." },
    { syntax: "_Generic(x, int: fi, char*: fs, default: fd)(x)", behavior: "Compile-time dispatch on the type of x (C11).", when: "Type-generic macros — C's answer to overloading." },
    { syntax: "FILE *f = fopen(p, \"r\");", behavior: "Buffered file handle from the C standard library.", when: "Text/binary file I/O. Always check for NULL." },
  ],

  patterns: [
    {
      lang: "c",
      caption: "Idiomatic error-handling with goto cleanup",
      code: `int read_config(const char *path, struct config *out) {
  FILE *f = NULL;
  char *buf = NULL;
  int rc = -1;

  if (!(f = fopen(path, "r"))) goto done;
  if (!(buf = malloc(BUF_SIZE))) goto done;
  if (parse(f, buf, out) != 0) goto done;
  rc = 0;            // success — fall through

done:
  if (f) fclose(f);
  free(buf);          // free(NULL) is a no-op, always safe
  return rc;
}`,
    },
    {
      lang: "c",
      caption: "Opaque pointer pattern — information hiding for stable ABI",
      code: `// foo.h — public header
typedef struct foo foo;          // forward decl, body hidden
foo *foo_new(int n);
void foo_free(foo *f);
int foo_get(const foo *f);

// foo.c — implementation
struct foo { int n; int *data; };

foo *foo_new(int n) {
  foo *f = malloc(sizeof *f);
  if (!f) return NULL;
  f->n = n;
  f->data = calloc((size_t)n, sizeof(int));
  if (!f->data) { free(f); return NULL; }
  return f;
}`,
    },
    {
      lang: "c",
      caption: "Tagged union — sum types without language support",
      code: `enum node_kind { N_NUM, N_ADD, N_MUL };
struct node {
  enum node_kind kind;
  union {
    int num;                       // N_NUM
    struct { struct node *l, *r; }; // N_ADD, N_MUL
  };
};

int eval(const struct node *n) {
  switch (n->kind) {
    case N_NUM: return n->num;
    case N_ADD: return eval(n->l) + eval(n->r);
    case N_MUL: return eval(n->l) * eval(n->r);
  }
  return 0;  // unreachable
}`,
    },
    {
      lang: "c",
      caption: "Designated initializers + sizeof trick — readable config tables",
      code: `struct cmd {
  const char *name;
  void (*fn)(const char *);
};

static const struct cmd commands[] = {
  [0] = { .name = "help",  .fn = cmd_help },
  [1] = { .name = "quit",  .fn = cmd_quit },
  [2] = { .name = "load",  .fn = cmd_load },
};

static const size_t n_commands =
    sizeof(commands) / sizeof(commands[0]);   // adapts as table grows`,
    },
  ],

  pitfalls: [
    {
      title: "Use-after-free and double-free are silent",
      symptom: "Calling `free(p)` twice corrupts the allocator's internal state — crashes appear later, far from the bug. Reading freed memory returns plausible-looking garbage.",
      fix: "Set `p = NULL` immediately after free (free(NULL) is a no-op). Use AddressSanitizer in dev builds. Adopt a memory-ownership convention (one owner, hand-off on free) and document it.",
    },
    {
      title: "Buffer overflows are not bounds-checked",
      symptom: "`char buf[8]; memcpy(buf, src, 16)` writes past the end silently — exploitable security vulnerability, the cause of the majority of historical CVEs.",
      fix: "Always pass lengths alongside buffers and check. Use `snprintf` not `sprintf`, `strncpy`/`strlcpy` carefully (or `strlcat`). Compile with `-fsanitize=address` and `-D_FORTIFY_SOURCE=2`.",
    },
    {
      title: "Returning a pointer to a stack variable",
      symptom: "`int* f() { int x = 5; return &x; }` returns a dangling pointer — the stack slot is reused by the next call, the value becomes garbage.",
      fix: "Return by value, allocate with malloc, or take an out-pointer from the caller. Compilers warn (`-Wreturn-stack-address`) — never ignore it.",
    },
    {
      title: "`sizeof` on a pointer gives 8, not the buffer length",
      symptom: "`void f(int a[]) { size_t n = sizeof(a); }` returns sizeof(int*) = 8, not the array size — arrays decay to pointers when passed to functions.",
      fix: "Always pass length as a separate parameter. There is no way to recover an array's length from a decayed pointer; the information is gone at runtime.",
    },
    {
      title: "Undefined behavior on signed overflow",
      symptom: "`for (int i = 0; i < INT_MAX; i++) ...` overflows past INT_MAX — the compiler may assume it doesn't happen and emit surprising code (infinite loops, deleted checks).",
      fix: "Use unsigned for bit patterns and sizes; use size_t for indices/lengths. Compile with `-fwrapv` if you genuinely need two's-complement wraparound semantics.",
    },
    {
      title: "strcpy/strcat are unbounded",
      symptom: "`strcpy(dst, user_input)` copies until NUL — a buffer overflow waiting to happen, the classic stack-smashing vector.",
      fix: "Use `snprintf(dst, sizeof(dst), \"%s\", src)` or `strlcpy`/`strlcat`. Never trust external length. Modern code uses a string library (sds, etc.).",
    },
    {
      title: "NULL dereference is UB, not necessarily a clean crash",
      symptom: "Dereferencing NULL is undefined behavior — kernels may map page 0 (CVE class), compilers may assume it doesn't happen and remove subsequent NULL checks.",
      fix: "Check every malloc result and every externally-supplied pointer. Use `-fsanitize=null` (UBSan) in dev builds. In kernels, NULL is genuinely dangerous — page-zero mappings are exploits.",
    },
  ],

  quickReference: [
    { fact: "C23 (2023) adds nullptr, bool/true/false keywords, attributes [[nodiscard]], auto, and stdckdint.h; C17 was a bugfix release; C11 added _Generic, threads, atomics.", tag: "version" },
    { fact: "sizeof returns size_t — always use %zu for printf, never %d or %u.", tag: "gotcha" },
    { fact: "struct layout has implementation-defined padding — never memcpy a struct across architectures if ABI matters; serialize field-by-field.", tag: "gotcha" },
    { fact: "malloc/free is amortized O(1) but per-call ~50–200ns; for hot paths, pool allocations or use arena allocators.", tag: "perf" },
    { fact: "A function pointer call has indirect-branch cost (~5ns) plus potential retpoline penalty (~50ns) under Spectre mitigations.", tag: "perf" },
    { fact: "restrict qualifier tells the compiler two pointers don't alias — enables vectorization; lying with it is UB.", tag: "perf" },
    { fact: "static inline functions in headers are the C idiom for small utilities; inline alone has tricky rules across translation units.", tag: "style" },
    { fact: "Standard library is tiny: no hash map, no vector, no regex, no threads pre-C11 — POSIX/bsd/glibc fill the gaps, often non-portably.", tag: "gotcha" },
    { fact: "C ABI is the universal FFI substrate — every major language can call it; that's why SQLite, libssl, libpng are C.", tag: "version" },
    { fact: "Integer promotion: small types (char, short) are promoted to int before arithmetic — surprising for overflow and bitwise ops.", tag: "gotcha" },
    { fact: "volatile disables optimization on a single variable but does NOT make operations atomic; use stdatomic.h (C11) for atomics and memory_order_*.", tag: "gotcha" },
    { fact: "Compile with -Wall -Wextra -Werror -Wshadow -Wconversion; modern Clang/GCC catch a meaningful share of memory bugs at build time.", tag: "style" },
    { fact: "POSIX vs ISO C: getline, strlcpy, snprintf are POSIX or BSD — ISO C has snprintf since C99 only; check portability before assuming.", tag: "version" },
  ],

  goDeeper: [
    { title: "The C Programming Language (K&R, 2nd ed.)", url: "https://www.oreilly.com/library/view/the-c-programming/9780133086249/", note: "Kernighan & Ritchie — still the most concise correct introduction to idiomatic C." },
    { title: "ISO/IEC 9899:2023 — C23 Standard", url: "https://www.iso.org/standard/82075.html", note: "The authoritative language spec; the definitive answer on edge-case semantics." },
    { title: "Modern C (Jens Gustedt)", url: "https://gustedt.gitlabpages.inria.fr/modern-c/", note: "Free, comprehensive treatment of C99 through C23; the modern successor to K&R." },
    { title: "cppreference.com — C Reference", url: "https://en.cppreference.com/w/c", note: "Most accurate, version-tagged online reference for the C standard library." },
    { title: "SEI CERT C Coding Standard", url: "https://wiki.sei.cmu.edu/confluence/display/c/SEI+CERT+C+Coding+Standard", note: "Curated rules for safe, secure C — every rule has a real CVE behind it." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "char", behavior: "1 byte — the smallest addressable unit. May be signed or unsigned (implementation-defined).", when: "Characters, raw bytes. Use unsigned char for raw memory." },
      { syntax: "signed char / unsigned char", behavior: "Explicit sign 1-byte types — distinct from plain char in the type system.", when: "Byte buffers, small int values. Use unsigned char for raw memory." },
      { syntax: "short / int / long / long long", behavior: "Signed integers; widths are platform-defined (int = 16/32/64 bits).", when: "Use stdint.h typedefs (int32_t, int64_t) for portable widths." },
      { syntax: "uint8_t / uint16_t / uint32_t / uint64_t", behavior: "Fixed-width unsigned integers from <stdint.h> (C99).", when: "Sizes, network protocols, binary formats. Always prefer over `unsigned int`." },
      { syntax: "size_t", behavior: "Unsigned integer type for object sizes — wide enough for any addressable byte.", when: "Array lengths, malloc args, sizeof results. Use %zu for printf." },
      { syntax: "float / double / long double", behavior: "IEEE-754 single/double/extended; float usually 32-bit, double 64-bit.", when: "Math. Use double by default; float only when memory matters." },
      { syntax: "_Bool / bool (C23)", behavior: "True/false; stored as 1 byte. C23 makes `bool`/`true`/`false` keywords.", when: "Logic. Pre-C23, include <stdbool.h> for bool/true/false macros." },
      { syntax: "enum E { A, B, C }", behavior: "Named integer constants; underlying type is int. No scoping.", when: "Tagged dispatch, finite option sets. C's enums are much weaker than C++'s." },
      { syntax: "nullptr_t / nullptr (C23)", behavior: "Type-safe null pointer constant (C23). Replaces NULL / 0.", when: "Null pointer constants in C23+ code; better overload resolution with _Generic." },
    ],
    collections: [
      { syntax: "T arr[N]", behavior: "Fixed-size array — N must be a constant expression. Decays to T* when passed.", when: "Known-size buffers on the stack. Pair with sizeof(arr)/sizeof(arr[0])." },
      { syntax: "T *p = malloc(n * sizeof *p)", behavior: "Heap-allocated dynamic array; survives the stack frame. Returns NULL on failure.", when: "Dynamic-size buffers. Always pair with free() at a single owner." },
      { syntax: "T (*p)[N]", behavior: "Pointer to array of N — preserves length in the type system.", when: "Multi-dimensional array passing; rarely seen in app code." },
      { syntax: "struct foo { int x; char *s; }", behavior: "Aggregate of named fields; padded per ABI; copied by value.", when: "Grouping related fields. The composite data structure of C." },
      { syntax: "union { int i; float f; }", behavior: "Members share storage — writing one reinterprets bits as the other.", when: "Type punning, tagged values, ABI-compatible structs." },
      { syntax: "struct list_node { void *data; struct list_node *next; }", behavior: "Linked list node — the universal C collection idiom (you write it yourself).", when: "When arrays don't fit. C has no built-in list/map/set." },
      { syntax: "typedef struct { T *items; size_t len, cap; } vec_T", behavior: "Growable array — the standard hand-rolled vector pattern.", when: "When you need std::vector. Most C codebases reinvent this." },
      { syntax: "char * / char[]", behavior: "NUL-terminated string — convention, not a type. strlen walks to NUL.", when: "All text. Use sds or libuv strings for non-trivial string code." },
    ],
    custom: [
      { syntax: "typedef struct foo foo;", behavior: "Forward declaration of an opaque struct — hides layout for stable ABI.", when: "Library API boundaries; the opaque pointer pattern." },
      { syntax: "struct foo { ... };", behavior: "Concrete struct — fields visible to all includers.", when: "Internal types where layout is part of the API." },
      { syntax: "typedef int (*cmp_fn)(const void *, const void *);", behavior: "Function pointer type — used by qsort, bsearch, callbacks.", when: "Plugin APIs, comparator patterns. The C answer to interfaces." },
      { syntax: "enum color { RED, GREEN, BLUE }", behavior: "Named integer constants; no namespace; underlying type is int.", when: "Tagged dispatch, option sets. C23 adds `enum class` with explicit underlying type." },
      { syntax: "union value { int i; double f; const char *s; }", behavior: "Tagged union — pair with an enum field for sum types.", when: "Polymorphic values without inheritance; AST nodes, JSON values." },
      { syntax: "#define LEN(x) (sizeof(x) / sizeof((x)[0]))", behavior: "Macro for array length — the C idiom; evaluated at compile time.", when: "Stack arrays only — does NOT work on decayed pointers (silent bug)." },
      { syntax: "_Generic(x, int: fi, char*: fs, default: fd)(x)", behavior: "Compile-time dispatch on the type of x (C11) — type-generic macros.", when: "Overloading in C — print(), cmp(), math functions across types." },
      { syntax: "typedef struct { ... ; void (*free)(struct foo *); } foo_vtable", behavior: "Manual vtable — struct of function pointers for polymorphism.", when: "OO-in-C patterns (GObject, Linux kernel). Heavy machinery; prefer plain functions." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b", behavior: "Arithmetic — signed overflow is UB. Integral / truncates; mixed promotes per usual arithmetic conversions.", when: "Math. Use __builtin_add_overflow (GCC/Clang) for checked arithmetic." },
    { syntax: "a % b", behavior: "Remainder — sign follows dividend; result has same sign as a.", when: "Modular arithmetic. NOTE: not the same as Python's floor mod for negatives." },
    { syntax: "a++, ++a, a--, --a", behavior: "Pre/post increment — pre returns the new value, post returns the old.", when: "Iteration, pointer arithmetic. Order of evaluation is unspecified between sequence points." },
    { syntax: "a == b, a != b, a < b, a > b, a <= b, a >=", behavior: "Comparison — int/float comparisons are well-defined; mixed signed/unsigned promotes to unsigned (footgun).", when: "Comparisons. strcmp returns tri-state — don't confuse with `==`." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — returns int 0 or 1. Operands are compared to 0.", when: "Logic. The only operators with sequence points between operands (pre-C++)." },
    { syntax: "a & b, a | b, a ^ b, ~a", behavior: "Bitwise AND/OR/XOR/NOT — integer types only; usual arithmetic conversions apply.", when: "Bit flags, masks. Always parenthesize — bitwise ops have lower precedence than you think." },
    { syntax: "a << n, a >> n", behavior: "Left / right shift. Negative shift count or shift >= width is UB.", when: "Low-level bit ops. `>>` on signed negative is impl-defined (use unsigned)." },
    { syntax: "a ? b : c", behavior: "Ternary — both branches evaluated per type rules; one branch evaluated at runtime.", when: "Concise conditional. Don't nest — refactor." },
    { syntax: "a = b, a += b, a -= b, a *= b, a /= b, a %= b", behavior: "Compound assignment — `a OP= b` is `a = a OP b` (evaluates a once).", when: "Mutation. Safer than `a = a OP b` for lvalues with side effects." },
    { syntax: "a, b", behavior: "Comma operator — evaluates a, discards, returns b. Sequence point between.", when: "Rare. Most uses are in for-loop headers and macro expansions." },
    { syntax: "a->b, a.b, a[i]", behavior: "Member access — `->` for pointers, `.` for structs. `a[i]` is literally `*(a+i)`.", when: "Struct field access, array indexing. The two are interchangeable syntactically." },
    { syntax: "p[i], *(p + i), i[p]", behavior: "All three are equivalent — pointer arithmetic + dereference.", when: "Array indexing. The `i[p]` form is a curiosity, never use in production." },
    { syntax: "*p, &x", behavior: "Dereference / address-of — inverse operations; `&*p == p`, `*&x == x`.", when: "Pointer access. `&` on a bitfield or register var is a compile error." },
    { syntax: "_Generic(x, ...)", behavior: "Compile-time type dispatch (C11) — picks one of N expressions based on the type of x.", when: "Type-generic macros — C's answer to function overloading." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "c",
      caption: "stdio.h — fopen, fread, getline",
      code: `#include <stdio.h>
#include <stdlib.h>

// Read whole file into a buffer
char *read_file(const char *path, size_t *out_len) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  long sz = ftell(f);
  rewind(f);
  char *buf = malloc(sz + 1);
  if (!buf) { fclose(f); return NULL; }
  fread(buf, 1, sz, f);
  buf[sz] = '\\0';
  fclose(f);
  *out_len = sz;
  return buf;
}

// Stream line by line (POSIX getline)
char *line = NULL; size_t cap = 0; ssize_t len;
while ((len = getline(&line, &cap, stdin)) != -1) {
  if (line[len-1] == '\\n') line[--len] = '\\0';
  process(line);
}
free(line);  // getline reuses the buffer across calls`,
    },
    {
      lang: "c",
      caption: "stdin / stdout / stderr — pipes and CLI tools",
      code: `#include <stdio.h>

// Unbuffered stdout for line-by-line piped output
setvbuf(stdout, NULL, _IOLBF, 0);

int c;
while ((c = getchar()) != EOF) {
  putchar(toupper(c));
}

// stderr — separate stream, unbuffered by default
fprintf(stderr, "warning: deprecated (pid=%d)\\n", getpid());

// printf format-string safety: always use the right specifier
// %d int, %ld long, %lld long long, %zu size_t, %p void*,
// %.2f double. NEVER user-controlled strings as the format.`,
    },
    {
      lang: "c",
      caption: "Binary I/O — read/write structs, network byte order",
      code: `#include <arpa/inet.h>  // POSIX
#include <stdint.h>

#pragma pack(push, 1)
struct header {
  uint32_t magic;
  uint16_t version;
  uint16_t flags;
};
#pragma pack(pop)

// Network byte order — always convert at the boundary
struct header h = { htonl(0xDEADBEEF), htons(1), htons(0) };
fwrite(&h, sizeof(h), 1, out);

// Reading — fix endianness after read
fread(&h, sizeof(h), 1, in);
h.magic   = ntohl(h.magic);
h.version = ntohs(h.version);`,
    },
    {
      lang: "c",
      caption: "Memory-mapped files — zero-copy large reads (POSIX)",
      code: `#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>

int fd = open("huge.bin", O_RDONLY);
struct stat st; fstat(fd, &st);
void *data = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
if (data == MAP_FAILED) { perror("mmap"); exit(1); }

// Process bytes without copying — kernel page-caches the file
const uint8_t *p = data;
for (size_t i = 0; i < st.st_size; i++) process_byte(p[i]);

munmap(data, st.st_size);
close(fd);`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "c",
      caption: "for, while, do-while — the three loops",
      code: `// Classic for — full control of init/cond/step
for (size_t i = 0; i < n; i++) {
  process(arr[i]);
}

// while — condition checked first; body may never run
while (state.running) {
  step(&state);
}

// do-while — body runs at least once; rare but right for "prompt until valid"
int c;
do { c = getchar(); } while (c != 'y' && c != 'n');

// Use size_t for indices — unsigned, avoids sign-compare warnings.`,
    },
    {
      lang: "c",
      caption: "Pointer iteration — the C idiom",
      code: `// Iterate an array via pointer arithmetic — fast and idiomatic
int arr[] = {1, 2, 3, 4, 5};
size_t n = sizeof(arr) / sizeof(arr[0]);

for (int *p = arr; p < arr + n; p++) {
  *p *= 2;  // mutate in place
}

// Or with indices — equally fast, more readable
for (size_t i = 0; i < n; i++) {
  arr[i] *= 2;
}

// String iteration — NUL-terminated
for (const char *p = "hello"; *p; p++) {
  putchar(*p);
}`,
    },
    {
      lang: "c",
      caption: "Recursion — depth bounded by stack size",
      code: `// Recursive tree walk — natural for hierarchical data
void walk(const struct node *n) {
  if (!n) return;
  walk(n->left);
  visit(n);
  walk(n->right);
}

// Tail-recursive — but C does NOT guarantee TCO; may stack-overflow
size_t length(const struct list_node *p, size_t acc) {
  return p ? length(p->next, acc + 1) : acc;
}

// Convert deep recursion to iteration with an explicit stack for unbounded data
void walk_iterative(struct node *root) {
  struct stack st = {0};
  push(&st, root);
  while (!empty(&st)) {
    struct node *n = pop(&st);
    if (!n) continue;
    push(&st, n->right); push(&st, n->left); visit(n);
  }
}`,
    },
    {
      lang: "c",
      caption: "Function pointer tables — dispatch loops",
      code: `typedef void (*cmd_fn)(const char *arg);

struct cmd {
  const char *name;
  cmd_fn fn;
};

static const struct cmd commands[] = {
  { "help", cmd_help },
  { "quit", cmd_quit },
  { "load", cmd_load },
};
static const size_t n_commands = sizeof(commands) / sizeof(commands[0]);

// Linear scan — fine for short tables; use a hash table for hundreds
void dispatch(const char *name, const char *arg) {
  for (size_t i = 0; i < n_commands; i++) {
    if (strcmp(commands[i].name, name) == 0) {
      commands[i].fn(arg);
      return;
    }
  }
  fprintf(stderr, "unknown command: %s\\n", name);
}`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "c",
      caption: "Function signatures — pass-by-value, pointers, arrays",
      code: `// Pass-by-value — caller's variable is not modified
int square(int x) { return x * x; }

// Pass-by-pointer (input) — function reads through the pointer
size_t strlen(const char *s);

// Pass-by-pointer (output) — function writes through the pointer
int parse_int(const char *s, int *out);

// Array parameters — these ALL mean the same thing (decay to pointer)
void f(int *a);
void f(int a[]);
void f(int a[10]);
void f(int a[static 10]);  // C99: declares minimum length, may optimize`,
    },
    {
      lang: "c",
      caption: "Function pointers + callbacks",
      code: `// Comparator pattern — qsort, bsearch
int cmp_int(const void *a, const void *b) {
  int x = *(const int *)a, y = *(const int *)b;
  return (x > y) - (x < y);  // branchless, handles overflow
}

int arr[] = {3, 1, 4, 1, 5};
qsort(arr, 5, sizeof(int), cmp_int);

// Callback with user data (context pointer) — the universal C pattern
typedef void (*iter_fn)(void *ctx, int x);
void for_each(int *arr, size_t n, iter_fn fn, void *ctx) {
  for (size_t i = 0; i < n; i++) fn(ctx, arr[i]);
}`,
    },
    {
      lang: "c",
      caption: "Variadic functions — printf-style",
      code: `#include <stdarg.h>

// Variadic — sum of N integers; caller must convey count somehow
int sum(int n, ...) {
  va_list ap;
  va_start(ap, n);
  int total = 0;
  for (int i = 0; i < n; i++) total += va_arg(ap, int);
  va_end(ap);
  return total;
}

int s = sum(3, 10, 20, 30);  // 60

// WARNING: no type checking — passing a long where int expected is UB.
// Variadic functions are how printf footguns happen; use C23 attributes
// or __attribute__((format(printf, ...))) for compile-time checks.`,
    },
    {
      lang: "c",
      caption: "Macros vs static inline — code generation in C",
      code: `// Macro — no type info, multi-evaluation risk, but works on any type
#define MAX(a, b) ((a) > (b) ? (a) : (b))
// Footgun: MAX(i++, j++) evaluates i++ twice

// static inline — type-checked, no multi-eval, preferred for new code
static inline int max_int(int a, int b) { return a > b ? a : b; }

// Type-generic via _Generic (C11)
#define max(a, b) _Generic((a), \\
  int: max_int, \\
  long: max_long, \\
  default: max_int)((a), (b))

// Macros are still useful for: log/debug prefixes, compile-time strings,
// token-pasting, conditional compilation. Prefer inline functions otherwise.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "c",
      caption: "Return codes — the universal C pattern",
      code: `// Convention: 0 = success, negative = error
int read_config(const char *path, struct config *out) {
  if (!path || !out) return -EINVAL;
  FILE *f = fopen(path, "r");
  if (!f) return -errno;
  int rc = parse(f, out);
  fclose(f);
  return rc;  // 0 on success, negative on parse failure
}

// Caller:
struct config cfg;
int rc = read_config("app.cfg", &cfg);
if (rc < 0) {
  fprintf(stderr, "config error: %s\\n", strerror(-rc));
  exit(1);
}`,
    },
    {
      lang: "c",
      caption: "goto cleanup — idiomatic error cleanup in C",
      code: `int do_work(const char *path) {
  FILE *f = NULL;
  char *buf = NULL;
  int rc = -1;

  if (!(f = fopen(path, "r"))) goto done;
  if (!(buf = malloc(BUF_SIZE))) goto done;
  if (fread(buf, 1, BUF_SIZE, f) < 4) goto done;
  if (process(buf) != 0) goto done;
  rc = 0;  // success — fall through to cleanup

done:
  if (f) fclose(f);
  free(buf);  // free(NULL) is a no-op — always safe
  return rc;
}

// Linus Torvalds endorses this pattern for C cleanup. Don't fight it.`,
    },
    {
      lang: "c",
      caption: "errno — last error from libc",
      code: `#include <errno.h>
#include <string.h>

FILE *f = fopen("missing", "r");
if (!f) {
  // errno is set by fopen — but ONLY check it immediately after the call
  // that failed; any libc call may overwrite it.
  fprintf(stderr, "open failed: %s\\n", strerror(errno));
}

// Thread-safe strerror — use strerror_r in multi-threaded code
char buf[256];
strerror_r(errno, buf, sizeof(buf));

// setjmp/longjmp — non-local goto, almost never the right tool.
// Use only for error recovery in deeply nested parsers; resource
// leaks are a real risk since destructors don't run.`,
    },
    {
      lang: "c",
      caption: "Out-parameter pattern — explicit success/failure",
      code: `// bool return + out parameter — common in modern C
#include <stdbool.h>

bool parse_int(const char *s, int *out) {
  if (!s || !*s) return false;
  char *end;
  long v = strtol(s, &end, 10);
  if (*end != '\\0' || v < INT_MIN || v > INT_MAX) return false;
  *out = (int)v;
  return true;
}

// Caller:
int n;
if (!parse_int("42", &n)) {
  fprintf(stderr, "bad input\\n");
  exit(1);
}
// n is set only on success — never read out without checking the return`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "c",
      caption: "pthread — POSIX threads, the C standard for decades",
      code: `#include <pthread.h>

void *worker(void *arg) {
  int id = *(int *)arg;
  // ... do work ...
  return NULL;
}

int ids[8];
pthread_t ts[8];
for (int i = 0; i < 8; i++) {
  ids[i] = i;
  pthread_create(&ts[i], NULL, worker, &ids[i]);
}
for (int i = 0; i < 8; i++) pthread_join(ts[i], NULL);

// On Windows, use the Win32 thread API or C11 threads (<threads.h>) for portable code.`,
    },
    {
      lang: "c",
      caption: "C11 threads.h — portable, but uneven support",
      code: `#include <threads.h>

int worker(void *arg) { /* ... */ return 0; }

thrd_t t[8];
for (int i = 0; i < 8; i++) thrd_create(&t[i], worker, NULL);
for (int i = 0; i < 8; i++) thrd_join(t[i], NULL);

// C11 also provides mtx_t, cnd_t, tss_t (thread-local storage).
// Caveat: support is uneven — glibc only added full C11 threads in 2.34 (2021).
// For broad portability, prefer pthread (POSIX) or stdatomic.h for atomics.`,
    },
    {
      lang: "c",
      caption: "stdatomic.h (C11) — lock-free primitives + memory orders",
      code: `#include <stdatomic.h>

atomic_int counter = 0;

void bump(void) {
  atomic_fetch_add_explicit(&counter, 1, memory_order_relaxed);
}

// Release-acquire pairing — non-atomic writes before release visible after acquire
atomic_bool ready = false;
int data = 0;

// Thread A:
data = 42;
atomic_store_explicit(&ready, true, memory_order_release);

// Thread B:
while (!atomic_load_explicit(&ready, memory_order_acquire)) {
  // spin
}
assert(data == 42);  // guaranteed`,
    },
    {
      lang: "c",
      caption: "Mutex + condition variable — producer/consumer",
      code: `mtx_t mtx;
cnd_t not_empty, not_full;
struct queue q;  // bounded queue

void producer(int item) {
  mtx_lock(&mtx);
  while (q.len == q.cap) cnd_wait(&not_full, &mtx);  // backpressure
  q_push(&q, item);
  cnd_signal(&not_empty);
  mtx_unlock(&mtx);
}

int consumer(void) {
  mtx_lock(&mtx);
  while (q.len == 0) cnd_wait(&not_empty, &mtx);  // wait for work
  int item = q_pop(&q);
  cnd_signal(&not_full);
  mtx_unlock(&mtx);
  return item;
}`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "c",
      caption: "Unity / Ceedling — embedded-friendly C unit testing",
      code: `#include "unity.h"

void setUp(void) {}    // runs before each test
void tearDown(void) {}

void test_cart_adds_item(void) {
  Cart c = cart_new();
  cart_add(&c, (Item){"x", 100});
  TEST_ASSERT_EQUAL(100, cart_total(&c));
  TEST_ASSERT_EQUAL(1, c.size);
  cart_free(&c);
}

int main(void) {
  UNITY_BEGIN();
  RUN_TEST(test_cart_adds_item);
  return UNITY_END();
}`,
    },
    {
      lang: "c",
      caption: "Assertion macros — debug-only invariants",
      code: `#include <assert.h>

// assert() — compiled out with NDEBUG (release builds)
void push(struct stack *s, int x) {
  assert(s != NULL);
  assert(s->len < s->cap);
  s->items[s->len++] = x;
}

// static_assert (C11) — compile-time check
static_assert(sizeof(int) >= 4, "int must be at least 32 bits");

// For runtime invariants in release, use a custom macro:
#define CHECK(cond, msg) \\
  do { if (!(cond)) { fprintf(stderr, "CHECK failed: %s at %s:%d\\n", msg, __FILE__, __LINE__); abort(); } } while (0)`,
    },
    {
      lang: "c",
      caption: "Property-based testing with rapidcheck / c-focc",
      code: `// rapidcheck has a C wrapper; usage mirrors the C++ version
#include <rapidcheck.h>

RC_TEST("sort is idempotent") {
  int xs[100];
  size_t n = rc::gen::inRange(0, 100).as<size_t>();
  for (size_t i = 0; i < n; i++) xs[i] = rc::gen::arbitrary<int>().as<int>();

  int once[100], twice[100];
  memcpy(once, xs, sizeof(xs)); qsort_int(once, n);
  memcpy(twice, once, sizeof(once)); qsort_int(twice, n);
  RC_ASSERT_MEM_EQ(once, twice, n * sizeof(int));
}`,
    },
    {
      lang: "c",
      caption: "Sanitizers + Valgrind + fuzzing — the C testing stack",
      code: `// CMake / Makefile — enable in debug builds
CFLAGS  += -fsanitize=address,undefined -fno-omit-frame-pointer -g -O1
LDFLAGS += -fsanitize=address,undefined

// Compile with -fsanitize=thread for data race detection (TSan)
// Run under Valgrind for memory leaks without recompiling:
//   valgrind --leak-check=full ./program

// libFuzzer (Clang) — coverage-guided fuzzing
extern int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  if (size < 4) return 0;
  parse(data, size);  // must not crash on any input
  return 0;
}`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "malloc/free is amortized O(1) but per-call ~50–200ns; for hot paths, pool allocations or use arena allocators.", tag: "perf" },
    { fact: "restrict qualifier tells the compiler two pointers don't alias — enables vectorization; lying with it is UB.", tag: "perf" },
    { fact: "Static inline functions in headers are the C idiom for small utilities; inline alone has tricky rules across translation units.", tag: "style" },
    { fact: "A function pointer call has indirect-branch cost (~5ns) plus potential retpoline penalty (~50ns) under Spectre mitigations.", tag: "perf" },
    { fact: "memcpy is faster than a byte-by-byte loop on modern CPUs — the libc version uses SIMD; never hand-roll.", tag: "perf" },
    { fact: "Structure padding: reorder members largest-to-smallest to minimize holes — a struct {char a; int b; char c;} is 12 bytes, {int b; char a; char c;} is 8.", tag: "perf" },
    { fact: "Integer promotion: small types (char, short) are promoted to int before arithmetic — surprising for overflow and bitwise ops.", tag: "gotcha" },
    { fact: "volatile disables optimization on a single variable but does NOT make operations atomic; use stdatomic.h (C11) for atomics.", tag: "gotcha" },
    { fact: "Compile with -O2 for production; -O3 sometimes helps, sometimes hurts (code bloat hurts I-cache). Profile both.", tag: "perf" },
    { fact: "POSIX vs ISO C: getline, strlcpy, snprintf are POSIX or BSD — ISO C has snprintf since C99 only; check portability before assuming.", tag: "version" },
    { fact: "C ABI is the universal FFI substrate — every major language can call it; that's why SQLite, libssl, libpng are C.", tag: "version" },
    { fact: "Perf profiling: perf (Linux), Instruments (macOS), VTune (Intel); perf record + perf report is the standard Linux flow.", tag: "perf" },
    { fact: "Strict aliasing: a pointer of type T* must not access memory of an incompatible type — broken in most C code, opt out with -fno-strict-aliasing or use memcpy.", tag: "gotcha" },
    { fact: "C23 adds nullptr, bool/true/false keywords, [[nodiscard]]/[[maybe_unused]] attributes, auto, stdckdint.h for checked arithmetic.", tag: "version" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Make", purpose: "The classic build tool — simple, ubiquitous, painful at scale; still the default for small projects.", url: "https://www.gnu.org/software/make/", category: "build" },
    { tool: "CMake", purpose: "Cross-platform meta-build system — generates Makefiles, Ninja, VS projects files; de-facto standard.", url: "https://cmake.org/", category: "build" },
    { tool: "Meson", purpose: "User-friendly build system — used by systemd, GNOME, Xorg; fast and modern.", url: "https://mesonbuild.com/", category: "build" },
    { tool: "Autotools", purpose: "GNU build system — autoconf/automake/libtool. Ancient but universal on POSIX; painful to maintain.", url: "https://www.gnu.org/software/automake/", category: "build" },
    { tool: "pkg-config", purpose: "Finds installed libraries and their flags — the C dependency resolver.", url: "https://www.freedesktop.org/wiki/Software/pkg-config/", category: "package" },
    { tool: "Conan", purpose: "C/C++ package manager — works for C too; integrates with CMake/Meson.", url: "https://conan.io/", category: "package" },
    { tool: "vcpkg", purpose: "Microsoft's package manager — mostly C++ but many C libraries too.", url: "https://vcpkg.io/", category: "package" },
    { tool: "clang-format", purpose: "Opinionated formatter — supports C; integrates with all editors and CI.", url: "https://clang.llvm.org/docs/ClangFormat.html", category: "lint" },
    { tool: "clang-tidy", purpose: "Static analyzer + linter — bugprone, cert, performance checks for C.", url: "https://clang.llvm.org/extra/clang-tidy/", category: "lint" },
    { tool: "cppcheck", purpose: "Static analyzer focused on C/C++ bugs — complementary to clang-tidy.", url: "https://cppcheck.sourceforge.io/", category: "lint" },
    { tool: "CBMC", purpose: "C Bounded Model Checker — formal verification of C; proves absence of certain bugs.", url: "https://www.cprover.org/cbmc/", category: "lint" },
    { tool: "Unity", purpose: "Tiny unit-test framework for C — popular in embedded.", url: "http://www.throwtheswitch.org/unity", category: "test" },
    { tool: "Ceedling", purpose: "Build + test wrapper around Unity — Ruby-based, embedded-friendly.", url: "http://www.throwtheswitch.org/ceedling", category: "test" },
    { tool: "ASan / UBSan / TSan", purpose: "Compiler-instrumented sanitizers — memory, UB, data race detection.", url: "https://clang.llvm.org/docs/AddressSanitizer.html", category: "debug" },
    { tool: "Valgrind", purpose: "Runtime memory + cache profiler — no recompile needed; slower than ASan.", url: "https://valgrind.org/", category: "debug" },
    { tool: "GDB / LLDB", purpose: "Source-level debuggers — GDB on Linux, LLDB on macOS/Clang.", url: "https://www.gnu.org/software/gdb/", category: "debug" },
    { tool: "perf", purpose: "Linux profiler — perf record + perf report is the standard CPU profile flow.", url: "https://perf.wiki.kernel.org/", category: "debug" },
    { tool: "Docker", purpose: "Container packaging — most C services ship as a binary in a minimal image.", url: "https://www.docker.com/", category: "deploy" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "K&R C",  year: 1978, highlight: "Kernighan & Ritchie's 'The C Programming Language' codified the language before standardization." },
    { version: "C89 / ANSI C", year: 1989, highlight: "First ANSI standard — function prototypes, void, const, stdlib." },
    { version: "C90 / ISO C", year: 1990, highlight: "ISO adoption of C89 — essentially identical; the baseline for decades." },
    { version: "C99",   year: 1999, highlight: "_Bool, long long, stdint.h, designated initializers, compound literals, VLAs, // comments." },
    { version: "C11",   year: 2011, highlight: "_Generic, stdatomic.h, threads.h, _Static_assert, anonymous structs/unions." },
    { version: "C17 / C18", year: 2018, highlight: "Bugfix release; no new features; clarifies C11 ambiguities." },
    { version: "C23",   year: 2023, highlight: "nullptr, bool/true/false keywords, [[nodiscard]]/[[maybe_unused]]/[[deprecated]] attributes, auto, stdckdint.h, #embed." },
    { version: "C2y",   year: 2026, highlight: "Next iteration — working draft; reflection, contracts considered." },
    { version: "POSIX.1-2008", year: 2008, highlight: "Standardized getline, strlcpy/strlcat, pthreads; the POSIX layer most C code assumes." },
    { version: "BSD libc",  year: 1994, highlight: "4.4BSD Lite introduced strlcpy/strlcat — safer string handling now widespread." },
    { version: "GCC 1.0", year: 1987, highlight: "Stallman's GNU C Compiler — first free C compiler; still the Linux default." },
    { version: "Clang 1.0", year: 2007, highlight: "LLVM-based C compiler — faster diagnostics, basis for modern tooling (ASan, clang-tidy)." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What is undefined behavior in C, and why does it matter?", a: "UB means the standard imposes no requirements — the compiler can do anything, including deleting surrounding checks. Examples: signed overflow, use-after-free, reading uninitialized memory, dereferencing NULL. Code may pass in debug and corrupt data in release because optimizers assume UB doesn't happen. Build with `-fsanitize=address,undefined` in CI.", difficulty: "easy" },
    { q: "Explain the difference between `char`, `signed char`, and `unsigned char`.", a: "Plain char may be signed or unsigned (implementation-defined) and is intended for characters. signed char and unsigned char are explicitly signed/unsigned 1-byte integers. All three are distinct types in the type system — `sizeof(char) == 1` always. Use unsigned char for raw memory, signed char for small signed values, char for character data.", difficulty: "medium" },
    { q: "Why are C strings so dangerous?", a: "C strings are NUL-terminated byte sequences — there's no length stored, so every operation walks to the NUL. strcpy/strcat are unbounded — buffer overflows waiting to happen. snprintf is safer but still error-prone. Use strlcpy/strlcat (BSD/POSIX), or a string library (sds, libuv strings) for non-trivial string code.", difficulty: "easy" },
    { q: "Explain pointer arithmetic.", a: "`p + n` advances p by n * sizeof(*p) bytes. `p[i]` is exactly `*(p + i)`. You may form pointers within an array or one-past-the-end (but not dereference the latter). Pointer arithmetic across array bounds is UB. The idiom `for (int *p = arr; p < arr + n; p++)` works because arr decays to &arr[0].", difficulty: "medium" },
    { q: "What's the difference between `const T *` and `T * const`?", a: "`const T *p` (or `T const *p`) is a pointer to const data — you can't modify what p points to, but p itself can change. `T * const p` is a const pointer to mutable data — p can't be reassigned, but *p can be modified. Read declarations right-to-left. `const T * const p` is both.", difficulty: "medium" },
    { q: "Why does an array decay to a pointer when passed to a function?", a: "Arrays can't be passed by value in C — the parameter `void f(int a[])` is silently rewritten to `void f(int *a)`. This was an early performance choice: copying arrays on every call would be expensive. The cost: `sizeof(a)` inside f is `sizeof(int*)`, not the array size. Always pass length as a separate argument.", difficulty: "medium" },
    { q: "Explain `restrict` and when it matters.", a: "`restrict` (C99) tells the compiler that a pointer is the only way to access a region of memory for the lifetime of the function. This enables vectorization and other optimizations impossible if aliasing is possible. Lying with `restrict` is UB. memcpy takes restrict pointers — that's how it knows it can use SIMD. Most code doesn't need it; it's a hot-loop optimization.", difficulty: "hard" },
    { q: "What is the difference between `static` at file scope vs function scope?", a: "File-scope static gives internal linkage — the symbol is invisible outside the translation unit (module-private). Function-scope static gives static storage duration — the variable persists across calls, initialized once. Both hide visibility; only file-scope static affects linkage. C23 deprecates function-scope static in favor of thread_local for thread-safe alternatives.", difficulty: "medium" },
    { q: "How do you write thread-safe C code?", a: "Use stdatomic.h (C11) for shared counters and flags. Use mtx_t (C11) or pthread_mutex_t (POSIX) for complex shared state. Avoid global mutable state. Use TLS (thread_local / _Thread_local) for per-thread state. Never call non-reentrant functions (strtok, asctime, rand without *_r variants) from concurrent code. Run ThreadSanitizer in CI.", difficulty: "hard" },
    { q: "When is C still the right choice in 2025?", a: "Kernels and OS internals (Linux, Windows NT, XNU), embedded firmware, language runtimes (CPython, Lua, SQLite), FFI substrate for higher-level languages, libraries needing a stable cross-language ABI. Avoid C for new application-level code — Rust, Zig, or Go are usually safer and equally fast. The C ecosystem is the foundation everything else stands on.", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "C++", whenThis: "Kernels, embedded firmware, FFI libraries, anything needing a tiny toolchain and stable ABI.", whenThat: "Anything above the kernel boundary — game engines, ML infra, complex generics, rich standard library." },
    { vs: "Rust", whenThis: "Existing C codebases, kernels (Linux), FFI substrate, anywhere the toolchain must stay tiny.", whenThat: "New systems code where memory safety matters; modern alternatives with similar perf and no UB footguns." },
    { vs: "Go", whenThis: "Kernels, embedded, FFI libraries, anywhere startup time and binary size matter.", whenThat: "Cloud-native services, CLIs, network daemons — anything where goroutines + channels + GC fit naturally." },
    { vs: "Zig", whenThis: "Mature ecosystem, stable ABI, decades of library code, anywhere you need maximum portability.", whenThat: "New systems code wanting simpler semantics, no hidden control flow, C interop as a first-class goal." },
    { vs: "Assembly", whenThis: "Anything portable — C is the portable assembly. Kernels and stdlibs are mostly C.", whenThat: "Tiny hot loops where every cycle counts, ABI details (calling conventions, prologue), boot code, ISAs C can't reach." },
  ],
};

export default sheet;
