import type { CreateApiKeyParams } from "@send0/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { apiKeyKeys } from "./keys";

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateApiKeyParams) => send0.apiKeys.create(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeyKeys.list() }),
  });
}
