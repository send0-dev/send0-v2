/** Writes the OpenAPI document to packages/sdk/openapi.json (the SDK's types are generated from it). */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildOpenApi } from "../src/openapi/spec";

const out = fileURLToPath(new URL("../../../packages/sdk/openapi.json", import.meta.url).href);
writeFileSync(out, JSON.stringify(buildOpenApi(), null, 2) + "\n");
console.log(`wrote ${out}`);
