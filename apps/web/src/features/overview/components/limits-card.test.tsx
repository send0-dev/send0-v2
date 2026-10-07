import type { Usage } from "@send0/sdk";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LimitsCard } from "./limits-card";

const usage = (limits: { inboxes: number | null; sends: number | null }): Usage => ({
  object: "usage",
  plan: "free",
  inboxes: { used: 3, limit: limits.inboxes },
  sends_today: { used: 12, limit: limits.sends, resets_at: new Date(Date.now() + 3600_000).toISOString() },
  sending: { paused: false, reason: null, paused_at: null },
});

describe("LimitsCard", () => {
  it("shows used against the plan's caps", () => {
    render(<LimitsCard usage={usage({ inboxes: 5, sends: 50 })} />);
    expect(screen.getByText("Free plan")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Inboxes: 3 of 5" })).toBeInTheDocument();
  });

  it("shows 'No limit' and no plan badge when the install has no caps", () => {
    render(<LimitsCard usage={usage({ inboxes: null, sends: null })} />);
    expect(screen.getAllByText("No limit")).toHaveLength(2);
    expect(screen.queryByText("Free plan")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
