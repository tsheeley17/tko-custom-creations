import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const SITE_URL = process.env.SITE_URL || "https://YOUR-DOMAIN.com";
const BASE_PATH = process.env.BASE_PATH || "/";

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  output: "static",
  integrations: [sitemap()],
  trailingSlash: "always",
});
