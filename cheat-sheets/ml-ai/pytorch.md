# PyTorch

**Category:** ML / AI · **Tier:** ML / AI · **Tags:** deep-learning, autograd, gpu, neural-networks, research, tensor, python, meta · **First released:** 2016 · **Author:** Meta AI (FAIR) · **Last updated:** 2026-11

> Dynamic-computation-graph tensor library with reverse-mode autodiff — the de facto standard for deep-learning research.

---

## TL;DR

- PyTorch is a Python-first tensor library that executes eagerly by default, building the autograd graph on the fly as operations run — there is no separate graph-compile step before training.
- It dominates academic deep-learning research and has displaced TensorFlow as the default in most new LLM and diffusion work (Llama, Mistral, Stable Diffusion are all PyTorch-native).
- Reach for it when you need custom architectures, gradient hacking, mixed-precision training, or want to follow/extend a research paper — the API is debuggable with normal Python print/pdb.
- Avoid it for browser/edge inference (use ONNX/ExecuTorch), for non-deep ML (use scikit-learn), or when you cannot afford a Python process per served model (use torch.jit / compiled export).

## Core Mental Model

**A tape recorder over eager tensor ops.** Every tensor op in the forward pass writes its inputs and backward rule onto a per-thread tape. Calling loss.backward() replays that tape in reverse, accumulating .grad on every leaf tensor that has requires_grad=True. The graph is rebuilt from scratch each iteration — so you can put Python control flow (if, while, recursion) inside forward() and gradients just work. optimizer.step() then nudges parameters using those accumulated .grad values; optimizer.zero_grad() clears them because grads sum, not replace.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| torch.tensor([1.0, 2.0], requires_grad=True) | Creates a leaf tensor tracked by autograd — ops on it build a graph. | Any tensor you want gradients for: model weights, inputs in meta-learning. |
| x.detach() | Returns a tensor sharing storage but disconnected from the graph — no grad flows through it. | Logging, moving to NumPy, target computation that must not be differentiated. |
| with torch.no_grad(): ... | Disables grad tracking inside the block — no graph is built, no .grad set. | Inference, validation, metric computation — saves memory and time. |
| class M(nn.Module):   def __init__(self): super().__init__()   def forward(self, x): ... | Composable module — submodules/Parameters registered in __init__ are auto-collected by .parameters() and .to(device). | Every model, layer, loss — there is no other idiomatic way to define one. |
| nn.Parameter(torch.randn(...)) | A Tensor subclass that auto-registers as a trainable parameter when assigned to a Module attribute. | Custom weights inside a layer; never use bare tensors for learnable params. |
| loss.backward(); optimizer.step(); optimizer.zero_grad() | Backprop, update, clear — the three-line training step. Gradients accumulate by default. | Every supervised step. Skipping zero_grad doubles, triples, … the gradient. |
| model.to(device); tensor.to(device) | Moves module params / tensor to 'cuda' or 'cuda:0'. Cross-device ops raise. | Before any compute on GPU — model and all inputs must share device. |
| model.train() / model.eval() | Toggles self.training flag — affects Dropout, BatchNorm, and any layer you write that branches on it. | Wrap validation/test in eval(); restore train() after — forgetting this is the #1 silent bug. |
| DataLoader(ds, batch_size=64, shuffle=True, num_workers=4, pin_memory=True) | Iterates batches with multi-process loading, optional shuffling, and pinned (page-locked) host memory for fast async H2D copy. | Anything bigger than toy data; num_workers>0 needs if __name__=='__main__' on Windows. |
| torch.save({'model': sd, 'opt': opt.state_dict()}, 'ckpt.pt') | Pickle-serializes state dicts (ordered dict of name→tensor) to disk. | Checkpointing; load with torch.load(..., map_location=device) to avoid device jumps. |
| with torch.autocast('cuda', dtype=torch.float16): ... | Automatic mixed precision — runs eligible ops in fp16/bf16, keeps reductions in fp32. | 2× memory savings and 1.5–3× speedup on Ampere/Hopper; pair with GradScaler for fp16. |
| DDP(model, device_ids=[i]) | Wraps a model for synchronous data-parallel training across processes — each rank gets a shard of the batch and grads are all-reduced. | Multi-GPU training; prefer over DataParallel (DP) which is GIL-bound and deprecated. |
| model = torch.compile(model) | Traces and JIT-compiles the model (TorchDynamo + Inductor) for graph-level fusion and kernel autotuning. | Production training/inference on 2.0+; 1.3–2× speedup with no code changes for most models. |

## Idiomatic Patterns

**The canonical training loop — the pattern every PyTorch engineer memorizes**

```python
import torch
from torch import nn, optim
from torch.utils.data import DataLoader

def train(model: nn.Module, loader: DataLoader, epochs: int, device="cuda"):
    model.to(device).train()
    opt = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)

    for epoch in range(epochs):
        for x, y in loader:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            opt.zero_grad(set_to_none=True)          # set_to_none=True is faster
            pred = model(x)
            loss = loss_fn(pred, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
        print(f"epoch {epoch}: {loss.item():.4f}")
```

**Custom nn.Module with lazy weight init and eval-time branching**

```python
import torch
import torch.nn.functional as F
from torch import nn

class ResidualMLP(nn.Module):
    def __init__(self, dim: int, hidden: int, p: float = 0.1):
        super().__init__()
        self.fc1 = nn.Linear(dim, hidden)
        self.fc2 = nn.Linear(hidden, dim)
        self.drop = nn.Dropout(p)
        self.norm = nn.LayerNorm(dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.drop(F.gelu(self.fc1(x)))
        h = self.fc2(h)
        return self.norm(x + h)              # pre-norm residual

layer = ResidualMLP(768, 3072)
x = torch.randn(32, 768)
print(layer(x).shape)                       # torch.Size([32, 768])
print(sum(p.numel() for p in layer.parameters()))   # param count
```

**Checkpoint save/load with optimizer + epoch — resumable training**

```python
import torch

def save_ckpt(path, model, opt, epoch, best_loss):
    torch.save({
        "model": model.state_dict(),
        "opt":   opt.state_dict(),
        "epoch": epoch,
        "best":  best_loss,
    }, path)

def load_ckpt(path, model, opt, map_location="cuda"):
    ck = torch.load(path, map_location=map_location, weights_only=True)
    model.load_state_dict(ck["model"])
    opt.load_state_dict(ck["opt"])
    # Move optimizer state onto the right device (esp. after CPU→GPU load)
    for s in opt.state.values():
        for k, v in s.items():
            if isinstance(v, torch.Tensor):
                s[k] = v.to(map_location)
    return ck["epoch"], ck["best"]
```

**Mixed-precision training with GradScaler (fp16 path; bf16 skips scaler)**

