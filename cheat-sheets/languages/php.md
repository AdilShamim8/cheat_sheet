# PHP

**Category:** Languages · **Tier:** Tier 2 · Domain · **Tags:** dynamic, interpreted, web, backend, laravel, scripting, shared-nothing · **First released:** 1995 · **Author:** Rasmus Lerdorf · **Last updated:** 2026-11

> Web-first dynamic language powering ~75% of the web — shared-nothing request model, opcache-fast, with Laravel as the dominant framework.

---

## TL;DR

- PHP is a dynamically-typed, garbage-collected language purpose-built for HTTP request/response cycles — each request runs in a fresh process/script context (shared-nothing), which makes horizontal scaling trivial and state leaks rare.
- Modern PHP (8.x) has first-class types (union, intersection, readonly, enums), named args, attributes, fibers, and a JIT — it's closer to a typed language with escape hatches than to the 5.x era people remember.
- Reach for PHP when you need a self-hosted web backend with cheap hosting, fast bootstrap, and a massive ecosystem (Laravel, Symfony, WordPress, Composer); it remains the pragmatic default for content sites, SMB backends, and e-commerce.
- Avoid PHP for long-running daemons (despite FrankenPHP/RoadRunner), browser code, native binaries, or CPU-bound numerics — the shared-nothing model fights stateful workloads and the JIT only helps CPU-heavy paths.

## Core Mental Model

**A request is a script lifecycle; everything dies when it returns.** Each HTTP request boots PHP, loads classes (cached by opcache across requests), runs your handler, and dies — $_SESSION is a serialized blob, the DB connection is reopened unless you use an external pooler. This shared-nothing model is why PHP scales horizontally by just adding Apache/PHP-FPM workers: no in-process state to coordinate. Modern PHP adds long-running modes (Octane, RoadRunner, FrankenPHP, Swoole) which keep the worker alive across requests — then you suddenly have to worry about memory leaks, statics, and singleton DB connections, just like in Node/Go. Knowing which mode you're in determines whether `static $cache = []` is a great optimization or a leak.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| function f(int $x, ?string $s = null): User | Typed function with nullable param and return type. | Default for all new code; PHP 7+ enforces at runtime. |
| function f(int\|float $x): User\|false | Union types — caller gets one of N types. | PHP 8.0+; pair with `match` for branching by type. |
| function f(User&JsonSerializable $u) | Intersection type — must implement both. | PHP 8.1+; rare but precise for DI constraints. |
| readonly public int $id | Property set once (in ctor) and immutable thereafter. | PHP 8.1+; value objects, DTOs. |
| enum Suit: string { case Hearts = 'h'; } | Native enums with backing value — first-class enumerated type. | PHP 8.1+; replaces the old 'const on a class' pattern. |
| class C { public function __construct(   private readonly int $id, ) {} } | Constructor promotion — declares, assigns, and exposes props in one line. | Default for value-like classes since 8.0. |
| match($x) { 1, 2 => 'low', default => 'other' } | Strict expression-based switch — returns value, no fallthrough. | PHP 8.0+; replaces switch where you want a value. |
| ?-> and ?? | Nullsafe method call and null-coalescing. | Optional chains through object graphs; `??` for defaults. |
| #[Route('/users', methods: ['GET'])] | Native attributes — structured metadata on classes/methods. | PHP 8.0+; replaces docblock annotations for routing/DI. |
| Fiber::fn(fn() => yield $x) | Cooperative coroutine — manual scheduling, no preemption. | PHP 8.1+; async I/O frameworks (Revolt, ReactPHP, Amp). |
| interface I<T> { /** @template T */ } | Generics via psalm/phpstan docblocks — not runtime-enforced. | Always annotate; pair with PHPStan/Psalm in max level. |
| try / catch (SpecificEx \| OtherEx $e) | Multi-catch with typed exception union. | Grouping exceptions with shared handling. |

## Idiomatic Patterns

**Modern readonly DTO with enum + constructor promotion**

```php
<?php
declare(strict_types=1);

namespace App\Domain;

enum Role: string {
    case Admin = 'admin';
    case Member = 'member';
}

final class User
{
    public function __construct(
        public readonly int $id,
        public readonly string $email,
        public readonly Role $role = Role::Member,
        /** @var list<string> */
        public readonly array $tags = [],
    ) {}

    public function withEmail(string $email): self
    {
        return new self($this->id, $email, $this->role, $this->tags);
    }
}

$u = new User(id: 1, email: 'a@b.io', role: Role::Admin);
echo match($u->role) {
    Role::Admin  => 'admin user',
    Role::Member => 'regular user',
};
```

**Attributes + reflection — the modern DI/router pattern**

```php
<?php
#[
    \App\Routing\Route(path: '/users/{id}', methods: ['GET']),
    \App\Middleware\Auth(required: true),
]
public function show(\App\Domain\User $user): \App\Http\Response
{
    return $this->render('users/show', ['user' => $user]);
}

// The framework reads attributes via ReflectionMethod:
$rm = new \ReflectionMethod($controller, 'show');
foreach ($rm->getAttributes() as $attr) {
    $instance = $attr->newInstance();   // reifies with args
    $pipeline->add($instance);
}
```

**Generators for streaming large result sets without OOM**

```php
<?php
declare(strict_types=1);

function rows(\PDO $pdo, string $sql, array $params): \Generator
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
        yield $row;
    }
}

// One row in memory at a time — works on a 10M-row table.
$pdo = new \PDO('pgsql:host=db;dbname=app', $user, $pass);
foreach (rows($pdo, 'SELECT * FROM events WHERE created_at > ?', [$since]) as $row) {
    $pipeline->emit($row);
}
```

**Fibers — cooperative async without callback hell**

