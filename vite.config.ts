import { defineConfig } from 'vite';

// Relative asset paths so the build also works from an itch.io subfolder.
export default defineConfig({ base: './' });
