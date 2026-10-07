import { beforeAll, describe, expect, it } from "vitest";
import { pemCertificateToDer, spkiFromPem, subjectPublicKeyInfo } from "../src/sending/x509";
import { createSnsSigner, type SnsTestSigner } from "./sns-signer";

/** Minimal DER encoder for hand-built certificates. */
function tlv(tag: number, ...parts: Uint8Array[]): Uint8Array {
  const body = Buffer.concat(parts);
  const n = body.length;
  const len = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : n < 0x10000 ? [0x82, n >> 8, n & 0xff] : [0x83, n >> 16, (n >> 8) & 0xff, n & 0xff];
  return new Uint8Array([tag, ...len, ...body]);
}
const SEQ = 0x30;
const bytes = (...b: number[]) => new Uint8Array(b);
const pem = (der: Uint8Array, label = "CERTIFICATE") =>
  `-----BEGIN ${label}-----\r\n${(
    Buffer.from(der)
      .toString("base64")
      .match(/.{1,64}/g) ?? []
  ).join("\r\n")}\r\n-----END ${label}-----\r\n`;

/** A certificate whose tbsCertificate has (or lacks) the [0] version tag, with `spki` in its place. */
function handBuilt(spki: Uint8Array, { version, bigName = false }: { version: boolean; bigName?: boolean }) {
  const name = tlv(SEQ, tlv(0x31, tlv(SEQ, tlv(0x06, bytes(0x55, 0x04, 0x03)), tlv(0x0c, new Uint8Array(bigName ? 300 : 4).fill(0x61)))));
  const alg = tlv(SEQ, tlv(0x06, bytes(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b)), tlv(0x05));
  const tbs = tlv(
    SEQ,
    ...(version ? [tlv(0xa0, tlv(0x02, bytes(2)))] : []),
    tlv(0x02, bytes(0x01, 0x23)),
    alg,
    name,
    tlv(SEQ, tlv(0x17, new TextEncoder().encode("260101000000Z")), tlv(0x17, new TextEncoder().encode("360101000000Z"))),
    name,
    spki,
  );
  return tlv(SEQ, tbs, alg, tlv(0x03, bytes(0, 1, 2, 3)));
}

let signer: SnsTestSigner;
beforeAll(async () => {
  signer = await createSnsSigner();
});

describe("x509", () => {
  it("extracts the public key from a real (selfsigned) certificate", () => {
    expect(spkiFromPem(signer.certPem)).toEqual(signer.spki);
  });

  it("handles a certificate with and without the [0] version tag", () => {
    expect(subjectPublicKeyInfo(handBuilt(signer.spki, { version: true }))).toEqual(signer.spki);
    expect(subjectPublicKeyInfo(handBuilt(signer.spki, { version: false }))).toEqual(signer.spki);
  });

  it("handles long-form lengths on every level", () => {
    const der = handBuilt(signer.spki, { version: true, bigName: true });
    expect(der[1]).toBe(0x82);
    expect(subjectPublicKeyInfo(der)).toEqual(signer.spki);
  });

  it("takes the first CERTIFICATE block of a multi-block PEM", async () => {
    const other = await createSnsSigner();
    const bundle = `${pem(bytes(1, 2, 3), "PRIVATE KEY")}junk\n${signer.certPem}\n${other.certPem}`;
    expect(spkiFromPem(bundle)).toEqual(signer.spki);
    expect(pemCertificateToDer(pem(handBuilt(signer.spki, { version: false })))).toEqual(handBuilt(signer.spki, { version: false }));
  });

  it("rejects garbage", () => {
    const der = handBuilt(signer.spki, { version: true });
    const bad: Uint8Array[] = [
      bytes(),
      bytes(0x30),
      bytes(0x30, 0x80, 0x00, 0x00), // indefinite length is not DER
      bytes(0x30, 0x85, 1, 1, 1, 1, 1), // absurd length
      bytes(0x04, 0x02, 0x01, 0x02), // not a SEQUENCE
      der.slice(0, der.length - 10), // truncated
      tlv(SEQ, tlv(SEQ, tlv(0x02, bytes(1)))), // tbsCertificate too short
      crypto.getRandomValues(new Uint8Array(512)),
    ];
    for (const b of bad) expect(() => subjectPublicKeyInfo(b), Buffer.from(b.slice(0, 8)).toString("hex")).toThrow();
    expect(() => pemCertificateToDer("hello")).toThrow();
    expect(() => pemCertificateToDer("-----BEGIN CERTIFICATE-----\n!!!!\n-----END CERTIFICATE-----")).toThrow();
    expect(() => spkiFromPem(pem(bytes(0x30, 0x00)))).toThrow();
  });
});
