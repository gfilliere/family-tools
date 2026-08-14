import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/admin/",
  plugins: [preact()],
  build: { outDir: "dist/client/admin", emptyOutDir: true },
  server: {
    port: 5174,
    proxy: { "/admin/api": { target: "http://127.0.0.1:8788", changeOrigin: true } },
  },
});
