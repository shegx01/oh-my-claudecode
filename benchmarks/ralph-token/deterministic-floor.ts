const CHARS_PER_TOKEN = 4;

function tokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export interface CsContribution {
  cs: string;
  surface: string;
  netRemovedChars: number;
  hotPath: boolean;
  note: string;
}

export const CS_CONTRIBUTIONS: CsContribution[] = [
  {
    cs: 'executor.md',
    surface: 'agents/executor.md — repo-brief note + Investigation_Protocol guardrail',
    netRemovedChars: -389,
    hotPath: true,
    note: 'Additive: the repo-brief wiring. Its cost is meant to be outweighed by the re-derivation workers skip at runtime.',
  },
  {
    cs: 'git-master.md',
    surface: 'agents/git-master.md — orchestrator note rewrite',
    netRemovedChars: -116,
    hotPath: true,
    note: 'Additive: rewritten note is marginally longer than the old reference.',
  },
  {
    cs: 'ralph SKILL.md',
    surface: 'skills/ralph/SKILL.md — Codebase Facts block + diff-size gating',
    netRemovedChars: -1551,
    hotPath: true,
    note: 'Additive to the skill body; the runtime saving is fewer re-explorations and gated deslop, not the static text size.',
  },
  {
    cs: 'deep-interview SKILL.md',
    surface: 'skills/deep-interview/SKILL.md — scoring-window rewrite + ADVANCED extraction',
    netRemovedChars: 3069,
    hotPath: true,
    note: 'Hot-path removal: Advanced content moved to ADVANCED.md + scoring input narrowed.',
  },
  {
    cs: 'team SKILL.md',
    surface: 'skills/team/SKILL.md — reference extraction to REFERENCE.md',
    netRemovedChars: 19463,
    hotPath: true,
    note: 'Hot-path removal: ~297 lines of reference moved to REFERENCE.md; the session-id pointer stays.',
  },
];

export interface FloorResult {
  contributions: CsContribution[];
  netRemovedChars: number;
  netRemovedTokens: number;
  clearlyPositive: boolean;
}

export function computeDeterministicFloor(
  contributions: CsContribution[] = CS_CONTRIBUTIONS,
): FloorResult {
  const netRemovedChars = contributions.reduce(
    (sum, c) => sum + c.netRemovedChars,
    0,
  );
  const netRemovedTokens =
    netRemovedChars >= 0
      ? tokensFromChars(netRemovedChars)
      : -tokensFromChars(-netRemovedChars);

  return {
    contributions,
    netRemovedChars,
    netRemovedTokens,
    clearlyPositive: netRemovedTokens > 0,
  };
}

export function formatFloorReport(result: FloorResult): string {
  const lines: string[] = [];
  lines.push('=== Deterministic token-delta floor ===');
  lines.push('');
  lines.push('Per-CS prompt hot-path delta (chars removed - chars added):');
  for (const c of result.contributions) {
    const sign = c.netRemovedChars >= 0 ? '+' : '';
    lines.push(
      `  ${c.cs}: ${sign}${c.netRemovedChars} chars ` +
        `(${c.netRemovedChars >= 0 ? 'removed' : 'ADDED'})`,
    );
    lines.push(`      surface: ${c.surface}`);
    lines.push(`      ${c.note}`);
  }
  lines.push('');
  lines.push(
    `Net removed: ${result.netRemovedChars} chars ` +
      `= ~${result.netRemovedTokens} tokens (chars/4)`,
  );
  lines.push('');
  lines.push(
    `Verdict: ${
      result.clearlyPositive
        ? 'PASS (net token removal is positive)'
        : 'FAIL (delta not positive — a CS is net-additive; bisect by CS)'
    }`,
  );
  return lines.join('\n');
}
