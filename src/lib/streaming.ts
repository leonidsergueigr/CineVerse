import type { EmbedProvider, MediaDetails } from "@/lib/types";

export const PLAYER_HOST_IDS = [
  "uqload",
  "voe",
  "dood",
  "filmoon",
  "netu",
] as const;

export type PlayerHostId = (typeof PLAYER_HOST_IDS)[number];
export type StreamLanguageId = "vf" | "vff" | "vfq" | "vostfr" | "vo";

export type StreamCandidate = {
  sourceId: string;
  hostId: PlayerHostId;
  embedUrl: string;
  languageId: StreamLanguageId;
  audioLanguage: string;
  subtitleLanguage: string | null;
  quality: number | null;
  season: number | null;
  episode: number | null;
  capabilities: {
    autoplay: boolean;
    progressTracking: boolean;
    postMessage: boolean;
  };
  reliability: {
    score: number;
    lastCheckedAt: string | null;
  };
};

export type StreamSourceAdapter = {
  id: string;
  providerTemplate(hostId: PlayerHostId): string;
  resolve(input: {
    detail: MediaDetails;
    seasonNumber: number | null;
    episodeNumber: number | null;
  }): Promise<StreamCandidate[]>;
};

type PlayerHostRule = {
  id: PlayerHostId;
  name: string;
  defaultReliability: number;
  origins: Array<{
    hostname: string;
    pathname: RegExp;
  }>;
  capabilities: StreamCandidate["capabilities"];
};

const DEFAULT_CAPABILITIES = {
  autoplay: true,
  progressTracking: false,
  postMessage: false,
};

export const PLAYER_HOST_REGISTRY: Record<PlayerHostId, PlayerHostRule> = {
  uqload: {
    id: "uqload",
    name: "Uqload",
    defaultReliability: 80,
    origins: [
      { hostname: "uqload.is", pathname: /^\/embed-[a-z0-9]+\.html$/i },
      { hostname: "uqload.com", pathname: /^\/embed-[a-z0-9]+\.html$/i },
      { hostname: "uqload.co", pathname: /^\/embed-[a-z0-9]+\.html$/i },
      { hostname: "uqload.to", pathname: /^\/embed-[a-z0-9]+\.html$/i },
    ],
    capabilities: DEFAULT_CAPABILITIES,
  },
  voe: {
    id: "voe",
    name: "Voe",
    defaultReliability: 75,
    origins: [
      { hostname: "voe.sx", pathname: /^\/e\/[a-z0-9]+\/?$/i },
      { hostname: "kokoflix.lol", pathname: /^\/osaka_go\.php$/ },
    ],
    capabilities: DEFAULT_CAPABILITIES,
  },
  dood: {
    id: "dood",
    name: "Dood",
    defaultReliability: 65,
    origins: [
      {
        hostname: "kakaflix.lol",
        pathname: /^\/doood\/newPlayer\.php$/,
      },
      { hostname: "kokoflix.lol", pathname: /^\/tokyo_go\.php$/ },
    ],
    capabilities: DEFAULT_CAPABILITIES,
  },
  filmoon: {
    id: "filmoon",
    name: "Filmoon",
    defaultReliability: 60,
    origins: [
      { hostname: "kokoflix.lol", pathname: /^\/grandline_go\.php$/ },
      { hostname: "filmoon.sx", pathname: /^\/e\/[a-z0-9]+\/?$/i },
    ],
    capabilities: DEFAULT_CAPABILITIES,
  },
  netu: {
    id: "netu",
    name: "Netu",
    defaultReliability: 55,
    origins: [
      {
        hostname: "kakaflix.lol",
        pathname: /^\/moon2\/newPlayer\.php$/,
      },
      { hostname: "netu.tv", pathname: /^\/e\/[a-z0-9]+\/?$/i },
      { hostname: "waaw.to", pathname: /^\/e\/[a-z0-9]+\/?$/i },
    ],
    capabilities: DEFAULT_CAPABILITIES,
  },
};

type CandidateInput = {
  sourceId: string;
  hostId: PlayerHostId;
  embedUrl: string;
  languageId: StreamLanguageId;
  audioLanguage: string;
  subtitleLanguage: string | null;
  quality?: number | null;
  season: number | null;
  episode: number | null;
  reliabilityScore?: number;
  lastCheckedAt?: string | null;
};

export function createStreamCandidate(
  input: CandidateInput,
): StreamCandidate | null {
  const host = PLAYER_HOST_REGISTRY[input.hostId];
  const embedUrl = normalizePlayerUrl(input.hostId, input.embedUrl);
  if (!host || !embedUrl) return null;

  return {
    sourceId: input.sourceId,
    hostId: input.hostId,
    embedUrl,
    languageId: input.languageId,
    audioLanguage: input.audioLanguage,
    subtitleLanguage: input.subtitleLanguage,
    quality:
      typeof input.quality === "number" && Number.isFinite(input.quality)
        ? input.quality
        : null,
    season: finiteIntegerOrNull(input.season),
    episode: finiteIntegerOrNull(input.episode),
    capabilities: { ...host.capabilities },
    reliability: {
      score: Number.isFinite(input.reliabilityScore)
        ? Math.max(0, Math.min(100, Number(input.reliabilityScore)))
        : host.defaultReliability,
      lastCheckedAt:
        input.lastCheckedAt === null
          ? null
          : validDateString(input.lastCheckedAt)
            ? input.lastCheckedAt ?? null
            : new Date().toISOString(),
    },
  };
}

