import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "perl",
  name: "Perl",
  category: "languages",
  tier: 3,
  tags: ["dynamic", "interpreted", "scripting", "text-processing", "regex", "sysadmin", "ducktyping"],
  tagline: "Larry Wall's Swiss-army chainsaw — the duct tape of the early web, still unmatched for one-liner text wrangling.",
  year: 1987,
  author: "Larry Wall",

  tldr: [
    "Perl is a dynamically-typed, interpreted language whose entire design revolves around three things: first-class regular expressions, list context, and TIMTOWTDI ('there is more than one way to do it').",
    "It powered the early CGI web (the 1990s dynamic web was largely Perl scripts), remains the lingua franca of Unix sysadmin glue, and BioPerl still anchors chunks of genomics pipelines.",
    "Reach for Perl when you need to transform unstructured text in one line (`perl -pe 's/.../.../g'`), maintain legacy CGI / cPanel / RHEL packaging scripts, or extend tools like git, ffmpeg, and Postfix that ship Perl hooks.",
    "Avoid Perl for new web services — modern Perl (Mojolicious, Dancer2) is competent but the ecosystem has thinned, and Python/Go/Rust have absorbed its sysadmin and text-processing niches. Raku (formerly Perl 6) is a separate language, not a Perl 5 upgrade.",
  ],

  mentalModel: {
    title: "Sigils, context, and the special variable jungle",
    body: "Every variable has a sigil that says what kind of value you want pulled out: `$scalar`, `@array`, `%hash`, `&sub` — but the sigil is the operation, not the variable's storage class (`@arr` vs `$arr[0]` is the same array viewed two ways). Every operation is also evaluated in list or scalar context, and operators behave differently depending on which (`localtime` in scalar context returns a string, in list context a 9-element list). The second model: there are ~70 built-in punctuation variables (`$_`, `$/`, `$@`, `$!`, `$0`, `$,`) that every operator reads silently, which is why Perl one-liners compress so aggressively and read so opaquely.",
  },

  constructs: [
    { syntax: "my $x = 1;", behavior: "Lexical (file/block-scoped) scalar declaration — use `our` for package globals, `local` for dynamic scoping of globals.", when: "Default scope for all variables; `use strict` makes this mandatory." },
    { syntax: "my @a = (1, 2, 3); my $first = $a[0];", behavior: "Array and element access — the sigil flips to `$` because the result is scalar.", when: "List storage; remember `@a` in scalar context is the count." },
    { syntax: "my %h = (k => 'v'); my $v = $h{k};", behavior: "Hash and value access — `=>` is a fat comma that auto-quotes its LHS.", when: "Lookups, named args, JSON-like data." },
    { syntax: "my @refs = \\@a;  $$r[0] = 9;", behavior: "Reference creation + dereferencing — needed for nested data structures.", when: "Anything beyond flat lists/hashes; required for OOP." },
    { syntax: "sub f { my ($x, %opt) = @_; ... }", behavior: "Args unpacked from `@_`; flattening is list-context assignment.", when: "All subroutine definitions — there are no named parameters in Perl 5 (until signatures, still experimental)." },
    { syntax: "my $rx = qr/foo(?:bar)?/i;", behavior: "Pre-compiled regex object — flags stick to the qr//.", when: "Reusing patterns or passing them around; faster than re-parsing." },
    { syntax: "if ($s =~ /^a(.+)b$/) { my $cap = $1; }", behavior: "Match operator — captures populate $1, $2, …", when: "Pattern matching; =~ binds a different target than $_." },
    { syntax: "s/old/new/g  on $_", behavior: "Substitution operator with /g global flag — mutates $_ in place.", when: "In-place text replacement; combine with -pe for one-liners." },
    { syntax: "map { $_ * 2 } @nums", behavior: "List transform — block evaluated per element, returns list.", when: "Functional transforms; grep is the filter sibling." },
    { syntax: "eval { die 'oops' }; if ($@) { ... }", behavior: "Exception catch — `die` populates `$@`; returns last expr on success.", when: "All error handling in pre-5.34 code; Try::Tiny / Feature::try for cleaner syntax." },
    { syntax: "package Foo; sub new { bless {@_}, shift }", behavior: "Bless a hashref into a package — that's the entire OO model in one line.", when: "Legacy OO; modern code uses Moose / Moo for attributes and roles." },
    { syntax: "open my $fh, '<', $path or die $!;", behavior: "Three-arg open with lexical filehandle — kills the old `open FH, \">file\"` injection bugs.", when: "Any file I/O; the two-arg form is forbidden under `use strict` + modern Perl." },
  ],

  patterns: [
    {
      lang: "perl",
      caption: "Moo class — modern minimal OO without Moose's compile cost",
      code: `package User;
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
print $u->age, "\\n";  # 3`,
    },
    {
      lang: "perl",
      caption: "Streaming line-by-line transform with one-liner idiom",
      code: `#!/usr/bin/env perl
use strict;
use warnings;
use autodie;

# Slurp the whole input only if you need cross-line state.
# For per-line transforms, the diamond operator reads lazily.
my $total = 0;
while (my $line = <>) {           # <> reads from @ARGV files or STDIN
    chomp $line;                   # strip the trailing newline (uses $/)
    next if $line =~ /^\\s*#/;       # skip comments
    my ($id, $amount) = split /\\t/, $line, 2;
    $total += $amount // 0;
}
printf "total: %d\\n", $total;

# Equivalent one-liner (debugging on a server with no script file):
#   perl -nae 'next if /^\\s*#/; $t += $F[1]; END{ print $t }' data.tsv`,
    },
    {
      lang: "perl",
      caption: "Context-aware subroutine — wantarray lets one function return three things",
      code: `sub stats {
    my @xs = @_;
    my ($sum, $n) = (0, scalar @xs);
    $sum += $_ for @xs;
    my $mean = $n ? $sum / $n : 0;
    return ($sum, $mean, $n) if wantarray;     # list context
    return $mean if defined wantarray;          # scalar context
    print "sum=$sum mean=$mean n=$n\\n";         # void context
}

my @all  = stats(1, 2, 3);   # (6, 2, 3)
my $avg  = stats(1, 2, 3);   # 2
stats(1, 2, 3);              # prints "sum=6 mean=2 n=3"`,
    },
    {
      lang: "perl",
      caption: "Regex captures with named groups and /p persistent match vars",
      code: `my $log = '2024-08-15T10:23:01Z GET /api/users?id=42 200 0.043';

if ($log =~ m{
    (?<ts>\\S+)\\s+
    (?<method>GET|POST|PUT|DELETE)\\s+
    (?<path>\\S+)\\s+
    (?<status>\\d{3})\\s+
    (?<rt>[0-9.]+)
}x) {
    # /x lets you whitespace-and-comment the regex freely.
    # %+ holds named captures; $-{ts} the array form (for repeated names).
    printf "%s %s -> %s in %sms\\n",
        $+{method}, $+{path}, $+{status}, $+{rt};
}

# Persistent capture vars (/\${^MATCH}/$1 survive past another match) need /p:
"hello" =~ /ll/p;
print "got \${^MATCH}\\n";   # 'll' even after the next regex runs`,
    },
  ],

  pitfalls: [
    {
      title: "Forgetting `use strict; use warnings;`",
      symptom: "Typos like `$receipient` silently create a new undef global; `@array` flattened into a hash quietly uses the first two elements. Hours lost.",
      fix: "Start every file with `use strict; use warnings;` (or `use common::sense;`). Modern Perl ships with both off by default only for backward compatibility — never write new code without them.",
    },
    {
      title: "List vs scalar context from `return`",
      symptom: "`return @arr` in scalar context returns the count, not the array — calling `$count = func()` where func ends with `return @arr` is a classic off-by-everything bug.",
      fix: "Use `wantarray` if you genuinely need both, or return an explicit reference (`return \\@arr`) and document it. Most modern Perl returns references for any non-trivial collection.",
    },
    {
      title: "`my @arr = (1,2,3); my @copy = (@arr);` flattens references",
      symptom: "`my @nested = (@a, @b)` is one flat list of a's elements followed by b's — not a list of two arrays. Beginners expect `[[@a, @b]]`.",
      fix: "Use references for nested structures: `my @nested = (\\@a, \\@b); my @nested = ([$a], [$b]);` and dereference explicitly with `@{ $nested[0] }` or postfix `@arr->@*` (postderef, 5.24+).",
    },
    {
      title: "Two-arg open — path injection",
      symptom: "`open(FH, $user_input)` interprets the leading `>` / `<` / `|` as a mode, so a filename like `|rm -rf /` runs a shell command.",
      fix: "Always three-arg form: `open my $fh, '<', $path or die $!`. The two-arg form is one of the most exploited Perl footguns in CGI history.",
    },
    {
      title: "`defined` vs `exists` vs boolean truth on hashes",
      symptom: "`if ($h{k})` returns false for a stored value of 0 or ''; `if (exists $h{k})` returns true; `if (defined $h{k})` returns true unless the stored value is undef.",
      fix: "Use `exists` to ask 'is the key there?', `defined` to ask 'is the value non-undef?', and boolean to ask 'is the value truthy?'. Pick the right one — they answer different questions.",
    },
    {
      title: "Captures `$1` survive forever — until the next match",
      symptom: "After `/foo(.)/` succeeds, `$1` is set; if a later regex (even in a called subroutine) fails, `$1` still holds the old value — code reading `$1` after a failed match silently uses stale data.",
      fix: "Always check the match returned true before reading captures, or copy them out immediately (`my ($cap) = /pat(.)/` in list context returns an empty list on failure, not stale $1).",
    },
    {
      title: "`local` is dynamic scope, not lexical",
      symptom: "`local $/` inside a subroutine affects `$/` for any sub called from there too, leaking the change down the call stack. Beginners think it's a `my`.",
      fix: "`local` temporarily saves and restores a *package* variable for the dynamic scope (the call stack). Use `my` for lexicals. The idiom `local $/; my $s = <$fh>;` is fine because the scope is the block; just don't expect it to behave like `my`.",
    },
  ],

  quickReference: [
    { fact: "Perl 5.40 is the current stable series (2024); Perl 7 was abandoned as a release vehicle in favor of incremental modernization.", tag: "version" },
    { fact: "Raku (formerly Perl 6) is a separate language with its own compiler (Rakudo) — not source-compatible with Perl 5.", tag: "version" },
    { fact: "Subroutine signatures (`sub f($x, $y) { ... }`) stabilized in 5.36 — before that, args were always pulled from `@_`.", tag: "version" },
    { fact: "Regexes are first-class — qr// precompiles to a Regexp object; /x lets you whitespace patterns, /e evaluates replacement as Perl code.", tag: "perf" },
    { fact: "CGI.pm was removed from the Perl core in 5.22 (2015) and is now a CPAN module — modern Perl web stacks use PSGI/Plack.", tag: "version" },
    { fact: "@_ is the argument list — it's an alias, not a copy. `$_[0] = 9` modifies the caller's variable (only for non-readonly values).", tag: "gotcha" },
    { fact: "List assignment in scalar context returns the count of elements on the RHS — `$n = (@a, @b)` is `scalar(@a) + scalar(@b)` only in specific contexts; in scalar it's the last element.", tag: "gotcha" },
    { fact: "use strict disables symbolic references, bareword autovivification, and undeclared vars — the three classes of bugs that gave Perl its 90s reputation.", tag: "style" },
    { fact: "perltidy and Perl::Critic (with Freenode or Perl::BestPractices profile) are the standard linters; perltidy -pbp enforces Damian Conway's book style.", tag: "style" },
    { fact: "Moo vs Moose: Moo skips the metaclass overhead and is ~10x faster to compile; use Moose for full metaprogramming, Moo for everything else.", tag: "perf" },
    { fact: "Autovivification: `push @{$h{a}}, 1` creates `$h{a}` as an arrayref if it didn't exist — extremely ergonomic, also a silent-bug source in nested checks.", tag: "gotcha" },
    { fact: "Diamond operator `<>` reads from @ARGV files then STDIN; `<<>>` (double-diamond, 5.22+) does the same but refuses to interpret leading > < | as modes.", tag: "gotcha" },
    { fact: "cpanm (cpanminus) is the modern installer; Carton / cpm handle dependency snapshots (cpanfile.snapshot) like Bundler.", tag: "style" },
    { fact: "Perl's regex engine is PCRE's ancestor — features like `(?>...)` (atomic), `(?=...)`, `(?:...)` originated here and propagated to every other language.", tag: "version" },
    { fact: "thousands of CPAN modules still install cleanly — Test::More, DBI, Mojolicious, Plack, Catalyst are mature and battle-tested.", tag: "version" },
  ],

  goDeeper: [
    { title: "perldoc.perl.org — official Perl documentation", url: "https://perldoc.perl.org/", note: "Start with perlintro, then perlvar (the special variables), then perlsyn and perlop. Everything is browsable online." },
    { title: "Modern Perl (chromatic)", url: "https://modernperlbooks.com/books/modernperl/", note: "Free book; the canonical 'how to write Perl like it's 2024 not 1998' reference. Treats Moo, strictures, and named params as defaults." },
    { title: "Programming Perl (Wall, Christiansen, Orwant)", url: "https://www.oreilly.com/library/view/programming-perl-4th/9781449321453/", note: "The Camel book — the language reference by Larry Wall himself. Dense but authoritative; chapters 2-8 cover every operator." },
    { title: "Perl Best Practices (Damian Conway)", url: "https://www.oreilly.com/library/view/perl-best-practices/0596001738/", note: "The book Perl::Critic's default policy is based on. Some choices have aged, the principles haven't." },
    { title: "The CPAN — Comprehensive Perl Archive Network", url: "https://metacpan.org/", note: "Primary source for every module; metacpan.org is the modern searchable frontend with per-module documentation and dependency graphs." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "$scalar", behavior: "Single value — number, string, or reference; the sigil is the OPERATION, not the storage class.", when: "All single-value variables. Perl auto-converts between number and string by context." },
      { syntax: "undef", behavior: "The unassigned value — falsy, warns under 'use warnings' when used in an operation.", when: "Optional/sentinel values; test with defined()." },
      { syntax: "integer / float", behavior: "Perl uses doubles internally unless 'use integer' is in scope (lexical, 32-bit int ops).", when: "Math. For arbitrary precision use Math::BigInt / Math::BigFloat." },
      { syntax: "string", behavior: "Byte string by default ('use bytes' to force); 'use utf8' for source encoding, Encode module for I/O.", when: "All text. Perl distinguishes byte strings from character strings via the UTF-8 flag — a top source of subtle bugs." },
      { syntax: "reference ($ref)", behavior: "SCALAR ref to another value — \\\\@arr, \\\\%h, \\\\&sub. Required for nested data and OO.", when: "Anything beyond flat lists/hashes; all objects are blessed references." },
      { syntax: "blessed ref", behavior: "A reference tagged with a package name via bless(); the entire Perl OO model.", when: "All OO — Moo/Moose/classic. ref($obj) returns the package." },
      { syntax: "code ref (\\\\&sub)", behavior: "Reference to a subroutine — first-class, can be stored and called later.", when: "Callbacks, dispatch tables, higher-order functions." },
      { syntax: "glob (*name)", behavior: "Typeglob — symbol table entry; can alias scalars/arrays/hashes/subs at a distance.", when: "Exporters, symbol-table games. Modern code rarely uses globs directly." },
    ],
    collections: [
      { syntax: "@array", behavior: "Ordered list — indexed 0..n-1; @arr in scalar context returns the count.", when: "Ordered sequences; 'push/pop/shift/unshift' for stack/queue ops." },
      { syntax: "%hash", behavior: "Unordered key-value map — keys must be strings (auto-stringified); O(1) avg lookup.", when: "Lookups, named args, JSON-like data. Insertion order preserved via each()/keys() since 5.18+." },
      { syntax: "@{[ ... ]}", behavior: "Array dereference inside an expression — common for inline list construction.", when: "Embedding list ops in strings or one-liners; the 'inline array' idiom." },
      { syntax: "$h{key} / @h{@keys}", behavior: "Hash slice — single value vs list of values for multiple keys.", when: "Multi-key lookup; the @h{@keys} form returns a list aligned to @keys." },
      { syntax: "%h = (k => v, ...)", behavior: "Hash assignment from a list — fat comma (=>) auto-quotes its LHS.", when: "Hash construction; pairs of list elements become key/value." },
      { syntax: "[ ... ]", behavior: "Anonymous arrayref constructor — returns a SCALAR reference, not a list.", when: "Nested data, pass-by-reference; modern Perl prefers refs over lists for structured data." },
      { syntax: "{ ... }", behavior: "Anonymous hashref constructor — returns a SCALAR reference.", when: "Nested hashes, JSON-shaped literals, Moo/Moose default factories." },
      { syntax: "( ... )", behavior: "List literal — flat; flattens nested lists. Parentheses mostly group, don't construct.", when: "Multi-value returns, list assignments. Beware: (1, (2, 3)) is (1, 2, 3), not nested." },
      { syntax: "Tie::Hash / Tie::Array", behavior: "Tied variable — class implementing FETCH/STORE that masquerades as a hash/array.", when: "Custom containers, on-disk hashes (DB_File), lazy-loaded configs. Slower than real hashes." },
    ],
    custom: [
      { syntax: "package Foo; sub new { bless {@_}, shift }", behavior: "Classic OO: bless a hashref into a package. That's the whole model.", when: "Legacy OO. Modern code uses Moo/Moose for attributes + roles." },
      { syntax: "use Moo; has name => (is => 'ro');", behavior: "Moo class — modern minimal OO with attribute generation, type checks, defaults.", when: "Default for new OO. Faster compile than Moose, mostly compatible API." },
      { syntax: "use Moose; with 'Role::Serializable';", behavior: "Moose class with role composition — full metaclass, method modifiers, immutability.", when: "When you need the metaprogramming power of Moose; pays a compile-time cost." },
      { syntax: "role { method foo => sub { ... } }", behavior: "Role (Moose::Role / Role::Tiny) — composable units of behavior, unlike inheritance.", when: "Sharing behavior across unrelated classes; avoids deep inheritance trees." },
      { syntax: "use enum qw(Foo Bar Baz)", behavior: "Enum-like constants — exports Foo=0, Bar=1, etc. as subs.", when: "Closed value sets; many shops just use constants (use constant FOO => 0)." },
      { syntax: "subtypes via Moose::Util::TypeConstraints", behavior: "User-defined type constraints (subtype 'PosInt', as 'Int', where { $_ > 0 }).", when: "Domain validation on Moo/Moose attributes; checked at construction." },
      { syntax: "use constant PI => 4 * atan2(1, 1)", behavior: "Compile-time constant — inlined into callers, zero runtime cost.", when: "True constants (vs variables). Cannot be interpolated in strings without @{[PI]}." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "$x = $y", behavior: "Scalar assignment — returns the assigned value, so chained assignment works.", when: "Always. Use my $x for lexical declaration; bare $x creates a package global." },
    { syntax: "$x += $y, .= $y", behavior: "Compound assignment — mutates in place. Works for all binary ops.", when: "Accumulators, string building. Watch string concat in loops — use join() for many." },
    { syntax: "$a + $b, $a - $b, $a * $b", behavior: "Numeric arithmetic — coerces strings to numbers (leading digits, 0 otherwise).", when: "Math. '5' + 3 == 8; 'abc' + 0 warns and becomes 0 under warnings." },
    { syntax: "$a / $b, $a % $b", behavior: "Division (float) and modulo (integer). Modulo's sign follows the dividend.", when: "Math. Integer division: int($a/$b) or use integer." },
    { syntax: "$a . $b  (string concat)", behavior: "Concatenation — distinct from + (numeric). '5' . 3 == '53'.", when: "Building strings. join('', @parts) is faster than $s .= $x in a loop." },
    { syntax: "$a x $n", behavior: "Repetition — string context repeats the string; list context (list) x $n repeats the list.", when: "Padding ('-' x 80), initializing arrays ((undef) x 100)." },
    { syntax: "$a == $b, $a != $b", behavior: "Numeric equality — coerces both sides to numbers. '5' == '5.0' is true.", when: "Numeric compare. Don't use for strings — see eq." },
    { syntax: "$a eq $b, $a ne $b", behavior: "String equality — byte-by-byte. '5' eq '5.0' is false.", when: "String compare. Use cmp for sort, lt/gt for ordering." },
    { syntax: "$a < $b, $a gt $b, $a <=> $b, $a cmp $b", behavior: "Comparisons: numeric (<, gt is string), spaceship (<=> numeric, cmp string) returns -1/0/1.", when: "Sort callbacks: sort { $a <=> $b } @nums vs sort { $a cmp $b } @strs." },
    { syntax: "$a && $b, $a || $b, $a // $b", behavior: "Short-circuit: && (and), || (or, returns first truthy), // (defined-or, returns first defined).", when: "Defaults: $x //= $default. // is the modern idiom (5.10+) over || for undef-vs-0 distinction." },
    { syntax: "$a ? $b : $c", behavior: "Ternary — right-associative, so $a ? $b : $c ? $d : $e parses as $a ? $b : ($c ? $d : $e).", when: "Concise conditional assignment. Nested ternaries hurt readability." },
    { syntax: "$a .. $b, $a ... $b", behavior: "Range operator: list context (1..10) generates a list; scalar context (flip-flop) true between matches.", when: "Loops (for 1..10), sed-style line ranges. Flip-flop (..) is stateful, rare in modern code." },
    { syntax: "$x =~ m/.../, $x =~ s/.../.../", behavior: "Regex bind — applies match/substitute to $x instead of $_.", when: "Pattern matching and replacement. Capture vars $1, $2 populate on success." },
    { syntax: "->  (arrow)", behavior: "Dereference / method call — $ref->{k}, $ref->[0], $obj->method(@args).", when: "All OO and ref access. Equivalent to older ${$ref}{k} / @{$ref}[0]." },
    { syntax: "= ~  (NOT regex!)", behavior: "Assignment followed by bitwise NOT on the LHS — a famous typo. '$x = ~$y' is assignment then ~.", when: "Never intentional. Linters warn; 'perltidy' + 'perlcritic' catch it." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "perl",
      caption: "Three-arg open + lexical filehandle + autodie",
      code: `use strict;
use warnings;
use autodie qw(open close);   # die on failure instead of silent undef

open my $fh, '<:encoding(UTF-8)', $path or die "open $path: \$!";

# Slurp whole file (small files only):
my $whole = do { local \$/; <$fh> };

# Stream line by line — never loads the whole file:
while (my $line = <$fh>) {
    chomp $line;           # strip newline (\$/ is the input record separator)
    next if $line =~ /^\\s*#/;
    process($line);
}
close $fh;   # autodie closes — explicit close still good for error checking

# Write: three-arg open with mode prefix:
open my $out, '>:encoding(UTF-8)', 'out.txt';
print $out "line\\n";   # NO COMMA after $fh — print takes FH as first arg
close $out;`,
    },
    {
      lang: "perl",
      caption: "Diamond operator + one-liner idiom",
      code: `#!/usr/bin/env perl
use strict;
use warnings;

# <> reads from @ARGV files in order, falling back to STDIN if @ARGV empty.
# \$ARGV is the current filename; ARGV is the special filehandle.
while (my $line = <>) {
    chomp $line;
    print uc(\$line), "\\n";
}

# Run as:  ./script.pl a.txt b.txt -     (- means STDIN)
#
# One-liner equivalents:
#   perl -nle 'print uc' a.txt b.txt        # -n loop, -l chomp, -e code
#   perl -pe 's/\\d+/\\$&*2/e' file.txt      # -p print after, /e eval replacement
#   perl -i.bak -pe 's/foo/bar/g' *.txt     # -i edit in place, .bak backup`,
    },
    {
      lang: "perl",
      caption: "JSON / YAML / Storable serialization",
      code: `use JSON::PP;            # core module (JSON::XS is the fast C version)
use YAML::XS;            # optional, faster
use Storable;            # core, Perl-specific binary format

my $data = { name => "ada", tags => ["a", "b"], id => 42 };

# JSON — text, portable, the default for interop
my \$json = encode_json(\$data);              # encode_json returns bytes
my \$back = decode_json(\$json);              # returns hashref/arrayref

# Pretty-printed JSON:
my \$pretty = JSON::PP->new->pretty->encode(\$data);

# Storable — Perl-specific binary, NOT portable across Perl major versions
store \\$data, 'data.storable';
my \$loaded = retrieve('data.storable');

# NEVER Storable-decode untrusted data — code injection via CODE refs.
# For untrusted input, use JSON (after schema validation) or CBOR::XS.`,
    },
    {
      lang: "perl",
      caption: "HTTP client with HTTP::Tiny (core) + retries",
      code: `use HTTP::Tiny;
use Try::Tiny;

my \$http = HTTP::Tiny->new(
    timeout => 10,
    agent   => 'myscript/1.0',
    verify_SSL => 1,           # verify TLS certs (default off in old versions)
);

sub fetch_with_retry {
    my (\$url, \$tries) = @_;
    \$tries //= 3;
    my \$resp;
    for my \$attempt (1 .. \$tries) {
        \$resp = \$http->get(\$url);
        return \$resp if \$resp->{success};
        last if \$attempt == \$tries;
        sleep 2 ** \$attempt;   # exponential backoff
    }
    die "GET \$url failed after \$tries: \$resp->{status} \$resp->{reason}";
}

my \$r = fetch_with_retry('https://api.example.com/v1/users');
my \$data = decode_json(\$r->{content});`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "perl",
      caption: "for / foreach — the same keyword, different shapes",
      code: `# for and foreach are ALIASES in Perl. Pick one for style consistency.
# C-style counted loop:
for (my \$i = 0; \$i < @arr; \$i++) {
    print "\$i: \$arr[\\$i]\\n";
}

# List iteration (preferred — no index needed):
for my \$item (@arr) {
    print \$item, "\\n";
}

# Aliasing: \$item IS \$arr[0], not a copy. Mutating \$item mutates the array.
for my \$item (@arr) { \$item *= 2 }   # doubles every element in place

# Reverse:
for my \$item (reverse @arr) { ... }

# range:
for my \$n (1 .. 100) { ... }   # inclusive on both ends`,
    },
    {
      lang: "perl",
      caption: "while / until + diamond + last/next/redo",
      code: `while (my \$line = <STDIN>) {     # reads until EOF
    chomp \$line;
    last if \$line eq 'quit';       # break
    next if \$line =~ /^\\s*#/;       # continue
    redo if \$line eq 'retry';      # re-run this iteration WITHOUT reading next
    process(\$line);
}

# until = while-not:
until (\$done) { \$done = step() }

# Loop control with labels (multi-level break):
OUTER: for my \$row (@matrix) {
    for my \$cell (@\$row) {
        last OUTER if \$cell < 0;   # break out of both loops
    }
}`,
    },
    {
      lang: "perl",
      caption: "map / grep — functional list transforms",
      code: `# map: transform each element, return new list
my \@doubled = map { \$_ * 2 } 1..10;
my \@upper   = map { uc } @names;          # \$_ is the current element

# grep: filter — keep elements where block returns true
my \@active = grep { \$_->{active} } @users;

# Composed — single-pass via list context:
my \@names = map { \$_->{name} }
             grep { \$_->{active} && \$_->{age} >= 18 }
             @users;

# Side-effect anti-pattern: don't use map for mutation.
#   BAD:  map { \$_->{count}++ } @items     # discards return, confuses readers
#   GOOD: for my \$i (@items) { \$i->{count}++ }`,
    },
    {
      lang: "perl",
      caption: "each() for hashes — avoid in mutation loops",
      code: `my %counts = (a => 3, b => 5, c => 1);

# each() returns the next (key, value) pair, maintains internal iterator.
while (my (\$k, \$v) = each %counts) {
    print "\$k = \$v\\n";
}
# Iterator resets when each() reaches the end, OR when you call keys/values.

# ANTI-PATTERN: modifying the hash during each() — undefined behavior.
#   BAD:  while (my (\$k,\$v) = each %h) { delete \$h{\$k} if \$v < 0 }
#   GOOD: for my \$k (keys %h) { delete \$h{\$k} if \$h{\$k} < 0 }

# keys/values in list context returns the full list (costs memory);
# in scalar context returns the count: scalar keys %h.`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "perl",
      caption: "Signatures (5.20+) vs unpacking @_",
      code: `use feature 'signatures';
no warnings 'experimental::signatures';   # 5.20-5.34 only; stable in 5.36+

# Modern signature form:
sub greet (\$name, \$greeting = 'Hello') {
    return "\$greeting, \$name!";
}

# Pre-signature form (still common in legacy code):
sub greet_old {
    my (\$name, \$greeting) = @_;
    \$greeting //= 'Hello';          # // is defined-or
    return "\$greeting, \$name!";
}

# Slurpy args: @rest captures remaining positionals; %opts captures pairs.
sub f (\$first, @rest)    { ... }    # array slurpy
sub g (\$first, %opts)    { ... }    # hash slurpy — caller passes key => value pairs`,
    },
    {
      lang: "perl",
      caption: "Anonymous subs + closures + dispatch tables",
      code: `# Anonymous sub — first-class value.
my \$add = sub { \$_[0] + \$_[1] };
\$add->(2, 3);   # 5    (-> call syntax; Perl 5.20+ allows \$add->(2,3) and f(2,3))

# Closure: captures lexical variables by reference (like JS/Python).
sub make_counter {
    my \$i = 0;
    return sub { \$i++ };   # captures \$i; persists across calls
}
my \$c = make_counter;
print \$c->(), " " for 1..3;   # 0 1 2

# Dispatch table — replaces long if/elsif chains:
my %ops = (
    add => sub { \$_[0] + \$_[1] },
    mul => sub { \$_[0] * \$_[1] },
);
my \$result = \$ops{\$op_name}->(2, 3);`,
    },
    {
      lang: "perl",
      caption: "Context-aware subs with wantarray",
      code: `sub stats {
    my @xs = @_;
    my \$sum = 0; \$sum += \$_ for @xs;
    my \$mean = @xs ? \$sum / @xs : 0;

    # wantarray: true=list context, false but defined=scalar, undef=void
    return (\$sum, \$mean, scalar @xs) if wantarray;
    return \$mean if defined wantarray;
    print "sum=\$sum mean=\$mean\\n";   # void context
}

my @all = stats(1,2,3);   # (6, 2, 3)   list context
my \$avg = stats(1,2,3);   # 2           scalar context
stats(1,2,3);              # prints      void context

# Modern style: prefer returning ONE consistent type (usually a ref).
# Use wantarray only for backwards-compat or genuinely dual-mode APIs.`,
    },
    {
      lang: "perl",
      caption: "Prototypes — declare parse-time argument shape (rarely needed)",
      code: `# Prototypes change how Perl PARSES the call, NOT the runtime behavior.
# They are NOT type signatures. Most modern code avoids them.

# \\@ prototype: takes a named array, passes the ARRAY (not its length).
sub push_all (\\@\\@) {    # (\@dest, \@src)
    my (\$dest, \$src) = @_;
    push @\$dest, @\$src;
}
my (@a, @b);
push_all(@a, @b);    # works without \\@a, \\@b thanks to prototype

# Common prototype-based idiom: try { ... } catch { ... }
# Try::Tiny / Feature::try:: provide this without prototypes.

# Advice: use signatures for parameter handling, not prototypes.
# Prototypes are for DSLs (Moose has, Test::More ok) and library authors.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "perl",
      caption: "die / eval / \$@ — the classic pattern",
      code: `use strict; use warnings;

# die throws; \$@ captures the message; eval blocks it.
my \$result = eval { risky_call() };
if (\$@) {
    # \$@ is the error string (or object if 'use exceptions' style).
    warn "failed: \$@";
    \$result = fallback();
}

# die with a reference: throws an object, not a string.
# Exception::Class / Throwable::Error provide richer exception objects.
use Try::Tiny;
try {
    risky_call();
} catch {
    warn "caught: \$_";   # \$_ is the error in Try::Tiny (not \$@)
} finally {
    cleanup();
};

# Try::Tiny is safer than bare eval — \$@ can be clobbered by destructors.`,
    },
    {
      lang: "perl",
      caption: "autodie — replace 'or die' boilerplate",
      code: `use autodie qw(open close chdir chmod);

# Without autodie, every call needs 'or die':
#   open my \$fh, '<', \$path or die "open \$path: \$!";

# With autodie, the open throws on failure with a useful message:
open my \$fh, '<', \$path;   # dies automatically on failure

# The thrown exception is an autodie::exception object — stringify to
# a useful message, but also support ->match('open') for selective catch.
eval {
    open my \$fh, '<', \$path;
    1;
} or do {
    my \$err = \$@;
    if (\$err =~ /No such file/) { warn "missing: \$path" }
    else                         { die \$err }
};`,
    },
    {
      lang: "perl",
      caption: "Custom exception classes with Throwable",
      code: `package MyApp::Error;
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
    find_user(\$id);
} catch {
    if (\$_->isa('MyApp::Error') && \$_->code == 404) {
        return render_404();
    }
    \$_->rethrow;   # re-throw anything we don't handle
};

# advantage: typed catch, structured fields, ->rethrow, stack traces.`,
    },
    {
      lang: "perl",
      caption: "Returning success/failure as values, not exceptions",
      code: `# Idiomatic Perl returns undef (or empty list) on failure, sets \$!:
sub read_config {
    my (\$path) = @_;
    return unless -r \$path;       # caller checks defined-or
    open my \$fh, '<', \$path or return;
    my %cfg;
    while (<\$fh>) { chomp; my (\$k,\$v) = split /=/, \$_, 2; \$cfg{\$k} = \$v }
    return \\%cfg;
}

my \$cfg = read_config('app.conf')
    or die "couldn't read config: \$!";

# Use // (defined-or) to distinguish undef from 0/''/'0' (all false but valid):
my \$timeout = \$cfg->{timeout} // 30;   # only fallback on undef, not 0`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "perl",
      caption: "threads::shared — true OS threads (rarely the right tool)",
      code: `use threads;
use threads::shared;

# Perl ithreads are OS threads with separate interpreter per thread.
# They're heavy (~1MB per thread), so use sparingly.

my \$counter :shared = 0;
my @threads = map {
    threads->create(sub {
        lock(\$counter);             # implicit cond_wait at end of block
        \$counter++;
        return \$counter;
    });
} 1..10;

\$_->join for @threads;   # wait for all
print "counter = \$counter\\n";   # 10

# Better default for I/O concurrency: AnyEvent, IO::Async, or Mojo::IOLoop.
# For CPU parallelism: fork() (Unix), Parallel::ForkManager, or MCE.`,
    },
    {
      lang: "perl",
      caption: "fork() + waitpid — the Unix way",
      code: `use Parallel::ForkManager;

my \$pm = Parallel::ForkManager->new(8);   # max 8 concurrent kids

for my \$job (@jobs) {
    \$pm->start and next;       # parent: next iteration; child: continues

    # In child:
    do_work(\$job);
    \$pm->finish;               # child exits here
}
\$pm->wait_all_children;        # block until all done

# Plain fork():
my \$pid = fork;
die "fork failed" unless defined \$pid;
if (\$pid == 0) {
    # child
    exit 0;
} else {
    waitpid(\$pid, 0);          # parent waits
}`,
    },
    {
      lang: "perl",
      caption: "AnyEvent — event-loop abstraction",
      code: `use AnyEvent;
use AnyEvent::HTTP;

my \$cv = AnyEvent->condvar;       # condition variable — like a Promise

# Start N concurrent HTTP requests:
for my \$url (@urls) {
    \$cv->begin;
    http_get \$url, sub {
        my (\$body, \$headers) = @_;
        process(\$url, \$body);
        \$cv->end;
    };
}

\$cv->recv;   # block until all begin/end pairs balance

# AnyEvent works on top of EV, Event, or pure-Perl. Use Mojolicious'
# Mojo::IOLoop for new projects — same idea, better docs and ecosystem.`,
    },
    {
      lang: "perl",
      caption: "Mojolicious::IOLoop — async web client",
      code: `use Mojolicious::8;
use Mojo::Promise;

# Promise-based async (Mojo::Promise is a Thenable, similar to JS):
my @promises = map {
    \$ua->get_p(\$_)
} @urls;

Mojo::Promise->all(@promises)->then(sub {
    my @responses = @_;
    for my \$r (@responses) {
        my \$tx = \$r->[0];
        process(\$tx->res->json);
    }
})->wait;   # block until done

# Mojo::IOLoop->start / ->stop for explicit loop control. The whole
# Mojolicious stack is built on this — non-blocking I/O throughout.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "perl",
      caption: "Test::More — the standard testing module",
      code: `use Test::More tests => 3;

is(add(1, 2), 3, 'add 1+2');
isnt(add(1, 2), 4, 'not 4');
like('hello world', qr/hello/, 'matches hello');

# ok is the lowest-level assertion:
ok(defined \$x, 'x is defined');

# Object checks:
isa_ok(\$obj, 'MyApp::User');
can_ok('MyApp::User', 'name', 'age');

# Deep comparison (Test::Deep for richer):
is_deeply(\\@got, \\@expected, 'lists match');

# done_testing() at the end instead of a plan if count is unknown:
done_testing;`,
    },
    {
      lang: "perl",
      caption: "Test::Exception — checks for die / live",
      code: `use Test::Exception;

# throws_ok — expects a specific exception:
throws_ok { divide(1, 0) } qr/divide by zero/, 'dies on zero';

# lives_ok — expects no exception:
lives_ok { divide(10, 2) } 'lives on non-zero';

# dies_ok / lives_ok are the boolean forms; throws_ok matches the message.

# delay_and_check — test async/timeouts:
use Test::Time;    # fakes time for testing without sleep`,
    },
    {
      lang: "perl",
      caption: "Test::MockModule / Test::MockObject — mocking",
      code: `use Test::MockModule;
use Test::MockObject;

# Mock a module's subroutines (in-place, restored at end of scope):
my \$mock = Test::MockModule->new('MyApp::HTTP');
\$mock->mock('get', sub {
    my (\$url) = @_;
    return { status => 200, body => 'mocked' } if \$url eq 'http://x';
    return { status => 404 };
});

# Now MyApp::HTTP::get returns the mock for the duration of this test.
is(MyApp::HTTP::get('http://x')->{status}, 200, 'mocked ok');

# Test::MockObject — build an object from scratch:
my \$obj = Test::MockObject->new;
\$obj->mock('name', sub { 'Alice' });
\$obj->mock('age', sub { 30 });
is(\$obj->name, 'Alice', 'mock object name');`,
    },
    {
      lang: "perl",
      caption: "prove — the test runner + harness",
      code: `# Run all .t files in t/:
\$ prove -l t/                # -l adds lib/ to @INC

# Parallel:
\$ prove -j8 -l t/            # 8 workers

# Verbose:
\$ prove -lv t/foo.t          # show each test as it runs

# TAP (Test Anything Protocol) — the output format. Each test prints
# 'ok N - description' or 'not ok N - description'. prove parses it.
# TAP::Harness is the underlying library; Test::More emits TAP.

# Coverage:
\$ cover -test                # Devel::Cover: statement + branch + condition + pod
# Cover report at cover_db/coverage.html`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Perl 5.40 is ~5-10x faster than 5.10 on string ops and regex due to the reengine rewrite; upgrade wins are real.", tag: "version" },
    { fact: "Regex compilation is expensive — qr// precompiles once, reuse it in loops. m// on every iteration recompiles (unless /o, which is deprecated).", tag: "perf" },
    { fact: "@array in scalar context is O(1) (returns the count cached on the array); scalar(@arr) == @arr == \$#arr + 1.", tag: "complexity" },
    { fact: "Hash lookup is O(1) avg, O(n) worst (hash collisions). keys/values are O(n) — they build a list.", tag: "complexity" },
    { fact: "Auto-vivification: \$h{a}{b} = 1 creates \$h{a} as a hashref on demand. Powerful, but a silent perf/memory cost in tight loops checking existence.", tag: "gotcha" },
    { fact: "String concat in a loop: \$s .= \$x is O(n) amortized (Perl grows the buffer geometrically); still beats \$s = \$s . \$x which is O(n^2).", tag: "perf" },
    { fact: "join(',', @parts) is one C-level call — much faster than a \$s .= loop for many parts.", tag: "perf" },
    { fact: "map/grep are faster than equivalent for-loops — they avoid per-iteration scope entry/exit.", tag: "perf" },
    { fact: "Subroutine calls cost ~1-2us in Perl. Inline hot loops instead of calling a sub per element.", tag: "perf" },
    { fact: "Moose is slow to compile (~1s for a large app) but fast at runtime once immutable. Moo skips the metaclass and compiles in ~100ms.", tag: "perf" },
    { fact: "use strict + use warnings have ~0 runtime cost — they're compile-time only.", tag: "perf" },
    { fact: "Devel::NYTProf is the standard profiler — line-level, call-graph, flame graphs. Indispensable.", tag: "perf" },
    { fact: "Regex with /o (compile-once) is deprecated; qr// is the modern equivalent and not deprecated.", tag: "version" },
    { fact: "Pre-5.10, my \$x if \$cond created a static variable (the 'state' bug); 5.10 added state \$x for true statics.", tag: "gotcha" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "cpanm", purpose: "Modern CPAN installer (cpanminus) — fast, dependency-resolving, no config required.", url: "https://metacpan.org/pod/App::cpanminus", category: "package" },
    { tool: "Carton", purpose: "Dependency snapshot manager — cpanfile + cpanfile.snapshot, like Bundler for Perl.", url: "https://metacpan.org/pod/Carton", category: "package" },
    { tool: "cpm", purpose: "Faster parallel CPAN installer — fast resolver, parallel builds. Drop-in cpanm replacement.", url: "https://metacpan.org/pod/App::cpm", category: "package" },
    { tool: "perltidy", purpose: "Code formatter — configurable style; perltidy -pbp enforces Perl Best Practices book style.", url: "https://metacpan.org/pod/Perl::Tidy", category: "lint" },
    { tool: "Perl::Critic", purpose: "Static analysis — policies based on Damian Conway's PBP book, extensible.", url: "https://metacpan.org/pod/Perl::Critic", category: "lint" },
    { tool: "Perl::Tidy + perlcritic.com", purpose: "Online lint — paste Perl code, get perlcritic feedback. Useful for code review.", url: "https://perlcritic.com/", category: "lint" },
    { tool: "Devel::NYTProf", purpose: "Profiling — line-level, call graph, flame graphs. The standard Perl profiler.", url: "https://metacpan.org/pod/Devel::NYTProf", category: "debug" },
    { tool: "Enbugger / perl -d", purpose: "Built-in debugger (perl -d) — step/break/watch. Devel::nytprof and Devel::hdb add web UIs.", url: "https://perldoc.perl.org/perldebug", category: "debug" },
    { tool: "Test::More / Test2", purpose: "Standard testing framework (TAP-based). Test2 is the modern suite, drop-in compat.", url: "https://metacpan.org/pod/Test::More", category: "test" },
    { tool: "prove", purpose: "TAP test runner — parallel, verbose, extensible via TAP::Harness::Plugins.", url: "https://perldoc.perl.org/prove", category: "test" },
    { tool: "Mojolicious", purpose: "Real-time web framework — async I/O, WebSocket, full-stack. The leading modern Perl web stack.", url: "https://mojolicious.org/", category: "build" },
    { tool: "DBI", purpose: "Database independent interface — the standard DB abstraction. DBIx::Class adds an ORM.", url: "https://metacpan.org/pod/DBI", category: "build" },
    { tool: "Plack / PSGI", purpose: "Perl Web Server Gateway Interface — runs any web app on any server. Rack/WSGI equivalent.", url: "https://plackperl.org/", category: "deploy" },
    { tool: "Moo / Moose", purpose: "OO frameworks — Moo is fast/light, Moose is full-featured with metaclass. Pick Moo for new code.", url: "https://metacpan.org/pod/Moo", category: "build" },
    { tool: "Try::Tiny / Feature::try", purpose: "Exception handling — Try::Tiny is the legacy standard; Feature::try (5.34+) is the modern core version.", url: "https://metacpan.org/pod/Try::Tiny", category: "build" },
    { tool: "perlbrew / plenv", purpose: "Per-user Perl installations — manage multiple Perl versions without root.", url: "https://perlbrew.pl/", category: "build" },
    { tool: "Dist::Zilla", purpose: "Release automation — generates Makefile.PL/META.yml, runs tests, uploads to CPAN. Heavy but powerful.", url: "https://metacpan.org/pod/Dist::Zilla", category: "package" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0", year: 1987, highlight: "Larry Wall releases Perl 1.0 to comp.sources.misc — replacing awk/sed scripting glue." },
    { version: "3.0", year: 1989, highlight: "Perl 3 adds binary data handling, the first major adoption wave in sysadmin/CGI." },
    { version: "4.0", year:1991, highlight: "Perl 4 ships with the first Camel book; 'Programming Perl' becomes canonical reference." },
    { version: "5.0", year: 1994, highlight: "Complete rewrite — lexicals (my), references, modules, objects (bless). The modern language is born." },
    { version: "5.6", year: 2000, highlight: "Unicode support, our() declarations, lexical warnings, threads (ithreads model)." },
    { version: "5.10", year: 2007, highlight: "say, state, given/when (switch), // (defined-or), named regex captures. Smartmatch arrives (later discouraged)." },
    { version: "5.12", year: 2010, highlight: "Package version spec, yada-yada operator (...), strict by default in versioned modules." },
    { version: "5.14", year: 2011, highlight: "Unicode 6.0, /r non-destructive substitution, package block syntax." },
    { version: "5.16", year: 2012, highlight: "use v5.16 enables strict + feature bundle; __SUB__ current-sub reference." },
    { version: "5.18", year: 2013, highlight: "Hash randomization (security), lexical subroutines (experimental), given/when deprecated." },
    { version: "5.20", year: 2014, highlight: "Subroutine signatures (experimental), postfix dereference (postderef), slice aliasing." },
    { version: "5.24", year: 2016, highlight: "Postfix dereference stable, no more 'indirect method calls' (\$obj = Class->new) under no indirect." },
    { version: "5.26", year: 2017, highlight: "Indented heredocs, @INC no longer includes '.' (security — CVE-2016-1238)." },
    { version: "5.32", year: 2020, highlight: "isa operator (\$x isa MyClass), chained comparisons (1 < \$x < 10), alpha-regex removed." },
    { version: "5.36", year: 2022, highlight: "Signatures STABLE (no longer experimental), use v5.36 enables strict, given/when removed from feature bundle." },
    { version: "5.40", year: 2024, highlight: "try/catch stable, class/field/method (cor) experimental OO, ^builtin module for core functions." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between my, our, and local?", a: "my creates a lexical variable — block-scoped, not visible outside the block, fastest. our declares a package global by name (so you can use \$Foo::bar as \$bar in this scope while still under strict). local temporarily saves and restores a package variable's value for the dynamic scope (call stack) — it does NOT create a variable, it modifies an existing global temporarily. Use my for everything; our only when you need a global; local only for special variables (\$/, \$\\, \$ENV{...}).", difficulty: "easy" },
    { q: "Explain list vs scalar context.", a: "Every expression in Perl is evaluated in either list or scalar context, decided by the surrounding code. Assignment to an array (@x = ...) is list context; assignment to a scalar (\$x = ...) is scalar. Operators behave differently: localtime() in scalar returns 'Mon Jan 1 12:00:00 2024', in list returns (sec,min,hour,...). Functions use wantarray to detect context. The sigil (@ vs \$) doesn't change context — the LHS does. @arr in scalar context returns the count.", difficulty: "medium" },
    { q: "Why are Perl references necessary, and how do you make a nested data structure?", a: "Lists and hashes in Perl are FLAT — @a = (1, (2, 3)) is (1, 2, 3), not nested. To nest, you need references: a scalar pointing to another array/hash. Create with \\ (\\@arr, \\%h) or anonymous constructors ([...] and {...}). Access with arrow: \$ref->[0], \$ref->{k}, or postfix deref \$ref->@* (5.24+). This is THE mechanism for OO (blessed refs), nested configs, and pass-by-reference.", difficulty: "medium" },
    { q: "What does use strict actually do?", a: "Three things: (1) requires declaration (my/our) before use — catches typos. (2) Disallows symbolic references — \$name = 'foo'; \$\$name = 1 (which would access \$foo) is a runtime error. (3) Disallows bareword access to undefined subroutines. Without strict, \$receipient = \$recipient + 1 silently creates a new undef global. With strict, that's a compile error. Always use strict + warnings in new code.", difficulty: "easy" },
    { q: "How does Perl's OO work?", a: "Perl 5's OO is minimal: a 'class' is just a package, an 'object' is a blessed reference (any ref tagged with a package), and a 'method' is a subroutine whose first argument is the object (or class for class methods). \$obj->method(a, b) calls Package::method(\$obj, a, b). Inheritance via @ISA. Method resolution walks @ISA, then UNIVERSAL. Moo/Moose add attribute generation, type constraints, roles, method modifiers — all built on this base. Perl's OO is famously 'a post hoc bolt-on' but works.", difficulty: "medium" },
    { q: "What's the difference between \$x eq '5' and \$x == '5'?", a: "eq is string equality (byte comparison); == is numeric equality (coerces both to numbers). '5' eq '5' is true; '5' == '5' is also true. But '5.0' eq '5' is FALSE (different strings), while '5.0' == '5' is TRUE (same number). 'abc' == 0 warns and is true (numeric coercion of 'abc' is 0). Always pick the operator matching your intent; perlcritic catches 'numeric eq' / 'string ==' patterns.", difficulty: "easy" },
    { q: "How do you safely handle tainted data (web input)?", a: "Perl has built-in taint mode (-T flag): all external input (ARGV, STDIN, env vars, file reads) is marked 'tainted' and cannot be used in dangerous operations (system, exec, open with '|', eval of strings). To untaint, you must capture via a regex: my (\$clean) = \$tainted =~ /^([\\w.-]+)\$/; — the capture is now untainted. The pattern is YOUR responsibility; a too-permissive pattern defeats the purpose. Taint mode prevents accidental security holes, not deliberate ones.", difficulty: "hard" },
    { q: "Explain the difference between die and warn, and how croak differs from die.", a: "die throws an exception (caught by eval); warn prints to STDERR but continues execution (configurable via \$SIG{__WARN__}). Carp::croak is die that reports from the CALLER's perspective — 'called from line X' points at the caller, not the failing library code. Carp::confess is croak + full stack trace. Always use croak/confess in library code; reserve die for scripts.", difficulty: "medium" },
    { q: "How would you make a long-running Perl process memory-stable?", a: "Common causes of growth: (1) accumulating into a global hash/array without bounds — bound it with a queue or LRU. (2) Closure capture of large lexicals — break the closure or weaken refs. (3) Circular references that the refcount GC can't collect — use Scalar::Util::weaken. (4) Locale::TextDomain / gettext memory leaks in old versions. Use Devel::Gladiator to find leaked SVs, Devel::Cycle to find ref cycles, andps or valgrind for heap growth patterns.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Python", whenThis: "Heavy text/regex one-liners, legacy CGI/sysadmin scripts, BioPerl pipelines, when CPAN modules solve the exact problem.", whenThat: "Modern web services, ML/data science, anything needing a large hiring pool, general-purpose engineering. Python ate most of Perl's domains." },
    { vs: "Ruby", whenThis: "Maintaining existing Perl codebases, one-liner text transforms (perl -pe), CPAN-specific libraries, sysadmin glue on legacy Unix.", whenThat: "Web backends (Rails), DSLs, anything where the team values programmer happiness over terseness. Ruby is the spiritual descendant of Perl's TIMTOWTDI ethos." },
    { vs: "Raku (Perl 6)", whenThis: "Production code, anything needing library support, performance-critical work, hiring.", whenThat: "Research, language-design exploration, async/regex-heavy greenfield projects. Raku is a separate language, not a Perl 5 upgrade — don't conflate them." },
    { vs: "Bash / shell", whenThis: "Anything beyond ~50 lines of shell, multi-line data transforms, when you need real data structures, complex regex.", whenThat: "Tiny glue between Unix commands, sequences of commands with simple control flow. For >100 LOC, reach for Perl or Python instead." },
  ],
};

export default sheet;
