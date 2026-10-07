import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ThemeProvider } from "@/app/theme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sessionKeys } from "@/features/session/api/keys";
import type { Me } from "@/lib/auth-client";

/**
 * Renders `ui` with the app's providers and a memory router at `route`. `me` seeds the session,
 * so components that need a signed-in member render without a network call.
 */
export function renderApp(ui: ReactElement, { route = "/", path = "*", me }: { route?: string; path?: string; me?: Me } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  if (me) queryClient.setQueryData(sessionKeys.me, me);
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...result, user: userEvent.setup(), router, queryClient };
}
