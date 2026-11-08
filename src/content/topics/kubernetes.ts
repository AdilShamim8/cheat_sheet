import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "kubernetes",
  name: "Kubernetes",
  category: "topics",
  tier: "topic",
  tags: ["orchestration", "containers", "cloud-native", "k8s", "devops", "infrastructure"],
  tagline: "The container orchestrator — declarative desired state, self-healing workloads, and the API every cloud speaks.",
  year: 2014,
  author: "Google (Borg lineage), CNCF",
  lastUpdated: "2026-11",
  readingTime: 29,

  tldr: [
    "Kubernetes is a control plane that drives a cluster of machines toward a declared desired state: you submit YAML describing containers, replicas, networks, and storage; controllers continuously reconcile reality against it.",
    "It won the orchestration war definitively (v1.0 in 2015; now v1.37 'Garhwal', Aug 2026) and is the substrate of every major cloud, the CNCF ecosystem (Prometheus, Istio, Argo), and platform engineering. It is also the industry's #1 complexity tax — teams without dedicated platform time feel it.",
    "Reach for k8s when you run many services with heterogeneous scaling, rolling deploys, and self-healing requirements, or when your org standardizes on it (most do).",
    "Reach around it for simpler needs: a few containers on one box (compose), serverless functions, or PaaS — a small team can spend more time operating k8s than operating its product.",
  ],

  mentalModel: {
    title: "Declarative state + reconcile loops, all the way down",
    body: "Everything in Kubernetes is an object in etcd watched by a controller that runs a reconcile loop: 'here is the spec (desired); here is the status (observed); make them match.' A Deployment says 5 replicas; a ReplicaSet controller creates/removes Pods until there are 5. A node dies; another loop notices and reschedules its pods. You never script failure handling — you declare invariants and let loops converge. This explains the whole system: why kubectl apply is idempotent, why resources are eventually-consistent (never assume synchronous effects), why 'it works' means 'the loops have converged', and why every problem is diagnosed the same way: kubectl describe → events → logs → controller conditions. The API server is just a CRUD + watch layer over etcd; controllers do ALL the real work.",
  },

  constructs: [
    { syntax: "kind: Deployment + replicas + containers", behavior: "Stateless workload: manages ReplicaSets, rolls out new versions, rolls back on failure.", when: "Default for anything without per-pod identity (APIs, workers, web frontends)." },
    { syntax: "kind: Service (ClusterIP/NodePort/LoadBalancer)", behavior: "Stable virtual IP/DNS in front of a shifting set of pods; label-selector based.", when: "Every workload that receives traffic — service discovery is selector matching." },
    { syntax: "kind: Ingress / Gateway API (HTTPRoute)", behavior: "L7 routing: host/path → service, TLS termination. Gateway API is the modern replacement.", when: "External HTTP entry points. Prefer Gateway API (GA 2023, standard in 2026) for new setups." },
    { syntax: "kind: StatefulSet + volumeClaimTemplates", behavior: "Stable identity (pod-0, pod-1...) + per-pod PVCs; ordered rollout by default.", when: "Databases, queues, anything with per-instance state or leader election." },
    { syntax: "kind: Job / CronJob", behavior: "Run-to-completion pods with retries; CronJob schedules them.", when: "Batch, migrations, report generation. NOT for long-running services." },
    { syntax: "kind: HPA (HorizontalPodAutoscaler)", behavior: "Scales replicas on metrics (CPU/mem/custom); v1.37 adds scale-to-zero for scale-to-zero workloads.", when: "Variable load. Requires metrics-server + sane resource requests." },
    { syntax: "requests/limits on resources", behavior: "Requests drive scheduling; limits cap usage (CPU throttled, memory OOM-killed).", when: "ALWAYS on every container — the scheduler and HPA are meaningless without them." },
    { syntax: "ConfigMap / Secret + env/volume projection", behavior: "External configuration injected at runtime; secrets are base64, not encrypted by default.", when: "Config and credentials — mount as volumes (not env) for secrets that rotate." },
    { syntax: "livenessProbe / readinessProbe / startupProbe", behavior: "Restart vs reroute vs wait-until-started health contracts.", when: "Every service: readiness gates traffic, liveness recovers from deadlock, startup protects slow booters." },
    { syntax: "ServiceAccount + RBAC (Role/RoleBinding)", behavior: "Pod identity + least-privilege API access for in-cluster automation.", when: "Controllers, CI runners, anything calling the k8s API. Default SA should have nothing." },
    { syntax: "PodDisruptionBudget", behavior: "Guarantees min available replicas during voluntary disruptions (drains).", when: "Required on anything user-facing before node upgrades happen under it." },
  ],

  patterns: [
    {
      lang: "yaml",
      caption: "A production-grade Deployment, complete",
      code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels: { app: api }
spec:
  replicas: 3
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # zero-downtime
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      serviceAccountName: api
      securityContext:                    # pod-level hardening
        runAsNonRoot: true
        seccompProfile: { type: RuntimeDefault }
      topologySpreadConstraints:          # spread across nodes/zones
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: { app: api }
      containers:
        - name: api
          image: registry.example.com/api:1.42.0   # NEVER :latest
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits:   { cpu: "1",  memory: 512Mi }
          securityContext:               # container-level
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          env:
            - name: CONFIG_FILE
              value: /etc/config/app.yaml
          volumeMounts:
            - { name: config,  mountPath: /etc/config }
            - { name: tmp,     mountPath: /tmp }
          startupProbe:  { httpGet: { path: /healthz, port: 8080 }, periodSeconds: 2, failureThreshold: 30 }
          readinessProbe: { httpGet: { path: /ready,  port: 8080 }, periodSeconds: 5 }
          livenessProbe:  { httpGet: { path: /healthz, port: 8080 }, periodSeconds: 10 }
      volumes:
        - name: config
          configMap: { name: api-config }
        - name: tmp
          emptyDir: {}`,
    },
    {
      lang: "yaml",
      caption: "Gateway API: the modern ingress",
      code: `# GatewayClass — installed by the implementation (envoy gateway, istio...)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: { name: edge, namespace: web }
spec:
  gatewayClassName: envoy
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls: { mode: Terminate, certificateRefs: [{ name: wildcard-tls }] }
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: api-route }
spec:
  parentRefs: [{ name: edge }]
  hostnames: ["api.example.com"]
  rules:
    - matches: [{ path: { type: PathPrefix, value: /v1 } }]
      backendRefs: [{ name: api, port: 80, weight: 90 }]
    - matches: [{ path: { type: PathPrefix, value: /v2 } }]
      backendRefs:
        - { name: api, port: 80, weight: 10 }     # canary by weight
      timeouts: { request: 10s }
# Role-oriented (infra owns Gateway, app teams own Routes),
# protocol-extensible (GRPCRoute, TCPRoute) — replaces Ingress
# annotations soup for good.`,
    },
    {
      lang: "bash",
      caption: "The debugging loop you will run 1000 times",
      code: `# 1) What does the API say about state?
kubectl get deploy,pods -o wide
kubectl describe pod api-7d9c4b6f5-x2k9z     # events at the bottom = truth

# 2) Why is it not running? (the classic failure families)
kubectl get events --sort-by=.lastTimestamp | tail -20
#   ImagePullBackOff → wrong tag / registry auth
#   CrashLoopBackOff → app fails on start → see logs
#   Pending          → insufficient resources / taints / PVC missing
#   Evicted          → node memory pressure (check limits vs usage)

# 3) Logs: current, previous (crashed), multi-container
kubectl logs deploy/api -f
kubectl logs pod/api-7d9c4b6f5-x2k9z --previous
kubectl logs pod/x --all-containers --since=10m

# 4) Network sanity from inside the mesh:
kubectl run tmp --rm -it --image=nicolaka/netshoot -- sh
  $ curl http://api.web.svc.cluster.local:80/ready   # DNS + service
  $ curl -v telnet://api:80                          # port open?

# 5) Live resource usage (needs metrics-server):
kubectl top pods --containers | sort -k3 -h | tail`,
    },
    {
      lang: "bash",
      caption: "Zero-downtime deploys and rollbacks",
      code: `# Rolling update (strategy already set to maxUnavailable: 0):
kubectl set image deploy/api api=registry.example.com/api:1.43.0

# Watch the rollout converge:
kubectl rollout status deploy/api

# It broke? One command back to the last good ReplicaSet:
kubectl rollout undo deploy/api
kubectl rollout history deploy/api        # see revisions
kubectl rollout undo deploy/api --to-revision=3

# The mechanics: a NEW ReplicaSet scales up while the old one
# scales down; readiness gates each step. Deploy ≠ release:
# pair with feature flags or Gateway weights for real canaries.`,
    },
    {
      lang: "yaml",
      caption: "Autoscaling: HPA on custom metrics",
      code: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: api }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 3
  maxReplicas: 30
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300   # don't flap on 5-min dips
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 65 }
    - type: Pods                       # custom metric (Prometheus adapter)
      pods:
        metric: { name: http_requests_per_second }
        target: { type: AverageValue, averageValue: "100" }

