import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "git",
  name: "Git",
  category: "topics",
  tier: "topic",
  tags: ["vcs", "distributed", "dag", "branching", "collaboration", "cli"],
  tagline: "A distributed version control system built on a content-addressable DAG of immutable snapshots — the de facto standard for source control.",
  year: 2005,
  author: "Linus Torvalds",

  tldr: [
    "Git is a distributed version control system whose model is a content-addressable DAG of immutable snapshots — not a series of diffs, despite the common mental model.",
    "The 80/20: every operation is a graph manipulation. Branches are movable pointers to commits, commits are immutable snapshots keyed by SHA, merges create merge commits, rebases replay commits onto new bases.",
    "Reach for it when coordinating changes across teams, when you need cheap local branching and offline work, or when integrating contributions from many committers into a shared trunk.",
    "Most confusion collapses to four distinctions: working tree vs index vs HEAD, local refs vs remote-tracking refs, fast-forward vs merge commit, and the reflog as the safety net you forget exists.",
  ],

  mentalModel: {
    title: "A content-addressable DAG of snapshots",
    body: "Each commit is a full snapshot of the tree, addressed by the SHA-1 of its content + parent SHAs + author + message. Branches are lightweight movable pointers (one file, 41 bytes); HEAD points to the current branch. The index (staging area) is the proposed next commit — a flat list of (path, blob-sha, mode) triples. The reflog is a local-only audit trail of where each ref has been; `git reflog` is how you recover work that 'disappeared' after a bad reset or rebase. `git reset` moves branch pointers; `git switch`/`checkout` moves HEAD; `git revert` adds a new commit that undoes another — it never rewrites history.",
  },

  constructs: [
    { syntax: "git switch -c feature", behavior: "Create and switch to a new branch — a 41-byte file in .git/refs/heads/.", when: "Starting any new line of work; prefer `switch` over `checkout` (clearer intent since 2.23)." },
    { syntax: "git merge --no-ff feature", behavior: "Forces a merge commit even when fast-forward is possible; preserves branch topology.", when: "Merging feature branches when you want history to show the branch existed." },
    { syntax: "git merge --ff-only feature", behavior: "Refuses to merge unless fast-forward is possible — no merge commit created.", when: "Pulling upstream changes into a local branch you haven't committed to." },
    { syntax: "git rebase main", behavior: "Replays your branch commits on top of current main, rewriting their SHAs.", when: "Before merging a long-lived branch; never on commits already pushed and shared." },
    { syntax: "git rebase -i HEAD~5", behavior: "Interactive rebase — squash, reorder, reword, or drop the last 5 commits.", when: "Cleaning up WIP commits before opening a PR." },
    { syntax: "git cherry-pick <sha>", behavior: "Applies a single commit's diff as a new commit on the current branch.", when: "Backporting a fix to a release branch; pulling one commit out of a stale PR." },
    { syntax: "git reflog", behavior: "Shows the local history of where HEAD and branches have pointed — including 'lost' commits.", when: "Recovering from a botched reset, rebase, or branch delete; this is your undo." },
    { syntax: "git worktree add ../proj-hotfix main", behavior: "Checks out a second branch in a sibling directory, sharing the same .git.", when: "Working on two branches simultaneously without stashing or cloning twice." },
    { syntax: "git stash push -m 'wip'", behavior: "Saves uncommitted changes to a stack and restores a clean working tree.", when: "Quick context switch; prefer a WIP commit or worktree for anything longer than minutes." },
    { syntax: "git bisect start", behavior: "Binary search through commit history to find the commit that introduced a bug.", when: "A regression appeared and `git blame` isn't enough; pair with `bisect run` for automated testing." },
    { syntax: "git revert <sha>", behavior: "Creates a new commit that undoes the changes of <sha> — safe for shared history.", when: "Reverting a bad commit on main; the only safe 'undo' on pushed branches." },
    { syntax: "git log -S'function_name' --all", behavior: "Pickaxe search — finds commits that added or removed a specific string across all branches.", when: "Tracing when a function, constant, or bug string first appeared or was removed." },
  ],

  patterns: [
    {
      lang: "bash",
      caption: "Feature branch workflow with rebase before merge",
      code: `# Start work from a current main
git switch main && git pull --ff-only origin main
git switch -c feat/payment-retry

# ...commit work, push to remote...
git push -u origin feat/payment-retry

# Before merging, rebase onto latest main to linearize history
git fetch origin
git rebase origin/main
# Resolve conflicts, then: git rebase --continue

# Force-push the rebased branch (safe — it's YOUR branch, not shared)
git push --force-with-lease  # never use bare --force

# Merge with --no-ff to preserve the feature-branch boundary
git switch main
git merge --no-ff feat/payment-retry
git push origin main
git branch -d feat/payment-retry
git push origin --delete feat/payment-retry`,
    },
    {
      lang: "bash",
      caption: "Recover a deleted branch via reflog — the safety net",
      code: `# Oops: deleted a branch with unmerged work
git branch -D feat/lost-work

# Reflog shows where HEAD has been — find the SHA before the delete
git reflog
# 7a3f9b2 HEAD@{0}: commit: fix retry logic
# 8c1d4e7 HEAD@{1}: checkout: moving from feat/lost-work to main
# ↑ 7a3f9b2 is the tip of the 'lost' branch

# Recreate the branch at that SHA
git switch -c feat/lost-work 7a3f9b2

# Reflog entries live for 90 days (reachable) or 30 days (unreachable)
# by default — gc.reflogExpire / gc.reflogExpireUnreachable tune this.`,
    },
    {
      lang: "bash",
      caption: "Interactive rebase to squash WIP commits",
      code: `# You pushed 6 messy commits; PR should have 1 clean one
git rebase -i origin/main

# Editor opens with:
#   pick   a1b2c3 wip
#   pick   d4e5f6 wip
#   pick   g7h8i9 fix tests
#   pick   j0k1l2 address review
#   pick   m3n4o5 fmt
#   pick   p6q7r8 final

# Rewrite as:
#   pick   a1b2c3 wip
#   squash d4e5f6 wip
#   squash g7h8i9 fix tests
#   squash j0k1l2 address review
#   squash m3n4o5 fmt
#   squash p6q7r8 final
# Save → next prompt asks for the combined commit message.

# SHAs of all squashed commits change → must force-push
git push --force-with-lease`,
    },
    {
      lang: "bash",
      caption: "Bisect to find the commit that introduced a regression",
      code: `# Bug exists in HEAD; was fine at v1.4.0 release
git bisect start
git bisect bad HEAD
git bisect good v1.4.0
# Git checks out the midpoint; you test it

git bisect bad      # if the bug reproduces
git bisect good     # if it doesn't

# Repeat — log2(N) steps for N commits in range
# Or automate with a script:
git bisect run ./scripts/test-checkout.sh

# When done, return to original branch
git bisect reset`,
    },
  ],

  pitfalls: [
    {
      title: "Detached HEAD after checking out a commit SHA",
      symptom: "`git checkout <sha>` (or a tag) puts you in detached HEAD — new commits aren't on any branch and get garbage-collected after a while.",
      fix: "Always create a branch first: `git switch -c new-branch <sha>`. If you're already detached and have commits, run `git branch save-branch` before switching away to preserve them.",
    },
    {
      title: "`git push --force` overwriting teammates' work",
      symptom: "Force-pushing a shared branch rewrites history; teammates who pulled the old version now have conflicts they can't resolve cleanly, and lost commits can be unrecoverable.",
      fix: "Use `git push --force-with-lease` — it refuses to push if the remote has new commits you haven't fetched. Never force-push to shared branches (main, develop). Protect them in your repo settings.",
    },
    {
      title: "Rebasing commits that others have already pulled",
      symptom: "Rebase rewrites commit SHAs; anyone who based work on the old SHAs now has divergent history that's painful to reconcile, with duplicate commits appearing in merges.",
      fix: "Golden rule: never rebase shared commits. Rebase only your own feature branches before merging into shared trunks. If you must rewrite shared history, coordinate with all contributors first.",
    },
    {
      title: "`.gitignore` doesn't untrack already-tracked files",
      symptom: "You add `node_modules/` to .gitignore but it's still in the repo — gitignore only affects untracked files.",
      fix: "`git rm --cached <path>` to untrack without deleting locally, then commit. For directories: `git rm -r --cached node_modules/`.",
    },
    {
      title: "Stash conflicts on pop",
      symptom: "After weeks of work, `git stash pop` fails with merge conflicts and you can't tell what's yours vs the stash's.",
      fix: "Pop into a clean working tree only; if it conflicts, resolve like any merge. Better: avoid long-lived stashes — use a WIP commit on a temp branch instead, which gives you full diff tooling.",
    },
    {
      title: "CRLF/LF line-ending mismatches across OS",
      symptom: "Files show as modified on Windows that aren't on macOS/Linux; PRs contain spurious whitespace-only diffs.",
      fix: "Set `git config --global core.autocrlf input` on macOS/Linux and `true` on Windows, and commit a `.gitattributes` file specifying `* text=auto eol=lf` per repo — this is the only reliable cross-platform fix.",
    },
    {
      title: "`git pull` doing a merge by default creates messy history",
      symptom: "Every pull from a remote with new commits creates a merge commit, producing a noisy 'diamond' history that's hard to read and bisect.",
      fix: "Set `git config --global pull.rebase true` (or `ff-only`) to fast-forward or rebase instead of merge. Inspect with `git log --graph --oneline` to verify.",
    },
  ],

  quickReference: [
    { fact: "Objects are addressed by SHA-1 (160-bit); migration to SHA-256 is in progress via `git config extensions.objectFormat sha256`.", tag: "version" },
    { fact: "Default branch was renamed master → main in 2020 (GitHub default since Oct 2020). Configure per-repo via `git init -b main`.", tag: "version" },
    { fact: "Reflog retention: 90 days for reachable refs, 30 days for unreachable (gc.reflogExpire / gc.reflogExpireUnreachable).", tag: "gotcha" },
    { fact: "`git gc` runs automatically after ~6700 loose objects accumulate; `git gc --aggressive` repacks everything but rarely helps perf.", tag: "perf" },
    { fact: "Pack files delta-compress objects; a typical packed commit is ~200-500 bytes. Repos grow slowly once packed.", tag: "perf" },
    { fact: "Shallow clone (`--depth 1`) fetches only the latest commit — saves bandwidth and disk; use for CI build contexts.", tag: "perf" },
    { fact: "Hooks are client-side by default (.git/hooks/) and not enforced across clones; use server-side (pre-receive, update) for policy.", tag: "gotcha" },
    { fact: "`git fsck` verifies object integrity and reports missing/dangling objects; run before any destructive operation on a repo.", tag: "gotcha" },
    { fact: "Filter-branch is deprecated; use `git filter-repo` (Python tool) for history rewriting — it's faster and safer.", tag: "version" },
    { fact: "`git blame` shows last-modifying commit per line; `git log -L :func:file.ts` shows the history of a function across renames.", tag: "style" },
    { fact: "Merge commits have 2+ parents; regular commits have 1; root commits have 0. `git cat-file -p <sha>` reveals the structure.", tag: "complexity" },
    { fact: "Bisect is O(log N) — finding one bad commit in 1000 takes ~10 steps; in 1M takes ~20.", tag: "complexity" },
    { fact: "Submodules are tracked as a commit SHA in the parent repo — they don't auto-update; use `git submodule update --init --recursive`.", tag: "gotcha" },
    { fact: "Conventional commit messages (feat:, fix:, chore:, etc.) enable automated changelogs and semantic versioning.", tag: "style" },
    { fact: "Signed commits (`git commit -S`) use GPG/SSH keys; `--signoff` adds a Developer Certificate of Origin line — different things.", tag: "style" },
  ],

  goDeeper: [
    { title: "Pro Git (Scott Chacon, Ben Straub)", url: "https://git-scm.com/book/en/v2", note: "The official free book; chapters 7 (tools) and 10 (internals) are the highest-signal material on Git anywhere." },
    { title: "git-rebase(1) manual", url: "https://git-scm.com/docs/git-rebase", note: "Definitive reference for rebase, including --interactive, --onto, and --rebase-merges modes." },
    { title: "gitworkflows(7) manual", url: "https://git-scm.com/docs/gitworkflows", note: "Linus's own description of the topic-branch and maintainer workflows used on the Linux kernel." },
    { title: "Think Like a Git (Sam Livingston-Gray)", url: "http://think-like-a-git.net/", note: "Best treatment of Git as graph theory — explains why rebase, cherry-pick, and revert behave the way they do." },
    { title: "Git from the Bottom Up (John Wiegley)", url: "https://jwiegley.github.io/git-from-the-bottom-up/", note: "Walks the object model from plumbing up — the only way to truly internalize the DAG." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  // Adapted for git: object types / ref types / config types
  dataTypes: {
    primitives: [
      { syntax: "blob", behavior: "Content-addressed storage of a file's bytes (zlib-compressed). Keyed by SHA-1 of 'blob <len>\\0<content>'. Stores NO filename, NO mode.", when: "Inspecting via 'git cat-file -p <sha>'. Same content always produces the same blob SHA across repos." },
      { syntax: "tree", behavior: "Directory listing: list of (mode, name, blob-or-tree-sha) entries. Represents one folder's contents at one commit.", when: "'git cat-file -p <tree-sha>' shows entries. Trees are how git reconstructs a snapshot." },
      { syntax: "commit", behavior: "Immutable record: tree-sha + parent-sha(s) + author/committer + message + timestamp. Keyed by SHA-1 of the formatted text.", when: "The unit of history. Merge commits have 2+ parents; root commits have 0." },
      { syntax: "tag (lightweight)", behavior: "A ref pointing directly at a commit (a 41-byte file under .git/refs/tags/). No metadata of its own.", when: "Quick labels; CI build tags. Use annotated tags for releases — they carry metadata + signature." },
      { syntax: "tag (annotated)", behavior: "A full git object (like a commit) stored in objects/ — points at a commit, has tagger + message + optional GPG signature.", when: "Releases (v1.2.3). Annotated tags are immutable objects; lightweight tags are just movable refs." },
      { syntax: "pack object", behavior: "Delta-compressed object stored inside a .pack file; the base + delta chain reconstructs any version. Created by 'git gc' / 'git repack'.", when: "Default storage after a clone or gc. A typical packed commit is ~200-500 bytes vs ~2KB loose." },
    ],
    collections: [
      { syntax: "branch (refs/heads/<name>)", behavior: "A movable pointer to a commit. Moving it is O(1) — just rewrite a 41-byte file.", when: "Default unit of work. 'git switch' moves HEAD between branches; commits advance the current branch." },
      { syntax: "remote-tracking (refs/remotes/<remote>/<branch>)", behavior: "Local cache of where a remote branch pointed at last fetch. Updated ONLY by fetch/push, never by local commits.", when: "Inspecting 'where is origin/main?' without a network round-trip. 'git status' compares HEAD vs upstream." },
      { syntax: "HEAD", behavior: "Symbolic ref to the current branch (e.g., 'ref: refs/heads/main'). Detached HEAD points directly at a commit SHA.", when: "Git reads HEAD to know what to commit on top of. 'git symbolic-ref HEAD' shows the target." },
      { syntax: "ORIG_HEAD, CHERRY_PICK_HEAD, MERGE_HEAD", behavior: "Special refs git writes during/after risky ops so you can recover or reference the pre-op state.", when: "ORIG_HEAD = state before merge/rebase/reset. MERGE_HEAD = the commit being merged in. Useful for scripts." },
      { syntax: "stash (refs/stash)", behavior: "A reflog of stacked WIP commits. Each stash is actually a merge of index + working-tree commits.", when: "'git stash list' shows the stack. The reflog holds the history; drop only with 'stash drop'." },
      { syntax: "reflog (logs/refs/...)", behavior: "Per-ref append-only log of where each ref has pointed. NOT shared across clones — local-only undo.", when: "Your safety net after reset/rebase/branch-delete. 'git reflog show <ref>' to inspect." },
      { syntax: "notes (refs/notes/commits)", behavior: "Extra metadata attached to existing commits without rewriting them. Stored as a tree of blobs keyed by commit SHA.", when: "Adding CI build URLs, sign-off, or review comments to commits you can't rewrite." },
    ],
    custom: [
      { syntax: "core.repositoryformatversion", behavior: "Repo format version. 0 = classic SHA-1; 1 enables extensions.objectFormat for SHA-256.", when: "Migration to SHA-256 requires version 1 + extensions.objectFormat=sha256." },
      { syntax: "core.autocrlf", behavior: "Controls CRLF↔LF conversion on checkout/commit. 'input' = convert to LF on commit, leave alone on checkout.", when: "Cross-platform line-endings. Set 'input' on Mac/Linux, 'true' on Windows; prefer .gitattributes instead." },
      { syntax: "core.excludesfile", behavior: "Global gitignore applied to all repos. Useful for editor scratch files (.DS_Store, *.swp, IDE dirs).", when: "Set once: 'git config --global core.excludesfile ~/.gitignore_global'." },
      { syntax: "pull.rebase", behavior: "When true, 'git pull' runs 'git pull --rebase' instead of creating merge commits. Per-branch via branch.<name>.rebase.", when: "Set globally for clean linear history: 'git config --global pull.rebase true'." },
      { syntax: "rerere.enabled", behavior: "Reuse Recorded Resolution — git remembers how you resolved a conflict and auto-applies the same resolution next time.", when: "Long-lived rebases (e.g., maintaining a fork). 'git config --global rerere.enabled true'." },
      { syntax: "init.defaultBranch", behavior: "Branch name used by 'git init' and 'git init -b'. Defaults to 'master' on old git, 'main' on modern installs.", when: "Set globally: 'git config --global init.defaultBranch main'." },
      { syntax: "commit.gpgsign / gpg.format", behavior: "Auto-sign commits with GPG or SSH keys. 'gpg.format=ssh' uses your SSH key (git 2.34+).", when: "Releases and audited repos. GitHub shows 'Verified' badge on signed commits." },
    ],
  },

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "bash",
      caption: "Pipes in / out — git as a Unix citizen",
      code: `# Read commit log on stdin, write processed output to stdout
git log --pretty=format:'%H %s' | awk '{print $1}' | head -10

# Apply a patch generated elsewhere
git format-patch -1 HEAD --stdout > fix.patch
git am < fix.patch        # applies + creates commit with original message

# Pipe a diff into git apply (no commit created) — useful for review tweaks
git diff main..feature | git apply --check   # dry-run
git diff main..feature | git apply           # apply to working tree

# Use git as a content-addressable store: hash anything, store it
echo "hello" | git hash-object --stdin       # prints the blob SHA
echo "hello" | git hash-object -w --stdin    # writes the blob to .git/objects/

# Stream a tarball of the repo at HEAD (no checkout needed)
git archive --format=tar HEAD | gzip > release.tar.gz`,
    },
    {
      lang: "bash",
      caption: "Hooks — server-side policy and client-side automation",
      code: `# Hooks live in .git/hooks/ (client-side) or hooks/ on a bare server.
# Each is an executable script; git passes args via $1, $2, ... and stdin.

# pre-commit (client) — runs before commit is created. Exit non-zero to abort.
#!/usr/bin/env bash
# .git/hooks/pre-commit
set -e
npm run lint
npm run typecheck
npm test -- --silent
# To skip on a one-off basis: git commit --no-verify

# pre-push (client) — runs before pushing. Reads refs from stdin.
# stdin format: <local-ref> <local-sha> <remote-ref> <remote-sha>
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "Direct push to main forbidden" >&2
    exit 1
  fi
done

# pre-receive (server) — enforces policy on the remote. THE place for
# branch protection, signed-commit requirements, file-size limits.
# Reads ref updates from stdin; exit non-zero to reject the ENTIRE push.`,
    },
    {
      lang: "bash",
      caption: "Plumbing commands — script git like a database",
      code: `# Write a blob directly, get its SHA
SHA=$(echo "file contents" | git hash-object -w --stdin)

# Write a tree referencing that blob at path "hello.txt"
TREE_SHA=$(printf '100644 hello.txt\\0%s' "$(echo $SHA | xxd -r -p)" |
           git mktree)

# Write a commit pointing at that tree, with a parent
COMMIT_SHA=$(git commit-tree $TREE_SHA -p HEAD -m "via plumbing")
# -> prints a real commit SHA; verify with:
git cat-file -p $COMMIT_SHA

# Move a branch to point at it (this is all 'git commit' really does)
git update-ref refs/heads/experiment $COMMIT_SHA

# Read any object's raw content
git cat-file -p $SHA            # pretty-print (parsed)
git cat-file -s $SHA            # size in bytes
git cat-file -t $SHA            # type: blob | tree | commit | tag

# List all objects in the repo (loose + packed)
git cat-file --batch-all-objects --batch-check`,
    },
    {
      lang: "bash",
      caption: "stdin to commit message — pipes from other tools",
      code: `# Read commit message from stdin (no editor opens)
echo "fix: handle empty cart" | git commit -F -

# Use a here-doc for multi-line messages
git commit -F - <<'EOF'
feat: add payment retry logic

Retries failed charges up to 3 times with exponential backoff.
Closes #1234.
EOF

# Compose a commit message from a template + dynamic context
{
  echo "[$(date +%Y-%m-%d)] deploy prep"
  echo
  git diff --cached --stat
} | git commit -F -

# Amend the last commit's message from stdin
echo "better message" | git commit --amend -F -`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "bash",
      caption: "Recover from a botched reset / rebase via reflog",
      code: `# You ran 'git reset --hard HEAD~3' and realized you lost work.
# Reflog still has the original HEAD for ~90 days.

git reflog                  # find the SHA before the reset
#   7a3f9b2 HEAD@{0}: reset: moving to HEAD~3
#   8c1d4e7 HEAD@{1}: commit: important work  <- want this one
#   ...

git switch -c recovered 8c1d4e7   # branch at the lost commit
# Or, restore in place:
git reset --hard 8c1d4e7

# After confirming recovery, clean up:
git reflog expire --expire=now --all   # tightens reflog (advanced)
git gc --prune=now                     # deletes unreachable objects`,
    },
    {
      lang: "bash",
      caption: "Resolve a messy merge conflict — the systematic method",
      code: `# Conflicts during a rebase. Don't panic — every step is recoverable.

git status                # shows conflicting files
# Unmerged paths:
#   both modified:   src/cart.ts

# 1. Inspect the conflict markers
git diff                  # shows the entire conflict region
#   <<<<<<< HEAD
#   ...your changes...
#   =======
#   ...incoming changes...
#   >>>>>>> feature/x

# 2. Edit the file to remove markers + keep the right code

# 3. Stage the resolution
git add src/cart.ts

# 4. Continue the rebase (or merge with 'git merge --continue')
git rebase --continue

# To abort and return to pre-rebase state:
git rebase --abort

# Use a mergetool for complex conflicts:
git mergetool --tool=vimdiff   # or meld, kdiff3, VS Code
# Tip: configure VS Code as mergetool once, use forever:
#   git config --global merge.tool vscode
#   git config --global mergetool.vscode.cmd 'code --wait $MERGED'`,
    },
    {
      lang: "bash",
      caption: "Recover a deleted branch with unmerged commits",
      code: `# 'git branch -D' forcibly deletes, even if not merged.
git branch -D feature/lost-work

# Reflog has the tip commit:
git reflog | grep 'feature/lost-work'   # or scan for the SHA
#   7a3f9b2 HEAD@{5}: commit: last commit on feature/lost-work

# Recreate the branch at that SHA — done.
git switch -c feature/lost-work 7a3f9b2

# If reflog was expired/gc'd, search dangling commits:
git fsck --lost-found
#   dangling commit 7a3f9b2 ...
# Then recover as above.

# Always run 'git fsck' before 'git gc --prune=now' on a repo
# you might be losing data from — fsck lists unreachable objects.`,
    },
    {
      lang: "bash",
      caption: "Detect and fix a corrupt repo (fsck + repair)",
      code: `# Symptom: 'git status' errors with 'bad object', 'missing object',
# or 'error: object file ... is corrupt'.

git fsck --full                  # reports missing/corrupt objects
#   missing blob 7a3f9b2...
#   error: index file .git/index is corrupt

# Repair a corrupt index:
rm .git/index
git reset                        # rebuilds index from HEAD

# Recover a missing blob from another clone:
# (in the good clone)
git cat-file -p 7a3f9b2 > /tmp/blob
# (in the broken clone, after copying)
git hash-object -w /tmp/blob     # writes blob back to .git/objects/

# If .git/objects/pack/*.pack is corrupt:
git unpack-objects < /path/to/clean.pack   # re-import from a good copy

# Last resort: re-clone from a remote or backup, copy your working
# tree changes over, and recommit. Faster than fixing deep corruption.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Pack files delta-compress objects; a typical packed commit is ~200-500 bytes vs ~2KB loose. Repos grow slowly once packed.", tag: "perf" },
    { fact: "'git gc' runs automatically after ~6700 loose objects accumulate; 'git gc --aggressive' repacks everything but rarely helps perf.", tag: "perf" },
    { fact: "Shallow clone ('--depth 1') fetches only the latest commit — saves bandwidth and disk; use for CI build contexts and disposable clones.", tag: "perf" },
    { fact: "Partial clone ('--filter=blob:none') fetches tree+commit objects upfront, blobs on demand. Dramatic speedup for huge monorepos.", tag: "version" },
    { fact: "Sparse checkout lets you materialize only a subdirectory of a monorepo. Pair with partial clone for sub-10s clones of 100GB repos.", tag: "version" },
    { fact: "Bisect is O(log N) — finding one bad commit in 1000 takes ~10 steps; in 1M takes ~20. Always use 'bisect run' with a script.", tag: "complexity" },
    { fact: "'git status' on a 100k-file repo can take seconds; 'git status -uno' (skip untracked) is 10x faster for the 'are my tracked files dirty?' check.", tag: "perf" },
    { fact: "fsmonitor (2.37+) hooks git into the OS file watcher; subsequent 'git status' is sub-100ms even on huge repos. Enable: 'git config core.fsmonitor true'.", tag: "version" },
    { fact: "Commit-graph file (2.21+) speeds up 'git log --graph' and traversal by 2-10x. Auto-written by 'git gc'; force with 'git commit-graph write'.", tag: "version" },
    { fact: "Large files in git bloat history forever; use Git LFS which stores blobs out-of-band and replaces them with pointer files in the tree.", tag: "gotcha" },
    { fact: "Submodules are tracked as a commit SHA in the parent repo; they don't auto-update. Clone with '--recursive' or run 'submodule update --init'.", tag: "gotcha" },
    { fact: "Rebasing a branch with 100 commits replays each as a new commit; if conflicts arise at commit 50, you resolve them at every subsequent replay too.", tag: "complexity" },
    { fact: "Force-push with --force-with-lease is O(1) server-side (compare-and-swap on the ref); --force is unconditional and overwrites blindly.", tag: "perf" },
    { fact: "'git log -- <path>' is O(N) in commit count; 'git log --follow -- <path>' (renames) is O(N*M). Use 'git log -- <dir>' for fewer entries.", tag: "complexity" },
    { fact: "SHA-256 repos can't talk to SHA-1 repos; migration requires rehashing every object. Most teams stay on SHA-1 until tooling forces the switch.", tag: "version" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "GitHub", purpose: "Largest git host; PRs, Actions, Issues, Packages. The default for open source and most startups.", url: "https://github.com/", category: "build" },
    { tool: "GitLab", purpose: "Git host + CI/CD + container registry + IaC in one platform; self-hostable, popular in regulated industries.", url: "https://gitlab.com/", category: "build" },
    { tool: "Bitbucket", purpose: "Atlassian's git host; deep Jira integration. Common in enterprise shops already on Atlassian stack.", url: "https://bitbucket.org/", category: "build" },
    { tool: "Gitea / Forgejo", purpose: "Lightweight self-hostable git server (Go). Forgejo is a community fork of Gitea.", url: "https://about.gitea.com/", category: "deploy" },
    { tool: "git-filter-repo", purpose: "Fast, safe history rewriting — strip secrets, split repos, rewrite authors. Replaces filter-branch.", url: "https://github.com/newren/git-filter-repo", category: "debug" },
    { tool: "Git LFS", purpose: "Stores large binaries out-of-band; tree contains a pointer file. Replaces 'big files in git' antipattern.", url: "https://git-lfs.com/", category: "package" },
    { tool: "pre-commit", purpose: "Framework for managing and sharing git pre-commit hooks across languages; multi-language, declarative config.", url: "https://pre-commit.com/", category: "lint" },
    { tool: "husky", purpose: "JavaScript-friendly git hook manager; pairs with lint-staged to run hooks only on changed files.", url: "https://typicode.github.io/husky/", category: "lint" },
    { tool: "lazygit", purpose: "Terminal UI for git — interactive staging, rebase, cherry-pick, log navigation. The fastest way to use git interactively.", url: "https://github.com/jesseduffield/lazygit", category: "debug" },
    { tool: "tig", purpose: "ncurses-based git log explorer; lightweight, ships with most distros. Good for log/diff navigation.", url: "https://jonas.github.io/tig/", category: "debug" },
    { tool: "git-extras", purpose: "Useful extra commands: 'git undo', 'git fresh-branch', 'git summary', 'git effort'. Adds 60+ utilities.", url: "https://github.com/tj/git-extras", category: "build" },
    { tool: "GitKraken", purpose: "Cross-platform git GUI with branch graph visualization; free for public repos, paid for private.", url: "https://www.gitkraken.com/", category: "debug" },
    { tool: "Sourcegraph", purpose: "Code search across thousands of repos; understanding refs, callsites, cross-repo dependencies.", url: "https://sourcegraph.com/", category: "debug" },
    { tool: "Conventional Commits", purpose: "Specification for structured commit messages (feat:, fix:, chore:); enables automated changelogs + semver.", url: "https://www.conventionalcommits.org/", category: "style" },
    { tool: "semantic-release", purpose: "Automates version bumps + changelog + npm publish from conventional commits. No more 'what version is this?' meetings.", url: "https://semantic-release.gitbook.io/", category: "deploy" },
    { tool: "commitlint", purpose: "Lint commit messages against a convention (often Conventional Commits); blocks non-conformant commits.", url: "https://commitlint.js.org/", category: "lint" },
    { tool: "BFG Repo-Cleaner", purpose: "Faster alternative to filter-branch for removing large files or passwords from git history. Simple and fast.", url: "https://rtyley.github.io/bfg-repo-cleaner/", category: "debug" },
    { tool: "gh (GitHub CLI)", purpose: "Official GitHub CLI — open PRs, run Actions, manage releases from the terminal. Replaces the web UI for most flows.", url: "https://cli.github.com/", category: "build" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0",  year: 2005, highlight: "Initial release by Linus Torvalds (April 2005); designed for Linux kernel development speed." },
    { version: "1.5",  year: 2007, highlight: "Remote branch tracking refs, 'git remote' subcommand, interactive add, reflog as user-visible feature." },
    { version: "1.7",  year: 2010, highlight: "Sparse checkout, 'git submodule foreach', abbrev SHA in default log, --force-with-lease." },
    { version: "2.0",  year: 2014, highlight: "Push.default changed to 'simple' (safer); 'git tag --sort', pathspec magic :(top)." },
    { version: "2.5",  year: 2015, highlight: "Partial clone groundwork, 'git worktree', triangular workflows (push.default to upstream)." },
    { version: "2.13", year: 2017, highlight: "Conditional includes (includeIf), pathspec :(attr), better submodule URL handling." },
    { version: "2.15", year: 2017, highlight: "fsmonitor groundwork, 'git status' speedups, improved interactive rebase." },
    { version: "2.19", year: 2018, highlight: "'git switch' / 'git restore' introduced (split from overloaded 'checkout'); sparse-checkout improvements." },
    { version: "2.21", year: 2019, highlight: "Commit-graph file (faster log/traverse), SHA-256 repo format option (extensions.objectFormat)." },
    { version: "2.23", year: 2019, highlight: "'git switch' / 'git restore' stabilized as the recommended CLI for branch and file operations." },
    { version: "2.25", year: 2020, highlight: "Sparse-checkout rework (cone mode), 'git log --format' speedups, partial clone progress." },
    { version: "2.28", year: 2020, highlight: "init.defaultBranch configurable (defaults to 'master' until later releases); trace2 tracing framework." },
    { version: "2.30", year: 2020, highlight: "Partial clone + sparse-checkout maturation; configurable default branch name recommended as 'main'." },
    { version: "2.34", year: 2021, highlight: "SSH signing for commits (gpg.format=ssh); 2GB default pack size limit removed; multi-pack-index." },
    { version: "2.37", year: 2022, highlight: "FSMonitor (uses OS file watcher for instant 'git status'), sparse-index (sparse-checkout as default)." },
    { version: "2.38", year: 2022, highlight: "Scalar add-on for huge repos (Microsoft's VFS for Git successor); '--no-ff merges' on cherry-pick." },
    { version: "2.40", year: 2023, highlight: "Improvements to sparse-checkout, rebase backend default to 'merge', better SHA-256 interop." },
    { version: "2.43", year: 2023, highlight: "Configuration of 'advice.*' refinements, pathspec improvements, faster pack writes." },
    { version: "2.44", year: 2024, highlight: "Scalar promoted to a built-in; --recurse-submodules default for many commands; tracing improvements." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What's the difference between 'git reset' and 'git revert'?", a: "'reset' moves the current branch pointer to another commit, optionally updating index/working tree. It REWRITES history — never use on shared branches. 'revert' creates a NEW commit that undoes a previous one; history is preserved, safe for shared branches. Use reset for local cleanup, revert for undoing pushed changes.", difficulty: "easy" },
    { q: "Explain the difference between 'git merge' and 'git rebase'.", a: "Merge creates a merge commit with two parents, preserving the branch history exactly as it happened. Rebase replays your commits on top of the target branch, producing linear history with rewritten SHAs. Merge is safe for shared branches; rebase is for local cleanup before merging. Golden rule: never rebase commits that others have pulled.", difficulty: "medium" },
    { q: "What does 'git rebase -i' do that plain 'git rebase' doesn't?", a: "Interactive rebase opens an editor listing the commits to be replayed; you can mark each as pick, squash (combine into previous), fixup (squash + drop message), reword, edit (pause to amend), or drop. It's the standard tool for cleaning up WIP commits before opening a PR. Run against 'origin/main' to clean commits you haven't pushed yet.", difficulty: "medium" },
    { q: "How does git store data internally?", a: "Git is a content-addressable object store: blobs (file contents), trees (directory listings), commits (tree + parent + metadata), and tags. Each object is keyed by the SHA-1 (or SHA-256) of its content. Branches are just 41-byte files containing a SHA. Pack files delta-compress objects for storage efficiency. There are no diffs at the storage layer — each commit is a full snapshot, reconstructed by walking trees.", difficulty: "hard" },
    { q: "What's the reflog and why does it matter?", a: "The reflog is a per-ref, local-only append-only log of where each ref has pointed. It's how git recovers 'lost' commits after reset, rebase, branch -D, etc. Default retention: 90 days for reachable, 30 for unreachable. 'git reflog show HEAD' shows the history. The reflog is NOT shared across clones — it's a local safety net.", difficulty: "medium" },
    { q: "Why is 'git push --force' dangerous, and what should you use instead?", a: "Bare '--force' overwrites the remote ref unconditionally — if a teammate pushed commits you didn't fetch, they're lost (orphaned in their reflog only). '--force-with-lease' checks that the remote ref matches what you last fetched; it refuses to push if there are new commits. Use --force-with-lease for any force push; protect shared branches (main, develop) from force-push entirely.", difficulty: "easy" },
    { q: "How would you remove a large file accidentally committed to history?", a: "Use 'git filter-repo' (modern) or BFG Repo-Cleaner: 'git filter-repo --invert-paths --path bigfile.bin'. This rewrites every commit since the file was added, changing all SHAs. Force-push to remote; teammates must re-clone (their old branches won't merge cleanly). For prevention: pre-commit hook with file-size check + .gitignore.", difficulty: "medium" },
    { q: "What's a detached HEAD and how do you recover?", a: "Detached HEAD means HEAD points directly at a commit SHA instead of a branch ref. New commits you make aren't on any branch and will be garbage-collected after reflog expiry. Recover by creating a branch at the current position: 'git switch -c new-branch'. To avoid: never 'git checkout <sha>' for new work — use 'git switch -c branch <sha>'.", difficulty: "medium" },
    { q: "How does 'git bisect' work and when would you use it?", a: "Binary search through commit history to find the commit that introduced a bug. You give it a known-good and known-bad commit; git checks out the midpoint, you test it, mark 'good' or 'bad', repeat. O(log N) — 10 steps for 1000 commits. Automate with 'git bisect run <test-script>' which exits 0 (good) or non-zero (bad). Pair with a fast reproducer test for hands-off bisection.", difficulty: "medium" },
    { q: "How would you handle a merge conflict that recurs across rebases?", a: "Enable rerere (reuse recorded resolution): 'git config --global rerere.enabled true'. The first time you resolve a conflict, git remembers the resolution; if the same conflict appears (e.g., during a long-lived rebase), git auto-applies it. For ongoing maintenance branches, rerere saves hours. Also: squash the conflicting commits together first to reduce conflict surface.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Mercurial (hg)", whenThis: "Git when you want the broader ecosystem (GitHub, GitLab, every CI tool), immutable history as a feature, and cheap local branching.", whenThat: "Mercurial when you want a cleaner CLI, safer-by-default history (no force-push footgun), and your team values 'easy things easy' over git's flexibility." },
    { vs: "SVN", whenThis: "Git when you need offline work, cheap branching/merging, distributed workflows, or modern PR-based review.", whenThat: "SVN when you have large binary assets that don't delta well, need central authz on paths, or have a team trained on SVN that resists change." },
    { vs: "Perforce (Helix Core)", whenThis: "Git for source code, distributed teams, open-source collaboration, and modern dev workflows.", whenThat: "Perforce for game studios and teams with huge binary assets (art, audio), strict central locking requirements, and terabyte-scale repos." },
    { vs: "Fossil", whenThis: "Git when you want a separate issue tracker, wiki, and CI; when you want the massive ecosystem of git hosts and tooling.", whenThat: "Fossil for small self-hosted projects that want VCS + wiki + issues + chat in one SQLite-backed binary. Single-file repo, immutable history." },
    { vs: "Jujutsu (jj)", whenThis: "Git when you need maximum compatibility — every tool, every host, every tutorial is built on git.", whenThat: "Jujutsu when you want first-class commits-as-objects (auto-rebase), no index, conflicts as first-class state, and a git-compatible backend." },
  ],
};

export default sheet;
