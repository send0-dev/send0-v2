import { defineConfig } from "vitest/config";

// Tests run the Worker code directly in Node; the Cloudflare Vite plugin isn't needed (or wanted) here.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
