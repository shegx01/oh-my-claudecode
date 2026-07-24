#!/usr/bin/env node

/**
 * PostToolUse Hook: Comment Policy Backstop
 *
 * Deterministic, NON-BLOCKING advisory for Write/Edit/MultiEdit. Scans the
 * ADDED lines of the tool payload for comment lines (line, block, hash, and
 * JSDoc styles). Hard-flags any added contiguous comment block longer than 4 lines
 * (the only objectively checkable rule); surfaces all added comments as a
 * reminder. Always exits 0 / continue — the WHY judgment is left to the
 * semantic gates in code-reviewer/verifier.
 */

import { readStdin } from './lib/stdin.mjs';

const MAX_COMMENT_BLOCK_LINES = 4;

const RULE_REMINDER =
  'Comment policy: write NO code comments by default; add one ONLY to explain a WHY the code cannot express (constraint, invariant, rationale, gotcha), at most 4 lines. Doc-comments for public APIs are exempt.';

function splitLines(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

function collectAddedLines(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];

  if (toolName === 'Write') {
    return splitLines(toolInput.content);
  }

  if (toolName === 'Edit') {
    return splitLines(toolInput.new_string);
  }

  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    return edits.flatMap((edit) => splitLines(edit?.new_string));
  }

  return [];
}

export function isCommentLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('*/') ||
    trimmed.startsWith('#')
  );
}

export function analyzeComments(lines) {
  const commentLines = [];
  const longBlocks = [];
  let blockStart = -1;
  let blockLen = 0;

  const flushBlock = (endIndex) => {
    if (blockLen > MAX_COMMENT_BLOCK_LINES) {
      longBlocks.push({ start: blockStart, end: endIndex - 1, length: blockLen });
    }
    blockStart = -1;
    blockLen = 0;
  };

  lines.forEach((line, index) => {
    if (isCommentLine(line)) {
      if (blockStart === -1) blockStart = index;
      blockLen += 1;
      commentLines.push({ index, text: line.trim() });
    } else if (blockStart !== -1) {
      flushBlock(index);
    }
  });

  if (blockStart !== -1) flushBlock(lines.length);

  return { commentLines, longBlocks };
}

function buildMessage(toolName, filePath, commentLines, longBlocks) {
  if (commentLines.length === 0) return '';

  const parts = [];
  const target = filePath ? ` in ${filePath}` : '';

  if (longBlocks.length > 0) {
    const details = longBlocks
      .map((block) => `${block.length}-line block`)
      .join(', ');
    parts.push(
      `[OMC COMMENT POLICY — HARD FLAG] ${toolName}${target} adds a comment block longer than ${MAX_COMMENT_BLOCK_LINES} lines (${details}). The clause caps a comment at ${MAX_COMMENT_BLOCK_LINES} lines — shorten or remove it.`,
    );
  }

  const preview = commentLines
    .slice(0, 8)
    .map((c) => `  + ${c.text.length > 100 ? `${c.text.slice(0, 100)}…` : c.text}`)
    .join('\n');
  const overflow =
    commentLines.length > 8 ? `\n  …and ${commentLines.length - 8} more` : '';

  parts.push(
    `[OMC COMMENT POLICY — advisory] ${toolName}${target} added ${commentLines.length} comment line(s):\n${preview}${overflow}\n${RULE_REMINDER}`,
  );

  return parts.join('\n\n');
}

async function main() {
  const _skipHooks = (process.env.OMC_SKIP_HOOKS || '').split(',').map((s) => s.trim());
  if (
    process.env.DISABLE_OMC === '1' ||
    process.env.DISABLE_OMC === 'true' ||
    _skipHooks.includes('post-tool-use')
  ) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    const input = await readStdin();
    if (!input.trim()) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    let data = {};
    try {
      data = JSON.parse(input);
    } catch {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const toolName = data.tool_name || data.toolName || '';
    if (toolName !== 'Write' && toolName !== 'Edit' && toolName !== 'MultiEdit') {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const toolInput = data.tool_input || data.toolInput || {};
    const filePath = toolInput.file_path || toolInput.path || '';

    const addedLines = collectAddedLines(toolName, toolInput);
    const { commentLines, longBlocks } = analyzeComments(addedLines);
    const message = buildMessage(toolName, filePath, commentLines, longBlocks);

    if (message) {
      console.log(
        JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: message,
          },
        }),
      );
    } else {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
