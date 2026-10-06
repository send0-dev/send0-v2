import { useState } from "react";
import { AuthLayout, TextLink } from "../../components/AuthLayout";
import { Alert, Button, Field, Input } from "../../components/ui";
import { http } from "../../lib/api";
import { useSubmit } from "../../lib/form";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useSubmit();

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your account email and we'll send you a link to choose a new password."}
      footer={<TextLink to="/login">Back to log in</TextLink>}
    >
      {sent ? (
        <Alert tone="ok">
          If an account exists for <b>{email}</b>, a reset link is on its way. It works for 1 hour.
        </Alert>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => http.post("/auth/forgot-password", { email }))) setSent(true);
          }}
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" loading={pending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
