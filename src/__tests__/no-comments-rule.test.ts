import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const CODE_WRITERS = ['executor', 'debugger', 'test-engineer', 'code-simplifier', 'designer', 'git-master'];
const GATE_SURFACES = ['code-reviewer', 'verifier'];
const NON_WRITERS = ['analyst', 'planner', 'architect', 'writer', 'qa-tester', 'scientist', 'critic', 'document-specialist', 'multi-axis-reviewer'];

function readAgentMd(name: string): string {
  return readFileSync(join(REPO_ROOT, 'agents', `${name}.md`), 'utf-8');
}

function extractCanonicalClause(text: string): string | null {
  const start = 'Write NO code comments by default.';
  const end = 'are exempt.';
  const si = text.indexOf(start);
  if (si === -1) return null;
  const ei = text.indexOf(end, si);
  if (ei === -1) return null;
  return text.slice(si, ei + end.length);
}

const CANONICAL_CLAUSE = extractCanonicalClause(readAgentMd('executor'))!;

describe('no-comments-rule: canonical clause is well-formed', () => {
  it('is non-empty and bounded by the expected sentinels', () => {
    expect(CANONICAL_CLAUSE).toBeTruthy();
    expect(CANONICAL_CLAUSE.startsWith('Write NO code comments by default.')).toBe(true);
    expect(CANONICAL_CLAUSE.endsWith('are exempt.')).toBe(true);
  });
});

describe('no-comments-rule: presence in the six code-writer agents/*.md', () => {
  it.each(CODE_WRITERS)('agents/%s.md contains the canonical clause', (name) => {
    expect(readAgentMd(name)).toContain(CANONICAL_CLAUSE);
  });

  it.each(CODE_WRITERS)('agents/%s.md contains the MANDATORY header', (name) => {
    expect(readAgentMd(name)).toContain('## Coding Standards (MANDATORY)');
  });
});

describe('no-comments-rule: absent from non-code-writer agents', () => {
  it.each(NON_WRITERS)('agents/%s.md does not carry the coding-standards block', (name) => {
    expect(readAgentMd(name)).not.toContain('## Coding Standards (MANDATORY)');
  });
});

describe('no-comments-rule: byte-identity drift guard across all surfaces', () => {
  it.each([...CODE_WRITERS.filter((n) => n !== 'executor'), ...GATE_SURFACES])(
    'agents/%s.md clause is byte-identical to the executor.md reference',
    (name) => {
      const extracted = extractCanonicalClause(readAgentMd(name));
      expect(extracted, `agents/${name}.md must contain the full canonical clause`).not.toBeNull();
      expect(extracted).toBe(CANONICAL_CLAUSE);
    },
  );
});

describe('no-comments-rule: gate markers and asymmetry', () => {
  it('code-reviewer.md is the authoritative gate using REQUEST CHANGES, never FAIL', () => {
    const body = readAgentMd('code-reviewer');
    expect(body).toContain('Comment_Policy_Gate');
    expect(body).toContain('REQUEST CHANGES');
    const gateStart = body.indexOf('<Comment_Policy_Gate>');
    const gateEnd = body.indexOf('</Comment_Policy_Gate>');
    expect(gateStart).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);
    expect(body.slice(gateStart, gateEnd)).not.toContain('FAIL');
  });

  it('verifier.md is non-blocking and surfaces violations under ### Gaps', () => {
    const body = readAgentMd('verifier');
    expect(body).toContain('Comment Policy Gate');
    expect(body).toContain('does NOT change the PASS/FAIL verdict');
    expect(body).toContain('### Gaps');
  });
});
