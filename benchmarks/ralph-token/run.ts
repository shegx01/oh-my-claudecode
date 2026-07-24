import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { isValidTranscriptPath } from '../../src/lib/worktree-paths.js';
import { sumTranscriptTokens, validateTranscriptUsage } from './token-summation.ts';
import {
  computeDeterministicFloor,
  formatFloorReport,
} from './deterministic-floor.ts';
import {
  evaluateGateA,
  formatGateAReport,
  type RunSample,
} from './reporting.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_DIR = join(__dirname, '..', 'baselines');

interface Args {
  floor: boolean;
  dryRun: string | null;
  transcript: string | null;
  baseline: string[];
  post: string[];
  saveBaseline: boolean;
  compare: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    floor: false,
    dryRun: null,
    transcript: null,
    baseline: [],
    post: [],
    saveBaseline: false,
    compare: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--floor':
        args.floor = true;
        break;
      case '--dry-run':
        args.dryRun = argv[++i];
        break;
      case '--transcript':
        args.transcript = argv[++i];
        break;
      case '--baseline':
        args.baseline = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--post':
        args.post = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--save-baseline':
        args.saveBaseline = true;
        break;
      case '--compare':
        args.compare = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function buildSamples(paths: string[]): RunSample[] {
  return paths.map((p) => {
    const totals = sumTranscriptTokens(p);
    return {
      totalTokens: totals.totalTokens,
      totals,
      prdCompleted: totals.usageRecordCount > 0,
      transcriptPath: p,
    };
  });
}

function warnPrdCompletedIsTautology(label: string, samples: RunSample[]): void {
  console.error(
    `\n⚠  WARNING [${label}]: prdCompleted is derived from usageRecordCount > 0,` +
      ` which is a tautology — it does NOT verify ralph completed the PRD task.` +
      ` You MUST manually exclude any transcript where ralph did not finish all` +
      ` 3 PRD stories before this verdict can be trusted.\n`,
  );
  const incomplete = samples.filter((s) => !s.prdCompleted);
  if (incomplete.length > 0) {
    console.error(
      `  ${incomplete.length} sample(s) flagged prdCompleted=false:\n` +
        incomplete.map((s) => `    ${s.transcriptPath}`).join('\n') +
        '\n',
    );
  }
}

function requireValidPath(flag: string, p: string): void {
  if (!isValidTranscriptPath(p)) {
    console.error(
      `ERROR: ${flag} path rejected by isValidTranscriptPath: ${p}\n` +
        `  Allowed locations: ~/.claude/**, ~/.omc/**, system tmpdir.\n` +
        `  Path traversal (..) and non-absolute paths are not permitted.`,
    );
    process.exit(2);
  }
}

function getLatestBaselineFile(): string | null {
  if (!existsSync(BASELINES_DIR)) return null;
  const files = readdirSync(BASELINES_DIR)
    .filter((f) => f.startsWith('ralph-token-') && f.endsWith('.json'))
    .sort()
    .reverse();
  return files.length > 0 ? join(BASELINES_DIR, files[0]) : null;
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.floor) {
    const floor = computeDeterministicFloor();
    console.log(formatFloorReport(floor));
    process.exit(floor.clearlyPositive ? 0 : 1);
  }

  if (args.dryRun) {
    requireValidPath('--dry-run', args.dryRun);
    const result = await validateTranscriptUsage(args.dryRun);
    console.log('=== Transcript usage dry-run ===');
    console.log(`Transcript: ${args.dryRun}`);
    console.log(`Records with usage: ${result.totals.usageRecordCount}`);
    console.log(`Summed total tokens: ${result.totals.totalTokens}`);
    console.log(
      `  input=${result.totals.inputTokens} output=${result.totals.outputTokens} ` +
        `cache_creation=${result.totals.cacheCreationTokens} ` +
        `cache_read=${result.totals.cacheReadTokens}`,
    );
    console.log(
      `Parser last-request cross-check: ${
        result.parserLastRequest
          ? `input=${result.parserLastRequest.inputTokens} output=${result.parserLastRequest.outputTokens}`
          : '(none)'
      }`,
    );
    console.log(`Has usage: ${result.hasUsage ? 'YES' : 'NO'}`);
    process.exit(result.hasUsage ? 0 : 1);
  }

  if (args.transcript) {
    requireValidPath('--transcript', args.transcript);
    const totals = sumTranscriptTokens(args.transcript);
    console.log('=== Single transcript token sum ===');
    console.log(`Transcript: ${args.transcript}`);
    console.log(JSON.stringify(totals, null, 2));
    process.exit(0);
  }

  if (args.baseline.length > 0 && args.post.length > 0) {
    if (args.baseline.length < 5 || args.post.length < 5) {
      console.warn(
        `WARNING: The benchmark requires N>=5 per side for a valid verdict. ` +
          `Got baseline=${args.baseline.length}, post=${args.post.length}. ` +
          `Proceeding, but the verdict is not spec-conformant.`,
      );
    }
    args.baseline.forEach((p) => requireValidPath('--baseline', p));
    args.post.forEach((p) => requireValidPath('--post', p));
    const baselineSamples = buildSamples(args.baseline);
    const postSamples = buildSamples(args.post);
    warnPrdCompletedIsTautology('baseline', baselineSamples);
    warnPrdCompletedIsTautology('post', postSamples);
    const verdict = evaluateGateA(baselineSamples, postSamples);
    console.log(formatGateAReport(verdict));

    if (args.saveBaseline) {
      if (!existsSync(BASELINES_DIR)) mkdirSync(BASELINES_DIR, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      const path = join(BASELINES_DIR, `ralph-token-${date}.json`);
      writeFileSync(
        path,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            baseline: verdict.baseline,
            post: verdict.post,
            noiseBand: verdict.noiseBand,
            meanDeltaPct: verdict.meanDeltaPct,
            floorNetRemovedTokens: verdict.floor.netRemovedTokens,
            status: verdict.status,
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`\nBaseline saved: ${path}`);
    }

    if (args.compare) {
      const latest = getLatestBaselineFile();
      if (latest) {
        const prev = JSON.parse(readFileSync(latest, 'utf-8'));
        console.log(`\n=== Compare vs ${latest} ===`);
        console.log(
          `Prev baseline mean: ${prev.baseline?.mean?.toFixed?.(0) ?? 'n/a'} ` +
            `-> current: ${verdict.baseline.mean.toFixed(0)}`,
        );
      } else {
        console.log('\nNo prior ralph-token baseline found (run with --save-baseline first).');
      }
    }

    process.exit(verdict.status === 'FAIL' ? 1 : 0);
  }

  console.error(
    'No mode selected. Use one of: --floor | --dry-run <jsonl> | ' +
      '--transcript <jsonl> | --baseline <csv> --post <csv>.\n' +
      'See benchmarks/ralph-token/README.md.',
  );
  process.exit(2);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
