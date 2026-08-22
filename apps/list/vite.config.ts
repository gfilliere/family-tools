import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/list/",
  plugins: [preact()],
  build: { outDir: "dist/client/list", emptyOutDir: true },
  server: {
    port: 5175,
    proxy: { "/list/api": { target: "http://127.0.0.1:8788", changeOrigin: true } },
  },
});
