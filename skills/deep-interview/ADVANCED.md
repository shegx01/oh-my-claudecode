# deep-interview: Advanced Reference

Advanced score interpretation, integration notes, and pipeline details for the `deep-interview` skill. Configuration settings are documented in `SKILL.md` under `## Configuration`.

## Resume

If interrupted, run `/deep-interview` again. The skill reads state from `.omc/state/deep-interview-state.json` and resumes from the last completed round.

## Integration with Autopilot

When autopilot receives a vague input (no file paths, function names, or concrete anchors), it can redirect to deep-interview:

```
User: "autopilot build me a thing"
Autopilot: "Your request is quite open-ended. Would you like to run a deep interview first to clarify requirements?"
  [Yes, interview first] [No, expand directly]
```

If the user chooses interview, autopilot invokes `/deep-interview`. When the interview completes and the user selects "Execute with autopilot", the spec becomes Phase 0 output and autopilot continues from Phase 1 (Planning).

## Approval-Gated Pipeline: deep-interview → omc-plan → pending approval

The recommended refinement path chains clarity and feasibility gates, then stops for explicit execution approval:

```
/deep-interview "vague idea"
  → Socratic Q&A until ambiguity ≤ <resolvedThresholdPercent>
  → Spec written to .omc/specs/deep-interview-{slug}.md
  → User explicitly selects "Refine with omc-plan consensus"
  → /omc-plan --consensus --direct (spec as input, skip interview)
    → Planner creates implementation plan from spec
    → Architect reviews for architectural soundness
    → Critic validates quality and testability
    → Loop until consensus (max 5 iterations)
    → Consensus plan written to .omc/plans/
  → Stop with the consensus plan marked pending approval
  → Only a separate explicit execution approval may invoke team/ralph/autopilot
```

**The omc-plan skill receives the spec with `--consensus --direct` flags** because the deep interview already did the requirements gathering. The `--direct` flag (supported by the omc-plan skill, which ralplan aliases) skips the interview phase and goes straight to Planner → Architect → Critic consensus. The consensus plan includes:
- RALPLAN-DR summary (Principles, Decision Drivers, Options)
- ADR (Decision, Drivers, Alternatives, Why chosen, Consequences)
- Testable acceptance criteria (inherited from deep-interview spec)
- Implementation steps with file references

**Execution is a separate approval-gated step.** The deep-interview and omc-plan skills must not auto-invoke autopilot, team, ralph, or any other execution skill merely because a spec or plan exists.

## Integration with Ralplan Gate

The ralplan pre-execution gate already redirects vague prompts to planning. Deep interview can serve as an alternative redirect target for prompts that are too vague even for ralplan:

```
Vague prompt → ralplan gate → deep-interview (if extremely vague) → omc-plan (with clear spec) → pending approval → explicitly approved execution
```

## Brownfield vs Greenfield Weights

| Dimension | Greenfield | Brownfield |
|-----------|-----------|------------|
| Goal Clarity | 40% | 35% |
| Constraint Clarity | 30% | 25% |
| Success Criteria | 30% | 25% |
| Context Clarity | N/A | 15% |

Brownfield adds Context Clarity because modifying existing code safely requires understanding the system being changed.

## Challenge Agent Modes

| Mode | Activates | Purpose | Prompt Injection |
|------|-----------|---------|-----------------|
| Contrarian | Round 4+ | Challenge assumptions | "What if the opposite were true?" |
| Simplifier | Round 6+ | Remove complexity | "What's the simplest version?" |
| Ontologist | Round 8+ (if ambiguity > 0.3) | Find essence | "What IS this, really?" |

Each mode is used exactly once, then normal Socratic questioning resumes. Modes are tracked in state to prevent repetition.

## Ambiguity Score Interpretation

| Score Range | Meaning | Action |
|-------------|---------|--------|
| 0.0 - 0.1 | Crystal clear | Proceed immediately |
| At or below the resolved threshold | Clear enough | Proceed |
| Above the resolved threshold with minor gaps | Some gaps | Continue interviewing |
| Moderate ambiguity | Significant gaps | Focus on weakest dimensions |
| High ambiguity | Very unclear | May need reframing (Ontologist) |
| Extreme ambiguity | Almost nothing known | Early stages, keep going |
