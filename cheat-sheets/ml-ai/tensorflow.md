# TensorFlow

**Category:** ML / AI · **Tier:** ML / AI · **Tags:** deep-learning, autodiff, gpu, tpu, neural-networks, production, google, tensor · **First released:** 2015 · **Author:** Google Brain · **Last updated:** 2026-11

> End-to-end ML platform with eager execution, graph compilation via tf.function, and a battle-tested serving stack.

---

## TL;DR

- TensorFlow is a numerical computing platform where every op is a node in a dataflow graph; since 2.0 it executes eagerly by default and compiles to graphs on demand via @tf.function.
- It is the foundation of Google's production ML stack — TPU training, TensorFlow Serving, TFLite (mobile), and TF.js (browser) all consume the same SavedModel artifact.
- Reach for it when you need TPUs, mobile/edge deployment, robust serving infrastructure, or you are extending a Google-authored model (BERT, T5, Gemini internals).
- Avoid it for new research code where PyTorch has the ecosystem momentum, or if you only need classical ML (use scikit-learn). Keras 3 (2023) now gives a unified API across TF, JAX, and PyTorch backends.

## Core Mental Model

**Eager Python ops that trace into a stateful dataflow graph.** Every `tf.*` call in 2.x immediately executes and returns a concrete Tensor — easy to debug with print and pdb. Wrap a function in @tf.function and AutoGraph re-traces it into a static graph: Python control flow becomes tf.cond / tf.while_loop, and the resulting graph is cached by input signature for fast re-execution. State lives in tf.Variable objects (mutable, persist across calls) rather than in Python closures, which is why distribution and checkpointing can serialize a model independently of the code that built it.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| tf.constant([[1, 2], [3, 4]]) | Immutable tensor; lives on the default device (CPU if no GPU). | Constants and inputs; use tf.Variable for anything trainable. |
| tf.Variable(initial_value) | Mutable, named tensor that holds state across calls — the only thing optimizers update. | Model weights, moving averages, batchnorm stats. Always create inside a strategy.scope(). |
| with tf.GradientTape() as tape: ... | Records forward ops on trainable variables; tape.gradient(loss, vars) returns grads. | Custom training loops — the only way to get gradients in 2.x. Use persistent=True for multiple .gradient() calls. |
| @tf.function def train_step(x, y): ... | Traces the function into a graph on first call, caches by signature, reuses thereafter. | Hot loops — 5–10× faster than eager. Avoid side effects (prints, external Python state) inside; they only fire on trace. |
| tf.data.Dataset.from_tensor_slices(x).shuffle(1000).batch(64).prefetch(AUTOTUNE) | Builds a lazy, prefetching input pipeline that runs in C++ threads separate from the training step. | Always — feeding Python lists to .fit() is fine for toys but doesn't overlap data and compute. |
| class L(tf.keras.layers.Layer):   def build(self, shape): ...   def call(self, x): ... | Custom layer — build() creates weights lazily (input-shape-aware), call() defines forward. | Anything beyond stacked Dense; prefer over raw tf ops for checkpointing and serialization. |
| tf.keras.Model(inputs, outputs) | Functional API — graph of layers, supports multi-input/output and branching. | Non-linear topologies; for simple stacks use tf.keras.Sequential. |
| model.compile(optimizer, loss, metrics); model.fit(ds, epochs=10) | Configures and runs the built-in training loop with callbacks, validation, distributed training. | Standard supervised training — 90% of cases. Drop to GradientTape only for custom losses or RL. |
| tf.train.Checkpoint(model=m, opt=o).write('ckpt') | Object-based save — restores by variable name, survives renames better than SavedModel. | Training checkpoints. Use SavedModel for serving artifacts. |
| tf.saved_model.save(model, 'm') | Serializes graph + weights + signatures into a portable directory. | Production serving (TF Serving, TFLite conversion, TF.js). The canonical deploy unit. |
| strategy = tf.distribute.MirroredStrategy() | Synchronous data-parallel training across GPUs on one machine — variables are mirrored, grads all-reduced via NCCL. | Single-host multi-GPU. For multi-host use MultiWorkerMirroredStrategy or TPUStrategy. |
| tf.config.set_visible_devices([], 'GPU') | Hides GPUs from this process — forces CPU execution. | CI, debugging, or running alongside another GPU process. |
| tf.function(jit_compile=True)(fn) | Compiles the traced graph with XLA — fuses ops, sometimes large speedups on TPU and GPU. | Hot paths with static shapes; can hurt if shapes are dynamic (recompiles). |

## Idiomatic Patterns

**Custom training step with GradientTape — the 2.x idiomatic loop**

```python
import tensorflow as tf

def make_train_step(model, opt, loss_fn):
    @tf.function(input_signature=[
        tf.TensorSpec([None, 784], tf.float32),
        tf.TensorSpec([None],    tf.int32),
    ])
    def train_step(x, y):
        with tf.GradientTape() as tape:
            logits = model(x, training=True)
            loss = loss_fn(y, logits)
            # add weight-decay term so it scales with batch correctly
            loss += 1e-4 * tf.add_n([tf.nn.l2_loss(w)
                                     for w in model.trainable_weights])
        grads = tape.gradient(loss, model.trainable_weights)
        opt.apply_gradients(zip(grads, model.trainable_weights))
        return loss
    return train_step

model = tf.keras.Sequential([
    tf.keras.layers.Input((784,)),
    tf.keras.layers.Dense(256, activation="relu"),
    tf.keras.layers.Dense(10),
])
train_step = make_train_step(
    model,
    tf.keras.optimizers.AdamW(learning_rate=1e-3, weight_decay=1e-4),
    tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
)
```

**tf.data pipeline with prefetch overlap and augmentation**

```python
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE

def load_dataset(images, labels, training=False, batch=64):
    ds = tf.data.Dataset.from_tensor_slices((images, labels))
    if training:
        ds = ds.shuffle(buffer_size=10000, reshuffle_each_iteration=True)
        ds = ds.map(lambda x, y: (tf.image.random_flip_left_right(x), y),
                    num_parallel_calls=AUTOTUNE)
    ds = ds.batch(batch).prefetch(AUTOTUNE)   # overlap host<->device
    return ds

train_ds = load_dataset(x_train, y_train, training=True)
# .prefetch(AUTOTUNE) means the next batch is prepared while current is training
```

**Multi-GPU with MirroredStrategy — model built inside scope**

```python
import tensorflow as tf

strategy = tf.distribute.MirroredStrategy()
print(f"replicas: {strategy.num_replicas_in_sync}")

with strategy.scope():
    model = tf.keras.Sequential([
        tf.keras.layers.Input((224, 224, 3)),
        tf.keras.layers.Conv2D(32, 3, activation="relu"),
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dense(1000),
    ])
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=["accuracy"],
    )

# Dataset is auto-sharded across replicas by the strategy
model.fit(train_ds, epochs=10, validation_data=val_ds)
```

**Checkpoint save/restore for resumable training**

