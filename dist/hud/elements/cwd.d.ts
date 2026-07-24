/**
 * OMC HUD - CWD Element
 *
 * Renders current working directory with configurable format.
 * Supports OSC 8 terminal hyperlinks for supported terminals (iTerm2, WezTerm, etc.)
 */
import type { CwdFormat } from '../types.js';
/**
 * Render current working directory based on format.
 *
 * @param cwd - Absolute path to current working directory
 * @param format - Display format (relative, absolute, folder)
 * @param useHyperlinks - Wrap in OSC 8 hyperlink (file:// URL)
 * @returns Formatted path string or null if empty
 */
export declare function renderCwd(cwd: string | undefined, format?: CwdFormat, useHyperlinks?: boolean): string | null;
/**
 * Render the last-segment directory for the `stacked` preset.
 *
 * Format: ▸ …/<leaf>  (dim glyph, grey path)   safeMode: …/<leaf>
 *
 * Suppressed entirely (returns null) when the last segment echoes the branch
 * or worktree name, since that information is already shown by the branch
 * segment on the same row.
 *
 * @param cwd - Absolute working directory
 * @param branch - Current branch name (for echo suppression), if known
 * @param worktreeName - Current worktree name (for echo suppression), if known
 * @param safeMode - When true, drop the ▸ glyph
 */
export declare function renderStackedCwd(cwd: string | undefined, branch: string | null | undefined, worktreeName: string | null | undefined, safeMode?: boolean): string | null;
//# sourceMappingURL=cwd.d.ts.map