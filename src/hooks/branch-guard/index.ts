import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadConfig } from '../../config/loader.js';
import { getGitTopLevel, getOmcRoot, validateSessionId } from '../../lib/worktree-paths.js';

export interface BranchGuardInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { subagent_type?: string; [k: string]: unknown };
}

export interface HookOutput {
  continue: boolean;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  };
}

// Write-incapable OMC/harness subagents — spawning them on a protected branch is
// safe. An unknown subagent_type is treated as write-capable (guarded).
//
// Only agents without repo Write/Edit belong here; one that gains Write/Edit
// MUST be removed, or the guard leaks write-capable work (tracer and
// general-purpose are excluded for that reason).
const DEFAULT_READONLY_AGENTS = [
  'explore',
  'Explore',
  'Plan',
  'analyst',
  'architect',
  'code-reviewer',
  'critic',
  'security-reviewer',
  'document-specialist',
  'scientist',
  'verifier',
  'statusline-setup',
  'claude-code-guide',
];

const ALLOW: HookOutput = { continue: true, suppressOutput: true };

function isSkippedViaEnv(): boolean {
  if (process.env.DISABLE_OMC) {
    return true;
  }
  const skip = process.env.OMC_SKIP_HOOKS;
  if (!skip) {
    return false;
  }
  return skip
    .split(',')
    .map(entry => entry.trim())
    .includes('branch-guard');
}

// Current branch name; 'HEAD' when detached, null on any error.
// Uses `--abbrev-ref HEAD` (not `--show-current`) because it relies on the
// 'HEAD' sentinel to detect detached HEAD, which `--show-current` cannot report
// (it returns an empty string in that case).
function getCurrentBranch(cwd: string): string | null {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 3000,
      maxBuffer: 1024 * 1024,
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

function resolveAckPath(cwd: string, sessionId?: string): string | null {
  if (!sessionId) {
    return null;
  }
  try {
    // session_id is untrusted stdin and is both joined into a path AND
    // interpolated into an emitted mkdir/touch shell snippet — reject traversal
    // and injection before building the path (throws on bad input).
    validateSessionId(sessionId);
    const omcRoot = getOmcRoot(cwd);
    if (!omcRoot) {
      return null;
    }
    return join(omcRoot, 'state', 'sessions', sessionId, '.branch-guard-ack');
  } catch {
    return null;
  }
}

function buildGuardMessage(params: {
  branch: string;
  branchNameHint?: string;
  worktreeParent: string;
  repo: string;
  ackPath: string | null;
}): string {
  const { branch, branchNameHint, worktreeParent, repo, ackPath } = params;
  // Ticket keys (CP-01, IP-02) are per-task, so config carries only the
  // convention — the assistant resolves the concrete name, asking the user.
  const nameGuidance = branchNameHint
    ? `following this repo's convention: ${branchNameHint} (ask the user for the ticket key if one is required)`
    : `as a short kebab-case name (e.g. feature/<short-task-slug>)`;
  const declineStep = ackPath
    ? ` • If they DECLINE and want to keep working on "${branch}" anyway, run:\n` +
      // ack dir is created lazily by mode state, so ensure it exists before touching
      `     mkdir -p "$(dirname "${ackPath}")" && touch "${ackPath}"\n` +
      `   (this acknowledges the risk for this session and stops further prompts).`
    : ` • If they DECLINE and want to keep working on "${branch}" anyway, proceed with caution.`;

  return (
    `⛔ Branch guard: you are on protected branch "${branch}". Write-capable work is blocked here.\n` +
    `Ask the user whether to create a new isolated branch + worktree before proceeding.\n` +
    ` • If they CONFIRM, choose a branch name ${nameGuidance}, then run:\n` +
    `     git worktree add -b <branch-name> "${worktreeParent}/${repo}-<branch-dir>"\n` +
    `   where <branch-dir> is <branch-name> with any "/" replaced by "-"; continue all work from that directory.\n` +
    declineStep
  );
}

export function processBranchGuard(input: BranchGuardInput): HookOutput {
  try {
    if (isSkippedViaEnv()) {
      return ALLOW;
    }

    const config = loadConfig();
    const branchGuard = config.branchGuard;
    if (branchGuard?.enabled !== true) {
      return ALLOW;
    }

    const cwd = input.cwd || process.cwd();

    const repoRoot = getGitTopLevel(cwd);
    if (!repoRoot) {
      return ALLOW;
    }

    const branch = getCurrentBranch(cwd);
    // 'HEAD' signals detached HEAD (no branch) — allow.
    if (!branch || branch === 'HEAD') {
      return ALLOW;
    }

    const protectedBranches = branchGuard.protectedBranches ?? ['main', 'master', 'develop'];
    if (!protectedBranches.includes(branch)) {
      return ALLOW;
    }

    // Read-only subagent spawns carry no write permission — exempt them.
    const toolName = input.tool_name;
    if (toolName === 'Task' || toolName === 'Agent') {
      const readOnlyAgents = branchGuard.readOnlyAgents ?? DEFAULT_READONLY_AGENTS;
      // OMC spawns agents namespaced (oh-my-claudecode:critic) with varying case;
      // normalize both sides before matching so the exemption is not bypassed.
      const raw = (input.tool_input?.subagent_type ?? '')
        .replace(/^oh-my-claudecode:/, '')
        .trim()
        .toLowerCase();
      if (raw && readOnlyAgents.some((a) => a.toLowerCase() === raw)) {
        return ALLOW;
      }
    }

    const ackPath = resolveAckPath(cwd, input.session_id);
    if (ackPath && existsSync(ackPath)) {
      return ALLOW;
    }

    const branchNameHint = branchGuard.branchNameHint;
    const worktreeParent = branchGuard.worktreeParent ?? dirname(repoRoot);
    const repo = basename(repoRoot);

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: buildGuardMessage({
          branch,
          branchNameHint,
          worktreeParent,
          repo,
          ackPath,
        }),
      },
    };
  } catch {
    // Fail-open: never break the user's workflow on an unexpected error.
    return ALLOW;
  }
}
