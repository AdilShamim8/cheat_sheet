import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "networking",
  name: "Networking",
  category: "topics",
  tier: "topic",
  tags: ["tcp", "ip", "http", "dns", "tls", "protocols", "transport"],
  tagline: "The protocol stack that lets two processes on different machines exchange bytes — physical, IP, transport, and application layers.",
  year: 1983,
  author: "IETF (RFC series); Vint Cerf & Bob Kahn (TCP/IP)",

  tldr: [
    "Networking is the stack of protocols that lets two processes on different machines exchange bytes — physical (Ethernet/Wi-Fi), internetwork (IP), transport (TCP/UDP), and application (HTTP, TLS, DNS, gRPC).",
    "The 80/20: TCP gives reliable ordered byte streams; UDP gives best-effort datagrams; DNS resolves names to IPs; TLS authenticates and encrypts the stream; HTTP is the dominant application protocol layered on top.",
    "Reach for it when debugging connectivity (`ping`, `traceroute`, `dig`, `curl -v`), designing APIs (REST/gRPC/websockets), or reasoning about latency, timeouts, and congestion control.",
    "Most production networking pain collapses to: DNS caching/TTL, connection reuse (keep-alive, pooling), TLS handshake cost, NAT/firewall idle timeouts, and the difference between L4 (TCP) and L7 (HTTP) load balancing.",
  ],

  mentalModel: {
    title: "Layers, addresses, and timeouts",
    body: "Each layer adds a header and an address: Ethernet → MAC (48-bit), IP → IP address (32-bit v4 / 128-bit v6), TCP/UDP → port (16-bit), TLS → certificate identity (SNI + cert chain), HTTP → URL + method + headers. The sender wraps, the receiver unwraps. TCP establishes state via a 3-way handshake (SYN, SYN-ACK, ACK) and tears down via a 4-way FIN sequence. Connection reuse (HTTP keep-alive, HTTP/2 multiplexing) amortizes the handshake cost; without it, every request pays ~1 RTT for TCP plus ~1-2 RTT for TLS. Every timeout (connect, read, idle) must be set explicitly — kernel defaults are 60s+ or infinite, which is how cascading failures start.",
  },

  constructs: [
    { syntax: "curl -v --resolve host:443:1.2.3.4 https://host/", behavior: "Forces curl to connect to a specific IP, bypassing DNS — useful for testing a single backend behind a load balancer.", when: "Verifying a deploy on one host, debugging DNS-vs-origin issues, certificate validation per backend." },
    { syntax: "dig +trace example.com", behavior: "Shows the full DNS resolution path: root → TLD → authoritative — using the local resolver's recursive lookup as a guide.", when: "Debugging 'why am I getting the wrong IP?' or stale records in a resolver chain." },
    { syntax: "nc -lvk 8080  /  nc host 8080", behavior: "Listens on a port (-l, -k keeps alive) or connects to one; reads/writes raw bytes — the simplest TCP tool.", when: "Testing whether a port is reachable, hand-typing HTTP requests, ad-hoc TCP debugging." },
    { syntax: "tcpdump -i eth0 -n 'tcp port 443 and host 1.2.3.4'", behavior: "Captures packets matching a BPF filter; -n disables DNS lookup for speed.", when: "Real packet-level debugging; pair with Wireshark for analysis (save with -w file.pcap)." },
    { syntax: "mtr --tcp --port 443 host", behavior: "Combines traceroute + ping; --tcp probes TCP ports that ICMP firewalls block.", when: "Diagnosing packet loss / latency along a path when ICMP is blocked." },
    { syntax: "ss -tnp  /  ss -tn state established", behavior: "Lists TCP sockets with PID/process; filters by state. Modern, fast replacement for netstat.", when: "Inspecting what's connected to whom; finding CLOSE_WAIT leaks; port conflicts." },
    { syntax: "ip addr  /  ip route  /  ip -s link", behavior: "Modern network configuration: addresses, routing table, interface stats. Replaces ifconfig/route/netstat.", when: "Verifying interface config, debugging routing, checking for packet drops at the NIC." },
    { syntax: "HTTP/1.1 keep-alive vs HTTP/2 multiplexing vs HTTP/3 (QUIC)", behavior: "1.1 keeps a TCP connection open for multiple sequential requests; 2 multiplexes many parallel streams over one TCP; 3 uses UDP+QUIC with per-stream loss recovery.", when: "HTTP/2 is the modern default; HTTP/3 wins on flaky mobile networks and for connection migration." },
    { syntax: "TLS 1.3 handshake: 1-RTT (or 0-RTT with PSK)", behavior: "Client sends ClientHello + key share in flight 1; server responds + finished in flight 2; client sends finished → encrypted data.", when: "TLS 1.3 (RFC 8446) since 2018; 1-RTT is a 50% latency reduction over TLS 1.2's 2-RTT." },
    { syntax: "DNS record types: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA", behavior: "A/AAAA = IPv4/IPv6 address; CNAME = alias to another name; MX = mail server; TXT = arbitrary text (SPF, DKIM, verification); SRV = service+port.", when: "Daily ops: A for direct hosting, CNAME for CDN/apex-via-flattening, TXT for email auth, CAA for cert authority pinning." },
    { syntax: "TCP socket states: LISTEN → SYN_SENT → ESTABLISHED → FIN_WAIT → CLOSE_WAIT → TIME_WAIT", behavior: "States a TCP connection moves through during handshake and teardown; CLOSE_WAIT = peer closed, you haven't; TIME_WAIT = you closed, waiting 2*MSL.", when: "Reasoning about stuck connections, FD leaks, 'address already in use' errors." },
    { syntax: "WebSocket upgrade: HTTP 101 Switching Protocols", behavior: "Client sends Upgrade: websocket; server responds 101; the TCP connection then carries framed WebSocket messages in both directions.", when: "Real-time bidirectional: chat, live dashboards, multiplayer. Don't use polling where WS fits." },
  ],

  patterns: [
    {
      lang: "bash",
      caption: "Diagnosing the full handshake chain — TCP + TLS + HTTP",
      code: `# 1. Does DNS resolve? To which IP? From which resolver?
dig +short example.com
dig +short @8.8.8.8 example.com   # compare against Google's resolver

# 2. Is the port even reachable? (TCP handshake)
nc -zv example.com 443            # -z = zero I/O, just probe

# 3. Trace the path and find where packets drop
mtr --report --tcp --port 443 example.com

# 4. Inspect the TLS handshake (cert chain, ALPN, TLS version)
curl -vI https://example.com 2>&1 | grep -E 'SSL|TLS|ALPN|HTTP/'
# Or with openssl for the raw handshake:
openssl s_client -connect example.com:443 -servername example.com -showcerts < /dev/null

# 5. Capture packets if all else fails (run as root)
tcpdump -i any -n -w /tmp/cap.pcap 'host example.com and port 443'
# Then analyze: tcpdump -r /tmp/cap.pcap -A | less  or open in Wireshark`,
    },
    {
      lang: "bash",
      caption: "Inspecting TCP socket states — finding connection leaks",
      code: `# All TCP sockets grouped by state — a healthy server has mostly ESTABLISHED
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn
#   847 ESTAB
#    23 TIME-WAIT     ← normal after closing connections
#     5 CLOSE-WAIT    ← BAD: peer closed, your app didn't  → FD leak
#     2 LISTEN

# Per-process: which app holds which connections?
ss -tnp state established

# CLOSE-WAIT accumulation means your code isn't closing sockets
# after the remote side sends FIN. Look for missing finally blocks,
# missing response.Body.Close() in Go, missing httpx client close, etc.

# Check kernel counters for drops/retransmits
ss -ti                               # per-connection: rtt, cwnd, retrans
nstat -az | grep -E 'TcpExt|Tcp:'    # system-wide counters`,
    },
    {
      lang: "bash",
      caption: "DNS lookup chain — what each resolver returns and caches",
      code: `# Trace the full recursive path (root → TLD → authoritative)
dig +trace example.com

# Query a specific resolver (default = system; @1.1.1.1 = Cloudflare)
dig @1.1.1.1 example.com A
dig @8.8.8.8 example.com AAAA

# See the TTL (in seconds) — how long resolvers will cache this
dig example.com A | grep -E 'IN\\s+A\\s'
#   example.com.    300  IN  A  93.184.216.34
#                    ↑ TTL=300s (5 min). Lower before migrations.

# Query ALL record types at once
dig example.com ANY +noall +answer

# Reverse lookup (IP → name)
dig -x 93.184.216.34

# Flush local caches
sudo systemd-resolve --flush-caches   # systemd-resolved
sudo resolvectl flush-caches          # newer systemd
sudo dscacheutil -flushcache          # macOS`,
    },
    {
      caption: "TCP state machine — the connections your servers live in",
      code: `                  Server                              Client
                    │                                   │
              LISTEN  │                                   │
                    │ <────────── SYN ───────────────── │ SYN_SENT
                    │                                   │
                    │ ────────── SYN+ACK ─────────────> │
            SYN_RCVD │                                   │
                    │ <────────── ACK ───────────────── │ ESTABLISHED
            ESTABLISHED                                │
                    │                                   │
                    │ <─────── data, data ───────────── │
                    │ ──────── data, ACK ─────────────> │
                    │                                   │
                    │ <────────── FIN ───────────────── │  (active close)
                    │                                   │ FIN_WAIT_1
            CLOSE_WAIT│                                  │
                    │ ────────── ACK ─────────────────> │ FIN_WAIT_2
                    │                                   │
                    │ ────────── FIN ─────────────────> │
            LAST_ACK  │                                  │ TIME_WAIT
                    │ <────────── ACK ───────────────── │  (2*MSL = 60s)
              CLOSED │                                   │ CLOSED

  TIME_WAIT: lasts 2*MSL (60s on Linux) to let stray packets drain.
  CLOSE_WAIT: peer closed, you haven't — usually a bug in your code.`,
    },
  ],

  pitfalls: [
    {
      title: "DNS TTL caching at every layer — migrations silently half-fail",
      symptom: "You lower a DNS record's TTL to 60s, switch the IP, and 24h later some clients still hit the old server — because their OS, browser, resolver, or CDN cached the old record at the higher TTL.",
      fix: "Lower TTL 2x your migration window BEFORE the change (e.g., 24h ahead). Don't assume resolvers honor TTL strictly — some cap it. After migration, keep the old server running for the max old TTL × 2.",
    },
    {
      title: "TCP keepalive default is 2 hours — useless for detecting dead peers",
      symptom: "A peer crashes or the NAT silently drops the connection; your side keeps the socket half-open for hours, sending into the void.",
      fix: "Set application-level heartbeats (every 15-30s) instead of relying on TCP keepalive. If you must use it: `sysctl net.ipv4.tcp_keepalive_time=60` (Linux default is 7200s = 2h).",
    },
    {
      title: "TLS SNI required for virtual-hosted HTTPS",
      symptom: "Connecting to a server hosting many HTTPS sites returns the wrong certificate (or a default), causing hostname verification failures — because the client didn't send SNI.",
      fix: "Always send SNI (curl/openssl do by default; custom clients may not). Test with `openssl s_client -connect host:443 -servername host`. Servers like nginx pick the right vhost cert via SNI; without it they serve the default.",
    },
    {
      title: "TIME_WAIT exhaustion under high connection churn",
      symptom: "Server making many short-lived outbound connections exhausts the ephemeral port range (~28K) — new connects fail with EADDRNOTAVAIL.",
      fix: "Reuse connections (HTTP keep-alive, connection pools). Enable `net.ipv4.tcp_tw_reuse=1` (safe, allowed by RFC). Increasing ephemeral port range (`ip_local_port_range`) gives headroom but doesn't fix the root cause.",
    },
    {
      title: "Connection pool sizing: too small serializes, too large exhausts server FDs",
      symptom: "Pool of 10 connections to a DB on a 32-core app server serializes throughput; pool of 1000 to the same DB exhausts its 1024-FD limit and crashes it.",
      fix: "Start with ~2× CPU cores for CPU-bound, size by Little's Law for I/O-bound: pool = target_throughput × target_latency. PgBouncer in transaction-pooling mode decouples app pool size from DB connection count.",
    },
    {
      title: "HTTP/2 head-of-line blocking at the TCP layer",
      symptom: "HTTP/2 multiplexes many streams over one TCP connection; a single dropped packet stalls ALL streams until retransmission succeeds — worse than HTTP/1.1's parallel connections on lossy networks.",
      fix: "HTTP/3 (QUIC over UDP) eliminates this with per-stream loss recovery. For HTTP/2, ensure low packet loss; tune TCP_CONGESTION (BBR on Linux 4.9+ outperforms CUBIC on lossy links).",
    },
    {
      title: "NAT idle timeout drops long-idle connections",
      symptom: "Long-lived TCP connection (DB, websocket, SSH) silently dies after 30-60s of idle because a NAT/firewall between client and server evicted its state; the next write times out or hangs.",
      fix: "Send keepalive packets more frequently than the NAT timeout (every 15-30s). For SSH: `ServerAliveInterval 15`. For DB pools: idle connection liveness checks. For custom TCP: app-level pings.",
    },
  ],

  quickReference: [
    { fact: "Well-known ports: HTTP=80, HTTPS=443, DNS=53, SSH=22, SMTP=25/587, MySQL=3306, Postgres=5432, Redis=6379.", tag: "gotcha" },
    { fact: "Ephemeral port range: 32768-60999 on Linux (≈28K), 49152-65535 per IANA. Tunable via /proc/sys/net/ipv4/ip_local_port_range.", tag: "gotcha" },
    { fact: "TCP handshake: 3 packets, 1 RTT. TLS 1.2: 2 RTT. TLS 1.3: 1 RTT (or 0-RTT with PSK resumption).", tag: "perf" },
    { fact: "DNS TTL is in seconds; default varies (often 3600). Resolvers MAY cap to a min/max — don't assume exact honoring.", tag: "gotcha" },
    { fact: "Header sizes: IPv4=20 bytes, IPv6=40 bytes, TCP=20 bytes, UDP=8 bytes, TLS 1.3 ≈ 100-200 bytes handshake overhead.", tag: "complexity" },
    { fact: "MSS (max segment size) is typically 1460 bytes over Ethernet (MTU 1500 - 20 IP - 20 TCP). Jumbo frames raise MTU to 9000.", tag: "perf" },
    { fact: "HTTP/2 multiplexes many streams over one TCP connection (RFC 7540, 2015); HTTP/3 uses QUIC over UDP (RFC 9114, 2022).", tag: "version" },
    { fact: "TIME_WAIT duration: 2*MSL = 60s on Linux (MSL=30s). Tunable via net.ipv4.tcp_fin_timeout (but not the TIME_WAIT itself).", tag: "gotcha" },
    { fact: "Default connect() timeout: kernel retransmits SYN for ~75s before failing. ALWAYS set a shorter app-level connect timeout (1-5s).", tag: "gotcha" },
    { fact: "TLS 1.3 is RFC 8446 (Aug 2018); TLS 1.0/1.1 deprecated in 2020 (RFC 8996). TLS 1.2 still acceptable but prefer 1.3.", tag: "version" },
    { fact: "mDNS (Bonjour/Avahi) uses 224.0.0.251:5353 multicast for local-network service discovery (RFC 6762).", tag: "gotcha" },
    { fact: "0.0.0.0 means 'bind on all interfaces' (INADDR_ANY); 127.0.0.1 is loopback only (not exposed externally). ::1 is IPv6 loopback.", tag: "gotcha" },
    { fact: "IPv6 addresses are 128-bit, written as 8 groups of 4 hex digits; :: abbreviates one run of zeros. fe80::/10 is link-local.", tag: "complexity" },
    { fact: "CDN edge TTLs: typically 5min-1hr; an origin shield reduces load on origin to a single fetch per TTL window per PoP.", tag: "perf" },
    { fact: "Bandwidth-delay product: 1Gbps × 100ms RTT = 12.5MB in flight — TCP window scaling must be enabled (default on Linux) for high-BDP paths.", tag: "perf" },
  ],

  goDeeper: [
    { title: "RFC 793 (TCP) / 768 (UDP) / 1035 (DNS) / 7540 (HTTP/2) / 8446 (TLS 1.3) / 9114 (HTTP/3)", url: "https://www.rfc-editor.org/", note: "The primary sources. RFCs are denser than tutorials but are the only authoritative references — read the ones for protocols you depend on daily." },
    { title: "Beej's Guide to Network Programming", url: "https://beej.us/guide/bgnet/", note: "Free, friendly, comprehensive intro to the sockets API and the C-level reality of TCP/UDP. The canonical first read for anyone touching raw networking." },
    { title: "TCP/IP Illustrated, Volume 1 (W. Richard Stevens)", url: "https://www.oreilly.com/library/view/tcpip-illustrated-volume/9780132806208/", note: "The classic 1000-page treatment of every protocol in the stack with packet-level detail. Stevens' examples still run today." },
    { title: "High Performance Browser Networking (Ilya Grigorik)", url: "https://hpbn.co/", note: "Free online; the definitive treatment of HTTP/2, HTTP/3, TLS, and how browsers actually use the network — written by a Google networking engineer." },
    { title: "The C10K Problem (Dan Kegel)", url: "http://www.kegel.com/c10k.html", note: "The 1999 essay that pushed the world from thread-per-connection to epoll/kqueue/io_uring. Still the clearest articulation of why async I/O matters." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  // Adapted for networking: TCP states / DNS record types / HTTP methods
  dataTypes: {
    primitives: [
      { syntax: "LISTEN", behavior: "Server socket waiting for connections. Bound to a local IP:port, ready to accept SYNs.", when: "Pre-handshake server state. 'ss -tlnp' shows these." },
      { syntax: "SYN_SENT / SYN_RCVD", behavior: "Client sent SYN, awaiting SYN-ACK (SYN_SENT). Server received SYN, sent SYN-ACK, awaiting ACK (SYN_RCVD).", when: "Transient handshake states; should last only 1 RTT. Persistent SYN_RCVD = SYN flood." },
      { syntax: "ESTABLISHED", behavior: "Handshake complete; data can flow both directions. The 'normal' state for an active connection.", when: "99% of connections on a healthy server should be in this state." },
      { syntax: "FIN_WAIT_1 / FIN_WAIT_2", behavior: "Active-closer sent FIN (1) and waits for ACK; then enters FIN_WAIT_2 awaiting the peer's FIN.", when: "Normal teardown from the closing side. Long FIN_WAIT_2 = peer isn't closing (often a buggy client)." },
      { syntax: "CLOSE_WAIT", behavior: "Passive-closer received the peer's FIN, sent ACK, but the local app hasn't called close() yet.", when: "Accumulating CLOSE_WAIT = FD leak in your app — it's not closing sockets after the remote side does." },
      { syntax: "LAST_ACK", behavior: "Passive-closer sent its FIN, awaiting final ACK before going CLOSED.", when: "Transient; long LAST_ACK = packet loss on the final ACK, will time out." },
      { syntax: "TIME_WAIT", behavior: "Active-closer waits 2*MSL (60s Linux default) after sending final ACK, to absorb stray packets for the same 4-tuple.", when: "Normal but voluminous under high connection churn. Enable tcp_tw_reuse=1 to recycle ports safely." },
      { syntax: "CLOSED", behavior: "No connection exists. (Not actually shown by ss — it's the absence of state.)", when: "Initial and final state; nothing to inspect." },
    ],
    collections: [
      { syntax: "A / AAAA", behavior: "Maps a hostname to an IPv4 / IPv6 address. The most common record type.", when: "Direct hosting. AAAA is mandatory for IPv6 reachability; both can coexist (dual-stack)." },
      { syntax: "CNAME", behavior: "Canonical name — alias from one hostname to another. Resolves recursively.", when: "Pointing www.example.com to example.com or a CDN hostname. CANNOT coexist with other records at the same name." },
      { syntax: "MX", behavior: "Mail exchanger — points to a mail server with a priority (lower = preferred).", when: "Email routing. Multiple MX records allow primary + backup mail servers." },
      { syntax: "TXT", behavior: "Arbitrary text up to 255 chars per string (concatenatable). Used for SPF, DKIM, DMARC, domain verification.", when: "Email auth (SPF, DKIM), domain ownership verification for CA issuance, _dmarc records." },
      { syntax: "NS", behavior: "Delegates a zone to a set of authoritative name servers.", when: "At zone apex; for subdomain delegation (e.g., 'example.com NS ns1.provider.net')." },
      { syntax: "SRV", behavior: "Service locator — _service._proto.name SRV priority weight port target. Generalizes MX to any service.", when: "AD domain controllers, SIP, XMPP, Kubernetes DNS-based service discovery." },
      { syntax: "CAA", behavior: "Certificate Authority Authorization — restricts which CAs may issue certs for the domain.", when: "Security hardening; prevents a miscreant from getting a cert from an unauthorized CA." },
      { syntax: "PTR", behavior: "Reverse DNS — maps an IP to a name. Lives in the in-addr.arpa / ip6.arpa zones.", when: "Email anti-spam (forward+reverse must match), logging readability, some auth schemes." },
    ],
    custom: [
      { syntax: "GET", behavior: "Idempotent, safe (no server state change), cacheable, body allowed but discouraged. The default read.", when: "Fetching resources; the only method that browsers will prefetch / cache by default." },
      { syntax: "POST", behavior: "Non-idempotent, unsafe, not cacheable by default. Body carries the input to create/act.", when: "Creating resources, submitting forms, any mutation that's not idempotent. Pair with idempotency keys for retries." },
      { syntax: "PUT", behavior: "Idempotent, unsafe. Replaces the target resource with the request body (full replacement).", when: "Updating a known resource with full state; safe to retry. NOT for partial updates (use PATCH)." },
      { syntax: "PATCH", behavior: "Non-idempotent (semantically), unsafe. Partial modification described by body format (JSON Patch, merge patch).", when: "Updating a few fields of a resource without sending the full representation." },
      { syntax: "DELETE", behavior: "Idempotent, unsafe. Removes the target resource. Subsequent calls return 404 or 204.", when: "Resource deletion. Idempotent because 'gone' is the steady state." },
      { syntax: "HEAD", behavior: "Like GET but returns headers only — no body. Used for cache validation, link checking.", when: "Checking existence / size without downloading; conditional GET via If-Modified-Since." },
      { syntax: "OPTIONS", behavior: "Describes communication options for the target. CORS preflight uses this.", when: "CORS preflight (browser checks allowed methods/headers before non-simple cross-origin requests)." },
    ],
  },

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "bash",
      caption: "Sockets — the universal network I/O abstraction",
      code: `# A socket is one endpoint of a bidirectional IPC channel.
# Identified by a 5-tuple: (proto, local-IP, local-port, remote-IP, remote-port).

# TCP client (4 lines of bash via /dev/tcp, useful for ad-hoc checks)
exec 3<>/dev/tcp/example.com/80       # open TCP connection on FD 3
printf 'GET / HTTP/1.0\\r\\nHost: example.com\\r\\n\\r\\n' >&3
head -1 <&3                            # read first response line
exec 3<&-                              # close

# TCP server (one-liner via nc, or socat for production-grade)
nc -lk 8080                            # listen on 8080, echo input
socat TCP-LISTEN:8080,fork,reuseaddr SYSTEM:'cat /etc/hostname'

# Unix domain socket (local IPC, no network overhead)
socat UNIX-LISTEN:/tmp/app.sock,fork -
curl --unix-socket /tmp/app.sock http://localhost/healthz

# Inspect what's listening, what's connected, what's leaking:
ss -tlnp             # TCP listening
ss -tnp              # TCP established
ss -tn state close-wait   # the FD-leak state
ss -x                # unix sockets (Docker, X11, postgres)`,
    },
    {
      lang: "bash",
      caption: "Ports — the 16-bit address space and its gotchas",
      code: `# Port ranges:
#   0-1023     well-known (root-only on Unix; CAP_NET_BIND_SERVICE bypasses)
#   1024-49151 registered (IANA-assigned app ports: 5432=PG, 6379=Redis, 8080=http-alt)
#   49152-65535 ephemeral (dynamic outbound source ports)

# View + tune ephemeral port range:
cat /proc/sys/net/ipv4/ip_local_port_range
echo '32768 60999' > /proc/sys/net/ipv4/ip_local_port_range   # ~28K outbound

# Outbound connections are limited by (src-IP, src-port, dst-IP, dst-port) tuples.
# One client to one server:port -> only ~28K concurrent connections (port exhaustion).
# To exceed: connect to multiple dst-ports (HTTP keep-alive), or use multiple src-IPs.

# Verify what's actually listening on a port:
ss -tlnp 'sport = :8080'           # shows PID + process name
sudo lsof -i :8080                  # alternative; cross-platform

# Check NAT/firewall idle timeout (drops long-idle connections):
# Send app-level keepalives every 15-30s — never rely on TCP keepalive (default 2h).
# Linux TCP keepalive tunables:
cat /proc/sys/net/ipv4/tcp_keepalive_time      # 7200 (2h) — too long for NAT
cat /proc/sys/net/ipv4/tcp_keepalive_intvl     # 75s between probes
cat /proc/sys/net/ipv4/tcp_keepalive_probes    # 9 failed probes -> dead`,
    },
    {
      lang: "bash",
      caption: "Protocols — hand-typing HTTP for debugging",
      code: `# Raw HTTP/1.1 over TCP — useful for debugging proxies, CDNs, origin behavior
# (use httpbin.org or your own server for testing)

# Method 1: openssl for HTTPS, send raw bytes
openssl s_client -connect httpbin.org:443 -servername httpbin.org <<'EOF'
GET /get HTTP/1.1
Host: httpbin.org
User-Agent: raw-debug/1.0
Connection: close

EOF

# Method 2: curl with -v to see the wire protocol
curl -v https://httpbin.org/get 2>&1 | head -30

# Method 3: httpie for human-friendly output
http --verbose https://httpbin.org/get

# For HTTP/2 + HTTP/3, raw debugging is harder (binary framing) — use:
curl --http2 -v https://httpbin.org/get          # see h2 stream framing
curl --http3-only -v https://cloudflare.com       # see QUIC packets (curl 7.66+)
nghttp -v https://httpbin.org/get                 # nghttp2 client, verbose h2

# TLS handshake inspection (which cert chain, which cipher, which TLS version):
openssl s_client -connect httpbin.org:443 -servername httpbin.org < /dev/null 2>/dev/null |
  openssl x509 -noout -subject -issuer -dates`,
    },
    {
      lang: "bash",
      caption: "Packet capture — tcpdump + Wireshark for the hard cases",
      code: `# Capture to a file (root required), then analyze in Wireshark
sudo tcpdump -i any -n -w /tmp/cap.pcap 'host api.example.com and port 443'

# Read back as ASCII (looks at HTTP, SMTP, plaintext protocols)
tcpdump -r /tmp/cap.pcap -A | less

# BPF filters — compose with and/or/not
sudo tcpdump -i eth0 -n \\
  'tcp and port 443 and host 1.2.3.4 and not src 10.0.0.5'

# Common patterns:
sudo tcpdump -i any 'tcp[tcpflags] & tcp-syn != 0'         # all SYNs (handshakes)
sudo tcpdump -i any 'tcp[tcpflags] & tcp-rst != 0'         # all RSTs (rejected)
sudo tcpdump -i any 'icmp'                                  # ping / unreachable
sudo tcpdump -i any 'port 53'                               # DNS queries

# Live stats by protocol:
sudo tcpdump -i eth0 -n -q -c 10000 | awk '{print $5}' | sort | uniq -c | sort -rn

# For HTTP/2 + HTTP/3 decryption, you need SSLKEYLOGFILE env var
# (browsers + curl export per-session keys to this file; Wireshark reads it).`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "bash",
      caption: "Diagnose 'connection refused' vs 'timeout' vs 'no route'",
      code: `# Three different failures, three different root causes.

# 1. 'Connection refused' — TCP RST received from the target.
#    Cause: nothing listening on that port, OR a firewall sent RST.
nc -zv example.com 8080
#   nc: connect to example.com port 8080 (tcp) failed: Connection refused
# Fix: start the service, or check the firewall, or verify the port.

# 2. 'Connection timed out' — no response to SYN within timeout.
#    Cause: packet filtered (firewall DROP, not REJECT), or host down.
nc -zv -w 5 example.com 8080
#   nc: connect to example.com port 8080 (tcp) failed: Operation timed out
# Fix: check firewall rules (DROP vs REJECT), routing, host health.

# 3. 'No route to host' — ICMP unreachable from a router.
#    Cause: routing table wrong, peer offline, ARP failure.
ping example.com
#   ping: sendto: No route to host
# Fix: check 'ip route', 'ip neigh', peer's network config.

# Diagnose where the failure happens:
mtr --report --tcp --port 8080 example.com   # path + loss per hop
traceroute -T -p 8080 example.com             # TCP traceroute (ICMP blocked?)
ip route get 1.2.3.4                          # which interface + gateway
dig +short example.com                        # does DNS even resolve?`,
    },
    {
      lang: "bash",
      caption: "Diagnose CLOSE_WAIT accumulation — the silent FD leak",
      code: `# Symptom: server has thousands of CLOSE_WAIT connections; FDs climb toward ulimit.

# Count by state:
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn
#   847 ESTAB
#   423 CLOSE-WAIT     <- BAD: peer closed, your app didn't
#    23 TIME-WAIT
#     2 LISTEN

# Find which process owns them:
ss -tnp state close-wait | head

# Root cause: your app received the peer's FIN (close) but never called close()
# on its socket. Common in:
#   - Go: missing response.Body.Close() (or defer in a loop)
#   - Python: missing finally block around socket
#   - Java: try-with-resources not used
#   - Node: missing res.on('end') handler

# Mitigation:
#   1. Fix the leak (use lsof -p <pid> to see the unclosed FDs).
#   2. Tune tcp_keepalive* to detect dead peers faster.
#   3. Set app-level idle timeout + liveness check on every connection.

# Verify the fix — CLOSE_WAIT count should drop to ~0 after the deploy:
watch -n 5 'ss -tan | awk "{print \\$1}" | sort | uniq -c'`,
    },
    {
      lang: "bash",
      caption: "Debug 'the site is slow' — the systematic checklist",
      code: `# Isolate WHERE the latency is. Test each layer in order.

# 1. DNS resolution time (often the silent 100-500ms):
curl -w "@-" -o /dev/null -s https://example.com <<'EOF'
   namelookup:  %{time_namelookup}s\\n
   connect:     %{time_connect}s\\n
   appconnect:  %{time_appconnect}s\\n
   pretransfer: %{time_pretransfer}s\\n
   starttransfer: %{time_starttransfer}s\\n
   total:       %{time_total}s\\n
EOF
# namelookup > 100ms -> DNS issue; consider DoH/DoT or local cache.
# connect - namelookup > 50ms -> network RTT to server.
# appconnect - connect > 100ms -> TLS handshake slow (SNI, cert chain).
# starttransfer - appconnect > 500ms -> server processing slow.
# total - starttransfer > 1s -> response body transfer slow (bandwidth).

# 2. Network path latency + loss:
mtr --report --tcp --port 443 example.com

# 3. TLS handshake inspection (which ciphers, which protocol):
openssl s_client -connect example.com:443 -servername example.com < /dev/null 2>/dev/null \\
  | grep -E 'Protocol|Cipher|Verify'

# 4. Server-side metrics: p50/p95/p99 latency by route; flamegraph the slow one.
# 5. Cross-reference with recent deploys (canary window).`,
    },
    {
      lang: "bash",
      caption: "Recover from DNS issues — local resolvers, caching, fallback",
      code: `# DNS is the #1 cause of 'it works for me but not for you' outages.

# Check WHICH resolver you're using:
cat /etc/resolv.conf
#   nameserver 10.0.0.2     <- your resolver
resolvectl status            # systemd-resolved (modern Ubuntu)

# Compare resolvers — do they agree?
dig +short @1.1.1.1 example.com
dig +short @8.8.8.8 example.com
dig +short example.com        # system default

# Check the TTL — how long will clients cache this answer?
dig example.com | grep -E 'IN\\s+A\\s' | awk '{print $2}'
#   300  <- 5 min TTL

# Force a fresh lookup (bypass local cache):
dig +trace example.com

# Flush local DNS caches (when you've fixed the upstream record):
sudo resolvectl flush-caches                # systemd-resolved
sudo systemd-resolve --flush-caches         # older systemd
sudo dscacheutil -flushcache                # macOS
sudo systemctl restart dnsmasq              # dnsmasq (rare on laptops)

# Migration strategy: lower TTL to 60s, wait 2x old TTL (so caches expire),
# then change the record. Some resolvers cap TTLs — don't assume 100% honoring.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      caption: "I/O multiplexing evolution — select → poll → epoll → io_uring",
      code: `SELECT (1983, BSD):
  - Pass an FD set (bitmap, FD_SETSIZE=1024) to the kernel.
  - Kernel scans ALL watched FDs on every call. O(N) per event.
  - Returns the FDs that are ready; user re-scans the set.
  - Limit: 1024 FDs (FD_SETSIZE), unfixable without recompiling.

POLL (1986, SVR4):
  - Like select but uses an array of struct pollfd; no fixed-size bitmap.
  - Still O(N) per event — kernel scans all entries every call.
  - No 1024 limit, but the cost scales linearly with watched FDs.

EPOLL (2002, Linux 2.5.44):
  - Register interest ONCE (epoll_ctl), then epoll_wait returns only
    the ready FDs. O(1) per event, O(active) total.
  - Stateful: kernel remembers what each FD is interested in.
  - Two modes: level-triggered (default, easy) and edge-triggered
    (faster, requires non-blocking I/O + drain-until-EAGAIN).
  - The foundation of every modern Linux high-concurrency server.

KQUEUE (2000, FreeBSD/macOS):
  - BSD's equivalent of epoll, slightly more general (filters for
    signals, timers, files, AIO — not just sockets).

IO_URING (2019, Linux 5.1):
  - Shared ring buffers between user + kernel; submit + complete batches
    of I/O with zero syscalls in the fast path.
  - 2-10x faster than epoll for high-IOPS workloads.
  - The future of high-performance Linux I/O (libuv, Tokio adopting).`,
    },
    {
      lang: "python",
      caption: "Async I/O with epoll — single-thread, 10K+ connections",
      code: `import socket, selectors

# A single-threaded echo server using selectors (epoll on Linux).
# Handles thousands of connections with one thread, no GIL contention.

sel = selectors.DefaultSelector()

def accept(sock, mask):
    conn, addr = sock.accept()
    conn.setblocking(False)
    sel.register(conn, selectors.EVENT_READ, read)

def read(conn, mask):
    try:
        data = conn.recv(1024)
        if data:
            conn.send(data)              # echo back
        else:
            sel.unregister(conn); conn.close()   # peer closed
    except ConnectionResetError:
        sel.unregister(conn); conn.close()

sock = socket.socket()
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(("", 8080))
sock.listen(128)
sock.setblocking(False)
sel.register(sock, selectors.EVENT_READ, accept)

while True:
    events = sel.select()                # blocks until any FD ready
    for key, mask in events:
        callback = key.data
        callback(key.fileobj, mask)

# This is exactly what asyncio does internally — abstracted via coroutines.`,
    },
    {
      lang: "python",
      caption: "Connection pooling — amortize handshake cost",
      code: `# Without pooling: every request pays TCP handshake (1 RTT) + TLS (1-2 RTT)
# + app request. Cross-region (~80ms RTT) = 240ms+ overhead per request.

# With pooling: pay the handshake once per connection, reuse for many requests.

import httpx

# GOOD: shared client, automatic connection pool
client = httpx.Client(
    limits=httpx.Limits(
        max_keepalive_connections=20,    # persistent idle conns
        max_connections=100,             # total (active + idle)
        keepalive_expiry=30.0,           # close idle conns after 30s
    ),
    timeout=httpx.Timeout(5.0, connect=2.0),
)

for url in urls:
    r = client.get(url)                  # reuses pooled connection
    process(r.json())

# BAD: new connection per request
for url in urls:
    with httpx.Client() as c:            # TCP+TLS handshake EVERY time
        r = c.get(url)

# Async version: httpx.AsyncClient with the same limits API.
# Pair with asyncio.Semaphore to bound concurrent in-flight requests.

# Pool sizing: target_concurrency = throughput_target * target_latency.
# 1000 rps * 50ms = 50 in-flight. Pool of 50-100 is right; 1000 wastes FDs.`,
    },
    {
      caption: "C10K → C10M — the scalability journey",
      code: `1999: Dan Kegel poses 'The C10K Problem' — how to handle 10K concurrent
      connections on one box. Thread-per-connection can't.
      Solution: epoll/kqueue + non-blocking I/O + event loop.
      nginx, HAProxy, Node.js, Twisted all built on this.

2010s: C100K becomes routine. nginx + libuv easily handle 100K idle
       connections per host. Memory per connection drops to ~10KB.

2015+: C10M is the new frontier. Approaches:
       - io_uring (Linux 5.1+) batches syscalls; zero-copy where possible.
       - SO_REUSEPORT lets multiple processes share a listening socket,
         spreading accept() load across CPU cores.
       - DPDK / AF_XDP bypass the kernel entirely for line-rate packet I/O.
       - eBPF programs in the kernel handle flow steering, drops, shaping.

Production examples:
  - WhatsApp: Erlang+BEAM, millions of TCP connections per server.
  - Cloudflare: 10M+ connections per server via io_uring + SO_REUSEPORT.
  - nginx default: 1024 worker_connections; tuned to 100K+ in prod.

The fundamental shift: from threads (1MB stack each) to events (~10KB each).
A 32GB box can host ~32K threads or ~3M event-driven connections.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "TCP handshake: 3 packets, 1 RTT. TLS 1.2: 2 RTT. TLS 1.3: 1 RTT (or 0-RTT with PSK resumption). HTTP/3 (QUIC): 1 RTT combined handshake.", tag: "perf" },
    { fact: "Same-AZ RTT ~0.5ms, cross-AZ ~1-2ms, cross-region ~30-100ms, intercontinental ~150-300ms. Architect around these floors.", tag: "perf" },
    { fact: "TLS handshake cost: ~5-50ms CPU on modern hardware per connection. Session resumption (PSK, 0-RTT) eliminates most of it.", tag: "perf" },
    { fact: "HTTP/2 multiplexes many streams over one TCP connection — saves handshakes but adds head-of-line blocking at the TCP layer (HTTP/3 fixes this).", tag: "perf" },
    { fact: "Keep-alive connections amortize the handshake. Pools should be sized by Little's Law: pool = target_throughput * target_latency.", tag: "perf" },
    { fact: "MTU 1500 (Ethernet); MSS = 1460 after IP+TCP headers. Jumbo frames (MTU 9000) cut per-packet overhead ~6x for bulk transfers.", tag: "perf" },
    { fact: "Bandwidth-delay product: 1Gbps × 100ms RTT = 12.5MB in flight. TCP window scaling MUST be enabled (default on Linux) for high-BDP paths.", tag: "perf" },
    { fact: "BBR congestion control (Linux 4.9+) outperforms CUBIC on lossy links; ~2-3x throughput on real-world cellular.", tag: "version" },
    { fact: "TCP_NODELAY disables Nagle's algorithm — lower latency for small interactive writes (mouse moves, chat) at the cost of more packets.", tag: "perf" },
    { fact: "TCP_QUICKACK (Linux) disables delayed-ACK for the next packet — useful for request-response workloads where the ACK delay hurts RTT.", tag: "perf" },
    { fact: "Ephemeral port range: 32768-60999 on Linux (~28K). At >28K concurrent outbound connections to one host:port, exhaust and fail with EADDRNOTAVAIL.", tag: "gotcha" },
    { fact: "TIME_WAIT lasts 2*MSL = 60s on Linux. High-churn servers (load balancers making many short-lived connects) need tcp_tw_reuse=1.", tag: "gotcha" },
    { fact: "DNS lookup latency: 1-100ms uncached, ~0ms cached. Always cache locally (nscd, systemd-resolved, dnsmasq) for hot domains.", tag: "perf" },
    { fact: "Anycast DNS (1.1.1.1, 8.8.8.8) routes queries to the nearest PoP; usually <10ms globally. Authoritative DNS may be 50-200ms for far regions.", tag: "perf" },
    { fact: "HTTP/3 (QUIC) eliminates head-of-line blocking: per-stream loss recovery means a dropped packet stalls only one stream, not the whole connection.", tag: "version" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "curl", purpose: "Universal HTTP/HTTPS/FTP/SMTP client. The ' Swiss army knife' for ad-hoc protocol debugging. -v shows the wire.", url: "https://curl.se/", category: "debug" },
    { tool: "httpie", purpose: "Human-friendly curl alternative. JSON-first, colorized output, intuitive syntax for headers/auth.", url: "https://httpie.io/", category: "debug" },
    { tool: "Wireshark", purpose: "GUI packet analyzer with deep protocol dissectors (HTTP, TLS, gRPC, QUIC, DNS, ...). The industry standard.", url: "https://www.wireshark.org/", category: "debug" },
    { tool: "tcpdump", purpose: "CLI packet capture with BPF filters. Captures to .pcap for offline Wireshark analysis. Ships with every Linux.", url: "https://www.tcpdump.org/", category: "debug" },
    { tool: "dig", purpose: "DNS query tool — A, AAAA, MX, TXT, +trace shows the full resolution path. The bind-utils package.", url: "https://bind9.readthedocs.io/", category: "debug" },
    { tool: "mtr", purpose: "traceroute + ping in one tool; shows per-hop latency + loss. --tcp probes ports that ICMP firewalls block.", url: "https://github.com/traviscross/mtr", category: "debug" },
    { tool: "nc (netcat)", purpose: "TCP/UDP swiss army knife — listen, connect, port-scan, hand-type protocols. The 'TCP cat'.", url: "https://nc110.sourceforge.io/", category: "debug" },
    { tool: "socat", purpose: "Bidirectional byte transfer between any two channels (TCP, UDP, unix socket, file, pipe, PTY). nc on steroids.", url: "http://www.dest-unreach.org/socat/", category: "build" },
    { tool: "ss (iproute2)", purpose: "Modern socket statistics — fast, replaces netstat. Shows PID, process, state, queues per socket.", url: "https://man7.org/linux/man-pages/man8/ss.8.html", category: "debug" },
    { tool: "nmap", purpose: "Network scanner — port discovery, service fingerprinting, OS detection. The standard for security auditing.", url: "https://nmap.org/", category: "debug" },
    { tool: "OpenSSL CLI", purpose: "TLS handshake inspection, cert generation/verification, s_client for raw TLS debugging. Mandatory for cert workflows.", url: "https://www.openssl.org/", category: "debug" },
    { tool: "Envoy", purpose: "L7 proxy with deep observability — access logs, xDS dynamic config, gRPC support, the Istio data plane.", url: "https://www.envoyproxy.io/", category: "build" },
    { tool: "HAProxy", purpose: "Highest-throughput L4/L7 load balancer. Still the default for raw TCP termination at the edge.", url: "https://www.haproxy.org/", category: "build" },
    { tool: "nginx", purpose: "Reverse proxy, CDN origin, ingress controller. The most-deployed web server; HTTP/3 support since 1.25.", url: "https://nginx.org/", category: "build" },
    { tool: "Cloudflare", purpose: "CDN + DNS + DDoS protection + Workers (edge compute). The default 'edge' for many web apps.", url: "https://www.cloudflare.com/", category: "deploy" },
    { tool: "Caddy", purpose: "Go-based web server with automatic HTTPS (Let's Encrypt). Easiest path to a TLS-terminated site.", url: "https://caddyserver.com/", category: "deploy" },
    { tool: "Knot / PowerDNS / Unbound", purpose: "Authoritative (Knot, PowerDNS) and recursive (Unbound) DNS servers. Replaces BIND for modern deployments.", url: "https://www.powerdns.com/", category: "build" },
    { tool: "nghttp2 / nghttp3", purpose: "HTTP/2 + HTTP/3 reference implementations and CLIs. Indispensable for QUIC/h3 debugging.", url: "https://nghttp2.org/", category: "debug" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "ARPANET TCP/IP", year: 1983, highlight: "January 1, 1983 'flag day' — ARPANET switches from NCP to TCP/IP. The birth of the modern Internet." },
    { version: "DNS (RFC 882/883)", year: 1984, highlight: "Paul Mockapetris's DNS design replaces hosts.txt; hierarchical, distributed name resolution." },
    { version: "TCP/IP Illustrated", year: 1989, highlight: "BSD 4.3 Tahoe introduces congestion control (slow start, congestion avoidance, fast retransmit)." },
    { version: "HTTP/1.0 (RFC 1945)", year: 1996, highlight: "First standardized HTTP; methods, headers, status codes. Connection-per-request model." },
    { version: "HTTP/1.1 (RFC 2616)", year: 1997, highlight: "Persistent connections (keep-alive), pipelining, host header (virtual hosting), chunked encoding." },
    { version: "IPv6 (RFC 2460)", year: 1998, highlight: "128-bit addresses, stateless autoconfig, built-in IPsec. Adoption still ~40% in 2024." },
    { version: "HTTP over TLS", year: 2000, highlight: "HTTPS standardized (RFC 2818); TLS replaces SSL; encryption becomes default for web." },
    { version: "C10K Problem essay", year: 1999, highlight: "Dan Kegel's essay popularizes epoll/kqueue + event-driven servers; thread-per-connection falls out of favor." },
    { version: "epoll (Linux 2.5.44)", year: 2002, highlight: "O(1) per-event I/O multiplexing lands in Linux; enables nginx, Node, asyncio at scale." },
    { version: "SPDY / HTTP/2 (RFC 7540)", year: 2015, highlight: "Multiplexed streams over one TCP, header compression (HPACK), server push. Binary framing." },
    { version: "TLS 1.3 (RFC 8446)", year: 2018, highlight: "1-RTT handshake (0-RTT resumption), mandatory PFS, removed weak ciphers. ~50% faster than TLS 1.2." },
    { version: "HTTP/3 (RFC 9114)", year: 2022, highlight: "QUIC over UDP — per-stream loss recovery, no head-of-line blocking, connection migration across IPs." },
    { version: "io_uring (Linux 5.1+)", year: 2019, highlight: "Zero-syscall I/O via shared ring buffers; 2-10x faster than epoll for high-IOPS workloads." },
    { version: "BBR congestion control", year: 2016, highlight: "Google's BBR (Linux 4.9+) measures bottleneck bandwidth + RTT instead of packet loss; 2-3x throughput on cellular." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What happens when you type a URL into a browser?", a: "1) DNS lookup (cache, then resolver chain to authoritative). 2) TCP 3-way handshake to the resolved IP (1 RTT). 3) TLS 1.3 handshake (1 RTT, includes cert verification). 4) HTTP request (GET / with Host header). 5) Server processes, returns response. 6) Browser parses HTML, fetches subresources (parallel, HTTP/2 multiplexed). 7) Renders DOM + CSSOM, executes JS, paints. Total: ~1-3s typical, dominated by network RTT and TLS on first visit.", difficulty: "medium" },
    { q: "Explain the TCP 3-way handshake.", a: "Client sends SYN with initial sequence number (ISN_c). Server replies with SYN-ACK carrying its own ISN_s and acking ISN_c+1. Client sends ACK for ISN_s+1. Connection is now ESTABLISHED — both sides know each other's ISN, can send data. The ISN prevents old packets from a previous connection on the same 4-tuple from being misinterpreted. Total: 3 packets, 1 RTT.", difficulty: "easy" },
    { q: "What's the difference between TCP and UDP?", a: "TCP: connection-oriented, reliable, ordered, byte-stream. Handshake establishes state; receiver ACKs; sender retransmits lost packets; flow/congestion control. Overhead: ~1 RTT setup, ~20 bytes header. UDP: connectionless, best-effort, unordered, datagrams. No handshake, no retransmit, no flow control. 8-byte header. Use TCP when reliability matters (web, files, email); UDP when latency > reliability (DNS, VoIP, games, QUIC).", difficulty: "easy" },
    { q: "Explain TIME_WAIT and why it lasts 2*MSL.", a: "After the active closer sends the final ACK, it enters TIME_WAIT for 2*MSL (60s on Linux, MSL=30s). Purpose: (1) If the final ACK is lost, the peer retransmits FIN and we can re-ACK. (2) Allow stray packets from the old connection to expire before the same 4-tuple can be reused — prevents old data from corrupting a new connection. It's a correctness feature, not a bug. Enable tcp_tw_reuse=1 to recycle ports safely for outbound connections.", difficulty: "medium" },
    { q: "How does TLS 1.3 improve on TLS 1.2?", a: "(1) 1-RTT handshake vs 2-RTT — halves latency for new connections. (2) 0-RTT resumption for returning clients — first request ships with the handshake. (3) Removed weak ciphers (CBC, RSA key exchange, MD5, SHA1). (4) Mandatory forward secrecy (ephemeral key exchange only). (5) Fewer round-trips = better on high-latency mobile. (6) Encryption of more of the handshake (cert is encrypted, hiding server identity from passive observers).", difficulty: "medium" },
    { q: "What's HTTP/2's head-of-line blocking problem, and how does HTTP/3 fix it?", a: "HTTP/2 multiplexes many streams over one TCP connection. If a single TCP packet is lost, ALL streams stall waiting for retransmission — even streams whose data wasn't in the lost packet. This is TCP-level HOL blocking. HTTP/3 runs over QUIC (UDP), where each stream has independent loss recovery — a lost packet stalls only the stream it belonged to. Plus QUIC's 1-RTT combined handshake (TCP+TLS in one) and connection migration across IP changes.", difficulty: "hard" },
    { q: "How would you debug 'I can't reach https://example.com'?", a: "Layered approach: (1) DNS — 'dig example.com' to confirm resolution. (2) Reachability — 'nc -zv example.com 443' or 'mtr --tcp --port 443 example.com' to find where packets drop. (3) TLS — 'openssl s_client -connect example.com:443 -servername example.com' to inspect the cert chain and handshake. (4) HTTP — 'curl -v https://example.com/' to see request/response. (5) If all client-side checks pass, the problem is server-side: check server logs, origin health, LB config.", difficulty: "medium" },
    { q: "Why is DNS TTL important, and how do you handle a migration?", a: "DNS records are cached at every layer (browser, OS, recursive resolver, ISP). TTL is the contract for how long caches may keep the old answer. Migration steps: (1) Lower TTL to 60s, 2x BEFORE the change. (2) Wait at least the old TTL × 2 so caches expire the old high-TTL record. (3) Switch the record. (4) Keep the old server running for the max old TTL × 2 to catch stragglers. (5) Some resolvers cap TTLs (e.g., min 60s, max 86400s) — don't assume exact honoring.", difficulty: "medium" },
    { q: "What's the difference between L4 and L7 load balancing?", a: "L4 (transport): forwards TCP/UDP streams by IP:port, no inspection of payload. Faster, simpler, TLS passes through. L7 (application): inspects HTTP headers, paths, cookies; can route by content, terminate TLS, retry, rewrite. Slower per request but smarter. Use L4 for raw throughput (TLS at backend) and L7 for content-based routing, retries, auth at the edge. Most modern edge deployments stack L4 (L3/4 LB like AWS NLB) → L7 (Envoy/nginx) → app.", difficulty: "medium" },
    { q: "Explain connection reuse and why it matters.", a: "Every new TCP+TLS connection costs 2 RTT (TCP + TLS 1.3) before app data flows. Cross-region (80ms RTT) = 160ms wasted per request. Connection reuse (HTTP keep-alive, HTTP/2 multiplexing) amortizes this across many requests. Client-side: connection pools (httpx.Client, JDBC pool, Go http.Transport). Server-side: tune max keepalive requests, idle timeout, and SO_KEEPALIVE. Pair with bounded pool sizing via Little's Law: pool = throughput * latency.", difficulty: "medium" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "UDP", whenThis: "TCP when you need reliable, ordered delivery — web, files, email, anything where a dropped packet must be retransmitted.", whenThat: "UDP when latency > reliability: DNS (one request, one response), VoIP/video (skip lost frames), games, QUIC (HTTP/3 implements its own reliability on top)." },
    { vs: "HTTP/1.1", whenThis: "HTTP/2+ when your server handles many requests per client and you want to amortize the handshake via multiplexing.", whenThat: "HTTP/1.1 when you have very few requests per connection, or for legacy clients and proxies that don't support h2." },
    { vs: "HTTP/2", whenThis: "HTTP/3 when packet loss is common (mobile, wifi) — per-stream loss recovery beats TCP-level head-of-line blocking.", whenThat: "HTTP/2 when you need maximum compatibility and the network is reliable (datacenter internal). h2 over TCP still outperforms h3 on perfect links." },
    { vs: "DNS over HTTPS (DoH)", whenThis: "Plain DNS when you control the resolver and trust the path (datacenter, internal).", whenThat: "DoH/DoT when you need privacy from network observers, want to bypass ISP hijacking, or operate on hostile networks (coffee shop wifi)." },
    { vs: "WebSockets", whenThis: "HTTP polling when changes are infrequent and you can tolerate 10-60s latency; one request per check.", whenThat: "WebSockets when you need real-time bidirectional: chat, live dashboards, multiplayer. Single TCP connection, server can push without polling." },
  ],
};

export default sheet;
