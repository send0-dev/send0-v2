import { generate } from "selfsigned";

/** A fake SNS signing identity: an RSA key pair made with WebCrypto and a self-signed certificate for it. */
export interface SnsTestSigner {
  certUrl: string;
  certPem: string;
  /** The public key as SubjectPublicKeyInfo DER, for checking the parser. */
  spki: Uint8Array;
  /** Serves certPem at certUrl and 404s everything else; counts calls. */
  fetch: typeof fetch & { calls: string[] };
  /** Fills in MessageId, Timestamp, SignatureVersion, SigningCertURL and Signature (unless already set). */
  sign: (msg: Record<string, string>, opts?: { version?: "1" | "2" }) => Promise<Record<string, string>>;
}

export const TEST_CERT_URL = "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem";

const toPem = (label: string, der: ArrayBuffer) =>
  `-----BEGIN ${label}-----\n${(
    Buffer.from(der)
      .toString("base64")
      .match(/.{1,64}/g) ?? []
  ).join("\n")}\n-----END ${label}-----\n`;

const FIELDS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};

/** The canonical string, written independently of the code under test. */
export function canonical(msg: Record<string, string>) {
  return (FIELDS[msg.Type!] ?? [])
    .filter((k) => msg[k] !== undefined)
    .map((k) => `${k}\n${msg[k]}\n`)
    .join("");
}

/** Makes a signer whose certificate is served at `certUrl`. */
export async function createSnsSigner(certUrl = TEST_CERT_URL): Promise<SnsTestSigner> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  const spki = (await crypto.subtle.exportKey("spki", pair.publicKey)) as ArrayBuffer;
  const pems = await generate([{ name: "commonName", value: "sns.amazonaws.com" }], {
    algorithm: "sha256",
    keyPair: { privateKey: toPem("PRIVATE KEY", pkcs8), publicKey: toPem("PUBLIC KEY", spki) },
  });
  const signers = {
    "1": await crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" }, false, ["sign"]),
    "2": await crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]),
  };

  const calls: string[] = [];
  const fakeFetch = Object.assign(
    async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);
      return url === certUrl ? new Response(pems.cert) : new Response("not found", { status: 404 });
    },
    { calls },
  ) as SnsTestSigner["fetch"];

  return {
    certUrl,
    certPem: pems.cert,
    spki: new Uint8Array(spki),
    fetch: fakeFetch,
    sign: async (msg, { version = "2" } = {}) => {
      const full: Record<string, string> = {
        MessageId: crypto.randomUUID(),
        Timestamp: new Date().toISOString(),
        SignatureVersion: version,
        SigningCertURL: certUrl,
        ...msg,
      };
      const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signers[version], new TextEncoder().encode(canonical(full)));
      return { Signature: Buffer.from(sig).toString("base64"), ...full };
    },
  };
}
