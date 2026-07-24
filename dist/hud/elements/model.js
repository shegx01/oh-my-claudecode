/**
 * OMC HUD - Model Element
 *
 * Renders the current model name.
 */
import { cyan } from '../colors.js';
import { truncateToWidth } from '../../utils/string-width.js';
import { DEFAULT_HUD_LABELS } from '../types.js';
/**
 * Extract version from a model ID string.
 * E.g., 'claude-opus-4-8-20260528' -> '4.8'
 *       'claude-sonnet-4-6-20260217' -> '4.6'
 *       'claude-haiku-4-5-20251001' -> '4.5'
 *       'claude-3-5-sonnet-20241022' -> '3.5'
 *       'claude-3-opus-20240229' -> '3'
 *       'claude-sonnet-5' -> '5'
 */
function extractVersion(modelId) {
    // Match hyphenated ID patterns like opus-4-6, sonnet-4-5, haiku-4-5
    const idMatch = modelId.match(/(?:opus|sonnet|haiku)-(\d+)-(\d+)/i);
    if (idMatch)
        return `${idMatch[1]}.${idMatch[2]}`;
    // Match Claude family IDs with a single trailing numeric version like claude-sonnet-5
    const singleSegmentIdMatch = modelId.match(/(?:^|[.-])claude-(?:opus|sonnet|haiku)-(\d+)$/i);
    if (singleSegmentIdMatch)
        return singleSegmentIdMatch[1];
    // Match legacy raw ID patterns like claude-3-5-sonnet-20241022 and claude-3-opus-20240229
    const legacyIdMatch = modelId.match(/claude-(\d+)(?:-(\d+))?-(?:opus|sonnet|haiku)/i);
    if (legacyIdMatch) {
        return legacyIdMatch[2] ? `${legacyIdMatch[1]}.${legacyIdMatch[2]}` : legacyIdMatch[1];
    }
    // Match display name patterns like "Sonnet 4.5", "Opus 4.8"
    const displayMatch = modelId.match(/(?:opus|sonnet|haiku)\s+(\d+(?:\.\d+)?)/i);
    if (displayMatch)
        return displayMatch[1];
    return null;
}
/**
 * Format model name for display.
 * Converts model IDs to friendly names based on the requested format.
 */
export function formatModelName(modelId, format = 'short') {
    if (!modelId)
        return null;
    if (format === 'full') {
        return truncateToWidth(modelId, 40);
    }
    const id = modelId.toLowerCase();
    let shortName = null;
    if (id.includes('opus'))
        shortName = 'Opus';
    else if (id.includes('sonnet'))
        shortName = 'Sonnet';
    else if (id.includes('haiku'))
        shortName = 'Haiku';
    if (!shortName) {
        // Return original if not recognized (CJK-aware truncation)
        return truncateToWidth(modelId, 20);
    }
    if (format === 'versioned') {
        const version = extractVersion(id);
        if (version)
            return `${shortName} ${version}`;
    }
    return shortName;
}
/**
 * Render model element.
 */
export function renderModel(modelId, format = 'versioned', labels = DEFAULT_HUD_LABELS) {
    const name = formatModelName(modelId, format);
    if (!name)
        return null;
    return cyan(`${labels.model}: ${name}`);
}
// ANSI codes for the stacked (bold, bare) model chip.
const BOLD = '\x1b[1m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
/**
 * Render the model chip for the `stacked` preset: a bare, bold, blue name
 * (e.g. **Opus 4.8**) with no `Model:` label — matching the hud-live.mjs
 * prototype `c.bold(c.blue(x.model))`. Bold is emitted inside the color span
 * so it actually applies (a naive bold(cyan(...)) is a no-op because the inner
 * RESET terminates the bold immediately).
 */
export function renderStackedModel(modelId, format = 'versioned') {
    const name = formatModelName(modelId, format);
    if (!name)
        return null;
    return `${BOLD}${BLUE}${name}${RESET}`;
}
//# sourceMappingURL=model.js.map