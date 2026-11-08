# Kubernetes

**Category:** Topics · **Tier:** Topic · **Tags:** orchestration, containers, cloud-native, k8s, devops, infrastructure · **First released:** 2014 · **Author:** Google (Borg lineage), CNCF · **Last updated:** 2026-11

> The container orchestrator — declarative desired state, self-healing workloads, and the API every cloud speaks.

---

## TL;DR

- Kubernetes is a control plane that drives a cluster of machines toward a declared desired state: you submit YAML describing containers, replicas, networks, and storage; controllers continuously reconcile reality against it.
- It won the orchestration war definitively (v1.0 in 2015; now v1.37 'Garhwal', Aug 2026) and is the substrate of every major cloud, the CNCF ecosystem (Prometheus, Istio, Argo), and platform engineering. It is also the industry's #1 complexity tax — teams without dedicated platform time feel it.
- Reach for k8s when you run many services with heterogeneous scaling, rolling deploys, and self-healing requirements, or when your org standardizes on it (most do).
- Reach around it for simpler needs: a few containers on one box (compose), serverless functions, or PaaS — a small team can spend more time operating k8s than operating its product.

## Core Mental Model

**Declarative state + reconcile loops, all the way down.** Everything in Kubernetes is an object in etcd watched by a controller that runs a reconcile loop: 'here is the spec (desired); here is the status (observed); make them match.' A Deployment says 5 replicas; a ReplicaSet controller creates/removes Pods until there are 5. A node dies; another loop notices and reschedules its pods. You never script failure handling — you declare invariants and let loops converge. This explains the whole system: why kubectl apply is idempotent, why resources are eventually-consistent (never assume synchronous effects), why 'it works' means 'the loops have converged', and why every problem is diagnosed the same way: kubectl describe → events → logs → controller conditions. The API server is just a CRUD + watch layer over etcd; controllers do ALL the real work.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| kind: Deployment + replicas + containers | Stateless workload: manages ReplicaSets, rolls out new versions, rolls back on failure. | Default for anything without per-pod identity (APIs, workers, web frontends). |
| kind: Service (ClusterIP/NodePort/LoadBalancer) | Stable virtual IP/DNS in front of a shifting set of pods; label-selector based. | Every workload that receives traffic — service discovery is selector matching. |
| kind: Ingress / Gateway API (HTTPRoute) | L7 routing: host/path → service, TLS termination. Gateway API is the modern replacement. | External HTTP entry points. Prefer Gateway API (GA 2023, standard in 2026) for new setups. |
| kind: StatefulSet + volumeClaimTemplates | Stable identity (pod-0, pod-1...) + per-pod PVCs; ordered rollout by default. | Databases, queues, anything with per-instance state or leader election. |
| kind: Job / CronJob | Run-to-completion pods with retries; CronJob schedules them. | Batch, migrations, report generation. NOT for long-running services. |
| kind: HPA (HorizontalPodAutoscaler) | Scales replicas on metrics (CPU/mem/custom); v1.37 adds scale-to-zero for scale-to-zero workloads. | Variable load. Requires metrics-server + sane resource requests. |
| requests/limits on resources | Requests drive scheduling; limits cap usage (CPU throttled, memory OOM-killed). | ALWAYS on every container — the scheduler and HPA are meaningless without them. |
| ConfigMap / Secret + env/volume projection | External configuration injected at runtime; secrets are base64, not encrypted by default. | Config and credentials — mount as volumes (not env) for secrets that rotate. |
| livenessProbe / readinessProbe / startupProbe | Restart vs reroute vs wait-until-started health contracts. | Every service: readiness gates traffic, liveness recovers from deadlock, startup protects slow booters. |
| ServiceAccount + RBAC (Role/RoleBinding) | Pod identity + least-privilege API access for in-cluster automation. | Controllers, CI runners, anything calling the k8s API. Default SA should have nothing. |
| PodDisruptionBudget | Guarantees min available replicas during voluntary disruptions (drains). | Required on anything user-facing before node upgrades happen under it. |

