import { describe, expect, it } from "vitest";
import { publicUrlFor } from "../src/public-url";

describe("publicUrlFor", () => {
  it("uses the request's origin when PUBLIC_URL is unset", () => {
    expect(publicUrlFor(undefined, new Request("https://send0.someone.workers.dev/v1/inboxes?x=1"))).toBe(
      "https://send0.someone.workers.dev",
    );
    expect(publicUrlFor(undefined, new Request("http://localhost:8787/healthz"))).toBe("http://localhost:8787");
  });

  it("prefers PUBLIC_URL", () => {
    expect(publicUrlFor("https://mail.acme.dev", new Request("https://send0.someone.workers.dev/"))).toBe("https://mail.acme.dev");
  });
});
