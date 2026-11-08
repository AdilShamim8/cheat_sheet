# Git

**Category:** Topics · **Tier:** Topic · **Tags:** vcs, distributed, dag, branching, collaboration, cli · **First released:** 2005 · **Author:** Linus Torvalds · **Last updated:** 2026-11

> A distributed version control system built on a content-addressable DAG of immutable snapshots — the de facto standard for source control.

---

## TL;DR

- Git is a distributed version control system whose model is a content-addressable DAG of immutable snapshots — not a series of diffs, despite the common mental model.
- The 80/20: every operation is a graph manipulation. Branches are movable pointers to commits, commits are immutable snapshots keyed by SHA, merges create merge commits, rebases replay commits onto new bases.
- Reach for it when coordinating changes across teams, when you need cheap local branching and offline work, or when integrating contributions from many committers into a shared trunk.
- Most confusion collapses to four distinctions: working tree vs index vs HEAD, local refs vs remote-tracking refs, fast-forward vs merge commit, and the reflog as the safety net you forget exists.

## Core Mental Model

**A content-addressable DAG of snapshots.** Each commit is a full snapshot of the tree, addressed by the SHA-1 of its content + parent SHAs + author + message. Branches are lightweight movable pointers (one file, 41 bytes); HEAD points to the current branch. The index (staging area) is the proposed next commit — a flat list of (path, blob-sha, mode) triples. The reflog is a local-only audit trail of where each ref has been; `git reflog` is how you recover work that 'disappeared' after a bad reset or rebase. `git reset` moves branch pointers; `git switch`/`checkout` moves HEAD; `git revert` adds a new commit that undoes another — it never rewrites history.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| git switch -c feature | Create and switch to a new branch — a 41-byte file in .git/refs/heads/. | Starting any new line of work; prefer `switch` over `checkout` (clearer intent since 2.23). |
| git merge --no-ff feature | Forces a merge commit even when fast-forward is possible; preserves branch topology. | Merging feature branches when you want history to show the branch existed. |
| git merge --ff-only feature | Refuses to merge unless fast-forward is possible — no merge commit created. | Pulling upstream changes into a local branch you haven't committed to. |
| git rebase main | Replays your branch commits on top of current main, rewriting their SHAs. | Before merging a long-lived branch; never on commits already pushed and shared. |
| git rebase -i HEAD~5 | Interactive rebase — squash, reorder, reword, or drop the last 5 commits. | Cleaning up WIP commits before opening a PR. |
| git cherry-pick <sha> | Applies a single commit's diff as a new commit on the current branch. | Backporting a fix to a release branch; pulling one commit out of a stale PR. |
| git reflog | Shows the local history of where HEAD and branches have pointed — including 'lost' commits. | Recovering from a botched reset, rebase, or branch delete; this is your undo. |
| git worktree add ../proj-hotfix main | Checks out a second branch in a sibling directory, sharing the same .git. | Working on two branches simultaneously without stashing or cloning twice. |
| git stash push -m 'wip' | Saves uncommitted changes to a stack and restores a clean working tree. | Quick context switch; prefer a WIP commit or worktree for anything longer than minutes. |
| git bisect start | Binary search through commit history to find the commit that introduced a bug. | A regression appeared and `git blame` isn't enough; pair with `bisect run` for automated testing. |
| git revert <sha> | Creates a new commit that undoes the changes of <sha> — safe for shared history. | Reverting a bad commit on main; the only safe 'undo' on pushed branches. |
| git log -S'function_name' --all | Pickaxe search — finds commits that added or removed a specific string across all branches. | Tracing when a function, constant, or bug string first appeared or was removed. |

## Idiomatic Patterns

**Feature branch workflow with rebase before merge**

```bash
# Start work from a current main
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
git push origin --delete feat/payment-retry
```

**Recover a deleted branch via reflog — the safety net**

