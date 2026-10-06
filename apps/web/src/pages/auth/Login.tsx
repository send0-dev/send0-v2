import { useState } from "react";
import { AuthLayout, TextLink } from "../../components/AuthLayout";
import { Alert, Button, Field, Input } from "../../components/ui";
import { http } from "../../lib/api";
import { useSubmit } from "../../lib/form";
import { useSession } from "../../lib/session";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, fieldErrors, run } = useSubmit();
  const { refresh } = useSession();

  return (
    <AuthLayout
      title="Log in to send0"
      footer={
        <>
          New to send0? <TextLink to="/signup">Create an account</TextLink>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() =>
            http.post("/auth/login", { email, password })
          );
          if (ok) {
            await refresh(); // the Gate moves on to where the user was headed
          }
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Email" error={fieldErrors.email}>
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password" error={fieldErrors.password}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <div className="-mt-1 text-right text-sm">
          <TextLink to="/forgot-password">Forgot password?</TextLink>
        </div>
        <Button type="submit" loading={pending}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
