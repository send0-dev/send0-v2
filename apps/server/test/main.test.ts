import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/main";

describe("parseArgs", () => {
  it("starts every role by default", () => {
    expect(parseArgs(["start"])).toEqual({ kind: "start", roles: ["http", "worker", "smtp"] });
  });

  it("narrows roles with --only", () => {
    expect(parseArgs(["start", "--only=http, worker,http"])).toEqual({ kind: "start", roles: ["http", "worker"] });
  });

  it("rejects unknown commands, options and roles", () => {
    expect(parseArgs(["serve"])).toMatchObject({ kind: "error", message: "Unknown command: serve" });
    expect(parseArgs(["start", "--port=1"])).toMatchObject({ kind: "error", message: "Unknown option: --port=1" });
    expect(parseArgs(["start", "--only=http,pop3"])).toMatchObject({ kind: "error" });
    expect(parseArgs(["start", "--only="])).toMatchObject({ kind: "error" });
  });

  it("shows help with no command", () => {
    expect(parseArgs([])).toEqual({ kind: "help" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
  });
});
