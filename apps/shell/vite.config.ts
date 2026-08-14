import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// The shell owns the root, so no base prefix here.
export default defineConfig({
  plugins: [preact()],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } },
  },
});
