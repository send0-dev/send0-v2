import type { ReactNode } from "react";
import { Link, Outlet } from "react-router";
import { LogoMark } from "@/components/logo";

/** Sign-in pages: one focused column on the canvas, with a soft brand glow behind it. */
export function AuthLayout() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas">
      <div aria-hidden className="glow pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <div
        aria-hidden
        className="dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_60%)] opacity-40"
      />
      <main className="relative mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center px-6 py-16">
        <Link to="/" className="mb-8 w-fit" aria-label="send0">
          <LogoMark className="size-9 drop-shadow-[0_8px_24px_rgb(242_101_34/0.35)]" />
        </Link>
        <Outlet />
      </main>
      <footer className="relative flex justify-center gap-5 pb-6 text-xs text-faint">
        <a href="https://send0.dev" className="hover:text-muted-foreground">
          send0.dev
        </a>
        <a href="https://send0.dev/terms" className="hover:text-muted-foreground">
          Terms
        </a>
        <a href="https://send0.dev/privacy" className="hover:text-muted-foreground">
          Privacy
        </a>
        <a href="https://send0.dev/docs" className="hover:text-muted-foreground">
          Docs
        </a>
      </footer>
    </div>
  );
}

/** Title block at the top of every auth page. */
export function AuthHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance">{title}</h1>
      {description && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}
