import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "devops",
  name: "DevOps / CI-CD",
  category: "topics",
  tier: "topic",
  tags: ["ci", "cd", "automation", "iac", "observability", "kubernetes", "sre"],
  tagline: "The practice of unifying dev and ops through automation, measurement, and shared ownership — pipelines, IaC, and observability.",
  year: 2009,
  author: "Patrick Debois (coined the term)",

  tldr: [
    "DevOps is the practice of unifying development and operations through automation, measurement, and shared ownership — implemented via CI/CD pipelines, infrastructure-as-code, and observability tooling.",
    "The 80/20: a small set of practices delivers most of the value — versioned infrastructure, automated test/build/deploy, deployment strategies that allow safe rollback, and telemetry (metrics, logs, traces) that makes failures visible.",
    "Reach for it when shipping software more than once a week, when operating services with SLAs, or when on-call rotations require reproducible incident response rather than heroics.",
    "Most failures collapse to: deploys without a rollback plan, secrets leaked to logs, unbounded pipeline parallelism, missing observability, and the build-vs-deploy-vs-release confusion.",
  ],

  mentalModel: {
    title: "Build once, deploy many, observe everything",
    body: "The pipeline is a directed acyclic graph of stages (lint → test → build → package → deploy → verify) that turns a commit into a running service. The SAME artifact (Docker image, binary) is promoted across environments (dev → staging → prod), never rebuilt — that's what makes deploys reproducible. Deployment strategies (rolling, blue-green, canary) decouple 'deploy' from 'release' — you can deploy without making a feature visible, and roll back without redeploying. Observability is the feedback loop: metrics (gauges, counters, histograms), structured logs, and traces turn 'the site is slow' into 'p99 latency on /checkout spiked at 14:03 UTC after deploy a1b2c3d'. Without telemetry, you're not doing DevOps — you're doing hopeful ops.",
  },

  constructs: [
    { syntax: "Pipeline stages: lint → test → build → package → deploy → verify", behavior: "DAG of stages, each failing fast; downstream stages don't run if upstream fails.", when: "Every commit; the unit of CI/CD work. Keep total time under 10 min or developers will skip it." },
    { syntax: "Rolling deployment (maxSurge=25%, maxUnavailable=25%)", behavior: "Replaces old pods gradually; default in Kubernetes. Keeps capacity above 75% throughout.", when: "Default for stateless services that tolerate old+new versions running together." },
    { syntax: "Blue-green deployment", behavior: "Stands up an entire new environment (green) alongside the old (blue); switches traffic atomically; keeps blue warm for instant rollback.", when: "Services that can't tolerate old+new coexisting; needs 2x capacity during deploy." },
    { syntax: "Canary deployment", behavior: "Routes a small % of traffic (1% → 5% → 25% → 100%) to the new version; auto-rolls back if error rate or latency exceeds threshold.", when: "High-traffic services where bad deploys are expensive; requires good metrics + automated rollback." },
    { syntax: "Terraform: declarative IaC (HCL)", behavior: "Declares desired state; `plan` shows the diff, `apply` reconciles. State stored in a backend (S3+DynamoDB lock).", when: "Cloud infrastructure (AWS/GCP/Azure). Don't roll cloud resources by hand — Terraform is the source of truth." },
    { syntax: "Ansible: procedural config management (YAML playbooks)", behavior: "Idempotent SSH-based configuration of existing hosts; describes tasks, not end state.", when: "Bare-metal/VM config, ad-hoc patches, where Terraform's state model doesn't fit." },
    { syntax: "Secrets: Vault / SOPS / cloud KMS / Doppler", behavior: "Stores secrets encrypted at rest, injects at runtime via env vars or sidecars. NEVER in git, NEVER in image layers.", when: "Any secret (DB passwords, API keys, TLS keys). Rotate via the secrets manager, not via redeploy." },
    { syntax: "Observability: metrics (Prometheus) + logs (Loki/ELK) + traces (Jaeger/Tempo)", behavior: "Three pillars. Metrics = aggregated time series for alerts. Logs = per-event context. Traces = cross-service causality.", when: "Any production service. Without all three, you're debugging blind." },
    { syntax: "Kubernetes: Deployment + Service + Ingress", behavior: "Deployment manages ReplicaSets of pods; Service gives stable DNS+LB; Ingress routes HTTP to services.", when: "Container orchestration standard. Don't hand-roll k8s YAML — use Helm or Kustomize." },
    { syntax: "Feature flags (LaunchDarkly / Unleash / OpenFeature)", behavior: "Decouples deploy from release; toggles features at runtime per user/cohort without redeploy.", when: "Trunk-based dev, dark launches, A/B tests, kill-switches for risky features." },
    { syntax: "GitOps: ArgoCD / Flux (pull-based)", behavior: "Agent in cluster pulls desired state from git; drift is reverted automatically. Git is the source of truth, not `kubectl apply`.", when: "Kubernetes deployments at scale. Eliminates 'who applied what when?' forensics." },
    { syntax: "DORA metrics: lead time, deploy frequency, MTTR, change failure rate", behavior: "Four metrics that empirically predict delivery performance. Elite teams deploy multiple times/day with <1hr lead time and <15% change failure rate.", when: "Measure teams objectively; resist vanity metrics like 'story points shipped'." },
  ],

  patterns: [
    {
      lang: "yaml",
      caption: "GitHub Actions CI — build, test, and push the SAME image used in prod",
      code: `name: ci
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  packages: write

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v4

  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ghcr.io/\${{ github.repository }}:\${{ github.sha }}
            ghcr.io/\${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max`,
    },
    {
      lang: "yaml",
      caption: "Kubernetes deployment with readiness/liveness probes + resources",
      code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels: { app: api }
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0          # never go below desired replicas
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: ghcr.io/org/api:a1b2c3d   # pinned to git SHA, not :latest
          ports: [{ containerPort: 8080 }]
          envFrom:
            - secretRef: { name: api-secrets }
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 512Mi }
          readinessProbe:        # not ready → removed from Service
            httpGet: { path: /readyz, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:         # dead → restarted
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
            failureThreshold: 3
          lifecycle:
            preStop:
              exec: { command: ["sh", "-c", "sleep 5"] }  # let LB deregister`,
    },
    {
      lang: "yaml",
      caption: "Canary via Argo Rollouts — progressive traffic shift with auto-rollback",
      code: `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: api
spec:
  replicas: 10
  strategy:
    canary:
      canaryService: api-canary
      stableService: api-stable
      trafficRouting:
        nginx:
          stableIngress: api-ingress
      steps:
        - setWeight: 5
        - pause: { duration: 5m }
        - analysis:                # auto-rollback if metrics regress
            templates:
              - templateName: error-rate
            args:
              - name: service-name
                value: api-canary
        - setWeight: 25
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
        - setWeight: 100
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: ghcr.io/org/api:a1b2c3d
          ports: [{ containerPort: 8080 }]`,
    },
    {
      caption: "Blameless postmortem template — the unit of DevOps learning",
      code: `# Incident: <YYYY-MM-DD> <short title>

## Summary (1-2 sentences)
What happened, customer impact, duration.

## Impact
- Affected: <users/feature/region>, <X% of traffic>
- Duration: <start UTC> to <end UTC> = <HH:MM>
- Severity: <SEV-1 / SEV-2 / SEV-3>

## Timeline (UTC, with who-did-what)
- 14:03 — Alert fired: p99 latency on /checkout > 2s
- 14:05 — On-call (Alice) acknowledged, paged checkout team
- 14:08 — Identified deploy a1b2c3d as likely cause
- 14:12 — Rollback initiated
- 14:15 — Latency returned to baseline

## Root cause
The deploy added an N+1 query in the checkout flow...
(Not just "the deploy" — the underlying code/logic flaw.)

## Contributing factors
- Test coverage didn't include the affected path
- Staging DB size hid the N+1 (only surfaced at prod scale)

## What went well
- Detection in 2 min (good alerting)
- Rollback in 3 min (good tooling)

## Action items (owner, due date, tracking issue)
- [ ] Add integration test for checkout (Bob, 1wk, #1234)
- [ ] Add query-count assertion in CI (Carol, 2wk, #1235)
- [ ] Lower canary threshold to 1% error rate (Alice, 1wk, #1236)`,
    },
  ],

  pitfalls: [
    {
      title: "Secrets printed in CI logs (`echo $TOKEN`)",
      symptom: "Pipeline runs `echo $DEPLOY_TOKEN` (or worse, `echo \"Deploying with token $DEPLOY_TOKEN\"`) and the token lands in the build log accessible to anyone with read access to the repo — forever.",
      fix: "Mark secrets as masked in your CI tool (GitHub Actions `secrets.*` are auto-masked). Never `echo` them. Audit logs for known secret patterns. Use OIDC for cloud auth instead of long-lived tokens.",
    },
    {
      title: "Deploying on Friday afternoon without a rollback path",
      symptom: "Friday 5pm deploy introduces a subtle bug discovered Monday morning — no one is on-call to roll back, and the deploy is now 60 hours old.",
      fix: "Either freeze deploys before weekends/holidays, or require: (a) automated rollback tested in staging, (b) on-call coverage for 24h after, (c) feature flag so the change can be turned off without redeploy.",
    },
    {
      title: "Rollback strategy missing — deploy a bad migration, can't undo",
      symptom: "Deploy includes a forward-only DB migration (drop column, rename table); the code is rolled back but the migration isn't, so the old code crashes against the new schema.",
      fix: "Migrations must be backward-compatible across two deploys. Step 1: deploy code that reads both schemas. Step 2: run migration. Step 3: deploy code that uses only new schema. Never bundle a destructive migration with code that depends on it.",
    },
    {
      title: "Feature flags accumulate as dead code (tech debt)",
      symptom: "Two-year-old flags linger in code with no clear owner; removing them breaks something; devs add new flags instead of cleaning up — exponential flag growth.",
      fix: "Every flag has an expiry date and an owner. Add a CI check that fails when a flag exceeds its TTL. Audit flags quarterly; archive stale ones in batches.",
    },
    {
      title: "Unbounded parallelism in pipelines (cost + flakiness)",
      symptom: "Matrix builds spawn 50 parallel jobs for every PR; CI provider bills per-minute; flaky tests cause random failures across the matrix; merges bottleneck on slowest job.",
      fix: "Cap parallelism (GitHub Actions: max-parallel). Run expensive matrices only on main, not PRs. Quarantine flaky tests; don't tolerate >1% flake rate — it erodes trust in the pipeline.",
    },
    {
      title: "Staging != prod — config drift hides prod-only bugs",
      symptom: "Staging uses smaller instances, single-AZ, no CDN, mock third-party APIs; prod-only issues (DNS, AZ failures, real API rate limits) never surface before prod.",
      fix: "Make staging as prod-like as cost allows: same instance types, multi-AZ, real (sandboxed) third-party APIs, same configs (Terraform-managed). The gap between staging and prod is the gap between your SLA and reality.",
    },
    {
      title: "Alert fatigue — too many noisy alerts route to /dev/null",
      symptom: "On-call gets 200 alerts/day, 90% are auto-resolving noise; the SEV-1 gets acknowledged late because the on-call stopped reading alerts.",
      fix: "Every alert must be actionable (there's a runbook), owned (a team), and rate-limited (alert on symptoms, not causes). Review alert volume weekly; silence or fix the noisy ones. Use SLO-based alerting (burn rate) instead of threshold alerting.",
    },
  ],

  quickReference: [
    { fact: "DORA elite tier: deploy frequency multiple/day, lead time <1hr, MTTR <1hr, change failure rate <15%. Industry median: weekly/1month/1day/15%.", tag: "perf" },
    { fact: "Pipeline stage budgets: lint <1min, unit tests <5min, integration <15min, deploy <10min. Total >15min erodes developer flow.", tag: "perf" },
    { fact: "Kubernetes rolling update defaults: maxSurge=25%, maxUnavailable=25%. For zero-downtime set maxUnavailable=0 and ensure replicas ≥ 2.", tag: "gotcha" },
    { fact: "Readiness probe failure → pod removed from Service endpoints (no traffic). Liveness failure → pod restarted. They are NOT the same.", tag: "gotcha" },
    { fact: "Terraform state: store in S3 + DynamoDB lock table (or equivalent). NEVER in git — it contains secrets and enables concurrent-apply corruption.", tag: "gotcha" },
    { fact: "Prometheus metric types: counter (monotonic), gauge (current value), histogram (bucketed observations), summary (quantile client-side).", tag: "complexity" },
    { fact: "p99 latency is the metric users feel; p50 hides tail. Report p50/p95/p99 together; alert on p99 (or p99.9 at scale).", tag: "perf" },
    { fact: "Container image tag: pin to git SHA (ghcr.io/org/api:a1b2c3d), not :latest. :latest is non-reproducible and breaks rollbacks.", tag: "style" },
    { fact: "Helm chart = templated k8s manifests; Kustomize = overlay-based patches. Both work — Helm is more common, Kustomize is in kubectl.", tag: "version" },
    { fact: "Blue-green needs 2x capacity during deploy; canary needs traffic-shifting (Istio, NGINX, Argo Rollouts). Canary is cheaper but harder to set up.", tag: "complexity" },
    { fact: "An untested backup is no backup. Run quarterly restore drills; verify RTO (time to restore) and RPO (data loss tolerance) against your SLA.", tag: "gotcha" },
    { fact: "SLI/SLO/SLA: SLI is measured (e.g., 99.94% success over 28d); SLO is the target (99.9%); SLA is the contract (with penalty for breach).", tag: "style" },
    { fact: "Error budget = 1 - SLO. A 99.9% SLO = 43.2min/month budget; when exceeded, freeze features and fix reliability.", tag: "gotcha" },
    { fact: "GitOps (ArgoCD/Flux) pulls state from git → audit trail, drift detection, PR-based approvals. Push-based kubectl apply has none of these.", tag: "style" },
    { fact: "OIDC federation (no long-lived secrets) for cloud auth from CI: GitHub Actions → AWS IAM trust policy. Eliminates the secret-rotation problem entirely.", tag: "version" },
  ],

  goDeeper: [
    { title: "The Phoenix Project (Gene Kim, Kevin Behr, George Spafford)", url: "https://itrevolution.com/the-phoenix-project/", note: "The novel that launched the DevOps movement — explains the 'Three Ways' (flow, feedback, continuous learning) through a relatable IT parable." },
    { title: "Continuous Delivery (Jez Humble, David Farley)", url: "https://continuousdelivery.com/", note: "The foundational 2010 book — deployment pipelines, blue-green, canary, build-vs-deploy-vs-release distinction. Still the reference." },
    { title: "Site Reliability Engineering (Google)", url: "https://sre.google/sre-book/table-of-contents/", note: "Free online; the canonical treatment of SLIs/SLOs, error budgets, incident response, and postmortems as practiced at Google." },
    { title: "The DevOps Handbook (Gene Kim et al.)", url: "https://itrevolution.com/the-devops-handbook/", note: "The non-fiction companion to Phoenix Project — case studies from Google, Amazon, Etsy, Facebook on the practices that work at scale." },
    { title: "Accelerate (Forsgren, Humble, Kim)", url: "https://itrevolution.com/accelerate/", note: "The statistical evidence behind DORA metrics — empirically validates which practices actually predict delivery performance, debunking cargo-cult DevOps." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  // Adapted for devops: deployment strategies / pipeline stages / observability signals
  dataTypes: {
    primitives: [
      { syntax: "Rolling deployment", behavior: "Replaces old instances gradually (maxSurge/maxUnavailable); always serves traffic from old + new during the rollout.", when: "Default for stateless services that tolerate version skew. Kubernetes default. Zero-downtime if maxUnavailable=0 + replicas >= 2." },
      { syntax: "Blue-green", behavior: "Stands up an entire new environment (green) alongside the old (blue); switches traffic atomically via DNS or LB. Old stays warm for instant rollback.", when: "Services that can't tolerate old+new coexisting (schema-breaking changes, dual-write periods). Needs 2x capacity during the switch." },
      { syntax: "Canary", behavior: "Routes a small % of traffic (1% -> 5% -> 25% -> 100%) to the new version; auto-rolls back if error rate or latency exceeds threshold.", when: "High-traffic services where bad deploys are expensive. Requires good metrics + automated rollback (Argo Rollouts, Flagger)." },
      { syntax: "Shadow (dark launch)", behavior: "Mirrors production traffic to the new version; responses are compared but NOT served to users. Real load, zero user risk.", when: "Pre-release perf validation. Catches bugs that synthetic tests miss. Watch for side effects (DB writes — fork the traffic!)." },
      { syntax: "A/B test (feature-flag driven)", behavior: "Routes traffic by cohort (user_id hash, geography, beta list); measures conversion/UX metrics, not just SLOs.", when: "Product experiments where you need real-user data. NOT a deployment strategy — a release strategy on top of feature flags." },
      { syntax: "Recreate (blue-green's dumb cousin)", behavior: "Tear down old, bring up new. Brief downtime. Zero version skew.", when: "Single-instance dev/staging environments; never in production with SLAs." },
      { syntax: "Feature flag (decouple deploy from release)", behavior: "Deploy the code dark; toggle behavior at runtime per user/cohort without redeploy. Kill-switch for risky features.", when: "Trunk-based development, dark launches, A/B tests, gradual rollouts. LaunchDarkly, Unleash, OpenFeature, Flagsmith." },
    ],
    collections: [
      { syntax: "lint", behavior: "Fast (<1min) static checks: format, types, security scans. Fails fast on style or syntax issues.", when: "Every PR; the cheapest stage. Should run on every file change locally too (pre-commit)." },
      { syntax: "unit test", behavior: "Function-level tests, no external deps, <5min. The bulk of the test pyramid.", when: "Every commit. Most cost-effective stage — fast feedback, deterministic, no infra." },
      { syntax: "integration test", behavior: "Multi-component tests with real deps (DB, message queue) in containers. <15min.", when: "On PR merge or nightly. Catches wiring bugs unit tests miss. Use Testcontainers, not shared environments." },
      { syntax: "build / package", behavior: "Compile, bundle, build Docker image, push to registry. Artifact is immutable, keyed by git SHA.", when: "After tests pass. The SAME artifact is promoted across environments — never rebuild per env." },
      { syntax: "deploy (env-specific)", behavior: "Apply the artifact to dev -> staging -> prod. Each env has its own approval gate.", when: "Promotion flow. Manual approval for prod; auto for dev/staging. GitOps (ArgoCD/Flux) syncs state from git." },
      { syntax: "smoke / verify", behavior: "Post-deploy checks: health endpoint, synthetic transaction, metric assertion. Auto-rollback if checks fail.", when: "Immediately after deploy, before declaring success. Argo Rollouts 'analysis' step automates this." },
      { syntax: "notify", behavior: "Slack/Teams/email + deployment tracking (deploy board, change log). On-call sees what deployed when.", when: "Always. Audit trail for incident response — 'what changed at 14:03?' is the first question in any incident." },
    ],
    custom: [
      { syntax: "Metric (counter/gauge/histogram)", behavior: "Aggregated time series — request count, in-flight gauge, latency histogram. Push or pull (Prometheus pulls).", when: "The 'what' of observability: how many, how fast, how slow. Powers alerts + dashboards. Cardinality matters — don't label with user_id." },
      { syntax: "Log (structured event)", behavior: "Per-event record with timestamp, severity, fields. JSON to a log aggregator (Loki, ELK, Datadog).", when: "The 'why' of observability: debugging an incident. Always structured (JSON), never printf-style free text. Include trace_id." },
      { syntax: "Trace (distributed span tree)", behavior: "Per-request tree of spans across services, with timing + attributes. OpenTelemetry is the standard.", when: "The 'where' of observability: which service caused the slow request. Sample at 1-10% in prod (100% of errors via tail-based sampling)." },
      { syntax: "Profiling (continuous)", behavior: "CPU/allocation/heap snapshots from production. Pyroscope, Parca, Datadog Profiler.", when: "The 'how' of perf optimization. Continuous profiling catches issues load tests miss — real workloads, real hot paths." },
      { syntax: "Event (change audit)", behavior: "Deploy events, config changes, feature flag toggles, on-call escalations. The 'change log' for the system.", when: "Correlating incidents to changes. 'What changed at 14:03?' should be answerable in seconds, not minutes." },
      { syntax: "SLO burn-rate alert", behavior: "Alerts when error budget is being consumed too fast (e.g., 2% burn in 1h, 5% in 6h). Multi-window, multi-burn-rate.", when: "Replaces threshold-based alerting. Alerts fire when users are actually affected, not when a metric crosses an arbitrary line." },
      { syntax: "Health check (liveness/readiness/startup)", behavior: "k8s probes: liveness=restart me, readiness=don't send me traffic, startup=don't probe until I'm booted.", when: "Every long-running service. Liveness=can I serve at all; readiness=can I serve RIGHT NOW (deps ok)." },
    ],
  },

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "bash",
      caption: "Build artifacts — the immutable thing you promote across environments",
      code: `# The CORE principle: build ONCE, promote everywhere.
# Never rebuild for staging vs prod — same Docker image, different env vars.

# Tag by git SHA (immutable) AND friendly name (mutable)
docker build -t ghcr.io/org/api:\${GIT_SHA} -t ghcr.io/org/api:latest .
docker push ghcr.io/org/api:\${GIT_SHA}
docker push ghcr.io/org/api:latest

# Deploy the SHA-tagged version, not :latest
kubectl set image deployment/api api=ghcr.io/org/api:\${GIT_SHA}
# Or in Helm:
helm upgrade api ./chart --set image.tag=\${GIT_SHA}

# Verify the deploy actually has the right image:
kubectl get deployment api -o jsonpath='{.spec.template.spec.containers[0].image}'
#   ghcr.io/org/api:a1b2c3d4e5f6...

# Rollback to the previous SHA (still in registry, still tagged):
helm rollback api 12
# Or git revert the deploy PR + ArgoCD re-syncs.

# :latest is for humans browsing the registry; the deploy system ALWAYS uses SHAs.`,
    },
    {
      lang: "yaml",
      caption: "Env vars and config — the 12-factor way",
      code: `# Config lives in ENV VARS, not in the image.
# Same image runs in dev/staging/prod; only env differs.

# Kubernetes: env from a ConfigMap (non-secret) + Secret (secret)
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
data:
  LOG_LEVEL: info
  DATABASE_HOST: db.internal
  CACHE_TTL: "300"

---
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
type: Opaque
stringData:
  DATABASE_URL: postgres://app@db.internal/app  # base64 in real k8s, plaintext here for clarity
  STRIPE_API_KEY: sk_live_abc123

---
# Pod consumes them:
spec:
  containers:
    - name: api
      envFrom:
        - configMapRef: { name: api-config }
        - secretRef:    { name: api-secrets }
      env:
        - name: DEPLOY_SHA          # for log/metric attribution
          value: a1b2c3d`,
    },
    {
      lang: "bash",
      caption: "Secret injection — never in git, never in image layers",
      code: `# The cardinal rule: secrets NEVER in code, NEVER in image, NEVER in plaintext env files in git.

# Option 1: Cloud KMS + workload identity (best for cloud k8s)
# Pod gets a GCP/AWS identity via workload identity; fetches secrets at runtime.
# Zero secrets in git or image. Auto-rotates.

# Option 2: HashiCorp Vault + sidecar injector
# Vault Agent sidecar injects secrets as files; pods read from /vault/secrets/.
# Leases expire; auto-renewal; full audit log.

# Option 3: Sealed Secrets / SOPS (for gitops)
# Encrypt secret values with a key the cluster can decrypt.
# Safe to commit to git; cluster-side controller decrypts to real Secret.

# Option 4: External Secrets Operator
# Syncs from AWS Secrets Manager / GCP Secret Manager / Vault into k8s Secrets.
# Source of truth is the cloud secrets manager, not git.

# Verify NO secret leaked to logs (CI gate):
# - Mark secrets as masked in GitHub Actions (secrets.* are auto-masked).
# - Run 'gitleaks' / 'trufflehog' on every PR to catch committed secrets.
# - Use OIDC federation for cloud auth from CI — eliminates long-lived tokens.

# If a secret DID leak: rotate IMMEDIATELY (assume it's compromised),
# then audit logs for misuse, then add detection for the leaked pattern.`,
    },
    {
      lang: "yaml",
      caption: "Promote an artifact dev → staging → prod via ArgoCD ApplicationSet",
      code: `# One ApplicationSet definition per service; auto-creates per-env Applications.
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: api
spec:
  generators:
    - list:
        elements:
          - env: dev
            cluster: https://dev.example.com
            namespace: api
          - env: staging
            cluster: https://staging.example.com
            namespace: api
          - env: prod
            cluster: https://prod.example.com
            namespace: api
  template:
    metadata:
      name: 'api-{{env}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/org/deploy
        targetRevision: main
        path: apps/api/{{env}}        # per-env overlays
      destination:
        server: '{{cluster}}'
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true              # revert manual kubectl edits
        syncOptions:
          - CreateNamespace=true

# Promotion = update image.tag in apps/api/staging/kustomization.yaml,
# commit, push. ArgoCD detects the change, syncs, deploys.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "bash",
      caption: "Rollback a bad deploy — the standard playbook",
      code: `# Rule 1: a deploy without a tested rollback is incomplete.
# Rule 2: practice rollbacks in staging BEFORE you need them in prod.

# Kubernetes (declarative — easy):
kubectl rollout undo deployment/api
kubectl rollout undo deployment/api --to-revision=12  # specific revision
kubectl rollout status deployment/api                 # watch the rollback

# Helm:
helm rollback api 12                                  # release 12 = last known good

# ArgoCD (gitops): revert the deploy PR; ArgoCD auto-syncs back.
git revert <deploy-commit>
git push origin main

# Verify the rollback took effect (image tag should change):
kubectl get deployment api -o jsonpath='{.spec.template.spec.containers[0].image}'

# IMPORTANT: database migrations are NOT auto-reversible.
# - Forward-only migrations: rollback the code, leave the schema (new code must
#   tolerate both old and new schema for one deploy cycle).
# - Destructive migrations (drop column): NEVER bundle with code that depends
#   on the new schema. Multi-deploy: add new column -> migrate writers -> drop old.`,
    },
    {
      lang: "bash",
      caption: "Recover a stuck CI pipeline — diagnose + unblock fast",
      code: `# Symptom: pipeline is hung or failing; devs blocked.

# 1. Which step is stuck?
gh run view <run-id> --log-failed        # GitHub Actions
gitlab-ci trace <job-id>                 # GitLab
# Or click into the failed step in the web UI; look at the LAST 50 lines.

# 2. Is it flaky (intermittent) or deterministic?
# Re-run the SAME job 3 times:
gh run rerun --failed <run-id>           # re-run only failed jobs
# If it passes 2/3 times: flaky. Quarantine or fix the flakiness; don't tolerate >1%.

# 3. Common causes + fixes:
#    - Network timeout to a registry: retry, mirror the registry, increase timeout.
#    - OOM in the runner: bump runner size or split the test suite.
#    - Disk full on the runner: clear /tmp, use ephemeral runners.
#    - Dependency download hang: cache aggressively; pin versions; vendor deps.
#    - Port conflict on shared runner: use random ports: PORT=$(get_random_port).

# 4. If the pipeline is fundamentally broken (broken main):
#    - Communicate to the team (Slack): 'main is broken, fixing now'.
#    - Revert the breaking PR (don't try to fix forward under pressure).
#    - Re-open the PR; fix on the branch; re-merge.

# 5. Post-incident: add a regression test + a CI check that catches this class of bug.`,
    },
    {
      lang: "bash",
      caption: "Resolve a stuck Kubernetes deployment",
      code: `# Symptom: 'kubectl rollout status deployment/api' hangs forever.

# 1. Why isn't the rollout progressing?
kubectl get pods -l app=api
#   NAME                   READY   STATUS              RESTARTS
#   api-abc123             1/1     Running             0
#   api-def456             0/1     ContainerCreating   0      <- stuck
#   api-ghi789             0/1     CrashLoopBackOff    5

# 2. ContainerCreating usually means: image pull, volume mount, or PVC pending.
kubectl describe pod api-def456 | tail -30
#   Events: FailedScheduling, FailedMount, ImagePullBackOff ...

# 3. CrashLoopBackOff = container starts, crashes, k8s restarts, repeats.
kubectl logs api-ghi789 --previous          # logs from the crashed container

# 4. Stuck rollout? Force-progress by setting maxUnavailable > 0, OR
#    manually delete the stuck pod (Deployment will recreate it):
kubectl delete pod api-def456

# 5. If the new version is crashing and blocking rollout, rollback:
kubectl rollout undo deployment/api

# 6. Common fixes:
#    - ImagePullBackOff: check image tag, registry auth (imagePullSecrets).
#    - Pending PVC: storage class full, quota exceeded.
#    - CrashLoopBackOff: bad config, missing secret, app bug — read the logs.
#    - OOMKilled: raise resources.limits.memory, fix the leak.`,
    },
    {
      lang: "bash",
      caption: "Incident response — the first 15 minutes",
      code: `# 1. Acknowledge + page the right team (within 2 min).
#    Don't try to fix it alone — page the on-call for the affected service.

# 2. Communicate status (within 5 min).
#    Slack #incidents: 'Investigating elevated 5xx on /checkout. Started 14:03 UTC.'
#    Status page if customer-facing.

# 3. Roll back the last deploy FIRST; investigate after.
#    Most incidents are caused by recent changes. Roll back; if the issue
#    resolves, you've found the cause. If not, you've ruled it out.
kubectl rollout undo deployment/api
# Or revert the deploy PR.

# 4. Capture evidence BEFORE rolling back:
#    - Logs: kubectl logs deployment/api > /tmp/incident-logs.txt
#    - Metrics snapshot: screenshot of Grafana at the time of impact.
#    - Traces: a few failing trace IDs from Jaeger.

# 5. If rollback doesn't fix it: bisection. What else changed?
#    - Config changes (configmap, secret).
#    - Infrastructure (Terraform apply?).
#    - Dependencies (third-party API down? Check their status page).
#    - Load spike (legit traffic, or DDoS?).

# 6. Hand-off: when the incident is mitigated (not solved), document:
#    - What happened, what we know, what we don't know, who's investigating next.

# 7. Postmortem within 48h: blameless, action items with owners + due dates.`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      caption: "The test pyramid — and why the inverse pyramid is dangerous",
      code: `             /\\
            /UI \\         few, slow, expensive, brittle
           /-----\\
          /  E2E \\        end-to-end via real browser + real API
         /--------\\
        /Integr-  \\       many, medium speed, real deps in containers
       /  ation   \\
      /------------\\
     /   Unit       \\     LOTS, fast (<1s each), no external deps
    /________________\\

Anti-pattern: the 'ice cream cone' (inverted pyramid) — many UI tests,
few unit tests. Slow, flaky, hard to localize failures.

Rules of thumb:
  - Unit tests should run in <1s each; the whole suite <5min.
  - Integration tests should run in <30s each; the whole suite <15min.
  - E2E tests should run in <5min each; the whole suite <30min.
  - If a test is flaky (>1% failure rate), QUARANTINE IT. Fix or delete.
    Flaky tests erode trust in the whole pipeline.

Coverage:
  - Aim for 70-80% line coverage on critical paths; 100% is a vanity metric.
  - Branch coverage > line coverage — catches the if/else holes.
  - Mutation testing (Stryker, mutmut) measures test QUALITY, not just coverage.`,
    },
    {
      lang: "yaml",
      caption: "CI pipeline — fast feedback, gated merge",
      code: `# GitHub Actions: parallel jobs, fast-fail, cache aggressively.
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint

  test-unit:
    needs: lint
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test -- --coverage --testPathIgnorePatterns=integration
      - uses: codecov/codecov-action@v4

  test-integration:
    needs: test-unit
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: test }
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:integration
        env: { DATABASE_URL: postgres://postgres:test@localhost:5432/test }

  # build + push happens only on main, not PRs:
  build-push:
    needs: [test-unit, test-integration]
    if: github.ref == 'refs/heads/main'
    # ... (see patterns section for the full build-push job)`,
    },
    {
      lang: "bash",
      caption: "Property-based testing — let the computer find edge cases",
      code: `# Hypothesis (Python), fast-check (JS), jqwik (Java), proptest (Rust).
# Generate randomized inputs constrained by your spec; the framework
# shrinks failures to the minimal reproducer.

# Python example: test that a sort is idempotent
from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_idempotent(xs):
    once = sorted(xs)
    twice = sorted(once)
    assert once == twice        # ALWAYS true for a correct sort

@given(st.text())
def test_json_roundtrip(s):
    # Hypothesis will find: NaN, surrogate pairs, control chars, etc.
    assert json.loads(json.dumps(s)) == s

# Run: pytest --hypothesis-show-statistics
# Framework tells you: 100 examples generated, 0 failed, 5 shrinks to min case.`,
    },
    {
      lang: "bash",
      caption: "Synthetic monitoring — test production continuously",
      code: `# Don't wait for users to find broken flows. Run them yourself, continuously.

# Heartbeat / canary requests every 1 min from an external prober:
curl -fsS -m 5 https://api.example.com/healthz | jq -e '.status == "ok"'
# Pipe to a metrics pusher:
... | curl --data-binary @- https://prometheus-pushgateway/push/heartbeat

# Synthetic transactions (full signup, login, checkout) every 5 min:
# Use Playwright, Selenium, or a hosted service (Datadog Synthetics, Pingdom).
npx playwright test e2e/checkout-smoke.spec.ts --reporter=json > /tmp/result.json

# Alert if success rate drops below 99% in 5 min, OR p95 > 2s.
# This catches:
#   - Bad deploys (within 5 min, before many users hit it)
#   - Cert expirations (SSL handshake fails)
#   - DNS issues (wrong IP)
#   - Third-party outages (if your flow depends on them)

# Distinguish 'synthetic failure' from 'real user impact' in alerts —
# synthetics run from a few regions; real users are global.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "DORA elite tier: deploy multiple times/day, lead time <1hr, MTTR <1hr, change failure rate <15%. Industry median: weekly/monthly, 1-6mo, <1day, 15%.", tag: "perf" },
    { fact: "Pipeline budgets: lint <1min, unit <5min, integration <15min, deploy <10min. Total >15min erodes developer flow.", tag: "perf" },
    { fact: "Test pyramid: 70% unit, 20% integration, 10% E2E. Inverted pyramid (ice cream cone) is slow, flaky, and hard to localize.", tag: "complexity" },
    { fact: "CI caching: lockfile + build artifacts cached across runs cuts build time 50-80%. Cache key must include the lockfile hash.", tag: "perf" },
    { fact: "Container image pull is the largest single deploy-time cost. Use a registry in the same region; pre-pull on hosts (k3s, kind do this).", tag: "perf" },
    { fact: "kubectl rollout with maxSurge=25%, maxUnavailable=0 takes ~2x the slowest pod startup. Set startupProbe to avoid the livenessProbe race during boot.", tag: "perf" },
    { fact: "Terraform plan on a 1000-resource state takes ~30-60s. Use targeted plans (-target) for fast iteration; full plan in CI before merge.", tag: "perf" },
    { fact: "ArgoCD sync of a 100-app portfolio takes ~30-90s. Use app-of-apps pattern + auto-sync; don't manually click sync.", tag: "perf" },
    { fact: "Prometheus scrape interval 15s is the default; raise to 60s for low-cardinality metrics, lower to 5s for high-resolution alerting (more storage).", tag: "perf" },
    { fact: "Cardinality explosion: a metric with user_id label has millions of series — Prometheus OOMs. Label only by low-cardinality dimensions (service, route, status).", tag: "gotcha" },
    { fact: "p99 latency is what users feel; p50 hides tail. Alert on p99 (or p99.9 at scale >10K rps). Track p50/p95/p99 together.", tag: "perf" },
    { fact: "Log volume: a 1000-rps service logging 1KB per request generates 1GB/hr. Sample or use structured logging with selective verbosity.", tag: "perf" },
    { fact: "Distributed tracing overhead: ~50us per span without sampling; 10% sampling makes it negligible. Use tail-based sampling to keep 100% of errors.", tag: "perf" },
    { fact: "Blue-green needs 2x capacity during deploy; canary needs only +1 replica (cheaper, harder to set up).", tag: "complexity" },
    { fact: "OIDC federation (no long-lived secrets) for cloud auth from CI: GitHub Actions -> AWS IAM trust policy. Eliminates the secret-rotation problem entirely.", tag: "version" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Kubernetes", purpose: "Container orchestration standard. Scheduling, scaling, self-healing, service discovery. The default for production container platforms.", url: "https://kubernetes.io/", category: "deploy" },
    { tool: "Helm", purpose: "Templated k8s manifests — parameterize values across environments. The package manager for k8s.", url: "https://helm.sh/", category: "package" },
    { tool: "Kustomize", purpose: "Overlay-based k8s manifest patching (no templating). Built into kubectl; pairs well with GitOps.", url: "https://kustomize.io/", category: "build" },
    { tool: "ArgoCD", purpose: "GitOps controller for k8s — pulls desired state from git, drift detection, PR-based approvals. CNCF graduated.", url: "https://argo-cd.readthedocs.io/", category: "deploy" },
    { tool: "Argo Rollouts", purpose: "Progressive delivery for k8s — canary, blue-green, analysis-based auto-rollback. Pairs with ArgoCD or standalone.", url: "https://argo-rollouts.readthedocs.io/", category: "deploy" },
    { tool: "Flux", purpose: "Alternative GitOps controller (CNCF). Weaveworks-origin; lighter-weight than ArgoCD in some scenarios.", url: "https://fluxcd.io/", category: "deploy" },
    { tool: "Terraform", purpose: "Declarative IaC for cloud (AWS/GCP/Azure). HCL syntax, state file in object storage + lock.", url: "https://developer.hashicorp.com/terraform", category: "build" },
    { tool: "OpenTofu", purpose: "Linux Foundation's Terraform fork (after license change in 2023). Drop-in replacement; fully open-source.", url: "https://opentofu.org/", category: "build" },
    { tool: "Pulumi", purpose: "IaC with real languages (TypeScript, Python, Go) instead of YAML/HCL. Same engine under the hood.", url: "https://www.pulumi.com/", category: "build" },
    { tool: "Ansible", purpose: "Procedural SSH-based config management; idempotent YAML. Best for bare-metal/VM fleets.", url: "https://www.ansible.com/", category: "deploy" },
    { tool: "Prometheus", purpose: "Pull-based metrics DB + PromQL. The de facto standard for k8s-native monitoring.", url: "https://prometheus.io/", category: "debug" },
    { tool: "Grafana", purpose: "Dashboarding + alerting over Prometheus/Loki/Tempo/any datasource. The visual layer for observability.", url: "https://grafana.com/", category: "debug" },
    { tool: "Loki", purpose: "Log aggregation built for cost-efficiency — indexes only labels, not full text. Grafana's log backend.", url: "https://grafana.com/oss/loki/", category: "debug" },
    { tool: "Tempo", purpose: "Distributed tracing backend by Grafana Labs. OpenTelemetry-compatible, object-storage-backed.", url: "https://grafana.com/oss/tempo/", category: "debug" },
    { tool: "OpenTelemetry", purpose: "Vendor-neutral standard for traces, metrics, logs. The single SDK to instrument once, ship anywhere.", url: "https://opentelemetry.io/", category: "build" },
    { tool: "Vault", purpose: "Secrets management with dynamic secrets, leasing, audit. The standard for non-cloud secret storage.", url: "https://developer.hashicorp.com/vault", category: "deploy" },
    { tool: "External Secrets Operator", purpose: "Sync secrets from AWS SM / GCP SM / Vault into k8s Secrets. Cloud-secret-manager as source of truth.", url: "https://external-secrets.io/", category: "deploy" },
    { tool: "LaunchDarkly / Unleash", purpose: "Feature flag platforms — managed (LD) or self-hosted (Unleash). Decouple deploy from release.", url: "https://launchdarkly.com/", category: "deploy" },
    { tool: "GitHub Actions", purpose: "CI/CD integrated with GitHub. Generous free tier, huge marketplace of actions, OIDC federation to cloud.", url: "https://docs.github.com/actions", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "Agile Manifesto", year: 2001, highlight: "Agile replaces waterfall; iterative delivery, working software over documentation. Sets the cultural stage for DevOps." },
    { version: "Continuous Integration", year: 2006, highlight: "Martin Fowler's CI pattern popularized. Build server runs tests on every commit; 'integration hell' tamed." },
    { version: "DevOps term coined", year: 2009, highlight: "Patrick Debois organizes 'devopsdays' in Ghent; the term spreads. Dev + Ops collaboration as a discipline." },
    { version: "Continuous Delivery (book)", year: 2010, highlight: "Jez Humble + David Farley publish the foundational text: deployment pipelines, blue-green, canary, build-vs-deploy-vs-release." },
    { version: "Phoenix Project", year: 2013, highlight: "Gene Kim's novel popularizes the 'Three Ways' of DevOps: flow, feedback, continuous learning. Cultural touchstone." },
    { version: "Docker 1.0", year: 2014, highlight: "Containers go mainstream; immutable artifacts become the deployment unit. The biggest shift in deployment since RPM/deb." },
    { version: "Kubernetes 1.0", year: 2015, highlight: "Google open-sources Borg's successor; CNCF founded. The container orchestrator wars begin (k8s vs Swarm vs Mesos)." },
    { version: "DORA metrics", year: 2016, highlight: "Forsgren/Humble/Kim publish Accelerate: four metrics empirically predict delivery performance (lead time, frequency, MTTR, CFR)." },
    { version: "Terraform 1.0", year: 2021, highlight: "HashiCorp's IaC tool stabilizes after 7 years of 0.x; cloud-agnostic declarative infra becomes the default." },
    { version: "GitOps mainstream", year: 2020, highlight: "ArgoCD and Flux become CNCF projects; pull-based deploys from git replace push-based kubectl apply in serious orgs." },
    { version: "OpenTelemetry GA", year: 2021, highlight: "Tracing + metrics + logs merged into one vendor-neutral SDK. Replaces Jaeger/Zipkin/StatsD client libraries." },
    { version: "SLO-based alerting", year: 2019, highlight: "Google's SRE workbook popularizes burn-rate alerts over threshold alerts; alert on user impact, not raw metrics." },
    { version: "Terraform license change", year: 2023, highlight: "HashiCorp switches Terraform to BSL; community forks OpenTofu under Linux Foundation. The IaC landscape splits." },
    { version: "Platform engineering", year: 2023, highlight: "Gartner declares 'platform engineering' the successor to DevOps; internal developer platforms (Backstage, Port) become the new hotness." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between continuous integration, continuous delivery, and continuous deployment?", a: "CI: every commit is built + tested, merged to main frequently. Continuous delivery: every change is deploy-READY (automated pipeline to prod, manual button to deploy). Continuous deployment: every change that passes tests is auto-deployed to prod (no manual gate). The progression is CI -> CDelivery -> CDeployment. Most teams stop at delivery; CD requires strong test automation + monitoring + rollback.", difficulty: "easy" },
    { q: "Explain blue-green vs canary vs rolling deployment.", a: "Rolling: replace old instances gradually, old + new coexist (k8s default). Zero downtime if maxUnavailable=0; tolerates version skew. Blue-green: stand up entire new env, switch traffic atomically; old stays warm for instant rollback; needs 2x capacity. Canary: route small % of traffic to new version, auto-rollback if metrics regress; cheapest, hardest to set up (needs traffic shifting + metric-driven rollback).", difficulty: "medium" },
    { q: "What's the difference between deploy and release?", a: "Deploy = the new code is running in the environment. Release = users can see it. With feature flags, you deploy dark (code running, feature off), then release gradually (toggle on per cohort). This decouples 'did the code land safely' from 'did users get the feature' — you can deploy daily but release on a marketing schedule, or instantly roll back a release without redeploying.", difficulty: "medium" },
    { q: "How do you handle a database migration in a zero-downtime deploy?", a: "Three steps across two deploys: (1) Deploy code that writes to BOTH old and new schema (dual-write), reads from old. (2) Run the migration (add column, backfill, etc.). (3) Deploy code that reads + writes only the new schema. Never bundle a destructive migration (drop column) with code that needs it. After step 3 is stable for a release cycle, you can drop the old column. This is 'expand-contract' migration.", difficulty: "hard" },
    { q: "What are DORA metrics and why do they matter?", a: "Four metrics empirically correlated with delivery performance (Forsgren/Humble/Kim, 'Accelerate'): lead time (commit to deploy), deploy frequency, MTTR (mean time to restore), change failure rate. Elite teams: <1hr lead, multi/day deploys, <1hr MTTR, <15% CFR. They measure OUTCOMES, not activity — story points shipped is a vanity metric; DORA predicts business performance.", difficulty: "medium" },
    { q: "What's GitOps and why is it better than push-based deploys?", a: "GitOps = an agent in the cluster (ArgoCD, Flux) pulls desired state from git and reconciles. Git is the source of truth. Benefits: full audit trail (git history), PR-based approvals, drift detection + auto-correction, easy rollback (git revert), no kubectl access for developers (security). Push-based kubectl apply has none of these — 'who applied what when?' becomes a forensics problem.", difficulty: "medium" },
    { q: "How would you implement a canary deploy with automated rollback?", a: "Use Argo Rollouts (or Flagger): define a Rollout resource with canary steps (5% -> 25% -> 50% -> 100%) and analysis templates. After each traffic shift, Argo runs the analysis (Prometheus query: error rate < 1% over 5m). If analysis fails, auto-rollback to stable. Service mesh (Istio/Linkerd) or NGINX ingress shifts traffic. Critical: define GOOD metrics (error rate, p99 latency) before enabling; bad metrics = noise-triggered rollbacks.", difficulty: "hard" },
    { q: "What's an SLO and how is it different from an SLA?", a: "SLI = measured indicator (e.g., 99.94% success over 28 days). SLO = the target (99.9%). SLA = the contract with penalty (99.5%, or refund). Error budget = 1 - SLO (0.1% = 43min/month). When budget is exhausted, freeze features and fix reliability. This forces a business conversation: 'is this feature worth spending our error budget?' rather than 'should we add monitoring?'", difficulty: "medium" },
    { q: "How do you keep secrets out of git, out of image layers, and out of logs?", a: "(1) Store in a secrets manager (Vault, AWS SM, GCP SM); inject at runtime via workload identity or sidecar. (2) For gitops: Sealed Secrets or SOPS to encrypt values before commit. (3) CI: use OIDC federation to cloud (no long-lived tokens), mask secrets in logs (GitHub Actions auto-masks secrets.*). (4) Audit with gitleaks/trufflehog on every PR. (5) If leaked: rotate immediately, audit for misuse, add detection for the leaked pattern. Treat every secret as compromised on first leak.", difficulty: "hard" },
    { q: "How would you reduce a 30-minute CI pipeline to 5 minutes?", a: "(1) Parallelize: split jobs that run independently (lint, unit, integration in parallel). (2) Cache aggressively: lockfile + build artifacts + Docker layers, keyed by lockfile hash. (3) Skip unchanged: monorepo tools (Turborepo, Nx, Bazel) only run tests for affected packages. (4) Shrink test scope: integration tests in nightly, not per-PR; only run E2E on main. (5) Bigger runners: a 2-CPU runner is 4x faster than 0.5-CPU for CPU-bound steps. (6) Local pre-commit hooks for the fast stuff (lint, format) so it never hits CI.", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Ansible", whenThis: "Terraform for cloud infrastructure (declarative end-state, plan+apply lifecycle, multi-cloud).", whenThat: "Ansible for procedural config of existing hosts (SSH-based, idempotent tasks, no state file)." },
    { vs: "Nomad", whenThis: "Kubernetes when you want the broadest ecosystem, every vendor integration, and the path of least resistance.", whenThat: "Nomad when you want a simpler orchestrator (single binary, no etcd, runs non-container workloads), and you're already on HashiCorp stack." },
    { vs: "Docker Swarm", whenThis: "Kubernetes for production scale, multi-cluster, autoscaling, service mesh.", whenThat: "Docker Swarm for tiny teams that already know Docker and want multi-host without k8s complexity. (Increasingly rare.)" },
    { vs: "Push-based deploys (kubectl apply)", whenThis: "GitOps (ArgoCD/Flux) when you want audit trail, drift detection, PR-based approvals, and 'who applied what when' is answerable.", whenThat: "Push-based kubectl for tiny teams, throwaway clusters, or when gitops adds too much overhead for the value." },
    { vs: "Pulumi", whenThis: "Terraform when you want the biggest ecosystem, broadest provider support, and HCL's declarative simplicity.", whenThat: "Pulumi when you want real programming languages (TS/Python/Go) for loops, conditionals, and abstraction in IaC." },
  ],
};

export default sheet;
