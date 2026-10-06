const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
const hi = (name: string | null) =>
  name ? `Hi ${name.split(" ")[0]},` : "Hi,";

function layout(
  body: string,
  button?: { label: string; href: string }
): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#fbfbfa;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0c0c0d">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e6e6e3;border-radius:10px;padding:28px">
<p style="margin:0 0 20px;font-weight:600;font-size:16px">send0</p>
${body}
${button ? `<p style="margin:24px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#0c0c0d;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:500">${esc(button.label)}</a></p><p style="font-size:13px;color:#57575e;word-break:break-all">Or paste this link into your browser:<br>${esc(button.href)}</p>` : ""}
</div>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#8e8e95">send0 · Email inboxes for AI agents · https://send0.dev</p>
</body></html>`;
}

const p = (t: string) =>
  `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${t}</p>`;

export function verifyEmail({
  name,
  link,
}: {
  name: string | null;
  link: string;
}) {
  return {
    subject: "Confirm your email for send0",
    text: `${hi(name)}\n\nConfirm your email address to finish setting up your send0 account:\n\n${link}\n\nThe link works for 24 hours. If you didn't sign up for send0, you can ignore this email.\n\nsend0`,
    html: layout(
      `${p(esc(hi(name)))}${p("Confirm your email address to finish setting up your send0 account.")}${p("The link works for 24 hours. If you didn't sign up, you can ignore this email.")}`,
      { label: "Confirm email", href: link }
    ),
  };
}

export function resetPasswordEmail({
  name,
  link,
}: {
  name: string | null;
  link: string;
}) {
  return {
    subject: "Reset your send0 password",
    text: `${hi(name)}\n\nSomeone asked to reset the password for your send0 account. If it was you, choose a new password here:\n\n${link}\n\nThe link works for 1 hour and can be used once. If you didn't ask for this, ignore this email; your password won't change.\n\nsend0`,
    html: layout(
      `${p(esc(hi(name)))}${p("Someone asked to reset the password for your send0 account. If it was you, choose a new one.")}${p("The link works for 1 hour and can be used once. If you didn't ask for this, ignore this email; your password won't change.")}`,
      { label: "Choose a new password", href: link }
    ),
  };
}

export function passwordChangedEmail({
  name,
  appUrl,
}: {
  name: string | null;
  appUrl: string;
}) {
  return {
    subject: "Your send0 password was changed",
    text: `${hi(name)}\n\nThe password for your send0 account was just changed, and other devices were signed out.\n\nIf this wasn't you, reset your password right away at ${appUrl}/forgot-password and tell us at security@send0.dev.\n\nsend0`,
    html: layout(
      `${p(esc(hi(name)))}${p("The password for your send0 account was just changed, and other devices were signed out.")}${p(`If this wasn't you, <a href="${esc(appUrl)}/forgot-password">reset your password</a> right away and tell us at security@send0.dev.`)}`
    ),
  };
}
