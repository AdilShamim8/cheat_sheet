# Python

**Category:** Languages · **Tier:** Tier 1 · Core · **Tags:** dynamic, interpreted, batteries-included, data-science, scripting, backend, async · **First released:** 1991 · **Author:** Guido van Rossum · **Last updated:** 2026-11

> Batteries-included, dynamically-typed language — the default for scripting, data/ML, and backend services.

---

## TL;DR

- Python is a high-level, dynamically-typed, garbage-collected language whose design prioritizes readability and a single obvious way to do most things.
- It dominates data science / ML (NumPy, Pandas, PyTorch all target Python first), scripting, automation, and a large share of backend web services via Django, Flask, and FastAPI.
- Reach for Python when developer time matters more than execution speed, when you need to glue libraries together, or when the ecosystem (ML, scientific, NLP) is the actual product.
- Avoid Python for hard-realtime, embedded, browser, or raw-throughput-CPU-bound work — use the C extension protocol or call into Rust/C via PyO3 instead.

## Core Mental Model

**Everything is a namespace of references.** Python variables are names bound to objects — never boxes that hold values. Assignment ('a = b') copies the reference, not the object; 'is' tests identity, '==' tests equality. Objects themselves have a type, a refcount, and a dict (for most classes) — there are no primitive types in the language model, only in the implementation. This single mental model explains: mutable default arguments being shared, copies being shallow by default, and why 'a += b' mutates a list in place but rebinds an int.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| def f(x, /, *, y): ... | Function with positional-only ('/') and keyword-only ('*') markers. | API design where parameter names must not become part of the public contract. |
| x = a if cond else b | Ternary expression — evaluates only the chosen branch. | Concise conditional assignment; avoid nesting. |
| with ctx() as x: ... | Context manager — guarantees __enter__/__exit__ pairing even on exception. | Files, locks, transactions, DB sessions, mocks. |
| @dataclass class C: | Auto-generates __init__, __repr__, __eq__ from type-annotated fields. | Value-holding classes; prefer over hand-written boilerplate. |
| from typing import TypedDict | Dict with declared key→type contract — checked by mypy/pyright, runtime still a dict. | JSON payloads, API responses, config. |
| x: list[int] = [] | Type hint + assignment; hint is not enforced at runtime. | Always — pair with mypy/pyright in strict mode. |
| yield x | Turns a function into a generator — lazy, single-pass iterator. | Streaming, large sequences, pipelines. |
| match x:   case 1: ... | Structural pattern matching (3.10+) — destructuring + guard. | Replacing long elif chains; parsing tagged unions. |
| @contextlib.asynccontextmanager | Async equivalent of 'with' for 'async with' blocks. | Async DB pools, HTTP clients, locks. |
| from __future__ import annotations | Postpones evaluation of all annotations to strings. | Default in 3.13+; lets forward references work without quoting. |

## Idiomatic Patterns

**Idiomatic dataclass + typing — the modern struct**

```python
from dataclasses import dataclass, field
from typing import Literal

@dataclass(frozen=True, slots=True)
class User:
    id: int
    email: str
    role: Literal["admin", "member", "guest"] = "member"
    tags: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        if "@" not in self.email:
            raise ValueError(f"bad email: {self.email!r}")

u = User(id=1, email="a@b.io")
# u.email = "x"  # FrozenInstanceError — use dataclasses.replace instead
```

**Context manager + generator pipeline (lazy, streaming)**

```python
from contextlib import contextmanager
from pathlib import Path

@contextmanager
def lines(path: Path):
    f = path.open(encoding="utf-8")
    try:
        yield f
    finally:
        f.close()

def transform(line: str) -> str:
    return line.strip().lower()

with lines(Path("data.txt")) as fh:
    pipeline = (
        transform(line)
        for line in fh
        if line.strip() and not line.startswith("#")
    )
    for clean in pipeline:
        process(clean)
```

**Async with httpx + asyncio.gather — concurrent, bounded**

```python
import asyncio, httpx

async def fetch(client: httpx.AsyncClient, url: str) -> dict:
    r = await client.get(url, timeout=10.0)
    r.raise_for_status()
    return r.json()

async def crawl(urls: list[str], limit: int = 10) -> list[dict]:
    sem = asyncio.Semaphore(limit)
    async def bound(u: str):
        async with sem:
            return await fetch(client, u)
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(*(bound(u) for u in urls))
```

**Discriminated union with match — typed error handling**

```python
from typing import Literal, Union
from dataclasses import dataclass

@dataclass(frozen=True)
class Ok:
    tag: Literal["ok"] = "ok"
    value: int = 0

@dataclass(frozen=True)
class Err:
    tag: Literal["err"] = "err"
    msg: str = ""

Result = Union[Ok, Err]

def handle(r: Result) -> int:
    match r:
        case Ok(value=v): return v
        case Err(msg=m):  print(f"err: {m}"); return -1
        case _:            raise AssertionError("unreachable")
```

## Common Pitfalls

