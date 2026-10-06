export interface SseMessage {
  id?: string;
  event?: string;
  data: string;
}

/** Minimal Server-Sent Events parser over a fetch body (works in Node 18+, browsers, Workers, Deno, Bun). */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
        const msg: SseMessage = { data: "" };
        const data: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (!line || line.startsWith(":")) continue;
          const i = line.indexOf(":");
          const field = i === -1 ? line : line.slice(0, i);
          const v = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
          if (field === "data") data.push(v);
          else if (field === "id") msg.id = v;
          else if (field === "event") msg.event = v;
        }
        if (data.length) {
          msg.data = data.join("\n");
          yield msg;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
