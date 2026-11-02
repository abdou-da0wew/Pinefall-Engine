import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: "./",
  plugins:
    process.env.NIGHTFALL === "1"
      ? [
          {
            name: "nightfall-entry",
            configureServer(server) {
              server.middlewares.use((req, _res, next) => {
                if (req.url === "/") req.url = "/nightfall.html";
                next();
              });
            },
          },
        ]
      : [],
  optimizeDeps: {
    include: [
      "three",
      "three/addons/loaders/GLTFLoader.js",
      "three/addons/loaders/FBXLoader.js",
      "three/addons/exporters/GLTFExporter.js",
      "three/addons/utils/SkeletonUtils.js",
    ],
  },
  worker: { format: "es" },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    watch: { ignored: ["**/build/**", "**/build-desktop/**"] },
  },
  build: {
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, "index.html"),
        game: resolve(import.meta.dirname, "game.html"),
        nightfall: resolve(import.meta.dirname, "nightfall.html"),
      },
    },
  },
});
