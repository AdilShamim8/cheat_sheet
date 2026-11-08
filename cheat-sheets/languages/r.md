# R

**Category:** Languages · **Tier:** Tier 2 · Domain · **Tags:** dynamic, interpreted, statistics, data-science, vectorized, ggplot2, research · **First released:** 1993 · **Author:** Ross Ihaka & Robert Gentleman · **Last updated:** 2026-11

> Domain-specific language for statistical computing and graphics — vectorized, lazily-evaluated, and the home of ggplot2, the grammar of graphics.

---

## TL;DR

- R is a dynamically-typed, garbage-collected language built for statistics: every value is a vector, most operations are vectorized, and the standard library includes linear algebra, distributions, hypothesis tests, and a plotting system out of the box.
- It dominates academic statistics, biostatistics, econometrics, and clinical research; ggplot2 set the standard for declarative data visualization, and the CRAN ecosystem has ~20,000 peer-reviewed packages for niche statistical methods.
- Reach for R when you need statistical modeling (lm, glm, mixed models, survival analysis, Bayesian inference via Stan/brms), publication-quality plots via ggplot2, or reproducible research via Quarto/R Markdown.
- Avoid R for production web services, large-scale data engineering, or anything requiring >5M-row datasets in memory — use Python (Polars/DuckDB) or SQL for ETL, and call R only for the statistical step where its libraries are unmatched.

## Core Mental Model

**Everything is a vector; copy-on-modify is the cost model.** R has no scalars — `5` is a length-1 numeric vector. Operations like `x + 1` apply element-wise to the whole vector without an explicit loop; this is both the performance model (vectorized C code under the hood, ~100x faster than a for-loop) and the cognitive model (you think about whole-array transformations). The second key insight: R uses copy-on-modify semantics — `y <- x` doesn't copy, but the moment you mutate `y[1] <- 5`, the entire vector is duplicated. This makes reasoning simple (no aliasing bugs) but means naive pipelines copying 10M-row data frames are catastrophically slow. data.table and arrow sidestep this with in-place updates. Finally, R's evaluation is lazy by default (function arguments are promises evaluated on first use), which powers non-standard evaluation (`dplyr::filter(df, x > 5)` — `x` is a column, not a variable).

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| x <- c(1, 2, 3) | Assignment + combine into a vector — the atomic data shape. | Default assignment operator; `=` also works but `->`/`<-` is idiomatic. |
| df$x / df[["x"]] | Column access — `$` is shorthand for [[string]]; `[[` is the safe form. | `$` for interactive use; `[[` for programs where the column name is a variable. |
| df[df$x > 5, ] | Row subset by logical vector — recycled across rows. | Base R subsetting; prefer dplyr::filter for readability. |
| lapply(x, f) / sapply / map | Apply a function over a list, returning a list/simplified vector. | Vectorized map; purrr::map is the type-stable modern equivalent. |
| function(x, y = 10) { ... } | Function with default arg; lazy evaluation of all args. | Default for any reusable snippet; closures capture environment. |
| %>% / \|> | Pipe operator — pipes LHS as first arg of RHS. `\|>` is base R (4.1+). | Method chaining for data transforms; magrittr `%>%` for back-compat. |
| lm(y ~ x1 + x2, data = df) | Formula interface — `~` builds a language object parsed by the function. | Statistical modeling API shared by lm/glm/lme4/survival. |
| ggplot(df, aes(x, y)) + geom_point() | Layered grammar of graphics — each `+` adds a layer. | Declarative plotting; the default for any visualization. |
| data.table[i, j, by] | Subset → compute → group in one expression, in-place where possible. | Large-data transforms (>1M rows); ~10-100x faster than dplyr. |
| vec <- numeric(0); for (i in 1:n) vec[i] <- f(i) | Anti-pattern: growing a vector in a loop is O(n²). | Never. Pre-allocate: `vec <- numeric(n); for (i in seq_len(n)) vec[i] <- f(i)`. |
| R6Class('C', public = list(...)) | Reference-style OO with mutable state — unlike S3/S4 which are functional. | Stateful objects (caches, connections, ML models); preferred over S4 for new code. |
| future::plan(multisession) | Pluggable parallel backend — async/multisession/multicore/cluster. | Parallelizing lapply-style work via future_lapply/furrr. |

## Idiomatic Patterns

**Modern dplyr + ggplot pipeline (the 80% of analysis work)**

```r
library(dplyr)
library(ggplot2)

# Native pipe |> (R 4.1+) + lambda shorthand (x) ...
result <- df |>
  filter(!is.na(salary), year >= 2020) |>
  group_by(department, year) |>
  summarise(
    median_salary = median(salary, na.rm = TRUE),
    p90_salary    = quantile(salary, 0.90, na.rm = TRUE),
    n             = n(),
    .groups = "drop"
  ) |>
  arrange(desc(median_salary))

ggplot(result, aes(x = year, y = median_salary, color = department)) +
  geom_line(linewidth = 1) +
  geom_ribbon(aes(ymin = median_salary, ymax = p90_salary, fill = department),
              alpha = 0.15, linetype = "blank") +
  scale_y_continuous(labels = scales::dollar_format()) +
  labs(title = "Salary trend by department", x = NULL, y = NULL) +
  theme_minimal(base_size = 13)
```

**data.table — fast grouped aggregation on >10M rows**

```r
library(data.table)

dt <- fread("events.csv")              # ~5x faster than read.csv
setkey(dt, user_id, event_time)        # sort + index in-place

# i: filter  |  j: compute  |  by: group  — all in one expression
summary <- dt[
  event_time >= as.IDate("2024-01-01"),
  .(sessions = uniqueN(session_id), revenue = sum(amount, na.rm = TRUE)),
  by = .(user_id, year = year(event_time))
]

# .SD = Subset of Data — lets you apply any function by group.
top_per_user <- dt[, .SD[order(-amount)][1:5], by = user_id]
```

**Formula interface + broom — the statistical modeling idiom**

