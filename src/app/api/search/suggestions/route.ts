import { NextRequest, NextResponse } from "next/server";
import { getSearchSuggestions } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ items: [] });

  const items = await getSearchSuggestions(query);
  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
