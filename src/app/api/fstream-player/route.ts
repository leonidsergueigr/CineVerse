import { NextRequest, NextResponse } from "next/server";
import {
  getFstreamEmbedUrl,
  isFstreamLanguage,
  isFstreamProviderHost,
} from "@/lib/fstream";
import { getDetails } from "@/lib/tmdb";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const host = search.get("host");
  const language = search.get("language");
  const mediaType = search.get("mediaType");
  const tmdbId = Number(search.get("tmdbId"));
  const season = Number(search.get("season") ?? 1);
  const episode = Number(search.get("episode") ?? 1);

  if (
    !isFstreamProviderHost(host) ||
    !isFstreamLanguage(language) ||
    (mediaType !== "movie" && mediaType !== "tv") ||
    !Number.isSafeInteger(tmdbId) ||
    tmdbId <= 0 ||
    !Number.isSafeInteger(season) ||
    season < 0 ||
    !Number.isSafeInteger(episode) ||
    episode <= 0
  ) {
    return playerError("Parametres du lecteur invalides", 400);
  }

  const detail = await getDetails(mediaType as MediaType, tmdbId);
  const embedUrl = await getFstreamEmbedUrl(
    detail,
    host,
    language,
    mediaType === "tv" ? season : null,
    mediaType === "tv" ? episode : null,
  );
  if (!embedUrl) {
    return playerError(
      `${host === "uqload" ? "Uqload" : "Voe"} n'est pas disponible pour cette version.`,
      404,
    );
  }

  const destination = new URL(embedUrl);
  if (search.get("autoplay") === "1") {
    destination.searchParams.set("autoplay", "1");
  }
  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "private, max-age=60");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function playerError(message: string, status: number) {
  return new NextResponse(
    `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html,body{height:100%;margin:0;background:#050505;color:#fff;font-family:Arial,sans-serif}
    body{display:grid;place-items:center;text-align:center}
    p{max-width:34rem;padding:2rem;color:#a1a1aa}
  </style>
</head>
<body><p>${escapeHtml(message)}</p></body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}
