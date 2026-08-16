import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "tensorflow",
  name: "TensorFlow",
  category: "ml-ai",
  tier: "ml",
  tags: ["deep-learning", "autodiff", "gpu", "tpu", "neural-networks", "production", "google", "tensor"],
  tagline: "End-to-end ML platform with eager execution, graph compilation via tf.function, and a battle-tested serving stack.",
  year: 2015,
  author: "Google Brain",

  tldr: [
    "TensorFlow is a numerical computing platform where every op is a node in a dataflow graph; since 2.0 it executes eagerly by default and compiles to graphs on demand via @tf.function.",
    "It is the foundation of Google's production ML stack — TPU training, TensorFlow Serving, TFLite (mobile), and TF.js (browser) all consume the same SavedModel artifact.",
    "Reach for it when you need TPUs, mobile/edge deployment, robust serving infrastructure, or you are extending a Google-authored model (BERT, T5, Gemini internals).",
    "Avoid it for new research code where PyTorch has the ecosystem momentum, or if you only need classical ML (use scikit-learn). Keras 3 (2023) now gives a unified API across TF, JAX, and PyTorch backends.",
  ],

  mentalModel: {
    title: "Eager Python ops that trace into a stateful dataflow graph",
    body: "Every `tf.*` call in 2.x immediately executes and returns a concrete Tensor — easy to debug with print and pdb. Wrap a function in @tf.function and AutoGraph re-traces it into a static graph: Python control flow becomes tf.cond / tf.while_loop, and the resulting graph is cached by input signature for fast re-execution. State lives in tf.Variable objects (mutable, persist across calls) rather than in Python closures, which is why distribution and checkpointing can serialize a model independently of the code that built it.",
  },

  constructs: [
    { syntax: "tf.constant([[1, 2], [3, 4]])", behavior: "Immutable tensor; lives on the default device (CPU if no GPU).", when: "Constants and inputs; use tf.Variable for anything trainable." },
    { syntax: "tf.Variable(initial_value)", behavior: "Mutable, named tensor that holds state across calls — the only thing optimizers update.", when: "Model weights, moving averages, batchnorm stats. Always create inside a strategy.scope()." },
    { syntax: "with tf.GradientTape() as tape: ...", behavior: "Records forward ops on trainable variables; tape.gradient(loss, vars) returns grads.", when: "Custom training loops — the only way to get gradients in 2.x. Use persistent=True for multiple .gradient() calls." },
    { syntax: "@tf.function\ndef train_step(x, y): ...", behavior: "Traces the function into a graph on first call, caches by signature, reuses thereafter.", when: "Hot loops — 5–10× faster than eager. Avoid side effects (prints, external Python state) inside; they only fire on trace." },
    { syntax: "tf.data.Dataset.from_tensor_slices(x).shuffle(1000).batch(64).prefetch(AUTOTUNE)", behavior: "Builds a lazy, prefetching input pipeline that runs in C++ threads separate from the training step.", when: "Always — feeding Python lists to .fit() is fine for toys but doesn't overlap data and compute." },
    { syntax: "class L(tf.keras.layers.Layer):\n  def build(self, shape): ...\n  def call(self, x): ...", behavior: "Custom layer — build() creates weights lazily (input-shape-aware), call() defines forward.", when: "Anything beyond stacked Dense; prefer over raw tf ops for checkpointing and serialization." },
    { syntax: "tf.keras.Model(inputs, outputs)", behavior: "Functional API — graph of layers, supports multi-input/output and branching.", when: "Non-linear topologies; for simple stacks use tf.keras.Sequential." },
    { syntax: "model.compile(optimizer, loss, metrics); model.fit(ds, epochs=10)", behavior: "Configures and runs the built-in training loop with callbacks, validation, distributed training.", when: "Standard supervised training — 90% of cases. Drop to GradientTape only for custom losses or RL." },
    { syntax: "tf.train.Checkpoint(model=m, opt=o).write('ckpt')", behavior: "Object-based save — restores by variable name, survives renames better than SavedModel.", when: "Training checkpoints. Use SavedModel for serving artifacts." },
    { syntax: "tf.saved_model.save(model, 'm')", behavior: "Serializes graph + weights + signatures into a portable directory.", when: "Production serving (TF Serving, TFLite conversion, TF.js). The canonical deploy unit." },
    { syntax: "strategy = tf.distribute.MirroredStrategy()", behavior: "Synchronous data-parallel training across GPUs on one machine — variables are mirrored, grads all-reduced via NCCL.", when: "Single-host multi-GPU. For multi-host use MultiWorkerMirroredStrategy or TPUStrategy." },
    { syntax: "tf.config.set_visible_devices([], 'GPU')", behavior: "Hides GPUs from this process — forces CPU execution.", when: "CI, debugging, or running alongside another GPU process." },
    { syntax: "tf.function(jit_compile=True)(fn)", behavior: "Compiles the traced graph with XLA — fuses ops, sometimes large speedups on TPU and GPU.", when: "Hot paths with static shapes; can hurt if shapes are dynamic (recompiles)." },
  ],

  patterns: [
    {
      lang: "python",
      caption: "Custom training step with GradientTape — the 2.x idiomatic loop",
      code: `import tensorflow as tf

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
)`,
    },
    {
      lang: "python",
      caption: "tf.data pipeline with prefetch overlap and augmentation",
      code: `import tensorflow as tf

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
# .prefetch(AUTOTUNE) means the next batch is prepared while current is training`,
    },
    {
      lang: "python",
      caption: "Multi-GPU with MirroredStrategy — model built inside scope",
      code: `import tensorflow as tf

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
model.fit(train_ds, epochs=10, validation_data=val_ds)`,
    },
    {
      lang: "python",
      caption: "Checkpoint save/restore for resumable training",
      code: `import tensorflow as tf

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
    mgr.save()                        # rotates checkpoints, keeps last 3`,
    },
    {
      lang: "python",
      caption: "Save a serving-ready SavedModel with a concrete signature",
      code: `import tensorflow as tf

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
# TF Serving, TFLite Converter, and TF.js can now all load this directory`,
    },
  ],

  pitfalls: [
    {
      title: "Side effects in @tf.function fire only on trace",
      symptom: "print() inside a @tf.function runs once (during tracing), not per batch — debug logs appear to be missing or stale.",
      fix: "Use tf.print(...) which becomes a graph node and executes per call. Or wrap the function body in tf.config.run_functions_eagerly(True) while debugging.",
    },
    {
      title: "tf.Variable created outside strategy.scope() not distributed",
      symptom: "Multi-GPU training trains only on the first GPU; strategy.num_replicas_in_sync is correct but nvidia-smi shows one GPU idle.",
      fix: "Build the model AND call .compile() inside `with strategy.scope():`. Variables created outside are local and never mirrored.",
    },
    {
      title: "Calling .numpy() inside @tf.function",
      symptom: "RuntimeError: 'numpy()' is only available when eager execution is enabled — happens when you mix eager idioms into a graph-compiled function.",
      fix: "Compute everything with tf ops inside @tf.function. Move any numpy/Python logic outside, or pass values as Tensors in and return Tensors out.",
    },
    {
      title: "Shape mismatch retraces @tf.function on every call",
      symptom: "Training is slow and you see 'tracing' warnings repeatedly; each unique input shape re-traces the graph.",
      fix: "Pad batches to a fixed shape (common in NLP) or specify input_signature in @tf.function so unknown shapes don't trigger retracing. Use tf.data with .padded_batch for variable-length data.",
    },
    {
      title: "Forgot .prefetch(AUTOTUNE) — GPU starves",
      symptom: "GPU utilization oscillates between 30% and 100%; step time is dominated by host data prep, not compute.",
      fix: "End every tf.data pipeline with `.batch(B).prefetch(tf.data.AUTOTUNE)`. Also use .cache() before .map() for in-memory datasets and .interleave() for many files.",
    },
    {
      title: "Mixed tf.keras and Keras 3 imports",
      symptom: "Layers behave subtly differently; checkpoints from one don't load in the other; TF-specific features (mixed precision, distribution) silently no-op.",
      fix: "Pick one and stick to it. Keras 3 (`import keras`) is the future and supports JAX/PyTorch backends; tf.keras (`from tensorflow import keras`) is the legacy single-backend path frozen at 2.x.",
    },
    {
      title: "Soft placement hides GPU→CPU fallback",
      symptom: "Model runs but is slower than expected; some ops silently execute on CPU because no GPU kernel exists.",
      fix: "Set `tf.config.set_soft_device_placement(False)` during development to surface the error. Check `tf.test.is_gpu_available()` and per-op device with tf.profiler.",
    },
  ],

  quickReference: [
    { fact: "@tf.function gives 5–10× speedup over eager; first call always traces (slow), subsequent calls reuse the cached graph.", tag: "perf" },
    { fact: "tf.data.AUTOTUNE lets the runtime pick buffer sizes — always prefer it over hand-tuned values for prefetch/num_parallel_calls.", tag: "perf" },
    { fact: "SavedModel is the deploy artifact: directory with saved_model.pb (graph), variables/ (weights), and assets/ (vocab files). Loaded by name and version.", tag: "version" },
    { fact: "tf.function(jit_compile=True) invokes XLA — can fuse elementwise+reduction chains 2–4×, but recompiles for each new static shape.", tag: "perf" },
    { fact: "MirroredStrategy = synchronous all-reduce (NCCL); TPUStrategy = 8 replicas per TPU v4 chip; MultiWorkerMirroredStrategy for multi-host.", tag: "version" },
    { fact: "Default Keras Adam lr=0.001; AdamW added in 2.11; weight_decay (not decay) is the correct arg name.", tag: "gotcha" },
    { fact: "mixed_precision policy 'mixed_float16' needs the last Dense layer cast to float32 (OutputLayer handles this) — otherwise logits overflow.", tag: "gotcha" },
    { fact: "GradientTape is one-shot by default; pass persistent=True to call .gradient() multiple times (higher-order grads, multi-loss heads).", tag: "complexity" },
    { fact: "TF 2.x default is eager; tf.compat.v1.disable_v2_behavior() exists for migrating 1.x code, not for new projects.", tag: "version" },
    { fact: "Per-step overhead: eager ≈ 50–200 µs/op, graph ≈ 5–20 µs/op — matters most in RL and short-step training.", tag: "perf" },
    { fact: "Variable dtypes: tf.float32 default; mixed_bfloat16 on TPU/CPU, mixed_float16 on GPU. float16 alone (not mixed) underflows easily.", tag: "gotcha" },
    { fact: "Keras 3 (2023) is multi-backend — `import keras` not `from tensorflow import keras`. Same API, swappable backend via keras.config.set_backend.", tag: "version" },
    { fact: "tf.train.Checkpoint is object-based (survives renames); SavedModel is graph-based (portable but stricter). Use both: Checkpoint mid-training, SavedModel for deploy.", tag: "gotcha" },
    { fact: "TPUs need static shapes everywhere — pad to multiples of 128 (for embeddings) or 8 (for images) or you get recompilation storms.", tag: "gotcha" },
    { fact: "input_signature in @tf.function prevents retracing on shape changes — required for production code that may see variable batch sizes.", tag: "gotcha" },
  ],

  goDeeper: [
    { title: "TensorFlow Official Documentation", url: "https://www.tensorflow.org/guide", note: "The Guide section is canonical — read 'Introduction to Graphs and Functions', 'Better performance with tf.data', and 'Distributed training'." },
    { title: "TensorFlow: A System for Large-Scale Machine Learning (OSDI 2016)", url: "https://www.usenix.org/system/files/conference/osdi16/osdi16-abadi.pdf", note: "The original TensorFlow whitepaper — explains dataflow graph, sessions, and the design rationale." },
    { title: "Better Performance with the tf.data API", url: "https://www.tensorflow.org/guide/data_performance", note: "Official deep dive on pipelining, parallelism, and prefetching — read before profiling training throughput." },
    { title: "Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow (Aurélien Géron)", url: "https://www.oreilly.com/library/view/hands-on-machine-learning/9781098125967/", note: "The canonical practitioner book; chapters 10–14 are the most-used TF/Keras tutorial in industry." },
    { title: "XLA: Optimizing Compiler for Machine Learning", url: "https://www.tensorflow.org/xla", note: "Authoritative doc on XLA compilation — explains jit_compile, clustering, and the tradeoffs of static shapes." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "tf.float32", behavior: "32-bit IEEE float — the default for trainable Variables and almost all training.", when: "Default everywhere. Mixed-precision policies change compute dtype without changing the Variable dtype." },
      { syntax: "tf.float16", behavior: "16-bit float — 5 exponent + 10 mantissa bits. Range ±65504, prone to overflow.", when: "Mixed precision on GPU (policy 'mixed_float16'); the last Dense must stay float32 to avoid logit overflow." },
      { syntax: "tf.bfloat16", behavior: "16-bit float — 8 exponent + 7 mantissa bits. Same range as fp32, lower precision.", when: "TPU default; 'mixed_bfloat16' policy on CPU/GPU (Ampere+). No loss scaling needed." },
      { syntax: "tf.float64 (tf.double)", behavior: "64-bit IEEE double — XLA supports it but kernels are sparse on GPU.", when: "Numerical-grad checks, scientific computing; never for training." },
      { syntax: "tf.int64", behavior: "64-bit signed int — the default for sparse categorical labels and embedding indices.", when: "Targets for SparseCategoricalCrossentropy, gather/scatter indices." },
      { syntax: "tf.int32", behavior: "32-bit signed int — used for shape arithmetic and many ops that don't need int64 range.", when: "Most integer ops where int64 is overkill; preferred over int64 for memory." },
      { syntax: "tf.int8 / tf.uint8", behavior: "8-bit signed / unsigned integer — quantization weights and image pixels.", when: "Quantization-aware training (int8), image data 0-255 (uint8)." },
      { syntax: "tf.bool", behavior: "Boolean — 1 byte per element. Returned by comparisons, used as a mask.", when: "tf.boolean_mask, tf.where conditions, attention padding masks." },
      { syntax: "tf.string", behavior: "Variable-length byte string tensor — atomic at the graph level.", when: "Raw text pipelines in tf.data; decode downstream with tf.strings.decode." },
    ],
    collections: [
      { syntax: "tf.Tensor", behavior: "Immutable multi-dim array with dtype, shape, and device — the central object.", when: "Every value flowing through ops; eager by default, becomes a graph node inside @tf.function." },
      { syntax: "tf.Variable", behavior: "Mutable, named tensor that holds state across calls — the only thing optimizers update.", when: "Model weights, moving averages, batchnorm stats. Always create inside a strategy.scope()." },
      { syntax: "tf.RaggedTensor", behavior: "Tensor with variable-length rows — backed by values + row splits.", when: "Batched NLP sequences of different lengths without padding; tf.keras handles it in many layers." },
      { syntax: "tf.SparseTensor", behavior: "Sparse matrix — values + indices + dense_shape, no zero storage.", when: "Large sparse features (recommendations, bag-of-words). Most ops have sparse variants." },
      { syntax: "tf.TensorArray", behavior: "Graph-side dynamic list of tensors with fixed dtype/shape — XLA-friendly.", when: "Inside @tf.function when you'd otherwise use a Python list (which breaks tracing)." },
      { syntax: "tf.data.Dataset", behavior: "Lazy, composable iterator of elements — runs in C++ threads separate from the training step.", when: "Always — feeding Python lists to .fit() doesn't overlap data and compute." },
      { syntax: "tf.TensorSpec", behavior: "Declarative (dtype, shape, name) tuple — used to declare input signatures.", when: "@tf.function(input_signature=...) and Keras Input layers; prevents retracing." },
      { syntax: "tf.lookup.StaticHashTable", behavior: "Immutable key→value map for vocab lookups inside the graph.", when: "Mapping tokens→ids without leaving the graph (faster than dict + py_function)." },
      { syntax: "tf.distribute.DistributedDataset", behavior: "Strategy-sharded iterator — each replica pulls its own batch.", when: "Returned by strategy.experimental_distribute_dataset(ds); the per-replica input for custom training loops." },
    ],
    custom: [
      { syntax: "class L(tf.keras.layers.Layer):\n  def build(self, shape): ...\n  def call(self, x): ...", behavior: "Custom layer — build() creates weights lazily (input-shape-aware), call() defines forward.", when: "Anything beyond stacked Dense; required for checkpointing and serialization." },
      { syntax: "class M(tf.keras.Model):\n  def train_step(self, data): ...", behavior: "Subclassed Model with a custom train_step — .fit() calls it, you keep distribution/callbacks for free.", when: "Custom losses, GANs, contrastive learning — anywhere the default loss(y, y_pred) doesn't fit." },
      { syntax: "class Loss(tf.keras.losses.Loss):\n  def call(self, y_true, y_pred): ...", behavior: "Custom loss returning per-sample values; reduce is handled by the framework.", when: "Custom objectives; subclass instead of writing a function to get serialization + reduction." },
      { syntax: "class Metric(tf.keras.metrics.Metric):\n  def update_state(self, y_true, y_pred): ...\n  def result(self): ...", behavior: "Stateful metric — accumulates across batches, resets between epochs.", when: "Custom metrics (F1, IoU); preferred over stateless functions when value depends on the full epoch." },
      { syntax: "@tf.function\ndef f(x): ...", behavior: "Traces Python into a graph on first call, caches by signature, reuses thereafter.", when: "Hot loops — 5-10× faster than eager. Avoid side effects (prints, Python state) inside; they fire only on trace." },
      { syntax: "class F(tf.Module):\n  def __call__(self, x): ...", behavior: "Lightweight container — auto-tracks tf.Variables; the base for Keras Layer and SavedModel exports.", when: "Serving modules without Keras overhead; tf.saved_model.save works on any tf.Module." },
      { syntax: "class CustomOptimizer(tf.keras.optimizers.Optimizer):\n  def update_step(self, grad, var, lr): ...", behavior: "Custom optimizer — implement update_step (2.11+); base class handles iterations, gradients, slot vars.", when: "Research optimizers; prefer subclassing over re-implementing Adam from scratch." },
      { syntax: "tf.train.Checkpoint(model=m, opt=o)", behavior: "Object-based checkpoint — restores by variable attribute path, survives renames better than SavedModel.", when: "Training checkpoints. Use SavedModel for serving artifacts." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, tf.add(a, b)", behavior: "Element-wise add with broadcasting; eager returns a Tensor, inside @tf.function adds a graph node.", when: "Math. Use tf.math.add_n for summing a list of tensors (var summation)." },
    { syntax: "a @ b, tf.matmul(a, b)", behavior: "Matrix multiply — 2D and batched forms; transpose_a/b flags avoid extra ops.", when: "Standard matmul. For attention use scaled_dot_product_attention (2.10+) which calls FlashAttention." },
    { syntax: "tf.einsum('bihd,bjhd->bij', q, k)", behavior: "Einstein summation — arbitrary tensor contractions in one call.", when: "Multi-tensor contractions (attention, GNNs). Compiles to a fusion of transposes + matmul." },
    { syntax: "tf.concat([a, b], axis=0)", behavior: "Concatenates tensors along an existing axis.", when: "Joining batches, features, sequence dims. Both tensors must share other dims." },
    { syntax: "tf.stack([a, b], axis=0)", behavior: "Stacks along a NEW axis — adds a dimension.", when: "Aggregating results into a new batch dim; inverse of tf.unstack." },
    { syntax: "tf.nn.softmax(x, axis=-1)", behavior: "Normalized exp along axis — sums to 1.", when: "Classification head, attention weights. Use log_softmax for numerical stability." },
    { syntax: "tf.nn.sigmoid(x)", behavior: "1 / (1 + e^-x) — squashes to (0,1).", when: "Binary logits, gates. Numerically stable for large |x|." },
    { syntax: "tf.nn.relu / gelu / silu / mish", behavior: "Activation functions — relu (cheap), gelu (transformers), silu/swish (modern LLMs).", when: "Pick by architecture: MLPs → relu/gelu, LLMs → silu, conv → relu/mish." },
    { syntax: "tf.where(cond, a, b)", behavior: "Element-wise ternary — picks from a where cond is True, else b.", when: "Masking, conditional gradient routes. cond must be a bool Tensor." },
    { syntax: "tf.gather(x, idx, axis=0)", behavior: "Selects slices along axis at positions in idx — same rank as x.", when: "Embedding lookups, sequence mixing, MoE routing." },
    { syntax: "tf.scatter_nd(indices, updates, shape)", behavior: "Inverse of gather — writes updates into a fresh zero tensor at sparse indices.", when: "MoE dispatch, gradient accumulation by index, one-hot expansion." },
    { syntax: "tf.norm(x, axis=-1)", behavior: "L2 norm along axis (use ord= for other norms).", when: "Layer norm internals, distance metrics, gradient clipping." },
    { syntax: "tf.reduce_sum / mean / max(x, axis=...)", behavior: "Reductions — pass axis to keep rank, omit for scalar.", when: "Loss reductions, mean over batch; the 'reduce_' prefix distinguishes from tf.math.max which is element-wise." },
    { syntax: "tf.boolean_mask(x, mask)", behavior: "Selects elements where mask is True — returns a flat tensor of selected values.", when: "Applying padding masks to loss, gathering valid positions." },
    { syntax: "tf.gradients(loss, vars) / GradientTape.gradient", behavior: "Computes gradients of loss w.r.t. vars — reverse-mode autodiff.", when: "Custom training loops. GradientTape is the 2.x API; tf.gradients is graph-mode 1.x." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "python",
      caption: "Object-based Checkpoint + CheckpointManager — resumable training",
      code: `import tensorflow as tf

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
# Use BOTH: Checkpoint mid-training, SavedModel for deploy.`,
    },
    {
      lang: "python",
      caption: "tf.data pipeline — from TFRecords with parallel decode + prefetch",
      code: `import tensorflow as tf

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
# prefetch overlaps the next-batch prep with the current-batch training step`,
    },
    {
      lang: "python",
      caption: "SavedModel with a concrete serving signature — the deploy artifact",
      code: `import tensorflow as tf

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
# TF Serving, TFLite Converter, and TF.js can all load this directory.`,
    },
    {
      lang: "python",
      caption: "Loading a SavedModel + calling it via the named signature",
      code: `import tensorflow as tf

loaded = tf.saved_model.load("./saved_model/1")
infer = loaded.signatures["serving_default"]
print(infer.structured_input_signature, infer.structured_outputs)

# Inputs are passed by name (from the TensorSpec name= in input_signature)
out = infer(x=tf.constant([[0.1] * 784], dtype=tf.float32))
print(out["pred"].numpy())           # array([[class_id]], dtype=int32)

# For Keras-compatible loading (also restores .compile config):
km = tf.keras.models.load_model("./saved_model/1")`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "python",
      caption: "Built-in .fit() with tf.data + callbacks — the 90% path",
      code: `import tensorflow as tf

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
)`,
    },
    {
      lang: "python",
      caption: "Custom training loop with GradientTape + @tf.function — when .fit() isn't enough",
      code: `import tensorflow as tf

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
    # eval loop with no_grad equivalent: just call model(x, training=False)`,
    },
    {
      lang: "python",
      caption: "Distributed training loop with strategy.run — per-replica step",
      code: `import tensorflow as tf

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
        loss = distributed_step(batch)`,
    },
    {
      lang: "python",
      caption: "Generator-style tf.data loop — step-based training (no fixed epoch)",
      code: `import tensorflow as tf

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
    step += 1`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "python",
      caption: "Custom Layer with build() (lazy weights) + get_config() (serializable)",
      code: `import tensorflow as tf

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
        return {**super().get_config(), "hidden": self.hidden}`,
    },
    {
      lang: "python",
      caption: "Custom Loss subclass — reusable + reducible + serializable",
      code: `import tensorflow as tf

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
        return {**super().get_config(), "gamma": self.gamma, "alpha": self.alpha}`,
    },
    {
      lang: "python",
      caption: "Custom Metric with stateful accumulation across batches",
      code: `import tensorflow as tf

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
        self.tp.assign(0); self.fp.assign(0); self.fn.assign(0)`,
    },
    {
      lang: "python",
      caption: "Custom Callback — logging to external service every N steps",
      code: `import tensorflow as tf

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

# Use in model.fit(..., callbacks=[WandbLogger(log_every=50)])`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "python",
      caption: "Side effects in @tf.function — use tf.print, not print",
      code: `import tensorflow as tf

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
#   tf.config.run_functions_eagerly(True)`,
    },
    {
      lang: "python",
      caption: "Retracing storms — pin input_signature to prevent re-tracing on shape changes",
      code: `import tensorflow as tf

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
    return model(x)`,
    },
    {
      lang: "python",
      caption: "NaN detection — guard against fp16 overflow + logit explosion",
      code: `import tensorflow as tf

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
                   lambda: tf.constant(0.0))`,
    },
    {
      lang: "python",
      caption: "OOM recovery — gradient checkpointing + cache cleanup",
      code: `import tensorflow as tf

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
# and switch mixed precision to mixed_bfloat16 (no loss scaling, fewer paths to overflow)`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "python",
      caption: "MirroredStrategy — synchronous data-parallel across GPUs on one host",
      code: `import tensorflow as tf

strategy = tf.distribute.MirroredStrategy()
print(f"replicas: {strategy.num_replicas_in_sync}")

with strategy.scope():
    model = build_model()                  # Variables created here are mirrored
    opt = tf.keras.optimizers.Adam(1e-3)
    model.compile(optimizer=opt, loss=loss_fn, metrics=["accuracy"])

# Dataset auto-shards across replicas; grads all-reduced via NCCL under the hood
model.fit(train_ds, epochs=10, validation_data=val_ds)`,
    },
    {
      lang: "python",
      caption: "MultiWorkerMirroredStrategy — multi-host training with TF_CONFIG",
      code: `import os, json, tensorflow as tf

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
# BackupAndRestore survives preemptions by checkpointing at epoch boundaries`,
    },
    {
      lang: "python",
      caption: "TPUStrategy — synchronous training on TPU pods (8 replicas per v4 chip)",
      code: `import tensorflow as tf

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
model.fit(ds, epochs=10)`,
    },
    {
      lang: "python",
      caption: "tf.data parallelism — interleaved reads, parallel decode, prefetch",
      code: `import tensorflow as tf

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
ds = ds.with_options(options)`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "python",
      caption: "Numerical gradient check — finite differences vs GradientTape",
      code: `import tensorflow as tf
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
np.testing.assert_allclose(analytic, numerical, atol=1e-3)`,
    },
    {
      lang: "python",
      caption: "tf.test.TestCase — the standard unit-test base",
      code: `import tensorflow as tf

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
    tf.test.main()`,
    },
    {
      lang: "python",
      caption: "Numerical stability tests — softmax, log_softmax, large logits",
      code: `import tensorflow as tf

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
        tf.keras.mixed_precision.set_global_policy("float32")`,
    },
    {
      lang: "python",
      caption: "Distributed-training sanity — same seed gives same weights across replicas",
      code: `import tensorflow as tf

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
    strategy.run(step, args=next(iter(dist_ds)))`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "@tf.function gives 5-10x speedup over eager; first call always traces (slow), subsequent calls reuse the cached graph.", tag: "perf" },
    { fact: "tf.function(jit_compile=True) invokes XLA — can fuse elementwise+reduction chains 2-4x, but recompiles for each new static shape.", tag: "perf" },
    { fact: "tf.data.AUTOTUNE lets the runtime pick buffer sizes — always prefer it over hand-tuned values for prefetch/num_parallel_calls.", tag: "perf" },
    { fact: "End every tf.data pipeline with .batch(B).prefetch(AUTOTUNE) to overlap host data prep with device compute — free 10-30% throughput.", tag: "perf" },
    { fact: "Mixed-precision policy 'mixed_float16' gives 1.5-3x speed + 2x memory on Ampere/Hopper; pair with OutputLayer to keep logits in fp32.", tag: "perf" },
    { fact: "mixed_bfloat16 matches mixed_float16 in speed but skips the loss-scaling machinery — simpler code, no overflow risk, slightly less precision.", tag: "perf" },
    { fact: "Per-step overhead: eager ~= 50-200 us/op, graph ~= 5-20 us/op — matters most in RL and short-step training.", tag: "perf" },
    { fact: "SavedModel is the deploy artifact: directory with saved_model.pb (graph), variables/ (weights), and assets/ (vocab files).", tag: "version" },
    { fact: "MirroredStrategy = synchronous NCCL all-reduce on one host; for multi-host use MultiWorkerMirroredStrategy; for TPU use TPUStrategy (8 replicas per v4 chip).", tag: "version" },
    { fact: "TPUs need static shapes everywhere — pad to multiples of 128 (embeddings) or 8 (images) or you get recompilation storms.", tag: "gotcha" },
    { fact: "tf.train.Checkpoint is object-based (survives renames); SavedModel is graph-based (portable but stricter). Use both: Checkpoint mid-training, SavedModel for deploy.", tag: "gotcha" },
    { fact: "tf.profiler with TensorBoard: profile batches 5-15 (skip warmup) — the memory viewer and op-level timeline are the standard tools.", tag: "perf" },
    { fact: "Dataset.cache() before .map() saves in-memory datasets from re-decoding; cache after .map() recomputes the same augmentation every epoch (usually wrong).", tag: "gotcha" },
    { fact: "GradientTape is one-shot by default; pass persistent=True to call .gradient() multiple times (higher-order grads, multi-loss heads).", tag: "gotcha" },
    { fact: "tf.function inside a Python loop retraces per iteration if the Python variable changes; hoist tracing out and rebind inputs via Tensor arguments.", tag: "gotcha" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Keras 3", purpose: "Multi-backend high-level API on top of TF, JAX, and PyTorch — the future-facing Keras interface.", url: "https://keras.io/keras_3/", category: "build" },
    { tool: "tf.data", purpose: "First-party input pipeline API — lazy, parallel, prefetching; the only correct way to feed large datasets.", url: "https://www.tensorflow.org/guide/data", category: "build" },
    { tool: "tf.distribute", purpose: "Distributed training strategies: MirroredStrategy, MultiWorkerMirroredStrategy, TPUStrategy, ParameterServerStrategy.", url: "https://www.tensorflow.org/guide/distributed_training", category: "build" },
    { tool: "TFX (TensorFlow Extended)", purpose: "End-to-end MLOps pipeline: data validation, transformation, training, serving, monitoring.", url: "https://www.tensorflow.org/tfx", category: "deploy" },
    { tool: "TF-Serving", purpose: "C++ production serving binary — handles batching, versioning, multiple models, gRPC + REST.", url: "https://www.tensorflow.org/tfx/guide/serving", category: "deploy" },
    { tool: "TFLite", purpose: "On-device inference for Android/iOS/edge — quantized models, hardware delegates (GPU, NNAPI, CoreML).", url: "https://www.tensorflow.org/lite", category: "deploy" },
    { tool: "TF.js", purpose: "TensorFlow in the browser and Node.js — WebGL/WASM backends, model import from Python TF.", url: "https://www.tensorflow.org/js", category: "deploy" },
    { tool: "XLA", purpose: "Just-in-time op fusion compiler — jit_compile=True; big speedups on TPU and fused reductions.", url: "https://www.tensorflow.org/xla", category: "build" },
    { tool: "TensorBoard", purpose: "Built-in visualization: scalars (loss/metric), histograms (weights), profiler (op-level timeline), projector (embeddings).", url: "https://www.tensorflow.org/tensorboard", category: "debug" },
    { tool: "tf.profiler", purpose: "Per-op CPU/CPU/GPU time, memory, and input-pipeline analysis — exports Chrome trace + TensorBoard UI.", url: "https://www.tensorflow.org/guide/profiler", category: "debug" },
    { tool: "HuggingFace Transformers (TF backend)", purpose: "Largest LLM hub — most models ship a TFTorchModel class for native TF training.", url: "https://huggingface.co/docs/transformers/en/main_classes/tf_model", category: "build" },
    { tool: "TensorFlow Datasets (TFDS)", purpose: "Standardized download+prep+tf.data.Dataset for hundreds of public datasets.", url: "https://www.tensorflow.org/datasets", category: "build" },
    { tool: "ML Metadata", purpose: "Track artifacts (datasets, models, metrics) and their lineage across TFX pipeline runs.", url: "https://www.tensorflow.org/tfx/ml_metadata", category: "deploy" },
    { tool: "TensorFlow Hub", purpose: "Hub of reusable SavedModels (text embeddings, image feature extractors) ready to fine-tune.", url: "https://www.tensorflow.org/hub", category: "build" },
    { tool: "JAX", purpose: "Google's successor numerical library — XLA-native, functional API; Flax is its Keras-equivalent.", url: "https://jax.readthedocs.io/", category: "build" },
    { tool: "Flax", purpose: "Neural network library on top of JAX; a common destination for TF users wanting XLA + functional transforms.", url: "https://flax.readthedocs.io/", category: "build" },
    { tool: "ONNX Runtime", purpose: "Cross-framework inference — convert SavedModel via tf2onnx for serving outside Google's stack.", url: "https://onnxruntime.ai/", category: "deploy" },
    { tool: "Weights & Biases", purpose: "Experiment tracking — integrates with Keras callbacks in 3 lines, syncs across distributed runs.", url: "https://wandb.ai/site/integrations/keras", category: "debug" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "0.6",  year: 2015, highlight: "Initial public release — DistBelief successor, dataflow graphs, sessions." },
    { version: "1.0",  year: 2016, highlight: "First stable — Google Brain whitepaper, distributed training, TensorBoard." },
    { version: "1.4",  year: 2017, highlight: "Eager execution preview (tf.contrib.eager); tf.data API introduced." },
    { version: "1.12", year: 2018, highlight: "tf.keras becomes the official high-level API; Eager execution default in tf.contrib." },
    { version: "1.15", year: 2019, highlight: "Last 1.x release; long-term support branch for legacy code; tf.estimator frozen." },
    { version: "2.0",  year: 2019, highlight: "Eager by default; @tf.function tracing; Keras unified; removed sessions and 1.x graph API." },
    { version: "2.2",  year: 2020, highlight: "Custom training loop with GradientTape; Keras was the only model API." },
    { version: "2.4",  year: 2020, highlight: "CUDA 11 + cuDNN 8; mixed precision GA; experimental distribute coordinator." },
    { version: "2.5",  year: 2021, highlight: "Keras MixedPrecision policy stable; modern SavedModel format." },
    { version: "2.6",  year: 2021, highlight: "Keras split into separate pip package (keras ~= tf.keras); NumPy API in tf.experimental.numpy." },
    { version: "2.8",  year: 2022, highlight: "tf.data service for distributed preprocessing; experimental DTensor." },
    { version: "2.10", year: 2022, highlight: "Scaled_dot_product_attention added (FlashAttention on GPU); Apple Silicon GPU support." },
    { version: "2.11", year: 2022, highlight: "AdamW optimizer added; Keras modeling fixes; integer quantization APIs expanded." },
    { version: "2.12", year: 2023, highlight: "Python 3.11 support; experimental DTensor-based Keras; expanded oneDAL CPU kernels." },
    { version: "2.13", year: 2023, highlight: "Last release before Keras 3 split; tf.keras kept as legacy single-backend path." },
    { version: "2.14", year: 2023, highlight: "Keras 3 preview; experimental tf.keras.src namespace; Python 3.12 support." },
    { version: "2.15", year: 2023, highlight: "Keras 2.x final stabilization; migration path to Keras 3 documented." },
    { version: "2.16", year: 2024, highlight: "Keras 3 default ('import keras'); multi-backend support (JAX, TF, PyTorch, NumPy)." },
    { version: "2.17", year: 2024, highlight: "Keras 3.4+ default; expanded tf.data ops; continued XLA improvements for LLMs." },
    { version: "2.18", year: 2025, highlight: "Stabilized distributed training APIs; DTensor-on-Keras path maturing for SPMD." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between tf.function, tf.py_function, and AutoGraph?", a: "@tf.function traces the Python body into a graph on first call; subsequent calls reuse the cached graph. AutoGraph (built in) converts Python if/for/while into tf.cond/tf.while_loop during tracing. tf.py_function is the escape hatch: it runs Python code inside the graph (e.g. calling NumPy), but breaks XLA compilation and is slow — avoid it in hot paths.", difficulty: "medium" },
    { q: "When does @tf.function retrace, and how do you prevent it?", a: "Retracing fires on each unique Python value (not Tensor) that flows in — variable batch shapes, Python ints, list lengths. Prevent with: (1) input_signature= in @tf.function to pin TensorSpecs (Tensors then become graph inputs, not trace keys); (2) tf.TensorSpec with None dims for variable shapes; (3) reduce_on_plateau that passes Python scalars as Tensors. Watch for retrace warnings during dev.", difficulty: "medium" },
    { q: "How does MirroredStrategy differ from MultiWorkerMirroredStrategy and TPUStrategy?", a: "MirroredStrategy: single-host multi-GPU, NCCL all-reduce, variables mirrored (full copy per replica). MultiWorkerMirroredStrategy: multi-host, same algorithm, requires TF_CONFIG env var for cluster topology, BackupAndRestore for preemption recovery. TPUStrategy: TPU pods (8 replicas per v4 chip), needs static shapes, GCS-hosted data, XLA compilation. All share the strategy.scope() + strategy.run() API.", difficulty: "medium" },
    { q: "Why use Checkpoint vs SavedModel?", a: "tf.train.Checkpoint is object-based — it serializes Variables by attribute path, survives renames and refactors, and stores optimizer state. SavedModel is graph-based — it bundles the @tf.function graph + Variables + signatures into a deployable directory. Use Checkpoint for mid-training recovery (fast, frequent, mutable), SavedModel for serving artifacts (portable, frozen, ready for TF-Serving/TFLite/TF.js).", difficulty: "easy" },
    { q: "How does mixed precision work in TF and what's the catch with fp16?", a: "Set tf.keras.mixed_precision.set_global_policy('mixed_float16'): layers compute in fp16 but Variables stay fp32 (master weights). The catch: fp16 has ±65504 range, so logits overflow easily — the final Dense must be dtype='float32' (or use OutputLayer). Loss scaling handles gradient underflow automatically via tf.train.LossScaleOptimizer wrapping your optimizer. mixed_bfloat16 has the same speed without these catches (no overflow, no scaling), but only on Ampere+ GPUs and TPUs.", difficulty: "medium" },
    { q: "What is XLA and when does jit_compile=True hurt?", a: "XLA (Accelerated Linear Algebra) is TF's JIT compiler: it fuses elementwise + reduction ops into single GPU kernels, eliminates intermediate buffers, and can autotune. jit_compile=True forces every op in the @tf.function through XLA. It HURTS when: (1) shapes are dynamic — XLA recompiles per shape, causing multi-second stalls; (2) ops lack XLA kernels (some tf.text ops, sparse ops); (3) the function is called once and never reused (compile cost > benefit).", difficulty: "hard" },
    { q: "How does tf.data overlap data prep with training?", a: "Prefetch(AUTOTUNE) runs the next-batch prep in a background thread/CPU while the current batch trains on GPU. Beyond prefetch: .map(fn, num_parallel_calls=AUTOTUNE) parallelizes per-element transforms; .interleave() parallelizes across files; options.experimental_optimization.map_fusion merges adjacent maps. The model should never wait for data — profile with tf.data.experimental.StatsAggregator to verify.", difficulty: "medium" },
    { q: "What's the difference between tf.keras and Keras 3?", a: "tf.keras (legacy) is the Keras API bundled with TF — single-backend, TF-only, frozen at 2.x. Keras 3 ('import keras', 2024) is a separate package supporting TF, JAX, and PyTorch backends via keras.config.set_backend. Keras 3 lets you train on JAX (for XLA + pmap) and serve on TF (for TF-Serving). TF 2.16+ ships Keras 3 as the default; tf.keras is preserved for backward compat but is no longer the recommended path.", difficulty: "medium" },
    { q: "How would you debug a slow @tf.function?", a: "(1) Run eager first to confirm correctness: tf.config.run_functions_eagerly(True). (2) Check for retracing — add a print() at the top (fires only on trace) and count occurrences. (3) Profile with tf.profiler: look for (a) op-launch overhead (too many small ops → fuse with XLA), (b) host-side stalls (data prep not overlapping → fix tf.data prefetch), (c) memory pressure (smaller batch or gradient checkpointing). (4) Compare eager vs graph times — if they're close, the graph isn't helping.", difficulty: "hard" },
    { q: "Why does TPUStrategy require static shapes, and how do you handle variable-length sequences?", a: "TPUs compile each unique shape into a separate XLA program; recompiles take seconds. Pad sequences to a fixed max length (the standard NLP recipe) or to a multiple of 128/8 (TPU-friendly). For truly variable shapes, use bucketed batching: pad within each bucket, switch buckets between programs. Never pad to global max — you'll waste 99% of compute. For images, use fixed HxW and pad masks for non-square inputs.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "PyTorch", whenThis: "TPU training, mobile/edge deployment (TFLite), production serving at Google scale, extending BERT/T5/Gemini internals.", whenThat: "Research code, custom architectures, when you need to read/modify gradients inline, LLM/diffusion work where the ecosystem momentum is here." },
    { vs: "JAX", whenThis: "Mature serving (TF-Serving, TFLite), mobile/edge targets, when you want the Keras high-level API as the default.", whenThat: "Pure functional transforms (vmap, pmap, grad-of-grad), massive SPMD model parallelism, XLA-native programming without eager overhead." },
    { vs: "Keras 3", whenThis: "Custom training loops with GradientTape, distribution strategies, low-level op control, when .fit() isn't enough.", whenThat: "Rapid prototyping, multi-backend portability (train on JAX, serve on TF), when the .compile()/.fit() trinity covers 90% of your needs." },
    { vs: "scikit-learn", whenThis: "Deep learning (any architecture with layers), gradient-based optimization, GPU/TPU compute, anything larger than ~1M parameters.", whenThat: "Tabular data baselines, classical ML (RF, XGBoost-style), preprocessing pipelines, model selection with grid search." },
    { vs: "ONNX Runtime", whenThis: "Training, model development, when you need TF-specific features (TPU, TFLite, TF.js ecosystem).", whenThat: "Pure inference on CPU/edge/embedded, cross-language serving (C#/Java/JS), maximum inference throughput without Python in the path." },
  ],
};

export default sheet;
