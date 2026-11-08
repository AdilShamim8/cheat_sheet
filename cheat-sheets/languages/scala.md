# Scala

**Category:** Languages · **Tier:** Tier 2 · Domain · **Tags:** static, jvm, functional, object-oriented, concurrent, spark, type-safe · **First released:** 2004 · **Author:** Martin Odersky (EPFL) · **Last updated:** 2026-11

> JVM language fusing OO and functional programming — strong static types, type inference, and the engine behind Apache Spark and modern data engineering.

---

## TL;DR

- Scala is a statically-typed, JVM-targeted language that unifies object-oriented and functional programming — everything is an object, functions are first-class, pattern matching is structural, and the type system supports algebraic data types, higher-kinded types, and implicits (now contextual).
- It powers the Apache Spark / Kafka / Flink data ecosystem and is widely used for high-throughput backend services (Twitter, Stripe, Netflix) via Akka/Pekko, http4s, and Play.
- Reach for Scala when you need type-safe functional programming on the JVM, when working with Spark/Flink/Kafka Streams, or when you want to express domain models with sum types and pattern matching while keeping full Java interop.
- Avoid Scala for short-lived scripts (slow compiler bootstrap), for teams allergic to build complexity (sbt has a learning curve), or where the binary-compat story across versions (2.12/2.13/3) creates friction — pick a single version per project.

## Core Mental Model

**ADTs + pattern matching + givens = typed-by-construction domains.** Scala's sweet spot is modeling a domain as a sealed trait with case classes — the compiler enforces exhaustive matching, so adding a new variant surfaces every site that needs updating. Functions are values: `List[Int] => Int` is a real type, and `map`/`flatMap`/`filter` compose like rivers flowing through your data. The third pillar is contextual abstraction — `given` instances (Scala 3) or `implicit` values (Scala 2) let you declare typeclass instances once and have the compiler thread them through call sites, which is how Cats, ZIO, and Spark's encoders work. The trap: Scala 2's implicits were powerful but cryptic (resolution rules could pull a 200-line error); Scala 3 replaced them with cleaner `given`/`using` syntax that's worth the upgrade if you can afford it.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| val x = 5 / var y = 5 | Immutable vs mutable binding — type inferred. | Default to `val`; reserve `var` for genuinely mutable state (rare). |
| def f(x: Int, y: Int = 0): Int = x + y | Method with default arg and expression body. | Default for any pure-ish function; `=` makes it an expression. |
| case class User(id: Int, email: String) | Immutable value class — auto generates equals/hashCode/copy/apply/unapply. | The default for domain models; powers pattern matching. |
| sealed trait Shape; case class Circle(r: Double) extends Shape | Closed algebraic data type — exhaustive match enforced. | ADTs, state machines, Results; the canonical Scala pattern. |
| object Foo { def bar = 1 } | Singleton object — also a module/namespace and the companion of class Foo. | Module pattern, factory methods, the home of `apply`/`unapply`. |
| xs.map(_ * 2).filter(_ > 5) | Higher-order collection methods with placeholder syntax. | The 80% of list manipulation; prefer over for-loops. |
| for { x <- xs; if x > 0; y = x * 2 } yield y | For-comprehension — desugars to map/flatMap/withFilter. | Multi-step transforms; works on any monad (List, Option, Future, IO). |
| Option[T] / Either[E, A] / Try[A] | Sum types for absence, errors, exceptions — never throw in business code. | Always prefer over null/try-catch; forces callers to handle both branches. |
| Future[A] / IO[A] (cats-effect) | Async computation — Future is eager, IO is referentially transparent. | Future for fire-and-forget; IO (ZIO/cats-effect) for typed, cancellable effects. |
| given ord: Ordering[Int] = ... | Contextual instance — compiler threads it into any `using Ordering[Int]` call. | Scala 3 syntax for typeclasses; replaces Scala 2 `implicit val`. |
| extension (s: String) def slug = s.toLowerCase.replace(' ', '-') | Adds a method to an existing type — extension method (Scala 3). | Ad-hoc API on third-party types without subclassing. |
| enum Color { case Red, Green, Blue } | Scala 3 enum — first-class ADT with parameters possible. | Simple enumerations; scala.Enumeration is legacy. |

## Idiomatic Patterns

**Sealed ADT + exhaustive match — the domain modeling pattern**

```scala
sealed trait Payment extends Product with Serializable
object Payment:
  final case class Card(number: String, exp: String) extends Payment
  final case class Bank(account: String, routing: String) extends Payment
  final case class Crypto(address: String, chain: String) extends Payment

def process(p: Payment): Either[String, String] = p match
  case Card(n, _)   if n.length == 16 => Right("card-charged")
  case Card(_, _)                       => Left("bad card")
  case Bank(a, _)   if a.nonEmpty      => Right("ach-sent")
  case Crypto(a, c)                      => Right(s"$c-paid-to-$a")

// Adding Wallet(...) later makes the compiler flag every match that
// doesn't handle it — exhaustive-by-construction refactoring.
```

**Tagless final + IO — typed, testable effectful services**

```scala
import cats.effect.{IO, Async}
import cats.syntax.all.*

trait UserRepo[F[_]]:
  def find(id: Long): F[Option[User]]
  def save(u: User): F[Unit]

class UserService[F[_]: Async](repo: UserRepo[F]):
  // For-comprehension over F — works for IO, Monix, ZIO, even Id in tests.
  def upsertEmail(id: Long, email: String): F[User] = for
    existing <- repo.find(id)
    updated  <- existing match
                  case Some(u) => repo.save(u.copy(email = email)).as(u.copy(email = email))
                  case None    => Async[F].raiseError(new RuntimeException(s"missing $id"))
  yield updated

// Production wires IO; tests use cats.Id for pure synchronous execution.
```

**Spark — the canonical data engineering pipeline**

```scala
import org.apache.spark.sql.{SparkSession, functions => F}
import spark.implicits.*  // enables .as[CaseClass] encoder via implicit Resolution

val spark = SparkSession.builder.appName("etl").getOrCreate()

val result = spark.read.parquet("s3://bucket/events/")
  .filter($"event_type" === "purchase" && $"ts" >= F.date_sub(F.current_date(), 7))
  .groupBy($"user_id", F.window($"ts", "1 hour"))
  .agg(
    F.sum("amount").as("revenue"),
    F.count("*").as("events"),
    F.collect_set("product_id").as("products")
  )
  .filter($"revenue" > 0)
  .orderBy(F.desc("revenue"))

result.write.mode("overwrite").parquet("s3://bucket/summary/")
```

**Given/using — typeclass instances, the modern way (Scala 3)**

