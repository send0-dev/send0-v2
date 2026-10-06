import type { CreateWebhookParams, UpdateWebhookParams, Webhook } from "@send0/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { webhookKeys } from "./keys";

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateWebhookParams) => send0.webhooks.create(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: webhookKeys.list() }),
  });
}

export function useUpdateWebhook(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: UpdateWebhookParams) => send0.webhooks.update(id, params),
    onSuccess: (w: Webhook) => {
      qc.setQueryData(webhookKeys.detail(id), w);
      void qc.invalidateQueries({ queryKey: webhookKeys.list() });
    },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send0.webhooks.delete(id),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: webhookKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: webhookKeys.list() });
    },
  });
}

export function useRotateWebhookSecret() {
  return useMutation({ mutationFn: (id: string) => send0.webhooks.rotateSecret(id) });
}

/** Sends a webhook.test event; the delivery shows up in the log a moment later. */
export function useTestWebhook(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => send0.webhooks.test(id),
    onSuccess: () => setTimeout(() => void qc.invalidateQueries({ queryKey: [...webhookKeys.all, "deliveries", id] }), 1500),
  });
}

export function useRetryDelivery(webhookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => send0.webhooks.retryDelivery(webhookId, deliveryId),
    onSettled: () => qc.invalidateQueries({ queryKey: [...webhookKeys.all, "deliveries", webhookId] }),
  });
}
