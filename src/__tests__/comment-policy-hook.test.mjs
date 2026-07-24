import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import process from 'process';
import { analyzeComments, isCommentLine, classifyCommentLine } from '../../scripts/comment-policy-check.mjs';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'comment-policy-check.mjs');
const HARD_FLAG_MARKER = '[OMC COMMENT POLICY — HARD FLAG]';

function runHook(payload, env = {}) {
  const stdout = execSync(`node "${SCRIPT_PATH}"`, {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 5000,
    env: { ...process.env, NODE_ENV: 'test', ...env },
  });
  return JSON.parse(stdout.trim());
}

describe('comment-policy-check: isCommentLine', () => {
  it('recognises // line comments', () => {
    expect(isCommentLine('  // this is a comment')).toBe(true);
  });

  it('recognises /* block comment opens', () => {
    expect(isCommentLine('  /* opening')).toBe(true);
  });

  it('recognises * continuation inside block comments', () => {
    expect(isCommentLine('   * line inside block')).toBe(true);
  });

  it('recognises # hash comments', () => {
    expect(isCommentLine('# shell style')).toBe(true);
  });

  it('returns false for blank lines', () => {
    expect(isCommentLine('')).toBe(false);
    expect(isCommentLine('   ')).toBe(false);
  });

  it('returns false for plain code lines', () => {
    expect(isCommentLine('const x = 1;')).toBe(false);
  });
});

describe('comment-policy-check: multi-language detection', () => {
  it('detects Rust doc comments (/// and //!)', () => {
    expect(isCommentLine('/// rust doc')).toBe(true);
    expect(isCommentLine('//! rust inner doc')).toBe(true);
  });

  it('detects Python docstring delimiters and HTML/SQL comments', () => {
    expect(isCommentLine('"""docstring"""')).toBe(true);
    expect(isCommentLine("'''docstring'''")).toBe(true);
    expect(isCommentLine('<!-- html comment -->')).toBe(true);
    expect(isCommentLine('-- sql/lua comment')).toBe(true);
  });

  it('does not treat <!DOCTYPE or plain code as comments', () => {
    expect(isCommentLine('<!DOCTYPE html>')).toBe(false);
    expect(isCommentLine('let y = x - 1;')).toBe(false);
  });
});

describe('comment-policy-check: classifyCommentLine — doc vs regular', () => {
  it('classifies doc-comment styles as doc', () => {
    expect(classifyCommentLine('/// rust doc')).toBe('doc');
    expect(classifyCommentLine('//! rust inner doc')).toBe('doc');
    expect(classifyCommentLine('/** jsdoc open')).toBe('doc');
    expect(classifyCommentLine('"""py docstring"""')).toBe('doc');
  });

  it('classifies ordinary comment styles as regular', () => {
    expect(classifyCommentLine('// plain line')).toBe('regular');
    expect(classifyCommentLine('/* block open')).toBe('regular');
    expect(classifyCommentLine('# hash')).toBe('regular');
    expect(classifyCommentLine('<!-- html -->')).toBe('regular');
  });
});

describe('comment-policy-check: doc-comment exemption from hard flag', () => {
  it('does NOT hard-flag a 6-line Rust /// doc block (exempt)', () => {
    const block = Array.from({ length: 6 }, (_, i) => `/// doc line ${i + 1}`);
    const { longBlocks } = analyzeComments(block);
    expect(longBlocks).toHaveLength(0);
  });

  it('does NOT hard-flag a 6-line JSDoc /** block (exempt)', () => {
    const block = ['/**', ' * line', ' * line', ' * line', ' * line', ' */'];
    const { longBlocks } = analyzeComments(block);
    expect(longBlocks).toHaveLength(0);
  });

  it('still hard-flags a 6-line regular // block (not exempt)', () => {
    const block = Array.from({ length: 6 }, (_, i) => `// line ${i + 1}`);
    const { longBlocks } = analyzeComments(block);
    expect(longBlocks).toHaveLength(1);
  });
});

