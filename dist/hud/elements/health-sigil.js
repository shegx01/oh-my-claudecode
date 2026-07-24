/**
 * OMC HUD - Health Sigil Element
 *
 * Renders a single dot whose color reflects the overall session state:
 *   green  - normal
 *   yellow - agents active OR ctx >= 70 OR 5h >= 70
 *   red    - ctx >= 85 OR 5h >= 90
 */
import { RESET } from '../colors.js';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
/**
 * Render the health sigil dot.
 *
 * @param input - Aggregated session-state signals
 * @param safeMode - When true, emit ASCII '*' instead of the ● glyph
 */
export function renderHealthSigil(input, safeMode = false) {
    const glyph = safeMode ? '*' : '●';
    const fiveHour = input.fiveHourPercent ?? 0;
    const hot = input.contextPercent >= 85 || fiveHour >= 90;
    const warm = input.agentsActive || input.contextPercent >= 70 || fiveHour >= 70;
    const color = hot ? RED : warm ? YELLOW : GREEN;
    return `${color}${glyph}${RESET}`;
}
//# sourceMappingURL=health-sigil.js.map