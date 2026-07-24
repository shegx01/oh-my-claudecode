# Team Skill — Reference

Detailed CLI-worker / routing / gotchas reference for `skills/team/SKILL.md`. Load on demand.

---

## CLI Workers (Codex and Gemini)

The team skill supports **hybrid execution** combining Claude agent teammates with external CLI workers (Codex CLI and Gemini CLI). Both types can make code changes -- they differ in capabilities and cost. These are standalone CLI tools, not MCP servers.

### Execution Modes

Tasks are tagged with an execution mode during decomposition:

| Execution Mode  | Provider               | Capabilities                                                                                                                                                                               |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `claude_worker` | Claude agent           | Full Claude Code tool access (Read/Write/Edit/Bash/Task). Best for tasks needing Claude's reasoning + iterative tool use.                                                                  |
| `codex_worker`  | Codex CLI (tmux pane)  | Full filesystem access in working_directory. Runs autonomously via tmux pane. Best for code review, security analysis, refactoring, architecture. Requires `npm install -g @openai/codex`. |
| `gemini_worker`      | Gemini CLI (tmux pane)      | Full filesystem access in working_directory. Runs autonomously via tmux pane. Best for UI/design work, documentation, large-context tasks. Requires `npm install -g @google/gemini-cli` (enterprise/API-key tier). |
| `antigravity_worker` | Antigravity CLI (tmux pane) | Full filesystem access in working_directory. Runs autonomously via tmux pane. Same strengths as gemini_worker; Google's successor to the Gemini CLI. Install per the [official instructions](https://antigravity.google) (`agy` binary). |

### How CLI Workers Operate

Tmux CLI workers run in dedicated tmux panes with filesystem access. They are **autonomous executors**, not just analysts:

1. Lead writes task instructions to a prompt file
2. Lead spawns a tmux CLI worker with `working_directory` set to the project root
3. The worker reads files, makes changes, runs commands -- all within the working directory
4. Results/summary are written to an output file
5. Lead reads the output, marks the task complete, and feeds results to dependent tasks

**Key difference from Claude teammates:**

- CLI workers operate via tmux, not Claude Code's tool system
- They cannot use Claude Code's native task-list or team messaging surfaces
- They run as one-shot autonomous jobs, not persistent teammates
- The lead manages their lifecycle (spawn, monitor, collect results)

### When to Route Where

| Task Type                        | Best Route                     | Why                                                 |
| -------------------------------- | ------------------------------ | --------------------------------------------------- |
| Iterative multi-step work        | Claude teammate                | Needs tool-mediated iteration + team communication  |
| Code review / security audit     | CLI worker or specialist agent | Autonomous execution, good at structured analysis   |
| Architecture analysis / planning | architect Claude agent         | Strong analytical reasoning with codebase access    |
| Refactoring (well-scoped)        | CLI worker or executor agent   | Autonomous execution, good at structured transforms |
| UI/frontend implementation       | designer Claude agent          | Design expertise, framework idioms                  |
| Large-scale documentation        | writer Claude agent            | Writing expertise + large context for consistency   |
| Build/test iteration loops       | Claude teammate                | Needs Bash tool + iterative fix cycles              |
| Tasks needing team coordination  | Claude teammate                | Needs team/conversation status updates              |

### Example: Hybrid Team with CLI Workers

```
/team 3:executor "refactor auth module with security review"

Task decomposition:
#1 [codex_worker] Security review of current auth code -> output to .omc/research/auth-security.md
#2 [codex_worker] Refactor auth/login.ts and auth/session.ts (uses #1 findings)
#3 [claude_worker:designer] Redesign auth UI components (login form, session indicator)
#4 [claude_worker] Update auth tests + fix integration issues
#5 [gemini_worker] Final code review of all changes
```

The lead runs #1 (Codex security analysis), then #2 and #3 in parallel (Codex refactors backend, designer agent redesigns frontend), then #4 (Claude teammate handles test iteration), then #5 (Gemini final review).

### Pre-flight Analysis (Optional)

For large ambiguous tasks, run analysis before team creation:

1. Spawn `Task(subagent_type="oh-my-claudecode:planner", ...)` with task description + codebase context
2. Use the analysis to produce better task decomposition
3. Create team and tasks with enriched context

This is especially useful when the task scope is unclear and benefits from external reasoning before committing to a specific decomposition.

---

## Monitor Enhancement: Outbox Auto-Ingestion

The lead can proactively ingest outbox messages from CLI workers using the outbox reader utilities, enabling event-driven monitoring alongside native team/conversation delivery.

### Outbox Reader Functions

