/**
 * OMC HUD - Reasoning Effort Element
 *
 * Renders the reasoning-effort level as `⚡ <level>` (dim bolt, cyan level).
 */
/**
 * Render the reasoning-effort level, plus a separate `fast` token when
 * fast_mode is active (matches the hud-live.mjs prototype `x.fast`).
 * Returns null when neither an effort level nor fast mode is present.
 *
 * Format: ⚡ high · fast   (safeMode: eff high · fast)
 *
 * @param level - Reasoning-effort level (e.g. 'high', 'medium', 'low')
 * @param safeMode - When true, use an ASCII 'eff ' prefix instead of the ⚡ glyph
 * @param fastMode - When true, append a yellow `fast` token
 */
export declare function renderEffort(level: string | null | undefined, safeMode?: boolean, fastMode?: boolean): string | null;
//# sourceMappingURL=effort.d.ts.map