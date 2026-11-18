import path from "path";

import react from "@vitejs/plugin-react";
import { devvit } from "@devvit/start/vite";
import { defineConfig } from "vite";

/**
 * The Reddit build: client entries from src/client (splash.html, game.html) into dist/client,
 * and src/server/index.ts bundled to dist/server/index.cjs. The plugin only supports `vite build`;
 * the browser-only dev server keeps using vite.config.ts.
 */
export default defineConfig({
  plugins: [react(), devvit()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
