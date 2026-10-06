import type { MessageFilter } from "@send0/core";
import type { EventEnvelope } from "@send0/pipeline";
import { DurableObject } from "cloudflare:workers";
import { HubState } from "./hub-state";

const KEEPALIVE_MS = 25_000;

/**
 * One instance per inbox (`inbox:ibx_…`) and per org (`org:org_…`).
 * RPC: notify() from the inbound Worker, wait() from the API. fetch() serves an SSE stream.
 */
export class Hub extends DurableObject<Env> {
  private hub = new HubState();
  private keepalive: ReturnType<typeof setInterval> | null = null;

  async notify(envelope: EventEnvelope): Promise<void> {
    this.hub.notify(envelope);
  }

  async wait(filter: MessageFilter, sinceMs: number, timeoutMs: number): Promise<EventEnvelope | null> {
    return this.hub.wait(filter, sinceMs, timeoutMs);
  }

  override async fetch(request: Request): Promise<Response> {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const write = (chunk: string) => writer.write(enc.encode(chunk));

    const unsubscribe = this.hub.subscribe(write);
    request.signal.addEventListener("abort", () => {
      unsubscribe();
      writer.close().catch(() => {});
      this.stopKeepaliveIfIdle();
    });
    this.keepalive ??= setInterval(() => {
      this.hub.ping();
      this.stopKeepaliveIfIdle();
    }, KEEPALIVE_MS);

    return new Response(readable, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
    });
  }

  private stopKeepaliveIfIdle() {
    if (this.keepalive && this.hub.subscriberCount === 0) {
      clearInterval(this.keepalive);
      this.keepalive = null;
    }
  }
}
