export declare const P_MAX = 3;
export declare const STAMPED_RISK_MAX_RATIO = 0.5;
export declare const MAX_ROUNDS = 20;
export declare const CANONICAL_AXIS_KEYWORDS: readonly ["dependency-direction", "module-boundaries", "error-taxonomy", "transaction-boundaries", "consistency-model", "schema-evolution", "api-versioning", "cross-cutting-concerns", "testability-seams", "failure-isolation", "performance-envelope", "deploy-topology"];
export interface LedgerVerdict {
    verdict: 'PASS' | 'FAIL';
    blocks: string[];
}
export declare function evaluateLedgerVerification(diState: unknown): LedgerVerdict;
//# sourceMappingURL=ledger-verification.d.ts.map