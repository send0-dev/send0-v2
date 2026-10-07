import { CheckIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/**
 * `opensDialogs`: set when items open a dialog. The menu then doesn't hand focus back to its
 * trigger on close, which would otherwise steal focus (and keystrokes) from the new dialog.
 */
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  opensDialogs,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content> & { opensDialogs?: boolean }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        onCloseAutoFocus={opensDialogs ? (e) => e.preventDefault() : onCloseAutoFocus}
        className={cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-48 overflow-y-auto rounded-lg bg-elevated p-1 text-popover-foreground shadow-elevated",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none focus:bg-selected data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive-soft [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[variant=destructive]:[&_svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        "relative flex h-8 cursor-default items-center gap-2 rounded-md pr-8 pl-2 text-[13px] outline-none select-none focus:bg-selected",
        className,
      )}
      {...props}
    >
      {children}
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn("px-2 pt-1.5 pb-1 text-[11px] font-medium text-faint", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