```scala
trait Show[A]:
  extension (a: A) def show: String

object Show:
  given Show[Int]    with extension (a: Int)    def show = a.toString
  given Show[String] with extension (a: String) def show = a
  given Show[List[?]] with
    extension [A](xs: List[A])(using s: Show[A]) def show =
      xs.map(_.show).mkString("[", ", ", "]")

def log[A](a: A)(using s: Show[A]): String = s"a = ${a.show}"

@main def go = log(List(1, 2, 3))   // "a = [1, 2, 3]"
// Compiler finds the right Show instance per call site automatically.
```

## Common Pitfalls

1. **Implicit resolution produces 200-line error messages** — *Symptom:* Missing `cats.Applicative[IO]` import surfaces a chain of ambiguous candidate errors spanning hundreds of lines — the actual fix is one import. *Fix:* Read the top of the error (the failing call) and the bottom (the missing instance), ignore the middle. Use Scala 3's `using` syntax for cleaner messages. Enable `-Xlog-implicits` only when actively debugging.
2. **Default collections are mutable in Scala 2.x stdlib** — *Symptom:* `scala.collection.mutable.ListMap` vs `immutable.Map` — the unqualified `Map` resolves to immutable (good) but `Array` is always mutable, and `var x = List(...)` lets you reassign even though the list itself is immutable. *Fix:* Default to `immutable` collections; import `scala.collection.mutable` explicitly only when needed. Reserve `var` for true mutation; `val List(...)` is the safe default.
3. **Future is eager — starts on construction, not on await** — *Symptom:* `val f = Future(heavy())` runs `heavy()` immediately on the implicit ExecutionContext — even if you never `await` it. Surprises people coming from JS promises or cats-effect IO. *Fix:* Use `cats.effect.IO` (or ZIO) for referentially transparent, lazy effects. For Future, defer construction: `def makeF = Future(heavy())` so each call is explicit.
4. **`return` inside a closure exits the enclosing method, not the closure** — *Symptom:* `xs.map(x => if (x < 0) return -1 else x * 2)` throws `NonLocalReturnControl` — a non-local return that's slow, deprecated, and confusing. *Fix:* Never use `return` in lambdas. Use `xs.collectFirst` / `xs.find` / `Either` to express early-exit semantics explicitly. Reserve `return` for the very end of methods (or omit it entirely — Scala returns the last expression).
5. **Null is allowed by the type system despite `Option`** — *Symptom:* `val x: String = null` compiles fine — Scala inherited Java's null. Calling `x.length` throws NPE, bypassing all the Option-based safety you've built. *Fix:* Enable `-Yexplicit-nulls` (Scala 3) to make `null` explicit at the type level. Use `Option` everywhere a value can be absent. Wrap Java interop calls with `Option(...)`.
6. **Macro-based libraries break across minor versions** — *Symptom:* Upgrading Scala 2.12.15 → 2.12.18 breaks Circe / Quill / Magnolia because their macros depend on internal compiler APIs that change between patches. *Fix:* Pin Scala patch versions and the entire dependency set together via `update` or Bloop. For new projects, target Scala 3 (no macros for derivations — uses `Mirror` instead). Check the Scala 3 community build matrix before choosing libraries.
7. **`==` calls Java's equals — null-safe but not strictly typed** — *Symptom:* `Some(1) == Some(1)` works, but `1 == "1"` is allowed by the compiler and returns false at runtime (no type error). Coming from Rust/Haskell, this is jarring. *Fix:* Use `===` from cats (requires `Eq` typeclass) for type-safe equality in domain code. Reserve `==` for interop and tests where you want loose comparison.

## Production / Interview Quick Reference

- Scala 3 (Dotty) introduced new syntax: indentation-based, enums, givens/using, intersection/union types, fewer macros. `version`
- Scala 2.13 standardized on `scala.collection.immutable` defaults; `Seq` resolves to immutable `List`-like via `immutable.Seq`. `version`
- Case classes generate equals/hashCode/copy/apply/unapply — pattern matching uses `unapply` to destructure. `perf`
- For-comprehensions desugar to map/flatMap/withFilter — work on any type with those methods (List, Option, Future, IO, Try). `perf`
- JIT-warmed Scala matches Java's throughput on the JVM; cold start is slower due to class loading and trait linearization. `perf`
- Tail-call optimization only happens with `@tailrec` annotation + literal self-recursion — mutual recursion uses trampolines. `perf`
- Typeclass pattern: `trait Show[A]; given Show[Int] with ...` — compiler threads instances into `using` parameters. `gotcha`
- Implicits/givens are resolved by type, not name — ambiguous instances produce 100+ line errors. Read top + bottom of the error. `gotcha`
- Spark requires Scala 2.12 for Spark 3.x; Spark 4 supports Scala 2.13. Spark on Scala 3 is experimental. `version`
- Binary compatibility: Scala 2.13 libraries don't run on 2.12, and Scala 3 needs TASTy interop to use 2.13 artifacts. `gotcha`
- sbt is the dominant build tool (slow startup, powerful); Mill and scala-cli are modern, faster alternatives. `version`
- cats-effect / ZIO are the production effect systems — IO is referentially transparent, cancellable, and resource-safe. `style`
- Avoid `null` — use `Option`. Enable `-Yexplicit-nulls` (Scala 3) for compile-time null safety. `gotcha`
- Common style: 2-space indent, camelCase methods, PascalCase types. Scalafmt + Scalafix enforce; `.scalafmt.conf` is the source of truth. `style`
- Use `extension` methods (Scala 3) or implicit classes (Scala 2) to add methods to third-party types — preferred over subclassing. `style`

## Go Deeper

