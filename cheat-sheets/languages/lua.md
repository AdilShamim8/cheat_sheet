# Lua

**Category:** Languages · **Tier:** Tier 3 · Specialized · **Tags:** dynamic, interpreted, embedded, scripting, game-dev, register-based-vm, minimal · **First released:** 1993 · **Author:** Roberto Ierusalimschy, Waldemar Celes, Luiz Henrique de Figueiredo · **Last updated:** 2026-11

> A 24,000-line embeddable scripting VM — the scripting language of game engines, Redis, Nginx, and Wireshark.

---

## TL;DR

- Lua is a tiny, dynamically-typed scripting language designed to be embedded in a host C/C++ program; the entire interpreter plus stdlib is ~300KB compiled and a single static library.
- It dominates game scripting (World of Warcraft, Roblox, Garry's Mod, all Source-engine UIs), Redis server-side logic (EVAL), Nginx request rewriting (OpenResty), Neovim config, and TeX (LuaTeX).
- Reach for Lua when you need a sandboxed, GC'd scripting layer inside a C/C++/Rust host, when memory budget matters (embedded, mobile), or when you're customizing a tool that already ships a Lua API.
- Avoid Lua as a standalone application language — the stdlib is intentionally minimal (no modules, no regex, no class system, no OOP), and you'll spend time rebuilding things Python ships with.

## Core Mental Model

**One data structure: the table.** Lua has exactly one composite data structure — the table — which is a hash map from any value (except nil and NaN) to any value. Arrays are tables with integer keys 1..n (and an `#` operator that walks them); objects are tables with function values; modules are tables returned by `require`; the global namespace is just the table `_G`. Methods are syntactic sugar: `obj:method(a)` desugars to `obj.method(obj, a)` — the `:` adds an implicit `self` parameter. Metatables are the only extension point: they define what happens on `+`, `[]`, `obj.x`, and missing-key lookup, which is how you build classes, prototypes, and DSLs.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| local x = 1 | Lexically-scoped variable; globals are written `x = 1` (no `local`) and silently created. | Always use `local` — globals are the #1 source of bugs in Lua code. |
| local t = {1, 2, 3, foo="bar"} | Table constructor: positional args go to integer keys 1..n, named args go to string keys. | Every composite value — arrays, dicts, objects, modules. |
| t[1], t.foo, t["foo"] | Indexing — array indices start at 1, not 0; `t.foo` is sugar for `t["foo"]`. | Field access; the off-by-one is the language's defining footgun. |
| function M.foo(a, b) ... end | First-class function; assigned to a key in a table = method. | All function definitions. |
| function obj:method(x) self.x = x end | Method definition — `:` introduces implicit `self` parameter. | Defining methods on table-objects; equivalent to `obj.method = function(self, x) ... end`. |
| local mt = {__index = fallback} setmetatable(t, mt) | Attach a metatable — `__index` is consulted on missing keys (used for class inheritance and defaults). | Implementing classes, prototypes, defaults, and operator overloading. |
| local function f() ... end | Local function — lexically scoped, can recurse, closes over upvalues. | Default; prefer over `function f()` (which makes a global). |
| for i, v in ipairs(t) do ... end | Iterate 1..#t; stops at first nil. `pairs` iterates all keys in unspecified order. | Array vs map iteration — picking the wrong one is a common bug. |
| local ok, err = pcall(f, arg) | Protected call — returns (true, result…) or (false, error message); no exceptions in the language. | All error handling at boundaries; Lua errors are non-local jumps via error(). |
| local M = {} return M | Module pattern: a chunk returns a table, `require` caches it by name. | Every file is a module; `package.loaded[name]` memoizes the return value. |
| t = nil  -- GC collects | Only explicit nil-ing removes references; weak tables (`__mode = 'k'/'v'`) for caches. | Memory management; Lua has no __del or scope-exit hooks. |
| local co = coroutine.create(function() ... end) | Stackful coroutines — `coroutine.yield`/`resume` for cooperative scheduling. | Generators, cooperative multitasking, Lua-side async. |

## Idiomatic Patterns

**Class via metatable — the canonical OO pattern in pure Lua**

```lua
local Animal = {}
Animal.__index = Animal        -- looked up when instances miss a key

function Animal.new(name, sound)
    local self = setmetatable({}, Animal)
    self.name  = name
    self.sound = sound
    return self
end

function Animal:speak()
    return ("%s says %s"):format(self.name, self.sound)
end

-- inheritance: subclass whose __index is the parent class
local Cat = setmetatable({}, {__index = Animal})
Cat.__index = Cat

function Cat.new(name)
    return Animal.new(name, "meow")  -- call parent constructor
end

local c = Cat.new("Tom")
print(c:speak())   -- "Tom says meow"
```

**Module pattern + require caching**

```lua
-- utils.lua
local M = {}

local function private(x) return x * 2 end

function M.public(x) return private(x) + 1 end

-- Singleton-state modules can return a value or a function.
-- Each require() of "utils" gets the SAME table (package.loaded["utils"]).
return M

-- caller:
local utils = require("utils")
print(utils.public(10))   -- 21
```

**Pcall + error: the only error handling pattern**

```lua
local function risky(n)
    if n < 0 then
        error(("negative: %d"):format(n), 2)  -- level 2 -> blame the caller
    end
    return math.sqrt(n)
end

local ok, res = pcall(risky, -1)
if not ok then
    -- res is the error message string (or whatever error() was given)
    print("failed:", res)
else
    print("result:", res)
end

-- Wrap with xpcall to attach a traceback before the stack unwinds:
local ok2, err = xpcall(risky, debug.traceback, -1)
```

**Coroutine-based iterator**

```lua
-- A generator that yields values lazily.
local function range(a, b, step)
    step = step or 1
    return coroutine.wrap(function()
        for i = a, b, step do
            coroutine.yield(i)
        end
    end)
end

for x in range(1, 5) do
    io.write(x, " ")      -- 1 2 3 4 5
end
print()

-- The pattern composes: filter/map are wrappers that yield selectively.
local function take(n, gen)
    return coroutine.wrap(function()
        for i = 1, n do
            local v = gen()
            if v == nil then return end
            coroutine.yield(v)
        end
    end)
end
```

## Common Pitfalls

1. **Arrays are 1-indexed, not 0-indexed** — *Symptom:* Porting Python/JS code: `for i = 0, #t do print(t[i]) end` prints nil then 1..n-1; `t[0]` exists as a separate hash slot, never seen by `ipairs` or `#`. *Fix:* Loop with `for i, v in ipairs(t)`. The `#` operator is undefined if the array has nil holes — it returns any boundary. Use `table.move` and `table.insert` to keep arrays clean.
2. **Globals silently created without `local`** — *Symptom:* Typing `function foo() ... end` (no `local`) makes `foo` a key in `_G`, shared across every chunk and never garbage collected. Two modules can collide on the same name. *Fix:* Prepend `local` to every function and variable declaration. Run `luacheck` (the standard linter) which flags undeclared globals; consider `local _ENV = {}` for full isolation.
3. **`#t` is undefined on tables with nil holes** — *Symptom:* If `t = {1, 2, nil, 4}`, then `#t` can return 1, 2, or 4 — the spec allows any boundary. `ipairs` stops at the first nil too. *Fix:* Never store nil as a 'marker' in an array. Use an explicit `n` field, `table.remove`, or replace nilled slots with a sentinel. If you need sparse, use `pairs` with an integer check.
4. **Metatables don't survive `table.insert` / JSON encode** — *Symptom:* Copying a table via `{}` + loop or via `vim.deepcopy` may strip the metatable; JSON encoders typically ignore metatables entirely, so your class instance serializes as a bare map. *Fix:* Use `setmetatable(new, getmetatable(old))` after any manual copy. For JSON, write a custom encoder that respects `__tojson` or extract the underlying data before encoding.
5. **Comparing NaN, nil, and false** — *Symptom:* `nil` and `false` are the only falsy values — `0`, `""`, `{}` are all truthy. `NaN ~= NaN` (true) but `nil == nil` (true). Beginners write `if x then` expecting 'is x non-zero'. *Fix:* Be explicit: `if x ~= nil and x ~= 0 then`. For numeric NaN checks, `x ~= x` is the canonical idiom (Lua has no math.isnan in 5.3 — added in 5.4).
6. **Integer/float division confusion (5.3+)** — *Symptom:* `7 / 2 == 3.5`, `7 // 2 == 3` — but `7 / 2 == 3` is true in Lua 5.1 / LuaJIT (no integer subtype, all numbers are doubles). Code that divides and compares with `==` breaks across versions. *Fix:* Always use `//` for integer division (5.3+) or `math.floor(a/b)`. Check `if _VERSION >= 'Lua 5.3'` for portability, or target LuaJIT specifically (which is 5.1 + select extensions).
7. **`require` caches by name, not by path** — *Symptom:* Two different paths resolving to the same module name (`require 'foo'` from different package roots) return the same cached table; edits during dev don't reload unless you clear `package.loaded[name] = nil` first. *Fix:* Hot-reload by `package.loaded[name] = nil` then re-`require`. For module hygiene, prefer one canonical name per module across the whole project — no aliased package roots.

## Production / Interview Quick Reference

- Lua 5.1 (LuaJIT 2.1) is the dominant runtime in production: Redis, Nginx/LuaJIT, Neovim, WoW, Roblox. Lua 5.5 (Dec 2025) is the latest reference release but ecosystem fragmentation is real. `version`
- LuaJIT is ~10-50x faster than reference Lua on tight loops via trace compilation; it's the de-facto standard for game-embedded scripting. `perf`
- Register-based VM: most ops touch 2-3 explicit registers, no stack manipulation — ~30-50% fewer ops than a stack-based Python/JS VM for equivalent code. `perf`
- Table lookup is O(1) amortized; arrays are stored as a contiguous C array when keys are 1..n, hash fallback for sparse keys. `complexity`
- String comparison is O(1) — Lua interns short strings (≤40 chars in 5.3); long strings are compared by content. Never compare long strings in a hot loop. `perf`
- `#` operator on an array is O(log n) in the worst case (binary search for the boundary) — not free, but cheap. `complexity`
- Garbage collector is incremental mark-and-sweep; `collectgarbage('collect')` forces a full cycle. Tune with `collectgarbage('setpause', 100)` and `setstepmul`. `perf`
- Numbers: 5.3+ has int64 + float64 subtypes; 5.1/LuaJIT has only float64. Integer overflow wraps in 5.4 (was UB before). `version`
- There is no built-in regex — use Lua patterns (%d, %a, %w, +, *, -, ?) which are simpler but cover ~80% of needs. For full PCRE, install the lrexlib or PCRE FFI binding. `gotcha`
- Multiple return values: `f()` returns all; `f() + 1` uses only the first; `{f()}` collects all into a table; `(f())` truncates to one. `gotcha`
- Tail calls are guaranteed optimized — `return f()` reuses the stack frame. Deep recursion that ends in `return f(...)` will not stack-overflow. `perf`
- `__index` can be a function or a table — used as a table it's a fast-path inheritance lookup; as a function it's a fallback hook (slower). `complexity`
- luacheck is the standard linter; stylua is the standard formatter. lua-language-server (sumneko) is the LSP. `style`
- Naming: snake_case for vars/functions, CamelCase for types/classes (which are still tables). Modules are lowercase. `style`
- Strict mode: `local _ENV = {}` (5.2+) or the strict.lua snippet from the Lua book makes undeclared-global access a runtime error. `style`

## Go Deeper

- [Lua 5.4 Reference Manual](https://www.lua.org/manual/5.4/) — The official spec — every operator, every stdlib function. Read it once end-to-end; it's only ~200 pages.
- [Programming in Lua (Roberto Ierusalimschy)](https://www.lua.org/pil/2.0.html) — Written by the language designer. The 4th edition covers 5.3; free older edition (PIL 1.0) covers 5.0 and is still useful.
- [LuaJIT Project](https://luajit.org/) — The JIT compiler docs — trace compiler semantics, the FFI extension, and performance characteristics that matter in production.
- [Lua-users wiki](http://lua-users.org/wiki/) — The community knowledge base — tutorial, object orientation tutorial, and gotchas collected across two decades.
- [OpenResty Lua modules](https://github.com/openresty/lua-nginx-module) — Reference for embedding Lua in a real high-throughput C host; the source is the best doc on the C embedding API.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| nil | The absence of value — sole falsy value besides false. Assigning nil deletes a table key. | Optional/sentinel; table.remove via t[k]=nil. |
| boolean | true / false — distinct from nil. Only nil and false are falsy; 0 and '' are truthy. | Logic; the falsy-set surprise is the #1 Lua gotcha for newcomers. |
| number (5.3+) | Either integer (int64) or float (float64) subtypes; auto-promoted as needed. | Math. 5.1/LuaJIT: all numbers are float64 — code that relies on int subtype is non-portable. |
| string | Immutable byte sequence — NOT Unicode; #s is byte length. Interned if <=40 chars (5.3+). | All text. Use utf8 module (5.3+) for code points; libraries like lua-iconv for non-UTF8. |
| function | First-class — assignable to variables, table keys, args. Closures capture upvalues. | Callbacks, OO methods, module exports. |
| userdata | Opaque C-allocated object — only the C host can read/write its fields; metatables give it Lua-side ops. | C-FFI bindings, file handles, window objects. |
| thread | Coroutine — a stackful green thread created by coroutine.create; not OS-thread. | Generators, cooperative multitasking; one runs at a time per Lua state. |
| lightuserdata | Bare C pointer with no metatable — fast but opaque. Only equality, no operations. | FFI from C; rarely needed in pure Lua. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| {} (table) | The ONLY composite type — hash map with array part. Arrays are tables with 1..n keys. | Everything composite — arrays, dicts, objects, modules, classes, namespaces. |
| t[1], t['k'], t.k | Indexing — array index starts at 1. t.k is sugar for t['k']. Falls back to __index metatable. | All access. t[0] works but isn't seen by #, ipairs. |
| {1, 2, 3} | Array constructor — positional args become t[1], t[2], t[3]. | List construction. Mixing positional and named is fine: {1, 2, name='x'}. |
| {k = v, [expr] = v} | Map constructor — string keys via k=v (no quotes needed), computed keys via [expr]. | Hash construction; the [expr] form for non-identifier keys. |
| #t | Length operator — any boundary where t[n] ~= nil and t[n+1] == nil. Undefined on tables with nil holes. | Array length. Use table.getn in 5.0; modern code uses #t. |
| table.pack / table.unpack | Pack varargs into a table with 'n' field; unpack spreads a table to varargs. | Variadic functions; the n field avoids the nil-hole problem with #. |
| table.move(a, f, e, t, b) | Copy a slice of array a into a (or another) starting at b — memmove semantics, 5.3+. | Fast in-array shifts; reimplementing queue/stack without element-by-element copy. |
| weak table  {__mode = 'k' / 'v' / 'kv'} | Table whose keys/values are GC'd if no other refs — caches, ephemeron tables. | Memoization caches, attaching metadata to objects without preventing GC. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| setmetatable(t, mt) | Attach a metatable to t — defines operator behavior, __index fallback, __tostring, etc. | All OO, operator overloading, lazy defaults, proxies. |
| mt.__index = parent | Fallback lookup — when t[k] is nil, Lua looks at mt.__index (table or function). | Inheritance, classes, default values. If function, called as mt.__index(t, k). |
| function Class.new(...) ... end | Factory function — the canonical constructor pattern. No 'new' keyword in Lua. | All class instantiation. Convention: .new() or Class(). |
| function obj:method(...) ... end | Method with implicit self — sugar for obj.method = function(self, ...) ... end. | Defining methods. The ':' adds self as first arg both at definition and call site. |
| local M = {}; M.__index = M; return M | Class-as-metatable pattern — instances get M as their metatable, methods resolve via __index. | The canonical one-metatable class pattern; supports inheritance via nested __index. |
| mt.__call = function(t, ...) ... end | Call metamethod — lets you 'call' a table like a function: t(args). | Functional-style factories, DSLs, optional-paren call (Lua's syntax lets f'x' work). |
| mt.__add, __sub, __mul, __eq, __lt, __le | Operator metamethods — overload +, -, *, ==, <, <= for your types. | Vectors, matrices, money, custom numerics. ~= falls back to not __eq. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| =  (assignment) | Single-shot binding — NOT an expression. Multiple assignment: a, b = 1, 2. | All assignment. a, b = b, a swaps without a temp. |
| +, -, *, / | Arithmetic — / is float division in 5.3+ (int→float), float division in 5.1/LuaJIT. | Math. Use // for integer floor division (5.3+). |
| //  (floor division) | Integer floor — 7 // 2 == 3, -7 // 2 == -4 (toward negative infinity). 5.3+. | Integer math, indexing. Replaces math.floor(a/b). |
| %  (modulo) | Defined as a - floor(a/b)*b — result has sign of the divisor, not the dividend. | Indexing, cycling. (-7) % 3 == 2, unlike C/Python which give -1. |
| ^  (power) | Exponentiation — always float (5.0^2 == 25.0). Right-associative: 2^3^2 == 2^9 == 512. | Math. No bitwise ^ (use ~ in 5.3+ or bit32 library in 5.2). |
| ..  (concat) | String concatenation — coerces numbers to strings. Right-associative. | Building strings. table.concat(parts) is O(n) vs s..s..s which is O(n^2). |
| ==, ~= | Equality — ~= is not-equal. Numbers compare by value; strings by intern; tables by reference. | All equality. NaN ~= NaN. nil == nil. Tables are == only if same object (unless __eq metamethod). |
| <, >, <=, >= | Comparison — numbers by value, strings lexicographically. Tables need __lt/__le metamethods. | Sorting, ranges. Mixed-type compare (e.g., '1' < 2) raises an error. |
| and, or, not | Short-circuit boolean — and/or return one of the operands (not necessarily boolean). | Default value: x = x or default. Ternary: cond and a or b (BREAKS if a is false — use (cond and {a} or {b})[1]). |
| #  (length) | Array length — any boundary. Undefined for tables with nil holes; O(log n) worst case. | Array size. For maps, use a separate 'n' field or count via pairs(). |
| :  (method call) | obj:m(args) — sugar for obj.m(obj, args). Adds implicit self. | All method calls. Mixing : and . is a common bug — obj.m(args) doesn't pass self. |
| .  (index/call) | Field access — obj.k is sugar for obj['k']. Function call: f(args). | All non-method access. No implicit self. |
| .. , #t, []  on strings | Strings are immutable byte sequences — .. creates new strings, # gives byte length. | Text manipulation. For heavy string building use a table + table.concat. |
| &  (bitwise, 5.3+) | Bitwise AND, OR, XOR, NOT, shifts: &, \|, ~, ~, <<, >>. 5.1/LuaJIT needs bit32 or LuaJIT's bit library. | Bit flags, hashing, low-level. math.tointeger(x) to check int subtype. |

## Input / Output

**io.read / io.write — simple stdio**

```lua
-- Read all of stdin as one string:
local input = io.read("*all")    -- "*a" alias

-- Read line by line:
for line in io.lines() do        -- io.lines() defaults to stdin
    line = line:gsub("\r$", "")
    process(line)
end

-- Read from a file:
for line in io.lines("/etc/hosts") do
    print(line)
end

-- Write to stdout / stderr:
io.write("result: ", value, "\n")
io.stderr:write("warning: bad input\n")

-- Formatted output (no printf in stdlib — use string.format):
print(string.format("count=%d  rate=%.3f", count, rate))
```

**File I/O with explicit handle + pcall guard**

```lua
-- Open with mode: 'r' (read), 'w' (write/truncate), 'a' (append), 'rb'/'wb' binary.
local f, err = io.open(path, "r")
if not f then
    error(("could not open %s: %s"):format(path, err))
end

-- Read whole file:
local content = f:read("*all")
f:close()

-- Or stream line by line (lazy):
for line in f:lines() do
    if line:match("^#") then   -- string:match uses Lua patterns, not regex
        goto continue
    end
    process(line)
    ::continue::
end
f:close()

-- Always close in a finally — use pcall:
local ok, err = pcall(function()
    local f = assert(io.open(path, "r"))
    local data = f:read("*a")
    f:close()
    return data
end)
if not ok then handle_error(err) end
```

**JSON encode/decode (lua-cjson or dkjson)**

```lua
-- lua-cjson is the de-facto standard (used by OpenResty, Redis, Neovim).
local cjson = require "cjson"

local tbl = { user = "ada", tags = {"a", "b"}, id = 42, active = true }
local json = cjson.encode(tbl)   -- string

-- Decode: returns Lua table. Numbers may be int or float depending on value.
local back = cjson.decode(json)

-- Encode pitfalls:
--   * Tables with non-string keys (1, 2, 3 OK; [true]=x errors)
--   * nil values are SKIPPED (not encoded as null)
--   * Empty table {} encodes as '[]' (array) — there's no 'object' empty
--   * For explicit object vs array, use cjson.empty_array or
--     cjson.encode_sparse_array for arrays with nil holes.

-- For config files, use Lua itself (no parser needed):
--   return { user = "ada", timeout = 30 }
-- loaded via:  local cfg = dofile("config.lua")
```

**Socket I/O (LuaSocket) — HTTP GET**

```lua
local http = require "socket.http"
local ltn12 = require "ltn12"

-- Simple GET (returns body string, status, headers):
local body, status, headers = http.request("https://example.com/api")
if status ~= 200 then
    error("HTTP " .. status)
end

-- POST with body:
local resp = {}
local ok, status = http.request({
    url = "https://example.com/api",
    method = "POST",
    headers = { ["content-type"] = "application/json" },
    source = ltn12.source.string('{"k":1}'),
    sink = ltn12.sink.table(resp),
})
local body = table.concat(resp)

-- In OpenResty: use ngx.location.capture or lua-resty-http instead —
-- non-blocking, integrates with nginx's event loop.
```

## Loops & Iteration

**Numeric for / generic for / while / repeat**

```lua
-- Numeric for: start, end, step (inclusive on both ends).
for i = 1, 10 do print(i) end          -- 1..10
for i = 10, 1, -1 do print(i) end      -- 10..1
for i = 1, #t do print(t[i]) end       -- array indices

-- Generic for: works with iterators (functions or stateful objects).
for k, v in pairs(t) do print(k, v) end     -- all keys, unspecified order
for i, v in ipairs(t) do print(i, v) end    -- 1..#t, stops at first nil
for line in io.lines() do ... end           -- file iterator
for k, v in next, t do ... end              -- next is the primitive iterator

-- while:
while cond do ... end

-- repeat-until (do-while): body runs at least once; until is EXIT cond.
repeat
    x = step()
until x >= 10

-- break exits the innermost loop. continue doesn't exist — emulate with goto.
```

**Iterators with state + closures**

```lua
-- Stateful iterator: returns a closure capturing state.
local function range(a, b, step)
    step = step or 1
    local i = a - step
    return function()
        i = i + step
        if i <= b then return i end
    end
end

for x in range(1, 5) do print(x) end   -- 1 2 3 4 5

-- The generic for expects: iterator, state, control var.
-- Lua calls iterator(state, control) each iteration; if first return is nil, stop.
-- Otherwise, control becomes the new first return, and other returns are loop vars.

-- Stateless iterator using 'next':
for k, v in next, my_table do print(k, v) end
```

**Coroutines as lazy generators**

```lua
-- A coroutine that yields an infinite sequence on demand.
local function fib()
    local a, b = 0, 1
    while true do
        coroutine.yield(a)
        a, b = b, a + b
    end
end

local co = coroutine.create(fib)
for _ = 1, 10 do
    local ok, val = coroutine.resume(co)
    print(val)   -- 0 1 1 2 3 5 8 13 21 34
end

-- coroutine.wrap hides the resume/ok boilerplate, returns a plain function:
local gen = coroutine.wrap(fib)
print(gen(), gen(), gen())   -- 0 1 1

-- Use this for lazy streams, generators, cooperative scheduling.
-- Each coroutine has its own stack; switching costs ~50-100ns.
```

**goto for continue / break-out-of-inner**

```lua
-- Lua has goto (5.2+) — used for emulating continue and multi-level break.
for i = 1, 100 do
    for j = 1, 100 do
        if matrix[i][j] < 0 then goto skip end
        if matrix[i][j] == 0 then goto done end
        process(matrix[i][j])
        ::skip::
    end
end
::done::

-- Labels are ::name:: (forward or backward). Cannot jump into a local's scope.
-- Stylistically controversial — many projects forbid goto; emulate with
-- extracted helper functions and 'return' instead.
```

## Functions & Callables

**Variadic functions + table.pack/unpack**

```lua
-- ... captures all extra args; select("#", ...) is the count.
local function printf(fmt, ...)
    io.write(string.format(fmt, ...))
end

-- Forward varargs:
local function log_call(fn, ...)
    print("calling with " .. select("#", ...) .. " args")
    return fn(...)
end

-- Pack/unpack for table<->varargs conversion:
local function variadic_to_table(...)
    return table.pack(...)   -- includes .n field (count, safe with nil holes)
end

local function call_with(t)
    return some_fn(table.unpack(t, 1, t.n or #t))   -- explicit bounds
end

-- Lua 5.1 uses unpack() (global); 5.2+ uses table.unpack(). For portability:
local unpack = table.unpack or unpack
```

**Closures + upvalues (the function factory pattern)**

```lua
-- Functions capture upvalues (locals from enclosing scope) BY REFERENCE.
local function make_counter(start)
    local count = start or 0
    return function()
        count = count + 1
        return count
    end
end

local c = make_counter(10)
print(c(), c(), c())   -- 11 12 13

-- Multiple closures sharing one upvalue:
local function make_pair()
    local v = 0
    local function get() return v end
    local function set(x) v = x end
    return get, set      -- both close over the SAME v
end

local get, set = make_pair()
set(42)
print(get())   -- 42
```

**Higher-order functions: map, filter, reduce**

```lua
-- Lua stdlib has NO map/filter/reduce — write them once, reuse forever.
local function map(t, fn)
    local r = {}
    for i, v in ipairs(t) do r[i] = fn(v) end
    return r
end

local function filter(t, fn)
    local r = {}
    for _, v in ipairs(t) do
        if fn(v) then r[#r+1] = v end
    end
    return r
end

local function reduce(t, fn, acc)
    for _, v in ipairs(t) do acc = fn(acc, v) end
    return acc
end

-- Usage:
local xs = {1, 2, 3, 4, 5}
local doubled = map(xs, function(x) return x * 2 end)
local evens   = filter(xs, function(x) return x % 2 == 0 end)
local sum     = reduce(xs, function(a, b) return a + b end, 0)
```

**Methods, self, and the . vs : distinction**

```lua
local Account = {}
Account.__index = Account

function Account.new(balance)
    return setmetatable({ balance = balance or 0 }, Account)
end

-- ':' form: implicit self (first arg). Idiomatic for methods.
function Account:deposit(amount)
    self.balance = self.balance + amount
    return self.balance
end

-- '.' form: NO implicit self. Use when self isn't needed (class-level ops).
function Account.class_name()
    return "Account"
end

local a = Account.new(100)
a:deposit(50)         -- 150   (':' passes a as self)
a.deposit(a, 50)      -- 200   (equivalent, manual self)
-- a.deposit(50)      -- ERROR: tries to deposit to 'a.deposit' (the function)

-- This is THE Lua OO gotcha — mixing . and : produces weird errors.
-- Convention: methods use ':', factory + class-level functions use '.'.
```

## Error Handling

**pcall + error — the only error model**

```lua
-- error(msg, level) throws. pcall catches.
-- level 0: no position info; 1: blame error() caller; 2: blame caller's caller.
local function risky(x)
    if x < 0 then
        error("negative input: " .. x, 2)   -- blame the caller of risky()
    end
    return math.sqrt(x)
end

-- pcall returns (true, result...) on success, (false, err) on error.
local ok, res = pcall(risky, -1)
if not ok then
    -- res is the error message string (or whatever error() was given).
    print("failed:", res)
else
    print("result:", res)
end

-- Multi-return on success:
local ok2, a, b, c = pcall(function() return f(), g(), h() end)

-- A common Lua convention: error with a table for structured info:
error({ code = "EINVAL", msg = "bad arg", details = {...} })
```

**xpcall + traceback — capture stack before unwind**

```lua
-- xpcall takes a handler that runs BEFORE the stack unwinds.
-- debug.traceback is the canonical handler — builds a readable trace.
local ok, err = xpcall(function()
    return do_something_risky()
end, debug.traceback)

if not ok then
    log_error(err)   -- err includes the traceback string
end

-- Lua 5.2+: xpcall takes extra args (passed to the function):
local ok2, result = xpcall(process, debug.traceback, input)

-- Without xpcall, the stack is already unwound when you catch — debug.traceback
-- inside the pcall body shows the running stack, not the throw site.
```

**Assert + error conventions**

```lua
-- assert(v, msg) returns v if v is not nil/false; throws msg otherwise.
local function divide(a, b)
    assert(b ~= 0, "divide by zero")
    return a / b
end

-- Convention: functions that can fail return (nil, errmsg) on failure.
-- Caller uses assert to convert to throw:
local file, err = io.open(path, "r")
if not file then return nil, err end

-- Or inline:
local file = assert(io.open(path, "r"))   -- err becomes the throw message

-- This 'return nil, err' pattern is the Lua equivalent of Go's (T, error).
-- It's verbose but explicit — no hidden control flow.
```

**finally via pcall — no language-level defer**

```lua
-- Lua has no 'defer' / 'finally'. Emulate with pcall + always-run cleanup.
local function with_resource(path, fn)
    local f = assert(io.open(path, "r"))
    local ok, err = pcall(fn, f)
    f:close()           -- always runs
    if not ok then error(err) end   -- re-throw
end

-- Usage:
with_resource("data.txt", function(f)
    for line in f:lines() do process(line) end
end)

-- For resources with multiple steps, a small 'scope' helper:
local function scope(enter, exit)
    local resource = enter()
    return function(fn)
        local ok, err = pcall(fn, resource)
        exit(resource)
        if not ok then error(err, 0) end
    end
end
```

## Concurrency Model

**Coroutines — cooperative single-thread multitasking**

```lua
-- Lua coroutines are stackful green threads; ONE runs at a time per Lua state.
-- Used for generators, cooperative scheduling, async-style code without callbacks.

local function producer(out)
    for i = 1, 5 do
        coroutine.yield(i)   -- pause, return i to caller
    end
end

local co = coroutine.create(producer)
print(coroutine.resume(co))   -- true    1
print(coroutine.resume(co))   -- true    2
print(coroutine.resume(co))   -- true    3 (etc.)
print(coroutine.resume(co))   -- false   "cannot resume dead coroutine" (after 5)

-- resume returns (true, values...) on yield/return, (false, errmsg) on error.
-- yield can pass values back into the coroutine via resume's extra args:
--   coroutine.yield(x)  -- x goes to resume's caller
--   coroutine.resume(co, y)  -- y is the return value of yield()
```

**Producer/consumer with coroutines**

```lua
local function producer()
    for line in io.lines() do
        coroutine.yield(line)
    end
end

local function consumer(prod)
    while true do
        local _, line = coroutine.resume(prod)
        if not line then break end
        if line ~= "" then process(line) end
    end
end

local prod = coroutine.create(producer)
consumer(prod)

-- This is the pattern behind Lua's generic for loop and most async I/O
-- libraries (LuaCocos, Love2D's tick, OpenResty's cosockets).
-- Coroutines are CHEAP: ~200 bytes per stack, switch in 50-100ns.
```

**LuaLanes / lanes — true OS threads (rare)**

```lua
-- Standard Lua has NO OS threads — coroutines are cooperative only.
-- For real parallelism you need a host extension or a multi-state library.

-- Lanes (third-party) spawns separate Lua states on OS threads, communicating
-- via linda channels (thread-safe queues):
local lanes = require "lanes".configure()
local linda = lanes.linda()

local producer = lanes.gen("*", function()
    for i = 1, 100 do linda:send("q", i) end
    linda:send("q", nil)   -- sentinel
end)

local consumer = lanes.gen("*", function()
    while true do
        local _, v = linda:receive("q")
        if v == nil then break end
        process(v)
    end
end)

producer(); consumer()

-- Each lane has its own Lua state — NO shared memory. This is the Erlang
-- model, applied to Lua. GIL-like isolation makes it safe but copy-heavy.
```

**OpenResty cosockets — non-blocking I/O in nginx**

```lua
-- Inside an nginx worker, OpenResty provides 'cosockets' that look like
-- regular socket I/O but yield the worker's coroutine to nginx's event loop.
-- This gives you async-like code in synchronous style.

local http = require "resty.http"
local httpc = http.new()
local res, err = httpc:request_uri("https://api.example.com", {
    method = "GET",
    timeout = 5000,
})

if not res then
    ngx.log(ngx.ERR, "http failed: ", err)
    return ngx.exit(502)
end

-- The request_uri call yields internally; nginx serves OTHER requests
-- while we wait. This is how OpenResty scales to 100k+ connections/worker.
-- Outside OpenResty, you need LuaSocket + a manual event loop.
```

## Testing Patterns

**busted — BDD-style testing (most popular)**

```lua
-- busted is the de-facto Lua test framework (similar to RSpec/Mocha).
-- File: spec/foo_spec.lua

local foo = require "foo"

describe("foo", function()
    setup(function()
        foo.reset()
    end)

    it("adds two numbers", function()
        assert.are.equal(3, foo.add(1, 2))
    end)

    it("handles nil input", function()
        assert.has_error(function()
            foo.add(nil, 1)
        end, "expected number")
    end)

    pending("TODO: edge case", function() end)
end)

-- Run: busted spec/
-- Supports mocks, spies, stubs, async tests, parametrized tests.
```

**luaunit — xUnit-style alternative**

```lua
-- luaunit is a simpler xUnit-style framework, single file, no deps.
local lu = require "luaunit"

function testAdd()
    assertEquals(add(1, 2), 3)
    assertAlmostEquals(add(0.1, 0.2), 0.3, 0.0001)   -- float compare
    assertNil(find("missing"))
    assertError(function() error("oops") end)
end

function testTable()
    assertItemsEquals({1, 2, 3}, {3, 2, 1})   -- order-insensitive
end

os.exit(lu.LuaUnit.run())   -- exits non-zero on failure

-- Run: lua test_foo.lua
-- Lightweight; preferred for embedded contexts where busted is too heavy.
```

**Manual assertions + pcall for error-path tests**

```lua
-- Without a framework, Lua's assertions are minimal but sufficient.
local function assert_eq(actual, expected, msg)
    if actual ~= expected then
        error(string.format("%s: expected %s, got %s",
            msg or "assertion failed", tostring(expected), tostring(actual)), 2)
    end
end

local function assert_throws(fn, err_match)
    local ok, err = pcall(fn)
    assert(not ok, "expected error, got success")
    if err_match then
        assert(tostring(err):match(err_match),
            "error didn't match: " .. tostring(err))
    end
end

-- Test:
assert_eq(add(1, 2), 3, "add basic")
assert_throws(function() add(nil, 1) end, "expected number")
print("all tests passed")
```

**Coverage + CI conventions**

```lua
-- luacov is the standard coverage tool.
-- Run with:  lua -lluacov test_foo.lua
-- Generates luacov.report.out with per-line counts.
-- luacov-html (separate) renders an HTML report.

-- .luacov config:
-- return { modules = { "myapp.*" }, exclude = { "spec/.*" } }

-- CI: GitHub Actions workflow
-- jobs:
--   test:
--     runs-on: ubuntu-latest
--     steps:
--       - uses: actions/checkout@v4
--       - uses: leafo/gh-actions-lua@v10
--       - uses: leafo/gh-actions-luarocks@v4
--       - run: luarocks install busted luacov
--       - run: busted --coverage spec/

-- Pre-commit hooks: stylua (format), luacheck (lint) — fast, catch 80% of issues.
```

## Performance Tuning

- LuaJIT is 10-50x faster than reference Lua on tight loops — trace compiler with a register-based IR; the de-facto standard for game/embedded scripting.
- Local variable access is ~30% faster than global (LOADLOCAL vs GETGLOBAL bytecode). Hoist hot globals to locals: local print = print.
- Table access is fast (~3-5ns) but a global lookup costs ~10-15ns. Cache t.method as local method = t.method in hot loops.
- table.insert(t, v) is O(1) amortized (geometric growth). table.insert(t, 1, v) (front) is O(n) — use a deque or append + reverse.
- table.concat(parts) is O(n) once; s = s .. x in a loop is O(n^2) due to immutability. Always build with a table then concat.
- #t on an array is O(log n) worst case (binary search for boundary); O(1) for dense arrays via cached length.
- String interning: short strings (<=40 chars in 5.3) are interned, so == is O(1). Long strings compared by hash then content.
- GC is incremental mark-sweep; collectgarbage('setpause', 100) lowers pause between cycles; 'setstepmul' controls speed.
- Closure capture costs nothing until the closure escapes; a function defined inside a loop allocates a new closure each iteration.
- Tail calls: return f() reuses the stack frame — deep recursion in this form won't overflow. Non-tail return (x + f()) does grow.
- LuaJIT FFI eliminates most C-call overhead — cdef declares the C struct, then accesses are JIT-compiled to native loads/stores.
- math.floor and // are about equally fast on LuaJIT; on reference Lua 5.3, // is a dedicated opcode and faster.
- Avoid creating tables in hot loops — every {} is a heap allocation + GC pressure. Pool, reuse, or use multiple return values.
- 5.3+ integer subtype avoids float→int conversions in index math; LuaJIT's bit library is faster than 5.3's bitwise ops on LuaJIT.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [LuaRocks](https://luarocks.org/) | Package manager — Lua's equivalent of pip/npm. Installs modules from luarocks.org. | package |
| [luacheck](https://github.com/mpeterv/luacheck) | Static analyzer — catches unused vars, undefined globals, shadowing, style issues. The standard linter. | lint |
| [StyLua](https://github.com/JohnnyMorganz/StyLua) | Opinionated code formatter — like prettier/black. The de-facto standard for new Lua code. | lint |
| [lua-language-server](https://github.com/LuaLS/lua-language-server) | LSP server (sumneko) — IntelliSense, goto-def, hover, refactoring. Works in VS Code, Neovim, etc. | build |
| [busted](https://lunarmodules.github.io/busted/) | BDD-style testing framework — describe/it, mocks, spies, async. The most popular Lua test runner. | test |
| [luaunit](https://github.com/bluebird75/luaunit) | Lightweight xUnit-style test framework — single file, no deps. Good for embedded/restricted environments. | test |
| [luacov](https://github.com/keplerproject/luacov) | Coverage tool — line coverage, HTML report via luacov-html. Standard for CI. | test |
| [LuaJIT](https://luajit.org/) | The trace-compiling JIT — 10-50x faster than reference Lua. Production default for Redis, Neovim, OpenResty, WoW. | build |
| [OpenResty](https://openresty.org/) | nginx + LuaJIT + bundled libs — high-performance web platform. Powers Cloudflare, Kong, Twitch chat. | deploy |
| [Lapis](https://leafo.net/lapis/) | Web framework on top of OpenResty — MVC, ORM, sessions. Lua or MoonScript. | build |
| [LÖVE](https://love2d.org/) | 2D game framework — the easiest way to make games in Lua. Cross-platform, MIT-licensed. | build |
| [luvit](https://luvit.io/) | Node.js-style async I/O for Lua — same event-loop model, Lua syntax. Less popular than OpenResty. | build |
| [MoonScript / YueScript](https://moonscript.org/) | Languages that compile to Lua — whitespace-significant, shorter syntax. Used by Lapis, WowMod authors. | build |
| [Teal](https://github.com/teal-language/tl) | Optionally-typed dialect of Lua — compiles to Lua with type checking. The 'TypeScript for Lua'. | build |
| [LuaCoco / LuaJIT FFI](https://luajit.org/ext_ffi.html) | C FFI bindings — LuaJIT's FFI is the standard way to call C without writing C bindings. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 1993 | First release at PUC-Rio — designed as a configuration language for PETROBRAS data entry tools. |
| 2.0 | 1995 | Adds 'long strings' [[...]], fallbacks for table access (proto-metatables). |
| 5.4 | 2020 | Integer division & bitwise operators, goto, <close> to-be-closed variables, generational GC. Current major; 5.5 in development. |
| 3.0 | 1996 | Introduces metatables (replacing fallbacks), tag methods, anonymous functions. The modern language takes shape. |
| 4.0 | 2000 | Multiple assignment, locals anywhere, 'for' generic iterator. Major API cleanup. |
| 5.0 | 2003 | Register-based VM (~30% fewer ops than stack-based), lexical scoping, full coroutine support. |
| 5.1 | 2006 | LuaJIT 1.x debuts; 5.1 becomes the dominant runtime in embedded/game for ~15 years. module() function (later deprecated). |
| LuaJIT 2.0 | 2011 | Trace compiler rewrites LuaJIT — 10-100x speedups on numeric loops. Adopted by OpenResty, Redis, WoW. |
| 5.2 | 2011 | goto, no more module() (use plain require + return), ephemeron tables, bit32 library. Backwards-incompatible env changes. |
| 5.3 | 2015 | Integer subtype (int64), bitwise operators (& \| ~ << >>), 32-bit integers deprecated. utf8 module added. |
| 5.4 | 2020 | Generational GC, const locals, integers always 64-bit, goto continues, math.tointeger. Performance and memory improvements. |
| LuaJIT 2.1 | 2021 | LuaJIT 2.1 released — the long-running dev branch stabilizes. Adds FFI improvements, ARM64 support, bug fixes. |
| 5.5 | 2025 | Released Dec 2025 — declarations for global variables, named vararg tables. First major version in five years; LuaJIT continues on the 5.1 compatibility track. |

## Interview Hot Questions

1. **Why is everything a table in Lua?** *(medium)*

   Simplicity and embeddability. By making arrays, dicts, objects, and modules all the same data structure (a hash map with an array part), the runtime needs only one composite type implementation. This keeps the interpreter tiny (~300KB) and the C API minimal. The cost: no built-in OO, no generics, no distinct list vs map types — you build abstractions with metatables. The design choice is what made Lua viable in embedded/game contexts where every KB matters.

2. **Explain the . vs : distinction when calling methods.** *(easy)*

   obj:m(args) is sugar for obj.m(obj, args) — the : adds obj as the first argument (called 'self' inside the method). obj.m(args) calls the function WITHOUT passing self, so inside the method, self is nil and self.field throws. Convention: define methods with function obj:m() (implicit self), call them with obj:m(). Mixing . and : is the #1 Lua OO bug. Class-level functions (factories, constants) use . because they don't need an instance.

3. **What's the difference between ipairs, pairs, and #?** *(easy)*

   ipairs(t) iterates 1, 2, 3, ... until t[n] is nil — only the array part, ordered. pairs(t) iterates ALL keys (including string/non-int) in unspecified order. #t returns ANY boundary where t[n] is non-nil and t[n+1] is nil — defined for dense arrays, undefined for tables with nil holes. Use ipairs for arrays, pairs for maps. For tables with nil holes, store a separate 'n' field — never rely on #.

4. **How do metatables implement OO?** *(medium)*

   A metatable is a table attached to another table via setmetatable. The __index field is consulted when a key lookup misses — if __index is a table, Lua looks up the key there (forming the inheritance chain); if it's a function, Lua calls it with (table, key). Classes set __index to themselves, so instances inherit methods. Method calls (obj:m()) find m via __index. Inheritance: set __index to the parent class. Operator overloading via __add, __eq, __lt, etc.

5. **Why are Lua coroutines called 'stackful', and how are they different from OS threads?** *(medium)*

   Each Lua coroutine has its own full call stack (allocated lazily, ~200 bytes initial), so it can yield from inside any depth of nested calls — unlike Python generators (which yield only from the top frame). But coroutines run on a single OS thread; only one is active at a time, and switching requires explicit coroutine.resume/yield — no preemption. For OS-level parallelism you need LuaLanes, separate Lua states per OS thread, or the host's threading. Coroutines are about structured async, not CPU parallelism.

6. **Explain nil, false, and NaN — what's falsy?** *(easy)*

   Only nil and false are falsy in Lua. Everything else is truthy: 0, empty string '', empty table {}, NaN. This is the opposite of Python (where 0 and '' are falsy) and catches newcomers constantly. NaN has its own quirk: NaN ~= NaN is true (IEEE 754), so to test for NaN use x ~= x. nil is special in tables: assigning nil deletes a key; reading a missing key returns nil.

7. **How does Lua's GC work, and how do you tune it?** *(medium)*

   Reference counting + a tracing GC for cycles? No — Lua uses pure mark-and-sweep, incremental since 5.1 and generational since 5.4. collectgarbage('setpause', v) sets the collector pause as a percentage of the last cycle's memory (default 200 = wait until memory doubles). collectgarbage('setstepmul', v) controls step speed (default 200 = steps run 2x the allocation rate). For latency-sensitive code, lower setpause; for throughput, raise it. Avoid creating garbage in inner loops — pool tables, prefer multiple return values to table allocations.

8. **What's the difference between Lua 5.1, 5.3, 5.4, and LuaJIT?** *(hard)*

   5.1 (2006) is the embedded/game standard — LuaJIT targets it. 5.2 added goto, removed module(), changed env handling (broke some 5.1 code). 5.3 added integer subtype, bitwise ops, utf8 — performance boost but migration pain (1 // 2 vs 1/2). 5.4 added generational GC, const locals. LuaJIT is a separate implementation: trace compiler, 10-50x faster, stays API-compatible with 5.1 + selective 5.2/5.3 features. Production: pick LuaJIT for perf, 5.4 for new language features.

9. **How would you write a Lua module that's safe to hot-reload?** *(hard)*

   Module-level state must live outside the module table, because require caches the result in package.loaded and won't re-run. Pattern: keep state in a separate upvalue or table returned from a setup function, and design the module's functions to take state as an argument. For dev hot-reload: package.loaded[modname] = nil then require again. Watch out for closures capturing old versions — the new module's functions are fresh, but anything that captured a reference to the old ones keeps using stale code. Use a registry pattern (one M._state table) so reloads preserve state.

## When to Choose This

- **vs Python:** use this — Embedding in a C/C++ host (games, Redis, Nginx), tight memory budget (<1MB), sub-ms startup, scripting a tool that ships a Lua API.; use that — Standalone scripting, ML/data science, web backends, anything needing a large stdlib. Python is 50-100x larger and slower to start.
- **vs JavaScript:** use this — Embedding in non-browser hosts, sandboxed scripting of native apps, places where LuaJIT's speed matters more than npm's ecosystem.; use that — Browser, isomorphic web, anything needing async/await, npm. JS engines (V8) are far larger and slower to embed.
- **vs LuaJIT vs reference Lua:** use this — Performance-critical work (games, OpenResty, Redis EVAL), FFI to C without writing bindings, tight numeric loops.; use that — Targeting 5.3+ integer subtype, 5.4 generational GC, environments where LuaJIT's stalling maintenance is a concern.
- **vs Wren / Squirrel / other embeddable langs:** use this — Existing ecosystem (Redis, Neovim, OpenResty, LÖVE), mature tooling (LuaRocks, busted, lua-language-server), hiring.; use that — Need for class-based OO (Wren), strong typing, modern language design. Lua's minimalism is a feature for embedders, a hurdle for app developers.

