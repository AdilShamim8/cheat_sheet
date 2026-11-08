import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "redis",
  name: "Redis",
  category: "topics",
  tier: "topic",
  tags: ["cache", "in-memory", "key-value", "data-structures", "pub-sub", "queues", "persistence"],
  tagline: "In-memory data structure store — the default cache, and much more: locks, queues, rate limits, leaderboards.",
  year: 2009,
  author: "Salvatore Sanfilippo (antirez)",
  lastUpdated: "2026-11",
  readingTime: 26,

  tldr: [
    "Redis is an in-memory key-value store exposing rich data structures — strings, hashes, lists, sets, sorted sets, streams — with optional persistence (RDB snapshots + AOF) and single-threaded command execution that makes reasoning about atomicity trivial.",
    "It is the default caching layer of the industry (DB-Engines #8, 163.3 score, Nov 2026) and the backing store for queues (Sidekiq, BullMQ), sessions, rate limiters, distributed locks, and leaderboards.",
    "Reach for Redis when read latency must be sub-millisecond, when you need atomic operations across a data structure (INCR, ZADD, SETNX), or when you need ephemeral shared state between services.",
    "Know the boundaries: everything must fit in RAM (plus eviction policy), license is RSALv2/SSPL since 2021 (Valkey is the BSD fork under Linux Foundation — 9.1 current), and single-node commands serialize — big keys block everyone.",
  ],

  mentalModel: {
    title: "One thread mutates in-RAM data structures atomically",
    body: "Redis executes commands one at a time on a single main thread against data held entirely in memory. That single fact gives you: atomicity for free (no interleaving of two commands — INCR, SETNX, and multi-key Lua scripts are race-free), predictable microsecond latency (no disk in the hot path, no row locks), and a global ordering of every command (replicas and AOF replay that exact order). The costs follow just as directly: one slow command (KEYS *, a 500k-member ZRANGE, a huge Lua script) stalls the whole server; your dataset is bounded by RAM; and durability is a dial (appendfsync always/everysec/no) you must consciously choose. Everything in Redis engineering is 'keep keys small, keep commands O(1)-ish, keep the dataset in RAM'.",
  },

  constructs: [
    { syntax: "SET key val EX 60 NX", behavior: "Set with TTL, only if not exists — the atomic lock primitive.", when: "Distributed locks (with token + Lua release), idempotency guards, single-flight." },
    { syntax: "INCR / INCRBY key n", behavior: "Atomic integer increment, O(1).", when: "Counters, rate limiters (fixed window), sequence IDs." },
    { syntax: "EXPIRE key ttl / SET ... EX", behavior: "Lazy expiration on access + active random sampling sweep.", when: "Every ephemeral key: caches, sessions, locks. No TTL = permanent debt." },
    { syntax: "ZADD zset score member; ZRANGEBYSCORE", behavior: "Sorted set — unique members scored, ordered by score, O(log n) ops.", when: "Leaderboards, priority queues, time-window indexes, delayed jobs." },
    { syntax: "XADD stream * field val; XREADGROUP", behavior: "Streams: append-only log with consumer groups, acks, pending lists.", when: "Durable queues (replaces ad-hoc list queues); Kafka-light semantics in Redis." },
    { syntax: "EVAL \"lua\" 1 key arg", behavior: "Server-side script — runs atomically amid the command stream.", when: "Multi-step invariants (check-and-set on hashes, safe lock release with token)." },
    { syntax: "SET name val GET", behavior: "SET returning the previous value (Redis 7+) — atomic swap in one RTT.", when: "Read-modify-write caches; replacing GET+SET pairs." },
    { syntax: "HSET / HGETALL hash field val", behavior: "Hash — field-level access within one key.", when: "Object caches (per-field updates), session records; small hashes are memory-efficient." },
    { syntax: "CLIENT TRACKING on", behavior: "Server-assisted client-side caching — invalidation pushes.", when: "Read-through app caches without TTL guessing (RESP3 feature)." },
    { syntax: "SEARCH (Redis 8 query engine)", behavior: "Full-text + vector + JSON querying in the same engine (RediSearch merged into core 8.0).", when: "Search and RAG retrieval without a second system." },
  ],

  patterns: [
    {
      lang: "bash",
      caption: "Distributed lock done correctly (token + Lua)",
      code: `# Acquire: unique token, NX, TTL (single command — atomic)
SET lock:order:47 a9f3c1e2-... PX 10000 NX
# → OK means acquired; nil means someone holds it.

# Release with token check — MUST be atomic, hence Lua:
EVAL "
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end" 1 lock:order:47 a9f3c1e2-...

# Why: GET-then-DEL across two commands can delete someone else's
# lock after yours expires mid-flight. The token guards ownership.
# For anything critical, prefer Redlock-quorum or a fenced lock;
# single-instance locks are best-effort (failover loses them).`,
    },
    {
      lang: "bash",
      caption: "Rate limiting: token bucket in Lua",
      code: `# Token bucket: capacity 10, refill 1 per 0.5s — one atomic script
EVAL "
local key, rate, capacity, now = KEYS[1], tonumber(ARGV[1]),
                                tonumber(ARGV[2]), tonumber(ARGV[3])
local bucket = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(bucket[1]) or capacity
local ts = tonumber(bucket[2]) or now
tokens = math.min(capacity, tokens + (now - ts) * rate)
local allowed = tokens >= 1
if allowed then tokens = tokens - 1 end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(capacity / rate * 1000) + 1000)
return allowed and 1 or 0" 1 rl:user:123 2 10 <now_ms>

# Sliding window alternative — ZSET with timestamp members:
ZADD rl:user:123 <now_ms> <uuid>
ZREMRANGEBYSCORE rl:user:123 0 <now_ms - window_ms>
ZCARD rl:user:123            # → count in window
EXPIRE rl:user:123 <window_s>`,
    },
    {
      lang: "bash",
      caption: "Cache-aside with stampede protection",
      code: `# 1) Try the cache
GET user:47
# → nil (miss)

# 2) Single-flight: only one request rebuilds (others wait/fallback)
SET cache:lock:user:47 1 PX 5000 NX
# → OK  → you rebuild: load from DB, then write back with jittered TTL
SET user:47 '<json>' EX 300
# → nil → sleep 50ms, retry GET (the lock holder fills it)

# 3) Jittered TTL prevents synchronized expiry waves:
EX 300 ± 30s random → SET user:47 v EX 287

# 4) Negative caching: cache the miss itself briefly
SET user:999999 'null' EX 30

# Hot key that must never expire? Update-on-write (write-through)
# + EXPIRE refresh on access — but never 'no TTL at all'.`,
    },
    {
      lang: "bash",
      caption: "Streams as a durable queue (consumer groups)",
      code: `# Producer
XADD jobs * kind email payload '{"to":"a@b.io"}'

# Consumer group (idempotent setup; '$' = only new messages)
XGROUP CREATE jobs workers $ MKSTREAM

# Worker loop: claim, process, ack
XREADGROUP GROUP workers worker-1 COUNT 10 BLOCK 5000 STREAMS jobs >
# ... process ...
XACK jobs workers <id>

# Crash recovery: pending entries older than 2 min are claimable
XPENDING jobs workers IDLE 120000
XCLAIM jobs workers worker-2 120000 <id>

# vs LIST queues (LPUSH/BRPOP): streams ack + replay + history;
# lists are simpler but drop messages on consumer crash (no ack).`,
    },
    {
      lang: "bash",
      caption: "Leaderboard / time-window queries with ZSET",
      code: `ZADD lb:season4 <score> <player>
ZREVRANK lb:season4 <player>     # O(log n) rank
ZREVRANGE lb:season4 0 9 WITHSCORES   # top 10
ZRANGEBYSCORE events <from_ms> <to_ms>   # time-indexed lookup
# member = event id, score = timestamp

# Memory shape: 1M members ≈ 40-70MB. Millions of members in ONE
# key = big-key hazard (copy-on-write pain during fork persistence):
# shard into lb:season4:0..lb:season4:15 and merge at read time.`,
    },
  ],

  pitfalls: [
    { title: "Treating cluster-bus versions as compatible", symptom: "Mixed 7.x/8.x cluster nodes lose replication or crash on protocol mismatches.", fix: "Upgrade clusters node-by-node within one major line; 8.10.3 fixes a >4GB PUBLISH heap overflow — read security releases before scheduling." },
    { title: "KEYS * in production", symptom: "Every client times out; latency graph flatlines whenever a monitoring script or admin console runs KEYS.", fix: "KEYS is O(N) over ALL keys on the single thread. Use SCAN with COUNT for iteration (non-blocking, cursor-based), or maintain a set of key names. Config: rename-command KEYS '' in prod configs as a guardrail." },
    { title: "Big keys (multi-MB values or 1M+-member collections)", symptom: "Latency spikes on access and during BGSAVE (copy-on-write doubles the memory of that key), migration/resharding stalls.", fix: "Keep values under ~10KB and collections in the tens-of-thousands. Shard big structures across keys (hash slots), use unlink-friendly deletes (UNLINK, not DEL) for big keys, monitor with redis-cli --bigkeys / MEMORY USAGE." },
    { title: "Non-atomic read-modify-write sequences", symptom: "GET value, compute in app, SET result — under concurrency the last write wins and updates are lost.", fix: "That's not Redis being broken; your logic spans multiple commands. Use single-command ops (INCR, SETNX, SET ... GET), MULTI/EXEC when all-or-nothing matters, or Lua for multi-step logic. Server-side = atomic." },
    { title: "Using allkeys-lru eviction for a mixed cache+data workload", symptom: "You eviction-lose real data (sessions, locks) because the policy treats everything equally; users get logged out under memory pressure.", fix: "Separate cache and source-of-truth into different instances (or at minimum different logical DBs won't help policies — physical separation will). volatile-lru only evicts keys WITH TTLs, protecting unexpirable data. Never store data you can't rebuild in an allkeys-* instance." },
    { title: "Treating Redis as a durable database", symptom: "Restart/failover loses the last minutes of writes even though 'we persisted'.", fix: "AOF appendfsync everysec = up to 1s loss by design; RDB = since last snapshot. If you need real durability, Postgres is the source of truth and Redis is a projection/cache. redis-check-aof, AOF rewrite tuning, and replicas are availability tools, not ACID guarantees." },
    { title: "Blocking commands on the shared instance", symptom: "BLPOP/BRPOP/BLOCKING XREAD hold connections and can pile up; a slow Lua script freezes everything, including health checks.", fix: "Always use timeouts (BLPOP key 5), dedicate an instance for queue-blocking semantics, keep Lua scripts microseconds-short (they can't be interrupted), and use BUSY-RESPONSE/SCRIPT KILL-aware deployments." },
    { title: "Hash-slot errors and cross-slot multi-key ops in cluster mode", symptom: "CROSSSLOT Keys in request don't hash to the same slot on MSET/Lua/SUNION across keys.", fix: "Hash tags {user47}:... force related keys into one slot. Design key families so multi-key operations stay within a tag; otherwise do the composition client-side." },
    { title: "Expiring without refresh: session churn surprises", symptom: "EXPIRE set once at login, users logged out mid-session despite activity.", fix: "EXPIRE is fixed at set time unless refreshed. Re-issue EXPIRE on each access (or PEXPIRE with sliding window logic in Lua). Persist is forever — always set a TTL on anything ephemeral." },
  ],

  quickReference: [
    { fact: "Learning path: redis.io learn → streams tutorial → CLIENT TRACKING → redis-cli --bigkeys on a real dataset.", tag: "learning" },
    { fact: "Current: Redis 8.10.3 (Oct 2026 security release — cluster-bus heap overflow fix >4GB PUBLISH propagation). Redis 8.x merged modules into core: query engine (search), JSON, time series, probabilistic (bloom/cuckoo/topk).", tag: "version" },
    { fact: "Valkey (BSD fork under Linux Foundation, post-2021 license change) is at 9.1.3 — the drop-in used by AWS ElastiCache/Lambda-friendly stacks and cloud vendors avoiding RSALv2/SSPL.", tag: "version" },
    { fact: "DB-Engines Nov 2026: #8 overall (163.3). Still the default cache in 2026 architectures, now with vector search competition from pgvector/dedicated DBs.", tag: "usage" },
    { fact: "Single-threaded command execution (I/O threads since 6.0, but each command still atomic) — one slow command stalls ALL clients on that node.", tag: "behavior" },
    { fact: "Latency budget: GET/SET ~50-100μs server-side; pipeline 10k commands in one RTT instead of 10k RTTs — 100-1000x throughput.", tag: "perf" },
    { fact: "Persistence: RDB (fork + snapshot, compact, lossy) | AOF (fsync per sec default, replayable) | both — AOF-with-RDB-preamble is the usual compromise.", tag: "persistence" },
    { fact: "Eviction: noeviction (default!) errors writes at maxmemory; allkeys-lru/volatile-lru/lfu/frequency/ttl variants. Production caches: allkeys-lfu is usually the best hit-rate.", tag: "memory" },
    { fact: "Cluster shards 16384 hash slots; clients need cluster-aware drivers (MOVED/ASK redirects). Multi-key ops need same-slot hash tags {…}.", tag: "scale" },
    { fact: "RESP3 + CLIENT TRACKING gives server-assisted invalidation for client-side caches — the modern answer to TTL staleness.", tag: "caching" },
    { fact: "Hash-max-listpack / zset compression: small collections store compactly (listpack) — hashes under 128 fields cost ~10x less than the same data as strings.", tag: "memory" },
    { fact: "Lua scripts block; functions (Redis 7) are the managed/library form. Either way: keep them tiny, idempotent, and read-only when possible.", tag: "behavior" },
    { fact: "Redis Stack features (search/JSON/TS) are in OSS 8.x core now — one process, one data model, SQL-free querying.", tag: "version" },
  ],

  goDeeper: [
    { title: "Redis official documentation", url: "https://redis.io/docs/latest/", note: "The commands reference and data-types intro are exemplary; read the persistence and cluster pages before operating either." },
    { title: "Redis Interactive Tutorial (redis.io/learn)", url: "https://redis.io/learn/", note: "Browser-based, covers patterns from basics to streams and vector search." },
    { title: "How Redis Scaling Works (Salvatore's blog archive)", url: "http://oldblog.antirez.com/post/redis-persistence-demystified.html", note: "Persistence demystified by the original author — still the clearest fork/fsync explanation." },
    { title: "Valkey", url: "https://valkey.io/", note: "The Linux Foundation fork — API-compatible; read its roadmap to understand the post-license landscape." },
    { title: "Redis University", url: "https://university.redis.io/", note: "Free courses on caching patterns, streams, and cluster operations." },
  ],

  // ─── §8 "Data types" — Redis structures ARE the product ──────────────────
  dataTypes: {
    primitives: [
      { syntax: "STRING (binary-safe, ≤512MB)", behavior: "The atom: get/set/incr/append; stores anything bytes — serialized JSON, protobuf, raw counters.", when: "Counters (INCR), caches of single values, locks (SET NX), binary blobs. Default choice for single-value data." },
      { syntax: "INTEGER strings", behavior: "INCR/INCRBYFLOAT treat value as number atomically.", when: "Rate limits, stats, sequence generation — no lock needed ever." },
      { syntax: "Bit arrays (SETBIT/GETBIT)", behavior: "Random access bits on a string — 1.2B bits = 150MB.", when: "Active-user bloom-ish counting (BITCOUNT), feature flags per user, dedupe sketches." },
    ],
    collections: [
      { syntax: "LIST (LPUSH/RPOP, LRANGE)", behavior: "Doubly-linked list; O(1) push/pop both ends, O(n) index.", when: "Simple FIFO queues (BRPOP with timeout), timelines, latest-N feeds. Streams supersede for durable queues." },
      { syntax: "SET (SADD, SISMEMBER, SINTER)", behavior: "Unordered unique members; O(1) membership, set algebra across keys (same slot in cluster).", when: "Tags, follows, dedupe, mutual-friends (SINTERSTORE)." },
      { syntax: "ZSET (sorted set)", behavior: "Member→score map ordered by score; O(log n) insert, O(log n+m) range queries.", when: "Leaderboards, delayed jobs (score=run_at), sliding-window rate limits, secondary indexes." },
      { syntax: "HASH (HSET/HGETALL)", behavior: "Field→value map in one key; small hashes encode as compact listpack.", when: "Object/session records — field-level reads/writes without read-modify-write of a whole JSON string." },
      { syntax: "STREAM (XADD/XREADGROUP)", behavior: "Append-only log with consumer groups, PEL (pending entries list), XCLAIM for recovery.", when: "Durable work queues with ack/retry semantics — Redis-native job infrastructure." },
    ],
    custom: [
      { syntax: "JSON (RedisJSON in core 8)", behavior: "Structured documents with JSONPath queries (JSON.GET $.path).", when: "Semi-structured cache records with partial updates — no more GET/parse/SET cycles." },
      { syntax: "Time series (TS.ADD)", behavior: "Append-only samples per key, aggregation/compaction rules.", when: "Metrics rolling windows, sensor data — smaller than sorted sets for pure time data." },
      { syntax: "Probabilistic (BF.ADD/CF.ADD/TOPK)", behavior: "Bloom/cuckoo filters, count-min sketch, top-k — sublinear memory with tunable error.", when: "Definitely-not-present checks (cache pre-filter), heavy hitters, dedupe at scale." },
      { syntax: "Search indexes (FT.CREATE)", behavior: "Inverted + vector indexes over HASH/JSON documents.", when: "Full-text/autocomplete/RAG retrieval colocated with cache data." },
    ],
  },

  // ─── §9 Operators & expressions ───────────────────────────────────────────
  operators: [
    { syntax: "SET ... NX / XX", behavior: "Write only if absent / only if present — conditional mutation in one command.", when: "Locks, guards, idempotent init (NX); swap-if-exists (XX)." },
    { syntax: "INCRBY / INCRBYFLOAT", behavior: "Arithmetic on strings, atomic.", when: "Counters and budgets — the lockless counter pattern." },
    { syntax: "ZADD ... GT / LT / NX / XX", behavior: "Conditional score update (only if greater/lesser).", when: "Best-score updates (never regress a leaderboard score), dedupe windows." },
    { syntax: "EXPIRE key s NX / GT / LT", behavior: "Set TTL only if none / only if greater / only if less.", when: "Sliding sessions without extending past a hard cap (GT/LT semantics, Redis 7+)." },
    { syntax: "SINTER/SUNION/SDIFF", behavior: "Set algebra across keys — server-side, single RTT.", when: "Relationship queries (mutual follows, exclusion lists)." },
    { syntax: "GETRANGE/SETRANGE", behavior: "Substring ops on string values.", when: "Patching cached blobs without full rewrite — rare, but replaces read-modify-write when it fits." },
  ],

  // ─── §10 Input / output ───────────────────────────────────────────────────
  inputOutput: [
    {
      lang: "bash",
      caption: "Bulk data in/out",
      code: `# Bulk import: pipe protocol text straight in (100k+/s)
cat commands.redis | redis-cli --pipe

# commands.redis lines:
# SET user:1 '{"name":"Ada"}'
# EXPIRE user:1 300
# or raw protocol with printf '*3\\r\\n$3\\r\\nSET\\r\\n...'

# Dump a key with full TTL + metadata:
redis-cli --raw DUMP user:1 > user1.dump
redis-cli RESTORE user:1 300 "$(cat user1.dump)" REPLACE

# RDB snapshot on demand:
BGSAVE   # forks; check LASTSAVE timestamp

# Export pattern for offline analysis:
redis-cli --scan --pattern 'session:*' | \
  while read k; do echo "$k $(redis-cli TTL "$k")"; done > sessions.txt`,
    },
    {
      lang: "bash",
      caption: "Pipelining vs transactions vs Lua",
      code: `# PIPELINE — batch many commands in one RTT (no atomicity)
cat <<'EOF' | redis-cli --pipe
INCR q:hits
INCR q:miss
EXPIRE q:hits 60
EOF

# MULTI/EXEC — atomic, ordered, all-or-nothing visibility
MULTI
SET acct:1 90
SET acct:2 10
EXEC

# WATCH — optimistic concurrency (retry on conflict)
WATCH acct:1
v = GET acct:1
MULTI
SET acct:1 (v - 50)
EXEC   # → nil if acct:1 changed → retry

# EVAL — atomic multi-step (read + branch + write in one slot)
EVAL "if tonumber(redis.call('GET', KEYS[1])) >= tonumber(ARGV[1])
      then return redis.call('DECRBY', KEYS[1], ARGV[1]) else return -1 end" \
     1 acct:1 50`,
    },
  ],

  // ─── §11 Loops & iteration ────────────────────────────────────────────────
  loops: [
    {
      lang: "bash",
      caption: "SCAN: iterate without blocking",
      code: `# SCAN is cursor-based, O(1)-ish per call, may return dupes
SCAN 0 MATCH user:* COUNT 1000
# → "42" (next cursor) + keys...; loop until cursor 0

# shell pattern:
cursor=0
while :; do
  read -r cursor keys <<< "$(redis-cli SCAN $cursor MATCH 'user:*' COUNT 1000 | tr '\\n' ' ')"
  [ "$keys" ] && echo "$keys" | xargs -n1 redis-cli UNLINK
  [ "$cursor" = "0" ] && break
done

# HSCAN/SSCAN/ZSCAN for collection members:
HSCAN user:47 0 COUNT 100

# Never KEYS in prod — O(total keys) on the event loop.`,
    },
    {
      lang: "bash",
      caption: "Consumer loops: BRPOP vs XREADGROUP",
      code: `# Simple queue worker (lossy on crash — no ack)
while true; do
  BRPOP tasks 5          # blocks up to 5s, one item
  # process...
done

# Stream worker (durable: ack, pending, claim, replay)
while true; do
  XREADGROUP GROUP workers w1 COUNT 10 BLOCK 5000 STREAMS tasks >
  for id in \${ids[@]}; do
    process || XACK tasks workers $id   # ack only on success
  done
done

# Recover stuck messages (visible via XPENDING):
XAUTOCLAIM tasks workers w1 120000 0 COUNT 10`,
    },
  ],

  // ─── §12 Functions & callables ────────────────────────────────────────────
  functions: [
    {
      lang: "bash",
      caption: "Functions (Redis 7+): versioned server-side logic",
      code: `# Register a library once (replaces loose EVAL scripts):
redis-cli FUNCTION LOAD REPLACE '#!lua name=mylib
redis.register_function("sliding_window",
  function(keys, args)
    local key, now, window, limit = keys[1],
      tonumber(args[1]), tonumber(args[2]), tonumber(args[3])
    redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
    local n = redis.call("ZCARD", key)
    if n < limit then
      redis.call("ZADD", key, now, now .. "-" .. math.random())
      redis.call("PEXPIRE", key, window)
      return 1
    end
    return 0
  end)'

# Call it like a command:
FCALL sliding_window 1 rl:ip:1.2.3.4 <now_ms> 60000 100

# Benefits over EVAL: stored server-side, versioned by name,
# atomic, and debuggable with FUNCTION LIST / FCALL_RO.`,
    },
  ],

  // ─── §13 Error handling ───────────────────────────────────────────────────
  errorHandling: [
    {
      lang: "bash",
      caption: "Failure modes and what they look like",
      code: `# OOM (noeviction at maxmemory):
#   SET → OOM command not allowed when used memory > 'maxmemory'
#   → pick a policy per workload (allkeys-lfu for pure caches)

# Wrong type:
#   GET mylist → WRONGTYPE Operation against a key holding
#   the wrong kind of value → type-check at boundaries (TYPE cmd)

# Cluster redirects:
#   MOVED 3999 10.0.0.2:6379 → client must re-ask target node
#   ASK during resharding → follow, don't cache
#   → use cluster-aware client libs (they handle both)

# Timeout/retry policy for the app layer:
#   cache miss path: fail-open (serve from DB, log)
#   lock path: fail-closed or degrade to no-lock + alert
#   queue path: retry with backoff + DLQ after N attempts

# Persistence integrity:
redis-check-aof --fix appendonly.aof   # repair truncated tail
redis-check-rdb dump.rdb               # verify snapshot`,
    },
  ],

  // ─── §14 "Concurrency" — atomicity model ─────────────────────────────────
  concurrency: [
    {
      lang: "bash",
      caption: "The atomicity toolbox, ranked",
      code: `# 1) Single commands (always atomic, always right):
INCR counter
SET lock:1 tok NX PX 10000
SET swap:1 newval GET            # atomic read-modify-write

# 2) MULTI/EXEC: atomic batch — no interleaving from other clients
#    (queued then run consecutively). No reads influence writes inside.

# 3) WATCH/MULTI/EXEC: optimistic CAS — retry loop on nil EXEC
WATCH stock:sku1
local v = GET stock:sku1
if v.to_i >= 1:
    MULTI; DECR stock:sku1; EXEC  # nil → someone won → retry

# 4) Lua/FCALL: full atomic read-branch-write on the server —
#    the only way to encode 'if GET == token then DEL' safely.

# Replication note: scripts/txns replicate as effects (or verbatim
# in 7+ script-effects replication) — but a failover between WRITE
# and propagation can still lose the write. Locks = best effort;
# for hard invariants, the DB owns the truth.`,
    },
  ],

  // ─── §15 Testing ──────────────────────────────────────────────────────────
  testing: [
    {
      lang: "bash",
      caption: "Testing Redis-backed logic",
      code: `# Spin a disposable instance per test run:
docker run -p 6379:6379 redis:8-alpine --save "" --appendonly no
# (--save "" disables persistence: max speed, zero state)

# redis-cli assertions in CI scripts:
test "$(redis-cli INCR t:counter)" = "1"
test "$(redis-cli SET t:lock x NX PX 1000)" = "OK"
test "$(redis-cli SET t:lock y NX)" = ""    # second NX fails

# Unit level: fakeredis / redis-mock libs replicate protocol,
# but ALWAYS run integration against real redis — Lua behavior,
# eviction, and persistence are not mockable faithfully.

# Latency/throughput gate (before & after changes):
redis-benchmark -t set,get -n 1000000 -P 16 -q
# → SET: ~1M ops/s pipelined; investigate any 2x regression`,
    },
  ],

  // ─── §16 Performance ──────────────────────────────────────────────────────
  performance: [
    { fact: "redis-cli --latency and --latency-history give the true p50/p99 of YOUR network+server pair; instant slowlog via SLOWLOG GET (default threshold 10ms).", tag: "measure" },
    { fact: "Pipelining: 16-64 commands per batch is the sweet spot — one RTT amortization without starving other clients.", tag: "network" },
    { fact: "Big values (>10KB) serialize the client and bloat fork memory: chunk or move blobs to object storage, keep pointers in Redis.", tag: "memory" },
    { fact: "Use UNLINK instead of DEL for big keys — asynchronous reclaim off the main thread.", tag: "memory" },
    { fact: "Avoid HGETALL/SMEMBERS/ZRANGE 0 -1 on big collections — SCAN-family with COUNT, or design for field access (HMGET).", tag: "commands" },
    { fact: "Hash/zset/list encodings: keep fields under listpack thresholds (hash-max-listpack-entries 128) for ~10x memory savings on small collections.", tag: "memory" },
    { fact: "I/O threads (io-threads 4+) help >100k ops/s workloads with many connections; commands remain single-threaded.", tag: "config" },
    { fact: "Fork latency (BGSAVE/AOF rewrite) scales with dirty pages — Linux THP off (transparent_hugepage=never), vm.overcommit_memory=1.", tag: "config" },
    { fact: "Cluster sharding scales reads+writes linearly but multi-key logic fragments by slot; measure before sharding what vertical RAM can hold.", tag: "scale" },
    { fact: "CLIENT TRACKING + local caches cut hot-key load 10-100x with server-driven invalidation — no TTL staleness window.", tag: "caching" },
    { fact: "Disable THP, set maxmemory with headroom (~20%) below instance RAM, monitor evicted_keys and fragmented ratio (activedefrag for fragmentation).", tag: "memory" },
    { fact: "redis-benchmark -P 16 baselines your hardware: typical NVMe-era nodes do 500k-1M SET/s pipelined; a 10x drop means client or network, not Redis.", tag: "measure" },
  ],

  // ─── §17 Ecosystem & tooling ──────────────────────────────────────────────
  ecosystem: [
    { tool: "redis-cli", purpose: "The built-in client: interactive REPL, --pipe bulk loading, --bigkeys, --latency, --stat.", url: "https://redis.io/docs/latest/develop/tools/cli/", category: "tooling" },
    { tool: "redis-benchmark", purpose: "Throughput/latency benchmarking with pipelining simulation.", url: "https://redis.io/docs/latest/develop/tools/redis-benchmark/", category: "test" },
    { tool: "RedisInsight", purpose: "Official GUI: data browser, slowlog, memory analysis, stream visualization.", url: "https://redis.io/insight/", category: "tooling" },
    { tool: "Valkey", purpose: "BSD fork (Linux Foundation) — drop-in alternative avoiding RSALv2/SSPL; 9.1 current.", url: "https://valkey.io/", category: "runtime" },
    { tool: "Sidekiq (Ruby)", purpose: "The canonical Redis-backed job queue — battle-tested patterns for retries/scheduling.", url: "https://sidekiq.org/", category: "queues" },
    { tool: "BullMQ (Node)", purpose: "Robust job/flow queues on Redis streams/lists for Node.", url: "https://bullmq.io/", category: "queues" },
    { tool: "Celery (Python)", purpose: "Distributed task queue with Redis broker option.", url: "https://docs.celeryq.dev/", category: "queues" },
    { tool: "redis-py / node-redis / jedis / go-redis", purpose: "First-class clients with cluster & sentinel support per ecosystem.", url: "https://redis.io/docs/latest/develop/clients/", category: "clients" },
    { tool: "DragonflyDB", purpose: "Multi-threaded Redis-compatible engine — throughput alternative (not 1:1 semantics).", url: "https://www.dragonflydb.io/", category: "runtime" },
    { tool: "Keysight / memtier_benchmark", purpose: "Redis-compatible load generators for capacity planning.", url: "https://github.com/RedisLabs/memtier_benchmark", category: "test" },
  ],

  // ─── §18 Version history ──────────────────────────────────────────────────
  versionHistory: [
    { version: "1.0", year: 2009, highlight: "antirez releases Redis: in-memory, single-threaded, persistence via snapshotting — 'a data structures server'." },
    { version: "2.x", year: 2010, highlight: "Virtual memory (later removed), hashes, sorted sets mature; 2.6 (2012) adds Lua scripting — atomic multi-step logic." },
    { version: "3.0", year: 2015, highlight: "Redis Cluster: 16384 hash slots, sharding without proxies." },
    { version: "4.0", year: 2017, highlight: "Modules (RedisTimeSeries etc.), UNLINK async delete, mixed RDB-AOF format." },
    { version: "5.0", year: 2018, highlight: "Streams — consumer groups, acks, pending lists: durable queues in core." },
    { version: "6.0", year: 2020, highlight: "RESP3, SSL, ACLs (users+permissions), client-side caching with invalidation, io-threads." },
    { version: "6.2 / 7.0", year: 2022, highlight: "Functions (managed Lua), sharded pub/sub, ACL v2, Streams improvements; 7.x = the enterprise hardening era." },
    { version: "License change", year: 2024, highlight: "Redis 7.4 moves from BSD to RSALv2/SSPL; Valkey forks under Linux Foundation; BSD heritage continues there (9.x line).", },
    { version: "8.0", year: 2025, highlight: "Redis Stack merged into core: query engine (search), JSON, time series, probabilistic structures — one process, AGPL added to license options." },
    { version: "8.10", year: 2026, highlight: "Current line (8.10.3, Oct 2026): cluster-bus heap-overflow security fix; vector + query engine maturity for AI workloads." },
  ],

  // ─── §19 Interview hot questions ──────────────────────────────────────────
  interview: [
    { q: "Why is Redis fast, and what's the single-thread caveat?", a: "In-memory data (no disk I/O on the hot path), efficient data structures (skiplists, listpacks, compact encodings), and a single-threaded event loop with zero locking on the command path. The caveat: that one thread also means one slow command (KEYS *, a 1M-member ZRANGE, an unbounded Lua script) blocks every client. Since 6.0, network I/O is threaded but command execution remains serial — by design, because it's what makes every command atomic.", difficulty: "easy" },
    { q: "Explain cache stampede and how you prevent it.", a: "A hot key expires; hundreds of requests simultaneously miss, all hit the database to rebuild, and the DB falls over — which keeps the cache from being refilled, deepening the hole. Defenses: (1) single-flight via SET NX lock — only one request rebuilds, others retry/wait briefly; (2) TTL jitter so keys don't expire in waves; (3) logical expiration — store value+expires-at, rebuild asynchronously when stale while serving old data; (4) pre-warm on deploy for known hot keys.", difficulty: "medium" },
    { q: "How does expiration actually work?", a: "Two mechanisms. Lazy: on access, if the key's TTL has passed, it's deleted then. Active: a background cycle samples random keys with expired TTLs and deletes them (eviction scales with keyspace size, tuned by hz). Consequence: an expired key that nobody touches still consumes memory until the sweep reaches it — 'expired' ≠ 'freed'. EXPIRE is also fixed, not sliding: refresh it on access for session semantics.", difficulty: "medium" },
    { q: "RDB vs AOF — what do you choose?", a: "RDB: fork-based binary snapshot — compact, fast restore, loses everything since the last snapshot; forking pauses scale with dirty memory. AOF: appends every write, fsync everysec by default (≤1s loss) — replay on restart; rewrites compact it (AOF with RDB preamble). Production usual: both (AOF+preamble) or AOF for caches-that-act-like-data. The honest answer: if losing seconds of data is unacceptable, the data belongs in Postgres and Redis holds rebuildable projections.", difficulty: "medium" },
    { q: "Design a rate limiter with Redis. Which algorithm?", a: "Fixed window (INCR + EXPIRE at window start): trivially atomic, but allows 2x burst at the boundary. Sliding window with ZSET (ZADD now, ZREMRANGEBYSCORE old, ZCARD check): accurate, O(log n), heavier memory. Token bucket in Lua (tokens refill by elapsed time, spend 1 per request): accurate AND memory-light — the production favorite; do it in one atomic script, or races skew the count. Multi-instance: same key → all instances see the same bucket; hash-tag if sharded.", difficulty: "hard" },
    { q: "What breaks in Redis Cluster that worked on a single node?", a: "Multi-key commands (MSET, Lua over several keys, SINTER across keys) require all keys in one hash slot — you add hash tags {tenant42}:user, {tenant42}:lock to force colocation. Transactions across slots fail; SELECT databases don't exist; pub/sub broadcast differs (sharded pub/sub in 7+). Failover: replicas promote asynchronously — acknowledged writes can be lost during partition (even with WAIT, only probabilistically reduced). Design rule: group per-entity keys under one tag and treat cross-entity ops as client-side composition.", difficulty: "hard" },
    { q: "Why is GET-then-DEL for a lock wrong?", a: "Between your GET (yes, it's my lock) and DEL, the lock can expire and another client acquires it — you then delete THEIR lock, and a third client can now acquire while the second still thinks it holds it. Fix: store a unique token when acquiring; release via Lua that compares GET == token before DEL — atomic check-and-delete. Also: always set a TTL (dead holders must not hold locks forever), and hold-locks-short (the TTL should exceed your worst-case critical section).", difficulty: "medium" },
    { q: "Why is Redis memory-fragmented and what do you do?", a: "Allocator (jemalloc) can't return freed pages when remaining data is scattered: symptom is RSS ≫ used_memory. Causes: uneven key sizes, big-key churn, high maxmemory delta, THP on the host. Fixes: activedefrag yes (online defragmentation — CPU cost), consistent key sizes, UNLINK for big deletes, THP off. Monitor mem_fragmentation_ratio (RSS/used); >1.5 warrants attention, >2 action.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ──────────────────────────────────────────────────────
  comparisons: [
    { vs: "Memcached", whenThis: "Data structures beyond strings (lists, sets, sorted sets, streams), persistence options, replication, scripting, pub/sub, richer eviction (LFU).", whenThat: "Pure string cache, multithreaded raw throughput, dead-simple ops. Memcached remains fine — Redis just absorbed its use case." },
    { vs: "Valkey", whenThis: "Ecosystem features shipped in 8.x (query engine, JSON, time series) and commercial modules; RSAL/SSPL/AGPL licensing accepted by your org.", whenThat: "BSD-license requirement, cloud-vendor alignment (AWS/Google back it), drop-in parity for core commands. 9.1 line diverges on perf internals." },
    { vs: "KeyDB / Dragonfly", whenThis: "Mature battle-tested single-thread semantics, module ecosystem, official tooling.", whenThat: "Multithreaded throughput scaling on one node (Dragonfly: MVCC-ish, modern architecture) — at the cost of younger semantics and compatibility edges." },
    { vs: "Kafka/RabbitMQ", whenThis: "Lightweight queues (≤10k msg/s), TTL-based ephemeral work, consumer groups with acks on streams, colocated with cache.", whenThat: "Durable high-throughput event streaming, replay from arbitrary offsets, exactly-once-ish semantics, long retention. Redis streams top out at memory scale." },
    { vs: "Postgres (for caching)", whenThis: "Sub-ms reads, high fan-out counters, ephemeral shared state across services.", whenThat: "When the 'cache' needs constraints, joins, and real durability — an UNLOGGED/materialized-view Postgres tier can serve mid-speed caching without a second system." },
  ],
};

export default sheet;
