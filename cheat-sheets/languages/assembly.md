# Assembly (x86-64 / ARM)

**Category:** Languages · **Tier:** Tier 3 · Specialized · **Tags:** low-level, compiled, isa, x86-64, arm64, systems, bare-metal · **First released:** 1947 · **Author:** Kathleen Booth (first symbolic assembler) · **Last updated:** 2026-11

> The textual form of the CPU's actual instructions — what every compiled program ultimately becomes.

---

## TL;DR

- Assembly is a 1:1 textual mapping of a CPU's instruction set architecture (ISA) — each mnemonic (`mov`, `add`, `blr`) corresponds to one machine instruction; an assembler turns it into bytes the CPU executes directly.
- Modern assembly work centers on x86-64 (servers, desktops, game consoles) and ARM64/AArch64 (every iPhone, Mac since 2020, every Android, AWS Graviton, Raspberry Pi); the two ISAs are very different but the workflow (ABI, registers, calling conventions) translates.
- Reach for assembly when writing bootloader/firmware, kernel entry stubs, JIT compilers, hot crypto/math primitives, exploit payloads, or reverse-engineering / malware analysis — and when a compiler's output is too slow or wrong.
- Avoid hand-written assembly for application logic: it's ISA-specific (so your code doesn't port), it's slower than the compiler on modern superscalar CPUs in 95% of cases, and there is zero safety net. Use intrinsics (`<immintrin.h>`) before raw asm.

## Core Mental Model