```python
import tensorflow as tf

ckpt = tf.train.Checkpoint(model=model, optimizer=opt, step=tf.Variable(0))
mgr = tf.train.CheckpointManager(ckpt, directory="./ckpts", max_to_keep=3)

# Restore if available, else start fresh
if mgr.latest_checkpoint:
    ckpt.restore(mgr.latest_checkpoint).expect_partial()
    print(f"restored from {mgr.latest_checkpoint} at step {int(ckpt.step)}")

for epoch in range(epochs):
    for batch in train_ds:
        train_step(*batch)            # the @tf.function from earlier
        ckpt.step.assign_add(1)
    mgr.save()                        # rotates checkpoints, keeps last 3
```

**Save a serving-ready SavedModel with a concrete signature**

```python
import tensorflow as tf

class ServingModule(tf.Module):
    def __init__(self, model):
        self.model = model

    @tf.function(input_signature=[tf.TensorSpec([None, 784], tf.float32, name="x")])
    def __call__(self, x):
        return {"logits": self.model(x, training=False),
                "pred":   tf.argmax(self.model(x, training=False), axis=-1)}

serving = ServingModule(model)
tf.saved_model.save(
    serving, "./saved_model/1",
    signatures={"serving_default": serving.__call__.get_concrete_function()},
)
# TF Serving, TFLite Converter, and TF.js can now all load this directory
```

## Common Pitfalls

1. **Side effects in @tf.function fire only on trace** — *Symptom:* print() inside a @tf.function runs once (during tracing), not per batch — debug logs appear to be missing or stale. *Fix:* Use tf.print(...) which becomes a graph node and executes per call. Or wrap the function body in tf.config.run_functions_eagerly(True) while debugging.
2. **tf.Variable created outside strategy.scope() not distributed** — *Symptom:* Multi-GPU training trains only on the first GPU; strategy.num_replicas_in_sync is correct but nvidia-smi shows one GPU idle. *Fix:* Build the model AND call .compile() inside `with strategy.scope():`. Variables created outside are local and never mirrored.
3. **Calling .numpy() inside @tf.function** — *Symptom:* RuntimeError: 'numpy()' is only available when eager execution is enabled — happens when you mix eager idioms into a graph-compiled function. *Fix:* Compute everything with tf ops inside @tf.function. Move any numpy/Python logic outside, or pass values as Tensors in and return Tensors out.
4. **Shape mismatch retraces @tf.function on every call** — *Symptom:* Training is slow and you see 'tracing' warnings repeatedly; each unique input shape re-traces the graph. *Fix:* Pad batches to a fixed shape (common in NLP) or specify input_signature in @tf.function so unknown shapes don't trigger retracing. Use tf.data with .padded_batch for variable-length data.
5. **Forgot .prefetch(AUTOTUNE) — GPU starves** — *Symptom:* GPU utilization oscillates between 30% and 100%; step time is dominated by host data prep, not compute. *Fix:* End every tf.data pipeline with `.batch(B).prefetch(tf.data.AUTOTUNE)`. Also use .cache() before .map() for in-memory datasets and .interleave() for many files.
6. **Mixed tf.keras and Keras 3 imports** — *Symptom:* Layers behave subtly differently; checkpoints from one don't load in the other; TF-specific features (mixed precision, distribution) silently no-op. *Fix:* Pick one and stick to it. Keras 3 (`import keras`) is the future and supports JAX/PyTorch backends; tf.keras (`from tensorflow import keras`) is the legacy single-backend path frozen at 2.x.
7. **Soft placement hides GPU→CPU fallback** — *Symptom:* Model runs but is slower than expected; some ops silently execute on CPU because no GPU kernel exists. *Fix:* Set `tf.config.set_soft_device_placement(False)` during development to surface the error. Check `tf.test.is_gpu_available()` and per-op device with tf.profiler.

## Production / Interview Quick Reference

- TensorFlow 2.21 (Mar 2026) is current stable; 2.22-rc adds Python 3.14 and CUDA 13. `version`
- @tf.function gives 5–10× speedup over eager; first call always traces (slow), subsequent calls reuse the cached graph. `perf`
- tf.data.AUTOTUNE lets the runtime pick buffer sizes — always prefer it over hand-tuned values for prefetch/num_parallel_calls. `perf`
- SavedModel is the deploy artifact: directory with saved_model.pb (graph), variables/ (weights), and assets/ (vocab files). Loaded by name and version. `version`
- tf.function(jit_compile=True) invokes XLA — can fuse elementwise+reduction chains 2–4×, but recompiles for each new static shape. `perf`
- MirroredStrategy = synchronous all-reduce (NCCL); TPUStrategy = 8 replicas per TPU v4 chip; MultiWorkerMirroredStrategy for multi-host. `version`
- Default Keras Adam lr=0.001; AdamW added in 2.11; weight_decay (not decay) is the correct arg name. `gotcha`
- mixed_precision policy 'mixed_float16' needs the last Dense layer cast to float32 (OutputLayer handles this) — otherwise logits overflow. `gotcha`
- GradientTape is one-shot by default; pass persistent=True to call .gradient() multiple times (higher-order grads, multi-loss heads). `complexity`
- TF 2.x default is eager; tf.compat.v1.disable_v2_behavior() exists for migrating 1.x code, not for new projects. `version`
- Per-step overhead: eager ≈ 50–200 µs/op, graph ≈ 5–20 µs/op — matters most in RL and short-step training. `perf`
- Variable dtypes: tf.float32 default; mixed_bfloat16 on TPU/CPU, mixed_float16 on GPU. float16 alone (not mixed) underflows easily. `gotcha`
- Keras 3 (2023) is multi-backend — `import keras` not `from tensorflow import keras`. Same API, swappable backend via keras.config.set_backend. `version`
- tf.train.Checkpoint is object-based (survives renames); SavedModel is graph-based (portable but stricter). Use both: Checkpoint mid-training, SavedModel for deploy. `gotcha`
- TPUs need static shapes everywhere — pad to multiples of 128 (for embeddings) or 8 (for images) or you get recompilation storms. `gotcha`
- input_signature in @tf.function prevents retracing on shape changes — required for production code that may see variable batch sizes. `gotcha`

## Go Deeper