1. **Mutable default arguments are shared across calls** — *Symptom:* def f(x=[]): x.append(1) — every call mutates the same list, so the second call sees [1, 1]. *Fix:* Use 'x=None' and 'x = [] if x is None else x' inside the body. Defaults are evaluated once at def time, not call time.
2. **Late-binding closures in loops** — *Symptom:* lambdas captured in a loop all see the final value of the loop variable when called later. *Fix:* Bind via default arg: 'lambda x=x: x' or use functools.partial. Loop variables in Python do not get a fresh binding per iteration.
3. **'is' vs '==' for comparing ints/strings** — *Symptom:* 'x is None' works because None is a singleton, but 'x is 5' may work locally and fail elsewhere due to int caching. *Fix:* Use 'is' only for None, True, False, and sentinel objects. For everything else, including small ints and strings, use '=='.
4. **Shallow copies of nested structures** — *Symptom:* 'copy.copy' (or 'list[:]') clones the outer container but shares inner lists — mutating an inner list leaks across copies. *Fix:* Use 'copy.deepcopy' for nested mutable structures, or restructure as immutable dataclasses / tuples.
5. **Modifying a dict while iterating it** — *Symptom:* 'for k in d: del d[k]' raises RuntimeError: dictionary changed size during iteration. *Fix:* Iterate over a snapshot 'list(d.keys())' or build a new dict with a comprehension and replace.
6. **Bare except clauses swallow everything** — *Symptom:* 'except:' catches KeyboardInterrupt and SystemExit too, breaking Ctrl-C and shutdown. *Fix:* Use 'except Exception:' at minimum, and catch only the specific exceptions you actually handle.
7. **f-string debugging with braces (pre-3.12)** — *Symptom:* 'f"{x}"' is fine but 'f"{dict['k']}"' works only in 3.12+ — earlier versions choke on nested quotes. *Fix:* Upgrade to 3.12+ for f-string debugging ('f"{x=}"'), or extract to a local variable first.

## Production / Interview Quick Reference

- Python 3.15.2 (Oct 2026) is current — lazy imports, frozendict, UTF-8 default; 3.14 in bugfix, 3.13 security-only. `version`
- GIL: only one thread runs Python bytecode at a time — use multiprocessing or C-extensions (NumPy releases the GIL) for true CPU parallelism. `perf`
- Free-threaded Python (no-GIL) is officially supported since 3.14 (PEP 779); 3.15 adds a stable abi3t ABI and installs free-threading by default in the official macOS binaries. `version`
- List comprehension is ~30-50% faster than an equivalent for-loop with .append() due to specialized bytecode. `perf`
- Dict ordering is insertion-ordered since 3.7 (CPython 3.6 implementation detail, then language guarantee). `version`
- sys.int_max_str_digits caps int→str conversion at 4300 digits by default since 3.11 (DoS mitigation). `gotcha`
- match-case (3.10+), walrus := (3.8+), f-strings (3.6+), type hints (3.5+). `version`
- Use functools.lru_cache for memoization — thread-safe, O(1) lookup, but unbounded by default. `perf`
- Exception hierarchy: BaseException → SystemExit / KeyboardInterrupt / Exception. Catch Exception, not BaseException. `gotcha`
- pyproject.toml is the standard config since PEP 518/621; setup.py is legacy. `version`
- mypy --strict or pyright in strict mode is the realistic floor for type safety in 2024+ codebases. `style`
- Slots ('__slots__') cut memory per instance ~40-50% and speed up attribute access — use for value classes with millions of instances. `perf`
- asyncio is single-threaded — blocking calls (requests, time.sleep, file I/O in stdlib) stall the loop. Use aiofiles / httpx / asyncer. `gotcha`
- Import order: stdlib → third-party → local. isort/ruff enforce. `style`
- Path objects (pathlib) replace os.path.* for new code — more readable, cross-platform. `style`
- PEP 8: 4 spaces, 79 cols for code / 72 for docstrings. Black/ruff format handle this automatically. `style`

## Go Deeper

