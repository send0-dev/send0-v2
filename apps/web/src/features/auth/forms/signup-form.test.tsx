import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderApp } from "@/test/render";
import { SignupForm } from "./signup-form";

describe("SignupForm", () => {
  it("asks for a 10-character password", async () => {
    const { user } = renderApp(<SignupForm />);
    await user.type(screen.getByLabelText("Your name"), "Dana");
    await user.type(screen.getByLabelText("Work email"), "dana@acme.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least 10 characters.")).toBeInTheDocument();
  });

  it("puts the server's email error under the email field", async () => {
    server.use(
      http.post("*/auth/signup", () =>
        HttpResponse.json({ error: { code: "disposable_email", message: "Temporary email addresses aren't accepted.", field: "email" } }, { status: 400 })
      )
    );
    const { user } = renderApp(<SignupForm />);
    await user.type(screen.getByLabelText("Your name"), "Dana");
    await user.type(screen.getByLabelText("Work email"), "x@mailinator.com");
    await user.type(screen.getByLabelText("Password"), "tangerine-orbit-42");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Temporary email addresses aren't accepted.")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("aria-invalid", "true");
  });
});
