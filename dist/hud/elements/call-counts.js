/**
 * OMC HUD - Call Counts Element
 *
 * Renders real-time counts of tool calls, agent invocations, and skill usages
 * on the right side of the HUD status line. (Issue #710)
 *
 * Format: 🔧42 🤖7 ⚡3  (emoji)
 * Format: T:42 A:7 S:3   (ASCII fallback / explicit override)
 */
// Windows terminals (cmd.exe, PowerShell, Windows Terminal) may not render
// multi-byte emoji correctly, causing HUD layout corruption.
// WSL terminals may also lack emoji support.
import { isWSL } from '../../platform/index.js';
import { DEFAULT_HUD_LABELS } from '../types.js';
function shouldUseAscii(format = 'auto') {
    if (format === 'ascii')
        return true;
    if (format === 'emoji')
        return false;
    return process.platform === 'win32' || isWSL();
}
function getIcons(format = 'auto', labels = DEFAULT_HUD_LABELS, iconOverrides) {
    const useAscii = shouldUseAscii(format);
    const icons = {
        tool: useAscii ? `${labels.tool}:` : '\u{1F527}',
        agent: useAscii ? `${labels.agent}:` : '\u{1F916}',
        skill: useAscii ? `${labels.skill}:` : '\u26A1',
    };
    // Emoji-path icon overrides (e.g. gear \u2699 for the stacked preset). Never
    // applied in ASCII mode so custom glyphs cannot leak past the ASCII gate.
    if (!useAscii && iconOverrides) {
        if (iconOverrides.tool)
            icons.tool = iconOverrides.tool;
        if (iconOverrides.agent)
            icons.agent = iconOverrides.agent;
        if (iconOverrides.skill)
            icons.skill = iconOverrides.skill;
    }
    return icons;
}
/**
 * Render call counts badge.
 *
 * Omits a counter entirely when its count is zero to keep output terse.
 * Returns null if all counts are zero (nothing to show).
 *
 * @param toolCalls - Total tool_use blocks seen in transcript
 * @param agentInvocations - Total Task/proxy_Task calls seen in transcript
 * @param skillUsages - Total Skill/proxy_Skill calls seen in transcript
 */
export function renderCallCounts(toolCalls, agentInvocations, skillUsages, format = 'auto', labels = DEFAULT_HUD_LABELS, iconOverrides) {
    const parts = [];
    const icons = getIcons(format, labels, iconOverrides);
    if (toolCalls > 0) {
        parts.push(`${icons.tool}${toolCalls}`);
    }
    if (agentInvocations > 0) {
        parts.push(`${icons.agent}${agentInvocations}`);
    }
    if (skillUsages > 0) {
        parts.push(`${icons.skill}${skillUsages}`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
}
//# sourceMappingURL=call-counts.js.map