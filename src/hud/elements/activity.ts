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

import type {
  RalphStateForHud,
  PrdStateForHud,
  ActiveAgent,
  TodoItem,
  BackgroundTask,
} from '../types.js';
import type { AutopilotStateForHud } from './autopilot.js';
import { RESET, dim } from '../colors.js';

const MAGENTA = '\x1b[35m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const WHITE = '\x1b[37m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';

/** Concurrent-background cap, mirroring the background element convention. */
const MAX_CONCURRENT = 5;

export interface ActivityInput {
  ralph: RalphStateForHud | null;
  autopilot: AutopilotStateForHud | null;
  prd: PrdStateForHud | null;
  agents: ActiveAgent[];
  todos: TodoItem[];
  backgroundTasks: BackgroundTask[];
}

function agentLabel(agent: ActiveAgent): string {
  const raw = agent.name || agent.type || 'agent';
  return raw.split(/\s+/)[0];
}

/**
 * Render the activity row as a single joined string, or null when no chip is active.
 *
 * @param input - Aggregated workflow/activity state
 * @param safeMode - When true, replace every glyph with an ASCII fallback
 */
export function renderActivity(input: ActivityInput, safeMode = false): string | null {
  const sep = dim(' · ');
  const chips: string[] = [];

  if (input.ralph?.active) {
    const { iteration, maxIterations } = input.ralph;
    const warn = iteration >= maxIterations - 1;
    const glyph = safeMode ? 'ralph ' : 'ρ ';
    const color = warn ? YELLOW : MAGENTA;
    const warnGlyph = warn ? (safeMode ? ' !' : ' ⚠') : '';
    chips.push(`${color}${glyph}${iteration}/${maxIterations}${warnGlyph}${RESET}`);
  }

  if (input.autopilot?.active) {
    const mode =
      input.autopilot.workflow?.currentStage || input.autopilot.phase || 'run';
    const glyph = safeMode ? 'auto ' : '▶ ';
    chips.push(`${MAGENTA}${glyph}auto:${mode}${RESET}`);
  }

  if (input.prd?.currentStoryId) {
    const glyph = safeMode ? '' : '❏ ';
    chips.push(`${CYAN}${glyph}${input.prd.currentStoryId}${RESET}`);
  }

  const runningAgents = input.agents.filter((a) => a.status === 'running');
  if (runningAgents.length > 0) {
    const names = runningAgents.map(agentLabel).join(',');
    const glyph = safeMode ? 'A:' : '⚡ ';
    chips.push(`${BOLD}${YELLOW}${glyph}${names}${RESET}`);
  }

  if (input.todos.length > 0) {
    const done = input.todos.filter((t) => t.status === 'completed').length;
    const total = input.todos.length;
    const color = done === total ? GREEN : WHITE;
    const glyph = safeMode ? '' : '☑ ';
    chips.push(`${color}${glyph}${done}/${total}${RESET}`);
  }

  const running = input.backgroundTasks.filter((t) => t.status === 'running').length;
  if (running > 0) {
    const glyph = safeMode ? 'bg ' : '⟳ bg ';
    chips.push(`${BLUE}${glyph}${running}/${MAX_CONCURRENT}${RESET}`);
  }

  return chips.length > 0 ? chips.join(sep) : null;
}
