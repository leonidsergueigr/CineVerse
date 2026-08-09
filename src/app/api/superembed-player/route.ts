import { NextRequest, NextResponse } from "next/server";
import { isTrustedPlayerHostname } from "@/lib/streaming";

const PREFERRED_SERVER = 29; // voe.sx — deja whitelist dans l'extension companion

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("tmdbId");
  const season = searchParams.get("s") ?? "0";
  const episode = searchParams.get("e") ?? "0";

  if (!tmdbId) {
    return NextResponse.json({ error: "tmdbId manquant" }, { status: 400 });
  }

  const upstreamUrl = new URL("https://getsuperembed.link/");
  upstreamUrl.searchParams.set("video_id", tmdbId);
  upstreamUrl.searchParams.set("tmdb", "1");
  upstreamUrl.searchParams.set("season", season);
  upstreamUrl.searchParams.set("episode", episode);
  upstreamUrl.searchParams.set("preferred_server", String(PREFERRED_SERVER));
  upstreamUrl.searchParams.set("player_bg_color", "000000");
  upstreamUrl.searchParams.set("player_font_color", "ffffff");
  upstreamUrl.searchParams.set("player_primary_color", "e11d2e");
  upstreamUrl.searchParams.set("player_secondary_color", "6900e0");
  upstreamUrl.searchParams.set("player_loader", "1");
  upstreamUrl.searchParams.set("player_sources_toggle_type", "2");

  let playerUrl: string;
  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      signal: AbortSignal.timeout(7000),
    });
    playerUrl = (await upstreamRes.text()).trim();
  } catch {
    return NextResponse.json({ error: "Le serveur n'a pas repondu" }, { status: 504 });
  }

  if (!playerUrl.startsWith("https://")) {
    return NextResponse.json({ error: "Source indisponible" }, { status: 502 });
  }

  let hostname: string;
  try {
    hostname = new URL(playerUrl).hostname;
  } catch {
    return NextResponse.json({ error: "URL de lecteur invalide" }, { status: 502 });
  }

  if (!isTrustedPlayerHostname(hostname)) {
    return NextResponse.json(
      { error: `Mirroir non reconnu et refuse par la CSP: ${hostname}` },
      { status: 502 },
    );
  }

  return NextResponse.redirect(playerUrl, { status: 302 });
}