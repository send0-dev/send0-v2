/**
 * Just enough X.509 to get a public key out of a certificate. WebCrypto can import a
 * SubjectPublicKeyInfo ("spki") but not a certificate, so we walk the DER by hand:
 * Certificate → tbsCertificate → subjectPublicKeyInfo. No chain or validity checks here.
 */

const SEQUENCE = 0x30;
const VERSION_TAG = 0xa0; // [0] EXPLICIT Version, absent in v1 certificates

interface Tlv {
  tag: number;
  /** Offset of the tag byte. */
  start: number;
  /** Offset of the first content byte. */
  contentStart: number;
  /** Offset just past the content. */
  end: number;
}

/** Reads one DER element at `offset`, which must end at or before `limit`. Throws on anything malformed. */
function readTlv(der: Uint8Array, offset: number, limit: number): Tlv {
  if (offset + 2 > limit) throw new Error("x509: truncated element");
  const tag = der[offset]!;
  if ((tag & 0x1f) === 0x1f) throw new Error("x509: high-tag-number form not supported");
  const first = der[offset + 1]!;
  let length = first;
  let contentStart = offset + 2;
  if (first & 0x80) {
    const n = first & 0x7f;
    // 0x80 is BER's indefinite length, never valid in DER; four bytes is far beyond any certificate.
    if (n === 0 || n > 4) throw new Error("x509: unsupported length encoding");
    if (contentStart + n > limit) throw new Error("x509: truncated length");
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + der[contentStart + i]!;
    contentStart += n;
  }
  const end = contentStart + length;
  if (end > limit) throw new Error("x509: element overruns its parent");
  return { tag, start: offset, contentStart, end };
}

/** Returns the children of a constructed element. */
function children(der: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let at = parent.contentStart; at < parent.end;) {
    const child = readTlv(der, at, parent.end);
    out.push(child);
    at = child.end;
  }
  return out;
}

/** Returns the DER bytes of the subjectPublicKeyInfo inside a DER-encoded X.509 certificate. Throws if the input isn't one. */
export function subjectPublicKeyInfo(der: Uint8Array): Uint8Array {
  const cert = readTlv(der, 0, der.length);
  if (cert.tag !== SEQUENCE || cert.end !== der.length) throw new Error("x509: not a certificate");
  const [tbs] = children(der, cert);
  if (tbs?.tag !== SEQUENCE) throw new Error("x509: missing tbsCertificate");
  const fields = children(der, tbs);
  // tbsCertificate: [version], serialNumber, signature, issuer, validity, subject, subjectPublicKeyInfo, …
  const index = fields[0]?.tag === VERSION_TAG ? 6 : 5;
  const spki = fields[index];
  if (spki?.tag !== SEQUENCE) throw new Error("x509: missing subjectPublicKeyInfo");
  return der.slice(spki.start, spki.end);
}

/** Decodes the first CERTIFICATE block of a PEM file (other blocks and surrounding text are ignored). */
export function pemCertificateToDer(pem: string): Uint8Array {
  const match = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pem);
  if (!match) throw new Error("x509: no CERTIFICATE block");
  const b64 = match[1]!.replace(/\s+/g, "");
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Error("x509: bad base64");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

/** Returns the SubjectPublicKeyInfo DER of the first certificate in a PEM file, ready for `crypto.subtle.importKey("spki", …)`. */
export function spkiFromPem(pem: string): Uint8Array {
  return subjectPublicKeyInfo(pemCertificateToDer(pem));
}