```r
library(broom)

# Formula syntax: `~` builds a language object; lm() parses it.
fit <- lm(log(salary) ~ experience + education + department,
          data = employees)

# glance: model-level stats; tidy: coefficient table; augment: row-level residuals
tidy(fit, conf.int = TRUE) |>
  filter(term != "(Intercept)") |>
  ggplot(aes(estimate, term)) +
  geom_vline(xintercept = 0, linetype = "dashed") +
  geom_errorbarh(aes(xmin = conf.low, xmax = conf.high), height = 0.2) +
  geom_point(size = 2) +
  labs(x = "Coefficient (log salary)", y = NULL)

# Residual diagnostics — base R plot system
par(mfrow = c(2, 2)); plot(fit)
```

**Parallel backends via future + furrr**

```r
library(future)
library(furrr)
library(purrr)

# Pick a backend at runtime — same code runs serially or in parallel.
plan(multisession, workers = 4)   # cross-process; multicore forks on linux/mac

# furrr::future_map is a drop-in for purrr::map with parallel execution.
fits <- future_map(
  split(mtcars, mtcars$cyl),
  ~ lm(mpg ~ wt + hp, data = .x),
  .options = furrr_options(seed = TRUE)   # reproducible RNG across workers
)

# Always set seed=TRUE for parallel RNG — otherwise results vary run to run.
plan(sequential)   # always tear down at the end
```

## Common Pitfalls

1. **Growing vectors in a loop is O(n²)** — *Symptom:* `v <- c(); for (i in 1:n) v <- c(v, f(i))` re-copies the entire vector each iteration — 1M iterations take minutes, not milliseconds. *Fix:* Pre-allocate: `v <- vector("list", n); for (i in seq_len(n)) v[[i]] <- f(i)`. Better: use `lapply`/`map`/`vapply` which pre-allocate internally. For numeric results, `vapply(x, f, numeric(1))` is type-stable and fast.
2. **StringsAsFactors default changed across versions** — *Symptom:* Code from R 3.x that assumed `read.csv()` returned character columns breaks in R 4.0+ where `stringsAsFactors` defaults to FALSE — factors are now opt-in. *Fix:* Be explicit: `read.csv(..., stringsAsFactors = FALSE)` or use `readr::read_csv()` which is character by default and faster. Never rely on the global default.
3. **`T` and `F` are variables, not keywords** — *Symptom:* `T <- FALSE` is legal — anywhere `T` is used as TRUE, an upstream `T <- 0` silently breaks logic. *Fix:* Always use the reserved words `TRUE` and `FALSE`. Enable `lintr::lint()` with the `T_and_F_symbol` rule to catch this in CI.
4. **`sapply` returns inconsistent types** — *Symptom:* `sapply(x, f)` returns a vector when results are length-1, a matrix when results are length-n>1, and a list when lengths differ — calling code breaks when input changes. *Fix:* Use `vapply(x, f, numeric(1))` (type-stable, takes a template) or `purrr::map_dbl(x, f)` / `map_chr`. Reserve `sapply` for interactive REPL use only.
5. **Copy-on-modify makes naive data frame pipelines slow** — *Symptom:* `df$new_col <- ...; df$other <- ...` copies the whole data frame on each assignment — `mutate` chains with N intermediate steps copy N times. *Fix:* Use `data.table` (in-place `:=` assignment, no copies) for >1M rows. For dplyr, chain transforms in a single `mutate()` call so intermediate results stay internal. `collapse` package also offers in-place ops.
6. **Non-standard evaluation breaks inside functions** — *Symptom:* `my_filter <- function(df, col) filter(df, col > 5)` doesn't work — `col` inside `filter()` is treated as a column name, not a variable. Interactive code doesn't generalize. *Fix:* Use `{{ col }}` (tidyverse rlang) to forward the argument as a quosure: `filter(df, {{ col }} > 5)`. For strings, use `.data[[col_str]]`. Always test your function, not just the inline snippet.
7. **Floating-point `==` on test results** — *Symptom:* `if (p_value == 0.05)` never matches because floating point — `0.1 + 0.2 != 0.3` in any language but especially surprising for statistical thresholds. *Fix:* Use `<=` / `>=` for thresholds: `if (p_value <= 0.05)`. For exact equality of computed numbers use `all.equal(a, b)` which has a tolerance.

## Production / Interview Quick Reference

- Vectorization is the perf model — `x + 1` is ~100x faster than `for (i in seq_along(x)) x[i] + 1` because the inner loop runs in C. `perf`
- Copy-on-modify for vectors/data frames — `y <- x; y[1] <- 5` doubles memory. Use data.table for in-place updates. `perf`
- R 4.0 changed stringsAsFactors default to FALSE — code assuming factors breaks. Always be explicit. `version`
- Native pipe `|>` is base R since 4.1 — faster than magrittr `%>%` but no placeholder for non-first-arg. `version`
- Lambda shorthand `\(x) x + 1` is base R since 4.1 — replaces `function(x) x + 1`. `version`
- `<-` is the assignment operator; `=` also works but `=` inside a function call binds locally and can be ambiguous. `style`
- `T` and `F` are overridable global variables, not reserved words — use `TRUE`/`FALSE`. `gotcha`
- CRAN has ~20,000 packages; Bioconductor has ~2,300 for genomics. Both enforce strict standards (manuals, tests). `version`
- data.table is ~10-100x faster than dplyr for >1M rows; dplyr is more readable for <100k rows. `perf`
- `future` package abstracts parallelism — same code runs serial, multicore, multisession, or cluster. `perf`
- Always set `seed = TRUE` (furrr) or `RNGkind("L'Ecuyer-CMRG")` for reproducible parallel RNG. `gotcha`
- Quarto (`.qmd`) is the modern successor to R Markdown — same idea, language-agnostic. `version`
- `renv` is the standard for project-local package versions — Python's venv equivalent. `version`
- Common style: 2-space indent, snake_case or camelCase (tidyverse = snake_case), `<-` for assignment. lintr enforces. `style`
- Base R plotting is fast & flexible; ggplot2 is the publication standard. patchwork/cowplot compose multi-panel figures. `style`

