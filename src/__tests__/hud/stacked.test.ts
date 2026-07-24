import { beforeEach, describe, expect, it } from 'vitest';

import { getGithubUser, getReasoningEffort, getFastMode } from '../../hud/stdin.js';
import {
  DEFAULT_HUD_CONFIG,
  PRESET_CONFIGS,
  PRESET_LAYOUTS,
  STACKED_LAYOUT,
  type HudThresholds,
  type StatuslineStdin,
} from '../../hud/types.js';
import { renderHealthSigil } from '../../hud/elements/health-sigil.js';
import { renderGithubUser } from '../../hud/elements/github-user.js';
import { renderEffort } from '../../hud/elements/effort.js';
import {
  renderContextWithDots,
  resetContextDisplayState,
} from '../../hud/elements/context.js';
import { renderRateLimitsWithDots } from '../../hud/elements/limits.js';
import { renderActivity } from '../../hud/elements/activity.js';
import { renderStackedModel } from '../../hud/elements/model.js';
import { renderStackedLastSkill } from '../../hud/elements/skills.js';
import { dotMeter } from '../../hud/colors.js';

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s: string): string => s.replace(ANSI_REGEX, '');

const thresholds: HudThresholds = {
  contextWarning: 70,
  contextCompactSuggestion: 80,
  contextCritical: 85,
  ralphWarning: 7,
};

describe('stacked HUD stdin getters', () => {
  it('getGithubUser returns workspace.repo.owner when present', () => {
    const stdin: StatuslineStdin = { workspace: { repo: { owner: 'octocat' } } };
    expect(getGithubUser(stdin)).toBe('octocat');
  });

  it('getGithubUser returns null when owner is absent', () => {
    expect(getGithubUser({})).toBeNull();
    expect(getGithubUser({ workspace: {} })).toBeNull();
    expect(getGithubUser({ workspace: { repo: {} } })).toBeNull();
  });

  it('getReasoningEffort returns effort.level when present', () => {
    expect(getReasoningEffort({ effort: { level: 'high' } })).toBe('high');
  });

  it('getReasoningEffort returns null when effort is absent', () => {
    expect(getReasoningEffort({})).toBeNull();
    expect(getReasoningEffort({ effort: {} })).toBeNull();
  });

  it('getFastMode returns true only when fast_mode is exactly true', () => {
    expect(getFastMode({ fast_mode: true })).toBe(true);
    expect(getFastMode({ fast_mode: false })).toBe(false);
    expect(getFastMode({})).toBe(false);
  });
});

describe('stacked preset resolution', () => {
  it('is registered in the preset union and PRESET_CONFIGS', () => {
    expect(PRESET_CONFIGS.stacked).toBeDefined();
  });

  it('enables the stacked-specific elements and dot meters', () => {
    const p = PRESET_CONFIGS.stacked;
    expect(p.meterStyle).toBe('dots');
    expect(p.healthSigil).toBe(true);
    expect(p.githubUser).toBe(true);
    expect(p.effort).toBe(true);
    expect(p.gitBranch).toBe(true);
    expect(p.cwd).toBe(true);
    expect(p.cwdFormat).toBe('last');
    expect(p.lastSkill).toBe(true);
    expect(p.contextBar).toBe(true);
    expect(p.rateLimits).toBe(true);
    expect(p.gitInfoPosition).toBe('above');
    // Glyph-based design: macOS/Linux render real glyphs (ASCII fallback still
    // fires on explicit safeMode:true or Windows).
    expect(p.safeMode).toBe(false);
    expect(p.maxOutputLines).toBe(5);
  });

  it('maps rows to layout groups', () => {
    expect(PRESET_LAYOUTS.stacked).toEqual(STACKED_LAYOUT);
    expect(STACKED_LAYOUT.line1).toEqual([
      'healthSigil',
      'githubUser',
      'gitBranch',
      'cwd',
      'effort',
      'lastSkill',
    ]);
    expect(STACKED_LAYOUT.main).toEqual([
      'model',
      'contextBar',
      'rateLimits',
      'callCounts',
    ]);
    expect(STACKED_LAYOUT.detail).toEqual(['activity']);
  });

  it('does not alter the default preset', () => {
    expect(DEFAULT_HUD_CONFIG.preset).toBe('focused');
    expect(DEFAULT_HUD_CONFIG.elements.meterStyle).toBeUndefined();
  });
});

