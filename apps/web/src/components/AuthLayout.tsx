import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "./ui";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="px-6 py-5">
        <a href="https://send0.dev" aria-label="send0 home">
          <Logo />
        </a>
      </header>
      <main className="grid flex-1 place-items-center px-4 pb-16">
        <div className="w-full max-w-[400px]">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
        </div>
      </main>
      <footer className="flex justify-center gap-4 px-6 py-5 text-xs text-faint">
        <a href="https://send0.dev/terms" className="hover:text-fg">Terms</a>
        <a href="https://send0.dev/privacy" className="hover:text-fg">Privacy</a>
        <a href="https://send0.dev/docs/" className="hover:text-fg">Docs</a>
      </footer>
    </div>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent">
      {children}
    </Link>
  );
}