**Registers, memory, and the calling convention contract.** The CPU has a small fixed set of registers (x86-64: 16 GPRs including RAX-RDI+R8-R15; AArch64: 31 GPRs X0-X30) and a flat byte-addressable memory; instructions move data between them and compute. EVERYTHING you do is shuffling bits between these locations. The ABI (System V AMD64 for Linux/macOS, AAPCS64 for ARM) is the contract that lets separately-compiled functions call each other: which registers are arguments, which are caller-saved vs callee-saved, where the return value goes, how the stack is aligned (16 bytes before `call`). Get the ABI wrong and your function works in isolation but corrupts the caller or crashes on a specific compiler version.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| mov rax, 42 | Move immediate 42 into rax — the fundamental data-movement instruction. | Setting up constants; x86-64 uses `rax`/`rdi`/`rsi`/`rdx`/`rcx`/`r8`/`r9` for first six int args. |
| add rax, rbx | Arithmetic — rax += rbx, flags set (ZF, CF, OF, SF). | Integer math; x86-64 has two-operand form (dst op src). |
| mov rax, [rdi + 8*rcx + 16] | Memory load with scaled-index addressing — the C equivalent of `*(uint64_t*)(rdi + 8*rcx + 16)`. | Array indexing, struct field access. |
| call func | Push return address, jump to func — calls are not free (5-15 cycles depending on predictor). | Function calls; pair with `ret`. |
| ret | Pop return address from stack, jump — the function epilogue. | End of every function; mismatches with `call` corrupt the stack. |
| syscall | Trap to kernel — rax holds syscall number, args in rdi/rsi/rdx/r10/r8/r9 (System V). | Direct Linux/macOS kernel calls; bypasses libc. |
| je / jne / jl / jg label | Conditional jumps based on flags from a prior `cmp` or arithmetic. | All branching — there are no if-statements, only jumps. |
| lea rax, [rdi + rsi*8] | Load Effective Address — computes an address without touching memory; used as a fast multiply-add. | Pointer arithmetic AND as a 3-operand arithmetic op (faster than `add`+`imul`). |
| push rbp / mov rbp, rsp | Function prologue — save caller's frame pointer, set up new frame. | Standard prologue; omit `-Omit-Frame-Pointer` builds skip rbp. |
| vaddps zmm0, zmm1, zmm2 | AVX-512 — 16 floats added in parallel in one instruction. | Vectorized numerics; needs CPU feature check (`cpuid`). |
| ldr x0, [x1, #8] | ARM64 load — x0 = memory[x1 + 8]. Post-increment: `ldr x0, [x1], #8` advances x1. | AArch64 memory access; canonical load form. |
| bl func / ret | ARM64 call (`bl` = branch with link, saves return in X30) / return (`ret` jumps to X30). | AArch64 function call/return; pair with each other. |

## Idiomatic Patterns

**x86-64 leaf function — System V AMD64 ABI**

```assembly
; int sum(int *xs, size_t n) -> int
; Args: rdi = xs, rsi = n.  Return: eax.
; Leaf function: no calls, no stack frame needed.
sum:
    xor     eax, eax            ; eax = 0 (zero the accumulator)
    test    rsi, rsi
    jz      .done               ; if n == 0, return 0

    xor     rcx, rcx            ; rcx = index = 0
.loop:
    add     eax, [rdi + rcx*4]  ; eax += xs[rcx]  (4 bytes per int)
    inc     rcx
    cmp     rcx, rsi
    jb      .loop               ; while rcx < n
.done:
    ret                         ; eax is the return value
```

**x86-64 function with stack frame + callee-saved regs**

```assembly
; long factorial(long n)  -- recursive, uses rbx (callee-saved)
factorial:
    push    rbx                 ; save caller's rbx (ABI requirement)
    mov     rbx, rdi            ; rbx = n (rdi is caller-saved, can't keep it)
    cmp     rbx, 1
    jle     .base               ; n <= 1 -> 1
    ; recursive: n * factorial(n-1)
    lea     rdi, [rbx - 1]      ; arg = n - 1
    call    factorial
    imul    rax, rbx            ; rax = factorial(n-1) * n
    pop     rbx                 ; restore caller's rbx
    ret
.base:
    mov     rax, 1
    pop     rbx
    ret
```

**Direct Linux syscall — write(1, msg, len) without libc**

```assembly
; Linux x86-64, System V ABI.
; write(1, "Hello\n", 6) — syscall number 1, args: rdi fd, rsi buf, rdx len.
section .rodata
msg:    db      "Hello", 10
msglen  equ     $ - msg

section .text
    global _start
_start:
    mov     rax, 1              ; syscall: write
    mov     rdi, 1              ; fd = stdout
    lea     rsi, [rel msg]      ; buf = &msg (RIP-relative, PIE-safe)
    mov     rdx, msglen         ; count = 6
    syscall

    mov     rax, 60             ; syscall: exit
    xor     rdi, rdi            ; status = 0
    syscall                     ; never returns
```

**ARM64 vectorized loop — sum 8 floats per iteration**

```assembly
// AArch64 (AAPCS64): args x0 = float*, x1 = n.  Return: s0.
// Uses NEON: 128-bit q registers hold 4 floats; we unroll 2x for 8 floats.
sum_f32:
    movi    v0.4s, #0           // accumulator lane = 0
    movi    v1.4s, #0
    lsrs    x2, x1, #3          // n / 8 outer loop count
    cbz     x2, .Ltail          // if n < 8, scalar tail
.Lloop:
    ld1     {v2.4s, v3.4s}, [x0], #32   // load 8 floats, x0 += 32
    fadd    v0.4s, v0.4s, v2.4s
    fadd    v1.4s, v1.4s, v3.4s
    subs    x2, x2, #1
    b.ne    .Lloop
    fadd    v0.4s, v0.4s, v1.4s // horizontal across the two accumulators
.Ltail:
    // ... reduce 4 lanes in v0 to scalar s0, handle remainder ...
    ret
```

## Common Pitfalls

1. **Stack alignment on call (16-byte on x86-64 SysV)** — *Symptom:* Calling a function (or `syscall`) with RSP not 16-byte aligned crashes deep inside SSE code (`movaps` to a misaligned stack slot) — the bug surfaces far from its cause. *Fix:* The ABI guarantees RSP is 16-aligned at the `call` instruction boundary; `call` pushes 8 bytes, so inside the callee RSP is 16k+8. Either `push` an even number of registers or `sub rsp, 8` before another call. Use `_Alignof` and check with `assert((uintptr_t)rsp % 16 == 0)`.
2. **Forgetting to save callee-saved registers** — *Symptom:* Your function clobbers `rbx`/`rbp`/`r12`-`r15` (or `x19`-`x30` on ARM64) without saving — the caller's data is corrupted, crash hours later in unrelated code. *Fix:* Push callee-saved registers at function entry, pop them in reverse order at exit. Caller-saved (`rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8`-`r11`) are free to clobber. The ABI table is the law.
3. **Calling convention mismatch (cdecl/stdcall/fastcall/System V)** — *Symptom:* Code written for Linux's System V ABI (args in rdi, rsi, rdx) doesn't work on Windows x64 (args in rcx, rdx, r8, r9) and crashes immediately or returns wrong values. *Fix:* Look up the platform ABI before writing. Windows x64: RCX/RDX/R8/R9 for first four int args, 32-byte shadow space required. ARM64 AAPCS is consistent across OSes (mostly). macOS on Apple Silicon uses AAPCS with a few extras.
4. **Memory ordering and reordering on weakly-ordered ISAs** — *Symptom:* Hand-written asm with `str` + flag store on ARM64 reorders under the CPU; readers see the flag set before the data is visible. Works on x86 (TSO — total store order), fails on ARM. *Fix:* Use `dmb ish` (data memory barrier, inner-shareable) or `stlr`/`ldar` (acquire-release loads/stores) for synchronization. x86-TSO is permissive; ARM/POWER/RISC-V are weakly ordered. Use C11 `stdatomic` if you can — compiler picks the right fence.
5. **Self-modifying / JIT code without cache flush** — *Symptom:* You emit code at runtime and jump to it; on ARM64 the instruction cache still holds stale bytes — the CPU executes the old code, ignoring your writes. Works on x86 (snoops stores to code pages), fails on ARM. *Fix:* On ARM64: `dc cvau` (clean data cache to point of unification), `dsb ish`, `ic ivau` (invalidate I-cache), `dsb ish`, `isb`. On x86 you still need `__builtin___clear_cache` for portability but it's a near-no-op. Use `mprotect(PROT_READ|PROT_WRITE|PROT_EXEC)` carefully — W^X says never RWX.
6. **Red zone misuse (128 bytes below RSP)** — *Symptom:* Leaf functions on x86-64 SysV can use 128 bytes below RSP without adjusting RSP (the 'red zone'). A signal handler or interrupt overwrites that area — your locals are gone. *Fix:* Don't rely on the red zone if you might receive signals or call into code that does. Subtract RSP by 16+ before storing. Windows x64 has no red zone at all.
7. **Assuming flags are preserved across calls** — *Symptom:* You `cmp` then `call` something then `je` — the conditional jump reads flags clobbered by the callee, so it goes the wrong way silently. *Fix:* Flags are caller-saved in every ABI — never expect them to survive a `call`. Read the flag result into a register (`sete al`) before calling, or restructure so the comparison and jump are adjacent.

## Production / Interview Quick Reference

- x86-64 has 16 GPRs (RAX, RBX, RCX, RDX, RSI, RDI, RBP, RSP, R8-R15); ARM64 has 31 (X0-X30, XZR is hardwired zero). `complexity`
- System V AMD64 (Linux/macOS/BSD): int args in RDI, RSI, RDX, RCX, R8, R9; float args in XMM0-XMM7; return in RAX/RDX. Stack 16-aligned at call. `version`
- Windows x64: int args in RCX, RDX, R8, R9; float in XMM0-XMM3; 32-byte shadow space required; RAX-RCX,RDX,R8-R11,RAX caller-saved. `version`
- AAPCS64 (ARM64): X0-X7 first 8 args, X0 return; X9-X15 caller-saved, X19-X28 callee-saved, X29 frame pointer, X30 link register, SP aligned to 16. `version`
- A modern x86-64 instruction decoder handles ~4-6 instructions per cycle (μops); sustained IPC of 2-4 on typical code. Raw decode cost is rarely the bottleneck. `perf`
- Branch misprediction penalty: 15-20 cycles on x86-64 (Zen 4 / Golden Cove), 8-12 on ARM Cortex-A78. Make predictable branches; data-driven branch-free code wins big when input is random. `perf`
- L1 cache hit ~4 cycles, L2 ~12 cycles, L3 ~40 cycles, DRAM ~200-300 cycles. Cache-line = 64 bytes; aligned data + sequential access is the #1 perf lever. `perf`
- AVX-512 downclocks some Intel CPUs ( Skylake-X / Ice Lake) when 512-bit ops execute — the 'AVX-512 penalty' can be 10-15% slower overall even if the AVX-512 code is faster. `perf`
- x86 is strongly ordered (TSO); ARM64, RISC-V, POWER are weakly ordered. Portable concurrent code must use barriers / acquire-release loads (`ldar`/`stlr` on ARM). `gotcha`
- ASLR (PIE) requires RIP-relative addressing on x86-64 (`lea rax, [rel sym]`) and ADRP+ADD on ARM64 — absolute addressing will crash at runtime. `gotcha`
- Syscall numbers differ: Linux x86-64 write=1, exit=60. macOS x86-64 write=0x2000004, exit=0x2000001. Don't reuse raw numbers across OSes. `version`
- Single instruction latency vs throughput: most ALU ops are 1-cycle latency, 0.25-cycle throughput (4 ALU ports). Imul is 3-cycle; division is 20-40 cycles. `perf`
- Calling convention: leaf functions can skip the prologue entirely; non-leaf functions must align stack to 16 before any `call`. Use `-Omit-Frame-Pointer` to free up RBP as a GPR. `perf`
- Tools: nasm (Intel syntax) / gas AT&T (default on Linux) / clang-integrated assembler. Use `objdump -d` to disassemble, `perf` for profiling, Godbolt's Compiler Explorer for inspection. `style`
- Intel syntax (`mov rax, 42`) vs AT&T syntax (`movq $42, %rax`) — same instruction, opposite operand order. Choose one project-wide; both assemblers support both. `style`

## Go Deeper

- [Intel 64 and IA-32 Architectures Software Developer's Manual](https://www.intel.com/sdm) — The x86 ISA spec — every instruction, every flag, every encoding. Volume 2 is the instruction reference; bookmark it.
- [ARM Architecture Reference Manual (ARMv8)](https://developer.arm.com/documentation/ddi0487/latest) — The authoritative ARM64 (AArch64) ISA spec — DDI0487. The ARM Learning path on developer.arm.com is the gentler on-ramp.
- [System V Application Binary Interface — AMD64](https://refspecs.linuxbase.org/elf/x86_64-abi-0.99.pdf) — The calling convention, ELF format, and DWARF debug info spec for x86-64 on Linux/BSD/macOS.
- [Agner Fog's Software Optimization Manuals](https://www.agner.org/optimize/) — Free microarchitecture deep-dives — instruction throughput, μop fusion, branch prediction for every modern x86 core. The performance bible.
- [Compiler Explorer (Godbolt)](https://godbolt.org/) — Interactive — type C/C++/Rust, see the asm for every compiler/version/target. The single best tool for learning what your high-level code actually compiles to.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| byte (8-bit) | Smallest addressable unit. AL and AH are the low/high bytes of AX. Memory is byte-addressable. | Char data, small numerics, packed fields. Movzx / movsx for sign extension. |
| word (16-bit) | Two bytes — AX, BX, CX, DX. Legacy 16-bit ops (real mode). | Legacy x86 code, BIOS interrupts, small numerics in embedded. |
| dword (32-bit) | Four bytes — EAX, EBX, ECX, EDX. The int32 of C. | 32-bit integer math. Most C int operations on 32-bit OSes. |
| qword (64-bit) | Eight bytes — RAX, RBX, RCX, RDX. The int64 of C. | 64-bit math, pointers on 64-bit systems. The native register width on x86-64. |
| single (32-bit float) | IEEE 754 single — XMM registers, SS-suffixed ops (addss, mulss). | Float math, GPU-friendly precision. cvtss2sd to promote to double. |
| double (64-bit float) | IEEE 754 double — XMM registers, SD-suffixed ops (addsd, mulsd). | Default float in C/Fortran. 16 XMM regs on x86-64. |
| SIMD vectors | XMM (128-bit, 4 floats), YMM (256-bit, 8 floats), ZMM (512-bit, 16 floats). | Vectorization — AVX, AVX2, AVX-512. One instruction = N ops in parallel. |
| pointer / address | 64-bit value on x86-64, 64-bit on AArch64. Loaded with lea or mov from memory. | All pointer arithmetic. lea rax, [rsp+8] computes address without memory access. |
| flags / condition codes | RFLAGS register — ZF, CF, OF, SF, PF, AF. Set by cmp, test, arithmetic. | Conditional jumps read flags. je/jne/jl/jg branch based on ZF, CF, OF, SF. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| stack (memory via RSP) | LIFO scratch space — push/pop, call/ret use it. Local vars, callee-saved register saves. | Function prologues/epilogues, passing extra args (after first 6 in registers). |
| array (RIP-relative addressing) | mov rax, [arr + rcx*8] — array indexing via scaled-displacement addressing. | Arrays of 8-byte values. Scaling factor matches element size (1/2/4/8 bytes). |
| struct (offset addressing) | mov rax, [rdi + 16] — access field at offset 16 of struct pointed to by rdi. | All struct field access. Offsets are compile-time constants from C struct layout. |
| string (byte sequence) | Bytes terminated by 0 (C strings) or with explicit length (Pascal-style). | All text. mov al, [rsi] loads one byte; cmp byte [rsi], 0 tests for terminator. |
| linked list (pointer-chasing) | mov rdi, [rdi + 8] — follow next pointer at offset 8 of node pointed to by rdi. | Linked data structures. Pointer chasing is cache-hostile; prefer arrays. |
| bit vector / mask | Mask in a register or memory — test/jnz checks bits. SIMD masks in K registers (AVX-512). | Boolean arrays, packed flags. popcnt counts set bits. |
| lookup table | Precomputed values in .rodata; mov eax, [table + rcx*4] reads entry. | Replacing expensive computation with table lookup. Branch-free hot paths. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| struct via .struct (NASM) | Assembler-level struct — names for offsets, no runtime layout difference. | When working with C structs from asm. Mostly you compute offsets by hand. |
| section .data / .bss / .rodata / .text | Segments — .data for initialized globals, .bss for zero-init, .text for code, .rodata for constants. | Every program — globals go in .data/.bss, code in .text. |
| global _start / global main | Export a symbol as the entry point. _start for freestanding (no libc), main for libc-linked. | Entry point. ld looks for _start; libc calls main. |
| macro (NASM %macro) | Preprocessor macro — expands to a sequence of instructions. Multi-line, with params. | Reducing boilerplate (function prologues, save/restore patterns). The 'templates' of asm. |
| label / local label (.name) | Symbolic jump target. .name is local to the previous global label (NASM). | All branching. Loop bodies use local labels to avoid namespace pollution. |
| equ  (constant) | Compile-time constant — msglen equ $ - msg. Not stored in memory. | Computed constants (lengths, offsets). Substituted at assembly time. |
| extern / global | extern declares an external symbol (resolved by linker); global exports one. | Cross-file / library calls. printf, malloc, your own functions in other files. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| mov dst, src | Copy — dst and src must be same size. Cannot mov from memory to memory (use two movs). | All data movement. The most common instruction. |
| lea dst, [addr] | Load Effective Address — computes address, doesn't deref. dst = &memory. | Pointer arithmetic AND as a fast 3-operand arithmetic op (lea rax, [rdi + rsi*8 + 16]). |
| add dst, src | Add src to dst, store in dst. Sets flags (ZF, CF, OF, SF). | Integer addition. add rax, 1 is inc rax (slightly smaller encoding). |
| sub dst, src | Subtract src from dst, store in dst. Sets flags including CF (borrow). | Integer subtraction. cmp is sub that discards the result, only sets flags. |
| imul dst, src  (signed) | Signed multiply. Two-operand form: dst = dst * src (low 64 bits). | Integer multiplication. 3-operand form: imul rax, rdi, 8 (rax = rdi * 8). |
| div / idiv  (unsigned / signed) | Divide — RDX:RAX / src, quotient in RAX, remainder in RDX. Slow (20-40 cycles). | Integer division. Avoid in hot loops if possible (use shifts for powers of 2). |
| and / or / xor / not / test | Bitwise ops on registers/memory. test is and that discards result, only sets flags. | Bit manipulation. test rax, rax checks if zero (smaller than cmp). |
| shl / shr / sar / sal  (n, cl) | Bit shifts — shl/shr are logical, sar is arithmetic (sign-preserving). | Bit manipulation, multiply/divide by powers of 2. shl rax, 3 is rax * 8. |
| cmp a, b / je/jne/jl/jg/jle/jge | cmp computes a-b, sets flags. jCC jumps based on flag state. | All conditional branching. Use signed (jl/jg) or unsigned (jb/ja) variants appropriately. |
| test a, b / jz / jnz | test computes a&b, sets flags. jz (zero flag set) = je. | Bit testing, zero-checks. test rax, rax + jz is the canonical null check. |
| movzx / movsx | Move with zero/sign extension — for loading smaller values into bigger registers. | Loading bytes/words into 64-bit regs. movzx eax, byte [rdi] zero-extends; movsx sign-extends. |
| push / pop | Stack ops — push decrements RSP by 8 and stores; pop loads and increments RSP. | Saving/restoring callee-saved registers, passing extra args. 8-byte aligned. |
| call / ret | call pushes return address and jumps; ret pops return address and jumps back. | Function call/return. call is 5-15 cycles depending on branch predictor. |
| syscall | Trap to kernel — RAX holds syscall number, args in RDI/RSI/RDX/R10/R8/R9. | Direct kernel calls (write, read, exit, mmap). Bypasses libc. |
| lock cmpxchg [mem], reg | Atomic compare-and-swap — if [mem] == RAX then [mem] = reg, else RAX = [mem]. | Lock-free data structures, atomic ops. Lock prefix for multi-core visibility. |

## Input / Output

**Linux x86-64 syscalls — write(1, msg, len) without libc**

```assembly
; Linux x86-64, System V ABI. Pure syscall, no libc.
; write(1, "Hello\n", 6):
section .rodata
msg:    db      "Hello", 10              ; 10 = newline
msglen  equ     $ - msg                  ; computed at assembly time

section .text
    global _start
_start:
    mov     rax, 1                       ; syscall: write
    mov     rdi, 1                       ; fd = stdout
    lea     rsi, [rel msg]               ; buf = &msg (RIP-relative, PIE-safe)
    mov     rdx, msglen                  ; count = 6
    syscall                             ; rax = bytes written (or -errno)

    mov     rax, 60                      ; syscall: exit
    xor     rdi, rdi                     ; status = 0
    syscall                             ; never returns

; Build: nasm -f elf64 hello.asm && ld -o hello hello.o
```

**read(0, buf, n) + length-bounded buffer**

```assembly
; read up to 1024 bytes from stdin into a stack buffer.
section .text
    global _start
_start:
    sub     rsp, 1024                    ; reserve 1024-byte buffer
    mov     rax, 0                       ; syscall: read
    mov     rdi, 0                       ; fd = stdin
    mov     rsi, rsp                     ; buf = top of stack
    mov     rdx, 1024                    ; count
    syscall                             ; rax = bytes read (or -errno)
    test    rax, rax
    js      .error                       ; if negative, error

    mov     r12, rax                     ; save byte count in callee-saved r12

    ; Echo back: write(1, buf, n)
    mov     rax, 1                       ; syscall: write
    mov     rdi, 1                       ; fd = stdout
    mov     rsi, rsp                     ; buf
    mov     rdx, r12                     ; count
    syscall

    add     rsp, 1024                    ; restore stack
    mov     rax, 60                      ; exit
    xor     rdi, rdi
    syscall
.error:
    mov     rax, 60
    mov     rdi, 1                       ; exit code 1
    syscall
```

**File I/O via open/read/write syscalls**

```assembly
; open("data.txt", O_RDONLY) -> fd
; read(fd, buf, n) -> bytes
; close(fd)
%define O_RDONLY 0
%define SYS_open 2
%define SYS_read 0
%define SYS_close 3

section .rodata
path:   db      "data.txt", 0
bufsize equ     4096

section .bss
buf:    resb    bufsize                  ; 4KB buffer

section .text
    global _start
_start:
    mov     rax, SYS_open
    lea     rdi, [rel path]
    mov     rsi, O_RDONLY
    xor     rdx, rdx                     ; mode (irrelevant for O_RDONLY)
    syscall
    test    rax, rax
    js      .err                         ; negative = error
    mov     r13, rax                     ; save fd

    mov     rax, SYS_read
    mov     rdi, r13
    lea     rsi, [rel buf]
    mov     rdx, bufsize
    syscall                             ; rax = bytes read
    mov     r12, rax                     ; save count

    ; process buf[0..r12) here ...

    mov     rax, SYS_close
    mov     rdi, r13
    syscall

    mov     rax, 60
    xor     rdi, rdi
    syscall
.err:
    mov     rax, 60
    mov     rdi, 1
    syscall
```

**Calling libc printf (vs raw syscall)**

```assembly
; Linking with libc gives you printf, malloc, etc.
; Compile: nasm -f elf64 demo.asm && gcc -no-pie -o demo demo.o

section .rodata
fmt:    db      "count=%d, rate=%.3f", 10, 0
msg:    db      "hello", 0

section .text
    extern  printf
    global  main
main:
    push    rbp                          ; prologue
    mov     rbp, rsp
    sub     rsp, 16                      ; shadow space + alignment

    ; printf(fmt, 42, 3.14)
    ; SysV AMD64 ABI: rdi=fmt, rsi=int, xmm0=float
    lea     rdi, [rel fmt]
    mov     rsi, 42
    movsd   xmm0, [rel three]           ; load double constant
    mov     rax, 1                       ; varargs: # of XMM regs used
    call    printf

    xor     rax, rax                     ; return 0
    add     rsp, 16
    pop     rbp
    ret

section .rodata
three:  dq      3.14                     ; double constant
```

## Loops & Iteration

**Counted loop with loop instruction (and its flaws)**

```assembly
; loop instruction: dec rcx, jnz to label.
; Compact (2 bytes) but SLOW on modern CPUs — branch predictor hates it.
; Prefer explicit dec/jnz.

    mov     rcx, 100
.loop:
    ; body uses rcx as iteration counter
    add     rax, [rdi + rcx*8 - 8]      ; -8 because rcx is 1-based
    dec     rcx
    jnz     .loop

; Equivalent with 'loop' (DON'T USE in hot code):
;   mov rcx, 100
; .loop:
;   ...
;   loop .loop    ; dec rcx; jnz .loop
```

**Two-loop nested iteration with array indexing**

```assembly
; Sum all elements of an NxM matrix (column-major for cache).
; rdi = matrix pointer, rsi = N, rdx = M
; Returns sum in rax.

sum_matrix:
    xor     rax, rax                     ; sum = 0
    xor     rcx, rcx                     ; i = 0 (column index, outer)
.outer:
    cmp     rcx, rdx
    jge     .done
    xor     r8, r8                       ; j = 0 (row index, inner)
.inner:
    cmp     r8, rsi
    jge     .next_col
    ; A[j][i] = memory[base + (j*M + i)*8]
    mov     r9, r8
    imul    r9, rdx
    add     r9, rcx
    add     rax, [rdi + r9*8]
    inc     r8
    jmp     .inner
.next_col:
    inc     rcx
    jmp     .outer
.done:
    ret
```

**SIMD vectorized loop — 4 doubles per iteration**

```assembly
; Sum an array of N doubles, 4 at a time via SSE2.
; rdi = array, rsi = N (multiple of 4 for clarity). Returns in xmm0.

sum_f64x4:
    xorps   xmm0, xmm0                  ; accumulator = 0
    mov     rcx, rsi
    shr     rcx, 2                       ; n / 4
    test    rcx, rcx
    jz      .tail
.loop:
    addpd   xmm0, [rdi]                  ; add 2 doubles
    addpd   xmm0, [rdi + 16]             ; add 2 more
    add     rdi, 32                      ; advance pointer
    dec     rcx
    jnz     .loop
.tail:
    ; horizontal sum of xmm0 (low + high)
    haddpd  xmm0, xmm0                   ; xmm0[0] = xmm0[0] + xmm0[1]
    ; handle remainder (not shown) ...
    ret
```

**Loop unrolling + branch reduction**

```assembly
; Unrolling 4x reduces loop overhead (dec/jnz) by 4x.
; Often done by the compiler; sometimes manually for boundary control.

; Original:
;   .loop:
;     add rax, [rdi]
;     add rdi, 8
;     dec rcx
;     jnz .loop

; Unrolled 4x:
    mov     rcx, rsi
    shr     rcx, 2                       ; n / 4
.loop:
    add     rax, [rdi]
    add     rax, [rdi + 8]
    add     rax, [rdi + 16]
    add     rax, [rdi + 24]
    add     rdi, 32
    dec     rcx
    jnz     .loop
    ; handle remainder (n mod 4) separately

; AVX-512 with 4 ops fused into one (vaddpd zmm) is even better.
```

## Functions & Callables

**Leaf function — no stack frame needed**

```assembly
; int sum(int *xs, size_t n) -> int
; System V AMD64: rdi = xs, rsi = n. Return in eax.
; Leaf = no calls; can use red zone, no prologue needed.
sum:
    xor     eax, eax                     ; sum = 0
    test    rsi, rsi
    jz      .done
    xor     rcx, rcx
.loop:
    add     eax, [rdi + rcx*4]           ; 4 bytes per int
    inc     rcx
    cmp     rcx, rsi
    jb      .loop
.done:
    ret                                 ; eax holds return value

; 'ret' pops 8 bytes (return addr) from stack and jumps.
; Stack must be balanced — push/pop paired, sub/add rsp paired.
```

**Non-leaf function with callee-saved register preservation**

```assembly
; long factorial(long n)  -- recursive, uses rbx (callee-saved)
; System V: rdi = n. Return in rax.
factorial:
    push    rbx                          ; save caller's rbx
    mov     rbx, rdi                     ; rbx = n (rbx survives call)
    cmp     rbx, 1
    jle     .base
    lea     rdi, [rbx - 1]
    call    factorial                    ; rax = factorial(n-1)
    imul    rax, rbx                     ; rax = factorial(n-1) * n
    pop     rbx                          ; restore caller's rbx
    ret
.base:
    mov     rax, 1
    pop     rbx
    ret

; Push/pop MUST be paired: every push in prologue has a matching pop
; in epilogue, including for every return path.
```

**Variadic-style call + stack alignment**

```assembly
; Calling printf (variadic) — System V AMD64 ABI.
; - First 6 int args in rdi/rsi/rdx/rcx/r8/r9, rest on stack.
; - First 8 float args in xmm0-xmm7.
; - AL = number of XMM registers used (varargs only).
; - Stack MUST be 16-byte aligned at call (so sub rsp, 8 if odd pushes).

    push    rbp                          ; pushes 8 -> rsp % 16 == 8 now
    mov     rbp, rsp
    sub     rsp, 16                      ; align to 16 + shadow space

    lea     rdi, [rel fmt]               ; arg 1: format string
    mov     rsi, 42                      ; arg 2: int
    movsd   xmm0, [rel pi]              ; arg 3: double (goes in xmm0)
    mov     rax, 1                       ; AL = 1 XMM reg used
    call    printf

    add     rsp, 16                      ; restore stack
    pop     rbp
    ret
```

**Function pointer / vtable dispatch**

```assembly
; Indirect call through a function pointer in rax.
; Common in C++ vtables, callbacks, jump tables.

    call    rax                          ; indirect call: (*fp)()
    ; or: call [rdi]                     ; call function at address stored in [rdi]

; C++ vtable dispatch:
;   obj->method() -> (*obj->vptr->method)(obj)
;   mov rax, [rdi]                      ; rax = vtable ptr
;   mov rax, [rax + METHOD_OFFSET]      ; rax = method ptr
;   call rax                            ; (rdi already has 'this')

; Jump table (switch with many cases):
    lea     rax, [rel .table]
    mov     rcx, [rax + rdi*8]           ; load target address
    jmp     rcx                          ; tail-call

.table:
    dq      .case0, .case1, .case2, .case3
```

## Error Handling

**Return-value convention (C-style)**

```assembly
; C convention: return 0/-1 (or -errno on Linux syscalls), set errno.
; Caller checks return value, branches accordingly.

open_file:
    mov     rax, 2                       ; SYS_open
    lea     rdi, [rel path]
    mov     rsi, 0                       ; O_RDONLY
    syscall
    test    rax, rax                     ; rax = fd (>= 0) or -errno
    js      .err
    ; success: rax = fd
    ret
.err:
    ; rax holds -errno (e.g., -2 = ENOENT)
    ; Negate to get errno, store somewhere:
    neg     rax
    mov     [rel errno], rax
    mov     rax, -1
    ret

; Caller:
;   call open_file
;   cmp rax, -1
;   je  handle_error
```

**setjmp/longjmp — non-local goto**

```assembly
; setjmp saves registers + return address to a buffer.
; longjmp restores them and 'returns' from setjmp with a non-zero value.
; This is C's exception mechanism (used by coroutine libs, error recovery).

; setjmp(buf) returns 0 first call, val when longjmped to.
    lea     rdi, [rel jmpbuf]
    call    setjmp                       ; returns 0 or val
    test    eax, eax
    jnz     .after_longjmp               ; non-zero = we got here via longjmp

    ; do risky work that might call longjmp ...
    call    risky_fn

.after_longjmp:
    ; continue here whether via normal return or longjmp
    ; ...

; risky_fn:
;   lea rdi, [rel jmpbuf]
;   mov rsi, 1                       ; val to return from setjmp
;   call longjmp                     ; never returns
```

**Signal handler — async error recovery**

```assembly
; Signal handlers run asynchronously on signal delivery.
; SIGSEGV (segfault), SIGFPE (div by zero), SIGBUS (misaligned access).
; Restricted: only async-signal-safe libc functions callable from handler.

; Setup (Linux):
;   struct sigaction sa = { .sa_handler = handler, .sa_flags = SA_RESTART };
;   sigaction(SIGSEGV, &sa, NULL);

; Handler (must be a void(int) function):
handler:
    ; rdi = signal number
    ; Save ALL caller-saved registers we touch — handler interrupts arbitrary code.
    push    rax
    push    rcx
    push    rdx
    push    rsi
    push    rdi
    push    r8
    push    r9
    push    r10
    push    r11

    ; ... write error message, setjmp for recovery, or exit ...

    pop     r11
    pop     r10
    pop     r9
    pop     r8
    pop     rdi
    pop     rsi
    pop     rdx
    pop     rcx
    pop     rax
    ret                                 ; returns to interrupted code
```

**Hardware exceptions via interrupt / fault handlers**

```assembly
; CPU faults: divide by zero (#DE), invalid opcode (#UD),
; page fault (#PF), general protection (#GP), stack fault (#SS).
; The CPU transfers control to an IDT entry (interrupt descriptor table).

; OS kernel sets up IDT; for user-space these become signals (SIGSEGV etc).
; Bare-metal: you write the IDT handler in asm.

; Example IDT entry setup (kernel side):
;   mov rax, handler_addr
;   mov [idt + 8*n], ax         ; low 16 bits of handler
;   mov [idt + 8*n + 6], rax >> 16   ; high bits
;   mov word [idt + 8*n + 2], 0x08   ; CS selector
;   mov word [idt + 8*n + 4], 0x8E00 ; present | interrupt gate

; Handler receives saved register state on stack (iret to return).
; Must save/restore EVERYTHING you touch — CPU was mid-instruction.

div_by_zero_handler:
    push    rax
    ; ... handle error (typically kill the process) ...
    pop     rax
    iret                                ; return from interrupt
```

## Concurrency Model

**Threads via clone() syscall (Linux)**

```assembly
; Linux clone() creates a new thread or process.
; clone(flags, stack, ptid, ctid, tls) via syscall number 56.

; CLONE_VM (0x100) = share memory (thread), CLONE_FS (0x200) = share cwd
%define CLONE_VM 0x100
%define CLONE_FS 0x200
%define CLONE_FILES 0x400
%define CLONE_SIGHAND 0x800
%define CLONE_THREAD 0x10000

    ; Allocate child stack (typically mmap)
    mov     rax, 9                       ; SYS_mmap
    xor     rdi, rdi                     ; addr = NULL
    mov     rsi, 65536                   ; len = 64KB
    mov     rdx, 3                       ; prot = READ|WRITE
    mov     r10, 0x22                    ; flags = PRIVATE|ANONYMOUS
    xor     r8, r8                       ; fd = -1
    xor     r9, r9                       ; offset = 0
    syscall
    mov     r12, rax                     ; save stack top

    ; clone(CLONE_VM | CLONE_FS | ..., stack_top, ...)
    mov     rax, 56                      ; SYS_clone
    mov     rdi, CLONE_VM | CLONE_FS | CLONE_FILES | CLONE_SIGHAND | CLONE_THREAD
    mov     rsi, r12                     ; child_stack
    xor     rdx, rdx                     ; ptid
    xor     r10, r10                     ; ctid
    xor     r8, r8                       ; tls
    syscall
    test    rax, rax
    js      .err
    jz      .child                       ; rax = 0 in child
    ; parent: rax = child TID
    ; ... wait via futex or join ...
    ret
.child:
    ; child thread starts here
    call    thread_main
    mov     rax, 60                      ; exit
    xor     rdi, rdi
    syscall
.err:
    ; handle error
```

**Atomic compare-and-swap — lock-free primitive**

```assembly
; lock cmpxchg [mem], reg
; Atomically: if RAX == [mem] then [mem] = reg else RAX = [mem]
; ZF set if swap happened.

; Spin-lock implementation:
;   acquire: lock cmpxchg [lock], 1 ; if 0 -> 1, ZF=1; else RAX=1, ZF=0
;   release: mov [lock], 0

acquire_lock:
    mov     eax, 1                       ; want to store 1
    xor     edx, edx                    ; expected: 0
.spin:
    lock cmpxchg [rdi], dl              ; if [rdi] == al (1==dl? no, al=1, dl=0)
    ; ^ BUG: cmpxchg uses EAX as expected, not EDX. Let me redo:
    mov     eax, 0                       ; expected: 0 (unlocked)
    mov     ecx, 1                       ; desired: 1 (locked)
    lock cmpxchg [rdi], cl              ; if [rdi] == eax (0) then [rdi] = cl (1)
    jz      .acquired                    ; ZF=1 means we got it
    pause                               ; hint to CPU (perf on hyperthreaded)
    jmp     .spin
.acquired:
    ret

release_lock:
    mov     byte [rdi], 0
    ret

; 'pause' is a hint to the CPU that we're in a spin loop — saves power
; and improves hyperthreading efficiency.
```

**Memory barriers — x86 TSO vs ARM weak ordering**

```assembly
; x86-64 is TSO (Total Store Order) — most ops are acquire/release by default.
; Stores are visible in program order; loads don't reorder with stores.
; Only non-TSO ops: NT stores (movnti), some SSE/AVX. Use mfence for those.

; Release store (x86 — store is already release):
    mov     [rdi], rax                  ; release store (visible in order)

; Acquire load (x86 — load is already acquire):
    mov     rax, [rsi]                  ; acquire load

; Full fence (rare on x86, common on ARM):
    mfence                              ; full memory barrier

; AArch64 (weakly ordered) — explicit barriers required:
;   str x0, [x1]         ; store can reorder with following str
;   dmb ish              ; data memory barrier, inner-shareable
;   str x2, [x3]         ; this store waits for previous stores
;
; Or use acquire-release load/store forms:
;   stlr x0, [x1]        ; store-release
;   ldar x2, [x3]        ; load-acquire
```

**Futex — fast user-space mutex (Linux)**

```assembly
; Futex = 'fast user-space mutex'. Common case: spin in user space via cmpxchg.
; Slow case: syscall to kernel to sleep/wake.

; Try to acquire (user space):
;   cmpxchg [futex], 0 -> 1   (try to lock)
;   if success, done
;   if fail, syscall to wait

; Wake (user space):
;   mov [futex], 0              (release)
;   syscall FUTEX_WAKE, 1       (wake one waiter)

%define SYS_futex 202
%define FUTEX_WAIT 0
%define FUTEX_WAKE 1

futex_wait:
    ; rdi = futex addr, rsi = expected value
    mov     rax, SYS_futex
    mov     rdx, rsi                    ; expected
    xor     r10, r10                    ; timeout = NULL
    syscall                             ; sleeps if *rdi == rdx
    ret

futex_wake:
    ; rdi = futex addr, wake one waiter
    mov     rax, SYS_futex
    mov     rsi, FUTEX_WAKE
    mov     rdx, 1                      ; wake 1
    syscall
    ret
```

## Testing Patterns

**C harness — test asm via C test framework**

```assembly
// test_sum.c — link against asm via C test framework (e.g., Unity, Check)
#include <assert.h>
#include <stddef.h>

// Declaration of asm function (System V AMD64 calling convention):
extern int sum(const int *xs, size_t n);

int main(void) {
    int xs[] = {1, 2, 3, 4, 5};
    assert(sum(xs, 5) == 15);
    assert(sum(xs, 0) == 0);
    assert(sum(NULL, 0) == 0);   // ensure no deref on empty
    return 0;
}

// Build:
//   nasm -f elf64 sum.asm -o sum.o
//   gcc -o test_sum test_sum.c sum.o
//   ./test_sum  # exits 0 on success, non-zero on assert fail
```

**GDB scripting — automated asm assertions**

```assembly
# GDB script (test.gdb) — load binary, set breakpoints, check state.
file ./myprog

# Break at function entry:
break sum

# Run with args:
run

# When breakpoint hits, check registers:
printf "rdi = %p, rsi = %zu\n", $rdi, $rsi

# Step one instruction:
stepi

# Check rax after loop:
# (would set breakpoint at the ret instruction and check rax)

# Use Python extension for assertions:
python
import gdb
gdb.execute("break sum")
gdb.execute("run")
assert int(gdb.parse_and_eval("$rsi")) == 5
end

quit
```

**EUnit / standalone test assembly**

```assembly
; Self-contained test: call function, check result, exit code reflects pass/fail.
section .rodata
ok_msg:    db      "PASS", 10
ok_len     equ     $ - ok_msg
fail_msg:  db      "FAIL", 10
fail_len   equ     $ - fail_msg

section .text
    global _start
    extern  sum                ; the function under test

_start:
    ; Setup test input: array of {1, 2, 3, 4, 5}
    sub     rsp, 40
    mov     qword [rsp],     1
    mov     qword [rsp+8],   2
    mov     qword [rsp+16],  3
    mov     qword [rsp+24],  4
    mov     qword [rsp+32],  5

    mov     rdi, rsp                     ; xs
    mov     rsi, 5                       ; n
    call    sum                          ; rax = 15

    cmp     rax, 15
    jne     .fail

    ; PASS:
    mov     rax, 1                       ; write
    mov     rdi, 1
    lea     rsi, [rel ok_msg]
    mov     rdx, ok_len
    syscall
    mov     rax, 60
    xor     rdi, rdi
    syscall
.fail:
    mov     rax, 1
    mov     rdi, 1
    lea     rsi, [rel fail_msg]
    mov     rdx, fail_len
    syscall
    mov     rax, 60
    mov     rdi, 1
    syscall
```

**Fuzzing via AFL / libFuzzer harness**

```assembly
// fuzz_sum.c — libFuzzer harness for the asm 'sum' function.
#include <stdint.h>
#include <stddef.h>

extern int sum(const int *xs, size_t n);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    // Treat input as an array of ints (size must be multiple of 4)
    if (size < 4 || size % 4 != 0) return 0;

    const int *xs = (const int *)data;
    size_t n = size / 4;

    // Call the asm function — if it crashes, libFuzzer reports the input.
    int result = sum(xs, n);

    // Optional: check invariants (e.g., result is bounded).
    (void)result;
    return 0;
}

// Build with sanitizers:
//   nasm -f elf64 sum.asm -o sum.o
//   clang -g -O1 -fsanitize=fuzzer,address \
//         fuzz_sum.c sum.o -o fuzz_sum
//   ./fuzz_sum  # runs forever, finds crashes
```

## Performance Tuning

- L1 cache hit ~4 cycles, L2 ~12 cycles, L3 ~40 cycles, DRAM ~200-300 cycles. Cache line = 64 bytes; aligned sequential access is the #1 perf lever.
- Branch misprediction: 15-20 cycles on x86-64 (Zen 4 / Golden Cove), 8-12 on ARM Cortex-A78. Predictable branches are nearly free.
- ALU ops (add, sub, and, or, xor): 1-cycle latency, 0.25-cycle throughput (4 ALU ports). imul: 3-cycle latency. div: 20-40 cycles.
- Memory load: 4-5 cycles from L1, ~14 from L2. Software-prefetch (prefetcht0) helps for known access patterns.
- AVX-512 downclocks some Intel CPUs (Skylake-X / Ice Lake) — the 'AVX-512 penalty' can be 10-15% slower overall even if AVX-512 code is faster.
- Function call cost: 5-15 cycles depending on branch predictor. Inline small hot functions; let the compiler decide.
- SIMD: 16 floats per instruction with AVX-512 (vs 4 with SSE). Vectorization can give 4-16x speedup on data-parallel loops.
- Loop unrolling: reduces loop overhead (dec/jnz = 2 ops/iter), but increases code size. Compiler auto-unrolls with -O3.
- lea as 3-operand arithmetic: 'lea rax, [rdi + rsi*8 + 16]' is faster than 'mov rax, rsi; shl rax, 3; add rax, rdi; add rax, 16'.
- xchg rax, rax is a 2-byte NOP on x86 — used for code alignment / padding. Modern x86 has multi-byte NOPs (0F 1F /0).
- Macro-op fusion: cmp + jCC fuse into one μop on modern x86. Always keep them adjacent — splitting them costs throughput.
- x86-TSO means most loads/stores are acquire/release by default. ARM needs explicit dmb ish / ldar / stlr for the same semantics.
- Profile with perf (Linux), Instruments (macOS), or VTune (Intel). perf record -F 999 -g -- ./binary samples at 999Hz.
- Alignment matters: movaps to misaligned address faults (SIGSEGV). movups is safe but slower on old CPUs. Modern CPUs: ~same speed.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [NASM](https://www.nasm.us/) | Netwide Assembler — Intel syntax, cross-platform, popular for hand-written asm. | build |
| [GAS (GNU as)](https://sourceware.org/binutils/docs/as/) | GNU Assembler — AT&T syntax by default (Intel syntax via .intel_syntax), bundled with GCC/binutils. | build |
| [Clang integrated assembler](https://clang.llvm.org/docs/) | LLVM's assembler — integrated with clang, supports both Intel and AT&T syntax. | build |
| [MASM](https://learn.microsoft.com/en-us/cpp/assembler/masm/) | Microsoft Macro Assembler — Windows-only, Intel syntax. The classic x86 DOS/Windows assembler. | build |
| [JWASM / UASM](https://github.com/JWasm/JWasm) | Open-source MASM-compatible assemblers — for cross-platform MASM-style code. | build |
| [GDB](https://www.gnu.org/software/gdb/) | GNU Debugger — stepi (single instruction), info registers, disas. The standard asm debugger. | debug |
| [LLDB](https://lldb.llvm.org/) | LLVM debugger — default on macOS. Similar commands to GDB. | debug |
| [objdump](https://sourceware.org/binutils/docs/binutils/objdump.html) | Disassembler — objdump -d binary shows asm with addresses. -M intel for Intel syntax. | debug |
| [Compiler Explorer (Godbolt)](https://godbolt.org/) | Interactive — type C/C++/Rust, see the asm for every compiler/version/target. Indispensable for learning. | debug |
| [perf (Linux)](https://perf.wiki.kernel.org/) | Sampling profiler — perf record/report. Hardware counters, branch prediction, cache misses. | debug |
| [Intel VTune Profiler](https://www.intel.com/content/www/us/en/developer/tools/oneapi/vtune-profiler.html) | Intel's profiler — microarchitectural analysis, cache stats, branch prediction. Free for non-commercial. | debug |
| [Instruments (macOS)](https://developer.apple.com/xcode/features/) | Apple's profiler — Time Profiler, Allocations, System Trace. Bundled with Xcode. | debug |
| [Ghidra / IDA Pro](https://ghidra-sre.org/) | Reverse engineering — disassembly + decompilation. Ghidra is free; IDA Pro is the commercial standard. | debug |
| [Radare2 / Cutter](https://www.radare.org/) | Open-source reverse engineering framework. Cutter is the GUI. For binary analysis. | debug |
| [AFL / libFuzzer](https://llvm.org/docs/LibFuzzer.html) | Fuzz testing — feed random inputs to find crashes. libFuzzer is in-process; AFL forks. | test |
| [Intel SDM / ARM ARM](https://www.intel.com/sdm) | The ISA reference manuals — Intel Software Developer's Manual, ARM Architecture Reference Manual. The authoritative specs. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| x86 (8086) | 1978 | Intel 8086 — 16-bit ISA, the foundation. 1MB address space, real mode. |
| 80386 (i386) | 1985 | 32-bit protected mode, paging, 4GB address space. The 'i386 ABI' still used in 32-bit Linux. |
| Pentium (P5) | 1993 | Superscalar — two pipelines (U, V). 64-bit data bus. The 'Pentium bug' FDIV erratum. |
| Pentium Pro (P6) | 1995 | Out-of-order execution, μop translation, register renaming. Foundation for Intel uarch for 20 years. |
| SSE (Pentium III) | 1999 | Streaming SIMD Extensions — 128-bit XMM registers, 4 floats per op. Single-precision vectorization. |
| x86-64 (AMD64) | 2003 | AMD extends x86 to 64-bit; Intel adopts as EM64T. 16 GPRs, RIP-relative addressing, larger addresses. |
| SSE2 | 2004 | Double-precision SIMD, integer SIMD in XMM. Foundation for all modern x86 vectorization baseline. |
| AVX (Sandy Bridge) | 2011 | Advanced Vector Extensions — 256-bit YMM registers, 8 floats per op. Three-operand syntax (no more mov-destructive). |
| AVX2 (Haswell) | 2013 | AVX for integers, gather instructions. FMA (fused multiply-add) — better float precision + perf. |
| AVX-512 (Skylake-X) | 2017 | 512-bit ZMM registers, 16 floats per op. Mask registers (k0-k7). Downclocks some Intel CPUs. |
| ARM64 (AArch64) | 2011 | ARMv8-A — 64-bit, 31 GPRs, clean RISC design. Apple Silicon (M1, 2020) drives mainstream adoption. |
| ARM SVE | 2016 | Scalable Vector Extension — vector length agnostic (128-2048 bits). Used in HPC (Fugaku supercomputer). |
| RISC-V | 2010 | Open ISA — base RV32I/RV64I + extensions (M, A, F, D, V). Gaining ground in embedded and custom silicon. |
| x86 APX | 2023 | Intel's Advanced Performance Extensions — 16 new GPRs (r16-r31), 3-operand instructions. Modernizes x86. |
| RISC-V RVA23 | 2024 | RVA23 profile standardizes the SoC baseline (Vector 1.0 mandatory) — the reference target for portable RISC-V software through this decade. |

## Interview Hot Questions

1. **Explain the System V AMD64 calling convention.** *(medium)*

   First 6 integer/pointer args in RDI, RSI, RDX, RCX, R8, R9. First 8 float args in XMM0-XMM7. Return in RAX (and RDX for 128-bit). Stack is 16-byte aligned at the call instruction (so 16k+8 inside callee). RBP, RBX, R12-R15 are callee-saved (you must preserve them); RAX, RCX, RDX, RSI, RDI, R8-R11 are caller-saved. AL holds the number of XMM registers used for variadic functions. Variadic args beyond reg capacity go on the stack.

2. **What's the difference between x86-TSO and ARM's weak memory model?** *(hard)*

   x86 is Total Store Order — stores are visible in program order, loads don't reorder with earlier stores. Most ops are acquire/release by default, so 'simple' concurrent code just works. ARM (and RISC-V, POWER) are weakly ordered — loads and stores can reorder freely unless you use barriers (dmb ish) or acquire/release forms (ldar/stlr). Code that works on x86 can fail on ARM because reordering exposes races. C11 stdatomic handles this for you — never write raw asm with shared memory without barriers.

3. **Why is the stack 16-byte aligned, and what breaks if it isn't?** *(medium)*

   Modern x86 CPUs require 16-byte alignment for SSE/AVX instructions that operate on stack-resided data (movaps). The ABI guarantees RSP is 16-aligned at the call boundary; 'call' pushes 8 bytes (return address), so inside the callee RSP is 16k+8. Functions need to push an even number of registers OR sub rsp, 8 to realign before calling another function. Misalignment causes SIGSEGV deep inside library code (e.g., printf using SSE) — far from the cause.

4. **How does cmpxchg implement a spinlock, and why use 'pause'?** *(medium)*

   lock cmpxchg [mem], reg atomically: if RAX == [mem], store reg to [mem] and set ZF; else load [mem] into RAX and clear ZF. To acquire: spin trying cmpxchg [lock], 1 with RAX=0 (expected unlocked). 'pause' (rep nop on x86) is a hint that you're in a spin loop — it saves power, reduces pipeline contention on hyperthreaded cores, and improves the other thread's throughput. On ARM the equivalent is 'yield'.

5. **Explain macro-op fusion and why it matters for performance.** *(medium)*

   Modern x86 decoders fuse certain instruction pairs into one μop. The most common: cmp/jCC (e.g., cmp rax, 5; je label) becomes one μop. This means a comparison-and-branch is one op in the pipeline, not two — significant throughput gain. To benefit, keep cmp and jCC adjacent; inserting an instruction between them prevents fusion. Compilers know this; if you write asm by hand, keep them together.

6. **What's the red zone, and when can you use it?** *(medium)*

   The red zone is 128 bytes below RSP on x86-64 SysV ABI. Leaf functions can use it for local storage WITHOUT adjusting RSP — saves the sub/add instructions. Windows x64 has no red zone. Don't use the red zone if you might receive a signal — signal handlers clobber it. Don't use it in non-leaf functions (a called function would use RSP-relative addressing that overlaps your red-zone data).

7. **How does function inlining at the asm level work, and when is it bad?** *(medium)*

   Inlining replaces a 'call func; ret' with the function's body. Saves: call/ret overhead (5-15 cycles), argument setup, register save/restore. Costs: code size growth (icache pressure), potential register pressure increase. Compilers inline based on heuristics (function size, call frequency, hotness profile). Hand-inlining in asm is rare — you typically write the inline version directly and let the assembler emit it. Inlining large functions into loops is the most common mistake.

8. **How would you optimize a hot loop in assembly?** *(hard)*

   Step 1: Profile (perf record) to confirm it's actually hot. Step 2: Look at the loop — is it vectorizable? Add SIMD (SSE/AVX) to process 4-16 elements per iteration. Step 3: Unroll 4-8x to reduce loop overhead. Step 4: Check memory access patterns — sequential? If not, transpose / restructure data. Step 5: Eliminate dependencies — independent accumulators (multiple partial sums) break dependency chains. Step 6: Avoid branches (use cmov or arithmetic). Step 7: Check alignment (32-byte align arrays for AVX). Step 8: Re-profile to confirm. Often the compiler already did 80% of this — measure before hand-tuning.

9. **Explain how JIT compilers emit assembly at runtime.** *(hard)*

   A JIT allocates executable memory (mmap with PROT_READ|PROT_WRITE|PROT_EXEC — though W^X security says never RWX, so use two mappings and mprotect between write and exec phases). It writes machine code bytes (the same bytes the assembler would produce) into that memory, then either calls it as a function pointer or jumps to it. On ARM, must flush instruction cache (dc cvau, dsb ish, ic ivau, dsb ish, isb) before executing — the I-cache may have stale bytes. On x86, self-modifying code is automatically handled (snoops stores to code pages). Modern JITs (V8, JVM, LuaJIT) include a register allocator, instruction selector, and often a tracing optimizer on top.

## When to Choose This

- **vs C with inline asm:** use this — Hand-tuning hot loops where the compiler can't vectorize, bootloader/firmware stubs, exploit payloads, RE work.; use that — Anything where the compiler does 95% as good a job — inline asm prevents inlining, register allocation, and often introduces bugs.
- **vs Intrinsics (<immintrin.h>):** use this — Truly low-level work (calling conventions, ABI surgery, instruction sequences intrinsics can't express), RE/forensics, exploit dev.; use that — Vectorization — intrinsics give you SIMD access with the compiler doing register allocation, scheduling, and constant folding.
- **vs JIT bytecode:** use this — Static performance-critical code, embedded systems, anything where you can't afford a JIT runtime.; use that — Dynamic languages (JS, Lua, JVM) where code is discovered at runtime; JIT can specialize to runtime types like Julia does.
- **vs ARM64 / RISC-V asm:** use this — x86 servers, desktops, game consoles (x86-specific tooling, perf tools, RE tools).; use that — Apple Silicon (M-series), mobile (every phone), embedded, anywhere power efficiency matters more than peak IPC.