**`readNewOutboxMessages(teamName, workerName)`** -- Read new outbox messages for a single worker using a byte-offset cursor. Each call advances the cursor, so subsequent calls only return messages written since the last read. Mirrors the inbox cursor pattern from `readNewInboxMessages()`.

**`readAllTeamOutboxMessages(teamName)`** -- Read new outbox messages from ALL workers in a team. Returns an array of `{ workerName, messages }` entries, skipping workers with no new messages. Useful for batch polling in the monitor loop.

**`resetOutboxCursor(teamName, workerName)`** -- Reset the outbox cursor for a worker back to byte 0. Useful when re-reading historical messages after a lead restart or for debugging.

### Using `getTeamStatus()` in the Monitor Phase

The `getTeamStatus(teamName, workingDirectory, heartbeatMaxAgeMs?)` function provides a unified snapshot combining:

- **Worker registration** -- Which MCP workers are registered (from shadow registry / config.json)
- **Heartbeat freshness** -- Whether each worker is alive based on heartbeat age
- **Task progress** -- Per-worker and team-wide task counts (pending, in_progress, completed)
- **Current task** -- Which task each worker is actively executing
- **Recent outbox messages** -- New messages since the last status check

Example usage in the monitor loop:

```typescript
const status = getTeamStatus("fix-ts-errors", workingDirectory);

for (const worker of status.workers) {
  if (!worker.isAlive) {
    // Worker is dead -- reassign its in-progress tasks
  }
  for (const msg of worker.recentMessages) {
    if (msg.type === "task_complete") {
      // Mark task complete, unblock dependents
    } else if (msg.type === "task_failed") {
      // Handle failure, possibly retry or reassign
    } else if (msg.type === "error") {
      // Log error, check if worker needs intervention
    }
  }
}

if (status.taskSummary.pending === 0 && status.taskSummary.inProgress === 0) {
  // All work done -- proceed to shutdown
}
```

### Event-Based Actions from Outbox Messages

| Message Type    | Action                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| `task_complete` | Mark task completed, check if blocked tasks are now unblocked, notify dependent workers     |
| `task_failed`   | Increment failure sidecar, decide retry vs reassign vs skip                                 |
| `idle`          | Worker has no assigned tasks -- assign pending work or begin shutdown                       |
| `error`         | Log the error, check `consecutiveErrors` in heartbeat for quarantine threshold              |
| `shutdown_ack`  | Worker acknowledged shutdown -- safe to remove from team                                    |
| `heartbeat`     | Update liveness tracking (redundant with heartbeat files but useful for latency monitoring) |

This approach complements native team/conversation messaging by providing a pull-based mechanism for MCP workers that cannot use Claude Code's team messaging tools.

---

## Comparison: Team vs Legacy Swarm

| Aspect                  | Team (Native Claude Code 2.1.178+)                              | Swarm (Legacy SQLite)                  |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| **Storage**             | OMC state/handoffs plus Claude Code's current task-list surface   | SQLite in `.omc/state/swarm.db`        |
| **Dependencies**        | `better-sqlite3` not needed                                      | Requires `better-sqlite3` npm package  |
| **Task claiming**       | Lead pre-assigns named workers through task-list/TodoWrite state  | SQLite IMMEDIATE transaction -- atomic |
| **Race conditions**     | Possible if two agents claim same task (mitigate by pre-assigning) | None (SQLite transactions)             |
| **Communication**       | Native implicit-team messages / conversation turns                | None (fire-and-forget agents)          |
| **Task dependencies**   | Lead-managed dependencies in task-list/TodoWrite state            | Not supported                          |
| **Heartbeat**           | Lead detects via missing messages/status                          | Manual heartbeat table + polling       |
| **Shutdown**            | Graceful request/response protocol plus OMC state clear           | Signal-based termination               |
| **Agent lifecycle**     | Tracked by named Agent/Task spawns and OMC state                  | Manual tracking via heartbeat table    |
| **Progress visibility** | Task list/TodoWrite state with named worker ownership             | SQL queries on tasks table             |
| **Conflict prevention** | Owner labels (lead-assigned)                                      | Lease-based claiming with timeout      |
| **Crash recovery**      | Lead detects via missing messages, reassigns                      | Auto-release after 5-min lease timeout |
| **State cleanup**       | Clear OMC team state after teammate shutdown                      | Manual `rm` of SQLite database         |

**When to use Team over Swarm:** Always prefer `/team` for new native Claude Code work. It uses Claude Code's implicit agent team, requires no external dependencies, supports inter-agent coordination, and has task dependency management.

---

## Runtime V2 (Event-Driven)

When `OMC_RUNTIME_V2=1` is set, the team runtime uses an event-driven architecture instead of the legacy done.json polling watchdog:

