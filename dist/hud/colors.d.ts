/**
 * OMC HUD - ANSI Color Utilities
 *
 * Terminal color codes for statusline rendering.
 * Based on claude-hud reference implementation.
 */
export declare const RESET = "\u001B[0m";
export declare function green(text: string): string;
export declare function yellow(text: string): string;
export declare function red(text: string): string;
export declare function cyan(text: string): string;
export declare function magenta(text: string): string;
export declare function blue(text: string): string;
export declare function dim(text: string): string;
export declare function bold(text: string): string;
export declare function white(text: string): string;
export declare function grey(text: string): string;
export declare function brightCyan(text: string): string;
export declare function brightMagenta(text: string): string;
export declare function brightBlue(text: string): string;
/**
 * Get color code based on context window percentage.
 */
export declare function getContextColor(percent: number): string;
/**
 * Get color code based on ralph iteration.
 */
export declare function getRalphColor(iteration: number, maxIterations: number): string;
/**
 * Get color for todo progress.
 */
export declare function getTodoColor(completed: number, total: number): string;
/**
 * Get color for model tier.
 * - Opus: Magenta (high-powered)
 * - Sonnet: Yellow (standard)
 * - Haiku: Green (lightweight)
 */
export declare function getModelTierColor(model: string | undefined): string;
/**
 * Get color for agent duration (warning/alert).
 * - <2min: normal (green)
 * - 2-5min: warning (yellow)
 * - >5min: alert (red)
 */
export declare function getDurationColor(durationMs: number): string;
/**
 * Create a colored progress bar.
 */
export declare function coloredBar(percent: number, width?: number): string;
/**
 * Create a dot-style meter: filled dots (ramp color) + empty dots (dim).
 * Used by the `stacked` preset for compact vitals (● ● ● ○ ○).
 *
 * @param percent - 0-100 usage percentage (high = more filled)
 * @param cells - Total number of dots (default 5)
 * @param colorCode - ANSI color code for filled dots (default = context ramp)
 * @returns Rendered dot meter with trailing RESET
 */
export declare function dotMeter(percent: number, cells?: number, colorCode?: string): string;
/**
 * Create a simple numeric display with color.
 */
export declare function coloredValue(value: number, total: number, getColor: (value: number, total: number) => string): string;
//# sourceMappingURL=colors.d.ts.map