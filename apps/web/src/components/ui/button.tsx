import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] duration-100 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1 focus-visible:ring-offset-panel disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        /** The one main action on a surface */
        primary:
          "bg-brand text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.2)] hover:bg-brand-strong",
        /** Strong but neutral */
        default: "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:opacity-90",
        secondary:
          "border border-border-strong bg-elevated text-foreground shadow-[0_1px_1px_rgb(0_0_0/0.04)] hover:bg-hover dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
        ghost: "text-muted-foreground hover:bg-hover hover:text-foreground",
        destructive: "bg-destructive text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-destructive/90",
        "destructive-outline": "border border-border-strong bg-elevated text-destructive hover:bg-destructive-soft dark:bg-white/[0.03]",
        link: "h-auto px-0 text-foreground underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 rounded-[5px] px-2 text-xs",
        sm: "h-7 px-2.5 text-[13px]",
        default: "h-8 px-3 text-[13px]",
        lg: "h-9 px-4 text-[13px]",
        icon: "size-8",
        "icon-sm": "size-7",
        "icon-xs": "size-6 rounded-[5px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Keyboard shortcut shown inside the button, e.g. "⌘↵" */
  shortcut?: ReactNode;
}

export function Button({ className, variant, size, asChild, loading, disabled, shortcut, children, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  // asChild hands everything to the single child (e.g. a <Link>), so no spinner slot here.
  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button data-slot="button" className={classes} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
      {shortcut && (
        <Kbd
          aria-hidden
          className={cn("ml-0.5", variant === "primary" || variant === "default" ? "border-white/20 bg-white/15 text-current" : "")}
        >
          {shortcut}
        </Kbd>
      )}
    </button>
  );
}

export { buttonVariants };
