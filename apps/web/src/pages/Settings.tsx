import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
} from "../components/ui";
import { http } from "../lib/api";
import { useSubmit } from "../lib/form";
import { useSession } from "../lib/session";

export default function Settings() {
  const { me, refresh } = useSession();
  const [name, setName] = useState(me?.name ?? "");
  const [workspace, setWorkspace] = useState(me?.org_name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const profile = useSubmit();
  const ws = useSubmit();
  const pw = useSubmit();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6">
        <Card className="p-6">
          <h2 className="font-semibold">Profile</h2>
          <form
            className="mt-4 grid max-w-md gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await profile.run(() => http.patch("/auth/profile", { name }))
              ) {
                await refresh();
                setSaved("Profile saved.");
              }
            }}
          >
            {profile.error && <Alert>{profile.error}</Alert>}
            <Field label="Email" hint="Contact support@send0.dev to change it.">
              {(id) => <Input id={id} value={me?.email ?? ""} disabled />}
            </Field>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button type="submit" loading={profile.pending}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">Workspace</h2>
          <form
            className="mt-4 grid max-w-md gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await ws.run(() =>
                  http.post("/auth/workspace", { name: workspace })
                )
              ) {
                await refresh();
                setSaved("Workspace renamed.");
              }
            }}
          >
            {ws.error && <Alert>{ws.error}</Alert>}
            <Field label="Workspace name" error={ws.fieldErrors.name}>
              {(id) => (
                <Input
                  id={id}
                  required
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button type="submit" variant="secondary" loading={ws.pending}>
                Rename
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">Password</h2>
          <form
            className="mt-4 grid max-w-md gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await pw.run(() =>
                  http.post("/auth/change-password", { current, next })
                )
              ) {
                setCurrent("");
                setNext("");
                setSaved("Password changed. Other devices were signed out.");
              }
            }}
          >
            {pw.error && <Alert>{pw.error}</Alert>}
            <Field label="Current password" error={pw.fieldErrors.current}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="New password"
              hint="At least 10 characters."
              error={pw.fieldErrors.next}
            >
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button type="submit" variant="secondary" loading={pw.pending}>
                Change password
              </Button>
            </div>
          </form>
        </Card>
        {saved && <Alert tone="ok">{saved}</Alert>}
      </div>
    </>
  );
}