## Go Deeper

- [R Project — Official Manuals](https://cran.r-project.org/manuals.html) — An Introduction to R + R Language Definition are the canonical references.
- [Advanced R (Hadley Wickham)](https://adv-r.hadley.nz/) — Free online; the deep treatment of environments, evaluation, and OO systems. Essential for package authors.
- [R Packages (Hadley Wickham)](https://r-pkgs.org/) — How to write, test, document, and submit packages to CRAN — the engineering manual.
- [ggplot2: Elegant Graphics for Data Analysis (Hadley Wickham)](https://ggplot2-book.org/) — The grammar of graphics, by its creator. Free online.
- [data.table Introduction](https://r-datatable.com/) — Official docs + Typos & Patterns; the reference for high-performance R.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| numeric (double) | IEEE 754 double — R's default numeric. Integers are stored as doubles unless suffixed with L. | Math, IDs, indexing. All numeric vectors default to double; use 5L for explicit int. |
| integer | 32-bit signed integer — only with L suffix (5L) or as.integer(). | Loop counters, indexing. Most R code uses double — int is rare unless passing to C. |
| character | Immutable UTF-8 string. Vectors of strings are the norm. | All text. Use factors only for fixed categorical values. |
| logical | TRUE / FALSE / NA. T and F are aliases (overridable — don't use). | Logic, subsetting, conditions. NA in a condition yields NA, not FALSE. |
| complex | Complex number — 1+2i. Rare outside scientific computing. | Signal processing, complex analysis. Most R users never touch this. |
| raw | Byte vector — as.raw(c(0, 1, 255)). | Binary I/O, hashing, serialization. Use readBin/writeBin. |
| NA / NULL / Inf / NaN | NA = missing value (typed: NA_integer_, NA_real_, NA_character_); NULL = absent; Inf/-Inf = infinity; NaN = not-a-number. | NA propagates through operations (NA + 5 == NA). Use is.na(), is.null(), is.finite() to test. |
| factor | Categorical — integer + levels. Memory-efficient for repeated strings; dangerous if used as a string. | Statistical modeling (lm/glm), plotting with discrete colors. Set stringsAsFactors=FALSE on read. |
| Date / POSIXct / POSIXlt | Date = days since 1970; POSIXct = seconds since 1970 (numeric); POSIXlt = list of components. | Time series, plotting. Prefer POSIXct (numeric) for storage; POSIXlt for inspection only. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| c(...) | Atomic vector — the fundamental R data structure. All elements same type. | Numeric/character/logical sequences. The building block of everything. |
| list(...) | Heterogeneous container — each element can be any type. Like a Python dict/JS object. | Mixed-type records, function return values, JSON, model objects. lm() returns a list. |
| matrix(nrow, ncol) | 2D atomic vector — single type, column-major storage. | Linear algebra, image data. Use apply(mat, 1/2, f) for row/col operations. |
| array(dim) | N-dimensional atomic vector — extends matrix to >2D. | Image volumes, multi-dimensional numerical data. |
| data.frame | List of equal-length vectors — R's spreadsheet. Columns can have different types. | Tabular data, the default for analytics. dplyr/tibble are modern improvements. |
| tibble (tbl_df) | Modern data.frame — better printing, no partial matching, no stringsAsFactors. | Default for new code. dplyr/tidyr return tibbles. Use as_tibble() to convert. |
| data.table | Enhanced data.frame with in-place updates, fast aggregation, keyed lookups. | >1M rows — 10-100x faster than dplyr. The reference for high-perf R. |
| S4 objects / R6 | Class systems — S4 (formal, slots, methods); R6 (reference-style, mutable). | R6 for stateful objects (caches, models); S4 for interop with Bioconductor. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| function(x) { ... } | First-class function — closures capture environment; args are lazy (promises). | The only way to define reusable logic. Always pass to lapply/map/sapply. |
| list() with class attribute | S3 object — informal OOP; class is just a character vector; methods dispatch by name. | The default for new packages. lm(), ggplot(), data.frame are S3. |
| setClass('Foo', slots=c(...)) | S4 formal class — strict, typed slots, multiple inheritance. | Bioconductor packages, when you need formal type safety. Slower than S3. |
| R6Class('C', public=list(...)) | Reference-style OO — mutable state, methods, inheritance. Like Python/Java classes. | Stateful objects (DB connections, caches, ML models). The modern choice for new OO. |
| S3 generic + UseMethod | Polymorphism — generic dispatches to class.method implementations. | How print(), summary(), predict() work. Define your own with generic + methods. |
| list -> structure/class | Build an S3 object: structure(list(...), class='myclass'). | Lightweight OO for return values. Pair with print.myclass / summary.myclass methods. |
| environment | Hash table of name→value bindings — R's namespace mechanism. Modified in place (no copy). | Caches, mutable state, package internals. Usually hidden behind R6 or closures. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b | Vectorized arithmetic — element-wise. Recycled if lengths differ (longer %% shorter). | Math. Always faster than a for loop. C-based implementation. |
| a %/% b, a %% b | Integer floor division and modulo — both vectorized. | Integer math. %/% floors toward -Inf (Python-like); %% matches the dividend's sign. |
| a ^ b, exp(a), log(a) | Power, exponential, log. ^ is vectorized; log takes base as 2nd arg. | Math. Use log1p(x) and expm1(x) for accuracy near 0. |
| a == b, a != b | Vectorized value equality. NA propagation: NA == 5 is NA. | Comparisons. Use identical() for exact object equality; all.equal() for float-tolerant. |
| a < b, a > b, a <= b, a >= b | Vectorized comparison — returns logical vector with NA propagation. | Filtering, subsetting. df[df$x > 5, ] is the base R idiom; dplyr::filter is more readable. |
| a & b, a \| b, !a | Vectorized boolean — element-wise. NA propagates. | Combining logical vectors. Use && and \|\| for scalar (single-element) boolean. |
| a && b, a \|\| b | Scalar boolean — only first element. Short-circuits. | if statements: if (cond1 && cond2). NEVER use & / \| in if — they don't short-circuit. |
| a %in% b | Membership — vectorized. Returns logical vector of length(a). | Filtering by membership: df[df$state %in% c('CA', 'NY'), ]. Faster than \|  for many matches. |
| a %% b (matmul) | Matrix multiplication — NOT modulo. Cross-product / dot product. | Linear algebra. t(a) %*% b is the canonical matmul; crossprod() is faster. |
| a \|> b | Native pipe (4.1+) — pipes LHS as first arg of RHS. | Chaining transforms. dplyr/tidyr pipelines. Use _ as placeholder: x \|> f(_, y). |
| a %>% b | magrittr pipe — older, more features (placeholder ., nested calls). | Back-compat with pre-4.1 code. Native pipe \|> is preferred for new code. |
| $, [[ ]], [ ] | Subset: $ by name (single); [[ ]] by name/index (single, drops dims); [ ] by index/name (preserves structure). | $ for interactive; [[ ]] for programs (handles string vars); [ ] for subsetting. |
| x[i] <- value | In-place assignment — triggers copy-on-modify for the whole vector. | Mutation. Avoid in loops (O(n) per write); pre-allocate or use data.table := for in-place. |
| ?expr | Help operator — ?foo opens help for foo; ??foo searches help. | Interactive lookup. package?foo for package help; ?`%>%` for non-syntactic names. |

## Input / Output

**File I/O — small (read all) vs large (stream)**

```r
# Small CSV — readr is faster and stricter than read.csv
library(readr)
df <- read_csv("small.csv", show_col_types = FALSE)

# Large CSV — data.table::fread is ~5-10x faster than read.csv
library(data.table)
dt <- fread("huge.csv", showProgress = TRUE)

# Very large — chunk via readLines, process line by line
con <- file("huge.txt", "r")
on.exit(close(con))
while (length(chunk <- readLines(con, n = 10000)) > 0) {
  process(chunk)
}

# Write CSV — fwrite is ~10x faster than write.csv
fwrite(dt, "out.csv")
# Parquet — arrow package for columnar storage
library(arrow)
write_parquet(dt, "out.parquet")
```

**stdin / stdout / stderr — Rscript CLI**

```r
# Read all of stdin
input <- readLines(file("stdin"))

# Stream stdin line by line
for (line in readLines(file("stdin"))) {
  cat(toupper(line), "\n")
}

# Print to stderr
message("warning: deprecated")  # goes to stderr, with newline
warning("deprecated")           # also stderr; treated as a warning

# JSON over stdin/stdout — the standard CLI interop pattern
library(jsonlite)
payload <- fromJSON(readLines(file("stdin")))
result <- transform(payload)
cat(toJSON(result, auto_unbox = TRUE, pretty = TRUE))
```

**RDS / RData / feather — serialization tiers**

```r
# RDS — single object, R-specific binary format. Fast, preserves types.
saveRDS(model, "model.rds")
model <- readRDS("model.rds")  # safe (no code execution)

# RData — multiple objects, R-specific. UNSAFE (executes code on load).
save(df, model, file = "stuff.RData")
load("stuff.RData")  # restores into global env — pollutes

# fst — fast binary format, random access, language-agnostic
library(fst)
write_fst(df, "data.fst")  # ~10x faster than RDS for large data
df <- read_fst("data.fst", columns = c("id", "x"))  # column selection

# Parquet — columnar, portable, the modern default
library(arrow)
write_parquet(df, "data.parquet")
```

**HTTP client (httr2) with retries**

```r
library(httr2)

get_json <- function(url) {
  req <- request(url) |>
    req_headers(Accept = "application/json") |>
    req_timeout(10) |>
    req_retry(max_tries = 3, backoff = ~ 0.5 * 2 ^ (try - 1))

  resp <- req_perform(req)
  if (!resp_is_error(resp)) {
    resp_body_json(resp, simplifyVector = TRUE)
  } else {
    stop(sprintf("HTTP %d: %s", resp_status(resp), resp_body_string(resp)))
  }
}

# httr2 is the modern successor to httr — better retry, OAuth, mocking.
data <- get_json("https://api.example.com/users")
```

## Loops & Iteration

**Vectorization — the 90% case (no explicit loop)**

```r
# R is vectorized — most 'loops' are just vector ops
x <- 1:10
y <- x * 2 + 1                # element-wise, in C
sum_x <- sum(x)               # vectorized reduction
mean_x <- mean(x)             # vectorized
above_5 <- x[x > 5]           # vectorized filter

# Vectorization is ~100x faster than a for loop — the inner loop runs in C.
# Prefer vector ops over loops; if you MUST loop, pre-allocate or use lapply.

# Don't do this (slow):
total <- 0
for (i in seq_along(x)) total <- total + x[i]
# Do this (fast):
total <- sum(x)
```

**lapply / sapply / vapply / purrr::map — the functional loops**

```r
library(purrr)

# lapply — apply function over list, return list. The workhorse.
results <- lapply(files, read.csv)

# map (purrr) — same as lapply but with consistent semantics.
results <- map(files, read.csv)

# map_dbl / map_chr — type-stable: always returns numeric/character vector.
means <- map_dbl(list_of_vectors, mean)

# vapply — type-stable base R (template-based)
means <- vapply(list_of_vectors, mean, numeric(1))

# AVOID sapply — it returns inconsistent types (vector vs matrix vs list).
# Use map_dbl / vapply in production code.
```

**for / while / repeat — explicit loops**

```r
# for — when you can't vectorize
for (i in seq_along(items)) {
  process(items[[i]])
}

# seq_along(items) is safer than 1:length(items) — empty returns empty, not c(1, 0)

# while — runs while condition is true
n <- 0
while (n < 10 && !found(n)) {
  n <- n + 1
}

# repeat — infinite loop, break explicitly
repeat {
  result <- try_once()
  if (result != "retry") break
}

# Avoid growing vectors in loops — pre-allocate or use lapply/map:
out <- vector("list", length(items))
for (i in seq_along(items)) out[[i]] <- f(items[[i]])
```

**Pipelines — native pipe |> + dplyr chains**

```r
library(dplyr)

# Native pipe (R 4.1+) — pipes LHS as first arg of RHS
result <- df |>
  filter(!is.na(salary), year >= 2020) |>
  group_by(department, year) |>
  summarise(median_salary = median(salary), .groups = "drop") |>
  arrange(desc(median_salary))

# Lambda shorthand \(x) ... (4.1+) — for inline transforms
df |> mutate(z = map_dbl(x, \(v) v * 2 + 1))

# magrittr %>% pipe — older, more features (placeholder ., nested calls)
# Still works; native |> is preferred for new code.

# Placeholder _ (4.2+) — for non-first-arg piping
x |> lm(y ~ ., data = _)
# (Note: _ placeholder only works with named args, not all functions.)
```

## Functions & Callables

**Parameters, defaults, lazy evaluation, dots**

```r
# Defaults are evaluated lazily — only when the arg is used
f <- function(x, y = expensive()) {
  if (x > 0) y else NULL  # y only computed if x > 0
}

# ... (dots) — accept any args, forward them
summarise_all <- function(df, fun, ...) {
  lapply(df, fun, ...)
}
summarise_all(df, quantile, probs = c(0.25, 0.75))

# Missing-arg detection
f <- function(x) {
  if (missing(x)) {
    "x was not provided"
  } else {
    paste("x is", x)
  }
}

# Return value — last expression, or explicit return()
g <- function(x) {
  if (x < 0) return(NA)
  sqrt(x)
}
```

**Closures + factories — capture environment**

```r
# Closures capture their environment — like Python/JS
make_counter <- function() {
  n <- 0
  function() {
    n <<- n + 1  # <<- assigns in parent env
    n
  }
}

c1 <- make_counter()
c1()  # 1
c1()  # 2
c2 <- make_counter()
c2()  # 1 — independent

# Factory pattern — build functions with config baked in
make_adder <- function(n) function(x) x + n
add5 <- make_adder(5)
add5(10)  # 15
```

**Function operators — wrapping functions**

```r
# A function that takes a function and returns a function
timed <- function(f) {
  force(f)  # force evaluation of f (lazy args)
  function(...) {
    start <- Sys.time()
    result <- f(...)
    elapsed <- Sys.time() - start
    message(sprintf("%s: %.3fs", deparse(substitute(f)), as.numeric(elapsed)))
    result
  }
}

slow_sum <- timed(sum)
slow_sum(1:1e6)  # prints timing + returns result

# purrr::safely / quietly / possibly wrap functions to handle errors
safe_log <- purrr::safely(log, otherwise = NA_real_)
safe_log(10)   # list(result=2.3, error=NULL)
safe_log(-1)   # list(result=NA, error=<error>)
```

**S3 generics + methods — the R OOP model**

```r
# S3: a generic is a function that calls UseMethod; methods are named generic.class
greet <- function(x) UseMethod("greet")

greet.character <- function(x) paste("Hello,", x)
greet.numeric <- function(x) paste("Number:", x)
greet.default <- function(x) paste("Unknown:", class(x)[1])

greet("Alice")   # Hello, Alice
greet(42)        # Number: 42
greet(TRUE)      # Unknown: logical

# Add a method for a built-in generic — extend an existing class
summary.myclass <- function(object, ...) {
  cat("MyClass with", length(object$x), "elements\n")
}

# S3 dispatch is by class attribute; methods are looked up at call time.
# It's informal — no checking that methods exist.
```

## Error Handling

**tryCatch + finally via on.exit**

```r
# tryCatch — catch conditions by class
result <- tryCatch({
  risky_operation()
}, warning = function(w) {
  message("warning: ", w$message)
  NULL  # return value
}, error = function(e) {
  message("error: ", e$message)
  NA  # return value
}, finally = {
  cleanup()  # always runs
})

# on.exit — register cleanup at function entry, runs on any exit
process_file <- function(path) {
  con <- file(path, "r")
  on.exit(close(con), add = TRUE)  # add=TRUE to chain multiple
  readLines(con)
}

# Condition is the parent class — warning, error, message are subclasses.
# Custom conditions let you attach structured data:
custom_error <- function(msg, code) {
  structure(list(message = msg, code = code), class = c("my_error", "error", "condition"))
}
```

**withCallingHandlers — recover from warnings**

```r
# withCallingHandlers — like tryCatch but for non-fatal conditions (warnings, messages)
# Can suppress or transform them without losing the result.

result <- withCallingHandlers(
  risky_with_warnings(),
  warning = function(w) {
    if (grepl("deprecated", w$message)) {
      message("suppressing: ", w$message)
      invokeRestart("muffleWarning")  # suppress the warning
    }
  }
)

# tryCatch ABORTS on the condition; withCallingHandlers CONTINUES.
# Use tryCatch for errors, withCallingHandlers for warnings/messages.
```

**Custom conditions + restarts**

```r
# Define a custom condition class with structured data
my_error <- function(message, code, ...) {
  structure(
    list(message = message, code = code, ...),
    class = c("my_error", "error", "condition")
  )
}

# Raise it
if (bad) stop(my_error("validation failed", code = 422, field = "email"))

# Catch by class
tryCatch({
  risky()
}, my_error = function(e) {
  log(paste("code", e$code, "field", e$field))
})

# Restarts — for recoverable errors (advanced, rarely used)
# Establish a restart, invoke it from a handler to resume.
```

**purrr::safely — turn errors into values**

```r
library(purrr)

# safely wraps a function — returns list(result, error), one of which is NULL
safe_log <- safely(log, otherwise = NA_real_)
safe_log(10)   # list(result=2.302, error=NULL)
safe_log(-1)   # list(result=NA, error=<error>)

# Possibly — like safely but returns a default instead of a list
maybe_log <- possibly(log, otherwise = NA_real_)
maybe_log(-1)  # NA

# Map over many items, collect successes + failures separately
results <- map(items, safely(fetch_one))
successes <- map(results, "result") |> compact()
failures <- map(results, "error") |> compact() |> map("message")

# This is the idiomatic R way to do fault-tolerant batch processing.
```

## Concurrency Model

**future + furrr — pluggable parallel backends**

```r
library(future)
library(furrr)
library(purrr)

# Pick a backend at runtime — same code runs serially or in parallel.
plan(multisession, workers = 4)   # cross-process; multicore forks on linux/mac
# plan(sequential)               # back to serial
# plan(cluster, workers = ...)   # across machines via SSH

# furrr::future_map is a drop-in for purrr::map with parallel execution.
fits <- future_map(
  split(mtcars, mtcars$cyl),
  ~ lm(mpg ~ wt + hp, data = .x),
  .options = furrr_options(seed = TRUE)   # reproducible RNG across workers
)

# Always set seed=TRUE for parallel RNG — otherwise results vary run to run.
plan(sequential)   # always tear down at the end
```

**parallel package — built-in cluster parallelism**

```r
library(parallel)

# detectCores() returns available cores (logical by default)
n_workers <- detectCores(logical = FALSE)

# mclapply — fork-based, Linux/macOS only. Fastest on those platforms.
results <- mclapply(items, process_one, mc.cores = 4)

# parLapply — cluster-based, works on Windows too.
cl <- makeCluster(4)
clusterExport(cl, c("my_func", "config"))  # send vars to workers
results <- parLapply(cl, items, process_one)
stopCluster(cl)

# Use future / furrr instead — they abstract over these details.
```

**foreach + doParallel — iteration-style parallelism**

```r
library(foreach)
library(doParallel)

cl <- makeCluster(4)
registerDoParallel(cl)

# foreach returns a list; .combine controls merge (c, rbind, +, etc.)
results <- foreach(i = 1:100, .combine = rbind, .packages = c("dplyr")) %dopar% {
  fit_model(i)
}

stopCluster(cl)

# %do% = serial; %dopar% = parallel.
# foreach is older style; prefer furrr::future_map for new code.
```

**Async via later + promises (Shiny async)**

```r
library(later)
library(promises)

# Schedule a callback to run after current stack unwinds
later(~ message("running later"), delay = 0)

# Promises — for Shiny async / long-running ops
future_promise(long_running()) %...>% {
  process_result(.)
} %...!% {
  handle_error(.)
}

# In Shiny: async reactive outputs use future + promises to avoid blocking.
# Outside Shiny, future + furrr is the simpler model.
```

## Testing Patterns

**testthat — the de-facto R test framework**

```r
library(testthat)

test_that("validation works", {
  expect_equal(add(1, 2), 3)
  expect_true(is_valid(user))
  expect_false(is_valid(bad_user))
  expect_error(parse("nope"), "invalid")
  expect_warning(scale_to(0, 0), "zero")
})

# Run: test_dir("tests/testthat") or devtools::test()
# File convention: tests/testthat/test-<topic>.R

# Fixtures via setup() / teardown() or local() helpers
setup({
  db <<- connect_test_db()
})
teardown({
  dbDisconnect(db)
})
```

**Parameterized tests + snapshot testing**

```r
# Parameterized via test_that + a loop
for (email in c("a@b.io", "nope", "")) {
  test_that(paste("validates", email), {
    expect_silent(validate(email))
  })
}

# Snapshot testing — captures expected output, fails on change
test_that("print output is stable", {
  expect_snapshot(print(model))
})

# Update snapshots with: testthat::snapshot_accept("filename")
# Review with: testthat::snapshot_review("filename")

# Snapshot tests catch breaking changes to printed output, error messages,
# plot rendering — anywhere exact text matters.
```

**Mocks & stubs — mockr / testthat::with_mocked_bindings**

```r
library(testthat)

# Modern mock (testthat 3.2+) — mock specific functions in a package
with_mocked_bindings(
  {
    expect_equal(fetch_user(1), mock_user)
  },
  fetch_user = function(id) mock_user
)

# Stub a function in another package
local_mocked_bindings(
  Sys.time = function() as.POSIXct("2024-01-01"),
  .package = "mypackage"
)

# Older style (mockr package) — replaced by with_mocked_bindings
# mockr::with_mock(`package:::internal_func` = mock, { ... })

# Avoid mocking too much — design for testability with dependency injection.
```

**Coverage + CI config**

```r
# Install covr for coverage
# install.packages("covr")

# Run coverage locally:
cov <- covr::package_coverage()
print(cov)  # per-file + total coverage
covr::report(cov)  # HTML report

# CI (GitHub Actions):
# - uses: r-lib/actions/setup-r@v2
# - run: Rscript -e 'install.packages("covr"); covr::codecov()'

# Test structure convention (R packages):
# tests/
#   testthat.R           # test runner entry
#   testthat/
#     test-<topic>.R     # one file per area
# Use usethis::use_test("topic") to scaffold.
```

## Performance Tuning

- Vectorization is the perf model — x + 1 is ~100x faster than a for loop because the inner loop runs in C.
- Copy-on-modify for vectors/data frames — y <- x; y[1] <- 5 doubles memory. Use data.table for in-place updates.
- Pre-allocate vectors in loops: v <- numeric(n); for (i in seq_len(n)) v[i] <- f(i). Avoid v <- c(v, new) — O(n²).
- data.table is ~10-100x faster than dplyr for >1M rows due to in-place := updates and GForce optimizations.
- lapply/map is ~2-5x faster than an equivalent for loop — internal pre-allocation + C-level iteration.
- R's GC is generational; trigger with gc() but usually don't — let it run automatically. gcinfo(TRUE) to see when.
- compiler::cmpfun() compiles a function to bytecode — ~2-4x speedup for hot loops, no source changes.
- Rcpp lets you write C++ inline — 100-1000x speedup for hot numeric loops. The standard escape hatch.
- arrow / duckdb can run SQL on Parquet files without loading into R memory — essential for >10M rows.
- future::plan(multisession) parallelizes across processes; multicore forks (Linux/mac only) avoid serialization cost.
- Always set seed=TRUE (furrr) or RNGkind("L'Ecuyer-CMRG") for reproducible parallel RNG — otherwise results vary run to run.
- T and F are overridable variables — always use TRUE / FALSE in code that matters.
- sapply returns inconsistent types (vector/matrix/list) — use vapply or purrr::map_*  for type stability.
- profvis is the standard profiler — visual flamegraph; RProf for line-by-line. memory_profile for allocations.
- Native pipe |> (4.1+) is faster than magrittr %>% (no S3 dispatch overhead), but no placeholder for non-first-arg.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [CRAN](https://cran.r-project.org/) | The package repository — install.packages() pulls from here. Strict submission standards. | package |
| [Bioconductor](https://bioconductor.org/) | Genomics/biology package repository — ~2,300 packages, biannual releases. | package |
| [pak](https://pak.r-lib.org/) | Modern package installer — faster than install.packages, parallel, better cache. The future default. | package |
| [renv](https://rstudio.github.io/renv/) | Project-local package versions — Python's venv equivalent. Lock file = renv.lock. | package |
| [devtools / usethis](https://devtools.r-lib.org/) | Package development toolkit — usethis::create_package, use_test, use_rcpp, etc. | build |
| [testthat](https://testthat.r-lib.org/) | Test framework — the de-facto standard. expect_*/test_that/with_mocked_bindings. | test |
| [covr](https://covr.r-lib.org/) | Code coverage — codecov() uploads to codecov.io; report() for HTML. | test |
| [lintr](https://lintr.r-lib.org/) | Static analyzer — enforces tidyverse style, catches common bugs (T_and_F_symbol, etc.). | lint |
| [styler](https://styler.r-lib.org/) | Code formatter — applies tidyverse style non-destructively. RStudio integrates. | lint |
| [profvis](https://rstudio.github.io/profvis/) | Visual profiler — flamegraph + line-level timing. The standard for R perf work. | debug |
| [RStudio / Positron](https://posit.co/products/cloud/public-preview/positron/) | RStudio is the dominant R IDE; Positron is Posit's new VS Code-based successor. | build |
| [dplyr / tidyr](https://dplyr.tidyverse.org/) | Grammar of data manipulation — filter, mutate, summarise, pivot. The modern standard. | build |
| [data.table](https://r-datatable.com/) | High-perf data.frame — in-place updates, fast aggregation. 10-100x dplyr for >1M rows. | build |
| [ggplot2](https://ggplot2.tidyverse.org/) | Grammar of graphics — declarative plotting. The publication-quality standard. | build |
| [Quarto](https://quarto.org/) | Reproducible docs (successor to R Markdown) — .qmd files, supports R/Python/Julia. | build |
| [Rcpp](https://www.rcpp.org/) | Inline C++ in R — 100-1000x speedup for hot numeric loops. The standard escape hatch. | build |
| [arrow](https://arrow.apache.org/docs/r/) | Apache Arrow integration — Parquet/IPC files, columnar analytics beyond RAM. Plus duckdb SQL. | build |
| [future + furrr](https://future.futureverse.org/) | Pluggable parallel backend — same code runs serial, multicore, multisession, cluster. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 2000 | First official release — Ross Ihaka & Robert Gentleman's S successor. |
| 2.0 | 2004 | Lazy evaluation, pre-compiled bytecode, lexical scoping changes. |
| 2.1 | 2005 | Generic functions, S4 improvements, better performance. |
| 2.10 | 2009 | Help system rework, packages can suggest other packages. |
| 2.15 | 2012 | Long vectors (64-bit indexing), byte-code compiler stable. |
| 3.0 | 2013 | Big-data support (long vectors), Mac OS X 64-bit only. |
| 3.1 | 2014 | Performance improvements, raw bytes improvements, news() helper. |
| 3.2 | 2015 | PDF manual deprecation, character encoding fixes. |
| 3.3 | 2016 | Byte-code compiler by default (JIT), significant perf gains. |
| 3.4 | 2017 | JIT enabled by default, performance work, faster sum/prod. |
| 3.5 | 2018 | Altrep (alternative representations) — lazy/out-of-memory vectors. |
| 3.6 | 2019 | Better RNG (PCG64 default), stringi updates, larger hash tables. |
| 4.0 | 2020 | stringsAsFactors=FALSE default (big breaking change), raw literals. |
| 4.1 | 2021 | Native pipe \|> and lambda shorthand \(x) — major tidyverse integration. |
| 4.2 | 2022 | Pipe placeholder _, \|>-based argument forwarding, 32-bit Windows EOL. |
| 4.3 | 2023 | Reduced R-expression overhead, more pipe improvements, pkg improvements. |
| 4.4 | 2024 | Faster ALTREP, JSON parser improvements, tcltk updates. |
| 4.5 | 2025 | Named-vector printing overhaul, performance work in hot paths. |
| 4.6 | 2026 | Current major line — 4.6.2 (Oct 2026). |

## Interview Hot Questions

1. **Why is R so heavily vectorized, and what does that mean for performance?** *(medium)*

   R has no scalars — 5 is a length-1 numeric vector. Operations like x + 1 apply element-wise, and the inner loop runs in compiled C code, ~100x faster than an R-level for loop. This is both the cognitive model (think in whole-array transforms) and the performance model. If you write a for loop in R, you're paying interpreter overhead per iteration; if you vectorize, you amortize it across the whole vector. The exception is when each iteration does complex non-vectorizable work — then lapply/map is still faster than a manual for loop because it pre-allocates.

2. **Explain copy-on-modify and its impact on R performance.** *(medium)*

   R copies objects on modification — y <- x doesn't copy, but y[1] <- 5 duplicates the entire vector. This makes reasoning simple (no aliasing bugs) but means naive pipelines that copy 10M-row data frames are catastrophically slow. Each mutate in a dplyr chain can copy. data.table sidesteps this with the := operator for in-place updates — 10-100x faster on large data. The arrow package takes a different approach: lazy evaluation that only materializes the final result. Know which model you're using.

3. **What's the difference between S3 and S4 object systems?** *(medium)*

   S3 is informal — a class is just a character vector attribute, methods are named generic.class, dispatch happens at call time. No checking. Fast, simple, ubiquitous (lm, data.frame, ggplot are S3). S4 is formal — setClass with typed slots, setMethod for dispatch, multiple inheritance, validation. Safer but slower and more verbose. Bioconductor uses S4 heavily. For new packages, prefer S3 for informal OO and R6 for stateful/reference OO; S4 only if you need formal type safety or Bioconductor compatibility.

4. **How does lazy evaluation work in R, and why does it matter?** *(hard)*

   Function arguments in R are 'promises' — unevaluated expressions evaluated on first use. This means: (1) defaults are computed only if needed (f <- function(x, y = expensive()) only calls expensive() if y is read); (2) you can implement non-standard evaluation like dplyr::filter(df, x > 5) where x is a column, not a variable; (3) missing() can detect whether an argument was provided. The cost: subtle bugs when you forget to force() an argument in a closure or higher-order function. The benefit: powers the tidyverse's elegant DSLs.

5. **Explain the difference between lapply, sapply, and vapply.** *(easy)*

   lapply always returns a list (type-safe). sapply tries to 'simplify' — vector if length-1 results, matrix if length-n, list if lengths differ. This is convenient interactively but a footgun in production: change the input and the output type changes, breaking downstream code. vapply is type-stable: you provide a template (numeric(1)) and it errors if results don't match. purrr::map_dbl / map_chr are the modern type-stable alternatives. Rule: lapply for lists, vapply or map_* for typed results, sapply only at the REPL.

6. **How do you parallelize R code, and what's the gotcha?** *(medium)*

   Use future + furrr: plan(multisession, workers = 4) switches from serial to parallel; furrr::future_map is a drop-in for purrr::map. Backends: sequential, multisession (cross-process, works everywhere), multicore (forks, Linux/mac only, faster). The gotcha: RNG — without seed=TRUE (furrr) or RNGkind('L'Ecuyer-CMRG'), workers generate different random numbers each run, breaking reproducibility. Also: data is copied to each worker (no shared memory), so heavy data + light computation doesn't parallelize well.

7. **What's the difference between data.frame, tibble, and data.table?** *(easy)*

   data.frame is the base R structure — a list of equal-length vectors with row/column names. tibble (tidyverse) is a modernized data.frame: better printing, no partial name matching, no stringsAsFactors, stricter subsetting. Use tibbles for new tidyverse code. data.table is a separate package with a different syntax (dt[i, j, by]) and in-place updates (:=). It's 10-100x faster than dplyr for >1M rows. Choose: tibble + dplyr for readability on small data, data.table for speed on large data.

8. **How does non-standard evaluation (NSE) work, and why does it break inside functions?** *(hard)*

   NSE means functions can capture the EXPRESSION passed to them, not just its value. dplyr::filter(df, x > 5) takes 'x > 5' as a quosure — it knows x refers to a column, not a variable in the caller's scope. The problem: my_filter <- function(df, col) filter(df, col > 5) doesn't work — col is treated as a column name, not a function argument. Fix: use {{ col }} (tidy-eval) to forward the argument as a quosure: filter(df, {{ col }} > 5). For string column names, use .data[[col_str]]. Always test functions that wrap tidyverse code.

9. **Why are T and F dangerous?** *(easy)*

   T and F are variables in the global env, not reserved words — they're set to TRUE and FALSE by default, but a user (or another package) can override them: T <- FALSE. After that, any code using T now means FALSE, silently breaking logic. Always use the reserved words TRUE and FALSE. Enable lintr's T_and_F_symbol rule to catch this in CI. The R core team has discussed making T and F reserved but it would break too much existing code.

10. **How would you handle >100GB of data in R?** *(hard)*

   Three approaches: (1) Don't load it — use arrow or duckdb to run SQL on Parquet files directly, materializing only the result. (2) Chunk it — read.csv in chunks via readLines or data.table::fread with skip/nrows, process each chunk, aggregate. (3) Outsource — preprocess in Spark/DuckDB/Python, load only the final small result into R for the statistical step where its libraries are unmatched. R's copy-on-modify model makes in-memory data >RAM impractical; the answer is to avoid loading it. Rcpp + RcppArmadillo can help if you must process big in-memory matrices.

## When to Choose This

- **vs Python (Pandas/Polars):** use this — Statistical modeling, biostatistics, clinical research, ggplot2-quality publication plots, anywhere CRAN's 20k niche stat packages matter.; use that — Production data engineering, ML pipelines, anything requiring >5M rows in memory, anywhere Python's broader ecosystem (web, deployment) matters.
- **vs Julia:** use this — Statistics, anywhere the CRAN ecosystem (mixed models, survival analysis, Bayesian via Stan/brms) is unmatched, anywhere you need production-stable tools.; use that — Numerical HPC where the two-language problem (R calling C) hurts, JIT-compiled math, anywhere you want one language from prototype to production.
- **vs MATLAB:** use this — Statistics, data science, anywhere free/open-source matters, anywhere CRAN/Bioconductor's domain libraries dominate.; use that — Engineering / signal processing / control systems where MATLAB's toolboxes + Simulink integration are the actual product.
- **vs SAS / SPSS:** use this — Modern statistics, reproducible research (Quarto/R Markdown), anywhere free software + version control + modern tooling matters.; use that — Regulated industries (pharma clinical trials) where SAS's validation/FDA compliance is the actual product; legacy enterprise analytics.
- **vs SQL (warehouse):** use this — Statistical analysis, ML modeling, anything requiring visualization, anywhere CRAN's stat libraries are unmatched.; use that — ETL, large-scale data joins/aggregations, anywhere the data already lives in a relational store; SQL-first tooling (dbt) handles the transform layer.

