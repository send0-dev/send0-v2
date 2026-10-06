import { Bot, Inbox, Webhook } from "lucide-react";
import { Link, Outlet } from "react-router";
import { Logo } from "@/components/logo";

const POINTS = [
  { icon: Inbox, title: "An inbox per agent", body: "One API call gives each agent its own address that sends, receives and threads." },
  { icon: Bot, title: "Built for automation", body: "Wait for a code, read the extracted OTP, reply in-thread. No polling." },
  { icon: Webhook, title: "Webhooks on every plan", body: "Signed events for new mail, deliveries, bounces and drafts." },
];

/** Sign-in pages: the form on the left, what send0 is on the right (hidden on small screens). */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link to="/" className="w-fit">
          <Logo />
        </Link>
        <main className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          <Outlet />
        </main>
        <footer className="flex gap-4 text-xs text-muted-foreground">
          <a href="https://send0.dev/terms" className="hover:text-foreground">Terms</a>
          <a href="https://send0.dev/privacy" className="hover:text-foreground">Privacy</a>
          <a href="https://send0.dev/docs" className="hover:text-foreground">Docs</a>
        </footer>
      </div>
      <aside className="relative hidden overflow-hidden border-l bg-card lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
        />
        <div className="relative max-w-sm">
          <p className="font-mono text-xs text-muted-foreground">send0 · email for AI agents</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Give any agent an email address in one API call.</h2>
          <ul className="mt-8 grid gap-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[13px] font-medium">{title}</p>
                  <p className="text-[13px] text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Title block used at the top of every auth page. */
export function AuthHeader({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>}
    </div>
  );
}
