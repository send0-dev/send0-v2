import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hidden below this breakpoint to keep tables readable on phones */
  hideBelow?: "sm" | "md" | "lg";
}

const HIDE = { sm: "max-sm:hidden", md: "max-md:hidden", lg: "max-lg:hidden" } as const;

/** A plain, accessible table: columns describe themselves; rows are optionally clickable. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, className }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; className?: string }) {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => (
            <TableHead key={c.key} className={cn(c.className, c.hideBelow && HIDE[c.hideBelow])}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={rowKey(row)}
            className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (e) => {
                    // Keys pressed on a control inside the row (a copy button, a menu) belong to that control.
                    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                    e.preventDefault();
                    onRowClick(row);
                  }
                : undefined
            }
            tabIndex={onRowClick ? 0 : undefined}
          >
            {columns.map((c) => (
              <TableCell key={c.key} className={cn(c.className, c.hideBelow && HIDE[c.hideBelow])}>
                {c.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Placeholder rows while a table loads. */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Loading">
      <div className="h-9" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-6 px-4">
          {Array.from({ length: columns }, (_, j) => (
            <Skeleton key={j} className={cn("h-3.5", j === 0 ? "w-48" : "w-20", j === columns - 1 && "ml-auto")} />
          ))}
        </div>
      ))}
    </div>
  );
}
