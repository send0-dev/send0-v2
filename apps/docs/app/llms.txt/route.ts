import { docsLlms } from '@/lib/source';
import { basePath, siteUrl } from '@/lib/shared';

export const revalidate = false;

export async function GET() {
  // Absolute links: llms.txt is read outside the site, by assistants and crawlers.
  const index = (await docsLlms.index()).replaceAll('](/', `](${siteUrl}${basePath}/`);
  return new Response(`# send0 docs\n\n> Email inboxes for AI agents. Full docs: ${siteUrl}${basePath}/llms-full.txt\n\n${index}`);
}
