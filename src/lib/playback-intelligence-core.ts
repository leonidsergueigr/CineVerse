import { TRACKING_CONFIG } from "@/lib/watch-tracking";

export type PlaybackObservationSample = {
  episodeNumber: number;
  fromSeconds: number;
  toSeconds: number;
  durationSeconds: number;
  remainingSeconds: number;
};

export type LearnedSegmentCandidate = {
  startSeconds: number;
  endSeconds: number;
  remainingSeconds: number;
  sampleCount: number;
  confidence: number;
};

export function learnPlaybackSegment(
  type: "intro" | "credits",
  samples: PlaybackObservationSample[],
): LearnedSegmentCandidate | null {
  const valid = samples.filter((sample) =>
    type === "intro"
      ? sample.fromSeconds <= 20 &&
        sample.toSeconds >= 30 &&
        sample.toSeconds <= 5 * 60
      : sample.remainingSeconds >= 10 && sample.remainingSeconds <= 5 * 60,
  );
  const cluster = densestEpisodeCluster(
    valid,
    (sample) => type === "intro" ? sample.toSeconds : sample.remainingSeconds,
  );
  if (cluster.length < TRACKING_CONFIG.introLearningMinimumEpisodes) return null;

  const sampleCount = new Set(cluster.map((sample) => sample.episodeNumber)).size;
  const remainingSeconds = type === "credits"
    ? median(cluster.map((sample) => sample.remainingSeconds))
    : 0;
  const endSeconds = type === "intro"
    ? median(cluster.map((sample) => sample.toSeconds))
    : median(cluster.map((sample) => sample.durationSeconds));
  const startSeconds = type === "intro"
    ? Math.max(0, median(cluster.map((sample) => sample.fromSeconds)))
    : Math.max(0, endSeconds - remainingSeconds);
  const confidence = Math.min(
    0.98,
    0.55 + sampleCount * 0.1 + Math.max(0, 0.12 - clusterSpread(cluster, type) / 150),
  );

  return {
    startSeconds: round(startSeconds),
    endSeconds: round(endSeconds),
    remainingSeconds: round(remainingSeconds),
    sampleCount,
    confidence: round(confidence),
  };
}

export function calculateProviderScore(input: {
  sampleCount: number;
  startupSuccesses: number;
  averageStartupMs: number | null;
  bufferingCount: number;
  bufferingSeconds: number;
  errorCount: number;
  completedSessions: number;
  preciseTrackingSessions: number;
  watchedSeconds: number;
}) {
  if (input.sampleCount <= 0) return 50;
  const successRate = input.startupSuccesses / input.sampleCount;
  const completionRate = input.completedSessions / input.sampleCount;
  const trackingRate = input.preciseTrackingSessions / input.sampleCount;
  const watchedHours = Math.max(0.25, input.watchedSeconds / 3600);
  const bufferingPerHour = input.bufferingCount / watchedHours;
  const bufferingRatio = input.bufferingSeconds / Math.max(1, input.watchedSeconds);
  const startupPenalty = input.averageStartupMs === null
    ? 8
    : Math.min(15, input.averageStartupMs / 1_500);
  const bufferingPenalty = Math.min(
    25,
    bufferingPerHour * 2.5 + bufferingRatio * 100,
  );
  const errorPenalty = Math.min(20, input.errorCount * 6);
  return Math.round(
    clamp(
      35 +
        successRate * 25 +
        trackingRate * 20 +
        completionRate * 10 -
        startupPenalty -
        bufferingPenalty -
        errorPenalty,
      0,
      100,
    ),
  );
}

export function rewindResumePosition(positionSeconds: number) {
  const position = Math.max(0, finite(positionSeconds));
  if (position <= 30) return position;
  return Math.max(0, position - TRACKING_CONFIG.resumeRewindSeconds);
}

function densestEpisodeCluster(
  samples: PlaybackObservationSample[],
  value: (sample: PlaybackObservationSample) => number,
) {
  let best: PlaybackObservationSample[] = [];
  for (const center of samples) {
    const byEpisode = new Map<number, PlaybackObservationSample>();
    for (const sample of samples) {
      if (
        Math.abs(value(sample) - value(center)) <=
        TRACKING_CONFIG.segmentLearningToleranceSeconds
      ) {
        byEpisode.set(sample.episodeNumber, sample);
      }
    }
    const candidate = [...byEpisode.values()];
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

function clusterSpread(
  samples: PlaybackObservationSample[],
  type: "intro" | "credits",
) {
  const values = samples.map((sample) =>
    type === "intro" ? sample.toSeconds : sample.remainingSeconds,
  );
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function median(values: number[]) {
  const sorted = values.map(finite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
