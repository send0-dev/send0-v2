import { useState } from "react";
import { useNavigate } from "react-router";
import { AuthLayout, TextLink } from "../../components/AuthLayout";
import { Alert, Button, Field, Input } from "../../components/ui";
import { http } from "../../lib/api";
import { useSubmit } from "../../lib/form";
import { useSession } from "../../lib/session";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, fieldErrors, run } = useSubmit();
  const { refresh } = useSession();
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Create your send0 account"
      subtitle="Give your agents real email inboxes. It takes a minute."
      footer={<>Already have an account? <TextLink to="/login">Log in</TextLink></>}
    >
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => http.post("/auth/signup", { name, email, password }));
          if (ok) {
            await refresh();
            navigate("/check-email", { replace: true });
          }
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Your name" error={fieldErrors.name}>
          {(id) => <Input id={id} autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Work email" error={fieldErrors.email}>
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!fieldErrors.email} />}
        </Field>
        <Field label="Password" hint="At least 10 characters." error={fieldErrors.password}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fieldErrors.password} />}
        </Field>
        <Button type="submit" loading={pending}>
          Create account
        </Button>
        <p className="text-center text-xs text-faint">
          By creating an account you agree to the <a className="underline" href="https://send0.dev/terms">Terms</a> and{" "}
          <a className="underline" href="https://send0.dev/acceptable-use">Acceptable Use Policy</a>.
        </p>
      </form>
    </AuthLayout>
  );
}
