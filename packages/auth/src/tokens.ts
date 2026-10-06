import { sha256Hex } from "@send0/core";

/** 32 random bytes as base64url: the secret part of session cookies and email links. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const hashToken = (token: string) => sha256Hex(token);
