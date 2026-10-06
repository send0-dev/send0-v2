import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/** Copies `value` to the clipboard and confirms with a check mark. */
export function CopyButton({ value, label = "Copy", size = "icon-sm", variant = "ghost", ...props }: { value: string; label?: string } & Omit<ButtonProps, "onClick">) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  };
  const icon = copied ? <Check className="text-success" /> : <Copy />;
  if (size === "icon-sm" || size === "icon") {
    return (
      <Tooltip content={copied ? "Copied" : label}>
        <Button type="button" variant={variant} size={size} onClick={copy} aria-label={label} {...props}>
          {icon}
        </Button>
      </Tooltip>
    );
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={copy} {...props}>
      {icon}
      {copied ? "Copied" : label}
    </Button>
  );
}
