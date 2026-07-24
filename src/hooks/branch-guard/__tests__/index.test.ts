import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process.execFileSync (preserve other exports so transitively
// imported modules that use execFile/spawn still resolve).
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

// Mock fs.existsSync (preserve other exports).
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

// getGitTopLevel routes through the same git simulation as getCurrentBranch's
// direct execFileSync, so mockGit() drives both. validateSessionId mirrors the
// real SESSION_ID_REGEX so injection-shaped ids throw (fail-safe ack path).
const SESSION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,255}$/;
vi.mock('../../../lib/worktree-paths.js', () => ({
  getOmcRoot: vi.fn().mockReturnValue('/repo/.omc'),
  getGitTopLevel: vi.fn((cwd?: string) => mockGitTopLevel(cwd)),
  validateSessionId: vi.fn((sessionId: string) => {
    if (!sessionId) throw new Error('Session ID cannot be empty');
    if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
      throw new Error('Invalid session ID: path traversal not allowed');
    }
    if (!SESSION_ID_REGEX.test(sessionId)) {
      throw new Error('Invalid session ID');
    }
  }),
}));

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../../config/loader.js';
import { processBranchGuard } from '../index.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockLoadConfig = vi.mocked(loadConfig);

// Shared toplevel state so the mocked getGitTopLevel and the execFileSync-backed
// getCurrentBranch agree within a single test.
let currentTopLevel: string | null = null;
function mockGitTopLevel(_cwd?: string): string | null {
  return currentTopLevel;
}

// Simulate `git rev-parse --show-toplevel` (via getGitTopLevel) and
// `--abbrev-ref HEAD` (via execFileSync).
function mockGit(topLevel: string | null, branch: string | null): void {
  currentTopLevel = topLevel;
  mockExecFileSync.mockImplementation((_file: string, args?: readonly string[]) => {
    const argStr = args?.join(' ') ?? '';
    if (argStr === 'rev-parse --abbrev-ref HEAD') {
      if (branch === null) throw new Error('not a git repository');
      return `${branch}\n`;
    }
    return '';
  });
}

const ENABLED_CONFIG = {
  branchGuard: {
    enabled: true,
    protectedBranches: ['main', 'master', 'develop'],
    branchPrefix: 'feature/',
  },
} as ReturnType<typeof loadConfig>;