```php
<?php
declare(strict_types=1);

use Revolt\EventLoop;

function fetch(string $url): string
{
    // Inside a Fiber, suspend() returns control to the event loop
    // and resumes once the I/O completes — code reads top-to-bottom.
    $fiber = \Fiber::getCurrent();
    $req = \http\non_blocking_get($url, fn(string $body) => $fiber->resume($body));
    return $fiber->suspend();
}

EventLoop::queue(function (): void {
    $a = fetch('https://api.example.com/a');
    $b = fetch('https://api.example.com/b');
    echo $a . $b;
});
EventLoop::run();
```

## Common Pitfalls

1. **`==` loose comparison silently coerces** — *Symptom:* `'0' == false` is true, `null == 0` is true, `'abc' == 0` was true before 8.0 — string/number coercion causes auth and routing bugs that pass tests. *Fix:* Always use `===` / `!==`. PHP 8.0+ tightened the rules but the operator is still dangerous; many style guides (PSR-12 + Slevomat) forbid `==` entirely.
2. **Array-by-value copies large arrays silently** — *Symptom:* `function f(array $rows)` copies the entire array on each call (COW only saves you on read). Passing 50k-row result sets around collapses performance. *Fix:* Pass arrays by reference only when mutating; for read-only large data use `iterable` / `Generator` or `readonly array` (typed via psalm as `list<T>`).
3. **Static state leaks across requests in long-running runtimes** — *Symptom:* `static $cache = [];` works fine in PHP-FPM (process dies per request) but in Octane/Swoole/FrankenPHP the cache grows forever and stale data leaks between tenants. *Fix:* In long-running mode, treat statics/singletons as request-scoped. Use a reset hook (`Register::reset()`) between requests or move caches to PSR-6/Redis.
4. **Empty() and isset() are not the inverse of each other** — *Symptom:* `empty('0')` is true (0 is falsy) but `isset($x['missing'])` is false. Both return true for unset variables without warning, hiding bugs. *Fix:* Use explicit checks: `($x !== null) && ($x !== '')` for strings, `count($arr) > 0` for arrays. Reserve `empty()` for genuinely 'unset-or-falsy' checks.
5. **Exception classes from global namespace need leading backslash** — *Symptom:* `catch (RuntimeException $e)` in a namespaced file looks for `App\RuntimeException` — which doesn't exist — so the catch never fires and exceptions propagate. *Fix:* Always reference built-in exceptions with a leading backslash: `catch (\RuntimeException $e)`, or `use \RuntimeException;` at the top.
6. **declare(strict_types=1) is per-file** — *Symptom:* Without `declare(strict_types=1)` as the first statement, PHP coerces types — `function f(int $x)` accepts `f('42')`. Mixing files with and without strict mode causes inconsistent bugs. *Fix:* Make `declare(strict_types=1)` the first line of every PHP file. Enforce with PHPStan rule `strict_types` and CI grep.
7. **PDO prepared statements require emulate mode off for security** — *Symptom:* PDO with `PDO::ATTR_EMULATE_PREPARES=true` (the default in many drivers) fakes prepared statements client-side — losing native type binding and reintroducing edge-case injection on edge drivers. *Fix:* `$pdo->setAttribute(\PDO::ATTR_EMULATE_PREPARES, false);` and bind parameters explicitly. The native protocol is safer and faster for repeated queries.

## Production / Interview Quick Reference

- PHP 8.5.12 (Oct 2026, security release) is current; 8.6 at RC5 (GA Nov 19, 2026) — check release notes before adopting the pipe operator. `version`
- Opcache caches the compiled opcodes — must be enabled in production; ~2-3x request throughput for free. `perf`
- PHP 8.0 JIT helps CPU-bound code (image processing, math) ~1.5-2x; near-zero effect on typical I/O-bound web requests. `perf`
- PHP 8.1 enums, readonly, fibers; 8.2 readonly classes, DNF types; 8.3 typed class constants, json_validate(). `version`
- PHP 8.4 property hooks, asymmetric visibility — modern property syntax approaching C#/Kotlin. `version`
- Shared-nothing model: each request starts fresh. Long-running modes (Octane, Swoole, FrankenPHP) break this assumption. `gotcha`
- Composer is the de-facto package manager; `composer.json` psr-4 autoload is the only sane class-loading scheme. `version`
- declare(strict_types=1) must be the first line of every file — without it, types silently coerce. `gotcha`
- PHPStan / Psalm at max level catch most type errors; pair with strict psalm/phpdoc generics for collections. `perf`
- Fibers (8.1+) are cooperative — no preemption. A blocking PDO call freezes the whole loop; use async drivers (ReactPHP, Amp). `gotcha`
- PDO::ATTR_EMULATE_PREPARES=false uses native prepared statements — safer and faster for repeated queries. `perf`
- Splat operator: `f(...$args)` unpacks arrays; `function f(...$args)` collects variadics. `style`
- PSR-12 is the modern style guide; PER (PHP Evolution Recommendation) is its evolving successor. `style`
- Constructor promotion saves ~50% of value-class boilerplate; pair with `readonly` for immutable DTOs. `style`
- match() is strict (===), returns a value, has no fallthrough — strictly better than switch for branching on values. `style`
- Generators (`yield`) cut memory for large result sets by ~99% — one row in memory at a time vs. loading the whole array. `perf`

## Go Deeper

