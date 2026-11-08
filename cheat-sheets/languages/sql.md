# SQL

**Category:** Languages · **Tier:** Tier 2 · Domain · **Tags:** declarative, query-language, relational, database, set-based, ansi, analytics · **First released:** 1974 · **Author:** Donald Chamberlin & Raymond Boyce (IBM) · **Last updated:** 2026-11

> Declarative set-based query language for relational databases — the universal data interface, surviving four decades of NoSQL challenges.

---

## TL;DR

- SQL is a declarative, set-oriented language for querying and manipulating relational data — you describe what you want, the optimizer decides how. ANSI standardized since 1986, dialects diverge (Postgres, MySQL, SQL Server, SQLite, Snowflake) but the core 80% is universal.
- It is the lingua franca of data: every analytical tool, BI platform, ORM, and data warehouse speaks it, and SQL-first workflows (dbt, materialized views, semantic layers) are resurging against heavy code-based transforms.
- Reach for SQL for analytical aggregations, joins across millions of rows, transactional CRUD with ACID guarantees, and anywhere data already lives in a relational store — the optimizer will beat hand-rolled Python loops by 10-1000x.
- Avoid SQL for graph traversal (recursive CTEs are slow vs Cypher/Gremlin), unstructured data (use object storage + Parquet/JSON), or imperative control flow — the language has no loops and no first-class functions.

## Core Mental Model

**Logical order of evaluation, not written order.** SQL is written SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY, but the engine evaluates FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. This single fact explains most beginner confusion: you can't reference a SELECT alias in WHERE (it hasn't been computed yet), but you can in ORDER BY (it has). The other key model: SQL operates on bags (multisets), not sets — duplicate rows are real unless you say DISTINCT. Aggregations collapse groups to single rows; joins multiply rows by matching predicates; window functions compute over partitions without collapsing. Internalizing the bag-vs-set distinction explains why COUNT(*) ≠ COUNT(col) and why your LEFT JOIN suddenly produces 3x the rows you expected.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| SELECT col, agg() FROM t WHERE ... GROUP BY ... HAVING ... | Core query shape — filter rows, group, aggregate, post-filter groups. | The 80% of all analytical SQL you'll ever write. |
| LEFT / RIGHT / INNER / FULL / CROSS JOIN t2 ON t1.k = t2.k | Joins two row sets on a predicate; LEFT keeps unmatched left rows. | Combine tables; prefer LEFT over INNER when you want to surface missing matches. |
| WITH cte AS (SELECT ...), cte2 AS (SELECT ...) | Common table expression — named, scoped subquery; chainable. | Replace deeply nested subqueries; readability win; required for recursion. |
| WITH RECURSIVE cte AS (anchor UNION ALL step) | Self-referencing CTE — iterates until no new rows. | Tree/graph traversal (org chart, BOM explosion); beware exponential growth. |
| ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) | Window function — computes per-row over a sliding partition, no collapse. | Top-N per group, running totals, deduplication, gaps-and-islands. |
| LAG(x) / LEAD(x) / FIRST_VALUE(x) | Access prior/next/first row within a partition. | Time-series deltas, sessionization, event sequencing. |
| INSERT INTO t (cols) VALUES (...), (...) ON CONFLICT (k) DO UPDATE SET ... | Upsert — Postgres/SQLite syntax; MySQL uses ON DUPLICATE KEY UPDATE. | Idempotent loads, MERGE pattern, avoiding duplicate-key errors. |
| MERGE INTO target USING source ON ... WHEN MATCHED THEN ... WHEN NOT MATCHED THEN ... | Standard SQL upsert — merge two tables with conditional actions. | ETL loads, slow-changing dimensions; Postgres 15+, SQL Server, Oracle. |
| EXISTS (subquery) / NOT EXISTS | Semi-join — returns true if subquery yields any row. | Almost always faster than IN for large outer sets; NULL-safe vs NOT IN. |
| INTERSECT / EXCEPT (or MINUS) | Set operations on row sets — bag semantics with ALL, set with none. | Comparing two result sets, finding diffs/overlaps without joins. |
| GENERATE_SERIES / VALUES table function | Synthetic row source — Postgres generate_series, VALUES rows. | Generating time-series buckets, ad-hoc literals, missing date fills. |
| FILTER (WHERE cond) — inside an aggregate | Conditional aggregation — cleaner than CASE WHEN inside SUM(). | Postgres/SQLite; pivot-style summaries in a single GROUP BY. |

## Idiomatic Patterns

**Window functions — top-N per group, the classic**

```sql
-- Find the highest-paid employee per department.
-- ROW_NUMBER() OVER (PARTITION BY ...) is the universal pattern.
WITH ranked AS (
  SELECT
    employee_id,
    department_id,
    salary,
    ROW_NUMBER() OVER (
      PARTITION BY department_id
      ORDER BY salary DESC, hire_date ASC
    ) AS rn
  FROM employees
  WHERE terminated_at IS NULL
)
SELECT department_id, employee_id, salary
FROM ranked
WHERE rn = 1
ORDER BY department_id;

-- Variants: use RANK() to allow ties (multiple rank 1s),
-- DENSE_RANK() for no gaps, or LAG(salary) for the prior-highest.
```

**Gaps-and-islands — sessions from event streams**

```sql
-- Group consecutive events into sessions, splitting when the gap
-- between events exceeds 30 minutes. The canonical gaps-and-islands pattern.
WITH events AS (
  SELECT
    user_id,
    event_time,
    LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time) AS prev_time
  FROM clicks
),
flagged AS (
  SELECT
    *,
    CASE
      WHEN prev_time IS NULL
        OR event_time - prev_time > INTERVAL '30 minutes'
      THEN 1 ELSE 0
    END AS is_new_session
  FROM events
),
sessioned AS (
  SELECT
    *,
    SUM(is_new_session) OVER (
      PARTITION BY user_id ORDER BY event_time
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS session_num
  FROM flagged
)
SELECT user_id, session_num,
       MIN(event_time) AS started_at,
       MAX(event_time) AS ended_at,
       COUNT(*) AS clicks
FROM sessioned
GROUP BY user_id, session_num;
```

**Upsert with conditional logic (Postgres ON CONFLICT)**

```sql
-- Idempotent load: insert new rows, update existing with new values,
-- bumping updated_at only when something actually changed.
INSERT INTO users (id, email, role, updated_at)
VALUES (1, 'a@b.io', 'member', NOW()),
       (2, 'c@d.io', 'admin',  NOW())
ON CONFLICT (id) DO UPDATE
SET
  email     = EXCLUDED.email,
  role      = EXCLUDED.role,
  updated_at = CASE
                 WHEN users IS DISTINCT FROM EXCLUDED
                 THEN NOW()
                 ELSE users.updated_at
               END
WHERE users IS DISTINCT FROM EXCLUDED;
-- The WHERE clause skips no-op writes — saves WAL, replication, trigger noise.
```

**Recursive CTE — org-chart traversal with cycle guard**

