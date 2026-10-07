import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "@/app/query-client";
import { sessionKeys } from "@/features/session/api/keys";
import { server } from "@/test/server";
import { RequireConfigured } from "./guards";

/** What the one-Worker edition answers on every route while its config is wrong. */
const PROBLEMS = [
  "send0 can't start: its configuration has problems.",
  "",
  "  - SECRET_KEY: is required (generate one with `openssl rand -hex 32`)",
  "  - OWNER_EMAIL: is required while ALLOW_SIGNUP is false",
  "",
].join("\n");

/** The real query client (with its retry rules) and a guarded route. */
function app(queryClient: QueryClient = createQueryClient()) {
  const router = createMemoryRouter([{ element: <RequireConfigured />, children: [{ path: "/*", element: <p>app page</p> }] }], {
    initialEntries: ["/"],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("RequireConfigured", () => {
  it("shows a full-page setup screen with the Worker's config problems, without retrying", async () => {
    let calls = 0;
    server.use(
      http.get("*/auth/instance", () => {
        calls++;
        return new HttpResponse(PROBLEMS, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
      }),
    );
    app();
    expect(await screen.findByRole("heading", { name: "send0 isn't configured yet" })).toBeInTheDocument();
    expect(screen.getByText(/SECRET_KEY: is required/)).toBeInTheDocument();
    expect(screen.getByText(/OWNER_EMAIL: is required while ALLOW_SIGNUP is false/)).toBeInTheDocument();
    expect(screen.queryByText("app page")).toBeNull();
    expect(calls).toBe(1);
  });

  it("renders the app when the instance loads", async () => {
    server.use(http.get("*/auth/instance", () => HttpResponse.json({ mail_domains: ["agents.acme.dev"], signup_open: true })));
    const qc = app();
    expect(await screen.findByText("app page")).toBeInTheDocument();
    await expect.poll(() => qc.getQueryState(sessionKeys.instance)?.status).toBe("success");
    expect(screen.queryByRole("heading", { name: "send0 isn't configured yet" })).toBeNull();
  });

  it("leaves ordinary API errors to the pages", async () => {
    server.use(
      http.get("*/auth/instance", () =>
        HttpResponse.json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500 }),
      ),
    );
    const qc = app();
    // Retried like any 5xx (twice, with backoff), then left as an error for the pages to show.
    await expect.poll(() => qc.getQueryState(sessionKeys.instance)?.status, { timeout: 10_000 }).toBe("error");
    expect(screen.getByText("app page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "send0 isn't configured yet" })).toBeNull();
  });
});
