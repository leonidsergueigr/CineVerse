import { TRACKING_CONFIG } from "@/lib/watch-tracking";

export type PlaybackObservationSample = {
  sessionId?: string;
  episodeNumber: number;
  fromSeconds: number;
  toSeconds: number;
  durationSeconds: number;
  remainingSeconds: number;
  observedAt?: number;
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
  if (type === "intro") return learnIntroSegment(samples);

  const valid = samples.filter(
    (sample) => sample.remainingSeconds >= 10 && sample.remainingSeconds <= 5 * 60,
  );
  const cluster = densestEpisodeCluster(
    valid,
    (sample) => sample.remainingSeconds,
  );
  if (cluster.length < TRACKING_CONFIG.introLearningMinimumEpisodes) return null;

  const sampleCount = new Set(cluster.map((sample) => sample.episodeNumber)).size;
  const remainingSeconds = median(cluster.map((sample) => sample.remainingSeconds));
  const endSeconds = median(cluster.map((sample) => sample.durationSeconds));
  const startSeconds = Math.max(0, endSeconds - remainingSeconds);
  const confidence = Math.min(
    0.98,
    0.55 +
      sampleCount * 0.1 +
      Math.max(0, 0.12 - clusterSpread(cluster, (sample) => sample.remainingSeconds) / 150),
  );

  return {
    startSeconds: round(startSeconds),
    endSeconds: round(endSeconds),
    remainingSeconds: round(remainingSeconds),
    sampleCount,
    confidence: round(confidence),
  };
}

