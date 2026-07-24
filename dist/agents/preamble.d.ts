export declare const REPO_BRIEF_TOKEN_CAP = 400;
export interface RepoBriefOptions {
    conventions?: string[];
    keyPaths?: string[];
    buildCommand?: string;
    testCommand?: string;
    lintCommand?: string;
    worktreeRoot?: string;
    sessionId?: string;
}
export declare function buildRepoBrief(opts: RepoBriefOptions): string;
//# sourceMappingURL=preamble.d.ts.map