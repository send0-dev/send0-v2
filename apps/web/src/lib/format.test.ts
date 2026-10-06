import { describe, expect, it } from "vitest";
import { formatBytes, pluralize, relativeTime } from "./format";

describe("format", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  it("says when things happened in plain words", () => {
    expect(relativeTime(null)).toBe("never");
    expect(relativeTime("2026-10-06T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-06T11:55:00Z", now)).toBe("5 min. ago");
    expect(relativeTime("2026-10-05T12:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-13T12:00:00Z", now)).toBe("next wk.");
  });

  it("formats sizes and counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(pluralize(1, "inbox", "inboxes")).toBe("1 inbox");
    expect(pluralize(3, "draft")).toBe("3 drafts");
  });
});
