import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

// Import the exported pure gate function from the .mjs hook script.
// The module guards main() behind an entry-point check, so importing it here
// does not execute the hook.
// @ts-expect-error Local hook helper is a JS module loaded directly by the tests.
import { evaluateLedgerBridgeGate } from '../../scripts/pre-tool-enforcer.mjs';

const SPEC_BYTES = Buffer.from('# spec\nrequirements here\n');
const SPEC_HASH = createHash('sha256').update(SPEC_BYTES).digest('hex');

const readSpecOk = () => SPEC_BYTES;
const readSpecThrows = () => {
  throw new Error('ENOENT');
};

function activeDi(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    current_phase: 'spec-complete',
    spec_path: 'spec.md',
    ...overrides,
  };
}

describe('evaluateLedgerBridgeGate', () => {
  it('(a) allows a skill that is not a gated bridge', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'omc-plan',
      diState: activeDi(),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(true);
  });

  it('(a2) allows when skillName is null', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: null,
      diState: activeDi(),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(true);
  });

  it('(b) allows when there is no active deep-interview', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'autopilot',
      diState: null,
      diStale: true,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(true);
  });

  it('(b2) allows when deep-interview is active but stale', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'autopilot',
      diState: activeDi(),
      diStale: true,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(true);
  });

  it('(b3) allows when active but not yet awaiting the execution bridge', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'ralph',
      diState: activeDi({ current_phase: 'discovery' }),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(true);
  });

  it('(c) denies an active handoff with no ledger_verification record', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'autopilot',
      diState: activeDi(),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('missing');
    expect(result.reason).toContain('autopilot');
  });

  it('(d) denies an active handoff when verdict is FAIL', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'ralph',
      diState: activeDi({ ledger_verification: { verdict: 'FAIL', spec_hash: SPEC_HASH } }),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('FAIL');
  });

  it('(e) denies an active handoff when PASS but spec hash mismatches', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'team',
      diState: activeDi({ ledger_verification: { verdict: 'PASS', spec_hash: 'deadbeef' } }),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('hash-mismatch');
  });

  it('(f) allows an active handoff when PASS and spec hash matches', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'autopilot',
      diState: activeDi({ ledger_verification: { verdict: 'PASS', spec_hash: SPEC_HASH } }),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('(g) denies an active handoff when the spec file is unreadable', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'autopilot',
      diState: activeDi({ ledger_verification: { verdict: 'PASS', spec_hash: SPEC_HASH } }),
      diStale: false,
      readSpecBytes: readSpecThrows,
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('spec-unreadable');
  });

  it('(g2) denies when spec_path is missing while active with a PASS record', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'autopilot',
      diState: activeDi({ spec_path: undefined, ledger_verification: { verdict: 'PASS', spec_hash: SPEC_HASH } }),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('spec-unreadable');
  });

  it('recognizes the awaiting_execution_bridge flag as a handoff signal', () => {
    const result = evaluateLedgerBridgeGate({
      skillName: 'autopilot',
      diState: activeDi({ current_phase: 'discovery', awaiting_execution_bridge: true }),
      diStale: false,
      readSpecBytes: readSpecOk,
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('missing');
  });

  it('accepts pending_approval and pending-approval phase spellings', () => {
    for (const phase of ['pending_approval', 'pending-approval']) {
      const result = evaluateLedgerBridgeGate({
        skillName: 'autopilot',
        diState: activeDi({ current_phase: phase }),
        diStale: false,
        readSpecBytes: readSpecOk,
      });
      expect(result.allow).toBe(false);
    }
  });
});
