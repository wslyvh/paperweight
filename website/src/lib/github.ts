const RELEASES_URL =
  "https://api.github.com/repos/wslyvh/paperweight/releases?per_page=30";

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  published_at: string;
  html_url: string;
  prerelease: boolean;
}

export async function getReleases(): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(RELEASES_URL, {
    next: { revalidate: false },
    headers,
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const data = (await res.json()) as GitHubRelease[];
  return data.map((r) => ({
    tag_name: r.tag_name,
    name: r.name,
    body: r.body ?? null,
    published_at: r.published_at,
    html_url: r.html_url,
    prerelease: r.prerelease ?? false,
  }));
}

/** Version string without "v" prefix, e.g. "0.1.4". */
export async function getLatestVersion(): Promise<string | null> {
  const releases = await getReleases();
  const tag = releases[0]?.tag_name;
  if (!tag) return null;
  return tag.startsWith("v") ? tag.slice(1) : tag;
}
