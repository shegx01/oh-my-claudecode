export const CODE_WRITER_AGENTS = new Set<string>([
  'executor',
  'debugger',
  'test-engineer',
  'code-simplifier',
  'designer',
  'git-master',
]);

const CODING_STANDARDS_GUIDANCE_HEADER = '## Coding Standards (MANDATORY)';

const CODING_STANDARDS_GUIDANCE_LINES = [
  'Write NO code comments by default. Add one ONLY when it explains something the code cannot express — a non-obvious constraint, invariant, rationale, or gotcha (the WHY, never a restatement of what the code does); it must be precise, code-related (not TODOs, changelog, or process narration), and at most 4 lines. Doc-comments required for public APIs (e.g. JSDoc, Python docstrings, Javadoc, Go/Rust doc comments) are exempt.',
];

export function renderCodingStandardsGuidance(): string {
  return [CODING_STANDARDS_GUIDANCE_HEADER, ...CODING_STANDARDS_GUIDANCE_LINES].join('\n');
}

export function appendCodingStandardsGuidance(name: string, prompt: string): string {
  if (!CODE_WRITER_AGENTS.has(name)) {
    return prompt;
  }

  return `${prompt}\n\n${renderCodingStandardsGuidance()}`;
}
