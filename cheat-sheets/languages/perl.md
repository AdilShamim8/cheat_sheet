# Perl

**Category:** Languages · **Tier:** Tier 3 · Specialized · **Tags:** dynamic, interpreted, scripting, text-processing, regex, sysadmin, ducktyping · **First released:** 1987 · **Author:** Larry Wall · **Last updated:** 2026-11

> Larry Wall's Swiss-army chainsaw — the duct tape of the early web, still unmatched for one-liner text wrangling.

---

## TL;DR

- Perl is a dynamically-typed, interpreted language whose entire design revolves around three things: first-class regular expressions, list context, and TIMTOWTDI ('there is more than one way to do it').
- It powered the early CGI web (the 1990s dynamic web was largely Perl scripts), remains the lingua franca of Unix sysadmin glue, and BioPerl still anchors chunks of genomics pipelines.
- Reach for Perl when you need to transform unstructured text in one line (`perl -pe 's/.../.../g'`), maintain legacy CGI / cPanel / RHEL packaging scripts, or extend tools like git, ffmpeg, and Postfix that ship Perl hooks.
- Avoid Perl for new web services — modern Perl (Mojolicious, Dancer2) is competent but the ecosystem has thinned, and Python/Go/Rust have absorbed its sysadmin and text-processing niches. Raku (formerly Perl 6) is a separate language, not a Perl 5 upgrade.

## Core Mental Model

**Sigils, context, and the special variable jungle.** Every variable has a sigil that says what kind of value you want pulled out: `$scalar`, `@array`, `%hash`, `&sub` — but the sigil is the operation, not the variable's storage class (`@arr` vs `$arr[0]` is the same array viewed two ways). Every operation is also evaluated in list or scalar context, and operators behave differently depending on which (`localtime` in scalar context returns a string, in list context a 9-element list). The second model: there are ~70 built-in punctuation variables (`$_`, `$/`, `$@`, `$!`, `$0`, `$,`) that every operator reads silently, which is why Perl one-liners compress so aggressively and read so opaquely.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| my $x = 1; | Lexical (file/block-scoped) scalar declaration — use `our` for package globals, `local` for dynamic scoping of globals. | Default scope for all variables; `use strict` makes this mandatory. |
| my @a = (1, 2, 3); my $first = $a[0]; | Array and element access — the sigil flips to `$` because the result is scalar. | List storage; remember `@a` in scalar context is the count. |
| my %h = (k => 'v'); my $v = $h{k}; | Hash and value access — `=>` is a fat comma that auto-quotes its LHS. | Lookups, named args, JSON-like data. |
| my @refs = \@a;  $$r[0] = 9; | Reference creation + dereferencing — needed for nested data structures. | Anything beyond flat lists/hashes; required for OOP. |
| sub f { my ($x, %opt) = @_; ... } | Args unpacked from `@_`; flattening is list-context assignment. | All subroutine definitions — there are no named parameters in Perl 5 (until signatures, still experimental). |
| my $rx = qr/foo(?:bar)?/i; | Pre-compiled regex object — flags stick to the qr//. | Reusing patterns or passing them around; faster than re-parsing. |
| if ($s =~ /^a(.+)b$/) { my $cap = $1; } | Match operator — captures populate $1, $2, … | Pattern matching; =~ binds a different target than $_. |
| s/old/new/g  on $_ | Substitution operator with /g global flag — mutates $_ in place. | In-place text replacement; combine with -pe for one-liners. |
| map { $_ * 2 } @nums | List transform — block evaluated per element, returns list. | Functional transforms; grep is the filter sibling. |
| eval { die 'oops' }; if ($@) { ... } | Exception catch — `die` populates `$@`; returns last expr on success. | All error handling in pre-5.34 code; Try::Tiny / Feature::try for cleaner syntax. |
| package Foo; sub new { bless {@_}, shift } | Bless a hashref into a package — that's the entire OO model in one line. | Legacy OO; modern code uses Moose / Moo for attributes and roles. |
| open my $fh, '<', $path or die $!; | Three-arg open with lexical filehandle — kills the old `open FH, ">file"` injection bugs. | Any file I/O; the two-arg form is forbidden under `use strict` + modern Perl. |

## Idiomatic Patterns

**Moo class — modern minimal OO without Moose's compile cost**

```perl
package User;
use Moo;
use Types::Standard qw(Str Int);

has name => (is => 'ro', isa => Str, required => 1);
has age  => (is => 'rw', isa => Int, default => sub { 0 });

sub birthday {
    my ($self) = @_;
    $self->age($self->age + 1);
    return $self;
}

1;  # true return — required by use / require

# caller:
use User;
my $u = User->new(name => "Ada");
$u->birthday for 1..3;
print $u->age, "\n";  # 3
```

**Streaming line-by-line transform with one-liner idiom**

```perl
#!/usr/bin/env perl
use strict;
use warnings;
use autodie;

# Slurp the whole input only if you need cross-line state.
# For per-line transforms, the diamond operator reads lazily.
my $total = 0;
while (my $line = <>) {           # <> reads from @ARGV files or STDIN
    chomp $line;                   # strip the trailing newline (uses $/)
    next if $line =~ /^\s*#/;       # skip comments
    my ($id, $amount) = split /\t/, $line, 2;
    $total += $amount // 0;
}
printf "total: %d\n", $total;

# Equivalent one-liner (debugging on a server with no script file):
#   perl -nae 'next if /^\s*#/; $t += $F[1]; END{ print $t }' data.tsv
```

**Context-aware subroutine — wantarray lets one function return three things**

```perl
sub stats {
    my @xs = @_;
    my ($sum, $n) = (0, scalar @xs);
    $sum += $_ for @xs;
    my $mean = $n ? $sum / $n : 0;
    return ($sum, $mean, $n) if wantarray;     # list context
    return $mean if defined wantarray;          # scalar context
    print "sum=$sum mean=$mean n=$n\n";         # void context
}

my @all  = stats(1, 2, 3);   # (6, 2, 3)
my $avg  = stats(1, 2, 3);   # 2
stats(1, 2, 3);              # prints "sum=6 mean=2 n=3"
```

