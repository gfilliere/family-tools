import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  base: "/gas/",
  plugins: [
    preact(),
    cloudflare(),
  ],
});
