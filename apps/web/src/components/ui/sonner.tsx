import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/app/theme";

export function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      toastOptions={{ classNames: { toast: "!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-lg !text-[13px]" } }}
      {...props}
    />
  );
}
