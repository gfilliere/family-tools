import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// base and outDir must agree with the Worker route (/gas/*) so that a request
// for /gas/assets/x.js resolves to dist/client/gas/assets/x.js inside the
// assets directory. This is the one fiddly part of path-based routing.
export default defineConfig({
  base: "/gas/",
  plugins: [preact()],
  build: { outDir: "dist/client/gas", emptyOutDir: true },
});
