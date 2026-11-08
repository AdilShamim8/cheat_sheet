# Haskell

**Category:** Languages · **Tier:** Tier 3 · Specialized · **Tags:** functional, static, pure, lazy, typeclasses, compiled, research-language · **First released:** 1990 · **Author:** Haskell Committee · **Last updated:** 2026-11

> A pure, lazy, statically-typed functional language — the research lab where the ideas behind Rust, Swift, and TypeScript type systems were rehearsed.

---

## TL;DR

- Haskell is a lazily-evaluated, purely functional language with a Hindley-Milner-derived type system, typeclasses, and algebraic data types; side effects are isolated by the `IO` (and `STM`, `State`, `Reader`) monads.
- It is used in production at Facebook (Sigma anti-abuse, Haxl), Standard Chartered (Mu), Tesla (firmship tooling), GitHub (semantic), and several fintech houses; the GHC compiler is the de facto standard.
- Reach for Haskell when correctness is paramount (compilers, formal-ish DSLs, type-safe web APIs), when you need cheap concurrency via green threads + STM, or when you want to learn the type-system ideas Rust/Swift borrowed.
- Avoid Haskell for systems with hard realtime or memory predictability (laziness makes both hard), where hiring is constrained (small talent pool), or where the team wants Python-style 'just hack it out' velocity — Haskell demands upfront design.

## Core Mental Model

