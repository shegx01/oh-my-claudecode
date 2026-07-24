# Ralph token benchmark

Measures whether the repo-brief / diff-gating / reference-extraction changes
reduce ralph's token consumption. Two signals:

- **Deterministic floor** — a variance-free net token delta computed from the
  branch diff. No model or network. Must be net-positive.
- **Measured run** — real token totals summed from ralph transcript JSONLs,
  compared baseline vs post-change. Requires capturing live runs (manual; see
  below).

## Automatic commands

```
# Deterministic floor. Exits non-zero if not net-positive.
npx tsx benchmarks/ralph-token/run.ts --floor

# Sum one captured transcript.
npx tsx benchmarks/ralph-token/run.ts --transcript <transcript.jsonl>

# Unit tests (summation, floor, stats).
npx tsx benchmarks/ralph-token/token-summation.test.ts
```

## Measured run (manual)

Ralph is an interactive agent loop, not a callable function, so the transcript
capture is manual. Everything downstream of a JSONL (summation, stats, verdict)
is automatic.

Capture ≥5 runs on `main` and ≥5 on the branch (after `npm run build`):

1. Copy `prd.json` to the active ralph PRD path, then run ralph on the toy task
   in a fresh session:
   ```
   ralph implement the three helpers in benchmarks/ralph-token/fixtures/scratch per benchmarks/ralph-token/prd.json
   ```
   Keep the model fixed across runs. Let all three stories reach `passes: true`.
2. Grab the session transcript and save it:
   ```
   cp "$(ls -t ~/.claude/projects/*/*.jsonl | head -1)" benchmarks/ralph-token/captures/main-run-1.jsonl
   ```
3. Sanity-check it carries usage: `run.ts --transcript <file>` shows a non-zero total.
4. Emit the verdict:
   ```
   npx tsx benchmarks/ralph-token/run.ts \
     --baseline captures/main-run-*.jsonl \
     --post     captures/branch-run-*.jsonl
   ```

Only report a pass if the tool prints `OVERALL VERDICT: PASS`. Drop any run that
didn't complete all three stories — an incomplete run is not a valid sample.

## Scoring-model equivalence check (manual)

Confirms the sonnet deep-interview scorer stays close to opus. Run the same
scripted answer sequence through a deep-interview scored by opus, then by sonnet,
and compare: final ambiguity within ±3 points and round count within ±1. Report
the raw numbers; don't adjust the threshold to force a match.

## Verdict logic (`reporting.ts`)

- **Floor** (hard): net token delta must be positive; negative fails outright.
- **Measured pass**: post mean below `baseline mean − 1 stdev`, and every post
  run completed the task.
- **Inconclusive**: floor positive but the measured run didn't clear the noise
  band. Reported as such, never as a pass.

## Token source

`token-summation.ts` sums `input + output + cache_creation + cache_read` across
transcript records, using the same field names and numeric guard as
`src/hud/transcript.ts` (whose `parseTranscript()` it imports for a cross-check).
Source is the transcript JSONL, not the subagent tracker.

## Floor numbers

Per-CS char deltas in `deterministic-floor.ts` come from the branch diff. Recompute if the branch changes:

```
for f in agents/executor.md agents/git-master.md skills/ralph/SKILL.md \
         skills/deep-interview/SKILL.md skills/team/SKILL.md ; do
  echo "== $f =="
  git diff main -- "$f" | \
    awk '/^-[^-]/{del+=length($0)-1} /^\+[^+]/{add+=length($0)-1} END{print "removed="del" added="add" net_removed="del-add}'
done
```

Reference-extraction removals count: the moved text no longer loads on the prompt
hot path (it lives one hop away, on demand). Run `run.ts --floor` for the current total.
