import assert from 'node:assert/strict';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { sumTranscriptTokens } from './token-summation.ts';
import {
  computeDeterministicFloor,
  type CsContribution,
} from './deterministic-floor.ts';
import { summarize, evaluateGateA, type RunSample } from './reporting.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'test-fixtures', 'sample-transcript.jsonl');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`        ${(err as Error).message}`);
  }
}

test('sums input/output/cache tokens across all records', () => {
  const totals = sumTranscriptTokens(FIXTURE);
  assert.equal(totals.inputTokens, 600);
  assert.equal(totals.outputTokens, 180);
  assert.equal(totals.cacheCreationTokens, 10);
  assert.equal(totals.cacheReadTokens, 155);
});

test('total = input + output + cache_creation + cache_read', () => {
  const totals = sumTranscriptTokens(FIXTURE);
  assert.equal(totals.totalTokens, 600 + 180 + 10 + 155);
  assert.equal(totals.totalTokens, 945);
});

test('counts every record carrying a usage object (incl. bad-value record)', () => {
  const totals = sumTranscriptTokens(FIXTURE);
  assert.equal(totals.usageRecordCount, 4);
});

test('ignores non-numeric usage values (guard matches getNumericUsageValue)', () => {
  const totals = sumTranscriptTokens(FIXTURE);
  assert.equal(Number.isFinite(totals.totalTokens), true);
  assert.equal(totals.totalTokens, 945);
});

test('throws on a missing transcript (no silent zero-cost run)', () => {
  assert.throws(() => sumTranscriptTokens(join(__dirname, 'does-not-exist.jsonl')));
});

test('deterministic floor is clearly positive (net token removal)', () => {
  const floor = computeDeterministicFloor();
  assert.equal(floor.clearlyPositive, true);
  assert.equal(floor.netRemovedTokens > 0, true);
});

test('floor nets signed chars before token scaling', () => {
  const synthetic: CsContribution[] = [
    { cs: 'A', surface: 's', netRemovedChars: -10, hotPath: true, note: '' },
    { cs: 'B', surface: 's', netRemovedChars: 50, hotPath: true, note: '' },
  ];
  const floor = computeDeterministicFloor(synthetic);
  assert.equal(floor.netRemovedChars, 40);
  assert.equal(floor.netRemovedTokens, Math.ceil(40 / 4));
});

test('floor FAILS when net-additive (floor negative case)', () => {
  const netAdditive: CsContribution[] = [
    { cs: 'X', surface: 's', netRemovedChars: -1000, hotPath: true, note: '' },
  ];
  const floor = computeDeterministicFloor(netAdditive);
  assert.equal(floor.clearlyPositive, false);
});

test('summarize computes mean and sample stdev (n-1)', () => {
  const s = summarize([100, 100, 100, 100, 100]);
  assert.equal(s.mean, 100);
  assert.equal(s.stdev, 0);
  assert.equal(s.n, 5);
});

test('benchmark PASS: post below noise band + no regression + positive floor', () => {
  const baseline: RunSample[] = [1000, 1010, 990, 1005, 995].map((t) => sample(t, true));
  const post: RunSample[] = [800, 810, 790, 805, 795].map((t) => sample(t, true));
  const verdict = evaluateGateA(baseline, post);
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.measuredBelowNoiseBand, true);
  assert.equal(verdict.noRegression, true);
});

test('benchmark FAIL when floor is not positive, regardless of measured drop', () => {
  const baseline: RunSample[] = [1000, 1010, 990, 1005, 995].map((t) => sample(t, true));
  const post: RunSample[] = [1, 1, 1, 1, 1].map((t) => sample(t, true));
  const negativeFloor = computeDeterministicFloor([
    { cs: 'X', surface: 's', netRemovedChars: -500, hotPath: true, note: '' },
  ]);
  const verdict = evaluateGateA(baseline, post, negativeFloor);
  assert.equal(verdict.status, 'FAIL');
});

test('benchmark INCONCLUSIVE when floor positive but measured within noise band', () => {
  const baseline: RunSample[] = [1000, 1200, 800, 1100, 900].map((t) => sample(t, true));
  const post: RunSample[] = [1010, 1190, 810, 1090, 910].map((t) => sample(t, true));
  const verdict = evaluateGateA(baseline, post);
  assert.equal(verdict.status, 'INCONCLUSIVE');
});

function sample(totalTokens: number, prdCompleted: boolean): RunSample {
  return {
    totalTokens,
    totals: {
      inputTokens: totalTokens,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens,
      usageRecordCount: 1,
    },
    prdCompleted,
    transcriptPath: '(synthetic)',
  };
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
