# Keras

**Category:** ML / AI · **Tier:** ML / AI · **Tags:** deep-learning, neural-networks, high-level-api, sequential, functional, multi-backend, python · **First released:** 2015 · **Author:** François Chollet (Google) · **Last updated:** 2026-11

> High-level neural-network API — stack layers, compile, fit. Three backends (TF, JAX, PyTorch) under one interface since Keras 3.

---

## TL;DR

- Keras is a layered, declarative API for building neural networks: you compose layers into a model, call .compile(optimizer, loss, metrics), then .fit(data, epochs). That trinity covers ~90% of real work.
- It was originally a front-end over TensorFlow/Theano/CNTK; since Keras 3 (2023) it is a unified multi-backend interface that runs the same code on TensorFlow, JAX, and PyTorch, with NumPy as a fallback.
- Reach for it when you want concise, readable model definitions, sensible defaults, and the ability to switch backend for deployment (e.g. train on JAX, serve on TF).
- Avoid it when you need gradient-level control of unusual architectures (drop to native PyTorch/TF), or for classical ML (use scikit-learn). For LLM training at scale, native framework APIs are usually faster than the Keras abstraction layer.

## Core Mental Model

**Build → compile → fit: three phases, three contracts.** A Keras model is a graph of layers wired in __init__ (Sequential) or via the functional API (Input → call layers → Model(inputs, outputs)). .compile() stamps the model with an optimizer, a loss, and metrics — it commits the training contract. .fit() then runs the standard loop (forward, loss, backward, optimizer step) with callbacks firing at epoch/batch boundaries. Override train_step() to break out of the default loop while keeping .fit()'s plumbing (callbacks, distribution, progress bar) for free.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| keras.Sequential([Dense(64, activation="relu"), Dense(10)]) | Linear stack of layers — forward = chained calls. | Linear pipelines only; cannot express branches, skips, or multi-input. |
| inputs = keras.Input((784,)); x = Dense(64)(inputs); model = keras.Model(inputs, x) | Functional API — layers are called on tensors, returning tensors; the graph is captured by Model. | Anything non-linear: ResNets, multi-input, multi-output, skip connections. Default choice for serious work. |
| model.compile(optimizer="adam", loss="mse", metrics=["accuracy"]) | Configures training — string shortcuts resolve to canonical objects; required before .fit(). | Always — .fit() raises if you forget. Re-compiling resets optimizer state. |
| model.fit(x, y, epochs=10, batch_size=32, validation_split=0.2, callbacks=[...]) | Runs the training loop, returns a History object with per-epoch loss/metric arrays. | Standard supervised training. Pass a tf.data.Dataset for production pipelines. |
| model.evaluate(x, y); model.predict(x) | Compute loss+metrics on test data; predict() returns forward-pass outputs in batches. | Evaluation and inference. For single samples, model(x) is faster (no batching setup). |
| class L(keras.layers.Layer):   def build(self, shape): ...   def call(self, x): ... | Custom layer — build() lazily creates weights (input-shape-aware), call() defines forward; get_config() enables serialization. | Anything not in the standard library; required reading for serious Keras users. |
| keras.callbacks.EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True) | Stops training when a monitored metric stops improving; optionally restores the best epoch's weights. | Every real training run — saves time and prevents overfitting. Always set restore_best_weights=True. |
| keras.callbacks.ModelCheckpoint("best.keras", save_best_only=True) | Saves the model (or weights) at each epoch, optionally only when a metric improves. | Long training runs; pair with EarlyStopping so you keep the best model. |
| model.save("m.keras"); keras.saving.load_model("m.keras") | Serializes architecture + weights + optimizer state + custom objects into a single .keras zip. | Persistent model artifacts. .keras (Keras 3) replaces the legacy .h5 and SavedModel formats. |
| @keras.saving.register_keras_serializable() | Decorator that registers a custom class/function so it can be deserialized by name from a .keras file. | Any custom layer, loss, metric, or activation used in a saved model — without this, load_model fails. |
| keras.mixed_precision.set_global_policy("mixed_float16") | Switches all layers to compute in float16, storing master weights in float32 — 2× memory, 1.5–3× speed on tensor cores. | GPU training on Volta+. The final Dense layer must be float32 — use keras.layers.Dense(..., dtype="float32"). |
| class M(keras.Model):   def train_step(self, data): ... | Override the per-batch training step; .fit() calls this, so you keep callbacks/distribution/progress for free. | Custom losses, GANs, multi-input targets, contrastive learning — anywhere the default loss(y, y_pred) doesn't fit. |
| keras.utils.PyDataset | Base class for a Python-side dataset that yields batches — Keras handles multiprocessing and prefetch. | Data that doesn't fit tf.data (e.g. streaming from a custom server). Replaces Sequence in Keras 3. |

## Idiomatic Patterns

