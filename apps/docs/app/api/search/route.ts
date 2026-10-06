import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;

// Result URLs stay relative to the app (e.g. /api-keys): the search dialog navigates with
// Next's router, which adds basePath (/docs) itself.
export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
});
