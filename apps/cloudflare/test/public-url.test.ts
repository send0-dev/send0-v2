import { describe, expect, it } from "vitest";
import { canonicalRedirect, publicUrlFor } from "../src/public-url";

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

describe("canonicalRedirect", () => {
  const location = (configured: string | undefined, url: string, init?: RequestInit) => {
    const res = canonicalRedirect(configured, new Request(url, init));
    if (!res) return null;
    expect(res.status).toBe(308);
    return res.headers.get("location");
  };

  it("sends other hostnames to PUBLIC_URL, keeping the path and query", () => {
    expect(location("https://mail.acme.dev", "https://send0.someone.workers.dev/v1/inboxes?limit=5&q=a%20b")).toBe(
      "https://mail.acme.dev/v1/inboxes?limit=5&q=a%20b",
    );
    expect(location("https://mail.acme.dev", "https://send0.someone.workers.dev/auth/login", { method: "POST", body: "{}" })).toBe(
      "https://mail.acme.dev/auth/login",
    );
    expect(location("https://mail.acme.dev:8443", "https://mail.acme.dev/healthz")).toBe("https://mail.acme.dev:8443/healthz");
  });

  it("leaves requests already on PUBLIC_URL alone", () => {
    expect(location("https://mail.acme.dev", "https://mail.acme.dev/v1/inboxes")).toBeNull();
    expect(location("http://localhost:8787", "http://localhost:8787/healthz")).toBeNull();
  });

  it("upgrades plain http, except on a local machine", () => {
    expect(location(undefined, "http://send0.someone.workers.dev/v1/inboxes?x=1")).toBe("https://send0.someone.workers.dev/v1/inboxes?x=1");
    expect(location("https://mail.acme.dev", "http://mail.acme.dev/healthz")).toBe("https://mail.acme.dev/healthz");
    for (const url of ["http://localhost:8787/healthz", "http://127.0.0.1:8787/healthz", "http://[::1]:8787/healthz"]) {
      expect(location(undefined, url)).toBeNull();
    }
  });
});
