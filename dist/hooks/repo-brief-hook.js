import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveOmcPath } from '../lib/worktree-paths.js';
import { buildRepoBrief } from '../agents/preamble.js';
const BRIEF_ELIGIBLE_AGENT_TYPES = new Set([
    'executor',
    'oh-my-claudecode:executor',
    'git-master',
    'oh-my-claudecode:git-master',
    'test-engineer',
    'oh-my-claudecode:test-engineer',
]);
const FACT_CACHE = new Map();
export function __resetRepoBriefFactCache() {
    FACT_CACHE.clear();
}
export function isBriefEligibleAgentType(agentType) {
    if (!agentType)
        return false;
    return BRIEF_ELIGIBLE_AGENT_TYPES.has(agentType.trim());
}
function pickNpmScript(scripts, candidates) {
    if (!scripts)
        return undefined;
    for (const name of candidates) {
        if (typeof scripts[name] === 'string' && scripts[name].trim().length > 0) {
            return `npm run ${name}`;
        }
    }
    return undefined;
}
function gatherProgressConventions(worktreeRoot) {
    const raw = readProgressRawSafe(worktreeRoot);
    if (!raw)
        return [];
    const lines = raw.split('\n');
    const out = [];
    let inPatterns = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '## Codebase Patterns' || trimmed === '## Codebase Facts') {
            inPatterns = true;
            continue;
        }
        if (!inPatterns)
            continue;
        if (trimmed === '---' || trimmed.startsWith('## '))
            break;
        if (trimmed.startsWith('-')) {
            const pattern = trimmed.slice(1).trim();
            if (pattern)
                out.push(pattern);
        }
    }
    return out;
}
function readProgressRawSafe(worktreeRoot) {
    const candidates = [
        join(worktreeRoot, 'progress.txt'),
        resolveOmcPath('progress.txt', worktreeRoot),
    ];
    for (const path of candidates) {
        try {
            if (existsSync(path))
                return readFileSync(path, 'utf-8');
        }
        catch {
            continue;
        }
    }
    return null;
}
function scanFacts(worktreeRoot) {
    let scripts;
    try {
        const pkgPath = join(worktreeRoot, 'package.json');
        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            scripts = pkg.scripts;
        }
    }
    catch {
        scripts = undefined;
    }
    const buildCommand = pickNpmScript(scripts, ['build', 'compile', 'tsc']);
    const testCommand = pickNpmScript(scripts, ['test', 'test:unit', 'vitest']);
    const lintCommand = pickNpmScript(scripts, ['lint', 'lint:fix', 'eslint']);
    const conventions = gatherProgressConventions(worktreeRoot);
    if (!buildCommand && !testCommand && !lintCommand && conventions.length === 0) {
        return null;
    }
    return {
        ...(conventions.length > 0 ? { conventions } : {}),
        ...(buildCommand ? { buildCommand } : {}),
        ...(testCommand ? { testCommand } : {}),
        ...(lintCommand ? { lintCommand } : {}),
    };
}
function getFacts(worktreeRoot, sessionId) {
    const key = `${worktreeRoot}::${sessionId}`;
    if (FACT_CACHE.has(key)) {
        return FACT_CACHE.get(key) ?? null;
    }
    const facts = scanFacts(worktreeRoot);
    FACT_CACHE.set(key, facts);
    return facts;
}
export function buildRepoBriefForSubagent(agentType, worktreeRoot, sessionId) {
    try {
        if (!isBriefEligibleAgentType(agentType))
            return null;
        const facts = getFacts(worktreeRoot, sessionId);
        if (!facts)
            return null;
        return buildRepoBrief({ ...facts, worktreeRoot, sessionId });
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=repo-brief-hook.js.map