import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "keras",
  name: "Keras",
  category: "ml-ai",
  tier: "ml",
  tags: ["deep-learning", "neural-networks", "high-level-api", "sequential", "functional", "multi-backend", "python"],
  tagline: "High-level neural-network API — stack layers, compile, fit. Three backends (TF, JAX, PyTorch) under one interface since Keras 3.",
  year: 2015,
  author: "François Chollet (Google)",

  tldr: [
    "Keras is a layered, declarative API for building neural networks: you compose layers into a model, call .compile(optimizer, loss, metrics), then .fit(data, epochs). That trinity covers ~90% of real work.",
    "It was originally a front-end over TensorFlow/Theano/CNTK; since Keras 3 (2023) it is a unified multi-backend interface that runs the same code on TensorFlow, JAX, and PyTorch, with NumPy as a fallback.",
    "Reach for it when you want concise, readable model definitions, sensible defaults, and the ability to switch backend for deployment (e.g. train on JAX, serve on TF).",
    "Avoid it when you need gradient-level control of unusual architectures (drop to native PyTorch/TF), or for classical ML (use scikit-learn). For LLM training at scale, native framework APIs are usually faster than the Keras abstraction layer.",
  ],

  mentalModel: {
    title: "Build → compile → fit: three phases, three contracts",
    body: "A Keras model is a graph of layers wired in __init__ (Sequential) or via the functional API (Input → call layers → Model(inputs, outputs)). .compile() stamps the model with an optimizer, a loss, and metrics — it commits the training contract. .fit() then runs the standard loop (forward, loss, backward, optimizer step) with callbacks firing at epoch/batch boundaries. Override train_step() to break out of the default loop while keeping .fit()'s plumbing (callbacks, distribution, progress bar) for free.",
  },

  constructs: [
    { syntax: "keras.Sequential([Dense(64, activation=\"relu\"), Dense(10)])", behavior: "Linear stack of layers — forward = chained calls.", when: "Linear pipelines only; cannot express branches, skips, or multi-input." },
    { syntax: "inputs = keras.Input((784,)); x = Dense(64)(inputs); model = keras.Model(inputs, x)", behavior: "Functional API — layers are called on tensors, returning tensors; the graph is captured by Model.", when: "Anything non-linear: ResNets, multi-input, multi-output, skip connections. Default choice for serious work." },
    { syntax: "model.compile(optimizer=\"adam\", loss=\"mse\", metrics=[\"accuracy\"])", behavior: "Configures training — string shortcuts resolve to canonical objects; required before .fit().", when: "Always — .fit() raises if you forget. Re-compiling resets optimizer state." },
    { syntax: "model.fit(x, y, epochs=10, batch_size=32, validation_split=0.2, callbacks=[...])", behavior: "Runs the training loop, returns a History object with per-epoch loss/metric arrays.", when: "Standard supervised training. Pass a tf.data.Dataset for production pipelines." },
    { syntax: "model.evaluate(x, y); model.predict(x)", behavior: "Compute loss+metrics on test data; predict() returns forward-pass outputs in batches.", when: "Evaluation and inference. For single samples, model(x) is faster (no batching setup)." },
    { syntax: "class L(keras.layers.Layer):\n  def build(self, shape): ...\n  def call(self, x): ...", behavior: "Custom layer — build() lazily creates weights (input-shape-aware), call() defines forward; get_config() enables serialization.", when: "Anything not in the standard library; required reading for serious Keras users." },
    { syntax: "keras.callbacks.EarlyStopping(monitor=\"val_loss\", patience=3, restore_best_weights=True)", behavior: "Stops training when a monitored metric stops improving; optionally restores the best epoch's weights.", when: "Every real training run — saves time and prevents overfitting. Always set restore_best_weights=True." },
    { syntax: "keras.callbacks.ModelCheckpoint(\"best.keras\", save_best_only=True)", behavior: "Saves the model (or weights) at each epoch, optionally only when a metric improves.", when: "Long training runs; pair with EarlyStopping so you keep the best model." },
    { syntax: "model.save(\"m.keras\"); keras.saving.load_model(\"m.keras\")", behavior: "Serializes architecture + weights + optimizer state + custom objects into a single .keras zip.", when: "Persistent model artifacts. .keras (Keras 3) replaces the legacy .h5 and SavedModel formats." },
    { syntax: "@keras.saving.register_keras_serializable()", behavior: "Decorator that registers a custom class/function so it can be deserialized by name from a .keras file.", when: "Any custom layer, loss, metric, or activation used in a saved model — without this, load_model fails." },
    { syntax: "keras.mixed_precision.set_global_policy(\"mixed_float16\")", behavior: "Switches all layers to compute in float16, storing master weights in float32 — 2× memory, 1.5–3× speed on tensor cores.", when: "GPU training on Volta+. The final Dense layer must be float32 — use keras.layers.Dense(..., dtype=\"float32\")." },
    { syntax: "class M(keras.Model):\n  def train_step(self, data): ...", behavior: "Override the per-batch training step; .fit() calls this, so you keep callbacks/distribution/progress for free.", when: "Custom losses, GANs, multi-input targets, contrastive learning — anywhere the default loss(y, y_pred) doesn't fit." },
    { syntax: "keras.utils.PyDataset", behavior: "Base class for a Python-side dataset that yields batches — Keras handles multiprocessing and prefetch.", when: "Data that doesn't fit tf.data (e.g. streaming from a custom server). Replaces Sequence in Keras 3." },
  ],

  patterns: [
    {
      lang: "python",
      caption: "Functional API with skip connection — the standard non-linear model",
      code: `import keras
from keras import layers

def build_resnet_block(x, filters):
    shortcut = x
    x = layers.Conv2D(filters, 3, padding="same")(x)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)
    x = layers.Conv2D(filters, 3, padding="same")(x)
    x = layers.BatchNormalization()(x)
    return layers.Add()([shortcut, x])     # skip connection

inputs = keras.Input((32, 32, 3))
x = layers.Conv2D(64, 3, padding="same")(inputs)
x = build_resnet_block(x, 64)
x = build_resnet_block(x, 64)
x = layers.GlobalAveragePooling2D()(x)
outputs = layers.Dense(10, activation="softmax", dtype="float32")(x)

model = keras.Model(inputs, outputs, name="mini_resnet")
model.compile(optimizer="adam",
              loss="sparse_categorical_crossentropy",
              metrics=["accuracy"])
model.summary()`,
    },
    {
      lang: "python",
      caption: "Custom Layer with build() (lazy weights) and get_config() (serializable)",
      code: `import keras
from keras import layers
import tensorflow as tf

@keras.saving.register_keras_serializable(package="custom")
class MLPSwiGLU(layers.Layer):
    def __init__(self, hidden, **kwargs):
        super().__init__(**kwargs)
        self.hidden = hidden

    def build(self, input_shape):
        self.w_gate  = self.add_weight(shape=(input_shape[-1], self.hidden),
                                       initializer="glorot_uniform", name="w_gate")
        self.w_up    = self.add_weight(shape=(input_shape[-1], self.hidden),
                                       initializer="glorot_uniform", name="w_up")
        self.w_down  = self.add_weight(shape=(self.hidden, input_shape[-1]),
                                       initializer="glorot_uniform", name="w_down")
        self.built = True

    def call(self, x):
        return self.w_down.__matmul__(tf.nn.silu(x @ self.w_gate) * (x @ self.w_up))

    def get_config(self):
        return {**super().get_config(), "hidden": self.hidden}`,
    },
    {
      lang: "python",
      caption: "Custom train_step for a GAN-style two-loss training — keeps .fit() plumbing",
      code: `import keras
import tensorflow as tf

class GAN(keras.Model):
    def __init__(self, gen, disc, **kwargs):
        super().__init__(**kwargs)
        self.gen, self.disc = gen, disc
        self.g_opt = keras.optimizers.Adam(2e-4, beta_1=0.5)
        self.d_opt = keras.optimizers.Adam(2e-4, beta_1=0.5)
        self.loss_fn = keras.losses.BinaryCrossentropy(from_logits=True)
        self.d_loss_tracker = keras.metrics.Mean(name="d_loss")
        self.g_loss_tracker = keras.metrics.Mean(name="g_loss")

    @property
    def metrics(self):
        return [self.d_loss_tracker, self.g_loss_tracker]

    def train_step(self, data):
        real, _ = data
        batch = tf.shape(real)[0]
        with tf.GradientTape() as d_tape, tf.GradientTape() as g_tape:
            fake = self.gen(tf.random.normal([batch, 100]), training=True)
            d_real = self.disc(real, training=True)
            d_fake = self.disc(fake, training=True)
            d_loss = self.loss_fn(tf.ones_like(d_real), d_real) + \\
                     self.loss_fn(tf.zeros_like(d_fake), d_fake)
            g_loss = self.loss_fn(tf.ones_like(d_fake), d_fake)
        self.d_opt.apply_gradients(zip(d_tape.gradient(d_loss, self.disc.trainable_weights),
                                       self.disc.trainable_weights))
        self.g_opt.apply_gradients(zip(g_tape.gradient(g_loss, self.gen.trainable_weights),
                                       self.gen.trainable_weights))
        self.d_loss_tracker.update_state(d_loss)
        self.g_loss_tracker.update_state(g_loss)
        return {m.name: m.result() for m in self.metrics}`,
    },
    {
      lang: "python",
      caption: "Callbacks: EarlyStopping + ModelCheckpoint + TensorBoard",
      code: `import keras

callbacks = [
    keras.callbacks.EarlyStopping(
        monitor="val_loss", patience=5, min_delta=1e-3,
        restore_best_weights=True, verbose=1),
    keras.callbacks.ModelCheckpoint(
        "best.keras", monitor="val_loss", save_best_only=True, verbose=1),
    keras.callbacks.ReduceLROnPlateau(
        monitor="val_loss", factor=0.5, patience=2, min_lr=1e-6, verbose=1),
    keras.callbacks.TensorBoard(log_dir="./tb", histogram_freq=1),
]

history = model.fit(
    train_ds, validation_data=val_ds, epochs=100,
    callbacks=callbacks, verbose=2,
)
# history.history: dict of loss/metric per epoch — plot to diagnose`,
    },
    {
      lang: "python",
      caption: "Save/load the full model (architecture + weights + optimizer + custom layers)",
      code: `import keras

# Save — .keras is a zip with config.json + weights + optimizer state
model.save("model.keras")

# Load — custom layers resolve via @register_keras_serializable decorator
loaded = keras.saving.load_model("model.keras")

# Continue training from where we left off
loaded.fit(train_ds, epochs=5, initial_epoch=10)

# Weights-only path (cross-framework friendly)
model.save_weights("weights.h5")
model.load_weights("weights.h5")    # architecture must match exactly`,
    },
  ],

  pitfalls: [
    {
      title: "Forgot .compile() before .fit()",
      symptom: "RuntimeError: 'You must compile your model before training/testing.' — happens after .load_model() if you skipped compile, or after manually building a functional model.",
      fix: "Always call model.compile(optimizer=..., loss=..., metrics=...) before .fit(). Loaded models from .keras include the compiled config, but re-compile if you want a new optimizer or learning rate.",
    },
    {
      title: "Custom layer not registered for save/load",
      symptom: "ValueError on load_model: 'Could not locate class ...' — the .keras file stores the class name, not the code.",
      fix: "Decorate every custom layer/loss/metric with `@keras.saving.register_keras_serializable(package=\"x\")` and import that module before calling load_model. Or use safe_mode=False (not recommended for untrusted files).",
    },
    {
      title: "mixed_float16 overflows the final logits",
      symptom: "Loss becomes NaN after a few steps with mixed precision enabled — float16 can't represent values >65504.",
      fix: "Set the global policy to mixed_float16, then explicitly cast the output Dense layer: `Dense(num_classes, dtype=\"float32\")`. Keras 3's OutputLayer handles this automatically.",
    },
    {
      title: "validation_split shuffles time-series data",
      symptom: "validation loss looks unrealistically low; .fit(x, y, validation_split=0.2) takes the LAST 20% but the data is time-ordered — you're validating on the future.",
      fix: "Manually split with sklearn.train_test_split(shuffle=False) and pass validation_data=(x_val, y_val). Never use validation_split on sequential data without prior shuffling.",
    },
    {
      title: ".predict() is slow for one sample",
      symptom: "Calling model.predict(x_single) in a request handler takes 50–200 ms even for a tiny model — overhead from Python-side batching and graph dispatch.",
      fix: "Call the model directly: `model(tf.constant(x_single))[0].numpy()`. Reserve .predict() for batched inference on a Dataset; for serving, export to SavedModel or ONNX.",
    },
    {
      title: "Sequential used where it doesn't fit",
      symptom: "Trying to add a second Input, a skip connection, or multiple outputs to a Sequential model — fails or silently flattens the architecture.",
      fix: "Switch to the Functional API (keras.Input + keras.Model) the moment you need any branching. Sequential is for literally linear stacks; it's not a 'simpler' version of functional.",
    },
    {
      title: "BatchNorm in functional API needs the right input rank",
      symptom: "ValueError about shape rank — BatchNorm computes mean over axes that depend on whether the input is 2D (axis=1) or 4D (axis=[1,2]).",
      fix: "Pass axis explicitly: BatchNorm(axis=-1) for 2D, BatchNorm(axis=[0,1,2]) or default for 4D. Don't rely on the inferred axis; document it in the layer construction.",
    },
  ],

  quickReference: [
    { fact: "Default .fit() batch_size=32, default Adam lr=0.001. These are starting points, not tuned values — always tune.", tag: "perf" },
    { fact: "EarlyStopping with restore_best_weights=True is mandatory for real training — without it you keep the weights from the LAST epoch, not the BEST.", tag: "gotcha" },
    { fact: ".keras format (Keras 3, 2023) is a zip with config.json + model.weights + optimizer. Replaces .h5 (single-backend) and SavedModel (TF-only).", tag: "version" },
    { fact: "Keras 3 supports JAX, TensorFlow, and PyTorch backends — switch with `import os; os.environ[\"KERAS_BACKEND\"]=\"jax\"` BEFORE importing keras.", tag: "version" },
    { fact: "mixed_float16 policy: ~2× memory, 1.5–3× speed on Ampere/Hopper; mixed_bfloat16 has same speed without overflow risk (no GradScaler needed).", tag: "perf" },
    { fact: "model.summary() shows layer shapes, parameter counts, and total trainable/non-trainable split — read it before training to catch shape bugs.", tag: "gotcha" },
    { fact: "steps_per_epoch = ceil(num_samples / batch_size); pass only if you want an epoch to be a fraction of the dataset (useful for huge data).", tag: "complexity" },
    { fact: "Override train_step to keep .fit()'s callbacks, distribution, and progress bar while replacing the math — the canonical GAN/custom-loss pattern.", tag: "gotcha" },
    { fact: "PyDataset (Keras 3) replaces Sequence; subclass and implement __getitem__ / __len__ for custom data pipelines outside tf.data.", tag: "version" },
    { fact: "Keras outputs are backend tensors — call .numpy() to convert; on the JAX backend this materializes a DeviceArray.", tag: "gotcha" },
    { fact: "Custom Layer lifecycle: __init__ for config (no weights), build(input_shape) for weights (called once, lazily), call(x) for forward.", tag: "complexity" },
    { fact: "Initializers matter: 'glorot_uniform' (Xavier) for tanh/sigmoid, 'he_normal' for ReLU-family. Wrong init → slow or no convergence.", tag: "gotcha" },
    { fact: "loss='sparse_categorical_crossentropy' for integer labels; 'categorical_crossentropy' for one-hot. Picking the wrong one silently trains on garbage.", tag: "gotcha" },
    { fact: "Keras 3 dropped multi-backend support for some TF-only features (e.g. tf.keras.experimental) — check the migration guide.", tag: "version" },
    { fact: "model.evaluate() runs in inference mode (training=False); for custom layers with stochastic forward passes, pass training=True explicitly or use a separate inference method.", tag: "gotcha" },
  ],

  goDeeper: [
    { title: "Keras Official Documentation (keras.io)", url: "https://keras.io/guides/", note: "Authoritative guides — read 'The Functional API', 'Making New Layers and Models via Subclassing', and 'Customizing What Happens in fit'." },
    { title: "Deep Learning with Python (François Chollet)", url: "https://www.manning.com/books/deep-learning-with-python-second-edition", note: "Written by Keras's creator; the canonical book for both the API and the deep-learning intuition behind it." },
    { title: "Keras 3 Announcement — One API, Three Backends", url: "https://keras.io/keras_3/", note: "Explains the multi-backend design and migration path; read before adopting Keras 3 in production." },
    { title: "Keras Code Examples", url: "https://keras.io/examples/", note: "Official, versioned recipes — the GAN, Transformer, and Vision Transformer examples are widely cited reference implementations." },
    { title: "The Functional API FAQ", url: "https://keras.io/guides/functional_api/", note: "Definitive reference on when and how to use the functional API vs. subclassing — answers the questions that come up in every code review." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "float32", behavior: "32-bit IEEE float — the default Keras compute dtype; master weights under mixed precision.", when: "Default everywhere. Override per-layer with dtype='float16' or dtype='mixed_float16'." },
      { syntax: "float16", behavior: "16-bit float — 5 exponent + 10 mantissa bits. Range ±65504, prone to overflow.", when: "Per-layer compute dtype under mixed_float16 policy; the final Dense must stay float32." },
      { syntax: "bfloat16", behavior: "16-bit float — 8 exponent + 7 mantissa bits. Same range as fp32, lower precision.", when: "mixed_bfloat16 policy on Ampere+ GPUs and TPUs; safer than fp16 (no loss scaling needed)." },
      { syntax: "float64", behavior: "64-bit IEEE double — rarely used in deep learning.", when: "Scientific computing, numerical-grad checks. Most backends support it but slowly." },
      { syntax: "int32 / int64", behavior: "Signed integer types — for labels, indices, embeddings.", when: "Sparse categorical targets default to int32; some backends prefer int64 for gather ops." },
      { syntax: "int8 / uint8", behavior: "8-bit integer — quantization-aware training (int8), image pixels (uint8).", when: "Quantization for edge deployment (TFLite, OpenVINO)." },
      { syntax: "bool", behavior: "Boolean — used as attention masks and conditions.", when: "Passing padding masks to layers (Masking, Embedding mask_zero=True)." },
      { syntax: "string", behavior: "Variable-length byte string — only on the TF backend.", when: "Raw text pipelines via TextVectorization; backend-specific (JAX/PyTorch don't have string tensors)." },
    ],
    collections: [
      { syntax: "keras.Tensor", behavior: "Symbolic tensor in the Functional API — has a dtype, shape, and KerasHistory linking to the layer that produced it.", when: "Functional model construction (Input + chained layer calls). NOT the same as the backend's Tensor type." },
      { syntax: "keras.Variable", behavior: "Mutable, named backend tensor — created by add_weight(); auto-tracked by the parent Layer.", when: "Weights inside custom layers. Never create backend-native Variables directly — use self.add_weight()." },
      { syntax: "keras.src.backend.Variable", behavior: "Backend-agnostic Variable wrapper — the actual storage class behind add_weight().", when: "Internal; users interact via add_weight() return value." },
      { syntax: "tf.data.Dataset", behavior: "Lazy prefetching iterator — the recommended input source for Keras on the TF backend.", when: "Always on TF; for JAX/PyTorch backends use tf.data, PyDataset, or array tuples." },
      { syntax: "keras.utils.PyDataset", behavior: "Subclassable Python-side dataset that yields batches — Keras 3 handles multiprocessing.", when: "Data not in tf.data (custom streams, RPC). Replaces Sequence from Keras 2." },
      { syntax: "(x, y) tuple / (x, y, sample_weight) tuple", behavior: "The standard supervised-data shape — Keras unpacks it in train_step / test_step / predict.", when: "Passing NumPy arrays or lists directly to .fit() for small datasets." },
      { syntax: "dict input / output", behavior: "Named tensors by string key — supported by the Functional API via Input(name=...).", when: "Multi-input/multi-output models; named signature for serving." },
      { syntax: "keras.ops.*", behavior: "Backend-agnostic ops namespace — same code on TF, JAX, PyTorch. The correct replacement for tf.* / torch.* inside Keras layers.", when: "Inside custom layers/losses. Use keras.ops.matmul, keras.ops.softmax, etc. — never call the backend directly." },
    ],
    custom: [
      { syntax: "class L(keras.layers.Layer):\n  def build(self, shape): ...\n  def call(self, x): ...", behavior: "Custom layer — build() lazily creates weights, call() defines forward; get_config() enables save/load.", when: "Anything not in the standard library; required reading for serious Keras users." },
      { syntax: "class M(keras.Model):\n  def train_step(self, data): ...", behavior: "Override the per-batch step; .fit() calls it, you keep callbacks/distribution/progress for free.", when: "GANs, contrastive learning, multi-loss heads — anywhere the default loss(y, y_pred) doesn't fit." },
      { syntax: "class Loss(keras.losses.Loss):\n  def call(self, y_true, y_pred): ...", behavior: "Custom loss returning per-sample values; reduction is handled by the framework.", when: "Custom objectives; subclassing gets you serialization + reduction for free." },
      { syntax: "class Metric(keras.metrics.Metric):\n  def update_state(self, y_true, y_pred): ...\n  def result(self): ...", behavior: "Stateful metric — accumulates across batches, resets between epochs.", when: "Custom metrics (F1, IoU); preferred over stateless functions when value depends on full epoch." },
      { syntax: "@keras.saving.register_keras_serializable()", behavior: "Decorator that registers a class/function so .keras files can deserialize it by name.", when: "Any custom layer/loss/metric/activation used in a saved model — without this, load_model fails." },
      { syntax: "class CB(keras.callbacks.Callback):\n  def on_epoch_end(self, epoch, logs=None): ...", behavior: "Hook into training lifecycle events (epoch/batch begin/end).", when: "Custom logging, LR schedules, early stopping criteria that built-in callbacks don't cover." },
      { syntax: "class Opt(keras.optimizers.Optimizer):\n  def update_step(self, grad, var, lr): ...", behavior: "Custom optimizer — implement update_step; base class handles iterations, gradients, slot variables.", when: "Research optimizers. For Lion/Adafactor prefer subclassing over re-implementing Adam." },
      { syntax: "keras.Sequential([...])", behavior: "Linear stack of layers — forward = chained calls, no branching.", when: "Linear pipelines only. Anything with skips/branches needs the Functional API." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, keras.ops.add(a, b)", behavior: "Element-wise add with broadcasting; backend-agnostic.", when: "Math inside custom layers. Never use tf.add or torch.add directly — breaks multi-backend." },
    { syntax: "a @ b, keras.ops.matmul(a, b)", behavior: "Matrix multiply — 2D and batched forms.", when: "Standard matmul. For attention use the keras MultiHeadAttention layer, not raw ops." },
    { syntax: "keras.ops.einsum('bihd,bjhd->bij', q, k)", behavior: "Einstein summation — arbitrary tensor contractions.", when: "Multi-tensor contractions in custom attention / GNN layers." },
    { syntax: "keras.ops.concatenate([a, b], axis=-1)", behavior: "Concatenates tensors along an existing axis.", when: "Joining features, multi-head outputs, skip-merge via layers.Concatenate." },
    { syntax: "keras.ops.stack([a, b], axis=0)", behavior: "Stacks along a NEW axis — adds a dimension.", when: "Aggregating per-head outputs into a new dim." },
    { syntax: "keras.ops.softmax(x, axis=-1)", behavior: "Normalized exp along axis — sums to 1.", when: "Classification head, attention weights. Use log_softmax for stability." },
    { syntax: "keras.ops.sigmoid(x)", behavior: "1 / (1 + e^-x) — squashes to (0,1).", when: "Binary logits, gates." },
    { syntax: "keras.ops.relu / gelu / silu / mish", behavior: "Activation functions — relu (cheap), gelu (transformers), silu/swish (modern LLMs).", when: "Pick by architecture: MLPs → relu/gelu, LLMs → silu, conv → relu/mish. Most layers accept activation='silu'." },
    { syntax: "keras.ops.where(cond, a, b)", behavior: "Element-wise ternary — picks from a where cond is True, else b.", when: "Masking, conditional gradient routes, custom losses." },
    { syntax: "keras.ops.take(x, indices, axis=0)", behavior: "Selects slices along axis at positions in indices.", when: "Embedding lookups (use Embedding layer instead), MoE routing." },
    { syntax: "keras.ops.scatter(indices, updates, shape)", behavior: "Inverse of take — writes updates into a fresh zero tensor at sparse indices.", when: "MoE dispatch, gradient accumulation by index." },
    { syntax: "keras.ops.norm(x, axis=-1)", behavior: "L2 norm along axis.", when: "Layer norm internals, distance metrics." },
    { syntax: "keras.ops.sum / mean / max / min(x, axis=...)", behavior: "Reductions — pass axis to keep rank, omit for scalar.", when: "Loss reductions, mean over batch." },
    { syntax: "keras.ops.reshape / transpose / expand_dims", behavior: "Shape manipulation — backend-agnostic.", when: "Adapting tensor shapes between layers; the cross-backend safe alternative to tf.reshape." },
    { syntax: "keras.ops.stop_gradient(x)", behavior: "Returns a tensor equal to x but treated as a constant in autodiff.", when: "Detach computations from the graph (e.g. target networks in RL, EMA weights)." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "python",
      caption: "Save and load the full model (architecture + weights + optimizer + custom layers)",
      code: `import keras

# Save — .keras is a zip with config.json + model.weights + optimizer state
model.save("model.keras")

# Load — custom layers resolve via @register_keras_serializable decorator
loaded = keras.saving.load_model("model.keras")

# Continue training from where we left off
loaded.fit(train_ds, epochs=5, initial_epoch=10)

# Weights-only path (cross-framework friendly)
model.save_weights("weights.h5")
model.load_weights("weights.h5")    # architecture must match exactly

# For cross-framework export, use the .keras config + safetensors weights:
model.export("model_dir")            # SavedModel-style directory (TF backend)`,
    },
    {
      lang: "python",
      caption: "tf.data pipeline as Keras input — overlap data with compute",
      code: `import tensorflow as tf
import keras

AUTOTUNE = tf.data.AUTOTUNE

def make_ds(x, y, batch=64, training=False):
    ds = tf.data.Dataset.from_tensor_slices((x, y))
    if training:
        ds = ds.shuffle(10000)
    return ds.batch(batch).prefetch(AUTOTUNE)

train_ds = make_ds(x_train, y_train, training=True)
val_ds   = make_ds(x_val,   y_val)

# Keras accepts a tf.data.Dataset directly in .fit() — even on the JAX/PyTorch backend
model.fit(train_ds, validation_data=val_ds, epochs=10)`,
    },
    {
      lang: "python",
      caption: "PyDataset for non-tf.data pipelines (custom streams, RPC)",
      code: `import keras
import numpy as np

class StreamingDataset(keras.utils.PyDataset):
    def __init__(self, source, batch_size=32, **kwargs):
        super().__init__(**kwargs)
        self.source = source
        self.batch_size = batch_size

    def __len__(self):
        # Number of batches per epoch — Keras uses this for the progress bar
        return (len(self.source) + self.batch_size - 1) // self.batch_size

    def __getitem__(self, idx):
        start = idx * self.batch_size
        end   = min(start + self.batch_size, len(self.source))
        batch = self.source[start:end]
        return np.array([s["x"] for s in batch]), np.array([s["y"] for s in batch])

ds = StreamingDataset(records, batch_size=64)
model.fit(ds, epochs=10, workers=4, use_multiprocessing=True)`,
    },
    {
      lang: "python",
      caption: "Export to SavedModel / ONNX for serving",
      code: `import keras

# Keras 3 native export (TF backend) — directory with serving signature
model.export("serving_dir/1")
# Loadable by TF-Serving, TFLite Converter, TF.js

# ONNX export via Keras 3 (3.5+) — cross-runtime inference
keras.export(model, "model.onnx", format="onnx")

# For JAX backend, export a .pb that can be served via jax2tf + SavedModel
# For PyTorch backend, use torch.jit.trace(model.eval(), dummy) for TorchScript`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "python",
      caption: "The standard .fit() loop with EarlyStopping + checkpointing",
      code: `import keras

callbacks = [
    keras.callbacks.EarlyStopping(
        monitor="val_loss", patience=5, min_delta=1e-3,
        restore_best_weights=True, verbose=1),
    keras.callbacks.ModelCheckpoint(
        "best.keras", monitor="val_loss", save_best_only=True, verbose=1),
    keras.callbacks.ReduceLROnPlateau(
        monitor="val_loss", factor=0.5, patience=2, min_lr=1e-6, verbose=1),
    keras.callbacks.CSVLogger("training.csv", append=True),
    keras.callbacks.TensorBoard(log_dir="./tb", histogram_freq=1),
]

history = model.fit(
    train_ds, validation_data=val_ds, epochs=100,
    callbacks=callbacks, verbose=2,
)
# history.history: dict of loss/metric per epoch — plot to diagnose
# Without restore_best_weights=True you keep the LAST (worst-on-val) epoch`,
    },
    {
      lang: "python",
      caption: "Custom train_step — keep .fit() plumbing while replacing the math",
      code: `import keras
import tensorflow as tf

class ContrastiveModel(keras.Model):
    def __init__(self, encoder, **kwargs):
        super().__init__(**kwargs)
        self.encoder = encoder
        self.loss_tracker = keras.metrics.Mean(name="loss")

    @property
    def metrics(self):
        return [self.loss_tracker]

    def train_step(self, data):
        # data is a batch of (x, y); for contrastive we ignore y
        x, _ = data
        with tf.GradientTape() as tape:
            z = self.encoder(x, training=True)
            z = keras.ops.normalize(z, axis=-1)
            # SimCLR-style NT-Xent loss between two augmented views
            loss = nt_xent_loss(z[: len(z)//2], z[len(z)//2:])
        grads = tape.gradient(loss, self.encoder.trainable_weights)
        self.optimizer.apply_gradients(zip(grads, self.encoder.trainable_weights))
        self.loss_tracker.update_state(loss)
        return {"loss": self.loss_tracker.result()}

    def test_step(self, data):
        x, _ = data
        z = keras.ops.normalize(self.encoder(x, training=False), axis=-1)
        loss = nt_xent_loss(z[: len(z)//2], z[len(z)//2:])
        self.loss_tracker.reset_state()
        self.loss_tracker.update_state(loss)
        return {"loss": self.loss_tracker.result()}`,
    },
    {
      lang: "python",
      caption: "Custom training loop with GradientTape — when .fit() is not enough",
      code: `import keras
import tensorflow as tf

opt = keras.optimizers.AdamW(learning_rate=1e-3, weight_decay=1e-4)
loss_fn = keras.losses.SparseCategoricalCrossentropy(from_logits=True)
acc_metric = keras.metrics.SparseCategoricalAccuracy()

@tf.function
def train_step(x, y):
    with tf.GradientTape() as tape:
        logits = model(x, training=True)
        loss = loss_fn(y, logits)
    grads = tape.gradient(loss, model.trainable_weights)
    opt.apply_gradients(zip(grads, model.trainable_weights))
    acc_metric.update_state(y, logits)
    return loss

for epoch in range(epochs):
    for x, y in train_ds:
        loss = train_step(x, y)
    print(f"epoch {epoch}: loss={loss.numpy():.4f} acc={acc_metric.result().numpy():.4f}")
    acc_metric.reset_state()`,
    },
    {
      lang: "python",
      caption: "Cross-validation loop — train K models and average predictions",
      code: `import keras
import numpy as np
from sklearn.model_selection import StratifiedKFold

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
oof_preds = np.zeros(len(x_train))
test_preds = np.zeros(len(x_test))

for fold, (tr, va) in enumerate(skf.split(x_train, y_train)):
    model = build_model()                  # fresh model per fold
    model.fit(x_train[tr], y_train[tr],
              validation_data=(x_train[va], y_train[va]),
              epochs=50, callbacks=callbacks, verbose=0)
    oof_preds[va] = model.predict(x_train[va], verbose=0).ravel()
    test_preds   += model.predict(x_test, verbose=0).ravel() / skf.n_splits
    keras.backend.clear_session()          # free memory between folds
print(f"OOF AUC: {roc_auc_score(y_train, oof_preds):.4f}")`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "python",
      caption: "Custom Layer with build() (lazy weights) and get_config() (serializable)",
      code: `import keras
from keras import layers

@keras.saving.register_keras_serializable(package="custom")
class MLPSwiGLU(layers.Layer):
    def __init__(self, hidden, **kwargs):
        super().__init__(**kwargs)
        self.hidden = hidden

    def build(self, input_shape):
        d = input_shape[-1]
        self.w_gate = self.add_weight(shape=(d, self.hidden),
                                       initializer="glorot_uniform", name="w_gate")
        self.w_up   = self.add_weight(shape=(d, self.hidden),
                                       initializer="glorot_uniform", name="w_up")
        self.w_down = self.add_weight(shape=(self.hidden, d),
                                       initializer="glorot_uniform", name="w_down")

    def call(self, x):
        gate = keras.ops.silu(keras.ops.matmul(x, self.w_gate))
        up   = keras.ops.matmul(x, self.w_up)
        return keras.ops.matmul(gate * up, self.w_down)

    def get_config(self):
        return {**super().get_config(), "hidden": self.hidden}`,
    },
    {
      lang: "python",
      caption: "Custom Loss subclass — reusable + reducible + serializable",
      code: `import keras

@keras.saving.register_keras_serializable(package="custom")
class FocalLoss(keras.losses.Loss):
    """Focal loss: down-weights easy examples, focuses on hard ones."""
    def __init__(self, gamma=2.0, alpha=0.25, **kwargs):
        super().__init__(**kwargs)
        self.gamma = gamma
        self.alpha = alpha

    def call(self, y_true, y_pred):
        y_true = keras.ops.cast(y_true, "float32")
        y_pred = keras.ops.clip(y_pred, 1e-7, 1 - 1e-7)
        p_t = keras.ops.where(y_true == 1, y_pred, 1 - y_pred)
        alpha = keras.ops.where(y_true == 1, self.alpha, 1 - self.alpha)
        return -alpha * keras.ops.pow(1 - p_t, self.gamma) * keras.ops.log(p_t)

    def get_config(self):
        return {**super().get_config(), "gamma": self.gamma, "alpha": self.alpha}`,
    },
    {
      lang: "python",
      caption: "Custom Metric with stateful accumulation across batches",
      code: `import keras

@keras.saving.register_keras_serializable(package="custom")
class F1Score(keras.metrics.Metric):
    def __init__(self, name="f1", **kwargs):
        super().__init__(name=name, **kwargs)
        self.tp = self.add_weight(name="tp", initializer="zeros")
        self.fp = self.add_weight(name="fp", initializer="zeros")
        self.fn = self.add_weight(name="fn", initializer="zeros")

    def update_state(self, y_true, y_pred, sample_weight=None):
        y_pred = keras.ops.cast(y_pred > 0.5, "float32")
        y_true = keras.ops.cast(y_true, "float32")
        self.tp.assign_add(keras.ops.sum(y_pred * y_true))
        self.fp.assign_add(keras.ops.sum(y_pred * (1 - y_true)))
        self.fn.assign_add(keras.ops.sum((1 - y_pred) * y_true))

    def result(self):
        precision = self.tp / (self.tp + self.fp + 1e-7)
        recall    = self.tp / (self.tp + self.fn + 1e-7)
        return 2 * precision * recall / (precision + recall + 1e-7)

    def reset_state(self):
        self.tp.assign(0); self.fp.assign(0); self.fn.assign(0)`,
    },
    {
      lang: "python",
      caption: "Custom Callback — log per-epoch to Weights & Biases",
      code: `import keras

class WandbLogger(keras.callbacks.Callback):
    def __init__(self, log_every=50):
        super().__init__()
        self.log_every = log_every

    def on_train_batch_end(self, batch, logs=None):
        if batch % self.log_every != 0 or logs is None: return
        import wandb
        wandb.log({**logs, "batch": batch})

    def on_epoch_end(self, epoch, logs=None):
        import wandb
        wandb.log({**logs, "epoch": epoch})

# Usage: model.fit(..., callbacks=[WandbLogger(log_every=50)])`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "python",
      caption: "Forgot .compile() before .fit() — the canonical beginner error",
      code: `import keras

model = keras.Sequential([
    keras.layers.Dense(64, activation="relu", input_shape=(784,)),
    keras.layers.Dense(10),
])
# model.fit(x, y)  # RuntimeError: must compile first

model.compile(
    optimizer=keras.optimizers.Adam(1e-3),
    loss=keras.losses.SparseCategoricalCrossentropy(from_logits=True),
    metrics=[keras.metrics.SparseCategoricalAccuracy(name="acc")],
)
model.fit(x, y, epochs=10)

# After load_model(), the .keras file restores the compile config — but
# if you re-compile (e.g. with a new LR), you also reset the optimizer state.`,
    },
    {
      lang: "python",
      caption: "mixed_float16 overflow — keep the final logits in float32",
      code: `import keras

# Enable mixed precision globally
keras.mixed_precision.set_global_policy("mixed_float16")

model = keras.Sequential([
    keras.layers.Dense(256, activation="relu", input_shape=(784,)),
    keras.layers.Dense(256, activation="relu"),
    # CRITICAL: the output layer stays float32 so logits don't overflow fp16's +/-65504 range
    keras.layers.Dense(10, dtype="float32"),
])
model.compile(optimizer="adam",
              loss=keras.losses.SparseCategoricalCrossentropy(from_logits=True))
# Loss scaling is automatic on the TF backend (LossScaleOptimizer wraps your optimizer);
# on JAX/PyTorch use mixed_bfloat16 instead to skip scaling entirely.`,
    },
    {
      lang: "python",
      caption: "Custom layer not registered — load_model fails by class name",
      code: `import keras

# Layer file: custom_layers.py
@keras.saving.register_keras_serializable(package="myproj")
class MyLayer(keras.layers.Layer):
    ...

# Training file: train.py
model.save("model.keras")          # stores "myproj>MyLayer" as the class name

# Serving file: serve.py
# BAD: load_model fails with "Could not locate class 'myproj>MyLayer'"
# loaded = keras.saving.load_model("model.keras")

# GOOD: import the module that registers the class BEFORE load_model
import custom_layers                # triggers the @register_keras_serializable call
loaded = keras.saving.load_model("model.keras")

# Unsafe escape hatch (do NOT use on untrusted .keras files):
# loaded = keras.saving.load_model("model.keras", safe_mode=False)`,
    },
    {
      lang: "python",
      caption: "NaN detection + skip-step recovery in a custom train_step",
      code: `import keras
import tensorflow as tf

class RobustModel(keras.Model):
    def train_step(self, data):
        x, y = data
        with tf.GradientTape() as tape:
            y_pred = self(x, training=True)
            loss = self.compute_loss(x=x, y=y, y_pred=y_pred)
        # Skip the step entirely on non-finite loss
        if not tf.math.is_finite(loss):
            return {"loss": float("nan"), "skipped": 1.0}
        grads = tape.gradient(loss, self.trainable_weights)
        # Clip BEFORE apply_gradients to prevent explosion
        grads, _ = tf.clip_by_global_norm(grads, 1.0)
        self.optimizer.apply_gradients(zip(grads, self.trainable_weights))
        return self.compute_metrics(x, y, y_pred, sample_weight=None)`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "python",
      caption: "Multi-backend distribution — set the backend, then use Keras normally",
      code: `import os
# Must set BEFORE importing keras
os.environ["KERAS_BACKEND"] = "jax"      # or "tensorflow", "torch", "numpy"

import keras

# Build and train as usual — Keras 3 dispatches to the backend's distribution
model = build_model()
model.compile(optimizer="adam", loss="mse")
model.fit(train_ds, epochs=10)

# Switch backend at next process start by changing the env var;
# weights save/load across backends via .keras (architecture) + safetensors (weights)`,
    },
    {
      lang: "python",
      caption: "Multi-GPU with tf.distribute.MirroredStrategy — Keras adapts automatically",
      code: `import tensorflow as tf
import keras

strategy = tf.distribute.MirroredStrategy()
print(f"replicas: {strategy.num_replicas_in_sync}")

with strategy.scope():
    model = build_model()
    model.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss=keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=[keras.metrics.SparseCategoricalAccuracy()],
    )

# Keras .fit() auto-shards the dataset across replicas and all-reduces grads
model.fit(train_ds, epochs=10, validation_data=val_ds)

# For JAX backend, use jax.sharding.Mesh + keras.distribution.DeviceMesh
# For PyTorch backend, use torch.nn.parallel.DistributedDataParallel under the hood`,
    },
    {
      lang: "python",
      caption: "JAX backend — pmap-style SPMD via keras.distribution",
      code: `import os
os.environ["KERAS_BACKEND"] = "jax"
import keras
import jax

# Layout-agnostic distribution: shape annotations tell Keras how to shard
devices = jax.devices()                       # all visible devices
mesh = keras.distribution.DeviceMesh(
    shape=(len(devices),), axis_names=("batch",),
    devices=devices,
)
layout_map = keras.distribution.LayoutMap(mesh)
# Shard the first dimension of every weight / activation across the batch axis
layout_map[".*"] = keras.distribution.TensorLayout(["batch", "model"])

dist = keras.distribution.ModelParallel(layout_map=layout_map)
keras.distribution.set_distribution(dist)

# Build the model — every variable is automatically sharded across devices
model = build_model()
model.fit(train_ds, epochs=10)                 # JAX pmap / pjit under the hood`,
    },
    {
      lang: "python",
      caption: "Multiprocessing PyDataset — overlap Python-side data prep",
      code: `import keras

class MyDataset(keras.utils.PyDataset):
    def __init__(self, records, batch_size=32, **kwargs):
        super().__init__(**kwargs)
        self.records = records
        self.batch_size = batch_size

    def __len__(self):
        return (len(self.records) + self.batch_size - 1) // self.batch_size

    def __getitem__(self, idx):
        # This runs in a worker process — keep it picklable, no shared state
        start = idx * self.batch_size
        batch = self.records[start:start + self.batch_size]
        return process_batch(batch)

ds = MyDataset(records, batch_size=64)
model.fit(ds, epochs=10, workers=4, use_multiprocessing=True,
          max_queue_size=32)                  # prefetch 32 batches`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "python",
      caption: "pytest — verify layer shape, dtype, and gradient flow",
      code: `import keras
import numpy as np

def test_mlpswiglu_output_shape():
    layer = MLPSwiGLU(hidden=32)
    x = np.random.randn(8, 16).astype("float32")
    y = layer(x)                              # triggers build()
    assert y.shape == (8, 16)                 # residual: same shape as input

def test_mlpswiglu_dtype_under_mixed_policy():
    keras.mixed_precision.set_global_policy("mixed_float16")
    try:
        layer = MLPSwiGLU(hidden=32)
        y = layer(np.random.randn(8, 16).astype("float16"))
        # Compute in fp16, weights stored in fp32 (master weights)
        assert layer.w_gate.dtype == "float32"
    finally:
        keras.mixed_precision.set_global_policy("float32")

def test_mlpswiglu_gradients_flow():
    # GradientTape is a TF-backend concept; on JAX use jax.grad, on PyTorch use torch.autograd
    import tensorflow as tf
    layer = MLPSwiGLU(hidden=32)
    x = tf.convert_to_tensor(np.random.randn(8, 16).astype("float32"))
    with tf.GradientTape() as tape:
        y = layer(x)
        loss = keras.ops.sum(y)
    grads = tape.gradient(loss, layer.trainable_weights)
    for g in grads:
        assert g is not None
        assert keras.ops.all(keras.ops.isfinite(g))`,
    },
    {
      lang: "python",
      caption: "Numerical gradient check — finite differences vs analytic",
      code: `import keras
import numpy as np

def numerical_grad(f, x, eps=1e-4):
    """Finite-difference gradient of scalar f() w.r.t. Keras variable x."""
    arr = keras.ops.convert_to_numpy(x).copy()
    g = np.zeros_like(arr)
    it = np.nditer(arr, flags=["multi_index"], op_flags=["readwrite"])
    while not it.finished:
        i = it.multi_index
        orig = arr[i]
        arr[i] = orig + eps; x.assign(arr); f_plus  = float(f())
        arr[i] = orig - eps; x.assign(arr); f_minus = float(f())
        arr[i] = orig
        g[i] = (f_plus - f_minus) / (2 * eps)
        it.iternext()
    x.assign(arr)
    return g

# Compare analytic vs numerical for a custom layer (TF backend)
import tensorflow as tf
x = keras.Variable(np.random.randn(4, 3).astype("float32"))
with tf.GradientTape() as tape:
    y = keras.ops.sum(keras.ops.sigmoid(x @ keras.ops.eye(3)))
analytic = keras.ops.convert_to_numpy(tape.gradient(y, x))
numerical = numerical_grad(lambda: keras.ops.sum(keras.ops.sigmoid(
    x @ keras.ops.eye(3))), x)
np.testing.assert_allclose(analytic, numerical, atol=1e-3)`,
    },
    {
      lang: "python",
      caption: "Test a full model end-to-end — fit one batch, assert metric improvement",
      code: `import keras
import numpy as np

def test_model_learns_one_batch():
    model = build_model()
    model.compile(optimizer="adam",
                  loss="sparse_categorical_crossentropy",
                  metrics=["accuracy"])
    # Single batch repeated 50 times — model should overfit to accuracy >0.9
    x = np.random.randn(32, 784).astype("float32")
    y = np.random.randint(0, 10, size=(32,))
    history = model.fit(x, y, epochs=50, verbose=0)
    final_acc = history.history["accuracy"][-1]
    assert final_acc > 0.9, f"model did not learn: final acc={final_acc:.3f}"

def test_model_serialization_roundtrip():
    model = build_model()
    model.compile(optimizer="adam", loss="mse")
    model.fit(np.random.randn(8, 784), np.random.randn(8, 10), epochs=1, verbose=0)
    model.save("/tmp/test.keras")
    loaded = keras.saving.load_model("/tmp/test.keras")
    x = np.random.randn(4, 784).astype("float32")
    np.testing.assert_allclose(model.predict(x, verbose=0),
                               loaded.predict(x, verbose=0), atol=1e-5)`,
    },
    {
      lang: "python",
      caption: "Numerical stability tests — softmax under mixed precision",
      code: `import keras
import numpy as np

def test_softmax_finite_for_huge_logits():
    x = keras.ops.convert_to_tensor(np.array([1e4, 1e4, 1e4], dtype="float32"))
    p = keras.ops.softmax(x)
    assert keras.ops.all(keras.ops.isfinite(p))
    assert abs(float(keras.ops.sum(p)) - 1.0) < 1e-5

def test_mixed_bfloat16_no_overflow():
    keras.mixed_precision.set_global_policy("mixed_bfloat16")
    try:
        # bf16 has fp32 range so 1e10 should NOT overflow to inf
        x = keras.ops.convert_to_tensor(np.array([1e10, -1e10], dtype="float32"))
        x_bf16 = keras.ops.cast(x, "bfloat16")
        p = keras.ops.softmax(x_bf16)
        assert keras.ops.all(keras.ops.isfinite(p))
    finally:
        keras.mixed_precision.set_global_policy("float32")

def test_loss_handles_one_hot_vs_int_labels():
    # Verify both categorical and sparse_categorical produce same loss
    y_int  = np.array([0, 2, 1])
    y_onehot = np.eye(3)[y_int]
    logits = np.random.randn(3, 3).astype("float32")
    l1 = keras.losses.SparseCategoricalCrossentropy(from_logits=True)(y_int, logits)
    l2 = keras.losses.CategoricalCrossentropy(from_logits=True)(y_onehot, logits)
    np.testing.assert_allclose(float(l1), float(l2), rtol=1e-5)`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Default .fit() batch_size=32, default Adam lr=0.001. These are starting points, not tuned values — always tune.", tag: "perf" },
    { fact: "mixed_float16 policy: ~2x memory, 1.5-3x speed on Ampere/Hopper; mixed_bfloat16 has same speed without overflow risk (no loss scaling needed).", tag: "perf" },
    { fact: "EarlyStopping with restore_best_weights=True is mandatory for real training — without it you keep the weights from the LAST epoch, not the BEST.", tag: "gotcha" },
    { fact: "PyDataset (Keras 3) replaces Sequence; subclass and implement __getitem__/__len__ for custom pipelines outside tf.data.", tag: "version" },
    { fact: "Keras 3 supports JAX, TensorFlow, and PyTorch backends — switch with os.environ['KERAS_BACKEND']='jax' BEFORE importing keras.", tag: "version" },
    { fact: "Override train_step to keep .fit()'s callbacks, distribution, and progress bar while replacing the math — the canonical GAN/custom-loss pattern.", tag: "gotcha" },
    { fact: ".predict() is slow for one sample — call model(x) directly. .predict() has Python-side batching overhead for single-sample calls.", tag: "perf" },
    { fact: "Keras 3 ops namespace (keras.ops.*) is the backend-agnostic replacement for tf.* — using tf.* inside a layer breaks JAX/PyTorch backends.", tag: "gotcha" },
    { fact: "steps_per_epoch = ceil(num_samples / batch_size); pass only if you want an epoch to be a fraction of the dataset (useful for huge data).", tag: "complexity" },
    { fact: "Initializers matter: 'glorot_uniform' (Xavier) for tanh/sigmoid, 'he_normal' for ReLU-family. Wrong init → slow or no convergence.", tag: "gotcha" },
    { fact: "Custom Layer lifecycle: __init__ for config (no weights), build(input_shape) for weights (called once, lazily), call(x) for forward.", tag: "complexity" },
    { fact: "keras.distribution.ModelParallel (3.5+) on the JAX backend gives SPMD sharding via jax.pjit — pmap-style multi-GPU without writing JAX code.", tag: "version" },
    { fact: "loss='sparse_categorical_crossentropy' for integer labels; 'categorical_crossentropy' for one-hot. Picking the wrong one silently trains on garbage.", tag: "gotcha" },
    { fact: "model.evaluate() runs in inference mode (training=False); for stochastic forward passes, use a custom predict_step or call model(x, training=True) directly.", tag: "gotcha" },
    { fact: "Keras outputs are backend tensors — call .numpy() to convert; on the JAX backend this materializes a DeviceArray (blocking transfer).", tag: "gotcha" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "KerasCore / Keras 3", purpose: "The multi-backend Keras package itself — runs the same code on TF, JAX, PyTorch, and NumPy backends.", url: "https://keras.io/keras_3/", category: "build" },
    { tool: "KerasCV", purpose: "Computer-vision models, layers, and augmentation pipelines — YOLO, Stable Diffusion, image classifiers.", url: "https://keras.io/keras_cv/", category: "build" },
    { tool: "KerasNLP", purpose: "NLP models and tokenizers — Transformer, BERT, GPT, Llama, Mistral, Gemma families as ready-to-use layers.", url: "https://keras.io/keras_nlp/", category: "build" },
    { tool: "KerasTuner", purpose: "Hyperparameter search (random, Bayesian, Hyperband) — same API as scikit-learn's RandomizedSearchCV.", url: "https://keras.io/keras_tuner/", category: "test" },
    { tool: "AutoKeras", purpose: "AutoML on top of Keras — auto architecture search for image, text, tabular.", url: "https://autokeras.com/", category: "build" },
    { tool: "TensorFlow.js", purpose: "Keras models in the browser and Node.js — convert .keras via tensorflowjs_converter.", url: "https://www.tensorflow.org/js", category: "deploy" },
    { tool: "TFLite", purpose: "On-device inference — convert Keras model to .tflite for Android/iOS/edge, with int8 quantization.", url: "https://www.tensorflow.org/lite/convert/", category: "deploy" },
    { tool: "TF-Serving", purpose: "C++ production serving — load a .keras-exported SavedModel and serve via gRPC/REST.", url: "https://www.tensorflow.org/tfx/guide/serving", category: "deploy" },
    { tool: "ONNX", purpose: "Cross-runtime format — Keras 3.5+ has native keras.export(model, format='onnx'); serve outside Google's stack.", url: "https://onnxruntime.ai/", category: "deploy" },
    { tool: "JAX", purpose: "High-performance numerical library; Keras 3's JAX backend uses it for XLA + functional transforms (vmap, pmap).", url: "https://jax.readthedocs.io/", category: "build" },
    { tool: "PyTorch", purpose: "Deep-learning framework; Keras 3's PyTorch backend lets you train Keras models with torch.distributed underneath.", url: "https://pytorch.org/", category: "build" },
    { tool: "TensorBoard", purpose: "Built-in viz via keras.callbacks.TensorBoard — scalars, histograms, projector, profiler.", url: "https://www.tensorflow.org/tensorboard", category: "debug" },
    { tool: "Weights & Biases", purpose: "Experiment tracking — wandb.keras.WandbCallback is the standard 3-line integration.", url: "https://docs.wandb.ai/guides/integrations/keras", category: "debug" },
    { tool: "MLflow", purpose: "Open-source experiment tracking + model registry — autolog() captures Keras metrics automatically.", url: "https://mlflow.org/docs/latest/tracking/autolog.html", category: "debug" },
    { tool: "Keras Hub", purpose: "Pretrained model hub — fine-tune Llama, Gemma, BERT with one call to .fit(); successor to TensorFlow Hub.", url: "https://keras.io/keras_hub/", category: "build" },
    { tool: "HuggingFace Transformers", purpose: "Keras 3 compatible — TFKerasModel classes load HF checkpoints into Keras 3 layers.", url: "https://huggingface.co/docs/transformers/en/main_classes/keras_callbacks", category: "build" },
    { tool: "Ray Train", purpose: "Distributed training across many hosts — wraps Keras .fit() with Ray's actor model.", url: "https://docs.ray.io/en/latest/train/keras.html", category: "deploy" },
    { tool: "OpenVINO", purpose: "Intel inference runtime — convert Keras via openvino.tools.mo for CPU/iGPU optimization.", url: "https://docs.openvino.ai/latest/notebooks/101-tensorflow-to-openvino-with-output.html", category: "deploy" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "0.1",  year: 2015, highlight: "First release by François Chollet — high-level API over Theano and TensorFlow." },
    { version: "1.0",  year: 2017, highlight: "Sequential + Functional API; adopted as TensorFlow's high-level interface (tf.keras)." },
    { version: "2.0",  year: 2017, highlight: "Subclassing API; Eager execution default in TF 2.0; tf.keras becomes the canonical entry point." },
    { version: "2.1",  year: 2018, highlight: "Multi-backend support dropped (focused on TF only); tf.keras.layers.experimental namespace." },
    { version: "2.2",  year: 2018, highlight: "train_step override; the foundation for custom GAN/contrastive loops." },
    { version: "2.3",  year: 2019, highlight: "Mixed precision policy API; preprocessing layers (TextVectorization, Rescaling)." },
    { version: "2.4",  year: 2020, highlight: "Save format standardized on .h5 + SavedModel; unified Keras API across eager + graph." },
    { version: "2.5",  year: 2021, highlight: "PyDataset (formerly Sequence) refined; preprocessor layers marked stable." },
    { version: "2.6",  year: 2021, highlight: "Split into separate keras pip package; tf.keras kept as TF-bundled copy." },
    { version: "2.7",  year: 2021, highlight: "Preprocessing layers moved into core keras.layers; KerasCV/KerasNLP introduced." },
    { version: "2.8",  year: 2022, highlight: "Discretization + string lookups became non-experimental; distributed training polish." },
    { version: "2.9",  year: 2022, highlight: "KerasTuner integration expanded; mixed_bfloat16 policy on CPU/GPU." },
    { version: "2.10", year: 2022, highlight: "Compilable via XLA (jit_compile=True on .fit()); Apple Silicon GPU support." },
    { version: "2.11", year: 2022, highlight: "AdamW optimizer added; integer quantization APIs expanded for TFLite." },
    { version: "2.12", year: 2023, highlight: "Python 3.11 support; Keras Preprocessing moved entirely to keras.layers." },
    { version: "2.13", year: 2023, highlight: "Last single-backend Keras 2.x release; migration path to Keras 3 documented." },
    { version: "3.0",  year: 2023, highlight: "Keras 3 GA — multi-backend (TF, JAX, PyTorch, NumPy); new .keras zip format." },
    { version: "3.1",  year: 2024, highlight: "keras.ops namespace unified across backends; Keras Hub (pretrained models) launched." },
    { version: "3.2",  year: 2024, highlight: "JAX distribution API; scaled_dot_product_attention in keras.ops." },
    { version: "3.3",  year: 2024, highlight: "keras.distribution.ModelParallel for SPMD on JAX; safetensors weight support." },
    { version: "3.4",  year: 2024, highlight: "Native ONNX export; KerasNLP LLM finetuning APIs matured (Gemma, Llama)." },
    { version: "3.5+", year: 2025, highlight: "Stabilized cross-backend LayerNorm / Attention / RoPE; torch.compile support under PyTorch backend." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "When do you use Sequential vs. Functional vs. subclassing?", a: "Sequential: only linear stacks of layers — no branches, skips, or multi-input/output. Functional (keras.Input + chained layer calls + keras.Model): any DAG topology, the default for serious work. Subclassing (class M(keras.Model)): only when you need custom train_step, custom losses that depend on intermediate activations, or imperative control flow that can't be expressed as a graph. Subclassing sacrifices serialization ergonomics for flexibility.", difficulty: "easy" },
    { q: "What does .compile() actually do, and what happens if you forget it?", a: ".compile() attaches an optimizer, loss, and metrics to the model, configuring the training contract. .fit() raises RuntimeError if you forget. After load_model() the .keras file restores the compile config — but re-compiling resets optimizer state (iterations, Adam moments), so resume training from the loaded optimizer instead of re-creating one.", difficulty: "easy" },
    { q: "How does the train_step override pattern work?", a: "Subclass keras.Model and override train_step(self, data). .fit() still handles epoch iteration, callbacks, progress bar, and distribution — but each batch is processed by your train_step. You write the GradientTape, compute_loss, apply_gradients, and return a dict of metrics. This is the canonical pattern for GANs, contrastive learning, RL, and any setup where loss(y, y_pred) doesn't fit.", difficulty: "medium" },
    { q: "How does Keras 3 run the same code on three different backends?", a: "Every layer/loss/metric calls into keras.ops.* — a namespace of backend-agnostic ops (matmul, softmax, where, etc.) that dispatch to tf.*, jax.numpy.*, or torch.* based on the KERAS_BACKEND env var. Weights are keras.Variable wrappers around backend-native Variables. The .keras format stores config.json (architecture) + backend-agnostic weight tensors (safetensors), so you can train on JAX and load on TF.", difficulty: "hard" },
    { q: "Why does mixed_float16 need the final Dense to be float32?", a: "fp16's range is ±65504 — a few hundred in pre-softmax logits is fine, but a high-learning-rate step or a sharp class imbalance can push logits past 65504, producing inf and NaN loss. The fix: cast the output layer to float32 so logits + softmax happen in fp32. mixed_bfloat16 doesn't have this problem (bf16 has fp32's range), so no special last-layer casting is needed.", difficulty: "medium" },
    { q: "What does restore_best_weights=True in EarlyStopping actually do?", a: "Without it, EarlyStopping stops training but you keep the weights from the LAST epoch (which by definition is past the best). restore_best_weights=True caches the weights at the epoch where val_loss was minimum and copies them back when training stops. Without this flag, EarlyStopping is mostly useless — you stop early but keep worse weights than you would have without early stopping.", difficulty: "easy" },
    { q: "How does @register_keras_serializable work and why is it needed?", a: "The .keras file stores class names (e.g. 'myproj>MLPSwiGLU') plus the constructor kwargs from get_config(). On load, Keras looks up the class by name in a registry and calls cls.from_config(kwargs). The decorator populates that registry when the module is imported. Without it (or if you forget to import the module before load_model), load_model raises 'Could not locate class'. safe_mode=False bypasses the registry by eval-ing the class path — dangerous for untrusted files.", difficulty: "medium" },
    { q: "When would you choose Keras over raw PyTorch/TF?", a: "Keras wins when: (1) the architecture fits the Functional API (90% of CNN/Transformer work); (2) you want concise, reviewable model definitions; (3) you want to swap backends (train on JAX, serve on TF); (4) teaching/onboarding — .compile()/.fit() trinity is intuitive. Raw frameworks win when: (1) you need gradient-level control (custom autograd); (2) you're writing research code that pushes the framework; (3) LLM pretraining at scale where Keras's abstraction overhead matters.", difficulty: "medium" },
    { q: "How does PyDataset differ from a Python generator?", a: "A generator passed to .fit() works but runs in the main thread (no overlap with training). PyDataset is a class with __len__ and __getitem__, so Keras knows the number of batches upfront, can show a progress bar, and (with workers=N, use_multiprocessing=True) spawns worker processes that prefetch batches in parallel. PyDataset is also picklable across processes — generators aren't.", difficulty: "medium" },
    { q: "How would you debug a custom Layer whose gradients are NaN?", a: "(1) keras.backend.set_value(layer.w, np.nan) won't help — instead, run model(x) on a tiny batch and check each intermediate output with print(keras.ops.any(keras.ops.isnan(t))). (2) Wrap the layer in a model with GradientTape and inspect gradients after tape.gradient — if grads are None, the variable isn't connected. (3) Try the layer in isolation under float32 first (mixed precision can cause overflow). (4) Check the loss reduction — summing per-sample losses across huge batches can overflow fp16.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "PyTorch (native)", whenThis: "Rapid prototyping of standard architectures, multi-backend portability (JAX/TF/PyTorch), teaching, when .compile()/.fit() trinity covers 90% of needs.", whenThat: "Custom training loops with per-step control, gradient hacking, research where .fit() gets in the way, anything needing inline backward introspection." },
    { vs: "TensorFlow (native)", whenThis: "Concise model definitions via Functional API, multi-backend portability, when you want Keras's sensible defaults over TF verbosity.", whenThat: "TF-specific features (TPU strategy, TFLite, tf.data details) you need to control directly, or production serving where you need SavedModel with a custom signature." },
    { vs: "JAX / Flax", whenThis: "Quick iteration with .fit(), Keras Hub pretrained models, when functional purity isn't load-bearing for your project.", whenThat: "Massive SPMD model parallelism, first-class vmap/pmap/grad-of-grad, XLA-native programming without eager overhead, when you can't afford the Keras abstraction layer." },
    { vs: "scikit-learn", whenThis: "Deep learning (any architecture with layers), gradient-based optimization, GPU/TPU compute, anything larger than ~1M parameters.", whenThat: "Tabular data baselines, classical ML (RF, XGBoost-style), preprocessing pipelines, model selection with grid search over hyperparameters." },
    { vs: "PyTorch Lightning", whenThis: "Multi-backend portability, when you want the Keras layer API and distribution abstraction as defaults.", whenThat: "PyTorch-native research code where Lightning's Trainer abstraction fits your needs; deep ecosystem momentum in the PyTorch community." },
  ],
};

export default sheet;
