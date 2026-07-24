/**
 * OMC HUD - Health Sigil Element
 *
 * Renders a single dot whose color reflects the overall session state:
 *   green  - normal
 *   yellow - agents active OR ctx >= 70 OR 5h >= 70
 *   red    - ctx >= 85 OR 5h >= 90
 */
export interface HealthSigilInput {
    /** Context window used percentage (0-100) */
    contextPercent: number;
    /** 5-hour rate limit used percentage (0-100), null when unavailable */
    fiveHourPercent: number | null;
    /** Whether any subagents are currently active */
    agentsActive: boolean;
}
/**
 * Render the health sigil dot.
 *
 * @param input - Aggregated session-state signals
 * @param safeMode - When true, emit ASCII '*' instead of the ● glyph
 */
export declare function renderHealthSigil(input: HealthSigilInput, safeMode?: boolean): string;
//# sourceMappingURL=health-sigil.d.ts.map