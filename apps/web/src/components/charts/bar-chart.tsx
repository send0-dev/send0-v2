import { useState } from "react";
import { cn } from "@/lib/utils";

export interface Series {
  key: string;
  label: string;
  /** A CSS colour, usually a chart token like var(--chart-1) */
  color: string;
}

export interface BarDatum {
  label: string;
  values: Record<string, number>;
}

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/**
 * Stacked bars with a hover readout. Pure SVG, sized by its container; no chart library.
 * Labels are ISO dates (YYYY-MM-DD) and shown as "Oct 6".
 */
export function BarChart({ data, series, height, className }: { data: BarDatum[]; series: Series[]; /** Fixed plot height; omit to fill the container */ height?: number; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const max = Math.max(4, ...totals);
  const ticks = [0, Math.ceil(max / 2), max];
  const n = data.length;
  const gap = n > 30 ? 2 : 4;
  const shown = hover ?? n - 1;
  const fmt = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className={cn("relative", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">{data[shown] ? fmt(data[shown].label) : ""}</span>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="tabular font-medium">{data[shown]?.values[s.key] ?? 0}</span>
          </span>
        ))}
      </div>
      <div className={cn("relative", height === undefined && "min-h-40 flex-1")} style={height === undefined ? undefined : { height }}>
        {ticks.map((t) => (
          <div key={t} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(t / max) * 100}%` }}>
            <div className="h-px flex-1 bg-border/70" />
            <span className="tabular w-6 text-right text-[10px] text-faint">{t}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 right-8 left-0 flex items-end" style={{ gap }} onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div
              key={d.label}
              className="group/bar relative flex h-full flex-1 cursor-default flex-col justify-end"
              onMouseEnter={() => setHover(i)}
              aria-label={`${fmt(d.label)}: ${series.map((s) => `${d.values[s.key] ?? 0} ${s.label.toLowerCase()}`).join(", ")}`}
            >
              <div className={cn("absolute inset-x-[-2px] inset-y-0 rounded-sm transition-colors", hover === i && "bg-hover")} />
              {series.map((s, j) => {
                const v = d.values[s.key] ?? 0;
                if (!v) return null;
                return (
                  <div
                    key={s.key}
                    className={cn("relative w-full transition-[height] duration-500 ease-out", j === series.length - 1 || !series.slice(j + 1).some((x) => d.values[x.key]) ? "rounded-t-[3px]" : "")}
                    style={{ height: `${(v / max) * 100}%`, background: s.color, opacity: hover === null || hover === i ? 1 : 0.55 }}
                  />
                );
              })}
              {totals[i] === 0 && <div className="relative h-[2px] w-full rounded-full bg-border" />}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between pr-8 text-[10px] text-faint">
        <span>{data[0] && fmt(data[0].label)}</span>
        <span>{data.at(-1) && fmt(data.at(-1)!.label)}</span>
      </div>
    </div>
  );
}
