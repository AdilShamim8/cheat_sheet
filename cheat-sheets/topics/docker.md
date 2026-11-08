# Docker

**Category:** Topics · **Tier:** Topic · **Tags:** containers, linux, namespaces, cgroups, oci, packaging, devops · **First released:** 2013 · **Author:** Docker, Inc. (Solomon Hykes) · **Last updated:** 2026-11

> Packaging model that bundles an app and its dependencies into a portable, isolated Linux container built on kernel namespaces and cgroups.

---

## TL;DR

- Docker is a tool for packaging applications and their dependencies into portable, isolated Linux containers built on kernel namespaces (isolation) and cgroups (resource limits).
- The 80/20: a Dockerfile is a layered recipe — each instruction creates an immutable layer; layers are cached and shared across images; runtime isolation comes from namespaces, and resource limits come from cgroups.
- Reach for it when shipping a service to any environment without 'works on my machine' drift, when bundling a complex dependency tree, or when running reproducible local stacks via Compose.
- Avoid it for hard-realtime work, GPU-bound workloads without careful configuration, or security isolation against untrusted multi-tenant code (use VMs, gVisor, or Kata Containers instead).

## Core Mental Model

**Layered filesystem cake over namespaces + cgroups.** Each `RUN`, `COPY`, and `ADD` in a Dockerfile creates an immutable layer; layers stack as overlay filesystems and are shared across images that share base layers. The build cache invalidates from the first changed instruction downward — instruction order is the single biggest build-performance lever. At runtime, `namespaces` (pid, net, mnt, uts, ipc, user) give each container its own view of the system; `cgroups` enforce CPU, memory, and IO limits. Volumes bypass the layered filesystem for persistent data. Networks (bridge, host, overlay) define connectivity — bridge is the default and uses NAT.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| FROM node:20-alpine AS build | Multi-stage build — later stages can COPY --from=build to discard build deps from final image. | Any image with build tooling not needed at runtime; cuts image size 5-10x. |
| RUN --mount=type=cache,target=/root/.npm npm ci | BuildKit cache mount — persists a directory across builds without baking it into a layer. | Package manager caches (npm, pip, apt, cargo) — big build-speed wins. |
| COPY package.json package-lock.json ./ | Copies files into a new layer; cheaper than ADD which also extracts tarballs and fetches URLs. | Always prefer COPY over ADD unless you specifically need tar extraction. |
| WORKDIR /app | Sets the working directory for subsequent RUN/CMD/ENTRYPOINT; creates it if missing. | Always set explicitly — never rely on / as cwd. |
| ARG NODE_VERSION=20 | Build-time variable, scoped to the FROM and used during build only; not visible at runtime. | Parameterizing image versions; combine with ENV to expose at runtime. |
| ENV NODE_ENV=production | Runtime environment variable baked into the image; overridable by `docker run -e`. | Set stable config defaults; use compose/k8s for per-env overrides. |
| EXPOSE 8080 | Documentation only — does NOT publish the port. Use `docker run -p 8080:8080` or compose `ports:` to publish. | Documenting which port the container listens on; consumers still need to publish explicitly. |
| USER 1001:1001 | Runs subsequent RUN/CMD/ENTRYPOINT as the given uid:gid instead of root. | Always — running as root inside a container is a security smell and breaks bind-mount permissions. |
| HEALTHCHECK CMD curl -f http://localhost:8080/healthz \|\| exit 1 | Tells Docker how to check container liveness; unhealthy containers are marked and (in Swarm/k8s) restarted. | Any long-running service; pair with k8s livenessProbe/readinessProbe. |
| VOLUME /var/lib/postgresql/data | Declares a path as a volume — bypasses the layered filesystem for persistent data. | Databases, stateful services. Use named volumes in compose; host bind mounts for dev. |
| ENTRYPOINT ["node"] + CMD ["server.js"] | ENTRYPOINT is the executable; CMD provides default args. Both can be overridden, but ENTRYPOINT is harder to override (use --entrypoint). | Use ENTRYPOINT for the executable name; CMD for default args. exec form (JSON array) is required for signal handling. |
| docker-compose.yml | Declarative multi-container orchestration — services, volumes, networks, dependencies, env. | Local dev environments, CI test stacks. For production, use Kubernetes or Swarm. |

## Idiomatic Patterns

**Multi-stage build for a Node service — small final image, no build tooling**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --production

# --- runtime stage: distroless, no shell, no root ---
FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER nonroot:nonroot
EXPOSE 8080
CMD ["dist/index.js"]
# Result: ~120MB image, no shell, runs as uid 65532
```

**docker-compose with named volumes, custom network, and healthchecks**

```yaml
services:
  api:
    build: .
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
      REDIS_URL: redis://cache:6379
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      retries: 10

  cache:
    image: redis:7-alpine
    command: redis-server --save 60 1 --loglevel warning

volumes:
  pgdata:
```

**Layer cache ordering — deps before source, the single biggest build-speedup**

```dockerfile
# BAD — any source change invalidates the npm ci layer (slow)
FROM node:20-alpine
WORKDIR /app
COPY . ./
RUN npm ci
# Every 'git push' triggers a full reinstall.

