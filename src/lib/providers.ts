import type { EmbedProvider, MediaDetails } from "@/lib/types";

export function getEmbedProviders(): EmbedProvider[] {
  const raw = process.env.CINEVERSE_EMBED_PROVIDERS_JSON;
  if (raw) {
    try {
      const providers = JSON.parse(raw) as EmbedProvider[];
      return providers
        .filter((provider) => provider.id && provider.name && provider.template)
        .sort((a, b) => a.priority - b.priority);
    } catch {
      return demoProviders();
    }
  }

  return demoProviders();
}

export function buildEmbedUrl(
  provider: EmbedProvider,
  detail: Pick<MediaDetails, "id" | "mediaType" | "title">,
  options: {
    language: string;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
  },
) {
  const providerMediaType = detail.mediaType === "tv" ? "serie" : "movie";
  const languagePath = options.language === "vo" ? "" : `/${options.language}`;
  const season = String(options.seasonNumber ?? 1);
  const episode = String(options.episodeNumber ?? 1);
  const seasonEpisodePath = detail.mediaType === "tv" ? `/${season}/${episode}` : "";
  const values: Record<string, string> = {
    tmdbId: encodeURIComponent(String(detail.id)),
    mediaType: providerMediaType,
    providerMediaType,
    tmdbMediaType: detail.mediaType,
    title: encodeURIComponent(detail.title),
    language: encodeURIComponent(options.language),
    languagePath,
    season: encodeURIComponent(season),
    episode: encodeURIComponent(episode),
    seasonEpisodePath,
  };

  return provider.template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function demoProviders(): EmbedProvider[] {
  return [
    {
      id: "cineverse-demo",
      name: "CineVerse Demo",
      template:
        "/api/demo-player?tmdbId={tmdbId}&mediaType={tmdbMediaType}&title={title}&language={language}&season={season}&episode={episode}",
      supportsTracking: true,
      supportsLanguage: true,
      priority: 1,
    },
  ];
}
