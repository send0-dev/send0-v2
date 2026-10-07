import { describe, expect, it } from "vitest";
import { clientIp, DEFAULT_TRUSTED_PROXIES, parseCidr, TrustedProxies } from "../src/client-ip";

const trusted = new TrustedProxies(DEFAULT_TRUSTED_PROXIES);

describe("parseCidr", () => {
  it("reads addresses and ranges, and rejects nonsense", () => {
    expect(parseCidr("10.0.0.0/8")).toEqual({ address: "10.0.0.0", prefix: 8, family: "ipv4" });
    expect(parseCidr("::1")).toEqual({ address: "::1", prefix: 128, family: "ipv6" });
    expect(parseCidr("203.0.113.7")).toMatchObject({ prefix: 32 });
    for (const bad of ["", "10.0.0.0/33", "fc00::/129", "10.0.0/8", "example.com", "1.2.3.4/8/1", "1.2.3.4/x"]) {
      expect(parseCidr(bad)).toBeNull();
    }
  });
});

describe("TrustedProxies", () => {
  it("matches loopback and private ranges by default, including IPv4-mapped IPv6", () => {
    for (const ip of ["127.0.0.1", "::1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "fd12::1", "::ffff:10.0.0.5"]) {
      expect(trusted.has(ip)).toBe(true);
    }
    for (const ip of ["203.0.113.7", "172.32.0.1", "8.8.8.8", "2001:db8::1", "::ffff:8.8.8.8", "garbage"]) {
      expect(trusted.has(ip)).toBe(false);
    }
  });
});

describe("clientIp", () => {
  it("uses the socket peer when it isn't a proxy, ignoring X-Forwarded-For", () => {
    expect(clientIp("203.0.113.7", "1.1.1.1", trusted)).toBe("203.0.113.7");
  });

  it("takes the right-most untrusted hop when a trusted proxy forwards", () => {
    expect(clientIp("172.18.0.3", "6.6.6.6, 198.51.100.4, 10.0.0.2", trusted)).toBe("198.51.100.4");
    expect(clientIp("::ffff:172.18.0.3", "198.51.100.4", trusted)).toBe("198.51.100.4");
  });

  it("falls back to the peer without a usable header", () => {
    expect(clientIp("172.18.0.3", undefined, trusted)).toBe("172.18.0.3");
    expect(clientIp("172.18.0.3", "not-an-ip", trusted)).toBe("172.18.0.3");
    expect(clientIp(undefined, "1.1.1.1", trusted)).toBeNull();
  });

  it("trusts nobody with an empty list", () => {
    expect(clientIp("127.0.0.1", "198.51.100.4", new TrustedProxies([]))).toBe("127.0.0.1");
  });
});
