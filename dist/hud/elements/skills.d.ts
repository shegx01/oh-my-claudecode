/**
 * OMC HUD - Skills Element
 *
 * Renders active skills badge (ultrawork, ralph mode indicators).
 */
import type { UltraworkStateForHud, RalphStateForHud, SkillInvocation } from '../types.js';
/**
 * Render active skill badges with optional last skill.
 * Returns null if no skills are active.
 *
 * Format: ultrawork or ultrawork + ralph | skill:planner
 */
export declare function renderSkills(ultrawork: UltraworkStateForHud | null, ralph: RalphStateForHud | null, lastSkill?: SkillInvocation | null): string | null;
/**
 * Render last skill standalone (when activeSkills is disabled but lastSkill is enabled).
 */
export declare function renderLastSkill(lastSkill: SkillInvocation | null): string | null;
/**
 * Render last skill for the `stacked` preset line1: `◆ <name>` (dim glyph,
 * blue name), matching the hud-live.mjs prototype `c.dim("◆ ") + c.blue(...)`.
 * The ASCII fallback (safeMode / Windows) is `skill:<name>`.
 *
 * @param lastSkill - Last skill invocation, or null
 * @param safeMode - When true, use the ASCII `skill:<name>` form
 */
export declare function renderStackedLastSkill(lastSkill: SkillInvocation | null, safeMode?: boolean): string | null;
/**
 * Render skill with reinforcement count (for debugging).
 *
 * Format: ultrawork(r3)
 */
export declare function renderSkillsWithReinforcement(ultrawork: UltraworkStateForHud | null, ralph: RalphStateForHud | null): string | null;
//# sourceMappingURL=skills.d.ts.map