- [TensorFlow Official Documentation](https://www.tensorflow.org/guide) — The Guide section is canonical — read 'Introduction to Graphs and Functions', 'Better performance with tf.data', and 'Distributed training'.
- [TensorFlow: A System for Large-Scale Machine Learning (OSDI 2016)](https://www.usenix.org/system/files/conference/osdi16/osdi16-abadi.pdf) — The original TensorFlow whitepaper — explains dataflow graph, sessions, and the design rationale.
- [Better Performance with the tf.data API](https://www.tensorflow.org/guide/data_performance) — Official deep dive on pipelining, parallelism, and prefetching — read before profiling training throughput.
- [Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow (Aurélien Géron)](https://www.oreilly.com/library/view/hands-on-machine-learning/9781098125967/) — The canonical practitioner book; chapters 10–14 are the most-used TF/Keras tutorial in industry.
- [XLA: Optimizing Compiler for Machine Learning](https://www.tensorflow.org/xla) — Authoritative doc on XLA compilation — explains jit_compile, clustering, and the tradeoffs of static shapes.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| tf.float32 | 32-bit IEEE float — the default for trainable Variables and almost all training. | Default everywhere. Mixed-precision policies change compute dtype without changing the Variable dtype. |
| tf.float16 | 16-bit float — 5 exponent + 10 mantissa bits. Range ±65504, prone to overflow. | Mixed precision on GPU (policy 'mixed_float16'); the last Dense must stay float32 to avoid logit overflow. |
| tf.bfloat16 | 16-bit float — 8 exponent + 7 mantissa bits. Same range as fp32, lower precision. | TPU default; 'mixed_bfloat16' policy on CPU/GPU (Ampere+). No loss scaling needed. |
| tf.float64 (tf.double) | 64-bit IEEE double — XLA supports it but kernels are sparse on GPU. | Numerical-grad checks, scientific computing; never for training. |
| tf.int64 | 64-bit signed int — the default for sparse categorical labels and embedding indices. | Targets for SparseCategoricalCrossentropy, gather/scatter indices. |
| tf.int32 | 32-bit signed int — used for shape arithmetic and many ops that don't need int64 range. | Most integer ops where int64 is overkill; preferred over int64 for memory. |
| tf.int8 / tf.uint8 | 8-bit signed / unsigned integer — quantization weights and image pixels. | Quantization-aware training (int8), image data 0-255 (uint8). |
| tf.bool | Boolean — 1 byte per element. Returned by comparisons, used as a mask. | tf.boolean_mask, tf.where conditions, attention padding masks. |
| tf.string | Variable-length byte string tensor — atomic at the graph level. | Raw text pipelines in tf.data; decode downstream with tf.strings.decode. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| tf.Tensor | Immutable multi-dim array with dtype, shape, and device — the central object. | Every value flowing through ops; eager by default, becomes a graph node inside @tf.function. |
| tf.Variable | Mutable, named tensor that holds state across calls — the only thing optimizers update. | Model weights, moving averages, batchnorm stats. Always create inside a strategy.scope(). |
| tf.RaggedTensor | Tensor with variable-length rows — backed by values + row splits. | Batched NLP sequences of different lengths without padding; tf.keras handles it in many layers. |
| tf.SparseTensor | Sparse matrix — values + indices + dense_shape, no zero storage. | Large sparse features (recommendations, bag-of-words). Most ops have sparse variants. |
| tf.TensorArray | Graph-side dynamic list of tensors with fixed dtype/shape — XLA-friendly. | Inside @tf.function when you'd otherwise use a Python list (which breaks tracing). |
| tf.data.Dataset | Lazy, composable iterator of elements — runs in C++ threads separate from the training step. | Always — feeding Python lists to .fit() doesn't overlap data and compute. |
| tf.TensorSpec | Declarative (dtype, shape, name) tuple — used to declare input signatures. | @tf.function(input_signature=...) and Keras Input layers; prevents retracing. |
| tf.lookup.StaticHashTable | Immutable key→value map for vocab lookups inside the graph. | Mapping tokens→ids without leaving the graph (faster than dict + py_function). |
| tf.distribute.DistributedDataset | Strategy-sharded iterator — each replica pulls its own batch. | Returned by strategy.experimental_distribute_dataset(ds); the per-replica input for custom training loops. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class L(tf.keras.layers.Layer):   def build(self, shape): ...   def call(self, x): ... | Custom layer — build() creates weights lazily (input-shape-aware), call() defines forward. | Anything beyond stacked Dense; required for checkpointing and serialization. |
| class M(tf.keras.Model):   def train_step(self, data): ... | Subclassed Model with a custom train_step — .fit() calls it, you keep distribution/callbacks for free. | Custom losses, GANs, contrastive learning — anywhere the default loss(y, y_pred) doesn't fit. |
| class Loss(tf.keras.losses.Loss):   def call(self, y_true, y_pred): ... | Custom loss returning per-sample values; reduce is handled by the framework. | Custom objectives; subclass instead of writing a function to get serialization + reduction. |
| class Metric(tf.keras.metrics.Metric):   def update_state(self, y_true, y_pred): ...   def result(self): ... | Stateful metric — accumulates across batches, resets between epochs. | Custom metrics (F1, IoU); preferred over stateless functions when value depends on the full epoch. |
| @tf.function def f(x): ... | Traces Python into a graph on first call, caches by signature, reuses thereafter. | Hot loops — 5-10× faster than eager. Avoid side effects (prints, Python state) inside; they fire only on trace. |
| class F(tf.Module):   def __call__(self, x): ... | Lightweight container — auto-tracks tf.Variables; the base for Keras Layer and SavedModel exports. | Serving modules without Keras overhead; tf.saved_model.save works on any tf.Module. |
| class CustomOptimizer(tf.keras.optimizers.Optimizer):   def update_step(self, grad, var, lr): ... | Custom optimizer — implement update_step (2.11+); base class handles iterations, gradients, slot vars. | Research optimizers; prefer subclassing over re-implementing Adam from scratch. |
| tf.train.Checkpoint(model=m, opt=o) | Object-based checkpoint — restores by variable attribute path, survives renames better than SavedModel. | Training checkpoints. Use SavedModel for serving artifacts. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, tf.add(a, b) | Element-wise add with broadcasting; eager returns a Tensor, inside @tf.function adds a graph node. | Math. Use tf.math.add_n for summing a list of tensors (var summation). |
| a @ b, tf.matmul(a, b) | Matrix multiply — 2D and batched forms; transpose_a/b flags avoid extra ops. | Standard matmul. For attention use scaled_dot_product_attention (2.10+) which calls FlashAttention. |
| tf.einsum('bihd,bjhd->bij', q, k) | Einstein summation — arbitrary tensor contractions in one call. | Multi-tensor contractions (attention, GNNs). Compiles to a fusion of transposes + matmul. |
| tf.concat([a, b], axis=0) | Concatenates tensors along an existing axis. | Joining batches, features, sequence dims. Both tensors must share other dims. |
| tf.stack([a, b], axis=0) | Stacks along a NEW axis — adds a dimension. | Aggregating results into a new batch dim; inverse of tf.unstack. |
| tf.nn.softmax(x, axis=-1) | Normalized exp along axis — sums to 1. | Classification head, attention weights. Use log_softmax for numerical stability. |
| tf.nn.sigmoid(x) | 1 / (1 + e^-x) — squashes to (0,1). | Binary logits, gates. Numerically stable for large \|x\|. |
| tf.nn.relu / gelu / silu / mish | Activation functions — relu (cheap), gelu (transformers), silu/swish (modern LLMs). | Pick by architecture: MLPs → relu/gelu, LLMs → silu, conv → relu/mish. |
| tf.where(cond, a, b) | Element-wise ternary — picks from a where cond is True, else b. | Masking, conditional gradient routes. cond must be a bool Tensor. |
| tf.gather(x, idx, axis=0) | Selects slices along axis at positions in idx — same rank as x. | Embedding lookups, sequence mixing, MoE routing. |
| tf.scatter_nd(indices, updates, shape) | Inverse of gather — writes updates into a fresh zero tensor at sparse indices. | MoE dispatch, gradient accumulation by index, one-hot expansion. |
| tf.norm(x, axis=-1) | L2 norm along axis (use ord= for other norms). | Layer norm internals, distance metrics, gradient clipping. |
| tf.reduce_sum / mean / max(x, axis=...) | Reductions — pass axis to keep rank, omit for scalar. | Loss reductions, mean over batch; the 'reduce_' prefix distinguishes from tf.math.max which is element-wise. |
| tf.boolean_mask(x, mask) | Selects elements where mask is True — returns a flat tensor of selected values. | Applying padding masks to loss, gathering valid positions. |
| tf.gradients(loss, vars) / GradientTape.gradient | Computes gradients of loss w.r.t. vars — reverse-mode autodiff. | Custom training loops. GradientTape is the 2.x API; tf.gradients is graph-mode 1.x. |

## Input / Output

**Object-based Checkpoint + CheckpointManager — resumable training**

```python
import tensorflow as tf

ckpt = tf.train.Checkpoint(model=model, optimizer=opt, step=tf.Variable(0))
mgr = tf.train.CheckpointManager(ckpt, directory="./ckpts", max_to_keep=3)

if mgr.latest_checkpoint:
    ckpt.restore(mgr.latest_checkpoint).expect_partial()
    print(f"restored at step {int(ckpt.step)}")

for epoch in range(epochs):
    for batch in train_ds:
        train_step(*batch)            # the @tf.function
        ckpt.step.assign_add(1)
    mgr.save()                        # rotates, keeps last 3

# Note: Checkpoint is object-based (survives renames); SavedModel is graph-based (portable but stricter).
# Use BOTH: Checkpoint mid-training, SavedModel for deploy.
```

**tf.data pipeline — from TFRecords with parallel decode + prefetch**

```python
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE
FEATURES = {
    "image": tf.io.FixedLenFeature([], tf.string),
    "label": tf.io.FixedLenFeature([], tf.int64),
}

def parse(example):
    f = tf.io.parse_single_example(example, FEATURES)
    img = tf.io.decode_jpeg(f["image"], channels=3)
    img = tf.image.resize(img, [224, 224])
    img = tf.cast(img, tf.float32) / 255.0
    return img, f["label"]

ds = (tf.data.TFRecordDataset("shard-*.tfrec", num_parallel_reads=AUTOTUNE)
        .map(parse, num_parallel_calls=AUTOTUNE)
        .shuffle(10000)
        .batch(64)
        .prefetch(AUTOTUNE))
# prefetch overlaps the next-batch prep with the current-batch training step
```

**SavedModel with a concrete serving signature — the deploy artifact**

```python
import tensorflow as tf

class ServingModule(tf.Module):
    def __init__(self, model):
        self.model = model

    @tf.function(input_signature=[
        tf.TensorSpec([None, 784], tf.float32, name="x"),
    ])
    def __call__(self, x):
        logits = self.model(x, training=False)
        return {
            "logits": logits,
            "pred":   tf.argmax(logits, axis=-1, output_type=tf.int32),
        }

serving = ServingModule(model)
tf.saved_model.save(
    serving, "./saved_model/1",
    signatures={"serving_default": serving.__call__.get_concrete_function()},
)
# TF Serving, TFLite Converter, and TF.js can all load this directory.
```

**Loading a SavedModel + calling it via the named signature**

```python
import tensorflow as tf

loaded = tf.saved_model.load("./saved_model/1")
infer = loaded.signatures["serving_default"]
print(infer.structured_input_signature, infer.structured_outputs)

# Inputs are passed by name (from the TensorSpec name= in input_signature)
out = infer(x=tf.constant([[0.1] * 784], dtype=tf.float32))
print(out["pred"].numpy())           # array([[class_id]], dtype=int32)

# For Keras-compatible loading (also restores .compile config):
km = tf.keras.models.load_model("./saved_model/1")
```

## Loops & Iteration

**Built-in .fit() with tf.data + callbacks — the 90% path**

```python
import tensorflow as tf

model.compile(
    optimizer=tf.keras.optimizers.AdamW(learning_rate=1e-3, weight_decay=1e-4),
    loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
    metrics=[tf.keras.metrics.SparseCategoricalAccuracy(name="acc")],
)

callbacks = [
    tf.keras.callbacks.EarlyStopping(
        monitor="val_acc", patience=5, restore_best_weights=True),
    tf.keras.callbacks.ModelCheckpoint(
        "best.keras", monitor="val_acc", save_best_only=True),
    tf.keras.callbacks.ReduceLROnPlateau(
        monitor="val_loss", factor=0.5, patience=2, min_lr=1e-6),
    tf.keras.callbacks.TensorBoard(log_dir="./tb"),
]

history = model.fit(
    train_ds, validation_data=val_ds, epochs=100,
    callbacks=callbacks, verbose=2,
)
```

**Custom training loop with GradientTape + @tf.function — when .fit() isn't enough**

```python
import tensorflow as tf

@tf.function(input_signature=[
    tf.TensorSpec([None, 784], tf.float32),
    tf.TensorSpec([None], tf.int32),
])
def train_step(x, y):
    with tf.GradientTape() as tape:
        logits = model(x, training=True)
        loss = loss_fn(y, logits)
        loss += 1e-4 * tf.add_n([tf.nn.l2_loss(w)
                                 for w in model.trainable_weights])
    grads = tape.gradient(loss, model.trainable_weights)
    opt.apply_gradients(zip(grads, model.trainable_weights))
    return loss

@tf.function
def eval_step(x, y):
    logits = model(x, training=False)
    return loss_fn(y, logits), tf.argmax(logits, axis=-1)

for epoch in range(epochs):
    for x, y in train_ds:
        train_step(x, y)
    # eval loop with no_grad equivalent: just call model(x, training=False)
```

**Distributed training loop with strategy.run — per-replica step**

```python
import tensorflow as tf

strategy = tf.distribute.MirroredStrategy()
with strategy.scope():
    model = build_model()
    opt = tf.keras.optimizers.Adam(1e-3)
    loss_fn = tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True)

@tf.function
def distributed_step(dist_inputs):
    def step_fn(x, y):
        with tf.GradientTape() as tape:
            loss = loss_fn(y, model(x, training=True))
        grads = tape.gradient(loss, model.trainable_weights)
        opt.apply_gradients(zip(grads, model.trainable_weights))
        return loss
    per_replica_loss = strategy.run(step_fn, args=dist_inputs)
    # all-reduce across replicas and divide by num replicas
    return strategy.reduce(tf.distribute.ReduceOp.SUM,
                           per_replica_loss, axis=None)

dist_ds = strategy.experimental_distribute_dataset(train_ds)
for epoch in range(epochs):
    for batch in dist_ds:
        loss = distributed_step(batch)
```

**Generator-style tf.data loop — step-based training (no fixed epoch)**

```python
import tensorflow as tf

# Build an infinite, shuffled, batched dataset — useful for RL or GAN training
def infinite_ds(data, batch=64):
    return (tf.data.Dataset.from_tensor_slices(data)
            .shuffle(10000).repeat().batch(batch).prefetch(tf.data.AUTOTUNE))

ds_iter = iter(infinite_ds(train_x, train_y))
step = 0
while step < total_steps:
    x, y = next(ds_iter)
    loss = train_step(x, y)
    if step % 1000 == 0:
        print(f"step {step}: loss={loss.numpy():.4f}")
    step += 1
```

## Functions & Callables

**Custom Layer with build() (lazy weights) + get_config() (serializable)**

```python
import tensorflow as tf

class MLPSwiGLU(tf.keras.layers.Layer):
    def __init__(self, hidden, **kwargs):
        super().__init__(**kwargs)
        self.hidden = hidden

    def build(self, input_shape):
        d = input_shape[-1]
        self.w_gate = self.add_weight("w_gate", shape=(d, self.hidden),
                                       initializer="glorot_uniform", trainable=True)
        self.w_up   = self.add_weight("w_up",   shape=(d, self.hidden),
                                       initializer="glorot_uniform", trainable=True)
        self.w_down = self.add_weight("w_down", shape=(self.hidden, d),
                                       initializer="glorot_uniform", trainable=True)

    def call(self, x):
        return tf.matmul(tf.nn.silu(tf.matmul(x, self.w_gate))
                         * tf.matmul(x, self.w_up), self.w_down)

    def get_config(self):
        return {**super().get_config(), "hidden": self.hidden}
```

**Custom Loss subclass — reusable + reducible + serializable**

```python
import tensorflow as tf

class FocalLoss(tf.keras.losses.Loss):
    """Focal loss: down-weights easy examples, focuses on hard ones."""
    def __init__(self, gamma=2.0, alpha=0.25, **kwargs):
        super().__init__(**kwargs)
        self.gamma = gamma
        self.alpha = alpha

    def call(self, y_true, y_pred):
        y_true = tf.cast(y_true, tf.float32)
        y_pred = tf.clip_by_value(y_pred, 1e-7, 1 - 1e-7)
        p_t = tf.where(tf.equal(y_true, 1), y_pred, 1 - y_pred)
        alpha = tf.where(tf.equal(y_true, 1), self.alpha, 1 - self.alpha)
        loss = -alpha * tf.pow(1 - p_t, self.gamma) * tf.math.log(p_t)
        return loss

    def get_config(self):
        return {**super().get_config(), "gamma": self.gamma, "alpha": self.alpha}
```

**Custom Metric with stateful accumulation across batches**

```python
import tensorflow as tf

class F1Score(tf.keras.metrics.Metric):
    def __init__(self, name="f1", **kwargs):
        super().__init__(name=name, **kwargs)
        self.tp = self.add_weight("tp", initializer="zeros")
        self.fp = self.add_weight("fp", initializer="zeros")
        self.fn = self.add_weight("fn", initializer="zeros")

    def update_state(self, y_true, y_pred, sample_weight=None):
        y_pred = tf.cast(y_pred > 0.5, tf.float32)
        y_true = tf.cast(y_true, tf.float32)
        self.tp.assign_add(tf.reduce_sum(y_pred * y_true))
        self.fp.assign_add(tf.reduce_sum(y_pred * (1 - y_true)))
        self.fn.assign_add(tf.reduce_sum((1 - y_pred) * y_true))

    def result(self):
        precision = self.tp / (self.tp + self.fp + 1e-7)
        recall    = self.tp / (self.tp + self.fn + 1e-7)
        return 2 * precision * recall / (precision + recall + 1e-7)

    def reset_state(self):
        self.tp.assign(0); self.fp.assign(0); self.fn.assign(0)
```

**Custom Callback — logging to external service every N steps**

```python
import tensorflow as tf

class WandbLogger(tf.keras.callbacks.Callback):
    def __init__(self, log_every=50):
        super().__init__()
        self.log_every = log_every

    def on_train_batch_end(self, batch, logs=None):
        if batch % self.log_every != 0: return
        # logs is a dict of metric->value; clone and forward
        wandb.log({**logs, "batch": batch}, step=self.model.optimizer.iterations.numpy())

    def on_epoch_end(self, epoch, logs=None):
        wandb.log({**logs, "epoch": epoch})

# Use in model.fit(..., callbacks=[WandbLogger(log_every=50)])
```

## Error Handling

**Side effects in @tf.function — use tf.print, not print**

```python
import tensorflow as tf

# BAD: Python print fires only on trace, then never again
@tf.function
def bad_train_step(x, y):
    print("tracing!")                       # runs ONCE during tracing
    with tf.GradientTape() as tape:
        loss = loss_fn(y, model(x))
    return loss

# GOOD: tf.print becomes a graph node, runs every step
@tf.function
def good_train_step(x, y):
    with tf.GradientTape() as tape:
        loss = loss_fn(y, model(x))
    tf.print("step loss:", loss)            # fires per call
    grads = tape.gradient(loss, model.trainable_weights)
    opt.apply_gradients(zip(grads, model.trainable_weights))
    return loss

# To debug tracing itself, force eager mode temporarily:
#   tf.config.run_functions_eagerly(True)
```

**Retracing storms — pin input_signature to prevent re-tracing on shape changes**

```python
import tensorflow as tf

# BAD: retraces on every new batch shape (variable-length text)
@tf.function
def step_var(x):
    return model(x)

# GOOD: input_signature pins the contract; same graph for any batch size
@tf.function(input_signature=[
    tf.TensorSpec([None, 224, 224, 3], tf.float32),
])
def step_fixed(x):
    return model(x)

# For ragged text, pad to a fixed length or use tf.RaggedTensor in the signature:
@tf.function(input_signature=[
    tf.RaggedTensorSpec(shape=[None, None], dtype=tf.int32, ragged_rank=1),
])
def step_ragged(x):
    return model(x)
```

**NaN detection — guard against fp16 overflow + logit explosion**

```python
import tensorflow as tf

def safe_loss(y_true, logits):
    # fp16 logits can overflow if the head isn't cast to fp32 under mixed_float16
    logits = tf.cast(logits, tf.float32)
    loss = loss_fn(y_true, logits)
    nan_mask = tf.math.is_finite(loss)
    safe_loss = tf.boolean_mask(loss, nan_mask)
    if tf.reduce_any(~nan_mask):
        tf.print("WARNING:", tf.reduce_sum(tf.cast(~nan_mask, tf.int32)),
                 "non-finite samples skipped")
    # Return mean of finite losses; fallback to zero if all bad
    return tf.cond(tf.size(safe_loss) > 0,
                   lambda: tf.reduce_mean(safe_loss),
                   lambda: tf.constant(0.0))
```

**OOM recovery — gradient checkpointing + cache cleanup**

```python
import tensorflow as tf

# Memory-saving gradient checkpointing for transformer-style models
# (recomputes activations during backward instead of storing them)
from tensorflow.keras.layers import Layer

class CheckpointedBlock(Layer):
    """Recompute forward in backward to trade compute for memory."""
    def __init__(self, block, **kwargs):
        super().__init__(**kwargs)
        self.block = block

    def call(self, x, training=False):
        @tf.recompute_grad
        def f(x):
            return self.block(x, training=training)
        return f(x)

# For OOM on GPU: lower batch size, enable gradient accumulation,
# and switch mixed precision to mixed_bfloat16 (no loss scaling, fewer paths to overflow)
```

## Concurrency Model

**MirroredStrategy — synchronous data-parallel across GPUs on one host**

```python
import tensorflow as tf

strategy = tf.distribute.MirroredStrategy()
print(f"replicas: {strategy.num_replicas_in_sync}")

with strategy.scope():
    model = build_model()                  # Variables created here are mirrored
    opt = tf.keras.optimizers.Adam(1e-3)
    model.compile(optimizer=opt, loss=loss_fn, metrics=["accuracy"])

# Dataset auto-shards across replicas; grads all-reduced via NCCL under the hood
model.fit(train_ds, epochs=10, validation_data=val_ds)
```

**MultiWorkerMirroredStrategy — multi-host training with TF_CONFIG**

```python
import os, json, tensorflow as tf

# Each worker process has its own TF_CONFIG env var:
#   {"cluster": {"worker": ["host1:1234", "host2:1234"]},
#    "task": {"type": "worker", "index": 0}}
tf_config = json.loads(os.environ["TF_CONFIG"])
strategy = tf.distribute.MultiWorkerMirroredStrategy()

with strategy.scope():
    model = build_model()
    model.compile(optimizer="adam", loss="mse")

# Dataset must be sharded by per-worker batch size and seeded by task index
per_worker_batch = 64
global_batch = per_worker_batch * strategy.num_replicas_in_sync
ds = make_ds(global_batch)

model.fit(ds, epochs=10, callbacks=[tf.keras.callbacks.BackupAndRestore(backup_dir="/tmp/bk")])
# BackupAndRestore survives preemptions by checkpointing at epoch boundaries
```

**TPUStrategy — synchronous training on TPU pods (8 replicas per v4 chip)**

```python
import tensorflow as tf

resolver = tf.distribute.cluster_resolver.TPUClusterResolver(tpu="node-1")
tf.config.experimental_connect_to_cluster(resolver)
tf.tpu.experimental.initialize_tpu_system(resolver)
strategy = tf.distribute.TPUStrategy(resolver)
print(f"replicas: {strategy.num_replicas_in_sync}")   # 8 for single v4-8

with strategy.scope():
    model = build_model()                  # TPU-compiled via XLA
    model.compile(optimizer="adam", loss="mse")

# TPU needs GCS-hosted data (gs:// paths) — TFRecord sharded across GCS buckets
ds = tf.data.TFRecordDataset("gs://bucket/shard-*.tfrec")
model.fit(ds, epochs=10)
```

**tf.data parallelism — interleaved reads, parallel decode, prefetch**

```python
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE

ds = (tf.data.Dataset.list_files("shard-*.tfrec", shuffle=True)
        .interleave(
            lambda p: tf.data.TFRecordDataset(p, compression_type="GZIP"),
            num_parallel_calls=AUTOTUNE,    # parallel file reads
            cycle_length=16, deterministic=False)
        .map(parse_fn, num_parallel_calls=AUTOTUNE)
        .batch(64, drop_remainder=True)
        .prefetch(AUTOTUNE)                # overlap data prep with training step
        .apply(tf.data.experimental.assert_cardinality(num_shards * 1024)))

# Options propagate to the source dataset and its shards:
options = tf.data.Options()
options.experimental_optimization.map_parallelization = True
options.threading.private_threadpool_size = 32
ds = ds.with_options(options)
```

## Testing Patterns

**Numerical gradient check — finite differences vs GradientTape**

```python
import tensorflow as tf
import numpy as np

def numerical_grad(f, x, eps=1e-4):
    """Finite-difference gradient of scalar f() w.r.t. tf.Variable x."""
    arr = x.numpy().copy()
    g = np.zeros_like(arr)
    it = np.nditer(arr, flags=["multi_index"], op_flags=["readwrite"])
    while not it.finished:
        i = it.multi_index
        orig = arr[i]
        arr[i] = orig + eps; x.assign(arr); f_plus  = f().numpy()
        arr[i] = orig - eps; x.assign(arr); f_minus = f().numpy()
        arr[i] = orig
        g[i] = (f_plus - f_minus) / (2 * eps)
        it.iternext()
    x.assign(arr)  # restore original
    return g

# Compare analytic vs numerical for a custom op
x = tf.Variable(tf.random.normal((4, 3)))
with tf.GradientTape() as tape:
    y = tf.reduce_sum(tf.nn.sigmoid(x @ tf.eye(3)))
analytic = tape.gradient(y, x).numpy()
numerical = numerical_grad(lambda: tf.reduce_sum(tf.nn.sigmoid(x @ tf.eye(3))), x)
np.testing.assert_allclose(analytic, numerical, atol=1e-3)
```

**tf.test.TestCase — the standard unit-test base**

```python
import tensorflow as tf

class MyLayerTest(tf.test.TestCase):
    def setUp(self):
        super().setUp()
        self.layer = MLPSwiGLU(hidden=32)

    def test_output_shape(self):
        x = tf.random.normal((8, 16))
        y = self.layer(x)                  # triggers build()
        self.assertShapeEqual(y, x)        # residual: same shape as input

    def test_gradients_flow(self):
        x = tf.random.normal((8, 16))
        with tf.GradientTape() as tape:
            y = self.layer(x)
            loss = tf.reduce_sum(y)
        grads = tape.gradient(loss, self.layer.trainable_weights)
        for g in grads:
            self.assertIsNotNone(g)
            self.assertTrue(tf.reduce_all(tf.math.is_finite(g)))

if __name__ == "__main__":
    tf.test.main()
```

**Numerical stability tests — softmax, log_softmax, large logits**

```python
import tensorflow as tf

def test_softmax_finite_for_huge_logits():
    x = tf.constant([1e4, 1e4, 1e4], dtype=tf.float32)
    p = tf.nn.softmax(x)
    assert tf.reduce_all(tf.math.is_finite(p)).numpy()
    assert abs(float(tf.reduce_sum(p)) - 1.0) < 1e-5

def test_log_softmax_matches_log_of_softmax():
    x = tf.random.normal((1000,))
    a = tf.nn.log_softmax(x).numpy()
    b = tf.math.log(tf.nn.softmax(x) + 1e-30).numpy()
    np.testing.assert_allclose(a, b, atol=1e-5)

def test_bfloat16_no_overflow_under_mixed_policy():
    tf.keras.mixed_precision.set_global_policy("mixed_bfloat16")
    try:
        big = tf.constant([1e10, -1e10], dtype=tf.bfloat16)
        # bf16 has fp32 range so this should NOT overflow to inf
        assert tf.reduce_all(tf.math.is_finite(tf.nn.softmax(big))).numpy()
    finally:
        tf.keras.mixed_precision.set_global_policy("float32")
```

**Distributed-training sanity — same seed gives same weights across replicas**

```python
import tensorflow as tf

def test_init_consistent_across_replicas(strategy):
    with strategy.scope():
        tf.random.set_seed(42)
        m1 = build_model()
    # Reset seed and build again — weights must match across replicas
    with strategy.scope():
        tf.random.set_seed(42)
        m2 = build_model()
    for w1, w2 in zip(m1.weights, m2.weights):
        tf.debugging.assert_near(w1, w2, atol=1e-6, rtol=1e-6)

def test_one_batch_produces_finite_grads(strategy):
    with strategy.scope():
        model = build_model()
        opt = tf.keras.optimizers.Adam(1e-3)
    @tf.function
    def step(x, y):
        with tf.GradientTape() as tape:
            loss = loss_fn(y, model(x, training=True))
        grads = tape.gradient(loss, model.trainable_weights)
        for g in grads:
            tf.debugging.assert_all_finite(g, "non-finite gradient")
        opt.apply_gradients(zip(grads, model.trainable_weights))
    strategy.run(step, args=next(iter(dist_ds)))
```

## Performance Tuning

- @tf.function gives 5-10x speedup over eager; first call always traces (slow), subsequent calls reuse the cached graph.
- tf.function(jit_compile=True) invokes XLA — can fuse elementwise+reduction chains 2-4x, but recompiles for each new static shape.
- tf.data.AUTOTUNE lets the runtime pick buffer sizes — always prefer it over hand-tuned values for prefetch/num_parallel_calls.
- End every tf.data pipeline with .batch(B).prefetch(AUTOTUNE) to overlap host data prep with device compute — free 10-30% throughput.
- Mixed-precision policy 'mixed_float16' gives 1.5-3x speed + 2x memory on Ampere/Hopper; pair with OutputLayer to keep logits in fp32.
- mixed_bfloat16 matches mixed_float16 in speed but skips the loss-scaling machinery — simpler code, no overflow risk, slightly less precision.
- Per-step overhead: eager ~= 50-200 us/op, graph ~= 5-20 us/op — matters most in RL and short-step training.
- SavedModel is the deploy artifact: directory with saved_model.pb (graph), variables/ (weights), and assets/ (vocab files).
- MirroredStrategy = synchronous NCCL all-reduce on one host; for multi-host use MultiWorkerMirroredStrategy; for TPU use TPUStrategy (8 replicas per v4 chip).
- TPUs need static shapes everywhere — pad to multiples of 128 (embeddings) or 8 (images) or you get recompilation storms.
- tf.train.Checkpoint is object-based (survives renames); SavedModel is graph-based (portable but stricter). Use both: Checkpoint mid-training, SavedModel for deploy.
- tf.profiler with TensorBoard: profile batches 5-15 (skip warmup) — the memory viewer and op-level timeline are the standard tools.
- Dataset.cache() before .map() saves in-memory datasets from re-decoding; cache after .map() recomputes the same augmentation every epoch (usually wrong).
- GradientTape is one-shot by default; pass persistent=True to call .gradient() multiple times (higher-order grads, multi-loss heads).
- tf.function inside a Python loop retraces per iteration if the Python variable changes; hoist tracing out and rebind inputs via Tensor arguments.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Keras 3](https://keras.io/keras_3/) | Multi-backend high-level API on top of TF, JAX, and PyTorch — the future-facing Keras interface. | build |
| [tf.data](https://www.tensorflow.org/guide/data) | First-party input pipeline API — lazy, parallel, prefetching; the only correct way to feed large datasets. | build |
| [tf.distribute](https://www.tensorflow.org/guide/distributed_training) | Distributed training strategies: MirroredStrategy, MultiWorkerMirroredStrategy, TPUStrategy, ParameterServerStrategy. | build |
| [TFX (TensorFlow Extended)](https://www.tensorflow.org/tfx) | End-to-end MLOps pipeline: data validation, transformation, training, serving, monitoring. | deploy |
| [TF-Serving](https://www.tensorflow.org/tfx/guide/serving) | C++ production serving binary — handles batching, versioning, multiple models, gRPC + REST. | deploy |
| [TFLite](https://www.tensorflow.org/lite) | On-device inference for Android/iOS/edge — quantized models, hardware delegates (GPU, NNAPI, CoreML). | deploy |
| [TF.js](https://www.tensorflow.org/js) | TensorFlow in the browser and Node.js — WebGL/WASM backends, model import from Python TF. | deploy |
| [XLA](https://www.tensorflow.org/xla) | Just-in-time op fusion compiler — jit_compile=True; big speedups on TPU and fused reductions. | build |
| [TensorBoard](https://www.tensorflow.org/tensorboard) | Built-in visualization: scalars (loss/metric), histograms (weights), profiler (op-level timeline), projector (embeddings). | debug |
| [tf.profiler](https://www.tensorflow.org/guide/profiler) | Per-op CPU/CPU/GPU time, memory, and input-pipeline analysis — exports Chrome trace + TensorBoard UI. | debug |
| [HuggingFace Transformers (TF backend)](https://huggingface.co/docs/transformers/en/main_classes/tf_model) | Largest LLM hub — most models ship a TFTorchModel class for native TF training. | build |
| [TensorFlow Datasets (TFDS)](https://www.tensorflow.org/datasets) | Standardized download+prep+tf.data.Dataset for hundreds of public datasets. | build |
| [ML Metadata](https://www.tensorflow.org/tfx/ml_metadata) | Track artifacts (datasets, models, metrics) and their lineage across TFX pipeline runs. | deploy |
| [TensorFlow Hub](https://www.tensorflow.org/hub) | Hub of reusable SavedModels (text embeddings, image feature extractors) ready to fine-tune. | build |
| [JAX](https://jax.readthedocs.io/) | Google's successor numerical library — XLA-native, functional API; Flax is its Keras-equivalent. | build |
| [Flax](https://flax.readthedocs.io/) | Neural network library on top of JAX; a common destination for TF users wanting XLA + functional transforms. | build |
| [ONNX Runtime](https://onnxruntime.ai/) | Cross-framework inference — convert SavedModel via tf2onnx for serving outside Google's stack. | deploy |
| [Weights & Biases](https://wandb.ai/site/integrations/keras) | Experiment tracking — integrates with Keras callbacks in 3 lines, syncs across distributed runs. | debug |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.6 | 2015 | Initial public release — DistBelief successor, dataflow graphs, sessions. |
| 1.0 | 2016 | First stable — Google Brain whitepaper, distributed training, TensorBoard. |
| 1.4 | 2017 | Eager execution preview (tf.contrib.eager); tf.data API introduced. |
| 1.12 | 2018 | tf.keras becomes the official high-level API; Eager execution default in tf.contrib. |
| 1.15 | 2019 | Last 1.x release; long-term support branch for legacy code; tf.estimator frozen. |
| 2.0 | 2019 | Eager by default; @tf.function tracing; Keras unified; removed sessions and 1.x graph API. |
| 2.2 | 2020 | Custom training loop with GradientTape; Keras was the only model API. |
| 2.4 | 2020 | CUDA 11 + cuDNN 8; mixed precision GA; experimental distribute coordinator. |
| 2.5 | 2021 | Keras MixedPrecision policy stable; modern SavedModel format. |
| 2.6 | 2021 | Keras split into separate pip package (keras ~= tf.keras); NumPy API in tf.experimental.numpy. |
| 2.8 | 2022 | tf.data service for distributed preprocessing; experimental DTensor. |
| 2.10 | 2022 | Scaled_dot_product_attention added (FlashAttention on GPU); Apple Silicon GPU support. |
| 2.11 | 2022 | AdamW optimizer added; Keras modeling fixes; integer quantization APIs expanded. |
| 2.12 | 2023 | Python 3.11 support; experimental DTensor-based Keras; expanded oneDAL CPU kernels. |
| 2.13 | 2023 | Last release before Keras 3 split; tf.keras kept as legacy single-backend path. |
| 2.14 | 2023 | Keras 3 preview; experimental tf.keras.src namespace; Python 3.12 support. |
| 2.15 | 2023 | Keras 2.x final stabilization; migration path to Keras 3 documented. |
| 2.16 | 2024 | Keras 3 default ('import keras'); multi-backend support (JAX, TF, PyTorch, NumPy). |
| 2.17 | 2024 | Keras 3.4+ default; expanded tf.data ops; continued XLA improvements for LLMs. |
| 2.18 | 2025 | Stabilized distributed training APIs; DTensor-on-Keras path maturing for SPMD. |
| 2.21 | 2026 | Current stable: Python 3.9 dropped, TFLite int2/int4/uint4 quantized ops, JPEG XL decode in tf.image; 2.22-rc adds Python 3.14 and CUDA 13. |

## Interview Hot Questions

1. **What's the difference between tf.function, tf.py_function, and AutoGraph?** *(medium)*

   @tf.function traces the Python body into a graph on first call; subsequent calls reuse the cached graph. AutoGraph (built in) converts Python if/for/while into tf.cond/tf.while_loop during tracing. tf.py_function is the escape hatch: it runs Python code inside the graph (e.g. calling NumPy), but breaks XLA compilation and is slow — avoid it in hot paths.

2. **When does @tf.function retrace, and how do you prevent it?** *(medium)*

   Retracing fires on each unique Python value (not Tensor) that flows in — variable batch shapes, Python ints, list lengths. Prevent with: (1) input_signature= in @tf.function to pin TensorSpecs (Tensors then become graph inputs, not trace keys); (2) tf.TensorSpec with None dims for variable shapes; (3) reduce_on_plateau that passes Python scalars as Tensors. Watch for retrace warnings during dev.

3. **How does MirroredStrategy differ from MultiWorkerMirroredStrategy and TPUStrategy?** *(medium)*

   MirroredStrategy: single-host multi-GPU, NCCL all-reduce, variables mirrored (full copy per replica). MultiWorkerMirroredStrategy: multi-host, same algorithm, requires TF_CONFIG env var for cluster topology, BackupAndRestore for preemption recovery. TPUStrategy: TPU pods (8 replicas per v4 chip), needs static shapes, GCS-hosted data, XLA compilation. All share the strategy.scope() + strategy.run() API.

4. **Why use Checkpoint vs SavedModel?** *(easy)*

   tf.train.Checkpoint is object-based — it serializes Variables by attribute path, survives renames and refactors, and stores optimizer state. SavedModel is graph-based — it bundles the @tf.function graph + Variables + signatures into a deployable directory. Use Checkpoint for mid-training recovery (fast, frequent, mutable), SavedModel for serving artifacts (portable, frozen, ready for TF-Serving/TFLite/TF.js).

5. **How does mixed precision work in TF and what's the catch with fp16?** *(medium)*

   Set tf.keras.mixed_precision.set_global_policy('mixed_float16'): layers compute in fp16 but Variables stay fp32 (master weights). The catch: fp16 has ±65504 range, so logits overflow easily — the final Dense must be dtype='float32' (or use OutputLayer). Loss scaling handles gradient underflow automatically via tf.train.LossScaleOptimizer wrapping your optimizer. mixed_bfloat16 has the same speed without these catches (no overflow, no scaling), but only on Ampere+ GPUs and TPUs.

6. **What is XLA and when does jit_compile=True hurt?** *(hard)*

   XLA (Accelerated Linear Algebra) is TF's JIT compiler: it fuses elementwise + reduction ops into single GPU kernels, eliminates intermediate buffers, and can autotune. jit_compile=True forces every op in the @tf.function through XLA. It HURTS when: (1) shapes are dynamic — XLA recompiles per shape, causing multi-second stalls; (2) ops lack XLA kernels (some tf.text ops, sparse ops); (3) the function is called once and never reused (compile cost > benefit).

7. **How does tf.data overlap data prep with training?** *(medium)*

   Prefetch(AUTOTUNE) runs the next-batch prep in a background thread/CPU while the current batch trains on GPU. Beyond prefetch: .map(fn, num_parallel_calls=AUTOTUNE) parallelizes per-element transforms; .interleave() parallelizes across files; options.experimental_optimization.map_fusion merges adjacent maps. The model should never wait for data — profile with tf.data.experimental.StatsAggregator to verify.

8. **What's the difference between tf.keras and Keras 3?** *(medium)*

   tf.keras (legacy) is the Keras API bundled with TF — single-backend, TF-only, frozen at 2.x. Keras 3 ('import keras', 2024) is a separate package supporting TF, JAX, and PyTorch backends via keras.config.set_backend. Keras 3 lets you train on JAX (for XLA + pmap) and serve on TF (for TF-Serving). TF 2.16+ ships Keras 3 as the default; tf.keras is preserved for backward compat but is no longer the recommended path.

9. **How would you debug a slow @tf.function?** *(hard)*

   (1) Run eager first to confirm correctness: tf.config.run_functions_eagerly(True). (2) Check for retracing — add a print() at the top (fires only on trace) and count occurrences. (3) Profile with tf.profiler: look for (a) op-launch overhead (too many small ops → fuse with XLA), (b) host-side stalls (data prep not overlapping → fix tf.data prefetch), (c) memory pressure (smaller batch or gradient checkpointing). (4) Compare eager vs graph times — if they're close, the graph isn't helping.

10. **Why does TPUStrategy require static shapes, and how do you handle variable-length sequences?** *(hard)*

   TPUs compile each unique shape into a separate XLA program; recompiles take seconds. Pad sequences to a fixed max length (the standard NLP recipe) or to a multiple of 128/8 (TPU-friendly). For truly variable shapes, use bucketed batching: pad within each bucket, switch buckets between programs. Never pad to global max — you'll waste 99% of compute. For images, use fixed HxW and pad masks for non-square inputs.

## When to Choose This

- **vs PyTorch:** use this — TPU training, mobile/edge deployment (TFLite), production serving at Google scale, extending BERT/T5/Gemini internals.; use that — Research code, custom architectures, when you need to read/modify gradients inline, LLM/diffusion work where the ecosystem momentum is here.
- **vs JAX:** use this — Mature serving (TF-Serving, TFLite), mobile/edge targets, when you want the Keras high-level API as the default.; use that — Pure functional transforms (vmap, pmap, grad-of-grad), massive SPMD model parallelism, XLA-native programming without eager overhead.
- **vs Keras 3:** use this — Custom training loops with GradientTape, distribution strategies, low-level op control, when .fit() isn't enough.; use that — Rapid prototyping, multi-backend portability (train on JAX, serve on TF), when the .compile()/.fit() trinity covers 90% of your needs.
- **vs scikit-learn:** use this — Deep learning (any architecture with layers), gradient-based optimization, GPU/TPU compute, anything larger than ~1M parameters.; use that — Tabular data baselines, classical ML (RF, XGBoost-style), preprocessing pipelines, model selection with grid search.
- **vs ONNX Runtime:** use this — Training, model development, when you need TF-specific features (TPU, TFLite, TF.js ecosystem).; use that — Pure inference on CPU/edge/embedded, cross-language serving (C#/Java/JS), maximum inference throughput without Python in the path.