**Functional API with skip connection — the standard non-linear model**

```python
import keras
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
model.summary()
```

**Custom Layer with build() (lazy weights) and get_config() (serializable)**

```python
import keras
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
        return {**super().get_config(), "hidden": self.hidden}
```

**Custom train_step for a GAN-style two-loss training — keeps .fit() plumbing**

```python
import keras
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
            d_loss = self.loss_fn(tf.ones_like(d_real), d_real) + \
                     self.loss_fn(tf.zeros_like(d_fake), d_fake)
            g_loss = self.loss_fn(tf.ones_like(d_fake), d_fake)
        self.d_opt.apply_gradients(zip(d_tape.gradient(d_loss, self.disc.trainable_weights),
                                       self.disc.trainable_weights))
        self.g_opt.apply_gradients(zip(g_tape.gradient(g_loss, self.gen.trainable_weights),
                                       self.gen.trainable_weights))
        self.d_loss_tracker.update_state(d_loss)
        self.g_loss_tracker.update_state(g_loss)
        return {m.name: m.result() for m in self.metrics}
```

**Callbacks: EarlyStopping + ModelCheckpoint + TensorBoard**

```python
import keras

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
# history.history: dict of loss/metric per epoch — plot to diagnose
```

**Save/load the full model (architecture + weights + optimizer + custom layers)**

```python
import keras

# Save — .keras is a zip with config.json + weights + optimizer state
model.save("model.keras")

# Load — custom layers resolve via @register_keras_serializable decorator
loaded = keras.saving.load_model("model.keras")

# Continue training from where we left off
loaded.fit(train_ds, epochs=5, initial_epoch=10)

# Weights-only path (cross-framework friendly)
model.save_weights("weights.h5")
model.load_weights("weights.h5")    # architecture must match exactly
```

## Common Pitfalls

1. **Forgot .compile() before .fit()** — *Symptom:* RuntimeError: 'You must compile your model before training/testing.' — happens after .load_model() if you skipped compile, or after manually building a functional model. *Fix:* Always call model.compile(optimizer=..., loss=..., metrics=...) before .fit(). Loaded models from .keras include the compiled config, but re-compile if you want a new optimizer or learning rate.
2. **Custom layer not registered for save/load** — *Symptom:* ValueError on load_model: 'Could not locate class ...' — the .keras file stores the class name, not the code. *Fix:* Decorate every custom layer/loss/metric with `@keras.saving.register_keras_serializable(package="x")` and import that module before calling load_model. Or use safe_mode=False (not recommended for untrusted files).
3. **mixed_float16 overflows the final logits** — *Symptom:* Loss becomes NaN after a few steps with mixed precision enabled — float16 can't represent values >65504. *Fix:* Set the global policy to mixed_float16, then explicitly cast the output Dense layer: `Dense(num_classes, dtype="float32")`. Keras 3's OutputLayer handles this automatically.
4. **validation_split shuffles time-series data** — *Symptom:* validation loss looks unrealistically low; .fit(x, y, validation_split=0.2) takes the LAST 20% but the data is time-ordered — you're validating on the future. *Fix:* Manually split with sklearn.train_test_split(shuffle=False) and pass validation_data=(x_val, y_val). Never use validation_split on sequential data without prior shuffling.
5. **.predict() is slow for one sample** — *Symptom:* Calling model.predict(x_single) in a request handler takes 50–200 ms even for a tiny model — overhead from Python-side batching and graph dispatch. *Fix:* Call the model directly: `model(tf.constant(x_single))[0].numpy()`. Reserve .predict() for batched inference on a Dataset; for serving, export to SavedModel or ONNX.
6. **Sequential used where it doesn't fit** — *Symptom:* Trying to add a second Input, a skip connection, or multiple outputs to a Sequential model — fails or silently flattens the architecture. *Fix:* Switch to the Functional API (keras.Input + keras.Model) the moment you need any branching. Sequential is for literally linear stacks; it's not a 'simpler' version of functional.
7. **BatchNorm in functional API needs the right input rank** — *Symptom:* ValueError about shape rank — BatchNorm computes mean over axes that depend on whether the input is 2D (axis=1) or 4D (axis=[1,2]). *Fix:* Pass axis explicitly: BatchNorm(axis=-1) for 2D, BatchNorm(axis=[0,1,2]) or default for 4D. Don't rely on the inferred axis; document it in the layer construction.

## Production / Interview Quick Reference

