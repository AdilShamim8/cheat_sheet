# Fortran

**Category:** Languages · **Tier:** Tier 3 · Specialized · **Tags:** compiled, static, numerical, scientific, array-oriented, column-major, legacy · **First released:** 1957 · **Author:** John Backus (IBM) · **Last updated:** 2026-11

> The first high-level language — still the fastest tool for dense linear algebra and HPC kernels.

---

## TL;DR

- Fortran ('FORmula TRANslation') is a statically-typed, compiled, array-oriented language designed in the 1950s for scientific computation; modern Fortran (2018/2023 standards) has modules, derived types, coarrays, and parallel do-concurrent.
- It remains the lingua franca of HPC: LAPACK, BLAS, the weather models at ECMWF/NOAA, the community climate models (CESM, WRF), and large chunks of computational chemistry (NWChem, Gaussian) and nuclear engineering are written in Fortran.
- Reach for Fortran when your bottleneck is dense linear algebra or PDE solvers on huge arrays, when you need to integrate with existing HPC libraries (MPI + OpenMP + CUDA Fortran), or when you're maintaining legacy physics codebases that won't be rewritten.
- Avoid Fortran for new general-purpose software — the ecosystem (packaging, build tooling, web/UI) is thin, hiring is hard, and Julia/Python+NumPy+C/Rust cover most of its domain with better tooling. New Fortran is mostly for incremental improvements to existing HPC code.

## Core Mental Model

**Arrays are the program; column-major is the law.** Fortran's central abstraction is the n-dimensional array of numbers and array-syntax expressions that operate on it element-wise: `A = B + C * sin(D)` compiles to a vectorized loop without you writing one. Arrays are column-major (the first index varies fastest in memory), the opposite of C/NumPy — this is the single most important fact when interoping with C, calling BLAS/LAPACK, or writing cache-friendly loops. Subprograms (`subroutine`/`function`) are passed arrays by reference (no copy); intent is declared (`intent(in)`, `intent(out)`, `intent(inout)`). Modern Fortran adds modules (namespaces), derived types (structs), pointers (rarely used; allocatables are preferred), and coarrays (built-in PGAS parallelism).

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| program main   use mod   implicit none   integer :: n end program | Top-level program unit; `implicit none` is mandatory (disables implicit typing). | Every program — `implicit none` is the single most important line. |
| real(real64) :: x integer(int32) :: n | Typed declaration using `kind` parameters; `real64` from `iso_fortran_env` is portable double precision. | All numeric declarations — never use bare `real` (compiler-dependent precision). |
| real(real64), allocatable :: A(:,:) | Deferred-shape array — allocated at runtime with `allocate(A(n,m))`, freed with `deallocate(A)` (or on scope exit). | All non-trivial arrays; the modern replacement for fixed-size and pointer arrays. |
| A = B + 2.0 * C | Whole-array expression — element-wise, allocated to fit RHS if allocatable on LHS (F2003). | The primary idiom — avoid explicit loops when array syntax works. |
| subroutine foo(x, y)   real, intent(in) :: x   real, intent(out) :: y | Subroutine with intent declarations — `in` is read-only, `out` is written, `inout` both. | All reusable code — intent lets the compiler optimize and catches bugs. |
| function f(x) result(y)   real, intent(in) :: x; real :: y | Pure function — `result(y)` names the return value; `pure`/`elemental` for side-effect-free. | Math-like transforms; `elemental` lets it be called on arrays. |
| module geom   implicit none   private   public :: area, perimeter | Module = namespace + encapsulation; `private`/`public` control visibility. | All non-trivial code organization; replaces COMMON blocks (legacy). |
| type :: point   real :: x, y end type | Derived type — a struct; can have type-bound procedures (methods). | Domain modeling; F2003+ supports inheritance via `extends`. |
| do i = 1, n   A(i) = A(i) + 1.0 end do |  counted do-loop — the only loop form for non-elemental work. | When array syntax won't express the operation; remember the innermost index varies fastest. |
| do concurrent (i=1:n) reduce(+:s) | Parallel do-loop (F2008+) — compiler parallelizes; `reduce` declares reductions (F2018). | Targeting OpenMP/SIMD without explicit pragmas; coarser than OpenMP but portable. |
| interface   subroutine c_func(x) bind(C)     use iso_c_binding     real(c_double) :: x   end subroutine end interface | C interop via `iso_c_binding` — `bind(C)` makes Fortran callable from C with C ABI. | All FFI to C/C++/Rust/Python; the only portable interop path. |
| if (err /= 0) error stop 'msg' | Error termination with message — also exits the image (process) cleanly. | Unrecoverable errors; `stop` for normal termination, `error stop` for failures. |

## Idiomatic Patterns

**Module + allocatable array + intent — modern Fortran style**

```fortran
module matrices
  use iso_fortran_env, only: real64
  implicit none
  private
  public :: matrix_t, mat_mul

  type :: matrix_t
    real(real64), allocatable :: data(:,:)
  contains
    procedure :: free
  end type

contains
  function mat_mul(A, B) result(C)
    type(matrix_t), intent(in)  :: A, B
    type(matrix_t) :: C
    integer :: n, m, p
    n = size(A%data, 1); m = size(A%data, 2); p = size(B%data, 2)
    allocate(C%data(n, p))
    ! Whole-array matmul; compiler dispatches to BLAS if available.
    C%data = matmul(A%data, B%data)
  end function

  subroutine free(self)
    class(matrix_t), intent(inout) :: self
    if (allocated(self%data)) deallocate(self%data)
  end subroutine
end module
```

**Coarray parallel — same code, many images**

```fortran
program co_sum
  use iso_fortran_env, only: real64
  implicit none
  real(real64) :: local_sum
  real(real64) :: global[*]   ! coarray: one copy per image (process)
  integer :: i, n

  n = 10**7
  local_sum = 0.0_real64
  do i = this_image(), n, num_images()    ! strided across images
    local_sum = local_sum + real(i, real64)
  end do

  global = local_sum                       ! write to local copy
  sync all                                  ! barrier

  if (this_image() == 1) then
    do i = 2, num_images()
      global[1] = global[1] + global[i]     ! gather from remote images
    end do
    print *, 'sum = ', global[1]
  end if
end program

! Run with: cafrun -n 4 ./co_sum   (4 images, like MPI ranks but in-language)
```

**Column-major cache-friendly loop**

```fortran
! Two loops, identical result, ~10x different speed.
! Fortran stores A(i,j) at offset (i-1) + (j-1)*n  — first index varies fastest.

! GOOD: j is outer, i is inner -> sequential memory access.
subroutine good_scale(A, n, m, s)
  use iso_fortran_env, only: real64
  integer, intent(in) :: n, m
  real(real64), intent(inout) :: A(n,m)
  real(real64), intent(in) :: s
  integer :: i, j
  do j = 1, m
    do i = 1, n
      A(i,j) = A(i,j) * s
    end do
  end do
end subroutine

! BAD: i outer, j inner -> strided memory access, cache thrash.
subroutine bad_scale(A, n, m, s)
  ! ... same declarations ...
  do i = 1, n
    do j = 1, m
      A(i,j) = A(i,j) * s   ! stride-n reads
    end do
  end do
end subroutine
```

**C interop — calling a Fortran function from C**

```fortran
! Fortran side: iso_c_binding makes the ABI match C.
module fmod
  use iso_c_binding, only: c_double, c_int
  implicit none
contains
  function dot_product_c(x, y, n) bind(C, name="f_dot")
    integer(c_int), value :: n
    real(c_double), intent(in) :: x(n), y(n)
    real(c_double) :: dot_product_c
    integer :: i
    dot_product_c = 0.0_c_double
    do i = 1, n
      dot_product_c = dot_product_c + x(i) * y(i)
    end do
  end function
end module

! C side:
!   extern double f_dot(double *x, double *y, int n);
!   double r = f_dot(x, y, n);
! Notes: value-passed scalars use 'value' attribute; arrays are passed
! by reference (C pointer). 1-indexed in Fortran, 0-indexed in C.
```

## Common Pitfalls

