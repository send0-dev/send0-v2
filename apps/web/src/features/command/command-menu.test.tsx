import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { me, inbox, list } from "@/test/fixtures";
import { server } from "@/test/server";
import { renderApp } from "@/test/render";
import { CommandMenu } from "./command-menu";
import { CommandMenuProvider, useCommandMenu } from "./command-menu-context";

function Open() {
  const { setOpen } = useCommandMenu();
  useEffect(() => setOpen(true), [setOpen]);
  return null;
}

const menu = (
  <CommandMenuProvider>
    <Open />
    <CommandMenu />
  </CommandMenuProvider>
);

describe("CommandMenu", () => {
  it("offers admin pages and actions to owners, and lists inboxes", async () => {
    server.use(http.get("*/api/v1/inboxes", () => HttpResponse.json(list([inbox()]))));
    renderApp(menu, { me: me("owner") });
    expect(await screen.findByText("agent@send0.email")).toBeInTheDocument();
    expect(screen.getByText("API keys")).toBeInTheDocument();
    expect(screen.getByText("Create API key")).toBeInTheDocument();
    expect(screen.getByText("Invite teammate")).toBeInTheDocument();
  });

  it("hides what a member can't use", async () => {
    server.use(http.get("*/api/v1/inboxes", () => HttpResponse.json(list([inbox()]))));
    renderApp(menu, { me: me("member") });
    expect(await screen.findByText("agent@send0.email")).toBeInTheDocument();
    expect(screen.queryByText("API keys")).not.toBeInTheDocument();
    expect(screen.queryByText("Webhooks")).not.toBeInTheDocument();
    expect(screen.queryByText("Create inbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Invite teammate")).not.toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
  });

  it("toggles with ⌘K", async () => {
    server.use(http.get("*/api/v1/inboxes", () => HttpResponse.json(list([]))));
    const { user } = renderApp(
      <CommandMenuProvider>
        <CommandMenu />
      </CommandMenuProvider>,
      { me: me() }
    );
    expect(screen.queryByPlaceholderText(/Search pages/)).not.toBeInTheDocument();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByPlaceholderText(/Search pages/)).toBeInTheDocument();
  });
});
