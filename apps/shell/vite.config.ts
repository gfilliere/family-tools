import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The shell owns the root, so no base prefix here.
export default defineConfig({
  plugins: [
    preact(),
    cloudflare(),
  ],
});
