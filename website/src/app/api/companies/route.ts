export const runtime = "nodejs";

import type { CompanyOption } from "@shared/gdpr";
import { NextResponse } from "next/server";
import companies from "@/data/companies.generated.json";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = normalize(searchParams.get("q") || "");
  const rawLimit = Number(searchParams.get("limit") || "8");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 20)
    : 8;

  if (!query || query.length < 2) {
    return NextResponse.json({ companies: [] });
  }

  const startsWith: CompanyOption[] = [];
  const includes: CompanyOption[] = [];

  for (const company of companies as CompanyOption[]) {
    const name = company.name.toLowerCase();
    if (name.startsWith(query)) {
      startsWith.push(company);
    } else if (
      name.includes(query) ||
      company.domains.some((domain) => domain.includes(query))
    ) {
      includes.push(company);
    }
    if (startsWith.length + includes.length >= limit * 4) {
      break;
    }
  }

  return NextResponse.json({
    companies: [...startsWith, ...includes].slice(0, limit),
  });
}
