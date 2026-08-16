import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "haskell",
  name: "Haskell",
  category: "languages",
  tier: 3,
  tags: ["functional", "static", "pure", "lazy", "typeclasses", "compiled", "research-language"],
  tagline: "A pure, lazy, statically-typed functional language — the research lab where the ideas behind Rust, Swift, and TypeScript type systems were rehearsed.",
  year: 1990,
  author: "Haskell Committee",

  tldr: [
    "Haskell is a lazily-evaluated, purely functional language with a Hindley-Milner-derived type system, typeclasses, and algebraic data types; side effects are isolated by the `IO` (and `STM`, `State`, `Reader`) monads.",
    "It is used in production at Facebook (Sigma anti-abuse, Haxl), Standard Chartered (Mu), Tesla (firmship tooling), GitHub (semantic), and several fintech houses; the GHC compiler is the de facto standard.",
    "Reach for Haskell when correctness is paramount (compilers, formal-ish DSLs, type-safe web APIs), when you need cheap concurrency via green threads + STM, or when you want to learn the type-system ideas Rust/Swift borrowed.",
    "Avoid Haskell for systems with hard realtime or memory predictability (laziness makes both hard), where hiring is constrained (small talent pool), or where the team wants Python-style 'just hack it out' velocity — Haskell demands upfront design.",
  ],

  mentalModel: {
    title: "Pure functions + effects tracked in the type",
    body: "Every Haskell function is pure — same input, same output, no side effects. IO is just a value of type `IO a` describing what to do; the runtime executes the one `main :: IO ()` value. `>>=` (bind) sequences effects without breaking purity. Laziness means values are computed on demand: `take 5 [1..]` works on an infinite list because Haskell never materializes the rest. This enables compositional code (`map f . filter g . takeWhile h`) but introduces a second model: space leaks when thunks accumulate, and strictness annotations (`!`, `BangPatterns`, `foldl'`) are how you fight back. Typeclasses (`class Eq a where (==) :: a -> a -> Bool`) are interfaces + laws, not OOP hierarchies — ad-hoc polymorphism resolved at compile time.",
  },

  constructs: [
    { syntax: "data Tree a = Leaf | Node a (Tree a) (Tree a)", behavior: "Algebraic data type — sum (Leaf | Node) of products; recursive by default.", when: "All domain modeling; pattern matching is how you consume ADTs." },
    { syntax: "f :: Int -> String -> Bool", behavior: "Type signature; curried by default — `f x y` not `f(x, y)`.", when: "Every top-level function — types come first, often before the implementation." },
    { syntax: "case x of Just v -> v; Nothing -> 0", behavior: "Pattern match — exhaustive on sum types (warning if not).", when: "Branching on ADTs; the compiler enforces coverage." },
    { syntax: "class Eq a where (==) :: a -> a -> Bool", behavior: "Typeclass — an interface with laws; instances are declared separately from the type.", when: "Generic library code; ad-hoc polymorphism." },
    { syntax: "instance Eq Color where Red == Red = True", behavior: "Instance declaration — typeclass dispatched at compile time, monomorphized.", when: "Implementing typeclasses for your types." },
    { syntax: "do { x <- getLine; putStrLn x }", behavior: "do-notation — sugar for `>>=` chains over a monad; binds effects sequentially.", when: "IO, State, Reader, Parser — anywhere a monad is involved." },
    { syntax: "main :: IO ()\nmain = do ...", behavior: "Program entry — the single IO value the runtime executes.", when: "All executables; libraries export values, not effects." },
    { syntax: "data T = T { name :: !Text, count :: !Int }", behavior: "Strict fields via `!` — evaluated to WHNF when the constructor is applied, preventing thunks.", when: "Most record types — strict-by-default avoids the #1 space leak source." },
    { syntax: "f = \\x y -> x + y", behavior: "Lambda — anonymous, curried; equivalent to `f x y = x + y`.", when: "Short closures, point-free pipelines." },
    { syntax: "newtype Age = Age Int", behavior: "Zero-cost wrapper — same runtime representation as Int, distinct compile-time type.", when: "Type-safe ids, units-of-measure, avoiding stringly-typed APIs." },
    { syntax: "f <$> Just 3 <*> Just 4", behavior: "Applicative chain — `<$>` is `fmap`, `<*>` sequences effects into a function call.", when: "Combining multiple effectful values; alternatives to monadic do." },
    { syntax: "{-# LANGUAGE TypeApplications #-}\nf @Int", behavior: "Type application — pass a type as an explicit argument (visible type application).", when: "Disambiguating typeclass calls; type-level programming." },
  ],

  patterns: [
    {
      lang: "haskell",
      caption: "ADT + typeclass — modeling a payment method",
      code: `{-# LANGUAGE DerivingStrategies #-}
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
  where unpack = Data.Text.unpack`,
    },
    {
      lang: "haskell",
      caption: "IO with do-notation — the only place side effects happen",
      code: `{-# LANGUAGE OverloadedStrings #-}
import qualified Data.Text as T
import qualified Data.Text.IO as TIO

main :: IO ()
main = do
  TIO.putStrLn "Enter your name:"
  name <- T.filter (not . T.isSpace) . T.toLower <$> TIO.getLine
  let greeting = "Hello, " <> name <> "!"
  TIO.putStrLn greeting
  appendFile "log.txt" (greeting <> "\\n")  -- IO () return

-- do desugars to:
--   TIO.putStrLn "..." >> TIO.getLine >>= \name -> ...
-- Every line that "does" something is a value of type IO a; the
-- whole block is IO () because the last expression is.`,
    },
    {
      lang: "haskell",
      caption: "Strict fold over a lazy list — the space-leak fix",
      code: `-- BAD: foldl builds a chain of thunks proportional to list length.
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
main = print (sumGood [1..10^7])   -- 50000005000000, in ~30MB RSS`,
    },
    {
      lang: "haskell",
      caption: "STM for composable concurrency — no deadlocks",
      code: `{-# LANGUAGE OverloadedStrings #-}
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
  putStrLn $ "a=" <> show a' <> " b=" <> show b'   -- a=80 b=20`,
    },
  ],

  pitfalls: [
    {
      title: "Space leaks from lazy folds",
      symptom: "`foldl (+) 0 [1..n]` builds a thunk of depth n before forcing — gigabytes of RAM for n = 10^7, OOM for n = 10^9.",
      fix: "Use `foldl'` (strict accumulator) from Data.List — almost always what you want. For monadic folds, use `foldM'` or `foldlM` with a strict accumulator. Enable `BangPatterns` and use `f !acc x = ...` if needed.",
    },
    {
      title: "Lazy IO and file handle leaks",
      symptom: "`readFile \"huge.txt\"` returns a lazy String that holds the filehandle open until the entire stream is consumed — exceptions or partial consumption leak handles.",
      fix: "Use strict `Data.Text.IO.readFile` / `Data.ByteString.readFile` (still chunked, but evaluated eagerly). For streaming, use `conduit`, `pipes`, or `streaming` libraries that make resource lifetimes explicit.",
    },
    {
      title: "`seq` doesn't fully evaluate",
      symptom: "`x \`seq\` y` forces x to weak head normal form (WHNF) — for most data types, that's only the outermost constructor. Nested thunks remain; `seq` on a `Maybe (Int, Int)` does NOT evaluate the Int pair.",
      fix: "Use `deepseq` (forces to normal form) with `NFData` instances. For records, declare strict fields (`!`) or use `force` from `Control.DeepSeq`. `BangPatterns` give you `f !x = ...` syntax.",
    },
    {
      title: "Monomorphism restriction surprises",
      symptom: "A top-level `g = id` without a type signature gets a default type `g :: () -> ()` due to the monomorphism restriction — calling `g 5` then fails with a type error.",
      fix: "Always annotate top-level definitions, or write `g x = id x` (the restriction only applies to fully point-free definitions). Disable with `{-# LANGUAGE NoMonomorphismRestriction #-}` (default off since GHC 7.8).",
    },
    {
      title: "Bottom (⊥) leaks past type checking",
      symptom: "`undefined`, `error \"boom\"`, and non-terminating expressions have any type — they pass type checking and crash at runtime. `head []` throws an exception, not a type error.",
      fix: "Use total functions: `Data.List.Extra.headErr` is partial; prefer pattern matching on `NonEmpty a` (Data.List.NonEmpty) which guarantees a head. Use `Maybe`/`Either` for fallible operations and handle every branch.",
    },
    {
      title: "Typeclass instance resolution is global and non-overlapping",
      symptom: "Defining `instance Show MyType` in two modules gives an overlapping-instances error at link time. You can't selectively override an instance for a subclass.",
      fix: "Use `newtype` wrappers (`newtype Json a = Json a`) to attach a different instance without touching the underlying type. Use `{-# LANGUAGE OverlappingInstances #-}` or `{-# LANGUAGE OverloadedRecordDot #-}` only as a last resort.",
    },
    {
      title: "Exception handling in pure code is invisible",
      symptom: "A pure function can throw via `error` or `throw` and there's no `throws` in the type. Code that looks total can crash deep in the middle of an unrelated `map`.",
      fix: "Use `ExceptT` / `Either` for recoverable errors — they appear in the type. Reserve `error` for genuinely unreachable code (and document it). For IO exceptions, use `Control.Exception.bracket` for resource safety and `try` for catching.",
    },
  ],

  quickReference: [
    { fact: "GHC 9.6 / 9.8 / 9.10 are the current series (2024); the language report is Haskell 2010, but real-world code uses dozens of language extensions.", tag: "version" },
    { fact: "Cabal is the build tool's package format; `cabal` and `stack` are the user-facing build tools. `ghcup` manages GHC versions; HLS (Haskell Language Server) provides LSP.", tag: "version" },
    { fact: "Laziness: a value is computed only when its result is needed. `take 5 [1..]` is O(5), not O(∞). But unbounded thunks = space leaks.", tag: "perf" },
    { fact: "GHC compiles to native via LLVM (default) or C; aggressive inlining + rewrite rules can match C speed for numeric loops, but typical Haskell is ~1.5-3x Python (better or worse depending on laziness management).", tag: "perf" },
    { fact: "Green threads: `Control.Concurrent.forkIO` creates cheap threads (~1KB stack); GHC's runtime schedules them across OS threads. Millions of threads is feasible.", tag: "perf" },
    { fact: "STM (Software Transactional Memory) composes atomically — `atomically $ do { transfer a b; transfer c d }` either all commits or retries; no deadlocks, no manual lock ordering.", tag: "complexity" },
    { fact: "Typeclasses dispatch at compile time via dictionary passing; GHC specializes per call site when types are known. `Show` is monomorphic per call.", tag: "complexity" },
    { fact: "`newtype` is erased at runtime — zero overhead. `data` allocates. Use `newtype` for type-safe wrappers.", tag: "perf" },
    { fact: "Type inference is Hindley-Milner + extensions; you usually annotate top-level functions for documentation and to catch errors locally.", tag: "style" },
    { fact: "Common extensions in 2024: OverloadedStrings, LambdaCase, BangPatterns, DerivingStrategies, TypeApplications, GADTs, DataKinds, RecordWildCards. Stack/Cabal default them per-package.", tag: "version" },
    { fact: "Exceptions in pure code (`error`, `throw`) escape the type system — use `Either`/`ExceptT`/`Maybe` for recoverable failure.", tag: "gotcha" },
    { fact: "`seq` forces to WHNF (outer constructor only); `deepseq` forces to normal form. Most space leaks are 'needed a `seq` here'.", tag: "gotcha" },
    { fact: "Naming: camelCase for functions/variables, PascalCase for types/modules. Type variables are single letters (a, b, m).", tag: "style" },
    { fact: "Hoogle (haskell.org/hoogle) searches functions by type signature — `a -> b -> a` finds `const`. The single most useful tool after GHC.", tag: "style" },
    { fact: "FFI to C is built-in (`foreign import ccall`); inline-c and hs-gitlab bindings provide higher-level bridges to C++/Rust.", tag: "version" },
  ],

  goDeeper: [
    { title: "Haskell Documentation & GHC User's Guide", url: "https://downloads.haskell.org/ghc/latest/docs/users_guide/", note: "The GHC manual — every language extension, every flag. The real language spec." },
    { title: "Learn You a Haskell for Great Good", url: "http://learnyouahaskell.com/", note: "Free, illustrated intro; covers syntax and typeclasses. Pairs well with Real World Haskell for production concerns." },
    { title: "Real World Haskell (Bryan O'Sullivan et al.)", url: "http://book.realworldhaskell.org/", note: "Free online; the canonical 'how do I do IO, FFI, testing, web in Haskell' book." },
    { title: "Parallel and Concurrent Programming in Haskell (Simon Marlow)", url: "https://simonmar.github.io/pages/pcph.html", note: "Free online by the GHC RTS author; the authoritative treatment of green threads, STM, and parallel strategies." },
    { title: "Haskell Wiki & Hackage", url: "https://wiki.haskell.org/", note: "Community knowledge base + the package index. Stackage provides curated, compatible snapshot builds." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "Int", behavior: "Fixed-size signed integer (64-bit on most platforms). Bounded — wraps on overflow.", when: "Counters, indices. For unbounded: Integer." },
      { syntax: "Integer", behavior: "Arbitrary-precision integer — never overflows. Slower than Int.", when: "Big numbers, crypto, exact arithmetic. Default for literal if no type sig." },
      { syntax: "Word / Word8 / Word16 ...", behavior: "Unsigned integers — Word is native size, Word8 for bytes.", when: "Bit manipulation, binary protocols, hashing." },
      { syntax: "Float / Double", behavior: "IEEE 754 single/double. Double is the default for fractional literals.", when: "Math. For exact decimal use Data.Decimal or scientific; for fractions use Ratio (Rational)." },
      { syntax: "Rational / Ratio Int", behavior: "Exact fraction — 1 % 2 + 1 % 3 == 5 % 6. No float rounding.", when: "Money (small scope), testing float algorithms, exact arithmetic." },
      { syntax: "Char", behavior: "Unicode code point — 'a', '\\\\n', '\\\\x41'. 32-bit, NOT 8-bit byte.", when: "Text processing. Text/ByteString for sequences of Char/Word8." },
      { syntax: "Bool", behavior: "Two constructors: True, False. if/most logic accept Bool only — no truthy/falsy.", when: "Logic. From Enum/Ord (True > False). Distinct from 1/0." },
      { syntax: "()  (unit)", behavior: "The unit type — only one value, also written (). Like void in C, but a real value.", when: "Functions returning no useful value: IO (). The 'result' of side effects." },
    ],
    collections: [
      { syntax: "[a]  (linked list)", behavior: "Singly-linked list — lazy, O(1) cons, O(n) index. The default collection.", when: "Streams, sequence processing. NOT an array — random access is O(n)." },
      { syntax: "Data.List.NonEmpty", behavior: "List guaranteed non-empty — head is total, no partial function errors.", when: "APIs where emptiness is a bug, not a case. Use over [a] when you can guarantee it." },
      { syntax: "Data.Vector", behavior: "Packed contiguous array — O(1) index, fast slice. Boxed, Unboxed, Storable variants.", when: "Numerics, large collections. Default for performance-critical list-like data." },
      { syntax: "Data.Text", behavior: "Packed UTF-16 (or UTF-8 with text-shortest) string — O(n) index but cache-friendly.", when: "All real text. Use over String for any non-trivial text processing." },
      { syntax: "Data.ByteString", behavior: "Packed byte sequence — Word8 elements, NOT Char. Lazy and Strict variants.", when: "Binary protocols, file/network I/O, hashing. Strict for small, Lazy for streaming." },
      { syntax: "Data.Map k v", behavior: "Balanced tree map — O(log n) lookup/insert. Keys must be Ord.", when: "Ordered key-value. For hash-based use Data.HashMap (faster, unordered)." },
      { syntax: "Data.HashMap k v", behavior: "Hash-based map — O(log n) worst, O(1) avg. Keys must be Hashable.", when: "Fast keyed lookup when ordering doesn't matter." },
      { syntax: "Data.Set / Data.HashSet", behavior: "Sorted set / hash set — O(log n) / O(1) operations.", when: "Dedup, membership, set algebra. Set needs Ord; HashSet needs Hashable." },
      { syntax: "Data.Sequence", behavior: "Finger tree — O(1) cons/snoc/view at both ends, O(log n) middle insert.", when: "Queues, deques, anywhere you need both-end operations efficiently." },
      { syntax: "Data.Array", behavior: "Immutable boxed array — O(1) index. Mutable variant in Data.Array.MArray.", when: "Tables, lookup arrays. Less common than Vector for new code." },
    ],
    custom: [
      { syntax: "data Tree a = Leaf | Node a (Tree a) (Tree a)", behavior: "Algebraic data type — sum (|) of products. Pattern matching is the way to consume.", when: "All domain modeling. Recursive ADTs are the canonical data structure." },
      { syntax: "data T = T { name :: !Text, age :: !Int }", behavior: "Record with strict fields (!) — evaluated to WHNF on construction, prevents thunks.", when: "Most record types — strict-by-default avoids space leaks." },
      { syntax: "newtype Age = Age Int", behavior: "Zero-cost wrapper — same runtime rep as Int, distinct compile-time type.", when: "Type-safe ids, units-of-measure, avoiding stringly-typed APIs." },
      { syntax: "type Alias = Int -> String", behavior: "Type alias — fully resolved at compile time, no new type. Symmetric with type params.", when: "Documentation, complex generics. Use newtype for actual type safety." },
      { syntax: "class Eq a where (==) :: a -> a -> Bool", behavior: "Typeclass — interface + laws; instances declared separately from the type.", when: "Generic library code, ad-hoc polymorphism. Laws (reflexivity, symmetry) are documented." },
      { syntax: "instance Eq Color where Red == Red = True", behavior: "Instance declaration — typeclass dispatched at compile time (or via dictionary at runtime).", when: "Implementing typeclasses for your types. deriving (Eq, Show) auto-generates common ones." },
      { syntax: "data Maybe a = Nothing | Just a", behavior: "Option type — None-safe. Pattern match exhaustively; compiler enforces.", when: "Optional values, fallible operations. Replaces null/None." },
      { syntax: "data Either e a = Left e | Right a", behavior: "Either — convention: Left = error, Right = success. Monad on Right.", when: "Error channels in pure code; EitherT/ExceptT for effectful error propagation." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "+, -, *, /", behavior: "Arithmetic via Num/Fractional typeclasses. / requires Fractional — Int doesn't have it.", when: "Math. Int division: div (floor), quot (truncate). Use div for indexing." },
    { syntax: "div, mod, quot, rem", behavior: "div/mod: floored (sign of divisor). quot/rem: truncated (sign of dividend).", when: "Integer math. div/mod are the 'math-correct' pair; quot/rem match C." },
    { syntax: "^  (power)", behavior: "Exponentiation — only non-negative integer powers (^). Use ** for float powers.", when: "Math. 2 ^ 10 == 1024. For matrix power use Numeric.LinearAlgebra." },
    { syntax: "&&, ||, not", behavior: "Short-circuit boolean — strict in first arg, lazy in second.", when: "Logic. && and || are functions (not syntax), so they can't auto-overload (use <&&> from semigroupoids if needed)." },
    { syntax: "==, /=, <, >, <=, >=", behavior: "Comparison via Eq/Ord typeclasses. /= is not-equal (the only non-C name).", when: "Equality, ordering. Ord implies Eq; gives min, max, compare, sort." },
    { syntax: "compare  (Ordering)", behavior: "Returns LT | EQ | GT — full tri-state comparison in one call.", when: "Sort comparators, branch-free ordering logic." },
    { syntax: "$  (low-precedence apply)", behavior: "Function application at lowest precedence — f $ g $ h x == f (g (h x)).", when: "Avoiding parens. Right-associative; common in composition chains." },
    { syntax: ".  (function composition)", behavior: "Right-to-left composition: (f . g) x = f (g x).", when: "Building pipelines. Common in point-free style: count = length . filter pred." },
    { syntax: "<$>  (fmap), <*>  (apply)", behavior: "Functor map and Applicative apply — for contexts (Maybe, Either, IO, List).", when: "Effectful function application. f <$> Just 3 <*> Just 4 == Just (f 3 4)." },
    { syntax: ">>=  (bind), >>  (sequence)", behavior: "Monad bind: m >>= f passes m's value to f, flattening the result. >> discards.", when: "All monadic sequencing. do-notation desugars to >>= chains." },
    { syntax: "=<<  (reverse bind)", behavior: "Like >>= but with args flipped — f =<< m. Common in point-free style.", when: "When the function is the focus. Read as 'apply f to m's value'." },
    { syntax: "<|>  (alternative), empty", behavior: "Alternative typeclass — choice/fallback. m1 <|> m2 tries m1, falls back to m2.", when: "Parsing (Parsec), Maybe fallback, list concatenation, validation accumulation." },
    { syntax: ">>= vs <$> vs <*>" , behavior: "Monad (single-result), Functor (pure context), Applicative (independent effects).", when: " <$> when args are independent; <*> chains independent; >>= when next depends on previous." },
    { syntax: "seq  /  $!  /  `seq`", behavior: "Force evaluation to WHNF before continuing — manual strictness.", when: "Rarely in user code; prefer BangPatterns, strict fields, foldl'." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "haskell",
      caption: "Basic stdout / stdin via IO",
      code: `main :: IO ()
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
-- (conduit, pipes, streaming) for robust resource management.`,
    },
    {
      lang: "haskell",
      caption: "File I/O with bracket for resource safety",
      code: `import Control.Exception (bracket)
import qualified Data.Text as T
import qualified Data.Text.IO as TIO

-- bracket: acquire, use, release — release runs even on exception.
readFileSafely :: FilePath -> IO T.Text
readFileSafely path =
    bracket (openFile path ReadMode) hClose $ \\h -> do
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
-- code — strict Text/ByteString + bracket is the modern pattern.`,
    },
    {
      lang: "haskell",
      caption: "JSON with aeson — the de-facto standard",
      code: `{-# LANGUAGE DeriveGeneric, OverloadedStrings #-}
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
    parseJSON = withObject "User" $ \\o -> User
        <$> o .: "id"
        <*> o .: "name"
        <*> o .:? "tags" .!= []`,
    },
    {
      lang: "haskell",
      caption: "HTTP client (http-client) + connection pooling",
      code: `{-# LANGUAGE OverloadedStrings #-}
import Network.HTTP.Client
import Network.HTTP.Types.Status (statusCode)

main :: IO ()
main = do
    -- Manager pools connections; create once per app, share across requests.
    mgr <- newManager defaultManagerSettings

    req <- parseRequest "https://api.example.com/v1/users"
    let req' = req { method = "POST"
                   , requestHeaders = [("Content-Type", "application/json")]
                   , requestBody = RequestBodyLBS "{\"k\":1}"
                   }

    -- withResponse uses bracket — closes the connection on exit.
    withResponse req' mgr $ \\resp -> do
        if statusCode (responseStatus resp) == 200
            then do
                body <- brRead (responseBody resp)
                putStrLn ("got " ++ show (length body) ++ " bytes")
            else hPutStrLn stderr "request failed"

-- For higher-level API: req, wreq, http-conduit packages.
-- http-client is the foundation; pick a higher-level wrapper.`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "haskell",
      caption: "map / filter / fold — the trinity",
      code: `-- map applies a function to each element:
squares = map (^2) [1..10]              -- [1,4,9,...,100]

-- filter keeps elements satisfying a predicate:
evens = filter even [1..10]              -- [2,4,6,8,10]

-- foldl' (strict) reduces left-to-right:
import Data.List (foldl')
total = foldl' (+) 0 [1..1000]           -- 500500

-- foldr processes from the right; can short-circuit on infinite lists:
any' p = foldr (\\x acc -> p x || acc) False

-- Composition — point-free style:
countEven = length . filter even         -- [Int] -> Int

-- Laziness: [1..] is infinite — map over it lazily:
take 5 (map (^2) [1..])                   -- [1,4,9,16,25]

-- DON'T use foldl (lazy) — it builds thunks. Use foldl'.`,
    },
    {
      lang: "haskell",
      caption: "List comprehensions",
      code: `-- Like math set-builder notation:
squares = [x^2 | x <- [1..10]]
evens   = [x | x <- [1..100], even x]

-- Multiple generators (cartesian product):
pairs = [(x, y) | x <- [1..3], y <- [1..3]]

-- With guards (filters) and transforms:
positiveDiffs = [x - y | x <- xs, y <- ys, x > y]

-- Parallel zip comprehension (ParallelListComp extension):
[ (a, b) | a <- as | b <- bs ]

-- Comprehensions are sugared into map/filter/concat; same performance.`,
    },
    {
      lang: "haskell",
      caption: "Recursion + accumulator (tail-recursive)",
      code: `-- Naive recursion (NOT tail-recursive):
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
isOdd n = isEven (n - 1)`,
    },
    {
      lang: "haskell",
      caption: "Iterating effectful computations — mapM_, forM_, traverse",
      code: `import Control.Monad (forM_, mapM_)

-- mapM_ applies an IO action to each element, discards results:
printAll :: [Int] -> IO ()
printAll = mapM_ print

-- forM_ = flip mapM_ — reads like a for loop:
forM_ [1..5] $ \\i -> do
    putStrLn ("i = " ++ show i)

-- traverse (Applicative) generalizes mapM — collects results:
readInts :: [String] -> IO [Int]
readInts = traverse (\\s -> pure (read s))

-- sequence / sequence_ — turn [IO a] into IO [a]:
actions :: [IO Int]
actions = [pure 1, pure 2, pure 3]
results :: IO [Int]
results = sequence actions

-- Lazy IO gotcha: sequence on infinite lists hangs.
-- Use Data.Conduit or Streaming for streaming.`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "haskell",
      caption: "Currying, partial application, point-free",
      code: `-- All functions take ONE argument — multi-arg is curried:
add :: Int -> Int -> Int
add x y = x + y

-- Partial application — give some args, get back a function:
add5 :: Int -> Int
add5 = add 5

-- Section notation for operators:
double = (2 *)        -- equivalent to \\x -> 2 * x
inc    = (+ 1)        -- equivalent to \\x -> x + 1

-- Point-free style — no explicit args:
countEven :: [Int] -> Int
countEven = length . filter even

-- Compose with .:
process :: [Int] -> Int
process = sum . map (^2) . filter even
-- reads right-to-left: filter, square, sum

-- Currying is why Haskell has no need for partial application syntax.`,
    },
    {
      lang: "haskell",
      caption: "Where / let / guards / pattern matching in functions",
      code: `-- Multiple clauses via pattern matching:
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
parse s                              = read s`,
    },
    {
      lang: "haskell",
      caption: "Higher-order functions + composition",
      code: `import Data.List (foldl')
import Data.Char (toUpper)

-- Function as argument:
applyTwice :: (a -> a) -> a -> a
applyTwice f x = f (f x)

applyTwice (+ 1) 5     -- 7
applyTwice (\\s -> s ++ "!") "hi"   -- "hi!!"

-- flip — swap arg order (useful for partial application):
flipArgs = flip map [1..3]   -- map [1..3] (\\x -> ...)
-- equivalently: fmap (\\x -> ...) [1..3]

-- on — apply a function to two transformed args (Data.Function):
-- compare \`on\` length  compares two lists by length

-- const — ignore second arg:
const5 = const 5         -- const5 x == 5 for any x

-- Compose with multiple stages:
pipeline :: [String] -> [String]
pipeline = map (filter (/= ' ')) .   -- strip spaces
           map (map toUpper) .         -- uppercase
           filter (not . null)         -- drop empties`,
    },
    {
      lang: "haskell",
      caption: "do-notation — desugars to >>= chains",
      code: `-- do-notation is sugar for monadic bind (>>=):
main :: IO ()
main = do
    putStrLn "name?"       -- IO (), no binding
    name <- getLine        -- IO String, bind name to result
    let greeting = "Hi, " ++ name
    putStrLn greeting

-- Desugars to:
--   putStrLn "name?" >> getLine >>= \\name ->
--       let greeting = "Hi, " ++ name in putStrLn greeting

-- Works for any Monad — IO, Maybe, Either, State, Reader, Parser:
parseTwo :: Parser (Int, Int)
parseTwo = do
    x <- intParser
    y <- intParser
    return (x, y)

-- 'return' is just 'pure' — wraps a value in the monad. NOT control flow.
-- Applicative form (no inter-binding deps): (,) <$> intParser <*> intParser`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "haskell",
      caption: "Maybe / Either — errors as values",
      code: `-- Maybe: present or absent.
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
    | "@" \`Data.Text.isInfixOf\` t = Right (Email t)
    | otherwise                   = Left "missing @"

-- Compose Eithers in do-notation (Either is a Monad):
getUserEmail :: Int -> Either String Email
getUserEmail uid = do
    user <- maybeToRight "no user" (lookupUser uid)
    parseEmail (userEmail user)

-- where maybeToRight :: e -> Maybe a -> Either e a
-- Left short-circuits through the do block, just like throw.`,
    },
    {
      lang: "haskell",
      caption: "ExceptT — error channel for monadic code",
      code: `import Control.Monad.Except

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
-- or exceptions but at the type level — caller MUST handle.`,
    },
    {
      lang: "haskell",
      caption: "IO exceptions — try / catch / bracket",
      code: `import Control.Exception

main :: IO ()
main = do
    -- try :: Exception e => IO a -> IO (Either e a)
    result <- try (readFile "missing.txt") :: IO (Either IOException String)
    case result of
        Left err     -> hPutStrLn stderr ("error: " ++ show err)
        Right content -> putStrLn content

    -- catch :: IO a -> (e -> IO a) -> IO a
    readFile "missing.txt" \`catch\` \\(e :: IOException) -> do
        hPutStrLn stderr "falling back"
        return ""

    -- bracket: acquire, use, release. Resource safety.
    bracket
        (openFile "data.txt" ReadMode)
        hClose
        (\\h -> hGetContents h)

    -- finally / onException for simpler cleanup patterns.
    -- Custom exceptions: define Exception instance + data type.`,
    },
    {
      lang: "haskell",
      caption: "Custom exception types + hierarchy",
      code: `{-# LANGUAGE DeriveAnyClass #-}
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
-- uses a sum type like AppError above. SomeException is the root.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "haskell",
      caption: "Green threads + forkIO",
      code: `import Control.Concurrent (forkIO, threadDelay, MVar, newEmptyMVar, takeMVar, putMVar)
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
                 else do putStrLn ("got " ++ show x); consumer mvar`,
    },
    {
      lang: "haskell",
      caption: "STM — composable atomic transactions",
      code: `{-# LANGUAGE OverloadedStrings #-}
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
--orElse: try one transaction, fall back to another if it retries.`,
    },
    {
      lang: "haskell",
      caption: "Async — high-level concurrency with cancellation",
      code: `import Control.Concurrent.Async

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
-- The 'async' package is the recommended high-level API for IO concurrency.`,
    },
    {
      lang: "haskell",
      caption: "Software Transactional Memory (STM) — composable",
      code: `{-# LANGUAGE OverloadedStrings #-}
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
-- Trade-off: slower than MVar/IORef for uncontended cases, but composes.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "haskell",
      caption: "HSpec — RSpec-like BDD",
      code: `-- File: test/Spec.hs
import Test.Hspec
import MyLib

main :: IO ()
main = hspec $ do
    describe "add" $ do
        it "adds two numbers" $
            add 1 2 \`shouldBe\` 3

        it "handles negatives" $
            add (-1) (-2) \`shouldBe\` (-3)

    describe "parse" $ do
        it "parses valid input" $
            parse "42" \`shouldBe\` Right 42

        it "rejects invalid input" $
            parse "abc" \`shouldSatisfy\` isLeft

-- Run: stack test  or  cabal test
-- Output is colored, hierarchical, with failure context.
-- shouldBe, shouldSatisfy, shouldThrow, shouldReturn are the core matchers.`,
    },
    {
      lang: "haskell",
      caption: "Tasty — combinator-style testing",
      code: `import Test.Tasty
import Test.Tasty.HUnit
import Test.Tasty.QuickCheck

main :: IO ()
main = defaultMain $ testGroup "tests"
    [ testCase "add basic" $ add 1 2 @?= 3
    , testCase "list reverse" $ reverse [1,2,3] @?= [3,2,1]
    , testProperty "reverse is involutive" $ \\xs ->
        reverse (reverse xs) == (xs :: [Int])
    , testProperty "add commutes" $ \\a b ->
        add a b == add b a
    ]

-- Tasty is more modular than HSpec — combine HUnit, QuickCheck, SmallCheck,
-- Hedgehog, etc. in one tree. Common in serious library code.

-- @?= is the HUnit equality assert.
-- testProperty runs QuickCheck with 100 random inputs by default.`,
    },
    {
      lang: "haskell",
      caption: "QuickCheck — property-based testing",
      code: `import Test.QuickCheck

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
prop_hasColor = forAll genColor $ \\c -> c \`elem\` ["red", "green", "blue"]`,
    },
    {
      lang: "haskell",
      caption: "Hedgehog — property testing with integrated shrinking",
      code: `import Hedgehog
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
    reverse (reverse xs) === xs`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "foldl' (strict) over foldl — foldl builds thunks; OOM on large lists. Almost always want foldl'.", tag: "perf" },
    { fact: "Strict fields (!) on records prevent space leaks — most record types should be strict by default.", tag: "perf" },
    { fact: "BangPatterns (!pat) force evaluation to WHNF — use in hot loops where thunks accumulate.", tag: "perf" },
    { fact: "Laziness has overhead: every value is a closure until forced. Strict Data.Text / strict ByteString / Vector avoid this for sequences.", tag: "perf" },
    { fact: "GHC specializes typeclass calls when types are known at the call site. Avoid polymorphic recursion in hot code.", tag: "perf" },
    { fact: "INLINE pragmas on small helpers expose them to the optimizer; GHC inlines aggressively by default with -O2.", tag: "perf" },
    { fact: "Rewrite rules (RULES pragma) let libraries do fusion — ByteString/Text/Vector use this for 'stream fusion'.", tag: "perf" },
    { fact: "newtype is erased at runtime — zero overhead vs data which allocates. Use newtype for type-safe wrappers.", tag: "perf" },
    { fact: "Green threads: ~1KB stack each; millions feasible. RTS scales across N OS threads with -N.", tag: "perf" },
    { fact: "STM is slower than MVar for uncontended cases (~3-5x), but composes — pick based on contention profile.", tag: "perf" },
    { fact: "Lazy IO (readFile, getContents) leaks file handles if streams aren't fully consumed. Use strict variants + bracket.", tag: "gotcha" },
    { fact: "Weak head normal form (WHNF) vs normal form (NF): seq forces WHNF (outer constructor); deepseq forces NF (full tree).", tag: "gotcha" },
    { fact: "GHC -O2 does aggressive optimization (inlining, fusion, specialization); -O0 is ~10-100x slower for numeric code.", tag: "perf" },
    { fact: "Profile with -prof + -fprof-auto; read with hp2ps or hp2any-graph. Time + allocation profiles.", tag: "perf" },
    { fact: "Eventlog (traceEvent) + ghc-events for production profiling — low overhead, can be enabled in release builds.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "GHC", purpose: "Glasgow Haskell Compiler — the de-facto standard compiler. Most extensions, best optimization.", url: "https://www.haskell.org/ghc/", category: "build" },
    { tool: "Cabal", purpose: "Build tool + package format (.cabal). The standard; 'cabal build', 'cabal test', 'cabal install'.", url: "https://www.haskell.org/cabal/", category: "build" },
    { tool: "Stack", purpose: "Higher-level build tool — curated Stackage snapshots, reproducible builds, multi-GHC support.", url: "https://docs.haskellstack.org/", category: "build" },
    { tool: "ghcup", purpose: "GHC / cabal / stack / HLS version manager — like rustup for Haskell. The recommended installer.", url: "https://www.haskell.org/ghcup/", category: "build" },
    { tool: "Haskell Language Server (HLS)", purpose: "LSP server — code completion, goto-def, refactoring, type info. Works in VS Code, Vim, Emacs.", url: "https://haskell-language-server.readthedocs.io/", category: "build" },
    { tool: "Hackage", purpose: "The original package repository — like npm/crates.io. cabal pulls from here.", url: "https://hackage.haskell.org/", category: "package" },
    { tool: "Stackage", purpose: "Curated package sets — every package in a snapshot is compatible. Stack uses Stackage by default.", url: "https://www.stackage.org/", category: "package" },
    { tool: "Hoogle", purpose: "Search by TYPE signature — 'a -> b -> a' finds 'const'. The single most useful Haskell tool.", url: "https://hoogle.haskell.org/", category: "build" },
    { tool: "Hspec", purpose: "RSpec-style BDD testing — describe/it, matchers, before/after hooks. Popular for new code.", url: "https://hspec.github.io/", category: "test" },
    { tool: "Tasty", purpose: "Combinator-style test framework — combines HUnit, QuickCheck, SmallCheck, Hedgehog in one tree.", url: "https://github.com/UnkindPartition/tasty", category: "test" },
    { tool: "QuickCheck", purpose: "Property-based testing pioneer — generates 100s of random inputs, shrinks counterexamples.", url: "https://hackage.haskell.org/package/QuickCheck", category: "test" },
    { tool: "Hedgehog", purpose: "Modern property testing with integrated shrinking — gaining on QuickCheck.", url: "https://hedgehog.qa/", category: "test" },
    { tool: "Criterion", purpose: "Micro-benchmarking — statistical analysis, regression detection. The 'btime' for Haskell.", url: "https://hackage.haskell.org/package/criterion", category: "test" },
    { tool: "Weeder", purpose: "Dead-code detection — finds unused exports and imports.", url: "https://github.com/ocharles/weeder", category: "lint" },
    { tool: "HLint", purpose: "Linter — suggests cleaner / more idiomatic code. Configurable, widely adopted.", url: "https://hackage.haskell.org/package/hlint", category: "lint" },
    { tool: "ormolu / fourmolu", purpose: "Code formatters — opinionated, deterministic. ormolu is strict; fourmolu is configurable.", url: "https://hackage.haskell.org/package/ormolu", category: "lint" },
    { tool: "eventlog2html / ghc-events", purpose: "Profile visualization — converts GHC eventlog to interactive HTML flame graphs.", url: "https://mpickering.github.io/eventlog2html/", category: "debug" },
    { tool: "Yesod / Servant / Scotty", purpose: "Web frameworks — Yesod is batteries-included, Servant is type-safe APIs, Scotty is Sinatra-like.", url: "https://docs.servant.dev/", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0", year: 1990, highlight: "Haskell 1.0 report — the committee unifies ~12 lazy functional languages into one." },
    { version: "Haskell 98", year: 1999, highlight: "First standardized version — base library, syntax, semantics. Many compilers converge." },
    { version: "GHC 6.0", year: 2004, highlight: "GHC introduces GeneralizedNewtypeDeriving, FFI, Template Haskell. Becomes the dominant compiler." },
    { version: "Haskell 2010", year: 2010, highlight: "Latest formal standard — minor additions over 98 (FFI, DoAndIfThenElse). Real-world code uses many extensions beyond it." },
    { version: "GHC 7.0", year: 2010, highlight: "TypeFamilies, GADTs mainstream. Haskell Platform (bundled GHC + libs) launches." },
    { version: "GHC 7.10", year: 2015, highlight: "Applicative becomes superclass of Monad; AMP (Applicative-Monad Proposal) — breaks old code." },
    { version: "Stack", year: 2015, highlight: "Commercial Haskell releases Stack — Stackage snapshots solve the cabal hell dependency problem." },
    { version: "GHC 8.0", year: 2016, highlight: "TypeApplications groundwork, DuplicateRecordFields, StrictData extension (strict-by-default records)." },
    { version: "GHC 8.2", year: 2017, highlight: "DerivingStrategies, UnboxedSums. Compact regions for sharing data between threads cheaply." },
    { version: "GHC 8.6", year: 2018, highlight: "DerivingVia, QuantifiedPredicates groundwork, GHCi improvements. HP dies; ghcup takes over." },
    { version: "GHC 9.0", year: 2021, highlight: "Linear types (LinearTypes), Big-array-of-changes for the type system. Major Num/Enum reorganization." },
    { version: "GHC 9.2", year: 2021, highlight: "Records redesign (OverloadedRecordDot), extensibility improvements, WASM backend progress." },
    { version: "GHC 9.4", year: 2022, highlight: "JS backend (replacing GHCJS), Pratt parser for less-coupled syntax, runtime improvements." },
    { version: "GHC 9.6 / 9.8", year: 2023, highlight: "Stable type system extensions, improved inference, primitive arrays. HLS becomes mature." },
    { version: "GHC 9.10", year: 2024, highlight: "Improved records (OverloadedRecordUpdate), cross-module record field resolution, perf work." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What is a monad, and why is the concept useful?", a: "A monad is a type constructor m with two operations: return (a -> m a, wrap a value) and bind (m a -> (a -> m b) -> m b, sequence). It lets you chain computations in a context (IO, Maybe, Either, State, List) without exposing the plumbing. do-notation is sugar for bind chains. Monads must satisfy laws (left/right identity, associativity) so that refactoring is safe. The concept is useful because it captures 'effectful computation' as a uniform interface — you can write generic code (mapM, foldM) that works for any monad.", difficulty: "medium" },
    { q: "Explain laziness — when is it good, when is it bad?", a: "Laziness means values are computed only when their results are needed. take 5 [1..] works on an infinite list because Haskell never materializes the rest. Good: compositional code (map f . filter g . takeWhile h builds a pipeline that runs in one pass), cheap if-not-used semantics. Bad: space leaks when thunks accumulate (foldl builds a chain of n thunks), unpredictable memory, hard to reason about resource lifetimes (lazy IO leaks file handles). Mitigation: foldl' (strict accumulator), BangPatterns, strict fields, strict Text/ByteString.", difficulty: "medium" },
    { q: "What's a space leak and how do you fix one?", a: "A space leak is when thunks accumulate in memory instead of being evaluated. Classic: foldl (+) 0 [1..n] builds a thunk of depth n before forcing — OOM for large n. Fix: use foldl' (strict accumulator) from Data.List. For records, declare strict fields (!) so they're forced to WHNF on construction. For complex types, use deepseq / NFData to force to normal form. Profile with -prof +hp2ps to find the leak source; GHC's eventlog shows heap growth over time.", difficulty: "medium" },
    { q: "What's the difference between typeclasses and OOP interfaces?", a: "Typeclasses are AD-HOC polymorphism resolved at compile time via dictionary passing (or specialization). An instance is declared separately from the type — you can add Eq instances for types you don't own. OOP interfaces are nominal subtyping — methods are resolved at runtime via vtable, and the interface is part of the type's declaration. Typeclasses can dispatch on the RETURN type (read :: Read a => String -> a); OOP cannot. Typeclasses have laws (functor laws, monad laws); OOP interfaces don't enforce semantics. Multi-param typeclasses and functional dependencies generalize further.", difficulty: "hard" },
    { q: "Explain Maybe and Either — when use which?", a: "Maybe a = Nothing | Just a — for absence with no error info. Use for optionals, lookups where missing is normal. Either e a = Left e | Right a — for fallible operations with structured error info (convention: Left = error, Right = success). Either is a Monad on Right, so 'do' blocks short-circuit on Left — like exceptions but at the type level. Use Maybe for 'is there?' (no why); use Either for 'did it work?' (with why). For richer errors with multiple causes, use ExceptT or Validation (which accumulates all errors).", difficulty: "easy" },
    { q: "What does <$> vs <*> vs >>= do, and when use each?", a: "<$> is fmap — applies a pure function inside a context (Just 3 -> Just . (1+) <$> Just 3 -> Just 4). <*> is Applicative apply — applies a function inside a context to a value inside a context: Just (1+) <*> Just 3 -> Just 4. >>= is Monad bind — sequences with dependence: m >>= (\\x -> ...) where the next computation depends on x. Use <$> when args are independent; <*> chains independent effects; >>= when each step depends on the previous result. do-notation desugars to >>=; Applicative form (f <$> a <*> b) is more parallel/optimizable.", difficulty: "medium" },
    { q: "How does GHC optimize Haskell — what does -O2 actually do?", a: "GHC does aggressive inlining, rewrite rules (RULES pragma — libraries define fusions like ByteString/Text), strictness analysis (inserts seq where it's safe), specialization (monomorphizes typeclass calls at known types), worker/wrapper transforms (splits a function into a strict worker + lazy wrapper), and float-in/float-out (move bindings to where they're used). -O2 enables more aggressive versions of all of these. -O0 is ~10-100x slower for numeric code. -fllvm uses LLVM's optimizer for better codegen on numerics. Profile with -prof to see what's slow.", difficulty: "hard" },
    { q: "What's the difference between seq, deepseq, and BangPatterns?", a: "seq :: a -> b -> b forces 'a' to weak head normal form (WHNF) — only the outermost constructor. For (Just (1+2)), seq makes it Just (thunk), not Just 3. deepseq :: NFData a => a -> b -> b forces to normal form — the whole tree. BangPatterns (!pat) force the matched value to WHNF on function entry — cleaner than manual seq. Strict fields (data T = T { x :: !Int }) force on construction. Use BangPatterns + strict fields as the modern default; reserve deepseq for forcing big structures at known boundaries.", difficulty: "medium" },
    { q: "How would you design a Haskell web service?", a: "Stack: Servant (type-safe API at the type level) or Yesod (batteries-included) + Warp (HTTP server) + Persistent/Esqueleto (DB) + rio/monad-logger (logging) + Prometheus (metrics). Architecture: encode business rules as pure functions (testable, no IO); wrap with a ReaderT env IO for config/DB; use ExceptT for error channels at boundaries. Deploy: Docker image built via nix or cabal-install; or static binary via static-haskell-nix. Concurrency: async for parallel requests, STM for shared state. Watch out for: lazy IO (use strict streaming), exception handling (use safe-exceptions), and connection pooling (resource-pool).", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Rust", whenThis: "Compiler/DSL work, type-system research, web APIs (Servant), when you want cheap concurrency via STM.", whenThat: "Systems software, embedded, memory-safety requirements, WebAssembly, anything needing predictable latency (no GC)." },
    { vs: "Scala", whenThis: "Pure FP, type-system research, when the JVM is a liability rather than asset, smaller deployable.", whenThat: "JVM ecosystem, Big Data (Spark, Akka), teams with Java/Scala background, mixed FP/OOP codebases." },
    { vs: "OCaml", whenThis: "Pure lazy FP, larger ecosystem (Hackage), richer type system extensions (GADTs, TypeFamilies).", whenThat: "Strict-by-default (easier perf reasoning), faster compile, ML lineage, CompCert/Coq/financial-industry adoption." },
    { vs: "F#", whenThis: "Cross-platform non-Microsoft, larger pure-FP ecosystem, deeper type-system features.", whenThat: "Microsoft/.NET ecosystem, interop with C# libraries, enterprise .NET shops, when you need OOP integration." },
  ],
};

export default sheet;
