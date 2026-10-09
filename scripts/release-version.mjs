#!/usr/bin/env node
// Keeps the published packages' versions in step with the release tag.
//
//   node scripts/release-version.mjs 0.2.0           set every version (then run `uv lock` in the Python packages)
//   node scripts/release-version.mjs --check v0.2.0  exit 1 unless every version matches the tag
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const V = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;

/** Each place a version is written: the file, and a pattern whose first group is the text before it. */
const SPOTS = [
  ...["sdk", "mcp", "ai-sdk", "langchain"].map((p) => [`packages/${p}/package.json`, new RegExp(`^(  "version": ")${V}`, "m")]),
  ["packages/sdk/src/http.ts", new RegExp(`^(const VERSION = ")${V}`, "m")],
  ["packages/mcp/src/server.ts", new RegExp(`(version = ")${V}`)],
  // The MCP registry listing: the server's version, then the npm package it points at.
  ["packages/mcp/server.json", new RegExp(`^(  "version": ")${V}`, "m")],
  ["packages/mcp/server.json", new RegExp(`^(      "version": ")${V}`, "m")],
  ["packages/sdk-python/pyproject.toml", new RegExp(`^(version = ")${V}`, "m")],
  ["packages/sdk-python/src/send0/_base.py", new RegExp(`^(VERSION = ")${V}`, "m")],
  ["packages/langchain-python/pyproject.toml", new RegExp(`^(version = ")${V}`, "m")],
  ["packages/langchain-python/pyproject.toml", new RegExp(`("send0>=)${V}`)],
  ["packages/langchain-python/src/langchain_send0/__init__.py", new RegExp(`^(__version__ = ")${V}`, "m")],
];

const args = process.argv.slice(2);
const check = args[0] === "--check";
const version = (check ? args[1] : args[0])?.replace(/^v/, "");
if (!version || !new RegExp(`^${V}$`).test(version)) {
  console.error("usage: release-version.mjs [--check] <version or vX.Y.Z tag>");
  process.exit(2);
}

let wrong = 0;
for (const [file, pattern] of SPOTS) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const match = pattern.exec(text);
  if (!match) {
    console.error(`${file}: no version found for ${pattern}`);
    process.exit(1);
  }
  const found = match[0].slice(match[1].length);
  if (check) {
    if (found !== version) {
      console.error(`${file}: ${found}, expected ${version}`);
      wrong++;
    }
  } else if (found !== version) {
    writeFileSync(path, text.replace(pattern, `$1${version}`));
    console.log(`${file}: ${found} → ${version}`);
  }
}
if (wrong) {
  console.error(`Run: node scripts/release-version.mjs ${version}, then uv lock in packages/sdk-python and packages/langchain-python.`);
  process.exit(1);
}
if (check) console.log(`All package versions are ${version}.`);
