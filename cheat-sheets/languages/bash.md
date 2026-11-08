# Bash / Shell

**Category:** Languages · **Tier:** Tier 2 · Domain · **Tags:** shell, scripting, unix, posix, devops, automation, glue · **First released:** 1989 · **Author:** Brian Fox (GNU) · **Last updated:** 2026-11

> The Unix shell — glue language for processes, pipes, and files, with a footgun at every turn that bash strict mode tames.

---

## TL;DR

- Bash is a Unix shell and command language: it expands strings, launches processes, wires their stdio together via pipes, and sequences commands with conditionals. It is the default login shell on most Linux distros and macOS, and the scripting language beneath every CI runner, Docker ENTRYPOINT, and orchestration tool.
- It dominates devops glue, build scripts, container entrypoints, and one-off automation — anywhere you need to chain CLI tools, transform text streams, or wrap processes. POSIX sh is the portable subset; bash adds arrays, `[[ ]]`, process substitution, and `set -o pipefail`.
- Reach for Bash when you're gluing existing tools (grep, awk, curl, jq), writing container entrypoints, automating filesystem ops, or wrapping a quick pipeline you'll throw away in a week.
- Avoid Bash for anything with logic branches beyond a few if-statements, anything requiring JSON parsing beyond `jq`, anything cross-platform, or anything where a bug is expensive — rewrite in Python or Go as soon as the script crosses 100 lines.

## Core Mental Model

