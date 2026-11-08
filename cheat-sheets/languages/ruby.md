# Ruby

**Category:** Languages · **Tier:** Tier 2 · Domain · **Tags:** dynamic, interpreted, object-oriented, web, dsl-friendly, rails, scripting · **First released:** 1995 · **Author:** Yukihiro Matsumoto (Matz) · **Last updated:** 2026-11

> Dynamic, object-oriented language optimized for developer happiness — the engine behind Rails and a king of internal DSLs.

---

## TL;DR

- Ruby is a dynamically-typed, purely object-oriented language (everything is an object, including integers and nil) whose design philosophy is 'developer happiness' — concise syntax, expressive blocks, and malleable metaprogramming.
- It dominates web development via Rails (which shaped modern web frameworks everywhere) and shines for internal DSLs, scripting, devops glue, and quick prototypes where iteration speed matters.
- Reach for Ruby when you want a web backend with strong conventions, when you need to embed a DSL (Rake, Capistrano, Chef), or for throwaway scripts where `ruby -e` reads cleaner than bash.
- Avoid Ruby for CPU-bound numerics, hard-realtime, or memory-constrained environments — the GC, GVL, and dispatch cost make it 5-50x slower than compiled alternatives; reach for Rust/Go/C for hot paths.

## Core Mental Model

**Every expression returns a value, every method takes a block.** Ruby has no statements — `if`, `case`, `while`, and method `def` all evaluate to the last expression. Methods implicitly accept a block (a closure passed syntactically after the call) and `yield` invokes it without naming it. The mental model that unlocks 80% of idiomatic Ruby: any method can be the host of a mini-DSL by yielding to a block, and most 'keywords' are actually methods on `self` (attr_accessor, require, include, private) operating on the current class. This is why Rails reads like prose — `has_many :comments` is just a method call evaluated in the class body.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| def m(a, *rest, key:); end | Method with positional splat, keyword arg (no parens needed at call site). | Flexible API surfaces; Ruby 3.0+ treats keyword args as distinct from a trailing hash. |
| [1,2,3].map { \|x\| x * 2 } | Block form — closure passed after the call; equivalent to a lambda but with looser return semantics. | Default for short transformations; prefer over for-loops. |
| [1,2,3].each_with_object([]) { \|x, acc\| acc << x*2 } | Iterates and threads an accumulator (immutable-friendly pattern). | Building up collections without leaked outer state. |
| class C < Base; include M; end | Single inheritance + mixin modules — Ruby's answer to multiple inheritance. | Sharing behavior; `prepend` puts the module below the class for `super` chain. |
| attr_accessor :name | Generates getter+setter methods — a method, not a keyword. | Plain value fields; prefer `Struct`/`Data` for value types. |
| Data.define(:id, :email) | Immutable value class with positional + keyword init (Ruby 3.2+). | Modern replacement for Struct when you want immutability + equality. |
| begin ... rescue Err => e ... ensure ... end | Exception handling with ensure = finally; rescue is type-driven. | Resource cleanup; never rescue Exception broadly — Kernel.exit lives there. |
| Thread.new { ... } / Ractor.new { } | OS thread (GVL-serialized) vs Ractor (true parallel, no shared mutable state). | Ractor for 3.0+ CPU parallelism with strict message passing. |
| Fiber.new { \|x\| fiber.resume(x) } | Cooperative coroutine — manual scheduling, no preemption. | Generators, async frameworks (Async gem), backpressure. |
| x&.upcase \|\| 'n/a' | Safe navigation + default — nil-safe chain. | Optional descent through a graph; combine with `&.try` for ActiveRecord. |
| case obj in {kind:, **rest} | Pattern matching (3.0+) with destructuring + guards. | Replacing long if/elsif chains; parsing nested JSON/tagged unions. |

## Idiomatic Patterns

**Modern value class with Data.define + pattern matching**

```ruby
require "data"

class Money < Data.define(:amount, :currency)
  def +(other)
    raise ArgumentError, "currency mismatch" unless currency == other.currency
    Money.new(amount + other.amount, currency)
  end
end

case Money.new(1500, "USD")
in { amount: Integer => n, currency: "USD" } if n > 0
  puts "$%.2f" % (n / 100.0)
in { amount:, currency: }
  puts "#{amount} #{currency}"
end
```

**Block-as-resource-manager (the File.open pattern)**

```ruby
# The canonical Ruby idiom: yield to caller, ensure cleanup.
module ConnectionPool
  def with
    conn = acquire
    begin
      yield conn
    ensure
      release(conn)
    end
  end
end

# Caller side — note no |conn| parens, block reads like English.
pool.with do |c|
  c.query("SELECT 1")
  c.query("SELECT 2")
  # Connection returns even if a query raises.
end
```

**Ractor for true parallel CPU work (Ruby 3.0+)**

```ruby
# Ractors share nothing — messages are deep-copied or moved.
results = 8.times.map do |i|
  Ractor.new(i) do |idx|
    # Inside here, `self` is the Ractor, isolated from main.
    sum = 0
    (1..1_000_000).each { |n| sum += n * idx }
    sum
  end
end.map(&:take)

# .map(&:take) blocks until each Ractor finishes.
# Roughly 4-6x speedup on a multi-core box for pure CPU work.
```

**Internal DSL via class_eval — how Rails feels like prose**

```ruby
class RouteSet
  def initialize = @routes = {}

  # DSL method: when called in `get ...`, the receiver is implicit.
  def get(path, to:) = @routes["GET #{path}"] = to
  def post(path, to:) = @routes["POST #{path}"] = to

  def draw(&block)
    # instance_eval runs the block with self == this RouteSet.
    instance_eval(&block)
    @routes
  end
end

routes = RouteSet.new.draw do
  get  "/users",  to: "users#index"
  post "/users",  to: "users#create"
end
# => {"GET /users"=>"users#index", "POST /users"=>"users#create"}
```

