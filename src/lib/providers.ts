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
  const values: Record<string, string> = {
    tmdbId: String(detail.id),
    mediaType: detail.mediaType,
    title: detail.title,
    language: options.language,
    season: String(options.seasonNumber ?? 1),
    episode: String(options.episodeNumber ?? 1),
  };

  return provider.template.replace(/\{(\w+)\}/g, (_, key: string) =>
    encodeURIComponent(values[key] ?? ""),
  );
}

function demoProviders(): EmbedProvider[] {
  return [
    {
      id: "cineverse-demo",
      name: "CineVerse Demo",
      template:
        "/api/demo-player?tmdbId={tmdbId}&mediaType={mediaType}&title={title}&language={language}&season={season}&episode={episode}",
      supportsTracking: true,
      supportsLanguage: true,
      priority: 1,
    },
  ];
}
