import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "scala",
  name: "Scala",
  category: "languages",
  tier: 2,
  tags: ["static", "jvm", "functional", "object-oriented", "concurrent", "spark", "type-safe"],
  tagline: "JVM language fusing OO and functional programming — strong static types, type inference, and the engine behind Apache Spark and modern data engineering.",
  year: 2004,
  author: "Martin Odersky (EPFL)",

  tldr: [
    "Scala is a statically-typed, JVM-targeted language that unifies object-oriented and functional programming — everything is an object, functions are first-class, pattern matching is structural, and the type system supports algebraic data types, higher-kinded types, and implicits (now contextual).",
    "It powers the Apache Spark / Kafka / Flink data ecosystem and is widely used for high-throughput backend services (Twitter, Stripe, Netflix) via Akka/Pekko, http4s, and Play.",
    "Reach for Scala when you need type-safe functional programming on the JVM, when working with Spark/Flink/Kafka Streams, or when you want to express domain models with sum types and pattern matching while keeping full Java interop.",
    "Avoid Scala for short-lived scripts (slow compiler bootstrap), for teams allergic to build complexity (sbt has a learning curve), or where the binary-compat story across versions (2.12/2.13/3) creates friction — pick a single version per project.",
  ],

  mentalModel: {
    title: "ADTs + pattern matching + givens = typed-by-construction domains",
    body: "Scala's sweet spot is modeling a domain as a sealed trait with case classes — the compiler enforces exhaustive matching, so adding a new variant surfaces every site that needs updating. Functions are values: `List[Int] => Int` is a real type, and `map`/`flatMap`/`filter` compose like rivers flowing through your data. The third pillar is contextual abstraction — `given` instances (Scala 3) or `implicit` values (Scala 2) let you declare typeclass instances once and have the compiler thread them through call sites, which is how Cats, ZIO, and Spark's encoders work. The trap: Scala 2's implicits were powerful but cryptic (resolution rules could pull a 200-line error); Scala 3 replaced them with cleaner `given`/`using` syntax that's worth the upgrade if you can afford it.",
  },

  constructs: [
    { syntax: "val x = 5 / var y = 5", behavior: "Immutable vs mutable binding — type inferred.", when: "Default to `val`; reserve `var` for genuinely mutable state (rare)." },
    { syntax: "def f(x: Int, y: Int = 0): Int = x + y", behavior: "Method with default arg and expression body.", when: "Default for any pure-ish function; `=` makes it an expression." },
    { syntax: "case class User(id: Int, email: String)", behavior: "Immutable value class — auto generates equals/hashCode/copy/apply/unapply.", when: "The default for domain models; powers pattern matching." },
    { syntax: "sealed trait Shape; case class Circle(r: Double) extends Shape", behavior: "Closed algebraic data type — exhaustive match enforced.", when: "ADTs, state machines, Results; the canonical Scala pattern." },
    { syntax: "object Foo { def bar = 1 }", behavior: "Singleton object — also a module/namespace and the companion of class Foo.", when: "Module pattern, factory methods, the home of `apply`/`unapply`." },
    { syntax: "xs.map(_ * 2).filter(_ > 5)", behavior: "Higher-order collection methods with placeholder syntax.", when: "The 80% of list manipulation; prefer over for-loops." },
    { syntax: "for { x <- xs; if x > 0; y = x * 2 } yield y", behavior: "For-comprehension — desugars to map/flatMap/withFilter.", when: "Multi-step transforms; works on any monad (List, Option, Future, IO)." },
    { syntax: "Option[T] / Either[E, A] / Try[A]", behavior: "Sum types for absence, errors, exceptions — never throw in business code.", when: "Always prefer over null/try-catch; forces callers to handle both branches." },
    { syntax: "Future[A] / IO[A] (cats-effect)", behavior: "Async computation — Future is eager, IO is referentially transparent.", when: "Future for fire-and-forget; IO (ZIO/cats-effect) for typed, cancellable effects." },
    { syntax: "given ord: Ordering[Int] = ...", behavior: "Contextual instance — compiler threads it into any `using Ordering[Int]` call.", when: "Scala 3 syntax for typeclasses; replaces Scala 2 `implicit val`." },
    { syntax: "extension (s: String) def slug = s.toLowerCase.replace(' ', '-')", behavior: "Adds a method to an existing type — extension method (Scala 3).", when: "Ad-hoc API on third-party types without subclassing." },
    { syntax: "enum Color { case Red, Green, Blue }", behavior: "Scala 3 enum — first-class ADT with parameters possible.", when: "Simple enumerations; scala.Enumeration is legacy." },
  ],

  patterns: [
    {
      lang: "scala",
      caption: "Sealed ADT + exhaustive match — the domain modeling pattern",
      code: `sealed trait Payment extends Product with Serializable
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
// doesn't handle it — exhaustive-by-construction refactoring.`,
    },
    {
      lang: "scala",
      caption: "Tagless final + IO — typed, testable effectful services",
      code: `import cats.effect.{IO, Async}
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

// Production wires IO; tests use cats.Id for pure synchronous execution.`,
    },
    {
      lang: "scala",
      caption: "Spark — the canonical data engineering pipeline",
      code: `import org.apache.spark.sql.{SparkSession, functions => F}
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

result.write.mode("overwrite").parquet("s3://bucket/summary/")`,
    },
    {
      lang: "scala",
      caption: "Given/using — typeclass instances, the modern way (Scala 3)",
      code: `trait Show[A]:
  extension (a: A) def show: String

object Show:
  given Show[Int]    with extension (a: Int)    def show = a.toString
  given Show[String] with extension (a: String) def show = a
  given Show[List[?]] with
    extension [A](xs: List[A])(using s: Show[A]) def show =
      xs.map(_.show).mkString("[", ", ", "]")

def log[A](a: A)(using s: Show[A]): String = s"a = \${a.show}"

@main def go = log(List(1, 2, 3))   // "a = [1, 2, 3]"
// Compiler finds the right Show instance per call site automatically.`,
    },
  ],

  pitfalls: [
    {
      title: "Implicit resolution produces 200-line error messages",
      symptom: "Missing `cats.Applicative[IO]` import surfaces a chain of ambiguous candidate errors spanning hundreds of lines — the actual fix is one import.",
      fix: "Read the top of the error (the failing call) and the bottom (the missing instance), ignore the middle. Use Scala 3's `using` syntax for cleaner messages. Enable `-Xlog-implicits` only when actively debugging.",
    },
    {
      title: "Default collections are mutable in Scala 2.x stdlib",
      symptom: "`scala.collection.mutable.ListMap` vs `immutable.Map` — the unqualified `Map` resolves to immutable (good) but `Array` is always mutable, and `var x = List(...)` lets you reassign even though the list itself is immutable.",
      fix: "Default to `immutable` collections; import `scala.collection.mutable` explicitly only when needed. Reserve `var` for true mutation; `val List(...)` is the safe default.",
    },
    {
      title: "Future is eager — starts on construction, not on await",
      symptom: "`val f = Future(heavy())` runs `heavy()` immediately on the implicit ExecutionContext — even if you never `await` it. Surprises people coming from JS promises or cats-effect IO.",
      fix: "Use `cats.effect.IO` (or ZIO) for referentially transparent, lazy effects. For Future, defer construction: `def makeF = Future(heavy())` so each call is explicit.",
    },
    {
      title: "`return` inside a closure exits the enclosing method, not the closure",
      symptom: "`xs.map(x => if (x < 0) return -1 else x * 2)` throws `NonLocalReturnControl` — a non-local return that's slow, deprecated, and confusing.",
      fix: "Never use `return` in lambdas. Use `xs.collectFirst` / `xs.find` / `Either` to express early-exit semantics explicitly. Reserve `return` for the very end of methods (or omit it entirely — Scala returns the last expression).",
    },
    {
      title: "Null is allowed by the type system despite `Option`",
      symptom: "`val x: String = null` compiles fine — Scala inherited Java's null. Calling `x.length` throws NPE, bypassing all the Option-based safety you've built.",
      fix: "Enable `-Yexplicit-nulls` (Scala 3) to make `null` explicit at the type level. Use `Option` everywhere a value can be absent. Wrap Java interop calls with `Option(...)`.",
    },
    {
      title: "Macro-based libraries break across minor versions",
      symptom: "Upgrading Scala 2.12.15 → 2.12.18 breaks Circe / Quill / Magnolia because their macros depend on internal compiler APIs that change between patches.",
      fix: "Pin Scala patch versions and the entire dependency set together via `update` or Bloop. For new projects, target Scala 3 (no macros for derivations — uses `Mirror` instead). Check the Scala 3 community build matrix before choosing libraries.",
    },
    {
      title: "`==` calls Java's equals — null-safe but not strictly typed",
      symptom: "`Some(1) == Some(1)` works, but `1 == \"1\"` is allowed by the compiler and returns false at runtime (no type error). Coming from Rust/Haskell, this is jarring.",
      fix: "Use `===` from cats (requires `Eq` typeclass) for type-safe equality in domain code. Reserve `==` for interop and tests where you want loose comparison.",
    },
  ],

  quickReference: [
    { fact: "Scala 3 (Dotty) introduced new syntax: indentation-based, enums, givens/using, intersection/union types, fewer macros.", tag: "version" },
    { fact: "Scala 2.13 standardized on `scala.collection.immutable` defaults; `Seq` resolves to immutable `List`-like via `immutable.Seq`.", tag: "version" },
    { fact: "Case classes generate equals/hashCode/copy/apply/unapply — pattern matching uses `unapply` to destructure.", tag: "perf" },
    { fact: "For-comprehensions desugar to map/flatMap/withFilter — work on any type with those methods (List, Option, Future, IO, Try).", tag: "perf" },
    { fact: "JIT-warmed Scala matches Java's throughput on the JVM; cold start is slower due to class loading and trait linearization.", tag: "perf" },
    { fact: "Tail-call optimization only happens with `@tailrec` annotation + literal self-recursion — mutual recursion uses trampolines.", tag: "perf" },
    { fact: "Typeclass pattern: `trait Show[A]; given Show[Int] with ...` — compiler threads instances into `using` parameters.", tag: "gotcha" },
    { fact: "Implicits/givens are resolved by type, not name — ambiguous instances produce 100+ line errors. Read top + bottom of the error.", tag: "gotcha" },
    { fact: "Spark requires Scala 2.12 for Spark 3.x; Spark 4 supports Scala 2.13. Spark on Scala 3 is experimental.", tag: "version" },
    { fact: "Binary compatibility: Scala 2.13 libraries don't run on 2.12, and Scala 3 needs TASTy interop to use 2.13 artifacts.", tag: "gotcha" },
    { fact: "sbt is the dominant build tool (slow startup, powerful); Mill and scala-cli are modern, faster alternatives.", tag: "version" },
    { fact: "cats-effect / ZIO are the production effect systems — IO is referentially transparent, cancellable, and resource-safe.", tag: "style" },
    { fact: "Avoid `null` — use `Option`. Enable `-Yexplicit-nulls` (Scala 3) for compile-time null safety.", tag: "gotcha" },
    { fact: "Common style: 2-space indent, camelCase methods, PascalCase types. Scalafmt + Scalafix enforce; `.scalafmt.conf` is the source of truth.", tag: "style" },
    { fact: "Use `extension` methods (Scala 3) or implicit classes (Scala 2) to add methods to third-party types — preferred over subclassing.", tag: "style" },
  ],

  goDeeper: [
    { title: "Scala Documentation — Official", url: "https://docs.scala-lang.org/", note: "The language tour + Scala 3 book are the canonical entry points; the Cookbook is excellent for recipes." },
    { title: "Programming in Scala (Odersky, Spoon, Venners)", url: "https://www.artima.com/shop/programming_in_scala_5ed", note: "The canonical book by the language designer; updated for Scala 3 in the 5th edition." },
    { title: "Scala 3 Reference (Dotty)", url: "https://docs.scala-lang.org/scala3/reference/", note: "The reference for all Scala 3 features — type classes, given/using, metaprogramming, etc." },
    { title: "Cats Documentation", url: "https://typelevel.org/cats/", note: "The typeclass library; its docs double as a functional programming primer for Scala." },
    { title: "Functional Programming in Scala (Paul Chiusano & Rúnar Bjarnason)", url: "https://www.manning.com/books/functional-programming-in-scala", note: "The deep treatment of FP using Scala as the teaching language; exercises build a real IO type." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "Byte / Short / Int / Long", behavior: "8/16/32/64-bit signed integer. Int is the default literal type.", when: "Numeric work. Use Long for IDs/timestamps; Int for general use." },
      { syntax: "Float / Double", behavior: "IEEE 754 32/64-bit float. Double is the default literal type.", when: "Math. BigDecimal for money; Float only for graphics / huge arrays." },
      { syntax: "Char", behavior: "16-bit Unicode code unit — quoted with single quotes 'a'.", when: "Single-char work. Use String for text — Char doesn't model grapheme clusters." },
      { syntax: "Boolean", behavior: "true / false — strict, no truthiness coercion.", when: "Logic. 'if (x)' requires x to be Boolean." },
      { syntax: "String", behavior: "Immutable UTF-16 sequence (JVM String). Triple-quoted for raw multi-line.", when: "All text. s\"...\" for interpolation, raw\"...\" for no escapes." },
      { syntax: "Unit", behavior: "Singleton 'no value' type — like void but is a real type with one instance ().", when: "Function return type when there's nothing to return; the type of side effects." },
      { syntax: "Nothing", behavior: "Bottom type — a function returning Nothing never returns (throws, infinite loop).", when: "Type for 'this branch never completes': ???, sys.error, infinite loops." },
      { syntax: "Null / Any / AnyRef / AnyVal", behavior: "Null = bottom of AnyRef (Java null); Any = top; AnyRef = reference supertype; AnyVal = primitive supertype.", when: "Null: avoid; Any/AnyRef: rare interop; AnyVal: value classes." },
    ],
    collections: [
      { syntax: "List[T]", behavior: "Immutable singly-linked list — O(1) prepend/head/tail, O(n) random access.", when: "Functional pipelines, recursive algorithms. The default immutable sequence." },
      { syntax: "Vector[T]", behavior: "Immutable indexed sequence — O(log32 n) for all ops. Fast random access.", when: "Default when you need indexed access on immutable data; better than List for big seqs." },
      { syntax: "Array[T]", behavior: "Mutable JVM array — O(1) indexed access. Invariant, no type erasure.", when: "Performance-critical numerics, Java interop. Use .toSeq to convert to immutable." },
      { syntax: "Map[K, V] / Set[T]", behavior: "Immutable hash map / set — O(1) avg lookup. HashMap/HashSet default impls.", when: "Keyed lookups, dedup. Use mutable.HashMap/Set only for hot mutable code." },
      { syntax: "Seq[T]", behavior: "Abstract immutable sequence — List is the default impl. IndexedSeq for indexed access.", when: "APIs that work on any immutable sequence. Use List/Vector for concrete code." },
      { syntax: "Option[T]", behavior: "Some(T) or None — the typed replacement for null.", when: "Any value that might be absent. NEVER use null in new Scala code." },
      { syntax: "Either[L, R]", behavior: "Left(L) or Right(R) — typed error channel. Right = success by convention.", when: "Typed errors (better than throws). Use Try for exceptions-as-values." },
      { syntax: "Iterator[T]", behavior: "Lazy one-pass iterator — like Java's Iterator. Consumed once, then closed.", when: "Large pipelines without materializing. For lazy streams use LazyList (2.13+)." },
      { syntax: "LazyList[T]", behavior: "Lazy sequence — values computed on demand, memoized. Formerly Stream.", when: "Infinite sequences, large pipelines. .map/.filter are lazy; .toList forces." },
    ],
    custom: [
      { syntax: "class C(val x: Int)", behavior: "Standard class — single inheritance, reference type, JVM interop.", when: "Default for behavior-rich types. Use 'final' or 'sealed' by default." },
      { syntax: "case class User(id: Int, email: String)", behavior: "Immutable value class — auto-generates equals/hashCode/toString/copy/apply/unapply.", when: "Value types; the default for DTOs and domain models. Powers pattern matching." },
      { syntax: "sealed trait Shape; case class Circle(r: Double) extends Shape", behavior: "Closed ADT — exhaustive match enforced. The canonical Scala pattern.", when: "Domain modeling, state machines, Results. Enables totality checks." },
      { syntax: "object Foo { def bar = 1 }", behavior: "Singleton object — also a module/namespace and the companion of class Foo.", when: "Module pattern, factory methods, the home of apply/unapply. Companion object accesses private members." },
      { syntax: "trait T { def f(x: Int): Int }", behavior: "Trait — interface with optional default impl. Multiple inheritance via trait mixing.", when: "Contracts, polymorphism. The Scala equivalent of Java interfaces + abstract classes combined." },
      { syntax: "enum Color { case Red, Green, Blue }", behavior: "Scala 3 enum — first-class ADT with parameters possible.", when: "Simple enumerations; scala.Enumeration is legacy (Scala 2)." },
      { syntax: "opaque type UserID = Long", behavior: "Zero-cost newtype (Scala 3) — distinct type at compile time, erased at runtime.", when: "Typed IDs, units of measure. Replaces value classes for newtype use cases." },
      { syntax: "extension (s: String) def slug = s.toLowerCase.replace(' ', '-')", behavior: "Scala 3 extension method — adds method to existing type.", when: "Ad-hoc API on third-party/stdlib types. Scala 2: implicit class." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b", behavior: "Arithmetic — overloaded for strings (+), collections, numeric types. / is true division on Doubles.", when: "Math. 'a + b' for strings is concatenation; prefer StringBuilder for loops." },
    { syntax: "a % b, a mod b", behavior: "Modulo — % is Java's (sign follows dividend); mod (math) always positive.", when: "Parity, cycling. Use math.IEEEremainder for IEEE-compliant remainder." },
    { syntax: "a == b, a != b", behavior: "Value equality — calls .equals() (null-safe via ==). Reference identity is 'eq' / 'ne'.", when: "Default comparisons. == on Any calls .equals(); for reference identity use eq." },
    { syntax: "a eq b, a ne b", behavior: "Reference identity — same instance. Only on AnyRef (reference types).", when: "Detecting shared references; rare in business code, common in tests/debugging." },
    { syntax: "a < b, a > b, a <= b, a >= b", behavior: "Comparison — requires Ordering. Auto-derived for case classes via Ordered.", when: "Sorting, ranges. Chaining: '1 < x && x < 10' (no '1 < x < 10')." },
    { syntax: "a && b, a || b, !a", behavior: "Short-circuit boolean — strict Boolean, no truthiness.", when: "Logic. Lazy on right side: 'cond && expensive()' skips expensive() if cond is false." },
    { syntax: "if (c) a else b", behavior: "Conditional expression — returns value, not a statement.", when: "Default branching. Always returns a value; can be assigned: val x = if (cond) 1 else 2." },
    { syntax: "a.?(b), a.orElse(b)", behavior: "Option ops — Some(x).?(f) returns f(x); None.?(f) returns None. orElse fallback.", when: "Option chaining. Prefer pattern matching / for-comprehensions for clarity." },
    { syntax: "a <- b (in for-comp)", behavior: "Generator — binds a to each element of b. Desugars to .flatMap / .foreach.", when: "for-comprehensions: for { x <- xs; if x > 0 } yield x * 2." },
    { syntax: "a |> f", behavior: "Pipe (Scala 2.13+) — forwards a as arg to f. Read left-to-right.", when: "Pipeline readability: x |> f |> g instead of g(f(x))." },
    { syntax: "a :: b, a +: b, a :+ b", behavior: "List prepend (::), prepend to any Seq (+:), append (:+). Prepend is O(1) for List.", when: "Building lists. Always prefer prepending (efficient) over appending (O(n))." },
    { syntax: "a ++ b", behavior: "Concatenation — works on collections, strings, iterators.", when: "Combine sequences. List(1,2) ++ List(3,4) == List(1,2,3,4)." },
    { syntax: "a -> b", behavior: "Tuple constructor — creates (a, b). Powers Map literals: Map(a -> 1, b -> 2).", when: "Building pairs/maps. Readable alternative to (a, b)." },
    { syntax: "a match { case ... }", behavior: "Pattern match — destructuring + branching. Exhaustive over sealed types.", when: "ADTs, branching by type/value. The Scala idiom for polymorphism without inheritance." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "scala",
      caption: "File I/O — small (read all) vs large (stream with Using)",
      code: `import scala.io.Source
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
  case scala.util.Failure(e) => log(s"failed: \${e.getMessage}")
}

// Java NIO Files.lines is also good — works in Scala with for-comprehensions
import java.nio.file.Files, java.nio.file.Path
Files.lines(Path.of("huge.csv")).forEach(line => process(line))`,
    },
    {
      lang: "scala",
      caption: "stdin / stdout / stderr — CLI tools",
      code: `import scala.io.Source

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
// val payload = decode[Payload](input).toOption.get`,
    },
    {
      lang: "scala",
      caption: "JSON serialization — circe / upickle / munit",
      code: `// circe (Typelevel) — most popular, uses shapeless/Cats
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
//  - jsoniter: tiny, fast`,
    },
    {
      lang: "scala",
      caption: "HTTP client (sttp) with retries",
      code: `import sttp.client3._
import sttp.client3.upicklejson._
import scala.concurrent.Future
import scala.concurrent.duration._
import concurrent.ExecutionContext.Implicits.global

def getJson(url: String): Future[Map[String, ujson.Value]] = {
  val backend = HttpClientFutureBackend()
  basicRequest
    .get(uri"\$url")
    .header("Accept", "application/json")
    .readTimeout(10.seconds)
    .response(asJson[ujson.Value])
    .send(backend)
    .map { resp =>
      resp.body match {
        case Right(json) => json.obj.toMap
        case Left(err)   => throw new RuntimeException(s"HTTP \${resp.code}: \$err")
      }
    }
}

// sttp supports sync / Future / cats-effect IO / ZIO — same API.
// For retries, wrap with retry policy via sttp's retry mechanism or cats-retry.`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "scala",
      caption: "map / filter / fold — functional trinity",
      code: `val nums = (1 to 10).toList

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
nums.filter(_ % 2 == 0).map(_ * _).fold(0)(_ + _)`,
    },
    {
      lang: "scala",
      caption: "for-comprehensions — the Scala idiom",
      code: `// For-comprehension desugars to map/flatMap/withFilter — works on any monad.
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
} yield user`,
    },
    {
      lang: "scala",
      caption: "while / do-while — rare in idiomatic Scala",
      code: `// while — runs while condition is true. Returns Unit.
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
//  - you need tail-call optimization the compiler can't verify`,
    },
    {
      lang: "scala",
      caption: "LazyList — lazy infinite sequences",
      code: `// LazyList (formerly Stream in 2.12) is lazy — values computed on demand.
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
  .toList  // List(4, 16, 36, 64, 100)`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "scala",
      caption: "def, defaults, named args, vararg, by-name",
      code: `// Standard function — expression body
def add(a: Int, b: Int): Int = a + b

// Defaults + named args
def greet(name: String, greeting: String = "Hello"): String =
  s"\$greeting, \$name!"
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
debug(s"expensive: \${compute()}")`,
    },
    {
      lang: "scala",
      caption: "Lambdas + closures + partial application",
      code: `// Lambda — anonymous function. _ is placeholder for single arg.
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
add5(10)  // 15`,
    },
    {
      lang: "scala",
      caption: "Higher-order functions + composition",
      code: `// Function as a value — Int => Int is a type
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
val result = transforms.foldLeft(5)((x, f) => f(x))  // 5 -> 10 -> 11 -> 110`,
    },
    {
      lang: "scala",
      caption: "Contextual abstraction — given/using (Scala 3)",
      code: `// Typeclass pattern — define behavior once, compiler threads it through.
trait Show[A]:
  extension (a: A) def show: String

object Show:
  given Show[Int]    with extension (a: Int)    def show = a.toString
  given Show[String] with extension (a: String) def show = a
  given Show[List[?]] with
    extension [A](xs: List[A])(using s: Show[A]) def show =
      xs.map(_.show).mkString("[", ", ", "]")

// 'using' parameter — the compiler fills it from givens in scope
def log[A](a: A)(using s: Show[A]): String = s"a = \${a.show}"

@main def go = log(List(1, 2, 3))   // "a = [1, 2, 3]"
// Compiler finds the right Show instance per call site automatically.

// Scala 2 syntax (still works in 3): implicit val/def/param.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "scala",
      caption: "try / catch / finally — Java-style but expression-capable",
      code: `// try is an expression — returns the value of try or catch block
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
// scala.util.control.NonFatal filters them out for you.`,
    },
    {
      lang: "scala",
      caption: "Option / Either / Try — typed error channels",
      code: `// Option[T] — Some(T) or None. Replaces null.
def findUser(id: Int): Option[User] = ...
findUser(1) match {
  case Some(u) => println(u.email)
  case None    => println("not found")
}

// Either[E, A] — Left(error) or Right(success). Right = success by convention.
def parse(raw: String): Either[String, Int] =
  try Right(raw.toInt)
  catch { case _: NumberFormatException => Left(s"bad: \$raw") }

// Try[A] — wraps exceptions as values. Success(A) or Failure(Throwable).
import scala.util.{Try, Success, Failure}
val result: Try[Int] = Try(riskyComputation())
result match {
  case Success(v) => println(s"got \$v")
  case Failure(e) => println(s"err: \${e.getMessage}")
}

// Prefer Either for business errors (typed), Try for exception-wrapping.
// Use Option for absence without error context.`,
    },
    {
      lang: "scala",
      caption: "Custom errors + ADT hierarchy",
      code: `// Model errors as a sealed ADT — exhaustive match, type-safe.
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
  case Right(u)                 => println(s"got \${u.email}")
  case Left(AppError.NotFound(id))      => println(s"missing \$id")
  case Left(AppError.Validation(field)) => println(s"bad \$field")
  case Left(AppError.Unauthorized(r))   => println(s"denied: \$r")
  case Left(AppError.Conflict)          => println("conflict")
  // No 'else' — compiler knows the hierarchy is closed.`,
    },
    {
      lang: "scala",
      caption: "Effect systems — IO (cats-effect / ZIO)",
      code: `import cats.effect.{IO, Async}
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
                case None    => IO.raiseError(new RuntimeException(s"missing \$id"))
              }
} yield updated

// Error handling with .handleErrorWith
fetchUser(1).handleErrorWith {
  case e: SQLException => IO.println(s"db error: \${e.getMessage}").as(User.placeholder)
  case NonFatal(e)     => IO.raiseError(e)
}

// IO is cancellable, composable, referentially transparent —
// unlike Future (eager, side-effecting on construction).`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "scala",
      caption: "Future — eager async on ExecutionContext",
      code: `import scala.concurrent.{Future, ExecutionContext}
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
// Use cats-effect IO for referentially transparent, lazy effects.`,
    },
    {
      lang: "scala",
      caption: "IO (cats-effect) — typed, cancellable, pure",
      code: `import cats.effect.{IO, Async, Temporal}
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
withDb.use { conn => fetchUser(conn, 1) }  // conn auto-closed`,
    },
    {
      lang: "scala",
      caption: "ZIO — alternative effect system",
      code: `import zio.*
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
      .tap(users => putStrLn(s"loaded \${users.size} users"))
      .exitCode

// ZIO has its own runtime, supervision, fiber model — alternative to cats-effect.
// Choose based on ecosystem: cats-effect (Typelevel) vs ZIO.`,
    },
    {
      lang: "scala",
      caption: "Streams — fs2 (cats-effect) / Akka Streams",
      code: `import fs2.*
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

// Akka Streams (now Pekko) — alternative, more imperative, integrates with Actors.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "scala",
      caption: "ScalaTest — the dominant test framework",
      code: `import org.scalatest.flatspec.AnyFlatSpec
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
// Pick one per codebase — consistency matters.`,
    },
    {
      lang: "scala",
      caption: "munit — modern, lightweight alternative",
      code: `import munit.FunSuite

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
// Prefer it for new projects; ScalaTest for legacy.`,
    },
    {
      lang: "scala",
      caption: "Property-based testing — ScalaCheck",
      code: `import org.scalacheck._
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
  } yield s"\$name@\$dom.com"

  property("valid email accepted") = forAll(validEmail) { email =>
    User(1, email).isValid
  }

// ScalaCheck generates edge cases you didn't think of.
// Integrates with ScalaTest via ScalaCheckDrivenPropertyChecks trait.`,
    },
    {
      lang: "scala",
      caption: "Mocks — ScalaMock / Mockito-Scala",
      code: `import org.scalamock.scalatest.MockFactory
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
//  - For pure functional code: prefer stubs via typeclass instances over mocks.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "JIT warms up over ~30s-2min; cold-start Scala apps are slower than native binaries. Use GraalVM native-image for instant start.", tag: "perf" },
    { fact: "Tail-call optimization only happens with @tailrec annotation + literal self-recursion — mutual recursion uses trampolines.", tag: "perf" },
    { fact: "Case classes generate equals/hashCode/copy/apply/unapply — zero runtime cost vs hand-written. Pattern matching uses unapply to destructure.", tag: "perf" },
    { fact: "For-comprehensions desugar to map/flatMap/withFilter — work on any type with those methods (List, Option, Future, IO, Try).", tag: "perf" },
    { fact: "List prepend (::) is O(1); append (:+) is O(n). Always prepend + reverse if you need to build in order.", tag: "complexity" },
    { fact: "Vector is O(log32 n) for all ops — better than List for indexed access on immutable data.", tag: "perf" },
    { fact: "Array is mutable JVM array — O(1) indexed access. Use for performance-critical numerics, then .toSeq to expose immutably.", tag: "perf" },
    { fact: "Specialize generic methods with @specialized to avoid boxing for primitive types (Int, Long, Double).", tag: "perf" },
    { fact: "Value classes (extends AnyVal) compile to zero-allocation wrappers — typed IDs without runtime cost.", tag: "perf" },
    { fact: "opaque type (Scala 3) is zero-cost newtype — distinct type at compile time, erased at runtime.", tag: "version" },
    { fact: "Avoid creating intermediate collections — use LazyList (lazy) or .iterator (one-pass) for large pipelines.", tag: "perf" },
    { fact: "Mutable collections (scala.collection.mutable) are 2-5x faster than immutable for tight loops — accept the trade-off deliberately.", tag: "perf" },
    { fact: "Future is eager — starts running immediately on construction. Use cats-effect IO for referentially transparent, lazy effects.", tag: "gotcha" },
    { fact: "Implicit resolution can blow up compile times — keep implicit scope tight, use Scala 3 given/using for cleaner errors.", tag: "gotcha" },
    { fact: "JMH (sbt-jmh) is the standard for microbenchmarks; tap into JIT compilation + warmup. Run with -gc true to avoid GC noise.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "sbt", purpose: "Build tool — the de-facto Scala standard. Powerful but slow startup. sbt 2.0 in development.", url: "https://www.scala-sbt.org/", category: "build" },
    { tool: "Mill", purpose: "Modern build tool — faster than sbt, simpler config. Li Haoyi (the author of many Scala libs).", url: "https://mill-build.com/", category: "build" },
    { tool: "scala-cli", purpose: "Single-file Scala scripts — like python script.py. Powers-up quick prototyping.", url: "https://scala-cli.virtuslab.org/", category: "build" },
    { tool: "Coursier", purpose: "Dependency resolver + artifact fetcher — replaces Ivy, much faster. Powers sbt/Mill underneath.", url: "https://get-coursier.io/", category: "package" },
    { tool: "ScalaTest", purpose: "The dominant test framework — multiple styles (FlatSpec, FunSpec, WordSpec, FreeSpec).", url: "https://www.scalatest.org/", category: "test" },
    { tool: "munit", purpose: "Modern lightweight test framework — simpler than ScalaTest, used by Typelevel projects.", url: "https://scalameta.org/munit/", category: "test" },
    { tool: "ScalaCheck", purpose: "Property-based testing — generates edge cases automatically. Like Haskell's QuickCheck.", url: "https://www.scalacheck.org/", category: "test" },
    { tool: "ScalaMock", purpose: "Native Scala mocking — strongly typed, less magic than Mockito.", url: "https://scalamock.org/", category: "test" },
    { tool: "Scalafmt", purpose: "Code formatter — opinionated, like gofmt. Config in .scalafmt.conf.", url: "https://scalameta.org/scalafmt/", category: "lint" },
    { tool: "Scalafix", purpose: "Linter + refactoring tool — runs rules for migration, deprecations, code smells.", url: "https://scalacenter.github.io/scalafix/", category: "lint" },
    { tool: "Metals", purpose: "LSP language server — VS Code / Vim integration. Powered by Bloop + SemanticDB.", url: "https://scalameta.org/metals/", category: "lint" },
    { tool: "IntelliJ Scala", purpose: "JetBrains' Scala plugin — best IDE refactoring support. Free CE version.", url: "https://www.jetbrains.com/help/idea/scala.html", category: "build" },
    { tool: "cats", purpose: "Typelevel FP library — typeclasses (Monoid, Functor, Monad), data types (NonEmptyList, Validated).", url: "https://typelevel.org/cats/", category: "build" },
    { tool: "cats-effect", purpose: "Pure functional effect system — IO type, Resource, fiber-based concurrency.", url: "https://typelevel.org/cats-effect/", category: "build" },
    { tool: "ZIO", purpose: "Alternative effect system — environment types, supervision, fiber model. Ziverge.", url: "https://zio.dev/", category: "build" },
    { tool: "Akka / Pekko", purpose: "Actor framework + streams — Akka is Lightbend (now BSL license); Pekko is the Apache fork.", url: "https://pekko.apache.org/", category: "build" },
    { tool: "Apache Spark", purpose: "Distributed data processing — Scala is the primary API. Spark 4 supports Scala 2.13.", url: "https://spark.apache.org/", category: "build" },
    { tool: "fs2", purpose: "Functional streams — pure, resource-safe, cats-effect-based. The Typelevel streaming answer.", url: "https://fs2.io/", category: "build" },
    { tool: "http4s", purpose: "Pure functional HTTP server/client — Typelevel, cats-effect based.", url: "https://http4s.org/", category: "build" },
    { tool: "tapir", purpose: "Type-safe HTTP API description — generates OpenAPI docs, server stubs, clients from one definition.", url: "https://tapir.softwaremill.com/", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0",  year: 2004, highlight: "First release by Martin Odersky (EPFL). JVM-targeted, Java interop." },
    { version: "2.0",  year: 2006, highlight: "First stable release. Traits, pattern matching, case classes, implicits." },
    { version: "2.8",  year: 2010, highlight: "Collection redesign (scala.collection), named/default args, package objects." },
    { version: "2.9",  year: 2011, highlight: "Parallel collections, ThreadLocal Random, performance work." },
    { version: "2.10", year: 2013, highlight: "SIP-14 Futures + Promises, Scala Reflection, macro paradise, Akka integrated." },
    { version: "2.11", year: 2014, highlight: "Performance, modularization, SAM types (preview), better Java 8 interop." },
    { version: "2.12", year: 2016, highlight: "Java 8 required, SAM types full, trait compilation to interfaces, Java 8 streams interop." },
    { version: "2.13", year: 2019, highlight: "Collection redesign (simpler, faster), Dotty development begins, stdlib cleanup." },
    { version: "3.0",  year: 2021, highlight: "Scala 3 (Dotty) released. New syntax (indentation, enums, givens/using), intersection/union types, no macros (uses Mirror)." },
    { version: "3.1",  year: 2021, highlight: "Scala 3 LTS — long-term support line, stable for production." },
    { version: "3.2",  year: 2022, highlight: "Context functions, named type args, MatchType improvements." },
    { version: "3.3",  year: 2023, highlight: "Scala 3.3 LTS — second LTS line. Stable for libraries + production. Backwards-compat with 3.1.x." },
    { version: "3.4",  year: 2024, highlight: "Better error messages, -language:strictEquality preview, smaller compiler fixes." },
    { version: "3.5",  year: 2024, highlight: "Iteration over syntax improvements, performance, better Java interop." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between a trait and an abstract class?", a: "A trait is an interface with optional default implementations; a class can mix in MULTIPLE traits (multiple inheritance of behavior). An abstract class is a single-inheritance base that can have constructor parameters (traits can't in Scala 2, can in Scala 3 with parameters). Use traits for the 90% case — they're more flexible. Use abstract classes when you need constructor parameters (Scala 2), want to enforce a single-inheritance hierarchy, or need Java interop (Java can extend abstract classes but not traits directly).", difficulty: "easy" },
    { q: "Explain case classes and what the compiler generates for them.", a: "case class auto-generates: (1) companion object with apply (so you write User(1) not new User(1)), (2) equals/hashCode based on all constructor fields, (3) toString like 'User(1,a@b.io)', (4) copy with named-arg overrides, (5) componentN for destructuring (val (id, email) = user), (6) unapply for pattern matching. They're immutable by default (val fields) and sealed-friendly. The generated equals compares all fields structurally — two User(1, a) instances are equal.", difficulty: "medium" },
    { q: "What's a for-comprehension and how does it desugar?", a: "for { x <- xs; if p(x); y = f(x); z <- ys(x) } yield z desugars to: xs.withFilter(p).map(x => (x, f(x))).flatMap { case (x, y) => ys(x).map(z => z) }. Generators (<-) become flatMap (or foreach without yield); filters (if) become withFilter; assignments (=) become map. Crucially, it works on ANY type with these methods — List, Option, Either, Future, IO, Try. So a for-comp over Option composes None-shortcircuiting; over IO composes effect sequencing.", difficulty: "medium" },
    { q: "Explain implicits / given+using and the typeclass pattern.", a: "Implicits (Scala 2) / givens (Scala 3) are values the compiler auto-passes to functions declared with implicit/using parameters. Resolution is by TYPE — the compiler looks for a given of the right type in scope. The typeclass pattern: define a trait (e.g. Show[A]), provide given instances for each concrete type, then write generic functions def log[A](a: A)(using Show[A]). The compiler threads the right Show through every call. This is how Cats, ZIO, and Spark's Encoders work. Scala 3's given/using syntax is cleaner than Scala 2's implicit, with better error messages.", difficulty: "hard" },
    { q: "What's the difference between Future and IO (cats-effect)?", a: "Future is EAGER — construction starts the computation immediately on the ExecutionContext. IO is LAZY — construction builds a description; nothing runs until .unsafeRunSync() at the edge. Future is referentially opaque (val f = Future(heavy()); f vs f + f runs heavy once or twice). IO is referentially transparent — val io = IO(heavy()); io >> io runs heavy twice, predictably. Future isn't cancellable; IO is. Future is fine for simple async; IO (or ZIO) is the choice for production FP code that needs composability, cancellation, and resource safety.", difficulty: "medium" },
    { q: "How does pattern matching work and what's 'unapply'?", a: "match { case Pattern => ... } destructures values. Patterns can be: literals (1, 'a'), constructors (Some(x), User(id, _)), sequences/extractors (List(1, 2, _*)), typed (case x: Int =>), guards (case x if x > 0 =>), and named/positional bindings. Case classes auto-generate unapply in their companion object, which the compiler calls to destructure. You can write custom extractors via custom unapply/unapplySeq on any object. Pattern matching over sealed hierarchies is exhaustive — the compiler errors if you miss a case.", difficulty: "medium" },
    { q: "What's a sealed trait and why use it?", a: "A sealed trait (or class) has a closed hierarchy — all direct subtypes must be in the same file (Scala 2) or same package (Scala 3). The compiler knows the complete set, so pattern matching can be exhaustive without an else/case _ branch. Adding a new subtype makes the compiler flag every match that doesn't handle it — exhaustive-by-construction refactoring. This is the Scala equivalent of Rust's enums / Haskell's ADTs. Use sealed for state machines, Results, parsing ASTs, anything where the closed set matters.", difficulty: "easy" },
    { q: "Explain tail-call optimization in Scala.", a: "Scala optimizes literal self-recursion to a loop (no stack growth) when annotated with @tailrec — the compiler errors if it can't TCO. Non-tail recursion (e.g., factorial's n * factorial(n-1)) still uses stack. Mutual recursion can't be TCO'd directly — use trampolines (cats-effect IO) or rewrite as a single self-recursive function. The @tailrec annotation is a compile-time check, not a runtime optimization — if your 'tail call' isn't actually a tail call (because you wrap it in arithmetic), the compiler rejects it. Always annotate recursive functions to ensure TCO.", difficulty: "medium" },
    { q: "How does Spark use Scala's features?", a: "Spark uses Scala's case classes for schema inference (Encoder derives field names/types from case class structure at compile time), implicits to thread SparkSession/Encoders, and for-comprehensions over RDD/DataFrame APIs. The DataFrame API is a DSL that uses Scala's operator overloading + implicit conversions. Spark 4 supports Scala 2.13; Spark on Scala 3 is experimental because macro-based libraries (Circe, Magnolia) break across versions. The Scala choice for Spark is significant — the PySpark API is a thin wrapper over the Scala JVM core.", difficulty: "hard" },
    { q: "What's the difference between Scala 2 and Scala 3 (Dotty)?", a: "Scala 3 (released 2021) is a ground-up redesign: (1) new syntax — optional indentation-based, enums, given/using replaces implicit val/def with cleaner semantics; (2) union/intersection types as first-class; (3) typeclass derivation via Mirror (no macro paradise); (4) better error messages (the famous '200-line implicit error' is now ~10 lines); (5) no break-the-world macros — metaprogramming via Quotes API. Scala 2.13 libraries interop with Scala 3 via TASTy. New projects should target Scala 3 (3.3 LTS); migrating existing Scala 2 code is gradual via the -Xsource:3 flag.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Kotlin", whenThis: "Big-data pipelines (Spark/Flink), type-safe FP with typeclasses, anywhere you want HKT and ADTs.", whenThat: "Android, server backends where you want less compile complexity, anywhere full Java interop matters more than type system power." },
    { vs: "Java", whenThis: "Type-safe functional programming, ADTs + pattern matching, anywhere Scala's expressiveness beats Java's verbosity.", whenThat: "Large enterprise codebases already in Java, teams with deep Java expertise, anywhere the JVM library ecosystem matters more than syntax." },
    { vs: "Haskell", whenThis: "JVM production (full Java interop), Spark/Flink data pipelines, anywhere you want pragmatic FP with OO escape hatches.", whenThat: "Pure FP with no escape hatches, anywhere you want the most powerful type system (HKT, type families, type-level programming) without JVM overhead." },
    { vs: "Rust", whenThis: "JVM-targeted systems, anywhere you want GC + Java interop + FP ergonomics without borrow-checker friction.", whenThat: "Systems programming, embedded, anywhere memory-safety without runtime cost is non-negotiable." },
    { vs: "Clojure", whenThis: "Static typing with ADTs and typeclasses, anywhere you want compile-time type safety over dynamic Lisp ergonomics.", whenThat: "REPL-driven development, dynamic typing, anywhere you want Lisp simplicity + JVM reach without Scala's compile-time complexity." },
  ],
};

export default sheet;
