import type { TranscriptTokenTotals } from './token-summation.ts';
import {
  computeDeterministicFloor,
  formatFloorReport,
  type FloorResult,
} from './deterministic-floor.ts';

export interface RunSample {
  totalTokens: number;
  totals: TranscriptTokenTotals;
  prdCompleted: boolean;
  transcriptPath: string;
}

export interface StatSummary {
  n: number;
  mean: number;
  stdev: number;
  min: number;
  max: number;
  raw: number[];
}

export function summarize(values: number[]): StatSummary {
  const n = values.length;
  if (n === 0) {
    return { n: 0, mean: 0, stdev: 0, min: 0, max: 0, raw: [] };
  }
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance =
    n > 1
      ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
      : 0;
  const stdev = Math.sqrt(variance);
  return {
    n,
    mean,
    stdev,
    min: Math.min(...values),
    max: Math.max(...values),
    raw: [...values],
  };
}

export type GateAStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface GateAVerdict {
  baseline: StatSummary;
  post: StatSummary;
  noiseBand: number;
  meanDelta: number;
  meanDeltaPct: number;
  measuredBelowNoiseBand: boolean;
  noRegression: boolean;
  floor: FloorResult;
  status: GateAStatus;
}

export function evaluateGateA(
  baselineSamples: RunSample[],
  postSamples: RunSample[],
  floor: FloorResult = computeDeterministicFloor(),
): GateAVerdict {
  const baseline = summarize(baselineSamples.map((s) => s.totalTokens));
  const post = summarize(postSamples.map((s) => s.totalTokens));

  const noiseBand = baseline.stdev;
  const meanDelta = baseline.mean - post.mean;
  const meanDeltaPct = baseline.mean > 0 ? meanDelta / baseline.mean : 0;
  const measuredBelowNoiseBand = post.mean < baseline.mean - noiseBand;
  const noRegression =
    postSamples.length > 0 && postSamples.every((s) => s.prdCompleted);

  let status: GateAStatus;
  if (!floor.clearlyPositive) {
    status = 'FAIL';
  } else if (measuredBelowNoiseBand && noRegression) {
    status = 'PASS';
  } else {
    status = 'INCONCLUSIVE';
  }

  return {
    baseline,
    post,
    noiseBand,
    meanDelta,
    meanDeltaPct,
    measuredBelowNoiseBand,
    noRegression,
    floor,
    status,
  };
}

function fmtStat(s: StatSummary): string {
  if (s.n === 0) return '(no samples)';
  return (
    `mean=${s.mean.toFixed(0)} stdev=${s.stdev.toFixed(0)} ` +
    `min=${s.min} max=${s.max} n=${s.n}  raw=[${s.raw.join(', ')}]`
  );
}

export function formatGateAReport(verdict: GateAVerdict): string {
  const lines: string[] = [];
  lines.push('=== Ralph-Token Benchmark Verdict ===');
  lines.push('');
  lines.push(`Baseline (main):   ${fmtStat(verdict.baseline)}`);
  lines.push(`Post-change (branch): ${fmtStat(verdict.post)}`);
  lines.push('');
  lines.push(`Noise band (1 baseline stdev): ${verdict.noiseBand.toFixed(0)} tokens`);
  lines.push(
    `Mean delta: ${verdict.meanDelta.toFixed(0)} tokens ` +
      `(${(verdict.meanDeltaPct * 100).toFixed(1)}% vs baseline)`,
  );
  lines.push(
    `Measured below noise band (post.mean < baseline.mean - stdev): ` +
      `${verdict.measuredBelowNoiseBand ? 'yes' : 'no'}`,
  );
  lines.push(`No behavior regression (all post runs completed PRD): ${verdict.noRegression ? 'yes' : 'no'}`);
  lines.push('');
  lines.push(formatFloorReport(verdict.floor));
  lines.push('');
  lines.push(`OVERALL VERDICT: ${verdict.status}`);
  if (verdict.status === 'INCONCLUSIVE') {
    lines.push(
      '  (deterministic floor is positive, but the noisy measured run did not ' +
        'clear the noise band — report raw numbers; do NOT claim a measured PASS.)',
    );
  }
  return lines.join('\n');
}