- **No done.json**: Task completion is detected via CLI API lifecycle transitions (claim-task, transition-task-status)
- **Snapshot-based monitoring**: Each poll cycle takes a point-in-time snapshot of tasks and workers, computes deltas, and emits events
- **Event log**: All team events are appended to `.omc/state/team/{teamName}/events.jsonl`
- **Worker status files**: Workers write status to `.omc/state/team/{teamName}/workers/{name}/status.json`
- **Preserved**: Sentinel gate (blocks premature completion), circuit breaker (dead worker detection), failure sidecars

The v2 runtime is feature-flagged and can be enabled per-session. The legacy v1 runtime remains the default.

---

## Dynamic Scaling

When `OMC_TEAM_SCALING_ENABLED=1` is set, the team supports mid-session scaling:

- **scale_up**: Add workers to a running team (respects max_workers limit)
- **scale_down**: Remove idle workers with graceful drain (workers finish current task before removal)
- File-based scaling lock prevents concurrent scale operations
- Monotonic worker index counter ensures unique worker names across scale events

---

## Configuration

Optional settings live in `.claude/omc.jsonc` (project) or `~/.config/claude-omc/config.jsonc` (user). Project values override user values; `OMC_TEAM_ROLE_OVERRIDES` (env JSON) supersedes both.

```jsonc
{
  "team": {
    "ops": {
      "maxAgents": 20,
      "defaultAgentType": "claude",
      "monitorIntervalMs": 30000,
      "shutdownTimeoutMs": 15000,
    },
  },
}
```

- **ops.maxAgents** - Maximum teammates (default: 20)
- **ops.defaultAgentType** - CLI provider when a `/team` invocation does not specify one (`claude` | `codex` | `gemini` | `antigravity` | `grok` | `cursor`, default: `claude`)
- **ops.monitorIntervalMs** - How often to review TodoWrite or the active task-list surface (default: 30s)
- **ops.shutdownTimeoutMs** - How long to wait for shutdown responses (default: 15s)

> **Note:** Team members do not have a hardcoded model default. Each teammate is a separate Claude Code session that inherits the user's configured model. Since teammates can spawn their own subagents, the session model acts as the orchestration layer while subagents can use any model tier.

---

## Per-Role Provider & Model Routing

> **Scope:** Applies to `/team` only. Task-based delegation uses `delegationRouting` (see separate docs). The two systems coexist by design.

Declare which provider (`claude`, `codex`, `gemini`, `antigravity`, `grok`, `cursor`) and which model tier should back each canonical role. Routing is resolved **once** at team creation and persisted in `TeamConfig.resolved_routing` — spawn, scale-up, and restart all read from the snapshot, so a role's worker CLI and model are stable for the lifetime of the team.

### Example — user target mapping

```jsonc
// .claude/omc.jsonc
{
  "team": {
    "roleRouting": {
      "orchestrator": { "model": "inherit" },
      "planner": { "provider": "claude", "model": "HIGH" },
      "analyst": { "provider": "claude", "model": "HIGH" },
      "executor": { "provider": "claude", "model": "MEDIUM" },
      "debugger": { "provider": "cursor" },
      "critic": { "provider": "codex" },
      "code-reviewer": { "provider": "gemini" },
      "test-engineer": { "provider": "gemini", "model": "MEDIUM" },
    },
  },
}
```

| Role            | Provider        | Model                     |
| --------------- | --------------- | ------------------------- |
| `orchestrator`  | claude (pinned) | inherits invoking session |
| `planner`       | claude          | `HIGH` (opus)             |
| `analyst`       | claude          | `HIGH` (opus)             |
| `executor`      | claude          | `MEDIUM` (sonnet)         |
| `debugger`      | cursor          | cursor-agent default      |
| `critic`        | codex           | codex default             |
| `code-reviewer` | gemini          | gemini default            |
| `test-engineer` | antigravity     | antigravity default       |

### Canonical roles

`orchestrator`, `planner`, `analyst`, `architect`, `executor`, `debugger`, `critic`, `code-reviewer`, `security-reviewer`, `test-engineer`, `designer`, `writer`, `code-simplifier`, `explore`, `document-specialist`.

User-friendly aliases normalize via `normalizeDelegationRole()` — e.g. `reviewer` → `code-reviewer`, `quality-reviewer` → `code-reviewer`, `harsh-critic` → `critic`, `build-fixer` → `debugger`. Accepted alias keys are honored during resolved snapshot creation and later stage routing, not just validation. Unknown roles fail validation at parse time.

### Spec fields (`TeamRoleAssignmentSpec`)