```sql
WITH RECURSIVE org_tree AS (
  -- Anchor: top-level managers
  SELECT
    id,
    manager_id,
    name,
    0 AS depth,
    ARRAY[id] AS path    -- Postgres; use STRING_AGG elsewhere for cycle guard
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- Recursive step: join anchor to children
  SELECT
    e.id,
    e.manager_id,
    e.name,
    ot.depth + 1,
    ot.path || e.id
  FROM employees e
  JOIN org_tree ot ON e.manager_id = ot.id
  WHERE e.id <> ALL(ot.path)    -- cycle guard: don't revisit
  AND ot.depth < 20             -- hard cap, prevents runaway recursion
)
SELECT id, name, depth, path
FROM org_tree
ORDER BY path;
-- SQL Server: use OPTION (MAXRECURSION 20); MySQL 8: no array, use FIND_IN_SET.
```

## Common Pitfalls

1. **NULL breaks every comparison** — *Symptom:* `WHERE col != 5` excludes rows where col IS NULL — NULL is not 'not equal to 5', it's unknown. `NOT IN (subquery)` returns NULL if the subquery contains a single NULL, returning zero rows unexpectedly. *Fix:* Use `IS DISTINCT FROM` (Postgres) for NULL-safe inequality. For NOT IN, either filter NULLs in the subquery (`WHERE col IS NOT NULL`) or rewrite as `NOT EXISTS`. Always test with NULLs in your test data.
2. **COUNT(col) vs COUNT(*) vs COUNT(DISTINCT col)** — *Symptom:* `COUNT(col)` ignores NULLs in col; `COUNT(*)` counts all rows; `COUNT(DISTINCT col)` counts unique non-NULL values. Confusing them produces wrong metrics, especially on outer joins. *Fix:* Be explicit about intent: `COUNT(*)` for rows, `COUNT(col)` for non-NULL values, `COUNT(DISTINCT col)` for cardinality. Add a comment when the distinction matters.
3. **LEFT JOIN + WHERE filter on the right table = INNER JOIN** — *Symptom:* `FROM a LEFT JOIN b ON a.id = b.id WHERE b.status = 'active'` silently converts the LEFT JOIN to an INNER JOIN — rows in `a` with no matching `b` are filtered out by the WHERE. *Fix:* Move right-table filters into the ON clause: `LEFT JOIN b ON a.id = b.id AND b.status = 'active'`. Keep WHERE only for left-table predicates when you want to preserve unmatched left rows.
4. **SELECT * explodes when schema changes** — *Symptom:* A new column added to the source table silently breaks downstream INSERT...SELECT * (column count mismatch) and inflates ETL payloads with unused data. *Fix:* Always list columns explicitly in production code. Reserve `SELECT *` for ad-hoc exploration. CI should lint for `SELECT *` in views, migrations, and ETL.
5. **Grouping by a non-aggregated, non-grouped column** — *Symptom:* `SELECT user_id, created_at, COUNT(*) FROM events GROUP BY user_id` is illegal in standard SQL — `created_at` is neither grouped nor aggregated. MySQL (with ONLY_FULL_GROUP_BY off) silently returns an arbitrary value. *Fix:* Enable `ONLY_FULL_GROUP_BY` (MySQL default since 5.7) or Postgres equivalent. Either group by every selected non-aggregate column, or use an aggregate like `MAX(created_at)`.
6. **Implicit type conversion hides index usage** — *Symptom:* `WHERE date_col = '2024-01-15'` may work because the string coerces to a date, but `WHERE varchar_col = 123` may scan the whole table because the column is implicitly cast to int, defeating the index. *Fix:* Match the column's type exactly. For dates, use `DATE '2024-01-15'` or `= '2024-01-15'::date`. For varchar, quote: `= '123'`. Check EXPLAIN for Seq Scan warnings.
7. **N+1 from a query inside a loop** — *Symptom:* Loading 1000 users then issuing 1000 separate `SELECT * FROM orders WHERE user_id = ?` queries — the round-trips dwarf the actual work. ORMs hide this behind lazy accessors. *Fix:* Use a single JOIN, or `WHERE user_id = ANY($1::int[])` (Postgres array bind), or load all orders in one query and group in application code. Always log slow queries and count query issuance per request.

## Production / Interview Quick Reference

- PostgreSQL 18.6 (Aug 2026) is current security line; PG19 at RC1 — plan major upgrades on LTS cadence. `version`
- Logical eval order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. Aliases in SELECT can't be used in WHERE. `gotcha`
- SQL operates on bags (multisets), not sets — duplicates persist unless DISTINCT. Aggregations ignore NULLs; COUNT(*) counts rows. `gotcha`
- LEFT JOIN + WHERE on the right table converts to INNER JOIN silently — move right-table filters into ON. `gotcha`
- NULL propagation: `NULL = NULL` is NULL (not true), `NULL <> 5` is NULL, `NOT IN (subq with NULL)` returns no rows. `gotcha`
- Window functions (ROW_NUMBER, LAG, SUM OVER) compute over partitions without collapsing rows — the only way to mix aggregates with row-level data. `perf`
- Index strategy: composite indexes are leftmost-prefix — `INDEX(a,b,c)` serves WHERE a, WHERE a AND b, but not WHERE b alone. `perf`
- EXPLAIN ANALYZE (Postgres) / EXPLAIN EXTENDED (MySQL) shows real cost — always verify for queries touching >10k rows. `perf`
- Recursive CTEs are Turing-complete but slow for deep graphs — add depth caps and cycle guards. `complexity`
- ANSI SQL:2016 introduced JSON_TABLE; modern Postgres/MySQL/SQL Server all support JSON path queries but syntax differs. `version`
- Postgres 15+ has MERGE; earlier versions use INSERT ... ON CONFLICT (upsert only). `version`
- MySQL 8.0+ has window functions and CTEs — earlier versions required workarounds with user variables. `version`
- SELECT FOR UPDATE / SKIP LOCKED powers job queues (Skip locked, process, delete) — Postgres/MySQL/SQL Server all support. `version`
- Materialized views (Postgres, Oracle) cache query results — REFRESH MATERIALIZED VIEW CONCURRENTLY avoids read locks. `perf`
- Common style: keywords UPPERCASE, identifiers snake_case, terminate with `;`. sqlfluff / sqlfmt enforce. `style`
- Prepared statements / parameterized queries are mandatory for security — never string-concat values into SQL. `gotcha`

## Go Deeper

