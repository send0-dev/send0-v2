import { z } from "zod";

export const email = z.string().trim().min(1, "Enter your email.").email("Enter a valid email address.");
/** Mirrors the server's rule; the server also rejects common and guessable passwords. */
export const newPassword = z.string().min(10, "Use at least 10 characters.").max(200, "Use at most 200 characters.");