- **provider** — `"claude" | "codex" | "gemini" | "antigravity" | "grok" | "cursor"`. Omitted → defaults to `claude`.
- **model** — tier name (`"HIGH" | "MEDIUM" | "LOW"`) or an explicit model ID. Tiers resolve through `routing.tierModels`.
- **agent** — optional Claude agent name (e.g. `"critic"`, `"executor"`). Only honored when the resolved provider is `claude`.

`orchestrator` is pinned to `claude`; only `model` is user-configurable. Any other key on `orchestrator` is rejected by the validator.

`cursor` launches `cursor-agent` as an interactive executor/refactor worker. Do not route reviewer/verdict roles (`critic`, `code-reviewer`, `security-reviewer`, `test-engineer`) to Cursor unless its CLI gains a compatible verdict-output mode; the runtime intentionally skips the structured verdict contract for Cursor panes.

### Env override

```bash
OMC_TEAM_ROLE_OVERRIDES='{"critic":{"provider":"codex"},"code-reviewer":{"provider":"gemini"}}'
```

Precedence: `OMC_TEAM_ROLE_OVERRIDES` > `.claude/omc.jsonc` (project) > `~/.config/claude-omc/config.jsonc` (user) > built-in defaults. Invalid JSON logs a warning and is ignored — env overrides are best-effort and never abort the run.

### Fallback when a CLI is missing

If the CLI for a configured provider is absent from `PATH` at spawn time, `buildLaunchArgs()` throws, the team lead emits a visible team/conversation warning, and the runtime falls back to a deterministic Claude assignment pre-computed by `buildResolvedRoutingSnapshot` (same tier + same agent, `provider: "claude"`). Fallback is loud by design — silent fallback is a test failure. Probe provider availability with `omc doctor --team-routing`.

### Stickiness — resolved once, reused everywhere

Resolved routing is immutable per team. Editing config mid-team-lifetime does not affect running teams; a new `/team` invocation picks up the new mapping. This guarantees that spawn, scale-up, and worker-restart all see identical routing, including across worktree detaches (the snapshot travels with `TeamConfig`).

### Zero-config behavior

An empty `team.roleRouting` preserves pre-patch behavior: every worker is Claude, model tiers follow `routing.tierModels`, and `/team 3:executor ...` still spawns three Claude Sonnet executors.

---

## Gotchas

1. **Internal/lifecycle task entries may pollute task-list output** -- If Claude Code reports internal lifecycle entries for spawned teammates, filter them when counting real task progress. The subject of an internal task is often the teammate's name.

2. **No atomic claiming** -- Unlike SQLite swarm, native task-list/TodoWrite state does not provide transactional claiming. Two teammates could race to claim the same task. **Mitigation:** The lead should pre-assign owners before spawning teammates. Teammates should only work on tasks assigned to them.

3. **Task IDs are strings when exposed by task-list tools** -- IDs may be auto-incrementing strings ("1", "2", "3"), not integers. Always pass string values to `taskId` fields when using task-list tools.

4. **No TeamDelete cleanup** -- Claude Code 2.1.178+ removed `TeamDelete`; use shutdown messages plus OMC state cleanup.

5. **Messages are auto-delivered** -- Teammate messages arrive to the lead as new conversation turns. No polling or inbox-checking is needed for inbound messages. However, if the lead is mid-turn (processing), messages queue and deliver when the turn ends.

6. **Do not put secrets in teammate prompts** -- Prompts can be retained in logs, state, or conversation history. Keep credentials and sensitive data out of teammate prompts.

7. **Shutdown acknowledgements are state/reporting events** -- After a teammate approves shutdown and terminates, track that acknowledgement in OMC state/reporting. Do not expect a Claude Code team membership config to update.

8. **shutdown_response needs request_id** -- The teammate must extract the `request_id` from the incoming shutdown request JSON and pass it back. The format is `shutdown-{timestamp}@{worker-name}`. Fabricating this ID will cause the shutdown to fail silently.

9. **Team name must be a valid slug** -- Use lowercase letters, numbers, and hyphens. Derive from the task description (e.g., "fix TypeScript errors" becomes "fix-ts-errors").

10. **Broadcast is expensive** -- Each broadcast sends a separate message to every teammate. Use `message` (DM) by default. Only broadcast for truly team-wide critical alerts.

11. **CLI workers are one-shot, not persistent** -- Tmux CLI workers have full filesystem access and CAN make code changes. However, they run as autonomous one-shot jobs -- they cannot use Claude Code's native task-list or team messaging surfaces. The lead must manage their lifecycle: write prompt_file, spawn CLI worker, read output_file, mark task complete. They don't participate in team communication like Claude teammates do.