**Regex captures with named groups and /p persistent match vars**

```perl
my $log = '2024-08-15T10:23:01Z GET /api/users?id=42 200 0.043';

if ($log =~ m{
    (?<ts>\S+)\s+
    (?<method>GET|POST|PUT|DELETE)\s+
    (?<path>\S+)\s+
    (?<status>\d{3})\s+
    (?<rt>[0-9.]+)
}x) {
    # /x lets you whitespace-and-comment the regex freely.
    # %+ holds named captures; $-{ts} the array form (for repeated names).
    printf "%s %s -> %s in %sms\n",
        $+{method}, $+{path}, $+{status}, $+{rt};
}

# Persistent capture vars (/${^MATCH}/$1 survive past another match) need /p:
"hello" =~ /ll/p;
print "got ${^MATCH}\n";   # 'll' even after the next regex runs
```

## Common Pitfalls

1. **Forgetting `use strict; use warnings;`** — *Symptom:* Typos like `$receipient` silently create a new undef global; `@array` flattened into a hash quietly uses the first two elements. Hours lost. *Fix:* Start every file with `use strict; use warnings;` (or `use common::sense;`). Modern Perl ships with both off by default only for backward compatibility — never write new code without them.
2. **List vs scalar context from `return`** — *Symptom:* `return @arr` in scalar context returns the count, not the array — calling `$count = func()` where func ends with `return @arr` is a classic off-by-everything bug. *Fix:* Use `wantarray` if you genuinely need both, or return an explicit reference (`return \@arr`) and document it. Most modern Perl returns references for any non-trivial collection.
3. **`my @arr = (1,2,3); my @copy = (@arr);` flattens references** — *Symptom:* `my @nested = (@a, @b)` is one flat list of a's elements followed by b's — not a list of two arrays. Beginners expect `[[@a, @b]]`. *Fix:* Use references for nested structures: `my @nested = (\@a, \@b); my @nested = ([$a], [$b]);` and dereference explicitly with `@{ $nested[0] }` or postfix `@arr->@*` (postderef, 5.24+).
4. **Two-arg open — path injection** — *Symptom:* `open(FH, $user_input)` interprets the leading `>` / `<` / `|` as a mode, so a filename like `|rm -rf /` runs a shell command. *Fix:* Always three-arg form: `open my $fh, '<', $path or die $!`. The two-arg form is one of the most exploited Perl footguns in CGI history.
5. **`defined` vs `exists` vs boolean truth on hashes** — *Symptom:* `if ($h{k})` returns false for a stored value of 0 or ''; `if (exists $h{k})` returns true; `if (defined $h{k})` returns true unless the stored value is undef. *Fix:* Use `exists` to ask 'is the key there?', `defined` to ask 'is the value non-undef?', and boolean to ask 'is the value truthy?'. Pick the right one — they answer different questions.
6. **Captures `$1` survive forever — until the next match** — *Symptom:* After `/foo(.)/` succeeds, `$1` is set; if a later regex (even in a called subroutine) fails, `$1` still holds the old value — code reading `$1` after a failed match silently uses stale data. *Fix:* Always check the match returned true before reading captures, or copy them out immediately (`my ($cap) = /pat(.)/` in list context returns an empty list on failure, not stale $1).
7. **`local` is dynamic scope, not lexical** — *Symptom:* `local $/` inside a subroutine affects `$/` for any sub called from there too, leaking the change down the call stack. Beginners think it's a `my`. *Fix:* `local` temporarily saves and restores a *package* variable for the dynamic scope (the call stack). Use `my` for lexicals. The idiom `local $/; my $s = <$fh>;` is fine because the scope is the block; just don't expect it to behave like `my`.

## Production / Interview Quick Reference

- Perl 5.40 is the current stable series (2024); Perl 7 was abandoned as a release vehicle in favor of incremental modernization. `version`
- Raku (formerly Perl 6) is a separate language with its own compiler (Rakudo) — not source-compatible with Perl 5. `version`
- Subroutine signatures (`sub f($x, $y) { ... }`) stabilized in 5.36 — before that, args were always pulled from `@_`. `version`
- Regexes are first-class — qr// precompiles to a Regexp object; /x lets you whitespace patterns, /e evaluates replacement as Perl code. `perf`
- CGI.pm was removed from the Perl core in 5.22 (2015) and is now a CPAN module — modern Perl web stacks use PSGI/Plack. `version`
- @_ is the argument list — it's an alias, not a copy. `$_[0] = 9` modifies the caller's variable (only for non-readonly values). `gotcha`
- List assignment in scalar context returns the count of elements on the RHS — `$n = (@a, @b)` is `scalar(@a) + scalar(@b)` only in specific contexts; in scalar it's the last element. `gotcha`
- use strict disables symbolic references, bareword autovivification, and undeclared vars — the three classes of bugs that gave Perl its 90s reputation. `style`
- perltidy and Perl::Critic (with Freenode or Perl::BestPractices profile) are the standard linters; perltidy -pbp enforces Damian Conway's book style. `style`
- Moo vs Moose: Moo skips the metaclass overhead and is ~10x faster to compile; use Moose for full metaprogramming, Moo for everything else. `perf`
- Autovivification: `push @{$h{a}}, 1` creates `$h{a}` as an arrayref if it didn't exist — extremely ergonomic, also a silent-bug source in nested checks. `gotcha`
- Diamond operator `<>` reads from @ARGV files then STDIN; `<<>>` (double-diamond, 5.22+) does the same but refuses to interpret leading > < | as modes. `gotcha`
- cpanm (cpanminus) is the modern installer; Carton / cpm handle dependency snapshots (cpanfile.snapshot) like Bundler. `style`
- Perl's regex engine is PCRE's ancestor — features like `(?>...)` (atomic), `(?=...)`, `(?:...)` originated here and propagated to every other language. `version`
- thousands of CPAN modules still install cleanly — Test::More, DBI, Mojolicious, Plack, Catalyst are mature and battle-tested. `version`

## Go Deeper

