import type { ApiKeyWithSecret } from "@send0/sdk";
import { useState } from "react";
import { toast } from "sonner";
import { SecretReveal } from "@/components/secret-reveal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCreateApiKey } from "@/features/api-keys/api/use-create-api-key";
import { errorMessage } from "@/lib/api";
import { StepHeader } from "../components/step-header";

export function KeyStep({ onDone }: { onDone: (key: string) => void }) {
  const create = useCreateApiKey();
  const [key, setKey] = useState<ApiKeyWithSecret | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <StepHeader
        title="Your API key"
        description="Your code and agents use it to call send0. It can read and send, but can't manage keys or webhooks."
      />
      {!key ? (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={create.isPending}
          onClick={() =>
            create.mutate(
              { name: "Default key", scopes: ["read", "send"] },
              { onSuccess: setKey, onError: (e) => toast.error(errorMessage(e)) },
            )
          }
        >
          Create API key
        </Button>
      ) : (
        <div className="grid gap-5">
          <SecretReveal value={key.key} what="API key" />
          <div className="flex items-center gap-2">
            <Checkbox id="saved-key" checked={saved} onCheckedChange={(c) => setSaved(c === true)} />
            <Label htmlFor="saved-key" className="font-normal">
              I've stored my key somewhere safe
            </Label>
          </div>
          <Button variant="primary" size="lg" disabled={!saved} onClick={() => onDone(key.key)}>
            Continue
          </Button>
        </div>
      )}
    </>
  );
}
