import { defineConfig } from 'vitest/config';

// Relative asset paths so the build also works from an itch.io subfolder.
// Tests skip agent worktrees under .claude/, which hold copies of src/.
export default defineConfig({ base: './', test: { exclude: ['**/node_modules/**', '.claude/**'] } });
