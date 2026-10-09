import { source } from "@/lib/source";
import { DocsBody, DocsDescription, DocsPage, DocsTitle, MarkdownCopyButton, ViewOptionsPopover } from "fumadocs-ui/layouts/notebook/page";
import { notFound } from "next/navigation";
import type * as PageTree from "fumadocs-core/page-tree";
import { getMDXComponents } from "@/components/mdx";
import type { Metadata } from "next";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { basePath, getPageImageUrl, getPageMarkdownUrl, gitConfig, repoPublic } from "@/lib/shared";

export default async function Page(props: PageProps<"/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  // Relative: the copy button and the Markdown link add basePath (/docs) themselves.
  const markdownUrl = getPageMarkdownUrl(page).url;
  const section = sectionOf(source.getPageTree().children, page.url);

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} breadcrumb={{ enabled: false }} footer={{ className: "s0-pager" }}>
      {section && (
        <p className="s0-eyebrow">
          <span aria-hidden="true"># </span>
          {section}
        </p>
      )}
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row items-center gap-2 border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} className="s0-action" />
        <ViewOptionsPopover
          className="s0-action"
          markdownUrl={markdownUrl}
          {...(repoPublic
            ? {
                githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${page.path}`,
              }
            : {})}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

function sectionOf(nodes: PageTree.Node[], url: string): string | undefined {
  let current: string | undefined;
  for (const node of nodes) {
    if (node.type === "separator") current = typeof node.name === "string" ? node.name : current;
    else if (node.type === "page" && node.url === url) return current;
    else if (node.type === "folder" && (node.index?.url === url || sectionOf(node.children, url) !== undefined)) return current;
  }
  return undefined;
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: basePath + getPageImageUrl(page).url,
    },
  };
}