- [PostgreSQL Documentation — SQL Language](https://www.postgresql.org/docs/current/sql.html) — The most thorough free SQL reference; the window functions and EXPLAIN chapters are essential.
- [SQL Standard — ISO/IEC 9075](https://www.iso.org/standard/76583.html) — The formal standard (paid). Most engineers use the Postgres docs as a free approximation.
- [Use The Index, Luke! (Markus Winand)](https://use-the-index-luke.com/) — The canonical free book on indexing and query optimization — reads like a thriller.
- [SQL Performance Explained (Markus Winand)](https://www.sql-performance-explained.com/) — Deep treatment of B-tree internals, join algorithms, and how the optimizer picks plans.
- [dbt Learn — Analytics Engineering](https://www.getdbt.com/dbt-learn) — Modern SQL-first transformation patterns; the de-facto workflow for warehouse-scale SQL.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| INTEGER / BIGINT / SMALLINT | Signed integers — vendor-specific widths. BIGINT is 64-bit; SMALLINT is 16-bit. | Counting, IDs, foreign keys. Use BIGINT for IDs that may exceed 2^31. |
| DECIMAL(p, s) / NUMERIC(p, s) | Fixed-point decimal — exact precision. p = total digits, s = decimal places. | Money, financial calculations. NEVER use FLOAT for currency. |
| REAL / DOUBLE PRECISION | IEEE 754 floating-point — inexact, fast. | Scientific computing, statistics. NOT for money or exact equality. |
| BOOLEAN | true / false / NULL. Three-valued logic (NULL is unknown). | Logic flags. WHERE active = TRUE; beware NULL = FALSE is NULL, not TRUE. |
| VARCHAR(n) / TEXT | Variable-length string. VARCHAR(n) caps at n; TEXT is unbounded (Postgres). | All text. Prefer TEXT in Postgres (no perf difference); VARCHAR(n) for constraints. |
| CHAR(n) | Fixed-length string — padded with spaces. Rarely worth it. | Legacy schemas, fixed-width codes (e.g., 'ISO-4217' currency codes). |
| DATE / TIME / TIMESTAMP / TIMESTAMPTZ | Date (no time), time (no date), timestamp (both), timestamptz (with timezone). | Always use TIMESTAMPTZ for events; DATE for calendar days. Avoid TIMESTAMP without tz. |
| INTERVAL | Duration — INTERVAL '1 day', '3 hours', 'P1Y2M3DT4H' (ISO 8601). | Date arithmetic: event_time + INTERVAL '1 hour'. |
| UUID / BYTEA / BLOB | UUID (128-bit, Postgres native), BYTEA (Postgres binary), BLOB (MySQL binary). | UUID for distributed IDs; BYTEA/BLOB for binary data (usually prefer object storage + URL). |
| JSON / JSONB | JSON text (Postgres JSON, parsed per access) vs JSONB (binary, indexed, faster). | Semi-structured data. Prefer JSONB in Postgres — supports GIN indexing, no whitespace preserved. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| TABLE | Named relation — rows + columns, schema-typed. The fundamental collection. | Persistent storage. The default for OLTP. Partition large tables by date/range. |
| VIEW | Saved query — virtual table, recomputed on read. | Encapsulate complex queries, expose subsets, row-level security. Materialize if hot. |
| MATERIALIZED VIEW | Saved query result — cached, requires REFRESH to update. | Dashboards, expensive aggregates. Postgres: REFRESH MATERIALIZED VIEW CONCURRENTLY. |
| TEMPORARY TABLE | Per-session table — auto-dropped at session end. | Multi-step ETL where CTEs would be too slow or re-computed. CREATE TEMP TABLE foo AS SELECT ...; |
| CTE (WITH ... AS) | Named subquery scoped to the main query. Inline by default. | Readability, recursion, common sub-expression elimination. MATERIALIZED hint forces materialization. |
| ARRAY (Postgres) | Variable-length array column — INTEGER[], TEXT[]. Supports indexing via GIN. | Tags, multi-value columns. Often better than a join table for short lists. |
| JSONB / JSON arrays | JSON array column — JSONB[] vs ARRAY[jsonb]. Prefer JSONB arrays. | Semi-structured collections. Use jsonb_array_elements to unnest. |
| CURSOR | Server-side iterator over a result set — fetch N rows at a time. | Large result sets in stored procs. Rare in app code — pagination via LIMIT/OFFSET or keyset is preferred. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| CREATE TYPE ... AS ENUM (...) | Enumerated type — closed set of string labels, stored as 4-byte int. | Status fields, categories. More efficient than VARCHAR; changing values requires ALTER TYPE. |
| CREATE TYPE ... AS (...) (composite) | Composite type — named tuple, like a row type. Postgres-specific. | Returning multiple values from a function, complex columns. Often better as a TABLE. |
| CREATE DOMAIN ... AS TEXT CHECK (...) | Named type with constraints — wraps a base type + CHECK. | Email, phone, currency code — typed validation reusable across columns. |
| CREATE TABLE | Defines a relation — columns with types, constraints (PK, FK, CHECK, UNIQUE, NOT NULL). | The fundamental schema definition. Use migrations, not ad-hoc CREATE. |
| SEQUENCE / SERIAL / IDENTITY | Auto-incrementing integer. SERIAL is legacy (Postgres); IDENTITY (SQL:2003) is modern. | Surrogate keys. Use IDENTITY (GENERATED ALWAYS AS IDENTITY) over SERIAL in new Postgres code. |
| GENERATED ALWAYS AS (...) STORED | Computed column — value derived from other columns, stored on write. | Full-name from first+last, lowercased email. Saves query-time computation. |
| TRIGGER / FUNCTION | Function runs on INSERT/UPDATE/DELETE events. PL/pgSQL, PL/SQL, T-SQL dialects. | Audit logs, denormalization, complex constraints. Use sparingly — they hide logic. |
| INDEX | Secondary access path — B-tree (default), GIN (full-text/array), GiST (geospatial), BRIN (range). | Hot query columns. Composite indexes are leftmost-prefix. EXPLAIN ANALYZE to verify usage. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b | Arithmetic — returns NULL if any operand is NULL. Division by zero errors (Postgres) or returns NULL (MySQL). | Math. Always handle NULL explicitly with COALESCE(a, 0) before arithmetic. |
| a = b, a <> b, a != b | Equality / inequality. NULL = anything is NULL (unknown). | Comparisons. Use IS DISTINCT FROM for NULL-safe inequality (Postgres). |
| a < b, a > b, a <= b, a >= b | Ordered comparison — NULLs compare as unknown. Most dialects sort NULLs last (ASC) or first (DESC). | Sorting, ranges. Use NULLS FIRST / NULLS LAST to control explicitly. |
| a IS NULL, a IS NOT NULL | NULL check — the only safe way to test for NULL. = NULL is always NULL (unknown). | WHERE x IS NULL — NEVER WHERE x = NULL. The #1 SQL beginner mistake. |
| a IS DISTINCT FROM b, a IS NOT DISTINCT FROM b | NULL-safe equality — treats NULL as a comparable value. Postgres, SQL Server, SQL standard. | When you want NULL = NULL to be TRUE. Also used in JOIN ON to dedupe NULL keys. |
| a AND b, a OR b, NOT a | Three-valued logic — NULL AND TRUE is NULL; NULL OR TRUE is TRUE; NOT NULL is NULL. | Logic. Truth table: TRUE > NULL > FALSE for OR; FALSE < NULL < TRUE for AND. |
| a IN (x, y, z), a NOT IN (subquery) | Membership. NOT IN with NULL in the list returns NO rows (NULL propagation). | Filter by value list. Use NOT EXISTS (subquery) instead of NOT IN to avoid the NULL trap. |
| a BETWEEN x AND y | Inclusive range — equivalent to a >= x AND a <= y. | Range filters. Note: inclusive on both ends; for time ranges use >= start AND < end (half-open). |
| a LIKE 'pat%' | Pattern match — % matches any chars, _ matches one. Case-sensitive in standard SQL. | Simple glob patterns. For regex use ~ (Postgres) or REGEXP (MySQL). |
| a \|\| b (concat) | String concatenation. Postgres/Oracle. MySQL uses CONCAT(); SQL Server uses +. | Build strings. NULL propagates: 'a' \|\| NULL is NULL — use CONCAT(a, b) which ignores NULL. |
| CASE WHEN x THEN y ELSE z END | Conditional expression — like a ternary. Searched form (CASE WHEN cond) or simple form (CASE expr WHEN val). | Conditional logic in SELECT. Aggregate form: SUM(CASE WHEN x THEN 1 ELSE 0 END). |
| a :: type (Postgres), CAST(a AS type) | Type cast — explicit conversion. :: is Postgres shorthand; CAST is standard. | Convert types: '2024-01-15'::date, amount::numeric(10,2). Use CAST for portability. |
| EXISTS (subquery), NOT EXISTS | Semi-join — returns true if subquery yields any row. Usually faster than IN for large outer sets. | Correlated existence checks. NULL-safe alternative to NOT IN. |
| a AT TIME ZONE 'UTC' | Timezone conversion — converts TIMESTAMPTZ to TIMESTAMP in target zone, or vice versa. | Display times in user's timezone. Always store as TIMESTAMPTZ (UTC) and convert at read. |

## Input / Output

**Reading data — SELECT tiers (basic, filtered, joined)**

```sql
-- Basic SELECT — list columns explicitly, never SELECT * in production
SELECT id, email, created_at
FROM users
WHERE active = TRUE
  AND created_at >= DATE '2024-01-01'
ORDER BY created_at DESC
LIMIT 100;

-- Join with aggregation — the workhorse analytical pattern
SELECT
  u.id,
  u.email,
  COUNT(o.id)         AS order_count,
  COALESCE(SUM(o.total), 0) AS lifetime_value
FROM users u
LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid'
WHERE u.created_at >= DATE '2024-01-01'
GROUP BY u.id, u.email
HAVING COUNT(o.id) > 0  -- post-aggregate filter
ORDER BY lifetime_value DESC;
```

**Writing data — INSERT, UPDATE, UPSERT patterns**

```sql
-- INSERT with explicit columns
INSERT INTO users (id, email, role, created_at)
VALUES (1, 'a@b.io', 'member', NOW())
     , (2, 'c@d.io', 'admin',  NOW());

-- UPDATE with WHERE — ALWAYS include a WHERE
UPDATE users
SET last_login = NOW(), login_count = login_count + 1
WHERE id = 1;

-- UPSERT (Postgres) — insert new, update existing, no-op if unchanged
INSERT INTO users (id, email, role, updated_at)
VALUES (1, 'a@b.io', 'member', NOW())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, updated_at = NOW()
WHERE users IS DISTINCT FROM EXCLUDED;

-- DELETE — ALWAYS with WHERE. Use a subquery for safety:
DELETE FROM users
WHERE id IN (SELECT user_id FROM archived_users WHERE archived_at < DATE '2023-01-01');
```

**Bulk load / unload — COPY (Postgres), LOAD DATA (MySQL)**

```sql
-- Postgres COPY — fastest bulk load (10-100x INSERT)
COPY users (id, email, role) FROM '/data/users.csv' WITH (
  FORMAT csv, HEADER true, DELIMITER ',', ENCODING 'UTF8'
);

-- Copy to a file (unload)
COPY (SELECT * FROM users WHERE created_at >= DATE '2024-01-01')
TO '/data/users_recent.csv' WITH (FORMAT csv, HEADER true);

-- Client-side copy: copy in psql, or pg_dump/pg_restore for full DB.

-- MySQL: LOAD DATA INFILE '/data/users.csv' INTO TABLE users
--   FIELDS TERMINATED BY ',' ENCLOSED BY '"' LINES TERMINATED BY '
'
--   IGNORE 1 ROWS;

-- Snowflake / BigQuery: COPY INTO users FROM @stage/users.csv FILE_FORMAT = (TYPE = CSV);
```

**Parameterized queries — preventing SQL injection**

```sql
-- NEVER string-concat values into SQL — use parameterized queries.

-- Postgres / psycopg (Python):
--   cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
-- The driver sends the value separately from the SQL — no injection possible.

-- Node.js (pg):
--   client.query('SELECT * FROM users WHERE id = $1', [user_id])

-- IN clauses — pass as array or use ANY:
SELECT * FROM users WHERE id = ANY($1::int[]);
-- Pass [1, 2, 3] as the parameter.

-- Dynamic identifiers (table/column names) CANNOT be parameterized.
-- Use a whitelist + quote_identifier, OR switch to a query builder.

-- Postgres quote_ident('user_id') -> "user_id"
-- This is the only safe pattern for dynamic column/table names.
```

## Loops & Iteration

**Set-based iteration — the SQL way (no explicit loops)**

```sql
-- SQL is set-based: operations apply to whole row sets at once.
-- This is ~1000x faster than a cursor-based loop in app code.

-- Anti-pattern (slow): loop in app code, one query per row
--   for user_id in user_ids:
--       db.execute("UPDATE ... WHERE id = ?", user_id)

-- Set-based (fast): one query
UPDATE users
SET last_login = NOW()
WHERE id = ANY($1::int[]);

-- INSERT ... SELECT — bulk transform in one statement
INSERT INTO user_summary (user_id, order_count, total)
SELECT user_id, COUNT(*), SUM(total)
FROM orders
WHERE created_at >= DATE '2024-01-01'
GROUP BY user_id;
```

**Recursive CTE — iteration via self-reference**

```sql
-- Recursive CTE iterates until no new rows.
-- Anchor + recursive step, joined by UNION ALL.

WITH RECURSIVE factorial(n, result) AS (
  -- Anchor
  SELECT 0, 1
  UNION ALL
  -- Recursive step
  SELECT n + 1, result * (n + 1)
  FROM factorial
  WHERE n < 10
)
SELECT * FROM factorial;

-- Practical: tree traversal (org chart, BOM)
-- See the patterns section for a full org-chart example.

-- WARNING: recursive CTEs can loop infinitely. Always include a
-- termination condition (WHERE n < 10) and consider cycle guards
-- (array of visited nodes).
```

**Cursors — row-by-row iteration in stored procedures**

```sql
-- Cursors iterate a result set row by row. Use ONLY when set-based is impossible.
-- Slower than set-based ops by 10-1000x.

-- Postgres PL/pgSQL:
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, email FROM users WHERE active LOOP
    -- Per-row logic that can't be expressed as a single UPDATE
    INSERT INTO audit_log (user_id, action) VALUES (rec.id, 'processed');
  END LOOP;
END $$;

-- FOR-IN-SELECT is the modern loop; explicit cursors (DECLARE ... OPEN ... FETCH ... CLOSE)
-- are only for cases where you need partial fetch or scroll.

-- Rule: if you can write it as a single UPDATE/INSERT...SELECT, do that instead.
```

**Window functions — iteration without loops**

```sql
-- Window functions compute per-row over a sliding partition, no collapse.
-- The replacement for many cursor-based loops.

-- Running total
SELECT
  user_id,
  order_date,
  amount,
  SUM(amount) OVER (
    PARTITION BY user_id
    ORDER BY order_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total
FROM orders;

-- Lag/Lead — access prior/next row (replaces self-joins)
SELECT
  user_id,
  event_time,
  event_time - LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time) AS gap
FROM events;
```

## Functions & Callables

**Built-in scalar + aggregate functions**

```sql
-- Scalar functions — operate per row
SELECT
  UPPER(email) AS email_upper,                    -- string
  EXTRACT(YEAR FROM created_at) AS year,          -- date
  COALESCE(nickname, email, 'anon') AS display,   -- null coalesce
  ROUND(amount, 2) AS rounded,                    -- numeric
  LENGTH(name) AS name_len;

-- Aggregate functions — collapse groups to single values
SELECT
  department,
  COUNT(*)                  AS headcount,
  AVG(salary)               AS avg_salary,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS median_salary,  -- Postgres
  STRING_AGG(email, ', ')   AS all_emails          -- Postgres / SQL Server
FROM employees
GROUP BY department;

-- COUNT(*) counts rows; COUNT(col) counts non-NULL col; COUNT(DISTINCT col) cardinality.
```

**User-defined functions (UDFs) — Postgres PL/pgSQL**

```sql
-- Scalar function — returns a single value
CREATE OR REPLACE FUNCTION full_name(first TEXT, last TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN TRIM(first || ' ' || last);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Use it
SELECT full_name('Alice', 'Smith') FROM users;

-- IMMUTABLE: same args → same result, no side effects (optimizer can precompute)
-- STABLE: same args → same result within a single query (e.g., now())
-- VOLATILE: default — can return different results each call

-- Table-valued function — returns a row set
CREATE OR REPLACE FUNCTION active_users(since DATE)
RETURNS TABLE (id INT, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT id, email FROM users WHERE active = TRUE AND created_at >= since;
END;
$$ LANGUAGE plpgsql STABLE;

SELECT * FROM active_users(DATE '2024-01-01');
```

**Stored procedures — multi-statement with side effects**

```sql
-- Procedures (Postgres 11+) can run transactions; functions can't.
CREATE OR REPLACE PROCEDURE transfer_money(
  from_id INT, to_id INT, amount NUMERIC(10, 2)
) AS $$
BEGIN
  -- Debit
  UPDATE accounts SET balance = balance - amount WHERE id = from_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source account % not found', from_id;
  END IF;

  -- Credit
  UPDATE accounts SET balance = balance + amount WHERE id = to_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target account % not found', to_id;
  END IF;

  -- Audit
  INSERT INTO transfers (from_id, to_id, amount) VALUES (from_id, to_id, amount);

  -- COMMIT happens automatically (or call COMMIT explicitly in PROCEDURE)
END;
$$ LANGUAGE plpgsql;

CALL transfer_money(1, 2, 100.00);

-- Prefer procedures over functions for DDL, multi-statement transactions, side effects.
```

**Window functions — first-class analytical functions**

```sql
-- ROW_NUMBER, RANK, DENSE_RANK, NTILE — ranking within partitions
SELECT
  product,
  category,
  price,
  ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) AS rn,
  RANK()       OVER (PARTITION BY category ORDER BY price DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY category ORDER BY price DESC) AS dense_rnk
FROM products;

-- LAG / LEAD — access prior/next row
SELECT
  date,
  closing_price,
  LAG(closing_price, 1) OVER (ORDER BY date) AS prev_close,
  closing_price - LAG(closing_price, 1) OVER (ORDER BY date) AS daily_change
FROM stock_prices;

-- FIRST_VALUE / LAST_VALUE / NTILE — partition boundaries
-- Use NULLS FIRST / NULLS LAST in ORDER BY to control NULL ordering.
```

## Error Handling

**RAISE / THROW — error propagation in PL/pgSQL**

```sql
-- Postgres: RAISE NOTICE / WARNING / EXCEPTION
CREATE OR REPLACE FUNCTION validate_email(email TEXT) RETURNS BOOLEAN AS $$
BEGIN
  IF email !~ '^[^@]+@[^@]+.[^@]+$' THEN
    RAISE EXCEPTION 'invalid email: %', email
      USING ERRCODE = '23514',  -- check_violation
            HINT   = 'email must contain @ and a domain';
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- MySQL: SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '...';
-- SQL Server: THROW 50000, 'message', 1;

-- Error codes: 23505 = unique_violation, 23503 = foreign_key_violation,
-- 23502 = not_null_violation, 23514 = check_violation.
-- Use them in EXCEPTION blocks for targeted handling.
```

**EXCEPTION blocks — catch by SQLSTATE**

```sql
-- Postgres PL/pgSQL: catch specific errors by SQLSTATE
DO $$
BEGIN
  INSERT INTO users (id, email) VALUES (1, 'a@b.io');
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'user already exists, skipping';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'related record missing';
  WHEN OTHERS THEN
    RAISE;  -- re-raise
END $$;

-- IMPORTANT: EXCEPTION blocks create a SAVEPOINT, rollback to it on error.
-- This is expensive — don't use for normal flow control.
```

**Constraints — declarative error prevention**

```sql
-- Constraints catch errors at the database level — the last line of defense.

CREATE TABLE users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'member', 'guest')),
  age         INTEGER CHECK (age >= 0 AND age < 150),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ON DELETE / ON UPDATE — foreign key cascade rules
CREATE TABLE orders (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  total    NUMERIC(10, 2) NOT NULL CHECK (total >= 0)
);

-- RESTRICT (default): block delete if referenced.
-- CASCADE: delete children too. SET NULL: set child FK to NULL.
-- Use RESTRICT for safety; CASCADE only when you mean it (it can nuke data).
```

**Transactions — ACID via BEGIN / COMMIT / ROLLBACK**

```sql
-- Transaction: all-or-nothing unit of work. ACID guarantees.

BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
  INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 100);
COMMIT;  -- all three succeed, or none do

-- Rollback on error
BEGIN;
  -- ... work ...
  IF something_bad THEN
    ROLLBACK;
    RETURN;
  END IF;
COMMIT;

-- Savepoints — partial rollback within a transaction
BEGIN;
  INSERT INTO orders (...) VALUES (...);
  SAVEPOINT after_order;
  -- risky op
  BEGIN;
    -- nested transaction (Postgres: same as savepoint)
    UPDATE inventory SET ...;
  EXCEPTION WHEN OTHERS THEN ROLLBACK TO after_order;
  END;
COMMIT;
```

## Concurrency Model

**Transaction isolation levels — the SQL standard tiers**

```sql
-- Four isolation levels (SQL standard); each database supports a subset.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;  -- Postgres default

-- READ UNCOMMITTED: dirty reads (rarely useful; Postgres treats as READ COMMITTED).
-- READ COMMITTED: no dirty reads, but non-repeatable reads + phantoms possible.
-- REPEATABLE READ: same query in a tx returns same results (Postgres also no phantoms).
-- SERIALIZABLE: full isolation, as if txns ran one at a time. Performance cost.

-- Postgres: only READ COMMITTED, REPEATABLE READ, SERIALIZABLE (3 levels, all strict).
-- MySQL/InnoDB: all 4 levels, but REPEATABLE READ doesn't fully prevent phantoms.

-- Rule of thumb: default (READ COMMITTED) for OLTP; SERIALIZABLE for critical analytics.
```

**SELECT FOR UPDATE — pessimistic locking**

```sql
-- Lock rows for the duration of a transaction. Prevents lost updates.

BEGIN;
  -- Lock the rows we're about to update
  SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
  -- Application computes new balance
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;

-- FOR UPDATE: blocks other FOR UPDATE and UPDATE/DELETE.
-- FOR SHARE: blocks UPDATE/DELETE but allows other FOR SHARE.

-- NOWAIT: fail immediately if locked, instead of waiting.
-- SKIP LOCKED: skip locked rows (perfect for job queues!).

-- Job queue pattern (Postgres):
SELECT * FROM jobs
WHERE status = 'pending'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;  -- grabs 10 jobs without blocking other workers
```

**SKIP LOCKED — concurrent job queue without contention**

```sql
-- The canonical pattern for concurrent job queues in SQL.

-- Worker pops a job:
BEGIN;
  SELECT id, payload FROM jobs
  WHERE status = 'pending'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  UPDATE jobs SET status = 'running', started_at = NOW()
  WHERE id = $selected_id
  RETURNING payload;
COMMIT;

-- Multiple workers can run concurrently: each gets a different job.
-- SKIP LOCKED skips rows already locked by other workers.

-- For batch processing:
  SELECT id FROM jobs WHERE status = 'pending'
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100;

-- Works on Postgres 9.5+, MySQL 8.0+, SQL Server (WITH UPDLOCK, READPAST).
```

**Advisory locks — application-level coordination**

```sql
-- Postgres advisory locks — not tied to a row, useful for cross-txn coordination.

-- Session-level (released on disconnect)
SELECT pg_advisory_lock(12345);
-- ... critical section ...
SELECT pg_advisory_unlock(12345);

-- Transaction-level (released on commit/rollback)
BEGIN;
  SELECT pg_advisory_xact_lock(12345);
  -- ... work ...
COMMIT;  -- lock released

-- Use cases: migration coordination, single-flight job execution,
-- rate-limiting by key (lock on hash(key)).

-- MySQL: GET_LOCK('name', timeout) / RELEASE_LOCK('name').
-- Advisory locks should NOT replace row locks for data integrity.
```

## Testing Patterns

**pgTAP — unit testing for Postgres**

```sql
-- pgTAP is the de-facto Postgres test framework.
-- Tests are SQL functions; assertions return void or throw on failure.

BEGIN;
  SELECT plan(3);  -- expect 3 tests

  SELECT has_table('users');
  SELECT col_type_is('users', 'email', 'text');
  SELECT has_index('users', 'users_email_key', 'unique email');

  -- Functional test
  SELECT is(full_name('Alice', 'Smith'), 'Alice Smith', 'full_name works');

  SELECT finish();
ROLLBACK;  -- roll back test data

-- Run: pg_prove tests/*.sql  (TAP-compatible output)
-- CI: integrate with pg_prove + TAP formatter.
```

**dbt tests — declarative data quality assertions**

```sql
-- dbt tests are YAML-defined assertions on data quality.
-- models/users.yml:

version: 2
models:
  - name: users
    columns:
      - name: id
        tests:
          - unique
          - not_null
      - name: email
        tests:
          - unique
          - not_null
          - accepted_values:
              values: ['admin', 'member', 'guest']  # wrong col, for illustration
      - name: role
        tests:
          - accepted_values:
              values: ['admin', 'member', 'guest']
          - relationships:
              to: ref('user_roles')
              field: role

-- Run: dbt test
-- Each test is a SELECT that returns failing rows; dbt fails the test if any rows.
```

**Test data — fixtures via INSERT or factories**

```sql
-- Pattern: wrap test data in a transaction and roll back at the end.

BEGIN;
  INSERT INTO users (id, email) VALUES (1, 'a@b.io');
  INSERT INTO users (id, email) VALUES (2, 'c@d.io');

  -- Test query
  SELECT COUNT(*) FROM users WHERE email LIKE '%@%';
  -- Assert: should return 2

ROLLBACK;  -- undo all inserts

-- For dbt / data warehouse tests: use ephemeral models or seeded test data.
-- For OLTP: use a separate test database, not production.
-- For fixtures: SQL files in tests/fixtures/, run before each test suite.
```

**Migration testing — up + down round-trip**

```sql
-- Every migration should be reversible. Test the down migration too.

-- migrations/2024_01_15_add_users_table.up.sql
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX users_email_idx ON users (email);

-- migrations/2024_01_15_add_users_table.down.sql
DROP TABLE IF EXISTS users;

-- CI: apply all up migrations, run tests, then verify all down migrations work.
-- Tools: Flyway, Liquibase, Alembic (Python), sqitch, dbt migrations.
-- Production: NEVER run destructive migrations without a backup + dry-run.
```

## Performance Tuning

- EXPLAIN ANALYZE (Postgres) / EXPLAIN EXTENDED (MySQL) shows real cost — always verify for queries touching >10k rows.
- Index strategy: composite indexes are leftmost-prefix — INDEX(a,b,c) serves WHERE a, WHERE a AND b, but not WHERE b alone.
- Covering indexes (INCLUDE in Postgres, SQL Server) let the engine skip the table fetch entirely — major speedup for hot queries.
- Partial indexes (WHERE clause on CREATE INDEX) are smaller and faster — use for sparse conditions like WHERE active = TRUE.
- JOIN algorithms: nested loop (small), hash join (large equi-join), merge join (sorted). Optimizer picks based on stats.
- Window functions (ROW_NUMBER, LAG, SUM OVER) compute over partitions without collapsing rows — the only way to mix aggregates with row-level data.
- Recursive CTEs are Turing-complete but slow for deep graphs — add depth caps and cycle guards.
- Materialized views (Postgres, Oracle) cache query results — REFRESH MATERIALIZED VIEW CONCURRENTLY avoids read locks.
- SELECT FOR UPDATE / SKIP LOCKED powers job queues (skip locked, process, delete) — Postgres/MySQL/SQL Server all support.
- Postgres VACUUM reclaims dead tuples; autovacuum is on by default. Tune autovacuum_vacuum_scale_factor for write-heavy tables.
- Postgres 15+ MERGE; earlier versions use INSERT ... ON CONFLICT (upsert only). MySQL has INSERT ... ON DUPLICATE KEY UPDATE.
- N+1 queries: load 1000 users then 1000 separate SELECT * FROM orders WHERE user_id = ? — round-trips dwarf work. Use JOIN or WHERE user_id = ANY($1::int[]).
- COUNT(*) on InnoDB (MySQL) scans the whole table — no fast count. Postgres also. Use a counter table or estimated rows.
- OFFSET pagination is O(n²) — for deep pagination use keyset (WHERE id > last_seen_id ORDER BY id LIMIT 10).
- Prepared statements / parameterized queries are mandatory for security AND faster for repeated queries (plan cached).
- Connection pooling (PgBouncer, RDS Proxy) — Postgres connections are heavy (~10MB each). Pool to ~100 per app instance.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [PostgreSQL](https://www.postgresql.org/) | Open-source RDBMS — the default choice for new apps. ACID, JSONB, extensions, mature. | build |
| [MySQL](https://www.mysql.com/) | Open-source RDBMS — historical default for LAMP stack. Simpler than Postgres, widely deployed. | build |
| [SQLite](https://www.sqlite.org/) | Embedded SQL — single-file database, zero-config. The most-deployed DB in the world. | build |
| [SQL Server](https://www.microsoft.com/sql-server) | Microsoft's RDBMS — enterprise Windows ecosystem, T-SQL dialect, SSRS/SSIS integration. | build |
| [Oracle Database](https://www.oracle.com/database/) | Enterprise RDBMS — PL/SQL, OLAP, decades of feature depth. Expensive. | build |
| [Snowflake](https://www.snowflake.com/) | Cloud data warehouse — separate compute + storage, scales elastically, SQL dialect close to Postgres. | build |
| [BigQuery](https://cloud.google.com/bigquery) | Google's cloud warehouse — columnar, serverless, fast analytics on petabytes. | build |
| [DuckDB](https://duckdb.org/) | In-process OLAP database — SQLite for analytics. Fast SQL on Parquet/CSV, no server. | build |
| [dbt (data build tool)](https://www.getdbt.com/) | SQL-first transformation framework — version-controlled models, tests, docs. The modern analytics workflow. | build |
| [Flyway](https://flywaydb.org/) | Database migration tool — versioned SQL scripts, schema history table. Java ecosystem. | build |
| [Liquibase](https://www.liquibase.org/) | Database migration — XML/YAML/SQL changesets, rollback support, multiple DBs. | build |
| [Alembic](https://alembic.sqlalchemy.org/) | Python (SQLAlchemy) migration tool — auto-generates migrations from model changes. | build |
| [pgTAP](https://pgtap.org/) | Unit testing framework for Postgres — TAP-compatible, runs as SQL functions. | test |
| [sqlfluff](https://www.sqlfluff.com/) | Linter + formatter — dialect-aware, enforces style + catches bugs (SELECT *, missing WHERE). | lint |
| [pgAdmin / DBeaver](https://www.pgadmin.org/) | GUI clients — Postgres-specific (pgAdmin) vs multi-DB (DBeaver). Schema browsing, query editor. | debug |
| [DataGrip](https://www.jetbrains.com/datagrip/) | JetBrains' SQL IDE — multi-database, refactoring, autocomplete, integrated explain plans. | build |
| [PgBouncer](https://www.pgbouncer.org/) | Connection pooler for Postgres — reduces per-connection overhead, multiplexes. | deploy |
| [use-the-index-luke](https://use-the-index-luke.com/) | Free online book on indexing + query optimization — the canonical resource. | debug |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| SQL-86 | 1986 | First ANSI standard — basic DDL/DML, no constraints, no joins syntax. |
| SQL-89 | 1989 | Minor revision — Integrity Enhancement Feature (CHECK, FOREIGN KEY). |
| SQL-92 | 1992 | Major revision — JOIN syntax, CASE, outer joins, transaction isolation levels. Most SQL you write is SQL-92. |
| SQL:1999 | 1999 | Recursive CTEs, triggers, regex (SIMILAR TO), boolean + array types, OLAP functions. |
| SQL:2003 | 2003 | Window functions (OVER, PARTITION BY), MERGE statement, XML support, generated columns. |
| SQL:2006 | 2006 | XML manipulation, XQuery integration. Largely ignored in practice. |
| SQL:2008 | 2008 | INSTEAD OF triggers, TRUNCATE, FETCH FIRST n ROWS ONLY (offset pagination standard). |
| SQL:2011 | 2011 | Temporal tables (system-versioned) — history tracking at the DB level. |
| SQL:2016 | 2016 | JSON support (JSON_TABLE, JSON_VALUE), row pattern matching (MATCH_RECOGNIZE), polymorphic tables. |
| SQL:2019 | 2019 | SQL/PGQ (Property Graph Queries), optional features for OLAP. |
| SQL:2023 | 2023 | Property Graph Queries (SQL/PGQ) mandatory, SQL/JSON improvements, new data types. |
| Postgres 9.5 | 2016 | UPSERT (ON CONFLICT), SKIP LOCKED, Row-Level Security, BRIN indexes. |
| Postgres 10 | 2017 | Native partitioning, logical replication, declarative partitioning. |
| Postgres 13 | 2020 | Deduplication in B-tree indexes, improved vacuum, CTE inlining by default. |
| Postgres 14 | 2021 | JSONB subscripting (data['key']), connection pooling improvements, faster sort. |
| Postgres 15 | 2022 | MERGE statement, logical replication improvements, performance gains. |
| Postgres 16 | 2023 | Parallel query improvements, extended stats on expressions, COPY FROM more flexible. |
| Postgres 17 | 2024 | Faster vacuum, incremental backup, SQL/JSON MERGE, better failover. |
| Postgres 18 | 2025 | Asynchronous I/O for heap scans (read_stream API), OAuth authentication for SASL/SCRAM, virtual generated columns. Current: 18.6 (Aug 2026 security release); PG 19 at RC. |

## Interview Hot Questions

1. **Explain the logical order of SQL evaluation vs written order.** *(medium)*

   Written: SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY. Evaluated: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. This explains why you can't reference a SELECT alias in WHERE (not computed yet) but can in ORDER BY (it has). It also explains why WHERE filters before GROUP BY but HAVING filters after — HAVING can reference aggregates, WHERE can't. The optimizer may reorder operations for performance, but the semantics follow this logical order.

2. **Why does NULL break everything, and how do you handle it?** *(easy)*

   NULL is 'unknown', not 'zero' or 'empty'. NULL = NULL is NULL (not true), so WHERE col = NULL returns no rows — use IS NULL. NULL <> 5 is NULL, so WHERE col != 5 EXCLUDES NULL rows — use IS DISTINCT FROM. NOT IN (subquery with NULL) returns no rows (NULL propagation). COUNT(*) counts rows; COUNT(col) ignores NULLs. Aggregates (SUM, AVG) ignore NULLs by default. Always decide explicitly: filter (WHERE col IS NOT NULL), coalesce (COALESCE(col, 0)), or use NULL-safe operators (IS DISTINCT FROM).

3. **What's the difference between WHERE and HAVING?** *(easy)*

   WHERE filters rows BEFORE grouping and aggregation — it can't reference aggregates. HAVING filters groups AFTER aggregation — it CAN reference aggregates (HAVING COUNT(*) > 5). Logical order: WHERE → GROUP BY → HAVING. Use WHERE for row-level filters (cheaper — fewer rows to aggregate), HAVING for group-level filters (necessary for aggregate conditions). A common mistake is putting aggregate conditions in WHERE — it's a syntax error.

4. **Explain the different JOIN types and when to use each.** *(medium)*

   INNER JOIN: only matching rows from both tables. LEFT JOIN: all left rows + matching right (NULL for unmatched). RIGHT JOIN: same as LEFT but reversed. FULL OUTER JOIN: all rows from both, NULL-filled where unmatched. CROSS JOIN: Cartesian product (every left × every right). Use INNER for strict matches, LEFT when you want to surface missing matches (e.g., users with no orders), FULL when you want both sides' unmatched rows (rare). CROSS for generating combinations. Beware: LEFT JOIN + WHERE on right table converts to INNER — move right filters into ON.

5. **How do indexes work and how do you choose what to index?** *(medium)*

   An index is a separate sorted structure (usually B-tree) that lets the engine find rows without scanning the table. Create indexes on columns used in WHERE, JOIN ON, ORDER BY, and GROUP BY. Composite indexes are leftmost-prefix: INDEX(a, b, c) serves WHERE a, WHERE a AND b, but not WHERE b alone. Choose index order by selectivity (most selective first) and by query patterns. Use EXPLAIN ANALYZE to verify the index is used — the optimizer may choose a seq scan if the table is small or the index isn't selective. Over-indexing hurts write performance (every INSERT/UPDATE maintains indexes).

6. **What are window functions and when are they essential?** *(medium)*

   Window functions compute per-row over a sliding partition WITHOUT collapsing rows — like an aggregate that keeps the row. ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) ranks within each department without losing individual rows. Use cases: top-N per group, running totals, lag/lead (time-series deltas), gaps-and-islands (sessionization). They're the only way to mix aggregate values with row-level data in a single query — the alternative is multiple subqueries or self-joins, which are slower and harder to read.

7. **Explain transaction isolation levels and the anomalies they prevent.** *(hard)*

   Four standard levels (least to most isolated): READ UNCOMMITTED (dirty reads — rare, Postgres treats as READ COMMITTED), READ COMMITTED (no dirty reads, but non-repeatable reads + phantoms), REPEATABLE READ (no non-repeatable reads; Postgres also prevents phantoms via MVCC, MySQL doesn't fully), SERIALIZABLE (full isolation, as if transactions ran one at a time). Higher isolation = more locking/snapshot overhead. Postgres uses MVCC (multi-version concurrency control) — readers don't block writers and vice versa. Default is READ COMMITTED for OLTP; SERIALIZABLE for critical analytics where consistency > throughput.

8. **How does SELECT FOR UPDATE SKIP LOCKED power a job queue?** *(medium)*

   FOR UPDATE locks the row for the duration of the transaction, preventing other workers from grabbing it. SKIP LOCKED skips rows already locked — so multiple workers can concurrently select different jobs without blocking each other. The pattern: BEGIN; SELECT id FROM jobs WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10; UPDATE jobs SET status='running' WHERE id IN (...); COMMIT;. Workers naturally distribute work without coordination. Works on Postgres 9.5+, MySQL 8.0+, SQL Server (WITH UPDLOCK, READPAST).

9. **What's the N+1 query problem and how do you fix it?** *(easy)*

   N+1: load 1000 users with one query, then 1000 separate SELECT * FROM orders WHERE user_id = ? queries — the round-trips dwarf the actual work. ORMs hide this behind lazy accessors (user.orders triggers a query). Fixes: (1) JOIN — SELECT users.*, orders.* FROM users JOIN orders (one query, may duplicate user data); (2) WHERE user_id = ANY($1::int[]) — fetch all orders for a list of users in one query, group in app code; (3) ORM eager loading (Django: select_related/prefetch_related, Rails: includes, SQLAlchemy: joinedload/selectinload). Always log query count per request to detect N+1.

10. **How would you optimize a slow query?** *(hard)*

   Step 1: EXPLAIN ANALYZE to see the actual plan. Step 2: Look for Seq Scan on large tables (missing index), nested loops on large inputs (wrong join algorithm), filesort (missing index on ORDER BY column), temporary tables (large GROUP BY without covering index). Step 3: Add indexes on WHERE/JOIN/ORDER BY columns; consider composite + covering (INCLUDE) indexes. Step 4: Rewrite — replace correlated subqueries with joins, replace DISTINCT with EXISTS, replace OFFSET pagination with keyset. Step 5: Denormalize if reads >> writes — materialized view, computed column, summary table. Step 6: Partition large tables by date/range. Always measure before/after — premature optimization wastes time.

## When to Choose This

- **vs NoSQL (MongoDB):** use this — Relational data with complex joins, transactional OLTP, anywhere ACID + ad-hoc queries matter, established tooling.; use that — Document-shaped data with flexible schema, read-heavy workloads, anywhere horizontal scaling + developer ergonomics beat relational guarantees.
- **vs Graph DBs (Neo4j):** use this — Tabular OLTP/OLAP, anywhere joins are well-defined and you don't traverse graphs 5+ levels deep.; use that — Graph traversal (friends-of-friends, recommendation, fraud rings) where recursive CTEs are 10-100x slower than native graph queries.
- **vs Document DBs (Firestore, DynamoDB):** use this — Complex analytical queries, joins, transactions, anywhere you need SQL's expressiveness.; use that — Serverless apps with simple key-based access, anywhere you want infinite scale without ops and don't need joins.
- **vs DuckDB / columnar OLAP:** use this — OLTP workloads (insert/update/delete per row), anywhere row-level ACID matters, ad-hoc OLTP queries.; use that — Pure analytics on large datasets (columnar scans 10-100x faster than row stores), embedded use (no server), data-science workflows.
- **vs Pandas / Polars (in-memory):** use this — Data > RAM, multi-user concurrent access, transactional integrity, anywhere the data already lives in a database.; use that — Interactive analysis on small data (<5M rows), anywhere you need ML/scientific libraries that don't speak SQL natively.

