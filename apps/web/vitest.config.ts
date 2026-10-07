import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// Two projects: the Worker's routes in Node (against the real API), and the React app in jsdom
// (against MSW). The Cloudflare Vite plugin isn't needed (or wanted) in either. The worker tests
// boot an in-memory Postgres, which needs longer timeouts on a busy machine.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "worker", include: ["test/**/*.test.ts"], environment: "node", testTimeout: 20_000, hookTimeout: 20_000 },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: { name: "ui", include: ["src/**/*.test.{ts,tsx}"], environment: "jsdom", setupFiles: ["src/test/setup.ts"] },
      },
    ],
  },
});
