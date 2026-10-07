import { defineConfig } from "vitest/config";

export default defineConfig({
  // Each test file boots an in-memory Postgres (PGlite) and runs migrations; give it room on a busy machine.
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