```bash
# Oops: deleted a branch with unmerged work
git branch -D feat/lost-work

# Reflog shows where HEAD has been — find the SHA before the delete
git reflog
# 7a3f9b2 HEAD@{0}: commit: fix retry logic
# 8c1d4e7 HEAD@{1}: checkout: moving from feat/lost-work to main
# ↑ 7a3f9b2 is the tip of the 'lost' branch

# Recreate the branch at that SHA
git switch -c feat/lost-work 7a3f9b2

# Reflog entries live for 90 days (reachable) or 30 days (unreachable)
# by default — gc.reflogExpire / gc.reflogExpireUnreachable tune this.
```

**Interactive rebase to squash WIP commits**

```bash
# You pushed 6 messy commits; PR should have 1 clean one
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
git push --force-with-lease
```

**Bisect to find the commit that introduced a regression**

```bash
# Bug exists in HEAD; was fine at v1.4.0 release
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
git bisect reset
```

## Common Pitfalls

1. **Detached HEAD after checking out a commit SHA** — *Symptom:* `git checkout <sha>` (or a tag) puts you in detached HEAD — new commits aren't on any branch and get garbage-collected after a while. *Fix:* Always create a branch first: `git switch -c new-branch <sha>`. If you're already detached and have commits, run `git branch save-branch` before switching away to preserve them.
2. **`git push --force` overwriting teammates' work** — *Symptom:* Force-pushing a shared branch rewrites history; teammates who pulled the old version now have conflicts they can't resolve cleanly, and lost commits can be unrecoverable. *Fix:* Use `git push --force-with-lease` — it refuses to push if the remote has new commits you haven't fetched. Never force-push to shared branches (main, develop). Protect them in your repo settings.
3. **Rebasing commits that others have already pulled** — *Symptom:* Rebase rewrites commit SHAs; anyone who based work on the old SHAs now has divergent history that's painful to reconcile, with duplicate commits appearing in merges. *Fix:* Golden rule: never rebase shared commits. Rebase only your own feature branches before merging into shared trunks. If you must rewrite shared history, coordinate with all contributors first.
4. **`.gitignore` doesn't untrack already-tracked files** — *Symptom:* You add `node_modules/` to .gitignore but it's still in the repo — gitignore only affects untracked files. *Fix:* `git rm --cached <path>` to untrack without deleting locally, then commit. For directories: `git rm -r --cached node_modules/`.
5. **Stash conflicts on pop** — *Symptom:* After weeks of work, `git stash pop` fails with merge conflicts and you can't tell what's yours vs the stash's. *Fix:* Pop into a clean working tree only; if it conflicts, resolve like any merge. Better: avoid long-lived stashes — use a WIP commit on a temp branch instead, which gives you full diff tooling.
6. **CRLF/LF line-ending mismatches across OS** — *Symptom:* Files show as modified on Windows that aren't on macOS/Linux; PRs contain spurious whitespace-only diffs. *Fix:* Set `git config --global core.autocrlf input` on macOS/Linux and `true` on Windows, and commit a `.gitattributes` file specifying `* text=auto eol=lf` per repo — this is the only reliable cross-platform fix.
7. **`git pull` doing a merge by default creates messy history** — *Symptom:* Every pull from a remote with new commits creates a merge commit, producing a noisy 'diamond' history that's hard to read and bisect. *Fix:* Set `git config --global pull.rebase true` (or `ff-only`) to fast-forward or rebase instead of merge. Inspect with `git log --graph --oneline` to verify.

## Production / Interview Quick Reference

