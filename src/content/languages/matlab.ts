import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "matlab",
  name: "MATLAB",
  category: "languages",
  tier: 3,
  tags: ["dynamic", "array-oriented", "numerical", "scientific", "proprietary", "matrix-first", "engineering"],
  tagline: "MathWorks' matrix-first numerical environment — the lingua franca of control systems, signal processing, and academic engineering labs.",
  year: 1984,
  author: "Cleve Moler / MathWorks",

  tldr: [
    "MATLAB ('matrix laboratory') is a dynamically-typed, array-oriented numerical environment and language where every scalar is a 1×1 matrix, every operation broadcasts, and linear algebra is a one-liner (`x = A\\b` solves the least-squares problem).",
    "It dominates control engineering (Simulink, the de-facto industry model-based-design tool), signal processing and DSP hardware workflows (HDL Coder), academic engineering curricula, and large parts of robotics, finance, and aerospace.",
    "Reach for MATLAB when you need Simulink, when you're working with a lab/team that has Toolboxes you'd have to reimplement (Control, Signal, Communications, Robotics, Aerospace), or when matrix-heavy code benefits from vendor-tuned MKL and CUDA.",
    "Avoid MATLAB for general-purpose software: licensing is per-seat and expensive, the language has no real module system, deployment is awkward (MATLAB Compiler bundles a runtime, MEX files require C/C++ glue), and Python/Julia have eaten most of its non-engineering niche.",
  ],

  mentalModel: {
    title: "Vectorize — never write a for-loop you can express as a matrix op",
    body: "MATLAB's design center is the dense matrix of doubles: every variable is at least 2D, `*` is matrix multiplication (use `.*` for elementwise), and `\\` is the linear solve operator. The interpreter is slow on scalar loops and JIT-compiles only since R2013b — so idiomatic code is vectorized: instead of looping over rows of A, you write `mean(A, 2)` for column-wise means and let LAPACK/BLAS do the work. Memory layout is column-major (Fortran-style), so `A(:,j)` is a contiguous slice but `A(i,:)` is strided. Once you internalize 'I'm writing linear algebra, not a program', most of the language's quirks — 1-indexing, `end` as an index, implicit broadcasting — fall into place.",
  },

  constructs: [
    { syntax: "A = rand(3, 4);  % 3x4 matrix", behavior: "Every variable is a 2D array; a scalar is 1x1, a vector is 1xN or Nx1.", when: "All data — there are no scalar primitives." },
    { syntax: "x = A * b;  y = A .* B;", behavior: "`*` is matrix multiply; `.*` is elementwise. All operators have a `.` elementwise variant.", when: "The most common bug for newcomers — picking the wrong one silently does the wrong linear algebra." },
    { syntax: "x = A \\ b;", behavior: "Backslash — solves Ax = b via LU/QR/SVD depending on shape and conditioning; this is THE MATLAB operator.", when: "Linear systems, least squares. Never invert explicitly with `inv(A) * b`." },
    { syntax: "A(:, 2:end)", behavior: "All rows, columns 2 through the end — `end` is a valid index expression.", when: "Slicing; `:` alone means 'all of this dimension'." },
    { syntax: "[m, n] = size(A);  v = numel(A);", behavior: "`size` returns dimensions; `numel` is total element count.", when: "Code that branches on array shape — common in library functions." },
    { syntax: "f = @(x) x.^2 + 1;", behavior: "Anonymous function (closure) — first-class, can be passed to quadgk, arrayfun, etc.", when: "Short callbacks; prefer over a file-based function for one-liners." },
    { syntax: "function [y, z] = f(x)", behavior: "Function with multiple return values; called as `[a, b] = f(in)`.", when: "All reusable code goes in .m files; one function per file unless nested." },
    { syntax: "try; ...; catch ME; disp(ME.message); end", behavior: "Exception catch — `ME` is an MException with .identifier, .message, .stack.", when: "Boundary code; throw with `error('pkg:tag', 'msg')`." },
    { syntax: "parfor i = 1:N; ...; end", behavior: "Parallel for-loop over a pool of workers (Parallel Computing Toolbox).", when: "Embarrassingly parallel sweeps; requires `parpool` to be started." },
    { syntax: "A(A > 0) = 0;", behavior: "Logical indexing — assigns 0 to every positive element of A.", when: "Masking, filtering — extremely common in numerical code." },
    { syntax: "classdef Foo < handle", behavior: "Class definition inheriting from handle (reference semantics) or value (copy semantics).", when: "OOP — newer code uses packages (`+pkg`) and classdef; legacy code uses @-directories." },
    { syntax: "x = zeros(N, 'like', A);", behavior: "Allocate with the same dtype (single/double/gpuArray) as A — 'like' idiom for generic code.", when: "Code that must work for single/double/gpu/quantized without branching." },
  ],

  patterns: [
    {
      lang: "matlab",
      caption: "Vectorized least-squares fit — no loops, no inv()",
      code: `% Fit y = a + b*x + c*x^2 to noisy data.
rng(0);
x = linspace(0, 1, 1000)';
y_true = 1 + 2*x + 3*x.^2;
y = y_true + 0.05 * randn(size(x));

% Design matrix; backslash solves least squares via QR.
X = [ones(size(x)), x, x.^2];
theta = X \\ y;             % == pinv(X)*y but faster & stabler

% Residual and goodness-of-fit.
resid = y - X * theta;
rmse  = sqrt(mean(resid.^2));
fprintf("theta = [%.4f %.4f %.4f]  rmse=%.4f\\n", theta, rmse);

% Equivalent (and slower) loop-based code would be ~50-100x slower.`,
    },
    {
      lang: "matlab",
      caption: "Logical indexing + broadcasting — the MATLAB idiom",
      code: `% Replace outliers with the median, per column.
A = randn(1e6, 4);
A(1:10, 1) = 100;    % inject outliers

med = median(A, 1);  % 1x4 row vector of column medians

% Broadcasting (R2016b+): A > 3*std(A,1) is logical same-size as A.
mask = abs(A - med) > 3 * std(A, 0, 1);   % 0 = sample std, 1 = population
A(mask) = repmat(med, size(A,1), 1)(mask);

% Pre-2016b required bsxfun:
%   mask = abs(bsxfun(@minus, A, med)) > 3 * bsxfun(@std, A, 0);
fprintf("replaced %d outliers\\n", nnz(mask));`,
    },
    {
      lang: "matlab",
      caption: "Function with multiple returns + nargin / nargout",
      code: `function [mean_v, std_v, n] = stats(x, flag)
%STATS Return mean, std, count of a vector.
%   [m, s, n] = stats(x)        -> sample std
%   [m, s, n] = stats(x, 0)     -> population std (default)
    if nargin < 2; flag = 0; end
    if ~isvector(x); x = x(:); end

    mean_v = mean(x);
    switch flag
        case 0; std_v = std(x, 1);    % population
        case 1; std_v = std(x, 0);    % sample
        otherwise; error('stats:badFlag', 'flag must be 0 or 1');
    end
    if nargout < 2; mean_v = mean_v; end   % caller asked for one output
end`,
    },
    {
      lang: "matlab",
      caption: "parfor with reduction — parallel parameter sweep",
      code: `% Needs Parallel Computing Toolbox; starts workers on first use.
N = 1e4;
results = zeros(N, 1);

parfor i = 1:N
    p = 0.5 + 0.001 * i;
    % Body must be iteration-independent: no cross-iteration reads.
    sim = simulate_system(p);
    results(i) = max(abs(sim));    % indexed assignment is OK
end

% Reductions (sum, max, min, concat) are supported explicitly:
best_p = 0; best_v = -inf;
parfor i = 1:N
    v = results(i);
    if v > best_v
        best_v = v; best_p = i;    % reduction: MATLAB handles the race
    end
end
fprintf("best p=%.3f v=%.3f\\n", 0.5 + 0.001*best_p, best_v);`,
    },
  ],

  pitfalls: [
    {
      title: "1-indexed arrays — every C/Python/JS port is wrong",
      symptom: "Code like `for i = 0:N-1` then `A(i)` throws `Index exceeds matrix dimension` because index 0 doesn't exist; C-ported loops are off by one in subtle ways.",
      fix: "Index from 1. For zero-based math, write `x(i+1) = f(i)` and document the convention. Don't fight it — the language will not bend.",
    },
    {
      title: "`*` is matrix multiply, not elementwise",
      symptom: "Writing `a * b` where `a` and `b` are vectors of equal length silently returns a 1x1 scalar (inner product), or errors with 'Inner matrix dimensions must agree' — the operation is well-defined, just not what you meant.",
      fix: "Use `.*`, `./`, `.^` for elementwise. Reserve `*` and `/` (`\`) for actual linear algebra. The error message 'matrix dimensions must agree' usually means a missing dot.",
    },
    {
      title: "Column-major iteration order",
      symptom: "Looping `for i = 1:size(A,1); for j = 1:size(A,2); ... A(i,j) ... end; end` walks memory non-contiguously — a 10000×10000 matrix becomes 100× slower due to cache misses.",
      fix: "Swap loop order so the FIRST index is innermost (column-major), or vectorize away the loop entirely. `arrayfun` / `vecfun` do NOT vectorize; they're sugar over a loop.",
    },
    {
      title: "Implicit expansion vs bsxfun across versions",
      symptom: "`rand(3,1) + rand(1,3)` works in R2016b+ (returns 3×3) but errors in older releases. Code written for new MATLAB breaks on lab machines with older versions.",
      fix: "Use `bsxfun(@plus, rand(3,1), rand(1,3))` for portability. Document the minimum MATLAB version in your README; R2016b is the implicit expansion boundary.",
    },
    {
      title: "Strings vs char arrays",
      symptom: "`\"hello\"` (double-quoted, since R2016b) is a `string` object; `'hello'` (single-quoted) is a `char` array. Comparing them with `==` returns a logical array, not a scalar; mixing them in a cell array breaks downstream code.",
      fix: "Pick one convention per project. `strcmp`, `strcmpi`, `strcontains` work for both; `==` is elementwise on char arrays, scalar on string objects. Convert with `string()` and `char()`.",
    },
    {
      title: "Handle vs value classes — copy semantics flip",
      symptom: "A `value` class instance copies on assignment (`b = a; b.x = 5; % a.x unchanged`). A `handle` subclass instance shares state (`b = a; b.x = 5; % a.x is now 5`). Beginners mix them and get spooky-action-at-a-distance bugs.",
      fix: "Inherit from `handle` only when you genuinely want reference semantics (resources, GUI objects, loggers). Default to value classes — they're easier to reason about and parallelize.",
    },
    {
      title: "Saving .mat files in new format breaks old MATLAB",
      symptom: "`save('x.mat')` defaults to `-v7.3` (HDF5-based) on recent releases; MATLAB R2006a and earlier cannot read it, and many third-party readers (scipy < 1.7, Octave < 4.2) choke.",
      fix: "Explicitly `save('x.mat', '-v7')` for cross-tool compatibility; use `-v6` for max compatibility (no compression, no >2GB). Document the version on the file.",
    },
  ],

  quickReference: [
    { fact: "Current release: R2024a/b (March/September cadence). LTS-equivalent is whatever the institution has licensed — code must target R2018b+ to be safe in academia.", tag: "version" },
    { fact: "JIT acceleration arrived in R2013b; before that, loops were 100-1000x slower than vectorized code. Modern MATLAB loops are fast but vectorization still wins on cache.", tag: "perf" },
    { fact: "Arrays are column-major (Fortran order); `A(:,j)` is contiguous, `A(i,:)` is strided by N elements. Loop with column index outermost.", tag: "perf" },
    { fact: "Implicit expansion (broadcasting) since R2016b — replaces most `bsxfun` calls. `rand(3,1) + rand(1,3)` returns a 3x3 matrix.", tag: "version" },
    { fact: "`A\\b` uses LAPACK: LU for square, QR for non-square, SVD-ish pseudoinverse for rank-deficient. ~10x faster and 10x more accurate than `inv(A)*b`.", tag: "perf" },
    { fact: "Strings (double-quote) since R2016b are first-class string objects; char arrays (single-quote) are arrays of characters. They are NOT the same type.", tag: "version" },
    { fact: "Tables and timetables (R2013b / R2016b) are the modern data-frame type; dataset arrays are deprecated.", tag: "version" },
    { fact: "MEX files (compiled C/C++ via `mex`) bypass the interpreter for hot loops; still useful, but JIT has narrowed the gap to <2x for most code.", tag: "perf" },
    { fact: "Parallel Computing Toolbox provides `parfor`, `parfeval`, `spmd`. GPU support via `gpuArray` requires an NVIDIA GPU and the Parallel toolbox.", tag: "version" },
    { fact: "Toolboxes are licensed separately — Statistics and Machine Learning, Control System, Signal Processing, Image Processing are the most common. Check `ver` for what's installed before relying on a function.", tag: "gotcha" },
    { fact: "`tall` arrays scale to out-of-core data; `datastore` is the iteration primitive. Both require Parallel Computing Toolbox.", tag: "perf" },
    { fact: "Live Editor (.mlx) is the notebook format; .m files are plain scripts/functions. .mlx is binary — diff/merge is poor, prefer .m for version control.", tag: "style" },
    { fact: "Naming: function/file names lowercase with underscores; class names CamelCase; constants UPPER_CASE. Function name MUST match file name.", tag: "style" },
    { fact: "`onCleanup` is the RAII pattern: `c = onCleanup(@() fclose(fh));` guarantees the filehandle closes on function exit, even on error.", tag: "style" },
    { fact: "Octave is the open-source clone — supports ~85% of MATLAB syntax, lacks Simulink and most Toolboxes. Test with `--no-gui` for portability checks.", tag: "version" },
  ],

  goDeeper: [
    { title: "MATLAB Documentation — MathWorks", url: "https://www.mathworks.com/help/matlab/", note: "Authoritative reference; the 'Language Fundamentals' and 'Performance' sections cover 80% of daily need." },
    { title: "MATLAB Onramp & Free Tutorials", url: "https://matlabacademy.mathworks.com/", note: "Free interactive 2-hour intro from MathWorks — the fastest way to internalize vectorization." },
    { title: "Numerical Computing with MATLAB (Cleve Moler)", url: "https://www.mathworks.com/moler/", note: "Free book by MATLAB's author — explains the linear algebra design center and the LINPACK/EISPACK roots." },
    { title: "MATLAB Style Guidelines (Richard Johnson)", url: "https://www.mathworks.com/matlabcentral/fileexchange/46056-matlab-style-guidelines-2-0", note: "Community style guide on File Exchange; covers naming, file layout, performance." },
    { title: "MATLAB Central — File Exchange & Answers", url: "https://www.mathworks.com/matlabcentral/", note: "Two decades of community-contributed code and Q&A; the de-facto StackOverflow for MATLAB." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "double (8 bytes)", behavior: "IEEE 754 double — the DEFAULT numeric type. Every literal (1, 3.14) is double unless 'single' suffix.", when: "All numerics by default. Most LAPACK/BLAS routines target double." },
      { syntax: "single (4 bytes)", behavior: "IEEE 754 single — use for memory-constrained or GPU code. Auto-promoted when mixed with double.", when: "Large arrays where memory bandwidth dominates; gpuArray often faster in single." },
      { syntax: "int8/16/32/64, uint8/16/32/64", behavior: "Fixed-size integers — saturating arithmetic (NOT modular like C).", when: "Image data (uint8), packed bytes, FFI. Saturating means uint8(255)+1 == 255, not 0." },
      { syntax: "logical", behavior: "Boolean — true=1, false=0. Stored as 1 byte (not bit-packed).", when: "Masks, conditions. Logical indexing: A(A > 0) = 0 zeros positive elements." },
      { syntax: "char", behavior: "Character array — 'hello' is a 1x5 char. NOT a string object.", when: "Legacy text. Modern code uses string() for first-class strings." },
      { syntax: "string", behavior: "First-class string object (R2016b+) — \"hello\". Array of strings is a 1xN string array.", when: "All new text code. string() supports padding, joining, regex without cellfun." },
      { syntax: "cell", behavior: "Cell array — a container holding heterogeneous values. {1, 'a', [1 2]} is 1x3.", when: "Heterogeneous data, varargs, strings-as-list. cell{1,2} = 'foo'; access via {1,2} (cell) or (1,2) (cell-of-cell)." },
      { syntax: "struct", behavior: "Struct array — record with named fields. s.name, s(2).age. Field names must be valid identifiers.", when: "Records, configs. struct('a',1,'b',2) or s.a = 1; s.b = 2." },
      { syntax: "function_handle (@)", behavior: "Closure — @(x) x^2. First-class, can be passed to quadgk, arrayfun, fminsearch.", when: "Callbacks, numerical solvers, partial application." },
      { syntax: "datetime / duration", behavior: "Date and time types — datetime('2024-01-01'), duration in seconds/hours/days.", when: "Time series, log analysis. Replaces the old datenum/double convention." },
    ],
    collections: [
      { syntax: "matrix (2D double)", behavior: "The fundamental type — every numeric is at least 2D; a scalar is 1x1.", when: "All numerics. Operations broadcast elementwise (R2016b+) or use bsxfun (older)." },
      { syntax: "N-D array", behavior: "N-dimensional dense array — A(:,:,3) is the 3rd page of a 3D array. Column-major.", when: "Volumetric data, image stacks, multi-channel signals." },
      { syntax: "cell array", behavior: "Container of cells — each cell holds any MATLAB value. Curly-brace access for contents, paren for cell-ref.", when: "Heterogeneous data, varargs, replacing string arrays (legacy). Slower than matrix ops." },
      { syntax: "string array", behavior: "1xN array of string objects — handles missing via <missing>. String concat with +.", when: "Modern text. Most string functions return string arrays, not char arrays." },
      { syntax: "struct array", behavior: "Array of structs with same fields — s(1).name, s(2).name. Index access via s(i).", when: "Tabular data without tables; legacy records." },
      { syntax: "table / timetable", behavior: "Data-frame-like — columns of different types, named. timetable adds row timestamps.", when: "Modern data analysis. readtable, groupby, join, varfun operate on tables." },
      { syntax: "categorical", behavior: "Categorical array — finite set of labels, optionally ordered. Memory-efficient vs string.", when: "Survey responses, enums, group labels. categories() lists unique values." },
      { syntax: "Map (containers.Map)", behavior: "Hash map — keys can be any scalar (char, double, etc.). Distinct from struct (named fields only).", when: "Arbitrary-key lookup, late-bound key names. Slower than struct, more flexible." },
      { syntax: "tall array", behavior: "Out-of-core array — computed lazily via Parallel Computing Toolbox. gather() to materialize.", when: "Datasets too large for RAM. Backed by datastores (file-based chunking)." },
    ],
    custom: [
      { syntax: "classdef Foo < handle", behavior: "Class definition — handle = reference semantics (mutate via ref). Default (value) copies on assignment.", when: "All OO. Files go in @Foo/ directory or single file with classdef." },
      { syntax: "classdef Foo < Base & I1", behavior: "Multiple inheritance — base class first, then interfaces. Rare in idiomatic MATLAB.", when: "When genuinely needed; prefer composition." },
      { syntax: "properties (SetAccess = protected)", behavior: "Property with restricted mutability — SetAccess=public/private/protected.", when: "Read-only public APIs; subclass-only mutation." },
      { syntax: "methods (Static)", behavior: "Static (class) method — called as Foo.method() without an instance.", when: "Factory methods, utility functions attached to a class." },
      { syntax: "events / notify / addlistener", behavior: "Event system — classes declare events; listeners register callbacks. Observer pattern built-in.", when: "GUIs (App Designer), reactive models, property-change notifications." },
      { syntax: "enumeration block", behavior: "Enum class — fixed set of named instances with associated values.", when: "Closed value sets, typesafe flags. Replaces 'magic strings'." },
      { syntax: "package (+pkg)", behavior: "Namespace directory — +mypkg/Foo.m is mypkg.Foo. Imports via import mypkg.*.", when: "Library organization. Avoids name collisions in large codebases." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "*  (matrix multiply)", behavior: "Linear algebra matrix product — A*B requires size(A,2) == size(B,1).", when: "Actual matrix math. .* for elementwise." },
    { syntax: ".* ./ .^", behavior: "Elementwise ops — broadcast since R2016b. .* is elementwise multiply, NOT matmul.", when: "Per-element math. The dot prefix is the most common MATLAB bug source." },
    { syntax: "\\  (backslash)", behavior: "Linear solve — A\\b solves Ax = b via LU (square), QR (rect), or pseudoinverse. ~10x faster than inv(A)*b.", when: "Linear systems, least squares. THE MATLAB operator; never use inv()." },
    { syntax: "/  (forward slash)", behavior: "Right matrix division — x = b/A solves xA = b. Less common than \\.", when: "When you need to solve from the right. Elementwise: ./." },
    { syntax: "+, -, '", behavior: "Add/subtract (elementwise), and ' = transpose (CONJUGATE for complex). .' = non-conjugate transpose.", when: "Math. Watch: A' conjugates; use A.' for plain transpose." },
    { syntax: "^  (matrix power)", behavior: "A^2 = A*A (matrix product). .^ for elementwise power.", when: "Matrix powers. .^ for elementwise." },
    { syntax: "==, ~=", behavior: "Elementwise equality — returns same-size logical array. ~= is not-equal.", when: "Array comparison. Use isequal(a, b) for scalar truth; all(a == b) for arrays." },
    { syntax: "<, >, <=, >=", behavior: "Elementwise comparison — returns logical array same size as inputs.", when: "Build masks: A(A > 5) = 0. Broadcasting works since R2016b." },
    { syntax: "&&, ||", behavior: "Short-circuit AND/OR — SCALAR operands only. Use for if-conditions.", when: "Control flow. Don't use on arrays — error." },
    { syntax: "&, |", behavior: "Elementwise AND/OR — works on logical arrays. ~ is NOT.", when: "Combining masks: mask = (A > 0) & (A < 10)." },
    { syntax: ":", behavior: "Range / colon operator — 1:10 is [1 2 ... 10]; 1:2:10 is [1 3 5 7 9].", when: "Ranges, slicing. A(:, 2) is all rows, col 2. A(:) flattens column-major." },
    { syntax: "end", behavior: "Last index in a dimension — A(end, :) is the last row. A(end-1:end, :) is the last 2.", when: "Indexing without size(A,1). Also closes for/while/if/function/classdef blocks." },
    { syntax: "(), {}", behavior: "Parentheses: indexing OR function call. Curly braces: cell content access OR cell literal {1, 'a'}.", when: "Indexing. {} for cells, () for arrays/structs/tables. Mixing = common bug." },
    { syntax: "@", behavior: "Function handle — @(x) x^2 creates an anonymous function. @sin is a handle to the named function sin.", when: "Callbacks to ode45, quadgk, arrayfun, fminsearch. First-class function values." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "matlab",
      caption: "File I/O — readmatrix / writematrix / load",
      code: `% Modern text/CSV I/O (R2019a+):
A = readmatrix('data.csv');           % auto-detect delimiter, header
T = readtable('data.csv');            % table with column names

writematrix(A, 'out.csv');            % write CSV
writetable(T, 'out.csv');             % preserve column names

% .mat files — MATLAB's native binary. Use '-v7.3' for >2GB.
save('state.mat', 'A', 'B');          % saves A and B variables
load('state.mat');                    % loads into current workspace
save('state.mat', '-v7.3');           % HDF5-based, supports >2GB

% Legacy textread / dlmread — replaced by readmatrix.
% For unstructured text, use fileread + string ops or regexp.`,
    },
    {
      lang: "matlab",
      caption: "Streaming file with textscan",
      code: `% textscan gives you the most control over parsing mixed text+numeric.
fid = fopen('data.txt');
if fid < 0; error('could not open'); end

% Format spec: %f float, %d int, %s string, %q quoted string, %*s skip
data = textscan(fid, '%f %f %s %d', ...
                'Delimiter', ',', ...
                'HeaderLines', 1, ...
                'TreatAsEmpty', {'NA', ''});
fclose(fid);   % ALWAYS close — wrap with onCleanup for safety

% data is a 1xN cell array of columns:
x = data{1}; y = data{2}; labels = data{3}; flags = data{4};

% onCleanup guarantees fclose even on error:
fid = fopen('data.txt');
c = onCleanup(@() fclose(fid));
data = textscan(fid, '%f %f');
% fid closes when 'c' goes out of scope, even on error.`,
    },
    {
      lang: "matlab",
      caption: "JSON via jsonencode / jsondecode (R2016b+)",
      code: `% Encode: MATLAB value -> JSON string.
% Structs encode as objects, cell/string arrays as JSON arrays.
s = struct('name', 'ada', 'age', 42, 'tags', {{'a', 'b'}});
json = jsonencode(s, 'PrettyPrint', true);

% Decode: JSON string -> struct/cell.
back = jsondecode(json);
back.name    % 'ada'
back.tags{1} % 'a'

% Pitfalls:
%   * Cell arrays encode as JSON arrays. {{'a','b'}} (cell of cells) for array of strings.
%   * NaN / Inf encode as 'NaN' / 'Infinity' (non-standard JSON).
%   * Empty [] encodes as '[]' (array), even if intended as missing object.

% HTTP via weboptions + webread (R2014b+):
opts = weboptions('Timeout', 10, 'ContentType', 'json');
data = webread('https://api.example.com/v1/users', opts);`,
    },
    {
      lang: "matlab",
      caption: "HDF5 / NetCDF — large scientific data",
      code: `% HDF5 is the recommended format for large numeric arrays (GB+).
% MATLAB has built-in h5read / h5write + low-level H5.* API.

% Write a 2D array to HDF5:
h5create('data.h5', '/matrix', [1000 1000]);
h5write('data.h5', '/matrix', rand(1000, 1000));

% Read part of it (slice without loading whole file):
chunk = h5read('data.h5', '/matrix', [1 1], [100 100]);

% NetCDF (common in climate/ocean science):
ncid = netcdf.open('model.nc', 'NC_NOWRITE');
temp = netcdf.getVar(ncid, netcdf.inqVarID(ncid, 'temperature'));
netcdf.close(ncid);

% These formats preserve dimensions, attributes, and metadata — far
% better than .mat for cross-tool scientific workflows.`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "matlab",
      caption: "for / while — and the vectorization imperative",
      code: `% for loop:
for i = 1:length(xs)
    y(i) = xs(i)^2;
end

% while:
i = 1;
while i <= length(xs) && xs(i) >= 0
    i = i + 1;
end

% PREFER VECTOR FORM — 10-100x faster on numeric arrays:
y = xs .^ 2;          % elementwise power, no loop

% For column-wise ops, use mean(A, 2), sum(A, 1), etc.:
col_means = mean(A, 1);    % 1xN row of column means
row_means = mean(A, 2);    % Nx1 column of row means

% arrayfun is NOT vectorization — it's a loop with function-call overhead.
% Use only for genuinely per-element logic that can't vectorize.`,
    },
    {
      lang: "matlab",
      caption: "Logical indexing — the MATLAB idiom",
      code: `% Masks are logical arrays the same shape as A.
A = randn(1000, 4);

% Replace negatives with 0:
A(A < 0) = 0;

% Extract rows where column 1 > 0.5:
mask = A(:, 1) > 0.5;     % 1000x1 logical
sub = A(mask, :);          % rows where mask is true

% Multi-condition mask:
outliers = (abs(A) > 3) & isfinite(A);
A(outliers) = NaN;         % mark for later nanmean

% any() / all() reduce along a dimension:
rows_with_negative = any(A < 0, 2);   % Nx1 logical
all_positive = all(A > 0, 'all');     % scalar

% find() returns indices — slower than direct logical indexing.
% Prefer A(mask) over A(find(mask)).`,
    },
    {
      lang: "matlab",
      caption: "Cell array iteration + cellfun",
      code: `cells = {'apple', 'banana', 'cherry'};

% Iterate with for:
for i = 1:length(cells)
    fprintf("%s\\n", cells{i});
end

% cellfun applies a function to each cell:
lengths = cellfun(@length, cells);            % [5 6 6]
uppers  = cellfun(@(s) upper(s), cells, 'UniformOutput', false);

% 'UniformOutput', false (or 'UniformOutput', 0) wraps results in a cell
% when outputs are heterogeneous or non-scalar.

% Modern string arrays (R2016b+) are simpler:
strs = ["apple", "banana", "cherry"];
lengths = strlength(strs);                    % [5 6 6] — vectorized!
uppers  = upper(strs);                        % vectorized

% Prefer string arrays over cell arrays of char for new text code.`,
    },
    {
      lang: "matlab",
      caption: "parfor — parallel for-loop",
      code: `% Requires Parallel Computing Toolbox. Starts parpool on first use.
N = 10000;
results = zeros(N, 1);

parfor i = 1:N
    p = 0.5 + 0.001 * i;
    sim = simulate(p);
    results(i) = max(abs(sim));   % indexed assignment OK
end

% Rules:
%   * Body must be iteration-INDEPENDENT — no cross-iteration reads.
%   * Reductions (sum, max, min, [a; b]) supported via special syntax.
%   * Classification: sliced vars (indexed by i only) are fastest.
%
%   % Reduction example:
%   total = 0;
%   parfor i = 1:N
%       total = total + compute(i);
%   end

% Use parfeval + afterEach for non-blocking parallel work (R2013b+).`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "matlab",
      caption: "Function file + multiple outputs + nargin/nargout",
      code: `function [mean_v, std_v, n] = stats(x, flag)
%STATS Mean, std, count of a vector.
%   [m] = stats(x)              -> just mean
%   [m, s] = stats(x)           -> mean and population std (default)
%   [m, s, n] = stats(x, 1)     -> mean, sample std, count

% nargin = # args actually passed; nargout = # outputs requested.
if nargin < 2; flag = 0; end
if ~isvector(x); x = x(:); end

mean_v = mean(x);
switch flag
    case 0; std_v = std(x, 1);      % population
    case 1; std_v = std(x, 0);      % sample
    otherwise; error('stats:badFlag', 'flag must be 0 or 1');
end
n = numel(x);
end

% Caller can request 1, 2, or 3 outputs:
m = stats(randn(100,1));          % just mean
[m, s] = stats(randn(100,1));     % mean, std
[m, s, n] = stats(randn(100,1), 1);`,
    },
    {
      lang: "matlab",
      caption: "Anonymous functions + closures",
      code: `% @(args) expr — anonymous function (closure).
square = @(x) x .^ 2;
square(5)            % 25
square(1:5)          % [1 4 9 16 25] — vectorized

% Closures capture workspace variables:
function f = make_adder(n)
    f = @(x) x + n;
end

add5 = make_adder(5);
add5(10)             % 15

% Use as callbacks to numerical solvers:
f = @(x) x.^2 - 2;
root = fzero(f, 1);  % finds x where f(x) = 0

% Integration:
quadgk(@(x) sin(x) ./ x, 0, 1)   % numerical integral

% Function handles can be stored in arrays via cell:
fns = {@sin, @cos, @tan};
for i = 1:length(fns); fns{i}(0); end`,
    },
    {
      lang: "matlab",
      caption: "Nested functions + private/workspaces",
      code: `function outer(x)
% Outer function's locals are visible to nested functions.
counter = 0;

    function inner(y)
        counter = counter + y;   % modifies outer's counter
    end

    inner(x);
    inner(x);
    fprintf("counter = %d\\n", counter);
end

% Nested functions have read-write access to enclosing workspace.
% Use for stateful callbacks, accumulators, custom iterators.

% Subfunctions (in same file) — only visible within the file:
function [a, b] = compute(x)
    a = helper1(x);
    b = helper2(x);
end

function r = helper1(x); r = x + 1; end
function r = helper2(x); r = x * 2; end

% Private functions live in private/ subdir — visible to parent dir only.`,
    },
    {
      lang: "matlab",
      caption: "Varargin / varargout — variable arguments",
      code: `function result = plot_all(x, y, varargin)
%PLOT_ALL Plot with optional name/value pairs.
%   plot_all(x, y, 'Color', 'r', 'LineWidth', 2)

% varargin is a cell array of trailing args.
plot(x, y, varargin{:});   % splat into the call

% Name/value parsing — modern (R2021a+) pattern:
opt = arguments
    x (1,:) double
    y (1,:) double
    Color (1,3) double = [0 0 1]
    LineWidth double = 1
end

% Pre-R2021a: parse with inputParser (verbose but flexible):
p = inputParser;
addRequired(p, 'x', @isnumeric);
addParameter(p, 'Color', [0 0 1], @(c) numel(c)==3);
parse(p, x, y, varargin{:});
color = p.Results.Color;`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "matlab",
      caption: "try / catch / ME (MException)",
      code: `try
    data = readmatrix(path);
    process(data);
catch ME
    % ME is an MException object with .identifier, .message, .stack.
    if strcmp(ME.identifier, 'MATLAB:readmatrix:FileNotFound')
        warning('file not found: %s', path);
        data = [];
    elseif contains(ME.message, 'delimiter')
        rethrow(ME);   % propagate unknown errors
    else
        % Add context and re-throw:
        ME_new = MException('myapp:loadfailed', 'Failed to load %s: %s', ...
                            path, ME.message);
        ME_new.cause = ME;       % chain
        throw(ME_new);
    end
end

% error() throws; warning() doesn't.
% error('pkg:tag', 'message with %s', arg) is the canonical form.`,
    },
    {
      lang: "matlab",
      caption: "Input validation — arguments block (R2021a+)",
      code: `function out = process(data, mode)
%PROCESS Do something with data.
arguments
    data (:,:) double              % 2D double matrix, any size
    mode (1,1) string {mustBeMember(mode, ["fast", "slow"])} = "fast"
end

% The arguments block runs BEFORE the function body.
% Validators: mustBeNumeric, mustBeNonempty, mustBePositive, etc.
% Custom validators: mustBeGreaterThan(x, 0) defined as function.

switch mode
    case "fast"; out = quick_algo(data);
    case "slow"; out = precise_algo(data);
end
end

% Pre-R2021a: validateattributes(data, {'double'}, {'2d', 'nonempty'});
% Modern arguments blocks are cleaner and auto-generate help text.`,
    },
    {
      lang: "matlab",
      caption: "onCleanup — RAII for resource safety",
      code: `% onCleanup runs its function when the cleanup object is destroyed
% (goes out of scope, even on error or return).

function data = load_safely(path)
    fid = fopen(path, 'r');
    if fid < 0; error('load_safely:open', 'cannot open %s', path); end

    % Ensure fclose runs no matter what:
    cleaner = onCleanup(@() fclose(fid));

    data = textscan(fid, '%f %f');
    % If textscan throws, cleaner destructor runs fclose(fid) automatically.
    % No explicit fclose needed.
end

% Pattern works for any cleanup: figure close, timer stop, db disconnect.
% Assign to a variable so it lives until function exit.`,
    },
    {
      lang: "matlab",
      caption: "Returning errors as values vs throwing",
      code: `% Convention: throw() for unexpected errors; return [] or NaN for
% expected 'no result' cases (data missing, search not found).

function idx = find_first(A, target)
    idx = find(A == target, 1, 'first');
    if isempty(idx)
        idx = NaN;     % caller checks isnan(idx), NOT error
    end
end

% For more structured errors, return a struct or use a status flag:
function [ok, result, errmsg] = safe_compute(x)
    if x < 0
        ok = false; result = []; errmsg = 'negative input';
        return;
    end
    ok = true; result = sqrt(x); errmsg = '';
end

% Most MATLAB code uses try/catch + error() — the 'return status' style
% is rare outside C-FFI glue.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "matlab",
      caption: "parfor — parallel for-loop (Parallel Computing Toolbox)",
      code: `% parpool starts on first parfor use. Check it:
if isempty(gcp('nocreate')); parpool; end

N = 10000;
results = zeros(N, 1);

parfor i = 1:N
    p = 0.5 + 0.001 * i;
    sim = simulate(p);
    results(i) = max(abs(sim));   % sliced var — fast
end

% Classification rules:
%   * Sliced: results(i) — indexed ONLY by loop var, must be cell/array
%   * Broadcast: read-only inputs, copied to workers
%   * Reduction: total = total + compute(i) — supported via special form
%   * Temporal: cross-iteration reads = ERROR

% Speed up: workers = N CPU cores; data transfer is the bottleneck.`,
    },
    {
      lang: "matlab",
      caption: "parfeval — non-blocking async work",
      code: `% parfeval schedules work on workers, returns a Future immediately.
% fetch/FetchNext blocks for results.

pool = gcp;   % ensure pool is up
futs = cell(1, 10);
for i = 1:10
    futs{i} = parfeval(pool, @simulate, 1, i);   % 1 output
end

% Wait for results as they complete:
results = cell(1, 10);
for i = 1:10
    [idx, res] = fetchNext(futs);
    results{idx} = res;
    fprintf("completed %d\\n", idx);
end

% Use afterEach(fut, @callback) for reactive pipelines.
% parfeval is the building block for streaming/async MATLAB.`,
    },
    {
      lang: "matlab",
      caption: "spmd — single program, multiple data",
      code: `% spmd runs the SAME code on all workers; each has its own data.
% Use labindex and numlabs for rank-aware code.

spmd
    % Each lab has a different slice:
    local_A = A(:, labindex:numlabs:end);
    local_result = sum(local_A, 'all');

    % Communicate (labSend, labReceive, gplus, gcat, gop):
    total = gplus(local_result);   % all-reduce sum
end

% After spmd, 'total' is a Composite — index by worker:
overall = total{1};   % same value on every lab

% Use for: SPMD-style parallel algorithms (FFTs, sorts, domain decomposition).
% parfor is more common; spmd is for explicit control of inter-worker comm.`,
    },
    {
      lang: "matlab",
      caption: "GPU via gpuArray — CUDA without C",
      code: `% Requires Parallel Computing Toolbox + NVIDIA GPU.
A = gpuArray(rand(10000));     % allocate on GPU
B = gpuArray(rand(10000));

% All ops run on GPU via cuBLAS / cuRAND:
C = A * B;                     % matmul on GPU
D = A .* B;                    % elementwise on GPU
s = sum(C, 'all');             % reduction on GPU

% Bring back to CPU:
C_cpu = gather(C);

% Pitfalls:
%   * CPU<->GPU transfer is slow (~1-10ms per gather) — batch work.
%   * Single precision (single) often 2x faster than double on consumer GPUs.
%   * Use arrayfun(@ker, A, B) for elementwise custom kernels — JIT'd to CUDA.
%   * gpuDevice shows your GPU; gpuDeviceCount for multi-GPU.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "matlab",
      caption: "MATLAB Unit Test Framework — stdlib",
      code: `% File: test_add.m
classdef test_add < matlab.unittest.TestCase
    methods (Test)
        function testBasic(testCase)
            testCase.assertEqual(add(1, 2), 3);
            testCase.assertGreaterThan(add(1, 2), 2);
        end

        function testError(testCase)
            testCase.assertError(@() add('a', 1), 'MATLAB:badtype');
        end

        function testFloat(testCase)
            testCase.assertAlmostEqual(0.1 + 0.2, 0.3, 'AbsTol', 1e-10);
        end
    end
end

% Run from CLI:
%   results = runtests('test_add');
%   disp(table(results));

% Or use function-based tests:
function tests = mytests
    tests = functiontests(localfunctions);
end
function testBasic(testCase); testCase.assertEqual(add(1,2), 3); end`,
    },
    {
      lang: "matlab",
      caption: "Test fixtures — setup/teardown",
      code: `classdef test_db < matlab.unittest.TestCase
    properties
        Conn
    end

    methods (TestMethodSetup)
        function setup(testCase)
            testCase.Conn = connect('test.db');
            % Auto-cleanup: addTeardown runs after each test method.
            testCase.addTeardown(@() close(testCase.Conn));
        end
    end

    methods (Test)
        function testInsert(testCase)
            insert(testCase.Conn, 'users', {1, 'ada'});
            testCase.assertEqual(count(testCase.Conn, 'users'), 1);
        end
    end
end

% TestMethodSetup + addTeardown run per test method.
% SharedTestFixture for once-per-class setup.`,
    },
    {
      lang: "matlab",
      caption: "Mocking with matlab.mock.TestCase",
      code: `function test_fetch(testCase)
    testCase = matlab.mock.TestCase.forInteractiveUse;

    % Create a mock of a class:
    [mock, behavior] = testCase.createMock('AddedMethods', 'fetch');

    % Define behavior: when fetch('http://x') is called, return 'data'.
    testCase.assignOutputsToMock(behavior.fetch('http://x'), 'data');

    % Call code that uses the mock:
    result = my_app_fetch(mock, 'http://x');
    testCase.assertEqual(result, 'data');

    % Verify the mock was called with specific args:
    testCase.assertCalled(behavior.fetch('http://x'));
end

% Mocking is in matlab.mock.* since R2015a. Useful for testing code
% that depends on slow/external systems (DB, network, hardware).`,
    },
    {
      lang: "matlab",
      caption: "Performance testing + CI",
      code: `% Performance test using matlab.perftest:
classdef perftest_sort < matlab.perftest.TestCase
    methods (Test)
        function testSort(testCase)
            arr = rand(10000, 1);
            testCase.measureRepeatedly(@() sort(arr), 'NumIterations', 20);
        end
    end
end

% Run with: runperf('perftest_sort')
% Produces statistics: mean, median, stddev — flags regressions.

% CI: GitHub Actions or GitLab CI with matlab-actions/setup-matlab@v2
% Continuous integration runs runtests('tests/') on every push.
% Code coverage via matlab.unittest.plugins.CodeCoveragePlugin.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "JIT (R2013b+) closes most loop-vs-vector gaps; modern MATLAB loops are within 2x of vectorized for most numeric ops, but vectorize still wins for cache locality.", tag: "perf" },
    { fact: "Column-major layout: A(:,j) is contiguous, A(i,:) strides by size(A,1). Always loop with first index innermost.", tag: "perf" },
    { fact: "Preallocate: zeros(N,1) once, then fill. Growing a column in a loop (y(end+1) = x) is O(n^2).", tag: "perf" },
    { fact: "A\\b dispatches to LAPACK (LU/QR/SVD) — ~10x faster than inv(A)*b, and more numerically stable.", tag: "perf" },
    { fact: "Logical indexing A(mask) is faster than find(mask) — avoids the indirection step.", tag: "perf" },
    { fact: "Implicit expansion (R2016b+) replaces bsxfun; same perf, much cleaner syntax.", tag: "version" },
    { fact: "MEX files (compiled C) bypass the interpreter; useful for tight loops JIT can't optimize, but JIT has narrowed the gap to <2x for most code.", tag: "perf" },
    { fact: "gpuArray is faster than CPU only for arrays >~1M elements; small arrays spend all time on CPU<->GPU transfer.", tag: "perf" },
    { fact: "In-place ops: A(:) = f(A) avoids a temporary. Some functions support in-place via the A = f(A) idiom since R2018b.", tag: "perf" },
    { fact: "Tables have overhead vs raw arrays (~2-5x slower on numeric ops); use matrix when you don't need column types.", tag: "perf" },
    { fact: "cellfun with @fn is ~2-3x slower than a manual loop; pre-extract to vectors when possible.", tag: "perf" },
    { fact: "tall arrays are lazy — gather() forces computation. Use sparingly to avoid full materialization.", tag: "perf" },
    { fact: "Profile with profile on; profile viewer. Hot lines flagged by execution count + time.", tag: "perf" },
    { fact: "Single precision is 2x faster than double on GPU and many CPUs (AVX-512); 4x memory savings.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "MATLAB", purpose: "The IDE / interpreter itself — editor, debugger, workspace, plot tools. Bundled with the language.", url: "https://www.mathworks.com/products/matlab.html", category: "build" },
    { tool: "Simulink", purpose: "Block-diagram simulation — model-based design for control systems, signal processing, embedded codegen.", url: "https://www.mathworks.com/products/simulink.html", category: "build" },
    { tool: "Toolboxes", purpose: "Licensed add-ons (Control, Signal, Image, Statistics, Optimization, etc.). Each is per-seat, expensive.", url: "https://www.mathworks.com/products.html", category: "build" },
    { tool: "MATLAB Compiler", purpose: "Bundle MATLAB code + runtime into a standalone executable or library (no MATLAB license needed to run).", url: "https://www.mathworks.com/products/matlab-compiler.html", category: "deploy" },
    { tool: "MATLAB Coder", purpose: "Generate C/C++ code from MATLAB — for embedded deployment, hardware targets, or speed.", url: "https://www.mathworks.com/products/matlab-coder.html", category: "build" },
    { tool: "MEX", purpose: "Compile C/C++/Fortran to call from MATLAB — for hot loops, legacy code, hardware APIs.", url: "https://www.mathworks.com/help/matlab/call-mex-files-1.html", category: "build" },
    { tool: "Parallel Computing Toolbox", purpose: "parfor, parfeval, spmd, gpuArray, tall arrays. Required for any parallel/GPU work.", url: "https://www.mathworks.com/products/parallel-computing.html", category: "build" },
    { tool: "Live Editor", purpose: "Notebook-style (.mlx) — code, plots, math, text in one document. Binary format, poor diff/merge.", url: "https://www.mathworks.com/products/matlab/live-editor.html", category: "build" },
    { tool: "App Designer", purpose: "Drag-and-drop GUI builder (replaces GUIDE). Generates classdef-based apps.", url: "https://www.mathworks.com/products/matlab/app-designer.html", category: "build" },
    { tool: "MATLAB Unit Test Framework", purpose: "matlab.unittest — classdef or function-based tests. Bundled since R2013a.", url: "https://www.mathworks.com/help/matlab/matlab-unit-test-framework.html", category: "test" },
    { tool: "MATLAB Test Manager", purpose: "GUI for running tests, viewing coverage, profiling. Project-based test organization.", url: "https://www.mathworks.com/help/matlab/ref/runtests.html", category: "test" },
    { tool: "MATLAB Profiler", purpose: "profile on/off/viewer — line-level timing. Built-in, no install needed.", url: "https://www.mathworks.com/help/matlab/matlab_prog/profiling-for-improving-performance.html", category: "debug" },
    { tool: "MATLAB Online", purpose: "Browser-based MATLAB — full IDE, cloud-stored files. Included with most licenses.", url: "https://matlab.mathworks.com/", category: "build" },
    { tool: "Octave", purpose: "Open-source MATLAB clone — ~85% syntax compat, no Simulink, no Toolboxes. Good for portability checks.", url: "https://octave.org/", category: "build" },
    { tool: "File Exchange", purpose: "Community-contributed code (270k+ files). The de-facto package index for MATLAB.", url: "https://www.mathworks.com/matlabcentral/fileexchange/", category: "package" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0", year: 1984, highlight: "Cleve Moler releases MATLAB at UNM — a matrix calculator front-end for LINPACK/EISPACK." },
    { version: "R2006a", year: 2006, highlight: "Switch to spring/fall release cadence (a/b naming). Major UI overhaul; first 64-bit Windows build." },
    { version: "R2008a", year: 2008, highlight: "Object-oriented programming (classdef) — classes, inheritance, events. Major modernization." },
    { version: "R2010b", year: 2010, highlight: "MATLAB Coder (C/C++ codegen), mex -largeArrayDims (64-bit indexing) default." },
    { version: "R2013b", year: 2013, highlight: "JIT acceleration — most loops now within 2x of vectorized. Tables, datetime types." },
    { version: "R2014b", year: 2014, highlight: "New graphics system (HG2); strings, webread/webwrite HTTP. Major performance overhaul." },
    { version: "R2016a", year: 2016, highlight: "Live Editor (.mlx), App Designer, tall arrays, parfeval. Matlab Production Server." },
    { version: "R2016b", year: 2016, highlight: "Implicit expansion (broadcasting) — replaces bsxfun. string arrays first-class." },
    { version: "R2017a", year: 2017, highlight: "String arrays extended; GPU improved; Python interop (py.*). MEX supports C++11." },
    { version: "R2018b", year: 2018, highlight: "In-place ops optimizations, string strengthening, improved JIT for OOP." },
    { version: "R2020a", year: 2020, highlight: "Live Editor tasks (interactive UI for data cleaning), export to C/C++/Python/Java." },
    { version: "R2021a", year: 2021, highlight: "arguments block — type-checked function arguments, replaces validateattributes." },
    { version: "R2022a", year: 2022, highlight: "Python integration expanded; Live Editor collapsible sections; major GPU perf work." },
    { version: "R2024a", year: 2024, highlight: "Python package manager interop, improved docker support, AI chat assistant (MathWorks)." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Why does MATLAB use 1-indexing and column-major layout?", a: "1-indexing follows mathematical convention (matrices are A_ij with i,j >= 1) — natural for the linear-algebra target audience. Column-major (Fortran order) matches LAPACK/BLAS, which MATLAB is built on — A(:,j) is contiguous so column slicing is free, A(i,:) is strided. The choice is a single design decision that paid off because it aligns with the underlying numerical libraries. C/NumPy's row-major order exists because C arrays are pointer-arithmetic friendly that way; the conventions diverged for different reasons.", difficulty: "medium" },
    { q: "Explain * vs .* and the dot-prefix operator family.", a: "* is matrix multiplication (A*B requires size(A,2)==size(B,1)); .* is elementwise (broadcasts via implicit expansion since R2016b). The dot prefix is the universal 'elementwise' marker: .^, ./, .\\, .' (transpose without conjugate). The #1 newcomer bug is writing a*b where a and b are equal-length vectors — this returns a 1x1 inner product (or errors on dimensions), not an elementwise product. Pick the operator matching your intent; the error 'matrix dimensions must agree' usually means a missing dot.", difficulty: "easy" },
    { q: "What does A\\b do that inv(A)*b doesn't?", a: "A\\b solves Ax = b using LAPACK: LU factorization for square, QR for rectangular, SVD-based pseudoinverse for rank-deficient. inv(A)*b explicitly inverts A first, then multiplies — 2-3x slower, and numerically less stable (inversion amplifies rounding errors). The backslash operator also auto-picks the right algorithm based on matrix properties (sparse, symmetric, banded). NEVER use inv() for solving linear systems; it's only useful when you genuinely need the inverse matrix itself.", difficulty: "medium" },
    { q: "Handle vs value classes — what's the difference?", a: "Value classes (default) copy on assignment: b = a; b.x = 5; % a.x unchanged. Handle classes inherit from 'handle' and use reference semantics: b = a; b.x = 5; % a.x IS now 5 — same object. Use handle for resources (DB connections, file handles, GUI objects, loggers) where shared mutable state is intended. Use value for domain objects (vectors, configs, results) where immutability aids reasoning and parallelism. Mixing them creates 'spooky action at a distance' bugs — pick deliberately per class.", difficulty: "medium" },
    { q: "What's the difference between char arrays and string objects?", a: "Single-quoted 'hello' is a 1x5 char array — fundamentally a numeric array of character codes. Double-quoted \"hello\" (R2016b+) is a 1x1 string object — a first-class type. Differences: == on char arrays is elementwise (returns 1x5 logical), == on strings is scalar. Cell arrays of char ({'a','b'}) are legacy; string arrays ([\"a\",\"b\"]) are modern and vectorize cleanly via strlength(), upper(), contains(). Pick one convention per project; mix via string() and char() conversions at boundaries.", difficulty: "easy" },
    { q: "How does parfor differ from a regular for, and what are its constraints?", a: "parfor distributes loop iterations across parallel pool workers — requires Parallel Computing Toolbox. Rules: (1) Body must be iteration-independent (no cross-iteration reads of the same variable). (2) Sliced variables (indexed ONLY by the loop var) are fastest — copied to workers once. (3) Reductions (sum, max, [a;b]) supported via special syntax: total = total + compute(i). (4) Broadcast vars (read-only) are copied to all workers — keep them small. (5) Classifications are static; MATLAB errors at parse time on violations. Speedup depends on iteration cost vs communication overhead.", difficulty: "medium" },
    { q: "What does onCleanup do and why is it the RAII pattern in MATLAB?", a: "onCleanup(f) returns a cleanup object whose destructor (called when the object goes out of scope) runs f — guaranteed even on error or return. Pattern: fid = fopen(path); c = onCleanup(@() fclose(fid)); ... — the file closes when the function exits, no matter what. This is MATLAB's equivalent of Python's 'with' or C++ RAII, because MATLAB has no 'finally' blocks (until try/catch/ME in newer versions, which is more verbose). Always use onCleanup for fid, db connections, timer objects — never rely on manual close at function end.", difficulty: "medium" },
    { q: "How would you debug a slow MATLAB script?", a: "Step 1: profile on; my_script; profile viewer — see line-level time + call counts. Step 2: identify hot lines — usually loops or growing arrays. Step 3: common fixes: preallocate (zeros(N,1) before loop), vectorize (replace loop with .* or mean(A,2)), reorder loops so first index is innermost (column-major), use sparse matrices for <10% density, switch to single precision for memory bandwidth, consider gpuArray for large data. Step 4: if still slow, MEX-compile the hot loop in C. Step 5: re-profile to confirm.", difficulty: "hard" },
    { q: "How do you interop MATLAB with Python, C, and other languages?", a: "Python: py.* prefix calls Python modules directly (py.numpy.array([1 2 3])), bidirectional since R2014b. C/C++: MEX files compile C to .mexa64 (Linux) / .mexw64 (Windows) callable as if native; Coder generates C from MATLAB. Fortran: also via MEX. Java: java.* classes are directly callable. .NET: NET.* API (Windows only). For data exchange: MAT files (HDF5 v7.3) are the universal format; Python's scipy.io.loadmat and h5py can read them. The biggest gotcha: MATLAB is column-major, most others row-major — transpose at boundaries.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Python + NumPy", whenThis: "Simulink (model-based design), vendor-tuned BLAS/LAPACK, established engineering curricula, teams with deep Toolbox investment (Control, Signal, HDL Coder).", whenThat: "Open-source deliverable, ML ecosystem, general-purpose programming, no per-seat licensing, large hiring pool." },
    { vs: "Julia", whenThis: "Simulink, proprietary Toolboxes (Communications, Phased Array, Robotics), C/C++/HDL codegen via MathWorks' tools, institutional licensing.", whenThat: "Open-source, general-purpose language (not just math), GPU support without toolbox fees, modern package manager." },
    { vs: "R", whenThis: "Matrix-heavy numerics, control systems / signal processing, Simulink integration, anything needing a polished IDE.", whenThat: "Statistical modeling ecosystem (CRAN's 20k+ packages), ggplot2, established academic stats workflows, when the team is statisticians." },
    { vs: "Octave", whenThis: "Simulink, Toolboxes, MATLAB Compiler/Coder for production deployment, vendor support.", whenThat: "Free / open-source, no licensing, embeddable in pipelines, portability testing of MATLAB code." },
  ],
};

export default sheet;
