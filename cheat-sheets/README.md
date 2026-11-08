# Cheat Sheet — Complete Reference Collection

**46 expert-level cheat sheets** exported from [cheat_sheet](https://github.com/AdilShamim8/cheat_sheet) · live site: <https://cheat-sheet-drab-rho.vercel.app> · exported 2026-11-08

## { } Languages

Programming languages in active industry use, tiered by real-world prevalence.

| # | Sheet | Tier | One-liner |
| --- | --- | --- | --- |
| 1 | [Python](languages/python.md) | Tier 1 · Core | Batteries-included, dynamically-typed language — the default for scripting, data/ML, and backend services. |
| 2 | [JavaScript](languages/javascript.md) | Tier 1 · Core | The only native language of the browser — runs the web front-end and, via Node.js, a vast slice of back-ends and tooling. |
| 3 | [TypeScript](languages/typescript.md) | Tier 1 · Core | A statically-typed superset of JavaScript that compiles to portable JS — the default for large web codebases. |
| 4 | [C++](languages/cpp.md) | Tier 1 · Core | A zero-overhead, multi-paradigm systems language — the default when you need performance, control, and a vast library ecosystem at once. |
| 5 | [C](languages/c.md) | Tier 1 · Core | Portable assembly with types — the lingua franca of operating systems, embedded systems, and FFI boundaries. |
| 6 | [Java](languages/java.md) | Tier 1 · Core | A statically-typed, GC'd, JVM-based language with a vast enterprise ecosystem — the default for large back-end systems on the JVM. |
| 7 | [C#](languages/csharp.md) | Tier 1 · Core | A statically-typed, multi-paradigm .NET language — the default for Windows desktop, game engines (Unity), and modern back-ends. |
| 8 | [Go](languages/go.md) | Tier 1 · Core | A small, statically-typed, GC'd language with built-in concurrency — the default for cloud-native back-ends and CLIs. |
| 9 | [Rust](languages/rust.md) | Tier 1 · Core | A memory-safe systems language with no GC — the modern default for performance-critical, low-latency, and security-sensitive code. |
| 10 | [Ruby](languages/ruby.md) | Tier 2 · Domain | Dynamic, object-oriented language optimized for developer happiness — the engine behind Rails and a king of internal DSLs. |
| 11 | [PHP](languages/php.md) | Tier 2 · Domain | Web-first dynamic language powering ~75% of the web — shared-nothing request model, opcache-fast, with Laravel as the dominant framework. |
| 12 | [Swift](languages/swift.md) | Tier 2 · Domain | Apple's static, type-safe systems language for iOS/macOS — value semantics, protocol-oriented design, and structured concurrency. |
| 13 | [Kotlin](languages/kotlin.md) | Tier 2 · Domain | Statically-typed JVM language with null safety, coroutines, and a conciseness bias — the default for Android and a strong server-side choice via Spring/Ktor. |
| 14 | [Dart](languages/dart.md) | Tier 2 · Domain | Statically-typed, GC'd language purpose-built for UI — the engine behind Flutter, with a sound null-safety system and an isolates-based concurrency model. |
| 15 | [R](languages/r.md) | Tier 2 · Domain | Domain-specific language for statistical computing and graphics — vectorized, lazily-evaluated, and the home of ggplot2, the grammar of graphics. |
| 16 | [SQL](languages/sql.md) | Tier 2 · Domain | Declarative set-based query language for relational databases — the universal data interface, surviving four decades of NoSQL challenges. |
| 17 | [Bash / Shell](languages/bash.md) | Tier 2 · Domain | The Unix shell — glue language for processes, pipes, and files, with a footgun at every turn that bash strict mode tames. |
| 18 | [Scala](languages/scala.md) | Tier 2 · Domain | JVM language fusing OO and functional programming — strong static types, type inference, and the engine behind Apache Spark and modern data engineering. |
| 19 | [Objective-C](languages/objective-c.md) | Tier 3 · Specialized | Smalltalk-style message passing layered over C — Apple's lingua franca for Cocoa until Swift arrived. |
| 20 | [Perl](languages/perl.md) | Tier 3 · Specialized | Larry Wall's Swiss-army chainsaw — the duct tape of the early web, still unmatched for one-liner text wrangling. |
| 21 | [Lua](languages/lua.md) | Tier 3 · Specialized | A 24,000-line embeddable scripting VM — the scripting language of game engines, Redis, Nginx, and Wireshark. |
| 22 | [Julia](languages/julia.md) | Tier 3 · Specialized | Lisp-flavored multiple dispatch over LLVM — Python's ergonomics with Fortran's speed for numerical work. |
| 23 | [MATLAB](languages/matlab.md) | Tier 3 · Specialized | MathWorks' matrix-first numerical environment — the lingua franca of control systems, signal processing, and academic engineering labs. |
| 24 | [Haskell](languages/haskell.md) | Tier 3 · Specialized | A pure, lazy, statically-typed functional language — the research lab where the ideas behind Rust, Swift, and TypeScript type systems were rehearsed. |
| 25 | [Elixir](languages/elixir.md) | Tier 3 · Specialized | Ruby-flavored syntax on Erlang's BEAM VM — for systems that must serve millions of WebSocket connections without dropping them. |
| 26 | [Clojure](languages/clojure.md) | Tier 3 · Specialized | A modern Lisp on the JVM — immutable data, software transactional memory, and the REPL-driven workflow that defined data engineering at scale. |
| 27 | [Assembly (x86-64 / ARM)](languages/assembly.md) | Tier 3 · Specialized | The textual form of the CPU's actual instructions — what every compiled program ultimately becomes. |
| 28 | [Fortran](languages/fortran.md) | Tier 3 · Specialized | The first high-level language — still the fastest tool for dense linear algebra and HPC kernels. |
| 29 | [VBA](languages/vba.md) | Tier 3 · Specialized | Visual Basic for Applications — the scripting layer that powers Excel automation in every finance and ops team on Earth. |

## △ ML / AI

Frameworks for training, serving, and reasoning about ML systems.

| # | Sheet | Tier | One-liner |
| --- | --- | --- | --- |
| 1 | [PyTorch](ml-ai/pytorch.md) | ML / AI | Dynamic-computation-graph tensor library with reverse-mode autodiff — the de facto standard for deep-learning research. |
| 2 | [TensorFlow](ml-ai/tensorflow.md) | ML / AI | End-to-end ML platform with eager execution, graph compilation via tf.function, and a battle-tested serving stack. |
| 3 | [Keras](ml-ai/keras.md) | ML / AI | High-level neural-network API — stack layers, compile, fit. Three backends (TF, JAX, PyTorch) under one interface since Keras 3. |
| 4 | [scikit-learn](ml-ai/scikit-learn.md) | ML / AI | Uniform fit/predict interface for classical ML — the default for tabular data, baselines, and preprocessing pipelines. |
| 5 | [pandas](ml-ai/pandas.md) | ML / AI | The Python dataframe library — ingest, clean, transform, and aggregate tabular data at practical scale. |
| 6 | [NumPy](ml-ai/numpy.md) | ML / AI | The N-dimensional array library — the memory layout and vectorized kernel everything in Python data runs on. |

## ⌬ Systems & Architecture

Designing distributed systems — the concepts that outlast any single tool.

| # | Sheet | Tier | One-liner |
| --- | --- | --- | --- |
| 1 | [System Design](systems/system-design.md) | Systems | Designing distributed systems — the concepts that outlast any single framework, cloud, or interview cycle. |

## ≡ Topics

Everything else engineers reach for daily: Git, Docker, Linux, networking, DevOps. Grows indefinitely.

| # | Sheet | Tier | One-liner |
| --- | --- | --- | --- |
| 1 | [Git](topics/git.md) | Topic | A distributed version control system built on a content-addressable DAG of immutable snapshots — the de facto standard for source control. |
| 2 | [Docker](topics/docker.md) | Topic | Packaging model that bundles an app and its dependencies into a portable, isolated Linux container built on kernel namespaces and cgroups. |
| 3 | [Linux Fundamentals](topics/linux.md) | Topic | The kernel at the heart of most production servers, containers, and embedded systems — and the userspace tooling layered on top. |
| 4 | [Networking](topics/networking.md) | Topic | The protocol stack that lets two processes on different machines exchange bytes — physical, IP, transport, and application layers. |
| 5 | [DevOps / CI-CD](topics/devops.md) | Topic | The practice of unifying dev and ops through automation, measurement, and shared ownership — pipelines, IaC, and observability. |
| 6 | [React](topics/react.md) | Topic | The dominant UI library — components, hooks, and one-way data flow for interfaces from dashboards to design tools. |
| 7 | [Node.js](topics/nodejs.md) | Topic | JavaScript on the server — a V8-powered, event-loop-first runtime for APIs, tooling, and everything npm touches. |
| 8 | [PostgreSQL](topics/postgresql.md) | Topic | The advanced open-source relational database — MVCC, rich types, and the engine behind everything from SaaS to analytics. |
| 9 | [Redis](topics/redis.md) | Topic | In-memory data structure store — the default cache, and much more: locks, queues, rate limits, leaderboards. |
| 10 | [Kubernetes](topics/kubernetes.md) | Topic | The container orchestrator — declarative desired state, self-healing workloads, and the API every cloud speaks. |

