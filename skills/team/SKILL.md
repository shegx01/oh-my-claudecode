---
name: team
description: N coordinated agents on shared task list using Claude Code implicit agent teams
argument-hint: "[N:agent-type] [ralph] <task description>"
aliases: []
level: 4
---

# Team Skill

Spawn N coordinated agents working on a shared task list using Claude Code's implicit agent team. Claude Code 2.1.178+ removed native `TeamCreate`/`TeamDelete`; with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, each session has one implicit team and teammates are spawned directly with the Agent/Task tool using distinct `name` values. This skill still preserves OMC's legacy tmux/CLI worker orchestration where documented (`omc team` / `/omc-teams`).

The `swarm` compatibility alias was removed in #1131.

## Usage

```
/oh-my-claudecode:team N:agent-type "task description"
/oh-my-claudecode:team "task description"
/oh-my-claudecode:team ralph "task description"
```

### Parameters

- **N** - Number of teammate agents (1-20). Optional; defaults to auto-sizing based on task decomposition.
- **agent-type** - OMC agent to spawn for the `team-exec` stage (e.g., executor, debugger, designer, codex, gemini, antigravity). Optional; defaults to stage-aware routing. Use `codex` to spawn Codex CLI workers, `gemini` for Gemini CLI workers (enterprise/API-key tier), or `antigravity` for Antigravity CLI (`agy`) workers (Google's successor to the Gemini CLI; requires respective CLIs installed). See Stage Agent Routing below.
- **task** - High-level task to decompose and distribute among teammates
- **ralph** - Optional modifier. When present, wraps the team pipeline in Ralph's persistence loop (retry on failure, ralph's Step-7 reviewer verification — default `multi-axis-reviewer` — before completion). See Team + Ralph Composition below.

### Examples

```bash
/team 5:executor "fix all TypeScript errors across the project"
/team 3:debugger "fix build errors in src/"
/team 4:designer "implement responsive layouts for all page components"
/team "refactor the auth module with security review"
/team ralph "build a complete REST API for user management"
# With Codex CLI workers (requires: npm install -g @openai/codex)
/team 2:codex "review architecture and suggest improvements"
# With Gemini CLI workers (requires: npm install -g @google/gemini-cli)
/team 2:gemini "redesign the UI components"
# With Antigravity CLI workers (requires: install per https://antigravity.google)
/team 2:antigravity "redesign the UI components"
# Mixed: Codex for backend analysis, Gemini/Antigravity for frontend (use /ccg instead for this)
```

## Architecture

```
User: "/team 3:executor fix all TypeScript errors"
              |
              v
      [TEAM ORCHESTRATOR (Lead)]
              |
              +-- Use the session's implicit Claude Code team
              |       -> no TeamCreate call; lead remains current session
              |
              +-- Analyze & decompose task into subtasks
              |       -> explore/architect produces subtask list
              |
              +-- Create task list entries from the implementation plan
              |       -> TODO/task entries #1, #2, #3 with dependencies
              |
              +-- Update task-list entries (pre-assign owners)
              |       -> task #1 owner=worker-1, etc.
              |
              +-- Task(name="worker-1") x 3
              |       -> spawns teammates into the team
              |
              +-- Monitor loop
              |       <- teammate messages (auto-delivered by the active team surface)
              |       -> task-list/TodoWrite review for progress
              |       -> message teammates through the active team surface to unblock/coordinate
              |
              +-- Completion
                      -> request shutdown from each teammate through the active team surface
                      <- shutdown acknowledgement from teammates
                      -> clear OMC team state (no TeamDelete call)
                      -> rm .omc/state/team-state.json
```

**Native Claude Code team model (2.1.178+):**

```
- No per-team ~/.claude/teams/<name>/ directory is created by this skill.
- No TeamCreate/TeamDelete calls are available.
- `team_name` is accepted by native Claude Code only as ignored legacy metadata; do not rely on it for routing.
- Spawn teammates directly via Agent/Task with `name="worker-N"`.
```

## Goal Workflow Relationship

Team is the OMC authority for parallel, staged execution. Use the deterministic conflict policies `refuse`, `adopt_existing`, and `artifact_only` rather than non-deterministic warning handling. If a task mentions Claude Code `/goal`, Ralph, UltraQA, or artifact-only Ultragoal, keep Team as the primary loop authority unless the leader explicitly hands off. Use `/goal` only as a documented native Claude Code handoff target or as visible evidence from the lead session; do not claim the `/goal` evaluator independently runs commands, reads files, or replaces `team-verify` / `team-fix`. Artifact-only Ultragoal references should be treated as durable goal ledger/checkpoint/evidence artifacts, not as worker execution by themselves.