## Idiomatic Patterns

**A production-grade Deployment, complete**

```yaml
apiVersion: apps/v1
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
          emptyDir: {}
```

**Gateway API: the modern ingress**

```yaml
# GatewayClass — installed by the implementation (envoy gateway, istio...)
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
# annotations soup for good.
```

**The debugging loop you will run 1000 times**

```bash
# 1) What does the API say about state?
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
kubectl top pods --containers | sort -k3 -h | tail
```

**Zero-downtime deploys and rollbacks**

```bash
# Rolling update (strategy already set to maxUnavailable: 0):
kubectl set image deploy/api api=registry.example.com/api:1.43.0

# Watch the rollout converge:
kubectl rollout status deploy/api

# It broke? One command back to the last good ReplicaSet:
kubectl rollout undo deploy/api
kubectl rollout history deploy/api        # see revisions
kubectl rollout undo deploy/api --to-revision=3

# The mechanics: a NEW ReplicaSet scales up while the old one
# scales down; readiness gates each step. Deploy ≠ release:
# pair with feature flags or Gateway weights for real canaries.
```

**Autoscaling: HPA on custom metrics**

```yaml
apiVersion: autoscaling/v2
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
# frontends. KEDA for event-driven (queue depth) scaling.
```

## Common Pitfalls

1. **Assuming Pod startup order** — *Symptom:* Service B crashes at boot because Pod A was not ready yet. *Fix:* initContainers with wait loops or readiness-gated Services (startupProbe + retry clients); ordering is never guaranteed by the API.
2. **No resource requests/limits** — *Symptom:* Pods land on packed nodes, get OOM-killed randomly, HPA autoscaling does nothing, cluster dies on one noisy neighbor. *Fix:* Set requests (scheduling guarantee) and limits (containment) on every container, always. Size from metrics (kubectl top), not vibes. CPU limits cause throttling — many teams set CPU requests only + memory both, deliberately and explicitly.
3. **Deploying :latest and praying** — *Symptom:* Rollouts don't trigger (same tag), rollbacks impossible, no one knows what's running, cache-pull surprises. *Fix:* Pin immutable tags (git SHA or semver) — the Deployment spec must change for a rollout to happen. imagePullPolicy aside, :latest breaks the core k8s contract that spec-change drives change.
4. **Skipping readiness probes (or pointing them at /)** — *Symptom:* Traffic hits pods mid-boot or mid-crash; 502s during every deploy; rolling updates are not actually zero-downtime. *Fix:* readiness = 'should this pod receive traffic' (deps connected, warmed up) — gates rollout steps. liveness = 'should this pod be restarted' (deadlock detection). Keep liveness lenient — a strict liveness probe causes restart storms under load.
5. **Killing pods without termination grace** — *Symptom:* Dropped requests and broken DB transactions at every deploy/scale-down; SIGKILL after 30s default but the app never handles SIGTERM. *Fix:* Handle SIGTERM: stop accepting, drain in-flight, close connections (the graceful-shutdown pattern). Raise terminationGracePeriodSeconds for slow drains. A PodDisruptionBudget keeps node drains from dropping availability below your floor.
6. **Secrets treated as secure storage** — *Symptom:* Base64 'encrypted' secrets committed to git, readable by every pod via the default SA or mounted env vars leaking into logs/crash dumps. *Fix:* Secrets are only RBAC-protected base64. Use a real secret manager (Vault, External Secrets Operator + cloud KMS), seal-secrets for git workflows, and enable encryption at rest (KMS provider) on etcd. Never log secret env vars.
7. **Thinking kubectl apply is synchronous** — *Symptom:* 'kubectl apply && curl' fails; scripts assume resources exist that are still being created; race-y CI pipelines. *Fix:* Everything is eventually-consistent reconcile loops. Wait explicitly: kubectl wait --for=condition=ready, rollout status, or --wait on apply. Design scripts against conditions, not against the assumption of immediacy.
8. **ConfigMap updates don't reach running pods** — *Symptom:* You update the ConfigMap; nothing changes; pods serve stale config for days. *Fix:* Env-var config is immutable per-pod; volume-mounted config files refresh (kubelet sync period, ~1min) but the app must re-read them. Standard answer: roll the deployment (reloader, checksums in pod annotations, or immutable tagged config + explicit rollout).
9. **Running stateful workloads 'because it can'** — *Symptom:* Self-managed Postgres/ES on k8s with NFS volumes — latency collapses, failovers corrupt, ops burden multiplies. *Fix:* Use an operator with real failover logic (CloudNativePG, operators from vendors) or a managed service. StatefulSet + PVC is a mechanism, not a database administration strategy. The etcd quorum you're running the cluster on is stateful enough.

