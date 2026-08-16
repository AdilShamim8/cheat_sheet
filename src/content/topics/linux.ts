import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "linux",
  name: "Linux Fundamentals",
  category: "topics",
  tier: "topic",
  tags: ["os", "kernel", "shell", "systemd", "processes", "filesystem", "bash"],
  tagline: "The kernel at the heart of most production servers, containers, and embedded systems — and the userspace tooling layered on top.",
  year: 1991,
  author: "Linus Torvalds",

  tldr: [
    "Linux is the kernel at the heart of most production servers, containers, and embedded systems; 'Linux fundamentals' usually means the userspace tooling layered on top — shell, coreutils, systemd, networking, and the filesystem hierarchy.",
    "The 80/20: everything is a file descriptor (sockets, pipes, devices, regular files), processes are trees signaled by integer codes, and systemd owns the lifecycle of long-running services on modern distros.",
    "Reach for it when debugging production issues (logs, strace, perf, /proc), writing service units, automating with shell, or understanding what containers actually do under the hood.",
    "Most outages and confusions collapse to: permission/ownership, signals, file descriptor leaks, PATH/env-var differences, and systemd unit ordering — not exotic kernel internals.",
  ],

  mentalModel: {
    title: "Everything is a file descriptor; everything is a process tree",
    body: "The kernel exposes I/O as file descriptors — small integers indexing into a per-process table. Sockets, pipes, regular files, and devices (/dev/null, /dev/random, /dev/tty) all share the open/read/write/close API. Processes form a tree rooted at PID 1 (systemd on modern distros); signals (SIGTERM=15, SIGKILL=9, SIGHUP=1) are how parents tell children to die or reload. Permissions are uid + gid + 9 rwx bits + ACLs; capabilities (CAP_NET_BIND_SERVICE, CAP_SYS_ADMIN, etc.) are the fine-grained replacement for full root. Containers are just namespaces (views) + cgroups (quotas) over this same model — there is no second kernel.",
  },

  constructs: [
    { syntax: "ps -eo pid,ppid,user,stat,cmd", behavior: "Lists all processes with parent PID, owner, and state (R/S/D/Z/T).", when: "Debugging process trees, finding zombie/defunct processes (stat 'Z'), identifying parents." },
    { syntax: "kill -TERM <pid>  →  kill -KILL <pid>", behavior: "SIGTERM (15) asks the process to clean up and exit; SIGKILL (9) is uncatchable and immediate.", when: "Always SIGTERM first, wait the grace period, only then SIGKILL. SIGKILL skips cleanup." },
    { syntax: "nohup cmd > out.log 2>&1 &", behavior: "Runs cmd immune to SIGHUP (terminal hangup), redirects stdout+stderr to a file, backgrounds it.", when: "Long-running jobs on a remote box when you can't use tmux/screen/systemd." },
    { syntax: "find . -name '*.ts' -newer marker -not -path '*/node_modules/*'", behavior: "Finds .ts files modified after `marker`, excluding node_modules.", when: "Selective cleanup, build inputs, anything `ls -R` can't express." },
    { syntax: "chmod 750 file  /  chown user:group file", behavior: "Sets rwx for user/group/other; changes owner/group. Sticky/setuid/setgid bits are 1xxx/2xxx/4xxx.", when: "Standard permission management; never chmod 777 in production." },
    { syntax: "systemctl status|start|stop|enable|disable <unit>", behavior: "Inspects and controls systemd units; `enable` makes a unit start at boot.", when: "Managing services on any modern Linux (RHEL 7+, Ubuntu 16.04+)." },
    { syntax: "journalctl -u svc -f --since '10 min ago'", behavior: "Streams systemd logs for a unit, filtered by time; -f follows like tail -f.", when: "First stop for service logs on systemd hosts; replaces /var/log/*.log for journald-managed services." },
    { syntax: "ss -tlnp", behavior: "Lists listening TCP sockets with PID/process — modern replacement for `netstat -tlnp`.", when: "What's listening on which port? Why can't I bind? Always prefer `ss` over `netstat`." },
    { syntax: "lsof -p <pid>  /  lsof -i :8080", behavior: "Lists open file descriptors for a process, or processes using a port.", when: "FD leak diagnosis, finding what holds a port open, 'too many open files' errors." },
    { syntax: "/proc/<pid>/{status,maps,fd,cmdline,environ}", behavior: "Kernel-exposed per-process metadata as plain text files — no syscalls needed.", when: "Inspecting a process's memory layout, open FDs, env vars, or cgroup membership without ptrace." },
    { syntax: "strace -f -e trace=network,openat cmd", behavior: "Traces syscalls made by cmd and its children, filtered to network and file opens.", when: "Debugging 'why is this failing?' when there's no log — strace rarely lies." },
    { syntax: "xargs -I{} -P8 cmd {}", behavior: "Runs cmd per input line with up to 8 parallel workers; {} is the placeholder.", when: "Parallel batch processing when GNU parallel isn't installed." },
  ],

  patterns: [
    {
      lang: "bash",
      caption: "systemd unit — production-grade service with hardening",
      code: `[Unit]
Description=My API service
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=appuser
Group=appgroup
WorkingDirectory=/opt/app
Environment=NODE_ENV=production
EnvironmentFile=/etc/app/env
ExecStart=/usr/bin/node /opt/app/dist/index.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s
TimeoutStopSec=30s

# Hardening — restrict what the service can do
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/app /var/log/app
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=false
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target`,
    },
    {
      lang: "bash",
      caption: "Signal handling and graceful shutdown — the right way to stop a service",
      code: `#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  echo "[$(date -Is)] SIGTERM received, draining..." >&2
  # Flush in-flight requests, close DB pools, release locks
  kill -TERM "$child_pid" 2>/dev/null || true
  wait "$child_pid" 2>/dev/null || true
  echo "[$(date -Is)] Drain complete" >&2
  exit 0
}

# Catch SIGTERM (docker stop, kubectl delete, systemd stop)
trap cleanup TERM INT

# Run the actual server in background so we can wait on it
node /app/dist/index.js &
child_pid=$!

# 'wait' blocks until child exits OR a trapped signal arrives;
# without it the trap fires only between commands (i.e., never).
wait "$child_pid"`,
    },
    {
      lang: "bash",
      caption: "Inspecting a running process via /proc — no debugger needed",
      code: `PID=$(pidof node)

echo "=== Status (memory, state, caps) ==="
cat /proc/$PID/status | grep -E '^(Name|State|Pid|PPid|Uid|VmRSS|CapEff)'

echo "=== Open file descriptors ==="
ls -la /proc/$PID/fd | head -20
# Count them — important for FD leak diagnosis
ls /proc/$PID/fd | wc -l

echo "=== Network connections ==="
ss -tnp | grep "pid=$PID"

echo "=== Memory map (libraries, heap, stack) ==="
head -20 /proc/$PID/maps

echo "=== Environment (as seen by the process) ==="
tr '\\0' '\\n' < /proc/$PID/environ

echo "=== Command line (preserved with NULs) ==="
tr '\\0' ' ' < /proc/$PID/cmdline; echo

echo "=== Cgroup membership ==="
cat /proc/$PID/cgroup`,
    },
    {
      lang: "bash",
      caption: "Diagnosing 'too many open files' — the most common Linux prod issue",
      code: `# Symptom: app logs "EMFILE: too many open files" or socket() fails with EMFILE

# 1. Check the process's actual FD count vs its limit
PID=$(pidof node)
echo "open FDs: $(ls /proc/$PID/fd | wc -l)"
echo "soft limit: $(cat /proc/$PID/limits | grep 'open files' | awk '{print $4}')"

# 2. Find what kind of FDs they are (sockets, pipes, regular files?)
ls -la /proc/$PID/fd | awk '{print $NF}' | \\
  sed 's|.*/||; s|\\[.*||' | sort | uniq -c | sort -rn | head

# 3. System-wide FD cap (kernel-level)
cat /proc/sys/fs/file-max
cat /proc/sys/fs/file-nr
#   <allocated> <max-ever> <system-limit>

# 4. Raise per-process limit (in systemd unit, not .bashrc — services don't source rc)
#    [Service]
#    LimitNOFILE=65536`,
    },
  ],

  pitfalls: [
    {
      title: "SIGKILL (-9) skips cleanup — destroy data, leak resources",
      symptom: "`kill -9` is the first instinct, but it bypasses finally blocks, doesn't release locks, doesn't flush buffers, doesn't close DB connections.",
      fix: "Always SIGTERM first, wait the grace period (10s default in Docker/k8s), then SIGKILL only as last resort. Train your team that `kill -9` is a debugging smell, not a default.",
    },
    {
      title: "File descriptor leaks hit ulimit -n",
      symptom: "Process opens files/sockets without closing them; over hours it hits the per-process FD limit (default 1024); new connections fail with EMFILE.",
      fix: "Raise the limit (`LimitNOFILE=65536` in systemd, `--ulimit nofile=65536` in Docker) as mitigation, but fix the leak with `lsof -p <pid>` and /proc/<pid>/fd inspection. Defaults are too low for servers.",
    },
    {
      title: "systemd unit missing WantedBy=multi-user.target",
      symptom: "Service works when you `systemctl start` it manually but doesn't come up after reboot — `enable` silently does nothing.",
      fix: "Always include `[Install] WantedBy=multi-user.target` (or graphically.target for desktop). After `systemctl enable`, verify with `systemctl is-enabled`.",
    },
    {
      title: "PATH differences between interactive shell and systemd unit",
      symptom: "Service works when you run it manually but fails in systemd with 'command not found' or wrong binary chosen — because .bashrc isn't sourced.",
      fix: "Always use absolute paths in ExecStart (`/usr/bin/node`, not `node`). Set `Environment=PATH=...` explicitly if you must. .bashrc, .profile, nvm, pyenv are interactive-only.",
    },
    {
      title: "`kill <pid>` sending to wrong PID due to race",
      symptom: "You `pkill -f 'node server.js'` but it matches your own grep/ssh session, or the PID was reused by another process.",
      fix: "Use PID files (systemd does this for you), `pgrep -f` for inspection before `kill`, and `--oldest`/`--newest` flags to disambiguate. Don't `pkill` patterns that could match unrelated processes.",
    },
    {
      title: "Shell quoting in `find -exec` vs `xargs`",
      symptom: "Filenames with spaces break `find ... | xargs rm` because xargs splits on whitespace; quoted args get re-interpreted.",
      fix: "Use `find ... -print0 | xargs -0` or `find ... -exec cmd {} +`. The `+` form batches many files per invocation (like xargs); `\\;` runs once per file (slower).",
    },
    {
      title: "cron environment is minimal — no PATH, no shell vars",
      symptom: "Script works when run from shell but fails in cron with 'command not found' or missing env vars; cron's env is basically just HOME, SHELL, LOGNAME, PATH=/usr/bin:/bin.",
      fix: "Set PATH and any env vars at the top of the crontab file or source a profile explicitly (`bash -lc`). For anything beyond a one-liner, use a systemd timer instead — it has proper env handling and logging.",
    },
  ],

  quickReference: [
    { fact: "Signal numbers: HUP=1, INT=2, QUIT=3, KILL=9, SEGV=11, PIPE=13, TERM=15, STOP=19, CONT=18. `kill -l` lists them all.", tag: "gotcha" },
    { fact: "Default ulimit -n: 1024 soft / 4096 hard on most distros. Production servers need 65536+ via systemd `LimitNOFILE`.", tag: "gotcha" },
    { fact: "PID 1 is systemd on every modern distro (RHEL 7+, Ubuntu 16.04+, Debian 8+). It reaps zombies and owns signal handling.", tag: "version" },
    { fact: "/proc/sys/fs/file-max is the system-wide FD cap, typically ~9.2M on 64-bit Linux; rarely the actual bottleneck.", tag: "perf" },
    { fact: "Load average (top/uptime): 1/5/15-min exponential moving avg of runnable + uninterruptible (D-state) processes, NOT CPU%.", tag: "gotcha" },
    { fact: "Cron precision: 1 minute minimum. For sub-minute, use systemd timers (OnUnitActiveSec=10s) or a loop with sleep.", tag: "gotcha" },
    { fact: "TCP TIME_WAIT: 60s default (2*MSL=30s). High-churn servers need net.ipv4.tcp_tw_reuse=1, NOT tcp_tw_recycle (removed in 4.12).", tag: "gotcha" },
    { fact: "Ephemeral port range: 32768-60999 on Linux (cat /proc/sys/net/ipv4/ip_local_port_range). ~28K outbound connections per remote IP:port pair.", tag: "gotcha" },
    { fact: "CAP_NET_BIND_SERVICE allows binding ports <1024 without root — granted via `setcap` or in Docker with --cap-add.", tag: "gotcha" },
    { fact: "`nice` ranges: -20 (highest priority) to 19 (lowest). Only root can go negative. Default 0; inherited by children.", tag: "perf" },
    { fact: "`ionice` classes: idle (1), best-effort 0-7 (2), realtime (3). Default best-effort 4. Realtime can starve other IO.", tag: "perf" },
    { fact: "ext4 max filename: 255 bytes; max path: 4096 bytes. XFS similar. Most tools choke well before the limit.", tag: "gotcha" },
    { fact: "`/dev/null` discards writes (always succeeds), returns EOF on read. Useful for suppressing output: `cmd > /dev/null 2>&1`.", tag: "style" },
    { fact: "Exit codes: 0 = success, 1-125 = app-defined errors, 128+N = killed by signal N (e.g., 137 = SIGKILL, 143 = SIGTERM).", tag: "gotcha" },
    { fact: "Container processes share the host kernel; namespaces give each container its own view (PID, net, mnt, user). No second kernel runs.", tag: "version" },
  ],

  goDeeper: [
    { title: "The Linux Programming Interface (Michael Kerrisk)", url: "https://man7.org/tlpi/", note: "The definitive 1500-page reference on Linux/UNIX system programming — syscalls, signals, IPC, threads. Author maintains the man pages." },
    { title: "Linux man pages — especially section 7", url: "https://man7.org/linux/man-pages/man7/intro.7.html", note: "Section 7 has overview pages (signal, user_namespaces, cgroups, capabilities) that explain concepts the per-command pages assume you know." },
    { title: "systemd Documentation", url: "https://systemd.io/", note: "Official docs including the unit file reference, 'systemd for Administrators' blog series by Lennart Poettering, and the rationale behind the design." },
    { title: "Linux Kernel Development (Robert Love)", url: "https://www.informit.com/store/linux-kernel-development-9780672329463", note: "Best one-volume treatment of the kernel itself — scheduler, memory, VFS, modules. Read 3rd edition or later." },
    { title: "Brendan Gregg — Linux Performance", url: "http://www.brendangregg.com/linuxperf.html", note: "The reference for performance analysis: perf, eBPF, flamegraphs, the USE method. Brendan's diagrams are pinned to half the ops walls on earth." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  // Adapted for linux: file types / process states / permission bits
  dataTypes: {
    primitives: [
      { syntax: "regular file (-)", behavior: "Plain byte stream addressed by an inode. No structure imposed by the kernel; FS-specific (ext4/XFS) decides layout.", when: "The 99% case. Open/read/write/close. 'stat <file>' shows the inode + type byte." },
      { syntax: "directory (d)", behavior: "Special file mapping names to inode numbers. Readable as a stream of struct linux_dirent; only the kernel writes.", when: "'ls' reads it; 'mkdir' creates one; rename/move updates two directories' mappings." },
      { syntax: "symlink (l)", behavior: "File containing a path string; resolved at access time. Can dangle, loop, or cross filesystems.", when: "Alias a path, switch between versions, 'fake' a system path. Use 'readlink -f' to resolve." },
      { syntax: "character device (c)", behavior: "Device file accessed as a byte stream (unbuffered). Examples: /dev/null, /dev/tty, /dev/random.", when: "Terminals, serial ports, RNGs. 'mknod name c <major> <minor>' creates one." },
      { syntax: "block device (b)", behavior: "Device file accessed in fixed-size blocks (buffered). Examples: /dev/sda, /dev/nvme0n1.", when: "Disks and partitions. 'lsblk' lists them; mounts usually go through a filesystem layer." },
      { syntax: "named pipe / FIFO (p)", behavior: "In-kernel buffer exposed as a filesystem path. writer blocks until a reader opens, vice versa.", when: "Inter-process comm on the same host without sockets. 'mkfifo name' creates one." },
      { syntax: "socket (s)", behavior: "Endpoint for IPC — unix domain (local) or network (TCP/UDP). Exposed as a filesystem path (unix) or a port.", when: "Unix sockets for local IPC (Docker, X11, postgres). 'ss -x' lists them." },
    ],
    collections: [
      { syntax: "R — running / runnable", behavior: "On-CPU or in the run queue waiting for a CPU. Includes tasks preempted by the scheduler.", when: "Healthy state. 'top' shows these as 'R'. Multiple R tasks competing = high load average." },
      { syntax: "S — interruptible sleep", behavior: "Blocked on I/O, event, or timer; can be woken by a signal. Most idle processes live here.", when: "Normal waiting state. 'sleep 60', waiting on read(), accepting connections." },
      { syntax: "D — uninterruptible sleep (disk)", behavior: "Blocked on disk I/O; CANNOT be woken by signals. SIGKILL won't even work until the I/O returns.", when: "Usually indicates slow disk or NFS hang. Long D times = storage problem, not app problem." },
      { syntax: "Z — zombie", behavior: "Process exited but parent hasn't called wait() yet. Holds PID + exit status; no memory or FDs.", when: "Bug in parent — should reap children. PID 1 (systemd) reaps orphans. Too many zombies = PID exhaustion risk." },
      { syntax: "T — stopped / traced", behavior: "Suspended via SIGSTOP/SIGTSTP or being traced by a debugger (ptrace). Resumes on SIGCONT.", when: "Ctrl-Z stops a foreground job; 'bg' resumes. gdb puts tracees in T state. Container pause uses cgroup freezer, not T." },
      { syntax: "I — idle kernel thread", behavior: "Kernel thread with no work to do. (ps shows 'I' since kernel 4.14+; used to show as 'S'.)", when: "Normal for kworkers and per-CPU idle threads. Not a problem state." },
      { syntax: "Paging / on-deck", behavior: "Some kernels show extra states: paging in (rare on modern systems), or parked. Most production ps output uses R/S/D/Z/T/I.", when: "If you see exotic states, check 'man ps' on the specific kernel — names vary." },
    ],
    custom: [
      { syntax: "rwxrwxrwx (user/group/other)", behavior: "9 bits: read/write/execute for user (owner), group, and other. Visible via 'ls -l' and 'stat -c %A'.", when: "Standard file permissions. Most production files are 640 or 644; dirs are 750 or 755." },
      { syntax: "setuid (4000)", behavior: "Runs the executable as the file's OWNER, not the caller. Classic example: /usr/bin/sudo, /usr/bin/passwd.", when: "Privilege escalation mechanism — necessary but dangerous. Audit with 'find / -perm -4000'." },
      { syntax: "setgid (2000) on file", behavior: "Runs the executable with the file's GROUP. On a directory: new files inherit the dir's group (not creator's).", when: "Shared team directories — setgid on /shared ensures all new files have group=team, not creator." },
      { syntax: "sticky bit (1000) on dir", behavior: "On a directory: only the file's owner (or dir's owner or root) can delete files in it. /tmp uses this.", when: "World-writable directories where users shouldn't delete each other's files. Always set on /tmp, /var/tmp." },
      { syntax: "ACL (getfacl/setfacl)", behavior: "Fine-grained per-user or per-group rwx beyond the 9-bit model. Stored as extended attributes.", when: "Multi-tenant filesystems, complex shared-dir policies. CephFS/NFSv4 ACLs are even richer." },
      { syntax: "capabilities (CAP_*)", behavior: "Fine-grained privileges replacing the root/non-root binary. CAP_NET_BIND_SERVICE for ports<1024, CAP_SYS_ADMIN for many syscalls.", when: "Run a service as non-root but grant specific privileges. 'getcap -r /' audits. Docker uses capabilities to drop most root powers." },
      { syntax: "umask", behavior: "Default permission mask applied to newly created files. 022 = files 644, dirs 755. 077 = files 600, dirs 700.", when: "Set in ~/.bashrc (interactive) or systemd 'UMask=' (services). Tighten for production (027 or 077)." },
    ],
  },

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "bash",
      caption: "stdin / stdout / stderr — the three file descriptors every process inherits",
      code: `# Every process starts with FD 0 (stdin), 1 (stdout), 2 (stderr) open.
# Pipes connect one process's stdout to another's stdin.

# Redirect stdout only
cmd > out.log

# Redirect stderr only
cmd 2> err.log

# Redirect both to separate files
cmd > out.log 2> err.log

# Redirect both to the same file (use &>, not 2>&1 > file)
cmd &> combined.log          # bash 4+
cmd > combined.log 2>&1      # portable

# Pipe stderr (not stdout) through a filter
cmd 2>&1 1>/dev/null | grep ERROR

# Append instead of overwrite
cmd >> out.log 2>&1

# Discard output (write to /dev/null)
cmd > /dev/null 2>&1

# Feed stdin from a file
cmd < input.txt

# Here-doc (multi-line stdin)
cat <<EOF
multi-line content
with $variable interpolation
EOF

# Here-string (single line)
grep pattern <<< "$my_variable"`,
    },
    {
      lang: "bash",
      caption: "Pipes and process substitution — composable Unix tools",
      code: `# Pipe: stdout of left -> stdin of right. Each stage runs in parallel;
# data flows when upstream produces and downstream consumes.
git log --oneline | wc -l
ps -ef | grep node | grep -v grep | awk '{print $2}' | xargs kill

# tee: write to stdout AND a file (or multiple)
make build 2>&1 | tee build.log
make build 2>&1 | tee >(grep ERROR > errors.log) >(grep -c WARN > warn-count.txt)

# Process substitution <(...) — lets a process's stdout appear as a FILE to another
diff <(ls dir1) <(ls dir2)
comm -12 <(sort file1) <(sort file2)
while read line; do ...; done < <(generate_lines)

# Subshell with redirection: isolate side effects
( cd subdir && make build ) > build.log 2>&1
# cd doesn't affect the parent shell because of the subshell parens.

# Named pipe (FIFO) for cross-process IPC without sockets
mkfifo /tmp/queue
producer > /tmp/queue &     # blocks until a reader appears
consumer < /tmp/queue`,
    },
    {
      lang: "bash",
      caption: "/proc — the kernel's plain-text interface (no syscalls required)",
      code: `# /proc is a virtual filesystem. Files are generated on read; writes configure the kernel.

# Per-process metadata
cat /proc/$$/status          # PID, state, memory, capabilities
cat /proc/$$/cmdline | tr '\\0' ' '   # command line (NUL-separated)
cat /proc/$$/environ | tr '\\0' '\\n'  # environment (NUL-separated)
ls -la /proc/$$/fd/          # open file descriptors (lstat to see targets)
cat /proc/$$/maps            # memory map: libraries, heap, stack
cat /proc/$$/cgroup          # cgroup membership
cat /proc/$$/limits          # ulimits (RLIMIT_NOFILE, etc.)
cat /proc/$$/io              # bytes read/written (process accounting)

# System-wide
cat /proc/cpuinfo            # CPU model, flags, cache sizes
cat /proc/meminfo            # MemTotal, MemFree, Cached, Buffers
cat /proc/loadavg            # 1/5/15-min load avg + running/total + last PID
cat /proc/uptime             # seconds up + seconds idle
cat /proc/version            # kernel version + gcc + build host
cat /proc/cmdline            # kernel boot args (BOOT_IMAGE, root=, etc.)

# Tunable kernel parameters via /proc/sys
cat /proc/sys/net/ipv4/ip_local_port_range
echo '32768 60999' > /proc/sys/net/ipv4/ip_local_port_range   # apply (lost on reboot)
# Persistent: write to /etc/sysctl.d/*.conf + 'sysctl --system'`,
    },
    {
      lang: "bash",
      caption: "Redirection + exec — moving FDs around inside a script",
      code: `# Open a file on a specific FD for the lifetime of the script
exec 3>/tmp/audit.log        # FD 3 = open for writing
exec 4</etc/config           # FD 4 = open for reading

echo "starting" >&3          # write to FD 3
read line <&4                # read from FD 4

# Swap stdout and stderr
exec 3>&1 1>&2 2>&3 3>&-     # 3->old-stdout, 1->stderr, 2->3 (old stdout), close 3

# Capture stderr into a variable while letting stdout flow
err=$(cmd 2>&1 1>/dev/null)
out=$(cmd 2>/dev/null)

# Log every command the script runs (set -x with redirection)
exec 2> >(tee -a trace.log >&2)
set -x
# All subsequent commands log to trace.log AND stderr.

# Close FDs explicitly when done
exec 3>&- 4<&-`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "bash",
      caption: "cron — the original Linux scheduler (1-minute resolution)",
      code: `# crontab -e opens your user's crontab. Format:
#   minute hour day-of-month month day-of-week command
#   0-59   0-23 1-31          1-12  0-6 (0=Sun)

# Run backup at 02:00 every day
0 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1

# Every 15 minutes during business hours Mon-Fri
*/15 9-17 * * 1-5 /usr/local/bin/check-queue.sh

# First of every month at midnight
0 0 1 * * /usr/local/bin/monthly-report.sh

# CRITICAL: cron's environment is MINIMAL — PATH=/usr/bin:/bin, HOME set, no .bashrc.
# Always source a profile explicitly:
0 * * * * . /etc/profile.d/app.sh && /opt/app/hourly.sh

# Better: use systemd timers for new deployments — they have proper env,
# journald logging, and dependencies. Cron is for legacy only.`,
    },
    {
      lang: "bash",
      caption: "systemd timer — the modern replacement for cron",
      code: `# Two files: a service unit + a timer unit. The timer triggers the service.

# /etc/systemd/system/hourly-backup.service
[Unit]
Description=Hourly backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
User=backup
# Proper env, journald logging, no cron-style minimal-PATH problem

# /etc/systemd/system/hourly-backup.timer
[Unit]
Description=Run hourly backup

[Timer]
OnCalendar=hourly           # or: OnCalendar=*:0:00 for top-of-hour
OnBootSec=5min              # also run 5 min after boot
Persistent=true             # catch up on missed runs after downtime
AccuracySec=1s              # tighter than cron's 1-minute floor

[Install]
WantedBy=timers.target

# Enable and start:
systemctl enable --now hourly-backup.timer

# Inspect next run + last run:
systemctl list-timers hourly-backup.timer`,
    },
    {
      lang: "bash",
      caption: "Signal handling loop — graceful shutdown for long-running scripts",
      code: `#!/usr/bin/env bash
set -euo pipefail

shutdown=0
cleanup() {
  echo "[$(date -Is)] signal received, shutting down..." >&2
  shutdown=1
}
trap cleanup TERM INT

# Main loop — checks the shutdown flag each iteration
while [ "$shutdown" -eq 0 ]; do
  do_work_iteration
  sleep 1 || true              # sleep is interruptible; the trap fires here
done

echo "[$(date -Is)] graceful exit" >&2

# Pattern for a server that needs to drain in-flight requests:
#   trap 'shutdown=1' TERM
#   while [ $shutdown -eq 0 ]; do accept_request; done
#   wait_for_inflight        # drain
#   cleanup_resources        # close pools, release locks

# For containerized apps: the orchestrator sends SIGTERM, waits
# stop_grace_period (10s default), then SIGKILL. The trap window
# is your drain budget.`,
    },
    {
      lang: "bash",
      caption: "tail -F + xargs — event-driven processing loop",
      code: `# 'tail -F' follows a file across log rotation (capital F, not lowercase).
# Combined with xargs, this is a poor-man's event loop.

# Re-index whenever a file appears in uploads/
inotifywait -m -e create /var/uploads --format '%f' |
  while read fname; do
    process "/var/uploads/$fname" &
  done

# Act on new log lines as they're written
tail -F /var/log/app.log |
  grep --line-buffered ERROR |
  while read line; do
    send_alert "$line"
  done

# inotifywait is from inotify-tools; install: apt-get install inotify-tools
# For high-throughput event loops, prefer a real event-driven language
# (Go, Python, Rust) over bash + tail/inotify.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "bash",
      caption: "Diagnose a hung process — D state, FD leak, or deadlock",
      code: `# Symptom: process unresponsive, 'kill <pid>' does nothing.

# 1. Check process state — D = uninterruptible sleep (disk I/O)
ps -o pid,stat,wchan,cmd -p <pid>
#   STAT=D means kernel is waiting on I/O; SIGKILL won't help until I/O returns.
#   WCHAN shows the kernel function the process is sleeping in (e.g., submit_bio).

# 2. What syscall is it stuck on?
sudo strace -p <pid>          # attach to running process
sudo cat /proc/<pid>/wchan    # single-shot: kernel function name
sudo cat /proc/<pid>/stack    # kernel stack trace (requires CONFIG_STACKTRACE)

# 3. Is it a FD leak? Count open FDs.
ls /proc/<pid>/fd | wc -l
#   Compare against the soft limit:
cat /proc/<pid>/limits | grep 'open files'

# 4. Is it stuck on a lock? Check open files for sockets/locks.
lsof -p <pid>
cat /proc/<pid>/locks         # system-wide POSIX locks

# 5. For D-state: usually disk or NFS. Check 'top' for %wa (iowait) spike.
#    For NFS hang: 'nfsstat -c' shows retransmits; hard-mount + network loss = forever D.
#    Solution: use 'soft' mounts or intr option (kernel-dependent) for non-critical NFS.`,
    },
    {
      lang: "bash",
      caption: "Recover from a filled disk — without losing data",
      code: `# Symptom: 'No space left on device' but 'df' shows free space.
# Could be: real full, inodes full, reserved-blocks for root, or stale file handles.

# 1. Check disk usage and inode usage
df -h                         # space
df -i                         # inodes — a million tiny files exhaust inodes before space

# 2. Find the largest space hogs
du -xh / 2>/dev/null | sort -rh | head -20
ncdu /                        # interactive version, much faster

# 3. Find files deleted but still held open by a process
# (common: log files rotated but the writer keeps the FD open)
sudo lsof +L1 | grep deleted
#   rsyslogd  1234  syslog   5w   REG  8,1  1073741824  12 /var/log/app.log (deleted)

# 4. Free space WITHOUT killing the process: truncate the open file
sudo truncate -s 0 /proc/1234/fd/5

# 5. Reserved blocks: ext4 reserves 5% for root by default. On huge data disks,
#    lower this (tune2fs -m 1 /dev/sda1) — root needs it only on /, not /data.

# 6. After cleanup, verify with df and confirm the writer recovers.`,
    },
    {
      lang: "bash",
      caption: "Zombie process accumulation — find and fix the parent",
      code: `# Zombies (state Z) are exited children whose parent hasn't reaped them.
# They hold no memory but DO hold a PID. PID exhaustion = no new processes.

# Find zombies
ps -eo pid,ppid,stat,cmd | awk '$3 ~ /Z/'
#   12345  6789 Z    [myworker] <defunct>

# The parent (6789) is buggy — it should call wait() or ignore SIGCHLD.
# Workaround 1: kill the parent; PID 1 (systemd) reaps the orphans.
sudo kill 6789

# Workaround 2: if the parent is PID 1 itself (container!), it's a reaping bug.
# Install 'tini' or 'dumb-init' as PID 1 to properly reap children.

# Workaround 3: signal the parent to reap (if it handles SIGCHLD lazily)
sudo kill -CHLD 6789

# Prevention: in your own code, call waitpid() on children, or set
# SIGCHLD to SIG_IGN so the kernel auto-reaps.
# In bash: 'wait' reaps background jobs.
# In Docker: use --init flag or tini as entrypoint.`,
    },
    {
      lang: "bash",
      caption: "Diagnose OOM kills — when the kernel SIGKILLs your process",
      code: `# Symptom: process disappeared, exit code 137, no app-level error.

# 1. Check the kernel log for the OOM killer invocation
sudo dmesg -T | grep -i 'killed process' | tail
sudo journalctl -k --since '1 hour ago' | grep -i oom

# Typical output:
#   Out of memory: Killed process 1234 (java) total-vm:8GiB, anon-rss:6GiB
#   oom_reaper: reaped process 1234, now anon-rss:0

# 2. Identify what's consuming memory
ps -eo pid,rss,cmd --sort=-rss | head
#   RSS = resident set size in KB. Multiply by 1024 for bytes.

# 3. Check current memory pressure
cat /proc/meminfo | grep -E '^(MemFree|MemAvailable|Cached|SwapTotal|SwapFree)'

# 4. Configure OOM behavior:
#    - systemd unit: MemoryMax=2G, MemoryHigh=1G (cgroup v2)
#    - Disable OOM for critical procs (risky): echo -17 > /proc/<pid>/oom_score_adj
#    - Enable swap (memory pressure relief, NOT a long-term fix)

# 5. For containers: set k8s memory limits so k8s evicts the pod cleanly
#    rather than the kernel OOM-killing a random process on the node.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "bash",
      caption: "Processes vs threads vs event loops — the three concurrency models",
      code: `# PROCESS — separate address space, scheduled by the kernel.
# Robust isolation; expensive to create (~ms fork); IPC via pipes/sockets.
nginx worker_process 4;           # 4 worker processes, each handles connections
postgres max_connections=100;     # 100 backend processes, each owns one client

# THREAD — shared address space, kernel-scheduled. Cheaper than process (~us).
# Race conditions on shared state require locks.
java -XX:ActiveProcessorCount=4 ... # JVM threads mapped to OS threads
python threading.Thread             # GIL serializes bytecode, but I/O releases it

# EVENT LOOP — single thread, non-blocking I/O, callbacks or async/await.
# Highest throughput for I/O-bound work; cannot use multiple cores without workers.
node server.js                      # libuv event loop
python asyncio                      # single-threaded coroutines
nginx (single-threaded workers with epoll)

# Hybrid: multiple processes (one per core), each running an event loop.
# This is how modern web servers scale: nginx, gunicorn+uvicorn, Puma clustered.
# gunicorn --workers 4 --worker-class uvicorn --threads 1`,
    },
    {
      lang: "bash",
      caption: "Signals — the kernel's IPC for process control",
      code: `# Common signals (kill -l lists all):
#   HUP    1   reload config (systemd, nginx -s reload)
#   INT    2   Ctrl-C (interruptible; apps can catch + clean up)
#   QUIT   3   Ctrl-\\ (core dump + exit)
#   KILL   9   uncatchable termination (last resort only)
#   SEGV   11  segmentation fault (memory access violation)
#   PIPE   13  write to a pipe with no reader (default: terminate)
#   TERM   15  graceful termination (default for 'kill')
#   STOP   19  pause (uncatchable, like Ctrl-Z but kernel-side)
#   CONT   18  resume after STOP

# Send a signal
kill <pid>                    # SIGTERM (default)
kill -TERM <pid>              # explicit SIGTERM
kill -9 <pid>                 # SIGKILL — last resort
kill -HUP $(pidof nginx)      # reload nginx config

# Send to a process group (negative PID):
kill -TERM -<pgid>            # all processes in the group

# Send by name (use carefully — matches multiple processes)
pkill -f 'node server.js'     # SIGTERM all matching
pkill -9 -f 'runaway'         # SIGKILL all matching

# Install a signal handler in a script:
trap 'cleanup; exit 0' TERM INT
trap 'reload_config' HUP`,
    },
    {
      lang: "bash",
      caption: "Parallel execution with xargs / parallel / background jobs",
      code: `# xargs -P — parallel command execution
find . -name '*.png' -print0 | xargs -0 -P8 -I{} convert {} {}.webp
#   -P8 = 8 parallel processes; -I{} = placeholder; -0 = NUL-separated input

# GNU parallel — better progress, output grouping, remote execution
parallel --progress --eta -j8 convert {} {.}.webp ::: *.png
parallel --bar 'curl -s -o /dev/null {}' :::: urls.txt

# Background jobs in bash + wait
for url in "$@"; do
  fetch "$url" > "/tmp/$(basename $url)" &
done
wait                           # block until all background jobs finish
echo "all done"

# Job control: jobs, fg, bg, Ctrl-Z
sleep 60 &                     # background
jobs                           # list background jobs
fg %1                          # bring job 1 to foreground
# Ctrl-Z to pause; 'bg' to resume in background

# Limit parallelism with a semaphore pattern
sem_max=4
for item in "\${items[@]}"; do
  while [ "$(jobs -r | wc -l)" -ge $sem_max ]; do sleep 0.1; done
  process "$item" &
done
wait`,
    },
    {
      lang: "bash",
      caption: "Locks and atomic ops — when shell meets concurrency",
      code: `# flock — file-based advisory lock for shell scripts
# Prevents two cron runs of the same script from overlapping.
(
  flock -n 9 || exit 1        # -n = non-blocking; exit if already locked
  do_critical_section
) 9>/var/lock/myscript.lock

# Blocking with timeout:
(
  flock -w 30 9 || exit 1     # wait up to 30s for the lock
  do_critical_section
) 9>/var/lock/myscript.lock

# mkdir as an atomic operation — POSIX guarantees mkdir is atomic
LOCKDIR=/tmp/myscript.lock
if mkdir "$LOCKDIR" 2>/dev/null; then
  trap 'rmdir "$LOCKDIR"' EXIT
  do_critical_section
else
  echo "already running" >&2
  exit 1
fi

# Atomic counter via mkdir + symlink (poor-man's CAS):
# Better: use a real DB or Redis INCR for distributed counters.

# For real concurrency primitives (mutexes, semaphores, condition variables),
# use a real language. Shell is for orchestration, not concurrent algorithms.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Memory hierarchy latency: L1 ~1ns, L2 ~4ns, L3 ~12ns, DRAM ~100ns, SSD ~100us, HDD ~10ms. Each step is ~10x slower; cache locality dominates performance.", tag: "perf" },
    { fact: "Context switch cost: ~3-5us on modern x86. Thread-per-connection saturates at ~10K connections; event loops (epoll) handle 100K+.", tag: "perf" },
    { fact: "fork() cost: ~100us-1ms (page table copy). vfork is faster but unsafe; posix_spawn is the modern fast alternative.", tag: "perf" },
    { fact: "epoll O(1) per event vs select/poll O(N) — the C10K problem was solved by epoll (Linux) / kqueue (BSD) in the early 2000s.", tag: "complexity" },
    { fact: "io_uring (Linux 5.1+) batches syscalls into a shared ring buffer; 2-10x faster than epoll for high-IOPS workloads.", tag: "version" },
    { fact: "Page cache: Linux uses free RAM as a file cache. 'free -h' shows 'cached' — this memory is reclaimable, not actually 'used'.", tag: "gotcha" },
    { fact: "TLB shootdowns cost ~1us per core on context switch. Huge pages (2MB or 1GB) reduce TLB pressure for memory-heavy apps.", tag: "perf" },
    { fact: "Default scheduler is CFS (Completely Fair Scheduler); EEVDF replaced it in 6.6+ (better latency for interactive workloads).", tag: "version" },
    { fact: "cgroup v2 unified hierarchy; systemd uses it for MemoryMax/CPUQuota. v1 is deprecated but still seen on old distros.", tag: "version" },
    { fact: "Load average includes uninterruptible (D-state) processes, so high load might mean disk I/O bottleneck, not CPU.", tag: "gotcha" },
    { fact: "iostat -x %util saturates at 100% for a single device; multi-queue NVMe can serve many I/Os in parallel below 100%.", tag: "perf" },
    { fact: "TCP_NODELAY disables Nagle's algorithm — lower latency for small interactive writes at the cost of more packets.", tag: "perf" },
    { fact: "perf top / perf record: hardware perf counters, <1% overhead. Flamegraphs (Brendan Gregg) visualize where CPU time goes.", tag: "perf" },
    { fact: "eBPF (4.4+) enables safe in-kernel tracing without kernel modules. bpftrace, bcc, pixie all build on it.", tag: "version" },
    { fact: "NUMA: cross-node memory access is 1.5-2x slower than local. numactl --membind / --cpunodebind for latency-sensitive workloads.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "systemd", purpose: "PID 1 on every modern Linux; service lifecycle, timers, sockets, journald, networkd. Indispensable.", url: "https://systemd.io/", category: "build" },
    { tool: "coreutils", purpose: "The GNU ls/cp/mv/cat/sort/uniq/awk suite. The 'everything is a file' tooling layer.", url: "https://www.gnu.org/software/coreutils/", category: "build" },
    { tool: "procps-ng", purpose: "ps, top, free, vmstat, sysctl, kill. Process + memory inspection.", url: "https://gitlab.com/procps-ng/procps", category: "debug" },
    { tool: "iproute2", purpose: "ip, ss, tc, bridge. Modern networking toolkit; replaces ifconfig/route/netstat.", url: "https://wiki.linuxfoundation.org/networking/iproute2", category: "build" },
    { tool: "util-linux", purpose: "mount, fdisk, dmesg, nsenter, unshare, lsblk. The system-admin toolbox.", url: "https://github.com/util-linux/util-linux", category: "build" },
    { tool: "strace / ltrace", purpose: "Syscall and library-call tracing. The first-stop debugger when something fails with no error.", url: "https://strace.io/", category: "debug" },
    { tool: "perf", purpose: "In-kernel profiler using hardware counters. 'perf record/report/top' for CPU profiling at <1% overhead.", url: "https://perf.wiki.kernel.org/", category: "debug" },
    { tool: "eBPF / bpftrace / bcc", purpose: "Safe in-kernel tracing. Replace kernel modules for performance, network, and observability work.", url: "https://ebpf.io/", category: "debug" },
    { tool: "Brendan Gregg's flamegraphs", purpose: "Visualize CPU profiling output as folded stacks. The standard way to find hot paths.", url: "https://github.com/brendangregg/FlameGraph", category: "debug" },
    { tool: "htop / btop", purpose: "Interactive process viewers; htop is classic, btop adds TUI charts. btop is the modern pick.", url: "https://github.com/aristocratos/btop", category: "debug" },
    { tool: "tmux / screen", purpose: "Terminal multiplexers — persistent sessions, window splits, detach/reattach. tmux is the modern default.", url: "https://github.com/tmux/tmux", category: "build" },
    { tool: "ripgrep / fd / bat / eza", purpose: "Modern Rust replacements for grep/find/cat/ls. 10-100x faster; better defaults.", url: "https://github.com/BurntSushi/ripgrep", category: "build" },
    { tool: "nginx / HAProxy / Envoy", purpose: "Production L4/L7 load balancers + reverse proxies. Pick by complexity: nginx < HAProxy < Envoy.", url: "https://nginx.org/", category: "build" },
    { tool: "Ansible", purpose: "Procedural SSH-based config management; idempotent YAML playbooks. Best for bare-metal/VM fleets.", url: "https://www.ansible.com/", category: "deploy" },
    { tool: "Packer", purpose: "Build golden VM images (AMI, qcow2, OVA) from declarative templates. Pairs with Terraform.", url: "https://www.packer.io/", category: "package" },
    { tool: "Cloud-init", purpose: "First-boot configuration of cloud VMs via user-data. The standard for EC2/GCE/Azure initial setup.", url: "https://cloud-init.io/", category: "deploy" },
    { tool: "iptables / nftables", purpose: "Linux netfilter firewalls. nftables is the modern replacement (since kernel 3.13); iptables is legacy.", url: "https://wiki.nftables.org/", category: "build" },
    { tool: "WireGuard", purpose: "Modern VPN protocol merged in kernel 5.6. Tiny codebase, fast, simple config. Replaces OpenVPN/IPsec for new deployments.", url: "https://www.wireguard.com/", category: "build" },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What happens when you type 'ls' in a shell?", a: "Shell forks, the child exec()s /bin/ls. The kernel loads the ELF binary, sets up the new process image, allocates a new address space, and runs ls. ls opens the current directory via getdents64(), reads entries, stat()s each, formats output, writes to stdout (FD 1). On completion, ls calls exit(); the shell (parent) reaps it via waitpid() and prints the next prompt.", difficulty: "medium" },
    { q: "Explain the difference between SIGTERM and SIGKILL.", a: "SIGTERM (15) is a polite request to terminate — the process can catch it, clean up (flush, close, unlock), then exit. SIGKILL (9) is uncatchable: the kernel immediately stops the process; no cleanup runs. Always try SIGTERM first, wait the grace period, only then SIGKILL. SIGKILL also can't interrupt D-state (uninterruptible disk wait) — the process dies only after the I/O returns.", difficulty: "easy" },
    { q: "What's a zombie process and how do you fix one?", a: "A zombie is an exited child whose parent hasn't called wait() to reap its exit status. It holds no memory or FDs but does hold a PID — too many can exhaust the PID table. Fix the parent (call waitpid or set SIGCHLD to SIG_IGN), or kill the parent so PID 1 (systemd) reaps the orphan. In containers, use --init or tini as PID 1 to handle reaping.", difficulty: "medium" },
    { q: "What does load average actually mean?", a: "It's the exponential moving average of (running + uninterruptible-sleep) processes over 1, 5, 15 minutes. A load of 4.0 on a 4-core machine means, on average, 4 processes are runnable or stuck on I/O. High load with low CPU% usually means disk I/O bottleneck (D-state). It's NOT CPU utilization — a single CPU-bound process gives load 1.0.", difficulty: "medium" },
    { q: "How do Linux containers actually work?", a: "Namespaces give each container its own view of: PID (process tree), network (interfaces, routing), mount (filesystem), UTS (hostname), IPC, user (uid mapping). Cgroups enforce CPU, memory, IO, device limits. OverlayFS stacks image layers + a writable top layer. Crucially: there is NO second kernel. Containers share the host kernel; isolation is at the resource-view level, not hardware-virtualization.", difficulty: "medium" },
    { q: "What's the difference between a process and a thread?", a: "Process = independent address space, scheduled by the kernel, isolated from other processes via MMU. Thread = shares address space with siblings, has its own stack + registers but shares heap + globals. Threads are cheaper to create (~us) and switch (~us) than processes (~ms). Both are kernel-scheduled on Linux (1:1 model). Race conditions on shared state require locks.", difficulty: "easy" },
    { q: "How would you debug a process stuck in D state?", a: "D = uninterruptible sleep, almost always waiting on disk I/O. Check ps -o wchan to see the kernel function. cat /proc/<pid>/stack for the kernel stack trace. strace -p <pid> shows current syscall. If it's NFS, check network; if it's local disk, check iostat -x for high %util or await. SIGKILL won't help — the process can only exit when the I/O completes. Solution: fix the I/O (storage health, network for NFS) or reboot.", difficulty: "hard" },
    { q: "Explain how epoll works and why it scales better than select.", a: "select/poll scan all watched FDs on every call — O(N) per event. epoll registers interest once (epoll_ctl), then epoll_wait returns only the FDs that have events — O(1) per event plus O(active) total. For 10K connections with 100 active, select scans 10K each call; epoll returns 100. This is what made C10K feasible in the early 2000s and is still the foundation of every high-concurrency server.", difficulty: "medium" },
    { q: "What are cgroups and how do they differ from namespaces?", a: "Namespaces control what a process SEES (its view of PIDs, network, mounts, users). Cgroups control what a process can USE (CPU time, memory, IO bandwidth, device access). Together they form the basis of Linux containers. Docker/k8s use both: namespaces for isolation, cgroups for resource limits. Cgroup v2 (default on modern kernels) unifies the hierarchy under systemd.", difficulty: "medium" },
    { q: "How would you troubleshoot 'too many open files'?", a: "First, check the process's actual FD count vs its limit: ls /proc/<pid>/fd | wc -l vs cat /proc/<pid>/limits | grep 'open files'. If at the limit, identify what kind of FDs (lsof -p <pid>) — sockets, pipes, regular files. Common causes: missing close() in error paths, leaking connections in a pool, unbounded cache of file handles. Raise the limit (systemd LimitNOFILE, docker --ulimit) as mitigation, but fix the leak. Default ulimit -n is 1024, too low for servers.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "BSD (FreeBSD/OpenBSD)", whenThis: "Linux when you want the broadest hardware support, the biggest ecosystem, the largest community, and the path of least resistance in industry.", whenThat: "BSD when you value cohesive base system + ports, ZFS as a first-class citizen (FreeBSD), or strict code-audit security (OpenBSD)." },
    { vs: "Windows Server", whenThis: "Linux for web/API servers, containers, microservices, and any cloud-native stack.", whenThat: "Windows Server for .NET Framework, Active Directory domain-joined workloads, SQL Server shops, or Microsoft 365 integration." },
    { vs: "macOS (Darwin)", whenThis: "Linux for production servers, embedded, supercomputers, and any infrastructure role.", whenThat: "macOS for developer laptops, audio/video production, and iOS app development. Same Unix DNA (POSIX), different userspace + UI." },
    { vs: "Container OSes (Talos, Bottlerocket)", whenThis: "Standard Linux (Debian/RHEL/Ubuntu) when you need general-purpose access, manual debugging, and broad package repos.", whenThat: "Container-optimized OS when running k8s nodes at scale — immutable, API-managed, no SSH, smaller attack surface." },
    { vs: "illumos / SmartOS", whenThis: "Linux for almost everything — the default with the largest ecosystem.", whenThat: "illumos when you want ZFS + DTrace + Zones as first-class primitives + Joyent's Triton. Niche but technically excellent." },
  ],
};

export default sheet;
