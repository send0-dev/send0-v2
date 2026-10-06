import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RANGES, type Range } from "../use-range";

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <Tabs value={String(value)} onValueChange={(v) => onChange(Number(v) as Range)}>
      <TabsList aria-label="Time range">
        {RANGES.map((r) => (
          <TabsTrigger key={r} value={String(r)}>
            {r}d
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