describe('health sigil rendering', () => {
  it('is green under normal conditions', () => {
    const out = renderHealthSigil({ contextPercent: 20, fiveHourPercent: 10, agentsActive: false });
    expect(out).toContain('\x1b[32m');
    expect(stripAnsi(out)).toBe('●');
  });

  it('is yellow when agents are active', () => {
    const out = renderHealthSigil({ contextPercent: 20, fiveHourPercent: 10, agentsActive: true });
    expect(out).toContain('\x1b[33m');
  });

  it('is yellow when context >= 70', () => {
    const out = renderHealthSigil({ contextPercent: 72, fiveHourPercent: 0, agentsActive: false });
    expect(out).toContain('\x1b[33m');
  });

  it('is red when context >= 85', () => {
    const out = renderHealthSigil({ contextPercent: 90, fiveHourPercent: 0, agentsActive: false });
    expect(out).toContain('\x1b[31m');
  });

  it('is red when 5h >= 90', () => {
    const out = renderHealthSigil({ contextPercent: 10, fiveHourPercent: 95, agentsActive: false });
    expect(out).toContain('\x1b[31m');
  });

  it('uses an ASCII fallback in safe mode', () => {
    const out = renderHealthSigil({ contextPercent: 10, fiveHourPercent: 0, agentsActive: false }, true);
    expect(stripAnsi(out)).toBe('*');
  });
});

describe('dot meter rendering', () => {
  beforeEach(() => resetContextDisplayState());

  it('dotMeter fills proportionally to percentage', () => {
    expect(stripAnsi(dotMeter(0, 5))).toBe('○○○○○');
    expect(stripAnsi(dotMeter(100, 5))).toBe('●●●●●');
    expect(stripAnsi(dotMeter(40, 5))).toBe('●●○○○');
  });

  it('renderContextWithDots shows label, dots and percentage', () => {
    const out = renderContextWithDots(40, thresholds, 'scope-ctx');
    expect(stripAnsi(out ?? '')).toBe('ctx ●●○○○ 40%');
  });

  it('renderContextWithDots appends compact warning at critical', () => {
    const out = renderContextWithDots(90, thresholds, 'scope-ctx-crit');
    expect(stripAnsi(out ?? '')).toContain('⚠ /compact');
  });

  it('renderContextWithDots uses ASCII fallbacks in safe mode', () => {
    const out = renderContextWithDots(90, thresholds, 'scope-ctx-safe', undefined, true);
    const plain = stripAnsi(out ?? '');
    expect(plain).toContain('#');
    expect(plain).toContain('! /compact');
    expect(plain).not.toContain('●');
    expect(plain).not.toContain('⚠');
  });

  it('renderRateLimitsWithDots renders 5h and wk buckets', () => {
    const out = renderRateLimitsWithDots({ fiveHourPercent: 40, weeklyPercent: 20 });
    const plain = stripAnsi(out ?? '');
    expect(plain).toBe('5h ●●○○○ 40% wk ●○○○○ 20%');
  });

  it('renderRateLimitsWithDots uses ASCII fallbacks in safe mode', () => {
    const out = renderRateLimitsWithDots({ fiveHourPercent: 40 }, false, true);
    const plain = stripAnsi(out ?? '');
    expect(plain).toContain('#');
    expect(plain).not.toContain('●');
  });

  it('renderRateLimitsWithDots ramps red at >=85 (not 90) for 5h and wk', () => {
    // 85 -> red (used-% ramp matching the context meter, not the 90 bar threshold)
    const at85 = renderRateLimitsWithDots({ fiveHourPercent: 85, weeklyPercent: 85 }) ?? '';
    expect(at85).toContain('\x1b[31m'); // red
    expect(at85).not.toContain('\x1b[33m'); // no yellow
    // 84 -> still yellow (>=70)
    const at84 = renderRateLimitsWithDots({ fiveHourPercent: 84, weeklyPercent: 84 }) ?? '';
    expect(at84).toContain('\x1b[33m'); // yellow
    expect(at84).not.toContain('\x1b[31m'); // not red
    // 69 -> green
    const at69 = renderRateLimitsWithDots({ fiveHourPercent: 69 }) ?? '';
    expect(at69).toContain('\x1b[32m'); // green
  });
});