- Keras 3.15.1 (Jul 2026) is current — export_torch path and security hardening for dataset loaders. `version`
- Default .fit() batch_size=32, default Adam lr=0.001. These are starting points, not tuned values — always tune. `perf`
- EarlyStopping with restore_best_weights=True is mandatory for real training — without it you keep the weights from the LAST epoch, not the BEST. `gotcha`
- .keras format (Keras 3, 2023) is a zip with config.json + model.weights + optimizer. Replaces .h5 (single-backend) and SavedModel (TF-only). `version`
- Keras 3 supports JAX, TensorFlow, and PyTorch backends — switch with `import os; os.environ["KERAS_BACKEND"]="jax"` BEFORE importing keras. `version`
- mixed_float16 policy: ~2× memory, 1.5–3× speed on Ampere/Hopper; mixed_bfloat16 has same speed without overflow risk (no GradScaler needed). `perf`
- model.summary() shows layer shapes, parameter counts, and total trainable/non-trainable split — read it before training to catch shape bugs. `gotcha`
- steps_per_epoch = ceil(num_samples / batch_size); pass only if you want an epoch to be a fraction of the dataset (useful for huge data). `complexity`
- Override train_step to keep .fit()'s callbacks, distribution, and progress bar while replacing the math — the canonical GAN/custom-loss pattern. `gotcha`
- PyDataset (Keras 3) replaces Sequence; subclass and implement __getitem__ / __len__ for custom data pipelines outside tf.data. `version`
- Keras outputs are backend tensors — call .numpy() to convert; on the JAX backend this materializes a DeviceArray. `gotcha`
- Custom Layer lifecycle: __init__ for config (no weights), build(input_shape) for weights (called once, lazily), call(x) for forward. `complexity`
- Initializers matter: 'glorot_uniform' (Xavier) for tanh/sigmoid, 'he_normal' for ReLU-family. Wrong init → slow or no convergence. `gotcha`
- loss='sparse_categorical_crossentropy' for integer labels; 'categorical_crossentropy' for one-hot. Picking the wrong one silently trains on garbage. `gotcha`
- Keras 3 dropped multi-backend support for some TF-only features (e.g. tf.keras.experimental) — check the migration guide. `version`
- model.evaluate() runs in inference mode (training=False); for custom layers with stochastic forward passes, pass training=True explicitly or use a separate inference method. `gotcha`

## Go Deeper

