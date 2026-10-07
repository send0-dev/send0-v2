import type { ComponentType } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RequireConfigured, RequireStage } from "@/app/guards";
import { AppShell } from "@/app/layouts/app-shell";
import { AuthLayout } from "@/app/layouts/auth-layout";
import { NotFound, RouteError } from "@/app/route-error";
import { InboxCrumb } from "@/features/inboxes/components/inbox-crumb";
import { WebhookCrumb } from "@/features/webhooks/components/webhook-crumb";
import { SettingsLayout } from "@/features/workspace/components/settings-layout";

/** Breadcrumb for the top bar: a label, or a component that works one out (e.g. an inbox's address). */
export type Crumb = string | ComponentType;
export interface RouteHandle {
  crumb?: Crumb;
}

/** Each page is its own chunk, loaded when first visited. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

/** Every page gets its own error boundary, so a crash in one page leaves the shell and navigation working. */
const withErrorBoundaries = (routes: RouteObject[]): RouteObject[] =>
  routes.map(
    (r) => ({ ...r, errorElement: <RouteError />, ...(r.children ? { children: withErrorBoundaries(r.children) } : {}) }) as RouteObject,
  );

const appRoutes: RouteObject[] = withErrorBoundaries([
  { index: true, handle: { crumb: "Overview" }, lazy: page(() => import("@/features/overview/pages/overview-page")) },
  {
    path: "inboxes",
    handle: { crumb: "Inboxes" },
    children: [
      { index: true, lazy: page(() => import("@/features/inboxes/pages/inboxes-page")) },
      { path: ":inboxId", handle: { crumb: InboxCrumb }, lazy: page(() => import("@/features/inboxes/pages/inbox-page")) },
    ],
  },
  { path: "messages", handle: { crumb: "Messages" }, lazy: page(() => import("@/features/messages/pages/messages-page")) },
  { path: "drafts", handle: { crumb: "Drafts" }, lazy: page(() => import("@/features/drafts/pages/drafts-page")) },
  {
    path: "webhooks",
    handle: { crumb: "Webhooks" },
    children: [
      { index: true, lazy: page(() => import("@/features/webhooks/pages/webhooks-page")) },
      { path: ":webhookId", handle: { crumb: WebhookCrumb }, lazy: page(() => import("@/features/webhooks/pages/webhook-page")) },
    ],
  },
  { path: "api-keys", handle: { crumb: "API keys" }, lazy: page(() => import("@/features/api-keys/pages/api-keys-page")) },
  {
    path: "settings",
    handle: { crumb: "Settings" },
    element: <SettingsLayout />,
    children: [
      { index: true, element: <Navigate to="workspace" replace /> },
      { path: "workspace", handle: { crumb: "General" }, lazy: page(() => import("@/features/workspace/pages/workspace-settings-page")) },
      { path: "members", handle: { crumb: "Members" }, lazy: page(() => import("@/features/members/pages/members-page")) },
      { path: "account", handle: { crumb: "Profile" }, lazy: page(() => import("@/features/account/pages/account-page")) },
      { path: "security", handle: { crumb: "Security" }, lazy: page(() => import("@/features/account/pages/security-page")) },
    ],
  },
  { path: "*", Component: NotFound },
]);

export const router = createBrowserRouter([
  {
    element: <RequireConfigured />,
    errorElement: <RouteError />,
    children: [
      {
        element: <RequireStage allow={["anonymous"]} />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: "login", lazy: page(() => import("@/features/auth/pages/login-page")) },
              { path: "signup", lazy: page(() => import("@/features/auth/pages/signup-page")) },
              { path: "forgot-password", lazy: page(() => import("@/features/auth/pages/forgot-password-page")) },
            ],
          },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: "reset-password", lazy: page(() => import("@/features/auth/pages/reset-password-page")) },
          { path: "verify-email", lazy: page(() => import("@/features/auth/pages/verify-email-page")) },
          { path: "invite/:token", lazy: page(() => import("@/features/invite/pages/accept-invite-page")) },
          {
            element: <RequireStage allow={["unverified"]} />,
            children: [{ path: "check-email", lazy: page(() => import("@/features/auth/pages/check-email-page")) }],
          },
        ],
      },
      {
        element: <RequireStage allow={["onboarding"]} />,
        children: [{ path: "onboarding", lazy: page(() => import("@/features/onboarding/pages/onboarding-page")) }],
      },
      {
        element: <RequireStage allow={["ready"]} />,
        children: [{ path: "/", element: <AppShell />, errorElement: <RouteError />, children: appRoutes }],
      },
    ],
  },
]);
