import { Check, Copy, Loader2, X } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
        <ellipse
          cx="16"
          cy="16.5"
          rx="6.2"
          ry="8"
          fill="none"
          stroke="var(--color-bg)"
          strokeWidth="3.2"
        />
        <circle
          cx="25.5"
          cy="6.5"
          r="5"
          fill="var(--color-accent)"
          stroke="var(--color-bg)"
          strokeWidth="2"
        />
      </svg>
      send0
    </span>
  );
}

type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90",
  accent: "bg-accent text-white hover:bg-accent-ink",
  secondary: "bg-surface text-fg border border-line-strong hover:bg-subtle",
  ghost: "text-muted hover:text-fg hover:bg-subtle",
  danger: "bg-surface text-bad border border-line-strong hover:bg-bad-soft",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-[15px]",
        variants[variant],
        className
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-sm text-bad">{error}</p>
      ) : hint ? (
        <p className="text-sm text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(
        "h-10 w-full rounded-lg border bg-surface px-3 text-[15px] outline-none transition-colors placeholder:text-faint",
        invalid ? "border-bad" : "border-line-strong focus:border-accent",
        className
      )}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-accent",
        className
      )}
    >
      {children}
    </select>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

export function Alert({
  tone = "bad",
  children,
}: {
  tone?: "bad" | "ok" | "warn" | "info";
  children: ReactNode;
}) {
  const tones = {
    bad: "bg-bad-soft text-bad",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    info: "bg-subtle text-muted",
  };
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx("rounded-lg px-3 py-2.5 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "bad" | "accent";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-subtle text-muted",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    accent: "bg-accent-soft text-accent-ink",
  };
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[11px] font-medium",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function CopyField({
  value,
  secret,
}: {
  value: string;
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-subtle p-1 pl-3">
      <code
        className={cx(
          "flex-1 truncate font-mono text-[13px]",
          secret && "select-all"
        )}
      >
        {value}
      </code>
      <Button
        size="sm"
        variant="secondary"
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children && (
        <div className="max-w-sm text-sm text-muted">{children}</div>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="grid place-items-center py-16 text-faint">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-faint hover:bg-subtle hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-[15px] text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

export { cx };
