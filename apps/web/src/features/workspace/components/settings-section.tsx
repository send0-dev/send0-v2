import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A titled block on a settings page. `danger` marks irreversible actions. */
export function SettingsSection({ title, description, children, danger }: { title: string; description?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <Card className={cn(danger && "border-destructive/30")}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="max-w-xl">{children}</CardContent>
    </Card>
  );
}
