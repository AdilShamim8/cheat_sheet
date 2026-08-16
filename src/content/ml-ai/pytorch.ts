import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "pytorch",
  name: "PyTorch",
  category: "ml-ai",
  tier: "ml",
  tags: ["deep-learning", "autograd", "gpu", "neural-networks", "research", "tensor", "python", "meta"],
  tagline: "Dynamic-computation-graph tensor library with reverse-mode autodiff — the de facto standard for deep-learning research.",
  year: 2016,
  author: "Meta AI (FAIR)",

  tldr: [
    "PyTorch is a Python-first tensor library that executes eagerly by default, building the autograd graph on the fly as operations run — there is no separate graph-compile step before training.",
    "It dominates academic deep-learning research and has displaced TensorFlow as the default in most new LLM and diffusion work (Llama, Mistral, Stable Diffusion are all PyTorch-native).",
    "Reach for it when you need custom architectures, gradient hacking, mixed-precision training, or want to follow/extend a research paper — the API is debuggable with normal Python print/pdb.",
    "Avoid it for browser/edge inference (use ONNX/ExecuTorch), for non-deep ML (use scikit-learn), or when you cannot afford a Python process per served model (use torch.jit / compiled export).",
  ],

  mentalModel: {
    title: "A tape recorder over eager tensor ops",
    body: "Every tensor op in the forward pass writes its inputs and backward rule onto a per-thread tape. Calling loss.backward() replays that tape in reverse, accumulating .grad on every leaf tensor that has requires_grad=True. The graph is rebuilt from scratch each iteration — so you can put Python control flow (if, while, recursion) inside forward() and gradients just work. optimizer.step() then nudges parameters using those accumulated .grad values; optimizer.zero_grad() clears them because grads sum, not replace.",
  },

  constructs: [
    { syntax: "torch.tensor([1.0, 2.0], requires_grad=True)", behavior: "Creates a leaf tensor tracked by autograd — ops on it build a graph.", when: "Any tensor you want gradients for: model weights, inputs in meta-learning." },
    { syntax: "x.detach()", behavior: "Returns a tensor sharing storage but disconnected from the graph — no grad flows through it.", when: "Logging, moving to NumPy, target computation that must not be differentiated." },
    { syntax: "with torch.no_grad(): ...", behavior: "Disables grad tracking inside the block — no graph is built, no .grad set.", when: "Inference, validation, metric computation — saves memory and time." },
    { syntax: "class M(nn.Module):\n  def __init__(self): super().__init__()\n  def forward(self, x): ...", behavior: "Composable module — submodules/Parameters registered in __init__ are auto-collected by .parameters() and .to(device).", when: "Every model, layer, loss — there is no other idiomatic way to define one." },
    { syntax: "nn.Parameter(torch.randn(...))", behavior: "A Tensor subclass that auto-registers as a trainable parameter when assigned to a Module attribute.", when: "Custom weights inside a layer; never use bare tensors for learnable params." },
    { syntax: "loss.backward(); optimizer.step(); optimizer.zero_grad()", behavior: "Backprop, update, clear — the three-line training step. Gradients accumulate by default.", when: "Every supervised step. Skipping zero_grad doubles, triples, … the gradient." },
    { syntax: "model.to(device); tensor.to(device)", behavior: "Moves module params / tensor to 'cuda' or 'cuda:0'. Cross-device ops raise.", when: "Before any compute on GPU — model and all inputs must share device." },
    { syntax: "model.train() / model.eval()", behavior: "Toggles self.training flag — affects Dropout, BatchNorm, and any layer you write that branches on it.", when: "Wrap validation/test in eval(); restore train() after — forgetting this is the #1 silent bug." },
    { syntax: "DataLoader(ds, batch_size=64, shuffle=True, num_workers=4, pin_memory=True)", behavior: "Iterates batches with multi-process loading, optional shuffling, and pinned (page-locked) host memory for fast async H2D copy.", when: "Anything bigger than toy data; num_workers>0 needs if __name__=='__main__' on Windows." },
    { syntax: "torch.save({'model': sd, 'opt': opt.state_dict()}, 'ckpt.pt')", behavior: "Pickle-serializes state dicts (ordered dict of name→tensor) to disk.", when: "Checkpointing; load with torch.load(..., map_location=device) to avoid device jumps." },
    { syntax: "with torch.autocast('cuda', dtype=torch.float16): ...", behavior: "Automatic mixed precision — runs eligible ops in fp16/bf16, keeps reductions in fp32.", when: "2× memory savings and 1.5–3× speedup on Ampere/Hopper; pair with GradScaler for fp16." },
    { syntax: "DDP(model, device_ids=[i])", behavior: "Wraps a model for synchronous data-parallel training across processes — each rank gets a shard of the batch and grads are all-reduced.", when: "Multi-GPU training; prefer over DataParallel (DP) which is GIL-bound and deprecated." },
    { syntax: "model = torch.compile(model)", behavior: "Traces and JIT-compiles the model (TorchDynamo + Inductor) for graph-level fusion and kernel autotuning.", when: "Production training/inference on 2.0+; 1.3–2× speedup with no code changes for most models." },
  ],

  patterns: [
    {
      lang: "python",
      caption: "The canonical training loop — the pattern every PyTorch engineer memorizes",
      code: `import torch
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
        print(f"epoch {epoch}: {loss.item():.4f}")`,
    },
    {
      lang: "python",
      caption: "Custom nn.Module with lazy weight init and eval-time branching",
      code: `import torch
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
print(sum(p.numel() for p in layer.parameters()))   # param count`,
    },
    {
      lang: "python",
      caption: "Checkpoint save/load with optimizer + epoch — resumable training",
      code: `import torch

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
    return ck["epoch"], ck["best"]`,
    },
    {
      lang: "python",
      caption: "Mixed-precision training with GradScaler (fp16 path; bf16 skips scaler)",
      code: `import torch
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
    scaler.update()                          # adjust scale factor`,
    },
    {
      lang: "python",
      caption: "Custom Dataset with collate and worker-safe transforms",
      code: `import torch
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
                    num_workers=4, pin_memory=True, collate_fn=collate)`,
    },
  ],

  pitfalls: [
    {
      title: "Forgot model.eval() before validation",
      symptom: "Validation loss looks fine but inference predictions are noisy / nondeterministic; Dropout zeroes random units and BatchNorm uses batch stats instead of running averages.",
      fix: "Wrap every eval block in `with torch.no_grad(): model.eval() ...` and restore `model.train()` afterwards. The flag is sticky — set it explicitly rather than assuming the previous state.",
    },
    {
      title: "Leaked computation graph from logging or numpy",
      symptom: "CUDA OOM that grows over epochs, or `RuntimeError: Can't call numpy() on Tensor that requires grad`.",
      fix: "Detach before logging: `loss.item()`, `pred.detach().cpu().numpy()`. Never keep `.backward()`-able tensors in lists — they hold the whole graph alive.",
    },
    {
      title: "Skipped optimizer.zero_grad()",
      symptom: "Loss explodes after a few steps or training 'works' but with wrong gradients — PyTorch accumulates .grad across backward() calls by design (used for gradient accumulation).",
      fix: "Call `opt.zero_grad(set_to_none=True)` at the top of every step unless you intentionally accumulate — then divide the loss by accumulation_steps.",
    },
    {
      title: "Device mismatch — `Expected all tensors on same device`",
      symptom: "RuntimeError when forward() combines a CPU input tensor with a CUDA parameter (or vice versa).",
      fix: "Move data in the training loop with `x = x.to(device, non_blocking=True)` and call `model.to(device)` once at construction. Make `device` a module-level constant or pass it down explicitly.",
    },
    {
      title: "In-place op on a leaf requiring grad",
      symptom: "`RuntimeError: a leaf Variable that requires grad is being used in an in-place operation.`",
      fix: "Never do `w += ...` on a Parameter — go through the optimizer. For in-place activations, use the functional form (e.g. `F.relu(x)` not `x.relu_()` on tensors that need grad).",
    },
    {
      title: "DataLoader deadlocks / no speedup from workers",
      symptom: "Training hangs at the first batch, or num_workers>0 is no faster than 0 — usually on Windows or with non-fork-safe code.",
      fix: "Guard entry point with `if __name__ == '__main__':` on Windows/macOS (spawn start method). Keep Dataset.__getitem__ pure (no shared mutable state). Set `persistent_workers=True` to avoid re-spawn cost per epoch.",
    },
    {
      title: "pin_memory=True without enough host RAM or on CPU-only",
      symptom: "Slower training or OOM on host RAM; pin_memory allocates page-locked memory which is finite and not free.",
      fix: "Only use pin_memory=True when training on CUDA and the host has headroom. For CPU-only or huge batches, set it False. non_blocking=True on .to(device, ...) is only useful when pin_memory=True.",
    },
  ],

  quickReference: [
    { fact: "Memory per param in Adam fp32 ≈ 16 bytes: weight(4) + grad(4) + m(4) + v(4). A 1B-param model needs ~16 GB just for the optimizer.", tag: "perf" },
    { fact: "Mixed precision (fp16/bf16) halves weight + activation memory; bf16 needs no GradScaler, fp16 does.", tag: "perf" },
    { fact: "Default Adam lr=1e-3, AdamW lr=1e-3, SGD lr=1e-2 (with momentum). Transformers typically use 3e-4 to 5e-5 with warmup.", tag: "version" },
    { fact: "Batch size heuristic: largest power of 2 that fits at 80% GPU memory; double it once with gradient accumulation if compute-bound.", tag: "perf" },
    { fact: "Gradient accumulation: effective batch = batch_size × accumulation_steps. Divide loss by steps so gradients average correctly.", tag: "gotcha" },
    { fact: "torch.compile (2.0+) gives 1.3–2× speedup; first iteration compiles (slow), use mode='reduce-overhead' for inference, mode='max-autotune' for training.", tag: "version" },
    { fact: "DDP all-reduces grads after backward; overlap with compute by using model.no_sync() context for all but the last micro-batch.", tag: "perf" },
    { fact: "state_dict() keys are qualified module paths (e.g. 'encoder.layer.0.fc1.weight'); load_state_dict(strict=False) ignores missing/extra keys.", tag: "gotcha" },
    { fact: "torch.load(weights_only=True) since 2.4 default — blocks arbitrary pickle execution; only loads tensors and basic types.", tag: "version" },
    { fact: "Dataloader workers are forked (Linux) — Dataset fields are copied via fork. Anything huge (a vocab dict) lives in shared memory or is rebuilt per worker.", tag: "gotcha" },
    { fact: "F.scaled_dot_product_attention (2.0+) dispatches to FlashAttention-2 / memory-efficient kernels automatically — never write your own softmax attention.", tag: "perf" },
    { fact: "torch.inference_mode() is faster than torch.no_grad() — no version counter bump, but tensors cannot be used later in grad-enabled code.", tag: "perf" },
    { fact: "CUDA OOM is often fragmentation, not true OOM — try torch.cuda.empty_cache() between phases, or set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True.", tag: "gotcha" },
    { fact: "2.0 dropped the torch.cuda.amp namespace (now torch.autocast + torch.cuda.amp.GradScaler still works but prefer torch.amp.GradScaler('cuda')).", tag: "version" },
    { fact: "model.train() flips self.training=True; only Dropout, BatchNorm, and your own layers that branch on it care — Linear/Conv/GELU are unaffected.", tag: "gotcha" },
  ],

  goDeeper: [
    { title: "PyTorch Official Documentation", url: "https://docs.pytorch.org/", note: "Authoritative API reference; the 'Notes' sections on autograd and CUDA semantics are required reading." },
    { title: "PyTorch: An Imperative Style, High-Performance Deep Learning Library (NeurIPS 2019)", url: "https://papers.nips.cc/paper/9015-pytorch-an-imperative-style-high-performance-deep-learning-library.pdf", note: "The canonical paper — explains the eager-execution design and how the dispatcher works." },
    { title: "Deep Learning with PyTorch (Stevens, Antiga, Viehmann)", url: "https://pytorch.org/deep-learning-with-pytorch.html", note: "Free interactive book from PyTorch devs; best path from tensors to deployment." },
    { title: "PyTorch Tutorials", url: "https://pytorch.org/tutorials/", note: "Official, versioned recipes — the 'Training a Classifier' and 'DDP' tutorials are canonical onboarding." },
    { title: "Automatic Differentiation in Machine Learning: a Survey (Baydin et al., 2018)", url: "https://arxiv.org/abs/1502.05767", note: "The math behind .backward(); reverse-mode autodiff explained independent of any framework." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "torch.float32 (torch.float)", behavior: "32-bit IEEE float — the default for nn.Linear, conv, and almost all training. ~4 bytes/element.", when: "Default everywhere. Switch only for memory or speed reasons." },
      { syntax: "torch.float16 (torch.half)", behavior: "16-bit float — 5 exponent + 10 mantissa bits. Range ±65504, prone to overflow/underflow.", when: "Mixed-precision training on Volta+; pair with GradScaler to avoid underflow." },
      { syntax: "torch.bfloat16", behavior: "16-bit float — 8 exponent + 7 mantissa bits. Same dynamic range as fp32, lower precision.", when: "Ampere+ GPUs and TPUs; safer than fp16 for training, no GradScaler needed." },
      { syntax: "torch.float64 (torch.double)", behavior: "64-bit IEEE double — slower on GPU, no real ML benefit.", when: "Numerical-grad checks (gradcheck), scientific computing; never for training." },
      { syntax: "torch.int64 (torch.long)", behavior: "64-bit signed int — the default for indices, labels, embedding lookups.", when: "Index tensors, NLL/CrossEntropy targets, gather/scatter indices." },
      { syntax: "torch.int8 / torch.uint8", behavior: "8-bit signed / unsigned integer.", when: "Quantization (int8 weights), image pixels 0-255 (uint8). Never use for math without casting." },
      { syntax: "torch.bool", behavior: "Boolean — 1 byte per element. Returned by comparisons.", when: "Masking: x[mask], masked_fill, attention masks. NOT for arithmetic." },
      { syntax: "torch.complex64 / complex128", behavior: "Complex floats — real + imag parts of float32/64.", when: "Signal processing, FFTs, quantum ML. Rare in mainstream deep learning." },
    ],
    collections: [
      { syntax: "torch.Tensor", behavior: "Multi-dim array with dtype, device, shape, and optional grad — the central object.", when: "Everything. All inputs, outputs, params, and intermediates are Tensors." },
      { syntax: "torch.nn.Parameter", behavior: "Tensor subclass with requires_grad=True; auto-registers when assigned to a Module attribute.", when: "Learnable weights inside a custom layer. Never use a bare Tensor for params." },
      { syntax: "torch.utils.data.Dataset", behavior: "Abstract __getitem__/__len__ contract — index-based access.", when: "Anything that fits in memory or has random-access file layout (TFRecords, sharded parquet)." },
      { syntax: "torch.utils.data.IterableDataset", behavior: "Streaming dataset — __iter__ yields samples, no random access.", when: "Streams, logs, sharded files where __getitem__ would be too expensive." },
      { syntax: "torch.utils.data.DataLoader", behavior: "Iterator that batches, shuffles, optionally prefetches via worker processes.", when: "Always wrap a Dataset before training; num_workers>0 for I/O-heavy data." },
      { syntax: "torch.nn.ModuleList / ParameterList", behavior: "List-like containers that register contents with the parent Module.", when: "Variable-depth stacks; .parameters() picks them up. Plain Python lists do NOT." },
      { syntax: "torch.nn.Sequential", behavior: "Chained Module — forward = chained calls.", when: "Linear pipelines only; use subclassing for branches or skip connections." },
      { syntax: "torch.utils.data.distributed.DistributedSampler", behavior: "Shards a Dataset across DDP ranks; set_epoch() reshuffles each epoch.", when: "Required with DataLoader in DDP training; never split data manually across ranks." },
      { syntax: "TensorDict (from tensordict)", behavior: "Dict of tensors sharing a leading batch dim — batched ops apply to all values.", when: "Multi-modal batches, RL rollouts, batched env simulators." },
    ],
    custom: [
      { syntax: "class L(nn.Module):\n  def __init__(self): super().__init__()\n  def forward(self, x): ...", behavior: "Composable layer — Parameters/submodules assigned in __init__ are auto-collected by .parameters() and .to().", when: "Every custom layer, block, or full model. There is no other idiomatic way." },
      { syntax: "class Loss(nn.Module):\n  def forward(self, pred, target): ...", behavior: "Losses are Modules — allows them to hold learnable terms (e.g. contrastive temperature).", when: "Custom losses; use nn.functional.* for stateless ones." },
      { syntax: "class D(Dataset):\n  def __len__(self): ...\n  def __getitem__(self, i): ...", behavior: "Index-based dataset — must be picklable for worker processes.", when: "Custom data layout; __getitem__ should be pure (no shared mutable state)." },
      { syntax: "class F(torch.autograd.Function):\n  @staticmethod\n  def forward(ctx, x): ...\n  @staticmethod\n  def backward(ctx, g): ...", behavior: "Custom autograd op — defines BOTH forward and its backward rule.", when: "Inverting gradients, custom CUDA kernels, gradient surgery. Avoid if a regular op works." },
      { syntax: "class O(torch.optim.Optimizer):\n  def step(self): ...", behavior: "Custom optimizer — implement step() using self.param_groups.", when: "Research optimizers; 99% of cases should subclass AdamW or use existing." },
      { syntax: "class S(torch.optim.lr_scheduler.LRScheduler):\n  def get_lr(self): ...", behavior: "Custom LR schedule — implement get_lr() called each step.", when: "Custom schedules; for warmup+cosine use transformers.get_cosine_schedule_with_warmup." },
      { syntax: "class Sampler(torch.utils.data.Sampler):", behavior: "Yields indices — controls the order DataLoader pulls samples.", when: "Class-balanced, weighted, or curriculum sampling." },
      { syntax: "model = torch.compile(model)", behavior: "Traces the Module's forward into a graph and JIT-compiles via Inductor.", when: "Production training on 2.0+; a transformation of the custom Module, not a new type." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, torch.add(a, b)", behavior: "Element-wise add with broadcasting; out-of-place by default.", when: "Math. Use add_(...) for in-place only on non-leaf tensors." },
    { syntax: "a @ b, torch.matmul(a, b)", behavior: "Matrix multiply — 2D, batched, and batched+vector forms all dispatch.", when: "Standard matmul. For 3D-only strict batching, bmm can be marginally faster." },
    { syntax: "torch.einsum('bihd,bjhd->bij', q, k)", behavior: "Einstein summation — arbitrary tensor contractions in one call.", when: "Multi-tensor contractions (attention, GNNs). Readability tradeoff vs chained ops." },
    { syntax: "torch.bmm(a, b)", behavior: "Strict 3-D batched matmul — no broadcasting.", when: "Tight loops where you control the shapes; skips matmul's dispatch overhead." },
    { syntax: "torch.cat([a, b], dim=0)", behavior: "Concatenates tensors along an existing axis.", when: "Joining batches, features, sequence dims. Both tensors must share other dims." },
    { syntax: "torch.stack([a, b], dim=0)", behavior: "Stacks along a NEW axis — adds a dimension.", when: "Aggregating results into a new batch dim; the inverse of unbind." },
    { syntax: "torch.softmax(x, dim=-1)", behavior: "Normalized exp along axis — sums to 1.", when: "Classification head, attention weights. Use F.log_softmax for numerical stability." },
    { syntax: "torch.sigmoid(x)", behavior: "1 / (1 + e^-x) — squashes to (0,1).", when: "Binary logits, gates. Numerically stable for large |x|." },
    { syntax: "F.relu(x) / F.gelu(x) / F.silu(x)", behavior: "Activation functions — relu (cheap), gelu (transformers), silu (swish, modern LLMs).", when: "Pick by architecture: MLPs → relu/gelu, LLMs → silu, conv → relu/mish." },
    { syntax: "torch.where(cond, a, b)", behavior: "Element-wise ternary — picks from a where cond is True, else b.", when: "Masking, conditional gradient routes, custom losses. Broadcasts shapes." },
    { syntax: "torch.gather(x, dim, idx)", behavior: "Selects elements along dim at positions in idx — same shape as idx.", when: "NLL of correct class, sequence mixing, MoE routing." },
    { syntax: "torch.scatter(dim, idx, src)", behavior: "Inverse of gather — writes src values into out at idx positions.", when: "MoE dispatch, embedding updates, one-hot expansion." },
    { syntax: "torch.norm(x, p=2, dim=-1)", behavior: "L-p norm along an axis.", when: "Gradient clipping (clip_grad_norm_), layer norm internals, distance metrics." },
    { syntax: "torch.sum / mean / max / min(x, dim=...)", behavior: "Reductions — pass dim to keep rank, omit for scalar.", when: "Loss reductions, mean over batch, max for argmax + value." },
    { syntax: "x[mask] / torch.masked_select / masked_fill", behavior: "Boolean-mask indexing and conditional fill.", when: "Padding masks, attention masking, label masking." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "python",
      caption: "Checkpoint save/load — full state (model + optimizer + step)",
      code: `import torch

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
    return ck["epoch"], ck["step"], ck["best"]`,
    },
    {
      lang: "python",
      caption: "Loading pretrained weights — HuggingFace, timm, and torch.hub patterns",
      code: `import torch, torch.nn as nn
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
yolo = torch.hub.load("ultralytics/yolov5", "yolov5s", pretrained=True)`,
    },
    {
      lang: "python",
      caption: "Streaming a sharded dataset — IterableDataset over many files",
      code: `import torch, glob, json
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
                    pin_memory=True, drop_last=True)`,
    },
    {
      lang: "python",
      caption: "Export to ONNX / TorchScript / safetensors for serving",
      code: `import torch
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
save_file(m.state_dict(), "weights.safetensors")`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "python",
      caption: "Canonical train + eval loop with epoch boundaries",
      code: `import torch
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
        print(f"epoch {epoch}: val_acc={n_correct/n_total:.4f}")`,
    },
    {
      lang: "python",
      caption: "Gradient accumulation — effective batch larger than physical batch",
      code: `accum_steps = 4          # effective batch = 64 * 4 = 256
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
        opt.zero_grad(set_to_none=True)`,
    },
    {
      lang: "python",
      caption: "Custom learning-rate warmup + cosine decay each step",
      code: `import math
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
    scheduler.step()           # call PER STEP, not per epoch, for LLM training`,
    },
    {
      lang: "python",
      caption: "DistributedSampler epoch loop — must call set_epoch or shuffle is stale",
      code: `from torch.utils.data import DataLoader
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
        print(f"epoch {epoch}: {metric.item() / world_size:.4f}")`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "python",
      caption: "Custom nn.Module with lazy weight init and forward branching",
      code: `import torch, torch.nn.functional as F
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
        return x`,
    },
    {
      lang: "python",
      caption: "Custom loss with label smoothing and a stateful temperature",
      code: `import torch, torch.nn.functional as F
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
        return nll.mean()`,
    },
    {
      lang: "python",
      caption: "Custom autograd Function — straight-through estimator",
      code: `import torch

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
binary = hard_sigmoid_st(logits)            # forward: 0/1, backward: identity`,
    },
    {
      lang: "python",
      caption: "Custom optimizer (Lion, simplified) — subclassing torch.optim.Optimizer",
      code: `import torch
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
        return loss`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "python",
      caption: "Device mismatch — detect and auto-place tensors",
      code: `import torch

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
    raise`,
    },
    {
      lang: "python",
      caption: "NaN/Inf detection and recovery — skip step on bad gradients",
      code: `import torch

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
    return True`,
    },
    {
      lang: "python",
      caption: "OOM recovery — retry with smaller batch or empty the cache",
      code: `import torch

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
    raise RuntimeError("batch too small to fit")`,
    },
    {
      lang: "python",
      caption: "Shape/dtype assertions — fail loud before the long forward",
      code: `import torch

def assert_inputs(x, y, *, expected_dtype=None, expected_dim=2):
    if x.dim() != expected_dim:
        raise ValueError(f"x.dim()={x.dim()}, expected {expected_dim}")
    if x.shape[0] != y.shape[0]:
        raise ValueError(f"batch mismatch: x={x.shape[0]}, y={y.shape[0]}")
    if expected_dtype is not None and x.dtype != expected_dtype:
        raise TypeError(f"x.dtype={x.dtype}, expected {expected_dtype}")
    if not torch.isfinite(x).all():
        raise ValueError("x contains NaN/Inf at input")`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "python",
      caption: "DistributedDataParallel — the standard multi-GPU setup",
      code: `import os, torch
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

# Launch with: torchrun --nproc_per_node=8 train.py`,
    },
    {
      lang: "python",
      caption: "Gradient accumulation with DDP no_sync — only all-reduce on last micro-batch",
      code: `import torch
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
            opt.zero_grad(set_to_none=True)`,
    },
    {
      lang: "python",
      caption: "FSDP — Fully Sharded Data Parallel for models too big for one GPU",
      code: `import torch
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
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)`,
    },
    {
      lang: "python",
      caption: "torch.multiprocessing — CPU-side parallel inference pool",
      code: `import torch
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
        p.join()`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "python",
      caption: "Gradient check with torch.autograd.gradcheck — verifies custom backward",
      code: `import torch

# For a custom autograd Function or any differentiable op:
x = torch.randn(5, 3, dtype=torch.double, requires_grad=True)
w = torch.randn(3, 7, dtype=torch.double, requires_grad=True)

# gradcheck uses finite differences to verify analytic backward against numerical
torch.autograd.gradcheck(lambda x, w: torch.sigmoid(x @ w), (x, w),
                         eps=1e-6, atol=1e-4, raise_exception=True)
print("backward matches finite-difference estimate")

# gradgradcheck verifies second-order grads if your Function defines them
torch.autograd.gradgradcheck(lambda x: x.sin().sum(), (x.double().requires_grad_(),))`,
    },
    {
      lang: "python",
      caption: "torch.testing.assert_close — the right way to compare tensors",
      code: `import torch
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
    assert_close(y1, y2, atol=0, rtol=0)  # bit-for-bit identical`,
    },
    {
      lang: "python",
      caption: "Numerical stability tests — logsumexp, softmax, log-prob paths",
      code: `import torch
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
    assert torch.isfinite(F.log_softmax(big, dim=-1)).all()`,
    },
    {
      lang: "python",
      caption: "Hook-based debugging — register_forward_hook to inspect intermediate activations",
      code: `import torch
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
for h in hooks: h.remove()  # ALWAYS clean up hooks after debugging`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "torch.compile (2.0+) gives 1.3-2x speedup; first iteration compiles (slow), use mode='reduce-overhead' for inference, mode='max-autotune' for training.", tag: "perf" },
    { fact: "Mixed precision (fp16/bf16) halves weight + activation memory; bf16 needs no GradScaler, fp16 does.", tag: "perf" },
    { fact: "F.scaled_dot_product_attention (2.0+) dispatches to FlashAttention-2 / memory-efficient kernels automatically — never write your own softmax attention.", tag: "perf" },
    { fact: "Memory per param in Adam fp32 ~= 16 bytes: weight(4) + grad(4) + m(4) + v(4). A 1B-param model needs ~16 GB just for the optimizer state.", tag: "perf" },
    { fact: "torch.inference_mode() is faster than torch.no_grad() — no version counter bump, but tensors cannot be used later in grad-enabled code.", tag: "perf" },
    { fact: "CUDA OOM is often fragmentation, not true OOM — try torch.cuda.empty_cache() between phases, or set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True.", tag: "gotcha" },
    { fact: "DDP all-reduces grads after backward; overlap with compute by using model.no_sync() context for all but the last micro-batch.", tag: "perf" },
    { fact: "Gradient checkpointing (torch.utils.checkpoint) trades ~30% compute for ~50%+ activation memory — essential for long-sequence LLM training.", tag: "perf" },
    { fact: "DataLoader pin_memory=True + .to(device, non_blocking=True) overlaps H2D copy with compute — free 5-10% throughput on GPU-bound training.", tag: "perf" },
    { fact: "torch profiler: torch.profiler.profile(activities=[CPU, CUDA], record_shapes=True) + Chrome trace export is the standard.", tag: "perf" },
    { fact: "Optimal batch size is the largest power of 2 that fits at 80% GPU memory; doubling it past peak throughput wastes memory.", tag: "perf" },
    { fact: "set_to_none=True in zero_grad is ~10% faster than set_to_none=False — produces None grads instead of zero tensors.", tag: "perf" },
    { fact: "FSDP saves 4x memory vs DDP for the same model by sharding params/grads/optimizer state across ranks.", tag: "perf" },
    { fact: "Triton kernels (via torch.compiler) let you write fused ops that beat cuBLAS for unusual shapes — see FlashAttention for the canonical example.", tag: "perf" },
    { fact: "torch.compile fullgraph=True requires the graph has no data-dependent Python control flow — but yields the largest speedup when it works.", tag: "gotcha" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "torchvision", purpose: "Image models, transforms, datasets (CIFAR, ImageNet), and pretrained weights.", url: "https://pytorch.org/vision/", category: "build" },
    { tool: "torchaudio", purpose: "Audio I/O, transforms (MFCC, spectrogram), and speech models.", url: "https://pytorch.org/audio/", category: "build" },
    { tool: "torchtext", purpose: "Text data utilities, vocab, and classic NLP models (in maintenance).", url: "https://pytorch.org/text/", category: "build" },
    { tool: "HuggingFace Transformers", purpose: "Largest hub of pretrained LLMs, vision encoders, and tokenizers — all PyTorch-native.", url: "https://huggingface.co/docs/transformers/", category: "build" },
    { tool: "HuggingFace Accelerate", purpose: "Thin wrapper that adapts a single training script to DDP/FSDP/DeepSpeed without code changes.", url: "https://huggingface.co/docs/accelerate/", category: "build" },
    { tool: "PyTorch Lightning", purpose: "Higher-level training framework — abstracts the loop, logging, callbacks; opinionated structure.", url: "https://lightning.ai/docs/pytorch/stable/", category: "build" },
    { tool: "timm", purpose: "PyTorch Image Models — largest collection of pretrained vision backbones (ResNet, ViT, ConvNeXt, EMA).", url: "https://huggingface.co/docs/timm/", category: "build" },
    { tool: "fastai", purpose: "High-level API on top of PyTorch for vision, tabular, text, collab — opinionated defaults.", url: "https://docs.fast.ai/", category: "build" },
    { tool: "DeepSpeed", purpose: "Microsoft's distributed training library — ZeRO stages 1-3, offload to CPU/NVMe.", url: "https://www.deepspeed.ai/", category: "build" },
    { tool: "Megatron-LM", purpose: "NVIDIA's reference implementation for tensor + pipeline parallel LLM training.", url: "https://github.com/NVIDIA/Megatron-LM", category: "build" },
    { tool: "torchrun / torch.distributed.elastic", purpose: "Built-in launcher for multi-node DDP/FSDP — handles restarts and rank reassignment.", url: "https://pytorch.org/docs/stable/elastic/run.html", category: "deploy" },
    { tool: "TorchServe", purpose: "Official model serving server — handles batching, versioning, and metrics.", url: "https://pytorch.org/serve/", category: "deploy" },
    { tool: "ExecuTorch", purpose: "On-device inference for ARM/Qualcomm/Apple Silicon — successor to PyTorch Mobile.", url: "https://pytorch.org/executorch/", category: "deploy" },
    { tool: "TorchDynamo + Inductor", purpose: "The torch.compile stack — Python bytecode tracing + Triton/C++ codegen.", url: "https://dev-discuss.pytorch.org/t/torchdynamo-an-experiment-in-dynamic-bytecode-transformation/361", category: "build" },
    { tool: "Triton (OpenAI)", purpose: "Python DSL for GPU kernels — what Inductor emits; lets you write fused ops.", url: "https://openai.com/research/triton", category: "build" },
    { tool: "ONNX Runtime", purpose: "Cross-framework inference engine — export via torch.onnx and serve on CPU/GPU/edge.", url: "https://onnxruntime.ai/", category: "deploy" },
    { tool: "Weights & Biases", purpose: "Experiment tracking, hyperparameter sweeps, artifact storage — integrates via 3 lines.", url: "https://wandb.ai/", category: "debug" },
    { tool: "torchmetrics", purpose: "Standardized metric objects (Accuracy, F1, BLEU) that sync across DDP ranks correctly.", url: "https://torchmetrics.readthedocs.io/", category: "test" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "0.1",  year: 2016, highlight: "First public release at FAIR — early alpha, autograd + Lua-inspired API." },
    { version: "0.4",  year: 2018, highlight: "Merged Variable and Tensor into one class; introduced .to(device)." },
    { version: "1.0",  year: 2018, highlight: "Stable release; C++2 backend, JIT (TorchScript), and removed variable name from API." },
    { version: "1.5",  year: 2020, highlight: "C++ frontend stable; expanded quantization; torchvision 0.6 with new model APIs." },
    { version: "1.6",  year: 2020, highlight: "torch.cuda.amp native automatic mixed precision; RPC framework for distributed." },
    { version: "1.7",  year: 2020, highlight: "Added complex tensors (complex64/128); NVIDIA AMPERE support; cu111." },
    { version: "1.8",  year: 2021, highlight: "FSDP initial; torch.fft module; major torch.distributed improvements." },
    { version: "1.9",  year: 2021, highlight: "nn.Transformer stable; torch.func (functorch) merged as experimental." },
    { version: "1.10", year: 2021, highlight: "CUDA 11.3; Expanded edge support; ONNX exporter overhauled." },
    { version: "1.11", year: 2022, highlight: "functorch in-tree; TorchDynamo preview; FSDP left beta." },
    { version: "1.12", year: 2022, highlight: "DTensor prototype; Apple MPS backend (Apple Silicon GPU); TorchRec for recsys." },
    { version: "1.13", year: 2022, highlight: "Native CUDA 11.7; torch.compile preview; beta torch.export path." },
    { version: "2.0",  year: 2023, highlight: "torch.compile (TorchDynamo + Inductor) GA — the headline 2.x feature." },
    { version: "2.1",  year: 2023, highlight: "torch.func stable (vmap, grad-of-grad); scaled_dot_product_attention broad rollout." },
    { version: "2.2",  year: 2024, highlight: "FlashAttention-2 in SDPA; Python 3.12 support; Inductor improvements." },
    { version: "2.3",  year: 2024, highlight: "Faster compiled multi-GPU; CPU compile improvements; TorchRL maturing." },
    { version: "2.4",  year: 2024, highlight: "torch.load defaults to weights_only=True (security); ONNX exporter via dynamo." },
    { version: "2.5",  year: 2024, highlight: "CuDNN 9; FlexAttention (block-sparse API); compiled transformer blocks in tree." },
    { version: "2.6",  year: 2025, highlight: "Inductor CPU codegen matures; broader GPU dtype support (fp8 on Hopper)." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Why does PyTorch accumulate gradients by default, and how does optimizer.zero_grad() fit in?", a: "Autograd sums into .grad on each backward() call, supporting gradient accumulation (large effective batch from small physical batches) and multi-loss heads. zero_grad clears .grad before the next step; forgetting it doubles, triples... gradients across iterations. Use zero_grad(set_to_none=True) — it's faster (None vs zero tensor) and lets the optimizer skip the update entirely for params with no grad.", difficulty: "easy" },
    { q: "What's the difference between torch.no_grad() and torch.inference_mode()?", a: "Both disable autograd, but inference_mode() (1.9+) skips the version counter bump and is faster. The catch: inference_mode tensors can't later be used in grad-enabled code without an explicit detach+clone. Use no_grad() if the same tensor might flow back into a training graph, inference_mode() for pure inference (validation, serving).", difficulty: "medium" },
    { q: "How does DDP all-reduce interact with backward()?", a: "DDP registers backward hooks on each parameter's grad. After local backward() completes, gradients are all-reduced across ranks (NCCL ring). To overlap, use model.no_sync() inside the context for all but the last micro-batch — only then does the all-reduce fire, so it overlaps with the next forward pass. This is essential for large models where all-reduce latency dominates.", difficulty: "hard" },
    { q: "When would you choose FSDP over DDP?", a: "DDP replicates the full model on every GPU — works until the model doesn't fit. FSDP shards params, grads, and optimizer state across ranks (ZeRO-3), so a 70B model trains on 8x80GB GPUs. FSDP's overhead is higher (more all-gather calls during forward/backward), so use DDP for models that fit and FSDP when they don't. Sharding strategy FULL_SHARD = ZeRO-3, SHARD_GRAD_OP = ZeRO-2.", difficulty: "medium" },
    { q: "Why use bfloat16 over float16 for mixed-precision training?", a: "bf16 has 8 exponent bits (same as fp32) and 7 mantissa bits; fp16 has 5 exponent + 10 mantissa. bf16's range matches fp32, so it almost never overflows/underflows and needs no GradScaler. fp16 has more precision but a narrow ±65504 range — gradients underflow below ~6e-8, requiring loss scaling. Use bf16 on Ampere+ (A100, H100); use fp16 on Volta/Turing (V100, T4) where bf16 hardware support is missing.", difficulty: "medium" },
    { q: "How does torch.compile work and when can it hurt?", a: "TorchDynamo hooks into Python's frame evaluation, traces forward() into a graph, then Inductor fuses ops and generates Triton/C++ kernels. Speedups come from kernel fusion (fewer GPU launches) and autotuning. It hurts when: the graph has data-dependent Python control flow (retraces constantly), inputs have changing shapes (recompiles), or you can't amortize the first-call compile cost over many iterations (e.g. short RL episodes).", difficulty: "hard" },
    { q: "What does requires_grad=False vs .detach() vs torch.no_grad() do?", a: "requires_grad=False on a leaf tensor makes autograd ignore it entirely (used for frozen embeddings, input data). .detach() returns a new tensor sharing storage but disconnected from the graph — useful for logging or feeding into non-ML code. torch.no_grad() is a context manager that disables grad tracking for everything inside it — saves memory and time during inference. They compose: inside no_grad(), even a requires_grad=True tensor won't build a graph.", difficulty: "medium" },
    { q: "How would you debug NaN losses?", a: "First, enable anomaly detection: with torch.autograd.detect_anomaly(): loss.backward() — it raises at the op that produced the NaN with a stack trace. Common causes: (1) fp16 overflow (switch to bf16 or use GradScaler), (2) log(0) (clamp inputs), (3) division by zero (add eps), (4) exploding gradients (clip_grad_norm_), (5) bad input data (assert finite at the top of forward). Hook every module with register_forward_hook to find the first NaN.", difficulty: "medium" },
    { q: "Explain gradient checkpointing and its tradeoff.", a: "torch.utils.checkpoint.checkpoint(layer, x) recomputes the forward during backward instead of storing activations. This trades ~30% more compute for a major activation memory reduction (e.g. ~sqrt(N) for an N-layer transformer instead of O(N)). Essential for long-context training where activation memory dominates. Use it on the per-layer granularity; checkpointing too coarsely loses the benefit, too finely adds recompute overhead.", difficulty: "hard" },
    { q: "What's the difference between state_dict and a JIT/scripted model for serialization?", a: "state_dict is just an OrderedDict of name->tensor — portable, framework-version-tolerant, but only weights (you need the original code to rebuild the model). TorchScript (torch.jit.trace/script) serializes the model graph + weights into a single .pt file loadable from C++ without Python — better for serving. For deployment prefer ONNX (cross-runtime) or ExecuTorch (mobile); for checkpoints use state_dict (+ safetensors for distribution).", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "TensorFlow", whenThis: "Research code, custom architectures, when you need to read/modify gradients inline, LLM/diffusion work where the ecosystem momentum is here.", whenThat: "Production serving at Google scale, TPU training, mobile/edge deployment (TFLite), or extending BERT/T5/Gemini internals." },
    { vs: "JAX", whenThis: "Iterative debugging with print/pdb, when the community (HuggingFace, timm) target matters more than pure functional purity, most NLP/CV research.", whenThat: "Massive SPMD model parallelism, when you want XLA + functional transforms (vmap, pmap, grad-of-grad) as first-class, JAX/Flax ecosystems." },
    { vs: "Keras", whenThis: "Custom training loops, gradient hacking, research where .fit() gets in the way, anything needing per-step control.", whenThat: "Rapid prototyping of standard architectures (CNNs, simple transformers), teaching, when the high-level .compile()/.fit() trinity covers 90% of your needs." },
    { vs: "scikit-learn", whenThis: "Deep learning (any architecture with layers), gradient-based optimization, GPU/TPU compute, anything larger than ~1M parameters.", whenThat: "Tabular data, baselines before deep learning, classical ML (RF, XGBoost-style), preprocessing pipelines, model selection with grid search." },
    { vs: "ONNX Runtime", whenThis: "Training, model development, debugging with Python, when you need autograd.", whenThat: "Pure inference on CPU/edge/embedded, cross-language serving (C#/Java/JS), when you want maximum inference throughput without Python in the path." },
  ],
};

export default sheet;
