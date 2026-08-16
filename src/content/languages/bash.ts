import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "bash",
  name: "Bash / Shell",
  category: "languages",
  tier: 2,
  tags: ["shell", "scripting", "unix", "posix", "devops", "automation", "glue"],
  tagline: "The Unix shell — glue language for processes, pipes, and files, with a footgun at every turn that bash strict mode tames.",
  year: 1989,
  author: "Brian Fox (GNU)",

  tldr: [
    "Bash is a Unix shell and command language: it expands strings, launches processes, wires their stdio together via pipes, and sequences commands with conditionals. It is the default login shell on most Linux distros and macOS, and the scripting language beneath every CI runner, Docker ENTRYPOINT, and orchestration tool.",
    "It dominates devops glue, build scripts, container entrypoints, and one-off automation — anywhere you need to chain CLI tools, transform text streams, or wrap processes. POSIX sh is the portable subset; bash adds arrays, `[[ ]]`, process substitution, and `set -o pipefail`.",
    "Reach for Bash when you're gluing existing tools (grep, awk, curl, jq), writing container entrypoints, automating filesystem ops, or wrapping a quick pipeline you'll throw away in a week.",
    "Avoid Bash for anything with logic branches beyond a few if-statements, anything requiring JSON parsing beyond `jq`, anything cross-platform, or anything where a bug is expensive — rewrite in Python or Go as soon as the script crosses 100 lines.",
  ],

  mentalModel: {
    title: "Everything is a string; word-splitting is the enemy",
    body: "Bash has no real data types — every variable holds a string, and `$VAR` is replaced by its contents verbatim before the command runs. The shell then word-splits the result on `$IFS` (whitespace by default) and re-expands any globs. This single behavior explains 80% of bash bugs: filenames with spaces break loops, unquoted variables silently split, and `*` expands to whatever's in your cwd. The mental model that saves you: quote every variable expansion (`\"$VAR\"`, `\"$@\"`), enable `set -euo pipefail` to fail fast on undefined vars and broken pipes, and reach for arrays (`arr=(\"$@\")`) instead of space-separated strings the moment you have more than one item. Bash is a UI for processes, not a programming language — when you find yourself fighting it, switch.",
  },

  constructs: [
    { syntax: "set -euo pipefail / set -Eeuo pipefail", behavior: "Fail on undefined var (-u), on command failure (-e), on broken pipe (-o pipefail); -E inherits traps.", when: "First line of every script that matters. The 'bash strict mode'." },
    { syntax: "var=\"$(cmd)\" # capture stdout", behavior: "Command substitution, quoted to prevent word-splitting.", when: "Always quote — `var=$(cmd)` (unquoted) breaks on multi-word output." },
    { syntax: "arr=(\"$@\") / for x in \"\${arr[@]}\"", behavior: "Array of positional args, expanded quoted to preserve spaces.", when: "The correct way to iterate args; never `for x in $*`." },
    { syntax: "[[ -f $path && $x == *.txt ]]", behavior: "Bash conditional — `[[ ]]` is safer than `[ ]` (no word-split, supports patterns).", when: "Always prefer `[[ ]]` over `[ ]` in bash; use `[ ]` only for POSIX sh." },
    { syntax: "cmd1 | cmd2 | cmd3", behavior: "Pipe — wires stdout of one process to stdin of next. Exit status = last cmd.", when: "Streaming pipelines; grep/awk/sed/jq compose here." },
    { syntax: "cmd > out.log 2>&1 | tee -a err.log", behavior: "Redirect stdout and stderr; tee duplicates stream.", when: "Logging; `2>&1` must come AFTER the stdout redirect." },
    { syntax: "cmd < input.txt > output.txt", behavior: "Redirect stdin from file, stdout to file.", when: "Avoid `cat file | cmd` — use `< file cmd` for one less process." },
    { syntax: "trap 'cleanup' EXIT INT TERM", behavior: "Run handler on shell exit or signal — EXIT fires on normal end too.", when: "Always clean up temp files, locks, subshells in a trap." },
    { syntax: "bash -c '...' / source script.sh", behavior: "Subshell vs current shell — `source` (or `.`) runs in the current shell.", when: "Subshell for isolation; `source` for setting env vars / functions." },
    { syntax: "\${var:-default} / \${var%.*} / \${var// /_}", behavior: "Parameter expansion — default, suffix-strip, replace.", when: "String ops without calling sed/awk; ~10x faster than a subshell." },
    { syntax: "$? / $! / $$ / $PIPESTATUS", behavior: "Last exit, last bg PID, current PID, pipe exit codes per command.", when: "Inspect $PIPESTATUS[0] for the first command's status — $? is only the last." },
    { syntax: "function f() { local x=1; ...; }", behavior: "Function with local-scoped vars — global by default otherwise.", when: "Always use `local` for function-scoped vars to avoid leaking." },
  ],

  patterns: [
    {
      lang: "bash",
      caption: "Strict-mode script with safe tempfiles and traps",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail
shopt -s inherit_errexit 2>/dev/null || true   # subshells inherit -e

trap 'rc=$?; rm -rf "$TMPDIR"; exit $rc' EXIT
TMPDIR="$(mktemp -d -t myscript.XXXXXX)"

log() { printf '[%s] %s\\n' "$(date -u +%FT%TZ)" "$*" >&2; }

main() {
  local in_file="$1" out_file="$2"
  [[ -f "$in_file" ]] || { log "missing input: $in_file"; exit 64; }

  # Quoted everywhere; pipefail catches failures mid-pipeline.
  jq '.[] | select(.ok)' < "$in_file" \
    | sort -u \
    > "$TMPDIR/intermediate"

  cp "$TMPDIR/intermediate" "$out_file"
  log "wrote $out_file"
}

main "$@"`,
    },
    {
      lang: "bash",
      caption: "Array iteration done right (and wrong)",
      code: `files=("a.txt" "b file.txt" "c.txt")

# WRONG — word-splits on spaces, so "b file.txt" becomes "b" and "file.txt".
for f in $files; do echo "$f"; done        # also wrong: \${files} or $files

# WRONG — globs expand against cwd, so "*.txt" matches local files.
for f in \${files[@]}; do echo "$f"; done

# RIGHT — quoted array expansion preserves each element verbatim.
for f in "\${files[@]}"; do echo "$f"; done

# RIGHT for positional args.
run() { for arg in "$@"; do printf '%s\\n' "$arg"; done; }

# Iterate over find output safely — use -print0 / read -d ''.
while IFS= read -r -d '' f; do
  process "$f"
done < <(find . -type f -name '*.txt' -print0)`,
    },
    {
      lang: "bash",
      caption: "Parallel jobs with bounded concurrency",
      code: `# Run up to 4 jobs at once, fail the script if any child fails.
set -euo pipefail

run_one() {
  local url="$1" out="$2"
  curl -fsS "$url" -o "$out"
}

pids=()
for url in "\${urls[@]}"; do
  while (( \${#pids[@]} >= 4 )); do
    # Reap any finished child; propagate its exit code.
    wait -n; rc=$?
    (( rc == 0 )) || exit "$rc"
    pids=("\${pids[@]:1}")
  done
  run_one "$url" "\${url##*/}.body" &
  pids+=($!)
done

# Wait for the stragglers; fail if any died.
for pid in "\${pids[@]}"; do
  wait "$pid" || exit $?
done`,
    },
    {
      lang: "bash",
      caption: "Process substitution — feed two streams to one command",
      code: `# <(...) creates a temp FIFO the command reads as a file argument.
# Compares two command outputs without writing to disk.
diff <(jq -S . old.json) <(jq -S . new.json)

# Same trick for joining sorted streams:
join -t $'\\t' \\
  <(sort -k1,1 users.tsv) \\
  <(sort -k1,1 orders.tsv) \\
  > joined.tsv

# Tee to both stdout and a log, but keep the pipefail signal flowing:
set -o pipefail
verbose() { while IFS= read -r line; do printf '%s\\n' "$line"; done; }
some-command 2> >(tee /dev/stderr) 1> >(verbose | tee out.log)`,
    },
  ],

  pitfalls: [
    {
      title: "Unquoted variables word-split on spaces",
      symptom: "`for f in $(ls); do ...; done` breaks on filenames with spaces, breaks on globs, breaks on newlines — `$(ls)` is the canonical anti-pattern.",
      fix: "Quote everything: `for f in *; do ...` for files, `for f in \"\${arr[@]}\"` for arrays. Never parse `ls` output; use a glob or `find -print0`.",
    },
    {
      title: "Missing `set -e` lets errors cascade silently",
      symptom: "Without `set -e`, a failing `cd /nonexistent` doesn't stop the script — the next `rm -rf $OLDPWD/*` runs in the wrong directory and deletes the wrong data.",
      fix: "Start every script with `set -Eeuo pipefail`. Add `shopt -s inherit_errexit` (bash 4.4+) so subshells also exit. Test failure paths explicitly.",
    },
    {
      title: "`pipefail` is off by default — only the last command's exit matters",
      symptom: "`curl bad-url | jq .` exits 0 if jq succeeds reading curl's empty output, masking the curl failure.",
      fix: "`set -o pipefail` so the pipe's exit is the first non-zero. Inspect `\${PIPESTATUS[@]}` for per-command codes when needed.",
    },
    {
      title: "Glob `*` expands against cwd, not against the variable's value",
      symptom: "`for f in \${files}; ...` where `files='*.txt'` expands the glob in the current directory — a security and correctness hole if the value came from user input (path injection).",
      fix: "Quote: `\"$files\"` keeps it literal. If you need glob expansion, do it explicitly with `compgen -G` or assign to an array: `files=( *.txt )`.",
    },
    {
      title: "`local var=$(cmd)` masks the exit code",
      symptom: "`local x=$(false)` returns 0 because `local` is the command that succeeds — the `false` exit code is lost, defeating `set -e`.",
      fix: "Split into two lines: `local x; x=$(false)`. Now `set -e` correctly fires on the `false`. Lint with shellcheck SC2155.",
    },
    {
      title: "`[ ]` does word-splitting; `[[ ]]` doesn't",
      symptom: "`[ $x = foo ]` fails when `$x` is empty or contains spaces — `[ = foo ]` is a syntax error. Works fine until production data has an empty value.",
      fix: "Always quote inside `[ ]`: `[ \"$x\" = foo ]`. Better: use `[[ $x == foo ]]` (no quoting needed, supports patterns). Reserve `[ ]` for POSIX sh scripts.",
    },
    {
      title: "`cd` in a script changes the parent's working dir on `source`",
      symptom: "Sourcing a script that does `cd /tmp` changes your interactive shell's cwd — surprising, sometimes destructive. Running it as `./script.sh` is safe.",
      fix: "Run scripts as a subprocess (`./script.sh` or `bash script.sh`) when they `cd`. Use a subshell `(cd dir && cmd)` to scope the cd locally. Never `source` build scripts.",
    },
  ],

  quickReference: [
    { fact: "`set -Eeuo pipefail` is the minimum safety floor — exit on error, undefined var, broken pipe. -E inherits ERR traps to subshells.", tag: "gotcha" },
    { fact: "Quote every expansion: `\"$VAR\"`, `\"$@\"`, `\"\${arr[@]}\"`. Unquoted = word-split + glob expand.", tag: "gotcha" },
    { fact: "`\"$@\"` preserves each arg as one word; `\"$*\"` joins with IFS (usually space). Use `\"$@\"` 99% of the time.", tag: "gotcha" },
    { fact: "bash 4.4+ `inherit_errexit` makes subshells honor `set -e`. macOS ships bash 3.2 — install newer via brew or use `/usr/bin/env bash`.", tag: "version" },
    { fact: "Use `[[ ]]` over `[ ]` in bash — no word-splitting, supports regex `=~` and pattern `== *.txt`. Use `[ ]` only for POSIX sh portability.", tag: "style" },
    { fact: "`local x=$(cmd)` masks the cmd's exit code (SC2155); split into `local x; x=$(cmd)` to preserve `set -e`.", tag: "gotcha" },
    { fact: "`find -print0 | while IFS= read -r -d '' f` is the only safe way to iterate filenames (handles spaces, newlines, leading dashes).", tag: "perf" },
    { fact: "Process substitution `<(...)` creates a temp FIFO — cleaner than `mktemp` for feeding two streams into one command.", tag: "style" },
    { fact: "Parameter expansion is ~10x faster than a `sed` subshell: `\${var%.*}` strip suffix, `\${var##*/}` strip prefix, `\${var//old/new}` replace.", tag: "perf" },
    { fact: "`wait -n` (bash 4.3+) waits for the next job to finish — enables bounded parallel job pools.", tag: "version" },
    { fact: "`trap 'rc=$?; cleanup; exit $rc' EXIT` is the canonical cleanup pattern; $? at trap entry preserves the original exit code.", tag: "style" },
    { fact: "`declare -A map` (bash 4+) gives associative arrays; older shells need `awk` or a tempfile.", tag: "version" },
    { fact: "ShellCheck (https://shellcheck.net) is mandatory CI — catches SC2086 (unquoted), SC2155 (local exit), SC2181 (manual $?).", tag: "style" },
    { fact: "Use `#!/usr/bin/env bash` over `#!/bin/bash` for portability across Linux/macOS/containers.", tag: "style" },
    { fact: "POSIX sh (dash, ash) is 4-10x faster than bash for boot scripts — Alpine/Debian use it for /bin/sh.", tag: "perf" },
  ],

  goDeeper: [
    { title: "GNU Bash Reference Manual", url: "https://www.gnu.org/software/bash/manual/bash.html", note: "The official reference; the Shell Parameters and Shell Expansions chapters are essential." },
    { title: "POSIX.1-2017 — Shell & Utilities", url: "https://pubs.opengroup.org/onlinepubs/9699919799/idx/xcu.html", note: "The portable subset — read to know what works in dash/ash without bash." },
    { title: "ShellCheck — wiki", url: "https://github.com/koalaman/shellcheck/wiki", note: "Every rule (SC1000-SC9999) explained with rationale and fix; the modern shell scripting textbook." },
    { title: "BashFAQ (Greg's Wiki)", url: "https://mywiki.wooledge.org/BashFAQ", note: "Hard-won answers to recurring shell questions — covers all the footguns with depth." },
    { title: "Pure Bash Bible (dylanaraps)", url: "https://github.com/dylanaraps/pure-bash-bible", note: "Patterns using only builtins — no external processes, often 10-100x faster than awk/sed equivalents." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "string", behavior: "The only primitive. Quoted 'literal' or \"interpolated \${var}\". Unquoted = word-split + glob.", when: "Everything. Always quote unless you want word-splitting." },
      { syntax: "integer (declare -i)", behavior: "Integer attribute — arithmetic context. Not a real type; just enables = without $.", when: "Counters, arithmetic. (( )) is preferred over declare -i for clarity." },
      { syntax: "array (indexed)", behavior: "0-indexed array of strings. arr=(a b c); access \${arr[0]} or \"\${arr[@]}\" for all.", when: "Lists. Always quote \"\${arr[@]}\" to preserve element boundaries. bash 4+ required for non-zero start." },
      { syntax: "associative array (declare -A)", behavior: "Hash map — string-keyed. declare -A map=([k1]=v1 [k2]=v2). Bash 4+.", when: "Lookups, counters. Iterate: for k in \"\${!map[@]}\"; do echo \"\${map[\$k]}\"; done" },
      { syntax: "readonly / declare -r", behavior: "Immutable variable — assignment after declaration is an error.", when: "Constants: readonly PI=3.14. Use at script top for config values." },
      { syntax: "export", behavior: "Environment variable — inherited by child processes.", when: "Config for subprocesses: export PATH=\$PATH:/opt/bin. Without export, the var stays shell-local." },
      { syntax: "function (named)", behavior: "Named callable — function f { ... } or f() { ... }. Parameters via \$1, \$2, \$@.", when: "Reusable logic. Always use 'local' for function-scoped vars to avoid leaking." },
      { syntax: "file descriptor (0, 1, 2)", behavior: "stdin=0, stdout=1, stderr=2. Redirection: >, 2>, &>, 2>&1.", when: "I/O control. '2>&1' must come AFTER the stdout redirect: cmd >out 2>&1." },
    ],
    collections: [
      { syntax: "indexed array", behavior: "arr=(a b c). \${arr[@]} = all elements; \${#arr[@]} = length; \${arr[i]} = element i.", when: "Ordered lists. The default collection. Iterate: for x in \"\${arr[@]}\"." },
      { syntax: "associative array (declare -A)", behavior: "Hash map — bash 4+. Keys are strings; values are strings.", when: "Lookups, counting, dedup. Older bash (3.2 macOS) needs awk or a temp file." },
      { syntax: "positional params (\$@, \$*, \$1..\$9)", behavior: "Args to script/function. \$@ preserves each as one word; \$* joins with IFS.", when: "Function args: \"\$@\" for each arg; shift to consume. \$0 is script name." },
      { syntax: "string ops (\${var//old/new})", behavior: "Parameter expansion — substring, replace, length, default. No external process.", when: "String transforms ~10x faster than sed. \${var%.*} strip suffix, \${var##*/} strip prefix." },
      { syntax: "PIPESTATUS / \${PIPESTATUS[@]}", behavior: "Array of exit codes from the last pipeline — one per command. \$? is only the LAST.", when: "Inspecting mid-pipeline failures. Requires 'set -o pipefail' to fail on any." },
      { syntax: "mapfile / readarray", behavior: "Read lines from stdin into an array — no while-read loop needed.", when: "mapfile -t lines < file is faster than while IFS= read -r line." },
      { syntax: "compgen -W", behavior: "Generate completion candidates from a word list.", when: "Custom completion scripts; rarely used in normal scripts." },
    ],
    custom: [
      { syntax: "function f { ... } / f() { ... }", behavior: "Function definition. Both syntaxes work; 'function f' is bash-specific, 'f()' is POSIX.", when: "Reusable logic. Always 'local' vars; 'return' exits with status (0-255)." },
      { syntax: "alias name='cmd'", behavior: "Textual abbreviation — expanded at parse time, not runtime. No args support.", when: "Interactive shells only. Don't use in scripts — functions are better." },
      { syntax: "source / . script", behavior: "Run a script in the CURRENT shell — inherits and modifies variables.", when: "Loading config, defining functions. NEVER source scripts that cd or modify env." },
      { syntax: "subshell ( cmd; cmd )", behavior: "Runs in a child process — variable changes don't propagate to parent.", when: "Isolation: (cd dir && cmd) — cwd change stays scoped." },
      { syntax: "command grouping { cmd; cmd; }", behavior: "Groups commands in the CURRENT shell — like a function body without a name.", when: "Redirecting a group: { cmd1; cmd2; } > out.log. Note trailing semicolon." },
      { syntax: "here-doc <<EOF ... EOF", behavior: "Inline file — passed to stdin. Quoted delimiter ('EOF') prevents expansion.", when: "Multi-line strings: cat <<EOF | cmd. unquoted for variable expansion." },
      { syntax: "process substitution <(cmd)", behavior: "Temp FIFO — passes a command's output as a file argument to another command.", when: "diff <(jq -S . a) <(jq -S . b) — no temp file needed." },
      { syntax: "trap 'handler' SIGNAL", behavior: "Register a handler for signals + EXIT. EXIT fires on normal end too.", when: "Cleanup: trap 'rm -rf \$TMPDIR' EXIT. Always capture \$? at trap entry." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b (( a + b ))", behavior: "Arithmetic — only inside (( )) or \$(( )). + - * / % ** work; / is integer division.", when: "Counters: (( i++ )). Math: x=\$(( a * b + c )). No floating-point — use bc/awk." },
    { syntax: "\$(( a % b ))", behavior: "Modulo — bash arithmetic. Sign follows dividend (C-like).", when: "Parity: (( i % 2 == 0 )). Avoid floating-point modulo — use awk." },
    { syntax: "\$(( a ** b ))", behavior: "Exponentiation — bash 4+. Integer only.", when: "Powers. For large exponents, use bc -l for arbitrary precision." },
    { syntax: "= (assignment)", behavior: "Variable assignment. NO spaces around =. x=5 not x = 5.", when: "Setting vars. Quote RHS: x=\"hello world\". Use export to inherit in subprocesses." },
    { syntax: "a == b, a != b (string)", behavior: "String equality in [[ ]]. == is pattern match (= also works in [ ]).", when: "Tests: [[ \$x == *.txt ]]. Use = in POSIX [ ]; == in bash [[ ]]." },
    { syntax: "-eq, -ne, -lt, -gt, -le, -ge", behavior: "Integer comparison — in [ ] or [[ ]]. Numeric, not string.", when: "if [ \$# -lt 2 ]; then .... 5 -lt 10; '5' -lt '10' (string compares lexically)." },
    { syntax: "=~, == (regex / pattern)", behavior: "=~ in [[ ]] is regex match (bash 3+); == is glob pattern.", when: "[[ \$s =~ ^[0-9]+\$ ]] — regex. [[ \$s == *.txt ]] — glob. Different operators." },
    { syntax: "&&, ||", behavior: "Short-circuit boolean — list operators. cmd1 && cmd2 runs cmd2 only if cmd1 succeeds.", when: "Control flow: mkdir dir && cd dir. [[ -f x ]] || exit 1. Lower precedence than |." },
    { syntax: "! cmd", behavior: "Negation — reverses exit status. cmd returns 0 (success), ! cmd returns 1.", when: "if ! grep -q pattern file; then .... Negates the entire pipeline." },
    { syntax: "cmd1 | cmd2", behavior: "Pipe — wires stdout of cmd1 to stdin of cmd2. Exit = last cmd.", when: "Streaming. Use 'set -o pipefail' so any failure propagates." },
    { syntax: ";, &&, ||", behavior: "Command separators — sequential (;), conditional (&&, ||).", when: "cmd1 ; cmd2 always runs both. cmd1 && cmd2 runs cmd2 only on success. cmd1 || cmd2 runs cmd2 only on failure." },
    { syntax: ">, >>, 2>, 2>&1, &>", behavior: "Redirection — > stdout to file (truncate), >> append, 2> stderr, 2>&1 merge stderr to stdout, &> both.", when: "Logging: cmd > out.log 2>&1. 2>&1 MUST come AFTER the stdout redirect." },
      { syntax: "<, <<, <<<, <>", behavior: "stdin redirect: < file, here-doc <<EOF, here-string <<<\"text\", <> read-write.", when: "cmd < file replaces 'cat file | cmd' (one less process). <<<\$var for piping a var." },
    { syntax: "& (background)", behavior: "Run command in background — returns immediately, \$! is the PID.", when: "long_running &; pids+=(\$!). Wait with 'wait -n' for bounded concurrency." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "bash",
      caption: "Reading files — line-by-line, find output, CSV chunks",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Read entire file
text=$(<file.txt)            # faster than 'cat file.txt'; no subprocess
bytes=$(<file.bin)           # works for binary too (bash 4.4+)

# Read line by line — SAFE for filenames with spaces, newlines, dashes
while IFS= read -r line; do
  process "\$line"
done < file.txt

# Iterate find output safely — NUL-separated (handles ALL filenames)
while IFS= read -r -d '' f; do
  process "\$f"
done < <(find . -type f -print0)

# Read CSV with awk — keep awk for any non-trivial parsing
awk -F, 'NR > 1 { print \$1, \$2 }' data.csv`,
    },
    {
      lang: "bash",
      caption: "stdin / stdout / stderr — pipes and CLI tools",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Read all of stdin
input=$(cat)                    # or: input=$(< /dev/stdin)

# Stream stdin line by line
while IFS= read -r line; do
  printf '%s\\n' "\${line^^}"   # \${var^^} uppercases (bash 4+)
done

# Print to stderr
printf '[ERROR] %s\\n' "something failed" >&2

# JSON over stdin/stdout — the standard CLI interop pattern
payload=$(cat)
result=\$(jq -n --argjson p "\$payload" '{transformed: \$p}')
printf '%s\\n' "\$result"

# Tee — write to both stdout and a log file (preserve pipefail flow)
some-cmd 2> >(tee err.log >&2) | tee out.log`,
    },
    {
      lang: "bash",
      caption: "Command substitution + here-docs + process substitution",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Command substitution — ALWAYS use \$(...) syntax, NEVER backticks.
# Backticks can't nest cleanly and need escaping.
files=\$(find . -type f -name '*.go')
today=\$(date -u +%Y-%m-%d)

# Here-doc — multi-line string passed to stdin
cat <<EOF > config.yaml
app:
  name: myapp
  version: \${VERSION:-dev}
  built: \${today}
EOF

# Here-doc with QUOTED delimiter — no expansion (literal text)
cat <<'EOF' > script.sh
#!/bin/bash
echo "this \$var is NOT expanded"
EOF

# Process substitution — pass command output as a file argument
diff <(jq -S . old.json) <(jq -S . new.json)
join -t $'\\t' <(sort users.tsv) <(sort orders.tsv)`,
    },
    {
      lang: "bash",
      caption: "HTTP requests with curl + jq (the devops standard)",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# GET with retries + JSON parsing
get_json() {
  local url="\$1"
  local attempts=0
  while true; do
    local body
    if body=\$(curl -fsS --max-time 10 "\$url"); then
      printf '%s' "\$body"
      return 0
    fi
    attempts=\$((attempts + 1))
    (( attempts >= 3 )) && return 1
    sleep \$(( 1 * (2 ** (attempts - 1)) ))   # 1s, 2s, 4s
  done
}

# POST with auth + JSON body
curl -fsS -X POST "\$API_URL/users" \\
  -H "Authorization: Bearer \${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d "\$(jq -n --arg email "\$EMAIL" '{email: \$email}')" \\
  | jq -e '.id'  # -e: exit nonzero if .id is null/false`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "bash",
      caption: "for-in over arrays / globs / ranges — the holy trinity",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Iterate an array (always quote "\${arr[@]}" — preserves elements with spaces)
files=("a.txt" "b file.txt" "c.txt")
for f in "\${files[@]}"; do
  process "\$f"
done

# Iterate a glob — expanded by bash, not a subprocess
for f in *.txt; do
  process "\$f"
done
# (If no files match, f == '*.txt' — guard with shopt -s nullglob.)

# Range (bash 4+ sequence expression)
for i in {1..10}; do
  printf '%s\\n' "\$i"
done

# C-style — when you need the index
for (( i = 0; i < 10; i++ )); do
  printf 'item %d\\n' "\$i"
done`,
    },
    {
      lang: "bash",
      caption: "while / until / read — the workhorses",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# while — runs while condition succeeds (exit 0)
while [[ -f /tmp/keep_running ]]; do
  do_work
  sleep 60
done

# while-read — line-by-line from a command (most common pattern)
while IFS= read -r line; do
  process "\$line"
done < input.txt

# Process substitution — pipe from a command, preserve 'set -e' semantics
while IFS= read -r line; do
  process "\$line"
done < <(find . -type f -name '*.log')

# until — runs until condition succeeds (opposite of while)
until ping -c1 example.com >/dev/null 2>&1; do
  sleep 1
done`,
    },
    {
      lang: "bash",
      caption: "xargs + parallel — batch external commands",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# xargs — turn stdin into args for a command. -0 for NUL-separated input.
find . -type f -name '*.go' -print0 \\
  | xargs -0 -P4 -I{} gofmt -w {}

# -P4 = 4 parallel processes; -I{} = use {} as placeholder.
# Without -I, xargs appends args at the end.

# GNU parallel — more features (progress, retries, job control)
find . -type f -name '*.png' -print0 \\
  | parallel -0 -j4 --bar 'convert {} {.}.jpg'

# GNU parallel is NOT installed by default on macOS — 'brew install parallel'.
# For most use cases xargs -P is enough and is always available.`,
    },
    {
      lang: "bash",
      caption: "mapfile / readarray — bulk file reading",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# mapfile -t reads lines into an array (bash 4+).
# Faster than while-read for small/medium files.
mapfile -t lines < file.txt
for line in "\${lines[@]}"; do
  process "\$line"
done

# Read CSV into a 2D-ish array (split each line too)
mapfile -t csv_lines < data.csv
for line in "\${csv_lines[@]}"; do
  IFS=, read -r col1 col2 col3 <<< "\$line"
  process "\$col1" "\$col2" "\$col3"
done

# Caveat: mapfile loads the WHOLE file into memory.
# For huge files, stick with while-read (streaming).`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "bash",
      caption: "Function definition, args, locals, return",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Two syntaxes — both work. 'function f' is bash-specific; 'f()' is POSIX.
greet() {
  local name="\$1"               # ALWAYS local — avoids leaking
  local greeting="\${2:-Hello}"  # default value via parameter expansion
  printf '%s, %s!\\n' "\$greeting" "\$name"
}

function greet_loud() {
  greet "\$@" "HI"               # forward all args + add a default
}

greet "World"                    # Hello, World!
greet_loud "World"               # HI, World!

# 'return' sets exit status (0-255), NOT a value.
# To return a string, capture via command substitution:
uppercase() { printf '%s' "\${1^^}"; }
result=$(uppercase "hi")         # "HI"`,
    },
    {
      lang: "bash",
      caption: "Parameter expansion — the workhorse string ops",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Defaults — use \${var:-default} (returns default if unset/null)
name="\${USER:-anonymous}"

# Assignment — \${var:=default} sets AND returns default if unset
: "\${CONFIG_PATH:=/etc/myapp}"   # ':' is a no-op that triggers expansion

# Length
str="hello"
echo "\${#str}"                  # 5
arr=(a b c)
echo "\${#arr[@]}"               # 3

# Substring (offset, length)
echo "\${str:1:3}"               # "ell"
echo "\${str: -2}"               # "lo" (note the space — else default syntax)

# Strip prefix/suffix
file="path/to/file.tar.gz"
echo "\${file##*/}"              # "file.tar.gz" — strip longest prefix
echo "\${file%/*}"               # "path/to"     — strip shortest suffix
echo "\${file%%.*}"              # "path/to/file" — strip longest suffix

# Replace
s="hello world"
echo "\${s/world/bash}"          # "hello bash" — first match
echo "\${s//l/L}"                # "heLLo worLd" — all matches`,
    },
    {
      lang: "bash",
      caption: "Closures (sort of) + callback patterns",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Bash has no real closures, but you can use functions + global state carefully.
# Or use 'source' to load helpers that share module-level state.

# Callback pattern — pass function name as string, call with 'eval' or just call
map_file() {
  local callback="\$1" file="\$2"
  while IFS= read -r line; do
    "\$callback" "\$line"
  done < "\$file"
}

upper_line() { printf '%s\\n' "\${1^^}"; }
map_file upper_line input.txt

# Higher-order — pass a function name and call it
with_retries() {
  local attempts="\$1"; shift
  local cmd="\$*"
  for (( i = 1; i <= attempts; i++ )); do
    if "\$@"; then return 0; fi
    sleep 1
  done
  return 1
}
with_retries 3 curl -fsS https://api.example.com/health`,
    },
    {
      lang: "bash",
      caption: "trap + cleanup — the resource-management pattern",
      code: `#!/usr/bin/env bash
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
# ... TMPDIR is removed when the script exits (normally or via Ctrl-C).`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "bash",
      caption: "set -e + trap ERR — fail fast with diagnostics",
      code: `#!/usr/bin/env bash
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
# A failing command will print its location + the command that failed.`,
    },
    {
      lang: "bash",
      caption: "Manual error handling with || and if",
      code: `#!/usr/bin/env bash
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
fi`,
    },
    {
      lang: "bash",
      caption: "set -e caveats — where it doesn't catch failures",
      code: `#!/usr/bin/env bash
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
cmd || die "cmd failed"`,
    },
    {
      lang: "bash",
      caption: "Logging + error reporting conventions",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Standard logging helpers — write to stderr (stdout is for data)
log()   { printf '[INFO] %s\\n' "$*" >&2; }
warn()  { printf '[WARN] %s\\n' "$*" >&2; }
err()   { printf '[ERROR] %s\\n' "$*" >&2; }
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
# 64-78 = sysexits codes (EX_USAGE, EX_DATAERR, EX_NOINPUT, EX_SOFTWARE, etc.)`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "bash",
      caption: "Background jobs + wait — fan-out, fan-in",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Launch in background with &; capture PID with $!
pids=()
for url in "\${URLS[@]}"; do
  curl -fsS "$url" -o "\${url##*/}.body" &
  pids+=($!)
done

# Wait for all to finish, propagate failures
rc=0
for pid in "\${pids[@]}"; do
  wait "$pid" || rc=$?
done
exit $rc

# 'wait' with no args waits for ALL background jobs.
# 'wait -n' (bash 4.3+) waits for the NEXT one to finish — enables bounded pools.`,
    },
    {
      lang: "bash",
      caption: "Bounded parallel pool with wait -n (bash 4.3+)",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

MAX_JOBS=4
pids=()

for url in "\${URLS[@]}"; do
  # If at capacity, wait for any job to finish, propagate its exit code
  while (( \${#pids[@]} >= MAX_JOBS )); do
    wait -n || exit $?
    # Reap one PID — we don't know which, so rebuild the list
    new_pids=()
    for pid in "\${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        new_pids+=("$pid")
      fi
    done
    pids=("\${new_pids[@]}")
  done

  curl -fsS "$url" -o "\${url##*/}.body" &
  pids+=($!)
done

# Wait for remaining jobs
for pid in "\${pids[@]}"; do
  wait "$pid" || exit $?
done`,
    },
    {
      lang: "bash",
      caption: "xargs -P — parallel batch processing",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# xargs -P<N> runs N processes in parallel. Simpler than a manual pool
# when you don't need per-job PIDs.

# Compress all .log files in parallel (4 at a time)
find . -type f -name '*.log' -print0 \\
  | xargs -0 -P4 -I{} gzip {}

# Download URLs in parallel
printf '%s\\n' "\${URLS[@]}" \\
  | xargs -P8 -I{} sh -c 'curl -fsS "$1" -o "\${1##*/}"' _ {}

# GNU parallel — more features (progress, retries, job control)
# find . -type f -name '*.png' -print0 | parallel -0 -j4 'convert {} {.}.jpg'

# 'xargs -P' is simpler; 'parallel' is more powerful. Prefer xargs for portability.`,
    },
    {
      lang: "bash",
      caption: "Named pipes (FIFOs) — inter-process communication",
      code: `#!/usr/bin/env bash
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

# Use case: stream data between two long-running processes without temp files.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "bash",
      caption: "bats — Bash Automated Testing System",
      code: `#!/usr/bin/env bats

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
# Assertions use [] or [[ ]] — bash-native, no DSL.`,
    },
    {
      lang: "bash",
      caption: "ShellCheck — the bash linter (mandatory in CI)",
      code: `#!/usr/bin/env bash
# Run ShellCheck on every script in CI. Catches the 80% of bash footguns.

# Common SC codes it catches:
# SC2086: unquoted variable (word-splits on spaces)
#   bad:  for f in $files; do ...
#   good: for f in "$files" /* or */ for f in "\${files[@]}"; do ...
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
# GitHub Action: 'ludeeus/action-shellcheck' is the standard.`,
    },
    {
      lang: "bash",
      caption: "Manual test harness — when bats is overkill",
      code: `#!/usr/bin/env bash
set -Eeuo pipefail

# Lightweight test helper for small scripts
PASS=0; FAIL=0
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
    printf '  ok  %s\\n' "$name"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %s\\n    expected: %s\\n    actual:   %s\\n' \\
      "$name" "$expected" "$actual" >&2
  fi
}

assert_eq "addition" "4" "$((2 + 2))"
assert_eq "uppercase" "HELLO" "\${var^^}"
# ...

printf '\\n%d passed, %d failed\\n' "$PASS" "$FAIL"
(( FAIL == 0 )) || exit 1`,
    },
    {
      lang: "bash",
      caption: "CI config — GitHub Actions + ShellCheck + bats",
      code: `# .github/workflows/test.yml
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
#   bats test/*.bats`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Parameter expansion is ~10x faster than a sed/awk subshell: \${var%.*} strips suffix, \${var##*/} strips prefix, \${var//old/new} replaces.", tag: "perf" },
    { fact: "Quote every expansion: \"$VAR\", \"$@\", \"${arr[@]}\". Unquoted = word-split + glob expand (slow + buggy).", tag: "gotcha" },
    { fact: "POSIX sh (dash, ash) is 4-10x faster than bash for boot scripts — Alpine/Debian use it for /bin/sh.", tag: "perf" },
    { fact: "Avoid subshells in loops — \$(cmd) forks a process. Use parameter expansion or builtins instead.", tag: "perf" },
    { fact: "mapfile -t arr < file is faster than while-read for small/medium files (one read syscall vs N).", tag: "perf" },
    { fact: "<(cmd) process substitution avoids a temp file, but still forks the command — not free.", tag: "perf" },
    { fact: "Avoid 'cat file | cmd' — use 'cmd < file' for one less process and a smaller pipe buffer.", tag: "perf" },
    { fact: "printf is faster and more portable than echo — and supports format strings.", tag: "style" },
    { fact: "(( )) arithmetic is faster than [ ] -lt for integer comparison — bash builtin, no fork.", tag: "perf" },
    { fact: "bash 4.4+ inherit_errexit makes subshells honor set -e — older versions silently swallow failures in subshells.", tag: "version" },
    { fact: "xargs -P<N> for parallel external commands — usually faster than a bash background-job pool.", tag: "perf" },
    { fact: "wait -n (bash 4.3+) waits for the next job to finish — enables bounded parallel job pools without polling.", tag: "version" },
    { fact: "Forking a process is ~1-5ms on Linux — calling grep 1000 times in a loop costs 1-5 seconds. Use one grep with many patterns.", tag: "perf" },
    { fact: "declare -A (associative array) is O(1) lookup — beats a case statement or repeated grep for >10 keys.", tag: "perf" },
    { fact: "ShellCheck catches SC2086/SC2155/SC2181 — the top 3 bash footguns. Mandatory in CI.", tag: "gotcha" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "bash", purpose: "GNU Bourne-Again Shell — the default on most Linux/macOS. v5.x current.", url: "https://www.gnu.org/software/bash/", category: "build" },
    { tool: "dash / ash", purpose: "POSIX sh — fast, minimal. /bin/sh on Debian/Alpine. No arrays, no [[ ]].", url: "https://en.wikipedia.org/wiki/Almquist_shell", category: "build" },
    { tool: "zsh", purpose: "Interactive shell — default on macOS since Catalina. Better tab completion + history.", url: "https://www.zsh.org/", category: "build" },
    { tool: "fish", purpose: "Friendly Interactive Shell — out-of-box UX, NOT POSIX-compatible.", url: "https://fishshell.com/", category: "build" },
    { tool: "ShellCheck", purpose: "The mandatory linter — catches SC2086 (unquoted), SC2155 (local exit), SC2181 (manual $?), and 200+ more.", url: "https://www.shellcheck.net/", category: "lint" },
    { tool: "shfmt", purpose: "Formatter — opinionated, like gofmt. Supports POSIX/bash/mksh. Google/mvdan.", url: "https://github.com/mvdan/sh", category: "lint" },
    { tool: "bats", purpose: "Bash Automated Testing System — the de-facto test framework for shell scripts.", url: "https://bats-core bats-core.github.io/", category: "test" },
    { tool: "jq", purpose: "JSON processor — sed/awk for JSON. The standard for shell-JSON interop.", url: "https://stedolan.github.io/jq/", category: "build" },
    { tool: "ripgrep (rg)", purpose: "Rust-based grep — 5-10x faster than grep, respects .gitignore by default.", url: "https://github.com/BurntSushi/ripgrep", category: "build" },
    { tool: "fd", purpose: "Rust-based find — faster, saner defaults than find. Non-portable syntax.", url: "https://github.com/sharkdp/fd", category: "build" },
    { tool: "fzf", purpose: "Fuzzy finder — interactive grep for files, history, anything.", url: "https://github.com/junegunn/fzf", category: "build" },
    { tool: "coreutils", purpose: "GNU coreutils — ls, cp, mv, rm, etc. The GNU versions are more featureful than BSD/macOS.", url: "https://www.gnu.org/software/coreutils/", category: "build" },
    { tool: "GNU make", purpose: "Build automation — Makefile pattern. Often called from shell scripts.", url: "https://www.gnu.org/software/make/", category: "build" },
    { tool: "set -Eeuo pipefail", purpose: "Not a tool but the mandatory bash strict mode — first line of every script that matters.", url: "https://bertvandenbroucke.netlify.app/2019/08/15/strict-mode-in-bash/", category: "lint" },
    { tool: "sheldon / oh-my-zsh", purpose: "Shell plugin managers — install helpers, completions, themes. sheldon is Rust-based + fast.", url: "https://github.com/ohmyzsh/ohmyzsh", category: "build" },
    { tool: "starship", purpose: "Cross-shell prompt — Rust-based, shows git status, language versions, etc.", url: "https://starship.rs/", category: "build" },
    { tool: "Greg's Wiki (BashFAQ)", purpose: "Hard-won answers to recurring shell questions — the modern shell scripting textbook.", url: "https://mywiki.wooledge.org/BashFAQ", category: "debug" },
    { tool: "Pure Bash Bible", purpose: "Patterns using only builtins — no external processes, often 10-100x faster than awk/sed.", url: "https://github.com/dylanaraps/pure-bash-bible", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0",  year: 1989, highlight: "First release by Brian Fox (GNU) — Bourne shell successor." },
    { version: "2.0",  year: 1996, highlight: "POSIX mode, arrays, [[ ]], functions, $'...' quoting. The modern era." },
    { version: "3.0",  year: 2004, highlight: "Regular expressions via =~, brace expansion, pipefail option." },
    { version: "3.1",  year: 2005, highlight: "printf -v (assign to variable), better locale support." },
    { version: "4.0",  year: 2009, highlight: "Associative arrays (declare -A), coproc, mapfile/readarray, |& for stderr piping." },
    { version: "4.1",  year: 2010, highlight: "printf -v improvements, $BASHPID, smaller bug fixes." },
    { version: "4.2",  year: 2011, highlight: "Lastpipe (last command of pipeline runs in current shell), associative array fixes." },
    { version: "4.3",  year: 2014, highlight: "wait -n (bounded parallel jobs), namerefs (declare -n), ${var^} case modification." },
    { version: "4.4",  year: 2016, highlight: "inherit_errexit (subshells honor set -e), mapfile -d, ${var@U} transforms." },
    { version: "5.0",  year: 2019, highlight: "Extended glob fixes, namerefs in inner scopes, EPOCHREALTIME (microsecond precision)." },
    { version: "5.1",  year: 2020, highlight: "assoc_expand_once, set -p, math expression improvements." },
    { version: "5.2",  year: 2022, highlight: "assoc arrays: indirect expansion, loadable builtins improvements." },
    { version: "5.3",  year: 2024, highlight: "Stability + bug fixes; ARM improvements, runtime localization." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Why is 'set -euo pipefail' the recommended script header?", a: "Three safety flags: -e exits on any command failure (prevents silent cascades), -u treats undefined variables as errors (catches typos), -o pipefail makes a pipeline fail if ANY command fails (not just the last). Combined, they catch the 80% of bash footguns. -E (inherit ERR traps) and 'shopt -s inherit_errexit' (bash 4.4+) extend this to subshells. The catch: -e doesn't catch failures in conditions (if cmd), in commands followed by ||, or in 'local x=$(cmd)' (the local command's exit is what -e sees, not cmd's).", difficulty: "medium" },
    { q: "Explain word-splitting and why you must quote every variable.", a: "Bash has no real data types — every variable holds a string. When you write $VAR unquoted, bash replaces it with its contents, then word-splits the result on $IFS (whitespace by default), then expands any globs. So a filename with spaces ('my file.txt') becomes two args ('my', 'file.txt'), and a value with '*' expands to the cwd's files. Quote every expansion: \"$VAR\", \"$@\", \"${arr[@]}\". The exception is when you WANT word-splitting (rare). Use arrays for lists, never space-separated strings.", difficulty: "easy" },
    { q: "What's the difference between $@, \"$@\", $*, and \"$*\"?", a: "$@ and $* both expand to all positional params. Without quotes, both word-split. The crucial difference is WITH quotes: \"$@\" preserves each arg as one word (one $1, one $2, etc.); \"$*\" joins all args with IFS (usually space) into a single string. Use \"$@\" 99% of the time — it's the only safe way to forward args. Use \"$*\" only when you want a single joined string (e.g., for logging).", difficulty: "easy" },
    { q: "How would you run N jobs in parallel with bounded concurrency?", a: "Three approaches: (1) xargs -P<N> — simplest, runs N processes in parallel, best for batch external commands; (2) wait -n (bash 4.3+) — wait for the next job to finish in a manual pool, more control but more code; (3) GNU parallel — most features (progress, retries, job control) but not always installed. For most use cases xargs -P is the right answer. For per-job error handling or complex dependencies, use the wait -n pool.", difficulty: "medium" },
    { q: "Why is 'for f in $(ls)' wrong, and what's the correct pattern?", a: "\"$(ls)\" word-splits on whitespace and globs expand, so filenames with spaces become multiple args, and '*' matches local files. It's a correctness AND security hole — a filename with a leading dash could be interpreted as a flag by the next command. Correct patterns: (1) for f in *.txt (glob, no subprocess); (2) for f in \"${files[@]}\" (iterate an array); (3) while IFS= read -r -d '' f; do ...; done < <(find . -type f -print0) for find output (handles ALL filenames, including those with newlines).", difficulty: "easy" },
    { q: "Explain process substitution <(cmd) and when to use it.", a: "<(cmd) creates a temp FIFO (named pipe) and runs cmd with its stdout connected to that FIFO. The FIFO appears as a /dev/fd/NN path you can pass as a file argument. Use cases: diff <(jq -S . old.json) <(jq -S . new.json) — compare two command outputs without temp files; join <(sort users.tsv) <(sort orders.tsv) — feed two sorted streams to join. It avoids temp files but still forks the command — not free, just cleaner. Doesn't work on sh (only bash/zsh) or in some minimal containers.", difficulty: "medium" },
    { q: "What does 'local x=$(cmd)' hide, and how do you fix it?", a: "'local' is itself a command with an exit status. So 'local x=$(cmd)' sets x to cmd's output, but the exit code captured by 'set -e' is local's (success), not cmd's. A failing cmd silently continues. Fix: declare first, assign separately. 'local x; x=$(cmd)'. Now 'set -e' fires on cmd's failure. ShellCheck flags this as SC2155. The same applies to 'declare' and 'readonly' — they all mask the RHS exit code.", difficulty: "medium" },
    { q: "How do traps work, and what's the cleanup pattern?", a: "trap registers a handler for signals (INT, TERM, HUP) and the pseudo-signal EXIT (fires on any exit). Pattern: trap 'rc=$?; cleanup; exit $rc' EXIT — captures the original exit code at trap entry (before cleanup might reset $?), runs cleanup, then exits with the original code. Always capture $? FIRST inside the trap, because any command between the triggering failure and the capture will reset it. Use EXIT for cleanup (fires on normal end too), ERR for diagnostics (fires only on failures, requires set -e).", difficulty: "medium" },
    { q: "Why is bash arrays' \"${arr[@]}\" (quoted) different from ${arr[@]} (unquoted)?", a: "Unquoted ${arr[@]} word-splits each element on IFS AND expands globs — so an element 'a b' becomes two args, and '*' matches cwd files. Quoted \"${arr[@]}\" preserves each element as one word, even with spaces or special chars. This is the bash analog of the universal \"$@\" rule. Always quote \"${arr[@]}\" to iterate safely. Use ${arr[*]} (with or without quotes) only when you want all elements joined into one string with IFS.", difficulty: "easy" },
    { q: "When would you use a subshell vs a function vs sourcing?", a: "Subshell ( cmd; cmd ) — for isolation: variable changes, cwd changes, traps don't leak to parent. Use for 'do this work in a different directory' or 'try this without polluting the shell'. Function — for reusable logic in the current shell: shares variables (use 'local'), faster (no fork). Use for the 90% case. Source (source script.sh or . script.sh) — for loading libraries: defines functions + vars in the current shell. Use for shell RC files and library loaders. NEVER source a script that cd's or modifies env unexpectedly.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Python", whenThis: "Gluing existing CLI tools (grep/awk/curl/jq), container entrypoints, build scripts, anywhere <100 lines and you need pipes.", whenThat: "Anything with logic branches >5, JSON parsing beyond jq, anything cross-platform, anything where a bug is expensive — Python's clarity wins." },
    { vs: "POSIX sh (dash/ash)", whenThis: "Interactive use, modern bash scripts using arrays, [[ ]], process substitution.", whenThat: "Boot scripts, initramfs, Alpine/Debian /bin/sh, anywhere startup speed > features (POSIX sh is 4-10x faster)." },
    { vs: "zsh", whenThis: "Scripting, CI runners, containers — bash is more portable and standardized.", whenThat: "Interactive shells — zsh has better completion, history, and out-of-box UX. macOS default since Catalina." },
    { vs: "fish", whenThis: "Scripts that must run on CI / production where POSIX compatibility matters.", whenThat: "Interactive shells for users who want out-of-box UX without config — fish is non-POSIX by design." },
    { vs: "PowerShell", whenThis: "Unix systems, anywhere the ecosystem (grep/awk/sed/jq/curl) is the actual product.", whenThat: "Windows administration, anywhere .NET / WMI / Azure interop is the actual product — PowerShell's object pipeline beats text." },
  ],
};

export default sheet;