describe('comment-policy-check: analyzeComments — block length detection', () => {
  function makeCommentBlock(n) {
    return Array.from({ length: n }, (_, i) => `// line ${i + 1}`);
  }

  it('does not hard-flag a 4-line contiguous comment block (at limit)', () => {
    const { longBlocks } = analyzeComments(makeCommentBlock(4));
    expect(longBlocks).toHaveLength(0);
  });

  it('hard-flags a 5-line contiguous comment block (over limit)', () => {
    const { longBlocks } = analyzeComments(makeCommentBlock(5));
    expect(longBlocks).toHaveLength(1);
    expect(longBlocks[0].length).toBe(5);
  });

  it('hard-flags a 10-line block with correct length recorded', () => {
    const { longBlocks } = analyzeComments(makeCommentBlock(10));
    expect(longBlocks).toHaveLength(1);
    expect(longBlocks[0].length).toBe(10);
  });

  it('counts all added comment lines regardless of block size', () => {
    const lines = ['// one', 'const x = 1;', '// two'];
    const { commentLines } = analyzeComments(lines);
    expect(commentLines).toHaveLength(2);
  });

  it('detects multiple separate over-limit blocks independently', () => {
    const lines = [
      ...Array.from({ length: 5 }, (_, i) => `// block-a line ${i}`),
      'const separator = true;',
      ...Array.from({ length: 6 }, (_, i) => `// block-b line ${i}`),
    ];
    const { longBlocks } = analyzeComments(lines);
    expect(longBlocks).toHaveLength(2);
  });
});

describe('comment-policy-check: hook stdin integration — always non-blocking', () => {
  it('returns continue:true for a 3-line comment block (no hard flag)', () => {
    const out = runHook({
      tool_name: 'Write',
      tool_input: { file_path: 'foo.ts', content: '// line 1\n// line 2\n// line 3\nconst x = 1;' },
    });
    expect(out.continue).toBe(true);
    expect(out.hookSpecificOutput?.additionalContext ?? '').not.toContain(HARD_FLAG_MARKER);
  });

  it('returns continue:true for a 5-line comment block AND emits the hard flag', () => {
    const content = '// l1\n// l2\n// l3\n// l4\n// l5\nconst x = 1;';
    const out = runHook({
      tool_name: 'Write',
      tool_input: { file_path: 'foo.ts', content },
    });
    expect(out.continue).toBe(true);
    expect(out.hookSpecificOutput?.additionalContext).toContain(HARD_FLAG_MARKER);
  });

  it('suppresses output silently for non-Write/Edit/MultiEdit tools', () => {
    const out = runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
    expect(out.continue).toBe(true);
    expect(out.suppressOutput).toBe(true);
  });

  it('suppresses output silently when no comments are added', () => {
    const out = runHook({
      tool_name: 'Write',
      tool_input: { file_path: 'bar.ts', content: 'const x = 1;\nconst y = 2;' },
    });
    expect(out.continue).toBe(true);
    expect(out.suppressOutput).toBe(true);
  });

  it('returns continue:true for an Edit payload with a 5-line added block', () => {
    const new_string = '// l1\n// l2\n// l3\n// l4\n// l5';
    const out = runHook({
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.ts', old_string: 'const x = 1;', new_string },
    });
    expect(out.continue).toBe(true);
    expect(out.hookSpecificOutput?.additionalContext).toContain(HARD_FLAG_MARKER);
  });

  it('never produces continue:false regardless of comment block size', () => {
    const hugeBlock = Array.from({ length: 50 }, (_, i) => `// line ${i}`).join('\n');
    const out = runHook({
      tool_name: 'Write',
      tool_input: { file_path: 'big.ts', content: hugeBlock },
    });
    expect(out.continue).toBe(true);
    expect(out.continue).not.toBe(false);
  });
});