export function normalizeCachedStreamCandidates(
  value: unknown,
): StreamCandidate[] | null {
  if (!Array.isArray(value)) return null;

  const candidates = value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    if (
      typeof candidate.sourceId !== "string" ||
      !isPlayerHostId(candidate.hostId) ||
      typeof candidate.embedUrl !== "string" ||
      !isStreamLanguageId(candidate.languageId) ||
      typeof candidate.audioLanguage !== "string" ||
      (candidate.subtitleLanguage !== null &&
        typeof candidate.subtitleLanguage !== "string")
    ) {
      return [];
    }

    const reliability = isRecord(candidate.reliability)
      ? candidate.reliability
      : null;
    const normalized = createStreamCandidate({
      sourceId: candidate.sourceId,
      hostId: candidate.hostId,
      embedUrl: candidate.embedUrl,
      languageId: candidate.languageId,
      audioLanguage: candidate.audioLanguage,
      subtitleLanguage: candidate.subtitleLanguage,
      quality:
        typeof candidate.quality === "number" ? candidate.quality : null,
      season:
        typeof candidate.season === "number" ? candidate.season : null,
      episode:
        typeof candidate.episode === "number" ? candidate.episode : null,
      reliabilityScore:
        reliability && typeof reliability.score === "number"
          ? reliability.score
          : undefined,
      lastCheckedAt:
        reliability && typeof reliability.lastCheckedAt === "string"
          ? reliability.lastCheckedAt
          : null,
    });
    return normalized ? [normalized] : [];
  });

  return candidates.length === value.length ? candidates : null;
}

export function streamCandidatesToProviders(
  candidates: StreamCandidate[],
  options: {
    providerIdPrefix: string;
    templateForHost: (hostId: PlayerHostId) => string;
  },
): EmbedProvider[] {
  return PLAYER_HOST_IDS.flatMap((hostId) => {
    const hostCandidates = candidates
      .filter((candidate) => candidate.hostId === hostId)
      .sort(
        (left, right) =>
          right.reliability.score - left.reliability.score,
      );
    if (!hostCandidates.length) return [];

    const languages = Array.from(
      new Map(
        hostCandidates.map((candidate) => [
          candidate.languageId,
          {
            id: candidate.languageId,
            label: streamLanguageLabel(candidate.languageId),
          },
        ]),
      ).values(),
    );
    const reliability = Math.max(
      ...hostCandidates.map((candidate) => candidate.reliability.score),
    );
    const host = PLAYER_HOST_REGISTRY[hostId];

    return [
      {
        id: `${options.providerIdPrefix}-${hostId}`,
        name: host.name,
        template: options.templateForHost(hostId),
        supportsTracking: host.capabilities.progressTracking,
        supportsLanguage: true,
        priority: 120 - reliability,
        languages,
      } satisfies EmbedProvider,
    ];
  }).sort((left, right) => left.priority - right.priority);
}

export function normalizePlayerUrl(
  hostId: PlayerHostId,
  value: string,
): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const host = PLAYER_HOST_REGISTRY[hostId];
  const matchesBuiltInRule = host.origins.some(
    (origin) =>
      origin.hostname === hostname && origin.pathname.test(url.pathname),
  );
  const explicitlyAllowed = getExtraPlayerHostnames(hostId).has(hostname);
  if (!matchesBuiltInRule && !explicitlyAllowed) return null;

  url.hash = "";
  return url.toString();
}

export function isPlayerHostId(value: unknown): value is PlayerHostId {
  return (
    typeof value === "string" &&
    PLAYER_HOST_IDS.includes(value as PlayerHostId)
  );
}

export function isStreamLanguageId(
  value: unknown,
): value is StreamLanguageId {
  return (
    typeof value === "string" &&
    ["vf", "vff", "vfq", "vostfr", "vo"].includes(value)
  );
}

export function streamLanguageLabel(language: StreamLanguageId) {
  const labels: Record<StreamLanguageId, string> = {
    vf: "VF",
    vff: "VFF",
    vfq: "VFQ",
    vostfr: "VOSTFR",
    vo: "VO",
  };
  return labels[language];
}

export function getAllowedPlayerFrameOrigins() {
  const origins = new Set<string>(["'self'"]);

  for (const host of Object.values(PLAYER_HOST_REGISTRY)) {
    for (const origin of host.origins) {
      origins.add(`https://${origin.hostname}`);
    }
    for (const hostname of getExtraPlayerHostnames(host.id)) {
      origins.add(`https://${hostname}`);
    }
  }

  const configuredProviders = parseJsonArray(
    process.env.CINEVERSE_EMBED_PROVIDERS_JSON,
  );
  for (const provider of configuredProviders) {
    if (!isRecord(provider) || typeof provider.template !== "string") continue;
    const origin = originFromTemplate(provider.template);
    if (origin) origins.add(origin);
  }

  return Array.from(origins);
}

function getExtraPlayerHostnames(hostId: PlayerHostId) {
  const result = new Set<string>();
  const raw = process.env.CINEVERSE_PLAYER_HOST_ALLOWLIST_JSON;
  if (!raw) return result;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed[hostId])) return result;
    for (const value of parsed[hostId]) {
      const hostname = normalizeHostname(value);
      if (hostname) result.add(hostname);
    }
  } catch {
    return result;
  }
  return result;
}

function normalizeHostname(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(
      value.includes("://") ? value.trim() : `https://${value.trim()}`,
    );
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return null;
    }
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function originFromTemplate(template: string) {
  if (!template.startsWith("https://")) return null;
  try {
    const url = new URL(template.replace(/\{[^}]+\}/g, "placeholder"));
    return url.username || url.password || (url.port && url.port !== "443")
      ? null
      : url.origin;
  } catch {
    return null;
  }
}

function parseJsonArray(value: string | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function finiteIntegerOrNull(value: number | null) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function validDateString(value: string | null | undefined) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
