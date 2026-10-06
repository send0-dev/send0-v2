import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AuthLayout, TextLink } from "../../components/AuthLayout";
import { Alert, Button, Field, Input } from "../../components/ui";
import { http } from "../../lib/api";
import { useSubmit } from "../../lib/form";
import { useSession } from "../../lib/session";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending, error, fieldErrors, run, setError } = useSubmit();
  const { refresh } = useSession();
  const navigate = useNavigate();

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be signed out on every other device." footer={<TextLink to="/login">Back to log in</TextLink>}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) return setError("The passwords don't match.");
          if (await run(() => http.post("/auth/reset-password", { token: params.get("token") ?? "", password }))) {
            await refresh();
            navigate("/", { replace: true });
          }
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field label="New password" hint="At least 10 characters." error={fieldErrors.password}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={10} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Confirm new password">{(id) => <Input id={id} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <Button type="submit" loading={pending}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
