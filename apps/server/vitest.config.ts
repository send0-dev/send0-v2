import { defineConfig } from "vitest/config";

// The Postgres integration test migrates a fresh database and boots pg-boss; give it room on a busy machine.
export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