- [Keras Official Documentation (keras.io)](https://keras.io/guides/) — Authoritative guides — read 'The Functional API', 'Making New Layers and Models via Subclassing', and 'Customizing What Happens in fit'.
- [Deep Learning with Python (François Chollet)](https://www.manning.com/books/deep-learning-with-python-second-edition) — Written by Keras's creator; the canonical book for both the API and the deep-learning intuition behind it.
- [Keras 3 Announcement — One API, Three Backends](https://keras.io/keras_3/) — Explains the multi-backend design and migration path; read before adopting Keras 3 in production.
- [Keras Code Examples](https://keras.io/examples/) — Official, versioned recipes — the GAN, Transformer, and Vision Transformer examples are widely cited reference implementations.
- [The Functional API FAQ](https://keras.io/guides/functional_api/) — Definitive reference on when and how to use the functional API vs. subclassing — answers the questions that come up in every code review.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| float32 | 32-bit IEEE float — the default Keras compute dtype; master weights under mixed precision. | Default everywhere. Override per-layer with dtype='float16' or dtype='mixed_float16'. |
| float16 | 16-bit float — 5 exponent + 10 mantissa bits. Range ±65504, prone to overflow. | Per-layer compute dtype under mixed_float16 policy; the final Dense must stay float32. |
| bfloat16 | 16-bit float — 8 exponent + 7 mantissa bits. Same range as fp32, lower precision. | mixed_bfloat16 policy on Ampere+ GPUs and TPUs; safer than fp16 (no loss scaling needed). |
| float64 | 64-bit IEEE double — rarely used in deep learning. | Scientific computing, numerical-grad checks. Most backends support it but slowly. |
| int32 / int64 | Signed integer types — for labels, indices, embeddings. | Sparse categorical targets default to int32; some backends prefer int64 for gather ops. |
| int8 / uint8 | 8-bit integer — quantization-aware training (int8), image pixels (uint8). | Quantization for edge deployment (TFLite, OpenVINO). |
| bool | Boolean — used as attention masks and conditions. | Passing padding masks to layers (Masking, Embedding mask_zero=True). |
| string | Variable-length byte string — only on the TF backend. | Raw text pipelines via TextVectorization; backend-specific (JAX/PyTorch don't have string tensors). |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| keras.Tensor | Symbolic tensor in the Functional API — has a dtype, shape, and KerasHistory linking to the layer that produced it. | Functional model construction (Input + chained layer calls). NOT the same as the backend's Tensor type. |
| keras.Variable | Mutable, named backend tensor — created by add_weight(); auto-tracked by the parent Layer. | Weights inside custom layers. Never create backend-native Variables directly — use self.add_weight(). |
| keras.src.backend.Variable | Backend-agnostic Variable wrapper — the actual storage class behind add_weight(). | Internal; users interact via add_weight() return value. |
| tf.data.Dataset | Lazy prefetching iterator — the recommended input source for Keras on the TF backend. | Always on TF; for JAX/PyTorch backends use tf.data, PyDataset, or array tuples. |
| keras.utils.PyDataset | Subclassable Python-side dataset that yields batches — Keras 3 handles multiprocessing. | Data not in tf.data (custom streams, RPC). Replaces Sequence from Keras 2. |
| (x, y) tuple / (x, y, sample_weight) tuple | The standard supervised-data shape — Keras unpacks it in train_step / test_step / predict. | Passing NumPy arrays or lists directly to .fit() for small datasets. |
| dict input / output | Named tensors by string key — supported by the Functional API via Input(name=...). | Multi-input/multi-output models; named signature for serving. |
| keras.ops.* | Backend-agnostic ops namespace — same code on TF, JAX, PyTorch. The correct replacement for tf.* / torch.* inside Keras layers. | Inside custom layers/losses. Use keras.ops.matmul, keras.ops.softmax, etc. — never call the backend directly. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class L(keras.layers.Layer):   def build(self, shape): ...   def call(self, x): ... | Custom layer — build() lazily creates weights, call() defines forward; get_config() enables save/load. | Anything not in the standard library; required reading for serious Keras users. |
| class M(keras.Model):   def train_step(self, data): ... | Override the per-batch step; .fit() calls it, you keep callbacks/distribution/progress for free. | GANs, contrastive learning, multi-loss heads — anywhere the default loss(y, y_pred) doesn't fit. |
| class Loss(keras.losses.Loss):   def call(self, y_true, y_pred): ... | Custom loss returning per-sample values; reduction is handled by the framework. | Custom objectives; subclassing gets you serialization + reduction for free. |
| class Metric(keras.metrics.Metric):   def update_state(self, y_true, y_pred): ...   def result(self): ... | Stateful metric — accumulates across batches, resets between epochs. | Custom metrics (F1, IoU); preferred over stateless functions when value depends on full epoch. |
| @keras.saving.register_keras_serializable() | Decorator that registers a class/function so .keras files can deserialize it by name. | Any custom layer/loss/metric/activation used in a saved model — without this, load_model fails. |
| class CB(keras.callbacks.Callback):   def on_epoch_end(self, epoch, logs=None): ... | Hook into training lifecycle events (epoch/batch begin/end). | Custom logging, LR schedules, early stopping criteria that built-in callbacks don't cover. |
| class Opt(keras.optimizers.Optimizer):   def update_step(self, grad, var, lr): ... | Custom optimizer — implement update_step; base class handles iterations, gradients, slot variables. | Research optimizers. For Lion/Adafactor prefer subclassing over re-implementing Adam. |
| keras.Sequential([...]) | Linear stack of layers — forward = chained calls, no branching. | Linear pipelines only. Anything with skips/branches needs the Functional API. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, keras.ops.add(a, b) | Element-wise add with broadcasting; backend-agnostic. | Math inside custom layers. Never use tf.add or torch.add directly — breaks multi-backend. |
| a @ b, keras.ops.matmul(a, b) | Matrix multiply — 2D and batched forms. | Standard matmul. For attention use the keras MultiHeadAttention layer, not raw ops. |
| keras.ops.einsum('bihd,bjhd->bij', q, k) | Einstein summation — arbitrary tensor contractions. | Multi-tensor contractions in custom attention / GNN layers. |
| keras.ops.concatenate([a, b], axis=-1) | Concatenates tensors along an existing axis. | Joining features, multi-head outputs, skip-merge via layers.Concatenate. |
| keras.ops.stack([a, b], axis=0) | Stacks along a NEW axis — adds a dimension. | Aggregating per-head outputs into a new dim. |
| keras.ops.softmax(x, axis=-1) | Normalized exp along axis — sums to 1. | Classification head, attention weights. Use log_softmax for stability. |
| keras.ops.sigmoid(x) | 1 / (1 + e^-x) — squashes to (0,1). | Binary logits, gates. |
| keras.ops.relu / gelu / silu / mish | Activation functions — relu (cheap), gelu (transformers), silu/swish (modern LLMs). | Pick by architecture: MLPs → relu/gelu, LLMs → silu, conv → relu/mish. Most layers accept activation='silu'. |
| keras.ops.where(cond, a, b) | Element-wise ternary — picks from a where cond is True, else b. | Masking, conditional gradient routes, custom losses. |
| keras.ops.take(x, indices, axis=0) | Selects slices along axis at positions in indices. | Embedding lookups (use Embedding layer instead), MoE routing. |
| keras.ops.scatter(indices, updates, shape) | Inverse of take — writes updates into a fresh zero tensor at sparse indices. | MoE dispatch, gradient accumulation by index. |
| keras.ops.norm(x, axis=-1) | L2 norm along axis. | Layer norm internals, distance metrics. |
| keras.ops.sum / mean / max / min(x, axis=...) | Reductions — pass axis to keep rank, omit for scalar. | Loss reductions, mean over batch. |
| keras.ops.reshape / transpose / expand_dims | Shape manipulation — backend-agnostic. | Adapting tensor shapes between layers; the cross-backend safe alternative to tf.reshape. |
| keras.ops.stop_gradient(x) | Returns a tensor equal to x but treated as a constant in autodiff. | Detach computations from the graph (e.g. target networks in RL, EMA weights). |

## Input / Output

**Save and load the full model (architecture + weights + optimizer + custom layers)**

```python
import keras

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
model.export("model_dir")            # SavedModel-style directory (TF backend)
```

**tf.data pipeline as Keras input — overlap data with compute**

```python
import tensorflow as tf
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
model.fit(train_ds, validation_data=val_ds, epochs=10)
```

**PyDataset for non-tf.data pipelines (custom streams, RPC)**

```python
import keras
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
model.fit(ds, epochs=10, workers=4, use_multiprocessing=True)
```

**Export to SavedModel / ONNX for serving**

```python
import keras

# Keras 3 native export (TF backend) — directory with serving signature
model.export("serving_dir/1")
# Loadable by TF-Serving, TFLite Converter, TF.js

# ONNX export via Keras 3 (3.5+) — cross-runtime inference
keras.export(model, "model.onnx", format="onnx")

# For JAX backend, export a .pb that can be served via jax2tf + SavedModel
# For PyTorch backend, use torch.jit.trace(model.eval(), dummy) for TorchScript
```

## Loops & Iteration

**The standard .fit() loop with EarlyStopping + checkpointing**

```python
import keras

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
# Without restore_best_weights=True you keep the LAST (worst-on-val) epoch
```

**Custom train_step — keep .fit() plumbing while replacing the math**

```python
import keras
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
        return {"loss": self.loss_tracker.result()}
```

**Custom training loop with GradientTape — when .fit() is not enough**

```python
import keras
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
    acc_metric.reset_state()
```

**Cross-validation loop — train K models and average predictions**

```python
import keras
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
print(f"OOF AUC: {roc_auc_score(y_train, oof_preds):.4f}")
```

## Functions & Callables

**Custom Layer with build() (lazy weights) and get_config() (serializable)**

```python
import keras
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
        return {**super().get_config(), "hidden": self.hidden}
```

**Custom Loss subclass — reusable + reducible + serializable**

```python
import keras

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
        return {**super().get_config(), "gamma": self.gamma, "alpha": self.alpha}
```

**Custom Metric with stateful accumulation across batches**

```python
import keras

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
        self.tp.assign(0); self.fp.assign(0); self.fn.assign(0)
```

**Custom Callback — log per-epoch to Weights & Biases**

```python
import keras

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

# Usage: model.fit(..., callbacks=[WandbLogger(log_every=50)])
```

## Error Handling

**Forgot .compile() before .fit() — the canonical beginner error**

```python
import keras

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
# if you re-compile (e.g. with a new LR), you also reset the optimizer state.
```

**mixed_float16 overflow — keep the final logits in float32**

```python
import keras

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
# on JAX/PyTorch use mixed_bfloat16 instead to skip scaling entirely.
```

**Custom layer not registered — load_model fails by class name**

```python
import keras

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
# loaded = keras.saving.load_model("model.keras", safe_mode=False)
```

**NaN detection + skip-step recovery in a custom train_step**

```python
import keras
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
        return self.compute_metrics(x, y, y_pred, sample_weight=None)
```

## Concurrency Model

**Multi-backend distribution — set the backend, then use Keras normally**

```python
import os
# Must set BEFORE importing keras
os.environ["KERAS_BACKEND"] = "jax"      # or "tensorflow", "torch", "numpy"

import keras

# Build and train as usual — Keras 3 dispatches to the backend's distribution
model = build_model()
model.compile(optimizer="adam", loss="mse")
model.fit(train_ds, epochs=10)

# Switch backend at next process start by changing the env var;
# weights save/load across backends via .keras (architecture) + safetensors (weights)
```

**Multi-GPU with tf.distribute.MirroredStrategy — Keras adapts automatically**

```python
import tensorflow as tf
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
# For PyTorch backend, use torch.nn.parallel.DistributedDataParallel under the hood
```

**JAX backend — pmap-style SPMD via keras.distribution**

```python
import os
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
model.fit(train_ds, epochs=10)                 # JAX pmap / pjit under the hood
```

**Multiprocessing PyDataset — overlap Python-side data prep**

```python
import keras

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
          max_queue_size=32)                  # prefetch 32 batches
```

## Testing Patterns

**pytest — verify layer shape, dtype, and gradient flow**

```python
import keras
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
        assert keras.ops.all(keras.ops.isfinite(g))
```

**Numerical gradient check — finite differences vs analytic**

```python
import keras
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
np.testing.assert_allclose(analytic, numerical, atol=1e-3)
```

**Test a full model end-to-end — fit one batch, assert metric improvement**

```python
import keras
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
                               loaded.predict(x, verbose=0), atol=1e-5)
```

**Numerical stability tests — softmax under mixed precision**

```python
import keras
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
    np.testing.assert_allclose(float(l1), float(l2), rtol=1e-5)
```

## Performance Tuning

- Default .fit() batch_size=32, default Adam lr=0.001. These are starting points, not tuned values — always tune.
- mixed_float16 policy: ~2x memory, 1.5-3x speed on Ampere/Hopper; mixed_bfloat16 has same speed without overflow risk (no loss scaling needed).
- EarlyStopping with restore_best_weights=True is mandatory for real training — without it you keep the weights from the LAST epoch, not the BEST.
- PyDataset (Keras 3) replaces Sequence; subclass and implement __getitem__/__len__ for custom pipelines outside tf.data.
- Keras 3 supports JAX, TensorFlow, and PyTorch backends — switch with os.environ['KERAS_BACKEND']='jax' BEFORE importing keras.
- Override train_step to keep .fit()'s callbacks, distribution, and progress bar while replacing the math — the canonical GAN/custom-loss pattern.
- .predict() is slow for one sample — call model(x) directly. .predict() has Python-side batching overhead for single-sample calls.
- Keras 3 ops namespace (keras.ops.*) is the backend-agnostic replacement for tf.* — using tf.* inside a layer breaks JAX/PyTorch backends.
- steps_per_epoch = ceil(num_samples / batch_size); pass only if you want an epoch to be a fraction of the dataset (useful for huge data).
- Initializers matter: 'glorot_uniform' (Xavier) for tanh/sigmoid, 'he_normal' for ReLU-family. Wrong init → slow or no convergence.
- Custom Layer lifecycle: __init__ for config (no weights), build(input_shape) for weights (called once, lazily), call(x) for forward.
- keras.distribution.ModelParallel (3.5+) on the JAX backend gives SPMD sharding via jax.pjit — pmap-style multi-GPU without writing JAX code.
- loss='sparse_categorical_crossentropy' for integer labels; 'categorical_crossentropy' for one-hot. Picking the wrong one silently trains on garbage.
- model.evaluate() runs in inference mode (training=False); for stochastic forward passes, use a custom predict_step or call model(x, training=True) directly.
- Keras outputs are backend tensors — call .numpy() to convert; on the JAX backend this materializes a DeviceArray (blocking transfer).

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [KerasCore / Keras 3](https://keras.io/keras_3/) | The multi-backend Keras package itself — runs the same code on TF, JAX, PyTorch, and NumPy backends. | build |
| [KerasCV](https://keras.io/keras_cv/) | Computer-vision models, layers, and augmentation pipelines — YOLO, Stable Diffusion, image classifiers. | build |
| [KerasNLP](https://keras.io/keras_nlp/) | NLP models and tokenizers — Transformer, BERT, GPT, Llama, Mistral, Gemma families as ready-to-use layers. | build |
| [KerasTuner](https://keras.io/keras_tuner/) | Hyperparameter search (random, Bayesian, Hyperband) — same API as scikit-learn's RandomizedSearchCV. | test |
| [AutoKeras](https://autokeras.com/) | AutoML on top of Keras — auto architecture search for image, text, tabular. | build |
| [TensorFlow.js](https://www.tensorflow.org/js) | Keras models in the browser and Node.js — convert .keras via tensorflowjs_converter. | deploy |
| [TFLite](https://www.tensorflow.org/lite/convert/) | On-device inference — convert Keras model to .tflite for Android/iOS/edge, with int8 quantization. | deploy |
| [TF-Serving](https://www.tensorflow.org/tfx/guide/serving) | C++ production serving — load a .keras-exported SavedModel and serve via gRPC/REST. | deploy |
| [ONNX](https://onnxruntime.ai/) | Cross-runtime format — Keras 3.5+ has native keras.export(model, format='onnx'); serve outside Google's stack. | deploy |
| [JAX](https://jax.readthedocs.io/) | High-performance numerical library; Keras 3's JAX backend uses it for XLA + functional transforms (vmap, pmap). | build |
| [PyTorch](https://pytorch.org/) | Deep-learning framework; Keras 3's PyTorch backend lets you train Keras models with torch.distributed underneath. | build |
| [TensorBoard](https://www.tensorflow.org/tensorboard) | Built-in viz via keras.callbacks.TensorBoard — scalars, histograms, projector, profiler. | debug |
| [Weights & Biases](https://docs.wandb.ai/guides/integrations/keras) | Experiment tracking — wandb.keras.WandbCallback is the standard 3-line integration. | debug |
| [MLflow](https://mlflow.org/docs/latest/tracking/autolog.html) | Open-source experiment tracking + model registry — autolog() captures Keras metrics automatically. | debug |
| [Keras Hub](https://keras.io/keras_hub/) | Pretrained model hub — fine-tune Llama, Gemma, BERT with one call to .fit(); successor to TensorFlow Hub. | build |
| [HuggingFace Transformers](https://huggingface.co/docs/transformers/en/main_classes/keras_callbacks) | Keras 3 compatible — TFKerasModel classes load HF checkpoints into Keras 3 layers. | build |
| [Ray Train](https://docs.ray.io/en/latest/train/keras.html) | Distributed training across many hosts — wraps Keras .fit() with Ray's actor model. | deploy |
| [OpenVINO](https://docs.openvino.ai/latest/notebooks/101-tensorflow-to-openvino-with-output.html) | Intel inference runtime — convert Keras via openvino.tools.mo for CPU/iGPU optimization. | deploy |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.1 | 2015 | First release by François Chollet — high-level API over Theano and TensorFlow. |
| 1.0 | 2017 | Sequential + Functional API; adopted as TensorFlow's high-level interface (tf.keras). |
| 2.0 | 2017 | Subclassing API; Eager execution default in TF 2.0; tf.keras becomes the canonical entry point. |
| 2.1 | 2018 | Multi-backend support dropped (focused on TF only); tf.keras.layers.experimental namespace. |
| 2.2 | 2018 | train_step override; the foundation for custom GAN/contrastive loops. |
| 2.3 | 2019 | Mixed precision policy API; preprocessing layers (TextVectorization, Rescaling). |
| 2.4 | 2020 | Save format standardized on .h5 + SavedModel; unified Keras API across eager + graph. |
| 2.5 | 2021 | PyDataset (formerly Sequence) refined; preprocessor layers marked stable. |
| 2.6 | 2021 | Split into separate keras pip package; tf.keras kept as TF-bundled copy. |
| 2.7 | 2021 | Preprocessing layers moved into core keras.layers; KerasCV/KerasNLP introduced. |
| 2.8 | 2022 | Discretization + string lookups became non-experimental; distributed training polish. |
| 2.9 | 2022 | KerasTuner integration expanded; mixed_bfloat16 policy on CPU/GPU. |
| 2.10 | 2022 | Compilable via XLA (jit_compile=True on .fit()); Apple Silicon GPU support. |
| 2.11 | 2022 | AdamW optimizer added; integer quantization APIs expanded for TFLite. |
| 2.12 | 2023 | Python 3.11 support; Keras Preprocessing moved entirely to keras.layers. |
| 2.13 | 2023 | Last single-backend Keras 2.x release; migration path to Keras 3 documented. |
| 3.0 | 2023 | Keras 3 GA — multi-backend (TF, JAX, PyTorch, NumPy); new .keras zip format. |
| 3.1 | 2024 | keras.ops namespace unified across backends; Keras Hub (pretrained models) launched. |
| 3.2 | 2024 | JAX distribution API; scaled_dot_product_attention in keras.ops. |
| 3.3 | 2024 | keras.distribution.ModelParallel for SPMD on JAX; safetensors weight support. |
| 3.4 | 2024 | Native ONNX export; KerasNLP LLM finetuning APIs matured (Gemma, Llama). |
| 3.5+ | 2025 | Stabilized cross-backend LayerNorm / Attention / RoPE; torch.compile support under PyTorch backend. |
| 3.15 | 2026 | Current line: export_torch path, sliding-window attention in MHA/GQA, MultiOptimizer, security hardening (restricted unpickling, path-traversal checks). |

## Interview Hot Questions

1. **When do you use Sequential vs. Functional vs. subclassing?** *(easy)*

   Sequential: only linear stacks of layers — no branches, skips, or multi-input/output. Functional (keras.Input + chained layer calls + keras.Model): any DAG topology, the default for serious work. Subclassing (class M(keras.Model)): only when you need custom train_step, custom losses that depend on intermediate activations, or imperative control flow that can't be expressed as a graph. Subclassing sacrifices serialization ergonomics for flexibility.

2. **What does .compile() actually do, and what happens if you forget it?** *(easy)*

   .compile() attaches an optimizer, loss, and metrics to the model, configuring the training contract. .fit() raises RuntimeError if you forget. After load_model() the .keras file restores the compile config — but re-compiling resets optimizer state (iterations, Adam moments), so resume training from the loaded optimizer instead of re-creating one.

3. **How does the train_step override pattern work?** *(medium)*

   Subclass keras.Model and override train_step(self, data). .fit() still handles epoch iteration, callbacks, progress bar, and distribution — but each batch is processed by your train_step. You write the GradientTape, compute_loss, apply_gradients, and return a dict of metrics. This is the canonical pattern for GANs, contrastive learning, RL, and any setup where loss(y, y_pred) doesn't fit.

4. **How does Keras 3 run the same code on three different backends?** *(hard)*

   Every layer/loss/metric calls into keras.ops.* — a namespace of backend-agnostic ops (matmul, softmax, where, etc.) that dispatch to tf.*, jax.numpy.*, or torch.* based on the KERAS_BACKEND env var. Weights are keras.Variable wrappers around backend-native Variables. The .keras format stores config.json (architecture) + backend-agnostic weight tensors (safetensors), so you can train on JAX and load on TF.

5. **Why does mixed_float16 need the final Dense to be float32?** *(medium)*

   fp16's range is ±65504 — a few hundred in pre-softmax logits is fine, but a high-learning-rate step or a sharp class imbalance can push logits past 65504, producing inf and NaN loss. The fix: cast the output layer to float32 so logits + softmax happen in fp32. mixed_bfloat16 doesn't have this problem (bf16 has fp32's range), so no special last-layer casting is needed.

6. **What does restore_best_weights=True in EarlyStopping actually do?** *(easy)*

   Without it, EarlyStopping stops training but you keep the weights from the LAST epoch (which by definition is past the best). restore_best_weights=True caches the weights at the epoch where val_loss was minimum and copies them back when training stops. Without this flag, EarlyStopping is mostly useless — you stop early but keep worse weights than you would have without early stopping.

7. **How does @register_keras_serializable work and why is it needed?** *(medium)*

   The .keras file stores class names (e.g. 'myproj>MLPSwiGLU') plus the constructor kwargs from get_config(). On load, Keras looks up the class by name in a registry and calls cls.from_config(kwargs). The decorator populates that registry when the module is imported. Without it (or if you forget to import the module before load_model), load_model raises 'Could not locate class'. safe_mode=False bypasses the registry by eval-ing the class path — dangerous for untrusted files.

8. **When would you choose Keras over raw PyTorch/TF?** *(medium)*

   Keras wins when: (1) the architecture fits the Functional API (90% of CNN/Transformer work); (2) you want concise, reviewable model definitions; (3) you want to swap backends (train on JAX, serve on TF); (4) teaching/onboarding — .compile()/.fit() trinity is intuitive. Raw frameworks win when: (1) you need gradient-level control (custom autograd); (2) you're writing research code that pushes the framework; (3) LLM pretraining at scale where Keras's abstraction overhead matters.

9. **How does PyDataset differ from a Python generator?** *(medium)*

   A generator passed to .fit() works but runs in the main thread (no overlap with training). PyDataset is a class with __len__ and __getitem__, so Keras knows the number of batches upfront, can show a progress bar, and (with workers=N, use_multiprocessing=True) spawns worker processes that prefetch batches in parallel. PyDataset is also picklable across processes — generators aren't.

10. **How would you debug a custom Layer whose gradients are NaN?** *(hard)*

   (1) keras.backend.set_value(layer.w, np.nan) won't help — instead, run model(x) on a tiny batch and check each intermediate output with print(keras.ops.any(keras.ops.isnan(t))). (2) Wrap the layer in a model with GradientTape and inspect gradients after tape.gradient — if grads are None, the variable isn't connected. (3) Try the layer in isolation under float32 first (mixed precision can cause overflow). (4) Check the loss reduction — summing per-sample losses across huge batches can overflow fp16.

## When to Choose This

- **vs PyTorch (native):** use this — Rapid prototyping of standard architectures, multi-backend portability (JAX/TF/PyTorch), teaching, when .compile()/.fit() trinity covers 90% of needs.; use that — Custom training loops with per-step control, gradient hacking, research where .fit() gets in the way, anything needing inline backward introspection.
- **vs TensorFlow (native):** use this — Concise model definitions via Functional API, multi-backend portability, when you want Keras's sensible defaults over TF verbosity.; use that — TF-specific features (TPU strategy, TFLite, tf.data details) you need to control directly, or production serving where you need SavedModel with a custom signature.
- **vs JAX / Flax:** use this — Quick iteration with .fit(), Keras Hub pretrained models, when functional purity isn't load-bearing for your project.; use that — Massive SPMD model parallelism, first-class vmap/pmap/grad-of-grad, XLA-native programming without eager overhead, when you can't afford the Keras abstraction layer.
- **vs scikit-learn:** use this — Deep learning (any architecture with layers), gradient-based optimization, GPU/TPU compute, anything larger than ~1M parameters.; use that — Tabular data baselines, classical ML (RF, XGBoost-style), preprocessing pipelines, model selection with grid search over hyperparameters.
- **vs PyTorch Lightning:** use this — Multi-backend portability, when you want the Keras layer API and distribution abstraction as defaults.; use that — PyTorch-native research code where Lightning's Trainer abstraction fits your needs; deep ecosystem momentum in the PyTorch community.