describe('processBranchGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_OMC;
    delete process.env.OMC_SKIP_HOOKS;
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.DISABLE_OMC;
    delete process.env.OMC_SKIP_HOOKS;
  });

  it('allows when branchGuard is disabled (default)', () => {
    mockLoadConfig.mockReturnValue({ branchGuard: { enabled: false } } as ReturnType<typeof loadConfig>);
    mockGit('/repo', 'main');
    const result = processBranchGuard({ cwd: '/repo', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('allows when the branch is not protected', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'feature/my-thing');
    const result = processBranchGuard({ cwd: '/repo', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('allows when HEAD is detached', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'HEAD');
    const result = processBranchGuard({ cwd: '/repo', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('allows when not inside a git repo', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit(null, null);
    const result = processBranchGuard({ cwd: '/tmp/not-a-repo', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('denies Write on main when enabled and mentions branch + worktree command', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({ cwd: '/repo', session_id: 'sess1', tool_name: 'Write' });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    const reason = result.hookSpecificOutput?.permissionDecisionReason ?? '';
    expect(reason).toContain('main');
    expect(reason).toContain('git worktree add -b feature/<slug>');
  });

  it('allows Task spawn of a read-only agent (explore) on main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'explore' },
    });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('denies Task spawn of executor on main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'executor' },
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('denies Task spawn of general-purpose on main (write-capable catch-all)', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'general-purpose' },
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('allows when OMC_SKIP_HOOKS contains branch-guard', () => {
    process.env.OMC_SKIP_HOOKS = 'foo,branch-guard,bar';
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({ cwd: '/repo', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('allows when DISABLE_OMC is set', () => {
    process.env.DISABLE_OMC = '1';
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({ cwd: '/repo', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('allows when the session ack marker exists', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    mockExistsSync.mockReturnValue(true);
    const result = processBranchGuard({ cwd: '/repo', session_id: 'sess1', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  // Fix 1: namespaced / mixed-case subagent exemption.
  it('allows a namespaced read-only agent (oh-my-claudecode:explore) on main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'oh-my-claudecode:explore' },
    });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('allows mixed-case read-only agent types (Explore) on main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'Explore' },
    });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  it('denies mixed-case write-capable agent types (EXECUTOR) on main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'EXECUTOR' },
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('denies an unknown namespaced subagent type on main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'oh-my-claudecode:unknown-agent' },
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('denies an unknown subagent_type on Task/main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'totally-made-up' },
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('denies a missing subagent_type on Task/main', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: {},
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  // Fix 5: readOnlyAgents override REPLACES the default set.
  it('denies explore when readOnlyAgents override omits it', () => {
    mockLoadConfig.mockReturnValue({
      branchGuard: {
        enabled: true,
        protectedBranches: ['main', 'master', 'develop'],
        branchPrefix: 'feature/',
        readOnlyAgents: ['debugger'],
      },
    } as ReturnType<typeof loadConfig>);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'explore' },
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('allows executor when readOnlyAgents override includes it', () => {
    mockLoadConfig.mockReturnValue({
      branchGuard: {
        enabled: true,
        protectedBranches: ['main', 'master', 'develop'],
        branchPrefix: 'feature/',
        readOnlyAgents: ['executor'],
      },
    } as ReturnType<typeof loadConfig>);
    mockGit('/repo', 'main');
    const result = processBranchGuard({
      cwd: '/repo',
      tool_name: 'Task',
      tool_input: { subagent_type: 'executor' },
    });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });

  // Fix 5: custom protectedBranches proves the list is consulted, not hardcoded.
  it('denies on a custom protected branch (release) and allows on main', () => {
    const releaseConfig = {
      branchGuard: {
        enabled: true,
        protectedBranches: ['release'],
        branchPrefix: 'feature/',
      },
    } as ReturnType<typeof loadConfig>;

    mockLoadConfig.mockReturnValue(releaseConfig);
    mockGit('/repo', 'release');
    const denied = processBranchGuard({ cwd: '/repo', session_id: 'sess1', tool_name: 'Write' });
    expect(denied.hookSpecificOutput?.permissionDecision).toBe('deny');

    mockLoadConfig.mockReturnValue(releaseConfig);
    mockGit('/repo', 'main');
    const allowed = processBranchGuard({ cwd: '/repo', session_id: 'sess1', tool_name: 'Write' });
    expect(allowed).toEqual({ continue: true, suppressOutput: true });
  });

  // Fix 5: custom branchPrefix + worktreeParent are locked into the deny reason.
  it('locks custom branchPrefix + worktreeParent + repo basename into the deny reason', () => {
    mockLoadConfig.mockReturnValue({
      branchGuard: {
        enabled: true,
        protectedBranches: ['main'],
        branchPrefix: 'wip/',
        worktreeParent: '/custom/wt',
      },
    } as ReturnType<typeof loadConfig>);
    mockGit('/home/user/myrepo', 'main');
    const result = processBranchGuard({ cwd: '/home/user/myrepo', session_id: 'sess1', tool_name: 'Write' });
    const reason = result.hookSpecificOutput?.permissionDecisionReason ?? '';
    expect(reason).toContain('git worktree add -b wip/<slug> "/custom/wt/myrepo-<slug>"');
  });

  // Fix 5 + Fix 2: no session_id -> "proceed with caution", no mkdir line.
  it('uses the proceed-with-caution decline branch when session_id is missing', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({ cwd: '/repo', tool_name: 'Write' });
    const reason = result.hookSpecificOutput?.permissionDecisionReason ?? '';
    expect(reason).toContain('proceed with caution');
    expect(reason).not.toContain('mkdir -p');
  });

  // Fix 2: an injection-shaped session_id yields a null ack path, so the
  // "proceed with caution" decline branch is used (no mkdir/touch line).
  it('falls back to proceed-with-caution when session_id is path-traversal-shaped', () => {
    mockLoadConfig.mockReturnValue(ENABLED_CONFIG);
    mockGit('/repo', 'main');
    const result = processBranchGuard({ cwd: '/repo', session_id: '../../etc', tool_name: 'Write' });
    const reason = result.hookSpecificOutput?.permissionDecisionReason ?? '';
    expect(reason).toContain('proceed with caution');
    expect(reason).not.toContain('mkdir -p');
    expect(reason).not.toContain('touch');
  });

  // Fix 5: fail-open when loadConfig throws.
  it('allows (fail-open) when loadConfig throws', () => {
    mockLoadConfig.mockImplementation(() => {
      throw new Error('config blew up');
    });
    mockGit('/repo', 'main');
    const result = processBranchGuard({ cwd: '/repo', tool_name: 'Write' });
    expect(result).toEqual({ continue: true, suppressOutput: true });
  });
});
