/**
 * OMC HUD - GitHub User Element
 *
 * Renders the repo owner as `@name` (dim @, white name).
 */
import { dim, white } from '../colors.js';
/**
 * Render the GitHub user identity.
 * Returns null when no owner is available.
 *
 * Format: @owner
 */
export function renderGithubUser(githubUser) {
    if (!githubUser)
        return null;
    return `${dim('@')}${white(githubUser)}`;
}
//# sourceMappingURL=github-user.js.map