## Staged Pipeline (Canonical Team Runtime)

Team execution follows a staged pipeline:

`team-plan -> team-prd -> team-exec -> team-verify -> team-fix (loop)`

### Stage Agent Routing

Each pipeline stage uses **specialized agents** -- not just executors. The lead selects agents based on the stage and task characteristics.

| Stage           | Required Agents                     | Optional Agents                                                                                         | Selection Criteria                                                                                                                                                                                |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **team-plan**   | `explore` (haiku), `planner` (opus) | `analyst` (opus), `architect` (opus)                                                                    | Use `analyst` for unclear requirements. Use `architect` for systems with complex boundaries.                                                                                                      |
| **team-prd**    | `analyst` (opus)                    | `critic` (opus)                                                                                         | Use `critic` to challenge scope.                                                                                                                                                                  |
| **team-exec**   | `executor` (sonnet)                 | `executor` (opus), `debugger` (sonnet), `designer` (sonnet), `writer` (haiku), `test-engineer` (sonnet) | Match agent to subtask type. Use `executor` (model=opus) for complex autonomous work, `designer` for UI, `debugger` for compilation issues, `writer` for docs, `test-engineer` for test creation. |
| **team-verify** | `multi-axis-reviewer` (opus)         | `test-engineer` (sonnet)                                                                                | Always run `multi-axis-reviewer`. Its correctness/tests/security axes subsume the standalone `verifier`, `code-reviewer`, and `security-reviewer` passes. Add `test-engineer` only when new tests must be authored (a writing task, not review).          |
| **team-fix**    | `executor` (sonnet)                 | `debugger` (sonnet), `executor` (opus)                                                                  | Use `debugger` for type/build errors and regression isolation. Use `executor` (model=opus) for complex multi-file fixes.                                                                          |

**Routing rules:**

1. **The lead picks agents per stage, not the user.** The user's `N:agent-type` parameter only overrides the `team-exec` stage worker type. All other stages use stage-appropriate specialists.
2. **Specialist agents complement executor agents.** Route analysis/review to architect/critic Claude agents and UI work to designer agents. Tmux CLI workers are one-shot and don't participate in team communication.
3. **Cost mode affects model tier.** In downgrade: `opus` agents to `sonnet`, `sonnet` to `haiku` where quality permits. `team-verify` runs `multi-axis-reviewer` (opus) and is not downgraded below `sonnet`.
4. **Risk level scales the axis count, not the reviewer set.** `multi-axis-reviewer` already covers security and quality on every run. For security-sensitive or >20 file changes, run the full 8-axis set; for small changes, 6 axes is acceptable. Fidelity per axis never drops — only the number of axes.

### Stage Entry/Exit Criteria

- **team-plan**
  - Entry: Team invocation is parsed and orchestration starts.
  - Agents: `explore` scans codebase, `planner` creates task graph, optionally `analyst`/`architect` for complex tasks.
  - Exit: decomposition is complete and a runnable task graph is prepared.
- **team-prd**
  - Entry: scope is ambiguous or acceptance criteria are missing.
  - Agents: `analyst` extracts requirements, optionally `critic`.
  - Exit: acceptance criteria and boundaries are explicit.
- **team-exec**
  - Entry: task list assignment and worker spawn are complete.
  - Agents: workers spawned as the appropriate specialist type per subtask (see routing table).
  - Exit: execution tasks reach terminal state for the current pass.
- **team-verify**
  - Entry: execution pass finishes.
  - Agents: `multi-axis-reviewer` (see routing table).
  - **Verify agent input (diff-scoped):** Pass the reviewer `git diff` (output of `git diff HEAD~1..HEAD` or the relevant commit range), the changed-file list, and the acceptance criteria. Do NOT pass full team state or the entire conversation history. `multi-axis-reviewer` uses only this scoped input to fan out its per-axis critic passes and render one consolidated verdict.
  - **Diff-size → axis-count signal (mirror ralph):** Pass the reviewer the diff-size signal so it can right-size its axis set. Default lean to 6 axes; escalate to the full 8-axis set when the change touches **>20 files OR is security-sensitive** (auth, crypto, payments, dependency bumps). Security-sensitive changes MUST use the full 8-axis set — axis 5 now carries the full security-reviewer checklist, which restores the guaranteed security depth that dropping the standalone `security-reviewer` pass removed.
  - Exit (pass): verification gates pass with no required follow-up.
  - Exit (fail): fix tasks are generated and control moves to `team-fix`.
