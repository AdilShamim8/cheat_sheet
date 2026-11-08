# Julia

**Category:** Languages · **Tier:** Tier 3 · Specialized · **Tags:** dynamic, compiled, scientific, jit, numerical, multiple-dispatch, julia · **First released:** 2012 · **Author:** Jeff Bezanson, Stefan Karpinski, Viral B. Shah, Alan Edelman · **Last updated:** 2026-11

> Lisp-flavored multiple dispatch over LLVM — Python's ergonomics with Fortran's speed for numerical work.

---

## TL;DR

- Julia is a dynamically-typed, JIT-compiled language whose design rests on three pillars: multiple dispatch as the core abstraction, LLVM-based specialization of every method call to its argument types, and first-class types/metaprogramming borrowed from Lisp.
- It owns scientific computing niches where you'd otherwise mix Python (prototyping) + Fortran/C (performance) — Pumas (pharmacology), Celeste.jl (astronomy), SciML (differential equations), and QuantEcon's economics toolkits are written in pure Julia and run at C speed.
- Reach for Julia when your bottleneck is the inner numerical loop, when you need to differentiate through simulations (Zygote.jl / Enzyme.jl), or when you'd otherwise reach for MATLAB but want an open, general-purpose language.
- Avoid Julia for production web services (ecosystem is thin), for embedding in constrained environments (TTFP — time-to-first-plot — is real even after 1.10's precompilation work), or when your team already has a mature Python+NumPy+Cython stack.

## Core Mental Model

**Specialize every call on the runtime types.** When you write `f(x, y)` in Julia, the compiler sees the concrete types of `x` and `y` at runtime, generates a version of `f` specialized to those types (specialization), compiles it via LLVM, and caches the result. This is why `f(x::Int64, y::Int64)` and `f(x::Float64, y::Float64)` are two different native functions — multiple dispatch picks one based on all arguments, not just the receiver. The cost is TTFP: the first call pays for compilation; subsequent calls hit native code. The benefit: an inner loop over Float64 arrays runs at the same speed as hand-written C, with no type annotations required.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| function f(x::T, y::T) where T<:Real | Parametric method — T is inferred from the call site, code is specialized per concrete T. | Generic numerics, abstract algorithms — the bread and butter. |
| f(x, y) = x + y | One-line function definition; assignment form. | Short helpers, mathematical identities. |
| struct Point{T} x::T; y::T end | Immutable, stack-allocated when T is concrete; fields are type-stable. | Value types — points, complexes, small records. |
| mutable struct Buffer ptr::Ptr{Cvoid} end | Heap-allocated mutable type; can be mutated in place. | Stateful objects, refs, wrappers around C resources. |
| x::Int = 0 | Type assertion on assignment — asserts at runtime, helps compiler specialize. | Stabilizing hot loops; flagging ambiguous interfaces. |
| for x in xs; ...; end | Iteration via the Iterators interface — works on arrays, ranges, generators, channels. | All looping; `eachindex(xs)` is the no-allocations index form. |
| @inbounds @fastmath for i in eachindex(xs) | Loop annotations — `@inbounds` skips bounds checks, `@fastmath` reassociates FP ops. | Hot numerical kernels after correctness is verified. |
| let x = compute(); ... end | Lexical scope with fresh bindings — closes over outer locals cleanly. | Closures, especially inside loops — avoids the Python late-binding trap. |
| @spawnat :any work() | Spawn a task on a worker thread; `fetch(t)` blocks for the result. | Parallel CPU work — Distributed stdlib + Threads (1.3+). |
| macro sym(x) ... end | Macro — receives AST, returns AST; hygiene via `esc`. | DSLs, code generation, performance annotations (`@time`, `@btime`). |
| try; ...; catch e; ...; finally; ...; end | Exception handling — `e` is the thrown value, `rethrow()` propagates. | Boundary code; inner numerical loops should not throw. |
| module M ... end | Module = namespace + import/export boundary; `using M` brings exports into scope. | Every file is part of a module; packages are modules with a Project.toml. |

## Idiomatic Patterns

**Multiple dispatch — one function, many specializations**

```julia
# Same name, dispatched on ALL arguments, not just the receiver.
abstract type Shape end
struct Circle    <: Shape; r::Float64; end
struct Rectangle <: Shape; w::Float64; h::Float64; end

# Specialization per type pair — compiled to native code per call site.
area(s::Circle)    = π * s.r^2
area(s::Rectangle) = s.w * s.h

# A new method extends the existing function without touching the struct.
combine(a::Circle, b::Circle) = Circle(sqrt(area(a) + area(b)))
combine(a::Rectangle, b::Rectangle) = Rectangle(a.w + b.w, a.h)

# Generic code — works on any Shape, dispatches at runtime.
function total_area(shapes::AbstractVector{<:Shape})
    s = 0.0
    for shape in shapes   # eachindex is allocation-free
        s += area(shape)  # dispatch is a single indirect call here
    end
    return s
end
```

**Type-stable hot loop — the #1 performance rule**

```julia
# BAD -- s is Int, then Float64, then promoted; compiler can't specialize.
function bad_sum(xs)
    s = 0           # Int
    for x in xs
        s += x      # becomes Float64 on first Float64 x
    end
    return s
end

# GOOD — type-stable from the start.
function good_sum(xs::AbstractVector{T}) where T<:Number
    s = zero(T)     # zero of the SAME type
    @inbounds for i in eachindex(xs)
        s += xs[i]
    end
    return s
end

# Inspect the inferred return type and LLVM output:
@code_warntype good_sum(rand(10^6))   # any red text = type instability
@code_llvm     good_sum(rand(10^6))   # look for boxes / allocations
```

**Distributed and threaded parallelism**

```julia
using .Threads

# Multithreaded reduce -- @threads parallelizes the loop across nthreads().
function threaded_sum(xs::Vector{Float64})
    partials = zeros(nthreads())
    @threads for i in eachindex(xs)
        partials[threadid()] += xs[i]
    end
    return sum(partials)
end

# Distributed: spawn on any worker, fetch the result.
using Distributed
addprocs(4)
@everywhere function work(n)
    s = 0.0
    for i in 1:n
        s += sin(i)
    end
    return s
end
futures = [@spawnat w work(10^7) for w in workers()]
println(sum(fetch.(futures)))
```

**Metaprogramming — a macro that benchmarks allocation count**

```julia
macro allocs(ex)
    return quote
        local stats = @timed $(esc(ex))
        println("allocs: ", stats.allocs, "  bytes: ", stats.bytes)
        stats.value
    end
end

# Usage:
#   @allocs sum(rand(100))
#   @allocs total_area([Circle(1.0), Rectangle(2.0, 3.0)])

# Hygiene: esc(ex) preserves the caller's variable bindings so the
# macro doesn't accidentally capture its own stats local. This is the
# same hygiene model as Rust's macro_rules or Common Lisp's gensym.
```

## Common Pitfalls

1. **Type instability in hot loops** — *Symptom:* A loop initialized with `s = 0` (Int) that accumulates Float64 values triggers a type change at runtime; the compiler boxes every value and you get ~100x slowdown plus gigabytes of GC pressure. *Fix:* Initialize with `zero(T)` or `zero(eltype(xs))`. Run `@code_warntype f(args)` — any red text is a type instability. Use `@inbounds` + stable types to get C speed.
2. **Global variables are typed `Any`** — *Symptom:* Reading a global `const N = 10` is fast, but a non-const global `N = 10` is treated as `Any` — every read boxes, every dispatch is dynamic. Code that runs great in a function becomes 100x slower at the REPL. *Fix:* Mark globals `const` whenever possible. For tunable parameters in a package, use a `Ref{Int}()` or `Parameters.jl`. Always wrap benchmarks in functions, not the global scope.
3. **TTFP — time to first plot** — *Symptom:* Calling `using Plots; plot(rand(10))` the first time takes 30-90 seconds because every dependency specializes and compiles. Production deployments that cold-start per request are unusable. *Fix:* Use PackageCompiler.jl to create a sysimage with precompiled methods. Julia 1.10+ caches native code per package (`--pkgimages=yes`); 1.11+ extends this. For server workloads, warm a worker and keep it alive.
4. **Column-major array iteration order** — *Symptom:* Iterating a matrix `for i in 1:size(A,1), j in 1:size(A,2)` with `A[i,j]` in the inner loop thrashes cache — Julia's arrays are column-major like Fortran, not row-major like NumPy/C. *Fix:* Loop with the first index innermost: `for j in 1:size(A,2), i in 1:size(A,1)`. Or just `for a in A` which iterates in memory order. `eachcol(A)` / `eachrow(A)` give views.
5. **`Any` return types break caller specialization** — *Symptom:* If a function returns `Any` (e.g., reading from a heterogeneous container), every caller has to box and dynamic-dispatch — even when only one concrete type ever shows up in practice. *Fix:* Use parametric containers `Vector{T}` not `Vector{Any}`. Apply `@generated` or function barriers: `function inner(x::T) where T; ...; end` to recover specialization after a hetero read.
6. **Closures over loop variables (pre-1.6)** — *Symptom:* Pre-1.6, closures capturing a loop variable share one binding — like JavaScript `var`. Calling them after the loop shows the final value of the iteration variable. *Fix:* Upgrade to 1.6+ (LTS) where this is fixed via soft scope rules. For older code, wrap in `let x = x; ...; end` to create a fresh binding per iteration.
7. **Piracy — defining methods on types you don't own** — *Symptom:* Defining `Base.:*(x::MyType, y::Int)` is fine; defining `Base.:*(x::Int, y::Int)` in your package is type piracy and may silently override the real method, breaking unrelated packages. *Fix:* Only extend Base methods for types you own at one end. For new behavior on foreign types, wrap in your own type or define a separate function in your module.

## Production / Interview Quick Reference

- Julia 1.10 LTS (2024) and 1.11 are the supported series; 1.11 brings incremental precompilation of method invalidations, dramatically reducing TTFP. `version`
- JIT: every method is specialized to the concrete types of its arguments and compiled via LLVM; first call pays the cost, subsequent calls are native. `perf`
- Array storage is column-major (Fortran convention); A[i,j] strides the innermost dimension. Iterating row-major is 5-20x slower due to cache misses. `perf`
- Multi-threading stabilized in 1.3 (2019); `@threads` and `@spawn` are production-ready. Multi-threading is cooperative — no preemption within a task. `version`
- TTFP for `using Plots; plot(rand(10))` was ~50s in 1.0, ~10s in 1.10 with pkgimages, ~3s in 1.11 with caching — still worse than Python's ~1s. `perf`
- Multiple dispatch selects the most specific method across ALL arguments — dispatch is O(depth of type tree), not O(n methods). `complexity`
- Garbage collector is non-incremental mark-sweep; in hot loops, preallocate with `Vector{T}(undef, n)` and mutate in place to avoid triggering it. `perf`
- Structs are stack-allocated when their fields are concrete and bits-type; `mutable struct` is always heap-allocated. Use `Base.@kwdef` for keyword constructors. `perf`
- Broadcast (`f.(xs)`) fuses: `sin.(cos.(xs))` makes ONE loop, two arrays. Use it instead of comprehensions in hot code — same speed, no intermediate array. `perf`
- Views (`@view A[:, 1]`) avoid copying; `A[:, 1]` always copies. Hot code should prefer `@views` blocks. `gotcha`
- Units: Unitful.jl gives compile-time dimensional checking — `1u"m" + 1u"s"` is a method error, not a wrong answer. `style`
- The package manager Pkg lives in its own environment per project — `] activate .` from the REPL. Avoid globally-installed packages; one Project.toml per project. `style`
- Naming convention: snake_case for functions and variables, CamelCase for types/modules. Bang `!` suffix means the function mutates its first argument (`push!`, `sort!`). `style`
- Autodiff: Zygote.jl (source-to-source) is the established choice; Enzyme.jl (LLVM-level) is faster for tight numerical loops and is the future. `version`
- Revise.jl reloads changed files into the running REPL without losing state — install it in your startup.jl as `using Revise`. `style`

## Go Deeper

- [Julia Documentation — official manual](https://docs.julialang.org/en/v1/) — Read the 'Performance Tips' and 'Types' chapters — they explain 80% of why Julia code is fast or slow.
- [Julia: The Original Paper (Bezanson et al., 2017)](https://arxiv.org/abs/1411.1607) — The peer-reviewed rationale for multiple dispatch + specialization as a language design choice.
- [Modern Julia Workflows](https://modernjuliaworkflows.org/) — Community-maintained guide to packaging, testing, CI, and performance work in 2024-era Julia.
- [QuantEcon — Julia for Economists](https://julia.quantecon.org/) — Free lecture notes with deep numerics — the best applied tutorial on the type-stability mindset.
- [JuliaHub — package & benchmark registry](https://juliahub.com/ui/Packages) — Searchable package index with dependency graphs and benchmark tracker.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Int64, Int32, Int | Fixed-size signed integers — Int is alias for native pointer size (Int64 on 64-bit OS). | Counters, indexing. Wraparound on overflow (no checked ops unless @checked). |
| Float64, Float32 | IEEE 754 — Float64 is the default for literals (1.0, 2.5e-3). | Math. For exact decimal use DecFP.jl or FixedPointDecimals.jl; for fractions use Rational{Int}. |
| Bool | 8-bit true/false — distinct from Int. if accepts only Bool, NOT truthy/falsy. | Logic. 1 == true is FALSE (different types); 1 === true is also false. |
| Char | Single Unicode code point — 32-bit, encloses in single quotes ('a', 'π'). | Iteration of strings. String is NOT Char[] — it's UTF-8 bytes. |
| String | Immutable UTF-8 byte sequence — NOT Char[]. Substring is O(1) view. | All text. For ASCII use SubString{String} for zero-alloc slicing. |
| Complex{T} | Pair of T (real, imag) — im is the imaginary unit (2 + 3im). | Scientific computing. Promotion rules: Complex{Int} + Complex{Float64} -> Complex{Float64}. |
| Rational{T} | Exact fraction — 1//2 + 1//3 == 5//6. No float rounding. | Money, exact arithmetic, testing float algorithms. Auto-reduces gcd. |
| Symbol | Interned immutable string — :foo. Equality is pointer compare, O(1). | Field names, dict keys, metaprogramming AST nodes. Use over String for known-at-compile-time labels. |
| Nothing / Missing | Nothing = the absence (like null), Missing = NA (statistical). Both distinct from undef. | Nothing for Option<T>-style; Missing for dataframes with skipmissing(). |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Array{T,N} / Vector{T} / Matrix{T} | Dense n-dimensional array — column-major (Fortran order). Vector = Array{T,1}, Matrix = Array{T,2}. | All numerics. Mutable, contiguous memory, BLAS-compatible layout. |
| Tuple{Int, String} | Immutable fixed-length heterogeneous — (1, "a"). Stack-allocated when type-stable. | Multiple returns, NamedTuple for records. NTuple{N,T} for homogeneous. |
| NamedTuple | Tuple with field names — (a=1, b="x"). Field access t.a, fully typed. | Lightweight records, named args. Zero allocation, faster than Dict for known keys. |
| Dict{K,V} | Hash map — Dict("k" => 1). Insertion order NOT preserved (use OrderedDict from DataStructures.jl). | Keyed lookups. O(1) avg, ~30ns per op; small maps are slower than NamedTuple. |
| Set{T} | Hash set — Set([1,2,3]). union, intersect, setdiff operators (∪, ∩, \). | Membership, dedup. O(1) lookup. |
| Pair{A,B} | Two-element a => b — used to build Dicts; also a value type for delayed eval. | Dict construction, key-value passing. |
| Range / UnitRange / StepRangeLen | Lazy arithmetic sequence — 1:10, 0:0.1:1, 1:. O(1) memory; collect() to materialize. | Loop ranges, indexing. 1:10 === 1:10 (cached). Float ranges are exact (StepRangeLen). |
| Tuple vs Array | Tuple: immutable, heterogeneous, stack-allocated, length in type. Array: mutable, homogeneous, heap, length in value. | Tuple for small fixed records (point, return values). Array for numerical data. |
| BitArray | Packed bit array — 1 bit per element, 64x denser than Array{Bool}. | Masks, image binarization, sparse boolean data. Supports indexing like Array{Bool}. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| struct Point{T} x::T; y::T end | Immutable parametric type — stack-allocated when T is concrete. | Value types: points, complexes, configs. Default for new types. |
| mutable struct Buffer ... end | Heap-allocated mutable type — fields can be reassigned. | Stateful objects, refs, mutable caches. |
| abstract type Shape end | Abstract supertype — no fields, just a node in the type tree. | Type hierarchies for dispatch. Subtype with `<:`. |
| primitive type Cmychar 8 end | User-defined bits type — 8/16/32/64 bit, no fields, declared via bitwise ops. | Custom integer types, FFI bit patterns. Rare. |
| struct Point; x::Int end  +  methods | Type + methods defined outside the struct — methods live in modules, not classes. | All methods. Multiple dispatch means methods belong to functions, not types. |
| const MyAlias = Vector{Float64} | Type alias — const required (aliases are not first-class). | Documentation, gradual refactor. The compiler inlines the alias everywhere. |
| @kwdef struct Config; n::Int = 10; end | Macro generating keyword constructor — Config(n=20) or Config(). | Configs with defaults. Macro on Base since 1.1; in Base as of 1.10. |
| Union{Int, Nothing} | Tagged union — like Rust's Option / Swift's Optional. Compiler may unbox. | Optional values without allocation. Small Unions are specialization-friendly. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| +, -, *, / | Standard arithmetic — promote types: Int + Float64 -> Float64. / always float (use div/fld for int). | Math. Vectorized automatically on arrays via broadcast (.+ .* ./). |
| ÷  (div), \  (left division) | ÷ is integer division (truncated toward zero); \ is matrix left-solve A\b. | Integer math (÷); linear systems (\). A\b is faster than inv(A)*b. |
| %  (rem), fld, mod | rem = truncated mod (sign of dividend); mod = floored mod (sign of divisor); fld = floored div. | Indexing, cycling. mod(-1, 7) == 6, rem(-1, 7) == -1. |
| ^  (power), .^ | Power — 2^10 == 1024; 2.0^0.5 == 1.414. .^ for elementwise on arrays. | Math. For matrix power use ^ on Matrix (calls LAPACK). |
| ==, !=, === | == is value equality (with type promotion); === is strict (no promotion, also for floats). | Use == for normal compare; === for identity / NaN-aware (NaN === NaN is false, NaN == NaN is true). |
| <, >, <=, >=, .< | Comparisons — chainable: 1 < x < 10 (parsed as 1 < x && x < 10). | Ranges, conditions. .< elementwise for arrays (returns BitArray). |
| &&, \|\|, ! | Short-circuit boolean — return one operand. && is and, \|\| is or. | Conditions, defaults: x \|\| error("bad x"). if requires Bool, not truthy. |
| &  \|  \$  (bitwise) | Bitwise AND/OR/XOR on integers. Note: \$ is xor (NOT C's ^, which is exponent in Julia). | Bit manipulation. ~ is bitwise NOT. << >> shifts. |
| <<, >>, >>> | Left shift, arithmetic right shift, logical right shift. | Bit manipulation. Unsigned ops on UInt only. |
| .+, .*, .^, .<  (broadcast) | Broadcast — elementwise op on arrays/scalars. . before any binary op. | Numerics. sin.(x) is the canonical apply-to-array. Fuses: sin.(cos.(x)) is one loop. |
| ∈, ∉, ⊆  (\in, \notin, \subseteq) | Set membership / subset — Unicode operators (typed via \in<Tab>). | Set ops, math-notation code. in(x, collection) is the ASCII form. |
| \|>  (pipe) | Pipe — x \|> f == f(x). Reads left-to-right. | Pipelines, esp. with broadcast: x \|> f \|> g. |
| .  (field access), => | p.x field access (also getfield); => Pair construction for Dicts. | Struct field access; Dict literals Dict("k" => 1). |
| @.  (broadcast macro) | Auto-broadcast — @. sin(cos(x)) becomes sin.(cos.(x)). Avoids dotting every op. | Multi-op expressions on arrays. Cleaner than manually dotting. |

## Input / Output

**File read / write — stdlib only**

```julia
# Read whole file as String:
content = read("file.txt", String)

# Read line by line (lazy iterator, never loads whole file):
for line in eachline("file.txt")
    process(line)
end

# Read into a String vector (one element per line):
lines = readlines("file.txt")   # strips \n

# Write:
open("out.txt", "w") do f
    println(f, "line 1")
    println(f, "result: ", compute())
end

# 'do' block ensures close even on exception — like Python's 'with'.

# Binary:
data = read("data.bin")           # Vector{UInt8}
write("copy.bin", data)
```

**JSON / serialization — JSON3 is the standard**

```julia
using JSON3, StructTypes

struct User
    id::Int
    name::String
    tags::Vector{String}
end
StructTypes.StructType(::Type{User}) = StructTypes.Struct()

u = User(1, "ada", ["a", "b"])
json = JSON3.write(u)         # -> "{\"id\":1,\"name\":\"ada\",\"tags\":[\"a\",\"b\"]}"
back = JSON3.read(json, User)

# Without StructTypes, JSON3.read returns a Dict{String,Any} — slow and untyped.
# Always declare StructType for performance.

# For tabular data use Arrow.jl (Apache Arrow) or CSV.jl — orders of magnitude
# faster than JSON, preserves types, used widely in data science.
```

**CSV reading + DataFrame manipulation**

```julia
using CSV, DataFrames

# Streaming CSV reader — handles huge files in chunks, infers column types.
df = CSV.read("data.csv", DataFrame)

# Common ops:
df.age .+ 1                          # broadcast column
filter(:age => >(18), df)            # rows where age > 18
combine(groupby(df, :dept), :salary => mean => :avg_salary)

# Write back:
CSV.write("out.csv", df)

# For very large files: CSV.read with limit + skipto for chunking,
# or use Arrow.jl for the columnar binary format (5-20x faster I/O).
```

**HTTP client + JSON parsing**

```julia
using HTTP, JSON3

function fetch_json(url::String; retries::Int=3)
    for attempt in 1:retries
        try
            r = HTTP.get(url; timeout=10, retries=0)
            r.status == 200 || error("HTTP $(r.status)")
            return JSON3.read(String(r.body))
        catch e
            attempt == retries && rethrow(e)
            sleep(2^attempt)
        end
    end
end

data = fetch_json("https://api.example.com/v1/users")
for item in data
    println(item["name"])
end

# HTTP.jl is sync; for async use HTTP.async or ASyncStreams.jl.
# Julia 1.7+ has @sync / @async for cooperative multitasking.
```

## Loops & Iteration

**for / while / eachindex / enumerate**

```julia
# Numeric for — inclusive on both ends:
for i in 1:10
    print(i, " ")
end

# Iterate any iterable:
for x in xs
    process(x)
end

# eachindex — most efficient index form (works on arrays, dicts, strings):
for i in eachindex(xs)
    xs[i] *= 2
end

# enumerate / zip — like Python:
for (i, x) in enumerate(xs)
    println(i, ": ", x)
end
for (a, b) in zip(xs, ys)
    println(a, " + ", b, " = ", a+b)
end

# while:
while cond
    do_work()
end
```

**Comprehensions — generator expressions**

```julia
# List comprehension:
squares = [x^2 for x in 1:10]
evens   = [x for x in 1:10 if x % 2 == 0]

# Multi-dimensional:
[i + j for i in 1:3, j in 1:4]   # 3x4 Matrix

# Dict comprehension:
d = Dict(string(k) => k^2 for k in 1:5)

# Generator expression — lazy, O(1) memory:
total = sum(x^2 for x in 1:1_000_000)   # no intermediate array built

# Generator works anywhere an iterable does — pipe to collect() to materialize.
```

**Broadcast — the Julian way to vectorize**

```julia
# . before any op broadcasts elementwise:
sin.(xs)              # apply sin to each element
xs .+ 1               # add 1 to each
xs .^ 2               # square each

# Fusion — sin.(cos.(xs)) makes ONE loop, no intermediate arrays.
# This is Julia's answer to NumPy vectorization, with automatic fusion.

# Broadcasting scalar over matrix:
A = rand(3, 4)
A .+ [1, 2, 3]        # adds [1,2,3] to each column (broadcast over rows)
A .+ [1 2 3 4]'       # adds [1,2,3,4] to each row

# @. macro — auto-dot every operation:
@. sin(cos(A) + 1)    # == sin.(cos.(A) .+ 1)

# Custom function: f.(xs) broadcasts; just append the dot.
```

**Recursion + tail calls (no guaranteed TCO)**

```julia
# Julia does NOT guarantee tail-call optimization.
# This will stack-overflow at large n:
function bad_factorial(n, acc=1)
    n <= 1 ? acc : bad_factorial(n-1, n*acc)
end

# Iterative form preferred:
function factorial_iter(n)
    acc = 1
    for i in 1:n
        acc *= i
    end
    return acc
end

# For deep recursion, use Channels (coroutines) or rewrite iteratively.
# Recursion is fine for tree-shaped problems where depth is bounded.
```

## Functions & Callables

**Multiple dispatch — methods belong to functions, not types**

```julia
# Define a function with multiple methods, dispatched on ALL args:
function area(shape::Circle)
    return π * shape.r^2
end

function area(shape::Rectangle)
    return shape.w * shape.h
end

function area(shape::Triangle)
    s = (shape.a + shape.b + shape.c) / 2
    return sqrt(s * (s-shape.a) * (s-shape.b) * (s-shape.c))
end

# One generic function 'area', three methods. The most specific wins.
# To add a method for a NEW type, just define another method — no class edit.

# Inspect methods:
methods(area)         # 3 methods for generic function "area"
which(area, (Circle,))   # which method gets called for Circle
```

**Parametric methods + where clauses**

```julia
# 'where T<:Real' declares a type parameter constrained to Real subtypes:
function norm(v::AbstractVector{T}) where T<:Real
    s = zero(T)            # type-stable accumulator (Int for Int, Float64 for Float64)
    @inbounds for i in eachindex(v)
        s += v[i]^2
    end
    return sqrt(float(s))  # return Float64 even if T was Int
end

# Multiple constraints:
function dot(v::AbstractVector{T}, w::AbstractVector{T}) where T<:Number
    # Both args must be the SAME T (e.g. both Float64).
    s = zero(T)
    @inbounds for i in eachindex(v)
        s += v[i] * w[i]
    end
    return s
end

# Specialization: each (T) gets its own compiled native code.
```

**Closures + do-block syntax**

```julia
# Closures capture variables by reference:
function make_counter(start=0)
    count = start
    return () -> (count += 1)
end

c = make_counter(10)
println(c(), c(), c())   # 11 12 13

# do-block: anonymous function as last arg, syntactic sugar.
map(xs) do x
    if x > 0
        2x
    else
        0
    end
end

# Equivalent to: map(x -> x > 0 ? 2x : 0, xs)
# Use do for multi-line callbacks (open, map, sortby, etc.).
```

**Keyword args + defaults + varargs**

```julia
# Positional + keyword + defaults:
function train(model::Model, data; epochs::Int=10, lr::Float64=0.01, verbose=false)
    for epoch in 1:epochs
        loss = step!(model, data, lr)
        verbose && println("epoch $epoch  loss=$loss")
    end
    return model
end

# Call with keywords (any order, by name):
train(m, data; epochs=100, lr=0.001, verbose=true)

# Varargs:
function max_of(first::T, rest::T...) where T
    m = first
    for x in rest
        m = max(m, x)
    end
    return m
end

# Keyword-only args (after ;):
function f(a, b; kw_only=1) ... end   # kw_only is keyword-only
```

## Error Handling

**try / catch / finally — exception model**

```julia
function load_config(path::String)
    try
        text = read(path, String)
        return parse_config(text)
    catch e
        if e isa SystemError
            @warn "file not found" path
            return default_config()
        elseif e isa ParseError
            @warn "parse failed" path exception=e
            return default_config()
        else
            rethrow(e)   # unknown error — propagate
        end
    finally
        # Always runs — cleanup resources.
        # finally is rare in Julia because 'do' blocks handle close() already.
    end
end

# Use exceptions for truly exceptional cases. For expected failure
# (parsing, lookups) prefer returning Nothing / Missing / Union{T,Nothing}.
```

**Result-like pattern via Union{T, Nothing}**

```julia
# Idiomatic: return Union{T, Nothing} for fallible ops.
function find_first(pred, xs)
    for x in xs
        pred(x) && return x
    end
    return nothing
end

result = find_first(>(5), [1, 3, 7, 9])
if result === nothing
    println("not found")
else
    println("found: ", result)
end

# Or use the 'something' function with a default:
val = something(find_first(>(5), xs), 0)   # 0 if not found

# For richer error info, define a small Result-like type or use
# Exceptions.jl / ResultTypes.jl — but plain Union is the standard.
```

**@assert vs error() vs throw()**

```julia
# @assert — debug-only, can be disabled (-DNDEBUG equivalent).
# Use for invariants you believe MUST hold:
@assert length(xs) > 0 "xs must not be empty"

# error() — throws ErrorException with a string. Always crashes.
error("unexpected state: ", x)

# throw() — throws any value (Exception subtype).
struct MyError <: Exception
    msg::String
    code::Int
end
throw(MyError("bad input", 42))

# DomainError, ArgumentError, BoundsError, KeyError are the standard
# built-in exception types — use them when they fit.

# Catch by type:
try
    risky()
catch e::DomainError
    handle_domain(e)
catch e
    rethrow(e)
end
```

**Cleanup via do-block + finalizer**

```julia
# Most resources use the do-block pattern (file, socket, lock):
open("data.txt") do f
    for line in eachline(f)
        process(line)
    end
end   # close(f) is guaranteed here, even on exception.

# For resources without a do-block API, use try/finally:
lock = ReentrantLock()
try
    lock!(lock)
    do_critical()
finally
    unlock!(lock)
end

# For heap resources that need cleanup at GC time (rare, C bindings):
mutable struct Buffer
    ptr::Ptr{Cvoid}
    function Buffer(size)
        b = new(Libc.malloc(size))
        finalizer(b) do buf
            Libc.free(buf.ptr)
        end
        return b
    end
end

# finalizers run at GC time, NOT deterministic. Prefer explicit close().
```

## Concurrency Model

**Multi-threading — @threads / @spawn**

```julia
using .Threads

# Set JULIA_NUM_THREADS=4 before starting Julia, or use Threads.nthreads().

# @threads — parallelize a for-loop across nthreads():
function threaded_sum(xs::Vector{Float64})
    partials = zeros(nthreads())
    @threads for i in eachindex(xs)
        partials[threadid()] += xs[i]
    end
    return sum(partials)
end

# @spawn — schedule a task on any thread (more flexible):
futures = [@spawn work(x) for x in items]
results = fetch.(futures)

# Pitfalls:
#   * False sharing: threadid() partials on adjacent cache lines = contention.
#     Use Threads.threadpool() or padding.
#   * Non-thread-safe code: most I/O is safe, but check package docs.
```

**Distributed — workers across processes/machines**

```julia
using Distributed

addprocs(4)   # 4 worker processes (separate memory, like MPI ranks)

# Define a function on all workers:
@everywhere function work(n)
    s = 0.0
    for i in 1:n
        s += sin(i)
    end
    return s
end

# Spawn work on specific workers:
futures = [@spawnat w work(10^7) for w in workers()]
println(sum(fetch.(futures)))

# pmap — parallel map for coarse-grained work:
results = pmap(expensive_fn, items)

# Co-array alternative: use SharedArrays.jl for in-process shared memory
# (single machine, multi-core), or DistributedArrays.jl for cluster.
```

**Async tasks — @async / @sync / Channels**

```julia
# @async schedules a task on the current thread (cooperative).
# @sync waits for all @async tasks in the block to finish.

@sync begin
    for url in urls
        @async fetch_and_save(url)
    end
end

# Channels — CSP-style communication (like Go channels):
const results = Channel{Int}(32)   # buffered channel, capacity 32

@async begin
    for i in 1:100
        put!(results, compute(i))
    end
    close(results)
end

for r in results    # iterates until closed
    println(r)
end
```

**GPU computing — CUDA.jl / AMDGPU.jl / oneAPI.jl**

```julia
using CUDA

# Move array to GPU:
xs_gpu = CUDA.rand(10^6)            # CuArray{Float32}
ys_gpu = CUDA.rand(10^6)

# Element-wise ops run on GPU:
zs_gpu = xs_gpu .+ ys_gpu .* 2.0f0

# Reduce on GPU:
s = sum(zs_gpu)                     # GPU kernel, returns Float32

# Custom kernel via @cuda:
function axpy_kernel!(z, x, y, a)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    if i <= length(z)
        @inbounds z[i] = a * x[i] + y[i]
    end
    return
end

@cuda threads=256 blocks=cld(n, 256) axpy_kernel!(zs_gpu, xs_gpu, ys_gpu, 2f0)

# CPU<->GPU transfers are the bottleneck — keep data on GPU between ops.
```

## Testing Patterns

**Test.jl — stdlib testing**

```julia
using Test

@test 1 + 1 == 2
@test sqrt(2) ≈ 1.414 atol=1e-3      # ≈ is approximate equality
@test_throws DomainError sqrt(-1)
@test_logs (:warn, "deprecated") deprecated_fn()

# Test sets group related tests:
@testset "arithmetic" begin
    @test 1 + 1 == 2
    @test 2 * 3 == 6
    @testset "division" begin
        @test 6 / 2 == 3
        @test_throws DivideByZero 1 ÷ 0
    end
end

# Run: julia --project=. -e 'using Pkg; Pkg.test()'
# Or just: include("test/runtests.jl")
```

**Property-based testing with Supposition.jl**

```julia
using Supposition

# Property-based (like Hypothesis for Python):
@check function "sort is idempotent"(xs::Vector{Int})
    once = sort(xs)
    twice = sort(once)
    once == twice
end

@check function "addition commutes"(a::Int, b::Int)
    a + b == b + a
end

# Supposition shrinks counterexamples to find minimal failing inputs.
# Alternative: Supposition.jl is newer; older packages: QuickCheck.jl.

# Run: julia test/runtests.jl, or via Pkg.test()
```

**Mocking with Mocking.jl**

```julia
using Mocking

# Mocking.jl patches function calls for the duration of a test.
# Original:
function fetch_user(id)
    data = HTTP.get("https://api.example.com/users/$id")
    return JSON3.read(String(data.body), User)
end

# Test:
@testset "fetch_user" begin
    patch = @patch HTTP.get => (url) -> HTTP.Response(200, "{\"id\":1,\"name\":\"a\"}")
    apply(patch) do
        u = fetch_user(1)
        @test u.id == 1
        @test u.name == "a"
    end
end

# Mocking.jl requires code to be 'mockable' (compiled with @mock calls
# or with the applypatch environment active).
```

**Benchmarking + CI conventions**

```julia
using BenchmarkTools

# @btime prints median time + allocations:
@btime sum($xs)              # 1.234 ns (0 allocations)
@btime sum($xs .^ 2)         # 4.567 ms (2 allocations)

# @benchmark returns detailed statistics:
bench = @benchmark sum($xs)
println(minimum(bench), " ", median(bench))

# Tips:
#   * Use $ to interpolate test data so the benchmark doesn't measure setup.
#   * Watch allocations: any non-zero count is suspicious in hot loops.
#   * '1 allocation' = your function creates a temporary array.

# CI: GitHub Actions
#   - julia-actions/setup-julia@v2
#   - julia-actions/julia-buildpkg@v1
#   - julia-actions/julia-runtests@v1
#   - julia-actions/julia-docdeploy@v1 for docs
```

## Performance Tuning

- Type stability is THE Julia perf rule: every variable's type must be inferable at compile time. @code_warntype flags red = unstable.
- Globals are typed Any by default — every read boxes. Mark const, or wrap mutable globals in a Ref{T}.
- Initialize accumulators with zero(T) or zero(eltype(xs)) — never 's = 0' (Int) for a Float64 sum.
- Broadcast fuses: sin.(cos.(xs)) is ONE loop, no intermediates. Always prefer . ops over comprehensions in hot code.
- @inbounds skips bounds checks; @fastmath reassociates FP ops. Both ~10-30% speedup; only after correctness verified.
- Column-major: A[i,j] strides inner dim. Loop j outermost, i innermost. Or just 'for a in A' which iterates memory order.
- Views avoid copies: @view A[:, 1] is O(1); A[:, 1] always copies. Use @views block for many slices.
- Structs with concrete fields are stack-allocated; with abstract fields (Any) are heap. Avoid Vector{Any}.
- TTFP was the #1 complaint — PackageCompiler.jl precompiles a sysimage; 1.10+ pkgimages, 1.11+ extends. Down to seconds.
- @code_llvm and @code_native show compiled output — look for boxes, allocs, dynamic dispatch.
- do-block closures over globals are slow; capture locals or pass args explicitly.
- Allocations trigger GC. Preallocate with Vector{T}(undef, n); mutate in place with ! suffix (sort!, push!).
- Threads.nthreads() returns worker count; @threads parallelizes loops. Tasks (@spawn) are lighter — M:N scheduled.
- BenchmarkTools.@btime is the standard; use $ interpolation to skip setup. Don't use @time for micro-benchmarks (first-run compile time skews).

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Pkg](https://docs.julialang.org/en/v1/stdlib/Pkg/) | Built-in package manager — Project.toml + Manifest.toml, per-environment. Activated via ]activate. | package |
| [Revise.jl](https://github.com/timholy/Revise.jl) | Hot-reload changed files into the running REPL — keeps your session state. Put 'using Revise' in startup.jl. | build |
| [JuliaHub](https://juliahub.com/) | Package registry + benchmark tracker + snippet hosting. The 'npm/crates.io for Julia'. | package |
| [PackageCompiler.jl](https://github.com/JuliaLang/PackageCompiler.jl) | Create a sysimage with precompiled packages — cuts TTFP from minutes to seconds. | build |
| [VS Code Julia extension](https://www.julia-vscode.org/) | The standard IDE support — LSP via SymbolServer.jl, plot pane, REPL integration. | build |
| [JET.jl](https://github.com/aviatesk/JET.jl) | Static type checker / linter — catches type instability, undefined globals, method errors before runtime. | lint |
| [JuliaFormatter](https://github.com/domluna/JuliaFormatter.jl) | Code formatter — opinionated, configurable. The 'black' for Julia. | lint |
| [Test.jl](https://docs.julialang.org/en/v1/stdlib/Test/) | Stdlib testing framework — @test, @testset, @test_throws. Bundled, no install needed. | test |
| [BenchmarkTools.jl](https://github.com/JuliaCI/BenchmarkTools.jl) | Micro-benchmarking — @btime, @benchmark. Statistics + allocation tracking. | test |
| [Aqua.jl](https://github.com/JuliaTesting/Aqua.jl) | Auto-quality-checker — catches ambiguity, undefined refs, stale deps. Standard in package CI. | lint |
| [DataFrames.jl](https://dataframes.juliadata.org/) | In-memory tabular data — like pandas. Group-by, join, reshape, plot-friendly. | build |
| [CSV.jl / Arrow.jl](https://github.com/JuliaData/CSV.jl) | Fast I/O for tabular formats. Arrow is columnar binary — 5-20x faster than CSV. | build |
| [Plots.jl / Makie.jl](https://docs.makie.org/) | Plotting — Plots is the simple interface; Makie is the modern GPU-accelerated one. | build |
| [DifferentialEquations.jl (SciML)](https://sciml.ai/) | The SciML ecosystem — best-in-class ODE/SDE/PDE solvers. The killer app for Julia. | build |
| [CUDA.jl / AMDGPU.jl / oneAPI.jl](https://cuda.juliagpu.org/) | GPU computing — write native Julia that compiles to GPU kernels. Mature on NVIDIA, growing elsewhere. | build |
| [Genie.jl](https://genieframework.com/) | Web framework — MVC, ORM, templating. The 'Rails for Julia', smaller ecosystem. | build |
| [Pluto.jl](https://plutojl.org/) | Reactive notebooks — like Jupyter but cells re-run on dependency change. Popular for teaching. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.1 | 2009 | Jeff Bezanson, Stefan Karpinski, Viral Shah, Alan Edelman begin work at MIT. First public release. |
| 0.6 | 2017 | Last 0.x — many breaking changes; the language stabilizes for 1.0. |
| 1.0 | 2018 | Stable release — promise of no breaking changes in 1.x. Cassette.jl, Flux.jl, DifferentialEquations.jl mature. |
| 1.1 | 2018 | Non-recursive stack-overflow handling, BLAS/LAPACK improvements, lazy eye-candy improvements. |
| 1.2 | 2019 | Package extension improvements, @view optimizations, Mmap improvements. |
| 1.3 | 2019 | Multi-threading stable — @threads and @spawn production-ready. The 'parallel Julia' moment. |
| 1.4 | 2020 | OpenLibM bump, USB support, package manager UX improvements. |
| 1.5 | 2020 | BinaryBuilder.jl ecosystem, JLL packages — prebuilt binary deps for everything. |
| 1.6 (LTS) | 2021 | Long-term support release — adopted by enterprise. Downloads of new packages go to ~/.julia. |
| 1.7 | 2021 | Lazy artifacts, @lock macro, package extensions; sorted dict by default in some libs. |
| 1.8 | 2022 | Logging improvements, stack traces show inlined frames, Threads.maxthreadid(). |
| 1.9 | 2023 | Native code caching per-package, reduced TTFP, concurrent GC, @assume_effects. |
| 1.10 (LTS) | 2024 | Pkgimages, extension precompilation, performance improvements. The new LTS. |
| 1.11 | 2024 | Incremental precompilation of method invalidations, further TTFP reduction, @public for export. |
| 1.12 | 2025 | Runtime-dispatch reduction continues; juliac static-compilation path matures for shipping binaries. |
| 1.13 | 2026 | Current stable line — 1.13.3 (Oct 2026); LTS remains 1.10.x. |

## Interview Hot Questions

1. **What is multiple dispatch, and how is it different from single dispatch (OOP)?** *(medium)*

   In single dispatch (Java, Python), the method is chosen based on the runtime type of the receiver (this/self). In multiple dispatch, the method is chosen based on the runtime types of ALL arguments. Julia compiles a separate native function for each combination of argument types. This means you can add a method like area(shape::Circle) without editing the Circle type, and you can dispatch on pairs like intersect(a::Circle, b::Rectangle) without picking a 'receiver'. It generalizes naturally to N args and removes the awkward 'visitor pattern' of OOP.

2. **What does 'type stability' mean and why is it the #1 Julia perf rule?** *(medium)*

   A function is type-stable if the compiler can infer the return type from the argument types — without runtime type checks or boxing. Example: function f(x) returns Int for Int input, Float64 for Float64 input. Type-unstable: 's = 0; for x in xs; s += x; end' where xs is Vector{Float64} — s starts Int, becomes Float64, compiler boxes every value. Fix: 's = zero(eltype(xs))'. Check with @code_warntype — red text = type instability.

3. **Explain TTFP and how to mitigate it.** *(medium)*

   Time-to-first-plot: the first call to a function pays the LLVM compilation cost, often 10-60s for a complex package. Subsequent calls hit cached native code. Mitigations: (1) PackageCompiler.jl creates a sysimage with precompiled methods — cuts to ~1s. (2) Julia 1.10+ pkgimages cache native code per package, shipped in installs. (3) For server workloads, warm a worker at startup and keep it alive. The Julia team is steadily reducing TTFP; 1.11 makes precompilation incremental.

4. **How does Julia's broadcast fuse operations?** *(medium)*

   sin.(cos.(xs)) doesn't build two arrays — Julia lowers it to a single loop that reads xs[i], computes cos, then sin, and writes the result. This is automatic: the dot syntax compiles to broadcast calls, and broadcast fuses nested broadcasts. The @. macro dots every operation in an expression. The result: NumPy-style vectorization (loop in C, no Python overhead) with the ergonomics of writing it once and not allocating intermediates.

5. **Why does Julia use 1-indexing, and what are the consequences?** *(easy)*

   Julia follows the math/fortran convention (matrices are A_ij with i,j starting at 1) for readability in scientific code. Consequences: (1) Range 1:n is inclusive (n elements). (2) eachindex(xs) returns 1:length(xs). (3) C/Python interop is off-by-one — wrap with care. (4) Off-by-one bugs from Python/C ports are real. The choice is controversial but consistent — Julia arrays also support arbitrary lower bounds (OffsetArrays.jl) for 0-indexed interop.

6. **How do I make a type that's allocated on the stack vs heap?** *(medium)*

   An immutable struct with concrete-typed fields is stack-allocated when its lifetime doesn't escape (compiler decides via escape analysis). A mutable struct is always heap-allocated. A struct with abstract fields (Any, Number) is heap because the size is unknown. Use `struct` + concrete fields for value types; `mutable struct` only when you need to mutate. Tuples and NamedTuples are stack-allocated when type-stable.

7. **What's the difference between @threads and @spawn?** *(medium)*

   @threads parallelizes a for-loop statically — iterations are split across nthreads() at loop start. Best for balanced workloads where each iteration is similar cost. @spawn schedules a task on some thread (you choose via @spawnat), returned as a Future — fetch() to get the result. Best for unbalanced workloads (one big task, several small). @threads is coarse, @spawn is fine-grained. For very dynamic work, use ThreadPools.jl or OhMyThreads.jl.

8. **How would you debug a slow Julia function?** *(hard)*

   Step 1: @code_warntype f(args) — look for red text (type instability). Step 2: @btime f($args) — see time + allocations. Step 3: If allocations > 0, Profile.jl + ProfileView.jl show where. Step 4: @code_llvm or @code_native to inspect compiled output. Step 5: common fixes: zero(T) initializers, @inbounds, @views, hoist globals to locals, switch Vector{Any} to Vector{T}, preallocate via Vector{T}(undef, n). Step 6: re-bench to confirm.

9. **How does Julia's package manager differ from pip / npm?** *(hard)*

   Pkg uses per-environment Project.toml (deps) + Manifest.toml (resolved versions). You 'activate' an environment — usually per-project — and all installs land there. No global site-packages mess. Multiple Julia versions coexist via juliaup or juliaenv. Binary deps (OpenBLAS, HDF5) are shipped as JLL packages built by BinaryBuilder.jl — no system dependency hell. The model is closer to Cargo / npm than pip — dependency resolution is exact, reproducible, and shareable.

## When to Choose This

- **vs Python + NumPy:** use this — Hot numerical loops where Python's two-language problem (Python calling C) hurts; differentiable simulation; HPC where you want one language from prototype to optimized native.; use that — Mature ML ecosystem (PyTorch/TF), web backends, anything needing a large hiring pool, when iteration speed beats runtime speed.
- **vs MATLAB:** use this — Open-source deliverable, no per-seat licensing, general-purpose language (web, scripting, not just math), GPU support without toolbox fees.; use that — Simulink, established engineering curricula, vendor-tuned MKL/CUDA, teams with deep MATLAB toolbox investment (Control, Signal).
- **vs R:** use this — General-purpose programming (not just stats), production deployment, performance-critical numerics, anything needing real concurrency.; use that — Statistical modeling ecosystem (CRAN's 20k packages), ggplot, established academic stats workflows, when the team is statisticians first.
- **vs Fortran:** use this — Modern tooling (Pkg, REPL, tests), general-purpose glue, GPU/cuDNN without manual kernels, anything beyond dense linear algebra.; use that — Legacy HPC codebases (LAPACK, weather models), MPI + OpenMP maturity, when your team is Fortran-trained and the algorithm is dense linear algebra.

