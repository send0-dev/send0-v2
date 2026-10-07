import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { sessionKeys } from "@/features/session/api/keys";
import { stageOf } from "@/features/session/stage";
import type { Me } from "@/lib/auth-client";
import { me } from "@/test/fixtures";
import { RequireStage } from "./guards";

const anonymous: Me = { user: null, workspace: null, workspaces: [] };

function app(session: Me, route: string) {
  const qc = new QueryClient();
  qc.setQueryData(sessionKeys.me, session);
  const router = createMemoryRouter(
    [
      { element: <RequireStage allow={["anonymous"]} />, children: [{ path: "/login", element: <p>login page</p> }] },
      { element: <RequireStage allow={["onboarding"]} />, children: [{ path: "/onboarding", element: <p>onboarding page</p> }] },
      { element: <RequireStage allow={["ready"]} />, children: [{ path: "/*", element: <p>app page</p> }] },
    ],
    { initialEntries: [route] },
  );
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("route guards", () => {
  it("works out the stage", () => {
    expect(stageOf(anonymous)).toBe("anonymous");
    expect(stageOf({ ...me(), user: { ...me().user!, email_verified: false } })).toBe("unverified");
    expect(stageOf({ ...me(), workspace: null })).toBe("onboarding");
    expect(stageOf(me())).toBe("ready");
  });

  it("sends signed-out visitors to login with where they were going", async () => {
    const router = app(anonymous, "/messages?q=otp");
    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent("/messages?q=otp")}`);
  });

  it("sends a signed-in member from login to the page in ?next=, but never off-site", async () => {
    let router = app(me(), "/login?next=%2Fdrafts");
    expect(await screen.findByText("app page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/drafts");
    router = app(me(), "/login?next=%2F%2Fevil.example");
    expect((await screen.findAllByText("app page")).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/");
  });

  it("keeps people without a workspace in onboarding", async () => {
    app({ ...me(), workspace: null }, "/inboxes");
    expect(await screen.findByText("onboarding page")).toBeInTheDocument();
  });
});
