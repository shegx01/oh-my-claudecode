---
name: autoresearch
description: Stateful single-mission improvement loop with strict evaluator contract, markdown decision logs, and max-runtime stop behavior
argument-hint: "[--mission-dir <path>] [--max-runtime <duration>] [--cron <spec>] [--resume <run-id>]"
level: 4
---

<Purpose>
Autoresearch is a stateful skill for bounded, evaluator-driven iterative improvement. It owns one mission at a time, keeps iterating through non-passing results, records each evaluation and decision as durable artifacts, and stops only when an explicit max-runtime ceiling or another explicit terminal condition is reached.
</Purpose>

<Use_When>
- You already have a mission and evaluator from `/deep-interview --autoresearch`
- You want persistent single-mission improvement with strict evaluation
- You need durable experiment logs under `.omc/autoresearch/`
- You want a supported path for periodic reruns via Claude Code native cron
</Use_When>

<Do_Not_Use_When>
- You need evaluator generation at runtime — use `/deep-interview --autoresearch` first
- You need multiple missions orchestrated together — v1 forbids that
- You want the deprecated `omc autoresearch` CLI flow — it is no longer authoritative
</Do_Not_Use_When>

<Contract>
- Single-mission only in v1
- Mission setup/evaluator generation stays in `deep-interview --autoresearch`
- Evaluator output must be structured JSON with a required boolean `pass` and an optional numeric `score`. When the mission opts into `keep_policy: quality_gated`, the evaluator must ALSO emit a `qualityGates` object (string → boolean); other keep policies ignore it and stay backward-compatible
- A functional-only evaluator is insufficient: iterating a loop against `pass` alone hill-climbs into passing-tests-via-accreting-hacks. Under `quality_gated`, the evaluator command itself asserts the gates — lint/type clean, complexity and size budgets, and **conformance to the mission's Design Decision Ledger + architectural invariants** (captured during `deep-interview --autoresearch`) — and reports each as a boolean in `qualityGates`. Each ledger constraint and each invariant maps to an **individually-named** gate (e.g. `result_type_used`, `no_switch_dispatch`, `domain_not_importing_infra`), never a single aggregate `ledger_conformance` a stub can rubber-stamp. The constraints are baked into the evaluator command; there is no separate frontmatter field for them. An iteration is kept only when `pass` is true AND every quality gate holds
- Best-state is the last kept commit. Under `quality_gated`, any candidate that fails a gate is discarded and the worktree is reset to the last kept commit (`decideAutoresearchOutcome` → `resetToLastKeptCommit`), so a gate regression can never be promoted; the run does not end in a worse gated state than the last kept one
- Non-passing iterations do **not** stop the run
- Stop conditions are explicit and bounded, with max-runtime as the primary strict stop hook. The supervisor may also stop early on a scored plateau — no best-state improvement over K consecutive kept-or-evaluated iterations (default K = 3) — by inspecting the iteration ledger; this is a supervisor-level stop, not a hard runtime timer
</Contract>

<Required_Artifacts>
Canonical persistent storage lives under `.omc/autoresearch/<mission-slug>/` and/or `.omc/logs/autoresearch/<run-id>/`.

Minimum required artifacts:
- mission spec
- evaluator script or command reference
- per-iteration evaluation JSON
- markdown decision logs

Recommended canonical shape:
```text
.omc/autoresearch/<mission-slug>/
  mission.md
  evaluator.json
  runs/<run-id>/
    evaluations/
      iteration-0001.json
      iteration-0002.json
    decision-log.md
```
Reuse existing runtime artifacts when available rather than duplicating them unnecessarily.
</Required_Artifacts>

<Workflow>
1. Confirm a single mission exists and evaluator setup is already available.
2. Ensure mode/state is active for `autoresearch` and records:
   - mission slug/dir
   - evaluator reference
   - iteration count
   - started/updated timestamps
   - explicit max-runtime or deadline
3. On every iteration:
   - run exactly one experiment/change cycle
   - run the evaluator
   - persist machine-readable evaluation JSON (including the `qualityGates` results)
   - under `quality_gated`: keep the iteration only if `pass` is true, all quality gates hold, and `score` improves on the last kept score; if any gate fails the runtime discards the candidate and resets to the last kept commit before continuing
   - append a human-readable markdown decision log entry recording the choice made and whether it conformed to the mission's Design Decision Ledger
   - continue even when evaluation does not pass
4. Stop when:
   - max-runtime ceiling is reached
   - the supervisor detects a scored plateau (no best-state improvement over K consecutive iterations; default K = 3) by inspecting the ledger
   - user explicitly cancels
   - another explicit terminal condition is recorded by the runtime
</Workflow>

<Cron_Integration>
Claude Code native cron is a supported integration point for periodic mission enhancement. In v1, prefer documenting/configuring cron inputs over building a large scheduler UI.

If cron is used:
- keep one mission per scheduled job
- preserve the same mission/evaluator contract
- append new run artifacts rather than overwriting prior experiments
</Cron_Integration>

<Execution_Policy>
- Do not hand execution back to `omc autoresearch`
- Do not create multi-mission orchestration
- Prefer reusing `src/autoresearch/*` runtime/schema helpers where they already match the stricter contract
- Keep logs useful to humans, not only machines
</Execution_Policy>
