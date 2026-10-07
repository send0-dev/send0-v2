import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { me, message } from "@/test/fixtures";
import { server } from "@/test/server";
import { renderApp } from "@/test/render";
import { ReplyForm } from "./reply-form";

describe("ReplyForm", () => {
  it("retries a failed reply with the same idempotency key, then starts a new one", async () => {
    const keys: (string | null)[] = [];
    let fail = true;
    server.use(
      http.post("*/api/v1/messages/msg_1/reply", ({ request }) => {
        keys.push(request.headers.get("idempotency-key"));
        if (fail) return HttpResponse.json({ error: { code: "send_failed", message: "SES is busy, try again." } }, { status: 502 });
        return HttpResponse.json(message({ id: "msg_2", direction: "out", status: "sent" }), { status: 201 });
      }),
    );
    const { user } = renderApp(<ReplyForm inboxId="ibx_1" threadId="thr_1" replyTo={message()} needsApproval={false} />, { me: me() });
    await user.type(screen.getByRole("textbox"), "Thanks!");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("SES is busy, try again.")).toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Reply sent")).toBeInTheDocument();
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);

    await user.type(screen.getByRole("textbox"), "One more thing");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findAllByText("Reply sent");
    await new Promise((r) => setTimeout(r, 50));
    expect(keys[2]).toBeTruthy();
    expect(keys[2]).not.toBe(keys[0]);
  });
});