- Git 2.56 (Sep 2026) is current — Rust support on by default (since 2.55) and mandatory in the planned Git 3.0. `version`
- Objects are addressed by SHA-1 (160-bit); migration to SHA-256 is in progress via `git config extensions.objectFormat sha256`. `version`
- Default branch was renamed master → main in 2020 (GitHub default since Oct 2020). Configure per-repo via `git init -b main`. `version`
- Reflog retention: 90 days for reachable refs, 30 days for unreachable (gc.reflogExpire / gc.reflogExpireUnreachable). `gotcha`
- `git gc` runs automatically after ~6700 loose objects accumulate; `git gc --aggressive` repacks everything but rarely helps perf. `perf`
- Pack files delta-compress objects; a typical packed commit is ~200-500 bytes. Repos grow slowly once packed. `perf`
- Shallow clone (`--depth 1`) fetches only the latest commit — saves bandwidth and disk; use for CI build contexts. `perf`
- Hooks are client-side by default (.git/hooks/) and not enforced across clones; use server-side (pre-receive, update) for policy. `gotcha`
- `git fsck` verifies object integrity and reports missing/dangling objects; run before any destructive operation on a repo. `gotcha`
- Filter-branch is deprecated; use `git filter-repo` (Python tool) for history rewriting — it's faster and safer. `version`
- `git blame` shows last-modifying commit per line; `git log -L :func:file.ts` shows the history of a function across renames. `style`
- Merge commits have 2+ parents; regular commits have 1; root commits have 0. `git cat-file -p <sha>` reveals the structure. `complexity`
- Bisect is O(log N) — finding one bad commit in 1000 takes ~10 steps; in 1M takes ~20. `complexity`
- Submodules are tracked as a commit SHA in the parent repo — they don't auto-update; use `git submodule update --init --recursive`. `gotcha`
- Conventional commit messages (feat:, fix:, chore:, etc.) enable automated changelogs and semantic versioning. `style`
- Signed commits (`git commit -S`) use GPG/SSH keys; `--signoff` adds a Developer Certificate of Origin line — different things. `style`

## Go Deeper

