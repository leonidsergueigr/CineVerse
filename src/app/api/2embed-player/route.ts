import { NextRequest, NextResponse } from "next/server";
import { isTrustedPlayerHostname } from "@/lib/streaming";

const TWOEMBED_ENTRY_HOSTNAMES = new Set([
  "2embed.online",
  "www.2embed.online",
  "2embed.stream",
  "www.2embed.stream",
  "2embed.cc",
  "www.2embed.cc",
  "2embed.to",
  "www.2embed.to",
  "2embed.ru",
  "www.2embed.ru",
  "2embed.vip",
  "www.2embed.vip",
  "2e.to",
  "www.2e.to",
  "vibuxer.com",
  "www.vibuxer.com",
]);

const MAX_REDIRECTS = 5;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("tmdbId");
  const mediaType = searchParams.get("mediaType");
  const season = searchParams.get("s") ?? "0";
  const episode = searchParams.get("e") ?? "0";

  if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) {
    return NextResponse.json(
      { error: "Parametres manquants (tmdbId, mediaType)" },
      { status: 400 },
    );
  }

  // 2embed redirige systematiquement (301) vers un domaine miroir different.
  // On resout la chaine de redirections cote serveur pour valider chaque
  // domaine de sortie avant que le navigateur ne navigue dans l'iframe.
  const seasonEpisodePath = mediaType === "tv" ? `/${season}/${episode}` : "";
  let currentUrl = `https://www.2embed.online/embed/${mediaType}/${tmdbId}${seasonEpisodePath}`;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(7000),
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Le serveur n'a pas repondu" },
        { status: 504 },
      );
    }

    if (upstreamRes.status < 300 || upstreamRes.status >= 400) {
      break;
    }

    const location = upstreamRes.headers.get("location");
    if (!location) {
      return NextResponse.json(
        { error: "Redirection sans destination" },
        { status: 502 },
      );
    }
    currentUrl = new URL(location, currentUrl).toString();
  }

  let hostname: string;
  try {
    const url = new URL(currentUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return NextResponse.json(
        { error: "URL de lecteur invalide" },
        { status: 502 },
      );
    }
    hostname = url.hostname.toLowerCase();
  } catch {
    return NextResponse.json(
      { error: "URL de lecteur invalide" },
      { status: 502 },
    );
  }

  if (
    !TWOEMBED_ENTRY_HOSTNAMES.has(hostname) &&
    !isTrustedPlayerHostname(hostname)
  ) {
    return NextResponse.json(
      {
        error: `Mirroir 2embed non reconnu et refuse par la CSP: ${hostname}`,
      },
      { status: 502 },
    );
  }

  return NextResponse.redirect(currentUrl, { status: 302 });
}