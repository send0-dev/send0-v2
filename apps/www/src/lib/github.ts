import { site } from "../site";

export interface RepoInfo {
  stars: number | null;
  /** The newest version: the latest GitHub Release, or a newer semver tag that has no Release yet. */
  version: string;
  releaseUrl: string;
}

const headers: Record<string, string> = {
  accept: "application/vnd.github+json",
  "user-agent": "send0-www-build",
};

const token = process.env.GITHUB_TOKEN;
if (token) headers.authorization = `Bearer ${token}`;

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/;

/** Compares two vX.Y.Z tags. Pre-releases and anything else sort below every release. */
export function compareTags(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  return 0;
}

/** The newest of the latest Release, the semver tags and the built-in fallback. */
export function pickVersion(releaseTag: string | null, tags: string[], fallback: string): string {
  return [releaseTag, ...tags, fallback]
    .filter((t): t is string => typeof t === "string" && SEMVER.test(t))
    .reduce((best, t) => (compareTags(t, best) > 0 ? t : best), fallback);
}

let cached: Promise<RepoInfo> | undefined;

export function getRepoInfo(): Promise<RepoInfo> {
  cached ??= (async () => {
    const [repo, release, tagList] = await Promise.all([
      getJson(site.githubApi),
      getJson(`${site.githubApi}/releases/latest`),
      getJson(`${site.githubApi}/tags?per_page=30`),
    ]);
    const r = (repo ?? {}) as Record<string, unknown>;
    const rel = (release ?? {}) as Record<string, unknown>;
    const stars = typeof r.stargazers_count === "number" ? r.stargazers_count : null;
    const releaseTag = typeof rel.tag_name === "string" ? rel.tag_name : null;
    const tags = Array.isArray(tagList)
      ? tagList.map((t) => (t as { name?: unknown }).name).filter((n): n is string => typeof n === "string")
      : [];
    const version = pickVersion(releaseTag, tags, site.version);
    const releaseUrl = version === releaseTag && typeof rel.html_url === "string" ? rel.html_url : `${site.github}/releases/tag/${version}`;
    return { stars, version, releaseUrl };
  })();
  return cached;
}

export function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
