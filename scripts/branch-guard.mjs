#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readStdin } from './lib/stdin.mjs';

// FAIL-OPEN: any unexpected async/sync failure must still allow the tool.
process.on('unhandledRejection', () => {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
});
process.on('uncaughtException', () => {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
});

async function main() {
  // Read stdin (timeout-protected, see issue #240/#459)
  const input = await readStdin();

  try {
    const data = JSON.parse(input);
    const { processBranchGuard } = await import('../dist/hooks/branch-guard/index.js');
    const result = await processBranchGuard(data);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('[branch-guard] Error:', error.message);
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
});