## Common Pitfalls

1. **Monkey-patching core classes silently breaks gems** — *Symptom:* `class String; def blank?; ...; end; end` works locally, then a gem dependency that defines `blank?` differently breaks at runtime in production. *Fix:* Use refinements (`module M; refine String do ... end; end; using M`) to scope patches lexically. Never reopen core classes in libraries; if you must, namespace it (`class MyStringExt`).
2. **Optional boolean params default to nil, not false** — *Symptom:* `def m(flag: false); ... end` works, but `def m(flag = false)` paired with `m(nil)` makes `flag` nil, and `if flag` is falsey — surprising when nil ≠ false downstream. *Fix:* Use keyword args for booleans. Treat `nil` as 'unset' and `false` as 'explicit false'; check with `flag.nil?` if the distinction matters.
3. **`private` does not apply to methods defined with `def self.x`** — *Symptom:* Writing `private` above a `def self.foo` class method does nothing — it's still public. Ruby's `private` only affects instance methods. *Fix:* Use `private_class_method :foo` or wrap class methods in `class << self; private; def foo; end; end`.
4. **Keyword args vs trailing hash (the 2.7 → 3.0 split)** — *Symptom:* Code calling `m({a: 1})` where `def m(a:) ...` worked in 2.6; in 3.0 it raises ArgumentError — the hash is no longer auto-splatted into keywords. *Fix:* Pass keywords directly: `m(a: 1)`. To forward arbitrary args use `def m(**kw) = other(**kw)` (double-splat). Run with `-W:deprecated` in 2.7 to migrate cleanly.
5. **`and`/`or` have lower precedence than `=`** — *Symptom:* `x = y or return` parses as `(x = y) or return` — fine — but `x = y and z` parses as `x = (y and z)`, binding x to a boolean unexpectedly. *Fix:* Use `&&` and `||` for control flow; reserve `and`/`or` only for statement sequences where you want the lowest precedence, and even then prefer explicit parens.
6. **Modify array while iterating with .each** — *Symptom:* `arr.each { |x| arr.delete(x) if x.even? }` skips elements because the index advances past shifted items. *Fix:* Use `arr.reject! { |x| x.even? }` (or non-mutating `arr.select { ... }`) — never mutate during iteration. For complex cases, iterate a dup: `arr.dup.each { ... }`.
7. **`require` vs `require_relative` for local files** — *Symptom:* `require './lib/foo'` resolves relative to the process cwd, not the file — works locally, breaks when launched from another directory. *Fix:* Use `require_relative '../lib/foo'` for project-local files. Use `require` only for installed gems (resolved via $LOAD_PATH).

## Production / Interview Quick Reference

- Ruby 4.0.9 (Oct 2026) is current — ZJIT, Ruby Box, Ractor::Port; 4.1-preview1 is out. `version`
- MRI has a GVL (Giant VM Lock) — only one Ruby thread executes bytecode at a time. Use Ractors (3.0+) or multiple processes for true parallelism. `perf`
- Ruby 3.0 keyword args are separated from positional — `def m(a:)` requires `m(a: 1)`, not `m({a: 1})`. `version`
- Ruby 3.1+ shorthand hash literal: `{x:, y:}` is sugar for `{x: x, y: y}`. `version`
- Ruby 3.2+ Data.define gives immutable value classes; replaces Struct for value types. `version`
- Pattern matching (`case/in`) is stable since 3.0; `in {a:, **rest}` destructures hashes and arrays. `version`
- YJIT (Ruby 3.1+, Shopify) gives ~25-40% throughput in production Rails; enabled by `--yjit`. `perf`
- Symbols are interned strings — same identity across the program; use as hash keys (slightly faster than strings). `perf`
- `freeze` makes a string immutable; frozen string literals (`# frozen_string_literal: true`) save an allocation per literal. `perf`
- Block vs lambda: `return` inside a block returns from the enclosing method; inside a lambda it returns from the lambda only. `gotcha`
- `proc` and `Proc.new` are block-like (loose arity, return-through-method); `lambda` is method-like (strict arity, local return). `gotcha`
- Floats are IEEE 754 doubles; BigMath/BigDecimal for money. Never use Float for currency. `gotcha`
- `==` compares value (calls `eql?`); `equal?` tests identity. Symbols: `:a == :a` and `:a.equal?(:a)` are both true. `gotcha`
- Common style: 2-space indent, no semicolons, snake_case for vars/methods, CamelCase for classes/modules. `style`
- Rubocop with rubocop-rails/rubocop-rspec is the de-facto linter; `rubocop -A` auto-corrects. `style`
- Bundler + Gemfile.lock pin versions; `bundle exec` ensures the right gem set is loaded. gems.rb is the modern filename. `style`

## Go Deeper

