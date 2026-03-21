import { ipcMain, app } from "electron";
import { IPC } from "@shared/ipc";
import { APP_CONFIG } from "@shared/config";
import type { UpdateInfo } from "@shared/types";

function parseVersion(version: string): [number, number, number] {
  const cleaned = version.replace(/^v/, "");
  const parts = cleaned.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isNewer(current: string, latest: string): boolean {
  const [cMajor, cMinor, cPatch] = parseVersion(current);
  const [lMajor, lMinor, lPatch] = parseVersion(latest);
  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

function isMajorUpdate(current: string, latest: string): boolean {
  return parseVersion(latest)[0] > parseVersion(current)[0];
}

const GITHUB_HEADERS = { Accept: "application/vnd.github+json" };

function githubFetch(url: string): Promise<Response> {
  return fetch(url, { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(10_000) });
}

export function registerUpdateHandlers(): void {
  ipcMain.handle(IPC.checkForUpdates, async (): Promise<UpdateInfo> => {
    const current = app.getVersion();
    try {
      let latest = "";

      const base = `https://api.github.com/repos/${APP_CONFIG.GITHUB_REPO}`;

      const releasesRes = await githubFetch(`${base}/releases/latest`);
      if (releasesRes.ok) {
        const data = (await releasesRes.json()) as { tag_name?: string };
        latest = (data.tag_name ?? "").replace(/^v/, "");
      } else if (releasesRes.status === 404) {
        // No published releases — fall back to tags
        const tagsRes = await githubFetch(`${base}/tags`);
        if (tagsRes.ok) {
          const tags = (await tagsRes.json()) as { name?: string }[];
          latest = (tags[0]?.name ?? "").replace(/^v/, "");
        }
      }

      if (!latest) {
        return { available: false, isMajor: false, current, latest: current };
      }
      const available = isNewer(current, latest);
      return {
        available,
        isMajor: available && isMajorUpdate(current, latest),
        current,
        latest,
      };
    } catch {
      return { available: false, isMajor: false, current, latest: current };
    }
  });
}