- **team-fix**
  - Entry: verification found defects/regressions/incomplete criteria.
  - Agents: `executor`/`debugger` depending on defect type.
  - Exit: fixes are complete and flow returns to `team-exec` then `team-verify`.

### Verify/Fix Loop and Stop Conditions

Continue `team-exec -> team-verify -> team-fix` until:

1. verification passes and no required fix tasks remain, or
2. work reaches an explicit terminal blocked/failed outcome with evidence.

`team-fix` is bounded by max attempts. If fix attempts exceed the configured limit, transition to terminal `failed` (no infinite loop).

### Stage Handoff Convention

When transitioning between stages, important context — decisions made, alternatives rejected, risks identified — lives only in the lead's conversation history. If the lead's context compacts or agents restart, this knowledge is lost.

**Each completing stage MUST produce a handoff document before transitioning.**

The lead writes handoffs to `.omc/handoffs/<stage-name>.md`.

#### Handoff Format

```markdown
## Handoff: <current-stage> → <next-stage>

- **Decided**: [key decisions made in this stage]
- **Rejected**: [alternatives considered and why they were rejected]
- **Risks**: [identified risks for the next stage]
- **Files**: [key files created or modified]
- **Remaining**: [items left for the next stage to handle]
```

#### Handoff Rules

1. **Lead reads previous handoff BEFORE spawning next stage's agents.** The handoff content is included in the next stage's agent spawn prompts, ensuring agents start with full context.
2. **Handoffs accumulate.** The verify stage can read all prior handoffs (plan → prd → exec) for full decision history.
3. **On team cancellation, handoffs survive** in `.omc/handoffs/` for session resume. They are not deleted by native Claude Code team cleanup; no `TeamDelete` call exists in Claude Code 2.1.178+.
4. **Handoffs are lightweight.** 10-20 lines max. They capture decisions and rationale, not full specifications (those live in deliverable files like DESIGN.md).

#### Example

```markdown
## Handoff: team-plan → team-exec

- **Decided**: Microservice architecture with 3 services (auth, api, worker). PostgreSQL for persistence. JWT for auth tokens.
- **Rejected**: Monolith (scaling concerns), MongoDB (team expertise is SQL), session cookies (API-first design).
- **Risks**: Worker service needs Redis for job queue — not yet provisioned. Auth service has no rate limiting in initial design.
- **Files**: DESIGN.md, TEST_STRATEGY.md
- **Remaining**: Database migration scripts, CI/CD pipeline config, Redis provisioning.
```

### Resume and Cancel Semantics

- **Resume:** restart from the last non-terminal stage using staged state + live task status. Read `.omc/handoffs/` to recover stage transition context.
- **Cancel:** `/oh-my-claudecode:cancel` requests teammate shutdown, waits for responses (best effort), marks phase `cancelled` with `active=false`, captures cancellation metadata, then deletes team resources and clears/preserves Team state per policy. Handoff files in `.omc/handoffs/` are preserved for potential resume.
- Terminal states are `complete`, `failed`, and `cancelled`.

## Windows psmux tmux-compatible gate

