import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { apiKey, inbox, list } from "@/test/fixtures";
import { server } from "@/test/server";
import { renderApp } from "@/test/render";
import { CreateApiKeyForm } from "./create-api-key-form";

const inboxes = () => http.get("*/api/v1/inboxes", () => HttpResponse.json(list([inbox(), inbox({ id: "ibx_2", address: "other@send0.email" })])));

describe("CreateApiKeyForm", () => {
  it("creates a key with the chosen access level, limited to one inbox", async () => {
    let body: unknown;
    server.use(
      inboxes(),
      http.post("*/api/v1/api-keys", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...apiKey({ name: "Signup agent" }), key: "s0_live_secret" }, { status: 201 });
      })
    );
    const onCreated = vi.fn();
    const { user } = renderApp(<CreateApiKeyForm onCreated={onCreated} onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Name"), "Signup agent");
    await user.click(screen.getByRole("radio", { name: /Read only/ }));
    await user.click(screen.getByLabelText("Works with every inbox"));
    await user.click(await screen.findByText("other@send0.email"));
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(body).toEqual({ name: "Signup agent", scopes: ["read"], inbox_ids: ["ibx_2"] });
  });

  it("requires an inbox when the key is restricted", async () => {
    server.use(inboxes());
    const { user } = renderApp(<CreateApiKeyForm onCreated={() => {}} onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Name"), "Agent");
    await user.click(screen.getByLabelText("Works with every inbox"));
    await user.click(screen.getByRole("button", { name: "Create key" }));
    expect(await screen.findByText("Pick at least one inbox.")).toBeInTheDocument();
  });

  it("shows API errors on the form", async () => {
    server.use(
      inboxes(),
      http.post("*/api/v1/api-keys", () => HttpResponse.json({ error: { code: "forbidden", message: "This API key needs the \"admin\" scope." } }, { status: 403 }))
    );
    const { user } = renderApp(<CreateApiKeyForm onCreated={() => {}} onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Name"), "Agent");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('needs the "admin" scope');
  });
});