- [Ruby Documentation — ruby-doc.org](https://ruby-doc.org/) — Official core/stdlib API reference, per-version.
- [Programming Ruby (Pickaxe) — Pragmatic Bookshelf](https://pragprog.com/titles/ruby5/programming-ruby-3-3-5th-edition/) — The canonical Ruby book; the language tour and metaprogramming chapters are essential.
- [Ruby Spec — The ruby/spec suite](https://github.com/ruby/spec) — Executable specification of Ruby semantics — the ground truth when docs disagree.
- [Rails Guides — Ruby on Rails](https://guides.rubyonrails.org/) — Rails is where most Ruby engineers live; the guides double as an idiomatic Ruby primer.
- [Practical Object-Oriented Design in Ruby (Sandi Metz)](https://www.poodr.com/) — Best treatment of OOP design (duck typing, message passing) in a Ruby-flavored voice.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Integer | Arbitrary-precision integer — no overflow; Fixnum/Bignum unified since 2.4. | Counting, IDs, money cents. Use BigDecimal for fractional money. |
| Float | IEEE 754 double — same caveats as every other language. | Scientific math. Never for currency — use BigDecimal or Integer cents. |
| String | Mutable by default; encodings (UTF-8 default since 2.0). freeze for immutability. | All text. Use Symbol for interned identifiers. |
| Symbol | Interned immutable string — same object identity across the program. | Hash keys, method names, enum-like values. 'foo' == :foo is false. |
| nil (NilClass) | Singleton null. Falsy. Every value has a class — nil.to_s == ''. | Absence. nil? is the safe check; !!x to coerce to bool. |
| true / false (TrueClass / FalseClass) | Singletons — each is its own class, not a Bool class. | Logic. && and \|\| return the operand, not a bool. |
| Range | (1..5) inclusive, (1...5) exclusive. Lazy-iterable; can be endless ((1..)). | Iteration, slicing, interval tests: (1..10).cover?(x). |
| Regexp | Compiled regex literal /pat/ — first-class object with match semantics. | Parsing, validation. Use String#match? for boolean checks (~3x faster). |
| BigDecimal | Arbitrary-precision decimal — no float rounding error. | Money, interest calculations. require 'bigdecimal'. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Array<T> | Dynamic array — O(1) push/pop, O(n) insert at front. | Ordered, indexable, mutable sequences. The workhorse. |
| Hash<K,V> | Insertion-ordered hash map (since 1.9) — O(1) avg lookup/insert. | Keyed lookups, JSON, config. Default proc allows auto-vivification. |
| Set<T> | Hash-backed set — O(1) membership, no duplicates. require 'set'. | Dedup, membership, set algebra (\| & - ^). |
| Struct | Mutable value class generated from field list — subclass of Array-like accessor. | Quick DTOs; prefer Data.define for immutable value types in 3.2+. |
| Data.define(:x, :y) | Immutable value class with keyword init + equality (3.2+). | Value types, DTOs. The modern replacement for Struct. |
| Enumerator::Lazy | Lazy stream — only computes on demand. [1..].lazy.map { ... }.first(5). | Infinite sequences, large pipelines without materializing. |
| Queue / SizedQueue | Thread-safe FIFO — required.require 'thread'. SizedQueue bounds. | Producer/consumer across threads. Closed in 2.7+ for sentinel shutdown. |
| OpenStruct | Hash-like object with attribute accessors defined on the fly. | Quick scripts only — slow due to method_missing; avoid in hot paths. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class C < Base; end | Single inheritance + module mixins (include / extend / prepend). | Standard OO. Use modules for shared behavior; prepend to wrap methods. |
| module M; end | Namespace + mixin — cannot be instantiated; included into classes. | Sharing behavior, namespacing, module functions. |
| Struct.new(:a, :b) | Generates a mutable value class with accessors + equality. | Quick DTOs; superseded by Data.define for immutable cases. |
| Data.define(:a, :b) | Immutable keyword-init value class (3.2+). | Modern value types. Subclass-able for adding methods. |
| class C include Comparable; def <=>(o); end; end | Gets <, >, ==, between? for free from a single <=> definition. | Natural ordering of value types. |
| class C include Enumerable; def each; ...; end; end | Gets map, select, reduce, sort, etc. for free from each. | Custom collections; the heart of Ruby's iteration protocol. |
| class C < Struct.new(...) | Anti-pattern — subclassing Struct creates a hidden intermediate class. | Avoid. Use composition or Data.define with a regular subclass. |
| T::Types::Simple | Sorbet type annotations (gem 'sorbet-runtime') — runtime-checked types. | Static-typing fans in big Ruby codebases; Stripe/Shopify use heavily. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b | Arithmetic — / on integers is floor division; on Float, true division. | Math. Integer / Integer == Integer (5/2 == 2). Use 5.0/2 for true division. |
| a % b, a ** b, a.divmod(b) | Modulo, power, [quotient, remainder] tuple. | divmod is cleaner than separate / and %; power uses BigDecimal for huge exponents. |
| a == b, a != b | Value equality — calls ==. Strings, symbols, numbers, arrays compare by value. | Default comparisons. Override == carefully — must match hash and eql?. |
| a.equal?(b) | Identity — same object_id. Rare; use to detect shared refs. | Almost never in business code; useful for sentinel detection. |
| a.eql?(b) | Strict equality — used by Hash. 1 == 1.0 is true; 1.eql?(1.0) is false. | Override eql? whenever you override == and use the class as a Hash key. |
| a <=> b | Spaceship — returns -1, 0, 1, or nil (incomparable). Powers Comparable mixin. | Sorting, ranges, custom ordering. nil propagates: nil <=> x == nil. |
| a < b, a > b, a <= b, a >= b | Comparison — derived from <=> via Comparable mixin. | Need Comparable mixed in to use these on custom classes. |
| a && b, a \|\| b, !a | Short-circuit boolean — returns the operand, not a bool. | Default values: x = a \|\| default. Truthiness check. |
| and, or, not | Low-precedence boolean — DO NOT use for logic. | Almost never. Use && / \|\|; 'and'/'or' have lower precedence than =. |
| cond ? a : b | Ternary — only one branch evaluated. | Concise conditional expression; avoid nesting. |
| a & b, a \| b, a ^ b | Bitwise AND/OR/XOR — on Integers and Arrays (set ops). | Bit flags (Integer) or set algebra (Array). Set class is clearer for sets. |
| ~a, a << n, a >> n | Bitwise NOT, left/right shift. | Low-level bit ops; rare in business code. |
| a in pattern | Pattern match (3.0+) — true if pattern matches; raises NoMatchingPatternError otherwise. | Rightward pattern match: case expr; in Pattern; end is preferred for branches. |
| a..b, a...b | Range literal — inclusive / exclusive of endpoint. | Iteration, slicing, interval membership: (1..10).cover?(x). |
| defined?(x) | Returns a string describing x if defined, nil otherwise. | Optional feature detection: 'defined?(Rails)'. Safer than begin/rescue NameError. |

## Input / Output

**File I/O — small (read all) vs large (stream)**

```ruby
# Small file — read all at once
text = File.read("small.txt", encoding: "utf-8")
bytes = File.binread("data.bin")

# Large file — stream line by line (File.foreach yields each line)
File.foreach("huge.csv", encoding: "utf-8") do |line|
  process(line.chomp)
end

# Even better for CSVs — the stdlib CSV module streams:
require "csv"
CSV.foreach("huge.csv", headers: true) do |row|
  yield row["col"]
end

# Block form auto-closes the file handle:
File.open("log", "a") { |f| f.puts("hello") }
```

**stdin / stdout / stderr — pipes and CLI tools**

```ruby
# Stream stdin line by line (memory-friendly)
STDIN.each_line do |line|
  STDOUT.puts line.upcase
end

# Read all of stdin at once
data = STDIN.read

# Print to stderr without buffering surprises
STDERR.puts "warning: deprecated"
STDERR.flush

# JSON over stdin/stdout — the standard CLI interop pattern
require "json"
payload = JSON.parse(STDIN.read)
result = transform(payload)
STDOUT.puts JSON.generate(result)
```

**JSON / YAML / Marshal — serialization tiers**

```ruby
require "json", "yaml"

# JSON — text, portable, the default
File.write("cfg.json", JSON.pretty_generate({ k: 1, list: [1, 2] }))
cfg = JSON.parse(File.read("cfg.json"), symbolize_names: true)

# YAML — config files; Rails config/*.yml, docker-compose
data = YAML.load_file("config.yml", aliases: true)  # safe_load for untrusted

# Marshal — Ruby-specific, FAST, UNSAFE for untrusted data
File.binwrite("state.bin", Marshal.dump(model))
model = Marshal.load(File.binread("state.bin"))  # NEVER on untrusted input

# CSV — use the stdlib CSV module, not str.split
require "csv"
rows = CSV.read("data.csv", headers: true).map(&:to_h)
```

**HTTP client (sync Net::HTTP) with retries**

```ruby
require "net/http"
require "uri"
require "json"

def get_json(url, retries: 3)
  uri = URI(url)
  attempts = 0
  begin
    attempts += 1
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                          read_timeout: 10, open_timeout: 5) do |http|
      http.get(uri.request_uri, "Accept" => "application/json")
    end
    raise "HTTP #{res.code}" unless res.is_a?(Net::HTTPSuccess)
    JSON.parse(res.body, symbolize_names: true)
  rescue => e
    raise if attempts >= retries
    sleep 0.5 * (2 ** (attempts - 1))  # exponential backoff
    retry
  end
end

# Production: prefer the 'httparty' or 'faraday' gems for ergonomics.
```

## Loops & Iteration

**each / map / each_with_index — the holy trinity**

```ruby
items = ["a", "b", "c"]
scores = [10, 20, 30]

# each — pure side effects
items.each { |item| puts item }

# each_with_index — index + value (replaces Python's enumerate)
items.each_with_index { |item, i| puts "#{i}: #{item}" }

# zip — parallel iteration (stops at shortest)
items.zip(scores).each { |item, score| puts "#{item}: #{score}" }

# Don't use 'for x in items do' — it's a wrapper around each that
# leaks the loop variable. Use each directly.
```

**map / select / reduce — the functional trinity**

```ruby
nums = (1..10).to_a

# map — transform each element (Python: list comprehension)
squares = nums.map { |n| n * n }

# select / reject — filter (Python: [x for x in ... if ...])
evens = nums.select(&:even?)
odds  = nums.reject(&:even?)

# reduce / inject — fold left
sum      = nums.reduce(0) { |acc, n| acc + n }
# Or with the symbol shorthand:
sum      = nums.sum              # 2.4+ — faster, native
max_pair = nums.each_cons(2).max_by { |a, b| b - a }

# chainable — readable pipelines
nums.select(&:even?).map { |n| n ** 2 }.sum
```

**while / until / loop — explicit loops (rare in idiomatic Ruby)**

```ruby
# while — runs while condition is true
n = 0
while n < 10
  break if found(n)
  n += 1
end

# until — runs while condition is false (cleaner than 'while not')
until queue.empty?
  process(queue.shift)
end

# loop { } — infinite loop; break explicitly
loop do
  item = queue.pop(timeout: 5) or break
  process(item)
end

# begin/end while — runs body at least once (do-while)
begin
  result = try_once
end while result == :retry
```

**Enumerable — production iteration patterns**

```ruby
# chunk — group adjacent runs by a key
require "csv"
CSV.foreach("log.csv", headers: true).chunk { |r| r["date"] }.each do |date, rows|
  puts "#{date}: #{rows.size} rows"
end

# group_by — global grouping (returns a Hash)
(1..10).group_by(&:even?)  # => {false=>[1,3,5,7,9], true=>[2,4,6,8,10]}

# each_slice / each_cons — sliding window + chunking
(1..10).each_slice(3) { |batch| process(batch) }  # [1,2,3] [4,5,6] [7,8,9] [10]
(1..5).each_cons(2).to_a  # => [[1,2],[2,3],[3,4],[4,5]]

# lazy — infinite sequences
primes = (2..).lazy.select { |n| (2...n).none? { |d| n % d == 0 } }
primes.first(10)  # => [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
```

## Functions & Callables

**Positional, keyword, splat, double-splat, block**

```ruby
def f(a, b = 10, *rest, key:, flag: false, **opts, &block)
  # a         : required positional
  # b         : optional positional (with default)
  # rest      : extra positional as Array
  # key:      : required keyword arg (3.0+)
  # flag:     : optional keyword arg
  # opts      : extra keywords as Hash
  # block     : the implicit block converted to a Proc
  [a, b, rest, key, flag, opts, block&.call]
end

f(1, 2, 3, 4, key: "k", extra: "x") { 99 }
# => [1, 2, [3, 4], "k", false, { extra: "x" }, 99]

# Ruby 3.0+: keyword args are NOT auto-splatted from a trailing Hash
# f({ key: "k" })  # WRONG — pass f(key: "k") directly
```

**Blocks, procs, lambdas — the three callable flavors**

```ruby
# Block — implicit closure passed after a call; yield invokes it
def each_double(arr)
  arr.each { |x| yield x * 2 }
end
each_double([1, 2, 3]) { |n| puts n }   # 2 4 6

# Proc — explicit closure; loose arity (extra args are nil); return exits caller
p = Proc.new { |x, y| puts "#{x}/#{y}" }
p.call(1)        # works — y is nil
p.call(1, 2, 3)  # works — extra args ignored

# Lambda — strict arity; return exits the lambda only
l = lambda { |x, y| x + y }
# l.call(1)  # ArgumentError — wrong number of arguments
l.(2, 3)        # => 5  (the .() shorthand for .call)

# Arrow lambda (1.9+): ->(a, b) { a + b }
add = ->(a, b) { a + b }
add.(2, 3)  # => 5
```

**Method objects + currying + composition**

```ruby
# method(:name) — wraps an existing method as a callable
greeting = method(:puts)
greeting.("hi")  # calls puts("hi")

# curry — partial application
multiply = ->(a, b, c) { a * b * c }
double = multiply.curry[2]
triple = multiply.curry[3]
double[5, 10]   # => 100
triple[5, 10]   # => 150

# Function composition (2.6+): << and >>
shout = ->(s) { s.upcase }
bang  = ->(s) { s + "!" }
shout_then_bang = bang << shout  # right-to-left: bang(shout(x))
shout_then_bang.("hello")  # => "HELLO!"

# Bang_then_shout = bang >> shout would be shout(bang(x))
```

**Endless + anonymous block args (3.0+)**

```ruby
# Endless method def — single-expression methods (3.0+)
def greet(name) = "Hello, #{name}"
def double(x) = x * 2

# Anonymous block forwarding (3.1+): & without naming the block
def each_emitted(arr, &)
  arr.each(&)
end
each_emitted([1, 2, 3]) { |n| puts n }

# Numbered block parameters (2.7+) — useful for one-liners
[1, 2, 3].map { _1 * 2 }   # => [2, 4, 6]
{ a: 1, b: 2 }.each { puts "#{_1}=#{_2}" }
```

## Error Handling

**begin / rescue / else / ensure — the full shape**

```ruby
# Complete form: begin / rescue / else / ensure
begin
  result = do_risky
rescue SpecificError => e
  handle(e)              # bind the exception to e
rescue OtherError, ThirdError
  fallback               # multiple types in one clause
rescue StandardError => e
  warn "unexpected: #{e.class}: #{e.message}"
  raise                  # re-raise
else
  # Runs ONLY if no exception was raised — keeps begin block small
  persist(result)
ensure
  # ALWAYS runs — cleanup, even on return/break/next
  cleanup
end
```

**raise + custom exception hierarchy**

```ruby
class AppError < StandardError; end
class ValidationError < AppError; end
class NotFoundError < AppError; end

def find_user(id)
  raise NotFoundError, "user #{id} not found" unless exists?(id)
  load(id)
end

# raise without explicit class raises RuntimeError
raise "something went wrong"

# raise with a custom message + cause tracking (chained exceptions):
def parse(raw)
  Integer(raw)
rescue ArgumentError => e
  raise ValidationError, "bad input: #{raw.inspect}"
  # The original ArgumentError is automatically set as #cause
  # (no 'from' keyword needed — Ruby chains implicitly since 2.1)
end
```

**retry + ensure-based resource cleanup**

```ruby
# retry re-runs the entire begin block — useful for transient failures
attempts = 0
begin
  attempts += 1
  fetch_with_random_failure
rescue NetworkError => e
  raise if attempts >= 3
  sleep 0.5 * (2 ** (attempts - 1))
  retry  # jumps back to the top of the begin block
end

# Block-based resource cleanup (the File.open idiom)
def with_connection
  conn = acquire
  begin
    yield conn
  ensure
    conn.close  # ALWAYS runs, even on exception
  end
end

with_connection { |c| c.query("SELECT 1") }
```

**Result pattern via Dry-Monads (typed, explicit)**

```ruby
require "dry-monads"
include Dry::Monads[:result, :maybe]

def divide(a, b)
  return Failure(:div_by_zero) if b.zero?
  Success(a / b)
end

# Pattern-match on the result — Ruby 3.0+ case/in
case divide(10, 0)
in Success(value)
  puts "got #{value}"
in Failure(:div_by_zero)
  puts "cannot divide by zero"
in Failure(code)
  puts "unknown error: #{code}"
end

# Or use the functional helpers
divide(10, 2).fmap { |v| v * 10 }     # Success(50)
divide(10, 0).fmap { |v| v * 10 }     # Failure(:div_by_zero) — short-circuits
```

## Concurrency Model

**Threads + Mutex — GVL-serialized, I/O-friendly**

```ruby
# MRI has a GVL — only one thread runs Ruby bytecode at a time,
# but I/O releases it (so threads work for I/O-bound work).
results = []
mutex   = Mutex.new

threads = urls.map do |url|
  Thread.new do
    body = fetch(url)
    mutex.synchronize { results << body }
  end
end
threads.each(&:join)

# CPU-bound threads serialize on the GVL — no real parallelism.
# Use Ractors (3.0+) for true parallel CPU work.
```

**Ractor — true parallel CPU work, share-nothing (3.0+)**

```ruby
# Ractors are isolated — messages are deep-copied or moved.
# They run in parallel across cores without GVL contention.
ractors = 8.times.map do |i|
  Ractor.new(i) do |idx|
    sum = 0
    (1..1_000_000).each { |n| sum += n * idx }
    sum
  end
end

# .map(&:take) blocks until each Ractor returns its value.
results = ractors.map(&:take)
puts results.sum
# ~4-6x speedup on multi-core for pure CPU work.

# Send messages in: ractor.send(obj); take out: ractor.take.
# Ractor.new receives the first arg via the block: |first_arg|
```

**Fiber — cooperative coroutine, manual scheduling**

```ruby
# Fibers are cooperative coroutines — you resume them manually.
# They are the building block for async frameworks (Async gem).
fiber = Fiber.new do |x|
  puts "got first: #{x}"
  y = Fiber.yield(x * 2)    # pause, return x*2 to caller
  puts "got second: #{y}"
  Fiber.yield(x + y)
end

puts fiber.resume(10)        # "got first: 10" => 20
puts fiber.resume(30)        # "got second: 30" => 40

# Async gem wraps Fibers into a real scheduler — looks like async/await:
require "async"
Sync do
  tasks = urls.map { |u| Async { fetch(u) } }
  results = tasks.map(&:wait)
end
```

**Queue — bounded producer/consumer with backpressure**

```ruby
require "thread"

# SizedQueue is bounded — puts block when full (backpressure)
queue = SizedQueue.new(100)
stop  = false

# Producers
producers = 2.times.map do
  Thread.new do
    source.each { |item| queue << item }
  end
end

# Consumers
consumers = 4.times.map do
  Thread.new do
    until stop
      item = queue.pop(true) rescue Thread.exit
      process(item)
    end
  end
end

producers.each(&:join)
stop = true
# Queue#close (2.7+) is the cleaner sentinel: queue.close; consumers
# then get nil from queue.pop and exit naturally.
```

## Testing Patterns

**RSpec — the de-facto Ruby test framework**

```ruby
RSpec.describe User, type: :model do
  # let is lazy + memoized per test
  let(:user) { User.new(email: "a@b.io") }

  # subject is implicit — described_class.new by default
  subject { user }

  it "is valid with a real email" do
    expect(user).to be_valid
  end

  # Parametrized via shared examples or 'it' with multiple cases
  context "with an invalid email" do
    let(:user) { User.new(email: "nope") }
    it { is_expected.to be_invalid }
    it "includes the email in errors" do
      user.valid?
      expect(user.errors[:email]).to include("is invalid")
    end
  end
end

# Run: rspec spec/models/user_spec.rb
# Run a single test by line: rspec spec/user_spec.rb:42
```

**Minitest — stdlib, fast, no magic**

```ruby
require "minitest/autorun"

class TestUser < Minitest::Test
  def setup
    @user = User.new(email: "a@b.io")
  end

  def test_validates_email
    assert @user.valid?
    assert_equal "a@b.io", @user.email
  end

  def test_rejects_bad_email
    @user.email = "nope"
    refute @user.valid?
    assert_includes @user.errors[:email], "is invalid"
  end

  # Spec-style is also supported:
  # describe User do
  #   it "validates email" do ... end
  # end
end
```

**Mocks & stubs — RSpec doubles**

```ruby
# Double — test double for any collaborator
mailer = double("Mailer")
allow(mailer).to receive(:send_welcome).and_return(true)

UserService.new(mailer: mailer).create(email: "x@y.io")
expect(mailer).to have_received(:send_welcome).with("x@y.io")

# Stub a method on a real class (restores after the test)
allow(User).to receive(:find).with(1).and_return(user)

# Spy — record calls without specifying behavior upfront
spy = spy("Logger")
UserService.new(logger: spy).call
expect(spy).to have_received(:info).at_least(:once)

# Verify doubles: verifying_double raises if the underlying method
# doesn't exist on the real class — catches drift between tests and code.
# Use 'instance_double(User)' instead of 'double' in modern RSpec.
```

**Coverage + parallel test config**

```ruby
# Gemfile
# gem "simplecov", require: false, group: :test
# gem "parallel_tests"

# spec/spec_helper.rb — run BEFORE requiring your app:
require "simplecov"
SimpleCov.start do
  add_filter "/spec/"
  add_filter "/vendor/"
  add_group "Models", "app/models"
  add_group "Services", "app/services"
  minimum_coverage 85
  minimum_coverage_by_file 70
end

# Run tests in parallel across N cores:
#   bin/rake parallel:spec[N]
# CI: run with RSPEC_FORMATTER=json for machine-readable output.
```

## Performance Tuning

- YJIT (Ruby 3.1+, Shopify) gives ~25-40% throughput in production Rails; enabled by --yjit, on by default in 3.3+.
- Frozen string literals (# frozen_string_literal: true magic comment) save an allocation per literal — significant in hot paths.
- Symbols are interned and never GC'd pre-2.2; modern Ruby GCs them, but creating millions of unique symbols still leaks memory.
- String#match? is ~3x faster than String#=~ for boolean checks (avoids MatchData allocation).
- Array#sum (2.4+) is C-native — 5-10x faster than reduce(:+) for numerics.
- Hash lookup is O(1) avg but slower than Array index; for fixed-size value types, Struct/Data.define is faster and uses less memory.
- Avoid OpenStruct in hot paths — every method call goes through method_missing; use Data.define or Struct for new code.
- GC is generational and incremental since 2.1; tune via RUBY_GC_HEAP_INIT_SLOTS and friends for boot-heavy workloads.
- Tail-call optimization is supported but disabled by default; enable with RubyVM::InstructionSequence.compile_option = { tailcall_optimization: true }.
- Fibers cost ~1KB each vs Threads ~1MB; the Async gem runs 100k+ fibers per process easily.
- Ractor message passing deep-copies — passing a 100MB object is slow. Use Ractor.make_shareable or move semantics.
- signal_usage.rb / memory_profiler / derailed_benchmarks are the standard memory profilers; stackprof for CPU.
- Bootsnap caches YAML/Marshal loads — cuts Rails boot time by ~50% in dev. Default in Rails since 5.2.
- Avoid String concatenation in loops: 's += a' allocates a new String each call. Use s << a (in-place) or Array#join.
- JRuby is ~2-5x faster than MRI for CPU-bound code (JIT to JVM bytecode); TruffleRuby is ~10x on hot loops but slower boot.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Bundler](https://bundler.io/) | Dependency manager — pins Gemfile.lock, 'bundle exec' isolates the gem set. | package |
| [RubyGems](https://rubygems.org/) | The package publishing system; 'gem install/push'. Bundler sits on top. | package |
| [Rake](https://ruby.github.io/rake/) | Make-like task runner — Rakefile with task :name do ... end. | build |
| [RSpec](https://rspec.info/) | BDD-style test framework — describe/it/expect. The dominant choice. | test |
| [Minitest](https://github.com/minitest/minitest) | Stdlib xUnit+spec framework — fast, no magic, ships with Ruby. | test |
| [RuboCop](https://rubocop.org/) | Linter + formatter — rubocop-rails/rubocop-rspec add framework rules. | lint |
| [StandardRB](https://github.com/standardrb/standard) | Opinionated RuboCop config with no customization — 'the Standard way'. | lint |
| [Pry](https://pry.github.io/) | REPL + debugger — binding.pry sets a breakpoint; better than irb. | debug |
| [Ruby LSP](https://github.com/Shopify/ruby-lsp) | Shopify's language server — VS Code integration, type-aware completion. | lint |
| [Sorbet](https://sorbet.org/) | Stripe's gradual type system — static + runtime-checked types. | lint |
| [Rails](https://rubyonrails.org/) | Full-stack web framework — MVC, ORM, mailers, jobs, the dominant choice. | build |
| [Sinatra](https://sinatrarb.com/) | Micro web framework — minimal DSL for small APIs and dashboards. | build |
| [Sidekiq](https://sidekiq.org/) | Background job processor — Redis-backed, ~10x throughput of DelayedJob. | build |
| [ActiveRecord](https://guides.rubyonrails.org/active_record_basics.html) | ORM — migrations, associations, validations. The Rails default. | build |
| [Puma](https://puma.io/) | Threaded app server — multi-process + multi-thread (Ractor support in 6+). | deploy |
| [Bootsnap](https://github.com/Shopify/bootsnap) | Boots Ruby/Rails faster by caching YAML/Marshal/compile artifacts. | perf |
| [StackProf](https://github.com/tmm1/stackprof) | Sampling CPU profiler — production-safe, low overhead, flamegraph output. | debug |
| [Async](https://github.com/socketry/async) | Fiber-based async framework — looks like sync code, scales to 100k+ connections. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 1995 | First public release — classes, modules, iterators, blocks. |
| 1.8 | 2003 | Long-lived series — added YAML, bundled gems, Oniguruma regex. EOL 2013. |
| 1.9 | 2007 | YARV bytecode VM (~5x faster), block-local vars, encoding support. |
| 2.0 | 2013 | Keyword arguments, Module#prepend, lazy enumerators, %i() literals. |
| 2.1 | 2013 | Rational/Complex literals, required keyword args, generational GC. |
| 2.3 | 2015 | Safe navigation &., frozen string literals pragma, did_you_mean gem. |
| 2.4 | 2016 | Fixnum/Bignum unified into Integer, String#match?, Hash#transform_values. |
| 2.5 | 2017 | rescue/else/ensure inside do...end blocks, performance improvements. |
| 2.6 | 2018 | JIT (MJIT) experimental, endless range (1..), Hash#merge with block. |
| 2.7 | 2019 | Pattern matching (experimental), numbered params _1, Fiber.scheduler, warning on kwarg separation. |
| 3.0 | 2020 | Ractor for parallelism, RBS + TypeProf type tools, pattern matching stable, kwargs fully separated. |
| 3.1 | 2021 | YJIT (Shopify, opt-in), anonymous block forwarding &, Hash#except. |
| 3.2 | 2022 | Data.define immutable value class, Regexp timeout, WASI support, YJIT prod-ready. |
| 3.3 | 2023 | YJIT enabled by default, M:N thread scheduler (experimental), Prism parser. |
| 3.4 | 2024 | Prism becomes default parser, modular GC (you can swap Shoelace/Hash tracking), chilled-strings deprecation warnings. |
| 4.0 | 2025 | Ruby Box (experimental monkey-patch isolation), ZJIT compiler (YJIT successor), Ractor::Port, Pathname and Set promoted to core classes. |

## Interview Hot Questions

1. **What's the difference between a block, a proc, and a lambda?** *(medium)*

   A block is an implicit closure passed after a method call (yield invokes it; you can't assign it to a variable directly). A Proc is an explicit closure with loose arity (extra args become nil) and 'return' exits the enclosing method. A lambda is a strict-arity closure where 'return' exits only the lambda — method-like. Use blocks for the common iteration case, lambdas when you store the callable or need strict arity.

2. **Explain include vs extend vs prepend.** *(medium)*

   include adds a module's methods as instance methods of the class (below the class in the ancestor chain). extend adds them as class/singleton methods. prepend inserts the module ABOVE the class in the ancestor chain — so the module's method runs first and can call super to reach the class's original. Use prepend for wrapping/decorating existing methods (e.g., adding logging without modifying the original).

3. **Why are mutable default arguments less of a footgun in Ruby than Python?** *(medium)*

   Ruby doesn't have default-argument evaluation semantics like Python — defaults in Ruby are re-evaluated per call (they're expressions in the method body's signature line), so 'def f(x = [])' creates a fresh array each call. Python evaluates defaults once at def-time, which is the classic mutable-default trap. The Ruby equivalent gotcha is sharing state via class variables (@@var) or class instance vars.

4. **What does the GVL (Giant VM Lock) mean for Ruby concurrency?** *(medium)*

   The GVL is a mutex in MRI that allows only one Ruby thread to execute bytecode at a time. I/O releases it (so threads work for network/disk parallelism), but CPU-bound threads serialize. Ractor (3.0+) bypasses the GVL by isolating each Ractor with its own heap — true CPU parallelism at the cost of no shared mutable state. JRuby and TruffleRuby have no GVL.

5. **Explain the difference between ==, eql?, and equal?.** *(easy)*

   equal? tests object identity (same object_id) — never override it. == is value equality (override this); it's the operator used by 'case' and most code. eql? is strict equality used by Hash and Set — 1 == 1.0 is true, but 1.eql?(1.0) is false. If you override ==, also override eql? and hash so your class behaves correctly as a Hash key.

6. **How does Ruby's method lookup work with modules?** *(hard)*

   Ruby walks the ancestor chain: class → included modules (in reverse inclusion order) → superclass → its modules → ... → Object → Kernel → BasicObject. prepend puts a module ABOVE the class. super walks one step up this chain. 'ancestors' returns the chain. Method resolution caches per-class, so monkey-patching a module invalidates the cache globally — a perf cost of monkey-patching.

7. **What's the difference between Symbol and String?** *(easy)*

   Symbols are interned immutable strings — each unique symbol exists once in memory with the same object_id across the program. Strings are mutable (pre-free) and allocate fresh per literal. Use symbols for hash keys, method names, enum-like values; use strings for user data. Since 2.2 symbols can be GC'd (the old 'symbol leak' gotcha is mostly gone), but creating millions of unique symbols still costs memory.

8. **Explain Ruby 3.0's keyword argument separation.** *(medium)*

   Pre-3.0, a trailing Hash was auto-splatted into keyword args: f({a: 1}) == f(a: 1). 3.0 split them — f({a: 1}) is a positional arg, f(a: 1) is keyword. The migration pain led to the 2.7 deprecation warnings. To forward arbitrary kwargs: def f(**kw) = other(**kw). Run with -W:deprecated in 2.7 to find call sites during migration.

9. **How does meta-programming work in Ruby?** *(hard)*

   Classes are open — you can add methods at runtime via define_method, class_eval, instance_eval. send lets you call any method including private ones. method_missing intercepts unknown calls (used by ActiveRecord find_by_name, OpenStruct). The cost: performance (method_missing is slow), and surprising behavior when names collide. Use refinements (module M; refine String do ... end; end; using M) to scope monkey-patches lexically instead of globally.

10. **What is a Fiber and when would you use one?** *(medium)*

   A Fiber is a cooperative coroutine — you resume it manually, it runs until Fiber.yield, then pauses. They're cheap (~1KB) so you can have 100k+ in a process. They're the building block for async frameworks like Async and Polyphony. The 3.0+ Fiber#scheduler interface lets non-blocking I/O automatically yield to the scheduler, making async code look like sync code (similar to JS async/await but without the keyword).

## When to Choose This

- **vs Python:** use this — Web backends with Rails' conventions, internal DSLs (Rake, Capistrano), when blocks read more naturally than indentation.; use that — Data science / ML, scientific computing, scripting with broad library reach, anywhere NumPy/Pandas/PyTorch are the actual product.
- **vs Node.js / JavaScript:** use this — Server-only backends where you prefer OOP + blocks over async/await chains, when Rails' batteries-included beats npm assembly.; use that — Realtime web apps, SSR, isomorphic code, anything that benefits from npm's ecosystem and JS's ubiquity.
- **vs Go:** use this — Quick prototyping, web frameworks with strong conventions (Rails), DSLs, when developer ergonomics beat raw throughput.; use that — High-throughput microservices, network daemons, ops tooling, single-binary deployment, anywhere CPU matters more than syntax.
- **vs Elixir:** use this — Standard request/response web apps (Rails), teams with Ruby expertise, when the ecosystem (gems) matters more than concurrency model.; use that — Realtime / high-concurrency systems (chat, gaming), anywhere BEAM's process model and hot code reload are the differentiator.
- **vs PHP:** use this — Long-lived stateful services, background jobs (Sidekiq), teams wanting a richer language model (blocks, metaprogramming).; use that — Self-hosted web backends with cheap hosting, content sites, when shared-nothing model + opcache-fast boot matters more than DSLs.