**Pure functions + effects tracked in the type.** Every Haskell function is pure — same input, same output, no side effects. IO is just a value of type `IO a` describing what to do; the runtime executes the one `main :: IO ()` value. `>>=` (bind) sequences effects without breaking purity. Laziness means values are computed on demand: `take 5 [1..]` works on an infinite list because Haskell never materializes the rest. This enables compositional code (`map f . filter g . takeWhile h`) but introduces a second model: space leaks when thunks accumulate, and strictness annotations (`!`, `BangPatterns`, `foldl'`) are how you fight back. Typeclasses (`class Eq a where (==) :: a -> a -> Bool`) are interfaces + laws, not OOP hierarchies — ad-hoc polymorphism resolved at compile time.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| data Tree a = Leaf \| Node a (Tree a) (Tree a) | Algebraic data type — sum (Leaf \| Node) of products; recursive by default. | All domain modeling; pattern matching is how you consume ADTs. |
| f :: Int -> String -> Bool | Type signature; curried by default — `f x y` not `f(x, y)`. | Every top-level function — types come first, often before the implementation. |
| case x of Just v -> v; Nothing -> 0 | Pattern match — exhaustive on sum types (warning if not). | Branching on ADTs; the compiler enforces coverage. |
| class Eq a where (==) :: a -> a -> Bool | Typeclass — an interface with laws; instances are declared separately from the type. | Generic library code; ad-hoc polymorphism. |
| instance Eq Color where Red == Red = True | Instance declaration — typeclass dispatched at compile time, monomorphized. | Implementing typeclasses for your types. |
| do { x <- getLine; putStrLn x } | do-notation — sugar for `>>=` chains over a monad; binds effects sequentially. | IO, State, Reader, Parser — anywhere a monad is involved. |
| main :: IO () main = do ... | Program entry — the single IO value the runtime executes. | All executables; libraries export values, not effects. |
| data T = T { name :: !Text, count :: !Int } | Strict fields via `!` — evaluated to WHNF when the constructor is applied, preventing thunks. | Most record types — strict-by-default avoids the #1 space leak source. |
| f = \x y -> x + y | Lambda — anonymous, curried; equivalent to `f x y = x + y`. | Short closures, point-free pipelines. |
| newtype Age = Age Int | Zero-cost wrapper — same runtime representation as Int, distinct compile-time type. | Type-safe ids, units-of-measure, avoiding stringly-typed APIs. |
| f <$> Just 3 <*> Just 4 | Applicative chain — `<$>` is `fmap`, `<*>` sequences effects into a function call. | Combining multiple effectful values; alternatives to monadic do. |
| {-# LANGUAGE TypeApplications #-} f @Int | Type application — pass a type as an explicit argument (visible type application). | Disambiguating typeclass calls; type-level programming. |

## Idiomatic Patterns

**ADT + typeclass — modeling a payment method**

```haskell
{-# LANGUAGE DerivingStrategies #-}
import Data.Text (Text)

data Payment
  = Card   { cardBin :: !Text, last4 :: !Text }
  | Bank   { routing :: !Text, acct   :: !Text }
  | Wallet { walledId :: !Text }
  deriving stock (Eq, Show)

class Fee a where
  fee :: a -> Double

instance Fee Payment where
  fee (Card{})   = 0.029 + 0.30   -- 2.9% + 30c
  fee (Bank{})   = 0.005           -- 0.5% ACH
  fee (Wallet{}) = 0.0             -- internal

-- Pattern matching is exhaustive; adding a new constructor triggers
-- a compile error in every case statement that forgot the new branch.
describe :: Payment -> String
describe p = case p of
  Card{last4}   -> "card *" <> unpack last4
  Bank{routing} -> "bank "  <> unpack routing
  Wallet{}      -> "wallet"
  where unpack = Data.Text.unpack
```

**IO with do-notation — the only place side effects happen**

```haskell
{-# LANGUAGE OverloadedStrings #-}
import qualified Data.Text as T
import qualified Data.Text.IO as TIO

main :: IO ()
main = do
  TIO.putStrLn "Enter your name:"
  name <- T.filter (not . T.isSpace) . T.toLower <$> TIO.getLine
  let greeting = "Hello, " <> name <> "!"
  TIO.putStrLn greeting
  appendFile "log.txt" (greeting <> "\n")  -- IO () return

-- do desugars to:
--   TIO.putStrLn "..." >> TIO.getLine >>= 
ame -> ...
-- Every line that "does" something is a value of type IO a; the
-- whole block is IO () because the last expression is.
```

**Strict fold over a lazy list — the space-leak fix**

```haskell
-- BAD: foldl builds a chain of thunks proportional to list length.
--   sum [1..10^7]  -- OOM or 10x slowdown due to thunk accumulation.
sumBad :: [Int] -> Int
sumBad = foldl  (+) 0

-- GOOD: foldl' forces the accumulator on every step.
sumGood :: [Int] -> Int
sumGood = foldl' (+) 0

-- The list [1..10^7] is lazy — generated on demand, GC'd as consumed.
-- The foldl' accumulator is strict — O(1) space, O(n) time.
import Data.List (foldl')

main :: IO ()
main = print (sumGood [1..10^7])   -- 50000005000000, in ~30MB RSS
```

**STM for composable concurrency — no deadlocks**

```haskell
{-# LANGUAGE OverloadedStrings #-}
import Control.Concurrent.STM
import Control.Concurrent (forkIO, threadDelay)
import Control.Monad      (replicateM_)

type Account = TVar Int

transfer :: Int -> Account -> Account -> STM ()
transfer amt from to = do
  bal <- readTVar from
  if bal < amt
    then retry                       -- block until from changes
    else do writeTVar from (bal - amt)
            readTVar to  >>= writeTVar to . (+ amt)

main :: IO ()
main = do
  a <- newTVarIO 100
  b <- newTVarIO 0
  -- Two transfers compose atomically — no lock ordering, no deadlock.
  atomically $ transfer 30 a b >> transfer 10 b a
  (a', b') <- atomically $ ((,) <$> readTVar a <*> readTVar b)
  putStrLn $ "a=" <> show a' <> " b=" <> show b'   -- a=80 b=20
```

## Common Pitfalls

1. **Space leaks from lazy folds** — *Symptom:* `foldl (+) 0 [1..n]` builds a thunk of depth n before forcing — gigabytes of RAM for n = 10^7, OOM for n = 10^9. *Fix:* Use `foldl'` (strict accumulator) from Data.List — almost always what you want. For monadic folds, use `foldM'` or `foldlM` with a strict accumulator. Enable `BangPatterns` and use `f !acc x = ...` if needed.
2. **Lazy IO and file handle leaks** — *Symptom:* `readFile "huge.txt"` returns a lazy String that holds the filehandle open until the entire stream is consumed — exceptions or partial consumption leak handles. *Fix:* Use strict `Data.Text.IO.readFile` / `Data.ByteString.readFile` (still chunked, but evaluated eagerly). For streaming, use `conduit`, `pipes`, or `streaming` libraries that make resource lifetimes explicit.
3. **`seq` doesn't fully evaluate** — *Symptom:* `x `seq` y` forces x to weak head normal form (WHNF) — for most data types, that's only the outermost constructor. Nested thunks remain; `seq` on a `Maybe (Int, Int)` does NOT evaluate the Int pair. *Fix:* Use `deepseq` (forces to normal form) with `NFData` instances. For records, declare strict fields (`!`) or use `force` from `Control.DeepSeq`. `BangPatterns` give you `f !x = ...` syntax.
4. **Monomorphism restriction surprises** — *Symptom:* A top-level `g = id` without a type signature gets a default type `g :: () -> ()` due to the monomorphism restriction — calling `g 5` then fails with a type error. *Fix:* Always annotate top-level definitions, or write `g x = id x` (the restriction only applies to fully point-free definitions). Disable with `{-# LANGUAGE NoMonomorphismRestriction #-}` (default off since GHC 7.8).
5. **Bottom (⊥) leaks past type checking** — *Symptom:* `undefined`, `error "boom"`, and non-terminating expressions have any type — they pass type checking and crash at runtime. `head []` throws an exception, not a type error. *Fix:* Use total functions: `Data.List.Extra.headErr` is partial; prefer pattern matching on `NonEmpty a` (Data.List.NonEmpty) which guarantees a head. Use `Maybe`/`Either` for fallible operations and handle every branch.
6. **Typeclass instance resolution is global and non-overlapping** — *Symptom:* Defining `instance Show MyType` in two modules gives an overlapping-instances error at link time. You can't selectively override an instance for a subclass. *Fix:* Use `newtype` wrappers (`newtype Json a = Json a`) to attach a different instance without touching the underlying type. Use `{-# LANGUAGE OverlappingInstances #-}` or `{-# LANGUAGE OverloadedRecordDot #-}` only as a last resort.
7. **Exception handling in pure code is invisible** — *Symptom:* A pure function can throw via `error` or `throw` and there's no `throws` in the type. Code that looks total can crash deep in the middle of an unrelated `map`. *Fix:* Use `ExceptT` / `Either` for recoverable errors — they appear in the type. Reserve `error` for genuinely unreachable code (and document it). For IO exceptions, use `Control.Exception.bracket` for resource safety and `try` for catching.

## Production / Interview Quick Reference

- GHC 9.6 / 9.8 / 9.10 are the current series (2024); the language report is Haskell 2010, but real-world code uses dozens of language extensions. `version`
- Cabal is the build tool's package format; `cabal` and `stack` are the user-facing build tools. `ghcup` manages GHC versions; HLS (Haskell Language Server) provides LSP. `version`
- Laziness: a value is computed only when its result is needed. `take 5 [1..]` is O(5), not O(∞). But unbounded thunks = space leaks. `perf`
- GHC compiles to native via LLVM (default) or C; aggressive inlining + rewrite rules can match C speed for numeric loops, but typical Haskell is ~1.5-3x Python (better or worse depending on laziness management). `perf`
- Green threads: `Control.Concurrent.forkIO` creates cheap threads (~1KB stack); GHC's runtime schedules them across OS threads. Millions of threads is feasible. `perf`
- STM (Software Transactional Memory) composes atomically — `atomically $ do { transfer a b; transfer c d }` either all commits or retries; no deadlocks, no manual lock ordering. `complexity`
- Typeclasses dispatch at compile time via dictionary passing; GHC specializes per call site when types are known. `Show` is monomorphic per call. `complexity`
- `newtype` is erased at runtime — zero overhead. `data` allocates. Use `newtype` for type-safe wrappers. `perf`
- Type inference is Hindley-Milner + extensions; you usually annotate top-level functions for documentation and to catch errors locally. `style`
- Common extensions in 2024: OverloadedStrings, LambdaCase, BangPatterns, DerivingStrategies, TypeApplications, GADTs, DataKinds, RecordWildCards. Stack/Cabal default them per-package. `version`
- Exceptions in pure code (`error`, `throw`) escape the type system — use `Either`/`ExceptT`/`Maybe` for recoverable failure. `gotcha`
- `seq` forces to WHNF (outer constructor only); `deepseq` forces to normal form. Most space leaks are 'needed a `seq` here'. `gotcha`
- Naming: camelCase for functions/variables, PascalCase for types/modules. Type variables are single letters (a, b, m). `style`
- Hoogle (haskell.org/hoogle) searches functions by type signature — `a -> b -> a` finds `const`. The single most useful tool after GHC. `style`
- FFI to C is built-in (`foreign import ccall`); inline-c and hs-gitlab bindings provide higher-level bridges to C++/Rust. `version`

## Go Deeper

- [Haskell Documentation & GHC User's Guide](https://downloads.haskell.org/ghc/latest/docs/users_guide/) — The GHC manual — every language extension, every flag. The real language spec.
- [Learn You a Haskell for Great Good](http://learnyouahaskell.com/) — Free, illustrated intro; covers syntax and typeclasses. Pairs well with Real World Haskell for production concerns.
- [Real World Haskell (Bryan O'Sullivan et al.)](http://book.realworldhaskell.org/) — Free online; the canonical 'how do I do IO, FFI, testing, web in Haskell' book.
- [Parallel and Concurrent Programming in Haskell (Simon Marlow)](https://simonmar.github.io/pages/pcph.html) — Free online by the GHC RTS author; the authoritative treatment of green threads, STM, and parallel strategies.
- [Haskell Wiki & Hackage](https://wiki.haskell.org/) — Community knowledge base + the package index. Stackage provides curated, compatible snapshot builds.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Int | Fixed-size signed integer (64-bit on most platforms). Bounded — wraps on overflow. | Counters, indices. For unbounded: Integer. |
| Integer | Arbitrary-precision integer — never overflows. Slower than Int. | Big numbers, crypto, exact arithmetic. Default for literal if no type sig. |
| Word / Word8 / Word16 ... | Unsigned integers — Word is native size, Word8 for bytes. | Bit manipulation, binary protocols, hashing. |
| Float / Double | IEEE 754 single/double. Double is the default for fractional literals. | Math. For exact decimal use Data.Decimal or scientific; for fractions use Ratio (Rational). |
| Rational / Ratio Int | Exact fraction — 1 % 2 + 1 % 3 == 5 % 6. No float rounding. | Money (small scope), testing float algorithms, exact arithmetic. |
| Char | Unicode code point — 'a', '\\n', '\\x41'. 32-bit, NOT 8-bit byte. | Text processing. Text/ByteString for sequences of Char/Word8. |
| Bool | Two constructors: True, False. if/most logic accept Bool only — no truthy/falsy. | Logic. From Enum/Ord (True > False). Distinct from 1/0. |
| ()  (unit) | The unit type — only one value, also written (). Like void in C, but a real value. | Functions returning no useful value: IO (). The 'result' of side effects. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| [a]  (linked list) | Singly-linked list — lazy, O(1) cons, O(n) index. The default collection. | Streams, sequence processing. NOT an array — random access is O(n). |
| Data.List.NonEmpty | List guaranteed non-empty — head is total, no partial function errors. | APIs where emptiness is a bug, not a case. Use over [a] when you can guarantee it. |
| Data.Vector | Packed contiguous array — O(1) index, fast slice. Boxed, Unboxed, Storable variants. | Numerics, large collections. Default for performance-critical list-like data. |
| Data.Text | Packed UTF-16 (or UTF-8 with text-shortest) string — O(n) index but cache-friendly. | All real text. Use over String for any non-trivial text processing. |
| Data.ByteString | Packed byte sequence — Word8 elements, NOT Char. Lazy and Strict variants. | Binary protocols, file/network I/O, hashing. Strict for small, Lazy for streaming. |
| Data.Map k v | Balanced tree map — O(log n) lookup/insert. Keys must be Ord. | Ordered key-value. For hash-based use Data.HashMap (faster, unordered). |
| Data.HashMap k v | Hash-based map — O(log n) worst, O(1) avg. Keys must be Hashable. | Fast keyed lookup when ordering doesn't matter. |
| Data.Set / Data.HashSet | Sorted set / hash set — O(log n) / O(1) operations. | Dedup, membership, set algebra. Set needs Ord; HashSet needs Hashable. |
| Data.Sequence | Finger tree — O(1) cons/snoc/view at both ends, O(log n) middle insert. | Queues, deques, anywhere you need both-end operations efficiently. |
| Data.Array | Immutable boxed array — O(1) index. Mutable variant in Data.Array.MArray. | Tables, lookup arrays. Less common than Vector for new code. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| data Tree a = Leaf \| Node a (Tree a) (Tree a) | Algebraic data type — sum (\|) of products. Pattern matching is the way to consume. | All domain modeling. Recursive ADTs are the canonical data structure. |
| data T = T { name :: !Text, age :: !Int } | Record with strict fields (!) — evaluated to WHNF on construction, prevents thunks. | Most record types — strict-by-default avoids space leaks. |
| newtype Age = Age Int | Zero-cost wrapper — same runtime rep as Int, distinct compile-time type. | Type-safe ids, units-of-measure, avoiding stringly-typed APIs. |
| type Alias = Int -> String | Type alias — fully resolved at compile time, no new type. Symmetric with type params. | Documentation, complex generics. Use newtype for actual type safety. |
| class Eq a where (==) :: a -> a -> Bool | Typeclass — interface + laws; instances declared separately from the type. | Generic library code, ad-hoc polymorphism. Laws (reflexivity, symmetry) are documented. |
| instance Eq Color where Red == Red = True | Instance declaration — typeclass dispatched at compile time (or via dictionary at runtime). | Implementing typeclasses for your types. deriving (Eq, Show) auto-generates common ones. |
| data Maybe a = Nothing \| Just a | Option type — None-safe. Pattern match exhaustively; compiler enforces. | Optional values, fallible operations. Replaces null/None. |
| data Either e a = Left e \| Right a | Either — convention: Left = error, Right = success. Monad on Right. | Error channels in pure code; EitherT/ExceptT for effectful error propagation. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| +, -, *, / | Arithmetic via Num/Fractional typeclasses. / requires Fractional — Int doesn't have it. | Math. Int division: div (floor), quot (truncate). Use div for indexing. |
| div, mod, quot, rem | div/mod: floored (sign of divisor). quot/rem: truncated (sign of dividend). | Integer math. div/mod are the 'math-correct' pair; quot/rem match C. |
| ^  (power) | Exponentiation — only non-negative integer powers (^). Use ** for float powers. | Math. 2 ^ 10 == 1024. For matrix power use Numeric.LinearAlgebra. |
| &&, \|\|, not | Short-circuit boolean — strict in first arg, lazy in second. | Logic. && and \|\| are functions (not syntax), so they can't auto-overload (use <&&> from semigroupoids if needed). |
| ==, /=, <, >, <=, >= | Comparison via Eq/Ord typeclasses. /= is not-equal (the only non-C name). | Equality, ordering. Ord implies Eq; gives min, max, compare, sort. |
| compare  (Ordering) | Returns LT \| EQ \| GT — full tri-state comparison in one call. | Sort comparators, branch-free ordering logic. |
| $  (low-precedence apply) | Function application at lowest precedence — f $ g $ h x == f (g (h x)). | Avoiding parens. Right-associative; common in composition chains. |
| .  (function composition) | Right-to-left composition: (f . g) x = f (g x). | Building pipelines. Common in point-free style: count = length . filter pred. |
| <$>  (fmap), <*>  (apply) | Functor map and Applicative apply — for contexts (Maybe, Either, IO, List). | Effectful function application. f <$> Just 3 <*> Just 4 == Just (f 3 4). |
| >>=  (bind), >>  (sequence) | Monad bind: m >>= f passes m's value to f, flattening the result. >> discards. | All monadic sequencing. do-notation desugars to >>= chains. |
| =<<  (reverse bind) | Like >>= but with args flipped — f =<< m. Common in point-free style. | When the function is the focus. Read as 'apply f to m's value'. |
| <\|>  (alternative), empty | Alternative typeclass — choice/fallback. m1 <\|> m2 tries m1, falls back to m2. | Parsing (Parsec), Maybe fallback, list concatenation, validation accumulation. |
| >>= vs <$> vs <*> | Monad (single-result), Functor (pure context), Applicative (independent effects). |  <$> when args are independent; <*> chains independent; >>= when next depends on previous. |
| seq  /  $!  /  `seq` | Force evaluation to WHNF before continuing — manual strictness. | Rarely in user code; prefer BangPatterns, strict fields, foldl'. |

## Input / Output

**Basic stdout / stdin via IO**

```haskell
main :: IO ()
main = do
    putStrLn "What is your name?"
    name <- getLine
    putStrLn ("Hello, " ++ name ++ "!")

    -- Read all of stdin:
    input <- getContents            -- lazy stream
    mapM_ print (lines input)

    -- Write to stderr:
    hPutStrLn stderr "warning: ..."

    -- Strict line read (no lazy IO):
    import qualified Data.Text.IO as TIO
    name <- TIO.getLine
    TIO.putStrLn ("Hello, " <> name)

-- Laziness gotcha: getContents is lazy, so closing the handle when the
-- stream is partially consumed is undefined. Use streaming libraries
-- (conduit, pipes, streaming) for robust resource management.
```

**File I/O with bracket for resource safety**

```haskell
import Control.Exception (bracket)
import qualified Data.Text as T
import qualified Data.Text.IO as TIO

-- bracket: acquire, use, release — release runs even on exception.
readFileSafely :: FilePath -> IO T.Text
readFileSafely path =
    bracket (openFile path ReadMode) hClose $ \h -> do
        TIO.hGetContents h       -- strict (Text version), unlike getContents

-- Or use TIO.readFile (already does the right thing):
main :: IO ()
main = do
    content <- TIO.readFile "input.txt"
    TIO.writeFile "output.txt" (T.toUpper content)

-- For binary:
import qualified Data.ByteString as BS
bytes <- BS.readFile "data.bin"
BS.writeFile "copy.bin" bytes

-- Lazy IO (getContents, readFile from Prelude) is discouraged for new
-- code — strict Text/ByteString + bracket is the modern pattern.
```

**JSON with aeson — the de-facto standard**

```haskell
{-# LANGUAGE DeriveGeneric, OverloadedStrings #-}
import Data.Aeson
import GHC.Generics

data User = User
    { userId :: Int
    , userName :: Text
    , tags :: [Text]
    } deriving (Generic, Show)

-- Auto-derive ToJSON/FromJSON from Generic.
instance ToJSON User where
    toJSON = genericToJSON defaultOptions
        { fieldLabelModifier = drop 6 }   -- strip "user" prefix -> "id", "name"

instance FromJSON User

-- Encode:
let u = User 1 "ada" ["a", "b"]
let json = encode u        -- lazy ByteString

-- Decode (strict ByteString):
case decodeStrict jsonBS of
    Just u  -> print (userName u)
    Nothing -> error "bad JSON"

-- For manual control, use withObject / (.:) / (.:?) for fields:
instance FromJSON User where
    parseJSON = withObject "User" $ \o -> User
        <$> o .: "id"
        <*> o .: "name"
        <*> o .:? "tags" .!= []
```

**HTTP client (http-client) + connection pooling**

```haskell
{-# LANGUAGE OverloadedStrings #-}
import Network.HTTP.Client
import Network.HTTP.Types.Status (statusCode)

main :: IO ()
main = do
    -- Manager pools connections; create once per app, share across requests.
    mgr <- newManager defaultManagerSettings

    req <- parseRequest "https://api.example.com/v1/users"
    let req' = req { method = "POST"
                   , requestHeaders = [("Content-Type", "application/json")]
                   , requestBody = RequestBodyLBS "{"k":1}"
                   }

    -- withResponse uses bracket — closes the connection on exit.
    withResponse req' mgr $ \resp -> do
        if statusCode (responseStatus resp) == 200
            then do
                body <- brRead (responseBody resp)
                putStrLn ("got " ++ show (length body) ++ " bytes")
            else hPutStrLn stderr "request failed"

-- For higher-level API: req, wreq, http-conduit packages.
-- http-client is the foundation; pick a higher-level wrapper.
```

## Loops & Iteration

**map / filter / fold — the trinity**

```haskell
-- map applies a function to each element:
squares = map (^2) [1..10]              -- [1,4,9,...,100]

-- filter keeps elements satisfying a predicate:
evens = filter even [1..10]              -- [2,4,6,8,10]

-- foldl' (strict) reduces left-to-right:
import Data.List (foldl')
total = foldl' (+) 0 [1..1000]           -- 500500

-- foldr processes from the right; can short-circuit on infinite lists:
any' p = foldr (\x acc -> p x || acc) False

-- Composition — point-free style:
countEven = length . filter even         -- [Int] -> Int

-- Laziness: [1..] is infinite — map over it lazily:
take 5 (map (^2) [1..])                   -- [1,4,9,16,25]

-- DON'T use foldl (lazy) — it builds thunks. Use foldl'.
```

**List comprehensions**

```haskell
-- Like math set-builder notation:
squares = [x^2 | x <- [1..10]]
evens   = [x | x <- [1..100], even x]

-- Multiple generators (cartesian product):
pairs = [(x, y) | x <- [1..3], y <- [1..3]]

-- With guards (filters) and transforms:
positiveDiffs = [x - y | x <- xs, y <- ys, x > y]

-- Parallel zip comprehension (ParallelListComp extension):
[ (a, b) | a <- as | b <- bs ]

-- Comprehensions are sugared into map/filter/concat; same performance.
```

**Recursion + accumulator (tail-recursive)**

```haskell
-- Naive recursion (NOT tail-recursive):
factorial 0 = 1
factorial n = n * factorial (n - 1)

-- Tail-recursive with accumulator:
factorial' n = go n 1
  where
    go 0 acc = acc
    go k acc = go (k - 1) (k * acc)

-- Laziness means even non-tail-recursive functions can be efficient if
-- the result is consumed lazily. But for strict numeric folds, use
-- foldl' or tail recursion with strict accumulator.

-- Mutually recursive:
isEven 0 = True
isEven n = isOdd (n - 1)

isOdd 0 = False
isOdd n = isEven (n - 1)
```

**Iterating effectful computations — mapM_, forM_, traverse**

```haskell
import Control.Monad (forM_, mapM_)

-- mapM_ applies an IO action to each element, discards results:
printAll :: [Int] -> IO ()
printAll = mapM_ print

-- forM_ = flip mapM_ — reads like a for loop:
forM_ [1..5] $ \i -> do
    putStrLn ("i = " ++ show i)

-- traverse (Applicative) generalizes mapM — collects results:
readInts :: [String] -> IO [Int]
readInts = traverse (\s -> pure (read s))

-- sequence / sequence_ — turn [IO a] into IO [a]:
actions :: [IO Int]
actions = [pure 1, pure 2, pure 3]
results :: IO [Int]
results = sequence actions

-- Lazy IO gotcha: sequence on infinite lists hangs.
-- Use Data.Conduit or Streaming for streaming.
```

## Functions & Callables

**Currying, partial application, point-free**

```haskell
-- All functions take ONE argument — multi-arg is curried:
add :: Int -> Int -> Int
add x y = x + y

-- Partial application — give some args, get back a function:
add5 :: Int -> Int
add5 = add 5

-- Section notation for operators:
double = (2 *)        -- equivalent to \x -> 2 * x
inc    = (+ 1)        -- equivalent to \x -> x + 1

-- Point-free style — no explicit args:
countEven :: [Int] -> Int
countEven = length . filter even

-- Compose with .:
process :: [Int] -> Int
process = sum . map (^2) . filter even
-- reads right-to-left: filter, square, sum

-- Currying is why Haskell has no need for partial application syntax.
```

**Where / let / guards / pattern matching in functions**

```haskell
-- Multiple clauses via pattern matching:
describe :: Maybe Int -> String
describe Nothing  = "no value"
describe (Just 0) = "zero"
describe (Just n) = "value: " ++ show n

-- Guards (boolean conditions):
classify :: Int -> String
classify n
    | n < 0     = "negative"
    | n == 0    = "zero"
    | n < 10    = "small"
    | otherwise = "big"

-- 'where' clause — bindings scoped to the function:
area :: Double -> Double -> Double -> Double
area a b c = sqrt (s * (s-a) * (s-b) * (s-c))
  where s = (a + b + c) / 2

-- 'let .. in' — expression-local binding:
volume r = let pi' = 3.14159 in (4/3) * pi' * r^3

-- Pattern match + guards combined:
parse ('-':rest) | not (null rest) = negate (read rest)
parse s                              = read s
```

**Higher-order functions + composition**

```haskell
import Data.List (foldl')
import Data.Char (toUpper)

-- Function as argument:
applyTwice :: (a -> a) -> a -> a
applyTwice f x = f (f x)

applyTwice (+ 1) 5     -- 7
applyTwice (\s -> s ++ "!") "hi"   -- "hi!!"

-- flip — swap arg order (useful for partial application):
flipArgs = flip map [1..3]   -- map [1..3] (\x -> ...)
-- equivalently: fmap (\x -> ...) [1..3]

-- on — apply a function to two transformed args (Data.Function):
-- compare `on` length  compares two lists by length

-- const — ignore second arg:
const5 = const 5         -- const5 x == 5 for any x

-- Compose with multiple stages:
pipeline :: [String] -> [String]
pipeline = map (filter (/= ' ')) .   -- strip spaces
           map (map toUpper) .         -- uppercase
           filter (not . null)         -- drop empties
```

**do-notation — desugars to >>= chains**

```haskell
-- do-notation is sugar for monadic bind (>>=):
main :: IO ()
main = do
    putStrLn "name?"       -- IO (), no binding
    name <- getLine        -- IO String, bind name to result
    let greeting = "Hi, " ++ name
    putStrLn greeting

-- Desugars to:
--   putStrLn "name?" >> getLine >>= \name ->
--       let greeting = "Hi, " ++ name in putStrLn greeting

-- Works for any Monad — IO, Maybe, Either, State, Reader, Parser:
parseTwo :: Parser (Int, Int)
parseTwo = do
    x <- intParser
    y <- intParser
    return (x, y)

-- 'return' is just 'pure' — wraps a value in the monad. NOT control flow.
-- Applicative form (no inter-binding deps): (,) <$> intParser <*> intParser
```

## Error Handling

**Maybe / Either — errors as values**

```haskell
-- Maybe: present or absent.
lookupUser :: Int -> Maybe User
lookupUser 1 = Just (User 1 "ada")
lookupUser _ = Nothing

-- Pattern match to handle:
case lookupUser 42 of
    Just u  -> putStrLn (userName u)
    Nothing -> putStrLn "not found"

-- Either: success or error with info.
parseEmail :: Text -> Either String Email
parseEmail t
    | "@" `Data.Text.isInfixOf` t = Right (Email t)
    | otherwise                   = Left "missing @"

-- Compose Eithers in do-notation (Either is a Monad):
getUserEmail :: Int -> Either String Email
getUserEmail uid = do
    user <- maybeToRight "no user" (lookupUser uid)
    parseEmail (userEmail user)

-- where maybeToRight :: e -> Maybe a -> Either e a
-- Left short-circuits through the do block, just like throw.
```

**ExceptT — error channel for monadic code**

```haskell
import Control.Monad.Except

-- ExceptT e m a = monad that can fail with e, succeed with a, in base monad m.
type AppM = ExceptT AppError IO

loadUser :: Int -> AppM User
loadUser uid = do
    file <- liftIO (readFile ("users/" ++ show uid))
    case parseUser file of
        Left err -> throwError (ParseError err)
        Right u  -> return u

-- Run:
main :: IO ()
main = do
    result <- runExceptT (loadUser 42)
    case result of
        Left err  -> hPutStrLn stderr (show err)
        Right usr -> print usr

-- ExceptT composes; throwError short-circuits. Like Result in Rust
-- or exceptions but at the type level — caller MUST handle.
```

**IO exceptions — try / catch / bracket**

```haskell
import Control.Exception

main :: IO ()
main = do
    -- try :: Exception e => IO a -> IO (Either e a)
    result <- try (readFile "missing.txt") :: IO (Either IOException String)
    case result of
        Left err     -> hPutStrLn stderr ("error: " ++ show err)
        Right content -> putStrLn content

    -- catch :: IO a -> (e -> IO a) -> IO a
    readFile "missing.txt" `catch` \(e :: IOException) -> do
        hPutStrLn stderr "falling back"
        return ""

    -- bracket: acquire, use, release. Resource safety.
    bracket
        (openFile "data.txt" ReadMode)
        hClose
        (\h -> hGetContents h)

    -- finally / onException for simpler cleanup patterns.
    -- Custom exceptions: define Exception instance + data type.
```

**Custom exception types + hierarchy**

```haskell
{-# LANGUAGE DeriveAnyClass #-}
import Control.Exception

data AppError
    = NotFound String
    | ParseError String
    | NetworkError Int
    deriving (Show, Exception)

-- 'Exception' instance lets throw/catch handle it.
throwNotFound :: String -> IO a
throwNotFound = throwIO . NotFound

main :: IO ()
main = do
    result <- try doWork :: IO (Either AppError ())
    case result of
        Left (NotFound msg)   -> hPutStrLn stderr ("404: " ++ msg)
        Left (ParseError msg) -> hPutStrLn stderr ("parse: " ++ msg)
        Left (NetworkError c) -> hPutStrLn stderr ("http " ++ show c)
        Right _               -> putStrLn "ok"

-- Exception hierarchy via sub-typing is awkward in Haskell — most code
-- uses a sum type like AppError above. SomeException is the root.
```

## Concurrency Model

**Green threads + forkIO**

```haskell
import Control.Concurrent (forkIO, threadDelay, MVar, newEmptyMVar, takeMVar, putMVar)
import Control.Monad (replicateM_)

main :: IO ()
main = do
    -- forkIO spawns a lightweight green thread (~1KB stack).
    -- GHC's runtime schedules them across OS threads (set +RTS -N4 for 4 cores).
    forkIO $ do
        threadDelay 1000000    -- 1 second
        putStrLn "hello from thread"

    putStrLn "hello from main"
    threadDelay 2000000        -- wait for thread (no proper join here)

-- MVar: synchronizing variable (either empty or full).
-- Producer/consumer:
main2 = do
    mvar <- newEmptyMVar :: IO (MVar Int)
    forkIO $ do
        mapM_ (putMVar mvar) [1..10]
        putMVar mvar (-1)       -- sentinel
    consumer mvar

consumer mvar = do
    x <- takeMVar mvar
    if x == (-1) then return ()
                 else do putStrLn ("got " ++ show x); consumer mvar
```

**STM — composable atomic transactions**

```haskell
{-# LANGUAGE OverloadedStrings #-}
import Control.Concurrent.STM
import Control.Concurrent (forkIO)

type Account = TVar Int

transfer :: Int -> Account -> Account -> STM ()
transfer amt from to = do
    bal <- readTVar from
    if bal < amt
        then retry                              -- block until from changes
        else do modifyTVar' from (subtract amt)
                modifyTVar' to   (+ amt)

main :: IO ()
main = do
    a <- newTVarIO 100
    b <- newTVarIO 0

    -- Two transfers compose atomically — no lock ordering, no deadlock.
    atomically $ do
        transfer 30 a b
        transfer 10 b a

    (a', b') <- atomically $ (,) <$> readTVar a <*> readTVar b
    putStrLn ("a=" ++ show a' ++ " b=" ++ show b')   -- a=80 b=20

-- retry: blocks the transaction until any read TVar changes.
--orElse: try one transaction, fall back to another if it retries.
```

**Async — high-level concurrency with cancellation**

```haskell
import Control.Concurrent.Async

-- concurrently: run two IOs in parallel, wait for both.
-- If one throws, the other is canceled.
result :: IO (String, String)
result = concurrently
    (httpGet "https://a.example.com")
    (httpGet "https://b.example.com")

-- race: run two IOs, return whichever finishes first (other is canceled).
winner :: IO (Either String String)
winner = race fast slow

-- mapConcurrently: like mapM but parallel. Bounded version: pooledMapConcurrently.
bodies <- mapConcurrently httpGet urls

-- async / wait: explicit control.
a1 <- async (httpGet "https://a.example.com")
a2 <- async (httpGet "https://b.example.com")
r1 <- wait a1
r2 <- wait a2

-- cancel, poll, waitCatch for fine-grained control.
-- The 'async' package is the recommended high-level API for IO concurrency.
```

**Software Transactional Memory (STM) — composable**

```haskell
{-# LANGUAGE OverloadedStrings #-}
import Control.Concurrent.STM
import Control.Concurrent (forkIO)

-- STM is a composable concurrency primitive:
--   * TVar: transactional variable, only readable/writable inside STM.
--   * TQueue / TBQueue / TChan: transactional channels (bounded/unbounded).
--   * TMVar: like MVar but transactional.
--   * TArray: transactional array.

-- Compose transactions: all-or-nothing, no locks, no deadlocks.
buyIfAvailable :: TVar Int -> STM ()
buyIfAvailable stock = do
    n <- readTVar stock
    if n > 0
        then writeTVar stock (n - 1)
        else retry    -- automatically waits for stock to change

-- atomically :: STM a -> IO a — runs a transaction.
-- Transactions are isolated, atomic, and retry on conflict.
-- Trade-off: slower than MVar/IORef for uncontended cases, but composes.
```

## Testing Patterns

**HSpec — RSpec-like BDD**

```haskell
-- File: test/Spec.hs
import Test.Hspec
import MyLib

main :: IO ()
main = hspec $ do
    describe "add" $ do
        it "adds two numbers" $
            add 1 2 `shouldBe` 3

        it "handles negatives" $
            add (-1) (-2) `shouldBe` (-3)

    describe "parse" $ do
        it "parses valid input" $
            parse "42" `shouldBe` Right 42

        it "rejects invalid input" $
            parse "abc" `shouldSatisfy` isLeft

-- Run: stack test  or  cabal test
-- Output is colored, hierarchical, with failure context.
-- shouldBe, shouldSatisfy, shouldThrow, shouldReturn are the core matchers.
```

**Tasty — combinator-style testing**

```haskell
import Test.Tasty
import Test.Tasty.HUnit
import Test.Tasty.QuickCheck

main :: IO ()
main = defaultMain $ testGroup "tests"
    [ testCase "add basic" $ add 1 2 @?= 3
    , testCase "list reverse" $ reverse [1,2,3] @?= [3,2,1]
    , testProperty "reverse is involutive" $ \xs ->
        reverse (reverse xs) == (xs :: [Int])
    , testProperty "add commutes" $ \a b ->
        add a b == add b a
    ]

-- Tasty is more modular than HSpec — combine HUnit, QuickCheck, SmallCheck,
-- Hedgehog, etc. in one tree. Common in serious library code.

-- @?= is the HUnit equality assert.
-- testProperty runs QuickCheck with 100 random inputs by default.
```

**QuickCheck — property-based testing**

```haskell
import Test.QuickCheck

-- Properties are functions returning Bool:
prop_reverse :: [Int] -> Bool
prop_reverse xs = reverse (reverse xs) == xs

-- Run: quickCheck prop_reverse   (100 random inputs by default)

-- Conditional properties (==>): only check when pred holds
prop_sortedHead :: NonEmptyList Int -> Property
prop_sortedHead (NonEmpty xs) =
    not (null xs) ==>
        head (sort xs) == minimum xs

-- Counterexamples are minimized automatically — QuickCheck shrinks.

-- Custom generators:
genColor :: Gen String
genColor = elements ["red", "green", "blue"]

prop_hasColor :: Property
prop_hasColor = forAll genColor $ \c -> c `elem` ["red", "green", "blue"]
```

**Hedgehog — property testing with integrated shrinking**

```haskell
import Hedgehog
import qualified Hedgehog.Gen as Gen
import qualified Hedgehog.Range as Range

prop_reverse :: Property
prop_reverse = property $ do
    xs <- forAll $ Gen.list (Range.linear 0 100) Gen.int
    reverse (reverse xs) === xs

main :: IO Bool
main = checkSequential $ Group "Test.Main"
    [ ("prop_reverse", prop_reverse) ]

-- Hedgehog's advantage: integrated shrinking (faster, more thorough than
-- QuickCheck's type-class-based). Also has Gen with better combinators.
-- QuickCheck is older and more widely used; Hedgehog is gaining ground.

-- Coverage checking: cover 50% "non-empty" to ensure test quality:
prop_withCoverage = property $ do
    xs <- forAll genList
    cover 50 "non-empty" (not (null xs))
    reverse (reverse xs) === xs
```

## Performance Tuning

- foldl' (strict) over foldl — foldl builds thunks; OOM on large lists. Almost always want foldl'.
- Strict fields (!) on records prevent space leaks — most record types should be strict by default.
- BangPatterns (!pat) force evaluation to WHNF — use in hot loops where thunks accumulate.
- Laziness has overhead: every value is a closure until forced. Strict Data.Text / strict ByteString / Vector avoid this for sequences.
- GHC specializes typeclass calls when types are known at the call site. Avoid polymorphic recursion in hot code.
- INLINE pragmas on small helpers expose them to the optimizer; GHC inlines aggressively by default with -O2.
- Rewrite rules (RULES pragma) let libraries do fusion — ByteString/Text/Vector use this for 'stream fusion'.
- newtype is erased at runtime — zero overhead vs data which allocates. Use newtype for type-safe wrappers.
- Green threads: ~1KB stack each; millions feasible. RTS scales across N OS threads with -N.
- STM is slower than MVar for uncontended cases (~3-5x), but composes — pick based on contention profile.
- Lazy IO (readFile, getContents) leaks file handles if streams aren't fully consumed. Use strict variants + bracket.
- Weak head normal form (WHNF) vs normal form (NF): seq forces WHNF (outer constructor); deepseq forces NF (full tree).
- GHC -O2 does aggressive optimization (inlining, fusion, specialization); -O0 is ~10-100x slower for numeric code.
- Profile with -prof + -fprof-auto; read with hp2ps or hp2any-graph. Time + allocation profiles.
- Eventlog (traceEvent) + ghc-events for production profiling — low overhead, can be enabled in release builds.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [GHC](https://www.haskell.org/ghc/) | Glasgow Haskell Compiler — the de-facto standard compiler. Most extensions, best optimization. | build |
| [Cabal](https://www.haskell.org/cabal/) | Build tool + package format (.cabal). The standard; 'cabal build', 'cabal test', 'cabal install'. | build |
| [Stack](https://docs.haskellstack.org/) | Higher-level build tool — curated Stackage snapshots, reproducible builds, multi-GHC support. | build |
| [ghcup](https://www.haskell.org/ghcup/) | GHC / cabal / stack / HLS version manager — like rustup for Haskell. The recommended installer. | build |
| [Haskell Language Server (HLS)](https://haskell-language-server.readthedocs.io/) | LSP server — code completion, goto-def, refactoring, type info. Works in VS Code, Vim, Emacs. | build |
| [Hackage](https://hackage.haskell.org/) | The original package repository — like npm/crates.io. cabal pulls from here. | package |
| [Stackage](https://www.stackage.org/) | Curated package sets — every package in a snapshot is compatible. Stack uses Stackage by default. | package |
| [Hoogle](https://hoogle.haskell.org/) | Search by TYPE signature — 'a -> b -> a' finds 'const'. The single most useful Haskell tool. | build |
| [Hspec](https://hspec.github.io/) | RSpec-style BDD testing — describe/it, matchers, before/after hooks. Popular for new code. | test |
| [Tasty](https://github.com/UnkindPartition/tasty) | Combinator-style test framework — combines HUnit, QuickCheck, SmallCheck, Hedgehog in one tree. | test |
| [QuickCheck](https://hackage.haskell.org/package/QuickCheck) | Property-based testing pioneer — generates 100s of random inputs, shrinks counterexamples. | test |
| [Hedgehog](https://hedgehog.qa/) | Modern property testing with integrated shrinking — gaining on QuickCheck. | test |
| [Criterion](https://hackage.haskell.org/package/criterion) | Micro-benchmarking — statistical analysis, regression detection. The 'btime' for Haskell. | test |
| [Weeder](https://github.com/ocharles/weeder) | Dead-code detection — finds unused exports and imports. | lint |
| [HLint](https://hackage.haskell.org/package/hlint) | Linter — suggests cleaner / more idiomatic code. Configurable, widely adopted. | lint |
| [ormolu / fourmolu](https://hackage.haskell.org/package/ormolu) | Code formatters — opinionated, deterministic. ormolu is strict; fourmolu is configurable. | lint |
| [eventlog2html / ghc-events](https://mpickering.github.io/eventlog2html/) | Profile visualization — converts GHC eventlog to interactive HTML flame graphs. | debug |
| [Yesod / Servant / Scotty](https://docs.servant.dev/) | Web frameworks — Yesod is batteries-included, Servant is type-safe APIs, Scotty is Sinatra-like. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 1990 | Haskell 1.0 report — the committee unifies ~12 lazy functional languages into one. |
| Haskell 98 | 1999 | First standardized version — base library, syntax, semantics. Many compilers converge. |
| GHC 6.0 | 2004 | GHC introduces GeneralizedNewtypeDeriving, FFI, Template Haskell. Becomes the dominant compiler. |
| Haskell 2010 | 2010 | Latest formal standard — minor additions over 98 (FFI, DoAndIfThenElse). Real-world code uses many extensions beyond it. |
| GHC 7.0 | 2010 | TypeFamilies, GADTs mainstream. Haskell Platform (bundled GHC + libs) launches. |
| GHC 7.10 | 2015 | Applicative becomes superclass of Monad; AMP (Applicative-Monad Proposal) — breaks old code. |
| Stack | 2015 | Commercial Haskell releases Stack — Stackage snapshots solve the cabal hell dependency problem. |
| GHC 8.0 | 2016 | TypeApplications groundwork, DuplicateRecordFields, StrictData extension (strict-by-default records). |
| GHC 8.2 | 2017 | DerivingStrategies, UnboxedSums. Compact regions for sharing data between threads cheaply. |
| GHC 8.6 | 2018 | DerivingVia, QuantifiedPredicates groundwork, GHCi improvements. HP dies; ghcup takes over. |
| GHC 9.0 | 2021 | Linear types (LinearTypes), Big-array-of-changes for the type system. Major Num/Enum reorganization. |
| GHC 9.2 | 2021 | Records redesign (OverloadedRecordDot), extensibility improvements, WASM backend progress. |
| GHC 9.4 | 2022 | JS backend (replacing GHCJS), Pratt parser for less-coupled syntax, runtime improvements. |
| GHC 9.6 / 9.8 | 2023 | Stable type system extensions, improved inference, primitive arrays. HLS becomes mature. |
| GHC 9.10 | 2024 | Improved records (OverloadedRecordUpdate), cross-module record field resolution, perf work. |
| GHC 9.14 (LTS) | 2025 | First official LTS line (9.14.1, Dec 2025): GHC API restructure matured, improved cross-compilation, low-level primops; HLS stable for industrial use. GHC 10.0.1 at alpha as of late 2026. |

## Interview Hot Questions

1. **What is a monad, and why is the concept useful?** *(medium)*

   A monad is a type constructor m with two operations: return (a -> m a, wrap a value) and bind (m a -> (a -> m b) -> m b, sequence). It lets you chain computations in a context (IO, Maybe, Either, State, List) without exposing the plumbing. do-notation is sugar for bind chains. Monads must satisfy laws (left/right identity, associativity) so that refactoring is safe. The concept is useful because it captures 'effectful computation' as a uniform interface — you can write generic code (mapM, foldM) that works for any monad.

2. **Explain laziness — when is it good, when is it bad?** *(medium)*

   Laziness means values are computed only when their results are needed. take 5 [1..] works on an infinite list because Haskell never materializes the rest. Good: compositional code (map f . filter g . takeWhile h builds a pipeline that runs in one pass), cheap if-not-used semantics. Bad: space leaks when thunks accumulate (foldl builds a chain of n thunks), unpredictable memory, hard to reason about resource lifetimes (lazy IO leaks file handles). Mitigation: foldl' (strict accumulator), BangPatterns, strict fields, strict Text/ByteString.

3. **What's a space leak and how do you fix one?** *(medium)*

   A space leak is when thunks accumulate in memory instead of being evaluated. Classic: foldl (+) 0 [1..n] builds a thunk of depth n before forcing — OOM for large n. Fix: use foldl' (strict accumulator) from Data.List. For records, declare strict fields (!) so they're forced to WHNF on construction. For complex types, use deepseq / NFData to force to normal form. Profile with -prof +hp2ps to find the leak source; GHC's eventlog shows heap growth over time.

4. **What's the difference between typeclasses and OOP interfaces?** *(hard)*

   Typeclasses are AD-HOC polymorphism resolved at compile time via dictionary passing (or specialization). An instance is declared separately from the type — you can add Eq instances for types you don't own. OOP interfaces are nominal subtyping — methods are resolved at runtime via vtable, and the interface is part of the type's declaration. Typeclasses can dispatch on the RETURN type (read :: Read a => String -> a); OOP cannot. Typeclasses have laws (functor laws, monad laws); OOP interfaces don't enforce semantics. Multi-param typeclasses and functional dependencies generalize further.

5. **Explain Maybe and Either — when use which?** *(easy)*

   Maybe a = Nothing | Just a — for absence with no error info. Use for optionals, lookups where missing is normal. Either e a = Left e | Right a — for fallible operations with structured error info (convention: Left = error, Right = success). Either is a Monad on Right, so 'do' blocks short-circuit on Left — like exceptions but at the type level. Use Maybe for 'is there?' (no why); use Either for 'did it work?' (with why). For richer errors with multiple causes, use ExceptT or Validation (which accumulates all errors).

6. **What does <$> vs <*> vs >>= do, and when use each?** *(medium)*

   <$> is fmap — applies a pure function inside a context (Just 3 -> Just . (1+) <$> Just 3 -> Just 4). <*> is Applicative apply — applies a function inside a context to a value inside a context: Just (1+) <*> Just 3 -> Just 4. >>= is Monad bind — sequences with dependence: m >>= (\x -> ...) where the next computation depends on x. Use <$> when args are independent; <*> chains independent effects; >>= when each step depends on the previous result. do-notation desugars to >>=; Applicative form (f <$> a <*> b) is more parallel/optimizable.

7. **How does GHC optimize Haskell — what does -O2 actually do?** *(hard)*

   GHC does aggressive inlining, rewrite rules (RULES pragma — libraries define fusions like ByteString/Text), strictness analysis (inserts seq where it's safe), specialization (monomorphizes typeclass calls at known types), worker/wrapper transforms (splits a function into a strict worker + lazy wrapper), and float-in/float-out (move bindings to where they're used). -O2 enables more aggressive versions of all of these. -O0 is ~10-100x slower for numeric code. -fllvm uses LLVM's optimizer for better codegen on numerics. Profile with -prof to see what's slow.

8. **What's the difference between seq, deepseq, and BangPatterns?** *(medium)*

   seq :: a -> b -> b forces 'a' to weak head normal form (WHNF) — only the outermost constructor. For (Just (1+2)), seq makes it Just (thunk), not Just 3. deepseq :: NFData a => a -> b -> b forces to normal form — the whole tree. BangPatterns (!pat) force the matched value to WHNF on function entry — cleaner than manual seq. Strict fields (data T = T { x :: !Int }) force on construction. Use BangPatterns + strict fields as the modern default; reserve deepseq for forcing big structures at known boundaries.

9. **How would you design a Haskell web service?** *(hard)*

   Stack: Servant (type-safe API at the type level) or Yesod (batteries-included) + Warp (HTTP server) + Persistent/Esqueleto (DB) + rio/monad-logger (logging) + Prometheus (metrics). Architecture: encode business rules as pure functions (testable, no IO); wrap with a ReaderT env IO for config/DB; use ExceptT for error channels at boundaries. Deploy: Docker image built via nix or cabal-install; or static binary via static-haskell-nix. Concurrency: async for parallel requests, STM for shared state. Watch out for: lazy IO (use strict streaming), exception handling (use safe-exceptions), and connection pooling (resource-pool).

## When to Choose This

- **vs Rust:** use this — Compiler/DSL work, type-system research, web APIs (Servant), when you want cheap concurrency via STM.; use that — Systems software, embedded, memory-safety requirements, WebAssembly, anything needing predictable latency (no GC).
- **vs Scala:** use this — Pure FP, type-system research, when the JVM is a liability rather than asset, smaller deployable.; use that — JVM ecosystem, Big Data (Spark, Akka), teams with Java/Scala background, mixed FP/OOP codebases.
- **vs OCaml:** use this — Pure lazy FP, larger ecosystem (Hackage), richer type system extensions (GADTs, TypeFamilies).; use that — Strict-by-default (easier perf reasoning), faster compile, ML lineage, CompCert/Coq/financial-industry adoption.
- **vs F#:** use this — Cross-platform non-Microsoft, larger pure-FP ecosystem, deeper type-system features.; use that — Microsoft/.NET ecosystem, interop with C# libraries, enterprise .NET shops, when you need OOP integration.

