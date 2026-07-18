# ADR 0001 — Sandbox isolation via git worktrees (local-first, pluggable)

- **Status:** Accepted
- **Date:** 2026-07
- **Context day:** Day 5

## Context

The agent runs shell commands and edits files. Letting it do that directly in the user's
working tree is unsafe: a bad `run_command` or a wrong `edit_file` mutates real work with no
clean rollback. We need an isolation boundary where the agent can act freely, with the user
reviewing and accepting changes before they touch their tree.

The capstone brief suggests cloud devcontainers (E2B / Daytona). Those are excellent for hard
isolation but require an account, an API key, network, and per-run cost — a poor default for
local development and for anyone cloning the repo to try it.

## Decision

Define a single **`Sandbox` interface** (`src/sandbox/index.ts`) and ship a **local-first
adapter** as the default:

- **`WorktreeSandbox`** — a detached `git worktree` checked out at `HEAD` under
  `.agent/worktrees/<id>` (gitignored). The agent's tools run with their `cwd` set to the
  worktree, so edits and commands are contained. `apply()` lands the diff onto the real working
  tree; `discard()` resets the worktree; `dispose()` removes it.

A **cloud adapter** (`CloudSandbox`, E2B/Daytona) is stubbed behind the same interface so it can
drop in later without touching the agent loop or tools.

## Consequences

- **Free, offline, zero-setup** isolation that works anywhere git does.
- The sandbox starts from `HEAD`, so the agent works from a **clean committed base**, not the
  user's uncommitted changes. This is predictable but means in-flight local edits aren't visible
  to the agent (commit them first if they should be).
- `apply()` uses `git apply` against the working tree; overlapping local edits to the same lines
  can conflict. Acceptable for the common "clean base" case; a merge-based apply is a future option.
- Worktrees share the base `.git`, so they're cheap to create and tear down.

## Alternatives considered

- **Act directly in cwd, rely on `git diff`/reset** — simplest, but no real isolation and easy to
  clobber uncommitted work.
- **Cloud devcontainer as the default** — strongest isolation, but paywalled and offline-hostile;
  kept as the pluggable `CloudSandbox` adapter instead.
- **Container/chroot locally** — heavier and platform-specific; worktrees give most of the benefit
  for file/VCS safety with none of the setup.
