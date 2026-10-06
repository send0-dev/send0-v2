import { cn } from "@/lib/utils";

/**
 * Renders an email's HTML in a locked-down iframe: no scripts, no same-origin access, no forms.
 * Remote images still load, as in most mail clients.
 */
export function HtmlPreview({ html, className }: { html: string; className?: string }) {
  return (
    <iframe
      title="HTML version"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={`<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{margin:16px;font:14px/1.5 system-ui,sans-serif;color:#111;background:#fff}img{max-width:100%;height:auto}</style>${html}`}
      className={cn("h-[60vh] w-full rounded-md border bg-white", className)}
    />
  );
}
