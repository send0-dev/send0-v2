import { defineConfig } from "vitest/config";

// Tests boot an in-memory Postgres (PGlite) and run migrations; give them room on a busy machine.
export default defineConfig({
  test: { testTimeout: 20_000, hookTimeout: 20_000 },
});
