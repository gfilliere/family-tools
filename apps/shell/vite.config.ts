import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// The shell owns the root, so no base prefix here.
export default defineConfig({
  plugins: [preact()],
  build: { outDir: "dist/client", emptyOutDir: true },
});
