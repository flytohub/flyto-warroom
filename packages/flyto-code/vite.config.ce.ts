import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const engineProxyTarget =
  process.env.VITE_ENGINE_PROXY_TARGET || "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5182,
    strictPort: true,
    proxy: {
      "/api": {
        target: engineProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4182,
    strictPort: true,
  },
  build: {
    outDir: "dist-ce",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(projectRoot, "index-ce.html"),
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react")) return "react";
          return undefined;
        },
      },
    },
  },
});