# GOOD — package.json rarely changes; ci layer stays cached
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                 # cached unless deps changed
COPY . ./
# Only the COPY layer invalidates on source change; rebuild is ~2s.
```

**Cleanup and inspection — reclaim disk and debug containers**

```bash
# List dangling images (untagged, from old builds)
docker images -f dangling=true

# Remove ALL unused images, containers, networks, AND volumes
docker system prune -a --volumes
# WARNING: --volumes deletes named volumes not used by any container

# Inspect what's actually inside an image without running it
docker history --no-trunc --format '{{.CreatedBy}}' myimage:latest

# Run a one-shot shell in a distroless image (no shell inside)
# by overriding the entrypoint with a debug image:
docker run --rm -it --entrypoint=sh myimage:latest

# Get a root shell in a running container (use nsenter if no shell)
docker exec -it -u 0 <container> sh

# View layered filesystem of a running container
docker inspect <container> --format '{{json .GraphDriver.Data}}'
```

## Common Pitfalls

1. **Layer cache busted by copying source before installing deps** — *Symptom:* Every code change triggers a full `npm ci` / `pip install` / `apt-get install` rebuild — builds go from 2s to 2min. *Fix:* Copy only manifest files (package.json, requirements.txt) and run install, THEN copy source. Order deps → install → source in every Dockerfile.
2. **Running as root inside the container** — *Symptom:* Process runs as uid 0; bind-mounted files get root-owned writes that you can't edit from the host; security scanners flag it. *Fix:* Add `USER 1001:1001` after copying files. For distroless images, use the `:nonroot` variant. Set file ownership with `COPY --chown=1001:1001`.
3. **Missing .dockerignore sends node_modules / .git to the build context** — *Symptom:* `docker build` uploads the entire directory to the daemon — `git status` of a large repo takes seconds, builds take minutes, image bloats. *Fix:* Always commit a .dockerignore that excludes `node_modules`, `.git`, `dist`, `*.log`, `.env`, and any local secrets. Build context size = first slow step.
4. **Pinning to `:latest` tag for reproducible deploys** — *Symptom:* Today's `node:latest` is different from yesterday's; builds break with no code change; rollbacks deploy a different image than the one tested. *Fix:* Pin to exact version tags (`node:20.11.1-alpine`) or digests (`node@sha256:abc...`). Pin the base image, not just your app image. CI should fail on floating tags.
5. **ENTRYPOINT as shell form swallows signals — PID 1 problem** — *Symptom:* `docker stop` takes 10s and then SIGKILLs the app — no graceful shutdown, in-flight requests lost, locks not released. *Fix:* Use exec form: `ENTRYPOINT ["node", "server.js"]` (JSON array, not shell string). Shell form runs `/bin/sh -c 'node server.js'` which becomes PID 1 and doesn't forward SIGTERM.
6. **Bind mounts leak host paths and permissions into container** — *Symptom:* Container writes files to a bind-mounted dir; on the host they're owned by uid 100099 or root, uneditable by your user. *Fix:* Prefer named volumes for data; use bind mounts only for dev source code. Run the container with the same uid as the host user (`--user $(id -u):$(id -g)`) for dev mounts.
7. **Compose v2 vs v3 vs Compose Spec drift** — *Symptom:* `version: '3'` at the top of compose files is deprecated and silently ignored by modern `docker compose` (v2+); `depends_on: condition: service_healthy` was v2-only then re-added under the spec. *Fix:* Drop the `version:` field entirely on Compose v2+. Target the Compose Spec (https://compose-spec.io/), not a specific docker-compose file version.

## Production / Interview Quick Reference

- Docker Engine 29.9.3 (Nov 2026) — security-release line; always read the notes before upgrading Swarm clusters. `version`
- Layer limit: 127 per image on legacy builder; unlimited with BuildKit (practical limit ~50 before overhead dominates). `gotcha`
- BuildKit is the default builder since Docker 23.0 (Feb 2023); enable explicitly with DOCKER_BUILDKIT=1 on older versions. `version`
- OverlayFS (overlay2) is the default storage driver on Linux; requires kernel ≥4.0 and is incompatible with some old filesystems. `version`
- Cgroup v2 is the default since Docker 20.10 on kernels ≥4.15; older hosts fall back to v1 with cgroupfs driver. `version`
- Default bridge network: 172.17.0.0/16; containers get NAT'd outbound via the host. Custom bridges give DNS-based container-name resolution. `gotcha`
- Default container ulimit: 1024 file descriptors (often too low for DBs/Node). Raise with `--ulimit nofile=65536:65536`. `perf`
- Image size baselines: alpine ~5MB, distroless ~20MB, debian-slim ~80MB, ubuntu ~70MB. Smaller = faster pull + smaller attack surface. `perf`
- `docker system prune -a --volumes` reclaims all unused images, containers, networks, AND volumes — destructive, read the prompt. `gotcha`
- Healthcheck defaults: interval=30s, timeout=30s, start-period=0s, retries=3. Most services need interval=10s, start-period=30s. `gotcha`
- Stop grace period: SIGTERM sent, 10s later SIGKILL. Long shutdowns need `--stop-timeout=60` (compose: `stop_grace_period: 60s`). `gotcha`
- Each `RUN` creates a layer; chain with `&&` and `\` to keep layer count low and image size small — especially for apt/yum. `style`
- `COPY --link` (BuildKit 0.8+) creates layers without invalidating downstream cache when only content changes — useful for binary artifacts. `version`
- Multi-platform builds (`docker buildx build --platform linux/amd64,linux/arm64`) push per-arch manifests; needs BuildKit + QEMU. `version`
- Docker Hub rate limits anonymous pulls to 100/6hr since 2020; authenticate or mirror to a private registry for CI. `gotcha`
- `docker run --read-only --tmpfs /tmp` makes the rootfs read-only, forcing all writes to declared volumes — security best practice. `style`

## Go Deeper

- [Docker Docs — official reference](https://docs.docker.com/) — The Dockerfile reference and BuildKit section are essential; the rest is operational guidance.
- [OCI Image Format Specification](https://github.com/opencontainers/image-spec) — The standard Docker images conform to — explains manifests, layers, and digest addressing independent of Docker.
- [BuildKit README](https://github.com/moby/buildkit) — Authoritative source for cache mounts, multi-stage, frontend syntax, and `--mount` types not documented elsewhere.
- [Docker Deep Dive (Nigel Poulton)](https://www.amazon.com/Docker-Deep-Dive-Nigel-Poulton/dp/1521822808) — Bestselling book covering storage, networking, and security internals beyond the docs.
- [The Twelve-Factor App](https://12factor.net/) — Heroku's methodology that Docker-based services should follow — config via env, stateless processes, disposability.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Base image layer | Read-only layer pulled from a registry (e.g., 'node:20-alpine'). Identified by manifest digest, not tag. | Always start FROM a base image; pin by digest for reproducibility: 'node@sha256:abc...'. |
| Instruction layer (RUN/COPY/ADD) | Each Dockerfile instruction creates a new immutable layer stacked via overlayfs. RUN layers persist filesystem diffs. | Group related commands with && to minimize layer count and image size. |
| Cache mount (--mount=type=cache) | BuildKit-managed persistent cache directory shared across builds; NOT baked into any image layer. | Package manager caches (npm, pip, cargo, apt) — big build-speed wins without image bloat. |
| Bind mount (--mount=type=bind) | Maps a host path into the container; reads/writes hit the host directly. No layer copy. | Dev environments for hot-reload source. NOT for prod — leaks host paths and permissions. |
| Secret mount (--mount=type=secret) | Build-time secret (registry creds, npm tokens) mounted as a file during one RUN; never persisted in layers. | Private package install during build; safer than ARG/ENV which leak in image history. |
| SSH mount (--mount=type=ssh) | Forwards the host's SSH agent into the build to fetch private repos over git+ssh; not persisted. | Building from private GitHub repos without baking deploy keys into the image. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Named volume | Docker-managed volume stored under /var/lib/docker/volumes/. Decoupled from any container's lifecycle. | Production databases, app state. Survives container recreation; backups via 'docker run --volumes-from'. |
| Anonymous volume | Auto-created volume with a random SHA name; removed only with 'docker rm -v' or 'prune'. | Rarely intended — usually a Dockerfile 'VOLUME' instruction without explicit mount. Avoid in prod. |
| Bind mount (host path) | Direct host filesystem mapping: '/host/path:/container/path'. File ownership maps 1:1 by uid. | Dev hot-reload of source code. Avoid in prod — host-dependent, breaks portability. |
| tmpfs mount | In-memory filesystem (RAM only) mounted into the container. Never touches disk. | Secrets that shouldn't hit disk, /tmp for untrusted workloads, performance-critical scratch space. |
| Image-as-volume (COPY --from=) | Multi-stage copy: 'COPY --from=build /app/dist ./dist' pulls files from another stage's filesystem. | Discarding build tooling from the final image. The core of multi-stage builds. |
| Volume driver (plugin) | External volume plugin (NFS, EFS, Longhorn, Portworx) backing a named volume. | Multi-host persistent storage in swarm/k8s. Docker named volumes are single-host by default. |
| Read-only rootfs (--read-only) | Container's root filesystem is immutable; writes only succeed on declared volume mounts. | Security hardening; forces all writes to explicit volumes. Pair with --tmpfs /tmp for scratch. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| bridge (default) | Per-host NAT bridge (docker0). Containers get a private IP; outbound traffic is SNAT'd to the host. | Default for single-host dev. Custom bridges enable DNS-based container-name resolution. |
| host | Container shares the host's network namespace — no isolation, no NAT. Ports bind directly to host. | Maximum throughput, no port mapping. Breaks isolation; use only for trusted debug containers. |
| none | Container has loopback only; no external network. Air-gapped by design. | Highly sensitive workloads; testing offline behavior; building with --network=none to enforce no-fetch. |
| overlay | Multi-host L2 overlay using VXLAN; containers on different hosts communicate as if on one LAN. | Docker Swarm; multi-host container networking without k8s. Requires a key-value store (swarm内置). |
| ipvlan / macvlan | Container appears as a separate physical device on the host's LAN with its own MAC/IP. No NAT. | Legacy apps that must appear on the physical LAN (printers, DHCP clients, broadcast protocols). |
| Custom bridge (user-defined) | User-created bridge network with built-in DNS; containers resolve each other by name. | Multi-container apps via Compose. Always prefer this over the default bridge for production stacks. |
| External network (compose) | Network declared as 'external: true' in compose; must be created via 'docker network create' first. | Sharing a network across multiple compose projects; integrating with non-compose containers. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| image:tag immutability | Tags are mutable pointers; digests (image@sha256:...) are forever. | Pin digests in prod manifests; tags for humans, digests for machines. |
| layer caching algebra | ORDER of RUN/COPY determines cache hits — least→most volatile. | Copy package manifests first, install, THEN copy source (the classic speedup). |
| restart policy × healthcheck | restart: unless-stopped + HEALTHCHECK = self-healing container. | Every long-running service; orchestrators add their own probes on top. |

## Input / Output

**Build context — what gets uploaded to the daemon, and how to keep it small**

```dockerfile
# 'docker build .' uploads the ENTIRE current directory to the daemon
# as the "build context" — every file, even ones not used in the Dockerfile.
# A 5GB node_modules/ in . means every build ships 5GB before RUN executes.

