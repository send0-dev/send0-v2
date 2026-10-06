import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'send0';
/** The site is exported with basePath /docs; routes below are relative to it. */
export const basePath = '/docs';
export const siteUrl = 'https://send0.dev';

/** Absolute URL of a docs page, for llms.txt and other out-of-site contexts. */
export function absoluteUrl(url: string): string {
  return `${siteUrl}${basePath}${url === '/' ? '' : url}`;
}
export const docsRoute = '/';
export const docsImageRoute = '/og';
export const docsContentRoute = '/llms.mdx';

/** Flip when the repo goes public: shows 'Edit on GitHub' links. */
export const repoPublic = false;

export const gitConfig = {
  user: 'send0-dev',
  repo: 'send0-v2',
  branch: 'main',
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