# Prereq: resource requests on every container (HPA math needs them).
# v1.37: HPA can scale to zero on custom metrics for spiky batch
# frontends. KEDA for event-driven (queue depth) scaling.`,
    },
  ],

  pitfalls: [
    { title: "Assuming Pod startup order", symptom: "Service B crashes at boot because Pod A was not ready yet.", fix: "initContainers with wait loops or readiness-gated Services (startupProbe + retry clients); ordering is never guaranteed by the API." },
    { title: "No resource requests/limits", symptom: "Pods land on packed nodes, get OOM-killed randomly, HPA autoscaling does nothing, cluster dies on one noisy neighbor.", fix: "Set requests (scheduling guarantee) and limits (containment) on every container, always. Size from metrics (kubectl top), not vibes. CPU limits cause throttling — many teams set CPU requests only + memory both, deliberately and explicitly." },
    { title: "Deploying :latest and praying", symptom: "Rollouts don't trigger (same tag), rollbacks impossible, no one knows what's running, cache-pull surprises.", fix: "Pin immutable tags (git SHA or semver) — the Deployment spec must change for a rollout to happen. imagePullPolicy aside, :latest breaks the core k8s contract that spec-change drives change." },
    { title: "Skipping readiness probes (or pointing them at /)", symptom: "Traffic hits pods mid-boot or mid-crash; 502s during every deploy; rolling updates are not actually zero-downtime.", fix: "readiness = 'should this pod receive traffic' (deps connected, warmed up) — gates rollout steps. liveness = 'should this pod be restarted' (deadlock detection). Keep liveness lenient — a strict liveness probe causes restart storms under load." },
    { title: "Killing pods without termination grace", symptom: "Dropped requests and broken DB transactions at every deploy/scale-down; SIGKILL after 30s default but the app never handles SIGTERM.", fix: "Handle SIGTERM: stop accepting, drain in-flight, close connections (the graceful-shutdown pattern). Raise terminationGracePeriodSeconds for slow drains. A PodDisruptionBudget keeps node drains from dropping availability below your floor." },
    { title: "Secrets treated as secure storage", symptom: "Base64 'encrypted' secrets committed to git, readable by every pod via the default SA or mounted env vars leaking into logs/crash dumps.", fix: "Secrets are only RBAC-protected base64. Use a real secret manager (Vault, External Secrets Operator + cloud KMS), seal-secrets for git workflows, and enable encryption at rest (KMS provider) on etcd. Never log secret env vars." },
    { title: "Thinking kubectl apply is synchronous", symptom: "'kubectl apply && curl' fails; scripts assume resources exist that are still being created; race-y CI pipelines.", fix: "Everything is eventually-consistent reconcile loops. Wait explicitly: kubectl wait --for=condition=ready, rollout status, or --wait on apply. Design scripts against conditions, not against the assumption of immediacy." },
    { title: "ConfigMap updates don't reach running pods", symptom: "You update the ConfigMap; nothing changes; pods serve stale config for days.", fix: "Env-var config is immutable per-pod; volume-mounted config files refresh (kubelet sync period, ~1min) but the app must re-read them. Standard answer: roll the deployment (reloader, checksums in pod annotations, or immutable tagged config + explicit rollout)." },
    { title: "Running stateful workloads 'because it can'", symptom: "Self-managed Postgres/ES on k8s with NFS volumes — latency collapses, failovers corrupt, ops burden multiplies.", fix: "Use an operator with real failover logic (CloudNativePG, operators from vendors) or a managed service. StatefulSet + PVC is a mechanism, not a database administration strategy. The etcd quorum you're running the cluster on is stateful enough." },
  ],

  quickReference: [
    { fact: "Current: v1.37 'Garhwal' (Aug 2026; patch 1.37.2 Oct 2026). Highlights: Memory QoS beta, Metrics API stable, HPA scale-to-zero, rootless kubelet beta.", tag: "version" },
    { fact: "Release cadence: 3 minors/year, ~12 months of patch support per minor — plan upgrades as routine, not events.", tag: "version" },
    { fact: "The API is the product: kubectl, dashboards, GitOps controllers, and every cloud's UI are API clients — automate via the API, never via UI.", tag: "architecture" },
    { fact: "Gateway API (v1 since 2023) replaces Ingress: role-oriented, protocol-extensible, cross-implementation portable. New L7 routing should start there.", tag: "networking" },
    { fact: "Control plane: API server (front door) + etcd (state) + scheduler (bin-packs pods) + kubelet (node agent) + controller-manager (reconcile loops).", tag: "architecture" },
    { fact: "CRI (containerd, 1.7+/2.x) runs containers; every node runs a CNI (Calico/Cilium) for the pod network — k8s ships NEITHER networking nor storage; plugins provide them.", tag: "architecture" },
    { fact: "Namespaces are isolation for NAMES and RBAC, not for compute/network — pods on different namespaces can still fight for the same node CPU.", tag: "gotcha" },
    { fact: "kubectl explain <resource> prints the schema of anything — the fastest way to answer 'what fields exist' without leaving the terminal.", tag: "tooling" },
    { fact: "Node drain = voluntary disruption; PDBs protect during drains. Node death = involuntary; only replicas + topology spread protect there.", tag: "availability" },
    { fact: "Container startup order is NOT guaranteed — use initContainers for 'start after X' needs (wait-for jobs, config prep), never pod spec ordering assumptions.", tag: "gotcha" },
    { fact: "CNCF ecosystem gravity in 2026: Prometheus (monitoring), Argo CD (GitOps), Istio/Cilium (mesh), Crossplane (infra), Helm/Kustomize (packaging) — learn the API once, compose forever.", tag: "ecosystem" },
    { fact: "Cost control: requests over-provisioning is the #1 cloud waste; Kubecost/OpenCost + right-sized requests (VPA recommendations) recover 30-50% on mature clusters.", tag: "cost" },
  ],

  goDeeper: [
    { title: "Kubernetes Documentation", url: "https://kubernetes.io/docs/home/", note: "Among the best docs in infrastructure — the Concepts section is a genuine education in distributed systems." },
    { title: "Kubernetes Blog", url: "https://kubernetes.io/blog/", note: "Release announcements with migration notes; read each minor's changes before upgrading." },
    { title: "KodeKloud / killer.sh", url: "https://killer.sh/", note: "CKA/CKAD practice environments — the exam simulations double as the best hands-on labs anywhere." },
    { title: "GitHub — kubernetes/enhancements (KEPs)", url: "https://github.com/kubernetes/enhancements", note: "Where features are actually designed — read a KEP (e.g., Gateway API) to understand the why behind the YAML." },
    { title: "Google SRE Book", url: "https://sre.google/books/", note: "The reconcile-loop philosophy k8s inherits from Borg — chapters on release engineering and alerting age well." },
  ],

  // ─── §8 "Data types" — the resource model ────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "Pod", behavior: "One or more containers sharing network/storage; the atom of scheduling; mortal by design.", when: "Never directly (except debug/static pods) — via Deployment/Job controllers." },
      { syntax: "Node", behavior: "A machine (VM/bare metal) running kubelet + container runtime.", when: "Capacity planning; label/taint it for workload classes." },
      { syntax: "Namespace", behavior: "Name + RBAC scope within a cluster.", when: "Team/environment boundaries — not a performance boundary." },
      { syntax: "Label / Annotation", behavior: "Labels: identifying, selector-matchable metadata. Annotations: non-identifying (tool configs, checksums).", when: "Selectors wire Service→Pod, Deployment→ReplicaSet; annotations carry rollout checksums and tool hints." },
    ],
    collections: [
      { syntax: "Deployment → ReplicaSet → Pods", behavior: "Versioned sets of identical pods; rollout = new RS up, old RS down.", when: "All stateless services. The default workload kind." },
      { syntax: "StatefulSet", behavior: "Ordered, stable-identity pods (web-0, web-1) with per-pod PVCs.", when: "Clusters with peer discovery/leader election: DBs, Kafka, Cassandra (via operators ideally)." },
      { syntax: "DaemonSet", behavior: "One pod per (matching) node, always.", when: "Node agents: log shippers, CNI pieces, monitoring exporters." },
      { syntax: "Service → Endpoints/EndpointSlice", behavior: "Virtual IP backed by a label-matched pod list, kept live by a controller.", when: "Stable addressing; ClusterIP internal, LoadBalancer external, Headless for direct pod DNS (StatefulSet peers)." },
    ],
    custom: [
      { syntax: "CRD (Custom Resource Definition)", behavior: "Extends the API with new resource types; your YAML, your schema.", when: "Operators and platform abstractions (Databases, Certificates, Gateways) — the entire ecosystem runs on CRDs." },
      { syntax: "Operator pattern", behavior: "Controller + CRD: encode operational knowledge (backup, failover, scale) as reconcile loops.", when: "Stateful apps at org scale; before writing one, check if an operator already exists (operatorhub.io)." },
      { syntax: "Helm chart / Kustomize overlay", behavior: "Packaging: templates+values vs. patch-and-merge over bases.", when: "Third-party software → Helm. Internal manifests → Kustomize + GitOps. Both → pick one per repo, not per mood." },
    ],
  },

  // ─── §9 Operators & expressions (selector algebra) ────────────────────────
  operators: [
    { syntax: "metadata.labels matchLabels", behavior: "Equality-only selector — the Service/Deployment wiring mechanism.", when: "Exact-match grouping; the 95% case." },
    { syntax: "matchExpressions: {key, In, NotIn, Exists, DoesNotExist}", behavior: "Set-based selectors — OR over values, existence tests.", when: "Node affinity/anti-affinity and advanced workload targeting." },
    { syntax: "nodeSelector vs nodeAffinity", behavior: "Simple required match vs required+preferred rules with weights.", when: "nodeSelector for 'must be in zone a'; affinity for 'prefer spot instances, fall back to on-demand'." },
    { syntax: "podAntiAffinity (topologyKey)", behavior: "Spread/stack constraint between pods, not nodes.", when: "'No two replicas of this on one node/rack' — pair with topologySpreadConstraints (simpler, sufficient usually)." },
    { syntax: "taints + tolerations", behavior: "Nodes repel pods unless the pod tolerates the taint.", when: "Dedicated hardware (GPU nodes), spot pools (tolerate scale-down taint)." },
  ],

  // ─── §10 Input / output (getting traffic and data in/out) ─────────────────
  inputOutput: [
    {
      lang: "bash",
      caption: "Talking to the cluster: contexts, manifests, and port-forwards",
      code: `# Contexts = which cluster am I pointing at (merge kubeconfigs):
kubectl config get-contexts
kubectl config use-context prod-eu
kubectl config set-context --current --namespace=payments   # default ns

# Declarative apply (the only right way):
kubectl apply -f deploy/ -R
kubectl apply -k overlays/prod          # kustomize
helm upgrade --install api charts/api -f values-prod.yaml

# Debug escape hatches:
kubectl port-forward svc/api 8080:80   # local tunnel, no ingress needed
kubectl cp payments/api-abc:/tmp/dump.db ./dump.db
kubectl exec -it deploy/api -- sh

# Dry-run the actual API objects your manifest produces:
kubectl apply -f x.yaml --dry-run=server
# What changed last, and who? (audit via enablement):
kubectl diff -f x.yaml`,
    },
    {
      lang: "yaml",
      caption: "Config and secrets: the three injection styles",
      code: `# 1) Env vars — simple, immutable-at-runtime:
env:
  - name: LOG_LEVEL
    valueFrom: { configMapKeyRef: { name: cfg, key: log_level } }

# 2) Volume files — hot-reloadable (kubelet re-syncs), secret-ish:
volumes:
  - name: cfg
    configMap: { name: api-config }
  - name: tls
    secret:    { secretName: api-tls }
# mounted as files at /etc/config, /etc/tls — apps re-read on change

# 3) EnvFrom — bulk:
envFrom:
  - configMapRef: { name: api-env }

# Rotation story: volume-mounted Secrets update in-place
# (kubelet sync ~1min); env-injected require pod restart.
# Real secret management: External Secrets Operator syncing
# from Vault/cloud KMS into native Secrets.`,
    },
  ],

  // ─── §11 Loops & iteration (controllers as loops) ─────────────────────────
  loops: [
    {
      lang: "yaml",
      caption: "Init containers: ordered startup steps",
      code: `spec:
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z db 5432; do sleep 2; done']
    - name: migrate
      image: registry.example.com/api:1.42.0
      command: ['./migrate', 'up']
  containers:
    - name: api
      # runs only after every initContainer succeeded (in order)
# The pattern: migration-as-init-container guarantees the app
# container always starts against a migrated schema — better than
# CI-run migrations for rollback pairing. For slow/coordinated
# migrations use a Job + Argo sync-wave instead.`,
    },
    {
      lang: "bash",
      caption: "Waiting and watching: scripting against convergence",
      code: `# Block until a condition is true — the RIGHT primitive for CI:
kubectl wait --for=condition=Available deployment/api --timeout=120s
kubectl wait --for=condition=Ready pod -l app=api --timeout=60s

# Watch live changes (it's just the watch API):
kubectl get events -w --sort-by=.lastTimestamp
kubectl get pods -w -l app=api

# Poll-free status via rollout:
kubectl rollout status deploy/api --timeout=180s

# One-liner loop when you must poll (e.g., custom conditions):
while ! kubectl get deploy/api -o json | jq -e '.status.conditions[]
  | select(.type=="Progressing" and .status=="True")' > /dev/null; do
  sleep 3; done`,
    },
  ],

  // ─── §12 Functions & callables (controllers & webhooks) ──────────────────
  functions: [
    {
      lang: "yaml",
      caption: "Extending the loop: admission webhooks and finalizers",
      code: `# Admission webhooks mutate/validate EVERY write to the API —
# how policy engines (OPA/Gatekeeper, Kyverno) and injectors work:
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionWebhook
# (served by Kyverno/OPA in practice — you write POLICY, not TLS):
#   require labels, block :latest, force securityContext...
# Kyverno policy example (the 5-line version of a webhook):
# apiVersion: kyverno.io/v1
# kind: ClusterPolicy
# spec:
#   rules:
#     - name: require-limits
#       match: { resources: { kinds: [Pod] } }
#       validate:
#         message: "resources limits are mandatory"
#         pattern: { spec: { containers: [[ resources: { limits: {} } ]] } } }

# Finalizers: cleanup BEFORE deletion completes
metadata:
  finalizers: [example.com/cleanup-hook]
# delete marks the object; controller does external cleanup
# (release LB IPs, delete disks), THEN removes the finalizer,
# THEN the object actually goes away. Stuck 'Terminating' =
# a finalizer whose controller is gone.`,
    },
  ],

  // ─── §13 Error handling ───────────────────────────────────────────────────
  errorHandling: [
    {
      lang: "bash",
      caption: "Failure taxonomy: map symptom to cause",
      code: `# Pending → scheduling failed. Causes:
kubectl describe pod x | grep -A5 Events
#   Insufficient cpu/memory → raise limits or add nodes
#   node(s) had untolerated taint → tolerations
#   volume node affinity conflict → wrong zone for the PV

# ImagePullBackOff → image name/registry/auth:
kubectl get secret regcred -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d
# fix: correct tag, imagePullSecrets, or public mirror

# CrashLoopBackOff → the app dies at startup:
kubectl logs pod/x --previous | tail -30
# common: bad config, missing secret, port bind fail, OOM
# (137 exit = SIGKILL: memory limit; check dmesg for OOM)

# Evicted → node pressure: node-level (describe node):
kubectl describe node n1 | grep -A10 "Conditions:"
# Allocated resources: sum of requests vs capacity

# FailedScheduling w/ PDB → drain blocked by disruption budget:
#   kubectl get pdb  → check disruptionsAllowed: 0

# Stuck Terminating → orphaned finalizer (or unreachable webhook):
kubectl patch pvc x -p '{"metadata":{"finalizers":null}}'  # last resort`,
    },
  ],

  // ─── §14 "Concurrency" — scheduling & multi-tenancy ──────────────────────
  concurrency: [
    {
      lang: "yaml",
      caption: "The scheduler's inputs: what decides where pods land",
      code: `# Bin-packing with constraints, evaluated per pending pod:
#   1. Predicates (filter): enough CPU/mem (requests), ports free,
#      node affinity, taints tolerated, volume zone
#   2. Priorities (score): least-requested vs balanced,
#      affinity/anti-affinity weights, topology spread
resources:
  requests: { cpu: 500m, memory: 1Gi }   # THE scheduling input

# Priority & preemption: high-priority pods evict low ones
priorityClassName: critical
# (define PriorityClasses; system-cluster-critical > default)

# Limits per namespace (the multi-tenancy fence):
apiVersion: v1
kind: ResourceQuota
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    pods: "100"
# + LimitRange sets per-container defaults inside the namespace.`,
    },
  ],

  // ─── §15 Testing ──────────────────────────────────────────────────────────
  testing: [
    {
      lang: "bash",
      caption: "Testing manifests and clusters",
      code: `# 1) Static: does the YAML parse and match schemas?
kubeconform -strict -summary deploy/          # schema, fast
kubectl apply --dry-run=server -f x.yaml      # real API validation
polaris audit --audit-path ./deploy           # best-practice lint

# 2) Policy-as-code gates in CI:
kyverno apply policies/ --resource deploy/    # fail the build

# 3) Local cluster that is NOT a lie:
kind create cluster           # real kubelet+API in docker
# minikube for multi-node, k3d for k3s flavor

# 4) Chaos/soak: verify the loops actually converge
#   kill pods:      kubectl delete pod -l app=api --wait=false
#   drain a node:   kubectl drain n1 --ignore-daemonsets
#   watch PDB +     readiness keep the error budget flat

# 5) Conformance (is your 'kubernetes' actually kubernetes?):
sonobuoy run --mode certified-conformance`,
    },
  ],

  // ─── §16 Performance ──────────────────────────────────────────────────────
  performance: [
    { fact: "Requests over-provisioning is the #1 cloud cost bug — Kubecost/OpenCost visibility plus VPA recommendations routinely cut cluster spend 30-50%.", tag: "cost" },
    { fact: "Pod startup time: pre-pulled images (DaemonSet pre-puller), small images (distroless/distroless-node), and initContainer-less designs keep scale-up under 30s.", tag: "latency" },
    { fact: "CPU limits throttle CFS — latency-sensitive services often run requests-only for CPU (limits for memory always): a deliberate, documented tradeoff.", tag: "throttling" },
    { fact: "HPA needs 2-10 minutes of stabilization to avoid flapping; tune behavior.scaleDown.stabilizationWindowSeconds (default 300) to your traffic shape.", tag: "autoscaling" },
    { fact: "Node-level: hugepages for DPDK-ish workloads, guaranteed QoS class (requests==limits) for the top-latency tier, topology manager policies for NUMA/GPU pinning.", tag: "qos" },
    { fact: "API server overload: limit watches, paginate LISTs, use label selectors, informer caches in controllers — 'kubectl get pods -A' every 5s is an anti-pattern at scale.", tag: "api" },
    { fact: "etcd latency bounds the whole control plane: fast disks (NVMe, fsync <10ms), defragmentation, and keeping events etcd separate at 500+ node scale.", tag: "controlplane" },
    { fact: "Service mesh sidecars add ~1-3ms p50 per hop and 100-200MB RAM per pod — Cilium/ambient (sidecar-less) modes exist precisely to buy that back.", tag: "networking" },
    { fact: "Image pull is the dominant cold-start: use a registry near the cluster, image streaming/kopia lazy-loading where the runtime supports it.", tag: "latency" },
    { fact: "Cluster Autoscaler/Karpenter: Karpenter's right-sizing + consolidated nodes beat classic ASG patterns on both cost and time-to-capacity.", tag: "autoscaling" },
  ],

  // ─── §17 Ecosystem & tooling ──────────────────────────────────────────────
  ecosystem: [
    { tool: "Helm", purpose: "Templated packaging + release lifecycle; how third-party software ships.", url: "https://helm.sh/", category: "packaging" },
    { tool: "Kustomize", purpose: "Overlay/patch composition for your own manifests — built into kubectl.", url: "https://kustomize.io/", category: "packaging" },
    { tool: "Argo CD / Flux", purpose: "GitOps: cluster state continuously reconciled from git.", url: "https://argo-cd.readthedocs.io/", category: "deploy" },
    { tool: "Prometheus + Grafana", purpose: "The monitoring stack (kube-prometheus-stack chart is the de facto install).", url: "https://prometheus.io/", category: "observability" },
    { tool: "Cilium / Calico", purpose: "CNI networking with network policy; Cilium adds eBPF-based L7 and service mesh.", url: "https://cilium.io/", category: "networking" },
    { tool: "Istio", purpose: "The mature service mesh (mTLS, traffic splitting, telemetry).", url: "https://istio.io/", category: "networking" },
    { tool: "Kyverno / OPA Gatekeeper", purpose: "Policy-as-code admission control — guardrails as YAML.", url: "https://kyverno.io/", category: "security" },
    { tool: "Crossplane", purpose: "Cloud infrastructure via k8s API (CRDs for buckets, DBs, DNS).", url: "https://www.crossplane.io/", category: "infra" },
    { tool: "Karpenter", purpose: "Node autoscaling that right-sizes instances on demand (AWS-born, portable).", url: "https://karpenter.sh/", category: "autoscaling" },
    { tool: "KEDA", purpose: "Event-driven autoscaling (queue depth, stream lag → replicas).", url: "https://keda.sh/", category: "autoscaling" },
    { tool: "Kubectl / k9s", purpose: "CLI and the TUI every operator lives in.", url: "https://k9scli.io/", category: "tooling" },
    { tool: "kind / minikube / k3s", purpose: "Local + edge clusters for dev, CI, and IoT.", url: "https://kind.sigs.k8s.io/", category: "tooling" },
    { tool: "CloudNativePG", purpose: "Production Postgres operator (failover, backups via CNPG-native tooling).", url: "https://cloudnative-pg.io/", category: "data" },
  ],

  // ─── §18 Version history ──────────────────────────────────────────────────
  versionHistory: [
    { version: "Borg → Omega → Kubernetes", year: 2014, highlight: "Google opensources its third take on cluster management; Go, etcd, and reconcile loops from day one." },
    { version: "1.0", year: 2015, highlight: "First stable API; CNCF founded with k8s as its first project; the orchestrator wars (vs Swarm, Mesos) begin." },
    { version: "1.6-1.9", year: 2017, highlight: "RBAC (1.6), CRDs + Workload API (1.9) — the extensibility turn that created the entire operator ecosystem." },
    { version: "1.14-1.16", year: 2019, highlight: "Production-level custom resources, stable scheduling framework; windows-nodes GA — enterprise adoption wave." },
    { version: "1.20", year: 2020, highlight: "Dockershim deprecated (CRI only) — containerd era begins; cronjobs GA, API deprecation cleanups." },
    { version: "1.24-1.25", year: 2022, highlight: "Dockershim removed; network policy GA maturation; Secret protection push (kms v2)."},
    { version: "1.27-1.29", year: 2023, highlight: "Sidecar containers (initContainers restartPolicy), Gateway API GA, in-place pod resize (alpha) — ergonomics decade begins." },
    { version: "1.30-1.33", year: 2024, highlight: "In-place resize beta, AppArmor GA, user namespaces alpha, structured authn, DRA (Dynamic Resource Allocation) for GPUs." },
    { version: "1.34-1.36", year: 2025, highlight: "DRA GA-bound for AI workloads, job success-completion policy, memory manager maturation, portforward over websockets." },
    { version: "1.37 'Garhwal'", year: 2026, highlight: "Memory QoS beta, Metrics API stable, HPA scale-to-zero, rootless kubelet beta, storage hardening. Current: 1.37.2 (Oct 2026)." },
  ],

  // ─── §19 Interview hot questions ──────────────────────────────────────────
  interview: [
    { q: "What happens when you type kubectl apply?", a: "kubectl reads the manifest, diffs it against the live object (last-applied annotation), and PUTs the merged spec to the API server. The API server authenticates you, runs admission (mutating → validating webhooks), validates the schema, persists to etcd, and notifies watchers. Controllers watching that resource enqueue a reconcile: the Deployment controller creates/updates a ReplicaSet, which the ReplicaSet controller turns into Pod objects, which the scheduler binds to nodes, where kubelets create containers via the CRI. Every step is async — 'apply succeeded' means 'stored', not 'running'.", difficulty: "hard" },
    { q: "Walk me through a rolling update.", a: "Deployment controller computes a new ReplicaSet with the new pod template. Per maxSurge/maxUnavailable it scales the new RS up and the old RS down in steps, waiting for readiness at each. Readiness gates traffic: the Service's EndpointSlices only include Ready pods, so requests never hit an unready new pod. If the new version never becomes ready, progressDeadlineSeconds marks the rollout failed (and kubectl rollout undo scales the old RS back up). Rollback works precisely because old ReplicaSets are kept (scaled to zero, not deleted).", difficulty: "medium" },
    { q: "Difference between liveness, readiness, and startup probes?", a: "Readiness: 'should traffic be routed here?' — failure removes the pod from EndpointSlices but keeps it running; use for dependency-connected/warmed state; gates rollouts. Liveness: 'should this container be restarted?' — failure kills and restarts the container; use only for true deadlocks, and keep it lenient (strict liveness under load = restart storms that cascade). Startup: 'is it still booting?' — runs first, disables liveness/readiness until success; use for slow starters (JVM, model loading). All three share http/tcp/exec mechanics.", difficulty: "easy" },
    { q: "Why do Services exist if pods have IPs?", a: "Pod IPs are mortal: rescheduling, scaling, crashes all change them. A Service is a stable name + virtual IP backed by a label selector — an Endpoints/EndpointSlice controller keeps the healthy-pod list current, and kube-proxy (or CNI) programs the data path that load-balances across it. DNS (CoreDNS) resolves the service name cluster-wide. It's the same 'stable identity over a changing set' pattern as every other k8s resource.", difficulty: "easy" },
    { q: "How would you debug a pod stuck in Pending?", a: "kubectl describe pod — the Events section names the scheduler's rejection: insufficient cpu/memory (requests exceed capacity → check node Allocated resources, lower requests or add nodes), taints not tolerated (dedicated/spot pools), node affinity/selector mismatch, volume zone conflict (PV pinned to another zone), or PDB blocking preemption. kubectl get nodes -o wide + describe node shows pressure; kube-scheduler logs give the exact predicate that failed at fleet scale.", difficulty: "medium" },
    { q: "Explain requests vs limits and their consequences.", a: "Requests: the scheduler's input — guaranteed capacity, used for bin-packing and HPA percentage math. Limits: the container's ceiling — CPU is throttled at the CFS level (latency!), memory exceeds get OOM-killed (exit 137). Consequences: no requests → scheduler is blind (overpacked nodes, useless HPA); no memory limit → node pressure evictions; tight CPU limits → throttling tail latency. The deliberate production pattern: memory requests=limits (Guaranteed-ish QoS, no surprises), CPU requests set, limits high or absent for latency-sensitive tiers.", difficulty: "medium" },
    { q: "What's a PodDisruptionBudget and when does it NOT help?", a: "A PDB tells the eviction API the floor: 'minAvailable: 2' means voluntary disruptions (kubectl drain, cluster autoscaler, node upgrades) must leave 2 pods running — drains pause until they can proceed. It does NOT protect against involuntary disruption: node hardware death, kernel panic, OOM kills. Redundancy + topologySpreadConstraints + anti-affinity handle those. A PDB you forgot before an upgrade is the classic 'why is my deploy stuck draining' incident.", difficulty: "medium" },
    { q: "How do you handle secrets properly in k8s?", a: "Native Secrets are base64 in etcd — safe only as a transport, not storage. Production stack: external secret manager (Vault, AWS Secrets Manager, GCP SM) synced by External Secrets Operator into native Secrets for pod consumption; encryption at rest via KMS provider on etcd; RBAC scoping so only the right service accounts/namespaces can read them; volume mounts over env vars (rotation without restart); and never committing sealed values outside sealed-secrets/SOPS flows. Audit secret reads through the same RBAC audit pipeline as everything else.", difficulty: "hard" },
    { q: "When would you NOT use Kubernetes?", a: "Honest boundaries: a handful of long-running services on one box (docker compose is a 10x simpler operational model); team smaller than ~5-8 engineers without platform time (the control plane tax is a second product to run); strict single-tenant simplicity (PaaS/serverless); and workloads that are pure batch with no service semantics (a workflow engine on VMs is fine). The question interviewers want answered is 'you know k8s is a cost, not a status symbol' — articulate what you'd trade away.", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ──────────────────────────────────────────────────────
  comparisons: [
    { vs: "Docker Compose / Swarm", whenThis: "Multi-node scale, self-healing, rolling infra, operators/GitOps ecosystem, org-standard platform APIs.", whenThat: "Single-host simplicity, deterministic local dev, minimal learning curve. Compose remains the right local-dev default even for k8s shops." },
    { vs: "Serverless (Lambda/FaaS)", whenThis: "Steady traffic, long-lived connections (websockets, gRPC streams), complex runtime deps, cost at scale.", whenThat: "Spiky/episodic traffic, scale-to-zero economics, event handlers with no service semantics. Many teams run both: services on k8s, glue on functions." },
    { vs: "Nomad", whenThis: "You want the ecosystem: every database, mesh, GitOps, and monitoring tool ships a k8s operator first.", whenThat: "Simpler single-binary orchestration (including non-container workloads), smaller operational surface; HashiCorp stack alignment. (Nomad + BSL-license alignment.)" },
    { vs: "Managed k8s (EKS/GKE/AKS)", whenThis: "You want to own control-plane tuning, air-gapped or sovereign deployments, cost at very large scale.", whenThat: "Almost always: the cloud runs etcd/API/HA for you — self-managed control planes are a specialty choice in 2026." },
    { vs: "VMs + autoscaling groups", whenThis: "Containers as the packaging unit, fast scale-out (seconds not minutes), declarative recovery, dense bin-packing.", whenThat: "Legacy runtimes, strict hardware isolation per tenant, or golden-image orgs — but you'll likely run k8s ON those VMs." },
  ],
};

export default sheet;
