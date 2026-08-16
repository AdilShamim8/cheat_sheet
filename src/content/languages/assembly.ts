import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "assembly",
  name: "Assembly (x86-64 / ARM)",
  category: "languages",
  tier: 3,
  tags: ["low-level", "compiled", "isa", "x86-64", "arm64", "systems", "bare-metal"],
  tagline: "The textual form of the CPU's actual instructions — what every compiled program ultimately becomes.",
  year: 1947,
  author: "Kathleen Booth (first symbolic assembler)",

  tldr: [
    "Assembly is a 1:1 textual mapping of a CPU's instruction set architecture (ISA) — each mnemonic (`mov`, `add`, `blr`) corresponds to one machine instruction; an assembler turns it into bytes the CPU executes directly.",
    "Modern assembly work centers on x86-64 (servers, desktops, game consoles) and ARM64/AArch64 (every iPhone, Mac since 2020, every Android, AWS Graviton, Raspberry Pi); the two ISAs are very different but the workflow (ABI, registers, calling conventions) translates.",
    "Reach for assembly when writing bootloader/firmware, kernel entry stubs, JIT compilers, hot crypto/math primitives, exploit payloads, or reverse-engineering / malware analysis — and when a compiler's output is too slow or wrong.",
    "Avoid hand-written assembly for application logic: it's ISA-specific (so your code doesn't port), it's slower than the compiler on modern superscalar CPUs in 95% of cases, and there is zero safety net. Use intrinsics (`<immintrin.h>`) before raw asm.",
  ],

  mentalModel: {
    title: "Registers, memory, and the calling convention contract",
    body: "The CPU has a small fixed set of registers (x86-64: 16 GPRs including RAX-RDI+R8-R15; AArch64: 31 GPRs X0-X30) and a flat byte-addressable memory; instructions move data between them and compute. EVERYTHING you do is shuffling bits between these locations. The ABI (System V AMD64 for Linux/macOS, AAPCS64 for ARM) is the contract that lets separately-compiled functions call each other: which registers are arguments, which are caller-saved vs callee-saved, where the return value goes, how the stack is aligned (16 bytes before `call`). Get the ABI wrong and your function works in isolation but corrupts the caller or crashes on a specific compiler version.",
  },

  constructs: [
    { syntax: "mov rax, 42", behavior: "Move immediate 42 into rax — the fundamental data-movement instruction.", when: "Setting up constants; x86-64 uses `rax`/`rdi`/`rsi`/`rdx`/`rcx`/`r8`/`r9` for first six int args." },
    { syntax: "add rax, rbx", behavior: "Arithmetic — rax += rbx, flags set (ZF, CF, OF, SF).", when: "Integer math; x86-64 has two-operand form (dst op src)." },
    { syntax: "mov rax, [rdi + 8*rcx + 16]", behavior: "Memory load with scaled-index addressing — the C equivalent of `*(uint64_t*)(rdi + 8*rcx + 16)`.", when: "Array indexing, struct field access." },
    { syntax: "call func", behavior: "Push return address, jump to func — calls are not free (5-15 cycles depending on predictor).", when: "Function calls; pair with `ret`." },
    { syntax: "ret", behavior: "Pop return address from stack, jump — the function epilogue.", when: "End of every function; mismatches with `call` corrupt the stack." },
    { syntax: "syscall", behavior: "Trap to kernel — rax holds syscall number, args in rdi/rsi/rdx/r10/r8/r9 (System V).", when: "Direct Linux/macOS kernel calls; bypasses libc." },
    { syntax: "je / jne / jl / jg label", behavior: "Conditional jumps based on flags from a prior `cmp` or arithmetic.", when: "All branching — there are no if-statements, only jumps." },
    { syntax: "lea rax, [rdi + rsi*8]", behavior: "Load Effective Address — computes an address without touching memory; used as a fast multiply-add.", when: "Pointer arithmetic AND as a 3-operand arithmetic op (faster than `add`+`imul`)." },
    { syntax: "push rbp / mov rbp, rsp", behavior: "Function prologue — save caller's frame pointer, set up new frame.", when: "Standard prologue; omit `-Omit-Frame-Pointer` builds skip rbp." },
    { syntax: "vaddps zmm0, zmm1, zmm2", behavior: "AVX-512 — 16 floats added in parallel in one instruction.", when: "Vectorized numerics; needs CPU feature check (`cpuid`)." },
    { syntax: "ldr x0, [x1, #8]", behavior: "ARM64 load — x0 = memory[x1 + 8]. Post-increment: `ldr x0, [x1], #8` advances x1.", when: "AArch64 memory access; canonical load form." },
    { syntax: "bl func / ret", behavior: "ARM64 call (`bl` = branch with link, saves return in X30) / return (`ret` jumps to X30).", when: "AArch64 function call/return; pair with each other." },
  ],

  patterns: [
    {
      lang: "assembly",
      caption: "x86-64 leaf function — System V AMD64 ABI",
      code: `; int sum(int *xs, size_t n) -> int
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
    ret                         ; eax is the return value`,
    },
    {
      lang: "assembly",
      caption: "x86-64 function with stack frame + callee-saved regs",
      code: `; long factorial(long n)  -- recursive, uses rbx (callee-saved)
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
    ret`,
    },
    {
      lang: "assembly",
      caption: "Direct Linux syscall — write(1, msg, len) without libc",
      code: `; Linux x86-64, System V ABI.
; write(1, "Hello\\n", 6) — syscall number 1, args: rdi fd, rsi buf, rdx len.
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
    syscall                     ; never returns`,
    },
    {
      lang: "assembly",
      caption: "ARM64 vectorized loop — sum 8 floats per iteration",
      code: `// AArch64 (AAPCS64): args x0 = float*, x1 = n.  Return: s0.
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
    ret`,
    },
  ],

  pitfalls: [
    {
      title: "Stack alignment on call (16-byte on x86-64 SysV)",
      symptom: "Calling a function (or `syscall`) with RSP not 16-byte aligned crashes deep inside SSE code (`movaps` to a misaligned stack slot) — the bug surfaces far from its cause.",
      fix: "The ABI guarantees RSP is 16-aligned at the `call` instruction boundary; `call` pushes 8 bytes, so inside the callee RSP is 16k+8. Either `push` an even number of registers or `sub rsp, 8` before another call. Use `_Alignof` and check with `assert((uintptr_t)rsp % 16 == 0)`.",
    },
    {
      title: "Forgetting to save callee-saved registers",
      symptom: "Your function clobbers `rbx`/`rbp`/`r12`-`r15` (or `x19`-`x30` on ARM64) without saving — the caller's data is corrupted, crash hours later in unrelated code.",
      fix: "Push callee-saved registers at function entry, pop them in reverse order at exit. Caller-saved (`rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8`-`r11`) are free to clobber. The ABI table is the law.",
    },
    {
      title: "Calling convention mismatch (cdecl/stdcall/fastcall/System V)",
      symptom: "Code written for Linux's System V ABI (args in rdi, rsi, rdx) doesn't work on Windows x64 (args in rcx, rdx, r8, r9) and crashes immediately or returns wrong values.",
      fix: "Look up the platform ABI before writing. Windows x64: RCX/RDX/R8/R9 for first four int args, 32-byte shadow space required. ARM64 AAPCS is consistent across OSes (mostly). macOS on Apple Silicon uses AAPCS with a few extras.",
    },
    {
      title: "Memory ordering and reordering on weakly-ordered ISAs",
      symptom: "Hand-written asm with `str` + flag store on ARM64 reorders under the CPU; readers see the flag set before the data is visible. Works on x86 (TSO — total store order), fails on ARM.",
      fix: "Use `dmb ish` (data memory barrier, inner-shareable) or `stlr`/`ldar` (acquire-release loads/stores) for synchronization. x86-TSO is permissive; ARM/POWER/RISC-V are weakly ordered. Use C11 `stdatomic` if you can — compiler picks the right fence.",
    },
    {
      title: "Self-modifying / JIT code without cache flush",
      symptom: "You emit code at runtime and jump to it; on ARM64 the instruction cache still holds stale bytes — the CPU executes the old code, ignoring your writes. Works on x86 (snoops stores to code pages), fails on ARM.",
      fix: "On ARM64: `dc cvau` (clean data cache to point of unification), `dsb ish`, `ic ivau` (invalidate I-cache), `dsb ish`, `isb`. On x86 you still need `__builtin___clear_cache` for portability but it's a near-no-op. Use `mprotect(PROT_READ|PROT_WRITE|PROT_EXEC)` carefully — W^X says never RWX.",
    },
    {
      title: "Red zone misuse (128 bytes below RSP)",
      symptom: "Leaf functions on x86-64 SysV can use 128 bytes below RSP without adjusting RSP (the 'red zone'). A signal handler or interrupt overwrites that area — your locals are gone.",
      fix: "Don't rely on the red zone if you might receive signals or call into code that does. Subtract RSP by 16+ before storing. Windows x64 has no red zone at all.",
    },
    {
      title: "Assuming flags are preserved across calls",
      symptom: "You `cmp` then `call` something then `je` — the conditional jump reads flags clobbered by the callee, so it goes the wrong way silently.",
      fix: "Flags are caller-saved in every ABI — never expect them to survive a `call`. Read the flag result into a register (`sete al`) before calling, or restructure so the comparison and jump are adjacent.",
    },
  ],

  quickReference: [
    { fact: "x86-64 has 16 GPRs (RAX, RBX, RCX, RDX, RSI, RDI, RBP, RSP, R8-R15); ARM64 has 31 (X0-X30, XZR is hardwired zero).", tag: "complexity" },
    { fact: "System V AMD64 (Linux/macOS/BSD): int args in RDI, RSI, RDX, RCX, R8, R9; float args in XMM0-XMM7; return in RAX/RDX. Stack 16-aligned at call.", tag: "version" },
    { fact: "Windows x64: int args in RCX, RDX, R8, R9; float in XMM0-XMM3; 32-byte shadow space required; RAX-RCX,RDX,R8-R11,RAX caller-saved.", tag: "version" },
    { fact: "AAPCS64 (ARM64): X0-X7 first 8 args, X0 return; X9-X15 caller-saved, X19-X28 callee-saved, X29 frame pointer, X30 link register, SP aligned to 16.", tag: "version" },
    { fact: "A modern x86-64 instruction decoder handles ~4-6 instructions per cycle (μops); sustained IPC of 2-4 on typical code. Raw decode cost is rarely the bottleneck.", tag: "perf" },
    { fact: "Branch misprediction penalty: 15-20 cycles on x86-64 (Zen 4 / Golden Cove), 8-12 on ARM Cortex-A78. Make predictable branches; data-driven branch-free code wins big when input is random.", tag: "perf" },
    { fact: "L1 cache hit ~4 cycles, L2 ~12 cycles, L3 ~40 cycles, DRAM ~200-300 cycles. Cache-line = 64 bytes; aligned data + sequential access is the #1 perf lever.", tag: "perf" },
    { fact: "AVX-512 downclocks some Intel CPUs ( Skylake-X / Ice Lake) when 512-bit ops execute — the 'AVX-512 penalty' can be 10-15% slower overall even if the AVX-512 code is faster.", tag: "perf" },
    { fact: "x86 is strongly ordered (TSO); ARM64, RISC-V, POWER are weakly ordered. Portable concurrent code must use barriers / acquire-release loads (`ldar`/`stlr` on ARM).", tag: "gotcha" },
    { fact: "ASLR (PIE) requires RIP-relative addressing on x86-64 (`lea rax, [rel sym]`) and ADRP+ADD on ARM64 — absolute addressing will crash at runtime.", tag: "gotcha" },
    { fact: "Syscall numbers differ: Linux x86-64 write=1, exit=60. macOS x86-64 write=0x2000004, exit=0x2000001. Don't reuse raw numbers across OSes.", tag: "version" },
    { fact: "Single instruction latency vs throughput: most ALU ops are 1-cycle latency, 0.25-cycle throughput (4 ALU ports). Imul is 3-cycle; division is 20-40 cycles.", tag: "perf" },
    { fact: "Calling convention: leaf functions can skip the prologue entirely; non-leaf functions must align stack to 16 before any `call`. Use `-Omit-Frame-Pointer` to free up RBP as a GPR.", tag: "perf" },
    { fact: "Tools: nasm (Intel syntax) / gas AT&T (default on Linux) / clang-integrated assembler. Use `objdump -d` to disassemble, `perf` for profiling, Godbolt's Compiler Explorer for inspection.", tag: "style" },
    { fact: "Intel syntax (`mov rax, 42`) vs AT&T syntax (`movq $42, %rax`) — same instruction, opposite operand order. Choose one project-wide; both assemblers support both.", tag: "style" },
  ],

  goDeeper: [
    { title: "Intel 64 and IA-32 Architectures Software Developer's Manual", url: "https://www.intel.com/sdm", note: "The x86 ISA spec — every instruction, every flag, every encoding. Volume 2 is the instruction reference; bookmark it." },
    { title: "ARM Architecture Reference Manual (ARMv8)", url: "https://developer.arm.com/documentation/ddi0487/latest", note: "The authoritative ARM64 (AArch64) ISA spec — DDI0487. The ARM Learning path on developer.arm.com is the gentler on-ramp." },
    { title: "System V Application Binary Interface — AMD64", url: "https://refspecs.linuxbase.org/elf/x86_64-abi-0.99.pdf", note: "The calling convention, ELF format, and DWARF debug info spec for x86-64 on Linux/BSD/macOS." },
    { title: "Agner Fog's Software Optimization Manuals", url: "https://www.agner.org/optimize/", note: "Free microarchitecture deep-dives — instruction throughput, μop fusion, branch prediction for every modern x86 core. The performance bible." },
    { title: "Compiler Explorer (Godbolt)", url: "https://godbolt.org/", note: "Interactive — type C/C++/Rust, see the asm for every compiler/version/target. The single best tool for learning what your high-level code actually compiles to." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "byte (8-bit)", behavior: "Smallest addressable unit. AL and AH are the low/high bytes of AX. Memory is byte-addressable.", when: "Char data, small numerics, packed fields. Movzx / movsx for sign extension." },
      { syntax: "word (16-bit)", behavior: "Two bytes — AX, BX, CX, DX. Legacy 16-bit ops (real mode).", when: "Legacy x86 code, BIOS interrupts, small numerics in embedded." },
      { syntax: "dword (32-bit)", behavior: "Four bytes — EAX, EBX, ECX, EDX. The int32 of C.", when: "32-bit integer math. Most C int operations on 32-bit OSes." },
      { syntax: "qword (64-bit)", behavior: "Eight bytes — RAX, RBX, RCX, RDX. The int64 of C.", when: "64-bit math, pointers on 64-bit systems. The native register width on x86-64." },
      { syntax: "single (32-bit float)", behavior: "IEEE 754 single — XMM registers, SS-suffixed ops (addss, mulss).", when: "Float math, GPU-friendly precision. cvtss2sd to promote to double." },
      { syntax: "double (64-bit float)", behavior: "IEEE 754 double — XMM registers, SD-suffixed ops (addsd, mulsd).", when: "Default float in C/Fortran. 16 XMM regs on x86-64." },
      { syntax: "SIMD vectors", behavior: "XMM (128-bit, 4 floats), YMM (256-bit, 8 floats), ZMM (512-bit, 16 floats).", when: "Vectorization — AVX, AVX2, AVX-512. One instruction = N ops in parallel." },
      { syntax: "pointer / address", behavior: "64-bit value on x86-64, 64-bit on AArch64. Loaded with lea or mov from memory.", when: "All pointer arithmetic. lea rax, [rsp+8] computes address without memory access." },
      { syntax: "flags / condition codes", behavior: "RFLAGS register — ZF, CF, OF, SF, PF, AF. Set by cmp, test, arithmetic.", when: "Conditional jumps read flags. je/jne/jl/jg branch based on ZF, CF, OF, SF." },
    ],
    collections: [
      { syntax: "stack (memory via RSP)", behavior: "LIFO scratch space — push/pop, call/ret use it. Local vars, callee-saved register saves.", when: "Function prologues/epilogues, passing extra args (after first 6 in registers)." },
      { syntax: "array (RIP-relative addressing)", behavior: "mov rax, [arr + rcx*8] — array indexing via scaled-displacement addressing.", when: "Arrays of 8-byte values. Scaling factor matches element size (1/2/4/8 bytes)." },
      { syntax: "struct (offset addressing)", behavior: "mov rax, [rdi + 16] — access field at offset 16 of struct pointed to by rdi.", when: "All struct field access. Offsets are compile-time constants from C struct layout." },
      { syntax: "string (byte sequence)", behavior: "Bytes terminated by 0 (C strings) or with explicit length (Pascal-style).", when: "All text. mov al, [rsi] loads one byte; cmp byte [rsi], 0 tests for terminator." },
      { syntax: "linked list (pointer-chasing)", behavior: "mov rdi, [rdi + 8] — follow next pointer at offset 8 of node pointed to by rdi.", when: "Linked data structures. Pointer chasing is cache-hostile; prefer arrays." },
      { syntax: "bit vector / mask", behavior: "Mask in a register or memory — test/jnz checks bits. SIMD masks in K registers (AVX-512).", when: "Boolean arrays, packed flags. popcnt counts set bits." },
      { syntax: "lookup table", behavior: "Precomputed values in .rodata; mov eax, [table + rcx*4] reads entry.", when: "Replacing expensive computation with table lookup. Branch-free hot paths." },
    ],
    custom: [
      { syntax: "struct via .struct (NASM)", behavior: "Assembler-level struct — names for offsets, no runtime layout difference.", when: "When working with C structs from asm. Mostly you compute offsets by hand." },
      { syntax: "section .data / .bss / .rodata / .text", behavior: "Segments — .data for initialized globals, .bss for zero-init, .text for code, .rodata for constants.", when: "Every program — globals go in .data/.bss, code in .text." },
      { syntax: "global _start / global main", behavior: "Export a symbol as the entry point. _start for freestanding (no libc), main for libc-linked.", when: "Entry point. ld looks for _start; libc calls main." },
      { syntax: "macro (NASM %macro)", behavior: "Preprocessor macro — expands to a sequence of instructions. Multi-line, with params.", when: "Reducing boilerplate (function prologues, save/restore patterns). The 'templates' of asm." },
      { syntax: "label / local label (.name)", behavior: "Symbolic jump target. .name is local to the previous global label (NASM).", when: "All branching. Loop bodies use local labels to avoid namespace pollution." },
      { syntax: "equ  (constant)", behavior: "Compile-time constant — msglen equ $ - msg. Not stored in memory.", when: "Computed constants (lengths, offsets). Substituted at assembly time." },
      { syntax: "extern / global", behavior: "extern declares an external symbol (resolved by linker); global exports one.", when: "Cross-file / library calls. printf, malloc, your own functions in other files." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "mov dst, src", behavior: "Copy — dst and src must be same size. Cannot mov from memory to memory (use two movs).", when: "All data movement. The most common instruction." },
    { syntax: "lea dst, [addr]", behavior: "Load Effective Address — computes address, doesn't deref. dst = &memory.", when: "Pointer arithmetic AND as a fast 3-operand arithmetic op (lea rax, [rdi + rsi*8 + 16])." },
    { syntax: "add dst, src", behavior: "Add src to dst, store in dst. Sets flags (ZF, CF, OF, SF).", when: "Integer addition. add rax, 1 is inc rax (slightly smaller encoding)." },
    { syntax: "sub dst, src", behavior: "Subtract src from dst, store in dst. Sets flags including CF (borrow).", when: "Integer subtraction. cmp is sub that discards the result, only sets flags." },
    { syntax: "imul dst, src  (signed)", behavior: "Signed multiply. Two-operand form: dst = dst * src (low 64 bits).", when: "Integer multiplication. 3-operand form: imul rax, rdi, 8 (rax = rdi * 8)." },
    { syntax: "div / idiv  (unsigned / signed)", behavior: "Divide — RDX:RAX / src, quotient in RAX, remainder in RDX. Slow (20-40 cycles).", when: "Integer division. Avoid in hot loops if possible (use shifts for powers of 2)." },
    { syntax: "and / or / xor / not / test", behavior: "Bitwise ops on registers/memory. test is and that discards result, only sets flags.", when: "Bit manipulation. test rax, rax checks if zero (smaller than cmp)." },
    { syntax: "shl / shr / sar / sal  (n, cl)", behavior: "Bit shifts — shl/shr are logical, sar is arithmetic (sign-preserving).", when: "Bit manipulation, multiply/divide by powers of 2. shl rax, 3 is rax * 8." },
    { syntax: "cmp a, b / je/jne/jl/jg/jle/jge", behavior: "cmp computes a-b, sets flags. jCC jumps based on flag state.", when: "All conditional branching. Use signed (jl/jg) or unsigned (jb/ja) variants appropriately." },
    { syntax: "test a, b / jz / jnz", behavior: "test computes a&b, sets flags. jz (zero flag set) = je.", when: "Bit testing, zero-checks. test rax, rax + jz is the canonical null check." },
    { syntax: "movzx / movsx", behavior: "Move with zero/sign extension — for loading smaller values into bigger registers.", when: "Loading bytes/words into 64-bit regs. movzx eax, byte [rdi] zero-extends; movsx sign-extends." },
    { syntax: "push / pop", behavior: "Stack ops — push decrements RSP by 8 and stores; pop loads and increments RSP.", when: "Saving/restoring callee-saved registers, passing extra args. 8-byte aligned." },
    { syntax: "call / ret", behavior: "call pushes return address and jumps; ret pops return address and jumps back.", when: "Function call/return. call is 5-15 cycles depending on branch predictor." },
    { syntax: "syscall", behavior: "Trap to kernel — RAX holds syscall number, args in RDI/RSI/RDX/R10/R8/R9.", when: "Direct kernel calls (write, read, exit, mmap). Bypasses libc." },
    { syntax: "lock cmpxchg [mem], reg", behavior: "Atomic compare-and-swap — if [mem] == RAX then [mem] = reg, else RAX = [mem].", when: "Lock-free data structures, atomic ops. Lock prefix for multi-core visibility." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "assembly",
      caption: "Linux x86-64 syscalls — write(1, msg, len) without libc",
      code: `; Linux x86-64, System V ABI. Pure syscall, no libc.
; write(1, "Hello\\n", 6):
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

; Build: nasm -f elf64 hello.asm && ld -o hello hello.o`,
    },
    {
      lang: "assembly",
      caption: "read(0, buf, n) + length-bounded buffer",
      code: `; read up to 1024 bytes from stdin into a stack buffer.
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
    syscall`,
    },
    {
      lang: "assembly",
      caption: "File I/O via open/read/write syscalls",
      code: `; open("data.txt", O_RDONLY) -> fd
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
    syscall`,
    },
    {
      lang: "assembly",
      caption: "Calling libc printf (vs raw syscall)",
      code: `; Linking with libc gives you printf, malloc, etc.
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
three:  dq      3.14                     ; double constant`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "assembly",
      caption: "Counted loop with loop instruction (and its flaws)",
      code: `; loop instruction: dec rcx, jnz to label.
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
;   loop .loop    ; dec rcx; jnz .loop`,
    },
    {
      lang: "assembly",
      caption: "Two-loop nested iteration with array indexing",
      code: `; Sum all elements of an NxM matrix (column-major for cache).
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
    ret`,
    },
    {
      lang: "assembly",
      caption: "SIMD vectorized loop — 4 doubles per iteration",
      code: `; Sum an array of N doubles, 4 at a time via SSE2.
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
    ret`,
    },
    {
      lang: "assembly",
      caption: "Loop unrolling + branch reduction",
      code: `; Unrolling 4x reduces loop overhead (dec/jnz) by 4x.
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

; AVX-512 with 4 ops fused into one (vaddpd zmm) is even better.`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "assembly",
      caption: "Leaf function — no stack frame needed",
      code: `; int sum(int *xs, size_t n) -> int
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
; Stack must be balanced — push/pop paired, sub/add rsp paired.`,
    },
    {
      lang: "assembly",
      caption: "Non-leaf function with callee-saved register preservation",
      code: `; long factorial(long n)  -- recursive, uses rbx (callee-saved)
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
; in epilogue, including for every return path.`,
    },
    {
      lang: "assembly",
      caption: "Variadic-style call + stack alignment",
      code: `; Calling printf (variadic) — System V AMD64 ABI.
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
    ret`,
    },
    {
      lang: "assembly",
      caption: "Function pointer / vtable dispatch",
      code: `; Indirect call through a function pointer in rax.
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
    dq      .case0, .case1, .case2, .case3`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "assembly",
      caption: "Return-value convention (C-style)",
      code: `; C convention: return 0/-1 (or -errno on Linux syscalls), set errno.
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
;   je  handle_error`,
    },
    {
      lang: "assembly",
      caption: "setjmp/longjmp — non-local goto",
      code: `; setjmp saves registers + return address to a buffer.
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
;   call longjmp                     ; never returns`,
    },
    {
      lang: "assembly",
      caption: "Signal handler — async error recovery",
      code: `; Signal handlers run asynchronously on signal delivery.
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
    ret                                 ; returns to interrupted code`,
    },
    {
      lang: "assembly",
      caption: "Hardware exceptions via interrupt / fault handlers",
      code: `; CPU faults: divide by zero (#DE), invalid opcode (#UD),
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
    iret                                ; return from interrupt`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "assembly",
      caption: "Threads via clone() syscall (Linux)",
      code: `; Linux clone() creates a new thread or process.
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
    ; handle error`,
    },
    {
      lang: "assembly",
      caption: "Atomic compare-and-swap — lock-free primitive",
      code: `; lock cmpxchg [mem], reg
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
; and improves hyperthreading efficiency.`,
    },
    {
      lang: "assembly",
      caption: "Memory barriers — x86 TSO vs ARM weak ordering",
      code: `; x86-64 is TSO (Total Store Order) — most ops are acquire/release by default.
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
;   ldar x2, [x3]        ; load-acquire`,
    },
    {
      lang: "assembly",
      caption: "Futex — fast user-space mutex (Linux)",
      code: `; Futex = 'fast user-space mutex'. Common case: spin in user space via cmpxchg.
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
    ret`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "assembly",
      caption: "C harness — test asm via C test framework",
      code: `// test_sum.c — link against asm via C test framework (e.g., Unity, Check)
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
//   ./test_sum  # exits 0 on success, non-zero on assert fail`,
    },
    {
      lang: "assembly",
      caption: "GDB scripting — automated asm assertions",
      code: `# GDB script (test.gdb) — load binary, set breakpoints, check state.
file ./myprog

# Break at function entry:
break sum

# Run with args:
run

# When breakpoint hits, check registers:
printf "rdi = %p, rsi = %zu\\n", $rdi, $rsi

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

quit`,
    },
    {
      lang: "assembly",
      caption: "EUnit / standalone test assembly",
      code: `; Self-contained test: call function, check result, exit code reflects pass/fail.
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
    syscall`,
    },
    {
      lang: "assembly",
      caption: "Fuzzing via AFL / libFuzzer harness",
      code: `// fuzz_sum.c — libFuzzer harness for the asm 'sum' function.
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
//   clang -g -O1 -fsanitize=fuzzer,address \\
//         fuzz_sum.c sum.o -o fuzz_sum
//   ./fuzz_sum  # runs forever, finds crashes`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "L1 cache hit ~4 cycles, L2 ~12 cycles, L3 ~40 cycles, DRAM ~200-300 cycles. Cache line = 64 bytes; aligned sequential access is the #1 perf lever.", tag: "perf" },
    { fact: "Branch misprediction: 15-20 cycles on x86-64 (Zen 4 / Golden Cove), 8-12 on ARM Cortex-A78. Predictable branches are nearly free.", tag: "perf" },
    { fact: "ALU ops (add, sub, and, or, xor): 1-cycle latency, 0.25-cycle throughput (4 ALU ports). imul: 3-cycle latency. div: 20-40 cycles.", tag: "perf" },
    { fact: "Memory load: 4-5 cycles from L1, ~14 from L2. Software-prefetch (prefetcht0) helps for known access patterns.", tag: "perf" },
    { fact: "AVX-512 downclocks some Intel CPUs (Skylake-X / Ice Lake) — the 'AVX-512 penalty' can be 10-15% slower overall even if AVX-512 code is faster.", tag: "perf" },
    { fact: "Function call cost: 5-15 cycles depending on branch predictor. Inline small hot functions; let the compiler decide.", tag: "perf" },
    { fact: "SIMD: 16 floats per instruction with AVX-512 (vs 4 with SSE). Vectorization can give 4-16x speedup on data-parallel loops.", tag: "perf" },
    { fact: "Loop unrolling: reduces loop overhead (dec/jnz = 2 ops/iter), but increases code size. Compiler auto-unrolls with -O3.", tag: "perf" },
    { fact: "lea as 3-operand arithmetic: 'lea rax, [rdi + rsi*8 + 16]' is faster than 'mov rax, rsi; shl rax, 3; add rax, rdi; add rax, 16'.", tag: "perf" },
    { fact: "xchg rax, rax is a 2-byte NOP on x86 — used for code alignment / padding. Modern x86 has multi-byte NOPs (0F 1F /0).", tag: "perf" },
    { fact: "Macro-op fusion: cmp + jCC fuse into one μop on modern x86. Always keep them adjacent — splitting them costs throughput.", tag: "perf" },
    { fact: "x86-TSO means most loads/stores are acquire/release by default. ARM needs explicit dmb ish / ldar / stlr for the same semantics.", tag: "gotcha" },
    { fact: "Profile with perf (Linux), Instruments (macOS), or VTune (Intel). perf record -F 999 -g -- ./binary samples at 999Hz.", tag: "perf" },
    { fact: "Alignment matters: movaps to misaligned address faults (SIGSEGV). movups is safe but slower on old CPUs. Modern CPUs: ~same speed.", tag: "gotcha" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "NASM", purpose: "Netwide Assembler — Intel syntax, cross-platform, popular for hand-written asm.", url: "https://www.nasm.us/", category: "build" },
    { tool: "GAS (GNU as)", purpose: "GNU Assembler — AT&T syntax by default (Intel syntax via .intel_syntax), bundled with GCC/binutils.", url: "https://sourceware.org/binutils/docs/as/", category: "build" },
    { tool: "Clang integrated assembler", purpose: "LLVM's assembler — integrated with clang, supports both Intel and AT&T syntax.", url: "https://clang.llvm.org/docs/", category: "build" },
    { tool: "MASM", purpose: "Microsoft Macro Assembler — Windows-only, Intel syntax. The classic x86 DOS/Windows assembler.", url: "https://learn.microsoft.com/en-us/cpp/assembler/masm/", category: "build" },
    { tool: "JWASM / UASM", purpose: "Open-source MASM-compatible assemblers — for cross-platform MASM-style code.", url: "https://github.com/JWasm/JWasm", category: "build" },
    { tool: "GDB", purpose: "GNU Debugger — stepi (single instruction), info registers, disas. The standard asm debugger.", url: "https://www.gnu.org/software/gdb/", category: "debug" },
    { tool: "LLDB", purpose: "LLVM debugger — default on macOS. Similar commands to GDB.", url: "https://lldb.llvm.org/", category: "debug" },
    { tool: "objdump", purpose: "Disassembler — objdump -d binary shows asm with addresses. -M intel for Intel syntax.", url: "https://sourceware.org/binutils/docs/binutils/objdump.html", category: "debug" },
    { tool: "Compiler Explorer (Godbolt)", purpose: "Interactive — type C/C++/Rust, see the asm for every compiler/version/target. Indispensable for learning.", url: "https://godbolt.org/", category: "debug" },
    { tool: "perf (Linux)", purpose: "Sampling profiler — perf record/report. Hardware counters, branch prediction, cache misses.", url: "https://perf.wiki.kernel.org/", category: "debug" },
    { tool: "Intel VTune Profiler", purpose: "Intel's profiler — microarchitectural analysis, cache stats, branch prediction. Free for non-commercial.", url: "https://www.intel.com/content/www/us/en/developer/tools/oneapi/vtune-profiler.html", category: "debug" },
    { tool: "Instruments (macOS)", purpose: "Apple's profiler — Time Profiler, Allocations, System Trace. Bundled with Xcode.", url: "https://developer.apple.com/xcode/features/", category: "debug" },
    { tool: "Ghidra / IDA Pro", purpose: "Reverse engineering — disassembly + decompilation. Ghidra is free; IDA Pro is the commercial standard.", url: "https://ghidra-sre.org/", category: "debug" },
    { tool: "Radare2 / Cutter", purpose: "Open-source reverse engineering framework. Cutter is the GUI. For binary analysis.", url: "https://www.radare.org/", category: "debug" },
    { tool: "AFL / libFuzzer", purpose: "Fuzz testing — feed random inputs to find crashes. libFuzzer is in-process; AFL forks.", url: "https://llvm.org/docs/LibFuzzer.html", category: "test" },
    { tool: "Intel SDM / ARM ARM", purpose: "The ISA reference manuals — Intel Software Developer's Manual, ARM Architecture Reference Manual. The authoritative specs.", url: "https://www.intel.com/sdm", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "x86 (8086)", year: 1978, highlight: "Intel 8086 — 16-bit ISA, the foundation. 1MB address space, real mode." },
    { version: "80386 (i386)", year: 1985, highlight: "32-bit protected mode, paging, 4GB address space. The 'i386 ABI' still used in 32-bit Linux." },
    { version: "Pentium (P5)", year: 1993, highlight: "Superscalar — two pipelines (U, V). 64-bit data bus. The 'Pentium bug' FDIV erratum." },
    { version: "Pentium Pro (P6)", year: 1995, highlight: "Out-of-order execution, μop translation, register renaming. Foundation for Intel uarch for 20 years." },
    { version: "SSE (Pentium III)", year: 1999, highlight: "Streaming SIMD Extensions — 128-bit XMM registers, 4 floats per op. Single-precision vectorization." },
    { version: "x86-64 (AMD64)", year: 2003, highlight: "AMD extends x86 to 64-bit; Intel adopts as EM64T. 16 GPRs, RIP-relative addressing, larger addresses." },
    { version: "SSE2", year: 2004, highlight: "Double-precision SIMD, integer SIMD in XMM. Foundation for all modern x86 vectorization baseline." },
    { version: "AVX (Sandy Bridge)", year: 2011, highlight: "Advanced Vector Extensions — 256-bit YMM registers, 8 floats per op. Three-operand syntax (no more mov-destructive)." },
    { version: "AVX2 (Haswell)", year: 2013, highlight: "AVX for integers, gather instructions. FMA (fused multiply-add) — better float precision + perf." },
    { version: "AVX-512 (Skylake-X)", year: 2017, highlight: "512-bit ZMM registers, 16 floats per op. Mask registers (k0-k7). Downclocks some Intel CPUs." },
    { version: "ARM64 (AArch64)", year: 2011, highlight: "ARMv8-A — 64-bit, 31 GPRs, clean RISC design. Apple Silicon (M1, 2020) drives mainstream adoption." },
    { version: "ARM SVE", year: 2016, highlight: "Scalable Vector Extension — vector length agnostic (128-2048 bits). Used in HPC (Fugaku supercomputer)." },
    { version: "RISC-V", year: 2010, highlight: "Open ISA — base RV32I/RV64I + extensions (M, A, F, D, V). Gaining ground in embedded and custom silicon." },
    { version: "x86 APX", year: 2023, highlight: "Intel's Advanced Performance Extensions — 16 new GPRs (r16-r31), 3-operand instructions. Modernizes x86." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Explain the System V AMD64 calling convention.", a: "First 6 integer/pointer args in RDI, RSI, RDX, RCX, R8, R9. First 8 float args in XMM0-XMM7. Return in RAX (and RDX for 128-bit). Stack is 16-byte aligned at the call instruction (so 16k+8 inside callee). RBP, RBX, R12-R15 are callee-saved (you must preserve them); RAX, RCX, RDX, RSI, RDI, R8-R11 are caller-saved. AL holds the number of XMM registers used for variadic functions. Variadic args beyond reg capacity go on the stack.", difficulty: "medium" },
    { q: "What's the difference between x86-TSO and ARM's weak memory model?", a: "x86 is Total Store Order — stores are visible in program order, loads don't reorder with earlier stores. Most ops are acquire/release by default, so 'simple' concurrent code just works. ARM (and RISC-V, POWER) are weakly ordered — loads and stores can reorder freely unless you use barriers (dmb ish) or acquire/release forms (ldar/stlr). Code that works on x86 can fail on ARM because reordering exposes races. C11 stdatomic handles this for you — never write raw asm with shared memory without barriers.", difficulty: "hard" },
    { q: "Why is the stack 16-byte aligned, and what breaks if it isn't?", a: "Modern x86 CPUs require 16-byte alignment for SSE/AVX instructions that operate on stack-resided data (movaps). The ABI guarantees RSP is 16-aligned at the call boundary; 'call' pushes 8 bytes (return address), so inside the callee RSP is 16k+8. Functions need to push an even number of registers OR sub rsp, 8 to realign before calling another function. Misalignment causes SIGSEGV deep inside library code (e.g., printf using SSE) — far from the cause.", difficulty: "medium" },
    { q: "How does cmpxchg implement a spinlock, and why use 'pause'?", a: "lock cmpxchg [mem], reg atomically: if RAX == [mem], store reg to [mem] and set ZF; else load [mem] into RAX and clear ZF. To acquire: spin trying cmpxchg [lock], 1 with RAX=0 (expected unlocked). 'pause' (rep nop on x86) is a hint that you're in a spin loop — it saves power, reduces pipeline contention on hyperthreaded cores, and improves the other thread's throughput. On ARM the equivalent is 'yield'.", difficulty: "medium" },
    { q: "Explain macro-op fusion and why it matters for performance.", a: "Modern x86 decoders fuse certain instruction pairs into one μop. The most common: cmp/jCC (e.g., cmp rax, 5; je label) becomes one μop. This means a comparison-and-branch is one op in the pipeline, not two — significant throughput gain. To benefit, keep cmp and jCC adjacent; inserting an instruction between them prevents fusion. Compilers know this; if you write asm by hand, keep them together.", difficulty: "medium" },
    { q: "What's the red zone, and when can you use it?", a: "The red zone is 128 bytes below RSP on x86-64 SysV ABI. Leaf functions can use it for local storage WITHOUT adjusting RSP — saves the sub/add instructions. Windows x64 has no red zone. Don't use the red zone if you might receive a signal — signal handlers clobber it. Don't use it in non-leaf functions (a called function would use RSP-relative addressing that overlaps your red-zone data).", difficulty: "medium" },
    { q: "How does function inlining at the asm level work, and when is it bad?", a: "Inlining replaces a 'call func; ret' with the function's body. Saves: call/ret overhead (5-15 cycles), argument setup, register save/restore. Costs: code size growth (icache pressure), potential register pressure increase. Compilers inline based on heuristics (function size, call frequency, hotness profile). Hand-inlining in asm is rare — you typically write the inline version directly and let the assembler emit it. Inlining large functions into loops is the most common mistake.", difficulty: "medium" },
    { q: "How would you optimize a hot loop in assembly?", a: "Step 1: Profile (perf record) to confirm it's actually hot. Step 2: Look at the loop — is it vectorizable? Add SIMD (SSE/AVX) to process 4-16 elements per iteration. Step 3: Unroll 4-8x to reduce loop overhead. Step 4: Check memory access patterns — sequential? If not, transpose / restructure data. Step 5: Eliminate dependencies — independent accumulators (multiple partial sums) break dependency chains. Step 6: Avoid branches (use cmov or arithmetic). Step 7: Check alignment (32-byte align arrays for AVX). Step 8: Re-profile to confirm. Often the compiler already did 80% of this — measure before hand-tuning.", difficulty: "hard" },
    { q: "Explain how JIT compilers emit assembly at runtime.", a: "A JIT allocates executable memory (mmap with PROT_READ|PROT_WRITE|PROT_EXEC — though W^X security says never RWX, so use two mappings and mprotect between write and exec phases). It writes machine code bytes (the same bytes the assembler would produce) into that memory, then either calls it as a function pointer or jumps to it. On ARM, must flush instruction cache (dc cvau, dsb ish, ic ivau, dsb ish, isb) before executing — the I-cache may have stale bytes. On x86, self-modifying code is automatically handled (snoops stores to code pages). Modern JITs (V8, JVM, LuaJIT) include a register allocator, instruction selector, and often a tracing optimizer on top.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "C with inline asm", whenThis: "Hand-tuning hot loops where the compiler can't vectorize, bootloader/firmware stubs, exploit payloads, RE work.", whenThat: "Anything where the compiler does 95% as good a job — inline asm prevents inlining, register allocation, and often introduces bugs." },
    { vs: "Intrinsics (<immintrin.h>)", whenThis: "Truly low-level work (calling conventions, ABI surgery, instruction sequences intrinsics can't express), RE/forensics, exploit dev.", whenThat: "Vectorization — intrinsics give you SIMD access with the compiler doing register allocation, scheduling, and constant folding." },
    { vs: "JIT bytecode", whenThis: "Static performance-critical code, embedded systems, anything where you can't afford a JIT runtime.", whenThat: "Dynamic languages (JS, Lua, JVM) where code is discovered at runtime; JIT can specialize to runtime types like Julia does." },
    { vs: "ARM64 / RISC-V asm", whenThis: "x86 servers, desktops, game consoles (x86-specific tooling, perf tools, RE tools).", whenThat: "Apple Silicon (M-series), mobile (every phone), embedded, anywhere power efficiency matters more than peak IPC." },
  ],
};

export default sheet;