- [Scala Documentation — Official](https://docs.scala-lang.org/) — The language tour + Scala 3 book are the canonical entry points; the Cookbook is excellent for recipes.
- [Programming in Scala (Odersky, Spoon, Venners)](https://www.artima.com/shop/programming_in_scala_5ed) — The canonical book by the language designer; updated for Scala 3 in the 5th edition.
- [Scala 3 Reference (Dotty)](https://docs.scala-lang.org/scala3/reference/) — The reference for all Scala 3 features — type classes, given/using, metaprogramming, etc.
- [Cats Documentation](https://typelevel.org/cats/) — The typeclass library; its docs double as a functional programming primer for Scala.
- [Functional Programming in Scala (Paul Chiusano & Rúnar Bjarnason)](https://www.manning.com/books/functional-programming-in-scala) — The deep treatment of FP using Scala as the teaching language; exercises build a real IO type.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Byte / Short / Int / Long | 8/16/32/64-bit signed integer. Int is the default literal type. | Numeric work. Use Long for IDs/timestamps; Int for general use. |
| Float / Double | IEEE 754 32/64-bit float. Double is the default literal type. | Math. BigDecimal for money; Float only for graphics / huge arrays. |
| Char | 16-bit Unicode code unit — quoted with single quotes 'a'. | Single-char work. Use String for text — Char doesn't model grapheme clusters. |
| Boolean | true / false — strict, no truthiness coercion. | Logic. 'if (x)' requires x to be Boolean. |
| String | Immutable UTF-16 sequence (JVM String). Triple-quoted for raw multi-line. | All text. s"..." for interpolation, raw"..." for no escapes. |
| Unit | Singleton 'no value' type — like void but is a real type with one instance (). | Function return type when there's nothing to return; the type of side effects. |
| Nothing | Bottom type — a function returning Nothing never returns (throws, infinite loop). | Type for 'this branch never completes': ???, sys.error, infinite loops. |
| Null / Any / AnyRef / AnyVal | Null = bottom of AnyRef (Java null); Any = top; AnyRef = reference supertype; AnyVal = primitive supertype. | Null: avoid; Any/AnyRef: rare interop; AnyVal: value classes. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| List[T] | Immutable singly-linked list — O(1) prepend/head/tail, O(n) random access. | Functional pipelines, recursive algorithms. The default immutable sequence. |
| Vector[T] | Immutable indexed sequence — O(log32 n) for all ops. Fast random access. | Default when you need indexed access on immutable data; better than List for big seqs. |
| Array[T] | Mutable JVM array — O(1) indexed access. Invariant, no type erasure. | Performance-critical numerics, Java interop. Use .toSeq to convert to immutable. |
| Map[K, V] / Set[T] | Immutable hash map / set — O(1) avg lookup. HashMap/HashSet default impls. | Keyed lookups, dedup. Use mutable.HashMap/Set only for hot mutable code. |
| Seq[T] | Abstract immutable sequence — List is the default impl. IndexedSeq for indexed access. | APIs that work on any immutable sequence. Use List/Vector for concrete code. |
| Option[T] | Some(T) or None — the typed replacement for null. | Any value that might be absent. NEVER use null in new Scala code. |
| Either[L, R] | Left(L) or Right(R) — typed error channel. Right = success by convention. | Typed errors (better than throws). Use Try for exceptions-as-values. |
| Iterator[T] | Lazy one-pass iterator — like Java's Iterator. Consumed once, then closed. | Large pipelines without materializing. For lazy streams use LazyList (2.13+). |
| LazyList[T] | Lazy sequence — values computed on demand, memoized. Formerly Stream. | Infinite sequences, large pipelines. .map/.filter are lazy; .toList forces. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class C(val x: Int) | Standard class — single inheritance, reference type, JVM interop. | Default for behavior-rich types. Use 'final' or 'sealed' by default. |
| case class User(id: Int, email: String) | Immutable value class — auto-generates equals/hashCode/toString/copy/apply/unapply. | Value types; the default for DTOs and domain models. Powers pattern matching. |
| sealed trait Shape; case class Circle(r: Double) extends Shape | Closed ADT — exhaustive match enforced. The canonical Scala pattern. | Domain modeling, state machines, Results. Enables totality checks. |
| object Foo { def bar = 1 } | Singleton object — also a module/namespace and the companion of class Foo. | Module pattern, factory methods, the home of apply/unapply. Companion object accesses private members. |
| trait T { def f(x: Int): Int } | Trait — interface with optional default impl. Multiple inheritance via trait mixing. | Contracts, polymorphism. The Scala equivalent of Java interfaces + abstract classes combined. |
| enum Color { case Red, Green, Blue } | Scala 3 enum — first-class ADT with parameters possible. | Simple enumerations; scala.Enumeration is legacy (Scala 2). |
| opaque type UserID = Long | Zero-cost newtype (Scala 3) — distinct type at compile time, erased at runtime. | Typed IDs, units of measure. Replaces value classes for newtype use cases. |
| extension (s: String) def slug = s.toLowerCase.replace(' ', '-') | Scala 3 extension method — adds method to existing type. | Ad-hoc API on third-party/stdlib types. Scala 2: implicit class. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b | Arithmetic — overloaded for strings (+), collections, numeric types. / is true division on Doubles. | Math. 'a + b' for strings is concatenation; prefer StringBuilder for loops. |
| a % b, a mod b | Modulo — % is Java's (sign follows dividend); mod (math) always positive. | Parity, cycling. Use math.IEEEremainder for IEEE-compliant remainder. |
| a == b, a != b | Value equality — calls .equals() (null-safe via ==). Reference identity is 'eq' / 'ne'. | Default comparisons. == on Any calls .equals(); for reference identity use eq. |
| a eq b, a ne b | Reference identity — same instance. Only on AnyRef (reference types). | Detecting shared references; rare in business code, common in tests/debugging. |
| a < b, a > b, a <= b, a >= b | Comparison — requires Ordering. Auto-derived for case classes via Ordered. | Sorting, ranges. Chaining: '1 < x && x < 10' (no '1 < x < 10'). |
| a && b, a \|\| b, !a | Short-circuit boolean — strict Boolean, no truthiness. | Logic. Lazy on right side: 'cond && expensive()' skips expensive() if cond is false. |
| if (c) a else b | Conditional expression — returns value, not a statement. | Default branching. Always returns a value; can be assigned: val x = if (cond) 1 else 2. |
| a.?(b), a.orElse(b) | Option ops — Some(x).?(f) returns f(x); None.?(f) returns None. orElse fallback. | Option chaining. Prefer pattern matching / for-comprehensions for clarity. |
| a <- b (in for-comp) | Generator — binds a to each element of b. Desugars to .flatMap / .foreach. | for-comprehensions: for { x <- xs; if x > 0 } yield x * 2. |
| a \|> f | Pipe (Scala 2.13+) — forwards a as arg to f. Read left-to-right. | Pipeline readability: x \|> f \|> g instead of g(f(x)). |
| a :: b, a +: b, a :+ b | List prepend (::), prepend to any Seq (+:), append (:+). Prepend is O(1) for List. | Building lists. Always prefer prepending (efficient) over appending (O(n)). |
| a ++ b | Concatenation — works on collections, strings, iterators. | Combine sequences. List(1,2) ++ List(3,4) == List(1,2,3,4). |
| a -> b | Tuple constructor — creates (a, b). Powers Map literals: Map(a -> 1, b -> 2). | Building pairs/maps. Readable alternative to (a, b). |
| a match { case ... } | Pattern match — destructuring + branching. Exhaustive over sealed types. | ADTs, branching by type/value. The Scala idiom for polymorphism without inheritance. |

## Input / Output

**File I/O — small (read all) vs large (stream with Using)**

```scala
import scala.io.Source
import scala.util.Using

// Small file — read all at once
val text = Using.resource(Source.fromFile("small.txt"))(_.mkString)
val lines = Using.resource(Source.fromFile("small.txt"))(_.getLines().toList)

// Large file — stream line by line. Using ensures resource cleanup.
Using.resource(Source.fromFile("huge.csv")) { src =>
  src.getLines().foreach { line =>
    process(line)
  }
}

// Even cleaner — Using.apply returns Try, handles close even on exception
Using(Source.fromFile("huge.csv")) { src =>
  src.getLines().drop(1).foreach(process)  // skip header
} match {
  case scala.util.Success(_) => log("done")
  case scala.util.Failure(e) => log(s"failed: ${e.getMessage}")
}

// Java NIO Files.lines is also good — works in Scala with for-comprehensions
import java.nio.file.Files, java.nio.file.Path
Files.lines(Path.of("huge.csv")).forEach(line => process(line))
```

**stdin / stdout / stderr — CLI tools**

```scala
import scala.io.Source

// Read all of stdin
val input = Source.fromInputStream(System.in).mkString

// Stream stdin line by line
Source.fromInputStream(System.in).getLines().foreach { line =>
  println(line.toUpperCase)
}

// Print to stderr
System.err.println("warning: deprecated")

// JSON over stdin/stdout — the standard CLI interop pattern
import upickle.default.*
case class Payload(k: Int, list: List[Int]) derives ReadWriter
val payload = read[Payload](input)
val result = transform(payload)
println(write(result))

// or with circe:
// import io.circe._, io.circe.parser._, io.circe.generic.semiauto._
// val payload = decode[Payload](input).toOption.get
```

**JSON serialization — circe / upickle / munit**

```scala
// circe (Typelevel) — most popular, uses shapeless/Cats
import io.circe._, io.circe.generic.semiauto._, io.circe.parser._, io.circe.syntax._
case class User(id: Int, email: String, role: String = "member")
implicit val encoder: Encoder[User] = deriveEncoder
implicit val decoder: Decoder[User] = deriveDecoder

val json = User(1, "a@b.io").asJson.noSpaces
val user = decode[User](json).fold(e => throw e, identity)

// Scala 3 derives — no implicit boilerplate
case class Payload(k: Int, list: List[Int]) derives ReadWriter  // upickle
val s = write(Payload(1, List(1, 2)))
val p = read[Payload](s)

// Pick by use case:
//  - circe: largest ecosystem, Cats integration
//  - upickle: lightweight, fast, Scala 3 derives
//  - zio-json: ZIO integration, fastest
//  - jsoniter: tiny, fast
```

**HTTP client (sttp) with retries**

```scala
import sttp.client3._
import sttp.client3.upicklejson._
import scala.concurrent.Future
import scala.concurrent.duration._
import concurrent.ExecutionContext.Implicits.global

def getJson(url: String): Future[Map[String, ujson.Value]] = {
  val backend = HttpClientFutureBackend()
  basicRequest
    .get(uri"$url")
    .header("Accept", "application/json")
    .readTimeout(10.seconds)
    .response(asJson[ujson.Value])
    .send(backend)
    .map { resp =>
      resp.body match {
        case Right(json) => json.obj.toMap
        case Left(err)   => throw new RuntimeException(s"HTTP ${resp.code}: $err")
      }
    }
}

// sttp supports sync / Future / cats-effect IO / ZIO — same API.
// For retries, wrap with retry policy via sttp's retry mechanism or cats-retry.
```

## Loops & Iteration

**map / filter / fold — functional trinity**

```scala
val nums = (1 to 10).toList

// map — transform each element
val squares = nums.map(_ * 2)

// filter — keep elements matching predicate
val evens = nums.filter(_ % 2 == 0)

// collect — filter + map in one (partial function)
val parsed = List("1", "2", "x").collect { case s if s.toIntOption.isDefined => s.toInt }

// fold / reduce — fold left with seed
val sum = nums.fold(0)(_ + _)
val product = nums.reduce(_ * _)

// Chained pipelines read top-to-bottom
nums.filter(_ % 2 == 0).map(_ * _).fold(0)(_ + _)
```

**for-comprehensions — the Scala idiom**

```scala
// For-comprehension desugars to map/flatMap/withFilter — works on any monad.
val result = for {
  x <- List(1, 2, 3)
  if x > 1
  y <- List(10, 20)
} yield x + y
// = List(12, 22, 13, 23)

// Without yield — imperative, returns Unit (desugars to foreach)
for (x <- List(1, 2, 3)) println(x)

// Works on Option, Either, Future, IO, LazyList, etc.
val opt: Option[Int] = for {
  x <- Some(5)
  y <- Some(10)
} yield x + y
// = Some(15)

// Multi-step Option chains read like flatMap but cleaner
val user: Option[User] = for {
  id   <- findId
  user <- loadUser(id)
  if user.active
} yield user
```

**while / do-while — rare in idiomatic Scala**

```scala
// while — runs while condition is true. Returns Unit.
var n = 0
while (n < 10) {
  if (found(n)) scala.util.boundary.break()
  n += 1
}

// do-while — runs body at least once
var result = ""
do {
  result = tryOnce()
} while (result == "retry")

// Prefer functional iteration (map/foreach/for-comp) over while.
// Use while only when:
//  - you need mutable accumulators with performance constraints
//  - the loop body has side effects and no collection to iterate
//  - you need tail-call optimization the compiler can't verify
```

**LazyList — lazy infinite sequences**

```scala
// LazyList (formerly Stream in 2.12) is lazy — values computed on demand.
val naturals: LazyList[Int] = LazyList.from(1)
naturals.take(5).toList  // List(1, 2, 3, 4, 5) — only 5 values computed

// Fibonacci — infinite, only materialized when consumed
val fibs: LazyList[BigInt] = {
  def go(a: BigInt, b: BigInt): LazyList[BigInt] = a #:: go(b, a + b)
  go(0, 1)
}
fibs.take(10).toList  // List(0, 1, 1, 2, 3, 5, 8, 13, 21, 34)

// #:: is LazyList's cons operator (like :: for List).

// Pipelines stay lazy until .toList / .foreach
naturals
  .filter(_ % 2 == 0)
  .map(x => x * x)
  .take(5)
  .toList  // List(4, 16, 36, 64, 100)
```

## Functions & Callables

**def, defaults, named args, vararg, by-name**

```scala
// Standard function — expression body
def add(a: Int, b: Int): Int = a + b

// Defaults + named args
def greet(name: String, greeting: String = "Hello"): String =
  s"$greeting, $name!"
greet("Alice")                // Hello, Alice!
greet("Alice", greeting = "Hi")  // Hi, Alice!

// Vararg
def sum(nums: Int*): Int = nums.sum
sum(1, 2, 3)                  // 6
val xs = List(1, 2, 3)
sum(xs: _*)                   // spread — pass list as varargs

// By-name parameter — defers evaluation until used (powers custom DSLs)
def debug(msg: => String): Unit =
  if (loggingEnabled) println(msg)  // msg only evaluated if needed
debug(s"expensive: ${compute()}")
```

**Lambdas + closures + partial application**

```scala
// Lambda — anonymous function. _ is placeholder for single arg.
List(1, 2, 3).map(_ * 2)         // List(2, 4, 6)
List(1, 2, 3).map(x => x * 2)    // explicit

// Multi-arg lambda
List(1, 2, 3).reduce((a, b) => a + b)
List(1, 2, 3).reduce(_ + _)      // underscore shorthand

// Closure — captures outer scope
val factor = 10
val multiply = (x: Int) => x * factor
multiply(5)  // 50

// Partial application — fix some args, defer the rest
def add(a: Int, b: Int, c: Int): Int = a + b + c
val add5 = add(5, _: Int, _: Int)
add5(10, 20)  // 35

// Curried functions
def addCurried(a: Int)(b: Int): Int = a + b
val add5 = addCurried(5) _
add5(10)  // 15
```

**Higher-order functions + composition**

```scala
// Function as a value — Int => Int is a type
type IntOp = Int => Int
val double: IntOp = _ * 2
val inc: IntOp = _ + 1

// Compose — right-to-left: (f compose g)(x) == f(g(x))
val both = double compose inc
both(5)  // double(inc(5)) = double(6) = 12

// AndThen — left-to-right: (f andThen g)(x) == g(f(x))
val both2 = inc andThen double
both2(5)  // double(inc(5)) = 12

// Higher-order — function takes/returns functions
def twice[A](f: A => A): A => A = x => f(f(x))
val add4 = twice(inc)
add4(0)  // inc(inc(0)) = 2  -- wait, _ + 1 + 1 = 2

// Map values through a list of functions
val transforms = List(double, inc, (_: Int) * 10)
val result = transforms.foldLeft(5)((x, f) => f(x))  // 5 -> 10 -> 11 -> 110
```

**Contextual abstraction — given/using (Scala 3)**

```scala
// Typeclass pattern — define behavior once, compiler threads it through.
trait Show[A]:
  extension (a: A) def show: String

object Show:
  given Show[Int]    with extension (a: Int)    def show = a.toString
  given Show[String] with extension (a: String) def show = a
  given Show[List[?]] with
    extension [A](xs: List[A])(using s: Show[A]) def show =
      xs.map(_.show).mkString("[", ", ", "]")

// 'using' parameter — the compiler fills it from givens in scope
def log[A](a: A)(using s: Show[A]): String = s"a = ${a.show}"

@main def go = log(List(1, 2, 3))   // "a = [1, 2, 3]"
// Compiler finds the right Show instance per call site automatically.

// Scala 2 syntax (still works in 3): implicit val/def/param.
```

## Error Handling

**try / catch / finally — Java-style but expression-capable**

```scala
// try is an expression — returns the value of try or catch block
val n: Int = try {
  parse(input)
} catch {
  case e: NumberFormatException => -1
  case e: NullPointerException  => 0
} finally {
  cleanup()  // always runs; doesn't affect the return value
}

// Pattern-match in catch — like Java's multi-catch but more powerful
try {
  risky()
} catch {
  case _: IOException | _: SQLException => fallback()  // multiple types
  case e: AppError                      => handle(e)
  case NonFatal(e)                      => log(e); throw e  // catch non-fatal
}

// Don't catch Fatal errors (OutOfMemoryError, StackOverflowError) —
// scala.util.control.NonFatal filters them out for you.
```

**Option / Either / Try — typed error channels**

```scala
// Option[T] — Some(T) or None. Replaces null.
def findUser(id: Int): Option[User] = ...
findUser(1) match {
  case Some(u) => println(u.email)
  case None    => println("not found")
}

// Either[E, A] — Left(error) or Right(success). Right = success by convention.
def parse(raw: String): Either[String, Int] =
  try Right(raw.toInt)
  catch { case _: NumberFormatException => Left(s"bad: $raw") }

// Try[A] — wraps exceptions as values. Success(A) or Failure(Throwable).
import scala.util.{Try, Success, Failure}
val result: Try[Int] = Try(riskyComputation())
result match {
  case Success(v) => println(s"got $v")
  case Failure(e) => println(s"err: ${e.getMessage}")
}

// Prefer Either for business errors (typed), Try for exception-wrapping.
// Use Option for absence without error context.
```

**Custom errors + ADT hierarchy**

```scala
// Model errors as a sealed ADT — exhaustive match, type-safe.
sealed trait AppError extends Product with Serializable
object AppError:
  final case class NotFound(id: Int)         extends AppError
  final case class Validation(field: String) extends AppError
  final case class Unauthorized(reason: String) extends AppError
  case object Conflict                        extends AppError

def findUser(id: Int): Either[AppError, User] =
  if (id < 0) Left(AppError.Validation("id must be positive"))
  else if (!exists(id)) Left(AppError.NotFound(id))
  else Right(load(id))

// Pattern match — exhaustive, compiler-checked
findUser(-1) match
  case Right(u)                 => println(s"got ${u.email}")
  case Left(AppError.NotFound(id))      => println(s"missing $id")
  case Left(AppError.Validation(field)) => println(s"bad $field")
  case Left(AppError.Unauthorized(r))   => println(s"denied: $r")
  case Left(AppError.Conflict)          => println("conflict")
  // No 'else' — compiler knows the hierarchy is closed.
```

**Effect systems — IO (cats-effect / ZIO)**

```scala
import cats.effect.{IO, Async}
import cats.syntax.all.*

// IO is a description of an effect — referentially transparent, lazy.
def fetchUser(id: Int): IO[User] = IO.blocking {
  db.find(id)  // blocking call wrapped in IO
}

// For-comprehensions over IO — like async/await but typed and pure
def upsertEmail(id: Int, email: String): IO[User] = for {
  existing <- fetchUser(id)
  updated  <- existing match {
                case Some(u) => saveUser(u.copy(email = email)).as(u.copy(email = email))
                case None    => IO.raiseError(new RuntimeException(s"missing $id"))
              }
} yield updated

// Error handling with .handleErrorWith
fetchUser(1).handleErrorWith {
  case e: SQLException => IO.println(s"db error: ${e.getMessage}").as(User.placeholder)
  case NonFatal(e)     => IO.raiseError(e)
}

// IO is cancellable, composable, referentially transparent —
// unlike Future (eager, side-effecting on construction).
```

## Concurrency Model

**Future — eager async on ExecutionContext**

```scala
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.duration.*
import scala.util.{Success, Failure}
import concurrent.Await

given ExecutionContext = ExecutionContext.global

// Future is eager — starts running immediately upon construction.
def fetchUser(id: Int): Future[User] = Future {
  db.find(id)
}

// for-comprehension over Future — sequential awaits
def loadAll(ids: List[Int]): Future[List[User]] = for
  users <- Future.traverse(ids)(fetchUser)
yield users

// Parallel fan-out — Future.traverse / Future.sequence
val futures: List[Future[User]] = ids.map(fetchUser)
val all: Future[List[User]] = Future.sequence(futures)

// Await only at the edge (main / tests) — never inside services
val result = Await.result(loadAll(List(1, 2, 3)), 10.seconds)

// Future is eager — 'Future(heavy())' runs heavy() IMMEDIATELY.
// Use cats-effect IO for referentially transparent, lazy effects.
```

**IO (cats-effect) — typed, cancellable, pure**

```scala
import cats.effect.{IO, Async, Temporal}
import cats.syntax.all.*

def fetchUser(id: Int): IO[User] = IO.blocking(db.find(id))

// IO is lazy — nothing runs until .unsafeRunSync() at the edge.
def loadAll(ids: List[Int]): IO[List[User]] =
  ids.parTraverse(fetchUser)  // parallel fan-out

// Cancellable
val longTask = IO.sleep(10.seconds) >> IO.println("done")
val cancelable = longTask.unsafeRunCancelable()
cancelable.cancel()  // cancels the fiber

// Race — first to complete wins (like Promise.race)
val result = IO.race(
  fetchUser(1),
  IO.sleep(1.second) >> IO.raiseError(new TimeoutException)
)

// Resource — guaranteed cleanup, even on cancellation/exception
def withDb: Resource[IO, Connection] = Resource.make(IO(openDb))(c => IO(c.close))
withDb.use { conn => fetchUser(conn, 1) }  // conn auto-closed
```

**ZIO — alternative effect system**

```scala
import zio.*
import zio.console.*

// ZIO is similar to cats-effect IO but with environment types + better ergonomics.
// ZIO[R, E, A] = effect requiring env R, may fail with E, succeeds with A.

def fetchUser(id: Int): ZIO[Any, Throwable, User] =
  ZIO.effect(db.find(id))

// For-comprehensions work the same
def loadAll(ids: List[Int]): ZIO[Any, Throwable, List[User]] =
  ZIO.foreachPar(ids)(fetchUser)  // parallel fan-out

object App extends App:
  def run(args: List[String]): URIO[ZEnv, ExitCode] =
    loadAll(List(1, 2, 3))
      .tap(users => putStrLn(s"loaded ${users.size} users"))
      .exitCode

// ZIO has its own runtime, supervision, fiber model — alternative to cats-effect.
// Choose based on ecosystem: cats-effect (Typelevel) vs ZIO.
```

**Streams — fs2 (cats-effect) / Akka Streams**

```scala
import fs2.*
import cats.effect.IO

// fs2 Stream — pure functional streaming. Cold, single-consumer by default.
val stream: Stream[IO, Int] = Stream.range(0, 100)

// Pipeline operators
val result: Stream[IO, Int] = stream
  .filter(_ % 2 == 0)
  .map(_ * 2)
  .take(5)

// Compile to IO — runs the stream, materializes the result
val io: IO[List[Int]] = result.compile.toList

// Backpressure — fs2 is naturally pull-based (consumer asks for next chunk).
// Concurrency — .parEvalMap(maxConcurrent) for parallel processing
val fetched: Stream[IO, User] = Stream.emits(ids)
  .parEvalMap(10)(id => fetchUser(id))  // 10 concurrent fetches

// Akka Streams (now Pekko) — alternative, more imperative, integrates with Actors.
```

## Testing Patterns

**ScalaTest — the dominant test framework**

```scala
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class UserSpec extends AnyFlatSpec with Matchers {
  "User" should "validate a real email" in {
    val user = User(1, "a@b.io")
    user.isValid shouldBe true
    user.email shouldEqual "a@b.io"
  }

  it should "reject bad emails" in {
    an [ValidationException] should be thrownBy User(1, "nope")
  }

  // Parametrized via forAll
  it should "reject bad inputs" in {
    forAll(List("", "nope", "a@@b.io")) { email =>
      an [ValidationException] should be thrownBy User(1, email)
    }
  }
}

// Multiple styles: AnyFlatSpec, AnyFunSpec, WordSpec, FreeSpec, PropSpec.
// Pick one per codebase — consistency matters.
```

**munit — modern, lightweight alternative**

```scala
import munit.FunSuite

class UserSuite extends FunSuite {
  test("validates a real email") {
    val user = User(1, "a@b.io")
    assertEquals(user.isValid, true)
    assertEquals(user.email, "a@b.io")
  }

  test("rejects bad emails") {
    intercept[ValidationException] {
      User(1, "nope")
    }
  }

  // Parametrized via tests() returning a list of (name, fn)
  test("rejects bad inputs") {
    for (email <- List("", "nope", "a@@b.io")) {
      intercept[ValidationException] { User(1, email) }
    }
  }
}

// munit is simpler than ScalaTest — fewer styles, less ceremony.
// Prefer it for new projects; ScalaTest for legacy.
```

**Property-based testing — ScalaCheck**

```scala
import org.scalacheck._
import org.scalacheck.Prop.forAll

object UserSpec extends Properties("User"):
  property("roundtrip via JSON") = forAll { (id: Int, email: String) =>
    val u = User(id, email)
    val json = u.asJson.noSpaces
    val back = decode[User](json).fold(throw _, identity)
    back == u
  }

  // Custom generators for constrained values
  val validEmail: Gen[String] = for {
    name <- Gen.alphaStr
    dom  <- Gen.alphaStr
  } yield s"$name@$dom.com"

  property("valid email accepted") = forAll(validEmail) { email =>
    User(1, email).isValid
  }

// ScalaCheck generates edge cases you didn't think of.
// Integrates with ScalaTest via ScalaCheckDrivenPropertyChecks trait.
```

**Mocks — ScalaMock / Mockito-Scala**

```scala
import org.scalamock.scalatest.MockFactory
import org.scalatest.flatspec.AnyFlatSpec

class UserServiceSpec extends AnyFlatSpec with MockFactory {
  "UserService" should "fetch from repo" in {
    val repo = mock[UserRepository]
    val service = UserService(repo)

    // Arrange
    (repo.find _).expects(1).returning(Some(User(1, "a@b.io")))
    (repo.find _).expects(2).returning(None)

    // Act + Assert
    service.getEmail(1) shouldBe "a@b.io"
    service.getEmail(2) shouldBe null
  }
}

// Alternatives:
//  - Mockito-Scala: more fluent API, 'when'/'verify' syntax
//  - mockito-scala-cats: cats-effect support
//  - For pure functional code: prefer stubs via typeclass instances over mocks.
```

## Performance Tuning

- JIT warms up over ~30s-2min; cold-start Scala apps are slower than native binaries. Use GraalVM native-image for instant start.
- Tail-call optimization only happens with @tailrec annotation + literal self-recursion — mutual recursion uses trampolines.
- Case classes generate equals/hashCode/copy/apply/unapply — zero runtime cost vs hand-written. Pattern matching uses unapply to destructure.
- For-comprehensions desugar to map/flatMap/withFilter — work on any type with those methods (List, Option, Future, IO, Try).
- List prepend (::) is O(1); append (:+) is O(n). Always prepend + reverse if you need to build in order.
- Vector is O(log32 n) for all ops — better than List for indexed access on immutable data.
- Array is mutable JVM array — O(1) indexed access. Use for performance-critical numerics, then .toSeq to expose immutably.
- Specialize generic methods with @specialized to avoid boxing for primitive types (Int, Long, Double).
- Value classes (extends AnyVal) compile to zero-allocation wrappers — typed IDs without runtime cost.
- opaque type (Scala 3) is zero-cost newtype — distinct type at compile time, erased at runtime.
- Avoid creating intermediate collections — use LazyList (lazy) or .iterator (one-pass) for large pipelines.
- Mutable collections (scala.collection.mutable) are 2-5x faster than immutable for tight loops — accept the trade-off deliberately.
- Future is eager — starts running immediately on construction. Use cats-effect IO for referentially transparent, lazy effects.
- Implicit resolution can blow up compile times — keep implicit scope tight, use Scala 3 given/using for cleaner errors.
- JMH (sbt-jmh) is the standard for microbenchmarks; tap into JIT compilation + warmup. Run with -gc true to avoid GC noise.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [sbt](https://www.scala-sbt.org/) | Build tool — the de-facto Scala standard. Powerful but slow startup. sbt 2.0 in development. | build |
| [Mill](https://mill-build.com/) | Modern build tool — faster than sbt, simpler config. Li Haoyi (the author of many Scala libs). | build |
| [scala-cli](https://scala-cli.virtuslab.org/) | Single-file Scala scripts — like python script.py. Powers-up quick prototyping. | build |
| [Coursier](https://get-coursier.io/) | Dependency resolver + artifact fetcher — replaces Ivy, much faster. Powers sbt/Mill underneath. | package |
| [ScalaTest](https://www.scalatest.org/) | The dominant test framework — multiple styles (FlatSpec, FunSpec, WordSpec, FreeSpec). | test |
| [munit](https://scalameta.org/munit/) | Modern lightweight test framework — simpler than ScalaTest, used by Typelevel projects. | test |
| [ScalaCheck](https://www.scalacheck.org/) | Property-based testing — generates edge cases automatically. Like Haskell's QuickCheck. | test |
| [ScalaMock](https://scalamock.org/) | Native Scala mocking — strongly typed, less magic than Mockito. | test |
| [Scalafmt](https://scalameta.org/scalafmt/) | Code formatter — opinionated, like gofmt. Config in .scalafmt.conf. | lint |
| [Scalafix](https://scalacenter.github.io/scalafix/) | Linter + refactoring tool — runs rules for migration, deprecations, code smells. | lint |
| [Metals](https://scalameta.org/metals/) | LSP language server — VS Code / Vim integration. Powered by Bloop + SemanticDB. | lint |
| [IntelliJ Scala](https://www.jetbrains.com/help/idea/scala.html) | JetBrains' Scala plugin — best IDE refactoring support. Free CE version. | build |
| [cats](https://typelevel.org/cats/) | Typelevel FP library — typeclasses (Monoid, Functor, Monad), data types (NonEmptyList, Validated). | build |
| [cats-effect](https://typelevel.org/cats-effect/) | Pure functional effect system — IO type, Resource, fiber-based concurrency. | build |
| [ZIO](https://zio.dev/) | Alternative effect system — environment types, supervision, fiber model. Ziverge. | build |
| [Akka / Pekko](https://pekko.apache.org/) | Actor framework + streams — Akka is Lightbend (now BSL license); Pekko is the Apache fork. | build |
| [Apache Spark](https://spark.apache.org/) | Distributed data processing — Scala is the primary API. Spark 4 supports Scala 2.13. | build |
| [fs2](https://fs2.io/) | Functional streams — pure, resource-safe, cats-effect-based. The Typelevel streaming answer. | build |
| [http4s](https://http4s.org/) | Pure functional HTTP server/client — Typelevel, cats-effect based. | build |
| [tapir](https://tapir.softwaremill.com/) | Type-safe HTTP API description — generates OpenAPI docs, server stubs, clients from one definition. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 2004 | First release by Martin Odersky (EPFL). JVM-targeted, Java interop. |
| 2.0 | 2006 | First stable release. Traits, pattern matching, case classes, implicits. |
| 2.8 | 2010 | Collection redesign (scala.collection), named/default args, package objects. |
| 2.9 | 2011 | Parallel collections, ThreadLocal Random, performance work. |
| 2.10 | 2013 | SIP-14 Futures + Promises, Scala Reflection, macro paradise, Akka integrated. |
| 2.11 | 2014 | Performance, modularization, SAM types (preview), better Java 8 interop. |
| 2.12 | 2016 | Java 8 required, SAM types full, trait compilation to interfaces, Java 8 streams interop. |
| 2.13 | 2019 | Collection redesign (simpler, faster), Dotty development begins, stdlib cleanup. |
| 3.0 | 2021 | Scala 3 (Dotty) released. New syntax (indentation, enums, givens/using), intersection/union types, no macros (uses Mirror). |
| 3.1 | 2021 | Scala 3 LTS — long-term support line, stable for production. |
| 3.2 | 2022 | Context functions, named type args, MatchType improvements. |
| 3.3 | 2023 | Scala 3.3 LTS — second LTS line. Stable for libraries + production. Backwards-compat with 3.1.x. |
| 3.4 | 2024 | Better error messages, -language:strictEquality preview, smaller compiler fixes. |
| 3.5 | 2024 | Iteration over syntax improvements, performance, better Java interop. |
| 3.9 (LTS) | 2026 | New LTS baseline (Sep 2026, succeeding 3.3); stdlib optimized via the backend optimizer; requires JDK 17+, runs on JDK 24+. |

## Interview Hot Questions

1. **What's the difference between a trait and an abstract class?** *(easy)*

   A trait is an interface with optional default implementations; a class can mix in MULTIPLE traits (multiple inheritance of behavior). An abstract class is a single-inheritance base that can have constructor parameters (traits can't in Scala 2, can in Scala 3 with parameters). Use traits for the 90% case — they're more flexible. Use abstract classes when you need constructor parameters (Scala 2), want to enforce a single-inheritance hierarchy, or need Java interop (Java can extend abstract classes but not traits directly).

2. **Explain case classes and what the compiler generates for them.** *(medium)*

   case class auto-generates: (1) companion object with apply (so you write User(1) not new User(1)), (2) equals/hashCode based on all constructor fields, (3) toString like 'User(1,a@b.io)', (4) copy with named-arg overrides, (5) componentN for destructuring (val (id, email) = user), (6) unapply for pattern matching. They're immutable by default (val fields) and sealed-friendly. The generated equals compares all fields structurally — two User(1, a) instances are equal.

3. **What's a for-comprehension and how does it desugar?** *(medium)*

   for { x <- xs; if p(x); y = f(x); z <- ys(x) } yield z desugars to: xs.withFilter(p).map(x => (x, f(x))).flatMap { case (x, y) => ys(x).map(z => z) }. Generators (<-) become flatMap (or foreach without yield); filters (if) become withFilter; assignments (=) become map. Crucially, it works on ANY type with these methods — List, Option, Either, Future, IO, Try. So a for-comp over Option composes None-shortcircuiting; over IO composes effect sequencing.

4. **Explain implicits / given+using and the typeclass pattern.** *(hard)*

   Implicits (Scala 2) / givens (Scala 3) are values the compiler auto-passes to functions declared with implicit/using parameters. Resolution is by TYPE — the compiler looks for a given of the right type in scope. The typeclass pattern: define a trait (e.g. Show[A]), provide given instances for each concrete type, then write generic functions def log[A](a: A)(using Show[A]). The compiler threads the right Show through every call. This is how Cats, ZIO, and Spark's Encoders work. Scala 3's given/using syntax is cleaner than Scala 2's implicit, with better error messages.

5. **What's the difference between Future and IO (cats-effect)?** *(medium)*

   Future is EAGER — construction starts the computation immediately on the ExecutionContext. IO is LAZY — construction builds a description; nothing runs until .unsafeRunSync() at the edge. Future is referentially opaque (val f = Future(heavy()); f vs f + f runs heavy once or twice). IO is referentially transparent — val io = IO(heavy()); io >> io runs heavy twice, predictably. Future isn't cancellable; IO is. Future is fine for simple async; IO (or ZIO) is the choice for production FP code that needs composability, cancellation, and resource safety.

6. **How does pattern matching work and what's 'unapply'?** *(medium)*

   match { case Pattern => ... } destructures values. Patterns can be: literals (1, 'a'), constructors (Some(x), User(id, _)), sequences/extractors (List(1, 2, _*)), typed (case x: Int =>), guards (case x if x > 0 =>), and named/positional bindings. Case classes auto-generate unapply in their companion object, which the compiler calls to destructure. You can write custom extractors via custom unapply/unapplySeq on any object. Pattern matching over sealed hierarchies is exhaustive — the compiler errors if you miss a case.

7. **What's a sealed trait and why use it?** *(easy)*

   A sealed trait (or class) has a closed hierarchy — all direct subtypes must be in the same file (Scala 2) or same package (Scala 3). The compiler knows the complete set, so pattern matching can be exhaustive without an else/case _ branch. Adding a new subtype makes the compiler flag every match that doesn't handle it — exhaustive-by-construction refactoring. This is the Scala equivalent of Rust's enums / Haskell's ADTs. Use sealed for state machines, Results, parsing ASTs, anything where the closed set matters.

8. **Explain tail-call optimization in Scala.** *(medium)*

   Scala optimizes literal self-recursion to a loop (no stack growth) when annotated with @tailrec — the compiler errors if it can't TCO. Non-tail recursion (e.g., factorial's n * factorial(n-1)) still uses stack. Mutual recursion can't be TCO'd directly — use trampolines (cats-effect IO) or rewrite as a single self-recursive function. The @tailrec annotation is a compile-time check, not a runtime optimization — if your 'tail call' isn't actually a tail call (because you wrap it in arithmetic), the compiler rejects it. Always annotate recursive functions to ensure TCO.

9. **How does Spark use Scala's features?** *(hard)*

   Spark uses Scala's case classes for schema inference (Encoder derives field names/types from case class structure at compile time), implicits to thread SparkSession/Encoders, and for-comprehensions over RDD/DataFrame APIs. The DataFrame API is a DSL that uses Scala's operator overloading + implicit conversions. Spark 4 supports Scala 2.13; Spark on Scala 3 is experimental because macro-based libraries (Circe, Magnolia) break across versions. The Scala choice for Spark is significant — the PySpark API is a thin wrapper over the Scala JVM core.

10. **What's the difference between Scala 2 and Scala 3 (Dotty)?** *(hard)*

   Scala 3 (released 2021) is a ground-up redesign: (1) new syntax — optional indentation-based, enums, given/using replaces implicit val/def with cleaner semantics; (2) union/intersection types as first-class; (3) typeclass derivation via Mirror (no macro paradise); (4) better error messages (the famous '200-line implicit error' is now ~10 lines); (5) no break-the-world macros — metaprogramming via Quotes API. Scala 2.13 libraries interop with Scala 3 via TASTy. New projects should target Scala 3 (3.3 LTS); migrating existing Scala 2 code is gradual via the -Xsource:3 flag.

## When to Choose This

- **vs Kotlin:** use this — Big-data pipelines (Spark/Flink), type-safe FP with typeclasses, anywhere you want HKT and ADTs.; use that — Android, server backends where you want less compile complexity, anywhere full Java interop matters more than type system power.
- **vs Java:** use this — Type-safe functional programming, ADTs + pattern matching, anywhere Scala's expressiveness beats Java's verbosity.; use that — Large enterprise codebases already in Java, teams with deep Java expertise, anywhere the JVM library ecosystem matters more than syntax.
- **vs Haskell:** use this — JVM production (full Java interop), Spark/Flink data pipelines, anywhere you want pragmatic FP with OO escape hatches.; use that — Pure FP with no escape hatches, anywhere you want the most powerful type system (HKT, type families, type-level programming) without JVM overhead.
- **vs Rust:** use this — JVM-targeted systems, anywhere you want GC + Java interop + FP ergonomics without borrow-checker friction.; use that — Systems programming, embedded, anywhere memory-safety without runtime cost is non-negotiable.
- **vs Clojure:** use this — Static typing with ADTs and typeclasses, anywhere you want compile-time type safety over dynamic Lisp ergonomics.; use that — REPL-driven development, dynamic typing, anywhere you want Lisp simplicity + JVM reach without Scala's compile-time complexity.

