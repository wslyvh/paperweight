import { useEffect, useState } from "react";
import type { ImpactStats } from "@shared/types";
import { formatBytes } from "@shared/formatting";

function buildSentence(stats: ImpactStats): { headline: string; detail: string } | null {
  const { listsUnsubscribed, emailsDeleted, dataReclaimedBytes } = stats;
  if (listsUnsubscribed === 0 && emailsDeleted === 0 && dataReclaimedBytes === 0) return null;

  const parts: string[] = [];
  if (listsUnsubscribed > 0)
    parts.push(`unsubscribed from ${listsUnsubscribed.toLocaleString()} list${listsUnsubscribed !== 1 ? "s" : ""}`);
  if (emailsDeleted > 0)
    parts.push(`deleted ${emailsDeleted.toLocaleString()} email${emailsDeleted !== 1 ? "s" : ""}`);

  const headline = parts.length > 0 ? `You've ${parts.join(" and ")}.` : "";
  const detail = dataReclaimedBytes > 0 ? `${formatBytes(dataReclaimedBytes)} reclaimed` : "";

  return { headline, detail };
}

export default function ImpactBlock({ refreshKey }: { refreshKey?: number }): JSX.Element | null {
  const [stats, setStats] = useState<ImpactStats | null>(null);

  useEffect(() => {
    window.api.getImpactStats().then(setStats);
  }, [refreshKey]);

  if (!stats) return null;

  const content = buildSentence(stats);
  if (!content) return null;

  return (
    <div className="flex items-start gap-3 p-4 bg-base-200 rounded-2xl">
      <span className="text-success mt-0.5">✓</span>
      <div>
        <p className="font-medium">{content.headline}</p>
        {content.detail && (
          <p className="text-sm text-base-content/60 mt-0.5">{content.detail}</p>
        )}
      </div>
    </div>
  );
}
