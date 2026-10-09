import { llms, loader } from "fumadocs-core/source";
import { absoluteUrl, docsRoute } from "./shared";
import { defineDocs } from "fumadocs-mdx/macro";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { applyMdxPreset } from "fumadocs-mdx/config";
import { send0Dark, send0Light } from "./shiki-themes";

const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: {
        themes: { light: send0Light, dark: send0Dark },
        defaultColor: false,
        mergeWhitespaces: "never",
      },
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [],
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${absoluteUrl(page.url)})

${await page.data.getText("processed")}`,
});
