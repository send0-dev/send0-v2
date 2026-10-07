import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderApp } from "@/test/render";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("validates before calling the server", async () => {
    const { user } = renderApp(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
  });

  it("shows the server's message for wrong credentials", async () => {
    let body: unknown;
    server.use(
      http.post("*/auth/login", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ error: { code: "invalid_credentials", message: "Email or password is incorrect." } }, { status: 401 });
      }),
    );
    const { user } = renderApp(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "dana@acme.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(body).toEqual({ email: "dana@acme.com", password: "wrong-password" });
  });
});
