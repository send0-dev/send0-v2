import { CheckCircle2, Circle } from "lucide-react";
import { Link } from "react-router";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface ChecklistItem {
  label: string;
  done: boolean;
  to: string;
}

/** First steps, shown until they're all done. */
export function GettingStartedCard({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Get started</CardTitle>
          <CardDescription>
            {done} of {items.length} done
          </CardDescription>
        </div>
        <Progress value={(done / items.length) * 100} className="mt-1.5 w-24" />
      </CardHeader>
      <ul className="divide-y border-t">
        {items.map((item) => (
          <li key={item.label}>
            <Link to={item.to} className={cn("flex items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-muted/50", item.done && "text-muted-foreground")}>
              {item.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground/60" />}
              <span className={cn(item.done && "line-through decoration-muted-foreground/40")}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
