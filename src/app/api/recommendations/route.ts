import { NextResponse } from "next/server";
import { buildPersonalizedRecommendations } from "@/lib/recommendations";
import { getLikes } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await buildPersonalizedRecommendations(getLikes());
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
