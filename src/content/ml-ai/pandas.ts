import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "pandas",
  name: "pandas",
  category: "ml-ai",
  tier: "ml",
  tags: ["python", "data-analysis", "dataframes", "etl", "tabular", "wrangling"],
  tagline: "The Python dataframe library — ingest, clean, transform, and aggregate tabular data at practical scale.",
  year: 2008,
  author: "Wes McKinney",
  lastUpdated: "2026-11",
  readingTime: 27,

  tldr: [
    "pandas gives Python an in-memory table (DataFrame: typed columns + an index) plus the operations that cover ~90% of data work: filtering, joins, group-aggregations, reshaping, and time-series alignment.",
    "It is the lingua franca of the Python data stack (PyPI download volume in the tens of millions/day, Nov 2026) and the front door to everything downstream: scikit-learn, matplotlib, Jupyter. Version 3.x (3.1.1 current) brought copy-on-write default, string dtype, and parallel CSV reads.",
    "Reach for pandas when data fits comfortably in RAM (up to ~10-50GB with care on a workstation) and the work is interactive/analytical: exploration, reporting, feature engineering, ETL glue.",
    "Beyond RAM, move to Polars (lazy, multi-threaded, faster), DuckDB (SQL over files), Spark/Dask (distributed) — but learn pandas first: it is the interface every data tool in Python still speaks.",
  ],

  mentalModel: {
    title: "A DataFrame is a dict of columns glued to an index",
    body: "Underneath, a DataFrame is an OrderedDict of column name → NumPy-backed Series, plus an index that labels rows. Every operation — filter, groupby, join — either transforms the block data, manipulates the index, or both. This explains the daily puzzles: alignment (operations match on index, not position — the source of silent NaNs), the axis parameter (0=down columns, 1=across rows), why a filter returns a copy you must assign back (chain-assignment is gone under copy-on-write in 2.x+/3.x), and why method chaining (df.query().assign().groupby()...) is the idiomatic style — each method returns a new frame, so you compose left-to-right instead of mutating in place. Think 'immutable tables + SQL-like expressions in Python' and the API stops surprising you.",
  },

  constructs: [
    { syntax: "df.loc[rows, cols] / df.iloc[i, j]", behavior: "Label-based vs position-based indexing — the distinction that ends 90% of indexing confusion.", when: "Use loc with masks and labels ('price' > 5, ['a':'c']); iloc only for numeric positions." },
    { syntax: "df[df.col > 5] / df.query('col > 5')", behavior: "Boolean-mask filtering; query() parses an expression string (often faster, always more readable for compound masks).", when: "query() for 3+ conditions or variables with @; masks for simple cases." },
    { syntax: "df.groupby('k')['v'].agg(...)", behavior: "split-apply-combine: partition rows by key, aggregate each group, stitch back.", when: "The workhorse — every report, every feature, every rollup is a groupby." },
    { syntax: "pd.merge(l, r, on='k', how='left')", behavior: "SQL-style join: inner/left/right/outer on key columns with suffixes for collisions.", when: "Enriching facts with dimensions. how= controls semantics exactly like SQL." },
    { syntax: "df.assign(col=expr) / df['col'] = ...", behavior: "New/derived columns — assign returns a new frame (chainable); [] mutates in place.", when: "assign() inside method chains; [] for scripts. In 3.x, all data is copy-on-write — chained assignment is gone." },
    { syntax: "df.resample('D').sum()", behavior: "Time-based groupby over a DatetimeIndex — frequency conversion + aggregation in one call.", when: "Time series: OHLC bars, daily rollups, rolling windows (rolling().mean())." },
    { syntax: "df.melt / df.pivot / pivot_table", behavior: "Wide↔long reshaping: melt = columns→rows, pivot = rows→columns.", when: "Tidy-data conversions — most ML libs and viz tools want long format." },
    { syntax: "df.isna().sum() / fillna / dropna", behavior: "Missing-data triad: quantify, impute, or remove.", when: "First five minutes of any dataset. fillna(method=...) is deprecated → ffill()/bfill()." },
    { syntax: "df.astype({'col': 'int32'}) / convert_dtypes()", behavior: "Explicit dtype coercion; convert_dtypes() picks the nullable modern types.", when: "Memory and correctness: object→category for low-cardinality strings, float64→float32 halves memory." },
    { syntax: "pd.read_csv(..., dtype=..., parse_dates=..., usecols=...)", behavior: "Typed ingestion — 2-3x faster and parallel across cores by default in 3.1 (mode.max_threads).", when: "ALWAYS declare dtypes/usecols for big files; the defaults (object, everything) waste RAM." },
  ],

  patterns: [
    {
      lang: "python",
      caption: "The method-chain style (readable pipelines)",
      code: `import pandas as pd

report = (
    pd.read_csv("events.csv", parse_dates=["ts"], dtype={"sku": "category"})
      .query("ts >= '2026-01-01' and status == 'ok'")
      .assign(
          revenue=lambda d: d.qty * d.unit_price,
          day=lambda d: d.ts.dt.floor("D"),
      )
      .groupby(["day", "region"], observed=True)
      .agg(revenue=("revenue", "sum"),
           orders=("order_id", "nunique"),
           aov=("revenue", "mean"))
      .reset_index()
      .sort_values(["day", "revenue"], ascending=[True, False])
)
# Why chains: each step is a pure function of the last —
# no intermediate variables, no mutation surprises, and the
# whole pipeline reads top-to-bottom like a query plan.`,
    },
    {
      lang: "python",
      caption: "Group-by patterns beyond sums",
      code: `# Named aggregation (explicit, no MultiIndex surprises)
agg = df.groupby("customer_id").agg(
    ltv=("amount", "sum"),
    n_orders=("order_id", "count"),
    first_purchase=("ts", "min"),
    last_purchase=("ts", "max"),
    favorite_cat=("category", lambda s: s.mode().iat[0]),
)

# Per-group top-N: sort + groupby.head — no apply loop
top3 = (df.sort_values("amount", ascending=False)
          .groupby("customer_id").head(3))

# Window functions: transform = result aligned to original rows
df["share"] = df.amount / df.groupby("region").amount.transform("sum")
df["rank"]  = df.groupby("region").amount.rank(ascending=False, method="dense")

# Rolling time windows (need sorted DatetimeIndex)
s = df.set_index("ts").sort_index().amount
ma7  = s.rolling("7D").mean()          # time-based, not row-based
ema  = s.ewm(span=14).mean()           # exponential decay`,
    },
    {
      lang: "python",
      caption: "Joins, anti-joins, and dedupe (SQL-thinking)",
      code: `# LEFT JOIN with dimension table
enriched = orders.merge(customers[["id", "region", "tier"]],
                        left_on="customer_id", right_on="id",
                        how="left", validate="m:1")

# ANTI JOIN — rows in orders with NO matching customer (data quality)
orphans = orders.merge(customers["id"], left_on="customer_id",
                        right_on="id", how="left", indicator=True)
orphans = orphans.query("_merge == 'left_only'").drop(columns="_merge")

# Dedupe: keep the latest row per key
latest = (df.sort_values("ts")
            .drop_duplicates("customer_id", keep="last"))

# validate= documents the join contract and FAILS loudly if
# violated: '1:1', '1:m', 'm:1', 'm:m' — free data tests.`,
    },
    {
      lang: "python",
      caption: "Missing data and dtypes — the first 10 minutes",
      code: `def profile(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "dtype":     df.dtypes.astype(str),
        "n_null":    df.isna().sum(),
        "null_pct":  (df.isna().mean() * 100).round(1),
        "n_unique":  df.nunique(),
        "sample":    df.iloc[0],
    })

# Fix the usual suspects:
out = (
    df
    .convert_dtypes()                          # nullable Int64, string, boolean
    .astype({"country": "category"})           # low-cardinality strings
    .assign(
        signup_date=lambda d: pd.to_datetime(d.signup_date, errors="coerce"),
        age=lambda d: d.age.fillna(d.age.median()),
        canceled=lambda d: d.canceled.fillna(False),
    )
    .dropna(subset=["customer_id"])            # unrecoverable rows only
)
# Memory win: object → category on repeated strings is 10-100x;
# float64 → float32 halves numeric columns when precision allows.`,
    },
    {
      lang: "python",
      caption: "In and out: files, SQL, and Parquet",
      code: `# CSV in (typed, only needed columns) — 3.1: parallel by default
df = pd.read_csv("big.csv", usecols=["ts", "sku", "qty"],
                 dtype={"sku": "category"}, parse_dates=["ts"])

# CSV out without the index (unless you meant to keep it)
df.to_csv("out.csv", index=False)

# Parquet: columnar, typed, compressed, 5-20x smaller than CSV —
# the interchange format for everything data
df.to_parquet("events.parquet", compression="zstd", index=False)
df = pd.read_parquet("events.parquet", columns=["ts", "qty"])  # column pruning

# SQL in/out (read_sql with params — never f-string SQL!)
import sqlalchemy as sa
eng = sa.create_engine("postgresql://app@dw/prod")
rows = pd.read_sql(sa.text(
    "SELECT * FROM events WHERE ts >= :since"), eng,
    params={"since": "2026-11-01"}, parse_dates=["ts"])
pd.io.sql.to_sql(df, "stg_events", eng, if_exists="replace", index=False)`,
    },
  ],

  pitfalls: [
    { title: "Running 2.x code on 3.x unchanged", symptom: "Chained assignment silently no-ops; inplace= arguments error on some paths.", fix: "3.x is copy-on-write mandatory: use single .loc[...] = statements, replace inplace=True with assignment (PDEP-8), and run the 2.x deprecation warnings first." },
    { title: "Index alignment producing silent NaNs", symptom: "Adding two Series/DataFrames gives a column of NaNs — or row counts mysteriously grow after arithmetic.", fix: "Operations align on index labels, not positions. Reset/set indexes deliberately at boundaries (df.reset_index(drop=True) after filters); when you want positional math, use .to_numpy(). This is THE pandas footgun — check index equality first when arithmetic goes weird." },
    { title: "SettingWithCopy (mutating a slice)", symptom: "df[df.a > 5]['b'] = 1 silently does nothing — or raised warnings in 1.x/2.x.", fix: "One indexing operation per statement: df.loc[df.a > 5, 'b'] = 1. pandas 2.x+ copy-on-write makes chained assignment a hard error/no-op — modernize code instead of suppressing warnings." },
    { title: "object dtype eating your RAM", symptom: "A 5M-row string column takes 500MB; groupby/str ops crawl.", fix: "astype('category') for repeated strings (10-100x memory), string dtype in 2.x+/3.x (Arrow-backed) instead of object, float32/int32 when precision allows. df.info(memory_usage='deep') shows the truth." },
    { title: "apply() where vectorized ops exist", symptom: "df.apply(lambda row: ..., axis=1) over millions of rows takes minutes.", fix: "axis=1 apply is a Python loop in disguise. Use column expressions (df.a + df.b), .str/.dt accessors, np.where/pd.cut for branching, and only drop to apply/map for genuinely row-local logic. 10-100x is typical." },
    { title: "Iterating rows instead of vectorizing", symptom: "for _, row in df.iterrows() anywhere in the codebase.", fix: "iterrows materializes a Series per row (slow, dtype-lossy). Vectorize first; itertuples if you must loop (10x faster); numpy conversion (.to_numpy()) for numeric kernels; numba for tight loops." },
    { title: "merge surprises: duplicates exploding row counts", symptom: "LEFT JOIN returns more rows than the left table — the right side had duplicate keys.", fix: "validate='m:1' (or '1:1') fails loudly on contract violation; dedupe the dimension first; check with indicator=True + _merge counts after any suspicious join. Row-count asserts around merges are free tests." },
    { title: "Timezone-naive datetime arithmetic", symptom: "Timestamps subtract wrongly around DST; comparisons across regions are off by hours.", fix: "Localize then convert: pd.to_datetime(...).dt.tz_localize('UTC') at ingestion; convert to the reporting tz (.dt.tz_convert('Europe/Berlin')) at display. Naive vs aware comparisons raise or lie — standardize on UTC internally." },
    { title: "GroupBy on category with unseen buckets", symptom: "groupby('cat_col') returns rows for categories with zero observations (NaNs), or observed=True differences confuse outputs.", fix: "Pass observed=True (2.x default for categorical groupers in many paths) to drop empty buckets; or use .astype(str) when you don't want categorical semantics at all." },
  ],

  quickReference: [
    { fact: "Learning path: 100 pandas puzzles → user guide (groupby, merge) → pandera for validation → Polars for scale.", tag: "learning" },
    { fact: "Current: pandas 3.1.1 (Nov 2026). 3.0 (Jan 2026): copy-on-write mandatory, Arrow-backed default string dtype; 3.1: parallel read_csv + 2-3x faster single-threaded parser, DataFrame.select() with pd.col() expressions, inplace deprecated.", tag: "version" },
    { fact: "Requires Python 3.11+; NumPy minimum 1.26 (2.x recommended); the default `str` dtype is Arrow-backed, PyArrow optional.", tag: "version" },
    { fact: "Copy-on-write (2.x opt-in, 3.x mandatory): no more silent views — every write copies. Chained assignment is gone; .loc[...] = is the write path.", tag: "behavior" },
    { fact: "Axis semantics: 0/'index' = down (per column), 1/'columns' = across (per row). 'agg by default' rule: reductions collapse along the axis.", tag: "indexing" },
    { fact: "loc = labels (mask, slices by label), iloc = positions, [] = column access or label-slice on the index. at/iat are scalar fast paths.", tag: "indexing" },
    { fact: "Memory: object strings → category (10-100x on repeated values), float64 → float32 (50%), int64 → int32/16 where safe; df.info(memory_usage='deep') for truth.", tag: "memory" },
    { fact: "Parquet >> CSV for storage: typed, columnar, compressed, preserves dtypes/dates exactly; read only needed columns for free pruning.", tag: "io" },
    { fact: "Polars is 5-20x faster on large frames (multi-threaded, lazy) and reads/writes the same Parquet; DuckDB queries Parquet/CSV with SQL in-process — both interop with pandas via .to_pandas()/arrow.", tag: "ecosystem" },
    { fact: "observed=True in groupby(categorical) drops empty buckets — the silent- NaN-report fix.", tag: "gotcha" },
    { fact: "df.compare(other) shows cell-level diffs; df.equals checks exact equality incl. dtypes — the two lines that end 'are these frames the same' debates.", tag: "debug" },
    { fact: "Rolling with a time offset ('7D') is time-aware — window = wall-clock span, not row count; needs sorted DatetimeIndex.", tag: "timeseries" },
    { fact: "df.sample(frac=0.1, random_state=42) for quick exploration on big data — profile on the sample, verify on the full set.", tag: "workflow" },
    { fact: "Never build DataFrames row by row in a loop — collect dicts/tuples first, then one pd.DataFrame(rows) construction (100x+).", tag: "perf" },
  ],

  goDeeper: [
    { title: "pandas official documentation", url: "https://pandas.pydata.org/docs/", note: "The User Guide's indexing and groupby pages are required reading — 90% of confusion lives there." },
    { title: "pandas 3.1.0 release notes", url: "https://pandas.pydata.org/docs/whatsnew/v3.1.0.html", note: "What changed in the 3.x era: copy-on-write, parallel CSV, select() expressions." },
    { title: "Modern pandas (Ted Petrou)", url: "https://tdpetrou.com/modern-pandas", note: "Method-chaining style and the pre-2.x patterns that led to copy-on-write — the 'why' behind the API." },
    { title: "Polars user guide", url: "https://docs.pola.rs/", note: "The lazy/multi-threaded successor for >RAM-adjacent frames; learn after pandas, not instead." },
    { title: "DuckDB documentation", url: "https://duckdb.org/docs/", note: "SQL over Parquet/CSV at OLAP speeds, zero server — the pandas-complement for file-based analytics." },
  ],

  // ─── §8 "Data types" — dtypes are the whole game ─────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "int64 / Int64 (nullable)", behavior: "64-bit signed; capital Int64 is the nullable variant (NA-safe, slightly slower).", when: "Counts, IDs, years. Use nullable Int64 whenever NaN can appear (merged data)." },
      { syntax: "float64 / float32", behavior: "IEEE doubles default; float32 halves memory with ~7 decimal digits.", when: "float64 for computation, float32 for storage of big measured values. NaN is a float — int columns with NaN need Int64." },
      { syntax: "bool / boolean", behavior: "Plain and nullable boolean.", when: "Flags. Use boolean (nullable) if filters can leave NA." },
      { syntax: "string / object", behavior: "string = Arrow-backed modern dtype (2.x+/3.x default); object = legacy Python-str column.", when: "string everywhere in new code; object only as a bug indicator." },
      { syntax: "datetime64[ns, tz] / timedelta64", behavior: "Nanosecond datetimes with optional timezone; timedeltas from subtraction.", when: "Always parse dates at ingestion; keep UTC internally (.dt.tz_convert at display)." },
      { syntax: "category", behavior: "Dictionary-encoded: integer codes + unique values.", when: "Repeated strings (country, status): 10-100x memory, faster groupby; high-cardinality categories backfire." },
    ],
    collections: [
      { syntax: "Series", behavior: "One labeled column (values + index) — the atom every op returns.", when: "Intermediate results, single-column math, .str/.dt accessors." },
      { syntax: "DataFrame", behavior: "Column table over a shared index; internally column-blocks.", when: "Everything tabular; column ops are cheap, row ops are loops." },
      { syntax: "MultiIndex (hierarchical)", behavior: "Tuples as index keys — subsetting across multiple dimensions.", when: "Pivot outputs and panel data; flatten early (reset_index) unless you need it." },
      { syntax: "Index types (Range/Datetime/CategoricalIndex)", behavior: "Immutable label arrays optimized per dtype.", when: "You touch them via set_index/reset_index/reindex almost exclusively." },
    ],
    custom: [
      { syntax: "df.attrs / namedtuples via itertuples", behavior: "Metadata bag / typed row iteration.", when: "Light provenance (attrs); itertuples for row-local loops (10x over iterrows)." },
      { syntax: "Extension arrays (Arrow, nullable)", behavior: "Third-party dtype system — Int64, string, ArrowDtype integration.", when: "ArrowDtype('large_string') for zero-copy interop with Polars/DuckDB." },
      { syntax: "pd.NamedAgg / aggregation specs", behavior: "Explicit (output_name=(source, func)) mapping in .agg().", when: "Every multi-metric groupby — kills the MultiIndex-column surprise." },
    ],
  },

  // ─── §9 Operators & expressions ───────────────────────────────────────────
  operators: [
    { syntax: "& | ~ (and/or/not)", behavior: "Element-wise boolean combos — parentheses mandatory (binding precedence).", when: "df[(df.a > 5) & (df.b == 'x')] — the #1 syntax error in pandas is missing parens with and/or." },
    { syntax: "== != > < >= <=", behavior: "Element-wise comparison returning boolean Series; NaN comparisons yield NA in nullable dtypes.", when: "Masks everywhere. == on float columns: consider np.isclose for tolerance." },
    { syntax: "+ - * / ** % //", behavior: "Column math aligned on index; missing labels → NaN.", when: "Feature engineering; mixed dtypes promote (int+float → float)." },
    { syntax: "isin([...]) / between(a, b)", behavior: "Membership / range predicates returning boolean Series.", when: "Filtering to sets of keys — far better than OR-chains." },
    { syntax: "str.contains / str.match / dt.between_time", behavior: "Accessor namespaces for string/time element-wise ops.", when: "Text filters (regex on str), time-of-day windows on datetime indexes." },
    { syntax: "np.where(cond, x, y) / pd.cut", behavior: "Vectorized if/else; bin continuous values into discrete buckets.", when: "Branching features and histograms — never apply(lambda) for these." },
  ],

  // ─── §10 Input / output ───────────────────────────────────────────────────
  inputOutput: [
    {
      lang: "python",
      caption: "Typed ingestion patterns for every source",
      code: `# CSV — declare everything you know upfront (3.1: parallel by default)
df = pd.read_csv(
    "events.csv",
    usecols=lambda c: c not in ("internal_notes", "debug"),
    dtype={"region": "category", "sku": "category"},
    parse_dates=["ts"],
    na_values=["", "NULL", "\\N"],
    thousands=",",
)

# JSON lines — records orientation streams well
df = pd.read_json("events.jsonl", lines=True, dtype={"sku": "category"})

# Excel — multiple sheets, dates
sheets = pd.read_excel("report.xlsx", sheet_name=None, parse_dates=["date"])
df = pd.concat(sheets.values(), ignore_index=True)

# Clipboard / dict / SQL — the quick paths
df = pd.read_clipboard(sep="\\t")
df = pd.DataFrame({"a": [1, 2], "b": ["x", "y"]})

# Parquet with column pruning + row filters (predicate pushdown)
df = pd.read_parquet("events.parquet", columns=["ts", "qty"],
                     filters=[("ts", ">=", "2026-10-01")])`,
    },
    {
      lang: "python",
      caption: "Output: formats with intent",
      code: `# Parquet for anything that will be read again (typed, zstd, fast)
df.to_parquet("out.parquet", compression="zstd", index=False)

# CSV for interchange with non-Python humans
df.to_csv("out.csv", index=False)

# Excel for stakeholders (multi-sheet reports)
with pd.ExcelWriter("report.xlsx", engine="xlsxwriter") as xl:
    summary.to_excel(xl, sheet_name="summary", index=False)
    detail.to_excel(xl, sheet_name="detail", index=False)

# Markdown/HTML for chat & docs — the underrated ones
print(df.to_markdown(index=False))     # paste into PRs/tickets
print(df.describe().to_string())       # terminal-safe

# Chunked writing for huge frames:
for i, chunk in enumerate(pd.read_csv("big.csv", chunksize=500_000)):
    chunk.to_parquet(f"parts/part-{i:04d}.parquet", index=False)`,
    },
  ],

  // ─── §11 Loops & iteration ────────────────────────────────────────────────
  loops: [
    {
      lang: "python",
      caption: "Vectorize first; loop last",
      code: `# BAD: row loop for a conditional feature
# df["tier"] = [ "high" if q > 100 else "low" for q in df.qty ]  # slow-ish
# WORSE: df.apply(lambda r: ..., axis=1)                        # Python-speed
# GOOD: vectorized select
df["tier"] = np.select(
    [df.qty > 1000, df.qty > 100],
    ["platinum", "gold"],
    default="standard",
)

# Element-wise string ops: .str namespace (vectorized C)
df["domain"] = df.email.str.extract(r"@(.+)$")

# Genuinely row-local logic (state machine, API call):
out = [enrich(row.sku) for row in df.itertuples(index=False)]
df["extra"] = out                                  # collect-then-assign

# Group-level custom logic: apply on groups, return frame/Series
def cohort(g: pd.DataFrame) -> pd.Series:
    return pd.Series({"retention": (g.active_days / g.total_days).mean()})
metrics = df.groupby("cohort").apply(cohort, include_groups=False)

# Iterating chunks of a huge file without loading it:
for chunk in pd.read_csv("10GB.csv", chunksize=250_000):
    process(chunk)`,
    },
  ],

  // ─── §12 Functions & callables ────────────────────────────────────────────
  functions: [
    {
      lang: "python",
      caption: "Reusable transforms: pipe and named aggs",
      code: `# .pipe() — slot your functions into method chains
def drop_unseen_categories(df: pd.DataFrame, col: str,
                           keep: list[str]) -> pd.DataFrame:
    return df[df[col].isin(keep)]

def add_ratios(df: pd.DataFrame) -> pd.DataFrame:
    return df.assign(
        margin=(df.revenue - df.cost) / df.revenue,
        aov=df.revenue / df.orders,
    )

clean = (
    raw
      .pipe(drop_unseen_categories, "region", keep=VALID_REGIONS)
      .pipe(add_ratios)
      .query("margin > 0")
)
# pipe passes the frame as the first arg — your functions stay
# plain, typed, unit-testable, and chainable.

# Named aggregation = self-documenting groupby:
summary = orders.groupby("region").agg(
    revenue=("revenue", "sum"),
    mean_order=("revenue", "mean"),
    worst=("revenue", lambda s: s.quantile(0.05)),
)`,
    },
  ],

  // ─── §13 Error handling ───────────────────────────────────────────────────
  errorHandling: [
    {
      lang: "python",
      caption: "Fail loud: data validation patterns",
      code: `# Parse defensively at the boundary:
df["ts"] = pd.to_datetime(df["ts"], errors="coerce")   # bad → NaT
n_bad = df["ts"].isna().sum()
if n_bad > 0:
    raise ValueError(f"{n_bad} rows have unparseable timestamps")

# Merge contracts: validate fails on violation (free data test)
out = left.merge(right, on="id", how="left", validate="m:1")

# Post-transform invariants (assert the obvious, catch the silent):
assert df["customer_id"].is_unique or True  # document intent
assert (df["qty"] >= 0).all(), "negative quantities leaked in"
assert df["ts"].dt.tz is not None or df["ts"].isna().all()

# Range checks on ingestion with a schema lib (pandera):
import pandera as pa
schema = pa.DataFrameSchema({
    "qty": pa.Column(int, pa.Check.ge(0)),
    "email": pa.Column(str, pa.Check.str_matches(r".+@.+"), nullable=True),
})
schema.validate(df, lazy=True)   # collects ALL violations at once`,
    },
  ],

  // ─── §14 "Concurrency" — performance model ───────────────────────────────
  concurrency: [
    {
      lang: "python",
      caption: "Scale ladder: what to reach for when it's slow",
      code: `# 1) Vectorize (numpy/C speed — 10-100x over apply):
df["rev"] = df.qty * df.price

# 2) Fix dtypes (category, float32, drop columns) — memory = speed

# 3) Chunk instead of load-all:
for chunk in pd.read_csv("big.csv", chunksize=500_000): ...

# 4) Only load what you need:
df = pd.read_parquet("f.parquet", columns=[...], filters=[("ts",">=",t0)])

# 5) Parallelize across cores (3.1 read_csv does; for transforms):
import multiprocessing as mp
with mp.Pool(8) as pool:
    parts = pool.map(transform, np.array_split(df, 8))
out = pd.concat(parts)

# 6) Leave pandas:
#    Polars   — lazy multi-threaded DataFrames, 5-20x
#    DuckDB   — SQL over Parquet, spills to disk gracefully
#    Dask/Spark — cluster-scale when one machine truly can't

# The GIL note: pandas releases it inside numpy kernels, so
# threads help IO (reading), not pure-Python transforms.`,
    },
  ],

  // ─── §15 Testing ──────────────────────────────────────────────────────────
  testing: [
    {
      lang: "python",
      caption: "Testing data pipelines",
      code: `import pandera as pa
import pandas as pd

# Schema contract (runs in CI before the pipeline is trusted):
Orders = pa.DataFrameSchema({
    "order_id": pa.Column(int, unique=True),
    "ts":       pa.Column(pa.DateTime, coerce=True),
    "region":   pa.Column(str, pa.Check.isin(VALID_REGIONS)),
    "amount":   pa.Column(float, pa.Check.in_range(0, 1e6)),
})

def transform(raw: pd.DataFrame) -> pd.DataFrame:
    out = raw.assign(amount=raw.qty * raw.price)
    return Orders.validate(out)          # raises with a report

# Unit fixtures — small, explicit frames:
def test_retention():
    df = pd.DataFrame({
        "cohort": ["2026-01", "2026-01", "2026-02"],
        "active_days": [10, 20, 5],
        "total_days": [30, 30, 28],
    })
    out = add_retention(df)
    assert out.loc[0, "retention"] == 10 / 30

# Property tests with hypothesis-pandas: frames generated for you
# from pandas.testing import assert_frame_equal  # the right equals`,
    },
  ],

  // ─── §16 Performance ──────────────────────────────────────────────────────
  performance: [
    { fact: "apply(axis=1) and iterrows are Python loops — column expressions and .str/.dt are C: 10-100x. Profile before anything else.", tag: "vectorize" },
    { fact: "Category dtype: strings repeated <50% unique → 10-100x memory, faster groupbys. High-cardinality → codes dominate, no win.", tag: "dtypes" },
    { fact: "read_csv in 3.1 is multi-threaded by default (mode.max_threads); explicit dtypes + usecols still the biggest lever.", tag: "io" },
    { fact: "Parquet column pruning + predicate pushdown: read 3 columns of a 200-column file in seconds.", tag: "io" },
    { fact: "query() parses once and compiles to numexpr — wins on compound masks over big frames.", tag: "vectorize" },
    { fact: "Copy-on-write (3.x): assignments copy only what's needed — df.loc[mask, 'col'] = x no longer risks view aliasing; old 'copy then slice' rituals can be deleted.", tag: "cow" },
    { fact: "Merge on sorted integer keys is fastest; validate= costs almost nothing and saves debugging hours.", tag: "merge" },
    { fact: "df.sample(frac=0.05) for the exploration loop; verify final numbers on the full set.", tag: "workflow" },
    { fact: "itertuples ≫ iterrows (10x); .to_numpy() + numba for tight numeric kernels.", tag: "vectorize" },
    { fact: "Watch the memory: peak usage ≈ 2-3x final frame during merges/resahpe — chunk big joins or pre-filter.", tag: "memory" },
    { fact: "Polars/DuckDB interop: .to_arrow()/from_pandas is near zero-copy — swap engines per stage, not per project.", tag: "ecosystem" },
  ],

  // ─── §17 Ecosystem & tooling ──────────────────────────────────────────────
  ecosystem: [
    { tool: "NumPy", purpose: "The array substrate every pandas op compiles down to.", url: "https://numpy.org/", category: "core" },
    { tool: "PyArrow", purpose: "Columnar memory + Parquet engine; powers string dtype and zero-copy interop.", url: "https://arrow.apache.org/docs/python/", category: "core" },
    { tool: "Polars", purpose: "Multi-threaded lazy DataFrames — the speed successor for big data.", url: "https://docs.pola.rs/", category: "scale" },
    { tool: "DuckDB", purpose: "In-process OLAP SQL over Parquet/CSV — analytics without a server.", url: "https://duckdb.org/", category: "scale" },
    { tool: "Dask / Spark (PySpark)", purpose: "Cluster-scale frames when one machine can't.", url: "https://docs.dask.org/", category: "scale" },
    { tool: "pandera", purpose: "DataFrame schemas + validation in CI — types for your tables.", url: "https://pandera.readthedocs.io/", category: "test" },
    { tool: "great expectations", purpose: "Data quality suites with docs and profiling.", url: "https://greatexpectations.io/", category: "test" },
    { tool: "matplotlib / seaborn / plotnine", purpose: "Plotting; .plot() on frames covers most needs.", url: "https://seaborn.pydata.org/", category: "viz" },
    { tool: "Jupyter", purpose: "The interactive home of pandas work — %timeit, df.head(), rich display.", url: "https://jupyter.org/", category: "workflow" },
    { tool: "openpyxl / xlsxwriter", purpose: "Excel engines for stakeholder output.", url: "https://xlsxwriter.readthedocs.io/", category: "io" },
    { tool: "sqlalchemy", purpose: "DB connectivity under read_sql/to_sql with parameter safety.", url: "https://docs.sqlalchemy.org/", category: "io" },
  ],

  // ─── §18 Version history ──────────────────────────────────────────────────
  versionHistory: [
    { version: "0.1", year: 2008, highlight: "Wes McKinney starts pandas at AQR: DataFrame + Series over NumPy, modeled on R." },
    { version: "0.x era", year: 2010, highlight: "Rapid feature growth: groupby, merge, resample, HDFStore — becomes the default data tool of the PyData movement." },
    { version: "1.0", year: 2020, highlight: "API stabilization, nullable dtypes (Int64), deprecation regime — pandas grows up." },
    { version: "1.3-1.5", year: 2021, highlight: "Copy-on-write path introduced experimentally; PyArrow integration deepens; CoW is the answer to SettingWithCopy." },
    { version: "2.0", year: 2023, highlight: "Copy-on-write opt-in, Apache Arrow backing for strings, performance across the board, deprecated append/iteritems." },
    { version: "2.2", year: 2024, highlight: "CoW default-ready, PyArrow-backed strings default path, PandasAPI consolidation; Polars pressure shows in perf focus." },
    { version: "3.0", year: 2026, highlight: "Copy-on-write mandatory, Arrow-backed default string dtype (PyArrow optional, NumPy ≥1.26), Python 3.11+ floor — the biggest breaking release ever. (Jan 2026)" },
    { version: "3.1", year: 2026, highlight: "Parallel read_csv on by default (≥5 MB local files), single-threaded parser 2-3x faster, DataFrame.select() with pd.col() expressions, filter(cond=), inplace deprecated (PDEP-8). Current: 3.1.1 (Nov 2026)." },
  ],

  // ─── §19 Interview hot questions ──────────────────────────────────────────
  interview: [
    { q: "loc vs iloc vs [] — when each?", a: "loc selects by label (boolean masks, label slices inclusive of endpoint, column names); iloc by integer position (exclusive slices, like Python); [] is shorthand that behaves differently by input type — column name → Series, label slice on the index → rows (the confusing one). Rule for production code: use loc for masks and labeled access, iloc only for positional logic, and [] only for single-column access. at/iat are the scalar-only fast paths.", difficulty: "easy" },
    { q: "Why did my arithmetic produce a column of NaNs?", a: "Index alignment: Series/DataFrame operations match on index labels; rows whose labels don't exist on both sides get NaN. It's join-by-label, not element-by-position. Diagnose with (a.index == b.index).all() or set operations; fix by resetting indexes before computing (reset_index(drop=True)), aligning deliberately (reindex), or stripping to positional (.to_numpy()). This feature is exactly right for time-series joins and exactly wrong for positional assumptions.", difficulty: "medium" },
    { q: "What is copy-on-write and why did pandas adopt it?", a: "Pre-2.x, slicing sometimes returned views, sometimes copies — silently. Writing through a slice (chained assignment df[mask]['col'] = x) might modify nothing, warn, or corrupt depending on layout. CoW makes the contract explicit: no write ever propagates through a reference you didn't explicitly hold — every mutation copies the affected blocks. Opt-in in 2.x, mandatory in 3.0. Cost: some patterns copy more; win: an entire class of silent-data-corruption bugs is structurally gone, and idiomatic code got faster.", difficulty: "medium" },
    { q: "How do groupby and merge interact with MultiIndex?", a: "groupby on multiple keys returns a frame with a MultiIndex (or MultiIndex columns after multiple named aggs). It's fine for lookup (loc[('2026-01','EU')]) but flattens confusion downstream — reset_index() at boundaries unless the hierarchy is the product. merge produces MultiIndex columns only when colliding names collide with suffixes; named aggregation (revenue=('rev','sum')) avoids it entirely. Rule: use MultiIndex as a brief internal representation, not a public interface.", difficulty: "medium" },
    { q: "Your groupby-apply is slow. Walk me through speeding it up.", a: "Order of attack: (1) is apply doing what a built-in agg does? Named aggs with sum/mean/nunique are C-speed. (2) Is it per-row (axis=1)? Convert to column expressions/np.select — 10-100x. (3) Is it element-wise string/date logic? .str/.dt accessors are vectorized. (4) Genuinely custom per-group logic? Try transform instead of apply when output aligns to rows. (5) Still slow? itertuples/to_numpy for the kernel, numba @njit for numeric loops, or move the stage to Polars/DuckDB and hand back via Arrow. Measure at each step — %timeit in Jupyter.", difficulty: "hard" },
    { q: "When do you reach for Polars/DuckDB/Spark instead?", a: "DuckDB: you want SQL over local files (Parquet/CSV), aggregates bigger than RAM (it spills), zero servers. Polars: single-machine but multi-core/lazy — frames 10-100GB, 5-20x faster, expression API that pandas copied hints of in 3.1 select(). Spark: cluster scale, many-node shuffle-heavy jobs, when data truly doesn't fit one box. Dask: pandas-like API on the same scale, gentler migration. The boundary is usually: interactive + fits-in-RAM → pandas; file-based analytics → DuckDB; big single machine → Polars; distributed → Spark.", difficulty: "medium" },
    { q: "How do you handle a 50GB CSV on a 16GB laptop?", a: "Don't load it: chunksize iteration with per-chunk reduction then combine (groupby-sums compose); read_parquet with column pruning + predicate filters if it's columnar already; convert CSV→Parquet once in chunks (types declared) and query after; DuckDB over the CSV directly (spills to disk, SQL semantics); or sample (frac=0.05) for exploration and exact-aggregate in chunks. The mistake is reaching for more RAM — the fix is changing what you load.", difficulty: "medium" },
    { q: "What's the difference between merge(how='left') and a SQL LEFT JOIN — any pandas surprises?", a: "Semantics match SQL. Surprises are pandas-specific: (1) duplicate keys in the right frame multiply rows (SQL does this too, but pandas users forget — validate='m:1' guards it); (2) key types must match exactly (int64 vs Int64 vs string silently produce all-NaN matches — check dtypes first); (3) suffixes ('_x','_y') instead of qualified names — rename explicitly; (4) NaN in join keys never match (even to each other), like SQL NULL. indicator=True + .value_counts() after every non-trivial merge is the cheapest data test there is.", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ──────────────────────────────────────────────────────
  comparisons: [
    { vs: "Polars", whenThis: "Ecosystem gravity (every Python data tool speaks pandas), interactive ergonomics, SQL-ish breadth of features, mature docs/Stack Overflow corpus.", whenThat: "Multi-threaded lazy execution, 5-20x on large frames, strict expressions, lower memory churn — the modern engine when data outgrows pandas comfort." },
    { vs: "DuckDB", whenThis: "Python-native transformations and feature engineering in a notebook; rich non-SQL ops (rolling, .str regex, plotting integration).", whenThat: "SQL-first analytics over files, aggregates bigger than RAM, zero Python dependency (embeds anywhere). They compose: DuckDB query → Arrow → pandas." },
    { vs: "Spark", whenThis: "Single-machine data (<50GB), fast iteration, no cluster to operate; pandas dev loop is 10x faster for exploration.", whenThat: "Distributed shuffles at TB scale, long-running pipelines, teams already on data-eng infra. PySpark keeps the pandas-ish API via pandas-on-Spark." },
    { vs: "R data.frame/tidyverse", whenThis: "One language for app + data; ML ecosystem (sklearn/torch) integration; hiring pool of general Pythonists.", whenThat: "Statistics-first idioms, ggplot2/tidyverse ergonomics, academic pipelines. Arrow makes the frames interop now." },
    { vs: "Excel", whenThis: "Automation, reproducibility, scale beyond ~1M rows, version control, testing.", whenThat: "Non-programmer stakeholders doing ad-hoc what-ifs. pandas reads/writes the same files — meet them where they are." },
  ],
};

export default sheet;