On native Windows, do **not** tell users that `/team` requires WSL or that tmux is unavailable until the actual tmux-compatible binary has been checked. Native [psmux](https://github.com/psmux/psmux) installs a `tmux`-compatible command (often `tmux` / `tmux.cmd`) and is a supported Team multiplexer.

Before blocking or falling back on Windows:

1. Check `tmux -V` (or the platform equivalent such as `where tmux` followed by `tmux -V`).
2. Treat a successful psmux-backed `tmux -V` as tmux available.
3. If psmux/tmux is available, continue the normal Team flow; do not emit WSL-required guidance.
4. Only when no tmux-compatible binary is available, tell the user to install psmux for native Windows support or use WSL2 as an alternative.

## Workflow

### Phase 1: Parse Input

- Extract **N** (agent count), validate 1-20
- Extract **agent-type**, validate it maps to a known OMC subagent
- Extract **task** description

### Phase 2: Analyze & Decompose

Use `explore` or `architect` (via MCP or agent) to analyze the codebase and break the task into N subtasks:

- Each subtask should be **file-scoped** or **module-scoped** to avoid conflicts
- Subtasks must be independent or have clear dependency ordering
- Each subtask needs a concise `subject` and detailed `description`
- Identify dependencies between subtasks (e.g., "shared types must be fixed before consumers")

### Phase 3: Initialize Team State

Use the session's implicit Claude Code team. Do **not** call `TeamCreate`; Claude Code 2.1.178+ removed that tool and automatically gives the session one implicit team when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is enabled.

Derive a slug such as `fix-ts-errors` for OMC state, prompt labels, handoffs, and human-readable reporting only. Native Claude Code may accept `team_name` as legacy metadata, but it is ignored for routing.

Write OMC state using the `state_write` MCP tool for proper session-scoped persistence:

```
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "fix-ts-errors",
  "agent_count": 3,
  "agent_types": "executor",
  "task": "fix all TypeScript errors",
  "fix_loop_count": 0,
  "max_fix_loops": 3,
  "linked_ralph": false,
  "stage_history": "team-plan"
})
```

> **Note:** The MCP `state_write` tool transports all values as strings. Consumers must coerce `agent_count`, `fix_loop_count`, `max_fix_loops` to numbers and `linked_ralph` to boolean when reading state.

**State schema fields:**

| Field            | Type    | Description                                                                             |
| ---------------- | ------- | --------------------------------------------------------------------------------------- |
| `active`         | boolean | Whether team mode is active                                                             |
| `current_phase`  | string  | Current pipeline stage: `team-plan`, `team-prd`, `team-exec`, `team-verify`, `team-fix` |
| `team_name`      | string  | OMC slug for state, handoffs, and reporting; ignored by native Claude Code routing |
| `agent_count`    | number  | Number of worker agents                                                                 |
| `agent_types`    | string  | Comma-separated agent types used in team-exec                                           |
| `task`           | string  | Original task description                                                               |
| `fix_loop_count` | number  | Current fix iteration count                                                             |
| `max_fix_loops`  | number  | Maximum fix iterations before failing (default: 3)                                      |
| `linked_ralph`   | boolean | Whether team is linked to a ralph persistence loop                                      |
| `stage_history`  | string  | Comma-separated list of stage transitions with timestamps                               |

**Update state on every stage transition:**

```
state_write(mode="team", current_phase="team-exec", state={
  "stage_history": "team-plan:2026-02-07T12:00:00Z,team-prd:2026-02-07T12:01:00Z,team-exec:2026-02-07T12:02:00Z"
})
```

**Read state for resume detection:**

```
state_read(mode="team")
```

If `active=true` and `current_phase` is non-terminal, resume from the last incomplete stage instead of creating a new team.

### Phase 4: Create Tasks

Create task list entries for each subtask using TodoWrite or the active task-list surface. Task-list tools are for tracking only; they do not create native teams.

```json
// Task-list entry for subtask 1
{
  "subject": "Fix type errors in src/auth/",
  "description": "Fix all TypeScript errors in src/auth/login.ts, src/auth/session.ts, and src/auth/types.ts. Run tsc --noEmit to verify.",
  "activeForm": "Fixing auth type errors"
}
```

**Response stores a task file (e.g. `1.json`):**

```json
{
  "id": "1",
  "subject": "Fix type errors in src/auth/",
  "description": "Fix all TypeScript errors in src/auth/login.ts...",
  "activeForm": "Fixing auth type errors",
  "owner": "",
  "status": "pending",
  "blocks": [],
  "blockedBy": []
}
```

For tasks with dependencies, update the active task-list entries after creation:

```json
// Task #3 depends on task #1 (shared types must be fixed first)
{
  "taskId": "3",
  "addBlockedBy": ["1"]
}
```

**Pre-assign owners from the lead** to avoid race conditions (there is no atomic claiming):

```json
// Assign task #1 to worker-1
{
  "taskId": "1",
  "owner": "worker-1"
}
```

### Phase 5: Spawn Teammates

Spawn N teammates directly using the Agent/Task tool with distinct `name` values. Each teammate gets the team worker preamble (see below) plus their specific assignment. Do **not** call `TeamCreate`, and do **not** rely on `team_name`; Claude Code 2.1.178+ ignores it for native routing.

```json
{
  "subagent_type": "oh-my-claudecode:executor",
  "name": "worker-1",
  "prompt": "<worker-preamble + assigned tasks>"
}
```

**Response:**

```json
{
  "agent_id": "worker-1",
  "name": "worker-1"
}
```

**Side effects:**

- Teammate is spawned into the session's implicit Claude Code team
- An **internal task** is auto-created (with `metadata._internal: true`) tracking the agent lifecycle
- Internal tasks may appear in task-list output -- filter them when counting real tasks

**IMPORTANT:** Spawn all teammates in parallel (they are background agents). Do NOT wait for one to finish before spawning the next.

### Phase 6: Monitor

The lead orchestrator monitors progress through two channels:

1. **Inbound messages** -- Teammates message `team-lead` when they complete tasks or need help. These arrive through the active team/conversation surface.

2. **Task-list polling/review** -- Periodically check TodoWrite or the active task-list surface for overall progress:
   ```
   #1 [completed] Fix type errors in src/auth/ (worker-1)
   #3 [in_progress] Fix type errors in src/api/ (worker-2)
   #5 [pending] Fix type errors in src/utils/ (worker-3)
   ```
   Format: `#ID [status] subject (owner)`

**Coordination actions the lead can take:**

- **Unblock a teammate:** Send a message with guidance or missing context through the active team surface
- **Reassign work:** If a teammate finishes early, update the task-list entry to assign pending work to them and notify through the active team surface
- **Handle failures:** If a teammate reports failure, reassign the task or spawn a replacement

#### Task Watchdog Policy

Monitor for stuck or failed teammates:

- **Max in-progress age**: If a task stays `in_progress` for more than 5 minutes without messages, send a status check
- **Suspected dead worker**: No messages + stuck task for 10+ minutes → reassign task to another worker
- **Reassign threshold**: If a worker fails 2+ tasks, stop assigning new tasks to it

### Phase 6.5: Stage Transitions (State Persistence)

On every stage transition, update OMC state:

```
// Entering team-exec after planning
state_write(mode="team", current_phase="team-exec", state={
  "stage_history": "team-plan:T1,team-prd:T2,team-exec:T3"
})

// Entering team-verify after execution
state_write(mode="team", current_phase="team-verify")

// Entering team-fix after verify failure
state_write(mode="team", current_phase="team-fix", state={
  "fix_loop_count": 1
})
```

This enables:

- **Resume**: If the lead crashes, `state_read(mode="team")` reveals the last stage and team name for recovery
- **Cancel**: The cancel skill reads `current_phase` to know what cleanup is needed
- **Ralph integration**: Ralph can read team state to know if the pipeline completed or failed

### Phase 7: Completion

When all real tasks (non-internal) are completed or failed:

1. **Verify results** -- Check that all real tasks (non-internal) are marked `completed` in TodoWrite or the active task-list surface
2. **Shutdown teammates** -- Send `shutdown_request` to each active teammate through the active team surface:
   ```json
   {
     "type": "shutdown_request",
     "recipient": "worker-1",
     "content": "All work complete, shutting down team"
   }
   ```
3. **Await responses** -- Each teammate responds with `shutdown_response(approve: true)` and terminates
4. **Clean up native team state** -- Claude Code 2.1.178+ has no `TeamDelete`; after teammates acknowledge shutdown, clear OMC state and any local task bookkeeping.
5. **Clean OMC state** -- Remove `.omc/state/team-state.json`
6. **Report summary** -- Present results to the user

## Agent Preamble

When spawning teammates, include this preamble in the prompt to establish the work protocol. Adapt it per teammate with their specific task assignments.

**Repo Brief injection:** The `## Repo Brief` block is injected AUTOMATICALLY — the lead does not assemble or prepend it by hand. When an implementation-class worker (executor / git-master / test-engineer) is spawned, the SubagentStart hook (`src/hooks/repo-brief-hook.ts`) gathers cheap repo facts (package.json scripts, ralph progress patterns), builds the block via `buildRepoBrief()` (cached in session state under the worktree-root@HEAD#facts key), and injects it into the spawned worker's own context. It seeds project conventions, key module paths, and build/test/lint commands so workers can skip re-deriving them from scratch.

**Additive-only guardrail:** Workers MAY skip re-deriving project conventions and key paths that are already covered by the `## Repo Brief` block — BUT workers MUST STILL Read every file they modify and Grep the immediate area of any code they are changing. The brief NEVER substitutes for reading the code being changed. If a `## Repo Brief` block is absent from the prompt, workers MUST derive conventions through normal exploration.

```
You are a TEAM WORKER in OMC team "{team_name}". Your name is "{worker_name}".
You report to the team lead ("team-lead").
You are not the leader and must not perform leader orchestration actions.

== WORK PROTOCOL ==

1. CLAIM: Check TodoWrite or the active task-list surface for tasks assigned to you (owner = "{worker_name}").
   Pick the first task with status "pending" that is assigned to you.
   Mark it `in_progress` using the active task-list surface:
   {"taskId": "ID", "status": "in_progress", "owner": "{worker_name}"}

2. WORK: Execute the task using your tools (Read, Write, Edit, Bash).
   Do NOT spawn sub-agents. Do NOT delegate. Work directly.

3. COMPLETE: When done, mark the task completed:
   {"taskId": "ID", "status": "completed"}

4. REPORT: Notify the lead through the active team/conversation surface:
   {"type": "message", "recipient": "team-lead", "content": "Completed task #ID: <summary of what was done>", "summary": "Task #ID complete"}

5. NEXT: Check TodoWrite or the active task-list surface for more assigned tasks. If you have more pending tasks, go to step 1.
   If no more tasks are assigned to you, notify the lead through the active team/conversation surface:
   {"type": "message", "recipient": "team-lead", "content": "All assigned tasks complete. Standing by.", "summary": "All tasks done, standing by"}

6. SHUTDOWN: When you receive a shutdown_request, respond with:
   {"type": "shutdown_response", "request_id": "<from the request>", "approve": true}

== BLOCKED TASKS ==
If a task has blockedBy dependencies, skip it until those tasks are completed.
Check TodoWrite or the active task-list surface periodically to see if blockers have been resolved.

== ERRORS ==
If you cannot complete a task, report the failure to the lead:
{"type": "message", "recipient": "team-lead", "content": "FAILED task #ID: <reason>", "summary": "Task #ID failed"}
Do NOT mark the task as completed. Leave it in_progress so the lead can reassign.

== RULES ==
- NEVER spawn sub-agents or use the Task tool
- NEVER run tmux pane/session orchestration commands (for example `tmux split-window`, `tmux new-session`)
- NEVER run team spawning/orchestration skills or commands (for example `$team`, `$ultrawork`, `$autopilot`, `$ralph`, `omc team ...`, `omx team ...`)
- ALWAYS use absolute file paths
- ALWAYS report progress to "team-lead" through the active team/conversation surface
- Use direct team/conversation messages with type "message" only -- never "broadcast"
```

### Agent-Type Prompt Injection (Worker-Specific Addendum)

When composing teammate prompts, append a short addendum based on worker type:

- `claude_worker`: Emphasize strict TodoWrite/task-list updates, active team/conversation messages, and no orchestration commands.
- `codex_worker`: Emphasize CLI API lifecycle (`omc team api ... --json`) and explicit failure ACKs with stderr.
- `gemini_worker`: Emphasize bounded file ownership and milestone ACKs after each completed sub-step.
- `antigravity_worker`: Same expectations as `gemini_worker`; emphasize bounded file ownership and milestone ACKs after each completed sub-step.

This addendum must preserve the core rule: **worker = executor only, never leader/orchestrator**.

## Communication Patterns

### Teammate to Lead (task completion report)

```json
{
  "type": "message",
  "recipient": "team-lead",
  "content": "Completed task #1: Fixed 3 type errors in src/auth/login.ts and 2 in src/auth/session.ts. All files pass tsc --noEmit.",
  "summary": "Task #1 complete"
}
```

### Lead to Teammate (reassignment or guidance)

```json
{
  "type": "message",
  "recipient": "worker-2",
  "content": "Task #3 is now unblocked. Also pick up task #5 which was originally assigned to worker-1.",
  "summary": "New task assignment"
}
```

### Broadcast (use sparingly -- sends N separate messages)

```json
{
  "type": "broadcast",
  "content": "STOP: shared types in src/types/index.ts have changed. Pull latest before continuing.",
  "summary": "Shared types changed"
}
```

### Shutdown Protocol (BLOCKING)

**CRITICAL: Steps must execute in exact order. Never clear OMC team state before shutdown is confirmed or timed out.**

**Step 1: Verify completion**

```
Verify via TodoWrite or the active task-list surface — all real tasks (non-internal) are completed or failed.
```

**Step 2: Request shutdown from each teammate**

**Lead sends:**

```json
{
  "type": "shutdown_request",
  "recipient": "worker-1",
  "content": "All work complete, shutting down team"
}
```

**Step 3: Wait for responses (BLOCKING)**

- Wait up to 30s per teammate for `shutdown_response`
- Track which teammates confirmed vs timed out
- If a teammate doesn't respond within 30s: log warning, mark as unresponsive

**Teammate receives and responds:**

```json
{
  "type": "shutdown_response",
  "request_id": "shutdown-1770428632375@worker-1",
  "approve": true
}
```

After approval, the teammate terminates or stops accepting new work. Claude Code 2.1.178+ does not expose per-team config membership or TeamDelete cleanup; track acknowledgements in OMC state/reporting instead.

**Step 4: Clear OMC team state — only after ALL teammates confirmed or timed out**

Claude Code 2.1.178+ has no `TeamDelete`. Clear OMC team state and local task bookkeeping after the blocking shutdown pass completes.

**Step 5: Orphan scan for OMC tmux/CLI workers only**

For legacy OMC tmux/CLI worker runs (`omc team` / `/omc-teams`), check for worker processes that survived cleanup:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cleanup-orphans.mjs" --team-name fix-ts-errors
```

This scans for OMC worker processes matching the team name and terminates stale orphans (SIGTERM → 5s wait → SIGKILL). Supports `--dry-run` for inspection.

**Shutdown sequence is BLOCKING:** Do not clear OMC team state until all teammates have either:

- Confirmed shutdown (`shutdown_response` with `approve: true`), OR
- Timed out (30s with no response)

**IMPORTANT:** The `request_id` is provided in the shutdown request message that the teammate receives. The teammate must extract it and pass it back. Do NOT fabricate request IDs.

Detailed CLI-worker / routing / gotchas reference: `skills/team/REFERENCE.md` (load on demand).

## Error Handling

### Teammate Fails a Task

1. Teammate reports the failure to the lead through the active team/conversation surface
2. Lead decides: retry (reassign same task to same or different worker) or skip
3. To reassign: update the active task-list entry with the new owner, then message the new owner through the active team surface

### Teammate Gets Stuck (No Messages)

1. Lead detects via TodoWrite or the active task-list surface -- task stuck in `in_progress` for too long
2. Lead messages the teammate asking for status through the active team surface
3. If no response, consider the teammate dead
4. Reassign the task to another worker through the active task-list surface

### Dependency Blocked

1. If a blocking task fails, the lead must decide whether to:
   - Retry the blocker
   - Remove the dependency by updating the active task-list entry's `blockedBy` metadata
   - Skip the blocked task entirely
2. Communicate decisions to affected teammates through the active team surface

### Teammate Crashes

1. Internal tracking for that teammate will show unexpected status
2. Lead reassigns orphaned tasks to remaining workers
3. If needed, spawn a replacement teammate with `Task(name="worker-N", subagent_type="...")`

## Team + Ralph Composition

When the user invokes `/team ralph`, says "team ralph", or combines both keywords, team mode wraps itself in Ralph's persistence loop. This provides:

- **Team orchestration** -- multi-agent staged pipeline with specialized agents per stage
- **Ralph persistence** -- retry on failure, ralph's Step-7 reviewer verification (default `multi-axis-reviewer`) before completion, iteration tracking

### Activation

Team+Ralph activates when:

1. User invokes `/team ralph "task"` or `/oh-my-claudecode:team ralph "task"`
2. Keyword detector finds both `team` and `ralph` in the prompt
3. Hook detects `MAGIC KEYWORD: RALPH` alongside team context

### State Linkage

Both modes write their own state files with cross-references:

```
// Team state (via state_write)
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "build-rest-api",
  "linked_ralph": true,
  "task": "build a complete REST API"
})