- [PHP Manual — Official Documentation](https://www.php.net/manual/en/) — The annotated manual is still the canonical reference; user comments often surface real-world gotchas.
- [PHP RFCs — Request for Comments](https://wiki.php.net/rfc) — The source of truth for every modern feature; read RFCs to understand why a feature exists.
- [PHP: The Right Way](https://phptherightway.com/) — Modern best-practices primer — passwords, sessions, dependency injection, security.
- [Laravel Documentation](https://laravel.com/docs) — Laravel is the dominant PHP framework; its docs are the most-read PHP writing on the planet.
- [PHP Internals News (PHP Internals News podcast)](https://phpinternals.news/) — Interviews with RFC authors — the fastest way to understand the language's direction.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| int | Platform-dependent (64-bit on 64-bit builds); no overflow detection — wraps via C long. | Counting, IDs. For huge numbers use GMP extension or bcmath. |
| float | IEEE 754 double. Same caveats as every other language. | Math. For money use bcmath, gmp, or a Money object. |
| string | Byte array — NOT Unicode-aware by default. mb_* functions operate on code points. | All text. Be explicit: strlen vs mb_strlen. |
| bool | true / false. Falsy: 0, 0.0, '0', '', [], null. Everything else truthy. | Logic. Note: '0' (string) is falsy, but '0.0' is truthy. |
| null | Singleton null. isset() returns false; ==null catches unset+null. | Absence. Prefer nullable types (?Type) in function signatures. |
| array | Ordered map — acts as array, list, hash, queue, stack. PHP's universal collection. | Default collection. Generics via psalm/phpstan docblocks (not runtime). |
| object | Instance of a class — passed by handle (reference-like), unlike arrays (by value). | When you need identity + methods; otherwise prefer readonly classes for DTOs. |
| callable | Anything invokable: string function name, [obj, method], Closure, __invoke object. | Callbacks (array_map, usort). Closure type is stricter (no string form). |
| mixed | Any type — explicit way to say 'no constraint' (8.0+). | Avoid in new code; use union types or generics instead. |
| void / never / null (return) | void: no return value; never: never returns (throw or exit); null: returns null. | Document side-effecting functions; never for exit() / throw functions. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| array (list) | Numeric-keyed array — but it's really a hash map with integer keys. | Default ordered collection. array_is_list() checks pure-list shape (8.1+). |
| array (map) | String or integer keyed hash map — preserves insertion order. | Keyed lookups, JSON objects, config. The most-used collection. |
| ArrayObject | Object wrapper around an array — works like an array but as an object. | Rare; prefer plain arrays or a typed readonly class. |
| SplFixedArray | Fixed-length, integer-indexed array — ~30% less memory, faster iteration. | Performance-critical numeric pipelines with known size. |
| SplStack / SplQueue / SplDoublyLinkedList | SPL collections — typed interfaces, O(1) push/pop. | Real stack/queue semantics; rarely worth it over array_push/array_shift. |
| SplObjectStorage | Map keyed by object identity — like Java's IdentityHashMap. | Memoizing per-object state, attaching metadata to objects. |
| WeakMap | Map keyed by objects, doesn't prevent GC of keys (8.0+). | Caches/metadata that should die with the object; prevents leaks. |
| Ds\Vector / Set / Map | Ds extension collections — generic, lower memory, faster. | Performance-critical code; require ext-ds (not always installed). |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class C { ... } | Standard class — single inheritance, properties, methods. | Default for behavior-rich types. Use 'final' by default; open via 'readonly' or DTOs. |
| final readonly class User | Immutable value class — no inheritance, all props readonly (8.2+). | DTOs, value objects, command/query payloads. |
| enum Suit: string { case Hearts = 'h'; } | Native enum with backing value — first-class enumerated type (8.1+). | Closed value sets; replaces 'const on a class' pattern. |
| interface I { ... } / abstract class A | Interface (no impl) vs abstract class (partial impl). | Interfaces for contracts; abstract classes for shared base impl. Multiple interface, single inheritance. |
| trait T { ... } | Horizontal reuse — copy-paste methods into classes. | Sharing behavior across unrelated classes. Beware of conflicts and 'insteadof'. |
| readonly public int $id | Property set once (in ctor) and immutable (8.1+). | Value-object fields; pairs with constructor promotion. |
| #[Attribute] class Attr | Native attribute — structured metadata readable via reflection (8.0+). | Routing, DI, validation — replaces docblock annotations. |
| class C<T> (via @template) | Generics via psalm/phpstan docblocks — static-only, not runtime-enforced. | Always annotate; pair with PHPStan/Psalm at max level. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| $a + $b, $a - $b, $a * $b, $a / $b | Arithmetic — / returns float unless evenly divisible. | Math. intdiv() for integer floor division; % for modulo. |
| $a % $b, $a ** $b | Modulo (integer operands) and exponentiation. | % converts floats to int first; use fmod() for float modulo. |
| $a == $b, $a != $b | Loose comparison — coerces types. DANGEROUS. | Never in new code. PSR-12 + Slevomat forbid in many codebases. |
| $a === $b, $a !== $b | Strict comparison — no coercion. Always use this. | All equality checks in production code. |
| $a < $b, $a > $b, $a <= $b, $a >= $b | Comparison — coerces numerics; compares strings lexically unless both numeric. | Sorting. Use spaceship $a <=> $b for usort callbacks. |
| $a <=> $b | Spaceship — returns -1, 0, 1. Powers usort and sort. | Sorting callbacks: usort($arr, fn($a, $b) => $a <=> $b). |
| $a && $b, $a \|\| $b, !$a | Short-circuit boolean — returns bool, not operand. | Logic. Unlike Ruby/JS, returns true/false not the operand. |
| $a and $b, $a or $b | Lower-precedence boolean — DO NOT use. | Almost never. 'and'/'or' have lower precedence than =. |
| $a ? $b : $c, $a ?: $c | Ternary; ?: is Elvis shorthand for $a ? $a : $c (since 5.3). | Concise conditional. Nesting ternaries without parens is deprecated (8.0+). |
| $a ?? $b | Null coalescing — $a if set and non-null, else $b. Short-circuits: $a ?? $b ?? $c. | Default values; replaces isset($x) ? $x : $default. |
| $a?->method() | Nullsafe method call (8.0+) — short-circuits to null if $a is null. | Optional descent through object graphs. |
| $a & $b, $a \| $b, $a ^ $b | Bitwise AND/OR/XOR — on integers (and strings of equal length, byte-wise). | Bit flags. For bool use && / \|\|. |
| ~$a, $a << $n, $a >> $n | Bitwise NOT, left/right shift. | Low-level bit ops; rare in business code. |
| $a . $b | String concatenation — NOT + (which is numeric). | Build strings. Use sprintf() for complex formatting; heredoc/nowdoc for big templates. |
| $a instanceof MyClass | Type check — true if $a is an instance of MyClass or a subclass. | Type guards before method calls; also accepted in instanceof with multiple classes (8.0+). |

## Input / Output

**File I/O — small (read all) vs large (stream generators)**

```php
<?php
declare(strict_types=1);

// Small file — read all at once
$text = file_get_contents('small.txt');
$bytes = file_get_contents('data.bin');  // binary-safe

// Large file — stream line by line via generator (memory-friendly)
function lines(string $path): \Generator
{
    $fh = fopen($path, 'r');
    try {
        while (($line = fgets($fh)) !== false) {
            yield rtrim($line, "\n\r");
        }
    } finally {
        fclose($fh);
    }
}

foreach (lines('huge.csv') as $line) {
    process($line);
}

// Even better for CSVs — fgetcsv streams:
if (($fh = fopen('data.csv', 'r')) !== false) {
    while (($row = fgetcsv($fh)) !== false) {
        // $row is an array of column values
    }
    fclose($fh);
}
```

**stdin / stdout / stderr — CLI scripts**

```php
<?php
declare(strict_types=1);

// Read all of stdin
$data = file_get_contents('php://stdin');

// Stream stdin line by line (memory-friendly)
while (($line = fgets(STDIN)) !== false) {
    fwrite(STDOUT, strtoupper($line));
}

// Print to stderr
fwrite(STDERR, "warning: deprecated\n");

// JSON over stdin/stdout — common CLI interop pattern
$payload = json_decode(file_get_contents('php://stdin'), true, 512, JSON_THROW_ON_ERROR);
$result = transform($payload);
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
```

**JSON / serialize / var_export — serialization tiers**

```php
<?php
declare(strict_types=1);

// JSON — text, portable, the default
file_put_contents('cfg.json', json_encode(['k' => 1, 'list' => [1, 2]],
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
$cfg = json_decode(file_get_contents('cfg.json'), true, 512, JSON_THROW_ON_ERROR);

// serialize() — PHP-specific, faster than JSON, UNSAFE for untrusted data
$blob = serialize($model);
file_put_contents('state.ser', $blob);
$model = unserialize(file_get_contents('state.ser'),
    ['allowed_classes' => [User::class, Order::class]]);  // restrict classes!

// var_export — outputs valid PHP code; good for cached config
$cached = '<?php return ' . var_export($config, true) . ';';
file_put_contents('config.cached.php', $cached);
```

**HTTP client (PSR-18) with retries — modern style**

```php
<?php
declare(strict_types=1);

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

function get_json(string $url): array
{
    $client = new Client([
        'timeout' => 10.0,
        'headers' => ['User-Agent' => 'myapp/1.0', 'Accept' => 'application/json'],
    ]);

    $attempts = 0;
    backoff:
    try {
        $resp = $client->get($url);
        return json_decode((string) $resp->getBody(), true, 512, JSON_THROW_ON_ERROR);
    } catch (RequestException $e) {
        if (++$attempts >= 3) throw $e;
        usleep((int) (500_000 * (2 ** ($attempts - 1))));  // 0.5s, 1s, 2s
        goto backoff;
    }
}

// PSR-18 lets you swap Guzzle for Symfony HttpClient or any other impl.
```

## Loops & Iteration

**foreach — the 90% case (with key + index)**

```php
<?php
$items = ['a', 'b', 'c'];
$scores = [10, 20, 30];

// Values only
foreach ($items as $item) {
    echo $item;
}

// With index (key)
foreach ($items as $i => $item) {
    echo "$i: $item\n";
}

// Parallel iteration via array_map + multiple arrays
$paired = array_map(fn($a, $b) => "$a=$b", $items, $scores);

// Don't use count() in a for loop unless you need to mutate by index.
// foreach is faster and clearer for read-only iteration.
```

**array_map / array_filter / array_reduce — functional**

```php
<?php
$nums = range(1, 10);

// array_map — transform each element (arrow fn for one-liners since 7.4)
$squares = array_map(fn($n) => $n * $n, $nums);

// array_filter — keep elements where callback is true
$evens = array_filter($nums, fn($n) => $n % 2 === 0);
// Note: array_filter PRESERVES keys — reindex with array_values()
$evens = array_values(array_filter($nums, fn($n) => $n % 2 === 0));

// array_reduce — fold left
$sum = array_reduce($nums, fn($acc, $n) => $acc + $n, 0);

// PHP has no list-comprehension syntax — these three are the idiomatic way.
```

**while / do-while / for — explicit loops**

```php
<?php
// while — runs while condition is true
$n = 0;
while ($n < 10) {
    if (found($n)) break;
    $n++;
}

// do-while — runs body at least once
do {
    $result = try_once();
} while ($result === 'retry');

// for — when you need the index (rare in PHP)
for ($i = 0, $n = count($items); $i < $n; $i++) {
    process($items[$i]);
}

// Caching count() in $n saves a function call per iteration.
```

**Generators — yield for streaming large datasets**

```php
<?php
declare(strict_types=1);

// A generator yields one value at a time — O(1) memory regardless of size.
function naturals(int $from = 1): \Generator
{
    while (true) yield $from++;
}

function take(\Generator $g, int $n): \Generator
{
    foreach ($g as $i) {
        if ($n-- <= 0) return;
        yield $i;
    }
}

foreach (take(naturals(1), 5) as $i) {
    echo $i;  // 12345
}

// yield from — delegate to a sub-generator (5.5+)
function flatten(array $nested): \Generator
{
    foreach ($nested as $item) {
        if (is_array($item)) yield from flatten($item);
        else yield $item;
    }
}
```

## Functions & Callables

**Positional, default, variadic, named args (8.0+)**

```php
<?php
declare(strict_types=1);

function f(int $a, int $b = 10, string ...$rest): array
{
    return [$a, $b, $rest];
}

// Positional
f(1, 2, 'x', 'y');   // [1, 2, ['x', 'y']]

// Named args (8.0+) — skip defaults, reorder freely
f(a: 1, b: 2);
f(b: 2, a: 1);       // order doesn't matter with names

// Spread operator to forward an array as args
$args = [1, 2, 'x', 'y'];
f(...$args);

// Arrow functions (7.4+) — single-expression, auto-capture outer scope
$double = fn($x) => $x * 2;
$multiply = fn($x) => fn($y) => $x * $y;  // curried
```

**Closures + use() — explicit capture**

```php
<?php
declare(strict_types=1);

// Closures do NOT auto-capture outer scope — you must list vars in use().
$factor = 10;
$multiply = function ($x) use ($factor) {
    return $x * $factor;
};

// Capture by reference (rare — only for accumulators)
$total = 0;
$add = function ($x) use (&$total) {
    $total += $x;
};

// Arrow functions (7.4+) auto-capture by value — preferred for one-liners
$factor = 10;
$multiply = fn($x) => $x * $factor;

// Closure::fromCallable() — explicit Closure object (7.1+)
$callable = Closure::fromCallable('strtoupper');
echo $callable('hi');  // HI
```

**First-class callable syntax (8.1+) — partial application**

```php
<?php
declare(strict_types=1);

// 8.1+: f(...) creates a Closure that calls f with whatever args you pass later
$upper = strtoupper(...);
echo $upper('hi');  // HI

// Partial application via ... — bind some args, defer the rest
function greet(string $greeting, string $name): string {
    return "$greeting, $name!";
}

$sayHello = greet('Hello', ...);  // binds greeting, leaves name open
echo $sayHello('World');  // Hello, World!

// Pipe-friendly — pass functions as values without Closure::fromCallable
$transforms = [
    'strtoupper'(...),
    fn(string $s) => str_replace(' ', '_', $s),
    fn(string $s) => $s . '!',
];
$result = array_reduce($transforms, fn($acc, $f) => $f($acc), 'hello world');
```

**Generators + send() — bidirectional coroutine**

```php
<?php
declare(strict_types=1);

function echo_pipeline(): \Generator
{
    while (true) {
        $received = yield;
        if ($received === null) return;
        yield strtoupper($received);
    }
}

$gen = echo_pipeline();
$gen->current();              // prime: advance to first yield
$gen->send('hello');
// Generators are bidirectional — you can send() in and yield out.
// This is how async frameworks (ReactPHP, Amp) implement coroutines pre-Fiber.

// Since 8.1, prefer Fibers for async — they're coroutines done right,
// with proper stack and isolation.
```

## Error Handling

**try / catch / finally + multi-catch (7.1+)**

```php
<?php
declare(strict_types=1);

try {
    $result = do_risky();
} catch (SpecificException $e) {
    handle($e);
} catch (OtherException | ThirdException $e) {  // multi-catch (7.1+)
    fallback($e);
} catch (\Throwable $e) {
    // Catch Throwable, not Exception — Errors (TypeError etc.) extend Throwable
    error_log("unexpected: " . $e->getMessage());
    throw $e;
} finally {
    // ALWAYS runs — cleanup, even on return/break/continue
    cleanup();
}

// NEVER catch \Throwable and silently swallow — at minimum log + rethrow.
```

**Custom exception hierarchy + previous (chaining)**

```php
<?php
declare(strict_types=1);

namespace App\Domain;

class AppException extends \RuntimeException {}
class ValidationException extends AppException {}
class NotFoundException extends AppException {}

function find_user(int $id): User
{
    if (!exists($id)) {
        throw new NotFoundException("user {$id} not found", 404);
    }
    return load($id);
}

function parse(string $raw): int
{
    try {
        return (int) $raw;
    } catch (\TypeError $e) {
        // 'previous' = exception chaining — the third ctor arg
        throw new ValidationException("bad input: {$raw}", 0, $e);
    }
}
```

**throw expression (8.0+) — concise null-fail**

```php
<?php
declare(strict_types=1);

// throw is an expression (8.0+) — usable in ?: ?? and arrow functions
$user = find_user($id) ?? throw new NotFoundException("missing {$id}");

// Common pattern: short-circuit on null
$config = $env['CONFIG'] ?? throw new \RuntimeException('CONFIG missing');

// Arrow functions can throw
$parse = fn(string $s) => match (true) {
    str_starts_with($s, 'http') => new Url($s),
    default => throw new \InvalidArgumentException("bad: {$s}"),
};

// set_error_handler converts warnings (which used to be 'silent') into ErrorException
set_error_handler(fn(int $severity, string $msg, string $file, int $line) =>
    throw new \ErrorException($msg, 0, $severity, $file, $line));
```

**Result pattern via enum (8.1+) — typed, explicit**

```php
<?php
declare(strict_types=1);

/**
 * @template T
 * @template E of \Throwable
 */
final readonly class Result
{
    private function __construct(
        public mixed $value,
        public ?\Throwable $error,
    ) {}

    public static function ok(mixed $v): self { return new self($v, null); }
    public static function err(\Throwable $e): self { return new self(null, $e); }

    public function isOk(): bool { return $this->error === null; }
}

function divide(int $a, int $b): Result
{
    try {
        return Result::ok(intdiv($a, $b));
    } catch (\DivisionByZeroError $e) {
        return Result::err($e);
    }
}

$r = divide(10, 0);
if ($r->isOk()) {
    echo $r->value;
} else {
    error_log($r->error->getMessage());
}
```

## Concurrency Model

**Fibers (8.1+) — cooperative async without callback hell**

```php
<?php
declare(strict_types=1);

use Revolt\EventLoop;

// A Fiber is a stackful coroutine — you suspend() and resume() it.
function fetch(string $url): string
{
    $fiber = \Fiber::getCurrent();
    http_non_blocking_get($url, fn(string $body) => $fiber->resume($body));
    return $fiber->suspend();  // yields back to the event loop
}

EventLoop::queue(function (): void {
    $a = fetch('https://api.example.com/a');  // reads top-to-bottom
    $b = fetch('https://api.example.com/b');
    echo $a . $b;
});
EventLoop::run();

// Fibers are the foundation that ReactPHP, Amp, and Revolt build on.
// Application code rarely touches them directly.
```

**Parallel extension — true CPU threads (PHP 7.2+)**

```php
<?php
declare(strict_types=1);

// ext-parallel provides real OS threads — for CPU-bound work.
// Each thread runs in its own PHP runtime, no shared state.

$runtime = new \parallel\Runtime();

$future = $runtime->run(function (int $n): int {
    $sum = 0;
    for ($i = 0; $i < $n; $i++) $sum += $i;
    return $sum;
}, [1_000_000]);

echo $future->value();  // blocks until the thread finishes

// Multiple runtimes for parallelism:
$runtimes = array_map(
    fn() => (new \parallel\Runtime())->run(fn($n) => heavy($n), [1_000_000]),
    range(1, 8),
);
$results = array_map(fn($f) => $f->value(), $runtimes);
```

**Async via Revolt + Amp — promises + coroutines**

```php
<?php
declare(strict_types=1);

use function Amp\async;
use function Amp\Future\await;
use Amp\Http\Client\HttpClientBuilder;

// Amp 3.x uses Fibers under the hood — code looks synchronous.
$client = HttpClientBuilder::buildDefault();

$futures = array_map(
    fn($url) => async(fn() => $client->request(new \Amp\Http\Client\Request($url))),
    $urls,
);

// await runs them in parallel and returns results in order
$responses = await($futures);

// Concurrency limit with Amp's iterator:
// use Amp\Pipeline\ConcurrentIterator;
// Each pipeline stage has its own worker pool.
```

**Long-running mode caveat — Octane / Swoole / FrankenPHP**

```php
<?php
declare(strict_types=1);

// In PHP-FPM (default): every request gets a fresh process state.
// Statics, singletons, and DI containers reset between requests.

// In long-running modes (Laravel Octane, Swoole, FrankenPHP, RoadRunner):
// The worker stays alive across requests. NOW statics leak.
static $cache = [];
function expensive(string $key): mixed
{
    global $cache;  // BAD in long-running — grows forever
    return $cache[$key] ??= compute($key);
}

// Fix: register a reset hook that fires after each request
// Octane:
//   Octane::tick('cleanup-cache', fn() => $cache = [], seconds: 60);
// Or move state to PSR-6 cache (Redis) — works in both modes.
```

## Testing Patterns

**PHPUnit — the de-facto PHP test framework**

```php
<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class UserTest extends TestCase
{
    private User $user;

    protected function setUp(): void  // runs before each test
    {
        $this->user = new User(email: 'a@b.io');
    }

    public function testValidatesEmail(): void
    {
        self::assertTrue($this->user->isValid());
    }

    /**
     * @dataProvider badEmails
     */
    public function testRejectsBadEmail(string $email): void
    {
        $this->user->email = $email;
        self::assertFalse($this->user->isValid());
    }

    /** @return iterable<string, array{string}> */
    public static function badEmails(): iterable
    {
        yield 'empty'   => [''];
        yield 'no-at'   => ['nope'];
        yield 'double'  => ['a@@b.io'];
    }
}
```

**Pest — expressive DSL on top of PHPUnit**

```php
<?php
// Pest is a thin DSL over PHPUnit — same engine, cleaner syntax.
// tests/UserTest.php

it('validates a real email', function () {
    $user = new User(email: 'a@b.io');
    expect($user->isValid())->toBeTrue();
});

it('rejects bad emails', function (string $email) {
    $user = new User(email: $email);
    expect($user->isValid())->toBeFalse();
})->with([
    'empty'  => [''],
    'no-at'  => ['nope'],
    'double' => ['a@@b.io'],
]);

// Datasets via ->with(); expect() chain for assertions.
// Run: vendor/bin/pest
```

**Mocks & stubs — Mockery / PHPUnit built-in**

```php
<?php
declare(strict_types=1);

// PHPUnit built-in: createMock + expectConsecutive
$repo = $this->createMock(UserRepository::class);
$repo->method('find')
     ->willReturnOnConsecutiveCalls($user1, $user2, null);
$repo->expects($this->once())
     ->method('save')
     ->with($this->callback(fn(User $u) => $u->email === 'x@y.io'));

// Mockery (library) — more fluent API
$mailer = Mockery::mock(Mailer::class);
$mailer->shouldReceive('sendWelcome')
       ->once()
       ->with('x@y.io');

// In 2024+, use Mockery or Pest's expectation API — they're cleaner than
// PHPUnit's built-in for anything beyond trivial cases.
```

**Coverage + PHPUnit config in phpunit.xml**

```php
<?xml version="1.0"?>
<!-- phpunit.xml — modern PHPUnit 10+ format -->
<phpunit bootstrap="vendor/autoload.php"
         cacheDirectory=".phpunit.cache"
         executionOrder="random"
         requireCoverageMetadata="true"
         colors="true">
  <source>
    <include><directory>src</directory></include>
  </source>
  <testsuites>
    <testsuite name="unit"><directory>tests/Unit</directory></testsuite>
    <testsuite name="integration"><directory>tests/Integration</directory></testsuite>
  </testsuites>
  <coverage pathCoverage="true" reportDirectory=".coverage/html"/>
</phpunit>

<!-- Run: vendor/bin/phpunit --coverage-html .coverage/html -->
<!-- Cover the 80% that matters; ignore getters / DTOs via @codeCoverageIgnore -->
```

## Performance Tuning

- Opcache caches compiled opcodes across requests — must be enabled in prod; ~2-3x throughput for free. opcache.validate_timestamps=0 in prod.
- PHP 8.0 JIT helps CPU-bound code ~1.5-2x; near-zero effect on typical I/O-bound web requests. Set opcache.jit_buffer_size.
- Arrays are hash maps — memory-heavy vs C arrays. For fixed numeric pipelines, SplFixedArray uses ~30% less RAM.
- Passing big arrays to functions copies them (COW only helps on read). Use readonly classes or iterables for large data.
- Generators cut memory for large result sets ~99% — one row in memory at a time. Always prefer yield over building an array.
- Preloading (opcache.preload) loads classes into shared memory at startup — ~30% boot reduction in long-running apps.
-  declare(strict_types=1) has near-zero runtime cost — always enable. Coercion cost is paid on every call without it.
- Fibers are ~1KB each vs Threads ~1MB; you can run 100k fibers per process via Revolt/Amp.
- Static caching in PHP-FPM is request-scoped (safe); in Octane/Swoole it leaks across requests. Always reset between requests.
- PDO::ATTR_EMULATE_PREPARES=false uses native prepared statements — safer and faster for repeated queries.
- match() is strict and returns a value — slightly faster than switch + assignment, and impossible to forget break.
- Avoid @ error suppression — it's a slow opcode. Replace with try/catch or proper null checks.
- Xdebug is dev-only — disable in prod (3-10x slowdown). Use pcov or xdebug.mode=coverage for CI coverage.
- Symfony Profiler / Laravel Telescope / Blackfire are the standard profilers; Blackfire is the production-safe sampling one.
- FrankenPHP (Caddy-based, Rust worker) serves ~3-5x more req/s than PHP-FPM for I/O-bound apps via long-running mode.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Composer](https://getcomposer.org/) | Dependency manager — pins composer.lock, PSR-4 autoloader. The npm/pip of PHP. | package |
| [Packagist](https://packagist.org/) | The package registry; Composer pulls from here by default. | package |
| [PHPUnit](https://docs.phpunit.de/) | Test framework — the de-facto standard. 10+ is the modern major. | test |
| [Pest](https://pestphp.com/) | Expressive DSL test framework — built on top of PHPUnit. | test |
| [PHPStan](https://phpstan.org/) | Static analyzer — run at max level (10) for new code. Catch type bugs before runtime. | lint |
| [Psalm](https://psalm.dev/) | Alternative static analyzer — strong generics support, often paired with PHPStan. | lint |
| [PHP CS Fixer](https://cs.symfony.com/) | Formatter + style fixer — implements PSR-12 + project rules. | lint |
| [Rector](https://getrector.com/) | Automated refactoring + upgrade tool — instant PHP 7.x → 8.x migrations. | lint |
| [Xdebug](https://xdebug.org/) | Step debugger + profiler + tracer — dev-only, slow in prod. | debug |
| [Blackfire](https://www.blackfire.io/) | Sampling profiler — production-safe, low overhead. SaaS + self-hosted. | debug |
| [Laravel](https://laravel.com/) | Full-stack web framework — ORM, queues, mail, broadcasting, the dominant choice. | build |
| [Symfony](https://symfony.com/) | Component-based framework — the building blocks Laravel uses; steeper but more flexible. | build |
| [Slim](https://www.slimframework.com/) | Micro web framework — minimal PSR-7 router for small APIs. | build |
| [FrankenPHP](https://frankenphp.dev/) | Modern app server (Caddy-based, Rust worker) — long-running mode, ~3-5x FPM throughput. | deploy |
| [Laravel Octane](https://laravel.com/docs/octane) | Long-running worker wrapper for Swoole/RoadRunner/FrankenPHP. | deploy |
| [RoadRunner](https://roadrunner.dev/) | Go-based PHP app server — long-running workers, PSR-7 gateway. | deploy |
| [Monolog](https://seldaek.github.io/monolog/) | PSR-3 logging — the standard; Laravel/Symfony ship it. | build |
| [Doctrine ORM](https://www.doctrine-project.org/) | Data-mapper ORM — Symfony default; heavier than Eloquent but more flexible. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 3.0 | 2012 | Modern era begins — namespaces, closures, late static binding. Many BC breaks. |
| 5.4 | 2012 | Short array syntax [], traits, short echo <?=, built-in dev server. |
| 5.5 | 2013 | Generators (yield), finally, list() in foreach, password_hash(). |
| 5.6 | 2014 | Variadic ...$args, argument unpacking, exponentiation **, constant expressions. |
| 7.0 | 2015 | Zend Engine 3 (~2x perf), scalar type hints, return types, null coalescing ??, spaceship <=>. |
| 7.1 | 2016 | Nullable types ?Type, void return, multi-catch, iterable type, Closure::fromCallable. |
| 7.2 | 2017 | object type, parameter type widening, password_hash Argon2, ext-parallel introduced. |
| 7.4 | 2019 | Arrow functions fn()=>, typed properties, spread in arrays, null coalescing assignment ??=. |
| 8.0 | 2020 | JIT, union types, named args, match(), attributes, nullsafe ?->, constructor promotion. |
| 8.1 | 2021 | Enums, readonly properties, Fibers, intersection types, never return, first-class callable syntax f(...). |
| 8.2 | 2022 | Readonly classes, DNF types, enum backing, random extension, dynamic property deprecation. |
| 8.3 | 2023 | Typed class constants, json_validate(), #[Override] attribute, deep-cloning of readonly props. |
| 8.4 | 2024 | Property hooks (C#-like), asymmetric visibility, array_find(), new without parens in args. |
| 8.5 | 2025 | Pipe operator \|>, clone with, #[NoDiscard] attribute, array_first()/array_last(), URI extension (RFC 3986/WHATWG). |

## Interview Hot Questions

1. **What's the difference between == and === in PHP?** *(easy)*

   == is loose comparison — coerces types. '0' == false is true, 'abc' == 0 was true before 8.0, null == 0 is true. === is strict — no coercion, value AND type must match. Always use === in production code. PHP 8.0 tightened loose comparison (string vs number now compares as strings if the string isn't numeric), but === remains the only safe operator.

2. **Explain the shared-nothing request model and how Octane/Swoole break it.** *(medium)*

   PHP-FPM spawns a fresh process per request (or reuses workers but resets all state). $_SESSION is a serialized blob, DB connections reopen, statics reset. This makes horizontal scaling trivial and leaks rare. Octane, Swoole, FrankenPHP, and RoadRunner keep the worker alive across requests — now statics, singletons, and DI containers persist and grow. You must register reset hooks or move caches to Redis. Choose: simple+slow (FPM) vs fast+careful (long-running).

3. **What does declare(strict_types=1) actually do?** *(medium)*

   Without it, PHP coerces scalar types at function boundaries — f('42') works for function f(int $x). With it (must be the first statement, per-file), types are enforced strictly — f('42') throws TypeError. Crucially, strict_types only affects calls made FROM that file, not the function's definition file. So a library can declare strict_types=1 but its callers can still pass coerced values unless they also opt in.

4. **How do Generators differ from arrays in PHP, and when should you use them?** *(medium)*

   A generator (function with yield) returns a Generator object that produces values lazily — one at a time, O(1) memory. An array materializes all values upfront, O(n) memory. Use generators for streaming large datasets (file lines, DB results, infinite sequences), or for pipelines where you'd otherwise build intermediate arrays. yield from delegates to a sub-generator. Since 8.1, Fibers are the better tool for bidirectional async; generators remain ideal for plain lazy iteration.

5. **Explain the difference between abstract class, interface, and trait.** *(easy)*

   An interface declares method signatures only — classes can implement multiple. An abstract class can have partial implementation + properties — classes can extend only one. A trait is horizontal reuse: copy-paste methods into a class, bypassing single inheritance. Use interfaces for contracts, abstract classes for shared base impl, traits for cross-cutting behavior (like Laravel's SoftDeletes). Beware trait conflicts — use 'insteadof' and 'as' to resolve.

6. **What are PHP 8.1 enums and how do they differ from the old 'const on a class' pattern?** *(medium)*

   Native enums (enum Suit: string { case Hearts = 'h'; }) are first-class types — the compiler enforces exhaustive match, you get Suit::cases() for iteration, Suit::from()/tryFrom() for backing-value round-trips, and they can implement interfaces / use traits / have methods. The old pattern ('class Suit { const Hearts = 'h'; }') had none of this — no type safety, no exhaustive checks, just constants. Use native enums for any closed value set.

7. **How do Fibers work and what problem do they solve?** *(hard)*

   A Fiber is a stackful coroutine — you create one with new Fiber(fn), start it with ->start(), and it can suspend itself with Fiber::suspend(). The event loop resumes it via ->resume($value). This lets async code look synchronous (top-to-bottom) instead of nested callbacks. Before 8.1, ReactPHP/Amp emulated this with generators + promises — clunky. Fibers are the foundation that Revolt/Amp 3.x/Swoole build on. You rarely use them directly; you use the frameworks that wrap them.

8. **What's the difference between PSR-4 and PSR-0 autoloading?** *(easy)*

   PSR-4 maps a namespace prefix to a directory and uses the rest of the class name verbatim — App\Domain\User → src/Domain/User.php. PSR-0 (deprecated) converted underscores in class names to directory separators too — App_Domain_User → App/Domain/User.php. PSR-4 is simpler and shorter; PSR-0 is supported only for back-compat. Configure in composer.json under autoload.psr-4.

9. **What is opcache and how do you tune it for production?** *(medium)*

   Opcache caches the compiled opcodes (PHP's VM bytecode) in shared memory across requests. Without it, every request re-parses and re-compiles every PHP file it touches (~2-3x throughput loss). Production tuning: opcache.enable=1, opcache.memory_consumption=256 (or higher for big apps), opcache.max_accelerated_files=20000+, opcache.validate_timestamps=0 (no revalidate — deploy by clearing opcache), opcache.preload to warm up at boot.

10. **Why are PDO prepared statements with emulate mode off safer and faster?** *(hard)*

   With PDO::ATTR_EMULATE_PREPARES=true (default in some drivers), PDO fakes prepared statements client-side by string-escaping values into the SQL — losing native type binding and reintroducing edge-case injection on drivers that don't escape correctly. With emulate=off, the database uses the wire protocol's prepared statement — values are sent separately as typed parameters, never interpolated. It's also faster for repeated queries because the planner caches the plan. The catch: emulated mode works with named placeholders like ':name' more flexibly; non-emulated requires per-driver compatibility.

## When to Choose This

- **vs Ruby / Rails:** use this — Self-hosted web backends, cheap hosting, content sites, SMB e-commerce — anywhere PHP-FPM's shared-nothing model wins.; use that — Internal DSLs, background jobs (Sidekiq), richer metaprogramming, teams that prefer blocks over arrow functions.
- **vs Node.js:** use this — Cheap shared hosting, content sites, when you need stable long-running ops (Octane/Swoole), when PHP's request model beats async complexity.; use that — Realtime web (WebSockets), SSR, isomorphic code, anywhere npm's ecosystem and JS's ubiquity matter.
- **vs Python:** use this — Web backends with fast bootstrap, self-hosted content sites, when Laravel/Symfony beat Django/Flask for your use case.; use that — Data science / ML / scientific computing, scripting with broad library reach, anywhere NumPy/Pandas/PyTorch dominate.
- **vs Go:** use this — Quick web backends with cheap hosting, when Laravel's batteries beat Go's bare-bones stdlib, when iteration speed > throughput.; use that — High-throughput microservices, single-binary deployment, ops tooling, anywhere CPU/latency beats syntax ergonomics.
- **vs Java:** use this — Self-hosted web apps, smaller teams, when PHP-FPM's per-request isolation beats JVM tuning, when Laravel's DX beats Spring's ceremony.; use that — Large enterprise systems, big-data pipelines, hard-realtime, anywhere the JVM ecosystem (Kafka, Spark) is the actual product.