describe('identity element rendering', () => {
  it('renderGithubUser prefixes an @ and shows the name', () => {
    expect(stripAnsi(renderGithubUser('octocat') ?? '')).toBe('@octocat');
    expect(renderGithubUser(null)).toBeNull();
  });

  it('renderEffort shows the level with the bolt glyph', () => {
    expect(stripAnsi(renderEffort('high') ?? '')).toBe('⚡ high');
    expect(stripAnsi(renderEffort('high', true) ?? '')).toBe('eff high');
    expect(renderEffort(null)).toBeNull();
  });

  it('renderEffort appends a fast token when fast mode is active', () => {
    // yellow `fast` token (glyph path)
    expect(stripAnsi(renderEffort('high', false, true) ?? '')).toBe('⚡ high · fast');
    expect(renderEffort('high', false, true)).toContain('\x1b[33m'); // yellow
    // ASCII path keeps the same `fast` token
    expect(stripAnsi(renderEffort('high', true, true) ?? '')).toBe('eff high · fast');
    // fast with no effort level still renders the token alone
    expect(stripAnsi(renderEffort(null, false, true) ?? '')).toBe('fast');
    // neither present -> null
    expect(renderEffort(null, false, false)).toBeNull();
  });
});

describe('stacked model chip', () => {
  it('renders a bare bold blue name with no Model: label', () => {
    const out = renderStackedModel('claude-opus-4-8-20260101', 'versioned') ?? '';
    expect(stripAnsi(out)).toBe('Opus 4.8');
    expect(out).not.toContain('Model:');
    expect(out).toContain('\x1b[1m'); // bold applied
    expect(out).toContain('\x1b[34m'); // blue
    // bold must precede the color so it is not terminated by an inner reset
    expect(out.indexOf('\x1b[1m')).toBeLessThan(out.indexOf('Opus'));
  });

  it('returns null for an empty model', () => {
    expect(renderStackedModel(null)).toBeNull();
  });
});

describe('stacked last-skill chip', () => {
  const skill = { name: 'oh-my-claudecode:autopilot', timestamp: new Date() };

  it('renders ◆ <name> with a dim glyph and blue name', () => {
    const out = renderStackedLastSkill(skill) ?? '';
    expect(stripAnsi(out)).toBe('◆ autopilot');
    expect(out).toContain('\x1b[34m'); // blue name
  });

  it('falls back to skill:<name> in safe mode', () => {
    const out = renderStackedLastSkill(skill, true) ?? '';
    expect(stripAnsi(out)).toBe('skill:autopilot');
    expect(out).not.toContain('◆');
  });

  it('returns null when no skill is present', () => {
    expect(renderStackedLastSkill(null)).toBeNull();
  });
});

describe('activity row rendering', () => {
  it('returns null when nothing is active', () => {
    expect(
      renderActivity({
        ralph: null,
        autopilot: null,
        prd: null,
        agents: [],
        todos: [],
        backgroundTasks: [],
      }),
    ).toBeNull();
  });

  it('renders ralph, todos and background chips joined by a separator', () => {
    const out = renderActivity({
      ralph: { active: true, iteration: 2, maxIterations: 10 },
      autopilot: null,
      prd: null,
      agents: [],
      todos: [
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'pending' },
      ],
      backgroundTasks: [
        {
          id: '1',
          description: 'x',
          startedAt: new Date().toISOString(),
          status: 'running',
        },
      ],
    });
    const plain = stripAnsi(out ?? '');
    expect(plain).toContain('ρ 2/10');
    expect(plain).toContain('☑ 1/2');
    expect(plain).toContain('⟳ bg 1/5');
    expect(plain).toContain(' · ');
  });

  it('flags ralph near its iteration cap', () => {
    const out = renderActivity({
      ralph: { active: true, iteration: 9, maxIterations: 10 },
      autopilot: null,
      prd: null,
      agents: [],
      todos: [],
      backgroundTasks: [],
    });
    expect(stripAnsi(out ?? '')).toContain('ρ 9/10 ⚠');
  });
});