- [perldoc.perl.org — official Perl documentation](https://perldoc.perl.org/) — Start with perlintro, then perlvar (the special variables), then perlsyn and perlop. Everything is browsable online.
- [Modern Perl (chromatic)](https://modernperlbooks.com/books/modernperl/) — Free book; the canonical 'how to write Perl like it's 2024 not 1998' reference. Treats Moo, strictures, and named params as defaults.
- [Programming Perl (Wall, Christiansen, Orwant)](https://www.oreilly.com/library/view/programming-perl-4th/9781449321453/) — The Camel book — the language reference by Larry Wall himself. Dense but authoritative; chapters 2-8 cover every operator.
- [Perl Best Practices (Damian Conway)](https://www.oreilly.com/library/view/perl-best-practices/0596001738/) — The book Perl::Critic's default policy is based on. Some choices have aged, the principles haven't.
- [The CPAN — Comprehensive Perl Archive Network](https://metacpan.org/) — Primary source for every module; metacpan.org is the modern searchable frontend with per-module documentation and dependency graphs.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| $scalar | Single value — number, string, or reference; the sigil is the OPERATION, not the storage class. | All single-value variables. Perl auto-converts between number and string by context. |
| undef | The unassigned value — falsy, warns under 'use warnings' when used in an operation. | Optional/sentinel values; test with defined(). |
| integer / float | Perl uses doubles internally unless 'use integer' is in scope (lexical, 32-bit int ops). | Math. For arbitrary precision use Math::BigInt / Math::BigFloat. |
| string | Byte string by default ('use bytes' to force); 'use utf8' for source encoding, Encode module for I/O. | All text. Perl distinguishes byte strings from character strings via the UTF-8 flag — a top source of subtle bugs. |
| reference ($ref) | SCALAR ref to another value — \\@arr, \\%h, \\&sub. Required for nested data and OO. | Anything beyond flat lists/hashes; all objects are blessed references. |
| blessed ref | A reference tagged with a package name via bless(); the entire Perl OO model. | All OO — Moo/Moose/classic. ref($obj) returns the package. |
| code ref (\\&sub) | Reference to a subroutine — first-class, can be stored and called later. | Callbacks, dispatch tables, higher-order functions. |
| glob (*name) | Typeglob — symbol table entry; can alias scalars/arrays/hashes/subs at a distance. | Exporters, symbol-table games. Modern code rarely uses globs directly. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| @array | Ordered list — indexed 0..n-1; @arr in scalar context returns the count. | Ordered sequences; 'push/pop/shift/unshift' for stack/queue ops. |
| %hash | Unordered key-value map — keys must be strings (auto-stringified); O(1) avg lookup. | Lookups, named args, JSON-like data. Insertion order preserved via each()/keys() since 5.18+. |
| @{[ ... ]} | Array dereference inside an expression — common for inline list construction. | Embedding list ops in strings or one-liners; the 'inline array' idiom. |
| $h{key} / @h{@keys} | Hash slice — single value vs list of values for multiple keys. | Multi-key lookup; the @h{@keys} form returns a list aligned to @keys. |
| %h = (k => v, ...) | Hash assignment from a list — fat comma (=>) auto-quotes its LHS. | Hash construction; pairs of list elements become key/value. |
| [ ... ] | Anonymous arrayref constructor — returns a SCALAR reference, not a list. | Nested data, pass-by-reference; modern Perl prefers refs over lists for structured data. |
| { ... } | Anonymous hashref constructor — returns a SCALAR reference. | Nested hashes, JSON-shaped literals, Moo/Moose default factories. |
| ( ... ) | List literal — flat; flattens nested lists. Parentheses mostly group, don't construct. | Multi-value returns, list assignments. Beware: (1, (2, 3)) is (1, 2, 3), not nested. |
| Tie::Hash / Tie::Array | Tied variable — class implementing FETCH/STORE that masquerades as a hash/array. | Custom containers, on-disk hashes (DB_File), lazy-loaded configs. Slower than real hashes. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| package Foo; sub new { bless {@_}, shift } | Classic OO: bless a hashref into a package. That's the whole model. | Legacy OO. Modern code uses Moo/Moose for attributes + roles. |
| use Moo; has name => (is => 'ro'); | Moo class — modern minimal OO with attribute generation, type checks, defaults. | Default for new OO. Faster compile than Moose, mostly compatible API. |
| use Moose; with 'Role::Serializable'; | Moose class with role composition — full metaclass, method modifiers, immutability. | When you need the metaprogramming power of Moose; pays a compile-time cost. |
| role { method foo => sub { ... } } | Role (Moose::Role / Role::Tiny) — composable units of behavior, unlike inheritance. | Sharing behavior across unrelated classes; avoids deep inheritance trees. |
| use enum qw(Foo Bar Baz) | Enum-like constants — exports Foo=0, Bar=1, etc. as subs. | Closed value sets; many shops just use constants (use constant FOO => 0). |
| subtypes via Moose::Util::TypeConstraints | User-defined type constraints (subtype 'PosInt', as 'Int', where { $_ > 0 }). | Domain validation on Moo/Moose attributes; checked at construction. |
| use constant PI => 4 * atan2(1, 1) | Compile-time constant — inlined into callers, zero runtime cost. | True constants (vs variables). Cannot be interpolated in strings without @{[PI]}. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| $x = $y | Scalar assignment — returns the assigned value, so chained assignment works. | Always. Use my $x for lexical declaration; bare $x creates a package global. |
| $x += $y, .= $y | Compound assignment — mutates in place. Works for all binary ops. | Accumulators, string building. Watch string concat in loops — use join() for many. |
| $a + $b, $a - $b, $a * $b | Numeric arithmetic — coerces strings to numbers (leading digits, 0 otherwise). | Math. '5' + 3 == 8; 'abc' + 0 warns and becomes 0 under warnings. |
| $a / $b, $a % $b | Division (float) and modulo (integer). Modulo's sign follows the dividend. | Math. Integer division: int($a/$b) or use integer. |
| $a . $b  (string concat) | Concatenation — distinct from + (numeric). '5' . 3 == '53'. | Building strings. join('', @parts) is faster than $s .= $x in a loop. |
| $a x $n | Repetition — string context repeats the string; list context (list) x $n repeats the list. | Padding ('-' x 80), initializing arrays ((undef) x 100). |
| $a == $b, $a != $b | Numeric equality — coerces both sides to numbers. '5' == '5.0' is true. | Numeric compare. Don't use for strings — see eq. |
| $a eq $b, $a ne $b | String equality — byte-by-byte. '5' eq '5.0' is false. | String compare. Use cmp for sort, lt/gt for ordering. |
| $a < $b, $a gt $b, $a <=> $b, $a cmp $b | Comparisons: numeric (<, gt is string), spaceship (<=> numeric, cmp string) returns -1/0/1. | Sort callbacks: sort { $a <=> $b } @nums vs sort { $a cmp $b } @strs. |
| $a && $b, $a \|\| $b, $a // $b | Short-circuit: && (and), \|\| (or, returns first truthy), // (defined-or, returns first defined). | Defaults: $x //= $default. // is the modern idiom (5.10+) over \|\| for undef-vs-0 distinction. |
| $a ? $b : $c | Ternary — right-associative, so $a ? $b : $c ? $d : $e parses as $a ? $b : ($c ? $d : $e). | Concise conditional assignment. Nested ternaries hurt readability. |
| $a .. $b, $a ... $b | Range operator: list context (1..10) generates a list; scalar context (flip-flop) true between matches. | Loops (for 1..10), sed-style line ranges. Flip-flop (..) is stateful, rare in modern code. |
| $x =~ m/.../, $x =~ s/.../.../ | Regex bind — applies match/substitute to $x instead of $_. | Pattern matching and replacement. Capture vars $1, $2 populate on success. |
| ->  (arrow) | Dereference / method call — $ref->{k}, $ref->[0], $obj->method(@args). | All OO and ref access. Equivalent to older ${$ref}{k} / @{$ref}[0]. |
| = ~  (NOT regex!) | Assignment followed by bitwise NOT on the LHS — a famous typo. '$x = ~$y' is assignment then ~. | Never intentional. Linters warn; 'perltidy' + 'perlcritic' catch it. |

## Input / Output

**Three-arg open + lexical filehandle + autodie**

```perl
use strict;
use warnings;
use autodie qw(open close);   # die on failure instead of silent undef

open my $fh, '<:encoding(UTF-8)', $path or die "open $path: $!";

# Slurp whole file (small files only):
my $whole = do { local $/; <$fh> };

# Stream line by line — never loads the whole file:
while (my $line = <$fh>) {
    chomp $line;           # strip newline ($/ is the input record separator)
    next if $line =~ /^\s*#/;
    process($line);
}
close $fh;   # autodie closes — explicit close still good for error checking

# Write: three-arg open with mode prefix:
open my $out, '>:encoding(UTF-8)', 'out.txt';
print $out "line\n";   # NO COMMA after $fh — print takes FH as first arg
close $out;
```

**Diamond operator + one-liner idiom**

```perl
#!/usr/bin/env perl
use strict;
use warnings;

# <> reads from @ARGV files in order, falling back to STDIN if @ARGV empty.
# $ARGV is the current filename; ARGV is the special filehandle.
while (my $line = <>) {
    chomp $line;
    print uc($line), "\n";
}

# Run as:  ./script.pl a.txt b.txt -     (- means STDIN)
#
# One-liner equivalents:
#   perl -nle 'print uc' a.txt b.txt        # -n loop, -l chomp, -e code
#   perl -pe 's/\d+/\$&*2/e' file.txt      # -p print after, /e eval replacement
#   perl -i.bak -pe 's/foo/bar/g' *.txt     # -i edit in place, .bak backup
```

**JSON / YAML / Storable serialization**

```perl
use JSON::PP;            # core module (JSON::XS is the fast C version)
use YAML::XS;            # optional, faster
use Storable;            # core, Perl-specific binary format

my $data = { name => "ada", tags => ["a", "b"], id => 42 };

# JSON — text, portable, the default for interop
my $json = encode_json($data);              # encode_json returns bytes
my $back = decode_json($json);              # returns hashref/arrayref

# Pretty-printed JSON:
my $pretty = JSON::PP->new->pretty->encode($data);

# Storable — Perl-specific binary, NOT portable across Perl major versions
store \$data, 'data.storable';
my $loaded = retrieve('data.storable');

# NEVER Storable-decode untrusted data — code injection via CODE refs.
# For untrusted input, use JSON (after schema validation) or CBOR::XS.
```

**HTTP client with HTTP::Tiny (core) + retries**

```perl
use HTTP::Tiny;
use Try::Tiny;

my $http = HTTP::Tiny->new(
    timeout => 10,
    agent   => 'myscript/1.0',
    verify_SSL => 1,           # verify TLS certs (default off in old versions)
);

sub fetch_with_retry {
    my ($url, $tries) = @_;
    $tries //= 3;
    my $resp;
    for my $attempt (1 .. $tries) {
        $resp = $http->get($url);
        return $resp if $resp->{success};
        last if $attempt == $tries;
        sleep 2 ** $attempt;   # exponential backoff
    }
    die "GET $url failed after $tries: $resp->{status} $resp->{reason}";
}

my $r = fetch_with_retry('https://api.example.com/v1/users');
my $data = decode_json($r->{content});
```

## Loops & Iteration

**for / foreach — the same keyword, different shapes**

```perl
# for and foreach are ALIASES in Perl. Pick one for style consistency.
# C-style counted loop:
for (my $i = 0; $i < @arr; $i++) {
    print "$i: $arr[\$i]\n";
}

# List iteration (preferred — no index needed):
for my $item (@arr) {
    print $item, "\n";
}

# Aliasing: $item IS $arr[0], not a copy. Mutating $item mutates the array.
for my $item (@arr) { $item *= 2 }   # doubles every element in place

# Reverse:
for my $item (reverse @arr) { ... }

# range:
for my $n (1 .. 100) { ... }   # inclusive on both ends
```

**while / until + diamond + last/next/redo**

```perl
while (my $line = <STDIN>) {     # reads until EOF
    chomp $line;
    last if $line eq 'quit';       # break
    next if $line =~ /^\s*#/;       # continue
    redo if $line eq 'retry';      # re-run this iteration WITHOUT reading next
    process($line);
}

# until = while-not:
until ($done) { $done = step() }

# Loop control with labels (multi-level break):
OUTER: for my $row (@matrix) {
    for my $cell (@$row) {
        last OUTER if $cell < 0;   # break out of both loops
    }
}
```

**map / grep — functional list transforms**

```perl
# map: transform each element, return new list
my @doubled = map { $_ * 2 } 1..10;
my @upper   = map { uc } @names;          # $_ is the current element

# grep: filter — keep elements where block returns true
my @active = grep { $_->{active} } @users;

# Composed — single-pass via list context:
my @names = map { $_->{name} }
             grep { $_->{active} && $_->{age} >= 18 }
             @users;

# Side-effect anti-pattern: don't use map for mutation.
#   BAD:  map { $_->{count}++ } @items     # discards return, confuses readers
#   GOOD: for my $i (@items) { $i->{count}++ }
```

**each() for hashes — avoid in mutation loops**

```perl
my %counts = (a => 3, b => 5, c => 1);

# each() returns the next (key, value) pair, maintains internal iterator.
while (my ($k, $v) = each %counts) {
    print "$k = $v\n";
}
# Iterator resets when each() reaches the end, OR when you call keys/values.

# ANTI-PATTERN: modifying the hash during each() — undefined behavior.
#   BAD:  while (my ($k,$v) = each %h) { delete $h{$k} if $v < 0 }
#   GOOD: for my $k (keys %h) { delete $h{$k} if $h{$k} < 0 }

# keys/values in list context returns the full list (costs memory);
# in scalar context returns the count: scalar keys %h.
```

## Functions & Callables

**Signatures (5.20+) vs unpacking @_**

```perl
use feature 'signatures';
no warnings 'experimental::signatures';   # 5.20-5.34 only; stable in 5.36+

# Modern signature form:
sub greet ($name, $greeting = 'Hello') {
    return "$greeting, $name!";
}

# Pre-signature form (still common in legacy code):
sub greet_old {
    my ($name, $greeting) = @_;
    $greeting //= 'Hello';          # // is defined-or
    return "$greeting, $name!";
}

# Slurpy args: @rest captures remaining positionals; %opts captures pairs.
sub f ($first, @rest)    { ... }    # array slurpy
sub g ($first, %opts)    { ... }    # hash slurpy — caller passes key => value pairs
```

**Anonymous subs + closures + dispatch tables**

```perl
# Anonymous sub — first-class value.
my $add = sub { $_[0] + $_[1] };
$add->(2, 3);   # 5    (-> call syntax; Perl 5.20+ allows $add->(2,3) and f(2,3))

# Closure: captures lexical variables by reference (like JS/Python).
sub make_counter {
    my $i = 0;
    return sub { $i++ };   # captures $i; persists across calls
}
my $c = make_counter;
print $c->(), " " for 1..3;   # 0 1 2

# Dispatch table — replaces long if/elsif chains:
my %ops = (
    add => sub { $_[0] + $_[1] },
    mul => sub { $_[0] * $_[1] },
);
my $result = $ops{$op_name}->(2, 3);
```

**Context-aware subs with wantarray**

```perl
sub stats {
    my @xs = @_;
    my $sum = 0; $sum += $_ for @xs;
    my $mean = @xs ? $sum / @xs : 0;

    # wantarray: true=list context, false but defined=scalar, undef=void
    return ($sum, $mean, scalar @xs) if wantarray;
    return $mean if defined wantarray;
    print "sum=$sum mean=$mean\n";   # void context
}

my @all = stats(1,2,3);   # (6, 2, 3)   list context
my $avg = stats(1,2,3);   # 2           scalar context
stats(1,2,3);              # prints      void context

# Modern style: prefer returning ONE consistent type (usually a ref).
# Use wantarray only for backwards-compat or genuinely dual-mode APIs.
```

**Prototypes — declare parse-time argument shape (rarely needed)**

```perl
# Prototypes change how Perl PARSES the call, NOT the runtime behavior.
# They are NOT type signatures. Most modern code avoids them.

# \@ prototype: takes a named array, passes the ARRAY (not its length).
sub push_all (\@\@) {    # (@dest, @src)
    my ($dest, $src) = @_;
    push @$dest, @$src;
}
my (@a, @b);
push_all(@a, @b);    # works without \@a, \@b thanks to prototype

# Common prototype-based idiom: try { ... } catch { ... }
# Try::Tiny / Feature::try:: provide this without prototypes.

# Advice: use signatures for parameter handling, not prototypes.
# Prototypes are for DSLs (Moose has, Test::More ok) and library authors.
```

## Error Handling

**die / eval / $@ — the classic pattern**

```perl
use strict; use warnings;

# die throws; $@ captures the message; eval blocks it.
my $result = eval { risky_call() };
if ($@) {
    # $@ is the error string (or object if 'use exceptions' style).
    warn "failed: $@";
    $result = fallback();
}

# die with a reference: throws an object, not a string.
# Exception::Class / Throwable::Error provide richer exception objects.
use Try::Tiny;
try {
    risky_call();
} catch {
    warn "caught: $_";   # $_ is the error in Try::Tiny (not $@)
} finally {
    cleanup();
};

# Try::Tiny is safer than bare eval — $@ can be clobbered by destructors.
```

**autodie — replace 'or die' boilerplate**

```perl
use autodie qw(open close chdir chmod);

# Without autodie, every call needs 'or die':
#   open my $fh, '<', $path or die "open $path: $!";

# With autodie, the open throws on failure with a useful message:
open my $fh, '<', $path;   # dies automatically on failure

# The thrown exception is an autodie::exception object — stringify to
# a useful message, but also support ->match('open') for selective catch.
eval {
    open my $fh, '<', $path;
    1;
} or do {
    my $err = $@;
    if ($err =~ /No such file/) { warn "missing: $path" }
    else                         { die $err }
};
```

**Custom exception classes with Throwable**

```perl
package MyApp::Error;
use Moose;
extends 'Throwable::Error';

has 'code' => (is => 'ro', required => 1);

# Throw with a structured object instead of a string:
MyApp::Error->throw(
    message => 'user not found',
    code    => 404,
);

# Catch by class:
use Try::Tiny;
try {
    find_user($id);
} catch {
    if ($_->isa('MyApp::Error') && $_->code == 404) {
        return render_404();
    }
    $_->rethrow;   # re-throw anything we don't handle
};

# advantage: typed catch, structured fields, ->rethrow, stack traces.
```

**Returning success/failure as values, not exceptions**

```perl
# Idiomatic Perl returns undef (or empty list) on failure, sets $!:
sub read_config {
    my ($path) = @_;
    return unless -r $path;       # caller checks defined-or
    open my $fh, '<', $path or return;
    my %cfg;
    while (<$fh>) { chomp; my ($k,$v) = split /=/, $_, 2; $cfg{$k} = $v }
    return \%cfg;
}

my $cfg = read_config('app.conf')
    or die "couldn't read config: $!";

# Use // (defined-or) to distinguish undef from 0/''/'0' (all false but valid):
my $timeout = $cfg->{timeout} // 30;   # only fallback on undef, not 0
```

## Concurrency Model

**threads::shared — true OS threads (rarely the right tool)**

```perl
use threads;
use threads::shared;

# Perl ithreads are OS threads with separate interpreter per thread.
# They're heavy (~1MB per thread), so use sparingly.

my $counter :shared = 0;
my @threads = map {
    threads->create(sub {
        lock($counter);             # implicit cond_wait at end of block
        $counter++;
        return $counter;
    });
} 1..10;

$_->join for @threads;   # wait for all
print "counter = $counter\n";   # 10

# Better default for I/O concurrency: AnyEvent, IO::Async, or Mojo::IOLoop.
# For CPU parallelism: fork() (Unix), Parallel::ForkManager, or MCE.
```

**fork() + waitpid — the Unix way**

```perl
use Parallel::ForkManager;

my $pm = Parallel::ForkManager->new(8);   # max 8 concurrent kids

for my $job (@jobs) {
    $pm->start and next;       # parent: next iteration; child: continues

    # In child:
    do_work($job);
    $pm->finish;               # child exits here
}
$pm->wait_all_children;        # block until all done

# Plain fork():
my $pid = fork;
die "fork failed" unless defined $pid;
if ($pid == 0) {
    # child
    exit 0;
} else {
    waitpid($pid, 0);          # parent waits
}
```

**AnyEvent — event-loop abstraction**

```perl
use AnyEvent;
use AnyEvent::HTTP;

my $cv = AnyEvent->condvar;       # condition variable — like a Promise

# Start N concurrent HTTP requests:
for my $url (@urls) {
    $cv->begin;
    http_get $url, sub {
        my ($body, $headers) = @_;
        process($url, $body);
        $cv->end;
    };
}

$cv->recv;   # block until all begin/end pairs balance

# AnyEvent works on top of EV, Event, or pure-Perl. Use Mojolicious'
# Mojo::IOLoop for new projects — same idea, better docs and ecosystem.
```

**Mojolicious::IOLoop — async web client**

```perl
use Mojolicious::8;
use Mojo::Promise;

# Promise-based async (Mojo::Promise is a Thenable, similar to JS):
my @promises = map {
    $ua->get_p($_)
} @urls;

Mojo::Promise->all(@promises)->then(sub {
    my @responses = @_;
    for my $r (@responses) {
        my $tx = $r->[0];
        process($tx->res->json);
    }
})->wait;   # block until done

# Mojo::IOLoop->start / ->stop for explicit loop control. The whole
# Mojolicious stack is built on this — non-blocking I/O throughout.
```

## Testing Patterns

**Test::More — the standard testing module**

```perl
use Test::More tests => 3;

is(add(1, 2), 3, 'add 1+2');
isnt(add(1, 2), 4, 'not 4');
like('hello world', qr/hello/, 'matches hello');

# ok is the lowest-level assertion:
ok(defined $x, 'x is defined');

# Object checks:
isa_ok($obj, 'MyApp::User');
can_ok('MyApp::User', 'name', 'age');

# Deep comparison (Test::Deep for richer):
is_deeply(\@got, \@expected, 'lists match');

# done_testing() at the end instead of a plan if count is unknown:
done_testing;
```

**Test::Exception — checks for die / live**

```perl
use Test::Exception;

# throws_ok — expects a specific exception:
throws_ok { divide(1, 0) } qr/divide by zero/, 'dies on zero';

# lives_ok — expects no exception:
lives_ok { divide(10, 2) } 'lives on non-zero';

# dies_ok / lives_ok are the boolean forms; throws_ok matches the message.

# delay_and_check — test async/timeouts:
use Test::Time;    # fakes time for testing without sleep
```

**Test::MockModule / Test::MockObject — mocking**

```perl
use Test::MockModule;
use Test::MockObject;

# Mock a module's subroutines (in-place, restored at end of scope):
my $mock = Test::MockModule->new('MyApp::HTTP');
$mock->mock('get', sub {
    my ($url) = @_;
    return { status => 200, body => 'mocked' } if $url eq 'http://x';
    return { status => 404 };
});

# Now MyApp::HTTP::get returns the mock for the duration of this test.
is(MyApp::HTTP::get('http://x')->{status}, 200, 'mocked ok');

# Test::MockObject — build an object from scratch:
my $obj = Test::MockObject->new;
$obj->mock('name', sub { 'Alice' });
$obj->mock('age', sub { 30 });
is($obj->name, 'Alice', 'mock object name');
```

**prove — the test runner + harness**

```perl
# Run all .t files in t/:
$ prove -l t/                # -l adds lib/ to @INC

# Parallel:
$ prove -j8 -l t/            # 8 workers

# Verbose:
$ prove -lv t/foo.t          # show each test as it runs

# TAP (Test Anything Protocol) — the output format. Each test prints
# 'ok N - description' or 'not ok N - description'. prove parses it.
# TAP::Harness is the underlying library; Test::More emits TAP.

# Coverage:
$ cover -test                # Devel::Cover: statement + branch + condition + pod
# Cover report at cover_db/coverage.html
```

## Performance Tuning

- Perl 5.40 is ~5-10x faster than 5.10 on string ops and regex due to the reengine rewrite; upgrade wins are real.
- Regex compilation is expensive — qr// precompiles once, reuse it in loops. m// on every iteration recompiles (unless /o, which is deprecated).
- @array in scalar context is O(1) (returns the count cached on the array); scalar(@arr) == @arr == $#arr + 1.
- Hash lookup is O(1) avg, O(n) worst (hash collisions). keys/values are O(n) — they build a list.
- Auto-vivification: $h{a}{b} = 1 creates $h{a} as a hashref on demand. Powerful, but a silent perf/memory cost in tight loops checking existence.
- String concat in a loop: $s .= $x is O(n) amortized (Perl grows the buffer geometrically); still beats $s = $s . $x which is O(n^2).
- join(',', @parts) is one C-level call — much faster than a $s .= loop for many parts.
- map/grep are faster than equivalent for-loops — they avoid per-iteration scope entry/exit.
- Subroutine calls cost ~1-2us in Perl. Inline hot loops instead of calling a sub per element.
- Moose is slow to compile (~1s for a large app) but fast at runtime once immutable. Moo skips the metaclass and compiles in ~100ms.
- use strict + use warnings have ~0 runtime cost — they're compile-time only.
- Devel::NYTProf is the standard profiler — line-level, call-graph, flame graphs. Indispensable.
- Regex with /o (compile-once) is deprecated; qr// is the modern equivalent and not deprecated.
- Pre-5.10, my $x if $cond created a static variable (the 'state' bug); 5.10 added state $x for true statics.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [cpanm](https://metacpan.org/pod/App::cpanminus) | Modern CPAN installer (cpanminus) — fast, dependency-resolving, no config required. | package |
| [Carton](https://metacpan.org/pod/Carton) | Dependency snapshot manager — cpanfile + cpanfile.snapshot, like Bundler for Perl. | package |
| [cpm](https://metacpan.org/pod/App::cpm) | Faster parallel CPAN installer — fast resolver, parallel builds. Drop-in cpanm replacement. | package |
| [perltidy](https://metacpan.org/pod/Perl::Tidy) | Code formatter — configurable style; perltidy -pbp enforces Perl Best Practices book style. | lint |
| [Perl::Critic](https://metacpan.org/pod/Perl::Critic) | Static analysis — policies based on Damian Conway's PBP book, extensible. | lint |
| [Perl::Tidy + perlcritic.com](https://perlcritic.com/) | Online lint — paste Perl code, get perlcritic feedback. Useful for code review. | lint |
| [Devel::NYTProf](https://metacpan.org/pod/Devel::NYTProf) | Profiling — line-level, call graph, flame graphs. The standard Perl profiler. | debug |
| [Enbugger / perl -d](https://perldoc.perl.org/perldebug) | Built-in debugger (perl -d) — step/break/watch. Devel::nytprof and Devel::hdb add web UIs. | debug |
| [Test::More / Test2](https://metacpan.org/pod/Test::More) | Standard testing framework (TAP-based). Test2 is the modern suite, drop-in compat. | test |
| [prove](https://perldoc.perl.org/prove) | TAP test runner — parallel, verbose, extensible via TAP::Harness::Plugins. | test |
| [Mojolicious](https://mojolicious.org/) | Real-time web framework — async I/O, WebSocket, full-stack. The leading modern Perl web stack. | build |
| [DBI](https://metacpan.org/pod/DBI) | Database independent interface — the standard DB abstraction. DBIx::Class adds an ORM. | build |
| [Plack / PSGI](https://plackperl.org/) | Perl Web Server Gateway Interface — runs any web app on any server. Rack/WSGI equivalent. | deploy |
| [Moo / Moose](https://metacpan.org/pod/Moo) | OO frameworks — Moo is fast/light, Moose is full-featured with metaclass. Pick Moo for new code. | build |
| [Try::Tiny / Feature::try](https://metacpan.org/pod/Try::Tiny) | Exception handling — Try::Tiny is the legacy standard; Feature::try (5.34+) is the modern core version. | build |
| [perlbrew / plenv](https://perlbrew.pl/) | Per-user Perl installations — manage multiple Perl versions without root. | build |
| [Dist::Zilla](https://metacpan.org/pod/Dist::Zilla) | Release automation — generates Makefile.PL/META.yml, runs tests, uploads to CPAN. Heavy but powerful. | package |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 1987 | Larry Wall releases Perl 1.0 to comp.sources.misc — replacing awk/sed scripting glue. |
| 3.0 | 1989 | Perl 3 adds binary data handling, the first major adoption wave in sysadmin/CGI. |
| 4.0 | 1991 | Perl 4 ships with the first Camel book; 'Programming Perl' becomes canonical reference. |
| 5.0 | 1994 | Complete rewrite — lexicals (my), references, modules, objects (bless). The modern language is born. |
| 5.6 | 2000 | Unicode support, our() declarations, lexical warnings, threads (ithreads model). |
| 5.10 | 2007 | say, state, given/when (switch), // (defined-or), named regex captures. Smartmatch arrives (later discouraged). |
| 5.12 | 2010 | Package version spec, yada-yada operator (...), strict by default in versioned modules. |
| 5.14 | 2011 | Unicode 6.0, /r non-destructive substitution, package block syntax. |
| 5.16 | 2012 | use v5.16 enables strict + feature bundle; __SUB__ current-sub reference. |
| 5.18 | 2013 | Hash randomization (security), lexical subroutines (experimental), given/when deprecated. |
| 5.20 | 2014 | Subroutine signatures (experimental), postfix dereference (postderef), slice aliasing. |
| 5.24 | 2016 | Postfix dereference stable, no more 'indirect method calls' ($obj = Class->new) under no indirect. |
| 5.26 | 2017 | Indented heredocs, @INC no longer includes '.' (security — CVE-2016-1238). |
| 5.32 | 2020 | isa operator ($x isa MyClass), chained comparisons (1 < $x < 10), alpha-regex removed. |
| 5.36 | 2022 | Signatures STABLE (no longer experimental), use v5.36 enables strict, given/when removed from feature bundle. |
| 5.40 | 2024 | try/catch stable, class/field/method (cor) experimental OO, ^builtin module for core functions. |
| 5.44 | 2026 | class feature stabilized further, new builtin functions, performance work. Current stable: 5.44.x. |

## Interview Hot Questions

1. **What's the difference between my, our, and local?** *(easy)*

   my creates a lexical variable — block-scoped, not visible outside the block, fastest. our declares a package global by name (so you can use $Foo::bar as $bar in this scope while still under strict). local temporarily saves and restores a package variable's value for the dynamic scope (call stack) — it does NOT create a variable, it modifies an existing global temporarily. Use my for everything; our only when you need a global; local only for special variables ($/, $\, $ENV{...}).

2. **Explain list vs scalar context.** *(medium)*

   Every expression in Perl is evaluated in either list or scalar context, decided by the surrounding code. Assignment to an array (@x = ...) is list context; assignment to a scalar ($x = ...) is scalar. Operators behave differently: localtime() in scalar returns 'Mon Jan 1 12:00:00 2024', in list returns (sec,min,hour,...). Functions use wantarray to detect context. The sigil (@ vs $) doesn't change context — the LHS does. @arr in scalar context returns the count.

3. **Why are Perl references necessary, and how do you make a nested data structure?** *(medium)*

   Lists and hashes in Perl are FLAT — @a = (1, (2, 3)) is (1, 2, 3), not nested. To nest, you need references: a scalar pointing to another array/hash. Create with \ (\@arr, \%h) or anonymous constructors ([...] and {...}). Access with arrow: $ref->[0], $ref->{k}, or postfix deref $ref->@* (5.24+). This is THE mechanism for OO (blessed refs), nested configs, and pass-by-reference.

4. **What does use strict actually do?** *(easy)*

   Three things: (1) requires declaration (my/our) before use — catches typos. (2) Disallows symbolic references — $name = 'foo'; $$name = 1 (which would access $foo) is a runtime error. (3) Disallows bareword access to undefined subroutines. Without strict, $receipient = $recipient + 1 silently creates a new undef global. With strict, that's a compile error. Always use strict + warnings in new code.

5. **How does Perl's OO work?** *(medium)*

   Perl 5's OO is minimal: a 'class' is just a package, an 'object' is a blessed reference (any ref tagged with a package), and a 'method' is a subroutine whose first argument is the object (or class for class methods). $obj->method(a, b) calls Package::method($obj, a, b). Inheritance via @ISA. Method resolution walks @ISA, then UNIVERSAL. Moo/Moose add attribute generation, type constraints, roles, method modifiers — all built on this base. Perl's OO is famously 'a post hoc bolt-on' but works.

6. **What's the difference between $x eq '5' and $x == '5'?** *(easy)*

   eq is string equality (byte comparison); == is numeric equality (coerces both to numbers). '5' eq '5' is true; '5' == '5' is also true. But '5.0' eq '5' is FALSE (different strings), while '5.0' == '5' is TRUE (same number). 'abc' == 0 warns and is true (numeric coercion of 'abc' is 0). Always pick the operator matching your intent; perlcritic catches 'numeric eq' / 'string ==' patterns.

7. **How do you safely handle tainted data (web input)?** *(hard)*

   Perl has built-in taint mode (-T flag): all external input (ARGV, STDIN, env vars, file reads) is marked 'tainted' and cannot be used in dangerous operations (system, exec, open with '|', eval of strings). To untaint, you must capture via a regex: my ($clean) = $tainted =~ /^([\w.-]+)$/; — the capture is now untainted. The pattern is YOUR responsibility; a too-permissive pattern defeats the purpose. Taint mode prevents accidental security holes, not deliberate ones.

8. **Explain the difference between die and warn, and how croak differs from die.** *(medium)*

   die throws an exception (caught by eval); warn prints to STDERR but continues execution (configurable via $SIG{__WARN__}). Carp::croak is die that reports from the CALLER's perspective — 'called from line X' points at the caller, not the failing library code. Carp::confess is croak + full stack trace. Always use croak/confess in library code; reserve die for scripts.

9. **How would you make a long-running Perl process memory-stable?** *(hard)*

   Common causes of growth: (1) accumulating into a global hash/array without bounds — bound it with a queue or LRU. (2) Closure capture of large lexicals — break the closure or weaken refs. (3) Circular references that the refcount GC can't collect — use Scalar::Util::weaken. (4) Locale::TextDomain / gettext memory leaks in old versions. Use Devel::Gladiator to find leaked SVs, Devel::Cycle to find ref cycles, andps or valgrind for heap growth patterns.

## When to Choose This

- **vs Python:** use this — Heavy text/regex one-liners, legacy CGI/sysadmin scripts, BioPerl pipelines, when CPAN modules solve the exact problem.; use that — Modern web services, ML/data science, anything needing a large hiring pool, general-purpose engineering. Python ate most of Perl's domains.
- **vs Ruby:** use this — Maintaining existing Perl codebases, one-liner text transforms (perl -pe), CPAN-specific libraries, sysadmin glue on legacy Unix.; use that — Web backends (Rails), DSLs, anything where the team values programmer happiness over terseness. Ruby is the spiritual descendant of Perl's TIMTOWTDI ethos.
- **vs Raku (Perl 6):** use this — Production code, anything needing library support, performance-critical work, hiring.; use that — Research, language-design exploration, async/regex-heavy greenfield projects. Raku is a separate language, not a Perl 5 upgrade — don't conflate them.
- **vs Bash / shell:** use this — Anything beyond ~50 lines of shell, multi-line data transforms, when you need real data structures, complex regex.; use that — Tiny glue between Unix commands, sequences of commands with simple control flow. For >100 LOC, reach for Perl or Python instead.

