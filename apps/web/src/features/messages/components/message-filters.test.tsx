import { act, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { list } from "@/test/fixtures";
import { server } from "@/test/server";
import { renderApp } from "@/test/render";
import { useMessageFilters } from "../use-message-filters";
import { MessageFilters } from "./message-filters";

function Harness() {
  const { filters, setFilter, clear, active } = useMessageFilters();
  return <MessageFilters filters={filters} onChange={setFilter} onClear={clear} active={active} />;
}

describe("MessageFilters", () => {
  it("keeps the search in the URL after typing stops, and Clear doesn't bring it back", async () => {
    server.use(http.get("*/api/v1/inboxes", () => HttpResponse.json(list([]))));
    const { user, router } = renderApp(<Harness />, { route: "/messages" });
    await user.type(screen.getByLabelText("Search messages"), "invoice");
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(router.state.location.search).toBe("?q=invoice");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(router.state.location.search).toBe("");
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(router.state.location.search).toBe("");
    expect(screen.getByLabelText("Search messages")).toHaveValue("");
  });

  it("reads filters from the URL", () => {
    server.use(http.get("*/api/v1/inboxes", () => HttpResponse.json(list([]))));
    renderApp(<Harness />, { route: "/messages?q=otp&status=bogus" });
    expect(screen.getByLabelText("Search messages")).toHaveValue("otp");
    expect(screen.getByLabelText("Status")).toHaveTextContent("Any status"); // unknown values are ignored
  });
});