```python
import torch
from torch import nn, optim

scaler = torch.cuda.amp.GradScaler()
model = nn.Linear(768, 1000).cuda()
opt = optim.AdamW(model.parameters(), lr=1e-3)
loss_fn = nn.CrossEntropyLoss()

for x, y in loader:                          # x, y already on cuda
    opt.zero_grad(set_to_none=True)
    with torch.autocast(device_type="cuda", dtype=torch.float16):
        pred = model(x)
        loss = loss_fn(pred, y)
    scaler.scale(loss).backward()            # scale to prevent fp16 underflow
    scaler.unscale_(opt)                     # unscale before clipping
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    scaler.step(opt)                         # skips step on inf/nan grads
    scaler.update()                          # adjust scale factor
```

**Custom Dataset with collate and worker-safe transforms**

```python
import torch
from torch.utils.data import Dataset, DataLoader

class TokenDataset(Dataset):
    def __init__(self, rows, vocab):
        self.rows, self.vocab = rows, vocab
    def __len__(self):  return len(self.rows)
    def __getitem__(self, i):
        ids = [self.vocab[t] for t in self.rows[i]["text"].split()]
        return torch.tensor(ids, dtype=torch.long), self.rows[i]["label"]

def collate(batch):
    # pad variable-length sequences to the longest in the batch
    lens  = [len(x[0]) for x in batch]
    maxlen = max(lens)
    pad_id = 0
    x = torch.full((len(batch), maxlen), pad_id, dtype=torch.long)
    for i, (ids, _) in enumerate(batch):
        x[i, :len(ids)] = ids
    y = torch.tensor([b[1] for b in batch], dtype=torch.long)
    return x, torch.tensor(lens)

ds = TokenDataset(rows, vocab)
loader = DataLoader(ds, batch_size=32, shuffle=True,
                    num_workers=4, pin_memory=True, collate_fn=collate)
```

## Common Pitfalls

1. **Forgot model.eval() before validation** — *Symptom:* Validation loss looks fine but inference predictions are noisy / nondeterministic; Dropout zeroes random units and BatchNorm uses batch stats instead of running averages. *Fix:* Wrap every eval block in `with torch.no_grad(): model.eval() ...` and restore `model.train()` afterwards. The flag is sticky — set it explicitly rather than assuming the previous state.
2. **Leaked computation graph from logging or numpy** — *Symptom:* CUDA OOM that grows over epochs, or `RuntimeError: Can't call numpy() on Tensor that requires grad`. *Fix:* Detach before logging: `loss.item()`, `pred.detach().cpu().numpy()`. Never keep `.backward()`-able tensors in lists — they hold the whole graph alive.
3. **Skipped optimizer.zero_grad()** — *Symptom:* Loss explodes after a few steps or training 'works' but with wrong gradients — PyTorch accumulates .grad across backward() calls by design (used for gradient accumulation). *Fix:* Call `opt.zero_grad(set_to_none=True)` at the top of every step unless you intentionally accumulate — then divide the loss by accumulation_steps.
4. **Device mismatch — `Expected all tensors on same device`** — *Symptom:* RuntimeError when forward() combines a CPU input tensor with a CUDA parameter (or vice versa). *Fix:* Move data in the training loop with `x = x.to(device, non_blocking=True)` and call `model.to(device)` once at construction. Make `device` a module-level constant or pass it down explicitly.
5. **In-place op on a leaf requiring grad** — *Symptom:* `RuntimeError: a leaf Variable that requires grad is being used in an in-place operation.` *Fix:* Never do `w += ...` on a Parameter — go through the optimizer. For in-place activations, use the functional form (e.g. `F.relu(x)` not `x.relu_()` on tensors that need grad).
6. **DataLoader deadlocks / no speedup from workers** — *Symptom:* Training hangs at the first batch, or num_workers>0 is no faster than 0 — usually on Windows or with non-fork-safe code. *Fix:* Guard entry point with `if __name__ == '__main__':` on Windows/macOS (spawn start method). Keep Dataset.__getitem__ pure (no shared mutable state). Set `persistent_workers=True` to avoid re-spawn cost per epoch.
7. **pin_memory=True without enough host RAM or on CPU-only** — *Symptom:* Slower training or OOM on host RAM; pin_memory allocates page-locked memory which is finite and not free. *Fix:* Only use pin_memory=True when training on CUDA and the host has headroom. For CPU-only or huge batches, set it False. non_blocking=True on .to(device, ...) is only useful when pin_memory=True.

## Production / Interview Quick Reference

- PyTorch 2.15 (Oct 2026): rewritten NCCL is the default distributed backend; DCP checkpoints break 2.14 compat. `version`
- Memory per param in Adam fp32 ≈ 16 bytes: weight(4) + grad(4) + m(4) + v(4). A 1B-param model needs ~16 GB just for the optimizer. `perf`
- Mixed precision (fp16/bf16) halves weight + activation memory; bf16 needs no GradScaler, fp16 does. `perf`
- Default Adam lr=1e-3, AdamW lr=1e-3, SGD lr=1e-2 (with momentum). Transformers typically use 3e-4 to 5e-5 with warmup. `version`
- Batch size heuristic: largest power of 2 that fits at 80% GPU memory; double it once with gradient accumulation if compute-bound. `perf`
- Gradient accumulation: effective batch = batch_size × accumulation_steps. Divide loss by steps so gradients average correctly. `gotcha`
- torch.compile (2.0+) gives 1.3–2× speedup; first iteration compiles (slow), use mode='reduce-overhead' for inference, mode='max-autotune' for training. `version`
- DDP all-reduces grads after backward; overlap with compute by using model.no_sync() context for all but the last micro-batch. `perf`
- state_dict() keys are qualified module paths (e.g. 'encoder.layer.0.fc1.weight'); load_state_dict(strict=False) ignores missing/extra keys. `gotcha`
- torch.load(weights_only=True) since 2.4 default — blocks arbitrary pickle execution; only loads tensors and basic types. `version`
- Dataloader workers are forked (Linux) — Dataset fields are copied via fork. Anything huge (a vocab dict) lives in shared memory or is rebuilt per worker. `gotcha`
- F.scaled_dot_product_attention (2.0+) dispatches to FlashAttention-2 / memory-efficient kernels automatically — never write your own softmax attention. `perf`
- torch.inference_mode() is faster than torch.no_grad() — no version counter bump, but tensors cannot be used later in grad-enabled code. `perf`
- CUDA OOM is often fragmentation, not true OOM — try torch.cuda.empty_cache() between phases, or set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True. `gotcha`
- 2.0 dropped the torch.cuda.amp namespace (now torch.autocast + torch.cuda.amp.GradScaler still works but prefer torch.amp.GradScaler('cuda')). `version`
- model.train() flips self.training=True; only Dropout, BatchNorm, and your own layers that branch on it care — Linear/Conv/GELU are unaffected. `gotcha`

