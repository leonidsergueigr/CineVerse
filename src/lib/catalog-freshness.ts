export type EpisodeProgress = {
  episodeNumber: number;
  totalEpisodes: number | null;
};

export function parseEpisodeProgress(value: string): EpisodeProgress | null {
  const match = value.match(
    /\b(?:ep(?:isode)?\s*)?(\d+)\s*(?:(?:sur|of)\s*(\d+)|\/\s*(\d+))\b/i,
  );
  if (!match) return null;

  const episodeNumber = Number(match[1]);
  const totalEpisodes = Number(match[2] ?? match[3] ?? 0) || null;
  if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1) return null;
  if (totalEpisodes !== null && totalEpisodes < episodeNumber) return null;

  return { episodeNumber, totalEpisodes };
}

export function recentDateCutoff(now = new Date(), days = 14) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, days));
  return cutoff.toISOString().slice(0, 10);
}

export function isRecentlyAired(
  airDate: string | null | undefined,
  now = new Date(),
  days = 14,
) {
  if (!airDate || !/^\d{4}-\d{2}-\d{2}$/.test(airDate)) return false;
  const currentDate = now.toISOString().slice(0, 10);
  return airDate >= recentDateCutoff(now, days) && airDate <= currentDate;
}
