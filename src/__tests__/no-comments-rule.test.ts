import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CODE_WRITER_AGENTS,
  renderCodingStandardsGuidance,
} from '../agents/coding-standards.js';
import { getAgentDefinitions } from '../agents/definitions.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const CANONICAL_CLAUSE = extractCanonicalClause(
  readFileSync(join(REPO_ROOT, 'src', 'agents', 'coding-standards.ts'), 'utf-8'),
)!;

describe('no-comments-rule: CODE_WRITER_AGENTS membership', () => {
  it('equals exactly the six code-writing roles', () => {
    expect(CODE_WRITER_AGENTS).toEqual(
      new Set(['executor', 'debugger', 'test-engineer', 'code-simplifier', 'designer', 'git-master']),
    );
  });

  it('contains no extra entries beyond the six', () => {
    expect(CODE_WRITER_AGENTS.size).toBe(6);
  });
});

describe('no-comments-rule: no user gate in coding-standards.ts (C1)', () => {
  const src = readFileSync(join(REPO_ROOT, 'src', 'agents', 'coding-standards.ts'), 'utf-8');

  it('does not condition on skininthegamebros user type', () => {
    expect(src).not.toMatch(/skininthegamebros-user|USER_TYPE|isSkininthegamebrosUser/);
  });
});

describe('no-comments-rule: SDK-path injection via getAgentDefinitions()', () => {
  const originalUserType = process.env.USER_TYPE;

  beforeEach(() => {
    delete process.env.USER_TYPE;
  });

  afterEach(() => {
    if (originalUserType === undefined) {
      delete process.env.USER_TYPE;
    } else {
      process.env.USER_TYPE = originalUserType;
    }
  });

  const codeWriters = ['executor', 'debugger', 'test-engineer', 'code-simplifier', 'designer', 'git-master'];
  const nonWriters = [
    'explore', 'analyst', 'planner', 'architect', 'verifier',
    'security-reviewer', 'code-reviewer', 'writer', 'qa-tester',
    'scientist', 'tracer', 'critic', 'document-specialist',
  ];

  it('injects ## Coding Standards (MANDATORY) header into all six code-writer prompts', () => {
    const agents = getAgentDefinitions();
    for (const name of codeWriters) {
      expect(agents[name].prompt, `${name} should have coding standards header`).toContain(
        '## Coding Standards (MANDATORY)',
      );
    }
  });

  it('injects the canonical clause into all six code-writer prompts', () => {
    const agents = getAgentDefinitions();
    for (const name of codeWriters) {
      expect(agents[name].prompt, `${name} should have canonical clause`).toContain(CANONICAL_CLAUSE);
    }
  });

  it('does not inject the coding standards header into the 13 non-code-writer prompts', () => {
    const agents = getAgentDefinitions();
    for (const name of nonWriters) {
      expect(agents[name].prompt, `${name} should NOT have coding standards header`).not.toContain(
        '## Coding Standards (MANDATORY)',
      );
    }
  });
});

describe('no-comments-rule: plugin-path presence in agents/*.md', () => {
  const codeWriters = ['executor', 'debugger', 'test-engineer', 'code-simplifier', 'designer', 'git-master'];

  it.each(codeWriters)('agents/%s.md contains the canonical clause', (name) => {
    const body = readAgentMd(name);
    expect(body).toContain(CANONICAL_CLAUSE);
  });
});

describe('no-comments-rule: byte-identity drift guard across all 9 surfaces', () => {
  const codeWriters = ['executor', 'debugger', 'test-engineer', 'code-simplifier', 'designer', 'git-master'];
  const gateSurfaces = ['code-reviewer', 'verifier'];

  it('canonical clause extracted from coding-standards.ts is non-empty and starts correctly', () => {
    expect(CANONICAL_CLAUSE).toBeTruthy();
    expect(CANONICAL_CLAUSE.startsWith('Write NO code comments by default.')).toBe(true);
    expect(CANONICAL_CLAUSE.endsWith('are exempt.')).toBe(true);
  });

  it.each([...codeWriters, ...gateSurfaces])(
    'agents/%s.md clause is byte-identical to coding-standards.ts source',
    (name) => {
      const body = readAgentMd(name);
      const extracted = extractCanonicalClause(body);
      expect(extracted, `agents/${name}.md must contain the full canonical clause`).not.toBeNull();
      expect(extracted).toBe(CANONICAL_CLAUSE);
    },
  );
});

describe('no-comments-rule: gate markers and asymmetry', () => {
  it('agents/code-reviewer.md has the Comment_Policy_Gate marker and REQUEST CHANGES language', () => {
    const body = readAgentMd('code-reviewer');
    expect(body).toContain('Comment_Policy_Gate');
    expect(body).toContain('REQUEST CHANGES');
  });

  it('agents/code-reviewer.md gate does not contain the token FAIL', () => {
    const body = readAgentMd('code-reviewer');
    const gateStart = body.indexOf('<Comment_Policy_Gate>');
    const gateEnd = body.indexOf('</Comment_Policy_Gate>');
    expect(gateStart).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);
    const gateBlock = body.slice(gateStart, gateEnd + '</Comment_Policy_Gate>'.length);
    expect(gateBlock).not.toContain('FAIL');
  });

  it('agents/verifier.md has the Comment Policy Gate reference and non-blocking language', () => {
    const body = readAgentMd('verifier');
    expect(body).toContain('Comment Policy Gate');
    expect(body).toContain('does NOT change the PASS/FAIL verdict');
  });

  it('agents/verifier.md gate surfaces violations under ### Gaps', () => {
    const body = readAgentMd('verifier');
    expect(body).toContain('### Gaps');
  });
});
