import { BlockList, isIP } from "node:net";

/** Loopback and private ranges: Caddy (or any reverse proxy) reaches us over the Docker network. */
export const DEFAULT_TRUSTED_PROXIES = ["127.0.0.0/8", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"];

/** `::ffff:10.0.0.1` (an IPv4 peer on a dual-stack socket) is just 10.0.0.1. */
function normalize(ip: string): string {
  const v = ip.trim().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(v);
  return mapped ? mapped[1]! : v;
}

/** Parses an IP or CIDR (`10.0.0.0/8`, `::1`, `fc00::/7`); null when invalid. */
export function parseCidr(entry: string): { address: string; prefix: number; family: "ipv4" | "ipv6" } | null {
  const [addr, bits, ...rest] = entry.trim().split("/");
  if (rest.length || !addr) return null;
  const version = isIP(addr);
  if (!version) return null;
  const max = version === 4 ? 32 : 128;
  if (bits !== undefined && !/^\d{1,3}$/.test(bits)) return null;
  const prefix = bits === undefined ? max : Number(bits);
  if (prefix > max) return null;
  return { address: addr, prefix, family: version === 4 ? "ipv4" : "ipv6" };
}

/** A set of trusted proxy addresses and ranges. Entries must already be valid (see `parseCidr`). */
export class TrustedProxies {
  private readonly list = new BlockList();

  constructor(entries: readonly string[]) {
    for (const e of entries) {
      const c = parseCidr(e);
      if (!c) throw new Error(`Invalid proxy address or range: ${e}`);
      this.list.addSubnet(c.address, c.prefix, c.family);
    }
  }

  has(ip: string): boolean {
    const v = normalize(ip);
    const version = isIP(v);
    return version !== 0 && this.list.check(v, version === 4 ? "ipv4" : "ipv6");
  }
}

/**
 * The real client address. The socket peer, unless the peer is a trusted proxy: then the right-most
 * X-Forwarded-For hop that isn't itself a trusted proxy (hops further left are client-controlled).
 */
export function clientIp(peer: string | undefined, forwardedFor: string | undefined, trusted: TrustedProxies): string | null {
  if (!peer) return null;
  const socket = normalize(peer);
  if (!trusted.has(socket) || !forwardedFor) return socket;
  const hops = forwardedFor
    .split(",")
    .map(normalize)
    .filter((h) => isIP(h) !== 0);
  for (let i = hops.length - 1; i >= 0; i--) if (!trusted.has(hops[i]!)) return hops[i]!;
  return hops[0] ?? socket; // every hop is a proxy: the left-most is the closest thing to a client
}