- [Pro Git (Scott Chacon, Ben Straub)](https://git-scm.com/book/en/v2) — The official free book; chapters 7 (tools) and 10 (internals) are the highest-signal material on Git anywhere.
- [git-rebase(1) manual](https://git-scm.com/docs/git-rebase) — Definitive reference for rebase, including --interactive, --onto, and --rebase-merges modes.
- [gitworkflows(7) manual](https://git-scm.com/docs/gitworkflows) — Linus's own description of the topic-branch and maintainer workflows used on the Linux kernel.
- [Think Like a Git (Sam Livingston-Gray)](http://think-like-a-git.net/) — Best treatment of Git as graph theory — explains why rebase, cherry-pick, and revert behave the way they do.
- [Git from the Bottom Up (John Wiegley)](https://jwiegley.github.io/git-from-the-bottom-up/) — Walks the object model from plumbing up — the only way to truly internalize the DAG.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| blob | Content-addressed storage of a file's bytes (zlib-compressed). Keyed by SHA-1 of 'blob <len>\0<content>'. Stores NO filename, NO mode. | Inspecting via 'git cat-file -p <sha>'. Same content always produces the same blob SHA across repos. |
| tree | Directory listing: list of (mode, name, blob-or-tree-sha) entries. Represents one folder's contents at one commit. | 'git cat-file -p <tree-sha>' shows entries. Trees are how git reconstructs a snapshot. |
| commit | Immutable record: tree-sha + parent-sha(s) + author/committer + message + timestamp. Keyed by SHA-1 of the formatted text. | The unit of history. Merge commits have 2+ parents; root commits have 0. |
| tag (lightweight) | A ref pointing directly at a commit (a 41-byte file under .git/refs/tags/). No metadata of its own. | Quick labels; CI build tags. Use annotated tags for releases — they carry metadata + signature. |
| tag (annotated) | A full git object (like a commit) stored in objects/ — points at a commit, has tagger + message + optional GPG signature. | Releases (v1.2.3). Annotated tags are immutable objects; lightweight tags are just movable refs. |
| pack object | Delta-compressed object stored inside a .pack file; the base + delta chain reconstructs any version. Created by 'git gc' / 'git repack'. | Default storage after a clone or gc. A typical packed commit is ~200-500 bytes vs ~2KB loose. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| branch (refs/heads/<name>) | A movable pointer to a commit. Moving it is O(1) — just rewrite a 41-byte file. | Default unit of work. 'git switch' moves HEAD between branches; commits advance the current branch. |
| remote-tracking (refs/remotes/<remote>/<branch>) | Local cache of where a remote branch pointed at last fetch. Updated ONLY by fetch/push, never by local commits. | Inspecting 'where is origin/main?' without a network round-trip. 'git status' compares HEAD vs upstream. |
| HEAD | Symbolic ref to the current branch (e.g., 'ref: refs/heads/main'). Detached HEAD points directly at a commit SHA. | Git reads HEAD to know what to commit on top of. 'git symbolic-ref HEAD' shows the target. |
| ORIG_HEAD, CHERRY_PICK_HEAD, MERGE_HEAD | Special refs git writes during/after risky ops so you can recover or reference the pre-op state. | ORIG_HEAD = state before merge/rebase/reset. MERGE_HEAD = the commit being merged in. Useful for scripts. |
| stash (refs/stash) | A reflog of stacked WIP commits. Each stash is actually a merge of index + working-tree commits. | 'git stash list' shows the stack. The reflog holds the history; drop only with 'stash drop'. |
| reflog (logs/refs/...) | Per-ref append-only log of where each ref has pointed. NOT shared across clones — local-only undo. | Your safety net after reset/rebase/branch-delete. 'git reflog show <ref>' to inspect. |
| notes (refs/notes/commits) | Extra metadata attached to existing commits without rewriting them. Stored as a tree of blobs keyed by commit SHA. | Adding CI build URLs, sign-off, or review comments to commits you can't rewrite. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| core.repositoryformatversion | Repo format version. 0 = classic SHA-1; 1 enables extensions.objectFormat for SHA-256. | Migration to SHA-256 requires version 1 + extensions.objectFormat=sha256. |
| core.autocrlf | Controls CRLF↔LF conversion on checkout/commit. 'input' = convert to LF on commit, leave alone on checkout. | Cross-platform line-endings. Set 'input' on Mac/Linux, 'true' on Windows; prefer .gitattributes instead. |
| core.excludesfile | Global gitignore applied to all repos. Useful for editor scratch files (.DS_Store, *.swp, IDE dirs). | Set once: 'git config --global core.excludesfile ~/.gitignore_global'. |
| pull.rebase | When true, 'git pull' runs 'git pull --rebase' instead of creating merge commits. Per-branch via branch.<name>.rebase. | Set globally for clean linear history: 'git config --global pull.rebase true'. |
| rerere.enabled | Reuse Recorded Resolution — git remembers how you resolved a conflict and auto-applies the same resolution next time. | Long-lived rebases (e.g., maintaining a fork). 'git config --global rerere.enabled true'. |
| init.defaultBranch | Branch name used by 'git init' and 'git init -b'. Defaults to 'master' on old git, 'main' on modern installs. | Set globally: 'git config --global init.defaultBranch main'. |
| commit.gpgsign / gpg.format | Auto-sign commits with GPG or SSH keys. 'gpg.format=ssh' uses your SSH key (git 2.34+). | Releases and audited repos. GitHub shows 'Verified' badge on signed commits. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| git rebase vs merge | Rebase rewrites history linearly; merge preserves topology with a commit. | Rebase local WIP; merge to main (or squash) — agree per team and codify in settings. |
| git reset --soft/--mixed/--hard | Moves HEAD; keeps index+tree / keeps tree / nukes everything. | --soft to re-commit; --hard only when the work is truly disposable (reflog saves most mistakes). |
| ^ vs ~ (parent navigation) | HEAD~2 = two first-parents back; HEAD^2 = the second parent of a merge. | Rebase onto the right fork point; inspect merges precisely. |

## Input / Output

**Pipes in / out — git as a Unix citizen**

```bash
# Read commit log on stdin, write processed output to stdout
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
git archive --format=tar HEAD | gzip > release.tar.gz
```

**Hooks — server-side policy and client-side automation**

```bash
# Hooks live in .git/hooks/ (client-side) or hooks/ on a bare server.
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
# Reads ref updates from stdin; exit non-zero to reject the ENTIRE push.
```

**Plumbing commands — script git like a database**

```bash
# Write a blob directly, get its SHA
SHA=$(echo "file contents" | git hash-object -w --stdin)

# Write a tree referencing that blob at path "hello.txt"
TREE_SHA=$(printf '100644 hello.txt\0%s' "$(echo $SHA | xxd -r -p)" |
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
git cat-file --batch-all-objects --batch-check
```

**stdin to commit message — pipes from other tools**

```bash
# Read commit message from stdin (no editor opens)
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
echo "better message" | git commit --amend -F -
```

## Loops & Iteration

**Branch sweeps: iterate refs like data**

```bash
git for-each-ref --sort=-committerdate refs/heads/   --format="%(committerdate:short) %(authorname) %(refname:short)"

git branch --merged main | grep -v main | while read -r b; do
  git branch -d "$b"
done
```

## Functions & Callables

**Git aliases as composable functions**

```bash
# ~/.gitconfig
[alias]
  lg = log --graph --oneline --decorate -20
  undo = reset --soft HEAD~1
  sync = !git fetch origin && git rebase origin/main

gpr() { git sync && git push --force-with-lease; }
```

## Error Handling

**Recover from a botched reset / rebase via reflog**

```bash
# You ran 'git reset --hard HEAD~3' and realized you lost work.
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
git gc --prune=now                     # deletes unreachable objects
```

**Resolve a messy merge conflict — the systematic method**

```bash
# Conflicts during a rebase. Don't panic — every step is recoverable.

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
#   git config --global mergetool.vscode.cmd 'code --wait $MERGED'
```

**Recover a deleted branch with unmerged commits**

```bash
# 'git branch -D' forcibly deletes, even if not merged.
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
# you might be losing data from — fsck lists unreachable objects.
```

**Detect and fix a corrupt repo (fsck + repair)**

```bash
# Symptom: 'git status' errors with 'bad object', 'missing object',
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
# tree changes over, and recommit. Faster than fixing deep corruption.
```

## Concurrency Model

**Worktrees: parallel branches without stash dances**

```bash
git worktree add ../hotfix hotfix-branch
cd ../hotfix && git commit -am "fix"
cd - && git worktree remove ../hotfix
```

## Testing Patterns

**Git bisect: binary-search the regression**

```bash
git bisect start HEAD v2.3.0
git bisect run bun test tests/e2e/checkout.spec.ts
git bisect reset

# Hygiene gates that keep history bisectable:
#   pre-commit: lint + format + secret-scan on staged files
#   CI merge queue: every PR validated against latest main
```

## Performance Tuning

- Pack files delta-compress objects; a typical packed commit is ~200-500 bytes vs ~2KB loose. Repos grow slowly once packed.
- 'git gc' runs automatically after ~6700 loose objects accumulate; 'git gc --aggressive' repacks everything but rarely helps perf.
- Shallow clone ('--depth 1') fetches only the latest commit — saves bandwidth and disk; use for CI build contexts and disposable clones.
- Partial clone ('--filter=blob:none') fetches tree+commit objects upfront, blobs on demand. Dramatic speedup for huge monorepos.
- Sparse checkout lets you materialize only a subdirectory of a monorepo. Pair with partial clone for sub-10s clones of 100GB repos.
- Bisect is O(log N) — finding one bad commit in 1000 takes ~10 steps; in 1M takes ~20. Always use 'bisect run' with a script.
- 'git status' on a 100k-file repo can take seconds; 'git status -uno' (skip untracked) is 10x faster for the 'are my tracked files dirty?' check.
- fsmonitor (2.37+) hooks git into the OS file watcher; subsequent 'git status' is sub-100ms even on huge repos. Enable: 'git config core.fsmonitor true'.
- Commit-graph file (2.21+) speeds up 'git log --graph' and traversal by 2-10x. Auto-written by 'git gc'; force with 'git commit-graph write'.
- Large files in git bloat history forever; use Git LFS which stores blobs out-of-band and replaces them with pointer files in the tree.
- Submodules are tracked as a commit SHA in the parent repo; they don't auto-update. Clone with '--recursive' or run 'submodule update --init'.
- Rebasing a branch with 100 commits replays each as a new commit; if conflicts arise at commit 50, you resolve them at every subsequent replay too.
- Force-push with --force-with-lease is O(1) server-side (compare-and-swap on the ref); --force is unconditional and overwrites blindly.
- 'git log -- <path>' is O(N) in commit count; 'git log --follow -- <path>' (renames) is O(N*M). Use 'git log -- <dir>' for fewer entries.
- SHA-256 repos can't talk to SHA-1 repos; migration requires rehashing every object. Most teams stay on SHA-1 until tooling forces the switch.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [GitHub](https://github.com/) | Largest git host; PRs, Actions, Issues, Packages. The default for open source and most startups. | build |
| [GitLab](https://gitlab.com/) | Git host + CI/CD + container registry + IaC in one platform; self-hostable, popular in regulated industries. | build |
| [Bitbucket](https://bitbucket.org/) | Atlassian's git host; deep Jira integration. Common in enterprise shops already on Atlassian stack. | build |
| [Gitea / Forgejo](https://about.gitea.com/) | Lightweight self-hostable git server (Go). Forgejo is a community fork of Gitea. | deploy |
| [git-filter-repo](https://github.com/newren/git-filter-repo) | Fast, safe history rewriting — strip secrets, split repos, rewrite authors. Replaces filter-branch. | debug |
| [Git LFS](https://git-lfs.com/) | Stores large binaries out-of-band; tree contains a pointer file. Replaces 'big files in git' antipattern. | package |
| [pre-commit](https://pre-commit.com/) | Framework for managing and sharing git pre-commit hooks across languages; multi-language, declarative config. | lint |
| [husky](https://typicode.github.io/husky/) | JavaScript-friendly git hook manager; pairs with lint-staged to run hooks only on changed files. | lint |
| [lazygit](https://github.com/jesseduffield/lazygit) | Terminal UI for git — interactive staging, rebase, cherry-pick, log navigation. The fastest way to use git interactively. | debug |
| [tig](https://jonas.github.io/tig/) | ncurses-based git log explorer; lightweight, ships with most distros. Good for log/diff navigation. | debug |
| [git-extras](https://github.com/tj/git-extras) | Useful extra commands: 'git undo', 'git fresh-branch', 'git summary', 'git effort'. Adds 60+ utilities. | build |
| [GitKraken](https://www.gitkraken.com/) | Cross-platform git GUI with branch graph visualization; free for public repos, paid for private. | debug |
| [Sourcegraph](https://sourcegraph.com/) | Code search across thousands of repos; understanding refs, callsites, cross-repo dependencies. | debug |
| [Conventional Commits](https://www.conventionalcommits.org/) | Specification for structured commit messages (feat:, fix:, chore:); enables automated changelogs + semver. | style |
| [semantic-release](https://semantic-release.gitbook.io/) | Automates version bumps + changelog + npm publish from conventional commits. No more 'what version is this?' meetings. | deploy |
| [commitlint](https://commitlint.js.org/) | Lint commit messages against a convention (often Conventional Commits); blocks non-conformant commits. | lint |
| [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) | Faster alternative to filter-branch for removing large files or passwords from git history. Simple and fast. | debug |
| [gh (GitHub CLI)](https://cli.github.com/) | Official GitHub CLI — open PRs, run Actions, manage releases from the terminal. Replaces the web UI for most flows. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 2005 | Initial release by Linus Torvalds (April 2005); designed for Linux kernel development speed. |
| 1.5 | 2007 | Remote branch tracking refs, 'git remote' subcommand, interactive add, reflog as user-visible feature. |
| 1.7 | 2010 | Sparse checkout, 'git submodule foreach', abbrev SHA in default log, --force-with-lease. |
| 2.0 | 2014 | Push.default changed to 'simple' (safer); 'git tag --sort', pathspec magic :(top). |
| 2.5 | 2015 | Partial clone groundwork, 'git worktree', triangular workflows (push.default to upstream). |
| 2.13 | 2017 | Conditional includes (includeIf), pathspec :(attr), better submodule URL handling. |
| 2.15 | 2017 | fsmonitor groundwork, 'git status' speedups, improved interactive rebase. |
| 2.19 | 2018 | 'git switch' / 'git restore' introduced (split from overloaded 'checkout'); sparse-checkout improvements. |
| 2.21 | 2019 | Commit-graph file (faster log/traverse), SHA-256 repo format option (extensions.objectFormat). |
| 2.23 | 2019 | 'git switch' / 'git restore' stabilized as the recommended CLI for branch and file operations. |
| 2.25 | 2020 | Sparse-checkout rework (cone mode), 'git log --format' speedups, partial clone progress. |
| 2.28 | 2020 | init.defaultBranch configurable (defaults to 'master' until later releases); trace2 tracing framework. |
| 2.30 | 2020 | Partial clone + sparse-checkout maturation; configurable default branch name recommended as 'main'. |
| 2.34 | 2021 | SSH signing for commits (gpg.format=ssh); 2GB default pack size limit removed; multi-pack-index. |
| 2.37 | 2022 | FSMonitor (uses OS file watcher for instant 'git status'), sparse-index (sparse-checkout as default). |
| 2.38 | 2022 | Scalar add-on for huge repos (Microsoft's VFS for Git successor); '--no-ff merges' on cherry-pick. |
| 2.40 | 2023 | Improvements to sparse-checkout, rebase backend default to 'merge', better SHA-256 interop. |
| 2.43 | 2023 | Configuration of 'advice.*' refinements, pathspec improvements, faster pack writes. |
| 2.44 | 2024 | Scalar promoted to a built-in; --recurse-submodules default for many commands; tracing improvements. |
| 2.56 | 2026 | Current line: `git refs` create/delete/update subcommands, experimental `git history drop`, O(n²)→O(n log n) untracked-file speedup, Rust support on by default (since 2.55; mandatory in Git 3.0). |

## Interview Hot Questions

1. **What's the difference between 'git reset' and 'git revert'?** *(easy)*

   'reset' moves the current branch pointer to another commit, optionally updating index/working tree. It REWRITES history — never use on shared branches. 'revert' creates a NEW commit that undoes a previous one; history is preserved, safe for shared branches. Use reset for local cleanup, revert for undoing pushed changes.

2. **Explain the difference between 'git merge' and 'git rebase'.** *(medium)*

   Merge creates a merge commit with two parents, preserving the branch history exactly as it happened. Rebase replays your commits on top of the target branch, producing linear history with rewritten SHAs. Merge is safe for shared branches; rebase is for local cleanup before merging. Golden rule: never rebase commits that others have pulled.

3. **What does 'git rebase -i' do that plain 'git rebase' doesn't?** *(medium)*

   Interactive rebase opens an editor listing the commits to be replayed; you can mark each as pick, squash (combine into previous), fixup (squash + drop message), reword, edit (pause to amend), or drop. It's the standard tool for cleaning up WIP commits before opening a PR. Run against 'origin/main' to clean commits you haven't pushed yet.

4. **How does git store data internally?** *(hard)*

   Git is a content-addressable object store: blobs (file contents), trees (directory listings), commits (tree + parent + metadata), and tags. Each object is keyed by the SHA-1 (or SHA-256) of its content. Branches are just 41-byte files containing a SHA. Pack files delta-compress objects for storage efficiency. There are no diffs at the storage layer — each commit is a full snapshot, reconstructed by walking trees.

5. **What's the reflog and why does it matter?** *(medium)*

   The reflog is a per-ref, local-only append-only log of where each ref has pointed. It's how git recovers 'lost' commits after reset, rebase, branch -D, etc. Default retention: 90 days for reachable, 30 for unreachable. 'git reflog show HEAD' shows the history. The reflog is NOT shared across clones — it's a local safety net.

6. **Why is 'git push --force' dangerous, and what should you use instead?** *(easy)*

   Bare '--force' overwrites the remote ref unconditionally — if a teammate pushed commits you didn't fetch, they're lost (orphaned in their reflog only). '--force-with-lease' checks that the remote ref matches what you last fetched; it refuses to push if there are new commits. Use --force-with-lease for any force push; protect shared branches (main, develop) from force-push entirely.

7. **How would you remove a large file accidentally committed to history?** *(medium)*

   Use 'git filter-repo' (modern) or BFG Repo-Cleaner: 'git filter-repo --invert-paths --path bigfile.bin'. This rewrites every commit since the file was added, changing all SHAs. Force-push to remote; teammates must re-clone (their old branches won't merge cleanly). For prevention: pre-commit hook with file-size check + .gitignore.

8. **What's a detached HEAD and how do you recover?** *(medium)*

   Detached HEAD means HEAD points directly at a commit SHA instead of a branch ref. New commits you make aren't on any branch and will be garbage-collected after reflog expiry. Recover by creating a branch at the current position: 'git switch -c new-branch'. To avoid: never 'git checkout <sha>' for new work — use 'git switch -c branch <sha>'.

9. **How does 'git bisect' work and when would you use it?** *(medium)*

   Binary search through commit history to find the commit that introduced a bug. You give it a known-good and known-bad commit; git checks out the midpoint, you test it, mark 'good' or 'bad', repeat. O(log N) — 10 steps for 1000 commits. Automate with 'git bisect run <test-script>' which exits 0 (good) or non-zero (bad). Pair with a fast reproducer test for hands-off bisection.

10. **How would you handle a merge conflict that recurs across rebases?** *(hard)*

   Enable rerere (reuse recorded resolution): 'git config --global rerere.enabled true'. The first time you resolve a conflict, git remembers the resolution; if the same conflict appears (e.g., during a long-lived rebase), git auto-applies it. For ongoing maintenance branches, rerere saves hours. Also: squash the conflicting commits together first to reduce conflict surface.

## When to Choose This

- **vs Mercurial (hg):** use this — Git when you want the broader ecosystem (GitHub, GitLab, every CI tool), immutable history as a feature, and cheap local branching.; use that — Mercurial when you want a cleaner CLI, safer-by-default history (no force-push footgun), and your team values 'easy things easy' over git's flexibility.
- **vs SVN:** use this — Git when you need offline work, cheap branching/merging, distributed workflows, or modern PR-based review.; use that — SVN when you have large binary assets that don't delta well, need central authz on paths, or have a team trained on SVN that resists change.
- **vs Perforce (Helix Core):** use this — Git for source code, distributed teams, open-source collaboration, and modern dev workflows.; use that — Perforce for game studios and teams with huge binary assets (art, audio), strict central locking requirements, and terabyte-scale repos.
- **vs Fossil:** use this — Git when you want a separate issue tracker, wiki, and CI; when you want the massive ecosystem of git hosts and tooling.; use that — Fossil for small self-hosted projects that want VCS + wiki + issues + chat in one SQLite-backed binary. Single-file repo, immutable history.
- **vs Jujutsu (jj):** use this — Git when you need maximum compatibility — every tool, every host, every tutorial is built on git.; use that — Jujutsu when you want first-class commits-as-objects (auto-rebase), no index, conflicts as first-class state, and a git-compatible backend.

