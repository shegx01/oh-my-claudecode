import { existsSync, readFileSync } from 'fs';

import { parseTranscript } from '../../src/hud/transcript.js';

export interface TranscriptTokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  usageRecordCount: number;
}

function numericUsageValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

interface RecordUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
}

interface TranscriptRecord {
  message?: {
    usage?: RecordUsage;
  };
}

export function sumTranscriptTokens(transcriptPath: string): TranscriptTokenTotals {
  if (!existsSync(transcriptPath)) {
    throw new Error(`Transcript JSONL not found: ${transcriptPath}`);
  }

  const totals: TranscriptTokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    usageRecordCount: 0,
  };

  const raw = readFileSync(transcriptPath, 'utf-8');
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    let record: TranscriptRecord;
    try {
      record = JSON.parse(trimmed) as TranscriptRecord;
    } catch {
      continue;
    }

    const usage = record.message?.usage;
    if (!usage) continue;

    totals.inputTokens += numericUsageValue(usage.input_tokens);
    totals.outputTokens += numericUsageValue(usage.output_tokens);
    totals.cacheCreationTokens += numericUsageValue(usage.cache_creation_input_tokens);
    totals.cacheReadTokens += numericUsageValue(usage.cache_read_input_tokens);
    totals.usageRecordCount += 1;
  }

  totals.totalTokens =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheCreationTokens +
    totals.cacheReadTokens;

  return totals;
}

export async function validateTranscriptUsage(transcriptPath: string): Promise<{
  totals: TranscriptTokenTotals;
  parserLastRequest: { inputTokens: number; outputTokens: number } | null;
  hasUsage: boolean;
}> {
  const totals = sumTranscriptTokens(transcriptPath);

  const parsed = await parseTranscript(transcriptPath);
  const last = parsed.lastRequestTokenUsage ?? null;
  const parserLastRequest = last
    ? { inputTokens: last.inputTokens, outputTokens: last.outputTokens }
    : null;

  return {
    totals,
    parserLastRequest,
    hasUsage: totals.usageRecordCount > 0,
  };
}
