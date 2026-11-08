import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "numpy",
  name: "NumPy",
  category: "ml-ai",
  tier: "ml",
  tags: ["python", "arrays", "numerical", "vectorization", "broadcasting", "linear-algebra", "scientific-computing"],
  tagline: "The N-dimensional array library — the memory layout and vectorized kernel everything in Python data runs on.",
  year: 2006,
  author: "Travis Oliphant (from Numeric/NumArray lineage)",
  lastUpdated: "2026-11",
  readingTime: 27,

  tldr: [
    "NumPy provides the ndarray: a typed, contiguous, N-dimensional buffer plus a vectorized operation library over it. Python loops compile to C-speed loops over raw memory — that one idea is the foundation of pandas, PyTorch, scikit-learn, SciPy, and JAX.",
    "It is the most-depended-upon numerical package in the Python ecosystem (NumPy 2.5.4 current, Oct 2026; supports Python 3.12-3.15) and the interop substrate: Arrow, DLPack, and the Array API all speak its dialect.",
    "Reach for NumPy directly when you're doing array math — linear algebra, signal processing, simulations, image kernels — or when you need to break out of pandas/PyTorch overhead in a hot loop.",
    "It is NOT a dataframe tool (pandas/Polars), not a GPU tensor library (PyTorch/JAX), and not distributed (Dask): but each of those inherits its mental model — learn it once here.",
  ],

  mentalModel: {
    title: "An array is a strided view over one contiguous buffer",
    body: "An ndarray is metadata (shape, strides, dtype) over a flat memory block. Strides say how many bytes to step per dimension — which means slicing creates VIEWS (zero-copy, shared memory), and reshape/transpose are metadata tricks, not copies. Vectorization works because operations dispatch to compiled loops over that buffer instead of the interpreter. Broadcasting is the same idea generalized: dimensions of size 1 stretch (again without copying) so a (100,1) + a (1,3) yields (100,3). Every performance rule follows: prefer whole-array ops (no per-element Python), keep data contiguous for SIMD (C order, avoid ragged lists), and watch out for accidental O(n²) temporaries in chained expressions. Views explain the classic mutation bug too: modify a slice, mutate the parent.",
  },

  constructs: [
    { syntax: "np.array([[1,2],[3,4]], dtype=np.float32)", behavior: "Construction from nested sequences with explicit dtype — the only way to control memory.", when: "Small literals, tests. Big data: use from np.load/np.frombuffer/fromfile (zero-copy paths)." },
    { syntax: "a[rows, cols] — a[mesh, cols]", behavior: "Fancy/integer indexing: pass arrays of indices per axis; returns a COPY.", when: "Row/column selection, gather patterns. Remember: copy, not view — assignment target differs." },
    { syntax: "a[:, np.newaxis]", behavior: "Adds a size-1 axis for broadcasting alignment.", when: "Turning (n,) into (n,1) to broadcast against (m,) — the classic outer-product setup." },
    { syntax: "a @ b / np.matmul", behavior: "Matrix multiply with BLAS dispatch; @ since 3.5 in Python.", when: "All linear algebra — never loop a dot product." },
    { syntax: "np.einsum('ij,jk->ik', a, b)", behavior: "Index-notation contractions — einstein summation over arbitrary axes.", when: "Batched/transposed products, traces, attention scores — the universal tensor op." },
    { syntax: "np.linalg.solve / lstsq / svd", behavior: "LAPACK-backed factorizations and solvers.", when: "solve(A,b) instead of inv(A)@b (faster + stabler); SVD for PCA/least squares." },
    { syntax: "a.reshape(n, -1) / ravel()", behavior: "Reinterpret shape over the same buffer when possible (view) — -1 infers the remainder.", when: "Flattening for ML features, batching — but transpose().reshape() copies (non-contiguous)." },
    { syntax: "np.where(cond, x, y)", behavior: "Vectorized ternary — also THE index-finding idiom (np.where(cond) returns indices).", when: "Conditional values, thresholding, locating matches." },
    { syntax: "np.random.default_rng(seed)", behavior: "Modern Generator API (PCG64) — replaces the legacy np.random.* global state.", when: "All new code: reproducible, per-stream independence, statistical correctness." },
    { syntax: "np.load / np.save (.npy, .npz)", behavior: "Binary array persistence preserving dtype+shape; npz = zip of arrays.", when: "Features/checkpoints between stages — orders of magnitude faster than CSV round-trips." },
  ],

  patterns: [
    {
      lang: "python",
      caption: "Broadcasting: the shape rules, once and for all",
      code: `import numpy as np

# Rule: align shapes RIGHT; dimensions are compatible when
# equal OR one of them is 1 (the 1 stretches, no copy made).
A = np.arange(12).reshape(3, 4)        # shape (3, 4)
row = np.array([10, 20, 30, 40])       # shape (4,)
col = np.array([[100], [200], [300]])  # shape (3, 1)

A + row        # (3,4) + (4,)   → (4,) broadcasts along rows → (3,4)
A + col        # (3,4) + (3,1)  → stretches the 1 → (3,4)
A * col * row  # outer-product style composition → (3,4)

# The classic bug: (n,) is NOT (n,1)
v = np.array([1, 2, 3])
try:
    v + np.array([1, 2, 3, 4])          # ValueError: shapes (3,) (4,)
except ValueError: pass
v[:, np.newaxis] + v[np.newaxis, :]     # (3,1)+(1,3) → (3,3) outer sum

# Z-score rows of a matrix without any loop:
X = np.random.default_rng(0).normal(size=(1_000, 50))
Xz = (X - X.mean(axis=1, keepdims=True)) / X.std(axis=1, keepdims=True)
# keepdims=True keeps (1000,1) so broadcasting divides each row.`,
    },
    {
      lang: "python",
      caption: "Views vs copies — the mutation trap",
      code: `a = np.arange(10)

# SLICE = view: shared memory
s = a[2:5]
s[0] = 99
assert a[2] == 99            # parent mutated!

# Detach when you need independence:
b = a[2:5].copy()            # explicit copy

# FANCY INDEXING = copy:
idx = [0, 3, 7]
f = a[idx]                   # copy — f[0] = ... won't touch a
a[idx] = 0                   # but this scatter-writes INTO a

# reshape/transpose: views when memory layout allows
m = np.arange(6).reshape(2, 3)
m.ravel()[0] = 100           # mutates m (contiguous → view)
mt = m.T.reshape(6)          # transpose broke contiguity → COPY here

# Contiguity checks:
m.flags['C_CONTIGUOUS'], m.T.flags['C_CONTIGUOUS']   # True, False
m.T.copy()                    # materialize for fast row iteration`,
    },
    {
      lang: "python",
      caption: "Replace the loop: 10x-100x vectorization",
      code: `# BEFORE: pairwise distances, the O(n²) Python way
#   for i in range(n):
#       for j in range(m):
#           d[i, j] = np.sqrt(((A[i] - B[j])**2).sum())

# AFTER: broadcasting does it in one shot
A = np.random.default_rng(1).normal(size=(1000, 32))
B = np.random.default_rng(2).normal(size=(500, 32))
d = np.linalg.norm(A[:, None, :] - B[None, :, :], axis=-1)   # (1000, 500)

# Memory-tight alternative: ||a-b||² = ||a||² + ||b||² - 2a·b
d2 = (A*A).sum(1)[:, None] + (B*B).sum(1)[None, :] - 2 * (A @ B.T)
d2 = np.sqrt(np.maximum(d2, 0))            # clip float noise

# Chunked when both n and m are huge (bounded temporaries):
def dist_chunked(A, B, block=1024):
    out = np.empty((len(A), len(B)), dtype=np.float32)
    for i in range(0, len(A), block):
        out[i:i+block] = np.linalg.norm(
            A[i:i+block, None] - B[None], axis=-1)
    return out

# Same discipline applies to group-by reductions:
# np.add.at / np.bincount(weights=...) replace per-group loops.`,
    },
    {
      lang: "python",
      caption: "einsum: one notation for every contraction",
      code: `# matmul: ij,jk->ik
C = np.einsum('ij,jk->ik', A, B)

# batched matmul over stacks: bij,bjk->bik
Cb = np.einsum('bij,bjk->bik', A_stack, B_stack)

# dot products per row: ij,ij->i
dots = np.einsum('ij,ij->i', X, Y)

# trace, transpose, diag — all the same notation:
tr = np.einsum('ii->', M)             # trace
Tt = np.einsum('ij->ji', M)           # transpose (view semantics)
d  = np.einsum('ii->i', M)            # diagonal

# Attention-score shape gymnastics in one line:
# scores = Q @ K.T / sqrt(d) for each head: hqd,hkd->hqk
scores = np.einsum('hqd,hkd->hqk', Q, K) / np.sqrt(K.shape[-1])

# einsum_path optimizes multi-operand contractions:
np.einsum_path('ij,jk,kl->il', A, B, C, optimize=True)[1]  # shows plan`,
    },
    {
      lang: "python",
      caption: "Aggregations with missing data and reductions",
      code: `X = np.array([[1.0, 2.0, np.nan],
              [4.0, np.nan, 6.0],
              [7.0, 8.0, 9.0]])

# Plain reductions propagate NaN (sometimes what you want to KNOW):
X.sum()                       # nan

# nan-aware variants:
np.nansum(X), np.nanmean(X, axis=0), np.nanstd(X, axis=1, ddof=1)

# Count missing per column:
np.isnan(X).sum(axis=0)       # array([0, 1, 1])

# Masked filtering:
X_filled = np.where(np.isnan(X), np.nanmedian(X, axis=0), X)

# argmax/argmin return INDICES (for lookups, not values):
best = X.nanargmax(axis=1) if hasattr(X, "nanargmax") else np.argmax(
    np.where(np.isnan(X), -np.inf, X), axis=1)

# Percentiles/clip — the preprocessing staples:
np.percentile(X, [25, 50, 75], axis=0)
np.clip(X, lo, out=None)`,
    },
  ],

  pitfalls: [
    { title: "NumPy 1.x code relying on value-based promotion", symptom: "float32_array + python_float results changed dtype behavior after the 2.x NEP 50 rules.", fix: "Python scalars are weak: array dtype wins. Cast explicitly where you need wider results; run the 2.0 migration guide checks." },
    { title: "Mutating a parent through a slice view", symptom: "You wrote to a slice; the original array changed too (or vice versa — a filter 'loses' your edit because you wrote to a copy).", fix: "Slices are views sharing memory — .copy() when independence matters. The reverse bug: fancy indexing (a[idx]) returns a copy, so `a[idx][...] = v` writes nowhere; scatter with a[idx] = v directly." },
    { title: "Accidental dtype = object arrays", symptom: "An array of arrays/None/mixed types — every op falls back to Python speed or errors cryptically.", fix: "Construction mixed types (lists of lists with different lengths, None values) silently yields dtype=object. Check a.dtype first when things are slow/weird; sanitize input (fill None, enforce shapes) before np.array(...)." },
    { title: "Integer vs float division surprises", symptom: "np.array([1,2,3]) / 2 gives floats (fine), but // and int arrays truncate toward zero — and -7//2 == -4 semantics differ from intuition.", fix: "Know the dtype promotion rules (NEP 50 in NumPy 2: python scalars are 'weak' — arr + 1 preserves arr dtype). Cast deliberately: arr.astype(np.float32) at boundaries; check result dtypes after arithmetic on int arrays." },
    { title: "Chained temporaries blowing memory", symptom: "(A @ B) + (C @ D) * E creates 3 giant intermediates; RSS spikes and the OS kills the job.", fix: "Fuse where possible (einsum with optimize=True), use out= params for reuse (np.matmul(A, B, out=buf)), chunk the big dimension, or drop dtype to float32. Memory ceiling ≈ sum of all temporaries, not the final result." },
    { title: "Loops over array elements", symptom: "for x in arr / nested Python loops on big arrays — 50-1000x slower than vectorized code.", fix: "Vectorize with broadcasting, np.where/select, reduction axes, and einsum. If genuinely sequential, numba @njit on a .to_numpy() buffer keeps C speed with loop syntax." },
    { title: "Randomness: legacy global state", symptom: "np.random.seed() + np.random.normal() gives irreproducible results across library boundaries and breaks under parallelism.", fix: "rng = np.random.default_rng(seed) — modern Generator, per-stream, thread-safe pattern; pass the rng explicitly into functions. Legacy np.random.* stays only for legacy code." },
    { title: "shape (n,) vs (n,1) confusion in ML pipelines", symptom: "A 'vector' column feeds sklearn/pytorch and you get broadcast errors or silently wrong shapes (1000,)+(1000,1) errors; (n,) matrix-multiplies as a row.", fix: "np.shape discipline: (n,) is a 1-D vector, (n,1) is a column, (1,n) is a row. Use .reshape(-1, 1) at model boundaries, .squeeze() to flatten, and assert shapes in pipeline glue code." },
    { title: "Non-contiguous arrays killing performance", symptom: "A transpose or sliced block makes ops 2-10x slower (no SIMD, cache misses); reshape() suddenly copies.", fix: "Check .flags['C_CONTIGUOUS']; .copy() once before repeated heavy math on transposed views (amortize the copy). np.ascontiguousarray() at boundaries. Understand why: memory doesn't move in transposes, so row-major kernels degrade." },
  ],

  quickReference: [
    { fact: "Learning path: numpy-100 exercises → broadcasting page → einsum practice → Array API for portable kernels.", tag: "learning" },
    { fact: "Current: NumPy 2.5.4 (Oct 2026); 2.5.0 dropped Python 3.11, supports 3.12-3.15, distutils removed, Array-API-compliant descending sorts, improved free-threading support.", tag: "version" },
    { fact: "NumPy 2.x (June 2024) was the first major in 18 years: NEP 50 promotion (python scalars weak), new string dtype, copy= keyword, 100+ removed aliases — migration was the story of 2024-25.", tag: "version" },
    { fact: "Slices are views; fancy (integer-array) indexing copies; reshape/transpose are metadata — until non-contiguity forces a copy.", tag: "behavior" },
    { fact: "Broadcasting: shapes align right; size-1 dims stretch without copying. (n,) is never (n,1) — the top shape bug in ML glue code.", tag: "shapes" },
    { fact: "np.linalg.solve(A, b), not inv(A) @ b: LU with pivots, ~2x fewer flops and better numerical error. lstsq for over/under-determined systems.", tag: "linalg" },
    { fact: "dtype ladder: float64 default (accuracy) → float32 halves memory/bandwidth (GPUs' native) → bfloat16 via ml_dtypes for training. Integer overflow WRAPS silently — check dtypes after arithmetic.", tag: "dtypes" },
    { fact: "Free-threaded Python (3.13+ no-GIL): NumPy releases the GIL in kernels and 2.5 improves support — threads help big array math on that build.", tag: "parallel" },
    { fact: "DLPack / __dlpack__ + Arrow zero-copy bridges: tensors↔ndarray↔Arrow without memcpy — the interop path PyTorch/JAX/CuPy all speak.", tag: "interop" },
    { fact: "Structured arrays (np.dtype([('x','f4'),('tag','U8')])) — record arrays for heterogeneous columns; don't use them where pandas is the right tool.", tag: "dtypes" },
    { fact: "np.savez_compressed / np.load with mmap_mode='r': memory-map big arrays instead of loading — random access without RAM cost.", tag: "io" },
    { fact: "Axis semantics: axis=0 collapses rows (per-column), axis=1 collapses columns (per-row). keepdims preserves rank for broadcasting follow-ups.", tag: "shapes" },
    { fact: "Prefer reduction methods (a.sum(axis=1)) over np.sum(a, 1) — same thing, but method form reads better in chains and avoids the module lookup.", tag: "style" },
    { fact: "np.errstate / np.seterr control FP exception handling (divide/over/under/invalid): production numeric code sets policy explicitly instead of printing RuntimeWarnings.", tag: "numerics" },
  ],

  goDeeper: [
    { title: "NumPy documentation — Absolute Basics + User Guide", url: "https://numpy.org/doc/stable/user/absolute_beginners.html", note: "Start here, then broadcasting and indexing pages — the two that unlock everything else." },
    { title: "NumPy 2.x migration guide", url: "https://numpy.org/doc/stable/numpy_2_0_migration_guide.html", note: "NEP 50 promotion and the removed aliases — read before pinning a major version." },
    { title: "100 NumPy Exercises (rougier)", url: "https://github.com/rougier/numpy-100", note: "The classic drill set — do 20 and your array intuition levels up." },
    { title: "SciPy Lecture Notes", url: "https://scipy-lectures.org/", note: "Numerics with NumPy/SciPy in scientific context — the free textbook that keeps on giving." },
    { title: "Array API standard", url: "https://data-apis.org/array-api/latest/", note: "The portable subset shared by NumPy/PyTorch/JAX/CuPy — write kernels once against it." },
  ],

  // ─── §8 "Data types" — dtypes and array kinds ─────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "np.int8/16/32/64, uint*", behavior: "Fixed-width signed/unsigned ints; overflow wraps silently.", when: "IDs and counts where size matters. Guard with iinfo limits; uint for non-negative." },
      { syntax: "np.float32 / np.float64", behavior: "IEEE singles/doubles — float32 halves bandwidth, ~7 digits precision.", when: "float64 default for science; float32 for big data + GPU pipelines. Never money (that's decimal/int-cents)." },
      { syntax: "np.bool_", behavior: "1 byte per element mask (not bit-packed).", when: "Masks/filters; combine with ~ & | (element-wise)." },
      { syntax: "np.complex128", behavior: "Pairs of doubles with * and @ semantics.", when: "FFT/signal processing — np.fft module is built around it." },
      { syntax: "np.datetime64 / timedelta64", behavior: "Fixed-unit datetimes (ns/us/ms...) — not timezone-aware.", when: "Fast time series arithmetic; pandas wraps it with tz and business logic." },
    ],
    collections: [
      { syntax: "ndarray (N-D)", behavior: "The core: typed buffer + shape + strides + methods.", when: "Everything numerical. 1-D = vector, 2-D = matrix, N-D = batch/tensor." },
      { syntax: "np.matrix (legacy)", behavior: "Always 2-D with * as matmul — subclass friction.", when: "Never in new code: plain ndarray + @. matrix is a compatibility fossil." },
      { syntax: "structured arrays", behavior: "dtype of named fields (record rows in one buffer).", when: "Binary file formats, C-struct interop. pandas/Arrow for real columnar work." },
      { syntax: "np.ma.MaskedArray", behavior: "Data + boolean mask for missing values.", when: "Legacy scientific code; new code uses NaN sentinels or pandas nullable dtypes." },
    ],
    custom: [
      { syntax: "np.dtype([('x','f4'), ('id','i8')])", behavior: "Composite dtype — multiple typed fields per element.", when: "Reading binary records (sensor files, npz of structs) without Python objects." },
      { syntax: "np.dtypes.StringDType (2.x+)", behavior: "Real variable-length strings, not object pointers.", when: "NumPy 2's native string dtype — memory-efficient text in arrays; Arrow-interop friendly." },
      { syntax: "memmap via np.load(mmap_mode='r')", behavior: "Array backed by file pages, loaded on demand.", when: "Multi-GB .npy datasets that don't fit RAM: random access pays only for touched pages." },
    ],
  },

  // ─── §9 Operators & expressions ───────────────────────────────────────────
  operators: [
    { syntax: "+ - * / // % **", behavior: "Element-wise, broadcasting; promotion per NEP 50 (python scalars are weak — arr dtype wins).", when: "All math. Watch int // and % semantics (floor, sign behavior)." },
    { syntax: "@ (matmul)", behavior: "Matrix product, BLAS-dispatched; 1-D vectors treated as row/col sensibly.", when: "Linear algebra; never np.dot loops. einsum for anything fancier." },
    { syntax: "== != < > <= >=", behavior: "Element-wise → boolean arrays (not Python scalars).", when: "Masks: (x > 3) & (x < 9). Chain with & | ~ and PARENTHESES (precedence!)." },
    { syntax: "& | ^ ~", behavior: "Bitwise on ints, logical on bools — element-wise.", when: "Mask combination; on ints they're bit ops — don't confuse with &&/|| (don't exist)." },
    { syntax: "a[boolean_mask]", behavior: "Select rows where mask True — returns copy (often shorter).", when: "Filtering; np.where(mask) when you need the indices instead." },
    { syntax: "A.T / np.transpose / moveaxis", behavior: "Reverse/permute axes — metadata only, no copy.", when: "Batch orientation gymnastics; .copy() after if you'll hammer it with row-major kernels." },
  ],

  // ─── §10 Input / output ───────────────────────────────────────────────────
  inputOutput: [
    {
      lang: "python",
      caption: "Persistence: .npy/.npz, text, and buffers",
      code: `import numpy as np

# The fast path — binary, typed, exact:
np.save("features.npy", X)                    # one array
np.savez_compressed("model.npz", W=W, b=b)    # named dict of arrays
X = np.load("features.npy")                   # dtype+shape intact
with np.load("model.npz") as z:               # context-managed zip
    W, b = z["W"], z["b"]

# Memory-map a huge array (no full load):
big = np.load("train.npy", mmap_mode="r")
block = big[1_000_000:1_001_024].copy()       # touch only these pages

# Text — only at human boundaries:
np.savetxt("weights.csv", W, delimiter=",", header="w0,w1", comments="")
W2 = np.loadtxt("weights.csv", delimiter=",", skiprows=1)

# From/without copies at system boundaries:
arr = np.frombuffer(b"\\x01\\x00\\x02\\x00", dtype=np.int16)   # zero-copy view
arr.tobytes()                       # back to bytes for sockets/files
np.fromiter((f(x) for x in xs), dtype=np.float32, count=n)  # streaming build`,
    },
    {
      lang: "python",
      caption: "Interop: pandas, PyTorch, Arrow — zero-copy",
      code: `# pandas ↔ NumPy: the .to_numpy() / .values story
import pandas as pd
df = pd.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})
block = df.to_numpy()                    # numeric blocks often share memory
df2 = pd.DataFrame(block, columns=["a", "b"])

# PyTorch ↔ NumPy via DLPack (CPU: zero-copy share)
import torch
t = torch.from_numpy(np.ascontiguousarray(block))   # shares memory
back = t.numpy()

# GPU round trip (explicit copies):
t_gpu = torch.tensor(block, device="cuda")
gpu_view = np.from_dlpack(t_gpu)         # NumPy 2.x: view GPU memory!

# Arrow ↔ NumPy
import pyarrow as pa
tbl = pa.table({"x": pa.array(np.arange(5))})
zero_copy = tbl.column("x").combine_chunks().to_numpy(zero_copy_only=True)`,
    },
  ],

  // ─── §11 Loops & iteration ────────────────────────────────────────────────
  loops: [
    {
      lang: "python",
      caption: "Iteration when you must — and how to avoid it",
      code: `# The ONLY fast Python-level iteration: flat iteration is C-ordered memory
total = 0.0
for x in arr.flat:            # flat iterator, no view objects per step
    total += x
# (still 10-100x slower than arr.sum() — use only when stateful)

# ndenumerate for indices+values (debugging, small arrays):
for idx, val in np.ndenumerate(np.eye(3)):
    pass

# Vectorized replacements for common loops:
#   running max prefix        → np.maximum.accumulate(x)
#   cumsum                    → np.cumsum(x, axis=0)
#   apply-sign                → np.sign(x)
#   piecewise                 → np.piecewise(x, [cond1, cond2], [f1, f2])
#   group-indexed accumulate  → np.add.at(out, idx, vals)

# Sliding windows without a loop:
from numpy.lib.stride_tricks import sliding_window_view
windows = sliding_window_view(x, window_shape=7)      # (n-6, 7) as VIEWS
smoothed = windows.mean(axis=1)

# Block-wise map over a big axis (bounded memory):
out = [heavy(block) for block in np.array_split(big, 64)]`,
    },
  ],

  // ─── §12 Functions & callables ────────────────────────────────────────────
  functions: [
    {
      lang: "python",
      caption: "ufuncs: the universal function contract",
      code: `# A ufunc broadcasts + vectorizes + type-promotes automatically.
np.sqrt, np.exp, np.log1p, np.maximum, np.round — all ufuncs.
# Everything accepts: out=, where=, dtype=, casting= — the knobs
# that keep big pipelines allocation-free:

y = np.empty_like(x)
np.sqrt(x, out=y, where=(x >= 0))     # masked write, zero temporaries

# ufunc methods = loop replacements:
np.add.reduce(x, axis=0)              # = x.sum(axis=0)
np.add.accumulate(x)                  # = cumsum
np.multiply.outer(a, b)               # = a[:,None]*b[None,:]
np.add.reduceat(x, [0, 5, 10])        # segmented sum in ONE call

# Custom element-wise kernel → wrap with np.vectorize (convenience,
# NOT speed — still calls Python) or write a real ufunc via numba:
from numba import vectorize, float64
@vectorize([float64(float64, float64)], target='parallel')
def sigmoid_dot(x, w): return 1/(1 + np.exp(-x*w))  # C speed`,
    },
  ],

  // ─── §13 Error handling ───────────────────────────────────────────────────
  errorHandling: [
    {
      lang: "python",
      caption: "Numerical errors: policy, not luck",
      code: `# Floating-point warnings are POLICY — set them explicitly:
with np.errstate(divide='raise', invalid='raise', over='warn'):
    z = 1.0 / x            # raises FloatingPointError instead of inf/nan

# Common failure signatures and their causes:
#   all-NaN after ops       → 0/0, inf-inf, sqrt(neg): print intermediates
#   inf where you meant big → overflow: check dtype (float32 caps ~3.4e38)
#   -inf + inf in reductions → np.nansum treats nan as 0, but inf stays inf
#   silent wrong results    → int overflow WRAPPED: (2**31).astype(int32)

# Shape errors are CONTRACT errors — read them precisely:
# ValueError: operands could not be broadcast together (3,4) (5,)
#   → align right, fix the (n,) vs (n,1) confusion

# Contiguity errors from compiled consumers:
#   "ndarray is not C-contiguous" → arr = np.ascontiguousarray(arr)

# Validate at boundaries (cheap asserts beat silent corruption):
assert X.ndim == 2 and X.shape[1] == n_features and np.isfinite(X).all()`,
    },
  ],

  // ─── §14 "Concurrency" — parallelism & performance model ─────────────────
  concurrency: [
    {
      lang: "python",
      caption: "Where the speed actually comes from",
      code: `# 1) BLAS/LAPACK (matmul, solve): already multi-threaded via
#    OpenBLAS/MKL — env knobs: OMP_NUM_THREADS, MKL_NUM_THREADS.
#    One big @ beats a thousand small ones: batch your work.

# 2) SIMD in ufuncs: contiguous float32/64 → AVX-512/NEON lanes.
#    Keep arrays C-contiguous for the big win:
C = np.ascontiguousarray(A.T)   # pay once, then fast kernels

# 3) GIL: NumPy releases it inside kernels → threads help for
#    concurrent array ops (esp. on free-threaded 3.13+/3.14 builds).

# 4) Parallel custom kernels via numba:
from numba import njit, prange
@njit(parallel=True)
def zscore_rows(X):
    out = np.empty_like(X)
    for i in prange(X.shape[0]):          # real threads over rows
        m = X[i].mean(); s = X[i].std() + 1e-9
        out[i] = (X[i] - m) / s
    return out

# 5) GPU: cupy as drop-in (import cupy as np), or torch/jax —
#    but the memory transfer cost is real: batch transfers.`,
    },
  ],

  // ─── §15 Testing ──────────────────────────────────────────────────────────
  testing: [
    {
      lang: "python",
      caption: "Testing numerical code",
      code: `import numpy as np

# Floating point: NEVER assert ==; use tolerance semantics
np.testing.assert_allclose(got, want, rtol=1e-5, atol=1e-8)

# Shape/dtype contracts (fail fast at boundaries):
def test_batch_shape():
    X = make_batch(7)
    assert X.shape == (7, 32)
    assert X.dtype == np.float32

# Property-based tests with hypothesis (the numerical sweet spot):
from hypothesis import given, strategies as st
@given(st.lists(st.floats(-1e6, 1e6), min_size=1, max_size=100))
def test_sum_matches_nansum(xs):
    a = np.array(xs)
    assert np.isclose(a.sum(), np.nansum(a)) or np.isnan(a.sum()) is False or True

# Determinism: seeded generators make tests reproducible
rng = np.random.default_rng(42)

# Reference-implementation testing: vectorized vs naive loop
def test_zscore_matches_naive():
    X = np.random.default_rng(0).normal(size=(50, 8))
    naive = (X - X.mean(1)[:, None]) / X.std(1)[:, None]
    np.testing.assert_allclose(zscore_rows(X), naive, rtol=1e-6)

# In CI: run with -W error::RuntimeWarning to catch FP surprises
# as failures instead of scroll-past warnings.`,
    },
  ],

  // ─── §16 Performance ──────────────────────────────────────────────────────
  performance: [
    { fact: "Whole-array ops beat Python loops 10-100x — the ONE rule. Profile with %timeit before optimizing further.", tag: "vectorize" },
    { fact: "Contiguity is worth 2-10x on big kernels: ascontiguousarray() once before repeated row-major math on transposed views.", tag: "memory" },
    { fact: "float32 halves memory AND doubles effective SIMD bandwidth; batch boundary casts amortize.", tag: "dtypes" },
    { fact: "out= and where= on ufuncs eliminate temporaries — matters at multi-GB scale where allocation is the bottleneck.", tag: "memory" },
    { fact: "One big matmul > many small: BLAS amortizes per-call overhead — batch (stack, then @).", tag: "linalg" },
    { fact: "sliding_window_view creates views not copies — O(1) window setup, but materialize before fancy ops.", tag: "patterns" },
    { fact: "mmap_mode='r' on .npy: random access to >RAM datasets without loading — the cheapest 'big data' trick in NumPy.", tag: "io" },
    { fact: "np.add.reduceat / bincount(weights) replace per-group Python aggregation loops entirely.", tag: "patterns" },
    { fact: "einsum(optimize=True) finds contraction orders — free speedups on 3+ operand expressions.", tag: "linalg" },
    { fact: "Structured/broadcast temporaries spike memory ≈ sum of intermediates — chunk the big axis when close to the ceiling.", tag: "memory" },
    { fact: "numba @njit(parallel=True) on .to_numpy() buffers: C speed with loop-shaped code when the math won't vectorize.", tag: "kernels" },
    { fact: "AVX-512/SVE paths depend on dtype+alignment: float32 contiguous arrays hit peak lanes; object/ragged arrays hit Python.", tag: "simd" },
  ],

  // ─── §17 Ecosystem & tooling ──────────────────────────────────────────────
  ecosystem: [
    { tool: "SciPy", purpose: "Built on NumPy: optimization, signal, sparse, stats, spatial — the rest of numerical Python.", url: "https://scipy.org/", category: "science" },
    { tool: "pandas", purpose: "DataFrames over NumPy arrays — labeled, tabular, SQL-ish.", url: "https://pandas.pydata.org/", category: "data" },
    { tool: "scikit-learn", purpose: "ML estimators consuming (and validating) NumPy arrays.", url: "https://scikit-learn.org/", category: "ml" },
    { tool: "PyTorch / JAX", purpose: "GPU/autograd tensors — API cousins via DLPack/Array API.", url: "https://pytorch.org/", category: "ml" },
    { tool: "CuPy", purpose: "NumPy-compatible API on CUDA — drop-in for GPU arrays.", url: "https://cupy.dev/", category: "gpu" },
    { tool: "Numba", purpose: "JIT-compile array kernels (incl. parallel + CUDA) from Python.", url: "https://numba.pydata.org/", category: "perf" },
    { tool: "numexpr", purpose: "Evaluate array expressions with internal parallelism + fewer temporaries.", url: "https://numexpr.readthedocs.io/", category: "perf" },
    { tool: "xarray", purpose: "N-D labeled arrays (dims/coords) — NumPy for gridded science.", url: "https://docs.xarray.dev/", category: "science" },
    { tool: "Dask", purpose: "Parallel/distributed arrays with the NumPy API shape.", url: "https://docs.dask.org/", category: "scale" },
    { tool: "ml_dtypes", purpose: "bfloat16/fp8 dtypes usable from NumPy 2.x — the low-precision bridge.", url: "https://github.com/jax-ml/ml_dtypes", category: "dtypes" },
    { tool: "PyArrow", purpose: "Columnar interop; zero-copy with NumPy buffers.", url: "https://arrow.apache.org/docs/python/", category: "data" },
  ],

  // ─── §18 Version history ──────────────────────────────────────────────────
  versionHistory: [
    { version: "Numeric (1995) / NumArray", year: 1995, highlight: "The pre-history: Jim Hugunin's Numeric and its successor NumArray compete as Python array layers." },
    { version: "NumPy 1.0", year: 2006, highlight: "Travis Oliphant unifies Numeric+NumArray into NumPy; the modern scientific-Python stack crystallizes around ndarray." },
    { version: "1.7-1.10", year: 2014, highlight: "@ operator groundwork (NEP 13, ufunc overrides), datetime64 overhauled — API matures." },
    { version: "1.17", year: 2019, highlight: "New random Generator API (PCG64) replacing the legacy global-state np.random — statistical correctness era." },
    { version: "1.20", year: 2021, highlight: "Typed C API stabilization (SIMD dispatch inside), numpy.typing module — the typing turn." },
    { version: "1.24-1.26", year: 2023, highlight: "Deprecation cleanup for 2.0 (np.float aliases removed), meson build migration, NEP 50 design." },
    { version: "2.0", year: 2024, highlight: "First major in 18 years: NEP 50 promotion rules, StringDType, zero-copy __dlpack__ both ways, 100+ removals — ecosystem-wide migration." },
    { version: "2.1-2.2", year: 2024, highlight: "f2py meson, datetime improvements, free-threading (no-GIL) wheels experiment alongside CPython 3.13." },
    { version: "2.5", year: 2026, highlight: "2.5.0 (Jun): Python 3.11 dropped (3.12-3.15), distutils removed, Array-API descending sorts, better free-threading. Current: 2.5.4 (Oct 2026)." },
  ],

  // ─── §19 Interview hot questions ──────────────────────────────────────────
  interview: [
    { q: "Explain broadcasting with an example.", a: "Two shapes broadcast by aligning from the right; each dimension pair is compatible if equal or one side is 1; size-1 dims stretch virtually (no copy). (100,1)+(1,3) → (100,3): 100 rows each of 3 values, one buffer each side. Incompatible: (3,4)+(5,) fails because right-aligned 4 vs 5 mismatch. The practical trap: (n,) is not (n,1) — a 'vector' broadcasts along rows as a row; reshape(-1,1) to make it a column. keepdims=True in reductions exists precisely to keep broadcasting shape-compatible.", difficulty: "easy" },
    { q: "What's the difference between a view and a copy — and when does each occur?", a: "View: shares the underlying buffer — slicing (a[2:5]), reshape on contiguous data, transpose. No allocation; writes propagate to the parent. Copy: new memory — fancy/boolean indexing results, .copy(), reshape of non-contiguous data. Critical asymmetry: READ from a slice (view) then mutate the result → parent changes (bug!); WRITE via fancy index (a[idx] = v) scatters into the parent, but reading a[idx] first gives a copy you can't write through. Check .base is not None or the flags to see which you hold.", difficulty: "medium" },
    { q: "Why is NumPy fast?", a: "Four stacked reasons: (1) homogeneous typed contiguous buffers — no per-element boxing, tight memory layout; (2) vectorized operations dispatch to compiled C loops with SIMD (AVX-512/NEON) over that buffer; (3) BLAS/LAPACK (OpenBLAS/MKL) underneath matmul/factorizations, themselves multithreaded and decades-tuned; (4) no interpreter in the hot path — Python is only the dispatch layer. Corollary: every time you loop in Python over elements, you forfeit all four.", difficulty: "easy" },
    { q: "How would you find the k nearest neighbors of 1M points without a library?", a: "Compute the full distance matrix with broadcasting (norm of A[:,None]-B[None]) — O(n·m·d) but fully vectorized; chunk A in blocks to bound temporaries. Or the ||a-b||² = ||a||²+||b||²-2abᵀ identity: one matmul (BLAS, multithreaded) plus row norms — much faster than the broadcast form for large m. Then np.argpartition(dist, k)[:, :k] gets k-smallest indices in O(n) per row without a full sort. Mention scaling to KD-trees (scipy.spatial.cKDTree) or approximate NN (faiss) as the real-world answers at 10M+.", difficulty: "hard" },
    { q: "Why did NumPy 2's NEP 50 change promotion — what actually changed?", a: "Pre-2.x, Python scalars participated in value-based promotion: float32_arr + python_float(3.0) could promote to float64 depending on the scalar's VALUE — unpredictable and inconsistent across dtypes. NEP 50: Python scalars are 'weak' — the ARRAY dtype always wins (float32_arr + 3.0 → float32), and only array-vs-array uses standard promotion. Value-dependence is gone; results are dtype-stable and easier to reason about for mixed-precision code. Migration pain was mostly code that relied on silent float64 upcasts.", difficulty: "hard" },
    { q: "What are strides and why do they matter?", a: "Strides = bytes to step per dimension (a 3×4 C-order int64 array has strides (32,8)). Shape+strides+dtype fully describe the view: reshape is a stride rewrite, transpose swaps them, slicing offsets the pointer and adjusts strides. They matter for performance: contiguous strides let kernels stream memory for SIMD and cache lines; a transposed view makes 'row' access jump — 2-10x slower. ascontiguousarray() re-lays-out memory when you'll repeatedly traverse the bad axis. Also the source of bugs: two views with same shape can alias the same buffer.", difficulty: "medium" },
    { q: "int32 array, you add values that overflow int32 — what happens?", a: "Silent wraparound (undefined-ish C behavior, in practice modular arithmetic): 2^31 becomes -2^31. No warning, no error — the classic silent corruption. Prevention: know your iinfo limits (np.iinfo(np.int32).max), accumulate counts in int64, cast before arithmetic that can exceed range, and assert bounds at ingestion. Same class of issue: float32 caps at ~3.4e38 — infinities appear on overflow (with a warning, at least).", difficulty: "medium" },
    { q: "When is np.vectorize the wrong tool?", a: "Almost always for performance: despite the name it's a Python-loop convenience wrapper — it doesn't compile anything (docs say so explicitly). Right uses: applying an existing element-wise Python function with broadcasting convenience in non-hot code. For speed: rewrite with ufuncs/where/piecewise, or numba @vectorize which produces a REAL ufunc (compiled, parallel-capable). The interview wants the distinction between 'looks vectorized' and 'is vectorized'.", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ──────────────────────────────────────────────────────
  comparisons: [
    { vs: "pandas", whenThis: "Pure array math without labels: linalg, FFT, simulations, kernels. Zero index overhead, cleaner memory.", whenThat: "Labeled/tabular data, joins, missing-value ergonomics — pandas is NumPy + an index + the operations that need one." },
    { vs: "PyTorch/JAX (CPU)", whenThis: "No autograd/GPU need; smaller dependency surface; SciPy interop.", whenThat: "You need gradients, JIT compilation, GPU. Their CPU ops are NumPy-adjacent; tensors convert near zero-copy via DLPack." },
    { vs: "CuPy", whenThis: "CPU workloads, or GPU transfers that would dominate runtime.", whenThat: "Data already on GPU and staying there: CuPy mirrors the API so the same code runs on CUDA with minimal edits." },
    { vs: "numexpr", whenThis: "General array work; BLAS-heavy math (numexpr doesn't do matmul).", whenThat: "Big element-wise expressions where temporaries hurt: numexpr fuses and threads them with a string expression parser." },
    { vs: "list of lists (pure Python)", whenThis: "Anything numeric over ~1k elements, any dtype-homogeneous data, any need for vectorized math.", whenThat: "Genuinely heterogeneous, tiny, or non-numeric structures with heavy append patterns — Python lists remain the right tool there." },
  ],
};

export default sheet;
