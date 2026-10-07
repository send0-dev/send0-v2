import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERATED_FILE, renderMigrationsModule } from "../scripts/bundle-migrations";

describe("src/migrations.generated.ts", () => {
  it("is up to date with the migrations folder (run `pnpm --filter @send0/db bundle-migrations`)", () => {
    expect(readFileSync(GENERATED_FILE, "utf8")).toBe(renderMigrationsModule());
  });
});