- [Python Documentation — official language reference](https://docs.python.org/3/reference/) — The authoritative spec; read the data model chapter for __dunder__ semantics.
- [PEP 8 — Style Guide for Python Code](https://peps.python.org/pep-0008/) — The canonical style reference; ruff/black implement its spirit.
- [Fluent Python (Luciano Ramalho)](https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/) — Best deep treatment of the data model, descriptors, and concurrency.
- [Real Python — Tutorials & Deep Dives](https://realpython.com/) — High-signal articles on specific topics (async, typing, packaging).
- [Hypermodern Python (Claudio Jolowicz)](https://cjolowicz.github.io/posts/hypermodern-python-01-setup/) — The reference series on modern pyproject.toml-based packaging and tooling.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| int | Arbitrary-precision integer — no overflow, auto-promotes to long. | Counting, indexing, bit flags. Slower than C int but never overflows. |
| float | IEEE 754 double (64-bit). Same as C double. | Math. For money/decimals use decimal.Decimal; for fractions use fractions.Fraction. |
| bool | Subclass of int — True == 1, False == 0. Singletons. | Logic. Don't subclass; just use True/False. |
| str | Immutable sequence of Unicode code points. UTF-8 in source. | All text. Bytes are 'bytes', not 'str' — never mix them. |
| bytes | Immutable sequence of bytes (0-255). | Binary I/O, network, hashes. Decode to str for text. |
| bytearray | Mutable bytes — like a list of ints. | Building binary protocols, in-place crypto. |
| complex | Pair of floats (real, imag). | Scientific computing; rare in business code. |
| NoneType (None) | Singleton null. Falsy. 'is None' is the only correct test. | Optional values, sentinel defaults. |
| Ellipsis (...) | Singleton used for stubs, NumPy slicing, type hints. | Passing in type stubs; multi-dimensional slicing. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| list[T] | Mutable dynamic array — O(1) append/pop, O(n) insert at front. | Ordered, indexable, mutable sequences. Default workhorse. |
| tuple[T, ...] | Immutable sequence — fixed length, hashable if elements are. | Heterogeneous records, dict keys, fixed configs. |
| dict[K, V] | Insertion-ordered hash map — O(1) avg lookup/insert. | Keyed lookups, JSON, namespaces. The most-used collection. |
| set[T] | Hash set — O(1) membership, no duplicates, unordered. | Dedup, membership tests, set algebra (∪ ∩ −). |
| frozenset[T] | Immutable, hashable set. | Dict keys, default args, immutable configs. |
| collections.deque[T] | Doubly-linked list — O(1) append/pop at both ends. | Queues, stacks, sliding windows. Faster than list for front ops. |
| collections.OrderedDict[K,V] | Like dict but with order-aware equality & move_to_end. | LRU caches, ordered configs predating 3.7 dict guarantee. |
| collections.Counter[T] | Dict subclass for counting hashables. | Frequency tables, multisets. |
| collections.defaultdict[K,V] | Dict that auto-creates missing keys via factory. | Grouping, multi-maps; avoids KeyError boilerplate. |
| array.array('i', ...) | C-typed array — much less memory than list of ints. | Large numeric arrays where NumPy is overkill. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class C: ... | Standard class — instances have __dict__, supports inheritance. | Behavior-rich objects. Use @dataclass for pure data. |
| @dataclass class C: | Auto-generates __init__/__repr__/__eq__ from annotations. | Value types, DTOs, configs. Prefer frozen=True + slots=True. |
| class C(Enum): | Named constant group — iterable, hashable, printable. | Closed sets of values; replaces magic strings/ints. |
| class C(StrEnum): | Enum where members ARE strings (3.11+). | String-valued enums that need str compat — replaces 'str, Enum' trick. |
| TypedDict('C', {k: int}) | Dict with declared key→type — checked statically. | JSON shapes, API contracts. |
| NamedTuple | Tuple subclass with named fields + type hints. | Immutable records where dataclass is too heavy. |
| class C(Protocol): | Structural typing — duck-typed interface (PEP 544). | Decoupling; declare what you consume, not what you produce. |
| type Alias = int \| str | Type alias (3.12+ 'type' statement) — clean, recursive. | Complex generic aliases; replaces 'X = Union[...]'. |
| @typing.runtime_checkable class P(Protocol): | Protocol usable with isinstance() at runtime. | Plugin systems, DI containers. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b | Arithmetic — int promotes to float on mixed operands. | Math. Use math.fsum for floats needing precision. |
| a / b | True division — always returns float. | Default division. Use // for floor, % for remainder. |
| a // b | Floor division — rounds toward negative infinity. | Integer math, indexes. NOTE: -7 // 2 == -4, not -3. |
| a ** b | Exponentiation — '2 ** 10 == 1024'. | Powers. For matrix power use NumPy '@'. |
| a @ b | Matrix multiplication (3.5+) — delegated to __matmul__. | NumPy arrays, torch tensors. Never plain lists. |
| a == b, a != b | Value equality — calls __eq__. | Default comparisons. Override __eq__ carefully — must match __hash__. |
| a is b, a is not b | Identity — same object in memory. | ONLY for None, True, False, sentinels. Never for ints/strings. |
| a < b, a > b, a <= b, a >= | Comparison — calls __lt__ etc. Chained: '1 < x < 10'. | Sorting, ranges. Chaining is idiomatic and short-circuits. |
| a and b, a or b, not a | Short-circuit boolean — returns the operand, not bool. | Default values: 'x = a or default'. Truthiness check. |
| a if c else b | Ternary — only one branch evaluated. | Concise conditional assignment. |
| a \| b, a & b, a ^ b | Bitwise OR/AND/XOR — works on ints and sets. | Bit flags, set algebra. For bool prefer 'or'/'and'. |
| ~a, a << n, a >> n | Bitwise NOT, left/right shift. | Low-level bit ops. Use bitarray/NumPy for arrays. |
| a in b, a not in b | Membership — calls __contains__. | Checking list/dict/set membership. O(1) for set/dict, O(n) for list. |
| x := expr | Walrus (3.8+) — assigns AND returns the value. | Assignment in comprehensions/conditions; reduces duplication. |

## Input / Output

**Read entire file (small) vs stream (large)**

```python
# Small file — read all at once
text = Path("small.txt").read_text(encoding="utf-8")
blob = Path("data.bin").read_bytes()

# Large file — stream line by line, never loads all into memory
with Path("huge.csv").open(encoding="utf-8") as f:
    for line in f:               # lazy iterator
        process(line.rstrip("\n"))

# Even better for huge CSVs — use the csv module's reader:
import csv
with Path("huge.csv").open(encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f):
        yield row["col"]
```

**stdin / stdout / stderr — pipes, scripts, CLI**

```python
import sys, json

# Read all of stdin
data = sys.stdin.read()

# Stream stdin line by line (memory-friendly)
for line in sys.stdin:
    line = line.rstrip("\n")
    print(line.upper(), file=sys.stdout)

# Print to stderr without buffering issues
print("warning: deprecated", file=sys.stderr, flush=True)

# JSON over stdin/stdout — common in CLI tools invoked from other langs
payload = json.loads(sys.stdin.read())
result = transform(payload)
json.dump(result, sys.stdout, indent=2)
```

**JSON / TOML / YAML / pickle — serialization tiers**

```python
import json, tomllib, pickle
from pathlib import Path

# JSON — text, portable, the default
Path("cfg.json").write_text(json.dumps({"k": 1}, indent=2))
cfg = json.loads(Path("cfg.json").read_text())

# TOML — config files (3.11+ tomllib in stdlib, read-only)
with Path("pyproject.toml").open("rb") as f:
    project = tomllib.load(f)

# Pickle — Python-specific, UNSAFE for untrusted data
Path("state.pkl").write_bytes(pickle.dumps(model))
model = pickle.loads(Path("state.pkl").read_bytes())  # NEVER on untrusted input

# CSV — use the stdlib csv module, not str.split
import csv
with Path("data.csv").open(newline="") as f:
    rows = list(csv.DictReader(f))
```

**HTTP client (sync httpx) + retries**

```python
import httpx, tenacity

@tenacity.retry(
    stop=tenacity.stop_after_attempt(3),
    wait=tenacity.wait_exponential(multiplier=0.5, max=10),
    retry=tenacity.retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
)
def get_json(url: str) -> dict:
    with httpx.Client(timeout=10.0, headers={"User-Agent": "cs/1.0"}) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.json()
```

## Loops & Iteration

**for + enumerate + zip — the holy trinity**

```python
items = ["a", "b", "c"]
scores = [10, 20, 30]

# enumerate — index + value
for i, item in enumerate(items, start=1):
    print(i, item)

# zip — parallel iteration (stops at shortest; use itertools.zip_longest for equal)
for item, score in zip(items, scores):
    print(item, score)

# Don't use range(len(...)) — that's the C way, not the Python way.
```

**Comprehensions — the Pythonic loop**

```python
# List comprehension — fastest, most idiomatic
squares = [x * x for x in range(10) if x % 2 == 0]

# Dict comprehension
word_len = {w: len(w) for w in ["cat", "dog", "elephant"]}

# Set comprehension
unique_tags = {t for tag_list in dataset for t in tag_list}

# Generator expression — lazy, single-pass, memory-friendly
total = sum(x * x for x in range(1_000_000))  # no list built

# Anti-pattern: don't use a comprehension for side effects
# BAD:  [print(x) for x in items]   <- creates a list of Nones
```

**while + else (yes, Python has while-else)**

```python
# while-else: else runs if the loop completes WITHOUT break
n = 0
while n < 10:
    if found(n):
        print("found at", n)
        break
    n += 1
else:
    print("exhausted, not found")

# Equivalent without else:
#   for n in range(10):
#       if found(n): break
#   else: print("not found")
```

**itertools — production iteration patterns**

```python
from itertools import (
    chain, islice, batched, groupby,
    count, repeat, cycle, starmap, product, permutations,
)

# Flatten a list of lists
flat = list(chain.from_iterable([[1, 2], [3, 4]]))

# First N of an infinite generator
first_10 = list(islice(count(1), 10))

# Batched (3.12+) — chunk an iterable
for batch in batched(range(100), 8):
    process(batch)

# Groupby — adjacent runs (sort first if you need global grouping)
for key, group in groupby(sorted(items, key=by_key), key=by_key):
    print(key, list(group))
```

## Functions & Callables

**Positional-only, keyword-only, defaults, *args, **kwargs**

```python
def f(a, b, /, c, d=10, *args, e, f=20, **kwargs):
    # a, b   : positional-only (PEP 570) — callers can't use names
    # c, d   : normal — positional or keyword
    # e, f   : keyword-only (after *args)
    # args   : extra positional as tuple
    # kwargs : extra keyword as dict
    return (a, b, c, d, args, e, f, kwargs)

f(1, 2, 3, e=99, extra="x")  # OK
# f(a=1, b=2)  # TypeError — a, b are positional-only
```

**Closures + decorators + functools.wraps**

```python
import functools, time
from typing import Callable, TypeVar

T = TypeVar("T")

def timed(fn: Callable[..., T]) -> Callable[..., T]:
    @functools.wraps(fn)        # preserves __name__, __doc__
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return fn(*args, **kwargs)
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            print(f"{fn.__qualname__}: {elapsed:.2f}ms")
    return wrapper

@timed
def slow() -> int:
    time.sleep(0.1)
    return 42

# Closures capture variables by reference — be careful in loops
```

**Generators + yield from + send()**

```python
def echo():
    while True:
        received = yield                  # pause, await .send()
        if received is None: return
        yield received.upper()

gen = echo()
next(gen)                                  # prime: advance to first yield
print(gen.send("hello"))                   # "HELLO"

# yield from — delegate to sub-generator (3.3+)
def flatten(nested):
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)       # transparent delegation
        else:
            yield item
```

**Partial application + composition**

```python
from functools import partial, reduce
from typing import Callable, TypeVar

A, B, C = TypeVar("A"), TypeVar("B"), TypeVar("C")

def compose(*fs: Callable) -> Callable:
    """Right-to-left function composition: compose(f, g)(x) == f(g(x))"""
    return lambda x: reduce(lambda acc, f: f(acc), reversed(fs), x)

add_bang = lambda s: s + "!"
shout = compose(add_bang, str.upper)
shout("hello")  # "HELLO!"

# partial — bind args, defer the rest
def power(base, exp): return base ** exp
square = partial(power, exp=2)
cube   = partial(power, exp=3)
```

## Error Handling

**Try / except / else / finally — the full shape**

```python
# The complete form: try / except / else / finally
try:
    result = do_risky()
except SpecificError as e:
    handle(e)               # bind the exception to e
except (OtherError, AnotherError):
    fallback()              # tuple for multiple types
except Exception:
    log.exception("unexpected")  # never bare except
    raise                   # re-raise
else:
    # runs ONLY if no exception was raised — keeps try block small
    persist(result)
finally:
    # ALWAYS runs — cleanup, even on return/break/continue
    cleanup()
```

**raise from — exception chaining**

```python
class ValidationError(Exception):
    pass

def parse(raw: str) -> int:
    try:
        return int(raw)
    except ValueError as e:
        # "from e" chains: traceback shows BOTH the ValueError and the wrap
        raise ValidationError(f"bad input: {raw!r}") from e
        # "from None" suppresses the chain (use sparingly — loses debug info)

# Custom exception hierarchy
class AppError(Exception): pass
class DatabaseError(AppError): pass
class NotFound(DatabaseError): pass
class Conflict(DatabaseError): pass
```

**Context managers — guaranteed cleanup**

```python
from contextlib import contextmanager, suppress, ExitStack
import os

# Method 1: class-based
class Timer:
    def __enter__(self): return self
    def __exit__(self, exc_type, exc, tb): return False  # don't swallow

# Method 2: generator-based (preferred for simple cases)
@contextmanager
def cd(path):
    old = os.getcwd()
    os.chdir(path)
    try:
        yield path
    finally:
        os.chdir(old)

# suppress — silently ignore specific exceptions (replaces try/except/pass)
with suppress(FileNotFoundError):
    os.remove("maybe_missing.tmp")

# ExitStack — dynamic number of context managers
with ExitStack() as stack:
    files = [stack.enter_context(open(p)) for p in paths]
```

**Result pattern via type hints (no need for libraries)**

```python
from typing import Union, TypeVar, Generic, Literal
from dataclasses import dataclass

T = TypeVar("T")
E = TypeVar("E", bound=Exception)

@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T
    tag: Literal["ok"] = "ok"

@dataclass(frozen=True)
class Err(Generic[E]):
    error: E
    tag: Literal["err"] = "err"

Result = Union[Ok[T], Err[E]]

def divide(a: int, b: int) -> Result[int, ZeroDivisionError]:
    try:
        return Ok(a // b)
    except ZeroDivisionError as e:
        return Err(e)

match divide(10, 0):
    case Ok(value=v):   print(v)
    case Err(error=e):  print(f"failed: {e}")
```

## Concurrency Model

**asyncio — the default for I/O-bound concurrency**

```python
import asyncio, httpx

async def fetch(client, url):
    r = await client.get(url, timeout=10)
    r.raise_for_status()
    return r.json()

async def main():
    # Semaphores bound concurrency to avoid hammering the server
    sem = asyncio.Semaphore(10)
    async def bound(u):
        async with sem:
            return await fetch(client, u)

    async with httpx.AsyncClient() as client:
        # gather — run coroutines concurrently, return in order
        results = await asyncio.gather(*(bound(u) for u in urls))
        # For fire-and-forget + cancellation use TaskGroup (3.11+):
    # async with asyncio.TaskGroup() as tg:
    #     tasks = [tg.create_task(bound(u)) for u in urls]

asyncio.run(main())  # entry point: creates event loop, runs, closes
```

**Threading vs multiprocessing — when to pick which**

```python
import threading, multiprocessing as mp
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

# THREADING — I/O-bound (network, disk). GIL blocks CPU parallelism.
with ThreadPoolExecutor(max_workers=20) as ex:
    results = list(ex.map(fetch_url, urls))

# MULTIPROCESSING — CPU-bound. Each process has its own GIL + memory.
# Picks start method automatically; use 'spawn' for cross-platform safety.
mp.set_start_method("spawn", force=True)
with ProcessPoolExecutor(max_workers=mp.cpu_count()) as ex:
    results = list(ex.map(cpu_heavy, items))

# Rule of thumb:
#   network/disk → threads (asyncio if you can)
#   CPU          → processes
#   big shared state → threads + careful locking, OR shared_memory
```

**Queues + locks — producer/consumer with backpressure**

```python
import queue, threading, time

q = queue.Queue(maxsize=100)   # bounded = backpressure
stop = threading.Event()

def producer():
    for item in source():
        q.put(item, timeout=5)  # blocks when full
        if stop.is_set(): return
    q.put(None)                  # sentinel per consumer

def consumer():
    while True:
        item = q.get()
        if item is None:
            q.task_done()
            return
        try:
            process(item)
        finally:
            q.task_done()        # ALWAYS call this for join() to work

threads = [threading.Thread(target=consumer) for _ in range(4)]
for t in threads: t.start()
producer()
q.join()                         # wait until all items processed
for t in threads: t.join()
```

**asyncio primitives — Lock, Event, Semaphore, Queue**

```python
import asyncio

async def worker(lock, shared):
    async with lock:              # async equivalent of threading.Lock
        shared["count"] += 1
        await asyncio.sleep(0.01)

async def main():
    lock = asyncio.Lock()
    event = asyncio.Event()
    sem = asyncio.Semaphore(5)
    q = asyncio.Queue(maxsize=10)

    # All async primitives MUST be created inside a running loop
    # (in 3.10+ they can be created at module level but bind lazily)
    await asyncio.gather(*(worker(lock, shared) for _ in range(100)))

asyncio.run(main())
```

## Testing Patterns

**pytest — fixtures, parametrize, marks**

```python
import pytest

# Fixture — setup/teardown via yield, scoped per function/class/module/session
@pytest.fixture
def db():
    conn = connect("test.db")
    yield conn               # test runs here
    conn.close()             # teardown

# Parametrize — one test definition, many cases
@pytest.mark.parametrize("a,b,expected", [
    (1, 2, 3),
    (10, 5, 15),
    (-1, 1, 0),
])
def test_add(a, b, expected):
    assert add(a, b) == expected

# Marks — filter at runtime: pytest -m "not slow"
@pytest.mark.slow
def test_integration(db):
    ...

# Use pytest.raises for expected exceptions
def test_bad_input():
    with pytest.raises(ValueError, match="bad email"):
        parse("not-an-email")
```

**Hypothesis — property-based testing**

```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers(min_value=0), max_size=100))
def test_sort_is_idempotent(xs):
    once = sorted(xs)
    twice = sorted(once)
    assert once == twice

@given(st.text())
def test_roundtrip_json(s):
    # Hypothesis will find edge cases you didn't think of
    assert json.loads(json.dumps(s)) == s

# Run: pytest --hypothesis-show-statistics to see examples generated
```

**unittest.mock — patching, mocks, fixtures**

```python
from unittest.mock import patch, MagicMock, call

# patch — replace an attribute for the duration of a test
@patch("myapp.requests.get")
def test_fetch(mock_get):
    mock_get.return_value.json.return_value = {"ok": True}
    assert fetch("http://x").get("ok") is True
    mock_get.assert_called_once_with("http://x", timeout=10)

# MagicMock — pre-configured mock with all methods
m = MagicMock()
m.method(1, 2, key="v")
m.method.assert_called_once_with(1, 2, key="v")
assert m.method.call_count == 1

# Patch at the use site, not the definition site:
#   BAD:  @patch("requests.get")  # patches the source
#   GOOD: @patch("myapp.get")     # patches the import in myapp
```

**Coverage + pytest config in pyproject.toml**

```python
# pyproject.toml
[tool.pytest.ini_options]
addopts = "-ra --strict-markers --cov=src --cov-report=term-missing"
testpaths = ["tests"]
markers = [
    "slow: marks tests as slow (deselect with -m 'not slow')",
    "integration: requires external services",
]

[tool.coverage.run]
source = ["src"]
branch = true               # branch coverage — catches if/else holes

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "raise NotImplementedError",
]
```

## Performance Tuning

- Cprofile is the stdlib profiler; py-spy (Rust) samples at <1% overhead and works in production.
- pyperformance benchmark suite is the standard for comparing Python implementations.
- Slots ('__slots__') cut instance memory by ~50% and speed attribute access ~30%.
- Local variables are ~30% faster than globals (LOAD_FAST vs LOAD_GLOBAL bytecode).
- List comprehensions are ~30-50% faster than equivalent for+append loops.
- dict.setdefault avoids double lookup vs 'if k not in d: d[k] = v'.
- str.join(parts) is O(n) once; 's += part' in a loop is O(n²) due to immutability.
- functools.lru_cache(maxsize=128) gives free memoization — measure before raising maxsize.
- NumPy ops run in C — 'arr.sum()' is 100x faster than 'sum(arr)' for big arrays.
- GC is generational refcounting; 'gc.disable()' + manual tuning can help latency-critical paths.
- PyPy is ~4x faster than CPython for pure-Python loops; not all C extensions work.
- Cython / mypyc compile typed Python to C — 2-100x speedups for hot loops.
- Memory: 'sys.getsizeof(x)' gives shallow size; pympler.asizeof gives deep size.
- PyO3 lets you write Rust extensions exposed to Python — preferred for sub-ms hot paths.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [uv](https://docs.astral.sh/uv/) | Astral's Rust-based package manager — 10-100x faster than pip/pip-tools. | package |
| [ruff](https://docs.astral.sh/ruff/) | Rust-based linter + formatter — replaces flake8/isort/black/pyupgrade in one tool. | lint |
| [mypy](https://mypy.readthedocs.io/) | Static type checker; the original. Use --strict for new code. | lint |
| [pyright](https://github.com/microsoft/pyright) | Microsoft's type checker; faster than mypy, used by Pylance. | lint |
| [pytest](https://docs.pytest.org/) | Test runner with fixtures, parametrize, plugins. The de facto standard. | test |
| [hypothesis](https://hypothesis.readthedocs.io/) | Property-based testing — generates edge cases automatically. | test |
| [coverage.py](https://coverage.readthedocs.io/) | Code coverage measurement; integrates with pytest via pytest-cov. | test |
| [py-spy](https://github.com/benfred/py-spy) | Sampling profiler — works on production processes without restart. | debug |
| [pdb / ipdb / pudb](https://docs.python.org/3/library/pdb.html) | Interactive debuggers. pdb is stdlib; ipdb adds IPython; pudb is TUI. | debug |
| [httpx](https://www.python-httpx.org/) | Modern HTTP client — sync AND async, HTTP/2 support. | build |
| [pydantic](https://docs.pydantic.dev/) | Runtime data validation via type hints. Used by FastAPI. | build |
| [FastAPI](https://fastapi.tiangolo.com/) | Async web framework with automatic OpenAPI docs. | build |
| [uvicorn / gunicorn](https://www.uvicorn.org/) | ASGI/WSGI servers. uvicorn for async, gunicorn+uvicorn workers for prod. | deploy |
| [Django](https://docs.djangoproject.com/) | Batteries-included web framework — ORM, admin, auth, sessions. | build |
| [Flask](https://flask.palletsprojects.com/) | Micro web framework — minimal core, extensible. | build |
| [SQLAlchemy](https://docs.sqlalchemy.org/) | SQL toolkit + ORM. 2.0+ has a typed session API. | build |
| [Celery](https://docs.celeryq.dev/) | Distributed task queue — async jobs, scheduled tasks. | build |
| [Poetry](https://python-poetry.org/) | Dependency management + packaging — older than uv, still common. | package |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 1991 | First public release — classes, exceptions, modules. |
| 2.0 | 2000 | List comprehensions, garbage collection, Unicode strings. |
| 2.2 | 2001 | Type/class unification (new-style classes), generators (PEP 255). |
| 2.4 | 2004 | Decorators (PEP 318), sets, generator expressions. |
| 2.5 | 2006 | 'with' statement (PEP 343), conditional expressions, 'any'/'all'. |
| 2.7 | 2010 | Last 2.x — dictionary comprehensions, set literals. EOL Jan 2020. |
| 3.0 | 2008 | Breaking release: 'print' function, unicode-bytes split. Slow adoption. |
| 3.5 | 2015 | Type hints (PEP 484), async/await (PEP 492), matrix '@' operator. |
| 3.6 | 2016 | f-strings (PEP 498), variable annotations, dict insertion-order in CPython. |
| 3.7 | 2018 | dict insertion-order guaranteed, dataclasses (PEP 557), 'breakpoint()'. |
| 3.8 | 2019 | Walrus operator ':=' (PEP 572), positional-only params (PEP 570), f-string debugging. |
| 3.9 | 2020 | Dict merge '\|' operator, 'str.removeprefix/removesuffix', type hints on standard collections. |
| 3.10 | 2021 | Structural pattern matching 'match/case' (PEP 634), union 'X \| Y', better error messages. |
| 3.11 | 2022 | 10-60% faster (specialization), exception groups (PEP 654), TaskGroup, 'tomllib'. |
| 3.12 | 2023 | PEP 695 type parameter syntax ('def f[T](x: T)'), f-string improvements, per-interpreter GIL groundwork. |
| 3.13 | 2024 | Experimental free-threaded build (no GIL, PEP 703), JIT landing, '--disable-gil' flag. |
| 3.14 | 2025 | Free-threaded build officially supported (PEP 779), deferred annotations (PEP 649), template strings (t-strings), opt-in tail-calling interpreter (Clang 19+, x86-64/AArch64). |
| 3.15 | 2026 | Lazy imports (PEP 810), frozendict + sentinel builtins (PEP 814/661), UTF-8 default encoding (PEP 686), unpacking in comprehensions (PEP 798), Tachyon profiler, stable abi3t ABI, tail-calling interpreter on Windows x64. |

## Interview Hot Questions

1. **What's the difference between 'is' and '=='?** *(easy)*

   'is' checks identity (same object in memory), '==' checks equality (calls __eq__). Use 'is' only for None, True, False, and sentinels — small int caching makes 'x is 5' unreliable across interpreters.

2. **Explain the GIL — what it is and when it matters.** *(medium)*

   The Global Interpreter Lock is a mutex in CPython that allows only one thread to execute Python bytecode at a time. It makes CPython's refcounting thread-safe without per-object locks. I/O releases it (so threads work for I/O), but CPU-bound threads serialize. Bypass via multiprocessing, C extensions that release the GIL (NumPy), or the experimental free-threaded build (3.13+).

3. **Why are mutable default arguments dangerous?** *(easy)*

   Default values are evaluated ONCE at function definition time, not per call. So 'def f(x=[])' shares the same list across all calls that don't pass x. Fix: use 'x=None' and create the list inside the body.

4. **What's the difference between a generator and a list comprehension?** *(easy)*

   A list comprehension '[x for x in xs]' builds the full list in memory eagerly. A generator expression '(x for x in xs)' yields one item at a time, lazily — O(1) memory. Use generators for pipelines, large sequences, or when you only iterate once.

5. **How does '@dataclass' differ from a regular class?** *(medium)*

   @dataclass auto-generates __init__, __repr__, __eq__ (and __hash__ if frozen=True) from type-annotated fields. With frozen=True it's immutable; with slots=True it skips __dict__ for memory efficiency. It's a code generator, not a runtime change — equivalent hand-written code performs identically.

6. **Explain decorators.** *(medium)*

   A decorator is a callable that takes a function/class and returns a replacement. '@dec' above 'def f' is sugar for 'f = dec(f)'. Use functools.wraps to preserve metadata. Class decorators work the same way. Common uses: logging, caching (lru_cache), registration, access control.

7. **When would you use asyncio vs threading vs multiprocessing?** *(medium)*

   asyncio: I/O-bound with many concurrent ops (10k+ connections) — single-threaded, cooperative. threading: I/O-bound with legacy/blocking libs, or few threads. multiprocessing: CPU-bound work — separate GILs, real parallelism. Rule: I/O → async/threads, CPU → processes.

8. **What does '__init__' do vs '__new__'?** *(medium)*

   '__new__' creates the instance (it's a staticmethod that returns an object); '__init__' initializes it. You rarely override '__new__' — only for immutable types (str, tuple, int), singletons, or metaclass tricks. For normal classes, just use '__init__'.

9. **How does Python's import system work?** *(hard)*

   Imports are cached in 'sys.modules' — the second import of 'x' returns the cached module object without re-executing. 'import a.b.c' imports a, then a.b, then a.b.c, binding each as an attribute. 'from x import y' binds 'y' in the current namespace. Circular imports work only if the cycle is broken by deferring one side to function-level imports.

10. **What's a metaclass and when would you use one?** *(hard)*

   A metaclass is a class whose instances are classes — it customizes class creation. 'type' is the default metaclass. Use cases: registering classes, enforcing class-level invariants, auto-generating methods (Django ORM, Pydantic). Most code should use class decorators or '__init_subclass__' instead — they're simpler.

## When to Choose This

- **vs Go:** use this — Quick scripting, data/ML ecosystem, web backends with rich types, scientific computing.; use that — High-throughput microservices, network daemons, ops tooling, single-binary deployment.
- **vs Rust:** use this — Prototyping, glue code, ML/data science, when iteration speed beats runtime speed.; use that — Systems software, embedded, latency-critical hot paths, WebAssembly, memory-safety requirements.
- **vs Node.js:** use this — CPU-light data processing, ML, scientific computing, anything that benefits from NumPy/Pandas.; use that — Realtime web apps, SSR, isomorphic code, anything that benefits from npm's ecosystem and JS's ubiquity.
- **vs Julia:** use this — General-purpose work, web backends, scripting, when you need a mature ecosystem.; use that — Numerical/scientific HPC where Python's two-language problem (Python calling C) hurts; JIT-compiled math.
- **vs Java:** use this — Scripting, ML, startups where iteration speed matters, anything needing NumPy/Pandas/PyTorch.; use that — Large enterprise systems, Android (historically), teams wanting strong static typing + tooling maturity.

