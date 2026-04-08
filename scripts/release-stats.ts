/**
 * Release stats: fetches all releases from GitHub API and prints download stats per platform.
 *
 * Run: npx ts-node scripts/release-stats.ts
 *   or: yarn ts-node scripts/release-stats.ts
 */

const REPO = "wslyvh/paperweight";
const API_URL = `https://api.github.com/repos/${REPO}/releases`;

interface GitHubAsset {
  name: string;
  download_count: number;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  assets: GitHubAsset[];
}

type Platform = "win" | "macos" | "linux-appimage" | "linux-deb" | "other";

function detectPlatform(name: string): Platform {
  const n = name.toLowerCase();
  if (n.endsWith(".exe") || n.includes("setup") || n.includes("windows") || n.includes("-win")) return "win";
  if (n.endsWith(".dmg") || n.includes("macos") || n.includes("darwin") || n.endsWith(".app.tar.gz")) return "macos";
  if (n.endsWith(".appimage")) return "linux-appimage";
  if (n.endsWith(".deb")) return "linux-deb";
  return "other";
}

async function fetchReleases(): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = { "User-Agent": "release-stats-script" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(API_URL, { headers });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<GitHubRelease[]>;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

async function main() {
  const releases = await fetchReleases();

  const totals: Record<Platform, number> = {
    win: 0,
    macos: 0,
    "linux-appimage": 0,
    "linux-deb": 0,
    other: 0,
  };

  for (const release of releases) {
    const date = formatDate(release.published_at);
    console.log(`\nRelease ${release.tag_name} - ${date}`);

    const counts: Record<Platform, number> = { win: 0, macos: 0, "linux-appimage": 0, "linux-deb": 0, other: 0 };
    for (const asset of release.assets) {
      const p = detectPlatform(asset.name);
      counts[p] += asset.download_count;
      totals[p] += asset.download_count;
    }

    console.log(`Win - ${counts.win}`);
    console.log(`Mac - ${counts.macos}`);
    console.log(`Linux AppImage - ${counts["linux-appimage"]}`);
    console.log(`Linux deb - ${counts["linux-deb"]}`);
  }

  const grandTotal = totals.win + totals.macos + totals["linux-appimage"] + totals["linux-deb"] + totals.other;
  console.log(`\nTotals:`);
  console.log(`Win - ${totals.win}`);
  console.log(`Mac - ${totals.macos}`);
  console.log(`Linux AppImage - ${totals["linux-appimage"]}`);
  console.log(`Linux deb - ${totals["linux-deb"]}`);
  console.log(`Total - ${grandTotal}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