## Production / Interview Quick Reference

- Learning path: killercoda scenarios → CKA curriculum → own a cluster in kind → Argo CD for GitOps. `learning`
- Current: v1.37 'Garhwal' (Aug 2026; patch 1.37.2 Oct 2026). Highlights: Memory QoS beta, Metrics API stable, HPA scale-to-zero, rootless kubelet beta. `version`
- Release cadence: 3 minors/year, ~12 months of patch support per minor — plan upgrades as routine, not events. `version`
- The API is the product: kubectl, dashboards, GitOps controllers, and every cloud's UI are API clients — automate via the API, never via UI. `architecture`
- Gateway API (v1 since 2023) replaces Ingress: role-oriented, protocol-extensible, cross-implementation portable. New L7 routing should start there. `networking`
- Control plane: API server (front door) + etcd (state) + scheduler (bin-packs pods) + kubelet (node agent) + controller-manager (reconcile loops). `architecture`
- CRI (containerd, 1.7+/2.x) runs containers; every node runs a CNI (Calico/Cilium) for the pod network — k8s ships NEITHER networking nor storage; plugins provide them. `architecture`
- Namespaces are isolation for NAMES and RBAC, not for compute/network — pods on different namespaces can still fight for the same node CPU. `gotcha`
- kubectl explain <resource> prints the schema of anything — the fastest way to answer 'what fields exist' without leaving the terminal. `tooling`
- Node drain = voluntary disruption; PDBs protect during drains. Node death = involuntary; only replicas + topology spread protect there. `availability`
- Container startup order is NOT guaranteed — use initContainers for 'start after X' needs (wait-for jobs, config prep), never pod spec ordering assumptions. `gotcha`
- CNCF ecosystem gravity in 2026: Prometheus (monitoring), Argo CD (GitOps), Istio/Cilium (mesh), Crossplane (infra), Helm/Kustomize (packaging) — learn the API once, compose forever. `ecosystem`
- Cost control: requests over-provisioning is the #1 cloud waste; Kubecost/OpenCost + right-sized requests (VPA recommendations) recover 30-50% on mature clusters. `cost`

## Go Deeper

