/**
 * Common disposable / throwaway email domains. Sign-ups from these are refused: email
 * verification is our real-account check, and it means nothing if the inbox is throwaway.
 * Deliberately short and high-confidence; extend as abuse shows up.
 */
const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempmail.net",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.net",
  "yopmail.fr",
  "getnada.com",
  "nada.email",
  "dispostable.com",
  "maildrop.cc",
  "mailnesia.com",
  "trashmail.com",
  "trashmail.net",
  "fakeinbox.com",
  "mintemail.com",
  "mohmal.com",
  "emailondeck.com",
  "spamgourmet.com",
  "mytemp.email",
  "tempail.com",
  "tempr.email",
  "discard.email",
  "mailcatch.com",
  "inboxkitten.com",
  "burnermail.io",
  "33mail.com",
  "moakt.com",
  "emailfake.com",
  "fakemail.net",
  "mailpoof.com",
  "tmpmail.org",
  "tmpmail.net",
  "minuteinbox.com",
  "dropmail.me",
  "mail.tm",
  "mailsac.com",
  "mailslurp.com",
  "harakirimail.com",
  "getairmail.com",
  "spambox.us",
  "send0.email",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@").pop()!.toLowerCase();
  if (DISPOSABLE.has(domain)) return true;
  // Subdomains of listed domains, and our sandbox domain
  return (
    [...DISPOSABLE].some((d) => domain.endsWith(`.${d}`)) ||
    domain.endsWith(".sandbox.send0.dev")
  );
}