1. **Column-major layout vs C/NumPy (row-major)** — *Symptom:* Calling a Fortran BLAS routine (`dgemm`) with a C matrix laid out row-major silently transposes the operation; results look right on square matrices and wrong on rectangular ones, in ways that pass simple tests. *Fix:* Always know your layout. C interop: declare `A(n,m)` in Fortran and `double A[m][n]` in C to match memory. NumPy arrays with `order='F'` exist for this. LAPACK's `dgemm` has transa/transb flags — use them, don't rely on luck.
2. **1-indexed arrays break every C/Python port** — *Symptom:* Porting `for (i=0; i<n; i++) A[i]=...` literally gives `do i=0,n-1` — index 0 is invalid in Fortran, and the bounds check fires (if enabled) or you corrupt adjacent memory. *Fix:* Loop `do i = 1, n`. Arrays can be declared with any lower bound (`real :: A(0:n-1)`), but idiomatic Fortran is 1-indexed. Document the convention at module boundaries.
3. **Implicit typing (no `implicit none`)** — *Symptom:* Without `implicit none`, variables starting with I-N default to integer, A-H and O-Z to real. Typo `recl` instead of `rec1` creates a new real variable silently. Classic Fortran bug since 1957. *Fix:* ALWAYS put `implicit none` first in every scope (program, module, subroutine, function). Most compilers accept `-fimplicit-none` (gfortran) to enforce it globally.
4. **Fixed-form vs free-form source (.f vs .f90)** — *Symptom:* Editing a `.f` (fixed-form) file with modern indentation breaks columns — code in columns 1-5 must be labels, column 6 is the continuation marker, code starts at column 7. Tabs in the wrong column are catastrophic. *Fix:* Use `.f90` (free-form) for all new code. For legacy `.f` files, set editor to highlight column 6 and never use tabs. gfortran accepts both based on extension. Free-form has no column restrictions and uses `&` for continuation.
5. **Passing allocatables to subroutines — explicit interface required** — *Symptom:* Calling `call foo(A)` where A is an allocatable and `foo` expects an explicit-shape array silently mispasses the descriptor; you read garbage or crash. The compiler doesn't always catch it. *Fix:* Put subroutines in modules (gives explicit interfaces automatically) or write explicit `interface` blocks. Use `class(*)` or assumed-shape `A(:)` for generic args. `-fcheck=bounds` catches runtime violations.
6. **Kind parameters — never use bare `real`** — *Symptom:* `real :: x` is single precision on most compilers (4 bytes), but doubles on some Cray/legacy systems. Code that 'works' on x86 breaks on a different arch or with `-fdefault-real-8`. *Fix:* Always `use iso_fortran_env, only: real64, real32` and declare `real(real64) :: x`. Use `c_double` from `iso_c_binding` for C-compatible precision. Compile with `-fdefault-real-8` only to spot legacy code.
7. **MPI vs coarrays — different mental models** — *Symptom:* Writing MPI code as if coarrays and vice versa. Coarrays look syntactic but `global[i] = ...` is a one-sided remote write with different semantics than `MPI_Put`; performance characteristics differ. *Fix:* Pick one model per codebase. Coarrays (F2008+) are nicer for new code but require a coarray-aware compiler (gfortran + OpenCoarrays, Intel, Cray). MPI + OpenMP remains the HPC default; coarrays are gaining ground slowly.

## Production / Interview Quick Reference

- Fortran 2018 (formerly F2015) and Fortran 2023 are the current standards; gfortran 13+ and ifort/ifx support most of F2018. F2023 adds generics and extended coarrays. `version`
- Build systems: CMake (with Fortran support) is the modern standard; Make is common in legacy code; fpm (Fortran Package Manager, 2020+) is the Cargo-like newcomer. `version`
- Arrays are column-major (first index varies fastest in memory) — opposite of C/NumPy. Critical for cache performance and C interop. `gotcha`
- Whole-array operations are not magic — they're equivalent loops, but the compiler can fuse, vectorize, and call BLAS automatically (ifort) or via flags (gfortran -fopt-info-vec). `perf`
- matmul intrinsic dispatches to BLAS dgemm/sgemm when arrays are large; small arrays (~<50 elements) may use the naive loop. Performance crossover varies by compiler. `perf`
- Allocatables are auto-freed on scope exit (F2003) — no explicit deallocate needed for local allocatables in most cases; deallocate large arrays early to control peak memory. `version`
- Pure and elemental functions enable compiler optimization and parallelization; `pure` forbids side effects, `elemental` allows array calls. `version`
- do concurrent (F2008) parallelizes via OpenMP/SIMD; F2018 added reduce() clauses. Less powerful than OpenMP pragmas but portable across compilers. `version`
- Coarrays (F2008) are built-in PGAS parallelism — `real :: x[*]` is one copy per image; `x[i]` accesses remote. Compiles with -fcoarray=lib (gfortran needs OpenCoarrays). `version`
- iso_c_binding module provides C-ABI-compatible kinds (c_double, c_int, c_char); `bind(C)` exposes Fortran to C without name mangling. The only portable interop path. `version`
- Subroutines pass arrays by reference (no copy); intent(in/out/inout) is mandatory documentation that the compiler checks. `complexity`
- 1-indexed by default but `real :: A(0:n-1)` is legal — useful for C interop. Mixing conventions in one project is asking for off-by-one bugs. `gotcha`
- Fixed-form (.f, .for) — columns 1-5 labels, 6 continuation, 7-72 code; free-form (.f90, .f95, .f03, .f08) — no column rules. New code: always free-form. `style`
- Naming: snake_case for variables/subroutines; UPPERCASE was historical convention but modern code is case-sensitive and uses lower_with_underscores. `style`
- Compilers: gfortran (free, GCC), ifx/ifort (Intel oneAPI — free since 2024), nvfortran (NVIDIA HPC SDK, free), flang (LLVM-based). All target x86-64, ARM64, GPU (CUDA Fortran / OpenACC). `version`

## Go Deeper

