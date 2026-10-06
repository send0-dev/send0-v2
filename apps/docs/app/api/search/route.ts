import { source } from '@/lib/source';
import { basePath } from '@/lib/shared';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
  // Pages are served under basePath; the static index must link there.
  buildIndex: (page) => ({
    id: page.url,
    url: basePath + (page.url === '/' ? '' : page.url),
    title: page.data.title ?? '',
    description: page.data.description,
    structuredData: page.data.structuredData,
  }),
});
