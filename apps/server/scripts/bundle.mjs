// Bundles the self-hosted server into one ESM file for the Docker image: `node scripts/bundle.mjs [outfile]`.
// Every dependency is inlined, so the runtime image needs no node_modules.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outfile = process.argv[2] ?? `${root}/dist/server.mjs`;

// CommonJS dependencies call require() and read __dirname; an ESM bundle has neither, so define them.
const banner = [
  'import { createRequire as __send0CreateRequire } from "node:module";',
  'import { fileURLToPath as __send0FileURLToPath } from "node:url";',
  'import { dirname as __send0Dirname } from "node:path";',
  "const require = __send0CreateRequire(import.meta.url);",
  "const __filename = __send0FileURLToPath(import.meta.url);",
  "const __dirname = __send0Dirname(__filename);",
].join("\n");

const result = await build({
  entryPoints: [`${root}/src/main.ts`],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: { js: banner },
  // pg (under pg-boss) only requires pg-native when asked for it, which send0 never does.
  external: ["pg-native"],
  legalComments: "linked",
  metafile: true,
  logLevel: "info",
});

const bytes = result.metafile.outputs[Object.keys(result.metafile.outputs).find((k) => k.endsWith(".mjs"))].bytes;
console.log(JSON.stringify({ event: "bundle.done", outfile, mb: Math.round((bytes / 1e6) * 10) / 10 }));