# .dockerignore — the most underused file in docker
# .dockerignore
.git
.gitignore
node_modules
dist
*.log
.env
.env.*
coverage
.vscode
.idea
**/__pycache__
**/*.pyc

# Verify context size before building:
docker build --no-cache --progress=plain . 2>&1 | grep "transferring context"
# Or measure directly:
du -sh --exclude=.git --exclude=node_modules .
```

**Volume mounts and port mapping — the runtime I/O surface**

```bash
# Bind mount host source for hot-reload during dev
docker run --rm -it \
  -v "$(pwd)/src:/app/src:ro" \
  -v "$(pwd)/data:/app/data" \
  -p 8080:8080 \
  -p 127.0.0.1:9090:9090 \
  --env-file .env.local \
  myapp:dev

# Named volume for persistent state (created on first use)
docker volume create pgdata
docker run -d --name db \
  -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=secret \
  postgres:16-alpine

# tmpfs for ephemeral secrets or scratch space (RAM-only)
docker run --rm \
  --tmpfs /run/secrets:mode=0700,size=1m \
  --tmpfs /tmp \
  myapp:prod

# Read-only rootfs + declared write paths (security hardening)
docker run --rm --read-only \
  --tmpfs /tmp \
  -v logs:/var/log/myapp \
  myapp:hardened

# Port mapping: HOST:CONTAINER. 0.0.0.0:8080:8080 binds all interfaces.
# 127.0.0.1:8080:8080 binds loopback only — safer for local services.
```

**STDIN to container, interactive shells, log streaming**

```bash
# Pipe data into a container via stdin
cat data.json | docker run --rm -i myapp jq '.users[] | .name'

# -i keeps stdin open; -t allocates a TTY; -it = both for interactive shells
docker run --rm -it alpine sh
docker exec -it <container> bash              # shell into a running container

# Stream container logs (stdout+stderr combined) — follow, filter, since
docker logs -f --since 10m --tail 100 <container>
docker logs <container> 2>&1 | grep ERROR

# Capture container exit code without losing logs:
docker run --rm myapp:latest > /dev/null 2>&1; echo "exit=$?"

# Attach to a running container's stdio (signals flow through):
docker attach <container>
# Ctrl-P Ctrl-Q to detach without killing; Ctrl-C sends SIGINT.

# Export a container's filesystem as a tarball (post-mortem debugging):
docker export <container> | gzip > container-fs.tar.gz
```

**Compose — volumes + networks + port mapping as declarative I/O**

```yaml
services:
  web:
    image: myapp:latest
    ports:
      - "8080:8080"             # publish to all interfaces
      - "127.0.0.1:9090:9090"   # metrics only on loopback
    volumes:
      - ./src:/app/src          # bind mount (dev)
      - app-logs:/var/log/app   # named volume (prod)
      - type: tmpfs             # in-memory scratch
        target: /tmp
    environment:
      LOG_LEVEL: info
    networks: [frontend, backend]

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks: [backend]

volumes:
  pgdata:
  app-logs:

networks:
  frontend:           # exposed to LB / ingress
  backend:
    internal: true    # NOT routable outside compose — isolation
```

## Loops & Iteration

**Cache-friendly multi-stage layer ordering**

```dockerfile
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM node:26-alpine AS run
WORKDIR /app
COPY --from=build /app/.next/standalone ./
USER node
CMD ["node", "server.js"]
```

## Functions & Callables

**Entrypoint scripts: the container function layer**

```bash
#!/usr/bin/env sh
set -e
until nc -z "$DB_HOST" 5432; do sleep 1; done
envsubst < /etc/app/template.conf > /etc/app/app.conf
exec node server.js    # exec: node becomes PID 1, gets SIGTERM
```

## Error Handling

**Container exits immediately — diagnosing exit codes and logs**

```bash
# Container exited; inspect the exit code first.
docker ps -a --filter "status=exited" --format '{{.Names}}\t{{.Status}}'
#   hopeful_kepler   Exited (137) 5 seconds ago    <- 137 = SIGKILL (OOM or docker kill)
#   angry_tesla      Exited (1)  10 seconds ago    <- 1 = app error
#   sleepy_babbage   Exited (0)  20 seconds ago    <- 0 = clean exit (one-shot?)

# Exit code math:
#   0           = success
#   1-125       = app-defined
#   126, 127    = permission denied / not found
#   128 + N     = killed by signal N (137 = SIGKILL, 143 = SIGTERM)

# Read the logs (must be before the container is auto-removed!)
docker logs <name>

# If logs are empty, the entrypoint itself failed. Inspect the exit:
docker inspect <name> --format '{{.State.ExitCode}} {{.State.Error}} {{.State.OOMKilled}}'
#   OOMKilled: true = the kernel killed it for memory pressure.
#   Fix: raise --memory; check the app for leaks.

# Override entrypoint to get a shell for debugging:
docker run --rm -it --entrypoint sh myapp:latest

# If the image is distroless (no shell), debug with a sidecar:
docker debug <container>     # Docker 24+ ; runs a debug container sharing PID+net namespace
```

**Container won't start — image, runtime, and config checks**

```bash
# 1. Does the image exist locally? Pull works?
docker image ls myapp:latest
docker pull myapp:latest      # see the actual error

# 2. Inspect the image's declared entrypoint + cmd:
docker image inspect myapp:latest --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}'

# 3. Verify the binary exists and is executable in the image:
docker run --rm --entrypoint sh myapp:latest -c 'ls -la /app/dist/index.js'

# 4. Check if a port conflict is preventing bind:
docker run -p 8080:8080 myapp:latest
#   Bind for address already in use -> another container or host process owns 8080.
ss -tlnp | grep :8080

# 5. Permission denied on bind mount? Container uid != host uid.
docker run --rm -v "$(pwd)/data:/data" myapp ls /data
# Fix: chown the host dir to match container uid, or run --user $(id -u):$(id -g).

# 6. Config validation: docker compose config parses the file
docker compose config 2>&1 | head -50

# 7. Last resort: check Docker daemon logs (root required):
journalctl -u docker.service --since "10 minutes ago"
```

**Layer cache busted — diagnose and fix build-time cache misses**

```bash
# Symptom: a Dockerfile step that used to be cached now rebuilds every time.

# Show which layers hit/missed cache during build:
docker build --progress=plain . 2>&1 | grep -E 'CACHED|DONE|=>'

# Common cache-busters (in order of likelihood):
# 1. COPY . .  before RUN install  — any file change invalidates install
# 2. ARG with a value that changes (e.g., ARG GIT_SHA=$(git rev-parse HEAD))
# 3. RUN apt-get update && apt-get install in separate layers (update cached, install stale)
# 4. Different BuildKit frontend version (syntax= directive changed)
# 5. .dockerignore missing — context hash changes when .git/ objects shift

# Inspect what each layer actually did:
docker history --no-trunc <image>

# Force-invalidate from a specific step (e.g., to refresh a base image):
docker build --no-cache-filter=install-deps .

# Use BuildKit's --mount=type=cache for package caches — persists across
# builds even when the install layer invalidates:
#   RUN --mount=type=cache,target=/root/.npm npm ci
```

**Recover from a crashed container — preserve evidence, then debug**

```bash
# NEVER run 'docker rm' on a crashed container until you've collected:
#   - logs (docker logs)
#   - exit code + OOMKilled flag (docker inspect)
#   - filesystem state (docker cp or docker export)
#   - resource usage at crash time (docker stats, if running)

# Copy files OUT of a stopped (not removed!) container:
docker cp <container>:/var/log/app /tmp/app-logs-forensics

# Export the entire filesystem for offline analysis:
docker export <container> | tar -tvf - | head -50
docker export <container> > /tmp/crashed.tar

# Capture the runtime config that produced the crash:
docker inspect <container> > /tmp/inspect.json

# Commit the container's filesystem as a NEW image for testing fixes:
docker commit <container> myapp:crashed-state
docker run --rm -it --entrypoint sh myapp:crashed-state

# Only after collecting evidence: docker rm <container>
# For a clean restart with the same config:
docker compose up -d --force-recreate --no-deps <service>
```

## Concurrency Model

**Compose scaling and BuildKit shared cache**

```bash
docker compose up -d --scale api=4

docker buildx create --use --name shared
docker buildx build   --cache-from type=registry,ref=registry.example.com/api:buildcache   --cache-to type=registry,ref=registry.example.com/api:buildcache,mode=max   --push -t registry.example.com/api:1.42.0 .
```

## Testing Patterns

**Test inside the same image you ship — no test/prod drift**

```dockerfile
# Multi-stage: test stage runs against the same code that ships.
FROM node:20-alpine AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm run typecheck && npm test -- --coverage

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=test /app /app
RUN npm run build && npm prune --production

FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER nonroot:nonroot
CMD ["dist/index.js"]
# 'docker build .' runs tests as part of building the prod image.
# Tests fail -> image fails to build -> no broken image can ship.
```

**Healthcheck + readiness — let Docker know if your app is healthy**

```yaml
# Dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

# Inspect health:
docker inspect --format '{{.State.Health.Status}}' <container>
#   starting | healthy | unhealthy
docker inspect --format '{{json .State.Health.Log}}' <container> | jq

# Compose:
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 30s      # grace period during boot
    depends_on:
      db:
        condition: service_healthy   # wait for db to be healthy before starting

# Three probe types in k8s map to Docker concepts:
#   livenessProbe  ~= HEALTHCHECK (unhealthy -> restart)
#   readinessProbe ~= no Docker equivalent (use depends_on condition)
#   startupProbe   ~= HEALTHCHECK start_period
```

**Contract testing with Testcontainers — real deps, ephemeral containers**

```bash
# Testcontainers spins up REAL Docker containers for integration tests.
# Available in Java, Go, Python, Node, .NET, Rust — same API shape.

# Python example (pytest):
# pip install testcontainers[postgres]
from testcontainers.postgres import PostgresContainer
import psycopg, pytest

@pytest.fixture(scope="session")
def pg():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg.get_connection_url()

def test_user_insert(pg):
    with psycopg.connect(pg) as conn, conn.cursor() as cur:
        cur.execute("CREATE TABLE users (id int, name text)")
        cur.execute("INSERT INTO users VALUES (1, 'ada')")
        cur.execute("SELECT name FROM users")
        assert cur.fetchone() == ("ada",)

# Each test session gets a fresh Postgres on a random port, torn down after.
# No mock DB; no shared state; no 'leftover data from last run' flakiness.
```

**Image scanning — catch CVEs before deploy**

```bash
# Trivy — open-source scanner, fast, no signup
trivy image --severity HIGH,CRITICAL --ignore-unfixed myapp:latest
# Exits non-zero if HIGH/CRITICAL CVEs found -> use in CI to block deploys.

# Docker Scout — Docker's built-in successor to 'docker scan'
docker scout cves myapp:latest
docker scout recommendations myapp:latest   # suggests base-image upgrades

# Snyk — commercial, deeper vulnerability DB, free tier
snyk container test myapp:latest

# Output formats for CI integration:
trivy image --format json --output /tmp/scan.json myapp:latest
trivy image --format sarif --output /tmp/scan.sarif myapp:latest   # for GitHub Code Scanning

# Common fixes:
# 1. Rebuild to pull patched base image (node:20.11.1-alpine -> 20.11.2-alpine)
# 2. Switch to a smaller base (alpine / distroless) — smaller attack surface
# 3. Pin to digest, not tag, so rebuilds always pick up patched versions explicitly
```

## Performance Tuning

- Image size baselines: alpine ~5MB, distroless ~20MB, debian-slim ~80MB, ubuntu ~70MB. Smaller = faster pull + smaller attack surface.
- Multi-stage builds cut image size 5-10x by excluding build tooling from the final image. Always multi-stage for production images.
- BuildKit parallelizes independent stages; --progress=plain shows the DAG. Stages with no inter-dependency run concurrently.
- Layer cache invalidates from the first changed instruction downward. Order: deps → install → source. The single biggest build-speed lever.
- BuildKit cache mounts (--mount=type=cache) persist package manager caches across builds without bloating the image — 2-5x speedup on dependency-heavy builds.
- OverlayFS (overlay2) is the default storage driver on Linux; requires kernel >=4.0 and is incompatible with some old filesystems (e.g., on top of ZFS).
- Default container ulimit: 1024 file descriptors (often too low for DBs/Node). Raise with --ulimit nofile=65536:65536.
- Memory limits: --memory=512m caps RAM; the OOM killer will SIGKILL the container if it exceeds. Watch .State.OOMKilled.
- CPU limits: --cpus=1.5 = 1.5 cores worth of CPU time (CFS quota). Containers can burst above if host is idle unless --cpu-quota is also set.
- Each RUN creates a layer; chain with && and \\ to keep layer count low and image size small — especially for apt/yum installs.
- Docker Hub rate limits anonymous pulls to 100/6hr since 2020; authenticate or mirror to a private registry for CI.
- Image pull is the largest single deploy-time cost. Use a registry in the same region as the deploy target; pre-pull on hosts (k3s does this).
- BuildKit inline cache (--cache-from type=inline) lets small images carry their own cache hints; works with any registry.
- Multi-platform builds (buildx --platform linux/amd64,linux/arm64) push per-arch manifests; ARM builds via QEMU are 5-10x slower than native.
- Stop grace period: SIGTERM sent, 10s later SIGKILL. Long shutdowns need --stop-timeout=60 (compose: stop_grace_period: 60s).

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Docker Compose](https://docs.docker.com/compose/) | Multi-container dev/test orchestration via YAML. The v2 binary is written in Go, not Python. | build |
| [BuildKit](https://github.com/moby/buildkit) | Next-gen build backend (default since Docker 23.0); cache mounts, multi-platform, parallel stages, frontend syntax. | build |
| [Buildx](https://docs.docker.com/build/buildx/) | BuildKit CLI plugin; multi-platform builds, named builders, remote build caches. | build |
| [Docker Scout](https://docs.docker.com/scout/) | Image vulnerability scanning + base-image upgrade recommendations. Successor to 'docker scan'. | test |
| [Trivy](https://aquasecurity.github.io/trivy/) | Open-source image + filesystem + IaC scanner. Fast, no signup, CI-friendly exit codes. | test |
| [Hadolint](https://github.com/hadolint/hadolint) | Dockerfile linter — catches shell-in-RUN, ordering issues, deprecated commands. Runs in pre-commit. | lint |
| [dive](https://github.com/wagoodman/dive) | TUI for exploring image layers — see what each layer added, wasted space, what's recoverable. | debug |
| [Testcontainers](https://testcontainers.com/) | Spin up real Docker containers as test fixtures; available for Java, Go, Python, Node, .NET, Rust. | test |
| [Podman](https://podman.io/) | Daemonless, rootless Docker alternative from Red Hat. Same CLI shape; podman-compose for compose files. | deploy |
| [Kaniko](https://github.com/GoogleContainerTools/kaniko) | Build images inside Kubernetes pods without a daemon or Docker socket. Safer for shared CI clusters. | build |
| [Buildah](https://buildah.io/) | Build OCI images from shell scripts (no Dockerfile needed). Pairs with Podman; from Red Hat. | build |
| [Skopeo](https://github.com/containers/skopeo) | Copy images between registries, inspect manifests, convert formats — without pulling the full image. | package |
| [Crane](https://github.com/google/go-containerregistry) | Google's image CLI — fast manifest inspection, layer extraction, registry GC. The 'jq of container images'. | debug |
| [Docker Registry (distribution)](https://distribution.github.io/distribution/) | Reference OCI registry implementation. Self-host with S3/Azure backend + auth via htpasswd or token. | package |
| [Harbor](https://goharbor.io/) | Enterprise registry on top of distribution — image scanning, replication, RBAC, signed images. | package |
| [Cilium / Falco](https://falco.org/) | Runtime security — eBPF-based container network observability (Cilium) and syscall anomaly detection (Falco). | debug |
| [Distroless](https://github.com/GoogleContainerTools/distroless) | Google's minimal base images — language runtime, no shell, no package manager. Smallest viable production base. | package |
| [Slim (slimtoolkit)](https://github.com/slimtoolkit/slim) | Auto-shrinks images by tracing runtime file access and discarding unused files. Drops 80%+ on fat images. | package |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.1 | 2013 | First public demo at PyCon SF (Solomon Hykes, dotCloud); 'docker' name appeared March 2013. |
| 1.0 | 2014 | Stable release; Docker Hub launched; containers explode in popularity. Multi-container via fig (later Compose). |
| 1.11 | 2016 | Switched from LXC to containerd/runC as the runtime; introduced the daemon split architecture. |
| 1.12 | 2016 | Built-in swarm mode (Docker Swarmkit); no separate Swarm container needed. Service concept added. |
| 17.06 | 2017 | Multi-stage builds (COPY --from). First release using YY.MM versioning; released monthly. |
| 17.09 | 2017 | Squash build support stable; secrets management in swarm (encrypted raft store). |
| 18.09 | 2018 | BuildKit becomes available as opt-in builder (DOCKER_BUILDKIT=1); significant build perf improvements. |
| 19.03 | 2019 | BuildKit default for some commands; rootless mode experimental; --platform for multi-arch builds; 'docker scan' alpha. |
| 20.10 | 2020 | cgroup v2 default; cgroupsfs deprecated. Supports systemd cgroup driver. Rootless mode GA. |
| 23.0 | 2023 | BuildKit becomes the DEFAULT builder (no opt-in). Compose v2 ships as 'docker compose' (Go). Drops old builder backend. |
| 24.0 | 2023 | 'docker debug' for distroless containers; improved cgroup v2 support; better IPv6 defaults. |
| 25.0 | 2024 | Compose v1 (Python) fully removed; v2 (Go) is the only compose. New containerd image store backend (opt-in). |
| 26.0 | 2024 | containerd image store promoted; BuildKit 0.13; improved BuildKit frontend protocol. Legacy 'builder' backend removed. |
| 27.0 | 2024 | containerd image store GA; multi-platform builds become default-recommended path. runc updated to 1.2. |
| 29.x | 2026 | Current line: security-driven releases (RSA-key parsing CPU fix, Swarm overlay encryption fix after firewalld flush), BuildKit 0.34.x, daemon hang fix under API load. |

## Interview Hot Questions

1. **What's the difference between an image and a container?** *(easy)*

   An image is an immutable, read-only template — a stack of layers identified by manifest digest. A container is a running instance of an image: image + writable top layer + namespaces + cgroups + process. 'docker run image' creates a container; 'docker commit container' creates a new image. Many containers can run from one image.

2. **Explain how Docker achieves isolation.** *(medium)*

   Linux namespaces give each container its own view of: PID (process tree), network (interfaces, routing), mount (filesystem), UTS (hostname), IPC (message queues), user (uid mapping). Cgroups enforce CPU, memory, IO, and device limits. OverlayFS stacks image layers + a writable container layer. There's no second kernel — containers share the host kernel; isolation is at the resource-view level, not hardware-virtualization.

3. **Why does Dockerfile instruction order matter so much for build speed?** *(medium)*

   Each instruction creates a layer; the build cache invalidates from the first changed instruction downward. If you COPY source before 'npm ci', any source change invalidates the install layer — every rebuild reinstalls all deps. Order deps first (rarely change), then source (changes often). The cache hit ratio on the deps layer is the single biggest build-time lever.

4. **What's the PID 1 problem and how do you avoid it?** *(medium)*

   PID 1 in a container receives SIGTERM from 'docker stop' but must forward it to child processes. Shell-form ENTRYPOINT ('ENTRYPOINT node server.js') runs /bin/sh -c, which becomes PID 1 and doesn't forward signals — your app never receives SIGTERM, gets SIGKILLed after 10s grace period, in-flight work is lost. Fix: use exec form ENTRYPOINT ["node", "server.js"] so node IS PID 1 directly. Use 'dumb-init' or 'tini' as PID 1 if your app can't handle the role.

5. **How would you debug a container that exits immediately?** *(medium)*

   First, inspect the exit code: docker ps -a shows 'Exited (N)' — 137 = OOM/SIGKILL, 143 = SIGTERM, 1 = app error. Read logs: docker logs <name>. If logs are empty, override the entrypoint: docker run --rm -it --entrypoint sh image. For distroless images, use 'docker debug' (24+) or ephemeral debug containers sharing namespaces. Inspect .State.OOMKilled for OOM; raise --memory if true.

6. **When would you use multi-stage builds?** *(easy)*

   Always for production images. Multi-stage lets you build in a fat image (compilers, dev deps) and copy only the artifact to a slim runtime image. Cuts image size 5-10x, removes build tooling from production (smaller attack surface), and lets you use distroless for the runtime stage. COPY --from=stage-name extracts files from an earlier stage's filesystem.

7. **Why shouldn't you run as root inside a container?** *(easy)*

   Containers share the host kernel; if an attacker breaks out via a kernel exploit, root inside = root outside (uid 0 is the same). Even without breakouts, bind-mounted files become root-owned on the host. Fix: USER 1001:1001 after copying files; for distroless use :nonroot variants; set COPY --chown=1001:1001 to fix file ownership. k8s enforces this with runAsNonRoot: true and a SecurityContext.

8. **How does Docker networking work for two containers to talk?** *(medium)*

   Default bridge (docker0) gives each container a private IP, but DNS doesn't work for container names. A user-defined bridge ('docker network create mynet') provides built-in DNS — containers resolve each other by name. Connect both containers to the same custom bridge and 'ping db' works. For multi-host, use overlay (swarm) or k8s networking (CNI plugins like Calico/Cilium).

9. **What's the difference between Docker and Kubernetes? Do you need both?** *(medium)*

   Docker builds and runs individual containers on one host. Kubernetes orchestrates containers across many hosts: scheduling, scaling, self-healing, service discovery, rolling deploys. You can run a Docker image in k8s (via containerd), but k8s doesn't build images. Use Docker for local dev + image building; use k8s for production container orchestration. You can also skip Docker entirely with Podman/Buildah + k8s.

10. **How would you minimize image size for a Python service?** *(hard)*

   Multi-stage build: (1) build stage with full python image, install deps to /install via pip install --target. (2) Runtime stage FROM gcr.io/distroless/python3-debian12:nonroot; copy only /install + your app source. Use --no-cache-dir on pip, strip test packages. Final image: ~50-80MB vs ~900MB for full python:3.12. Alternative: Slim Toolkit (slimtoolkit) auto-traces and discards unused files for further 50-90% reduction.

## When to Choose This

- **vs Podman:** use this — Docker when you want the most mature ecosystem, Docker Desktop's UX, and broad CI/CD tooling support.; use that — Podman when you need daemonless, rootless-by-default, systemd integration, or pod-native semantics on RHEL/CentOS streams. CLI-compatible; same Dockerfile works.
- **vs containerd (direct):** use this — Docker when you want the high-level CLI, Compose, build UX, and Desktop tooling.; use that — containerd directly when you're building a platform (k8s already uses it via CRI), need lower overhead, or are embedding container runtime into a product.
- **vs Virtual machines:** use this — Docker for app packaging, fast startup (seconds), high density (100s per host), and shared-kernel efficiency.; use that — VMs for hard security isolation (separate kernel), untrusted multi-tenant workloads, non-Linux guests, or kernel-level features containers can't access.
- **vs Kubernetes:** use this — Docker for local dev, image building, single-host deploy, compose stacks.; use that — Kubernetes when you have many hosts, need autoscaling, rolling deploys, service mesh, or have an ops team. k8s uses containerd internally; Docker-the-runtime is irrelevant.
- **vs Nix / Guix:** use this — Docker when you want broad ecosystem familiarity, simple layer model, and CI-host pre-built caching.; use that — Nix when you need bit-for-bit reproducible builds, declarative envs, multi-version coexistence, and don't mind the learning curve.

