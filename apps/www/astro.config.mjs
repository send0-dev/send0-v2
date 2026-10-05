// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://send0.dev",
  // No sessions or image transforms: keeps the Worker free of KV and Images bindings.
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  integrations: [sitemap()],
  devToolbar: { enabled: false },
  trailingSlash: "never",
  build: { format: "file" },
});
