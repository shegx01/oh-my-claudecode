export interface BranchGuardInput {
    session_id?: string;
    cwd?: string;
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: {
        subagent_type?: string;
        [k: string]: unknown;
    };
}
export interface HookOutput {
    continue: boolean;
    suppressOutput?: boolean;
    hookSpecificOutput?: {
        hookEventName: string;
        permissionDecision?: 'allow' | 'deny' | 'ask';
        permissionDecisionReason?: string;
    };
}
export declare function processBranchGuard(input: BranchGuardInput): HookOutput;
//# sourceMappingURL=index.d.ts.map