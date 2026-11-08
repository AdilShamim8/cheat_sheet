import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "postgresql",
  name: "PostgreSQL",
  category: "topics",
  tier: "topic",
  tags: ["database", "sql", "relational", "acid", "mvcc", "jsonb", "extension"],
  tagline: "The advanced open-source relational database — MVCC, rich types, and the engine behind everything from SaaS to analytics.",
  year: 1996,
  author: "PostgreSQL Global Development Group",
  lastUpdated: "2026-11",
  readingTime: 30,

  tldr: [
    "PostgreSQL is an ACID-compliant relational database with MVCC concurrency, transactional DDL, extensible types (JSONB, arrays, ranges, geometry via PostGIS), and a uniquely honest SQL implementation — features rarely lie about semantics.",
    "It is the default new-project database for most of the industry: #4 overall and #1 among non-commercial engines on DB-Engines (Nov 2026), the default on every major cloud, and the storage layer for Supabase/Neon-style platforms.",
    "Reach for it whenever you need relational integrity plus flexibility — JSONB covers document shapes, extensions cover search (pg_trgm/pgvector), and partitioning covers time-series at serious scale.",
    "Know its limits: single-node write scaling (use partitioning/sharding via Citus or app-level), aggressive VACUUM behavior under heavy UPDATE churn, and connection counts that need PgBouncer in almost every deployment.",
  ],

  mentalModel: {
    title: "MVCC: writers never block readers, and every row has hidden versions",
    body: "Every transaction gets a snapshot: your query sees the database as of the moment it started, regardless of concurrent writes — no read locks. Writes create new row versions (xmin/xmax system columns) rather than overwriting in place; dead versions accumulate until VACUUM reclaims them. This one model explains: why long transactions bloat tables and freeze everyone's cleanup, why UPDATE-heavy workloads need tuning, why REPEATABLE READ behaves differently than MySQL's, and why count(*) can be slow (it must check visibility, not just walk the index). Everything in Postgres tuning flows from MVCC: keep transactions short, watch bloat, give autovacuum room to work.",
  },

  constructs: [
    { syntax: "CREATE TABLE t (...) PARTITION BY RANGE (created_at)", behavior: "Declarative partitioning — planner routes queries to relevant partitions.", when: "Time-series and append-heavy tables >100GB; pair with pg_partman for automated creation." },
    { syntax: "INSERT ... ON CONFLICT (id) DO UPDATE SET ...", behavior: "Atomic upsert — conflict target must match a unique index.", when: "Idempotent ingestion, sync jobs. 'DO NOTHING' for skip semantics." },
    { syntax: "SELECT ... FOR UPDATE SKIP LOCKED", behavior: "Row lock that skips currently-locked rows instead of waiting.", when: "Job queues in the DB — competing workers claim distinct rows without blocking." },
    { syntax: "WITH cte AS (...) INSERT/UPDATE/DELETE ... RETURNING *", behavior: "CTEs are writable; RETURNING gives affected rows back — no second query.", when: "Move-and-transform pipelines: archive rows, then insert from the RETURNING set." },
    { syntax: "jsonb column + GIN index", behavior: "Binary JSON with indexed containment (@>) queries.", when: "Semi-structured payloads, API responses, flexible attributes alongside fixed columns." },
    { syntax: "CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)", behavior: "pgvector approximate-nearest-neighbor index (HNSW/IVFFlat).", when: "Vector search / RAG retrieval — the 2024+ default for embedding lookup." },
    { syntax: "MATERIALIZED VIEW ... REFRESH MATERIALIZED VIEW CONCURRENTLY", behavior: "Persisted query result, refreshable without an exclusive lock.", when: "Expensive aggregates read often, computed periodically." },
    { syntax: "LISTEN / NOTIFY", behavior: "Lightweight pub/sub pushed to connected sessions.", when: "Cache invalidation, wake-up signals. Payload ≤8KB, no persistence." },
    { syntax: "GENERATED ALWAYS AS (...) STORED", behavior: "Computed column persisted on write — virtual (not stored) arrived in PG18.", when: "Derived fields (normalized totals, hashes) always consistent." },
    { syntax: "CREATE POLICY ... USING (...) WITH CHECK (...)", behavior: "Row-level security: per-row visibility and write predicates.", when: "Multi-tenant SaaS where the DB, not the app, enforces isolation." },
  ],

  patterns: [
    {
      lang: "sql",
      caption: "Keyset pagination — the only pagination that scales",
      code: `-- OFFSET 100000 scans and discards 100k rows every request. Don't.
-- Keyset (seek) pagination: WHERE on the sort key, O(log n) per page.
SELECT id, created_at, title
FROM posts
WHERE (created_at, id) < ($1, $2)     -- last row of previous page
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- Composite index makes it an index range scan:
CREATE INDEX posts_page_idx ON posts (created_at DESC, id DESC);

-- Total counts for UI (approximate is fine above ~10k):
SELECT reltuples::bigint AS approx_rows FROM pg_class WHERE relname = 'posts';
-- Exact counts for small tables only:
SELECT count(*) FROM posts WHERE tenant_id = $1;`,
    },
    {
      lang: "sql",
      caption: "DB-backed job queue with SKIP LOCKED",
      code: `CREATE TABLE jobs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text NOT NULL,
  payload     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  run_at      timestamptz NOT NULL DEFAULT now(),
  attempts    int  NOT NULL DEFAULT 0,
  locked_by   text,
  locked_at   timestamptz
);

CREATE INDEX jobs_pending_idx ON jobs (run_at) WHERE status = 'pending';

-- Workers claim batches atomically; SKIP LOCKED means no contention
WITH claimed AS (
  SELECT id FROM jobs
  WHERE status = 'pending' AND run_at <= now()
  ORDER BY run_at
  FOR UPDATE SKIP LOCKED
  LIMIT 10
)
UPDATE jobs j
SET status = 'running', attempts = attempts + 1,
    locked_by = $worker, locked_at = now()
FROM claimed
WHERE j.id = claimed.id
RETURNING j.id, j.kind, j.payload;

-- Requeue stale jobs (worker died mid-flight):
UPDATE jobs SET status = 'pending', locked_by = NULL
WHERE status = 'running' AND locked_at < now() - interval '5 minutes';`,
    },
    {
      lang: "sql",
      caption: "Multi-tenant isolation with row-level security",
      code: `ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;   -- even for table owner

CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant')::uuid);

-- App sets the tenant per connection/transaction:
SET LOCAL app.tenant = '0192f3a1-...';   -- inside a transaction
SELECT * FROM invoices;                   -- only that tenant's rows

-- Connection pooler note: SET LOCAL (not SET) + transaction pooling
-- keeps tenants from leaking across pooled connections.`,
    },
    {
      lang: "sql",
      caption: "Upsert, sync, and change-capture shapes",
      code: `-- Idempotent daily sync: insert new, update changed, in one statement
INSERT INTO products_staging AS s (sku, name, price, updated_at)
SELECT sku, name, price, now() FROM incoming_feed i
ON CONFLICT (sku) DO UPDATE
SET name = i.name, price = i.price, updated_at = now()
WHERE (s.name, s.price) IS DISTINCT FROM (i.name, i.price);  -- skip no-op writes

-- Move rows to archive with RETURNING (no re-read):
WITH moved AS (
  DELETE FROM events
  WHERE created_at < now() - interval '90 days'
  RETURNING *
)
INSERT INTO events_archive SELECT * FROM moved;

-- Logical replication slot for CDC consumers (Debezium):
SELECT pg_create_logical_replication_slot('cdc_app', 'pgoutput');`,
    },
    {
      lang: "sql",
      caption: "JSONB done right: index + containment",
      code: `CREATE TABLE docs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body jsonb NOT NULL
);

-- GIN index turns @> containment into index lookups
CREATE INDEX docs_body_gin ON docs USING gin (body jsonb_path_ops);

-- Fast: "any event with type=click and browser=firefox"
SELECT * FROM docs WHERE body @> '{"type":"click","browser":"firefox"}';

-- JSONPath for richer queries (PG12+)
SELECT * FROM docs
WHERE body @@ '$.meta.tags[*] == "prod"';

-- Extract typed values; jsonb (binary) not json (text) for storage
SELECT body->>'type', (body->'latency')::int FROM docs;

-- Don't: body->>'x' = 'y' with btree — works but GIN @> scales;
-- don't store what you query as text JSON; don't nest 10 levels deep
-- (JSONB flattens object keys — arrays keep order).`,
    },
  ],

  pitfalls: [
    { title: "Running PG18 features on older clients", symptom: "Virtual generated columns or OAuth auth fail on drivers predating PG18 protocol features.", fix: "Upgrade client libraries (libpq/psqlODBC) with the server; check driver release notes for PG18 support before enabling new features." },
    { title: "Long-running transactions wreck VACUUUM", symptom: "Table and index bloat grow, queries slow down, 'oldest running xact' in pg_stat_activity shows hours-old transactions.", fix: "Every transaction pins a snapshot: dead rows created after it can't be cleaned. Keep transactions milliseconds-to-seconds; never hold a transaction open across user think-time or batch loops. Monitor pg_stat_activity state='idle in transaction' and set idle_in_transaction_session_timeout." },
    { title: "OFFSET pagination degrades linearly", symptom: "Page 10000 of the admin list takes seconds — the engine scans and throws away everything before the offset.", fix: "Keyset pagination on (sort_key, id) with a matching composite index. Keep OFFSET only for tiny UI pages. Use reltuples or a filtered count when the UI needs totals." },
    { title: "Opening a connection per request", symptom: "'too many clients already' at a few hundred concurrent requests; connection setup latency dominates.", fix: "Each backend is a process (~5-10MB). Front Postgres with PgBouncer in transaction mode; size pool to cores, not clients. Beware session state (SET, prepared statements) under transaction pooling — use SET LOCAL." },
    { title: "count(*) on huge tables for UI totals", symptom: "Exact counts over millions of rows take seconds on every page view.", fix: "It must check row visibility — that's the price of MVCC. Use approximations (pg_class.reltuples), cached counters (triggers maintaining a totals table), or filtered counts scoped to what the user actually sees." },
    { title: "UPDATE-heavy workloads bloat tables and indexes", symptom: "Table size balloons past live data; seq scans slow; autovacuum can't keep up.", fix: "Update the fewest columns you need (HOT updates avoid index churn when indexed columns aren't touched), consider fillfactor < 100 for hot tables, monitor pg_stat_user_tables.n_dead_tup ratio, and batch+throttle massive UPDATE/DELETE jobs." },
    { title: "NULL semantics surprise in queries and constraints", symptom: "WHERE col != 'x' misses NULLs; unique constraints allow multiple NULLs; NOT IN with a NULL subquery returns zero rows.", fix: "NULL is 'unknown', not a value: use IS DISTINCT FROM for equality-safe compares, COALESCE at boundaries, explicit NOT NULL on columns that shouldn't be absent. UNIQUE NULLS DISTINCT/NOT DISTINCT (PG15+) controls the multi-NULL behavior." },
    { title: "Default autovacuum settings under-tuned for write-heavy tables", symptom: "Dead tuples hover high on big tables; wraparound pressure warnings on aging databases.", fix: "Per-table tuning: autovacuum_vacuum_scale_factor=0.01 or lower on big hot tables (default 0.2 means 20% waste before vacuum triggers), more autovacuum workers, monitor wraparound (datfrozenxid). Run manual VACUUM ANALYZE after bulk loads — it's not only for emergencies." },
    { title: "Sequential scans from function-wrapped predicates", symptom: "WHERE LOWER(email) = ... or WHERE col::text = ... ignores the index; EXPLAIN shows Seq Scan.", fix: "Wrap the column, not the index: functional index on the exact expression (CREATE INDEX ON t (lower(email))), or use citext for case-insensitive text. Rule: the predicate must match the indexed expression verbatim." },
  ],

  quickReference: [
    { fact: "Learning path: official tutorial → EXPLAIN (ANALYZE, BUFFERS) drills → pg_stat_statements → CKA-style ops drills (backup/restore with pgbackrest).", tag: "learning" },
    { fact: "Current: PostgreSQL 18 (Sep 2025; 18.6 security release Aug 2026) — async I/O for heap scans, virtual generated columns, OAuth SASL auth. PG19 at RC (Oct 2026).", tag: "version" },
    { fact: "DB-Engines Nov 2026: #4 overall (689.7 score), #1 open-source non-commercial engine; the default choice in new architectures across every cloud.", tag: "usage" },
    { fact: "MVCC snapshot isolation is the default (READ COMMITTED per-statement snapshots; REPEATABLE READ = snapshot per transaction, no phantom reads).", tag: "isolation" },
    { fact: "EXPLAIN (ANALYZE, BUFFERS) is ground truth — plan + real timings + I/O. pg_stat_statements finds your slowest queries by total time.", tag: "tuning" },
    { fact: "Parallel queries exist (PG9.6+) but write queries and many CTEs are still single-threaded; parallelism needs work_mem and tables above min_parallel_table_size.", tag: "parallel" },
    { fact: "Index types: B-tree (default), GIN (jsonb/full-text/arrays), GiST (geometry, exclusion), BRIN (huge append-only time series), hash, SP-GiST, HNSW/IVFFlat (pgvector).", tag: "index" },
    { fact: "TOAST compresses/stores big values out-of-line automatically — >2KB values; jsonb and text benefit without action.", tag: "storage" },
    { fact: "Logical replication (pgoutput) streams row changes to consumers — the basis for CDC, zero-downtime upgrades, and read-replica fan-out.", tag: "replication" },
    { fact: "Extension ecosystem is the moat: PostGIS (geo), pgvector (embeddings), pg_trgm (fuzzy search), TimescaleDB (time-series), Citus (sharding), pg_stat_statements (must-have).", tag: "extensions" },
    { fact: "Connection model: one OS process per connection — hence PgBouncer; max_connections defaults to 100 and raising it naively usually makes things worse.", tag: "ops" },
    { fact: "Prepared statements shine only for repeated complex plans (custom/generic plan switch after 5 runs); watch for plan pollution under skewed data.", tag: "perf" },
    { fact: "pg_dump is logical, single-threaded (use -j for directory format); PG17+ supports parallel dumps; physical backup (pg_basebackup) + WAL archiving is the HA/restore backbone.", tag: "backup" },
    { fact: "Fillfactor, work_mem (per sort node!), effective_cache_size, and random_page_cost on SSDs are the four settings that most often fix real performance complaints.", tag: "tuning" },
  ],

  goDeeper: [
    { title: "PostgreSQL Official Documentation", url: "https://www.postgresql.org/docs/current/", note: "The best docs in the database world — read the MVCC, indexing, and EXPLAIN chapters end-to-end once a year." },
    { title: "Use The Index, Luke!", url: "https://use-the-index-luke.com/", note: "SQL indexing tutorial that happens to use Postgres syntax — fixes the mental model around B-tree traversal." },
    { title: "pganalyze blog & EXPLAIN visualizer", url: "https://pganalyze.com/", note: "Practical tuning content plus a paste-your-plan visualizer for review." },
    { title: "Planet PostgreSQL", url: "https://planet.postgresql.org/", note: "Aggregated community blogs — release engineering details and war stories as they happen." },
    { title: "The Art of PostgreSQL", url: "https://theartofpostgresql.com/", note: "Book by Dimitri Fontaine — application-side SQL patterns (Hacker News favorite for query design)." },
  ],

  // ─── §8 "Data types" — the type system is the product ─────────────────────
  dataTypes: {
    primitives: [
      { syntax: "int / bigint / smallint", behavior: "Exact integers; bigint is the safe default for IDs at scale ( GENERATED ... AS IDENTITY).", when: "Counts, keys, math where precision matters. int caps at 2.1B — use bigint for anything that grows." },
      { syntax: "numeric / decimal", behavior: "Arbitrary-precision exact numbers — the ONLY type for money.", when: "Money, rates, anything requiring exact decimal representation. Slower than float; correct where it counts." },
      { syntax: "double precision / real", behavior: "IEEE floats — inexact by design.", when: "Scientific/statistical work where binary float error is acceptable. Never money." },
      { syntax: "text / varchar(n)", behavior: "Identical storage/performance; varchar length is a constraint, not an optimization.", when: "Default to text; use varchar(n) only for domain constraints (postal codes, ISO codes)." },
      { syntax: "timestamptz", behavior: "Stores UTC instant; renders per session TimeZone.", when: "Everything wall-clock. Use date for pure dates, interval for durations, never 'string timestamps'." },
      { syntax: "uuid", behavior: "128-bit random identifiers — v4 or v7 (PG18 has uuidv7()).", when: "Non-guessable, generation-order-tolerant IDs across services; v7 keeps B-tree locality." },
      { syntax: "boolean / bytea / enum", behavior: "true/false, raw bytes, ordered static enums.", when: "Flags, binary blobs (prefer object storage), closed sets (use lookup tables when values evolve)." },
    ],
    collections: [
      { syntax: "jsonb", behavior: "Binary JSON: indexed containment (@>), JSONPath, TOASTed; key order lost, duplicates collapsed.", when: "Semi-structured columns beside fixed ones — the 'Postgres also does documents' story." },
      { syntax: "text[] / int[]", behavior: "True arrays with GIN indexing and contains (@>).", when: "Tags, role lists. Normalization still wins for heavy relational use of the elements." },
      { syntax: "int4range / tstzrange", behavior: "Range types with operators (&& overlap, @> contains) and GiST exclusion constraints.", when: "Scheduling, reservations, validity periods — exclusion constraints prevent overlapping bookings in one index." },
      { syntax: "TABLE t (...) — table types", behavior: "Tables and rows are first-class values in functions (RETURNS TABLE, %ROWTYPE).", when: "Set-returning functions, migration scripts, lateral joins against generated rows." },
    ],
    custom: [
      { syntax: "CREATE TYPE ... AS ENUM", behavior: "4-byte ordered enum; renaming values works, deleting doesn't (PG pre-10 semantics persist).", when: "Closed sets: status fields. Prefer lookup tables when values change often." },
      { syntax: "CREATE DOMAIN email_t AS text CHECK (...)", behavior: "Named constraint over a base type — reusable in any column.", when: "Cross-table field contracts (emails, tickers) without full types." },
      { syntax: "CREATE TYPE complex_t AS (re float, im float)", behavior: "Composite type — row as a value.", when: "Function signatures, returning structured results, typed JSON output via to_json()." },
      { syntax: "CREATE EXTENSION vector / postgis / ...", behavior: "Extension types plug into indexing and functions.", when: "pgvector embeddings for RAG; PostGIS geometry; hstore legacy docs." },
      { syntax: "GENERATED ... AS IDENTITY", behavior: "SQL-standard autoincrement replacing serial.", when: "All new tables. serial is legacy with ownership quirks underALTER." },
    ],
  },

  // ─── §9 Operators & expressions ───────────────────────────────────────────
  operators: [
    { syntax: "@> / <@ / ?", behavior: "jsonb containment and key-exists — GIN-indexable.", when: "The fast path for JSONB filtering; equality on whole docs is rare." },
    { syntax: "&& (overlap) / || (concat)", behavior: "Array/set operators; ranges use && for overlap.", when: "Tag matching, range scheduling predicates." },
    { syntax: "IS DISTINCT FROM / IS NOT DISTINCT FROM", behavior: "NULL-safe (in)equality — treats NULL as a comparable value.", when: "Upsert-change detection, filters where NULL must match. != never matches NULL." },
    { syntax: "~ / ~* / !~", behavior: "POSIX regex match (case-sensitive/insensitive/negated).", when: "Ad-hoc patterns. For indexed prefix search use text_pattern_ops or pg_trgm." },
    { syntax: "% / <-> (pg_trgm / PostGIS)", behavior: "Trigram similarity / geometry distance — GiST-indexable KNN.", when: "Fuzzy search, 'nearest' queries — ORDER BY col <-> point LIMIT k uses the index." },
    { syntax: "|| (string/array/jsonb concat)", behavior: "Overloaded concat — type-driven.", when: "Building JSONB (merge), arrays, strings. jsonb || jsonb is a shallow merge." },
  ],

  // ─── §10 Input / output (getting data in and out) ─────────────────────────
  inputOutput: [
    {
      lang: "sql",
      caption: "COPY: the fast path in and out",
      code: `-- COPY beats multi-row INSERT by 5-20x (no per-statement overhead)
COPY events (id, kind, payload, created_at)
FROM '/data/events.csv' WITH (FORMAT csv, HEADER true);

-- From a client stream (libpq \copy; every driver exposes it):
-- \copy events FROM 'local.csv' CSV HEADER

-- Export a query:
COPY (SELECT * FROM events WHERE created_at >= now()-'1 day'::interval)
TO '/data/today.csv' WITH (FORMAT csv, HEADER true);

-- Post-copy ritual: ANALYZE refreshes planner stats immediately
ANALYZE events;`,
    },
    {
      lang: "sql",
      caption: "Foreign data wrappers: query anything",
      code: `CREATE EXTENSION postgres_fdw;
CREATE SERVER stripe FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'read-replica.stripe-internal', dbname 'app');
CREATE FOREIGN TABLE stripe_invoices (...) SERVER stripe;

-- Other FDWs: file_fdw (CSV logs), parquet_fdw (data lake),
-- www_fdw (REST). Query them with plain SQL + joins.`,
    },
    {
      lang: "sql",
      caption: "CSV/JSON report generation in SQL",
      code: `-- JSON aggregation for API-shaped output
SELECT jsonb_build_object(
  'tenant',  t.name,
  'mrr',     t.mrr,
  'invoices', COALESCE(jsonb_agg(
                 jsonb_build_object('id', i.id, 'amount', i.amount)
                 ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]')
) AS payload
FROM tenants t LEFT JOIN invoices i ON i.tenant_id = t.id
GROUP BY t.id;

-- CSV straight from psql:
-- \copy (SELECT ...) TO 'report.csv' CSV HEADER`,
    },
  ],

  // ─── §11 Loops & iteration (set-based thinking) ───────────────────────────
  loops: [
    {
      lang: "sql",
      caption: "LATERAL: the loop of SQL",
      code: `-- 'For each customer, their 3 latest orders' — one query, no N+1
SELECT c.id, o.id AS order_id, o.total
FROM customers c
LEFT JOIN LATERAL (
  SELECT id, total FROM orders
  WHERE customer_id = c.id
  ORDER BY created_at DESC
  LIMIT 3
) o ON true;

-- generate_series: iterate without a table
SELECT d::date AS day,
       (SELECT count(*) FROM events e
        WHERE e.created_at >= d AND e.created_at < d + 1)
FROM generate_series(now()-'29 days'::interval, now(), '1 day') d;

-- WITH RECURSIVE: graph/tree traversal
WITH RECURSIVE tree AS (
  SELECT id, parent_id, 1 AS depth FROM nodes WHERE parent_id IS NULL
  UNION ALL
  SELECT n.id, n.parent_id, t.depth + 1
  FROM nodes n JOIN tree t ON n.parent_id = t.id
)
SELECT * FROM tree;`,
    },
    {
      lang: "sql",
      caption: "Window functions: aggregation without collapsing",
      code: `-- Per-group running totals and ranks — the daily-bread of analytics
SELECT
  tenant_id,
  created_at::date AS day,
  amount,
  SUM(amount)     OVER w AS running_total,
  ROW_NUMBER()    OVER w AS seq,
  LAG(amount, 1)  OVER w AS prev_amount,
  AVG(amount)     OVER (PARTITION BY tenant_id) AS tenant_avg
FROM payments
WINDOW w AS (PARTITION BY tenant_id ORDER BY created_at);

-- Dedupe: keep newest row per key
DELETE FROM events e
USING events newer
WHERE e.key = newer.key AND e.created_at < newer.created_at;

-- Gap detection (sessionization): islands-and-gaps pattern
SELECT user_id, MIN(ts) AS session_start, MAX(ts) AS session_end
FROM (
  SELECT *, ts - interval '30 min' * ROW_NUMBER()
            OVER (PARTITION BY user_id ORDER BY ts) AS grp
  FROM clicks
) x GROUP BY user_id, grp;`,
    },
  ],

  // ─── §12 Functions & callables ────────────────────────────────────────────
  functions: [
    {
      lang: "sql",
      caption: "SQL functions vs PL/pgSQL — and when to stay out of the DB",
      code: `-- Pure SQL function: inlinable, planner-transparent (preferred default)
CREATE FUNCTION active_tenants() RETURNS SETOF tenants
LANGUAGE sql STABLE PARALLEL SAFE
RETURN SELECT * FROM tenants WHERE status = 'active';  -- PG14+ RETURN syntax

-- PL/pgSQL: imperative logic, loops, exceptions — for real procedures
CREATE OR REPLACE FUNCTION insert_invoice(p_tenant uuid, p_amount numeric)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO invoices (tenant_id, amount) VALUES (p_tenant, p_amount)
  RETURNING id INTO v_id;
  UPDATE tenants SET mrr = mrr + p_amount WHERE id = p_tenant;
  RETURN v_id;
EXCEPTION WHEN check_violation THEN
  RAISE 'bad invoice for %', p_tenant USING ERRCODE = '22023';
END $$;

-- Trigger for updated_at hygiene:
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER t_touch BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();`,
    },
  ],

  // ─── §13 Error handling ───────────────────────────────────────────────────
  errorHandling: [
    {
      lang: "sql",
      caption: "Transactions, savepoints, and advisory locks",
      code: `BEGIN;
  SAVEPOINT sp1;
  INSERT INTO accounts ...;              -- might violate a constraint
  EXCEPTION-less path continues on success
ROLLBACK TO sp1;                        -- undo only since the savepoint
  INSERT INTO dead_letters ...;          -- quarantine and move on
COMMIT;

-- Idempotency guard: advisory locks avoid duplicate work app-side
SELECT pg_advisory_xact_lock(hashtext('sync:' || $feed_id));
-- (returns immediately if free; blocks if another worker holds it)

-- Postgres error codes are contract:
-- 23505 unique_violation → conflict path
-- 40001 serialization_failure → retry the transaction
-- 55P03 lock_not_available (from SKIP LOCKED NOWAIT variants)
-- 57014 query_canceled (statement_timeout) → user gave up, log skip`,
    },
  ],

  // ─── §14 "Concurrency" — locking & isolation in practice ─────────────────
  concurrency: [
    {
      lang: "sql",
      caption: "Isolation levels as Postgres actually implements them",
      code: `-- READ COMMITTED (default): each statement sees a fresh snapshot.
--   Non-repeatable reads & phantoms possible within a transaction.
-- REPEATABLE READ: one snapshot per transaction. In Postgres this
--   already prevents phantoms (unlike the SQL standard's minimum).
--   Write conflicts raise: ERROR: could not serialize access due to
--   concurrent update (40001) → app retries.
-- SERIALIZABLE: SSI — true serializability via predicate locks.
--   Retry on 40001 is MANDATORY; expect a few % retries under contention.

-- Optimistic pattern with retry (application pseudo-code):
-- for attempt in 1..3:
--   BEGIN ISOLATION LEVEL SERIALIZABLE;
--   try:   ... work ...; COMMIT; break
--   except serialization_failure(40001): ROLLBACK; backoff; continue

-- Pessimistic alternative for hot counters:
UPDATE counters SET n = n + 1 WHERE id = $1;   -- row lock, safe increment
-- SELECT ... FOR UPDATE NOWAIT when waiting is worse than failing.`,
    },
    {
      lang: "sql",
      caption: "Deadlocks: cause and cure",
      code: `-- Deadlock: T1 locks A then wants B; T2 locks B then wants A.
-- Postgres detects and kills one: ERROR 40P01 deadlock_detected.

-- Cure 1 — consistent lock ordering everywhere:
UPDATE accounts SET ... WHERE id = LEAST($a,$b);
UPDATE accounts SET ... WHERE id = GREATEST($a,$b);

-- Cure 2 — single-statement multi-row ops (locks taken in one pass):
UPDATE accounts SET balance = balance - x.amount
FROM (VALUES (1, 50.0), (2, -50.0)) AS x(id, amount)
WHERE accounts.id = x.id;

-- Diagnose: log_lock_waits=on, pg_stat_activity.wait_event_type='Lock',
-- pg_blocking_pids(pid) shows who's blocking whom.`,
    },
  ],

  // ─── §15 Testing ──────────────────────────────────────────────────────────
  testing: [
    {
      lang: "sql",
      caption: "Testing SQL with fixtures and transaction rollback",
      code: `-- Each test runs inside a transaction that never commits:
BEGIN;
INSERT INTO tenants (id, name) VALUES ('t1', 'Acme');
SELECT assert_active_tenants_count(1);   -- your SQL assertion helpers
ROLLBACK;                                 -- world restored

-- Migration safety: run the suite against a COPY of production shape:
CREATE DATABASE test_template TEMPLATE prod_snapshot;

-- Constraint tests are tests — verify they bite:
-- INSERT INTO invoices (amount) VALUES (-5);
-- expect: ERROR 23514 check_violation

-- pgTAP for full in-database suites:
SELECT plan(2);
SELECT has_table('invoices');
SELECT col_not_null('invoices', 'tenant_id');
SELECT * FROM finish();`,
    },
  ],

  // ─── §16 Performance ──────────────────────────────────────────────────────
  performance: [
    { fact: "EXPLAIN (ANALYZE, BUFFERS) + pg_stat_statements are the only honest sources of truth — reading plans beats guessing indexes every single time.", tag: "method" },
    { fact: "Composite index column order: equality columns first, range/sort column last — (tenant_id, created_at DESC) serves tenant-scoped time queries.", tag: "index" },
    { fact: "Partial indexes (WHERE status='pending') shrink hot indexes 10-100x on status-machine tables.", tag: "index" },
    { fact: "Covering indexes with INCLUDE(...) enable index-only scans — check pg_stat_user_tables.idx_scan vs n_tup_upd for staleness (visibility map).", tag: "index" },
    { fact: "work_mem is per sort/hash node per query, not per session — a 100MB setting on a 5-sort query wants 500MB.", tag: "memory" },
    { fact: "shared_buffers ≈ 25% RAM as a starting point; effective_cache_size tells the planner what the OS cache is (75%); random_page_cost 1.1 on SSDs.", tag: "memory" },
    { fact: "BRIN indexes: tiny, perfect for append-only time-series (billions of rows, minutes to build); useless for random update patterns.", tag: "index" },
    { fact: "Partition pruning needs the partition key in the query; check EXPLAIN for 'Subplans Removed' — its absence means every partition is hit.", tag: "partition" },
    { fact: "JIT compilation helps long analytic queries, hurts short OLTP ones (PG17 made it much more selective; consider jit=off for pure OLTP).", tag: "planner" },
    { fact: "Async I/O (io_method=worker/io_uring, PG18) accelerates seq scans and analytic reads on big storage — biggest PG18 win.", tag: "version" },
    { fact: "pg_stat_activity + wait_event tells you in 10 seconds whether you're IO-bound, lock-bound, or CPU-bound — look before tuning.", tag: "method" },
    { fact: "Connection overhead: PgBouncer transaction pooling + SET LOCAL session state; thousands of direct backends = memory + context-switch death.", tag: "ops" },
  ],

  // ─── §17 Ecosystem & tooling ──────────────────────────────────────────────
  ecosystem: [
    { tool: "PgBouncer", purpose: "Lightweight connection pooler — the standard front for any app fleet.", url: "https://www.pgbouncer.org/", category: "ops" },
    { tool: "pgvector", purpose: "Vector similarity (HNSW/IVFFlat) — the default embeddings store for RAG apps.", url: "https://github.com/pgvector/pgvector", category: "extension" },
    { tool: "PostGIS", purpose: "The reference geospatial engine — geometry types, GiST indexes, GPS-grade functions.", url: "https://postgis.net/", category: "extension" },
    { tool: "pg_stat_statements", purpose: "Aggregated query stats by fingerprint — find your worst queries first.", url: "https://www.postgresql.org/docs/current/pgstatstatements.html", category: "observability" },
    { tool: "pg_partman", purpose: "Automated partition creation/retention — time-series lifecycle without cron SQL.", url: "https://github.com/pgpartman/pg_partman", category: "ops" },
    { tool: "TimescaleDB", purpose: "Time-series hypertables, compression, continuous aggregates on Postgres.", url: "https://www.timescale.com/", category: "extension" },
    { tool: "Citus", purpose: "Horizontal sharding/distributed Postgres (open source; Microsoft-managed).", url: "https://github.com/citusdata/citus", category: "scale" },
    { tool: "Debezium", purpose: "CDC via logical replication — streams row changes to Kafka/streams.", url: "https://debezium.io/", category: "integration" },
    { tool: "pgAdmin / DBeaver", purpose: "GUI clients; pgAdmin ships with the ecosystem, DBeaver covers every engine.", url: "https://www.postgresql.org/ftp/pgadmin/", category: "tooling" },
    { tool: "Supabase / Neon", purpose: "Postgres-first platforms: Supabase (BaaS) and Neon (serverless storage separation).", url: "https://supabase.com/", category: "cloud" },
    { tool: "pgbackrest", purpose: "Backup/restore with parallelism, incremental, and PITR.", url: "https://pgbackrest.org/", category: "backup" },
    { tool: "Patroni", purpose: "HA clusters via etcd-backed leader election + streaming replication.", url: "https://github.com/patroni/patroni", category: "ops" },
  ],

  // ─── §18 Version history ──────────────────────────────────────────────────
  versionHistory: [
    { version: "Postgres95 → 6.x", year: 1996, highlight: "PostQUEL query language replaced by SQL; renamed PostgreSQL; the open-source lineage of Berkeley POSTGRES begins." },
    { version: "8.0", year: 2005, highlight: "Windows-native port, savepoints, tablespaces — first version a Windows shop could run seriously." },
    { version: "9.0", year: 2010, highlight: "Streaming replication + hot standby — the HA era begins." },
    { version: "9.2", year: 2012, highlight: "JSON type + index-only scans; 9.4 (2014) adds JSONB — 'the database that also does documents'." },
    { version: "9.6", year: 2016, highlight: "Parallel queries land; pg_stat_statements promoted to extension standard." },
    { version: "10", year: 2017, highlight: "Logical replication, declarative partitioning (matured in 11), identity columns." },
    { version: "12", year: 2019, highlight: "JSONPath, CTEs become inlinable (not optimization fences), generated columns." },
    { version: "13", year: 2020, highlight: "B-tree deduplication, parallel vacuum indexes, CTE inlining by default (perf).", },
    { version: "14", year: 2021, highlight: "Multiranges, pipelined libpq, jitter-less vacuum tweaks; perf across the board." },
    { version: "15", year: 2022, highlight: "MERGE, unique NULLS [NOT] DISTINCT, zstd/lz4 compression, public schema locked down by default." },
    { version: "16", year: 2023, highlight: "Parallel full/right hash joins, bulk loading 2x, pg_stat_io, logical replication improvements." },
    { version: "17", year: 2024, highlight: "Incremental backup, MERGE improvements, vacuum memory 20x lower, streaming IO (read_stream) groundwork." },
    { version: "18", year: 2025, highlight: "Asynchronous I/O (io_uring), OAuth SASL auth, virtual generated columns, uuidv7(), longer version identifiers. Current: 18.6 (Aug 2026)." },
  ],

  // ─── §19 Interview hot questions ──────────────────────────────────────────
  interview: [
    { q: "Explain MVCC and why it matters.", a: "Multi-Version Concurrency Control: writes create new row versions tagged with transaction IDs (xmin/xmax) instead of overwriting in place. Readers get a consistent snapshot — your SELECT sees the database as of your transaction's start, so readers never block writers and vice versa. Costs: dead row versions accumulate until VACUUM reclaims them, long-running transactions pin snapshots and block cleanup for everyone, and indexes bloat from churn. Almost every Postgres operational problem (bloat, wraparound, count(*) cost) traces back to MVCC mechanics.", difficulty: "medium" },
    { q: "Why is my query slow? Walk through your diagnosis.", a: "EXPLAIN (ANALYZE, BUFFERS): look for rows-estimates vs actual (misestimation → wrong plan), Seq Scans on big tables (missing/unusable index), nested loops over large inner sets (missing join index or bad statistics), spills to disk (sorts/hashes exceeding work_mem — 'Buffers: temp read/written'). Then pg_stat_statements for whether this query is even the one worth fixing. Fix accordingly: index the actual predicate shape (functional/partial as needed), raise work_mem for legit sorts, ANALYZE after bulk loads, rewrite N+1 patterns into joins.", difficulty: "medium" },
    { q: "What's the difference between WAL, logical replication, and physical replication?", a: "WAL (write-ahead log) is the redo stream every commit appends — crash recovery replays it. Physical replication ships WAL blocks to standbys (pg_basebackup + streaming): byte-identical replicas, entire cluster, right for HA. Logical replication decodes WAL (pgoutput) into row-level changes and streams them selectively (tables, databases, versions differ): right for CDC, upgrades between majors, and multi-tenant fan-out. Physical is whole-cluster and exact; logical is selective, version-tolerant, and consumption-flexible.", difficulty: "medium" },
    { q: "When would you choose REPEATABLE READ or SERIALIZABLE over READ COMMITTED?", a: "READ COMMITTED (default): per-statement snapshots — fine for most web apps; anomalies (non-repeatable reads, lost-update-by-read-modify-write) are prevented by atomic UPDATEs or explicit locking. REPEATABLE READ: snapshot per transaction — report consistency (two queries in one txn see the same world); write conflicts abort with 40001, so retry logic required. SERIALIZABLE (SSI): when invariants span multiple rows/tables and app-level locking is error-prone (inventory, transfers) — detects all conflicts via predicate locks but retries are mandatory and contention costs throughput. Choose the weakest level that keeps your invariants, add retries at every level above READ COMMITTED.", difficulty: "hard" },
    { q: "How do B-tree indexes fail to be used?", a: "Predicate doesn't match the index shape: leading-column not constrained (index on (a,b), query only filters b), expression on the column (lower(email)=... needs a functional index), type mismatch (text vs varchar parameter casts), implicit casts breaking matching, OR conditions falling outside the index (consider UNION), or LIKE '%x' leading wildcard (needs pg_trgm). Also: planner decides seq scan is cheaper for large fractions of the table (that's correct behavior), stale statistics after bulk loads (ANALYZE), or index bloat (reindex CONCURRENTLY).", difficulty: "medium" },
    { q: "Design a job queue in Postgres. What are the failure modes?", a: "Table with (id, status, run_at, attempts, locked_by, locked_at), partial index on pending+run_at, claim via UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING. Handle: worker death (requeue where locked_at < now()-interval), retries with backoff (attempts column + run_at=now()+backoff), poison messages (max attempts → dead-letter status), fairness (ORDER BY run_at). Failure modes to call out: long transactions blocking vacuum, queue table bloat from churn (aggressive autovacuum tuning), and missing partial index making the claim scan O(pending). It scales to tens of thousands of jobs/min; beyond that, a real broker (SQS, Kafka) earns its complexity.", difficulty: "hard" },
    { q: "Why does count(*) get slow, and what do you do about it?", a: "count(*) must respect MVCC visibility — every row's committed/dead status checked, which a plain index walk can't fully answer for arbitrary predicates. Options: filtered exact counts when the UI truly needs them (small, indexed scope); approximate totals from pg_class.reltuples for pagination UIs; maintained counters (trigger-updated summary table or a single-row counter with UPDATE increment) for exact-and-fast; materialized views for analytics. The anti-pattern is count(*) over an unbounded table on every page render.", difficulty: "easy" },
    { q: "What happens on VACUUM, and what is wraparound?", a: "VACUUM reclaims dead row versions (space reused, not returned to the OS except with TRUNCATE-style operations), cleans indexes (separately since PG14 improvements), maintains the visibility map (enabling index-only scans), and freezes old XIDs. Wraparound: XIDs are 32-bit; to compare across the wrap boundary Postgres must age-out old XIDs by freezing — if autovacuum can't keep up (long transactions, disabled autovacuum), the cluster forces shutdown for manual vacuum to avoid data corruption. It's the one failure mode that can take the whole database down; monitor datfrozenxid and never disable autovacuum on old tables.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ──────────────────────────────────────────────────────
  comparisons: [
    { vs: "MySQL", whenThis: "Richer SQL (window functions matured earlier, CTEs, EXCLUDE), extensibility (types + extensions), transactional DDL, stricter semantics; Postgres-oriented hiring is strong in data-heavy shops.", whenThat: "Read-replica-heavy simple web workloads, entrenched LAMP-era tooling, some hosting ecosystems; MySQL remains #2 on DB-Engines (823 vs 690)."},
    { vs: "MongoDB", whenThis: "Relational integrity with JSONB when documents coexist with relations; joins, constraints, and SQL tooling; stronger consistency defaults.", whenThat: "Document-first schemas evolving fast, built-in horizontal sharding, and driver ecosystems designed around documents. MongoDB sits #5 on DB-Engines (366)."},
    { vs: "SQLite", whenThis: "Many concurrent writers, network clients, big datasets (SQLite caps at ~281TB but single-writer), rich server SQL and roles.", whenThat: "Embedded/single-user, edge, mobile, and read-mostly deployments — the most deployed database on Earth runs in-process." },
    { vs: "Redis", whenThis: "Durable source-of-truth data, complex queries, transactional invariants.", whenThat: "Sub-ms caching, ephemeral counters/leaderboards, session store. They're complements, not rivals: cache Postgres with Redis." },
    { vs: "Snowflake/BigQuery", whenThis: "OLTP workloads, row-level updates, cheap always-on serving, no per-query pricing.", whenThat: "Warehouse-scale analytics with elastic compute separation; Postgres analytics are good (pareto) but the cloud warehouses own 100TB+ BI." },
  ],
};

export default sheet;
