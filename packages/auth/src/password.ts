const enc = new TextEncoder();

/** Cloudflare Workers caps PBKDF2 at 100,000 iterations. Stored per hash, so it can be raised later. */
export const PBKDF2_ITERATIONS = 100_000;
const KEY_BITS = 256;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations,
    },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** "pbkdf2-sha256$100000$<salt>$<hash>" with a random 16-byte salt. */
export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, salt, hash] = stored.split("$");
  if (algo !== "pbkdf2-sha256" || !iter || !salt || !hash) return false;
  const actual = await derive(password, unb64(salt), Number(iter));
  const expected = unb64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

const COMMON = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "iloveyou",
  "11111111",
  "00000000",
  "abc12345",
  "letmein1",
  "welcome1",
  "admin123",
  "passw0rd",
  "send0send0",
]);

/** Returns a problem to show, or null. NIST-style: length over composition rules. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Pick something less guessable.";
  if (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()) && email.split("@")[0]!.length >= 4) {
    return "Don't include your email address in your password.";
  }
  if (/^(.)\1+$/.test(password)) return "That password is too easy to guess.";
  return null;
}