## Go Deeper

- [PyTorch Official Documentation](https://docs.pytorch.org/) — Authoritative API reference; the 'Notes' sections on autograd and CUDA semantics are required reading.
- [PyTorch: An Imperative Style, High-Performance Deep Learning Library (NeurIPS 2019)](https://papers.nips.cc/paper/9015-pytorch-an-imperative-style-high-performance-deep-learning-library.pdf) — The canonical paper — explains the eager-execution design and how the dispatcher works.
- [Deep Learning with PyTorch (Stevens, Antiga, Viehmann)](https://pytorch.org/deep-learning-with-pytorch.html) — Free interactive book from PyTorch devs; best path from tensors to deployment.
- [PyTorch Tutorials](https://pytorch.org/tutorials/) — Official, versioned recipes — the 'Training a Classifier' and 'DDP' tutorials are canonical onboarding.
- [Automatic Differentiation in Machine Learning: a Survey (Baydin et al., 2018)](https://arxiv.org/abs/1502.05767) — The math behind .backward(); reverse-mode autodiff explained independent of any framework.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| torch.float32 (torch.float) | 32-bit IEEE float — the default for nn.Linear, conv, and almost all training. ~4 bytes/element. | Default everywhere. Switch only for memory or speed reasons. |
| torch.float16 (torch.half) | 16-bit float — 5 exponent + 10 mantissa bits. Range ±65504, prone to overflow/underflow. | Mixed-precision training on Volta+; pair with GradScaler to avoid underflow. |
| torch.bfloat16 | 16-bit float — 8 exponent + 7 mantissa bits. Same dynamic range as fp32, lower precision. | Ampere+ GPUs and TPUs; safer than fp16 for training, no GradScaler needed. |
| torch.float64 (torch.double) | 64-bit IEEE double — slower on GPU, no real ML benefit. | Numerical-grad checks (gradcheck), scientific computing; never for training. |
| torch.int64 (torch.long) | 64-bit signed int — the default for indices, labels, embedding lookups. | Index tensors, NLL/CrossEntropy targets, gather/scatter indices. |
| torch.int8 / torch.uint8 | 8-bit signed / unsigned integer. | Quantization (int8 weights), image pixels 0-255 (uint8). Never use for math without casting. |
| torch.bool | Boolean — 1 byte per element. Returned by comparisons. | Masking: x[mask], masked_fill, attention masks. NOT for arithmetic. |
| torch.complex64 / complex128 | Complex floats — real + imag parts of float32/64. | Signal processing, FFTs, quantum ML. Rare in mainstream deep learning. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| torch.Tensor | Multi-dim array with dtype, device, shape, and optional grad — the central object. | Everything. All inputs, outputs, params, and intermediates are Tensors. |
| torch.nn.Parameter | Tensor subclass with requires_grad=True; auto-registers when assigned to a Module attribute. | Learnable weights inside a custom layer. Never use a bare Tensor for params. |
| torch.utils.data.Dataset | Abstract __getitem__/__len__ contract — index-based access. | Anything that fits in memory or has random-access file layout (TFRecords, sharded parquet). |
| torch.utils.data.IterableDataset | Streaming dataset — __iter__ yields samples, no random access. | Streams, logs, sharded files where __getitem__ would be too expensive. |
| torch.utils.data.DataLoader | Iterator that batches, shuffles, optionally prefetches via worker processes. | Always wrap a Dataset before training; num_workers>0 for I/O-heavy data. |
| torch.nn.ModuleList / ParameterList | List-like containers that register contents with the parent Module. | Variable-depth stacks; .parameters() picks them up. Plain Python lists do NOT. |
| torch.nn.Sequential | Chained Module — forward = chained calls. | Linear pipelines only; use subclassing for branches or skip connections. |
| torch.utils.data.distributed.DistributedSampler | Shards a Dataset across DDP ranks; set_epoch() reshuffles each epoch. | Required with DataLoader in DDP training; never split data manually across ranks. |
| TensorDict (from tensordict) | Dict of tensors sharing a leading batch dim — batched ops apply to all values. | Multi-modal batches, RL rollouts, batched env simulators. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class L(nn.Module):   def __init__(self): super().__init__()   def forward(self, x): ... | Composable layer — Parameters/submodules assigned in __init__ are auto-collected by .parameters() and .to(). | Every custom layer, block, or full model. There is no other idiomatic way. |
| class Loss(nn.Module):   def forward(self, pred, target): ... | Losses are Modules — allows them to hold learnable terms (e.g. contrastive temperature). | Custom losses; use nn.functional.* for stateless ones. |
| class D(Dataset):   def __len__(self): ...   def __getitem__(self, i): ... | Index-based dataset — must be picklable for worker processes. | Custom data layout; __getitem__ should be pure (no shared mutable state). |
| class F(torch.autograd.Function):   @staticmethod   def forward(ctx, x): ...   @staticmethod   def backward(ctx, g): ... | Custom autograd op — defines BOTH forward and its backward rule. | Inverting gradients, custom CUDA kernels, gradient surgery. Avoid if a regular op works. |
| class O(torch.optim.Optimizer):   def step(self): ... | Custom optimizer — implement step() using self.param_groups. | Research optimizers; 99% of cases should subclass AdamW or use existing. |
| class S(torch.optim.lr_scheduler.LRScheduler):   def get_lr(self): ... | Custom LR schedule — implement get_lr() called each step. | Custom schedules; for warmup+cosine use transformers.get_cosine_schedule_with_warmup. |
| class Sampler(torch.utils.data.Sampler): | Yields indices — controls the order DataLoader pulls samples. | Class-balanced, weighted, or curriculum sampling. |
| model = torch.compile(model) | Traces the Module's forward into a graph and JIT-compiles via Inductor. | Production training on 2.0+; a transformation of the custom Module, not a new type. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, torch.add(a, b) | Element-wise add with broadcasting; out-of-place by default. | Math. Use add_(...) for in-place only on non-leaf tensors. |
| a @ b, torch.matmul(a, b) | Matrix multiply — 2D, batched, and batched+vector forms all dispatch. | Standard matmul. For 3D-only strict batching, bmm can be marginally faster. |
| torch.einsum('bihd,bjhd->bij', q, k) | Einstein summation — arbitrary tensor contractions in one call. | Multi-tensor contractions (attention, GNNs). Readability tradeoff vs chained ops. |
| torch.bmm(a, b) | Strict 3-D batched matmul — no broadcasting. | Tight loops where you control the shapes; skips matmul's dispatch overhead. |
| torch.cat([a, b], dim=0) | Concatenates tensors along an existing axis. | Joining batches, features, sequence dims. Both tensors must share other dims. |
| torch.stack([a, b], dim=0) | Stacks along a NEW axis — adds a dimension. | Aggregating results into a new batch dim; the inverse of unbind. |
| torch.softmax(x, dim=-1) | Normalized exp along axis — sums to 1. | Classification head, attention weights. Use F.log_softmax for numerical stability. |
| torch.sigmoid(x) | 1 / (1 + e^-x) — squashes to (0,1). | Binary logits, gates. Numerically stable for large \|x\|. |
| F.relu(x) / F.gelu(x) / F.silu(x) | Activation functions — relu (cheap), gelu (transformers), silu (swish, modern LLMs). | Pick by architecture: MLPs → relu/gelu, LLMs → silu, conv → relu/mish. |
| torch.where(cond, a, b) | Element-wise ternary — picks from a where cond is True, else b. | Masking, conditional gradient routes, custom losses. Broadcasts shapes. |
| torch.gather(x, dim, idx) | Selects elements along dim at positions in idx — same shape as idx. | NLL of correct class, sequence mixing, MoE routing. |
| torch.scatter(dim, idx, src) | Inverse of gather — writes src values into out at idx positions. | MoE dispatch, embedding updates, one-hot expansion. |
| torch.norm(x, p=2, dim=-1) | L-p norm along an axis. | Gradient clipping (clip_grad_norm_), layer norm internals, distance metrics. |
| torch.sum / mean / max / min(x, dim=...) | Reductions — pass dim to keep rank, omit for scalar. | Loss reductions, mean over batch, max for argmax + value. |
| x[mask] / torch.masked_select / masked_fill | Boolean-mask indexing and conditional fill. | Padding masks, attention masking, label masking. |

## Input / Output

**Checkpoint save/load — full state (model + optimizer + step)**

```python
import torch

def save_ckpt(path, model, opt, scheduler, epoch, step, best):
    torch.save({
        "model":      model.state_dict(),
        "opt":        opt.state_dict(),
        "sched":      scheduler.state_dict(),
        "epoch":      epoch,
        "step":       step,
        "best":       best,
        "torch_ver":  torch.__version__,
    }, path)

def load_ckpt(path, model, opt, scheduler, map_location="cuda"):
    ck = torch.load(path, map_location=map_location, weights_only=True)
    model.load_state_dict(ck["model"])
    opt.load_state_dict(ck["opt"])
    scheduler.load_state_dict(ck["sched"])
    # Optimizer state tensors need to land on the right device after a CPU->GPU load
    for s in opt.state.values():
        for k, v in s.items():
            if isinstance(v, torch.Tensor):
                s[k] = v.to(map_location)
    return ck["epoch"], ck["step"], ck["best"]
```

**Loading pretrained weights — HuggingFace, timm, and torch.hub patterns**

```python
import torch, torch.nn as nn
from transformers import AutoModelForCausalLM
import timm

# HuggingFace — checks config + tokenizer + model weights + caches
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3-8B",
    torch_dtype=torch.bfloat16,         # half-precision weights on disk
    attn_implementation="sdpa",        # use scaled_dot_product_attention
    device_map="auto",                 # accelerate places across visible GPUs
    low_cpu_mem_usage=True,
)

# timm — vision model registry
cnn = timm.create_model("resnet50.a1_in1k", pretrained=True, num_classes=0)

# torch.hub — research repos expose entry points
yolo = torch.hub.load("ultralytics/yolov5", "yolov5s", pretrained=True)
```

**Streaming a sharded dataset — IterableDataset over many files**

```python
import torch, glob, json
from torch.utils.data import IterableDataset, DataLoader

class ShardJSONLDataset(IterableDataset):
    def __init__(self, pattern, rank=0, world=1):
        self.files = sorted(glob.glob(pattern))
        self.rank, self.world = rank, world

    def __iter__(self):
        # Each rank reads a disjoint subset of shards
        for path in self.files[self.rank::self.world]:
            with open(path) as f:
                for line in f:
                    yield json.loads(line)

ds = ShardJSONLDataset("shard-*.jsonl", rank=rank, world=world)
loader = DataLoader(ds, batch_size=32, num_workers=4,
                    pin_memory=True, drop_last=True)
```

**Export to ONNX / TorchScript / safetensors for serving**

```python
import torch
from safetensors.torch import save_file

# ONNX — cross-runtime inference (CPU/GPU/edge). Use dynamo exporter on 2.4+.
m = model.eval().cpu()
dummy = torch.randn(1, 3, 224, 224)
torch.onnx.export(m, dummy, "model.onnx",
                  input_names=["x"], output_names=["logits"],
                  dynamic_axes={"x": {0: "batch"}, "logits": {0: "batch"}},
                  opset=17, dynamo=True)

# TorchScript — older path, still useful for C++ libtorch serving
scripted = torch.jit.trace(m, dummy)
scripted.save("model.pt")

# safetensors — for HuggingFace weight distribution (no pickle, no code exec)
save_file(m.state_dict(), "weights.safetensors")
```

## Loops & Iteration

**Canonical train + eval loop with epoch boundaries**

```python
import torch
from torch.utils.data import DataLoader

def train_eval(model, train_ds, val_ds, epochs, device="cuda"):
    train_loader = DataLoader(train_ds, batch_size=64, shuffle=True,
                              num_workers=4, pin_memory=True, drop_last=True)
    val_loader   = DataLoader(val_ds,   batch_size=128, shuffle=False, num_workers=4)
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)

    for epoch in range(epochs):
        # ---- train ----
        model.train()
        for x, y in train_loader:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            opt.zero_grad(set_to_none=True)
            loss = model(x, y)              # model returns scalar loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()

        # ---- eval ----
        model.eval()
        n_correct, n_total = 0, 0
        with torch.inference_mode():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                pred = model(x).argmax(-1)
                n_correct += (pred == y).sum().item()
                n_total   += y.numel()
        print(f"epoch {epoch}: val_acc={n_correct/n_total:.4f}")
```

**Gradient accumulation — effective batch larger than physical batch**

```python
accum_steps = 4          # effective batch = 64 * 4 = 256
model.train()
opt.zero_grad(set_to_none=True)

for step, (x, y) in enumerate(loader):
    x, y = x.to(device), y.to(device)
    # Divide so the accumulated grad equals the mean over the full effective batch
    loss = model(x, y) / accum_steps
    loss.backward()

    if (step + 1) % accum_steps == 0:
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        opt.zero_grad(set_to_none=True)
```

**Custom learning-rate warmup + cosine decay each step**

```python
import math
from torch.optim.lr_scheduler import LambdaLR

def cosine_with_warmup(opt, warmup_steps, total_steps):
    def lr_lambda(step):
        if step < warmup_steps:
            return step / max(1, warmup_steps)        # linear warmup
        progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
        return 0.5 * (1.0 + math.cos(math.pi * progress))   # cosine decay
    return LambdaLR(opt, lr_lambda)

scheduler = cosine_with_warmup(opt, warmup_steps=500, total_steps=10_000)
for step, batch in enumerate(loader):
    train_step(batch)
    scheduler.step()           # call PER STEP, not per epoch, for LLM training
```

**DistributedSampler epoch loop — must call set_epoch or shuffle is stale**

```python
from torch.utils.data import DataLoader
from torch.utils.data.distributed import DistributedSampler

sampler = DistributedSampler(train_ds, shuffle=True)
loader  = DataLoader(train_ds, batch_size=64, sampler=sampler,
                     num_workers=4, pin_memory=True)

for epoch in range(epochs):
    sampler.set_epoch(epoch)          # CRITICAL: reshuffles deterministically per rank
    model.train()
    for x, y in loader:
        ...
    # Reduce eval metrics across ranks with dist.all_reduce
    dist.all_reduce(metric, op=dist.ReduceOp.SUM)
    if rank == 0:
        print(f"epoch {epoch}: {metric.item() / world_size:.4f}")
```

## Functions & Callables

**Custom nn.Module with lazy weight init and forward branching**

```python
import torch, torch.nn.functional as F
from torch import nn

class TransformerBlock(nn.Module):
    def __init__(self, dim, heads, ff_mult=4, p=0.1):
        super().__init__()
        self.norm1 = nn.LayerNorm(dim)
        self.attn  = nn.MultiheadAttention(dim, heads, dropout=p, batch_first=True)
        self.norm2 = nn.LayerNorm(dim)
        self.ff = nn.Sequential(
            nn.Linear(dim, ff_mult * dim),
            nn.GELU(),
            nn.Dropout(p),
            nn.Linear(ff_mult * dim, dim),
        )

    def forward(self, x, mask=None):
        h = self.norm1(x)
        a, _ = self.attn(h, h, h, attn_mask=mask, need_weights=False)
        x = x + a
        x = x + self.ff(self.norm2(x))
        return x
```

**Custom loss with label smoothing and a stateful temperature**

```python
import torch, torch.nn.functional as F
from torch import nn

class SmoothedCrossEntropy(nn.Module):
    def __init__(self, smoothing=0.1, temperature=1.0):
        super().__init__()
        self.smoothing = smoothing
        # temperature is a learnable Parameter if you want it tuned by the optimizer
        self.log_temp = nn.Parameter(torch.tensor(float(temperature).log()))

    def forward(self, logits, target):
        temp = self.log_temp.exp().clamp(0.1, 10.0)
        logits = logits / temp
        nll = F.cross_entropy(logits, target, reduction="none",
                              label_smoothing=self.smoothing)
        return nll.mean()
```

**Custom autograd Function — straight-through estimator**

```python
import torch

class StraightThrough(torch.autograd.Function):
    """Quantize in forward, pass gradient through unchanged in backward."""
    @staticmethod
    def forward(ctx, x):
        return (x > 0).to(x.dtype)         # hard 0/1

    @staticmethod
    def backward(ctx, grad_out):
        return grad_out                     # gradient as if identity

# Use it as a layer:
hard_sigmoid_st = StraightThrough.apply
logits = model(x)
binary = hard_sigmoid_st(logits)            # forward: 0/1, backward: identity
```

**Custom optimizer (Lion, simplified) — subclassing torch.optim.Optimizer**

```python
import torch
from torch.optim import Optimizer

class Lion(Optimizer):
    """Lion optimizer: sign-based update, no second moment."""
    def __init__(self, params, lr=1e-4, betas=(0.9, 0.99), weight_decay=0.0):
        defaults = dict(lr=lr, betas=betas, weight_decay=weight_decay)
        super().__init__(params, defaults)

    @torch.no_grad()
    def step(self, closure=None):
        loss = closure() if closure is not None else None
        for group in self.param_groups:
            b1, b2 = group["betas"]
            for p in group["params"]:
                if p.grad is None: continue
                g = p.grad
                state = self.state[p]
                if "exp_avg" not in state:
                    state["exp_avg"] = torch.zeros_like(p)
                m = state["exp_avg"]
                update = m.mul(b1).add_(g, alpha=1 - b1)
                p.add_(update.sign_(), alpha=-group["lr"])
                m.mul_(b2).add_(g, alpha=1 - b2)
                if group["weight_decay"]:
                    p.mul_(1 - group["lr"] * group["weight_decay"])
        return loss
```

## Error Handling

**Device mismatch — detect and auto-place tensors**

```python
import torch

def to_same_device(*tensors, device="cuda"):
    """Move all tensors to the same device; raise clearly on type errors."""
    out = []
    for t in tensors:
        if not isinstance(t, torch.Tensor):
            raise TypeError(f"expected Tensor, got {type(t).__name__}")
        if t.device.type != torch.device(device).type:
            t = t.to(device, non_blocking=True)
        out.append(t)
    return out

# Inside a training step:
try:
    x, y, mask = to_same_device(x, y, mask, device=model.device)
    pred = model(x, mask)
except RuntimeError as e:
    if "Expected all tensors to be on the same device" in str(e):
        # Add the offending tensor's device to the error message
        for name, t in [("x", x), ("y", y), ("mask", mask)]:
            print(f"  {name}: {t.device}")
    raise
```

**NaN/Inf detection and recovery — skip step on bad gradients**

```python
import torch

def safe_step(loss, model, opt, scaler=None, max_norm=1.0):
    if torch.isnan(loss) or torch.isinf(loss):
        opt.zero_grad(set_to_none=True)
        return False                       # skip this step

    if scaler is not None:
        scaler.scale(loss).backward()
        scaler.unscale_(opt)
    else:
        loss.backward()

    # Skip update if any gradient is non-finite
    bad = False
    for p in model.parameters():
        if p.grad is not None and not torch.isfinite(p.grad).all():
            bad = True
            break
    if bad:
        opt.zero_grad(set_to_none=True)
        return False

    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm)
    if scaler is not None:
        scaler.step(opt)
        scaler.update()
    else:
        opt.step()
    opt.zero_grad(set_to_none=True)
    return True
```

**OOM recovery — retry with smaller batch or empty the cache**

```python
import torch

def forward_with_oom_retry(model, batch, min_batch=4):
    while batch.shape[0] >= min_batch:
        try:
            torch.cuda.empty_cache()        # defragment before trying
            return model(batch)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            # Halve the batch, recurse on the rest
            half = batch.shape[0] // 2
            if half < min_batch:
                raise
            left  = forward_with_oom_retry(model, batch[:half],  min_batch)
            right = forward_with_oom_retry(model, batch[half:],  min_batch)
            return torch.cat([left, right], dim=0)
    raise RuntimeError("batch too small to fit")
```

**Shape/dtype assertions — fail loud before the long forward**

```python
import torch

def assert_inputs(x, y, *, expected_dtype=None, expected_dim=2):
    if x.dim() != expected_dim:
        raise ValueError(f"x.dim()={x.dim()}, expected {expected_dim}")
    if x.shape[0] != y.shape[0]:
        raise ValueError(f"batch mismatch: x={x.shape[0]}, y={y.shape[0]}")
    if expected_dtype is not None and x.dtype != expected_dtype:
        raise TypeError(f"x.dtype={x.dtype}, expected {expected_dtype}")
    if not torch.isfinite(x).all():
        raise ValueError("x contains NaN/Inf at input")
```

## Concurrency Model

**DistributedDataParallel — the standard multi-GPU setup**

```python
import os, torch
import torch.distributed as dist
from torch.distributed.elastic.multiprocessing.errors import record
from torch.nn.parallel import DistributedDataParallel as DDP

def setup():
    dist.init_process_group(backend="nccl")
    torch.cuda.set_device(int(os.environ["LOCAL_RANK"]))

def cleanup():
    dist.destroy_process_group()

def main():
    setup()
    rank = dist.get_rank()
    world = dist.get_world_size()
    device = torch.device(f"cuda:{rank}")

    model = MyModel().to(device)
    model = DDP(model, device_ids=[rank], find_unused_parameters=False)
    # DataLoader + DistributedSampler set up as in §11
    train(model, loader, device)
    if rank == 0:
        torch.save(model.module.state_dict(), "final.pt")
    cleanup()

# Launch with: torchrun --nproc_per_node=8 train.py
```

**Gradient accumulation with DDP no_sync — only all-reduce on last micro-batch**

```python
import torch
from contextlib import nullcontext
from torch.nn.parallel import DistributedDataParallel as DDP

def train_step_ddp(model: DDP, micro_batches, opt, accum_steps=4):
    opt.zero_grad(set_to_none=True)
    for i, (x, y) in enumerate(micro_batches):
        is_last = (i + 1) % accum_steps == 0
        # no_sync disables gradient all-reduce inside the context;
        # only the last micro-batch actually fires the cross-rank all-reduce.
        with model.no_sync() if not is_last else nullcontext():
            loss = model(x, y) / accum_steps     # scale so grads average correctly
            loss.backward()
        if is_last:
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            opt.zero_grad(set_to_none=True)
```

**FSDP — Fully Sharded Data Parallel for models too big for one GPU**

```python
import torch
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP
from torch.distributed.fsdp import MixedPrecision, ShardingStrategy
from torch.distributed.fsdp.wrap import size_based_auto_wrap_policy
import functools

mp_policy = MixedPrecision(
    param_dtype=torch.bfloat16,
    reduce_dtype=torch.float32,
    buffer_dtype=torch.float32,
)

model = build_huge_model().cuda()
model = FSDP(
    model,
    sharding_strategy=ShardingStrategy.FULL_SHARD,
    mixed_precision=mp_policy,
    auto_wrap_policy=functools.partial(size_based_auto_wrap_policy, min_num_params=1_000_000),
    device_id=torch.cuda.current_device(),
    use_orig_params=True,           # needed for torch.compile + save full state
)
# Each rank holds only 1/N of the params + grads + optimizer state
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)
```

**torch.multiprocessing — CPU-side parallel inference pool**

```python
import torch
import torch.multiprocessing as mp

def worker(rank, model_path, q_in, q_out):
    model = torch.jit.load(model_path).eval()
    with torch.inference_mode():
        while True:
            idx, x = q_in.get()
            if x is None: return
            q_out.put((idx, model(x)))

if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)
    q_in, q_out = mp.Queue(), mp.Queue()
    procs = [mp.Process(target=worker, args=(r, "m.pt", q_in, q_out))
             for r in range(4)]
    for p in procs: p.start()
    for i, x in enumerate(inputs): q_in.put((i, x))
    results = sorted([q_out.get() for _ in range(len(inputs))])
    for p in procs:
        q_in.put((0, None))
        p.join()
```

## Testing Patterns

**Gradient check with torch.autograd.gradcheck — verifies custom backward**

```python
import torch

# For a custom autograd Function or any differentiable op:
x = torch.randn(5, 3, dtype=torch.double, requires_grad=True)
w = torch.randn(3, 7, dtype=torch.double, requires_grad=True)

# gradcheck uses finite differences to verify analytic backward against numerical
torch.autograd.gradcheck(lambda x, w: torch.sigmoid(x @ w), (x, w),
                         eps=1e-6, atol=1e-4, raise_exception=True)
print("backward matches finite-difference estimate")

# gradgradcheck verifies second-order grads if your Function defines them
torch.autograd.gradgradcheck(lambda x: x.sin().sum(), (x.double().requires_grad_(),))
```

**torch.testing.assert_close — the right way to compare tensors**

```python
import torch
from torch.testing import assert_close

# Tighter than torch.allclose — checks dtype, device, stride, AND values
a = torch.tensor([1.0, 2.0, 3.0])
b = torch.tensor([1.0, 2.0, 3.0 + 1e-7])

assert_close(a, b, rtol=1e-5, atol=1e-6, check_dtype=True)

# Common in test suites: regenerate a golden output and assert determinism
def test_model_forward_deterministic(model, x, seed=42):
    torch.manual_seed(seed)
    y1 = model(x)
    torch.manual_seed(seed)
    y2 = model(x)
    assert_close(y1, y2, atol=0, rtol=0)  # bit-for-bit identical
```

**Numerical stability tests — logsumexp, softmax, log-prob paths**

```python
import torch
import torch.nn.functional as F

def test_softmax_finite_for_huge_logits():
    # Plain exp/sum will overflow for logits around 1e4 — PyTorch softmax is stable
    x = torch.tensor([1e4, 1e4, 1e4])
    p = F.softmax(x, dim=-1)
    assert torch.isfinite(p).all()
    assert_close(p, torch.full_like(p, 1.0 / 3), atol=1e-6)

def test_log_softmax_matches_softmax_log():
    x = torch.randn(1000)
    a = F.log_softmax(x, dim=-1)
    b = torch.log(F.softmax(x, dim=-1).clamp_min(1e-30))
    assert_close(a, b, atol=1e-5, rtol=1e-5)
    # log_softmax should NOT produce -inf for large logits
    big = torch.tensor([1e30, 1e30])
    assert torch.isfinite(F.log_softmax(big, dim=-1)).all()
```

**Hook-based debugging — register_forward_hook to inspect intermediate activations**

```python
import torch
from torch import nn

hooks = []
def attach_debug_hooks(model):
    for name, m in model.named_modules():
        if isinstance(m, (nn.Linear, nn.LayerNorm)):
            def make_hook(n):
                def hook(mod, inp, out):
                    if not torch.isfinite(out).all():
                        print(f"NaN in {n}")
                    if out.abs().max() > 1e4:
                        print(f"explosion in {n}: max={out.abs().max()}")
                return hook
            hooks.append(m.register_forward_hook(make_hook(name)))

attach_debug_hooks(model)
out = model(x)              # warnings print as activation diverges
for h in hooks: h.remove()  # ALWAYS clean up hooks after debugging
```

## Performance Tuning

- torch.compile (2.0+) gives 1.3-2x speedup; first iteration compiles (slow), use mode='reduce-overhead' for inference, mode='max-autotune' for training.
- Mixed precision (fp16/bf16) halves weight + activation memory; bf16 needs no GradScaler, fp16 does.
- F.scaled_dot_product_attention (2.0+) dispatches to FlashAttention-2 / memory-efficient kernels automatically — never write your own softmax attention.
- Memory per param in Adam fp32 ~= 16 bytes: weight(4) + grad(4) + m(4) + v(4). A 1B-param model needs ~16 GB just for the optimizer state.
- torch.inference_mode() is faster than torch.no_grad() — no version counter bump, but tensors cannot be used later in grad-enabled code.
- CUDA OOM is often fragmentation, not true OOM — try torch.cuda.empty_cache() between phases, or set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True.
- DDP all-reduces grads after backward; overlap with compute by using model.no_sync() context for all but the last micro-batch.
- Gradient checkpointing (torch.utils.checkpoint) trades ~30% compute for ~50%+ activation memory — essential for long-sequence LLM training.
- DataLoader pin_memory=True + .to(device, non_blocking=True) overlaps H2D copy with compute — free 5-10% throughput on GPU-bound training.
- torch profiler: torch.profiler.profile(activities=[CPU, CUDA], record_shapes=True) + Chrome trace export is the standard.
- Optimal batch size is the largest power of 2 that fits at 80% GPU memory; doubling it past peak throughput wastes memory.
- set_to_none=True in zero_grad is ~10% faster than set_to_none=False — produces None grads instead of zero tensors.
- FSDP saves 4x memory vs DDP for the same model by sharding params/grads/optimizer state across ranks.
- Triton kernels (via torch.compiler) let you write fused ops that beat cuBLAS for unusual shapes — see FlashAttention for the canonical example.
- torch.compile fullgraph=True requires the graph has no data-dependent Python control flow — but yields the largest speedup when it works.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [torchvision](https://pytorch.org/vision/) | Image models, transforms, datasets (CIFAR, ImageNet), and pretrained weights. | build |
| [torchaudio](https://pytorch.org/audio/) | Audio I/O, transforms (MFCC, spectrogram), and speech models. | build |
| [torchtext](https://pytorch.org/text/) | Text data utilities, vocab, and classic NLP models (in maintenance). | build |
| [HuggingFace Transformers](https://huggingface.co/docs/transformers/) | Largest hub of pretrained LLMs, vision encoders, and tokenizers — all PyTorch-native. | build |
| [HuggingFace Accelerate](https://huggingface.co/docs/accelerate/) | Thin wrapper that adapts a single training script to DDP/FSDP/DeepSpeed without code changes. | build |
| [PyTorch Lightning](https://lightning.ai/docs/pytorch/stable/) | Higher-level training framework — abstracts the loop, logging, callbacks; opinionated structure. | build |
| [timm](https://huggingface.co/docs/timm/) | PyTorch Image Models — largest collection of pretrained vision backbones (ResNet, ViT, ConvNeXt, EMA). | build |
| [fastai](https://docs.fast.ai/) | High-level API on top of PyTorch for vision, tabular, text, collab — opinionated defaults. | build |
| [DeepSpeed](https://www.deepspeed.ai/) | Microsoft's distributed training library — ZeRO stages 1-3, offload to CPU/NVMe. | build |
| [Megatron-LM](https://github.com/NVIDIA/Megatron-LM) | NVIDIA's reference implementation for tensor + pipeline parallel LLM training. | build |
| [torchrun / torch.distributed.elastic](https://pytorch.org/docs/stable/elastic/run.html) | Built-in launcher for multi-node DDP/FSDP — handles restarts and rank reassignment. | deploy |
| [TorchServe](https://pytorch.org/serve/) | Official model serving server — handles batching, versioning, and metrics. | deploy |
| [ExecuTorch](https://pytorch.org/executorch/) | On-device inference for ARM/Qualcomm/Apple Silicon — successor to PyTorch Mobile. | deploy |
| [TorchDynamo + Inductor](https://dev-discuss.pytorch.org/t/torchdynamo-an-experiment-in-dynamic-bytecode-transformation/361) | The torch.compile stack — Python bytecode tracing + Triton/C++ codegen. | build |
| [Triton (OpenAI)](https://openai.com/research/triton) | Python DSL for GPU kernels — what Inductor emits; lets you write fused ops. | build |
| [ONNX Runtime](https://onnxruntime.ai/) | Cross-framework inference engine — export via torch.onnx and serve on CPU/GPU/edge. | deploy |
| [Weights & Biases](https://wandb.ai/) | Experiment tracking, hyperparameter sweeps, artifact storage — integrates via 3 lines. | debug |
| [torchmetrics](https://torchmetrics.readthedocs.io/) | Standardized metric objects (Accuracy, F1, BLEU) that sync across DDP ranks correctly. | test |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.1 | 2016 | First public release at FAIR — early alpha, autograd + Lua-inspired API. |
| 0.4 | 2018 | Merged Variable and Tensor into one class; introduced .to(device). |
| 1.0 | 2018 | Stable release; C++2 backend, JIT (TorchScript), and removed variable name from API. |
| 1.5 | 2020 | C++ frontend stable; expanded quantization; torchvision 0.6 with new model APIs. |
| 1.6 | 2020 | torch.cuda.amp native automatic mixed precision; RPC framework for distributed. |
| 1.7 | 2020 | Added complex tensors (complex64/128); NVIDIA AMPERE support; cu111. |
| 1.8 | 2021 | FSDP initial; torch.fft module; major torch.distributed improvements. |
| 1.9 | 2021 | nn.Transformer stable; torch.func (functorch) merged as experimental. |
| 1.10 | 2021 | CUDA 11.3; Expanded edge support; ONNX exporter overhauled. |
| 1.11 | 2022 | functorch in-tree; TorchDynamo preview; FSDP left beta. |
| 1.12 | 2022 | DTensor prototype; Apple MPS backend (Apple Silicon GPU); TorchRec for recsys. |
| 1.13 | 2022 | Native CUDA 11.7; torch.compile preview; beta torch.export path. |
| 2.0 | 2023 | torch.compile (TorchDynamo + Inductor) GA — the headline 2.x feature. |
| 2.1 | 2023 | torch.func stable (vmap, grad-of-grad); scaled_dot_product_attention broad rollout. |
| 2.2 | 2024 | FlashAttention-2 in SDPA; Python 3.12 support; Inductor improvements. |
| 2.3 | 2024 | Faster compiled multi-GPU; CPU compile improvements; TorchRL maturing. |
| 2.4 | 2024 | torch.load defaults to weights_only=True (security); ONNX exporter via dynamo. |
| 2.5 | 2024 | CuDNN 9; FlexAttention (block-sparse API); compiled transformer blocks in tree. |
| 2.6 | 2025 | Inductor CPU codegen matures; broader GPU dtype support (fp8 on Hopper). |
| 2.15 | 2026 | Rewritten NCCL backend default for torch.distributed (flight recorder dumps on hangs), one-sided NIXL transports, NVFP4 decoding on Blackwell, Apple Silicon FP8 decode (~1.3x MoE tokens/s). |

## Interview Hot Questions

1. **Why does PyTorch accumulate gradients by default, and how does optimizer.zero_grad() fit in?** *(easy)*

   Autograd sums into .grad on each backward() call, supporting gradient accumulation (large effective batch from small physical batches) and multi-loss heads. zero_grad clears .grad before the next step; forgetting it doubles, triples... gradients across iterations. Use zero_grad(set_to_none=True) — it's faster (None vs zero tensor) and lets the optimizer skip the update entirely for params with no grad.

2. **What's the difference between torch.no_grad() and torch.inference_mode()?** *(medium)*

   Both disable autograd, but inference_mode() (1.9+) skips the version counter bump and is faster. The catch: inference_mode tensors can't later be used in grad-enabled code without an explicit detach+clone. Use no_grad() if the same tensor might flow back into a training graph, inference_mode() for pure inference (validation, serving).

3. **How does DDP all-reduce interact with backward()?** *(hard)*

   DDP registers backward hooks on each parameter's grad. After local backward() completes, gradients are all-reduced across ranks (NCCL ring). To overlap, use model.no_sync() inside the context for all but the last micro-batch — only then does the all-reduce fire, so it overlaps with the next forward pass. This is essential for large models where all-reduce latency dominates.

4. **When would you choose FSDP over DDP?** *(medium)*

   DDP replicates the full model on every GPU — works until the model doesn't fit. FSDP shards params, grads, and optimizer state across ranks (ZeRO-3), so a 70B model trains on 8x80GB GPUs. FSDP's overhead is higher (more all-gather calls during forward/backward), so use DDP for models that fit and FSDP when they don't. Sharding strategy FULL_SHARD = ZeRO-3, SHARD_GRAD_OP = ZeRO-2.

5. **Why use bfloat16 over float16 for mixed-precision training?** *(medium)*

   bf16 has 8 exponent bits (same as fp32) and 7 mantissa bits; fp16 has 5 exponent + 10 mantissa. bf16's range matches fp32, so it almost never overflows/underflows and needs no GradScaler. fp16 has more precision but a narrow ±65504 range — gradients underflow below ~6e-8, requiring loss scaling. Use bf16 on Ampere+ (A100, H100); use fp16 on Volta/Turing (V100, T4) where bf16 hardware support is missing.

6. **How does torch.compile work and when can it hurt?** *(hard)*

   TorchDynamo hooks into Python's frame evaluation, traces forward() into a graph, then Inductor fuses ops and generates Triton/C++ kernels. Speedups come from kernel fusion (fewer GPU launches) and autotuning. It hurts when: the graph has data-dependent Python control flow (retraces constantly), inputs have changing shapes (recompiles), or you can't amortize the first-call compile cost over many iterations (e.g. short RL episodes).

7. **What does requires_grad=False vs .detach() vs torch.no_grad() do?** *(medium)*

   requires_grad=False on a leaf tensor makes autograd ignore it entirely (used for frozen embeddings, input data). .detach() returns a new tensor sharing storage but disconnected from the graph — useful for logging or feeding into non-ML code. torch.no_grad() is a context manager that disables grad tracking for everything inside it — saves memory and time during inference. They compose: inside no_grad(), even a requires_grad=True tensor won't build a graph.

8. **How would you debug NaN losses?** *(medium)*

   First, enable anomaly detection: with torch.autograd.detect_anomaly(): loss.backward() — it raises at the op that produced the NaN with a stack trace. Common causes: (1) fp16 overflow (switch to bf16 or use GradScaler), (2) log(0) (clamp inputs), (3) division by zero (add eps), (4) exploding gradients (clip_grad_norm_), (5) bad input data (assert finite at the top of forward). Hook every module with register_forward_hook to find the first NaN.

9. **Explain gradient checkpointing and its tradeoff.** *(hard)*

   torch.utils.checkpoint.checkpoint(layer, x) recomputes the forward during backward instead of storing activations. This trades ~30% more compute for a major activation memory reduction (e.g. ~sqrt(N) for an N-layer transformer instead of O(N)). Essential for long-context training where activation memory dominates. Use it on the per-layer granularity; checkpointing too coarsely loses the benefit, too finely adds recompute overhead.

10. **What's the difference between state_dict and a JIT/scripted model for serialization?** *(medium)*

   state_dict is just an OrderedDict of name->tensor — portable, framework-version-tolerant, but only weights (you need the original code to rebuild the model). TorchScript (torch.jit.trace/script) serializes the model graph + weights into a single .pt file loadable from C++ without Python — better for serving. For deployment prefer ONNX (cross-runtime) or ExecuTorch (mobile); for checkpoints use state_dict (+ safetensors for distribution).

## When to Choose This

- **vs TensorFlow:** use this — Research code, custom architectures, when you need to read/modify gradients inline, LLM/diffusion work where the ecosystem momentum is here.; use that — Production serving at Google scale, TPU training, mobile/edge deployment (TFLite), or extending BERT/T5/Gemini internals.
- **vs JAX:** use this — Iterative debugging with print/pdb, when the community (HuggingFace, timm) target matters more than pure functional purity, most NLP/CV research.; use that — Massive SPMD model parallelism, when you want XLA + functional transforms (vmap, pmap, grad-of-grad) as first-class, JAX/Flax ecosystems.
- **vs Keras:** use this — Custom training loops, gradient hacking, research where .fit() gets in the way, anything needing per-step control.; use that — Rapid prototyping of standard architectures (CNNs, simple transformers), teaching, when the high-level .compile()/.fit() trinity covers 90% of your needs.
- **vs scikit-learn:** use this — Deep learning (any architecture with layers), gradient-based optimization, GPU/TPU compute, anything larger than ~1M parameters.; use that — Tabular data, baselines before deep learning, classical ML (RF, XGBoost-style), preprocessing pipelines, model selection with grid search.
- **vs ONNX Runtime:** use this — Training, model development, debugging with Python, when you need autograd.; use that — Pure inference on CPU/edge/embedded, cross-language serving (C#/Java/JS), when you want maximum inference throughput without Python in the path.

