import { schema } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedMailDomains } from "../src/domains";

describe("seedMailDomains", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("adds each domain as a verified shared domain, once, whatever the case", async () => {
    const now = new Date("2026-10-07T00:00:00Z");
    await seedMailDomains(t.db, ["agents.acme.dev", "bots.acme.dev"], now);
    await seedMailDomains(t.db, ["AGENTS.acme.dev", "bots.acme.dev"], new Date());
    const rows = await t.db.select().from(schema.domains).orderBy(schema.domains.name);
    expect(rows.map((r) => [r.name, r.kind, r.status, r.verifiedAt?.toISOString(), r.orgId])).toEqual([
      ["agents.acme.dev", "shared", "verified", now.toISOString(), null],
      ["bots.acme.dev", "shared", "verified", now.toISOString(), null],
    ]);
    expect(rows.every((r) => r.id.startsWith("dom_"))).toBe(true);
  });

  it("warns about an existing row for a mail domain that isn't shared and verified", async () => {
    await t.db.insert(schema.domains).values({ id: "dom_pending", name: "Pending.acme.dev", kind: "custom", status: "pending" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedMailDomains(t.db, ["agents.acme.dev", "pending.acme.dev"], new Date());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({
      event: "mail_domain.unexpected_row",
      domain_id: "dom_pending",
      kind: "custom",
      status: "pending",
    });
    warn.mockRestore();
  });
});
