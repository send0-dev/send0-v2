import { LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { Avatar } from "@/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemeChoice } from "@/app/theme";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useLogOut } from "@/features/session/api/use-session-actions";

/** The signed-in person at the bottom of the sidebar: account, theme, log out. */
export function UserMenu() {
  const { user } = useCurrentWorkspace();
  const { choice, setChoice } = useTheme();
  const logOut = useLogOut();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-hover"
      >
        <Avatar name={user.name ?? user.email} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{user.name ?? user.email.split("@")[0]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
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
