import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, "index.html"),
        game: resolve(import.meta.dirname, "game.html"),
      },
    },
  },
});
