import { site } from "../site";

export interface RepoInfo {
  stars: number | null;
  version: string;
  releaseUrl: string;
}

const headers: Record<string, string> = {
  accept: "application/vnd.github+json",
  "user-agent": "send0-www-build",
};

const token = process.env.GITHUB_TOKEN;
if (token) headers.authorization = `Bearer ${token}`;

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

let cached: Promise<RepoInfo> | undefined;

export function getRepoInfo(): Promise<RepoInfo> {
  cached ??= (async () => {
    const [repo, release] = await Promise.all([getJson(site.githubApi), getJson(`${site.githubApi}/releases/latest`)]);
    const stars = typeof repo?.stargazers_count === "number" ? repo.stargazers_count : null;
    const tag = typeof release?.tag_name === "string" ? release.tag_name : null;
    const url = typeof release?.html_url === "string" ? release.html_url : `${site.github}/releases`;
    return { stars, version: tag ?? site.version, releaseUrl: url };
  })();
  return cached;
}

export function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
