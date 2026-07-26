import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AutoresearchLedgerEntry } from '../runtime.js';
import {
  AUTORESEARCH_PLATEAU_K,
  countTrailingIterationsWithoutBestStateImprovement,
} from '../runtime.js';

type LedgerSeed = Pick<AutoresearchLedgerEntry, 'iteration' | 'kind' | 'decision'>;

function makeEntry(seed: LedgerSeed): AutoresearchLedgerEntry {
  return {
    iteration: seed.iteration,
    kind: seed.kind,
    decision: seed.decision,
    decision_reason: 'fixture',
    candidate_status: seed.kind === 'baseline' ? 'baseline' : 'candidate',
    base_commit: 'bbbbbbbb',
    candidate_commit: seed.kind === 'baseline' ? null : 'aaaaaaaa',
    kept_commit: 'cccccccc',
    keep_policy: 'score_improvement',
    evaluator: null,
    created_at: '2026-04-30T22:00:00Z',
    notes: [],
    description: 'fixture entry',
  };
}

async function writeLedger(seeds: LedgerSeed[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'omc-autoresearch-plateau-'));
  const ledgerFile = join(dir, 'ledger.json');
  await writeFile(
    ledgerFile,
    JSON.stringify({
      schema_version: 1,
      created_at: '2026-04-30T22:00:00Z',
      updated_at: '2026-04-30T22:00:00Z',
      entries: seeds.map(makeEntry),
    }),
    'utf-8',
  );
  return ledgerFile;
}

describe('countTrailingIterationsWithoutBestStateImprovement', () => {
  it('exposes the default plateau K as 3', () => {
    expect(AUTORESEARCH_PLATEAU_K).toBe(3);
  });

  it('returns 0 when the ledger file does not exist', async () => {
    expect(await countTrailingIterationsWithoutBestStateImprovement(
      join(tmpdir(), 'omc-autoresearch-missing-ledger.json'),
    )).toBe(0);
  });

  it('counts three trailing non-keep iterations as a plateau of 3', async () => {
    const ledgerFile = await writeLedger([
      { iteration: 0, kind: 'baseline', decision: 'keep' },
      { iteration: 1, kind: 'iteration', decision: 'keep' },
      { iteration: 2, kind: 'iteration', decision: 'discard' },
      { iteration: 3, kind: 'iteration', decision: 'discard' },
      { iteration: 4, kind: 'iteration', decision: 'discard' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(ledgerFile)).toBe(3);
    } finally {
      await rm(ledgerFile.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });

  it('resets to 0 when the most recent iteration is a keep', async () => {
    const ledgerFile = await writeLedger([
      { iteration: 1, kind: 'iteration', decision: 'discard' },
      { iteration: 2, kind: 'iteration', decision: 'discard' },
      { iteration: 3, kind: 'iteration', decision: 'keep' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(ledgerFile)).toBe(0);
    } finally {
      await rm(ledgerFile.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });

  it('stops resetting the plateau at an intervening keep', async () => {
    const ledgerFile = await writeLedger([
      { iteration: 1, kind: 'iteration', decision: 'discard' },
      { iteration: 2, kind: 'iteration', decision: 'keep' },
      { iteration: 3, kind: 'iteration', decision: 'discard' },
      { iteration: 4, kind: 'iteration', decision: 'ambiguous' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(ledgerFile)).toBe(2);
    } finally {
      await rm(ledgerFile.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });

  it('treats a trailing baseline entry as the plateau boundary', async () => {
    const ledgerFile = await writeLedger([
      { iteration: 0, kind: 'baseline', decision: 'keep' },
      { iteration: 1, kind: 'iteration', decision: 'discard' },
      { iteration: 2, kind: 'iteration', decision: 'discard' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(ledgerFile)).toBe(2);
    } finally {
      await rm(ledgerFile.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });

  it('counts ambiguous and error decisions as evaluated non-improving iterations', async () => {
    const ledgerFile = await writeLedger([
      { iteration: 1, kind: 'iteration', decision: 'keep' },
      { iteration: 2, kind: 'iteration', decision: 'discard' },
      { iteration: 3, kind: 'iteration', decision: 'ambiguous' },
      { iteration: 4, kind: 'iteration', decision: 'error' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(ledgerFile)).toBe(3);
    } finally {
      await rm(ledgerFile.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });

  it('stops the plateau count at a trailing noop (non-evaluation boundary)', async () => {
    const ledgerFile = await writeLedger([
      { iteration: 1, kind: 'iteration', decision: 'discard' },
      { iteration: 2, kind: 'iteration', decision: 'discard' },
      { iteration: 3, kind: 'iteration', decision: 'noop' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(ledgerFile)).toBe(0);
    } finally {
      await rm(ledgerFile.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });

  it('stops the plateau count at an intervening noop between discards', async () => {
    const ledgerFile = await writeLedger([
      { iteration: 1, kind: 'iteration', decision: 'discard' },
      { iteration: 2, kind: 'iteration', decision: 'noop' },
      { iteration: 3, kind: 'iteration', decision: 'discard' },
      { iteration: 4, kind: 'iteration', decision: 'discard' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(ledgerFile)).toBe(2);
    } finally {
      await rm(ledgerFile.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });

  it('stops the plateau count at a trailing interrupted or abort non-evaluation', async () => {
    const interruptedLedger = await writeLedger([
      { iteration: 1, kind: 'iteration', decision: 'discard' },
      { iteration: 2, kind: 'iteration', decision: 'interrupted' },
    ]);
    const abortLedger = await writeLedger([
      { iteration: 1, kind: 'iteration', decision: 'discard' },
      { iteration: 2, kind: 'iteration', decision: 'abort' },
    ]);
    try {
      expect(await countTrailingIterationsWithoutBestStateImprovement(interruptedLedger)).toBe(0);
      expect(await countTrailingIterationsWithoutBestStateImprovement(abortLedger)).toBe(0);
    } finally {
      await rm(interruptedLedger.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
      await rm(abortLedger.replace(/\/ledger\.json$/, ''), { recursive: true, force: true });
    }
  });
});
