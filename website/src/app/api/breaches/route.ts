export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getBreachedCompanies } from "@/utils/content";

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = normalizeDomain(searchParams.get("domain") || "");
  if (!domain) {
    return NextResponse.json({ breach: null });
  }

  const breach = getBreachedCompanies("2000-01-01").find((entry) => {
    const breachDomain = normalizeDomain(entry.domain);
    return (
      breachDomain === domain ||
      domain.endsWith(`.${breachDomain}`) ||
      breachDomain.endsWith(`.${domain}`)
    );
  });

  if (!breach) {
    return NextResponse.json({ breach: null });
  }

  return NextResponse.json({
    breach: {
      slug: breach.slug,
      title: breach.title,
    },
  });
}
