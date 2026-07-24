/**
 * OMC HUD - Context Element
 *
 * Renders context window usage display.
 */
import type { HudLabels, HudThresholds } from '../types.js';
/**
 * Reset cached context display state.
 * Useful for test isolation and fresh render sessions.
 */
export declare function resetContextDisplayState(): void;
/**
 * Apply display-layer hysteresis so small refresh-to-refresh ctx fluctuations
 * do not visibly jitter in the HUD.
 */
export declare function getStableContextDisplayPercent(percent: number, thresholds: HudThresholds, displayScope?: string | null): number;
/**
 * Render context window percentage.
 *
 * Format: ctx:67%
 */
export declare function renderContext(percent: number, thresholds: HudThresholds, displayScope?: string | null, labels?: Pick<HudLabels, 'context'>): string | null;
/**
 * Render context window with visual bar.
 *
 * Format: ctx:[████░░░░░░]67%
 */
export declare function renderContextWithBar(percent: number, thresholds: HudThresholds, barWidth?: number, displayScope?: string | null, labels?: Pick<HudLabels, 'context'>): string | null;
/**
 * Render context window with a dot meter (used by the `stacked` preset).
 *
 * Format: ctx ●●●○○ 67%          (label dim, dots + number in ramp color)
 *         ctx ●●●●● 92% ⚠ /compact   (compact warning appended when >= critical)
 *
 * safeMode replaces the dot meter with a `#`/`-` bar and drops the ⚠ glyph.
 */
export declare function renderContextWithDots(percent: number, thresholds: HudThresholds, displayScope?: string | null, labels?: Pick<HudLabels, 'context'>, safeMode?: boolean): string | null;
//# sourceMappingURL=context.d.ts.map