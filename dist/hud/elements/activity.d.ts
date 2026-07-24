/**
 * OMC HUD - Activity Row Element
 *
 * Composes the `stacked` preset's third row: a single inline-joined line of
 * dynamic workflow/activity chips, each shown only while active.
 *
 * Chips (priority order):
 *   ralph       ρ cur/max        magenta (yellow + ⚠ when cur >= max-1)
 *   autopilot   ▶ auto:<mode>    magenta
 *   prd         ❏ <id>           cyan
 *   agents      ⚡ name1,name2    bold yellow
 *   todos       ☑ done/total     green when complete, white otherwise
 *   background  ⟳ bg running/max blue
 */
import type { RalphStateForHud, PrdStateForHud, ActiveAgent, TodoItem, BackgroundTask } from '../types.js';
import type { AutopilotStateForHud } from './autopilot.js';
export interface ActivityInput {
    ralph: RalphStateForHud | null;
    autopilot: AutopilotStateForHud | null;
    prd: PrdStateForHud | null;
    agents: ActiveAgent[];
    todos: TodoItem[];
    backgroundTasks: BackgroundTask[];
}
/**
 * Render the activity row as a single joined string, or null when no chip is active.
 *
 * @param input - Aggregated workflow/activity state
 * @param safeMode - When true, replace every glyph with an ASCII fallback
 */
export declare function renderActivity(input: ActivityInput, safeMode?: boolean): string | null;
//# sourceMappingURL=activity.d.ts.map