- [Fortran Wiki — fortran-lang.org](https://fortran-lang.org/) — Community hub + Learn tutorial + fpm package index. The friendliest on-ramp to modern Fortran.
- [Fortran 2018 Standard (ISO/IEC 1539-1:2018)](https://www.iso.org/standard/72320.html) — Authoritative spec; expensive but the reference. Fortran Wiki mirrors key sections.
- [Modern Fortran in Practice (Arjen Markus)](https://www.cambridge.org/core/books/modern-fortran-in-practice/C2A975F2C7D6F8C2F0D6F1A4F6F8D7C2) — Pragmatic treatment of modules, OO, F2003+ features with real examples.
- [Modern Fortran: Style and Usage (Norman Clerman)](https://www.cambridge.org/core/books/modern-fortran/9C2F7E0E1F5D3A2C0B1A4D5E6F7A8B9C) — The closest thing to Effective Fortran — style conventions and idioms for F2003+ codebases.
- [MPI Forum + OpenCoarrays](https://www.mpi-forum.org/ and https://opencoarrays.org/) — MPI standard (for distributed HPC) and OpenCoarrays (coarray runtime for gfortran). The two parallelism stacks you'll actually meet.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| integer(int32) :: n | 32-bit signed integer from iso_fortran_env; standard portable integer. | Counters, indices, small magnitudes (~±2.1e9). |
| integer(int64) :: n | 64-bit signed integer; required for >2.1e9 counts (large arrays, big loops). | Array sizes over 2 billion, file offsets, nanosecond timestamps. |
| real(real32) :: x | Single-precision IEEE 754 (4 bytes, ~7 digits). | GPUs, single-precision BLAS, when memory bandwidth matters more than precision. |
| real(real64) :: x | Double-precision IEEE 754 (8 bytes, ~15-16 digits). Default for scientific work. | All scientific/numerical code; never use bare real without kind. |
| complex(real64) :: z | Pair of real64 (real, imag); z%re / z%im in F2003+, or real(z)/aimag(z). | FFT, quantum mechanics, signal processing. |
| logical :: flag | Boolean (.true. / .false.); default kind is processor-dependent (usually 32-bit). | Flags, conditionals. Use logical(kind=8) only for C interop. |
| character(len=N) :: s | Fixed-length string of N characters; shorter assigned values are space-padded. | All text. Fixed-length is the default; trim() removes trailing spaces. |
| character(len=:), allocatable :: s | Deferred-length string (F2003); s = 'abc' allocates to fit; s = s // 'def' grows. | Dynamic strings (rare in legacy code, idiomatic in modern). |
| type(c_ptr) :: p | Opaque C pointer from iso_c_binding; c_loc() takes the address, c_f_pointer() derefs. | All C-interop involving pointers; rare in pure-Fortran code. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| real(real64) :: A(10) | Explicit-shape 1D array of length 10; static allocation. | Small fixed-size arrays; rarely used for large data. |
| real(real64), allocatable :: A(:,:) | Deferred-shape allocatable 2D array; allocate(A(n,m)) at runtime, auto-freed on scope exit (F2003). | All non-trivial arrays. The modern default. |
| real(real64) :: A(:) | Assumed-shape array (dummy arg only); inherits shape from caller. Requires explicit interface. | Subroutine/function arguments; pass-by-reference with no copy. |
| real(real64), pointer :: p(:) | Array pointer — p => A(3:8) aliases a slice. Use sparingly; allocatables are usually better. | Slice aliasing, hand-rolled data structures (linked lists). |
| type(point) :: pts(100) | Array of derived types — 100 instances of type(point); array syntax works on them. | Particle systems, mesh nodes, structured collections of records. |
| integer, parameter :: xs(3) = [1, 2, 3] | Array constant via array constructor [...]; parameter makes it compile-time. | Lookup tables, fixed configurations. |
| real(real64) :: x[*] | Coarray — one copy per image (process); x[i] accesses image i's copy via one-sided RDMA. | PGAS parallelism (F2008+); alternative to MPI for distributed arrays. |
| character(len=:), allocatable :: lines(:) | Array of deferred-length strings — useful for reading variable-length lines. | File readers, log processors; before F2003 you had to track lengths manually. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| type :: T   real :: x end type | Derived type — a struct; instances via type(T) :: instance. | Domain modeling; the basic building block for user data. |
| type, abstract :: T | Abstract type — cannot be instantiated; can have deferred (abstract) type-bound procedures. | Interfaces / abstract base classes (F2003+). |
| type, extends(T) :: S | Inheritance — S inherits all components of T; polymorphism via class(T). | OO hierarchies; class(T) vars can hold any subtype. |
| type :: T contains   procedure :: m end type | Type-bound procedure — method on T; call instance%m(args). Passes instance as first arg. | OO in Fortran; the equivalent of a class method. |
| generic :: write => write_t | Generic binding — calls write_t under the generic name write; overloading for derived types. | Operator overloading + generic interfaces inside types. |
| interface operator(.add.)   module procedure add_t end interface | Defined operator — overloads .add. to call add_t on user types. | Math-like APIs for user types (vectors, matrices, quantities). |
| module geom   implicit none   private   public :: area | Module = namespace + encapsulation; private/public control visibility. | All non-trivial code organization; replaces COMMON blocks. |
| enum, bind(C)   enumerator :: red, green, blue end enum | C-compatible enum (F2003); named integer constants with sequential values. | Interoperating with C enums; replaces parameter constants for closed sets. |
| type :: matrix(k)   integer, kind :: k   real(k), allocatable :: data(:,:) end type | Parameterized derived type — kind k is a type parameter; type(matrix(real64)) instantiates. | Generic containers (precision-parametric matrices); rare but powerful (F2003). |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| a + b, a - b, a * b, a / b | Arithmetic — element-wise on arrays; integer division truncates toward zero. | All numeric math. Use array syntax instead of explicit loops when possible. |
| a ** b | Exponentiation — integer exponent is exact; real exponent uses pow(). | Powers. For squares use a*a (faster, more accurate). |
| s1 // s2 | String concatenation — character strings only; result length is len(s1)+len(s2). | Building strings. Use trim(s1) // s2 to drop trailing spaces. |
| a == b, a /= b | Equality / inequality (modern form). Also .eq. / .ne. (legacy). | All comparisons. Use modern ==, /= — equivalent but more readable. |
| a < b, a <= b, a > b, a >= b | Relational (modern form). Also .lt. .le. .gt. .ge. (legacy). | Comparisons; element-wise on arrays producing logical arrays. |
| a .and. b, a .or. b | Logical AND/OR — operands must be logical; element-wise on logical arrays. | Boolean logic. No short-circuit (both sides evaluated — historical gotcha). |
| .not. a | Logical NOT — unary; .not. .true. is .false.. | Inverting flags. |
| a .eqv. b, a .neqv. b | Logical equivalence / non-equivalence — XNOR / XOR on logicals. | Comparing two logical values for equality; .eqv. is the 'logical =='. |
| matmul(A, B) | Matrix multiplication — A(m,k) x B(k,n) -> C(m,n); dispatches to BLAS dgemm on large arrays. | Linear algebra. Faster than nested loops; column-major required. |
| dot_product(u, v) | Vector dot product — sum(u_i * v_i); 1D arrays of same length. | Inner products; faster than explicit sum(u*v). |
| A * B | Element-wise (Hadamard) product — arrays of the same shape; NOT matmul. | Element-wise math; the difference from matmul is a classic beginner confusion. |
| merge(t, f, mask) | Element-wise conditional — t where mask is true, f elsewhere. | Vectorized if; replaces element-wise if in loops. |
| sum(A), product(A) | Reductions — sum/product of all elements; sum(A, dim=1) is per-column. | Aggregations; dim= produces lower-rank result. |
| a % b | Derived-type component access — instance%field, instance%method(args). | All derived-type access; the only member access operator. |

## Input / Output

**List-directed vs formatted output**

```fortran
program demo_io
  use iso_fortran_env, only: real64
  implicit none
  real(real64) :: x = 3.14159265358979_real64
  integer :: n = 42

  ! List-directed: compiler picks the format. Easy but ugly.
  print *, 'x = ', x, ' n = ', n

  ! Formatted: explicit format string.
  ! F10.4 = float, 10 wide, 4 decimals.
  ! I0    = integer, minimum width.
  ! ES15.8 = scientific, 15 wide, 8 decimals after the point.
  write(*, '(A, F10.4, A, I0, A, ES15.8)') &
      'x = ', x, ' n = ', n, ' sci = ', x

  ! Reading: same syntax, list-directed is common for interactive input.
  ! read(*, *) x   ! user types a number
end program
```

**File I/O with iostat for error checking**

```fortran
module file_io
  use iso_fortran_env, only: real64
  implicit none
  private
  public :: read_column

contains
  subroutine read_column(path, data, stat, msg)
    character(len=*), intent(in) :: path
    real(real64), allocatable, intent(out) :: data(:)
    integer, intent(out) :: stat
    character(len=:), allocatable, intent(out) :: msg
    integer :: unit, n, i

    ! newunit= gives a free unit number automatically.
    open(newunit=unit, file=path, status='old', action='read', &
        iostat=stat)
    if (stat /= 0) then
      msg = 'cannot open ' // path
      return
    end if

    read(unit, *, iostat=stat) n
    if (stat /= 0 .or. n < 0) then
      msg = 'bad count line'
      close(unit)
      return
    end if

    allocate(data(n))
    do i = 1, n
      read(unit, *, iostat=stat) data(i)
      if (stat /= 0) then
        write(msg, '(A,I0)') 'short read at line ', i
        exit
      end if
    end do

    close(unit)
  end subroutine
end module

! Always pass iostat= on every open/read/write. Without it, I/O errors
! terminate the program with no traceback.
```

**Namelist — tagged config files, perfect for input decks**

```fortran
program namelist_demo
  use iso_fortran_env, only: real64
  implicit none
  real(real64) :: alpha, beta
  integer :: max_iter
  logical :: verbose
  character(len=64) :: output_file

  ! Group variables under a named namelist.
  namelist /params/ alpha, beta, max_iter, verbose, output_file

  ! Defaults.
  alpha = 1.0_real64; beta = 0.0_real64
  max_iter = 100; verbose = .false.; output_file = 'out.txt'

  ! Config file syntax:
  !   &params
  !     alpha = 0.5
  !     beta  = 1.0e-3
  !     max_iter = 5000
  !     verbose = .true.
  !     output_file = 'results.dat'
  !   /

  open(unit=10, file='input.nml', status='old', action='read')
  read(10, nml=params)
  close(10)

  write(*, nml=params)        ! echo back to stdout

  ! Namelist handles types, comments (!), and partial overrides.
  ! Used in every weather/climate model input deck.
```

**Unformatted stream I/O — fast binary, no format overhead**

```fortran
module binary_io
  use iso_fortran_env, only: real64, int64
  implicit none
  private
  public :: write_matrix, read_matrix

contains
  subroutine write_matrix(path, A)
    character(len=*), intent(in) :: path
    real(real64), intent(in) :: A(:,:)
    integer :: u
    open(newunit=u, file=path, access='stream', form='unformatted', &
        status='replace', action='write')
    write(u) size(A, 1, kind=int64), size(A, 2, kind=int64)
    write(u) A                      ! contiguous bytes
    close(u)
  end subroutine

  subroutine read_matrix(path, A, stat)
    character(len=*), intent(in) :: path
    real(real64), allocatable, intent(out) :: A(:,:)
    integer, intent(out) :: stat
    integer :: u, m, n
    open(newunit=u, file=path, access='stream', form='unformatted', &
        status='old', action='read', iostat=stat)
    if (stat /= 0) return
    read(u, iostat=stat) m, n
    if (stat /= 0) then; close(u); return; end if
    allocate(A(m, n))
    read(u, iostat=stat) A
    close(u)
  end subroutine
end module

! access='stream'    = byte stream (no record markers).
! form='unformatted' = raw binary, no format string.
! 1M doubles: ~8MB unformatted vs ~16MB formatted text, 5-10x faster.
```

## Loops & Iteration

**do / end do — counted loop with step**

```fortran
program do_demo
  implicit none
  integer :: i
  real :: acc

  ! Counted do: do var = start, end [, step]
  do i = 1, 10
    print *, i
  end do

  ! Step is optional (default 1); can be negative.
  do i = 10, 1, -1
    print *, 'countdown:', i
  end do

  ! Accumulator pattern.
  acc = 0.0
  do i = 1, 100
    acc = acc + 1.0 / real(i)
  end do
  print *, 'harmonic sum:', acc

  ! cycle / exit (like continue / break in other languages).
  do i = 1, 100
    if (mod(i, 2) == 0) cycle        ! skip evens
    if (i > 20) exit                 ! stop early
    print *, i
  end do
end program
```

**do concurrent — parallel iteration with reduce**

```fortran
program doconcurrent_demo
  use iso_fortran_env, only: real64
  implicit none
  integer, parameter :: n = 10**7
  real(real64), allocatable :: a(:), b(:), c(:)
  real(real64) :: s
  integer :: i

  allocate(a(n), b(n), c(n))
  call random_number(a); call random_number(b)

  ! do concurrent (F2008) hints to the compiler that iterations are
  ! independent — it can vectorize AND parallelize. F2018 added reduce().
  s = 0.0_real64
  do concurrent (i=1:n) reduce(+:s)
    c(i) = a(i) + b(i)
    s = s + c(i)
  end do

  print *, 'sum:', s

  ! Compile with -fopenmp (gfortran) or -parallel (ifx) to actually
  ! parallelize. Without it, behaves like a normal do loop. Less powerful
  ! than OpenMP pragmas but portable across compilers.
end program
```

**do while + implied-do array constructor**

```fortran
program while_demo
  use iso_fortran_env, only: real64
  implicit none
  real(real64) :: x
  integer :: iter

  ! do while — pre-test loop.
  x = 2.0_real64; iter = 0
  do while (x > 1.0e-6_real64 .and. iter < 100)
    x = x * 0.5_real64
    iter = iter + 1
  end do
  print *, 'halved', iter, 'times, x =', x

  ! Implied-do inside array constructor — compact array building.
  block
    integer :: j
    integer, parameter :: sq(10) = [ (j*j, j=1, 10) ]
    print *, sq          ! 1 4 9 16 25 36 49 64 81 100
  end block

  ! Implied-do in I/O lists too:
  !   print *, (i, i**2, i=1, 5)
  ! prints: 1 1  2 4  3 9  4 16  5 25
end program
```

**where / forall — masked whole-array operations**

```fortran
subroutine clip_and_log(a, threshold)
  use iso_fortran_env, only: real64
  real(real64), intent(inout) :: a(:)
  real(real64), intent(in) :: threshold
  real(real64), allocatable :: logged(:)
  integer :: i

  ! where — masked whole-array assignment. Vectorized if-then-else.
  where (a > threshold)
    a = threshold
  elsewhere (a < -threshold)
    a = -threshold
  elsewhere
    a = 0.0_real64
  end where

  ! forall — masked concurrent assignment (F95, somewhat deprecated
  ! in favor of do concurrent in F2008+ but still common).
  allocate(logged(size(a)))
  forall (i = 1:size(a))
    logged(i) = log(max(a(i), 1.0e-12_real64))
  end forall
end subroutine

! Use where for vectorized conditionals; use do concurrent for general
! parallelizable loops. forall is similar to do concurrent but more
! restricted (single assignment per iteration).
```

## Functions & Callables

**Subroutine with intent(in/out/inout) — the workhorse**

```fortran
module linalg
  use iso_fortran_env, only: real64
  implicit none
  private
  public :: axpy, norm2

contains
  subroutine axpy(alpha, x, y)
    ! y = alpha * x + y  (BLAS axpy pattern)
    real(real64), intent(in)    :: alpha
    real(real64), intent(in)    :: x(:)
    real(real64), intent(inout) :: y(:)
    integer :: i
    if (size(x) /= size(y)) error stop 'axpy: size mismatch'
    do i = 1, size(x)
      y(i) = y(i) + alpha * x(i)
    end do
  end subroutine

  function norm2(x) result(r)
    real(real64), intent(in) :: x(:)
    real(real64) :: r
    r = sqrt(sum(x*x))
  end function
end module

! intent(in)    — read-only; compiler optimizes, caller's data is safe.
! intent(out)   — written; value on entry is undefined.
! intent(inout) — read AND written; classic accumulator / updater.
! Omitting intent is legal but disables optimization and safety.
```

**pure + elemental — side-effect-free + array-callable**

```fortran
module math_funcs
  use iso_fortran_env, only: real64
  implicit none
  private
  public :: sigmoid, clamp

contains
  ! pure: no side effects, no I/O, no stop. Enables optimization.
  ! elemental: callable on scalars OR arrays of any rank.
  pure elemental function sigmoid(x) result(y)
    real(real64), intent(in) :: x
    real(real64) :: y
    y = 1.0_real64 / (1.0_real64 + exp(-x))
  end function

  pure elemental function clamp(x, lo, hi) result(y)
    real(real64), intent(in) :: x, lo, hi
    real(real64) :: y
    y = max(lo, min(x, hi))
  end function
end module

! Usage:
!   real(real64) :: a(100), b(100)
!   b = sigmoid(a)              ! element-wise; compiler vectorizes
!   b = clamp(b, 0.0_real64, 1.0_real64)
! Both pure AND elemental lets the compiler fuse, vectorize, parallelize.
```

**Generic interface + operator overloading**

```fortran
module vec_math
  use iso_fortran_env, only: real64
  implicit none
  private
  public :: vec3, operator(.dot.), add

  type :: vec3
    real(real64) :: x, y, z
  end type

  ! Generic interface — overload operator(.dot.) to call dot_vec3.
  interface operator(.dot.)
    module procedure dot_vec3
  end interface

  ! Generic name 'add' dispatches by argument type.
  interface add
    module procedure add_vec3
    module procedure add_real         ! different signature
  end interface

contains
  function dot_vec3(a, b) result(r)
    type(vec3), intent(in) :: a, b
    real(real64) :: r
    r = a%x*b%x + a%y*b%y + a%z*b%z
  end function

  function add_vec3(a, b) result(c)
    type(vec3), intent(in) :: a, b
    type(vec3) :: c
    c = vec3(a%x+b%x, a%y+b%y, a%z+b%z)
  end function

  function add_real(a, b) result(c)
    real(real64), intent(in) :: a, b
    real(real64) :: c
    c = a + b
  end function
end module

! Usage:
!   type(vec3) :: u, v
!   real(real64) :: d
!   d = u .dot. v          ! custom operator
!   ! c = add(u, v)        ! generic dispatch by type
```

**Type-bound procedures — OO methods on derived types**

```fortran
module stack_mod
  implicit none
  private
  public :: stack_t

  type :: stack_t
    integer, allocatable :: data(:)
    integer :: top = 0
  contains
    procedure :: push
    procedure :: pop
    procedure :: is_empty
    procedure :: free
    final :: finalize          ! destructor: called on scope exit
  end type

contains
  subroutine push(self, x)
    class(stack_t), intent(inout) :: self
    integer, intent(in) :: x
    integer, allocatable :: tmp(:)
    if (.not. allocated(self%data)) then
      allocate(self%data(16))
      self%top = 0
    end if
    if (self%top == size(self%data)) then
      ! grow by doubling; move_alloc hands off memory without copy
      allocate(tmp(size(self%data) * 2))
      tmp(1:size(self%data)) = self%data
      call move_alloc(tmp, self%data)
    end if
    self%top = self%top + 1
    self%data(self%top) = x
  end subroutine

  integer function pop(self) result(x)
    class(stack_t), intent(inout) :: self
    if (self%is_empty()) error stop 'pop from empty stack'
    x = self%data(self%top)
    self%top = self%top - 1
  end function

  logical function is_empty(self) result(r)
    class(stack_t), intent(in) :: self
    r = self%top == 0
  end function

  subroutine free(self)
    class(stack_t), intent(inout) :: self
    if (allocated(self%data)) deallocate(self%data)
    self%top = 0
  end subroutine

  subroutine finalize(self)
    type(stack_t), intent(inout) :: self
    if (allocated(self%data)) deallocate(self%data)
  end subroutine
end module

! class(stack_t) = polymorphic (accepts stack_t or any subtype).
! type(stack_t)  = exact type. Use class() in methods, type() in final.
! final is the destructor — called automatically when the instance
! goes out of scope (F2003).
```

## Error Handling

**iostat — error codes for I/O operations**

```fortran
program iostat_demo
  use iso_fortran_env, only: real64
  implicit none
  integer :: u, stat, n
  real(real64), allocatable :: xs(:)

  ! iostat: 0 = OK, >0 = error code, <0 = end-of-file / end-of-record.
  open(newunit=u, file='data.txt', status='old', action='read', iostat=stat)
  if (stat /= 0) then
    print *, 'open failed with iostat=', stat
    stop 1
  end if

  read(u, *, iostat=stat) n
  if (stat /= 0 .or. n < 0) then
    print *, 'bad count: stat=', stat
    close(u); stop 1
  end if

  allocate(xs(n))
  read(u, *, iostat=stat) xs
  if (stat /= 0) then
    print *, 'data read failed: stat=', stat
    close(u); stop 1
  end if
  close(u)

  print *, 'read', n, 'values, first =', xs(1)
end program

! Every read/write/open can take iostat=var. NEVER ignore it in
! production code — without it, I/O errors terminate the program.
```

**error stop vs stop — exit codes**

```fortran
program stop_demo
  implicit none
  integer :: stat

  call do_work(stat)
  if (stat /= 0) then
    ! error stop: terminates ALL images (coarray-aware), exit code nonzero.
    ! 'stop' (without error) is for normal termination.
    error stop 'do_work failed'
  end if

  ! stop with an exit code (F2008+):
  !   stop 0       ! success
  !   stop 2       ! application-specific failure code
  !   stop 'msg'   ! prints msg, exit code 0
  !   error stop 'msg'  ! prints msg, exit code nonzero
  stop 0
contains
  subroutine do_work(s)
    integer, intent(out) :: s
    s = 0
    ! In libraries: return error codes. Use error stop only for truly
    ! unrecoverable situations (bad input, contract violation).
  end subroutine
end program
```

**IEEE floating-point exceptions**

```fortran
program ieee_demo
  use iso_fortran_env, only: real64, ieee_arithmetic
  implicit none
  real(real64) :: a, b, c

  ! Check for IEEE support.
  if (.not. ieee_support_flag(ieee_divide_by_zero)) then
    print *, 'IEEE flags not supported'
    stop 1
  end if

  ! Halting mode: by default, divide-by-zero is silent (returns Inf).
  ! Some compilers offer -ffpe-trap=zero,overflow,invalid (gfortran)
  ! to turn these into runtime SIGFPE crashes during development.

  a = 1.0_real64
  b = 0.0_real64
  c = a / b              ! +Inf, no crash by default

  if (ieee_is_finite(c)) then
    print *, 'got finite result:', c
  else
    print *, 'non-finite result (Inf or NaN)'
    if (ieee_is_nan(c)) print *, '  NaN'
    if (.not. ieee_is_finite(c)) print *, '  Inf'
  end if

  ! For production: check ieee_is_nan / ieee_is_finite at API boundaries.
  ! For development: compile with -ffpe-trap=invalid,zero,overflow to
  ! catch silent numerical errors at the source.
end program
```

**allocate stat= + command_argument_count — defensive patterns**

```fortran
program defensive
  use iso_fortran_env, only: real64
  implicit none
  real(real64), allocatable :: big(:)
  integer :: stat, n, argc
  character(len=256) :: arg
  character(len=:), allocatable :: errmsg

  ! Check command-line args before touching them.
  argc = command_argument_count()
  if (argc < 1) then
    print *, 'usage: prog N'
    stop 1
  end if
  call get_command_argument(1, arg)
  read(arg, *) n

  ! allocate with stat= and errmsg= (F2003+) — never let allocation fail
  ! silently. errmsg is allocatable deferred-length.
  allocate(big(n), stat=stat, errmsg=errmsg)
  if (stat /= 0) then
    print *, 'allocate failed: ', trim(errmsg)
    stop 1
  end if

  call random_number(big)
  print *, 'allocated', size(big), 'doubles, sum=', sum(big)

  deallocate(big)
end program

! Compile with -fcheck=all (gfortran) for bounds + pointer + recursion
! checks at runtime. -fsanitize=address (gfortran 12+) for memory errors.
```

## Concurrency Model

**Coarrays — built-in PGAS parallelism**

```fortran
program coarray_pi
  use iso_fortran_env, only: real64
  implicit none
  real(real64) :: local_pi, pi[*]    ! coarray: one copy per image
  integer :: i, n, me, np

  me = this_image()                   ! 1-based image ID
  np = num_images()                   ! total images
  n = 10**8

  ! Each image computes its slice of the work.
  local_pi = compute_slice(me, np, n)
  pi = local_pi                       ! write to local copy

  sync all                            ! barrier: wait for all images

  ! Image 1 gathers partial sums from every other image.
  if (me == 1) then
    do i = 2, np
      pi = pi + pi[i]                 ! one-sided read from image i
    end do
    pi = pi / real(np, real64)
    print *, 'pi =', pi
  end if

contains
  function compute_slice(me, np, n) result(s)
    integer, intent(in) :: me, np, n
    real(real64) :: s, x
    integer :: i
    s = 0.0_real64
    do i = me, n, np                  ! strided across images
      x = (real(i - 1, real64) + 0.5_real64) / real(n, real64)
      s = s + 4.0_real64 / (1.0_real64 + x*x)
    end do
    s = s / real(n, real64)
  end function
end program

! Build (gfortran + OpenCoarrays):
!   caf pi.f90 -o pi && cafrun -n 4 ./pi
! Coarrays are an alternative to MPI for new code; coarray syntax is
! in-language but performance characteristics differ from MPI_Allreduce.
```

**do concurrent with reduce — compiler-driven parallelism**

```fortran
subroutine heat_step(u, u_new, alpha, dt, dx)
  use iso_fortran_env, only: real64
  real(real64), intent(in)    :: u(:,:)
  real(real64), intent(out)   :: u_new(:,:)
  real(real64), intent(in)    :: alpha, dt, dx
  integer :: i, j, nx, ny
  real(real64) :: coef, max_delta

  nx = size(u, 1); ny = size(u, 2)
  coef = alpha * dt / (dx*dx)
  max_delta = 0.0_real64

  ! do concurrent tells the compiler iterations are independent.
  ! reduce(max:...) declares a max-reduction across iterations.
  ! F2018 syntax; -fopenmp or -parallel enables actual threading.
  do concurrent (i=2:nx-1, j=2:ny-1) reduce(max:max_delta)
    u_new(i,j) = u(i,j) + coef * ( &
        u(i+1,j) + u(i-1,j) + u(i,j+1) + u(i,j-1) - 4.0_real64*u(i,j))
    max_delta = max(max_delta, abs(u_new(i,j) - u(i,j)))
  end do

  ! Boundaries unchanged (Dirichlet).
  u_new(1,:) = u(1,:); u_new(nx,:) = u(nx,:)
  u_new(:,1) = u(:,1); u_new(:,ny) = u(:,ny)
end subroutine

! Note: do concurrent is a hint. Without -fopenmp it's serial.
! For real performance, OpenMP directives give finer control.
```

**OpenMP — the HPC default for shared-memory parallelism**

```fortran
subroutine dgemm_simple(A, B, C, m, n, k)
  use iso_fortran_env, only: real64
  integer, intent(in) :: m, n, k
  real(real64), intent(in)  :: A(m,k), B(k,n)
  real(real64), intent(out) :: C(m,n)
  integer :: i, j, l

  !$omp parallel do collapse(2) default(none) &
  !$omp shared(A,B,C,m,n,k) private(i,j,l) schedule(static)
  do j = 1, n
    do i = 1, m
      C(i,j) = 0.0_real64
      do l = 1, k
        C(i,j) = C(i,j) + A(i,l) * B(l,j)
      end do
    end do
  end do
  !$omp end parallel do
end subroutine

! Compile: gfortran -fopenmp -O3 -march=native dgemm.f90
! Run: OMP_NUM_THREADS=8 ./a.out
!
! collapse(2): fold the i,j loops into one big iteration space.
! schedule(static): divide iterations evenly (best for uniform work).
! default(none): force explicit sharing — catches data races at compile.
! In production: call BLAS dgemm instead of writing this yourself.
```

**MPI — distributed parallelism (the HPC default)**

```fortran
program mpi_pi
  use mpi
  use iso_fortran_env, only: real64
  implicit none
  integer :: ierr, rank, nprocs, i, n
  real(real64) :: local_sum, global_sum, pi

  call mpi_init(ierr)
  call mpi_comm_rank(mpi_comm_world, rank, ierr)
  call mpi_comm_size(mpi_comm_world, nprocs, ierr)

  n = 10**8

  ! Each rank computes its strided slice.
  local_sum = 0.0_real64
  do i = rank+1, n, nprocs
    block
      real(real64) :: x
      x = (real(i - 1, real64) + 0.5_real64) / real(n, real64)
      local_sum = local_sum + 4.0_real64 / (1.0_real64 + x*x)
    end block
  end do
  local_sum = local_sum / real(n, real64)

  ! All-reduce sums across ranks; everyone gets the global total.
  call mpi_allreduce(local_sum, global_sum, 1, mpi_double, &
      mpi_sum, mpi_comm_world, ierr)

  if (rank == 0) print *, 'pi =', global_sum
  call mpi_finalize(ierr)
end program

! Compile: mpif90 -O3 pi.f90 -o pi
! Run: mpirun -np 4 ./pi
! MPI is the standard for distributed HPC. Coarrays are simpler but
! MPI has more libraries (PETSc, Trilinos) and 25+ years of tuning.
```

## Testing Patterns

**pFUnit — xUnit-style framework (the de facto standard)**

```fortran
! pFUnit example. Needs the pFUnit library.
! https://github.com/Goddard-Fortran-Ecosystem/pFUnit
module math_test
  use pFUnit_mod
  use math_mod, only: sigmoid, clamp
  implicit none

contains
  @test
  subroutine test_sigmoid_at_zero()
    ! sigmoid(0) should be exactly 0.5
    @assertEqual(0.5_real64, sigmoid(0.0_real64), &
        tolerance=1.0e-15_real64)
  end subroutine

  @test
  subroutine test_clamp_below()
    @assertEqual(0.0_real64, clamp(-1.0_real64, 0.0_real64, 1.0_real64))
  end subroutine

  @test
  subroutine test_clamp_above()
    @assertEqual(1.0_real64, clamp(2.0_real64, 0.0_real64, 1.0_real64))
  end subroutine

  @test
  subroutine test_clamp_in_range()
    @assertEqual(0.5_real64, clamp(0.5_real64, 0.0_real64, 1.0_real64))
  end subroutine
end module

! Build with pFUnit's CMake integration:
!   add_pfunit_test(math_test math_test.pf)
! The @test / @assertEqual macros are pFUnit preprocessor directives.
```

**Hand-rolled assertion module — no dependencies**

```fortran
module assertions
  use iso_fortran_env, only: real64
  implicit none
  private
  public :: assert_equal, assert_true, assert_approx, get_failures

  integer :: failure_count = 0

contains
  subroutine assert_equal(actual, expected, msg)
    integer, intent(in) :: actual, expected
    character(len=*), intent(in) :: msg
    if (actual /= expected) then
      print *, 'FAIL: ', msg, ' expected=', expected, ' actual=', actual
      failure_count = failure_count + 1
    else
      print *, 'PASS: ', msg
    end if
  end subroutine

  subroutine assert_true(cond, msg)
    logical, intent(in) :: cond
    character(len=*), intent(in) :: msg
    if (.not. cond) then
      print *, 'FAIL: ', msg
      failure_count = failure_count + 1
    else
      print *, 'PASS: ', msg
    end if
  end subroutine

  subroutine assert_approx(a, b, tol, msg)
    real(real64), intent(in) :: a, b, tol
    character(len=*), intent(in) :: msg
    if (abs(a - b) > tol) then
      print *, 'FAIL: ', msg, ' expected=', b, ' actual=', a, &
          ' diff=', abs(a-b)
      failure_count = failure_count + 1
    else
      print *, 'PASS: ', msg
    end if
  end subroutine

  function get_failures() result(n)
    integer :: n
    n = failure_count
  end function
end module

program test_math
  use assertions
  use math_mod, only: sigmoid
  use iso_fortran_env, only: real64
  implicit none

  call assert_approx(sigmoid(0.0_real64), 0.5_real64, 1.0e-15_real64, &
      'sigmoid(0)=0.5')
  call assert_true(sigmoid(10.0_real64) > 0.999_real64, 'sigmoid(10)~1')

  if (get_failures() > 0) then
    print *, get_failures(), ' test(s) failed'
    error stop 1
  end if
  print *, 'all tests passed'
end program
```

**Floating-point comparison helper — relative tolerance**

```fortran
module float_compare
  use iso_fortran_env, only: real64
  implicit none
  private
  public :: nearly_equal, default_tol

  real(real64), parameter :: default_tol = 1.0e-12_real64

contains
  ! Compares two reals with a RELATIVE tolerance — handles scale.
  !   nearly_equal(1.0e20, 1.0e20+1.0e5)  ->  .true.  (rel diff tiny)
  !   nearly_equal(1.0e-20, 2.0e-20)      ->  .false. (100% relative diff)
  function nearly_equal(a, b, tol) result(r)
    real(real64), intent(in) :: a, b
    real(real64), intent(in), optional :: tol
    logical :: r
    real(real64) :: t, diff, scale

    if (present(tol)) then
      t = tol
    else
      t = default_tol
    end if

    ! Handle Inf and NaN explicitly.
    if (a == b) then
      r = .true.
      return
    end if

    diff = abs(a - b)
    scale = max(abs(a), abs(b))
    if (scale == 0.0_real64) then
      r = diff < t           ! both zero — compare absolute
    else
      r = (diff / scale) < t ! relative comparison
    end if
  end function
end module

! Use this in tests instead of ==, which is wrong for floats:
!   if (nearly_equal(result, expected, 1.0e-10_real64)) ...
```

**Numerical test — verify physics conservation laws**

```fortran
program test_conservation
  use iso_fortran_env, only: real64
  use assertions, only: assert_approx
  use physics_mod, only: step_verlet, body_t
  implicit none
  type(body_t) :: a, b
  real(real64) :: e0, e1, dt

  ! Two-body gravity, conservation of energy + momentum.
  a%pos = [0.0_real64, 0.0_real64, 0.0_real64]
  a%vel = [0.0_real64, 0.0_real64, 0.0_real64]
  a%mass = 1.0_real64
  b%pos = [1.0_real64, 0.0_real64, 0.0_real64]
  b%vel = [0.0_real64, 1.0_real64, 0.0_real64]
  b%mass = 1.0_real64

  e0 = total_energy(a, b)
  dt = 0.001_real64
  call step_verlet(a, b, dt, 1000)     ! 1000 timesteps
  e1 = total_energy(a, b)

  ! Energy should be conserved to ~1% over a short integration.
  call assert_approx(e1, e0, abs(e0)*1.0e-2_real64, &
      'energy conservation over 1000 steps')
contains
  function total_energy(p, q) result(e)
    type(body_t), intent(in) :: p, q
    real(real64) :: e
    real(real64) :: r(3)
    r = q%pos - p%pos
    ! KE + PE: G=1, m1*m2=1.
    e = 0.5_real64 * p%mass * sum(p%vel**2) &
      + 0.5_real64 * q%mass * sum(q%vel**2) &
      - p%mass * q%mass / sqrt(sum(r*r))
  end function
end program

! Conservation laws are the strongest numerical invariant: energy,
! momentum, mass, charge. A drift signals a bug in the integrator.
```

## Performance Tuning

- Fortran arrays are column-major: A(i,j) at offset (i-1) + (j-1)*n. The inner loop should iterate over the FIRST index for sequential memory access — easily 5-10x faster on large arrays.
- Cache line is 64 bytes on x86/ARM = 8 doubles. Sequential reads prefetch the next line; strided reads waste 7/8 of each fetch.
- matmul(A, B) dispatches to BLAS dgemm when arrays are large — typically 5-50x faster than nested do loops. Always use matmul instead of hand-rolled multiply.
- Whole-array ops (A = B + C) compile to vectorized loops; gfortran -fopt-info-vec shows what got vectorized. -O3 -march=native unlocks AVX/SSE.
- Allocatable arrays are tracked by the compiler; their finalization is automatic. Pointers are opaque — the compiler can't optimize across them. Prefer allocatable 99% of the time.
- intent(in) is a contract: the compiler can assume the argument is not modified, enabling alias analysis and better optimization. intent(inout) is more conservative.
- pure / elemental functions can be inlined and vectorized; non-pure functions block optimization because of side effects. Mark pure wherever correct.
- do concurrent is a hint — without -fopenmp or -parallel it runs serial. OpenMP directives give finer control (collapse, schedule, reduction).
- Coarray sync (sync all, sync images) is expensive — ~10-100us per barrier. Batch remote accesses to amortize the cost; don't sync inside hot loops.
- Reallocate-on-assign (F2003): 'A = [A, x]' grows A by reallocating — O(n) per call. For incremental growth, double capacity manually or use move_alloc.
- Assumed-shape arrays A(:) require an explicit interface (module or interface block). Without it, the compiler silently mis-passes the descriptor — garbage or crashes.
- Allocate big arrays ONCE at startup, not inside loops. allocate/deallocate are ~us-scale; in a 1M-iteration loop that's seconds wasted.
- gfortran -ffpe-trap=invalid,zero,overflow turns silent NaN/Inf into SIGFPE during development — catches numerical bugs at the source. Remove in production (perf hit).
- Unformatted stream I/O is 5-10x faster than formatted text I/O — no parsing, no format conversion. Use binary for checkpoints and intermediate results; text only for human-readable output.
- where and forall statements are CONCURRENT — the RHS is fully evaluated before assignment. They're NOT shortcuts for sequential if/else; don't use them for stencil updates with dependencies.
- ifx/ifort auto-dispatches matmul and most array intrinsics to MKL BLAS. gfortran does not — link -lblas explicitly or use -fexternal-blas.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [gfortran](https://gcc.gnu.org/fortran/) | GNU Fortran compiler — free, mature, part of GCC. Supports F2018 + most of F2023. Default on Linux/macOS. | build |
| [ifx / ifort](https://www.intel.com/content/www/us/en/developer/tools/oneapi/fortran-compiler.html) | Intel Fortran — best-in-class for x86 HPC, auto-dispatches to MKL. ifx (OneAPI) replaces ifort; both free since 2024. | build |
| [nvfortran](https://developer.nvidia.com/hpc-sdk) | NVIDIA HPC SDK Fortran — best CUDA Fortran + OpenACC support. Free for non-commercial use. | build |
| [LLVM Flang](https://github.com/llvm/llvm-project/tree/main/flang) | LLVM-based Fortran compiler — modern codebase, growing adoption. Part of LLVM 17+. | build |
| [CMake](https://cmake.org/) | Build system with first-class Fortran support — handles modules, dependencies, cross-compiling. The modern standard for HPC projects. | build |
| [fpm (Fortran Package Manager)](https://fpm.fortran-lang.org/) | Cargo-like package manager + build tool for Fortran — TOML manifest, dependency resolution, simple projects without CMake. | package |
| [OpenCoarrays](https://opencoarrays.org/) | Coarray runtime for gfortran — implements F2008 coarrays on top of MPI. Required for coarray code with gfortran. | build |
| [BLAS / LAPACK](https://www.netlib.org/blas/) | The foundational linear algebra libraries — every Fortran numerical code depends on them. OpenBLAS (free), MKL (Intel), cuBLAS (NVIDIA). | build |
| [OpenMPI / MPICH](https://www.open-mpi.org/) | MPI implementations — the standard for distributed HPC. mpif90 wrapper compiles Fortran MPI code. | build |
| [HDF5](https://www.hdfgroup.org/solutions/hdf5/) | Hierarchical binary data format — the standard for large scientific datasets. Fortran API via hdf5.mod. | build |
| [NetCDF](https://www.unidata.ucar.edu/software/netcdf/) | Self-describing array-oriented format — dominates climate/weather/ocean modeling. Built on HDF5. | build |
| [pFUnit](https://github.com/Goddard-Fortran-Ecosystem/pFUnit) | xUnit-style unit testing framework for Fortran — preprocessor macros (@test, @assertEqual), CMake integration. | test |
| [Ford](https://github.com/Fortran-FOSS-Programmers/ford) | Documentation generator — Doxygen-like, parses Fortran modules/types/procedures, produces HTML. | build |
| [fortls](https://github.com/gnikit/fortls) | Language Server Protocol implementation for Fortran — autocomplete, go-to-definition, hover docs. Works with VS Code. | lint |
| [fprettify](https://github.com/plevold/fprettify) | Auto-formatter — whitespace, line continuation, alignment. The 'gofmt' for Fortran. | lint |
| [GDB](https://www.gnu.org/software/gdb/) | GNU Debugger — works with gfortran symbols. 'print a(1,2)' prints array elements; 'display' watches variables. | debug |
| [Intel VTune Profiler](https://www.intel.com/content/www/us/en/developer/tools/oneapi/vtune-profiler.html) | Intel's profiler — microarchitectural analysis, threading advisor, memory analyzer. Free for non-commercial. | debug |
| [fortran-lang.org](https://fortran-lang.org/) | Community hub — Learn tutorial, package index, Discourse forum. The friendliest on-ramp to modern Fortran. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| FORTRAN | 1957 | First Fortran released by IBM (John Backus) — the first widely-used high-level language. Fixed-form, no structured control flow. |
| FORTRAN II | 1958 | Added subroutines and functions (separate from main program). Real modularization began. |
| FORTRAN IV | 1962 | Added LOGICAL type, more control flow; the basis for FORTRAN 66 standard. |
| FORTRAN 66 (ANSI X3.9) | 1966 | First ANSI standard. Fixed-form source, no keywords as identifiers, 72-column lines. |
| FORTRAN 77 | 1978 | Added IF-THEN-ELSE, DO-WHILE, CHARACTER type. The most widely-deployed version for 20+ years; still maintained in legacy code. |
| Fortran 90 | 1991 | Free-form source (.f90), modules, derived types, allocatable arrays, dynamic memory, array syntax, recursion. The first 'modern' Fortran. |
| Fortran 95 | 1997 | Pure + elemental functions, FORALL, initial CUDA Fortran hooks. Minor refinement of F90. |
| Fortran 2003 | 2004 | Object-oriented programming (type extension, polymorphism, type-bound procedures), C interop (iso_c_binding, bind(C)), parameterized derived types, deferred-length allocatable strings, finalizers. |
| Fortran 2008 | 2010 | Coarrays (built-in PGAS parallelism), do concurrent, submodules, improvements to allocatables. The 'parallel' Fortran. |
| Fortran 2018 | 2018 | Formerly F2015. Merged TS 29113 (further C interop), high-performance messaging for coarrays, do concurrent enhancements (reduce clauses). |
| Fortran 2023 | 2023 | Generic programming (templates groundwork), redistricting of coarray features, lock/type extension enhancements. The current standard. |
| fpm 1.0 | 2023 | Fortran Package Manager hits 1.0 — first Cargo-like dependency management for Fortran. The biggest quality-of-life upgrade in decades. |
| Fortran 2023 Cor 1 | 2026 | Technical Corrigendum 1 to ISO/IEC 1539-1:2023 (published Nov 2023) lands Jan 2026; fpm mainstream for new projects; fortran-lang stdlib covers common algorithms. |

## Interview Hot Questions

1. **Why is Fortran column-major, and why does it matter?** *(medium)*

   Fortran's original 1950s design chose column-major storage: A(i,j) lives at offset (i-1) + (j-1)*n_rows, so the first index varies fastest. This means iterating the inner loop over the first index walks memory sequentially, hitting L1 cache every line. Iterating the other way strided through memory, wasting 7/8 of each 64-byte cache line and getting 5-10x slower. It matters because BLAS/LAPACK were written for column-major, and calling them from row-major C/NumPy requires transposing or using transa/transb flags.

2. **Why is `implicit none` mandatory, and what does it prevent?** *(easy)*

   Without `implicit none`, Fortran silently applies implicit typing: variables starting I-N default to integer, A-H and O-Z to real. So a typo like 'recl' instead of 'rec1' creates a new real variable and the program runs with wrong values. This was the source of countless bugs from the 1960s onward. `implicit none` forces explicit declaration of every variable. Modern compilers also offer -fimplicit-none (gfortran) to enforce it globally — turn it on for every project.

3. **What is the difference between a subroutine and a function in Fortran?** *(easy)*

   A function returns a single value via the result() clause (or the function name) and is used in expressions: y = f(x). A subroutine modifies its arguments (via intent(out)/intent(inout)) and is called with `call`: call s(x, y). Subroutines can have multiple 'outputs' through arguments; functions are pure-ish expressions. Mathematically: function = expression, subroutine = statement. Most production code uses subroutines for multi-output operations (linear algebra, I/O) and functions for transforms.

4. **When would you use allocatable vs pointer arrays?** *(medium)*

   Use allocatable for 99% of dynamic arrays. The compiler tracks them — it knows the lifetime, can auto-finalize on scope exit (F2003), and can optimize across calls because they cannot alias arbitrarily. Use pointer only when you need: (1) a slice/view of another array (p => A(3:8)), (2) a linked data structure (linked list, tree), or (3) C interop where you receive a C pointer. Pointers block alias analysis and require manual deallocation — easy to leak.

5. **How do coarrays differ from MPI, and when would you pick each?** *(hard)*

   Coarrays (F2008+) are in-language PGAS: `real :: x[*]` is one copy per image, `x[i]` reads image i's copy via one-sided RDMA. Syntax is cleaner than MPI for distributed arrays. MPI is explicit message-passing: send/recv, allreduce — more code but more control. Coarrays are simpler for new code (no MPI_Send boilerplate), but MPI has 25+ years of tuned libraries (PETSc, Trilinos, ScaLAPACK). HPC production still defaults to MPI+OpenMP; coarrays are gaining ground but slowly. Pick MPI for ecosystem, coarrays for code clarity.

6. **What does intent(in/out/inout) actually do, and why is it important?** *(medium)*

   intent declares how a dummy argument is used: intent(in) = read-only, intent(out) = written (undefined on entry), intent(inout) = read+write. It is important for THREE reasons: (1) the compiler can optimize — intent(in) means it can assume no aliasing, enabling better register allocation and vectorization; (2) it catches bugs — assigning to an intent(in) is a compile error; (3) it documents the contract for callers. Omitting intent is legal but disables all of this. Always declare intent.

7. **Compare do concurrent and OpenMP !$omp parallel do.** *(medium)*

   do concurrent (F2008+) is in-language: it tells the compiler iterations are independent and lets it choose how to parallelize — vectorization, threading, or both. With F2018 reduce() clauses, it can express reductions. But without -fopenmp, gfortran runs it serially. OpenMP `!$omp parallel do` is a directive — explicit, with collapse, schedule, reduction clauses, finer control. OpenMP is the HPC default — more verbose but more predictable. do concurrent is portable across compilers but currently less performant in practice. Use do concurrent for clean portable code, OpenMP for tuned production.

8. **Why are kind parameters (real64, int32) important, and what is wrong with `real :: x`?** *(medium)*

   `real :: x` is a 'default kind real' — processor-dependent, usually 32-bit (4 bytes, ~7 digits) but 64-bit on some legacy Cray systems. Code that 'works' on x86 fails on different architectures or with -fdefault-real-8. kind parameters (real(real64), integer(int32)) from iso_fortran_env pin the precision explicitly and portably. For C interop, use c_double / c_int from iso_c_binding. NEVER use bare `real` or `integer` in modern code — it is a portability landmine.

9. **How does the explicit interface requirement trip up Fortran beginners?** *(hard)*

   When calling a subroutine with assumed-shape arrays (A(:)), optional arguments, derived-type arguments, or generic dispatch, the compiler needs to see the procedure's signature — an 'explicit interface'. Without it (e.g., calling an external subroutine in another file with no interface block), the compiler silently mis-passes the array descriptor, and you get garbage or a crash. The fix: put procedures in modules (gives explicit interfaces automatically) or write interface blocks. Compile with -fcheck=bounds to catch this class of bug at runtime.

## When to Choose This

- **vs C:** use this — Dense linear algebra, PDE solvers, when you need array syntax + column-major layout + BLAS/LAPACK ecosystem.; use that — Systems programming, manual memory management, when you need pointers, low-level control, or massive library ecosystem.
- **vs C++:** use this — Numerical kernels where C++ templates get complicated; when you want array syntax + math-like expressions without operator-overload boilerplate.; use that — Large applications, GUI software, generic libraries, anywhere the STL and modern C++ ecosystem helps.
- **vs Julia:** use this — Maintaining legacy HPC codebases (climate, chemistry, nuclear), production LAPACK/BLAS-heavy work, when you need single-language compiled kernels.; use that — New numerical code, interactive science, when JIT compilation is acceptable and you want a modern dynamic language with C-like speed.
- **vs Python + NumPy:** use this — Performance-critical kernels where NumPy overhead matters (per-call ~1us), large HPC runs, when you cannot afford the two-language problem.; use that — Glue code, ML/data pipelines, anything where developer time matters more than runtime and the ecosystem (Pandas, PyTorch) is the value.
- **vs MATLAB:** use this — Production HPC (climate, CFD), standalone executables without licensing, large-scale MPI/coarray parallelism, anything where MATLAB's license cost matters.; use that — Interactive prototyping, signal processing, classroom teaching, when you want a REPL and plotting built-in.