**Everything is a string; word-splitting is the enemy.** Bash has no real data types — every variable holds a string, and `$VAR` is replaced by its contents verbatim before the command runs. The shell then word-splits the result on `$IFS` (whitespace by default) and re-expands any globs. This single behavior explains 80% of bash bugs: filenames with spaces break loops, unquoted variables silently split, and `*` expands to whatever's in your cwd. The mental model that saves you: quote every variable expansion (`"$VAR"`, `"$@"`), enable `set -euo pipefail` to fail fast on undefined vars and broken pipes, and reach for arrays (`arr=("$@")`) instead of space-separated strings the moment you have more than one item. Bash is a UI for processes, not a programming language — when you find yourself fighting it, switch.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| set -euo pipefail / set -Eeuo pipefail | Fail on undefined var (-u), on command failure (-e), on broken pipe (-o pipefail); -E inherits traps. | First line of every script that matters. The 'bash strict mode'. |
| var="$(cmd)" # capture stdout | Command substitution, quoted to prevent word-splitting. | Always quote — `var=$(cmd)` (unquoted) breaks on multi-word output. |
| arr=("$@") / for x in "${arr[@]}" | Array of positional args, expanded quoted to preserve spaces. | The correct way to iterate args; never `for x in $*`. |
| [[ -f $path && $x == *.txt ]] | Bash conditional — `[[ ]]` is safer than `[ ]` (no word-split, supports patterns). | Always prefer `[[ ]]` over `[ ]` in bash; use `[ ]` only for POSIX sh. |
| cmd1 \| cmd2 \| cmd3 | Pipe — wires stdout of one process to stdin of next. Exit status = last cmd. | Streaming pipelines; grep/awk/sed/jq compose here. |
| cmd > out.log 2>&1 \| tee -a err.log | Redirect stdout and stderr; tee duplicates stream. | Logging; `2>&1` must come AFTER the stdout redirect. |
| cmd < input.txt > output.txt | Redirect stdin from file, stdout to file. | Avoid `cat file \| cmd` — use `< file cmd` for one less process. |
| trap 'cleanup' EXIT INT TERM | Run handler on shell exit or signal — EXIT fires on normal end too. | Always clean up temp files, locks, subshells in a trap. |
| bash -c '...' / source script.sh | Subshell vs current shell — `source` (or `.`) runs in the current shell. | Subshell for isolation; `source` for setting env vars / functions. |
| ${var:-default} / ${var%.*} / ${var// /_} | Parameter expansion — default, suffix-strip, replace. | String ops without calling sed/awk; ~10x faster than a subshell. |
| $? / $! / $$ / $PIPESTATUS | Last exit, last bg PID, current PID, pipe exit codes per command. | Inspect $PIPESTATUS[0] for the first command's status — $? is only the last. |
| function f() { local x=1; ...; } | Function with local-scoped vars — global by default otherwise. | Always use `local` for function-scoped vars to avoid leaking. |

## Idiomatic Patterns

**Strict-mode script with safe tempfiles and traps**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
shopt -s inherit_errexit 2>/dev/null || true   # subshells inherit -e

trap 'rc=$?; rm -rf "$TMPDIR"; exit $rc' EXIT
TMPDIR="$(mktemp -d -t myscript.XXXXXX)"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

main() {
  local in_file="$1" out_file="$2"
  [[ -f "$in_file" ]] || { log "missing input: $in_file"; exit 64; }

  # Quoted everywhere; pipefail catches failures mid-pipeline.
  jq '.[] | select(.ok)' < "$in_file"     | sort -u     > "$TMPDIR/intermediate"

  cp "$TMPDIR/intermediate" "$out_file"
  log "wrote $out_file"
}

main "$@"
```

**Array iteration done right (and wrong)**

```bash
files=("a.txt" "b file.txt" "c.txt")

# WRONG — word-splits on spaces, so "b file.txt" becomes "b" and "file.txt".
for f in $files; do echo "$f"; done        # also wrong: ${files} or $files

# WRONG — globs expand against cwd, so "*.txt" matches local files.
for f in ${files[@]}; do echo "$f"; done

# RIGHT — quoted array expansion preserves each element verbatim.
for f in "${files[@]}"; do echo "$f"; done

# RIGHT for positional args.
run() { for arg in "$@"; do printf '%s\n' "$arg"; done; }

# Iterate over find output safely — use -print0 / read -d ''.
while IFS= read -r -d '' f; do
  process "$f"
done < <(find . -type f -name '*.txt' -print0)
```

**Parallel jobs with bounded concurrency**

```bash
# Run up to 4 jobs at once, fail the script if any child fails.
set -euo pipefail

run_one() {
  local url="$1" out="$2"
  curl -fsS "$url" -o "$out"
}

pids=()
for url in "${urls[@]}"; do
  while (( ${#pids[@]} >= 4 )); do
    # Reap any finished child; propagate its exit code.
    wait -n; rc=$?
    (( rc == 0 )) || exit "$rc"
    pids=("${pids[@]:1}")
  done
  run_one "$url" "${url##*/}.body" &
  pids+=($!)
done

# Wait for the stragglers; fail if any died.
for pid in "${pids[@]}"; do
  wait "$pid" || exit $?
done
```

**Process substitution — feed two streams to one command**

```bash
# <(...) creates a temp FIFO the command reads as a file argument.
# Compares two command outputs without writing to disk.
diff <(jq -S . old.json) <(jq -S . new.json)

# Same trick for joining sorted streams:
join -t $'\t' \
  <(sort -k1,1 users.tsv) \
  <(sort -k1,1 orders.tsv) \
  > joined.tsv

# Tee to both stdout and a log, but keep the pipefail signal flowing:
set -o pipefail
verbose() { while IFS= read -r line; do printf '%s\n' "$line"; done; }
some-command 2> >(tee /dev/stderr) 1> >(verbose | tee out.log)
```

## Common Pitfalls

1. **Unquoted variables word-split on spaces** — *Symptom:* `for f in $(ls); do ...; done` breaks on filenames with spaces, breaks on globs, breaks on newlines — `$(ls)` is the canonical anti-pattern. *Fix:* Quote everything: `for f in *; do ...` for files, `for f in "${arr[@]}"` for arrays. Never parse `ls` output; use a glob or `find -print0`.
2. **Missing `set -e` lets errors cascade silently** — *Symptom:* Without `set -e`, a failing `cd /nonexistent` doesn't stop the script — the next `rm -rf $OLDPWD/*` runs in the wrong directory and deletes the wrong data. *Fix:* Start every script with `set -Eeuo pipefail`. Add `shopt -s inherit_errexit` (bash 4.4+) so subshells also exit. Test failure paths explicitly.
3. **`pipefail` is off by default — only the last command's exit matters** — *Symptom:* `curl bad-url | jq .` exits 0 if jq succeeds reading curl's empty output, masking the curl failure. *Fix:* `set -o pipefail` so the pipe's exit is the first non-zero. Inspect `${PIPESTATUS[@]}` for per-command codes when needed.
4. **Glob `*` expands against cwd, not against the variable's value** — *Symptom:* `for f in ${files}; ...` where `files='*.txt'` expands the glob in the current directory — a security and correctness hole if the value came from user input (path injection). *Fix:* Quote: `"$files"` keeps it literal. If you need glob expansion, do it explicitly with `compgen -G` or assign to an array: `files=( *.txt )`.
5. **`local var=$(cmd)` masks the exit code** — *Symptom:* `local x=$(false)` returns 0 because `local` is the command that succeeds — the `false` exit code is lost, defeating `set -e`. *Fix:* Split into two lines: `local x; x=$(false)`. Now `set -e` correctly fires on the `false`. Lint with shellcheck SC2155.
6. **`[ ]` does word-splitting; `[[ ]]` doesn't** — *Symptom:* `[ $x = foo ]` fails when `$x` is empty or contains spaces — `[ = foo ]` is a syntax error. Works fine until production data has an empty value. *Fix:* Always quote inside `[ ]`: `[ "$x" = foo ]`. Better: use `[[ $x == foo ]]` (no quoting needed, supports patterns). Reserve `[ ]` for POSIX sh scripts.
7. **`cd` in a script changes the parent's working dir on `source`** — *Symptom:* Sourcing a script that does `cd /tmp` changes your interactive shell's cwd — surprising, sometimes destructive. Running it as `./script.sh` is safe. *Fix:* Run scripts as a subprocess (`./script.sh` or `bash script.sh`) when they `cd`. Use a subshell `(cd dir && cmd)` to scope the cd locally. Never `source` build scripts.

## Production / Interview Quick Reference

- bash 5.3 is the current line (malloc hardening, loadable-builtin rework); distros mostly still ship 5.2.x. `version`
- `set -Eeuo pipefail` is the minimum safety floor — exit on error, undefined var, broken pipe. -E inherits ERR traps to subshells. `gotcha`
- Quote every expansion: `"$VAR"`, `"$@"`, `"${arr[@]}"`. Unquoted = word-split + glob expand. `gotcha`
- `"$@"` preserves each arg as one word; `"$*"` joins with IFS (usually space). Use `"$@"` 99% of the time. `gotcha`
- bash 4.4+ `inherit_errexit` makes subshells honor `set -e`. macOS ships bash 3.2 — install newer via brew or use `/usr/bin/env bash`. `version`
- Use `[[ ]]` over `[ ]` in bash — no word-splitting, supports regex `=~` and pattern `== *.txt`. Use `[ ]` only for POSIX sh portability. `style`
- `local x=$(cmd)` masks the cmd's exit code (SC2155); split into `local x; x=$(cmd)` to preserve `set -e`. `gotcha`
- `find -print0 | while IFS= read -r -d '' f` is the only safe way to iterate filenames (handles spaces, newlines, leading dashes). `perf`
- Process substitution `<(...)` creates a temp FIFO — cleaner than `mktemp` for feeding two streams into one command. `style`
- Parameter expansion is ~10x faster than a `sed` subshell: `${var%.*}` strip suffix, `${var##*/}` strip prefix, `${var//old/new}` replace. `perf`
- `wait -n` (bash 4.3+) waits for the next job to finish — enables bounded parallel job pools. `version`
- `trap 'rc=$?; cleanup; exit $rc' EXIT` is the canonical cleanup pattern; $? at trap entry preserves the original exit code. `style`
- `declare -A map` (bash 4+) gives associative arrays; older shells need `awk` or a tempfile. `version`
- ShellCheck (https://shellcheck.net) is mandatory CI — catches SC2086 (unquoted), SC2155 (local exit), SC2181 (manual $?). `style`
- Use `#!/usr/bin/env bash` over `#!/bin/bash` for portability across Linux/macOS/containers. `style`
- POSIX sh (dash, ash) is 4-10x faster than bash for boot scripts — Alpine/Debian use it for /bin/sh. `perf`

## Go Deeper

- [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html) — The official reference; the Shell Parameters and Shell Expansions chapters are essential.
- [POSIX.1-2017 — Shell & Utilities](https://pubs.opengroup.org/onlinepubs/9699919799/idx/xcu.html) — The portable subset — read to know what works in dash/ash without bash.
- [ShellCheck — wiki](https://github.com/koalaman/shellcheck/wiki) — Every rule (SC1000-SC9999) explained with rationale and fix; the modern shell scripting textbook.
- [BashFAQ (Greg's Wiki)](https://mywiki.wooledge.org/BashFAQ) — Hard-won answers to recurring shell questions — covers all the footguns with depth.
- [Pure Bash Bible (dylanaraps)](https://github.com/dylanaraps/pure-bash-bible) — Patterns using only builtins — no external processes, often 10-100x faster than awk/sed equivalents.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| string | The only primitive. Quoted 'literal' or "interpolated ${var}". Unquoted = word-split + glob. | Everything. Always quote unless you want word-splitting. |
| integer (declare -i) | Integer attribute — arithmetic context. Not a real type; just enables = without $. | Counters, arithmetic. (( )) is preferred over declare -i for clarity. |
| array (indexed) | 0-indexed array of strings. arr=(a b c); access ${arr[0]} or "${arr[@]}" for all. | Lists. Always quote "${arr[@]}" to preserve element boundaries. bash 4+ required for non-zero start. |
| associative array (declare -A) | Hash map — string-keyed. declare -A map=([k1]=v1 [k2]=v2). Bash 4+. | Lookups, counters. Iterate: for k in "${!map[@]}"; do echo "${map[$k]}"; done |
| readonly / declare -r | Immutable variable — assignment after declaration is an error. | Constants: readonly PI=3.14. Use at script top for config values. |
| export | Environment variable — inherited by child processes. | Config for subprocesses: export PATH=$PATH:/opt/bin. Without export, the var stays shell-local. |
| function (named) | Named callable — function f { ... } or f() { ... }. Parameters via $1, $2, $@. | Reusable logic. Always use 'local' for function-scoped vars to avoid leaking. |
| file descriptor (0, 1, 2) | stdin=0, stdout=1, stderr=2. Redirection: >, 2>, &>, 2>&1. | I/O control. '2>&1' must come AFTER the stdout redirect: cmd >out 2>&1. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| indexed array | arr=(a b c). ${arr[@]} = all elements; ${#arr[@]} = length; ${arr[i]} = element i. | Ordered lists. The default collection. Iterate: for x in "${arr[@]}". |
| associative array (declare -A) | Hash map — bash 4+. Keys are strings; values are strings. | Lookups, counting, dedup. Older bash (3.2 macOS) needs awk or a temp file. |
| positional params ($@, $*, $1..$9) | Args to script/function. $@ preserves each as one word; $* joins with IFS. | Function args: "$@" for each arg; shift to consume. $0 is script name. |
| string ops (${var//old/new}) | Parameter expansion — substring, replace, length, default. No external process. | String transforms ~10x faster than sed. ${var%.*} strip suffix, ${var##*/} strip prefix. |
| PIPESTATUS / ${PIPESTATUS[@]} | Array of exit codes from the last pipeline — one per command. $? is only the LAST. | Inspecting mid-pipeline failures. Requires 'set -o pipefail' to fail on any. |
| mapfile / readarray | Read lines from stdin into an array — no while-read loop needed. | mapfile -t lines < file is faster than while IFS= read -r line. |
| compgen -W | Generate completion candidates from a word list. | Custom completion scripts; rarely used in normal scripts. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| function f { ... } / f() { ... } | Function definition. Both syntaxes work; 'function f' is bash-specific, 'f()' is POSIX. | Reusable logic. Always 'local' vars; 'return' exits with status (0-255). |
| alias name='cmd' | Textual abbreviation — expanded at parse time, not runtime. No args support. | Interactive shells only. Don't use in scripts — functions are better. |
| source / . script | Run a script in the CURRENT shell — inherits and modifies variables. | Loading config, defining functions. NEVER source scripts that cd or modify env. |
| subshell ( cmd; cmd ) | Runs in a child process — variable changes don't propagate to parent. | Isolation: (cd dir && cmd) — cwd change stays scoped. |
| command grouping { cmd; cmd; } | Groups commands in the CURRENT shell — like a function body without a name. | Redirecting a group: { cmd1; cmd2; } > out.log. Note trailing semicolon. |
| here-doc <<EOF ... EOF | Inline file — passed to stdin. Quoted delimiter ('EOF') prevents expansion. | Multi-line strings: cat <<EOF \| cmd. unquoted for variable expansion. |
| process substitution <(cmd) | Temp FIFO — passes a command's output as a file argument to another command. | diff <(jq -S . a) <(jq -S . b) — no temp file needed. |
| trap 'handler' SIGNAL | Register a handler for signals + EXIT. EXIT fires on normal end too. | Cleanup: trap 'rm -rf $TMPDIR' EXIT. Always capture $? at trap entry. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b (( a + b )) | Arithmetic — only inside (( )) or $(( )). + - * / % ** work; / is integer division. | Counters: (( i++ )). Math: x=$(( a * b + c )). No floating-point — use bc/awk. |
| $(( a % b )) | Modulo — bash arithmetic. Sign follows dividend (C-like). | Parity: (( i % 2 == 0 )). Avoid floating-point modulo — use awk. |
| $(( a ** b )) | Exponentiation — bash 4+. Integer only. | Powers. For large exponents, use bc -l for arbitrary precision. |
| = (assignment) | Variable assignment. NO spaces around =. x=5 not x = 5. | Setting vars. Quote RHS: x="hello world". Use export to inherit in subprocesses. |
| a == b, a != b (string) | String equality in [[ ]]. == is pattern match (= also works in [ ]). | Tests: [[ $x == *.txt ]]. Use = in POSIX [ ]; == in bash [[ ]]. |
| -eq, -ne, -lt, -gt, -le, -ge | Integer comparison — in [ ] or [[ ]]. Numeric, not string. | if [ $# -lt 2 ]; then .... 5 -lt 10; '5' -lt '10' (string compares lexically). |
| =~, == (regex / pattern) | =~ in [[ ]] is regex match (bash 3+); == is glob pattern. | [[ $s =~ ^[0-9]+$ ]] — regex. [[ $s == *.txt ]] — glob. Different operators. |
| &&, \|\| | Short-circuit boolean — list operators. cmd1 && cmd2 runs cmd2 only if cmd1 succeeds. | Control flow: mkdir dir && cd dir. [[ -f x ]] \|\| exit 1. Lower precedence than \|. |
| ! cmd | Negation — reverses exit status. cmd returns 0 (success), ! cmd returns 1. | if ! grep -q pattern file; then .... Negates the entire pipeline. |
| cmd1 \| cmd2 | Pipe — wires stdout of cmd1 to stdin of cmd2. Exit = last cmd. | Streaming. Use 'set -o pipefail' so any failure propagates. |
| ;, &&, \|\| | Command separators — sequential (;), conditional (&&, \|\|). | cmd1 ; cmd2 always runs both. cmd1 && cmd2 runs cmd2 only on success. cmd1 \|\| cmd2 runs cmd2 only on failure. |
| >, >>, 2>, 2>&1, &> | Redirection — > stdout to file (truncate), >> append, 2> stderr, 2>&1 merge stderr to stdout, &> both. | Logging: cmd > out.log 2>&1. 2>&1 MUST come AFTER the stdout redirect. |
| <, <<, <<<, <> | stdin redirect: < file, here-doc <<EOF, here-string <<<"text", <> read-write. | cmd < file replaces 'cat file \| cmd' (one less process). <<<$var for piping a var. |
| & (background) | Run command in background — returns immediately, $! is the PID. | long_running &; pids+=($!). Wait with 'wait -n' for bounded concurrency. |

## Input / Output

**Reading files — line-by-line, find output, CSV chunks**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Read entire file
text=$(<file.txt)            # faster than 'cat file.txt'; no subprocess
bytes=$(<file.bin)           # works for binary too (bash 4.4+)

# Read line by line — SAFE for filenames with spaces, newlines, dashes
while IFS= read -r line; do
  process "$line"
done < file.txt

# Iterate find output safely — NUL-separated (handles ALL filenames)
while IFS= read -r -d '' f; do
  process "$f"
done < <(find . -type f -print0)

# Read CSV with awk — keep awk for any non-trivial parsing
awk -F, 'NR > 1 { print $1, $2 }' data.csv
```

**stdin / stdout / stderr — pipes and CLI tools**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Read all of stdin
input=$(cat)                    # or: input=$(< /dev/stdin)

# Stream stdin line by line
while IFS= read -r line; do
  printf '%s\n' "${line^^}"   # ${var^^} uppercases (bash 4+)
done

# Print to stderr
printf '[ERROR] %s\n' "something failed" >&2

# JSON over stdin/stdout — the standard CLI interop pattern
payload=$(cat)
result=$(jq -n --argjson p "$payload" '{transformed: $p}')
printf '%s\n' "$result"

# Tee — write to both stdout and a log file (preserve pipefail flow)
some-cmd 2> >(tee err.log >&2) | tee out.log
```

**Command substitution + here-docs + process substitution**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Command substitution — ALWAYS use $(...) syntax, NEVER backticks.
# Backticks can't nest cleanly and need escaping.
files=$(find . -type f -name '*.go')
today=$(date -u +%Y-%m-%d)

# Here-doc — multi-line string passed to stdin
cat <<EOF > config.yaml
app:
  name: myapp
  version: ${VERSION:-dev}
  built: ${today}
EOF

# Here-doc with QUOTED delimiter — no expansion (literal text)
cat <<'EOF' > script.sh
#!/bin/bash
echo "this $var is NOT expanded"
EOF

# Process substitution — pass command output as a file argument
diff <(jq -S . old.json) <(jq -S . new.json)
join -t $'\t' <(sort users.tsv) <(sort orders.tsv)
```

**HTTP requests with curl + jq (the devops standard)**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# GET with retries + JSON parsing
get_json() {
  local url="$1"
  local attempts=0
  while true; do
    local body
    if body=$(curl -fsS --max-time 10 "$url"); then
      printf '%s' "$body"
      return 0
    fi
    attempts=$((attempts + 1))
    (( attempts >= 3 )) && return 1
    sleep $(( 1 * (2 ** (attempts - 1)) ))   # 1s, 2s, 4s
  done
}

# POST with auth + JSON body
curl -fsS -X POST "$API_URL/users" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg email "$EMAIL" '{email: $email}')" \
  | jq -e '.id'  # -e: exit nonzero if .id is null/false
```

## Loops & Iteration

**for-in over arrays / globs / ranges — the holy trinity**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Iterate an array (always quote "${arr[@]}" — preserves elements with spaces)
files=("a.txt" "b file.txt" "c.txt")
for f in "${files[@]}"; do
  process "$f"
done

# Iterate a glob — expanded by bash, not a subprocess
for f in *.txt; do
  process "$f"
done
# (If no files match, f == '*.txt' — guard with shopt -s nullglob.)

# Range (bash 4+ sequence expression)
for i in {1..10}; do
  printf '%s\n' "$i"
done

# C-style — when you need the index
for (( i = 0; i < 10; i++ )); do
  printf 'item %d\n' "$i"
done
```

**while / until / read — the workhorses**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# while — runs while condition succeeds (exit 0)
while [[ -f /tmp/keep_running ]]; do
  do_work
  sleep 60
done

# while-read — line-by-line from a command (most common pattern)
while IFS= read -r line; do
  process "$line"
done < input.txt

# Process substitution — pipe from a command, preserve 'set -e' semantics
while IFS= read -r line; do
  process "$line"
done < <(find . -type f -name '*.log')

# until — runs until condition succeeds (opposite of while)
until ping -c1 example.com >/dev/null 2>&1; do
  sleep 1
done
```

**xargs + parallel — batch external commands**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# xargs — turn stdin into args for a command. -0 for NUL-separated input.
find . -type f -name '*.go' -print0 \
  | xargs -0 -P4 -I{} gofmt -w {}

# -P4 = 4 parallel processes; -I{} = use {} as placeholder.
# Without -I, xargs appends args at the end.

# GNU parallel — more features (progress, retries, job control)
find . -type f -name '*.png' -print0 \
  | parallel -0 -j4 --bar 'convert {} {.}.jpg'

# GNU parallel is NOT installed by default on macOS — 'brew install parallel'.
# For most use cases xargs -P is enough and is always available.
```

**mapfile / readarray — bulk file reading**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# mapfile -t reads lines into an array (bash 4+).
# Faster than while-read for small/medium files.
mapfile -t lines < file.txt
for line in "${lines[@]}"; do
  process "$line"
done

# Read CSV into a 2D-ish array (split each line too)
mapfile -t csv_lines < data.csv
for line in "${csv_lines[@]}"; do
  IFS=, read -r col1 col2 col3 <<< "$line"
  process "$col1" "$col2" "$col3"
done

# Caveat: mapfile loads the WHOLE file into memory.
# For huge files, stick with while-read (streaming).
```

## Functions & Callables

**Function definition, args, locals, return**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Two syntaxes — both work. 'function f' is bash-specific; 'f()' is POSIX.
greet() {
  local name="$1"               # ALWAYS local — avoids leaking
  local greeting="${2:-Hello}"  # default value via parameter expansion
  printf '%s, %s!\n' "$greeting" "$name"
}

function greet_loud() {
  greet "$@" "HI"               # forward all args + add a default
}

greet "World"                    # Hello, World!
greet_loud "World"               # HI, World!

# 'return' sets exit status (0-255), NOT a value.
# To return a string, capture via command substitution:
uppercase() { printf '%s' "${1^^}"; }
result=$(uppercase "hi")         # "HI"
```

**Parameter expansion — the workhorse string ops**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Defaults — use ${var:-default} (returns default if unset/null)
name="${USER:-anonymous}"

# Assignment — ${var:=default} sets AND returns default if unset
: "${CONFIG_PATH:=/etc/myapp}"   # ':' is a no-op that triggers expansion

# Length
str="hello"
echo "${#str}"                  # 5
arr=(a b c)
echo "${#arr[@]}"               # 3

# Substring (offset, length)
echo "${str:1:3}"               # "ell"
echo "${str: -2}"               # "lo" (note the space — else default syntax)

# Strip prefix/suffix
file="path/to/file.tar.gz"
echo "${file##*/}"              # "file.tar.gz" — strip longest prefix
echo "${file%/*}"               # "path/to"     — strip shortest suffix
echo "${file%%.*}"              # "path/to/file" — strip longest suffix

# Replace
s="hello world"
echo "${s/world/bash}"          # "hello bash" — first match
echo "${s//l/L}"                # "heLLo worLd" — all matches
```

**Closures (sort of) + callback patterns**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Bash has no real closures, but you can use functions + global state carefully.
# Or use 'source' to load helpers that share module-level state.

# Callback pattern — pass function name as string, call with 'eval' or just call
map_file() {
  local callback="$1" file="$2"
  while IFS= read -r line; do
    "$callback" "$line"
  done < "$file"
}

upper_line() { printf '%s\n' "${1^^}"; }
map_file upper_line input.txt

# Higher-order — pass a function name and call it
with_retries() {
  local attempts="$1"; shift
  local cmd="$*"
  for (( i = 1; i <= attempts; i++ )); do
    if "$@"; then return 0; fi
    sleep 1
  done
  return 1
}
with_retries 3 curl -fsS https://api.example.com/health
```

**trap + cleanup — the resource-management pattern**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
shopt -s inherit_errexit 2>/dev/null || true

# Always clean up temp files / dirs / locks via trap on EXIT
TMPDIR="$(mktemp -d -t myscript.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

# Capture original exit code (so cleanup doesn't mask it)
trap 'rc=$?; rm -rf "$TMPDIR"; exit $rc' EXIT INT TERM

# ERR trap — fires on any command failure (with set -e)
trap 'echo "ERROR on line $LINENO (cmd: $BASH_COMMAND)" >&2' ERR

# Use the temp dir freely — guaranteed cleanup on any exit
work_file="$TMPDIR/work.txt"
process > "$work_file"
# ... TMPDIR is removed when the script exits (normally or via Ctrl-C).
```

## Error Handling

**set -e + trap ERR — fail fast with diagnostics**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
shopt -s inherit_errexit 2>/dev/null || true   # subshells honor -e

# -e: exit on any command failure
# -u: error on undefined variable
# -o pipefail: a pipeline fails if ANY command fails (not just the last)
# -E: ERR traps inherit to subshells/functions

# ERR trap — fires on any command that fails (with set -e)
trap 'rc=$?
      echo "FAIL: line $LINENO cmd: $BASH_COMMAND (exit $rc)" >&2
      exit $rc' ERR

# EXIT trap — fires on any exit (normal or error)
trap 'cleanup' EXIT

# Always exit with the original code, not 0 from cleanup
# A failing command will print its location + the command that failed.
```

**Manual error handling with || and if**

```bash
#!/usr/bin/env bash
set -uo pipefail   # NOTE: no -e — we handle errors manually

# || pattern — runs second command on failure
mkdir -p "$WORKDIR" || { echo "mkdir failed" >&2; exit 1; }

# if pattern — explicit success/failure branches
if curl -fsS "$url" -o "$out"; then
  process "$out"
else
  rc=$?
  echo "curl failed (exit $rc)" >&2
  exit $rc
fi

# Use this when 'set -e' would exit too eagerly (e.g., grep returns 1 when no match)
if grep -q pattern file; then
  echo "found"
else
  rc=$?
  (( rc == 1 )) && echo "not found" || echo "grep error $rc" >&2
fi
```

**set -e caveats — where it doesn't catch failures**

```bash
#!/usr/bin/env bash
set -e

# 'set -e' does NOT catch failures in:
# 1. Commands in conditions: 'if failing_cmd; then' — checked, ignored
# 2. Commands followed by || — already handled
# 3. Commands in a pipeline (without -o pipefail) — only the LAST matters
# 4. Commands in subshells (without -E or inherit_errexit) — leaks
# 5. Local declarations: 'local x=$(failing_cmd)' — exit code masked

# Pattern (5) — SC2155 in shellcheck
local x          # declare separately
x=$(failing_cmd) # now 'set -e' fires

# Pattern (3) — pipefail
set -o pipefail
failing_cmd | tee log   # now fails if failing_cmd fails

# Pattern (4) — inherit_errexit (bash 4.4+)
shopt -s inherit_errexit
(result=$(failing_cmd))   # subshell inherits -e

# When in doubt, use '|| die "msg"' helper:
die() { echo "ERROR: $*" >&2; exit 1; }
cmd || die "cmd failed"
```

**Logging + error reporting conventions**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Standard logging helpers — write to stderr (stdout is for data)
log()   { printf '[INFO] %s\n' "$*" >&2; }
warn()  { printf '[WARN] %s\n' "$*" >&2; }
err()   { printf '[ERROR] %s\n' "$*" >&2; }
die()   { err "$*"; exit 1; }

# Usage
[[ -f "$config" ]] || die "config not found: $config"
[[ $# -ge 1 ]] || die "usage: $0 <input>"

log "processing $input"
warn "deprecated flag --old, use --new"

# Convention: stdout = data, stderr = logs/diagnostics.
# This lets you pipe data: myscript | jq .  while still seeing logs in stderr.

# Exit codes (sysexits.h):
# 0  = success
# 1  = general error
# 2  = shell misuse (bad usage)
# 64-78 = sysexits codes (EX_USAGE, EX_DATAERR, EX_NOINPUT, EX_SOFTWARE, etc.)
```

## Concurrency Model

**Background jobs + wait — fan-out, fan-in**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Launch in background with &; capture PID with $!
pids=()
for url in "${URLS[@]}"; do
  curl -fsS "$url" -o "${url##*/}.body" &
  pids+=($!)
done

# Wait for all to finish, propagate failures
rc=0
for pid in "${pids[@]}"; do
  wait "$pid" || rc=$?
done
exit $rc

# 'wait' with no args waits for ALL background jobs.
# 'wait -n' (bash 4.3+) waits for the NEXT one to finish — enables bounded pools.
```

**Bounded parallel pool with wait -n (bash 4.3+)**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

MAX_JOBS=4
pids=()

for url in "${URLS[@]}"; do
  # If at capacity, wait for any job to finish, propagate its exit code
  while (( ${#pids[@]} >= MAX_JOBS )); do
    wait -n || exit $?
    # Reap one PID — we don't know which, so rebuild the list
    new_pids=()
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        new_pids+=("$pid")
      fi
    done
    pids=("${new_pids[@]}")
  done

  curl -fsS "$url" -o "${url##*/}.body" &
  pids+=($!)
done

# Wait for remaining jobs
for pid in "${pids[@]}"; do
  wait "$pid" || exit $?
done
```

**xargs -P — parallel batch processing**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# xargs -P<N> runs N processes in parallel. Simpler than a manual pool
# when you don't need per-job PIDs.

# Compress all .log files in parallel (4 at a time)
find . -type f -name '*.log' -print0 \
  | xargs -0 -P4 -I{} gzip {}

# Download URLs in parallel
printf '%s\n' "${URLS[@]}" \
  | xargs -P8 -I{} sh -c 'curl -fsS "$1" -o "${1##*/}"' _ {}

# GNU parallel — more features (progress, retries, job control)
# find . -type f -name '*.png' -print0 | parallel -0 -j4 'convert {} {.}.jpg'

# 'xargs -P' is simpler; 'parallel' is more powerful. Prefer xargs for portability.
```

**Named pipes (FIFOs) — inter-process communication**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# mkfifo creates a named pipe — appears as a file, behaves like a pipe.
fifo=$(mktemp -u)
mkfifo "$fifo"
trap 'rm -f "$fifo"' EXIT

# Producer writes to the FIFO (blocks until consumer reads)
producer() {
  for i in {1..10}; do
    echo "item $i" > "$fifo"   # blocks until read
  done
  echo "DONE" > "$fifo"
}

# Consumer reads from the FIFO (blocks until producer writes)
consumer() {
  while IFS= read -r line; do
    [[ "$line" == "DONE" ]] && break
    process "$line"
  done < "$fifo"
}

producer &
consumer
wait

# Use case: stream data between two long-running processes without temp files.
```

## Testing Patterns

**bats — Bash Automated Testing System**

```bash
#!/usr/bin/env bats

# bats is the de-facto bash test framework. Syntax: test name + assertions.

@test "addition works" {
  result=$(( 2 + 2 ))
  [ "$result" -eq 4 ]
}

@test "string matches pattern" {
  run echo "hello world"
  [ "$status" -eq 0 ]
  [ "$output" = "hello world" ]
  [[ "$output" == *world* ]]
}

@test "function handles bad input" {
  run my_func "nope"
  [ "$status" -ne 0 ]
  [[ "$output" == *"error"* ]]
}

# Run: bats test/*.bats
# 'run' captures stdout+stderr into $output and exit code into $status.
# Assertions use [] or [[ ]] — bash-native, no DSL.
```

**ShellCheck — the bash linter (mandatory in CI)**

```bash
#!/usr/bin/env bash
# Run ShellCheck on every script in CI. Catches the 80% of bash footguns.

# Common SC codes it catches:
# SC2086: unquoted variable (word-splits on spaces)
#   bad:  for f in $files; do ...
#   good: for f in "$files" /* or */ for f in "${files[@]}"; do ...
#
# SC2155: 'local x=$(cmd)' masks the cmd's exit code
#   bad:  local x=$(curl ...)
#   good: local x; x=$(curl ...)
#
# SC2181: manual $? check instead of 'if cmd'
#   bad:  cmd; if [ $? -ne 0 ]; then ...
#   good: if ! cmd; then ...
#
# SC2046: unquoted $(cmd) word-splits
#   bad:  for f in $(find . -type f); do ...
#   good: while IFS= read -r -d '' f; do ...; done < <(find . -type f -print0)

# CI: install shellcheck + run on all *.sh files.
# GitHub Action: 'ludeeus/action-shellcheck' is the standard.
```

**Manual test harness — when bats is overkill**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# Lightweight test helper for small scripts
PASS=0; FAIL=0
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
    printf '  ok  %s\n' "$name"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %s\n    expected: %s\n    actual:   %s\n' \
      "$name" "$expected" "$actual" >&2
  fi
}

assert_eq "addition" "4" "$((2 + 2))"
assert_eq "uppercase" "HELLO" "${var^^}"
# ...

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
(( FAIL == 0 )) || exit 1
```

**CI config — GitHub Actions + ShellCheck + bats**

```bash
# .github/workflows/test.yml
name: test
on: [push, pull_request]
jobs:
  shellcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ludeeus/action-shellcheck@master
        with:
          severity: warning
          # additional_files: 'script.sh'  # files without .sh extension

  bats:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bats-core/bats-action@2.0.0
        with:
          bats-version: 1.11.0
      - run: bats test/

# Local dev:
#   brew install shellcheck bats-core
#   shellcheck *.sh
#   bats test/*.bats
```

## Performance Tuning

- Parameter expansion is ~10x faster than a sed/awk subshell: ${var%.*} strips suffix, ${var##*/} strips prefix, ${var//old/new} replaces.
- Quote every expansion: "$VAR", "$@", "${arr[@]}". Unquoted = word-split + glob expand (slow + buggy).
- POSIX sh (dash, ash) is 4-10x faster than bash for boot scripts — Alpine/Debian use it for /bin/sh.
- Avoid subshells in loops — $(cmd) forks a process. Use parameter expansion or builtins instead.
- mapfile -t arr < file is faster than while-read for small/medium files (one read syscall vs N).
- <(cmd) process substitution avoids a temp file, but still forks the command — not free.
- Avoid 'cat file | cmd' — use 'cmd < file' for one less process and a smaller pipe buffer.
- printf is faster and more portable than echo — and supports format strings.
- (( )) arithmetic is faster than [ ] -lt for integer comparison — bash builtin, no fork.
- bash 4.4+ inherit_errexit makes subshells honor set -e — older versions silently swallow failures in subshells.
- xargs -P<N> for parallel external commands — usually faster than a bash background-job pool.
- wait -n (bash 4.3+) waits for the next job to finish — enables bounded parallel job pools without polling.
- Forking a process is ~1-5ms on Linux — calling grep 1000 times in a loop costs 1-5 seconds. Use one grep with many patterns.
- declare -A (associative array) is O(1) lookup — beats a case statement or repeated grep for >10 keys.
- ShellCheck catches SC2086/SC2155/SC2181 — the top 3 bash footguns. Mandatory in CI.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [bash](https://www.gnu.org/software/bash/) | GNU Bourne-Again Shell — the default on most Linux/macOS. v5.x current. | build |
| [dash / ash](https://en.wikipedia.org/wiki/Almquist_shell) | POSIX sh — fast, minimal. /bin/sh on Debian/Alpine. No arrays, no [[ ]]. | build |
| [zsh](https://www.zsh.org/) | Interactive shell — default on macOS since Catalina. Better tab completion + history. | build |
| [fish](https://fishshell.com/) | Friendly Interactive Shell — out-of-box UX, NOT POSIX-compatible. | build |
| [ShellCheck](https://www.shellcheck.net/) | The mandatory linter — catches SC2086 (unquoted), SC2155 (local exit), SC2181 (manual $?), and 200+ more. | lint |
| [shfmt](https://github.com/mvdan/sh) | Formatter — opinionated, like gofmt. Supports POSIX/bash/mksh. Google/mvdan. | lint |
| [bats](https://bats-core bats-core.github.io/) | Bash Automated Testing System — the de-facto test framework for shell scripts. | test |
| [jq](https://stedolan.github.io/jq/) | JSON processor — sed/awk for JSON. The standard for shell-JSON interop. | build |
| [ripgrep (rg)](https://github.com/BurntSushi/ripgrep) | Rust-based grep — 5-10x faster than grep, respects .gitignore by default. | build |
| [fd](https://github.com/sharkdp/fd) | Rust-based find — faster, saner defaults than find. Non-portable syntax. | build |
| [fzf](https://github.com/junegunn/fzf) | Fuzzy finder — interactive grep for files, history, anything. | build |
| [coreutils](https://www.gnu.org/software/coreutils/) | GNU coreutils — ls, cp, mv, rm, etc. The GNU versions are more featureful than BSD/macOS. | build |
| [GNU make](https://www.gnu.org/software/make/) | Build automation — Makefile pattern. Often called from shell scripts. | build |
| [set -Eeuo pipefail](https://bertvandenbroucke.netlify.app/2019/08/15/strict-mode-in-bash/) | Not a tool but the mandatory bash strict mode — first line of every script that matters. | lint |
| [sheldon / oh-my-zsh](https://github.com/ohmyzsh/ohmyzsh) | Shell plugin managers — install helpers, completions, themes. sheldon is Rust-based + fast. | build |
| [starship](https://starship.rs/) | Cross-shell prompt — Rust-based, shows git status, language versions, etc. | build |
| [Greg's Wiki (BashFAQ)](https://mywiki.wooledge.org/BashFAQ) | Hard-won answers to recurring shell questions — the modern shell scripting textbook. | debug |
| [Pure Bash Bible](https://github.com/dylanaraps/pure-bash-bible) | Patterns using only builtins — no external processes, often 10-100x faster than awk/sed. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 1989 | First release by Brian Fox (GNU) — Bourne shell successor. |
| 2.0 | 1996 | POSIX mode, arrays, [[ ]], functions, $'...' quoting. The modern era. |
| 5.3 | 2025 | Current stable line (Jul 2025): loadable builtins rework, malloc hardening. 5.2.x remains the conservative default in most distros. |
| 3.0 | 2004 | Regular expressions via =~, brace expansion, pipefail option. |
| 3.1 | 2005 | printf -v (assign to variable), better locale support. |
| 4.0 | 2009 | Associative arrays (declare -A), coproc, mapfile/readarray, \|& for stderr piping. |
| 4.1 | 2010 | printf -v improvements, $BASHPID, smaller bug fixes. |
| 4.2 | 2011 | Lastpipe (last command of pipeline runs in current shell), associative array fixes. |
| 4.3 | 2014 | wait -n (bounded parallel jobs), namerefs (declare -n), ${var^} case modification. |
| 4.4 | 2016 | inherit_errexit (subshells honor set -e), mapfile -d, ${var@U} transforms. |
| 5.0 | 2019 | Extended glob fixes, namerefs in inner scopes, EPOCHREALTIME (microsecond precision). |
| 5.1 | 2020 | assoc_expand_once, set -p, math expression improvements. |
| 5.2 | 2022 | assoc arrays: indirect expansion, loadable builtins improvements. |
| 5.3 | 2024 | Stability + bug fixes; ARM improvements, runtime localization. |

## Interview Hot Questions

1. **Why is 'set -euo pipefail' the recommended script header?** *(medium)*

   Three safety flags: -e exits on any command failure (prevents silent cascades), -u treats undefined variables as errors (catches typos), -o pipefail makes a pipeline fail if ANY command fails (not just the last). Combined, they catch the 80% of bash footguns. -E (inherit ERR traps) and 'shopt -s inherit_errexit' (bash 4.4+) extend this to subshells. The catch: -e doesn't catch failures in conditions (if cmd), in commands followed by ||, or in 'local x=$(cmd)' (the local command's exit is what -e sees, not cmd's).

2. **Explain word-splitting and why you must quote every variable.** *(easy)*

   Bash has no real data types — every variable holds a string. When you write $VAR unquoted, bash replaces it with its contents, then word-splits the result on $IFS (whitespace by default), then expands any globs. So a filename with spaces ('my file.txt') becomes two args ('my', 'file.txt'), and a value with '*' expands to the cwd's files. Quote every expansion: "$VAR", "$@", "${arr[@]}". The exception is when you WANT word-splitting (rare). Use arrays for lists, never space-separated strings.

3. **What's the difference between $@, "$@", $*, and "$*"?** *(easy)*

   $@ and $* both expand to all positional params. Without quotes, both word-split. The crucial difference is WITH quotes: "$@" preserves each arg as one word (one $1, one $2, etc.); "$*" joins all args with IFS (usually space) into a single string. Use "$@" 99% of the time — it's the only safe way to forward args. Use "$*" only when you want a single joined string (e.g., for logging).

4. **How would you run N jobs in parallel with bounded concurrency?** *(medium)*

   Three approaches: (1) xargs -P<N> — simplest, runs N processes in parallel, best for batch external commands; (2) wait -n (bash 4.3+) — wait for the next job to finish in a manual pool, more control but more code; (3) GNU parallel — most features (progress, retries, job control) but not always installed. For most use cases xargs -P is the right answer. For per-job error handling or complex dependencies, use the wait -n pool.

5. **Why is 'for f in $(ls)' wrong, and what's the correct pattern?** *(easy)*

   "$(ls)" word-splits on whitespace and globs expand, so filenames with spaces become multiple args, and '*' matches local files. It's a correctness AND security hole — a filename with a leading dash could be interpreted as a flag by the next command. Correct patterns: (1) for f in *.txt (glob, no subprocess); (2) for f in "${files[@]}" (iterate an array); (3) while IFS= read -r -d '' f; do ...; done < <(find . -type f -print0) for find output (handles ALL filenames, including those with newlines).

6. **Explain process substitution <(cmd) and when to use it.** *(medium)*

   <(cmd) creates a temp FIFO (named pipe) and runs cmd with its stdout connected to that FIFO. The FIFO appears as a /dev/fd/NN path you can pass as a file argument. Use cases: diff <(jq -S . old.json) <(jq -S . new.json) — compare two command outputs without temp files; join <(sort users.tsv) <(sort orders.tsv) — feed two sorted streams to join. It avoids temp files but still forks the command — not free, just cleaner. Doesn't work on sh (only bash/zsh) or in some minimal containers.

7. **What does 'local x=$(cmd)' hide, and how do you fix it?** *(medium)*

   'local' is itself a command with an exit status. So 'local x=$(cmd)' sets x to cmd's output, but the exit code captured by 'set -e' is local's (success), not cmd's. A failing cmd silently continues. Fix: declare first, assign separately. 'local x; x=$(cmd)'. Now 'set -e' fires on cmd's failure. ShellCheck flags this as SC2155. The same applies to 'declare' and 'readonly' — they all mask the RHS exit code.

8. **How do traps work, and what's the cleanup pattern?** *(medium)*

   trap registers a handler for signals (INT, TERM, HUP) and the pseudo-signal EXIT (fires on any exit). Pattern: trap 'rc=$?; cleanup; exit $rc' EXIT — captures the original exit code at trap entry (before cleanup might reset $?), runs cleanup, then exits with the original code. Always capture $? FIRST inside the trap, because any command between the triggering failure and the capture will reset it. Use EXIT for cleanup (fires on normal end too), ERR for diagnostics (fires only on failures, requires set -e).

9. **Why is bash arrays' "${arr[@]}" (quoted) different from ${arr[@]} (unquoted)?** *(easy)*

   Unquoted ${arr[@]} word-splits each element on IFS AND expands globs — so an element 'a b' becomes two args, and '*' matches cwd files. Quoted "${arr[@]}" preserves each element as one word, even with spaces or special chars. This is the bash analog of the universal "$@" rule. Always quote "${arr[@]}" to iterate safely. Use ${arr[*]} (with or without quotes) only when you want all elements joined into one string with IFS.

10. **When would you use a subshell vs a function vs sourcing?** *(hard)*

   Subshell ( cmd; cmd ) — for isolation: variable changes, cwd changes, traps don't leak to parent. Use for 'do this work in a different directory' or 'try this without polluting the shell'. Function — for reusable logic in the current shell: shares variables (use 'local'), faster (no fork). Use for the 90% case. Source (source script.sh or . script.sh) — for loading libraries: defines functions + vars in the current shell. Use for shell RC files and library loaders. NEVER source a script that cd's or modifies env unexpectedly.

## When to Choose This

- **vs Python:** use this — Gluing existing CLI tools (grep/awk/curl/jq), container entrypoints, build scripts, anywhere <100 lines and you need pipes.; use that — Anything with logic branches >5, JSON parsing beyond jq, anything cross-platform, anything where a bug is expensive — Python's clarity wins.
- **vs POSIX sh (dash/ash):** use this — Interactive use, modern bash scripts using arrays, [[ ]], process substitution.; use that — Boot scripts, initramfs, Alpine/Debian /bin/sh, anywhere startup speed > features (POSIX sh is 4-10x faster).
- **vs zsh:** use this — Scripting, CI runners, containers — bash is more portable and standardized.; use that — Interactive shells — zsh has better completion, history, and out-of-box UX. macOS default since Catalina.
- **vs fish:** use this — Scripts that must run on CI / production where POSIX compatibility matters.; use that — Interactive shells for users who want out-of-box UX without config — fish is non-POSIX by design.
- **vs PowerShell:** use this — Unix systems, anywhere the ecosystem (grep/awk/sed/jq/curl) is the actual product.; use that — Windows administration, anywhere .NET / WMI / Azure interop is the actual product — PowerShell's object pipeline beats text.

