import { HOSTED_LIMITS } from "@send0/config";
import { receiveMessage, type InboundMessage } from "@send0/pipeline";
import { describe, expect, it, vi } from "vitest";
import { inboundDeps, type InboundEnv } from "../src/deps";

const env = (vars: Partial<InboundEnv> = {}): InboundEnv => ({
  // postgres.js connects lazily; these tests never query.
  HYPERDRIVE: { connectionString: "postgres://u:p@127.0.0.1:1/none" },
  HUB: {},
  EVENTS: { send: async () => {} },
  S3_BUCKET: "b",
  S3_REGION: "ap-south-1",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  ...vars,
});

const cfg = { mailDomains: ["send0.email"], trustedAuthservIds: ["mx.cloudflare.net"], limits: HOSTED_LIMITS, allowSignup: true };

function message(to: string) {
  const m: InboundMessage & { rejected?: string } = {
    from: "reporter@isp.example",
    to,
    raw: new Blob(["Subject: spam report\r\n\r\nhi\r\n"]).stream(),
    rawSize: 30,
    setReject(reason) {
      this.rejected = reason;
    },
    forward: vi.fn(async () => ({})),
  };
  return m;
}

describe("the hosted inbound Worker's wiring", () => {
  it("forwards postmaster@ and abuse@ with Email Routing when OPERATOR_FORWARD_TO is set", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = inboundDeps(env({ OPERATOR_FORWARD_TO: "ops@acme.dev" }));
    for (const to of ["postmaster@send0.email", "abuse@send0.email"]) {
      const m = message(to);
      await receiveMessage(m, cfg, deps);
      expect(m.forward).toHaveBeenCalledWith("ops@acme.dev");
      expect(m.rejected).toBeUndefined();
    }
    const admin = message("admin@send0.email");
    await receiveMessage(admin, cfg, deps);
    expect(admin.forward).not.toHaveBeenCalled();
    expect(admin.rejected).toBe("5.1.1 Mailbox unavailable");
  });

  it("refuses them without the var", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = inboundDeps(env());
    expect(deps.forwardReserved).toBeUndefined();
    const m = message("postmaster@send0.email");
    await receiveMessage(m, cfg, deps);
    expect(m.forward).not.toHaveBeenCalled();
    expect(m.rejected).toBe("5.1.1 Mailbox unavailable");
  });
});
