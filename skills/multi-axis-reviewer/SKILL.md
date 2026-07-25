---
name: multi-axis-reviewer
description: Run the multi-axis critic panel on a change — 6-8 parallel review axes at full fidelity, consolidated into one severity-ranked verdict
---

Use this skill to run the multi-axis critic panel on demand, outside the
autopilot / team / ralph flows. It is a thin launcher: the real work is done by
the `multi-axis-reviewer` agent, which orchestrates one full `critic` pass per
review axis and consolidates the results.

## Goal
Give the user an on-demand, independent, multi-axis review of a change with a
single APPROVE / REQUEST-CHANGES / INCONCLUSIVE verdict.

## Workflow
1. Resolve the **change under review** from the user's arguments — a diff, a set
   of changed files, or a branch + base ref. If nothing was named, default to the
   current working diff against its merge-base. Determine the base ref yourself;
   never hardcode `main`.
2. Resolve the **correctness oracle** (spec / acceptance criteria) if the user
   supplied one (after a `--` separator, a linked issue, or a plan file). If none
   exists, proceed but note that spec-fidelity cannot be gated.
3. Launch the agent — do NOT perform the review inline:
   `Task(subagent_type="oh-my-claudecode:multi-axis-reviewer", ...)` with a brief
   that states the change, the base ref, and the spec.
4. Let the agent self-tier the axis count (6 lean / 8 for large or
   security-sensitive changes) unless the user asked for a specific count.

## Rules
- This is a separate reviewer pass — never approve authoring output produced in
  the same active context.
- Do not re-rank or soften the agent's severities or verdict; surface them verbatim.
- A missing or incomplete axis yields INCONCLUSIVE, never APPROVE.

## Output
Surface the agent's consolidated report to the user: the one-line verdict, the
axis summary table, and the severity-grouped findings.
