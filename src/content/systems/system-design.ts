import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "system-design",
  name: "System Design",
  category: "systems",
  tier: "sys",
  tags: ["distributed-systems", "scalability", "availability", "latency", "caching", "sharding", "consistency"],
  tagline: "Designing distributed systems — the concepts that outlast any single framework, cloud, or interview cycle.",

  tldr: [
    "System design is the practice of structuring distributed systems to meet explicit availability, latency, throughput, and consistency targets under real-world failure modes (partitions, hotspots, cascading failures).",
    "The 80/20: most production pain comes from a small set of patterns — load balancing, caching, partitioning, replication, async queues — and a small set of failure modes — network partitions, hot keys, and unbounded fan-out.",
    "Reach for it when a service exceeds a single machine, when SLAs are explicit (p99 latency, 99.9% uptime), when preparing for design interviews, or when capacity planning for the next order of magnitude.",
    "Most interview and production decisions collapse to four axes: stateless vs stateful, sync vs async, push vs pull, and strong vs eventual consistency. Pick consciously along each, then defend the tradeoffs.",
  ],

  mentalModel: {
    title: "Capacity is a chain, latency is a tail",
    body: "Every request traverses a chain of components (LB → app → cache → DB → replica). Throughput is bounded by the slowest link; user-visible latency is dominated by the tail (p99), not the mean. Four resources actually matter: CPU, memory, network bandwidth, and disk IOPS — capacity planning is a budget across all four. Add headroom (≈2x for stateless services, ≈3x for stateful failover). The CAP theorem forces a choice between C and A during partitions — pick one consciously, because the network will partition.",
  },

  constructs: [
    { syntax: "Stateless service + horizontal LB", behavior: "No session in process memory; any instance can serve any request — scales by adding replicas.", when: "Default for API tiers; enables autoscaling and rolling deploys." },
    { syntax: "L4 vs L7 load balancer", behavior: "L4 forwards TCP streams by IP:port; L7 inspects HTTP headers/paths and can route by content.", when: "L4 for raw throughput (TLS termination at backend); L7 for path routing, retries, auth at the edge." },
    { syntax: "Consistent hashing", behavior: "Hash ring where each node owns a key range; adding/removing a node moves only ~1/N of keys.", when: "Sharding cache clusters, partitioning KV stores, routing by user/tenant ID." },
    { syntax: "Read replicas (async vs sync)", behavior: "Async replicas accept writes lagging behind primary (faster commits, stale reads); sync replicas block on quorum (no stale reads, writes fail if replica down).", when: "Async for read-heavy web apps; sync for financial / strongly-consistent reads." },
    { syntax: "Write-ahead log (WAL) / event sourcing", behavior: "Append-only log of immutable events is the source of truth; current state is a materialized view.", when: "Databases, Kafka-based systems, audit-heavy domains; enables replay and new projections." },
    { syntax: "Cache-aside vs write-through", behavior: "Cache-aside: app reads cache, on miss reads DB and writes cache. Write-through: app writes cache + DB together.", when: "Cache-aside for read-heavy tolerant of stale data; write-through when reads must never miss." },
    { syntax: "Circuit breaker", behavior: "Trips open after N consecutive failures; fast-fails subsequent calls for a cooldown, then half-opens to probe.", when: "Any synchronous downstream call that can fail slow (DB, third-party API, payment gateway)." },
    { syntax: "Token bucket rate limiter", behavior: "Bucket holds N tokens, refills at R/sec; each request consumes 1; empty bucket → 429.", when: "Per-user API quotas, protecting downstream from bursts, smoothing traffic." },
    { syntax: "Message queue (at-least-once vs exactly-once)", behavior: "At-least-once: redelivers on consumer crash, requires idempotent consumers. Exactly-once: broker-side dedup, costs throughput.", when: "At-least-once + idempotency keys is the realistic production pattern." },
    { syntax: "Idempotency key", behavior: "Client sends a unique key per logical operation; server dedupes by key within a TTL window.", when: "Any POST/PUT that mutates state and may be retried (payments, order creation)." },
    { syntax: "Database sharding (range vs hash)", behavior: "Range: shard by contiguous key (efficient range scans, hot spots on monotonic keys). Hash: shard by hash(key) (even distribution, no range scans).", when: "Range for time-series / lexicographic lookups; hash for uniform write load." },
    { syntax: "CQRS (command/query responsibility segregation)", behavior: "Writes go to a normalized write model; reads come from denormalized read models kept in sync via events.", when: "Read-heavy domains where read shape differs wildly from write shape (search, dashboards)." },
  ],

  patterns: [
    {
      caption: "Canonical web request path — every component is a potential bottleneck",
      code: `Client ──HTTPS──> CDN ──> WAF/L7 LB ──> App (stateless, N replicas)
                                     │
                                     ├──> Redis (cache-aside, p99 < 1ms)
                                     │
                                     └──> Primary DB ──async──> Read Replicas
                                              │
                                              └──wal──> Kafka ──> Consumers

SLOs:
  p50 read  < 50ms    p99 read  < 200ms
  p50 write < 100ms   p99 write < 500ms
  availability 99.95% (~22 min downtime / month budget)

Failure domains:
  - app replica dies           → LB drains, autoscale replaces
  - cache dies                 → app tanks DB; expect 10x load spike
  - primary DB dies            → failover to replica (30s-5min RTO)
  - AZ goes down               → cross-AZ LB, replicas in 2+ AZs
  - region goes down           → DNS failover to standby region (RPO > 0)`,
    },
    {
      lang: "yaml",
      caption: "Idempotency + circuit breaker + rate limit — the production API contract",
      code: `# Conceptual API gateway policy (envoy / nginx / custom)
routes:
  - match: { prefix: "/v1/charges" }
    route:
      cluster: payment-service
      timeout: 5s              # hard ceiling; never inherit 60s default
      retry_policy:
        retry_on: "5xx,connect-failure,refused-stream"
        num_retries: 2
        retry_back_off:
          base_interval: 50ms
          max_interval: 500ms
    rate_limit:
      token_bucket:
        max_tokens: 100
        tokens_per_fill: 100
        fill_interval: 1s      # 100 req/s per user
    circuit_breakers:
      thresholds:
        - priority: default
          max_connections: 1000
          max_pending_requests: 500
          max_requests: 1000
          max_retries: 3
    # Idempotency-Key header required for POST/PUT — server dedupes for 24h
    requires_idempotency_key: true`,
    },
    {
      lang: "typescript",
      caption: "Idempotency key dedup — required for any retried mutation",
      code: `// POST /v1/charges with header Idempotency-Key: <uuid>
// Server stores (key, user_id) → response for 24h in Redis.
const KEY = (userId: string, idemKey: string) =>
  \`idem:\${userId}:\${idemKey}\`;

async function createCharge(req: ChargeReq, idemKey: string) {
  const cached = await redis.get(KEY(req.userId, idemKey));
  if (cached) return JSON.parse(cached);          // replay original response

  const lock = await redis.set(
    \`lock:\${req.userId}:\${idemKey}\`, "1", "NX", "PX", 30000,
  );
  if (!lock) throw new ConcurrentRequestError();  // another replica is processing

  const result = await db.insert(req);            // the actual mutation
  await redis.set(KEY(req.userId, idemKey), JSON.stringify(result), "EX", 86400);
  return result;
}`,
    },
    {
      caption: "Consistent hashing — adding a node moves only ~1/N of keys",
      code: `Hash ring (e.g. 2^32 slots, 16 virtual nodes per real node):

       node-A
     /        \\
  node-D      node-B       ← each node owns keys in its arc
     \\        /
       node-C

  key k → hash(k) mod 2^32 → walk clockwise → first node owns k

  Add node-B': only keys between node-A and node-B' move (≈ 1/4 of ring)
  Remove node-B: its keys fall through to node-C (its clockwise neighbor)

  Virtual nodes (vnodes) prevent hot spots when physical nodes have
  unequal capacity. 150-200 vnodes per real node is the common default
  (Dynamo, Cassandra, ScyllaDB).`,
    },
    {
      lang: "typescript",
      caption: "Circuit breaker — fail fast instead of piling up blocked threads",
      code: `type State = "closed" | "open" | "half_open";

class Circuit {
  state: State = "closed";
  fails = 0;
  openedAt = 0;
  constructor(
    private readonly threshold = 5,        // consecutive failures to trip
    private readonly cooldownMs = 10_000,  // open → wait → half_open
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt < this.cooldownMs)
        throw new CircuitOpenError();
      this.state = "half_open";            // probe
    }
    try {
      const r = await fn();
      this.fails = 0;
      this.state = "closed";
      return r;
    } catch (e) {
      if (++this.fails >= this.threshold) {
        this.state = "open";
        this.openedAt = Date.now();
      }
      throw e;
    }
  }
}`,
    },
  ],

  pitfalls: [
    {
      title: "Cache stampede / thundering herd on cold cache",
      symptom: "Cache miss on a hot key → N concurrent requests all bypass the cache and hit the DB simultaneously; DB CPU spikes, latency compounds, cascade begins.",
      fix: "Use request coalescing (single-flight) or probabilistic early expiration (XFetch algorithm) so only one request rebuilds the cache. Always set a TTL; never cache forever.",
    },
    {
      title: "Split-brain during leader election",
      symptom: "Network partition makes two nodes each think they're the leader; both accept writes; on heal, one set of writes is lost or diverges.",
      fix: "Require a quorum (majority) for leader election (Raft, Paxos). Accept that CP systems become unavailable during a partition — that's the tradeoff, not a bug.",
    },
    {
      title: "Cascading failures without a circuit breaker",
      symptom: "Downstream service slows → upstream threads block waiting → thread pool exhausted → upstream also dies → cascade.",
      fix: "Every synchronous call needs a timeout AND a circuit breaker. Timeout alone doesn't help — the connection still consumes a thread until the timeout fires.",
    },
    {
      title: "Hot partition from poor shard key",
      symptom: "Hashing by a low-cardinality key (e.g., country=US) routes 80% of traffic to one shard; that shard saturates while others idle.",
      fix: "Choose a high-cardinality, evenly-distributed key (user_id, order_id). Watch for temporal hotspots (a celebrity's account) and add a secondary cache layer for hot keys.",
    },
    {
      title: "Sync replication blocks writes on replica failure",
      symptom: "Synchronous quorum writes block when a replica is slow or down — throughput collapses and latency spikes on every write.",
      fix: "Use async replication for non-financial data; if you need strong consistency, use Raft/Paxos with a quorum of 3 or 5 — never sync to all replicas.",
    },
    {
      title: "Clock-based assumptions across machines (NTP drift)",
      symptom: "Two services disagree on event ordering because their clocks are 50ms apart; TTLs expire early or late; distributed locks leak.",
      fix: "Never use wall-clock time for correctness. Use HLC (hybrid logical clocks), Lamport timestamps, or vector clocks. NTP is for telemetry, not ordering.",
    },
    {
      title: "Unbounded queue depth hiding backlog",
      symptom: "Queue grows to 100K messages; consumers report 'healthy' because they're processing; latency to end user is minutes.",
      fix: "Set a queue depth alert (e.g., >1000 for 5min) and a max age alert (>30s per message). If consumers can't keep up, autoscale them or shed load at the producer.",
    },
  ],

  quickReference: [
    { fact: "Availability math: 99.9% = 8.76h downtime/yr; 99.99% = 52.6min/yr; 99.999% = 5.26min/yr. Each '9' costs ~10x more.", tag: "gotcha" },
    { fact: "p99 is what users feel — p50 hides tail latency. Always report p50/p95/p99 together; track p99.9 only at scale (>10K rps).", tag: "perf" },
    { fact: "Little's Law: L = λW. Avg concurrency = throughput × latency. 1000 rps × 200ms = 200 in-flight requests — size thread pools accordingly.", tag: "complexity" },
    { fact: "Amdahl's law: speedup is bounded by the serial fraction. 10% serial work caps parallel speedup at 10x regardless of core count.", tag: "complexity" },
    { fact: "Back-of-envelope: 1KB payload × 1M rps = 1 GB/s bandwidth — saturates a 10Gbps NIC with protocol overhead.", tag: "perf" },
    { fact: "IOPS by storage class: HDD ~100, SATA SSD ~10K-100K, NVMe ~500K-1M. Random 4K reads dominate DB latency.", tag: "perf" },
    { fact: "Network latency baselines: same AZ ~0.5ms, cross-AZ ~1-2ms, cross-region ~30-100ms, intercontinental ~150-300ms RTT.", tag: "perf" },
    { fact: "CAP theorem: during a network partition you must choose C or A — you cannot have both. Most web systems pick AP.", tag: "gotcha" },
    { fact: "Ephemeral TCP ports per client IP: ~28K (32768-60999 on Linux). At >28K concurrent outbound connections to one host, you're stuck without SO_REUSEPORT.", tag: "gotcha" },
    { fact: "Cache hit ratio needed for 99% latency improvement: typically >95%. Below 90%, cache adds overhead without payoff.", tag: "perf" },
    { fact: "Connection pool sizing: ~2× (cores) for CPU-bound; for I/O-bound, use Little's Law. 100 connections to a 4-core DB is usually too many.", tag: "perf" },
    { fact: "Database connection cost: ~5-10MB RAM per connection (Postgres default). 1000 connections = 5-10GB just for connection state.", tag: "gotcha" },
    { fact: "Service mesh sidecar (Istio/Linkerd) adds ~1-2ms latency per hop and ~50MB RAM per pod — budget for it.", tag: "perf" },
    { fact: "Idempotency keys: required for any retryable mutation. Store in Redis with TTL = client retry window × 2.", tag: "style" },
    { fact: "SLI/SLO/SLA: SLI is measured, SLO is the target (e.g., p99 < 200ms over 28 days), SLA is the contract (with penalty).", tag: "style" },
  ],

  goDeeper: [
    { title: "Designing Data-Intensive Applications (Martin Kleppmann)", url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/", note: "The single best book on distributed systems concepts — replication, partitioning, consistency, and the tradeoffs that don't go out of date." },
    { title: "Site Reliability Engineering (Google)", url: "https://sre.google/sre-book/table-of-contents/", note: "Free online; the canonical treatment of SLIs/SLOs, incident response, and load balancing at Google scale." },
    { title: "The Twelve-Factor App", url: "https://12factor.net/", note: "Heroku's checklist for stateless, config-driven, disposable services — still the baseline for cloud-native design." },
    { title: "AWS Well-Architected Framework", url: "https://aws.amazon.com/architecture/well-architected/", note: "Cloud-vendor-tinged but the six pillars (operational, security, reliability, perf, cost, sustainability) apply anywhere." },
    { title: "Martin Fowler — Patterns of Enterprise Architecture", url: "https://martinfowler.com/books/eaa.html", note: "Older but defines the vocabulary (DTO, repository, unit of work, CQRS) that every system design conversation assumes." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  // Adapted for system design: consistency models / partitioning strategies / caching patterns
  dataTypes: {
    primitives: [
      { syntax: "Strong / linearizable", behavior: "Read sees latest write; operations appear atomic across replicas. Requires quorum + leader lease + fencing.", when: "Financial ledgers, inventory, anything where stale reads cost money or violate invariants." },
      { syntax: "Sequential consistency", behavior: "All ops appear in some total order consistent with each client's program order; no real-time bound.", when: "When you need a global order but not real-time guarantees — older RDBMS replicas, distributed lock services." },
      { syntax: "Causal consistency", behavior: "Preserves causally-related order; concurrent writes can be seen in different orders by different readers.", when: "Comment threads, collaborative docs — anywhere 'reply after' must be visible but global order isn't required." },
      { syntax: "Read-your-writes (session)", behavior: "A client always sees its own writes; guaranteed within a session sticky to a replica.", when: "User profile updates — you post, then refresh; you must see your own change. Session token pins the replica." },
      { syntax: "Monotonic reads", behavior: "Once a client sees a value, it never sees an older one — no 'time travel' on subsequent reads.", when: "Prevents confusing UX in social feeds where a newer post disappears then reappears." },
      { syntax: "Bounded staleness", behavior: "Reads lag writes by at most T seconds or N versions. Quantifiable staleness contract.", when: "When SLA needs a hard ceiling on staleness (e.g., 'reads are <=5s stale') without paying for strong consistency." },
      { syntax: "Eventual consistency", behavior: "No guarantees on order or visibility; replicas converge given no new writes. Cheapest, fastest.", when: "Likes, view counts, social graphs — anything where stale reads are acceptable for throughput." },
    ],
    collections: [
      { syntax: "Range partitioning", behavior: "Shard by contiguous key ranges (e.g., [a-m], [n-z]). Efficient range scans; hot spots on monotonic keys (timestamps).", when: "Time-series DBs, lexicographic lookups. HBase, DynamoDB range keys, Cassandra clustering." },
      { syntax: "Hash partitioning", behavior: "shard = hash(key) mod N. Even distribution; no range scans.", when: "Uniform write load, key-value workloads. Memcached, Redis Cluster, early MongoDB sharding." },
      { syntax: "Consistent hashing", behavior: "Hash ring where each node owns an arc; adding/removing moves only ~1/N of keys.", when: "Cache clusters, KV stores with churn. Dynamo, Cassandra, ScyllaDB — the default for elastic clusters." },
      { syntax: "Directory partitioning", behavior: "A lookup service maps each key to its shard; clients query directory first.", when: "When shard location is dynamic (rebalancing, resharding). Vitess, MongoDB config server." },
      { syntax: "Geographic partitioning", behavior: "Shard by region/user-country for data residency + latency. Cross-region replication for global reads.", when: "GDPR compliance, latency-sensitive global apps. Multi-region Postgres/CockroachDB/Yugabyte." },
      { syntax: "Vertical partitioning", behavior: "Split by column or table — hot columns in fast storage, cold columns in cheap storage.", when: "Wide-row tables where a few columns are accessed 99% of the time. Column stores (Bigtable, HBase)." },
      { syntax: "Hot-shard mitigation (salting)", behavior: "Prepend a random prefix to hot keys so they spread across N shards; reads fan out to all N.", when: "Celebrity-account problem on social platforms; time-series with one writer per shard." },
    ],
    custom: [
      { syntax: "Cache-aside (lazy loading)", behavior: "App reads cache; on miss reads DB and writes cache. Cache only contains requested keys.", when: "Default for read-heavy. Tolerates staleness; risks stampede on cold keys without single-flight." },
      { syntax: "Write-through", behavior: "App writes cache + DB together (synchronously). Cache always consistent with DB.", when: "When reads must never miss and write latency is acceptable. No stale reads; higher write latency." },
      { syntax: "Write-behind (write-back)", behavior: "App writes cache only; cache asynchronously flushes to DB. Fast writes, risk of data loss on cache crash.", when: "Write-heavy with tolerance for loss (counters, telemetry). Requires durable cache or WAL." },
      { syntax: "Refresh-ahead", behavior: "Cache proactively refreshes hot keys before TTL expiry. Prevents misses on hot paths.", when: "Predictable hot keys (config, top-N products). Wastes memory refreshing cold keys — use sparingly." },
      { syntax: "Single-flight / request coalescing", behavior: "On cache miss, only one request rebuilds the value; others block on the same future.", when: "Stampede prevention. memcached gets(), Redis Lua scripts, language-level singleflight (Go) or asyncio.Lock." },
      { syntax: "Probabilistic early expiration (XFetch)", behavior: "Each reader may stochastically refresh the cache before actual TTL, weighted by TTL remaining and staleness budget.", when: "Proactively prevents stampedes without coordination overhead. Used at Netflix, Facebook." },
      { syntax: "Two-tier cache (L1 in-process + L2 shared)", behavior: "L1 is a per-instance LRU (no network); L2 is Redis/Memcached shared across instances. L1 misses go to L2; L2 miss to DB.", when: "Very hot read paths where even Redis latency is too much. Risks staleness across L1 instances — keep L1 TTL low." },
    ],
  },

  // ─── §12 Functions & Callables → Resilience patterns ──────────────
  functions: [
    {
      lang: "typescript",
      caption: "Retry with exponential backoff + jitter — never retry without both",
      code: `// Full jitter (AWS recommendation) avoids synchronized retry storms:
//   delay = random(0, min(cap, base * 2 ** attempt))
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseMs?: number; capMs?: number } = {},
): Promise<T> {
  const { maxAttempts = 5, baseMs = 100, capMs = 10_000 } = opts;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      if (++attempt >= maxAttempts || !isRetryable(e)) throw e;
      const expo = Math.min(capMs, baseMs * 2 ** attempt);
      const delay = Math.random() * expo;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Retryable: network errors, 5xx, 429. NEVER retry 4xx (client bug).
const isRetryable = (e: unknown) =>
  e instanceof NetworkError || (e instanceof HttpError && e.status >= 500);`,
    },
    {
      lang: "typescript",
      caption: "Bulkhead — isolate failure domains with bounded pools",
      code: `// Each downstream gets its own bounded pool; one slow downstream cannot
// exhaust threads needed by healthy ones.
class BulkheadFullError extends Error {}

class Bulkhead {
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];
  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueue: number = maxConcurrent * 10,
  ) {}

  async run<R>(fn: () => Promise<R>): Promise<R> {
    if (this.inFlight >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) throw new BulkheadFullError();
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.inFlight++;
    try {
      return await fn();
    } finally {
      this.inFlight--;
      this.queue.shift()?.();
    }
  }
}

// One bulkhead per downstream: payments, inventory, search.
const paymentBulkhead = new Bulkhead(50);
await paymentBulkhead.run(() => payClient.charge(req));`,
    },
    {
      lang: "python",
      caption: "Token-bucket rate limiter — bounded bursts, average rate",
      code: `import time, threading

class TokenBucket:
    def __init__(self, rate: float, capacity: float):
        # rate = tokens/sec sustained, capacity = max burst
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last = time.monotonic()
        self.lock = threading.Lock()

    def allow(self, cost: float = 1.0) -> bool:
        with self.lock:
            now = time.monotonic()
            # Refill proportional to elapsed time
            self.tokens = min(self.capacity,
                              self.tokens + (now - self.last) * self.rate)
            self.last = now
            if self.tokens >= cost:
                self.tokens -= cost
                return True
            return False

# 100 rps sustained, burst of 200. Use Redis + Lua for distributed limit.
limiter = TokenBucket(rate=100, capacity=200)
if not limiter.allow():
    raise HTTP429()`,
    },
    {
      lang: "typescript",
      caption: "Saga — distributed transactions without 2PC",
      code: `// A saga is a sequence of local transactions, each with a compensating
// undo. If step N fails, run compensations for steps 1..N-1 in reverse.

interface Step<T> { forward: () => Promise<T>; compensate: (r: T) => Promise<void>; }

async function saga<T>(steps: Array<Step<T>>): Promise<T> {
  const done: Array<{ result: T; step: Step<T> }> = [];
  try {
    let last: T | undefined;
    for (const step of steps) {
      last = await step.forward();
      done.push({ result: last, step });
    }
    return last as T;
  } catch (e) {
    // Compensate in reverse order. Compensations are best-effort + logged.
    for (const { result, step } of [...done].reverse()) {
      try { await step.compensate(result); }
      catch (c) { /* log to DLQ — manual intervention required */ }
    }
    throw e;
  }
}

// Order saga: reserve inventory -> charge card -> confirm order
// Compensation: unreserve inventory -> refund card -> cancel order`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "python",
      caption: "Graceful degradation — serve stale cache when downstream is down",
      code: `# Pattern: on downstream failure, serve last-good cached value
# with an X-Stale header. Better than a 500 to the user.

def get_product(pid):
    try:
        product = product_svc.get(pid)         # may throw
        cache.set(f"product:{pid}", product, ttl=300)
        return product
    except (TimeoutError, CircuitOpenError):
        stale = cache.get(f"product:{pid}")
        if stale:
            response.headers["X-Stale"] = "true"
            return stale
        raise  # genuine cold-cache + downstream failure -> propagate

# Same pattern at the CDN layer:
#   Cache-Control: max-age=300, stale-while-revalidate=86400, stale-if-error=86400
# Cloudflare/Fastly honor stale-if-error; nginx needs proxy_cache_use_stale error.`,
    },
    {
      lang: "typescript",
      caption: "Poison-message handling — DLQ + max-attempts, never infinite retry",
      code: `// A consumer that fails to process a message N times must move it to a
// dead-letter queue and stop retrying. Without this, one bad message
// blocks the entire partition forever.

async function consume(msg: Message): Promise<void> {
  const attempts = Number(msg.headers["x-attempt"] ?? 0);
  try {
    await process(msg);
    await ack(msg);
  } catch (e) {
    if (attempts >= 5) {
      // Move to DLQ for human inspection; do NOT retry again.
      await dlq.send({ ...msg, error: e.message, originalId: msg.id });
      await ack(msg);                 // remove from main queue
      metrics.inc("dlq_messages", { topic: msg.topic });
      return;
    }
    // Exponential backoff with jitter before re-attempting
    const delay = Math.min(60_000, 1000 * 2 ** attempts) * (0.5 + Math.random());
    await scheduleRetry(msg, delay);
  }
}`,
    },
    {
      caption: "Failure-mode matrix — what fails, how to detect, how to mitigate",
      code: `Failure              Detection               Mitigation
─────────────────────────────────────────────────────────────────────
Cache dies            Miss rate -> 100%       Single-flight + DB pool sized for full miss
Primary DB fails      Health check failover   Promote read replica; RTO 30s-5min
Network partition     Ping/latency alerts     CAP choice: AP (stale) or CP (refuse writes)
Hot key               One shard saturates     Salt the key, replicate reads, app-level LRU
Slow downstream       p99 spike, queue depth  Circuit breaker + timeout; shed load
Thundering herd       Cold cache + spiky load Probabilistic early expiration (XFetch)
Poison message        Same message retried Nx DLQ + max-attempts; never infinite retry
Clock skew            TTLs expire early/late  HLC or vector clocks; never trust wall clock
Leader split-brain    Two leaders seen        Quorum-based (Raft, Paxos); require majority
Cascading failure     Upstream pool at 0      Bulkheads + circuit breakers at every boundary
GC pause              p99.9 spike, no errors  Low-pause collectors (G1, ZGC); tune -Xmx
Disk full             Writes fail ENOSPC      Quotas + alerts at 70%; log rotation; WAL trim`,
    },
    {
      lang: "bash",
      caption: "Distributed tracing — correlating failures across services",
      code: `# Every request gets a trace-id (W3C traceparent header).
# Every hop logs it. When something fails, one trace shows the whole path.

# W3C traceparent header format:
#   traceparent: 00-<trace-id>-<parent-id>-<flags>
#   e.g. traceparent: 00-80f198ee0a7d5c3c8b9f2e3d5c1a2b3c-1234567890abcdef-01

# In OpenTelemetry, every span has:
#   trace_id    — same across all spans in one request
#   span_id     — unique per span
#   parent_span — forms the span tree
#   attributes  — service.name, http.method, db.statement, etc.
#   status      — OK / ERROR + description
#   events      — timestamped annotations (e.g., "cache miss")

# Sample at 1-10% in prod (100% of errors). Use tail-based sampling
# to keep 100% of traces with any ERROR span. Costs more, pays for itself.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "python",
      caption: "Distributed lock with Redis + fencing token — the safe pattern",
      code: `import redis, uuid

r = redis.Redis()

def acquire(name: str, ttl: int = 10):
    """Returns (lock_value, fencing_token) or None if not acquired.
    Uses SET NX PX (atomic); a monotonic counter provides fencing."""
    token = uuid.uuid4().hex
    if r.set(f"lock:{name}", token, nx=True, px=ttl * 1000):
        # Fencing token: monotonic counter stored separately.
        # Every write to the protected resource MUST include this token;
        # the resource rejects tokens older than the latest seen.
        fencing = r.incr(f"fence:{name}")
        return token, fencing
    return None

def release(name: str, token: str) -> None:
    """Release only if we still own it (prevents releasing someone else's
    lock after our TTL expired). Must be atomic — use Lua, not get-then-del."""
    lua = """
    if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
    else
        return 0
    end
    """
    r.eval(lua, 1, f"lock:{name}", token)

# Why fencing? If holder A pauses (GC) past TTL, B acquires. A resumes
# and writes; B is already writing. Without fencing, you corrupt state.
# The resource (e.g., storage service) rejects A's writes using the token.`,
    },
    {
      caption: "Raft leader election — quorum-based, no split brain",
      code: `Raft: a quorum-based consensus algorithm. N nodes, tolerate (N-1)/2 failures.

States: follower -> candidate -> leader
  - All start as followers. If no heartbeat within election timeout,
    follower increments term, becomes candidate, votes for self,
    sends RequestVote RPCs to peers.
  - If candidate gets majority (N/2 + 1) votes -> becomes leader.
  - Leader sends AppendEntries heartbeats every ~50ms; followers reset
    election timeout. No heartbeat -> new election.

Why this is split-brain-proof:
  - Two candidates can't both get majority; with 5 nodes, 3 votes needed,
    only one candidate can collect 3.
  - During partition: side with quorum elects a leader; minority side
    cannot commit writes (no majority acks).

Term numbers prevent stale leaders:
  - If a node sees a higher term, it immediately steps down to follower.
  - Old leader writing to partitioned minority sees higher-term response,
    steps down. No two leaders in the same term.

Quorum math:
  - N=3, tolerate 1 failure
  - N=5, tolerate 2 failures
  - N=7, tolerate 3 failures
  - Always use ODD N — even N adds no failure tolerance (N=4 also tolerates 1).`,
    },
    {
      caption: "Quorum reads/writes — the R + W > N invariant",
      code: `For N replicas, choose R (read quorum) and W (write quorum) such that
R + W > N. Then any read overlaps any write — at least one replica
in the read set has the latest value.

Common configurations (N=3):
  Strong:      R=2, W=2  ->  R+W=4 > 3. Reads see latest committed write.
  Write-heavy: R=1, W=3  ->  R+W=4 > 3. Fast reads, slow writes, no stale reads.
  Read-heavy:  R=3, W=1  ->  R+W=4 > 3. Fast writes, slow reads.
  Eventual:    R=1, W=1  ->  R+W=2 < 3. May return stale data; fastest.

Cassandra/Dynamo let you tune R and W per query:
  consistency ONE     — R=1 or W=1 (eventual)
  consistency QUORUM  — R = N/2+1, W = N/2+1
  consistency ALL     — R=N, W=N (block until all replicas ack)

W = N gives strong writes but no availability during a partition (CP).
W = 1 gives availability but no consistency (AP). CAP is the consequence.`,
    },
    {
      lang: "python",
      caption: "Vector clocks — detect concurrent writes without wall-clock time",
      code: `from dataclasses import dataclass, field

@dataclass
class VClock:
    """Maps node_id -> counter. Increment on local write, merge on read."""
    clocks: dict = field(default_factory=dict)

    def increment(self, node: str) -> None:
        self.clocks[node] = self.clocks.get(node, 0) + 1

    def merge(self, other: "VClock") -> None:
        for k, v in other.clocks.items():
            self.clocks[k] = max(self.clocks.get(k, 0), v)

    def compare(self, other: "VClock") -> str:
        """Returns 'before', 'after', 'equal', or 'concurrent'."""
        a_le_b = all(self.clocks.get(k, 0) <= v for k, v in other.clocks.items())
        b_le_a = all(other.clocks.get(k, 0) <= v for k, v in self.clocks.items())
        if a_le_b and b_le_a: return "equal"
        if a_le_b: return "before"
        if b_le_a: return "after"
        return "concurrent"

# Two clients both write to key K while partitioned -> vector clocks
# reveal 'concurrent' -> application resolves (last-writer-wins with
# wall clock, or human merge, or sibling values like Riak).`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Little's Law (L = lambda * W) is the single most useful formula: avg concurrency = throughput * latency. 1000 rps * 200ms = 200 in-flight requests — size thread pools and queues from this.", tag: "complexity" },
    { fact: "Amdahl's Law caps parallel speedup: 10% serial work limits speedup to 10x regardless of core count. Find the serial fraction before adding hardware.", tag: "complexity" },
    { fact: "Universal Scalability Law (Gunther): throughput = lambdaN / (1 + alpha(N-1) + betaN(N-1)). Contention (alpha) and coherence (beta) hurt; beta makes large clusters slower than small ones.", tag: "complexity" },
    { fact: "p99 is dominated by tail effects; the slowest 1% often comes from GC pauses, lock contention, or a single hot replica. Optimize the tail, not the mean.", tag: "perf" },
    { fact: "Connection setup cost: TCP handshake 1 RTT + TLS 1.3 1 RTT = 2 RTT minimum. Cross-region (~80ms RTT) = 160ms before first byte of app data. Connection pooling amortizes this.", tag: "perf" },
    { fact: "Cache hit ratio needed for 10x effective capacity: ~90%. Below that, the cache is overhead without payoff; above 99%, you optimize for diminishing returns.", tag: "perf" },
    { fact: "DB connection cost: ~5-10MB RAM per connection (Postgres default). 1000 connections = 5-10GB just for state. PgBouncer pools at 100s of connections per backend.", tag: "perf" },
    { fact: "SSD random 4K reads: 100K IOPS SATA, 500K-1M NVMe. Sequential reads are 5-10x faster. Index design lives or dies on random vs sequential access patterns.", tag: "perf" },
    { fact: "Memory hierarchy latency: L1 ~1ns, L2 ~4ns, L3 ~12ns, DRAM ~100ns, SSD ~100us, HDD ~10ms, network cross-AZ ~1ms. Each step is ~10x slower.", tag: "perf" },
    { fact: "Network latency floors: same AZ ~0.5ms, cross-AZ ~1-2ms, cross-region ~30-100ms, intercontinental ~150-300ms RTT. Architectures that assume 'network is fast' break at intercontinental scale.", tag: "perf" },
    { fact: "Back-of-envelope: 1KB * 1M rps = 1 GB/s = saturates a 10Gbps NIC. Payload size is the silent killer at scale.", tag: "perf" },
    { fact: "Service mesh sidecar (Istio/Linkerd) adds ~1-2ms latency per hop and ~50MB RAM per pod. Budget for it; don't add a mesh to fix what config can.", tag: "perf" },
    { fact: "Compression trade: gzip on JSON saves 70-80% bandwidth at ~1ms CPU/MB. Snappy/lz4 are 10x faster but only 50-60% ratio. Use snappy for hot paths, gzip for cold.", tag: "perf" },
    { fact: "GC pause: G1 keeps <200ms up to ~32GB heap; ZGC keeps <1ms up to 16TB. Tune for tail, not mean. Go's GC stays <1ms for small heaps but STW grows with live data.", tag: "perf" },
    { fact: "Lock contention is multiplicative: throughput drops as 1/(1 + contention * cores). A 1% critical section halves throughput on 100 cores.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Envoy", purpose: "L7 proxy with first-class xDS dynamic config; the data plane of Istio and many API gateways.", url: "https://www.envoyproxy.io/", category: "build" },
    { tool: "HAProxy", purpose: "Battle-tested L4/L7 load balancer; still the highest-throughput option for TCP/HTTP termination.", url: "https://www.haproxy.org/", category: "build" },
    { tool: "nginx", purpose: "L7 reverse proxy, CDN origin, ingress controller. Most-deployed web server on the planet.", url: "https://nginx.org/", category: "build" },
    { tool: "Redis", purpose: "In-memory data structure store — cache, pub/sub, streams, distributed locks (with Redlock caveat).", url: "https://redis.io/", category: "build" },
    { tool: "Kafka", purpose: "Distributed append-only log — event streaming backbone, WAL for DBs, async backbone for microservices.", url: "https://kafka.apache.org/", category: "build" },
    { tool: "PostgreSQL", purpose: "OLTP RDBMS with the richest feature set of any open-source DB — JSON, GIS, full-text, logical replication.", url: "https://www.postgresql.org/", category: "build" },
    { tool: "Cassandra", purpose: "Wide-column store tuned for write-heavy, multi-region workloads; tunable consistency; no single point of failure.", url: "https://cassandra.apache.org/", category: "build" },
    { tool: "etcd", purpose: "Raft-based KV store; metadata backbone for Kubernetes and many distributed systems.", url: "https://etcd.io/", category: "build" },
    { tool: "Consul", purpose: "Service discovery + KV + health checking; service-mesh data plane via Consul Connect.", url: "https://developer.hashicorp.com/consul", category: "build" },
    { tool: "Zookeeper", purpose: "Older coordination service (Zab protocol); still used by Kafka for metadata in pre-KRaft deployments.", url: "https://zookeeper.apache.org/", category: "build" },
    { tool: "Linkerd", purpose: "Lighter-weight service mesh than Istio; Rust data plane (Linkerd2-proxy), CNCF graduated.", url: "https://linkerd.io/", category: "build" },
    { tool: "Istio", purpose: "Full-featured service mesh on Envoy; mTLS, traffic shifting, authz. Heavier than Linkerd — only adopt at scale.", url: "https://istio.io/", category: "build" },
    { tool: "Prometheus", purpose: "Pull-based metrics DB + query language (PromQL). The de facto standard for k8s-native monitoring.", url: "https://prometheus.io/", category: "debug" },
    { tool: "Grafana", purpose: "Dashboarding + alerting over Prometheus/Loki/Tempo/any datasource. The visual layer for observability.", url: "https://grafana.com/", category: "debug" },
    { tool: "OpenTelemetry", purpose: "Vendor-neutral standard for traces, metrics, logs. Replaces Jaeger/Zipkin clients with one SDK.", url: "https://opentelemetry.io/", category: "debug" },
    { tool: "Jaeger", purpose: "Distributed tracing backend (CNCF). UI for inspecting spans across services.", url: "https://www.jaegertracing.io/", category: "debug" },
    { tool: "Vault", purpose: "Secrets management with dynamic secrets, leasing, audit. The standard for non-cloud secret storage.", url: "https://developer.hashicorp.com/vault", category: "deploy" },
    { tool: "CockroachDB", purpose: "Distributed SQL with Postgres wire protocol; horizontally scalable, strongly consistent (Raft).", url: "https://www.cockroachlabs.com/", category: "build" },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Design a URL shortener (Bitly).", a: "Two endpoints: POST /shorten(long_url) -> short_id; GET /:id -> 301 redirect. IDs: base62 encoding of an auto-increment or Snowflake ID (~62^7 = 3.5T IDs). Storage: KV store (DynamoDB/Cassandra) keyed by short_id with long_url + created_at + user_id; ~100 bytes/record, ~10B records = 1TB. Read-heavy (100:1 read/write) -> cache hot URLs in Redis with TTL. Latency: <50ms p99 via CDN edge redirect for popular URLs. Availability: AP — eventual consistency on click counts is fine; redirect must never fail.", difficulty: "medium" },
    { q: "Explain CAP and what you'd choose for a payments system vs a social feed.", a: "CAP: during a network partition you choose C or A. Payments: CP — refusing a write is better than double-charging; use Raft-quorum Postgres/CockroachDB, accept downtime during partition. Social feed: AP — eventual consistency on likes/comments is acceptable; Cassandra/DynamoDB with tunable consistency; reads may be stale but the system stays up. The 'P' is non-negotiable — networks WILL partition.", difficulty: "easy" },
    { q: "How would you design Twitter's timeline? Pull, push, or hybrid?", a: "Push (fanout-on-write): on tweet, write to all followers' timeline caches. O(followers) writes per tweet — fails for celebrities with 50M followers. Pull (fanout-on-read): on timeline view, fetch+merge tweets from all followees — slow at 1000 followees. Hybrid: pull for celebrities (>10K followers), push for normal users. Pre-compute top-N for active users; fall back to live merge for deep scroll. Cache 99% of reads in Redis.", difficulty: "hard" },
    { q: "Design a rate limiter. Token bucket vs leaky bucket vs sliding window.", a: "Token bucket: N tokens + R/sec refill; allows bursts up to N. Leaky bucket: smooths to constant rate, no bursts. Sliding window: counter per minute-bucket + previous-bucket weight; precise but memory-heavy. For per-user API limits, token bucket in Redis with Lua (atomic check+decrement). For distributed, use a shard key (user_id) so all requests for one user hit one Redis shard. 429 with Retry-After header.", difficulty: "medium" },
    { q: "How do you prevent cache stampedes?", a: "Three options: (1) Single-flight / request coalescing — only one request rebuilds the cache, others block on the future. (2) Lock with TTL — first miss acquires lock, others return stale or wait. (3) Probabilistic early expiration (XFetch) — readers stochastically refresh before TTL expiry, weighted by staleness budget. Netflix uses XFetch. Always pair with a sensible TTL — infinite cache = silent staleness.", difficulty: "medium" },
    { q: "When would you choose Kafka vs RabbitMQ?", a: "Kafka: append-only log, replayable, high throughput (1M+ msgs/sec/partition), consumers track their own offset. Use for event streaming, audit log, WAL, async backbones. RabbitMQ: classic AMQP queue, message ack, routing/exchanges, lower throughput but flexible routing. Use for task queues (Celery), request/reply, low-latency fanout. Choose by replay-need: if you must replay history, Kafka; if fire-and-forget, RabbitMQ.", difficulty: "medium" },
    { q: "What's an idempotency key and why does it matter for payments?", a: "Client sends Idempotency-Key (UUID) on every POST. Server stores (key, user_id) -> response in Redis for 24h. On retry, server returns cached response instead of re-charging. Critical for payments: networks retry, clients retry on timeout — without idempotency, a single user click can charge 5x. Pair with a short-lived lock to prevent concurrent same-key requests from different replicas.", difficulty: "easy" },
    { q: "Design a distributed rate limiter that survives node failure.", a: "Single-node rate limit dies with the node. Options: (1) Redis token bucket with Lua (atomic) — single point of failure, but Redis Cluster or Sentinel for HA. (2) Shard by user_id so one node owns a user's counter — fast but needs consistent hashing + resharding. (3) Approximate with local counters + periodic sync — eventually consistent, allows small overages. Production choice: Redis Cluster with token bucket Lua; fail-open on Redis outage (better to allow excess than block all traffic).", difficulty: "hard" },
    { q: "Why is two-phase commit (2PC) rarely used in practice?", a: "2PC: coordinator prepares all participants, then commits. Problems: (1) Blocking — if coordinator dies during prepare, participants hold locks forever. (2) Slow — every commit takes 2 RTT + fsync. (3) Not partition-tolerant — any participant partition blocks the whole tx. Modern alternatives: Saga (compensating transactions, eventual consistency), Raft-based consensus (CockroachDB, Spanner), or simply avoiding distributed transactions by aggregating data per service.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Microservices", whenThis: "Monolith first — single deploy unit, in-process calls, simple ops, until team size or deploy cadence forces splitting.", whenThat: "Multiple teams shipping independently, polyglot stacks needed, services have very different scaling profiles." },
    { vs: "Strong consistency (CP)", whenThis: "Eventual consistency — when stale reads are tolerable (social, likes, recommendations) and availability matters more.", whenThat: "Financial transactions, inventory, anywhere stale reads cause incorrect behavior or money loss." },
    { vs: "Kafka", whenThis: "RabbitMQ when you need classic task queues, request/reply, complex routing, low-latency fanout — message ack and discard.", whenThat: "Event streaming, audit log, replayable history, async backbone at high throughput." },
    { vs: "Memcached", whenThis: "Redis when you need data structures (lists, sets, sorted sets), persistence, pub/sub, Lua scripts, or streams.", whenThat: "Pure KV cache, maximum raw throughput, lowest memory overhead — no persistence, no advanced types." },
    { vs: "gRPC", whenThis: "REST/HTTP when you need browser clients, human-readable payloads, CDN caching, or broad ecosystem tooling.", whenThat: "Internal service-to-service with strict schemas, bidirectional streaming, low payload overhead via protobuf." },
  ],
};

export default sheet;
