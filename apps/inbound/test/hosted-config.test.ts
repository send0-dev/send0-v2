import { readFileSync } from "node:fs";
import { HOSTED_LIMITS, parseCoreConfig } from "@send0/config";
import { parse } from "jsonc-parser";
import { expect, it } from "vitest";

it("the hosted inbound Worker config parses to the hosted settings", () => {
  const wrangler = parse(readFileSync("wrangler.jsonc", "utf8")) as { vars: Record<string, string> };
  expect(parseCoreConfig(wrangler.vars)).toEqual({
    mailDomains: ["send0.email"],
    limits: HOSTED_LIMITS,
    allowSignup: true,
    trustedAuthservIds: ["mx.cloudflare.net"],
  });
});
