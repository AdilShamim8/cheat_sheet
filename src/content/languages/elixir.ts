import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "elixir",
  name: "Elixir",
  category: "languages",
  tier: 3,
  tags: ["functional", "dynamic", "beam", "actor-model", "concurrent", "fault-tolerant", "compiled"],
  tagline: "Ruby-flavored syntax on Erlang's BEAM VM — for systems that must serve millions of WebSocket connections without dropping them.",
  year: 2011,
  author: "José Valim",

  tldr: [
    "Elixir is a dynamically-typed, functional language that compiles to BEAM bytecode (Erlang's VM); it inherits Erlang's actor-model concurrency, share-nothing processes, and nine-nines uptime story, with Ruby-style syntax and modern tooling (Mix, Hex, ExUnit).",
    "It powers Discord's real-time backend (5M+ concurrent WS connections per node), WhatsApp-scale messaging, bleacher-report, and a large slice of fintech and IoT (Nerves deploys Elixir to embedded devices).",
    "Reach for Elixir when you need massive concurrency over flaky networks (chat, presence, multiplayer, telemetry), when you want hot code reload without downtime, or when LiveView lets you skip a JS frontend entirely.",
    "Avoid Elixir for CPU-bound numerical work (BEAM is interpreter-style, no SIMD), for systems that need true zero-latency GC pauses (BEAM's GC is per-process and tiny but not pauseless), or when your team is Ruby-on-Rails-shaped and unwilling to internalize immutable data + actors.",
  ],

  mentalModel: {
    title: "Processes, messages, and the immutable everything",
    body: "An Elixir process is NOT an OS process — it's a lightweight BEAM-scheduled green thread with its own heap (~2KB initial), and the BEAM runs millions of them per node. Every variable is immutable: `x = x + 1` doesn't mutate, it re-binds `x` to a new value, and the old binding is gone. State lives in processes via recursive `receive` loops: a 'counter' is `def loop(n) do receive do {:inc} -> loop(n+1); {:get, from} -> send(from, {:ok, n}); loop(n) end end`. The OTP library abstracts this into `GenServer`, `Agent`, `Supervisor` — your job is to model the system as a tree of processes that crash loudly and are restarted by supervisors, not to write defensive try/catch.",
  },

  constructs: [
    { syntax: "def f(x), do: x * 2", behavior: "Function definition; one-liner form. `defp` for private.", when: "All named functions — they live in modules." },
    { syntax: "Enum.map(list, fn x -> x * 2 end)", behavior: "Anonymous function (`fn...end`); first-class. `&(&1 * 2)` is the operator shorthand.", when: "Callbacks, pipelines — `&Function.mod/arity` references named functions." },
    { syntax: "list |> Enum.map(&(&1*2)) |> Enum.filter(&(&1>5))", behavior: "Pipe operator — `a |> f(b)` == `f(a, b)`. Reads left-to-right.", when: "All data transforms; the central idiom of Elixir code." },
    { syntax: "defmodule M do ... end", behavior: "Module — the only namespace. Functions, attributes, and structs live here.", when: "All code organization; one module per file by convention." },
    { syntax: "%User{name: \"a\"}", behavior: "Struct — a typed map with compile-time key checking; defined via `defstruct`.", when: "Domain objects; prefer over bare maps for known shapes." },
    { syntax: "{:ok, x} = f()", behavior: "Pattern match on return — `=` is match, not assignment; raises on mismatch.", when: "All call sites for `{:ok, _} | {:error, _}` functions; the Elixir error convention." },
    { syntax: "case x do {:ok, v} -> v; {:error, _} -> nil end", behavior: "Multi-clause pattern match; clauses tried top-down.", when: "Branching on tagged tuples or shapes." },
    { syntax: "spawn(fn -> ... end)", behavior: "Spawn a process — returns a PID. Anonymous, unmonitored, dies silently on crash.", when: "Quick scripts; production uses GenServer / Task / Supervisor." },
    { syntax: "receive do {:msg, x} -> x after 1000 -> :timeout end", behavior: "Block waiting for a message in this process's mailbox; `after` is a timeout.", when: "Inside process loops; almost never in application code (use GenServer.call)." },
    { syntax: "def handle_call(:get, _from, state), do: {:reply, state, state}", behavior: "GenServer callback — synchronous request returns `{:reply, response, new_state}`.", when: "GenServer implementations; the standard abstraction for stateful processes." },
    { syntax: "Supervisor.start_link(children, strategy: :one_for_one)", behavior: "Start a supervision tree — children are restarted per the strategy.", when: "Application entry; `Application` module wires top-level supervisor." },
    { syntax: "Task.async(fn -> work() end) |> Task.await()", behavior: "Spawn a task, await its result; errors propagate to the caller.", when: "Parallel computation; `Task.await_many/1` for batches." },
  ],

  patterns: [
    {
      lang: "elixir",
      caption: "GenServer — the canonical stateful process",
      code: `defmodule Counter do
  use GenServer

  # Client API (called from other processes)
  def start_link(init), do: GenServer.start_link(__MODULE__, init, name: __MODULE__)
  def inc(n \\ 1),       do: GenServer.cast(__MODULE__, {:inc, n})
  def get,              do: GenServer.call(__MODULE__, :get)

  # Server callbacks (run inside the GenServer process)
  @impl true
  def init(n), do: {:ok, n}

  @impl true
  def handle_cast({:inc, k}, n), do: {:noreply, n + k}
  def handle_call(:get, _from, n), do: {:reply, n, n}
end

# Wiring: a supervisor restarts the counter if it crashes.
defmodule CounterApp do
  use Application
  def start(_, _), do:
    Supervisor.start_link([{Counter, 0}], strategy: :one_for_one, name: Counter.Sup)
end`,
    },
    {
      lang: "elixir",
      caption: "Pipe-first data transform — Elixir's defining idiom",
      code: `defmodule Sales do
  def top_customers(orders, n) do
    orders
    |> Enum.filter(&(&1.status == :paid))
    |> Enum.group_by(& &1.customer_id)
    |> Enum.map(fn {id, ords} -> {id, Enum.sum(Enum.map(ords, & &1.amount))} end)
    |> Enum.sort_by(&elem(&1, 1), :desc)
    |> Enum.take(n)
    |> Enum.map(fn {id, total} -> %{id: id, total: total} end)
  end
end

# Reads top-to-bottom like prose. Each step takes the previous step's
# result as its first argument. No nested parens, no temp variables.`,
    },
    {
      lang: "elixir",
      caption: "Pattern match on {:ok, _} | {:error, _} — the with clause",
      code: `def checkout(user_id, item_id) do
  with {:ok, user} <- fetch_user(user_id),
       {:ok, item} <- fetch_item(item_id),
       :ok         <- charge_card(user, item),
       {:ok, order} <- create_order(user, item) do
    {:ok, order}
  else
    {:error, :not_found} = e -> e
    {:error, _reason} = e     -> roll_back(); e
  end
end

# with short-circuits on the first non-matching clause, returning
# the failed value — like Rust's ? operator or Haskell's EitherT.
# Each <- is a pattern match; the right side returns a tuple.`,
    },
    {
      lang: "elixir",
      caption: "Supervision tree with restart strategy",
      code: `defmodule MyApp.Supervisor do
  use Supervisor

  def start_link(init_arg) do
    Supervisor.start_link(__MODULE__, init_arg, name: __MODULE__)
  end

  @impl true
  def init(_arg) do
    children = [
      # Restart the cache only; if it dies, the rest keep running.
      {MyApp.Cache, []},
      # One-for-all: if any web worker dies, restart all of them.
      Supervisor.child_spec({MyApp.Web, []}, id: :web1),
      Supervisor.child_spec({MyApp.Web, []}, id: :web2),
      # Registry + DynamicSupervisor for runtime-spawned processes.
      {Registry, keys: :unique, name: MyApp.Registry},
      {DynamicSupervisor, strategy: :one_for_one, name: MyApp.Dynamic}
    ]

    # :one_for_one: restart only the crashed child.
    # :one_for_all: restart all children if any crashes.
    # :rest_for_one: restart the crashed child and everything after it.
    Supervisor.init(children, strategy: :one_for_one)
  end
end`,
    },
  ],

  pitfalls: [
    {
      title: "GenServer state lost on crash by default",
      symptom: "You accumulate state in `loop(state)` and the process crashes; the supervisor restarts it with the original init args — the state is gone, not 'saved'.",
      fix: "Persist critical state to ETS, Mnesia, or a database BEFORE replying. Use `:persistent_term` for read-only data. The OTP philosophy is 'let it crash' — but crash-recovery means state must live outside the process.",
    },
    {
      title: "Blocking the GenServer on slow work",
      symptom: "`handle_call(:compute, ...)` runs the work in the GenServer process; while it runs, every other call queues up. A 10-second query effectively DoSes your own service.",
      fix: "Use `handle_continue/2` for post-init work, `Task.async` + `Task.yield` for slow calls, or move slow work to a separate GenServer / Oban worker pool. Never sleep or do blocking I/O in a GenServer callback.",
    },
    {
      title: "Implicit atoms from user input (atom exhaustion / DoS)",
      symptom: "`String.to_atom(user_input)` creates a new atom per unique string; atoms are never GC'd; an attacker can exhaust the atom table (~1M limit) and crash the VM.",
      fix: "Use `String.to_existing_atom/1` (raises on unknown) — validate against a known allow-list first. For dynamic keys, use strings or ETS, not atoms.",
    },
    {
      title: "Enum vs Stream — eager vs lazy",
      symptom: "`1..1_000_000 |> Enum.map(&(&1*2)) |> Enum.filter(...)` materializes two million-element lists before filtering. Memory spikes.",
      fix: "Use `Stream.map/2`, `Stream.filter/2` for piped transforms — they fuse into a single pass. Switch to `Enum` at the end (`.to_list`, `Enum.count`, etc.) to force the result.",
    },
    {
      title: "Trying to mutate shared state — there isn't any",
      symptom: "Coming from OOP, you write `agent.state.x = 5` and discover there's no `agent.state.x` — Agent stores one value, and updating returns a new value.",
      fix: "Use `Agent.update/2` with a function returning the new state. For richer state, use GenServer with `:sys.get_state` for debugging. ETS offers true mutable storage for hot paths.",
    },
    {
      title: "`==` vs `===` vs `^` pin in matches",
      symptom: "`x = 5; x = 6` rebinds x to 6 (no error). `^x = 6` matches — fails because x was 5. `1.0 == 1` is true, `1.0 === 1` is false (strict equality on type).",
      fix: "Use `^x` in patterns to compare against an existing binding. Use `===` when type matters (numbers). `==` is structural + numeric coercion.",
    },
    {
      title: "Hot code reload surprises",
      symptom: "You deploy new code, the old process keeps running with the old `loop(state)` — the new module is loaded but the existing process is mid-execution in the old version.",
      fix: "Use `:sys.suspend/1`, `:sys.change_code/3` or rely on OTP's `code_change` callback (in release-based deploys via `mix release`). Distillery/Burrito releases make this explicit; ad-hoc `:l(module)` is for dev only.",
    },
  ],

  quickReference: [
    { fact: "Elixir 1.15 / 1.16 (2024) on BEAM/OTP 26+; OTP 27 adds native JSON, two-segment map syntax, and process labels.", tag: "version" },
    { fact: "Mix is the build tool, Hex is the package manager, ExUnit is the test framework — all bundled.", tag: "version" },
    { fact: "BEAM processes are ~2KB initial stack; millions per node. Preemptive scheduling across N CPU cores.", tag: "perf" },
    { fact: "BEAM GC is per-process, generational, stop-the-world but only of that one process — no global pauses. Heap is small because processes are small.", tag: "perf" },
    { fact: "Process mailbox is FIFO and unbounded — a slow consumer with fast producers can OOM. Use `:erlang.process_info(pid, :message_queue_len)` to detect.", tag: "gotcha" },
    { fact: "All data is immutable; `list ++ list` is O(n) and copies. Use `prepend` (`[h | t]`) for O(1) and reverse at the end.", tag: "complexity" },
    { fact: "Pattern matching is the primary branching mechanism; clauses in `def f/1` are tried top-down at runtime.", tag: "complexity" },
    { fact: "Tail-call optimization is guaranteed — `def loop(s) do ... loop(s') end` runs in constant stack. Required for GenServer implementations.", tag: "perf" },
    { fact: "ETS (Erlang Term Storage) is the in-process key-value store — O(1) lookup, ~10x faster than GenServer round-trips. Mnesia adds distribution + transactions.", tag: "perf" },
    { fact: "Phoenix LiveView replaces React for many apps — server-rendered, WS-pushed, no JS build step. LiveView 1.0 (2024) is production-stable.", tag: "version" },
    { fact: "Atoms are not GC'd; the atom table caps at ~1M by default. Never `String.to_atom/1` user input.", tag: "gotcha" },
    { fact: "Releases (`mix release`) build self-contained deployable artifacts since Elixir 1.9 — no Erlang install needed on the target.", tag: "version" },
    { fact: "Nerves deploys Elixir to embedded Linux (Raspberry Pi, BeagleBone) — full BEAM on a 256MB device.", tag: "version" },
    { fact: "Naming: modules are PascalCase (`MyModule`), functions/variables snake_case, atoms lowercase-or-PascalCase (`:ok`, `:user_deleted`).", tag: "style" },
    { fact: "`mix format` is the standard formatter; `credo` is the linter; `dialyxir` adds Dialyzer-based type checking (limited, type-system-not-Turing).", tag: "style" },
  ],

  goDeeper: [
    { title: "Elixir Official Documentation & Guides", url: "https://hexdocs.pm/elixir/", note: "Authoritative docs; the 'Getting Started' guide is the canonical onboarding path. Hexdocs is the source of truth for every package." },
    { title: "Erlang/OTP Documentation", url: "https://www.erlang.org/docs", note: "Elixir sits on top of OTP — the GenServer, Supervisor, and Application behaviours are documented here in their original form." },
    { title: "Programming Elixir ≥ 1.6 (Dave Thomas)", url: "https://pragprog.com/titles/elixir16/", note: "The canonical intro book; the pattern-matching chapter alone is worth the price." },
    { title: "Designing for Scalability with Erlang/OTP (Cesarini & Vinoski)", url: "https://www.oreilly.com/library/view/designing-for-scalability/9780133544993/", note: "OTP design patterns — supervision trees, release handling, hot code reload — explained at the Erlang level, applies directly to Elixir." },
    { title: "Elixir School", url: "https://elixirschool.com/", note: "Community-maintained, free, bilingual lessons covering every core concept; the closest thing to Real Python for the Elixir world." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "integer (arbitrary precision)", behavior: "Bignum by default — never overflows. + and - are exact. Bit syntax: <<0::size(8)>>.", when: "All integer math. For float use float literals (1.0)." },
      { syntax: "float (IEEE 754 double)", behavior: "64-bit float — 1.0, 2.5e-3. Division / always returns float; div/2 for integer.", when: "Math. For exact decimal use Decimal library." },
      { syntax: "boolean", behavior: "true / false — atoms under the hood (true === :true).", when: "Logic. Truthy: everything except nil and false." },
      { syntax: "atom", behavior: "Interned immutable symbol — :ok, :error, :user_deleted. Never GC'd; ~1M limit.", when: "Tags, keys, status. Pattern-match on atoms, NOT strings from user input." },
      { syntax: "string (binary)", behavior: "UTF-8 encoded binary — <<104, 105>> == \"hi\". NOT a linked list.", when: "All text. String.length/1 is O(n); byte_size/1 is O(1)." },
      { syntax: "charlist", behavior: "Single-quoted list of integer code points — 'hi' == [104, 105].", when: "Interfacing with Erlang libs (some prefer charlists). Rare in new Elixir code." },
      { syntax: "function / capture", behavior: "First-class — fn x -> x*2 end, or &(&1*2), or &String.upcase/1 (named capture).", when: "Callbacks, higher-order pipelines, GenServer handlers." },
      { syntax: "pid", behavior: "Process identifier — references a BEAM process. spawn/1 returns one.", when: "Messaging — send(pid, :msg). Inspect via Process.info(pid)." },
      { syntax: "reference", behavior: "Globally unique value — make_ref(). Used as a one-shot token in distributed systems.", when: "Correlation IDs, request tracking, monitor tokens." },
      { syntax: "nil", behavior: "The null value — equivalent to :nil atom. Falsy along with false.", when: "Optional/absent. Pattern-match with ^nil or use is_nil/1." },
    ],
    collections: [
      { syntax: "list  [1, 2, 3]", behavior: "Singly-linked list — cons [head | tail]. Prepend O(1), length O(n).", when: "Building sequences, recursion. NOT for index access — use Enum.at (O(n)) or a tuple/vector." },
      { syntax: "tuple  {:ok, val}", behavior: "Fixed-size contiguous storage — O(1) index, O(n) size change. Stored in memory contiguously.", when: "Tagged tuples ({:ok, _} | {:error, _}), small fixed records. Don't grow dynamically." },
      { syntax: "map  %{k => v}", behavior: "Hash map — small maps are sorted arrays, large become HAMTs. O(log n) operations.", when: "Keyed data, JSON shapes, structs (which are tagged maps)." },
      { syntax: "struct  %User{name: ...}", behavior: "Map with a __struct__ key — compile-time field checking, defaults.", when: "Domain objects. Defined via defstruct in a module." },
      { syntax: "keyword list  [a: 1, b: 2]", behavior: "List of 2-tuples of (atom, value) — [a: 1] == [{:a, 1}]. Duplicate keys allowed.", when: "Function options, Ecto queries, config. Slow vs map but ordered + duplicate-friendly." },
      { syntax: "MapSet", behavior: "Hash set — MapSet.new([1, 2, 3]). O(log n) membership, no duplicates.", when: "Dedup, set algebra. Member? via MapSet.member?/2." },
      { syntax: "binary  <<1, 2, 3>>", behavior: "Packed byte sequence — bit syntax allows precise packing. The string type IS a binary.", when: "Binary protocols, network, file I/O. Pattern match with <<x::size(8), rest::binary>>." },
      { syntax: "Range  1..10", behavior: "Lazy integer range — first..last. // step syntax (1..10//2). O(1) memory.", when: "Loops, enumeration. Map over a range without materializing." },
      { syntax: "Stream", behavior: "Lazy enumerable — Stream.map/filter/etc. compose; runs once at consumption.", when: "Pipelines over large data — fuse map+filter+take into one pass." },
      { syntax: "ETS table", behavior: "In-memory key-value store — erlang:ts/1, O(1) lookup, process-owned but cross-process readable.", when: "Hot mutable state shared across processes. ~10x faster than GenServer for read-heavy." },
    ],
    custom: [
      { syntax: "defmodule M do ... end", behavior: "Module — the only namespace. Functions, macros, attributes, structs live here.", when: "All code organization; one module per file by convention." },
      { syntax: "defstruct", behavior: "Define a struct type — fields with optional defaults. %User{} enforces keys at compile time.", when: "Domain objects, typed records. Derives via @derive." },
      { syntax: "defprotocol P do ... end", behavior: "Protocol — polymorphism on data type. Each type implements via defimpl.", when: "Generic APIs across structs (String.Chars, Enumerable, Inspect)." },
      { syntax: "defimpl P, for: T do ... end", behavior: "Implement a protocol for a specific type.", when: "Adding your types to existing protocols, or vice versa." },
      { syntax: "use GenServer / Supervisor / Agent", behavior: "Adopt an OTP behaviour — sets up callbacks (handle_call, init, etc.).", when: "Process-based state, supervision trees. The OTP pattern." },
      { syntax: "@behaviour", behavior: "Declare a behaviour (interface) the module implements — callback specs checked at compile time.", when: "Library authors defining contracts. Distinct from defprotocol." },
      { syntax: "@type / @spec", behavior: "Type annotations — checked by Dialyzer (success typing, not full type checking).", when: "Documentation + Dialyzer analysis. Optional but recommended for public APIs." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "+, -, *, /", behavior: "Arithmetic — / is float division; use div/2 and rem/2 for integer.", when: "Math. No implicit conversion: 1 + 1.0 errors (use 1 + 1 or 1.0 + 1.0)." },
    { syntax: "div(a, b), rem(a, b)", behavior: "Integer division (truncated toward zero) and remainder. Use rem/2 not %.", when: "Integer math. For floored mod use Integer.mod/2." },
    { syntax: "==, !=, ===, !==", behavior: "== is structural (1.0 == 1 is true); === is strict (1.0 === 1 is false, different types).", when: "Most code uses ==. Use === when type matters." },
    { syntax: "<, >, <=, >=", behavior: "Comparison — works across types via Erlang's ordering: number < atom < ref < fun < port < pid < tuple < list < bitstring.", when: "Sorting. Beware: :a < 1 is true (atoms > numbers in Erlang term order)." },
    { syntax: "and, or, not", behavior: "Strict boolean — requires boolean operands, errors on non-boolean. Short-circuits.", when: "When you want type-strict logic. else/|| is more common (truthy)." },
    { syntax: "&&, ||, !", behavior: "Truthy boolean — works on any value; returns the operand, not just true/false.", when: "Idiomatic logic. nil || :default, !nil == true." },
    { syntax: "|>  (pipe)", behavior: "Pipe — a |> f(b) == f(a, b). Reads left-to-right.", when: "All data transforms. The central Elixir idiom — write code as pipelines." },
    { syntax: "=  (match)", behavior: "Pattern match, NOT assignment. x = 1 binds; [h | _] = list destructures.", when: "All binding. ^x = 1 matches x against 1 (pin operator)." },
    { syntax: "^  (pin)", behavior: "Pin — match against current value rather than rebinding.", when: "Pattern matching a variable's existing value: ^expected = result." },
    { syntax: "<>", behavior: "String concatenation — \"a\" <> \"b\" == \"ab\".", when: "Strings. For lists use ++; for binaries use <>." },
    { syntax: "++  (list concat)", behavior: "Right-biased list concatenation — [1] ++ [2] == [1, 2]. O(n) on left list.", when: "Combining lists. Don't use in hot loops — prepend is O(1)." },
    { syntax: "--  (list difference)", behavior: "Remove first occurrence of each element of RHS from LHS.", when: "Removing known elements. O(n*m); use MapSet for big lists." },
    { syntax: "in  (membership)", behavior: "x in [1, 2, 3] — membership test; works on lists, ranges, MapSet (compile-time optimized).", when: "Membership checks. x in 1..10 for ranges is O(1) (guessed at compile time)." },
    { syntax: "|> vs . (no method calls)", behavior: "Elixir has NO method syntax — pipe IS the way to chain. There's no obj.method().", when: "All chaining. Functions are module-prefixed: String.upcase(s)." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "elixir",
      caption: "stdout / stderr / IO module",
      code: `IO.puts("hello")                    # stdout with newline
IO.write("no newline")             # stdout without newline
IO.inspect(struct, label: "user")  # debug pretty-print
IO.inspect(value, IEx.Helpers.opts)  # IEx-only

IO.binwrite(:stderr, "warning\\n")  # raw binary to stderr
:io.format("count: ~p~n", [42])    # Erlang io; format string with ~p

# Read line from stdin:
line = IO.gets("name? ") |> String.trim()

# Read all of stdin (Elixir doesn't have a direct equivalent of getContents;
# use IO.stream(:stdio, :line) to iterate lazily):
IO.stream(:stdio, :line)
|> Stream.map(&String.trim/1)
|> Enum.each(&process/1)`,
    },
    {
      lang: "elixir",
      caption: "File I/O with File module + safety",
      code: `# Read whole file (small files):
case File.read("config.txt") do
    {:ok, content} -> process(content)
    {:error, :enoent} -> IO.puts("missing")
    {:error, reason} -> IO.puts("error: #{inspect(reason)}")
end

# Write:
:ok = File.write("out.txt", "content\\n")

# Stream a large file line by line (lazy):
"large.csv"
|> File.stream!()
|> Stream.drop(1)               # skip header
|> Stream.map(&String.split(&1, ","))
|> Enum.take(100)               # force first 100 rows

# Atomic write (avoid partial files):
File.write!("tmp.txt", content)
File.rename!("tmp.txt", "real.txt")

# Always handle errors via pattern match — File.read returns {:ok, _} | {:error, _}.`,
    },
    {
      lang: "elixir",
      caption: "JSON via Jason — the de-facto standard",
      code: `# Add to mix.exs deps: {:jason, "~> 1.4"}
# Then: mix deps.get

# Encode (returns iodata / binary):
json = Jason.encode!(%{name: "ada", age: 42, tags: ["a", "b"]})

# Decode:
{:ok, map} = Jason.decode(json)
# or:
map = Jason.decode!(json)   # raises on error

# Decode with atoms (CAUTION: only for trusted input — atom table is bounded):
Jason.decode!(json, keys: :atoms)   # uses :name, :age, :tags

# For untrusted input, use keys: :strings (default) and pattern-match.

# Phoenix uses Jason by default for JSON responses.
# Custom encoding: derive Jason.Encoder for your structs.`,
    },
    {
      lang: "elixir",
      caption: "HTTP client — Finch / Req / HTTPoison",
      code: `# Req (modern, batteries-included):
Mix.install([:req])
resp = Req.get!("https://api.example.com/users")
resp.status    # 200
resp.body      # decoded JSON if Content-Type was application/json

# Finch (high-perf, pool-based, default in Phoenix):
{:ok, resp} = Finch.build(:get, "https://example.com")
              |> Finch.request(MyApp.Finch)

# Define a Finch pool in your app:
children = [
    {Finch, name: MyApp.Finch, pools: %{:default => [size: 32]}
]

# HTTPoison (older, hackney-based):
{:ok, %HTTPoison.Response{status_code: 200, body: body}} =
    HTTPoison.get("https://example.com")

# For new code: Finch (perf) or Req (ergonomics). HTTPoison is in maintenance mode.`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "elixir",
      caption: "Enum / recursion / comprehension — no for-loops",
      code: `# Elixir has NO for-loop. Use Enum functions or recursion.

# Enum.map / filter / reduce:
[1, 2, 3] |> Enum.map(&(&1 * 2))          # [2, 4, 6]
[1, 2, 3] |> Enum.filter(&(&1 > 1))       # [2, 3]
[1, 2, 3] |> Enum.reduce(0, &(&1 + &2))   # 6

# Range (lazy, inclusive):
1..10 |> Enum.each(&IO.puts/1)

# Comprehension (like Python list comp):
for x <- 1..10, x > 5, do: x * x           # [36, 49, 64, 81, 100]

# Comprehension with generators + filters + into:
for {k, v} <- %{a: 1, b: 2}, into: %{}, do: {k, v * 2}

# Recursion (when Enum doesn't fit):
def sum([]), do: 0
def sum([h | t]), do: h + sum(t)

# Tail-recursive (preferred):
def sum(list), do: do_sum(list, 0)
defp do_sum([], acc), do: acc
defp do_sum([h | t], acc), do: do_sum(t, acc + h)`,
    },
    {
      lang: "elixir",
      caption: "Stream — lazy pipelines",
      code: `# Stream operations are lazy — only run when consumed.
1..1_000_000
|> Stream.map(&(&1 * 2))
|> Stream.filter(&(&1 > 100))
|> Enum.take(5)    # only 5 elements materialized

# Reading a file line by line:
"big.log"
|> File.stream!()
|> Stream.map(&String.trim/1)
|> Stream.filter(&(not String.starts_with?(&1, "#")))
|> Stream.chunk_every(1000)
|> Enum.each(&process_batch/1)

# Stream vs Enum: Enum is eager (materializes each step), Stream is lazy (fuses).
# Use Stream when: data is large, only a prefix is needed, or for I/O.`,
    },
    {
      lang: "elixir",
      caption: "Recursion + tail-call optimization",
      code: `# Tail calls are guaranteed optimized — no stack growth.
def count(n) when n > 0, do: count(n - 1)
def count(0), do: :done

# This works for n = 10^9 — TCO means O(1) stack.

# Building a list with tail-recursive accumulator + reverse:
def reverse(list), do: do_reverse(list, [])
defp do_reverse([], acc), do: acc
defp do_reverse([h | t], acc), do: do_reverse(t, [h | acc])

# Enum.map is implemented this way internally — prepends to accumulator,
# reverses at the end. O(n) total work, O(1) stack.

# BEAM also supports 'last-call optimization' for non-self tail calls
# (mutual recursion).`,
    },
    {
      lang: "elixir",
      caption: "for-comprehension with multiple generators",
      code: `# Like Haskell/Python list comprehensions:
for x <- [1, 2, 3], y <- [:a, :b], do: {x, y}
# [{1, :a}, {1, :b}, {2, :a}, {2, :b}, {3, :a}, {3, :b}]

# With filter (boolean guard):
for x <- 1..10, rem(x, 2) == 0, do: x * x

# With into — generate into a different collection:
for {k, v} <- %{a: 1, b: 2}, into: %{}, do: {k, v * 10}

# With binary generators (bit syntax):
for <<byte <- "hello">>, do: byte * 2

# 'for' is sugar for flat_map over generators + filter. Useful for
# nested loops, but Enum pipelines are often clearer.`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "elixir",
      caption: "Named functions + pattern matching clauses",
      code: `defmodule Math do
    # Multiple clauses via pattern matching — tried top-to-bottom.
    def factorial(0), do: 1
    def factorial(n) when n > 0, do: n * factorial(n - 1)

    # Guards (when ...) restrict clauses:
    def divide(_a, 0), do: {:error, :div_by_zero}
    def divide(a, b) when is_number(a) and is_number(b), do: {:ok, a / b}

    # Default values via \\\\:
    def greet(name, greeting \\\\ "Hello"), do: "\#{greeting}, \#{name}!"

    # Private functions:
    defp helper(x), do: x * 2
end

# Call:
Math.factorial(5)        # 120
Math.divide(10, 2)       # {:ok, 5.0}
Math.greet("Ada")        # "Hello, Ada!"
Math.greet("Ada", "Hi")  # "Hi, Ada!"`,
    },
    {
      lang: "elixir",
      caption: "Anonymous functions + captures",
      code: `# Anonymous function:
add = fn a, b -> a + b end
add.(1, 2)            # 3 — note the dot before parens

# Capture operator & — shorthand for anonymous function:
double = &(&1 * 2)
double.(5)            # 10

# Named function capture — &Module.function/arity:
upcase = &String.upcase/1
upcase.("hi")         # "HI"

# Pass to higher-order functions:
[1, 2, 3] |> Enum.map(&(&1 * 2))         # [2, 4, 6]
["a", "b"] |> Enum.map(&String.upcase/1)  # ["A", "B"]

# Closures capture lexical scope:
defmodule Counter do
    def make do
        count = 0
        fn ->
            # Note: Elixir vars are IMMUTABLE — can't actually increment count.
            # Use Agent or process state for mutable counters.
            count
        end
    end
end`,
    },
    {
      lang: "elixir",
      caption: "Pipe-first composition",
      code: `# The pipe operator |> threads the LHS as the FIRST arg of RHS:
"hello"
|> String.upcase()
|> String.split("")
|> Enum.reverse()
|> Enum.join()
# "OLLEH"

# Equivalent without pipe:
# Enum.join(Enum.reverse(String.split(String.upcase("hello"), "")))

# Pipes work with any function — multi-arg calls put extra args after:
[1, 2, 3] |> Enum.map(&(&1 * 2)) |> Enum.sum()   # 12

# Stylistic rules:
#   * Pipe at the END of the line, not the start of the next expression
#   * Each |> on its own line for pipelines of 3+ steps
#   * Use parens even when optional: f() not f

# Anti-pattern: piping into a function that doesn't take the value as first arg.`,
    },
    {
      lang: "elixir",
      caption: "Higher-order: Enum.map/filter/reduce + custom",
      code: `# Enum.map / filter / reduce — the workhorses:
[1, 2, 3, 4]
|> Enum.filter(&(&1 > 2))
|> Enum.map(&(&1 * 10))
# [30, 40]

# Enum.reduce — most general:
[1, 2, 3] |> Enum.reduce(0, fn x, acc -> acc + x end)   # 6

# Reduce into a map (group by):
["a", "bb", "ccc"] |> Enum.reduce(%{}, fn word, acc ->
    Map.update(acc, String.length(word), [word], &[word | &1])
end)
# %{1 => ["a"], 2 => ["bb"], 3 => ["ccc"]}

# Custom higher-order function:
def apply_twice(f, x), do: f.(f.(x))
apply_twice(&(&1 + 1), 5)   # 7

# Function composition isn't built in — define a helper:
def compose(f, g), do: fn x -> f.(g.(x)) end
shout = compose(&(&1 <> "!"), &String.upcase/1)
shout.("hi")   # "HI!"`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "elixir",
      caption: "{:ok, _} | {:error, _} convention + with",
      code: `# Most functions return tagged tuples, NOT raise.
def fetch_user(id) do
    case Repo.get(User, id) do
        nil -> {:error, :not_found}
        user -> {:ok, user}
    end
end

# Pattern match at call site:
case fetch_user(42) do
    {:ok, user} -> render(user)
    {:error, :not_found} -> render_404()
end

# 'with' chains fallible operations:
def checkout(user_id, item_id) do
    with {:ok, user} <- fetch_user(user_id),
         {:ok, item} <- fetch_item(item_id),
         :ok         <- charge_card(user, item),
         {:ok, order} <- create_order(user, item) do
        {:ok, order}
    else
        {:error, :not_found} = e -> e
        {:error, _reason} = e     -> rollback(); e
    end
end

# 'with' short-circuits on first non-matching pattern, returns the failed value.`,
    },
    {
      lang: "elixir",
      caption: "raise / try / rescue / catch",
      code: `# raise throws an exception:
def divide(_a, 0), do: raise(ArgumentError, "division by zero")
def divide(a, b), do: a / b

# Custom exception:
defmodule MyError do
    defexception [:message, :code]
end

# try / rescue (catch exceptions):
try do
    risky()
rescue
    e in ArgumentError -> {:error, e.message}
    e in [KeyError, MatchError] -> {:error, "structural: #{inspect(e)}"}
after
    cleanup()    # always runs
end

# catch (catches throws, not raises):
try do
    throw(:thrown_value)
catch
    :throw, value -> {:caught, value}
    :exit, reason -> {:exited, reason}
    :error, error -> {:errored, error}
end

# Convention: prefer {:ok, _} | {:error, _} over raising. Reserve raise
# for truly exceptional cases.`,
    },
    {
      lang: "elixir",
      caption: "Let-it-crash + Supervisor restart",
      code: `defmodule Worker do
    use GenServer

    def init(_), do: {:ok, %{}}

    def handle_call(:risky, _from, state) do
        # If this crashes, the Supervisor restarts the process.
        # The state is lost — design for that (persist before responding).
        result = do_risky_thing()
        {:reply, result, state}
    end
end

defmodule MyApp.Supervisor do
    use Supervisor

    def start_link(_) do
        Supervisor.start_link(__MODULE__, :ok, name: __MODULE__)
    end

    def init(_) do
        children = [
            {Worker, []}
        ]
        # :one_for_one — restart just the crashed child
        # :one_for_all — restart all children
        # :rest_for_one — restart crashed + everything after
        Supervisor.init(children, strategy: :one_for_one, max_restarts: 3)
    end
end`,
    },
    {
      lang: "elixir",
      caption: "Persistent state across crashes — ETS / persisted_term",
      code: `# GenServer state is lost on crash by default. Persist externally:
defmodule Cache do
    use GenServer

    def start_link(_), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

    def init(_) do
        # ETS table owned by this process. On crash, table is destroyed
        # unless heir is set. Use :persistent_term for read-only data.
        :ets.new(:cache, [:set, :public, :named_table])
        {:ok, %{}}
    end

    def get(key), do: :ets.lookup_element(:cache, key, 2) rescue nil

    def put(key, val), do: :ets.insert(:cache, {key, val})

    # For state that must survive restart:
    #   * Save to DB before replying (write-through cache)
    #   * Use :persistent_term for read-only global config
    #   * Use ETS heir to transfer table to a new process on crash
end`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "elixir",
      caption: "spawn / send / receive — the primitives",
      code: `# Spawn a process:
pid = spawn(fn -> receive do
    {:hello, from} -> send(from, {:hi, self()})
    after 5000 -> :timeout
end end)

# Send a message:
send(pid, {:hello, self()})

# Receive a message in the current process:
receive do
    {:hi, from} -> IO.puts("got hi from #{inspect(from)}")
after 1000 -> :timeout
end

# These are the primitives. In practice you use GenServer, Task, Agent,
# which wrap them with supervision, naming, and structured APIs.
#
# BEAM processes are LIGHTWEIGHT (~2KB initial stack). Millions per node.
# Preemptive scheduling across N CPU cores (set via +S flag).`,
    },
    {
      lang: "elixir",
      caption: "Task.async / Task.await — parallel computation",
      code: `# Run a function in a new process, get a future:
task = Task.async(fn -> fetch_url("https://example.com") end)
# ... do other work ...
result = Task.await(task, 5000)   # 5s timeout

# Parallel map (concurrent, not ordered):
results = Enum.map(urls, &Task.async(fn -> fetch_url(&1) end))
         |> Enum.map(&Task.await/1)

# Task.async links to the caller — if either crashes, the other exits.
# Task.async_nolink for fire-and-forget (useful for batched work).

# Task.Supervisor for supervised tasks (auto-restart on crash):
{:ok, sup} = Task.Supervisor.start_link()
Task.Supervisor.async_nolink(sup, fn -> work() end)
|> Task.await()`,
    },
    {
      lang: "elixir",
      caption: "GenServer — stateful process with structured API",
      code: `defmodule Counter do
    use GenServer

    # Client API
    def start_link(init), do: GenServer.start_link(__MODULE__, init, name: __MODULE__)
    def inc(n \\ 1), do: GenServer.cast(__MODULE__, {:inc, n})
    def get, do: GenServer.call(__MODULE__, :get)

    # Server callbacks
    @impl true
    def init(n), do: {:ok, n}

    @impl true
    def handle_cast({:inc, k}, n), do: {:noreply, n + k}

    @impl true
    def handle_call(:get, _from, n), do: {:reply, n, n}
end

# Call:
Counter.start_link(0)
Counter.inc(5)
Counter.get()    # 5

# GenServer serializes calls — only one callback runs at a time.
# Use cast for fire-and-forget, call for synchronous request/reply.`,
    },
    {
      lang: "elixir",
      caption: "Supervision tree — let-it-crash architecture",
      code: `defmodule MyApp.Supervisor do
    use Supervisor

    def start_link(_) do
        Supervisor.start_link(__MODULE__, :ok, name: __MODULE__)
    end

    def init(_) do
        children = [
            {MyApp.Repo, []},
            {MyApp.Cache, []},
            {Registry, keys: :unique, name: MyApp.Registry},
            {DynamicSupervisor, strategy: :one_for_one, name: MyApp.Dynamic},
            MyAppWeb.Endpoint
        ]
        Supervisor.init(children, strategy: :one_for_one)
    end
end

# Restart strategies:
#   :one_for_one  — restart only the crashed child
#   :one_for_all  — restart all children (for tightly-coupled)
#   :rest_for_one — restart crashed + everything after

# Child specs declare restart policy:
#   :permanent  — always restart (default)
#   :temporary  — never restart (one-shot tasks)
#   :transient  — restart only if exited abnormally

# max_restarts / max_seconds — circuit breaker to prevent crash loops.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "elixir",
      caption: "ExUnit — the bundled test framework",
      code: `# File: test/my_app_test.exs
defmodule MyAppTest do
    use ExUnit.Case, async: true   # parallel-safe tests

    test "addition" do
        assert 1 + 1 == 2
        refute 1 == 2
        assert_raise ArgumentError, fn -> risky() end
    end

    test "with setup" do
        # Setup runs before each test:
        assert length(users()) == 3
    end

    setup do
        # Returns {:ok, context} — context is merged into test args.
        {:ok, users: create_users(3)}
    end

    test "uses context", %{users: users} do
        assert length(users) == 3
    end
end

# Run: mix test
# Run a single file: mix test test/my_app_test.exs
# Run with line: mix test test/my_app_test.exs:12
# Watch mode: mix test --stale (only re-run affected)`,
    },
    {
      lang: "elixir",
      caption: "describe / data-driven tests",
      code: `defmodule MathTest do
    use ExUnit.Case

    describe "factorial/1" do
        test "base case" do
            assert Math.factorial(0) == 1
        end

        # Data-driven test:
        test "various values" do
            for {input, expected} <- [{1, 1}, {2, 2}, {3, 6}, {4, 24}, {5, 120}] do
                assert Math.factorial(input) == expected
            end
        end
    end

    describe "divide/2" do
        test "raises on zero" do
            assert_raise ArgumentError, "division by zero", fn ->
                Math.divide(1, 0)
            end
        end
    end
end

# describe groups related tests, runs them sequentially if not async.`,
    },
    {
      lang: "elixir",
      caption: "Mox — mocks for behaviour-based dependencies",
      code: `# Define a behaviour in your app:
defmodule MyApp.HTTP do
    @callback get(String.t()) :: {:ok, map()} | {:error, term()}
end

# Define a mock with Mox:
Mox.defmock(MyApp.HTTPMock, for: MyApp.HTTP)

# In config/test.exs, configure your app to use the mock:
#   config :my_app, http: MyApp.HTTPMock

# In tests:
defmodule MyAppTest do
    use ExUnit.Case
    import Mox

    setup :verify_on_exit!   # verify expectations after each test

    test "fetches user" do
        MyApp.HTTPMock
        |> expect(:get, fn "https://api.example.com/users/1" ->
            {:ok, %{name: "ada"}}
        end)

        assert MyApp.fetch_user(1) == {:ok, %{name: "ada"}}
    end
end

# Mox requires you to call the mock only from the process that set the
# expectation — set allow_any/1 for cross-process access.`,
    },
    {
      lang: "elixir",
      caption: "Async tests + Ecto sandbox + CI",
      code: `# ExUnit runs tests in parallel by default (async: true).
# Database tests use Ecto sandbox — each test gets its own transaction,
# rolled back at the end.

defmodule MyApp.RepoTest do
    use ExUnit.Case, async: true
    use MyApp.DataCase   # sets up sandbox

    test "insert user" do
        {:ok, user} = MyApp.Repo.insert(%User{name: "ada"})
        assert user.id != nil
    end
end

# CI: GitHub Actions
#   - erlef/setup-beam@v1 with elixir-version + otp-version
#   - mix deps.get
#   - mix credo --strict
#   - mix dialyzer
#   - mix coveralls.html
#   - mix test

# Coverage via excoveralls; type-checking via Dialyzer (limited);
# linting via Credo (style + complexity).`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "BEAM processes are ~2KB initial stack; millions per node. Preemptive scheduling across N CPU cores (set +S N).", tag: "perf" },
    { fact: "BEAM GC is per-process, generational, stop-the-world but only of THAT process — no global pauses. Tiny heaps because tiny processes.", tag: "perf" },
    { fact: "Tail-call optimization is guaranteed — recursive state loops (GenServer) run in O(1) stack.", tag: "perf" },
    { fact: "Pattern matching is the primary branching mechanism — compiled to efficient jump tables in BEAM bytecode.", tag: "perf" },
    { fact: "list ++ list is O(n); use prepend [h | t] for O(1), reverse at the end. Enum.reverse/1 is O(n) once.", tag: "complexity" },
    { fact: "Enum operations are eager (materialize intermediate lists); Stream is lazy (fuse into one pass).", tag: "complexity" },
    { fact: "ETS is ~10x faster than GenServer for read-heavy state — direct C-level table lookup vs message round-trip.", tag: "perf" },
    { fact: ":persistent_term (OTP 21+) for read-only global state — O(1) reads, but writes are O(n) (broadcasts to all processes).", tag: "version" },
    { fact: "Binaries > 64 bytes are heap-shared (refcounted); small binaries are copied. Large string manipulation can be cheap if you avoid re-encoding.", tag: "perf" },
    { fact: "Atoms are never GC'd; the atom table caps at ~1M (atom table limit, set via +t). NEVER call String.to_atom/1 on user input.", tag: "gotcha" },
    { fact: "Process mailbox is FIFO and unbounded — slow consumer + fast producers = OOM. Monitor with :erlang.process_info(pid, :message_queue_len).", tag: "gotcha" },
    { fact: "Map small is sorted array (linear scan); large becomes HAMT (log32 n). Conversion happens around 32 elements.", tag: "complexity" },
    { fact: "Hot code reload: a release can swap a module at runtime — but existing process state must be migrated via code_change callback.", tag: "version" },
    { fact: "Profile with :fprof (call graph) or :eprof (per-function). exprof is an Elixir wrapper. observer() GUI for live inspection.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Mix", purpose: "Built-in build tool — create, compile, test, deps, release. Bundled with Elixir.", url: "https://hexdocs.pm/mix/", category: "build" },
    { tool: "Hex", purpose: "Package manager / registry — hex.pm. Bundled with Elixir since 1.0.", url: "https://hex.pm/", category: "package" },
    { tool: "ExUnit", purpose: "Bundled test framework — describe, async, doctests, fixtures. No install needed.", url: "https://hexdocs.pm/ex_unit/", category: "test" },
    { tool: "Phoenix", purpose: "Web framework — LiveView, Ecto, channels. The 'Rails for Elixir'.", url: "https://phoenixframework.org/", category: "build" },
    { tool: "Phoenix LiveView", purpose: "Server-rendered real-time UI — replaces React for many apps. WebSocket-pushed, no JS build.", url: "https://hexdocs.pm/phoenix_live_view/", category: "build" },
    { tool: "Ecto", purpose: "Database wrapper + ORM — schema, changeset, query DSL. Distinct from Phoenix, used together.", url: "https://hexdocs.pm/ecto/", category: "build" },
    { tool: "Oban", purpose: "Background job queue — Postgres-backed, durable, supervised. Replaces Sidekiq/Celery for Elixir.", url: "https://getoban.pro/", category: "build" },
    { tool: "Mox", purpose: "Mocking library — behaviour-based, concurrent-safe. The standard for mocking in Elixir.", url: "https://hexdocs.pm/mox/", category: "test" },
    { tool: "Credo", purpose: "Static analysis linter — style, complexity, refactor suggestions. The 'rubocop' for Elixir.", url: "https://hexdocs.pm/credo/", category: "lint" },
    { tool: "Dialyxir / Dialyzer", purpose: "Type analysis (success typing) — finds type errors via @spec annotations. Not full type checking.", url: "https://hexdocs.pm/dialyxir/", category: "lint" },
    { tool: "ExCoveralls", purpose: "Code coverage — line + branch. Integrates with ExUnit via coveralls.json.", url: "https://github.com/parroty/excoveralls", category: "test" },
    { tool: "Benchee", purpose: "Micro-benchmarking — statistics, comparisons across versions. Like BenchmarkTools for Julia.", url: "https://hexdocs.pm/benchee/", category: "test" },
    { tool: "Nerves", purpose: "Embedded Linux deployment — full BEAM on Raspberry Pi, BeagleBone. IoT in Elixir.", url: "https://nerves-project.org/", category: "deploy" },
    { tool: "Livebook", purpose: "Notebook environment for Elixir — like Jupyter but reactive, with LiveView integration.", url: "https://livebook.dev/", category: "build" },
    { tool: "IEx", purpose: "Interactive Elixir REPL — bundled. pry for breakpoint debugging, h for docs, i for introspection.", url: "https://hexdocs.pm/iex/", category: "debug" },
    { tool: "Observer / :observer", purpose: "Built-in GUI — process tree, memory, ETS tables, applications. Indispensable for prod debugging.", url: "https://www.erlang.org/doc/man/observer.html", category: "debug" },
    { tool: "Telemetry", purpose: "Standard metrics/events library — Phoenix, Ecto, Oban all emit telemetry. Use with Prometheus exporter.", url: "https://hexdocs.pm/telemetry/", category: "debug" },
    { tool: "Broadway", purpose: "Pipeline processing — RabbitMQ/SQS/Kafka consumers with batching, back-pressure. Built on GenStage.", url: "https://hexdocs.pm/broadway/", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "0.1", year: 2011, highlight: "José Valim announces Elixir at Euruko. Built on Erlang/OTP with Ruby-inspired syntax." },
    { version: "1.0", year: 2014, highlight: "First stable release — types, protocols, GenServer wrappers, Mix, Hex. The language contract." },
    { version: "1.2", year: 2015, highlight: "with statement, multi-value clause pattern matching, typespec improvements." },
    { version: "1.4", year: 2016, highlight: "Application inference, mix test --stale, improvements to Ecto integration." },
    { version: "1.5", year: 2017, highlight: "GenServer.cast -> call migration, child_spec, @impl annotation. The OTP modernization release." },
    { version: "1.6", year: 2018, highlight: "mix format code formatter, Code.ensure_compiled, the 'umbrella apps' maturity." },
    { version: "1.9", year: 2019, highlight: "mix release — self-contained deployable artifacts (no Erlang needed on target). Replaces Distillery." },
    { version: "1.10", year: 2020, highlight: "Compiler tracks dependencies for incremental builds; :telemetry becomes standard." },
    { version: "1.11", year: 2020, highlight: "Improvements to compilation time, guards can call functions, :persistent_term support." },
    { version: "1.12", year: 2021, highlight: "Ranges with steps (1..10//2), bitwise macros, Livebook integration." },
    { version: "1.13", year: 2022, highlight: "Mix.ProjectStack for nested projects, Code.print_diagnostic/1, OTP 25 support." },
    { version: "1.14", year: 2022, highlight: "PartitionSupervisor, improved IEx autocompletion,dbg macro for debugging pipelines." },
    { version: "1.15", year: 2023, highlight: "Compiler optimizations, mixed-version compatibility, OTP 26 support." },
    { version: "1.16", year: 2024, highlight: "Improved compiler diagnostics, Hex package integrity, integration with OTP 27's native JSON." },
    { version: "1.17", year: 2024, highlight: "Compiler performance work, gradual types groundwork (experimental), LiveView 1.0 stable." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's a BEAM process and how does it differ from an OS thread?", a: "A BEAM process is a lightweight green thread scheduled by Erlang's BEAM VM — ~2KB initial stack, millions per node, preemptive scheduling across N OS threads (set via +S N). OS threads are ~1-8MB stack each, kernel-scheduled, ~thousands practical. BEAM processes have isolated heaps (so GC is per-process, no global pauses), communicate via message passing (no shared memory), and crash independently. Each process has its own mailbox — messages are queued FIFO, receive scans them.", difficulty: "medium" },
    { q: "Explain 'let it crash' and the supervisor pattern.", a: "Instead of defensive try/catch everywhere, write code that assumes success; if it fails, the process crashes and the supervisor restarts it with the original init args. This works because: (1) processes are isolated — one crashing doesn't take down others; (2) supervisors handle restart logic (one_for_one, one_for_all, rest_for_one); (3) fresh state from a known-good init is often more reliable than trying to recover mid-corruption. Trade-off: state is lost on crash, so persist critical state externally (DB, ETS with heir). The pattern gives 99.9999% uptime when done right.", difficulty: "medium" },
    { q: "Why are all variables immutable, and how do you 'change' state?", a: "Immutability means x = x + 1 doesn't mutate — it re-binds x to a new value, old binding is GC'd. State lives in processes via recursive receive loops: a counter is def loop(n) do receive do {:inc} -> loop(n+1); {:get, from} -> send(from, {:ok, n}); loop(n) end end. The new n is a fresh value, the old is gone. This avoids locks (no shared state to race), makes code trivially testable, and lets the runtime share memory aggressively (no copy-on-write). GenServer/Agent abstract this pattern.", difficulty: "easy" },
    { q: "What does |> (pipe) do, and why is it central to Elixir?", a: "a |> f(b) is sugar for f(a, b) — threads the LHS as the FIRST arg of the RHS. Reads left-to-right like a recipe: data |> transform |> filter |> output. Pipes are central because Elixir has no method syntax (no obj.method()) — there's no other way to chain operations readably. Convention: each pipe step on its own line, parens even when optional (f() not f). Anti-pattern: piping into a function that doesn't take the value as first arg — use explicit bind instead.", difficulty: "easy" },
    { q: "How do GenServer, Agent, and Task differ?", a: "GenServer is the general-purpose stateful process — call (sync), cast (async), and callbacks for init/handle_call/handle_cast/handle_info/terminate. Use for anything with structured state and request/response. Agent is a thin wrapper for pure state — get/update functions, no message-passing. Use for simple key-value or counter state. Task is a one-shot computation — async spawns + await waits. Use for parallel computation, not long-lived state. All three run inside supervision trees; pick the simplest that fits.", difficulty: "medium" },
    { q: "What's the difference between Enum and Stream?", a: "Enum is eager — every step materializes a new list. [1..10] |> Enum.map(...) |> Enum.filter(...) builds two lists. Stream is lazy — operations fuse into a single pass when consumed. Stream is better for large data or when only a prefix is needed (Stream.take). Enum is faster for small lists (no setup overhead) and easier to reason about. Rule: Stream for pipelines over GBs / unbounded; Enum for everything else. The two share most function names — switching is often just changing the module prefix.", difficulty: "medium" },
    { q: "Why can String.to_atom/1 be a DoS vulnerability?", a: "Atoms are interned and never GC'd — the atom table is bounded (default ~1M, configurable via +t). String.to_atom(user_input) creates a new atom per unique string; an attacker sending 1M different strings exhausts the table and crashes the VM. Use String.to_existing_atom/1 (raises on unknown, validate against an allow-list first), or use strings as keys for user-provided values. Atoms from your code (literals, module/ function names) are bounded by your source size — safe.", difficulty: "medium" },
    { q: "How does hot code reload work, and what are the gotchas?", a: "BEAM can swap a module at runtime — :code.purge(Module) then :code.load_file(Module). Existing processes continue with the new code on the next call. Gotchas: (1) Processes mid-execution in old code keep running it until they make a fully-qualified call (Module.function()) which routes to new code. (2) State must be migrated via the code_change/3 callback (in releases). (3) Two versions can coexist temporarily (current + old); a third purge kills processes still on old. (4) Releases (mix release + Distillery/Burrito) make this explicit and reproducible; ad-hoc :l(Module) is dev-only.", difficulty: "hard" },
    { q: "How would you debug a memory leak in an Elixir app?", a: "Step 1: Run :observer.start — see process count, memory, ETS tables. Step 2: Identify the offending process — sort by heap_size or message_queue_len in the Processes tab. Step 3: :erlang.process_info(pid, :memory) and :messages to inspect. Step 4: For binary leaks, check process_info(pid, :binary) — large shared binaries kept alive by refs. Step 5: For ETS growth, :ets.info(table) and dump key counts. Step 6: For global atom/binary table, :erlang.memory(:atom) / :binary. Common causes: growing mailbox (slow consumer), unclosed ETS table, retained closures capturing large data, missing :ok acknowledgements in cast loops.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Go", whenThis: "Massive concurrency over flaky networks (chat, presence, multiplayer, telemetry), hot code reload, LiveView server-rendered UIs, anything wanting 'nine nines' uptime story.", whenThat: "CPU-bound services, single-binary deployment, systems programming, teams wanting static typing + simple semantics." },
    { vs: "Node.js", whenThis: "Massive concurrent WebSocket connections (Discord-style), fault-tolerant supervision trees, anything wanting OTP-grade reliability, embedded (Nerves).", whenThat: "Isomorphic JS, npm ecosystem, anything needing browser/server shared code, when team is JavaScript-shaped." },
    { vs: "Ruby on Rails", whenThis: "Realtime features (LiveView vs ViewComponent), massive concurrency, fault tolerance via OTP, anything where Ruby's GIL is a bottleneck.", whenThat: "Established Rails codebases, when team is Ruby-shaped, rapid MVP work, anything relying on the Rails ecosystem (ActiveRecord, gems)." },
    { vs: "Erlang", whenThis: "Modern syntax (Ruby-flavored), better tooling (Mix, Hex, ExUnit), LiveView/web-focused ecosystem, easier hiring (Elixir is more popular than Erlang today).", whenThat: "Existing Erlang codebases, niche telecom/DSP systems, when you need libraries only available as Erlang OTP apps." },
  ],
};

export default sheet;
