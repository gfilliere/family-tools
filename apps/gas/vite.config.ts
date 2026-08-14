import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/gas/",
  plugins: [preact()],
  build: { outDir: "dist/client/gas", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/gas/api": { target: "http://127.0.0.1:8787", changeOrigin: true } },
  },
});