- [Kubernetes Documentation](https://kubernetes.io/docs/home/) — Among the best docs in infrastructure — the Concepts section is a genuine education in distributed systems.
- [Kubernetes Blog](https://kubernetes.io/blog/) — Release announcements with migration notes; read each minor's changes before upgrading.
- [KodeKloud / killer.sh](https://killer.sh/) — CKA/CKAD practice environments — the exam simulations double as the best hands-on labs anywhere.
- [GitHub — kubernetes/enhancements (KEPs)](https://github.com/kubernetes/enhancements) — Where features are actually designed — read a KEP (e.g., Gateway API) to understand the why behind the YAML.
- [Google SRE Book](https://sre.google/books/) — The reconcile-loop philosophy k8s inherits from Borg — chapters on release engineering and alerting age well.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Pod | One or more containers sharing network/storage; the atom of scheduling; mortal by design. | Never directly (except debug/static pods) — via Deployment/Job controllers. |
| Node | A machine (VM/bare metal) running kubelet + container runtime. | Capacity planning; label/taint it for workload classes. |
| Namespace | Name + RBAC scope within a cluster. | Team/environment boundaries — not a performance boundary. |
| Label / Annotation | Labels: identifying, selector-matchable metadata. Annotations: non-identifying (tool configs, checksums). | Selectors wire Service→Pod, Deployment→ReplicaSet; annotations carry rollout checksums and tool hints. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| Deployment → ReplicaSet → Pods | Versioned sets of identical pods; rollout = new RS up, old RS down. | All stateless services. The default workload kind. |
| StatefulSet | Ordered, stable-identity pods (web-0, web-1) with per-pod PVCs. | Clusters with peer discovery/leader election: DBs, Kafka, Cassandra (via operators ideally). |
| DaemonSet | One pod per (matching) node, always. | Node agents: log shippers, CNI pieces, monitoring exporters. |
| Service → Endpoints/EndpointSlice | Virtual IP backed by a label-matched pod list, kept live by a controller. | Stable addressing; ClusterIP internal, LoadBalancer external, Headless for direct pod DNS (StatefulSet peers). |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| CRD (Custom Resource Definition) | Extends the API with new resource types; your YAML, your schema. | Operators and platform abstractions (Databases, Certificates, Gateways) — the entire ecosystem runs on CRDs. |
| Operator pattern | Controller + CRD: encode operational knowledge (backup, failover, scale) as reconcile loops. | Stateful apps at org scale; before writing one, check if an operator already exists (operatorhub.io). |
| Helm chart / Kustomize overlay | Packaging: templates+values vs. patch-and-merge over bases. | Third-party software → Helm. Internal manifests → Kustomize + GitOps. Both → pick one per repo, not per mood. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| metadata.labels matchLabels | Equality-only selector — the Service/Deployment wiring mechanism. | Exact-match grouping; the 95% case. |
| matchExpressions: {key, In, NotIn, Exists, DoesNotExist} | Set-based selectors — OR over values, existence tests. | Node affinity/anti-affinity and advanced workload targeting. |
| nodeSelector vs nodeAffinity | Simple required match vs required+preferred rules with weights. | nodeSelector for 'must be in zone a'; affinity for 'prefer spot instances, fall back to on-demand'. |
| podAntiAffinity (topologyKey) | Spread/stack constraint between pods, not nodes. | 'No two replicas of this on one node/rack' — pair with topologySpreadConstraints (simpler, sufficient usually). |
| taints + tolerations | Nodes repel pods unless the pod tolerates the taint. | Dedicated hardware (GPU nodes), spot pools (tolerate scale-down taint). |

## Input / Output

**Talking to the cluster: contexts, manifests, and port-forwards**

```bash
# Contexts = which cluster am I pointing at (merge kubeconfigs):
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
kubectl diff -f x.yaml
```

**Config and secrets: the three injection styles**

```yaml
# 1) Env vars — simple, immutable-at-runtime:
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
# from Vault/cloud KMS into native Secrets.
```

## Loops & Iteration

**Init containers: ordered startup steps**

```yaml
spec:
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
# migrations use a Job + Argo sync-wave instead.
```

**Waiting and watching: scripting against convergence**

```bash
# Block until a condition is true — the RIGHT primitive for CI:
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
  sleep 3; done
```

## Functions & Callables

**Extending the loop: admission webhooks and finalizers**

```yaml
# Admission webhooks mutate/validate EVERY write to the API —
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
# a finalizer whose controller is gone.
```

## Error Handling

**Failure taxonomy: map symptom to cause**

```bash
# Pending → scheduling failed. Causes:
kubectl describe pod x | grep -A5 Events
#   Insufficient cpu/memory → raise limits or add nodes
#   node(s) had untolerated taint → tolerations
#   volume node affinity conflict → wrong zone for the PV

# ImagePullBackOff → image name/registry/auth:
kubectl get secret regcred -o jsonpath='{.data..dockerconfigjson}' | base64 -d
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
kubectl patch pvc x -p '{"metadata":{"finalizers":null}}'  # last resort
```

## Concurrency Model

**The scheduler's inputs: what decides where pods land**

```yaml
# Bin-packing with constraints, evaluated per pending pod:
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
# + LimitRange sets per-container defaults inside the namespace.
```

## Testing Patterns

**Testing manifests and clusters**

```bash
# 1) Static: does the YAML parse and match schemas?
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
sonobuoy run --mode certified-conformance
```

## Performance Tuning

- Requests over-provisioning is the #1 cloud cost bug — Kubecost/OpenCost visibility plus VPA recommendations routinely cut cluster spend 30-50%.
- Pod startup time: pre-pulled images (DaemonSet pre-puller), small images (distroless/distroless-node), and initContainer-less designs keep scale-up under 30s.
- CPU limits throttle CFS — latency-sensitive services often run requests-only for CPU (limits for memory always): a deliberate, documented tradeoff.
- HPA needs 2-10 minutes of stabilization to avoid flapping; tune behavior.scaleDown.stabilizationWindowSeconds (default 300) to your traffic shape.
- Node-level: hugepages for DPDK-ish workloads, guaranteed QoS class (requests==limits) for the top-latency tier, topology manager policies for NUMA/GPU pinning.
- API server overload: limit watches, paginate LISTs, use label selectors, informer caches in controllers — 'kubectl get pods -A' every 5s is an anti-pattern at scale.
- etcd latency bounds the whole control plane: fast disks (NVMe, fsync <10ms), defragmentation, and keeping events etcd separate at 500+ node scale.
- Service mesh sidecars add ~1-3ms p50 per hop and 100-200MB RAM per pod — Cilium/ambient (sidecar-less) modes exist precisely to buy that back.
- Image pull is the dominant cold-start: use a registry near the cluster, image streaming/kopia lazy-loading where the runtime supports it.
- Cluster Autoscaler/Karpenter: Karpenter's right-sizing + consolidated nodes beat classic ASG patterns on both cost and time-to-capacity.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Helm](https://helm.sh/) | Templated packaging + release lifecycle; how third-party software ships. | packaging |
| [Kustomize](https://kustomize.io/) | Overlay/patch composition for your own manifests — built into kubectl. | packaging |
| [Argo CD / Flux](https://argo-cd.readthedocs.io/) | GitOps: cluster state continuously reconciled from git. | deploy |
| [Prometheus + Grafana](https://prometheus.io/) | The monitoring stack (kube-prometheus-stack chart is the de facto install). | observability |
| [Cilium / Calico](https://cilium.io/) | CNI networking with network policy; Cilium adds eBPF-based L7 and service mesh. | networking |
| [Istio](https://istio.io/) | The mature service mesh (mTLS, traffic splitting, telemetry). | networking |
| [Kyverno / OPA Gatekeeper](https://kyverno.io/) | Policy-as-code admission control — guardrails as YAML. | security |
| [Crossplane](https://www.crossplane.io/) | Cloud infrastructure via k8s API (CRDs for buckets, DBs, DNS). | infra |
| [Karpenter](https://karpenter.sh/) | Node autoscaling that right-sizes instances on demand (AWS-born, portable). | autoscaling |
| [KEDA](https://keda.sh/) | Event-driven autoscaling (queue depth, stream lag → replicas). | autoscaling |
| [Kubectl / k9s](https://k9scli.io/) | CLI and the TUI every operator lives in. | tooling |
| [kind / minikube / k3s](https://kind.sigs.k8s.io/) | Local + edge clusters for dev, CI, and IoT. | tooling |
| [CloudNativePG](https://cloudnative-pg.io/) | Production Postgres operator (failover, backups via CNPG-native tooling). | data |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| Borg → Omega → Kubernetes | 2014 | Google opensources its third take on cluster management; Go, etcd, and reconcile loops from day one. |
| 1.0 | 2015 | First stable API; CNCF founded with k8s as its first project; the orchestrator wars (vs Swarm, Mesos) begin. |
| 1.6-1.9 | 2017 | RBAC (1.6), CRDs + Workload API (1.9) — the extensibility turn that created the entire operator ecosystem. |
| 1.14-1.16 | 2019 | Production-level custom resources, stable scheduling framework; windows-nodes GA — enterprise adoption wave. |
| 1.20 | 2020 | Dockershim deprecated (CRI only) — containerd era begins; cronjobs GA, API deprecation cleanups. |
| 1.24-1.25 | 2022 | Dockershim removed; network policy GA maturation; Secret protection push (kms v2). |
| 1.27-1.29 | 2023 | Sidecar containers (initContainers restartPolicy), Gateway API GA, in-place pod resize (alpha) — ergonomics decade begins. |
| 1.30-1.33 | 2024 | In-place resize beta, AppArmor GA, user namespaces alpha, structured authn, DRA (Dynamic Resource Allocation) for GPUs. |
| 1.34-1.36 | 2025 | DRA GA-bound for AI workloads, job success-completion policy, memory manager maturation, portforward over websockets. |
| 1.37 'Garhwal' | 2026 | Memory QoS beta, Metrics API stable, HPA scale-to-zero, rootless kubelet beta, storage hardening. Current: 1.37.2 (Oct 2026). |

## Interview Hot Questions

1. **What happens when you type kubectl apply?** *(hard)*

   kubectl reads the manifest, diffs it against the live object (last-applied annotation), and PUTs the merged spec to the API server. The API server authenticates you, runs admission (mutating → validating webhooks), validates the schema, persists to etcd, and notifies watchers. Controllers watching that resource enqueue a reconcile: the Deployment controller creates/updates a ReplicaSet, which the ReplicaSet controller turns into Pod objects, which the scheduler binds to nodes, where kubelets create containers via the CRI. Every step is async — 'apply succeeded' means 'stored', not 'running'.

2. **Walk me through a rolling update.** *(medium)*

   Deployment controller computes a new ReplicaSet with the new pod template. Per maxSurge/maxUnavailable it scales the new RS up and the old RS down in steps, waiting for readiness at each. Readiness gates traffic: the Service's EndpointSlices only include Ready pods, so requests never hit an unready new pod. If the new version never becomes ready, progressDeadlineSeconds marks the rollout failed (and kubectl rollout undo scales the old RS back up). Rollback works precisely because old ReplicaSets are kept (scaled to zero, not deleted).

3. **Difference between liveness, readiness, and startup probes?** *(easy)*

   Readiness: 'should traffic be routed here?' — failure removes the pod from EndpointSlices but keeps it running; use for dependency-connected/warmed state; gates rollouts. Liveness: 'should this container be restarted?' — failure kills and restarts the container; use only for true deadlocks, and keep it lenient (strict liveness under load = restart storms that cascade). Startup: 'is it still booting?' — runs first, disables liveness/readiness until success; use for slow starters (JVM, model loading). All three share http/tcp/exec mechanics.

4. **Why do Services exist if pods have IPs?** *(easy)*

   Pod IPs are mortal: rescheduling, scaling, crashes all change them. A Service is a stable name + virtual IP backed by a label selector — an Endpoints/EndpointSlice controller keeps the healthy-pod list current, and kube-proxy (or CNI) programs the data path that load-balances across it. DNS (CoreDNS) resolves the service name cluster-wide. It's the same 'stable identity over a changing set' pattern as every other k8s resource.

5. **How would you debug a pod stuck in Pending?** *(medium)*

   kubectl describe pod — the Events section names the scheduler's rejection: insufficient cpu/memory (requests exceed capacity → check node Allocated resources, lower requests or add nodes), taints not tolerated (dedicated/spot pools), node affinity/selector mismatch, volume zone conflict (PV pinned to another zone), or PDB blocking preemption. kubectl get nodes -o wide + describe node shows pressure; kube-scheduler logs give the exact predicate that failed at fleet scale.

6. **Explain requests vs limits and their consequences.** *(medium)*

   Requests: the scheduler's input — guaranteed capacity, used for bin-packing and HPA percentage math. Limits: the container's ceiling — CPU is throttled at the CFS level (latency!), memory exceeds get OOM-killed (exit 137). Consequences: no requests → scheduler is blind (overpacked nodes, useless HPA); no memory limit → node pressure evictions; tight CPU limits → throttling tail latency. The deliberate production pattern: memory requests=limits (Guaranteed-ish QoS, no surprises), CPU requests set, limits high or absent for latency-sensitive tiers.

7. **What's a PodDisruptionBudget and when does it NOT help?** *(medium)*

   A PDB tells the eviction API the floor: 'minAvailable: 2' means voluntary disruptions (kubectl drain, cluster autoscaler, node upgrades) must leave 2 pods running — drains pause until they can proceed. It does NOT protect against involuntary disruption: node hardware death, kernel panic, OOM kills. Redundancy + topologySpreadConstraints + anti-affinity handle those. A PDB you forgot before an upgrade is the classic 'why is my deploy stuck draining' incident.

8. **How do you handle secrets properly in k8s?** *(hard)*

   Native Secrets are base64 in etcd — safe only as a transport, not storage. Production stack: external secret manager (Vault, AWS Secrets Manager, GCP SM) synced by External Secrets Operator into native Secrets for pod consumption; encryption at rest via KMS provider on etcd; RBAC scoping so only the right service accounts/namespaces can read them; volume mounts over env vars (rotation without restart); and never committing sealed values outside sealed-secrets/SOPS flows. Audit secret reads through the same RBAC audit pipeline as everything else.

9. **When would you NOT use Kubernetes?** *(medium)*

   Honest boundaries: a handful of long-running services on one box (docker compose is a 10x simpler operational model); team smaller than ~5-8 engineers without platform time (the control plane tax is a second product to run); strict single-tenant simplicity (PaaS/serverless); and workloads that are pure batch with no service semantics (a workflow engine on VMs is fine). The question interviewers want answered is 'you know k8s is a cost, not a status symbol' — articulate what you'd trade away.

## When to Choose This

- **vs Docker Compose / Swarm:** use this — Multi-node scale, self-healing, rolling infra, operators/GitOps ecosystem, org-standard platform APIs.; use that — Single-host simplicity, deterministic local dev, minimal learning curve. Compose remains the right local-dev default even for k8s shops.
- **vs Serverless (Lambda/FaaS):** use this — Steady traffic, long-lived connections (websockets, gRPC streams), complex runtime deps, cost at scale.; use that — Spiky/episodic traffic, scale-to-zero economics, event handlers with no service semantics. Many teams run both: services on k8s, glue on functions.
- **vs Nomad:** use this — You want the ecosystem: every database, mesh, GitOps, and monitoring tool ships a k8s operator first.; use that — Simpler single-binary orchestration (including non-container workloads), smaller operational surface; HashiCorp stack alignment. (Nomad + BSL-license alignment.)
- **vs Managed k8s (EKS/GKE/AKS):** use this — You want to own control-plane tuning, air-gapped or sovereign deployments, cost at very large scale.; use that — Almost always: the cloud runs etcd/API/HA for you — self-managed control planes are a specialty choice in 2026.
- **vs VMs + autoscaling groups:** use this — Containers as the packaging unit, fast scale-out (seconds not minutes), declarative recovery, dense bin-packing.; use that — Legacy runtimes, strict hardware isolation per tenant, or golden-image orgs — but you'll likely run k8s ON those VMs.