// Ralph state (via state_write)
state_write(mode="ralph", active=true, iteration=1, max_iterations=10, current_phase="execution", state={
  "linked_team": true,
  "team_name": "build-rest-api"
})
```

### Execution Flow

1. Ralph outer loop starts (iteration 1)
2. Team pipeline runs: `team-plan -> team-prd -> team-exec -> team-verify`
3. If `team-verify` passes: Ralph runs its Step-7 reviewer verification (default `multi-axis-reviewer`, opus)
4. If the reviewer returns APPROVE: both modes complete, run `/oh-my-claudecode:cancel`
5. If `team-verify` fails OR the reviewer returns REQUEST-CHANGES/INCONCLUSIVE: team enters `team-fix`, then loops back to `team-exec -> team-verify`
6. If fix loop exceeds `max_fix_loops`: Ralph increments iteration and retries the full pipeline
7. If Ralph exceeds `max_iterations`: terminal `failed` state

### Cancellation

Cancel either mode cancels both:

- **Cancel Ralph (linked):** Cancel Team first (graceful shutdown), then clear Ralph state
- **Cancel Team (linked):** Clear Team, mark Ralph iteration cancelled, stop loop

See Cancellation section below for details.

## Idempotent Recovery

If the lead crashes mid-run, the team skill should detect existing OMC state and resume:

1. Read `state_read(mode="team")` for the active OMC team slug, phase, and worker labels
2. Use OMC handoffs and task-list/TodoWrite state to determine current progress
3. Resume monitor mode instead of spawning duplicate teammates
4. Continue from the last recorded stage

This prevents duplicate worker spawns and allows graceful recovery from lead failures.

## Cancellation

The `/oh-my-claudecode:cancel` skill handles team cleanup:

1. Read team state via `state_read(mode="team")` to get `team_name` and `linked_ralph`
2. Request shutdown from all active named teammates through the active team surface
3. Wait for `shutdown_response` from each (15s timeout per member)
4. Clear state via `state_clear(mode="team")`
5. If `linked_ralph` is true, also clear ralph: `state_clear(mode="ralph")`

### Linked Mode Cancellation (Team + Ralph)

When team is linked to ralph, cancellation follows dependency order:

- **Cancel triggered from Ralph context:** Cancel Team first (graceful shutdown of all teammates), then clear Ralph state. This ensures workers are stopped before the persistence loop exits.
- **Cancel triggered from Team context:** Clear Team state, then mark Ralph as cancelled. Ralph's stop hook will detect the missing team and stop iterating.
- **Force cancel (`--force`):** Clears both `team` and `ralph` state unconditionally via `state_clear`.

If teammates are unresponsive, record the timeout, avoid spawning more work, and clear OMC state only after the shutdown wait completes or the user force-cancels.

## State Cleanup

On successful completion:

1. Native Claude Code 2.1.178+ has no per-team `TeamDelete` cleanup. After shutdown is confirmed or timed out, clear OMC state via MCP tools:
   ```
   state_clear(mode="team")
   ```
   If linked to Ralph:
   ```
   state_clear(mode="ralph")
   ```
2. For legacy OMC tmux/CLI workers, run the documented `omc team shutdown` / cleanup path.
3. Or run `/oh-my-claudecode:cancel` which handles OMC state cleanup automatically.

**IMPORTANT:** Clear OMC team state only AFTER all teammates have been shut down or timed out.

## Git Worktree Integration

MCP workers can operate in isolated git worktrees to prevent file conflicts between concurrent workers.

### How It Works

1. **Worktree creation**: Before spawning a worker, call `createWorkerWorktree(teamName, workerName, repoRoot)` to create an isolated worktree at `.omc/worktrees/{team}/{worker}` with branch `omc-team/{teamName}/{workerName}`.

2. **Worker isolation**: Pass the worktree path as the `workingDirectory` in the worker's `BridgeConfig`. The worker operates exclusively in its own worktree.

3. **Merge coordination**: After a worker completes its tasks, use `checkMergeConflicts()` to verify the branch can be cleanly merged, then `mergeWorkerBranch()` to merge with `--no-ff` for clear history.

4. **Team cleanup**: On team shutdown, call `cleanupTeamWorktrees(teamName, repoRoot)` to remove all worktrees and their branches.

### API Reference

| Function                                                            | Description                    |
| ------------------------------------------------------------------- | ------------------------------ |
| `createWorkerWorktree(teamName, workerName, repoRoot, baseBranch?)` | Create isolated worktree       |
| `removeWorkerWorktree(teamName, workerName, repoRoot)`              | Remove worktree and branch     |
| `listTeamWorktrees(teamName, repoRoot)`                             | List all team worktrees        |
| `cleanupTeamWorktrees(teamName, repoRoot)`                          | Remove all team worktrees      |
| `checkMergeConflicts(workerBranch, baseBranch, repoRoot)`           | Non-destructive conflict check |
| `mergeWorkerBranch(workerBranch, baseBranch, repoRoot)`             | Merge worker branch (--no-ff)  |
| `mergeAllWorkerBranches(teamName, repoRoot, baseBranch?)`           | Merge all completed workers    |

### Important Notes

- `createSession()` in `tmux-session.ts` does NOT handle worktree creation — worktree lifecycle is managed separately via `git-worktree.ts`
- Worktrees are NOT cleaned up on individual worker shutdown — only on team shutdown, to allow post-mortem inspection
- Branch names are sanitized via `sanitizeName()` to prevent injection
- All paths are validated against directory traversal

## Parallel session caveats

- **Multi-repo workspace anchor:** drop a `.omc-workspace` marker at the parent directory so multiple sessions across sub-repos share one `.omc/`. Resolution order: `OMC_STATE_DIR > .omc-workspace > git > cwd`. See `docs/REFERENCE.md`.
- **Session id source:** OMC_SESSION_ID env var wins in CLI contexts; hook payload data.session_id wins in hook contexts.
- **Plan id (when applicable):** Team state is session-scoped. Team handoffs at `.omc/handoffs/` are shared by design (see Wave G in the workspace plan).
- **Parallel verdict:** supported (session-scoped + shared handoffs by design)
