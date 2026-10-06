import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { Spinner } from "./components/ui";
import { useSession } from "./lib/session";
import ApiKeys from "./pages/ApiKeys";
import CheckEmail from "./pages/auth/CheckEmail";
import ForgotPassword from "./pages/auth/ForgotPassword";
import Login from "./pages/auth/Login";
import ResetPassword from "./pages/auth/ResetPassword";
import Signup from "./pages/auth/Signup";
import VerifyEmail from "./pages/auth/VerifyEmail";
import Drafts from "./pages/Drafts";
import Inbox from "./pages/Inbox";
import Inboxes from "./pages/Inboxes";
import Onboarding from "./pages/Onboarding";
import Settings from "./pages/Settings";
import Webhooks from "./pages/Webhooks";

type Stage = "anonymous" | "unverified" | "onboarding" | "ready";

function useStage(): Stage | null {
  const { me, loading } = useSession();
  if (loading) return null;
  if (!me) return "anonymous";
  if (!me.email_verified) return "unverified";
  if (!me.onboarded || !me.org_id) return "onboarding";
  return "ready";
}

const HOME: Record<Stage, string> = {
  anonymous: "/login",
  unverified: "/check-email",
  onboarding: "/onboarding",
  ready: "/inboxes",
};

/** Renders children only at the allowed stages; otherwise sends the user where they belong. */
function Gate({ allow, children }: { allow: Stage[]; children: ReactNode }) {
  const stage = useStage();
  const location = useLocation();
  if (!stage) return <Spinner />;
  if (!allow.includes(stage)) {
    // Carry the page the user was after through login and onboarding, then send them there.
    const from = (location.state as { from?: string } | null)?.from;
    const back =
      stage === "ready" &&
      from &&
      /^\/(?!\/)/.test(from) &&
      !Object.values(HOME).includes(from);
    return (
      <Navigate
        to={back ? from : HOME[stage]}
        replace
        state={{ from: from ?? location.pathname }}
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Gate allow={["anonymous"]}>
            <Login />
          </Gate>
        }
      />
      <Route
        path="/signup"
        element={
          <Gate allow={["anonymous"]}>
            <Signup />
          </Gate>
        }
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route
        path="/check-email"
        element={
          <Gate allow={["unverified"]}>
            <CheckEmail />
          </Gate>
        }
      />
      <Route
        path="/onboarding"
        element={
          <Gate allow={["onboarding"]}>
            <Onboarding />
          </Gate>
        }
      />
      <Route
        element={
          <Gate allow={["ready"]}>
            <AppLayout />
          </Gate>
        }
      >
        <Route path="/inboxes" element={<Inboxes />} />
        <Route path="/inboxes/:inboxId" element={<Inbox />} />
        <Route path="/inboxes/:inboxId/threads/:threadId" element={<Inbox />} />
        <Route path="/drafts" element={<Drafts />} />
        <Route path="/webhooks" element={<Webhooks />} />
        <Route path="/api-keys" element={<ApiKeys />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route
        path="*"
        element={
          <Gate allow={["ready"]}>
            <Navigate to="/inboxes" replace />
          </Gate>
        }
      />
    </Routes>
  );
}