export function shouldRecordIntroSeekObservation(input: {
  fromSeconds: number;
  toSeconds: number;
  durationSeconds: number;
}) {
  const durationSeconds = Math.max(0, finite(input.durationSeconds));
  const fromSeconds = Math.max(0, finite(input.fromSeconds));
  const toSeconds = Math.max(0, finite(input.toSeconds));
  if (durationSeconds <= 0) return false;
  const searchEnd = Math.min(
    TRACKING_CONFIG.introMaximumSearchSeconds,
    durationSeconds * TRACKING_CONFIG.introMaximumProgressRatio,
  );
  return (
    fromSeconds <= searchEnd &&
    toSeconds <= searchEnd &&
    Math.abs(toSeconds - fromSeconds) >=
      TRACKING_CONFIG.introMinimumSkipSeconds
  );
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

type IntroCandidate = PlaybackObservationSample & {
  correctionCount: number;
};

function learnIntroSegment(
  samples: PlaybackObservationSample[],
): LearnedSegmentCandidate | null {
  const candidates = buildIntroCandidates(samples);
  const cluster = densestIntroCluster(candidates);
  if (cluster.length < TRACKING_CONFIG.introLearningMinimumEpisodes) return null;

  const sampleCount = new Set(cluster.map((sample) => sample.episodeNumber)).size;
  const startSeconds = median(cluster.map((sample) => sample.fromSeconds));
  const endSeconds = median(cluster.map((sample) => sample.toSeconds));
  const correctedEpisodes = cluster.filter(
    (sample) => sample.correctionCount > 0,
  ).length;
  const confidence = Math.min(
    0.98,
    0.55 +
      sampleCount * 0.1 +
      (correctedEpisodes / Math.max(1, sampleCount)) * 0.04 +
      Math.max(0, 0.12 - introClusterSpread(cluster) / 600),
  );

  return {
    startSeconds: round(startSeconds),
    endSeconds: round(endSeconds),
    remainingSeconds: 0,
    sampleCount,
    confidence: round(confidence),
  };
}

function buildIntroCandidates(samples: PlaybackObservationSample[]) {
  const groups = new Map<
    string,
    Array<PlaybackObservationSample & { order: number; observedAt: number }>
  >();

  samples.forEach((sample, order) => {
    if (!shouldRecordIntroSeekObservation(sample)) return;
    const groupKey = `${sample.episodeNumber}:${sample.sessionId ?? "episode"}`;
    const group = groups.get(groupKey) ?? [];
    group.push({
      ...sample,
      order,
      observedAt: Math.max(0, finite(sample.observedAt ?? order * 1_000)),
    });
    groups.set(groupKey, group);
  });

  const candidates: IntroCandidate[] = [];
  for (const observations of groups.values()) {
    observations.sort(
      (left, right) => left.observedAt - right.observedAt || left.order - right.order,
    );
    let index = 0;
    while (index < observations.length) {
      const initial = observations[index];
      const initialLength = initial.toSeconds - initial.fromSeconds;
      if (
        initial.fromSeconds > TRACKING_CONFIG.introMaximumStartSeconds ||
        initialLength < TRACKING_CONFIG.introMinimumSkipSeconds ||
        initialLength > TRACKING_CONFIG.introMaximumSegmentSeconds
      ) {
        index += 1;
        continue;
      }

      let endSeconds = initial.toSeconds;
      let lastLandingSeconds = initial.toSeconds;
      let lastObservedAt = initial.observedAt;
      let correctionCount = 0;
      let consumedThrough = index;
      for (let cursor = index + 1; cursor < observations.length; cursor += 1) {
        const correction = observations[cursor];
        const elapsedMilliseconds = correction.observedAt - lastObservedAt;
        if (
          elapsedMilliseconds >
          TRACKING_CONFIG.introRefinementWindowSeconds * 1_000
        ) {
          break;
        }
        if (
          Math.abs(correction.fromSeconds - lastLandingSeconds) >
          TRACKING_CONFIG.introRefinementContinuitySeconds
        ) {
          break;
        }
        if (
          Math.abs(correction.toSeconds - correction.fromSeconds) <
          TRACKING_CONFIG.introMinimumCorrectionSeconds
        ) {
          continue;
        }
        const correctedLength = correction.toSeconds - initial.fromSeconds;
        if (
          correctedLength >= TRACKING_CONFIG.introMinimumSkipSeconds &&
          correctedLength <= TRACKING_CONFIG.introMaximumSegmentSeconds
        ) {
          endSeconds = correction.toSeconds;
          correctionCount += 1;
          lastLandingSeconds = correction.toSeconds;
          lastObservedAt = correction.observedAt;
          consumedThrough = cursor;
        }
      }

      candidates.push({
        ...initial,
        toSeconds: endSeconds,
        correctionCount,
      });
      index = Math.max(index + 1, consumedThrough + 1);
    }
  }
  return candidates;
}

function densestIntroCluster(samples: IntroCandidate[]) {
  let best: IntroCandidate[] = [];
  for (const center of samples) {
    const byEpisode = new Map<number, IntroCandidate>();
    for (const sample of samples) {
      if (!introCandidatesAreClose(sample, center)) continue;
      const current = byEpisode.get(sample.episodeNumber);
      if (
        !current ||
        sample.correctionCount > current.correctionCount ||
        introCandidateDistance(sample, center) < introCandidateDistance(current, center)
      ) {
        byEpisode.set(sample.episodeNumber, sample);
      }
    }
    const candidate = [...byEpisode.values()];
    const candidateCorrections = candidate.filter(
      (sample) => sample.correctionCount > 0,
    ).length;
    const bestCorrections = best.filter(
      (sample) => sample.correctionCount > 0,
    ).length;
    if (
      candidate.length > best.length ||
      (candidate.length === best.length &&
        (candidateCorrections > bestCorrections ||
          (candidateCorrections === bestCorrections &&
            introClusterSpread(candidate) < introClusterSpread(best))))
    ) {
      best = candidate;
    }
  }
  return best;
}

function introCandidatesAreClose(left: IntroCandidate, right: IntroCandidate) {
  return (
    Math.abs(left.fromSeconds - right.fromSeconds) <=
      TRACKING_CONFIG.introStartToleranceSeconds &&
    Math.abs(introLength(left) - introLength(right)) <=
      TRACKING_CONFIG.segmentLearningToleranceSeconds
  );
}

function introCandidateDistance(left: IntroCandidate, right: IntroCandidate) {
  return (
    Math.abs(left.fromSeconds - right.fromSeconds) +
    Math.abs(introLength(left) - introLength(right))
  );
}

function introLength(sample: PlaybackObservationSample) {
  return sample.toSeconds - sample.fromSeconds;
}

function introClusterSpread(samples: PlaybackObservationSample[]) {
  return (
    clusterSpread(samples, (sample) => sample.fromSeconds) +
    clusterSpread(samples, introLength)
  );
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
  value: (sample: PlaybackObservationSample) => number,
) {
  const values = samples.map(value);
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
