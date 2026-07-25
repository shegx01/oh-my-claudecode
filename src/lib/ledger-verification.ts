export const P_MAX = 3;
export const STAMPED_RISK_MAX_RATIO = 0.5;
export const MAX_ROUNDS = 20;

export const CANONICAL_AXIS_KEYWORDS = [
  'dependency-direction',
  'module-boundaries',
  'error-taxonomy',
  'transaction-boundaries',
  'consistency-model',
  'schema-evolution',
  'api-versioning',
  'cross-cutting-concerns',
  'testability-seams',
  'failure-isolation',
  'performance-envelope',
  'deploy-topology',
] as const;

const EARLY_EXIT_STATUS = 'BELOW_THRESHOLD_EARLY_EXIT';
const FILE_LINE_PATTERN = /[^\s:]+:\d+/;

export interface LedgerVerdict {
  verdict: 'PASS' | 'FAIL';
  blocks: string[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rowStatus(row: UnknownRecord): string {
  return asString(row.status).trim().toLowerCase();
}

function isMaterial(row: UnknownRecord): boolean {
  return row.material === true;
}

function rowText(row: UnknownRecord): string {
  return [asString(row.choice), asString(row.axis), asString(row.rationale), asString(row.material_reason)]
    .join(' ')
    .toLowerCase();
}

function looksLikeAttestation(rows: UnknownRecord[]): boolean {
  return rows.some((row) => {
    const text = [asString(row.choice), asString(row.rationale)].join(' ').toLowerCase();
    return text.includes('no material fork') || text.includes('no material forks');
  });
}

function countActiveComponents(diState: UnknownRecord): number {
  const topology = asRecord(diState.topology);
  if (!topology) return 0;
  const components = asArray(topology.components).map(asRecord).filter((c): c is UnknownRecord => c !== null);
  const active = components.filter((c) => c.deferred !== true && asString(c.status).trim().toLowerCase() !== 'deferred');
  return active.length > 0 ? active.length : components.length;
}

function specStatus(diState: UnknownRecord): string {
  const spec = asRecord(diState.spec);
  const candidate = diState.Status ?? diState.spec_status ?? diState.status ?? (spec ? spec.Status ?? spec.status : undefined);
  return asString(candidate).trim();
}

function hasFileLineEvidence(row: UnknownRecord): boolean {
  return asArray(row.evidence).some((entry) => FILE_LINE_PATTERN.test(asString(entry)));
}

function hasNoveltyNote(row: UnknownRecord): boolean {
  return asString(row.rationale).trim().length > 0;
}

function enforcementIsProse(mechanism: string): boolean {
  const value = mechanism.trim();
  if (value.length === 0) return true;
  const hasPathOrCommandToken = value.includes('/') || value.includes('.') || value.includes('::') || /\s/.test(value.trim());
  return !hasPathOrCommandToken;
}

function hasPersistedUserExitTurn(rounds: unknown[]): boolean {
  return rounds.map(asRecord).some((round) => {
    if (!round) return false;
    if (round.user_exit === true || round.early_exit === true) return true;
    const kind = asString(round.type ?? round.kind ?? round.event).toLowerCase();
    return kind.includes('user-exit') || kind.includes('user_exit') || kind.includes('early-exit');
  });
}

export function evaluateLedgerVerification(diState: unknown): LedgerVerdict {
  const blocks: string[] = [];

  const state = asRecord(diState);
  if (!state) {
    return { verdict: 'FAIL', blocks: ['deep-interview state is missing or malformed'] };
  }

  const ledger = asArray(state.decision_ledger).map(asRecord).filter((r): r is UnknownRecord => r !== null);
  const architectureContext = state.architecture_context ?? null;
  const behaviorContext = state.behavior_context ?? null;
  const invariants = asArray(state.architectural_invariants).map(asRecord).filter((r): r is UnknownRecord => r !== null);
  const rounds = asArray(state.rounds);
  const activeComponents = countActiveComponents(state);
  const status = specStatus(state);

  const materialRows = ledger.filter(isMaterial);
  const trivialAttestationExit = activeComponents <= 1 && looksLikeAttestation(ledger);

  if ((architectureContext === null || behaviorContext === null) && !trivialAttestationExit) {
    blocks.push('architecture_context or behavior_context is null without a single-trivial attestation row');
  }

  for (const row of ledger) {
    if (isMaterial(row) && rowStatus(row) === 'undecided') {
      blocks.push(`material ledger row is undecided: ${asString(row.id) || rowText(row).slice(0, 40)}`);
    }
  }

  for (const row of materialRows) {
    if (rowStatus(row) !== 'decided') continue;
    const options = asArray(row.options);
    const rationale = asString(row.rationale).trim();
    if (options.length < 2 || rationale.length < 12 || asRecord(row.option_tradeoffs) === null) {
      blocks.push(`decided material row misses the tradeoff floor: ${asString(row.id) || rowText(row).slice(0, 40)}`);
    }
  }

  for (const row of materialRows) {
    if (rowStatus(row) !== 'conformed') continue;
    if (!hasFileLineEvidence(row)) {
      blocks.push(`conformed material row lacks file:line evidence: ${asString(row.id) || rowText(row).slice(0, 40)}`);
    }
  }

  let pendingConsensusCount = 0;
  for (const row of ledger) {
    if (rowStatus(row) !== 'pending_consensus') continue;
    pendingConsensusCount += 1;
    if (!hasNoveltyNote(row)) {
      blocks.push(`pending_consensus row lacks a novelty note: ${asString(row.id) || rowText(row).slice(0, 40)}`);
    }
  }
  if (pendingConsensusCount > P_MAX) {
    blocks.push(`pending_consensus count ${pendingConsensusCount} exceeds P_max ${P_MAX}`);
  }

  const stampedRiskRows = ledger.filter((row) => rowStatus(row) === 'stamped_risk');
  if (stampedRiskRows.length > 0 && status !== EARLY_EXIT_STATUS) {
    blocks.push('stamped_risk rows exist but spec Status is not BELOW_THRESHOLD_EARLY_EXIT');
  }
  if (materialRows.length > 0 && stampedRiskRows.length > materialRows.length * STAMPED_RISK_MAX_RATIO) {
    blocks.push(`stamped_risk rows exceed ${STAMPED_RISK_MAX_RATIO * 100}% of material rows`);
  }

  if (activeComponents > 1) {
    const coveredText = ledger.map(rowText).join(' ');
    for (const axis of CANONICAL_AXIS_KEYWORDS) {
      const keyword = axis.replace(/-/g, ' ');
      if (!coveredText.includes(axis) && !coveredText.includes(keyword)) {
        blocks.push(`canonical axis not covered in the ledger: ${axis}`);
      }
    }
  }

  for (const invariant of invariants) {
    if (enforcementIsProse(asString(invariant.enforcement_mechanism))) {
      blocks.push(`architectural_invariant enforcement_mechanism is prose: ${asString(invariant.id) || asString(invariant.statement).slice(0, 40)}`);
    }
  }

  if (status === EARLY_EXIT_STATUS && !(rounds.length >= MAX_ROUNDS || hasPersistedUserExitTurn(rounds))) {
    blocks.push('BELOW_THRESHOLD_EARLY_EXIT is not falsifiable: no round cap reached and no persisted user-exit turn');
  }

  return { verdict: blocks.length === 0 ? 'PASS' : 'FAIL', blocks };
}
