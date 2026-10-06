import { LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme, type ThemeChoice } from "@/app/theme";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useLogOut } from "@/features/session/api/use-session-actions";

const initials = (name: string | null, email: string) =>
  (name?.trim() || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** The signed-in person at the bottom of the sidebar: account, theme, log out. */
export function UserMenu() {
  const { user } = useCurrentWorkspace();
  const { choice, setChoice } = useTheme();
  const logOut = useLogOut();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu" className="flex w-full cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{initials(user.name, user.email)}</span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-[13px] font-medium">{user.name ?? user.email.split("@")[0]}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate("/settings/account")}>
          <UserRound />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4 text-muted-foreground" /> System
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4 text-muted-foreground" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4 text-muted-foreground" /> Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logOut.mutate()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
