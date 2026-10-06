import type { Me } from "@/lib/auth-client";

/** Where someone is in the sign-up journey, which decides the pages they may see. */
export type Stage = "anonymous" | "unverified" | "onboarding" | "ready";

export function stageOf(me: Me): Stage {
  if (!me.user) return "anonymous";
  if (!me.user.email_verified) return "unverified";
  if (!me.user.onboarded || !me.workspace) return "onboarding";
  return "ready";
}

export const STAGE_HOME: Record<Stage, string> = {
  anonymous: "/login",
  unverified: "/check-email",
  onboarding: "/onboarding",
  ready: "/",
};
