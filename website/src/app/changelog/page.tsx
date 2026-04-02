import dayjs from "dayjs";
import { marked } from "marked";
import { SubpageHeader } from "@/components/SubpageHeader";
import { getReleases } from "@/lib/github";
import { SITE_CONFIG } from "@/utils/config";

export const dynamic = "force-static";

export default async function ChangelogPage() {
  const releases = await getReleases().catch(() => null);
  if (!releases) {
    return (
      <div className="container mx-auto w-full px-4 pt-24 pb-12">
        <SubpageHeader
          label="Resources"
          title="Changelog"
        />
        <p className="text-error">
          Could not load releases. Please try again later or view{" "}
          <a
            href={`${SITE_CONFIG.GITHUB_URL}/releases`}
            className="link"
            target="_blank"
            rel="noopener noreferrer"
          >
            releases on GitHub
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto w-full px-4 pt-24 pb-12">
      <SubpageHeader
        label="Resources"
        title="Changelog"
      />
      <div className="divider"></div>

      <div className="space-y-0">
        {releases.map((release, i) => (
          <div key={release.tag_name}>
            {i > 0 && <div className="divider my-8" />}
            <article className="flex flex-col md:flex-row gap-4 md:gap-8">
              <aside className="md:w-36 shrink-0 space-y-2">
                <p className="text-base font-medium">
                  <a
                    href={release.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    {release.tag_name}
                  </a>
                </p>
                <p className="text-sm opacity-70">
                  {dayjs(release.published_at).format("MMM D, YYYY")}
                </p>
                {release.prerelease && (
                  <span className="badge badge-sm badge-warning badge-outline">
                    Pre-release
                  </span>
                )}
              </aside>
              <div className="flex-1 min-w-0">
                {release.body ? (
                  <div
                    className="prose prose-sm max-w-none prose-headings:font-semibold"
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(release.body) as string,
                    }}
                  />
                ) : null}
              </div>
            </article>
          </div>
        ))}
      </div>
    </div>
  );
}
