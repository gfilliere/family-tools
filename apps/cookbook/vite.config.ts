import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/cookbook/",
  plugins: [preact()],
  build: { outDir: "dist/client/cookbook", emptyOutDir: true },
  server: {
    port: 5174,
    proxy: {
      "/cookbook/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/cookbook/share": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
