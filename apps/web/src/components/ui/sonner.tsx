import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/app/theme";

export function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      // Bottom-left sits over the sidebar's quiet corner, clear of composers and primary actions on the right.
      position="bottom-left"
      offset={{ bottom: 56, left: 12 }}
      mobileOffset={{ bottom: 12 }}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border-0 !bg-elevated !text-foreground !shadow-elevated !text-[13px] !font-sans",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
