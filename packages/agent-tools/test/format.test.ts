import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatDraft, formatInbox, formatMessage, formatMessageLine, formatThread, formatThreadLine } from "../src";

// Shared with packages/langchain-python, whose Python port must produce the same text.
type Case = { fn: string; input: never; full?: boolean; output: string };
const cases = JSON.parse(readFileSync(new URL("./fixtures/format-cases.json", import.meta.url), "utf8")) as Case[];

const formatters: Record<string, (input: never, full?: boolean) => string> = {
  format_message: (m, full) => formatMessage(m, { full }),
  format_message_line: (m) => formatMessageLine(m),
  format_thread_line: (t) => formatThreadLine(t),
  format_thread: (t, full) => formatThread(t, { full }),
  format_inbox: (i) => formatInbox(i),
  format_draft: (d) => formatDraft(d),
};

describe("formatters", () => {
  it.each(cases.map((c, i) => [i, c.fn, c] as const))("case %i (%s) matches the shared fixture", (_i, fn, c) => {
    expect(formatters[fn]!(c.input, c.full)).toBe(c.output);
  });
});
