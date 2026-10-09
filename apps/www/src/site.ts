export const site = {
  name: "send0",
  url: "https://send0.dev",
  title: "send0: email infrastructure for AI agents",
  description:
    "Give any agent an email address in one API call. send0 is an open-source email API that sends, receives and threads mail, with webhooks on every plan. Self-host it or use our cloud.",
  // Shows GitHub links and "building in public" copy (the repo went public on 2026-10-07).
  repoPublic: true,
  github: "https://github.com/send0-dev/send0-v2",
  githubApi: "https://api.github.com/repos/send0-dev/send0-v2",
  version: "v0.2.0",
  docs: {
    home: "/docs",
    quickstart: "/docs/quickstart/typescript",
    mcp: "/docs/quickstart/mcp",
    selfHost: "/docs/self-hosting",
    docker: "/docs/self-hosting/docker",
    cloudflare: "/docs/self-hosting/cloudflare",
    webhooks: "/docs/realtime/webhooks",
    waiting: "/docs/concepts/waiting",
    llms: "/docs/llms-full.txt",
  },
  email: {
    hello: "hello@send0.dev",
    support: "support@send0.dev",
    abuse: "abuse@send0.dev",
    /** On the mailbox domain itself, where mail providers and recipients look first. Forwarded to the operator. */
    mailboxAbuse: "abuse@send0.email",
    privacy: "privacy@send0.dev",
    security: "security@send0.dev",
  },
  operator: "Kunal Dholiya",
  country: "India",
  legalUpdated: "October 6, 2026",
} as const;
