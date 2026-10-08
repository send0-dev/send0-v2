import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  // Inline its types too, so the published .d.ts never names it.
  dts: { resolve: ["@send0/agent-tools"], compilerOptions: { paths: { "@send0/agent-tools": ["../agent-tools/src/index.ts"] } } },
  clean: true,
  // agent-tools is private: ship its code inside this package.
  noExternal: ["@send0/agent-tools"],
});
