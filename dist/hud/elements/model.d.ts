/**
 * OMC HUD - Model Element
 *
 * Renders the current model name.
 */
import { type HudLabels, type ModelFormat } from '../types.js';
/**
 * Format model name for display.
 * Converts model IDs to friendly names based on the requested format.
 */
export declare function formatModelName(modelId: string | null | undefined, format?: ModelFormat): string | null;
/**
 * Render model element.
 */
export declare function renderModel(modelId: string | null | undefined, format?: ModelFormat, labels?: Pick<HudLabels, 'model'>): string | null;
/**
 * Render the model chip for the `stacked` preset: a bare, bold, blue name
 * (e.g. **Opus 4.8**) with no `Model:` label — matching the hud-live.mjs
 * prototype `c.bold(c.blue(x.model))`. Bold is emitted inside the color span
 * so it actually applies (a naive bold(cyan(...)) is a no-op because the inner
 * RESET terminates the bold immediately).
 */
export declare function renderStackedModel(modelId: string | null | undefined, format?: ModelFormat): string | null;
//# sourceMappingURL=model.d.ts.map