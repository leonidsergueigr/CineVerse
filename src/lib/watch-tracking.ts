export const TRACKING_CONFIG = {
  heartbeatIntervalSeconds: 15,
  maxHeartbeatGapSeconds: 45,
  automaticCompletionThreshold: 0.8,
  hybridCompletionThreshold: 0.3,
  maximumEstimatedRuntimeMultiplier: 1.5,
  autoNextMaximumRemainingSeconds: 45,
  maximumExtensionObservationGapSeconds: 300,
  resumeRewindSeconds: 8,
  autoNextCountdownSeconds: 5,
  defaultBingeLimitEpisodes: 4,
  providerSwitchBufferingThreshold: 3,
  introLearningMinimumEpisodes: 3,
  segmentLearningToleranceSeconds: 18,
  maximumActiveDecisionSeconds: 30 * 60,
} as const;

export type CompletionSource =
  | "provider"
  | "estimated"
  | "hybrid"
  | "manual"
  | "manual_legacy"
  | "legacy"
  | "unknown";

export type TrackingConfidence = "high" | "medium" | "low";

export type TrackingMethod =
  | "browser-extension"
  | "provider-message"
  | "local-estimate"
  | "manual"
  | "legacy"
  | "unknown";

export type PlaybackState = "playing" | "paused" | "buffering" | "unknown";

export type WatchSessionStatus =
  | "active"
  | "paused"
  | "interrupted"
  | "completed"
  | "abandoned";

export type ProviderTrackingCapabilities = {
  progress: boolean;
  playState: boolean;
  endedEvent: boolean;
  postMessage: boolean;
};

export type CompletionDecision = {
  completed: boolean;
  completionSource: CompletionSource;
  confidence: TrackingConfidence;
};

type CompletionEvidence = {
  providerEnded?: boolean;
  providerProgressSeconds?: number;
  providerProgressPercent?: number;
  estimatedWatchedSeconds?: number;
  officialRuntimeSeconds?: number | null;
  manuallyMarkedWatched?: boolean;
};

export function evaluateCompletion(
  evidence: CompletionEvidence,
): CompletionDecision {
  const runtime = nonNegative(evidence.officialRuntimeSeconds);
  const providerPercent = normalizedPercent(
    evidence.providerProgressPercent,
    evidence.providerProgressSeconds,
    runtime,
  );
  const estimatedPercent = runtime
    ? Math.min(1, nonNegative(evidence.estimatedWatchedSeconds) / runtime)
    : 0;

  if (evidence.providerEnded) {
    return completed("provider", "high");
  }
  if (providerPercent >= TRACKING_CONFIG.automaticCompletionThreshold) {
    return completed("provider", "high");
  }
  if (estimatedPercent >= TRACKING_CONFIG.automaticCompletionThreshold) {
    return completed("estimated", "medium");
  }
  if (
    evidence.manuallyMarkedWatched &&
    estimatedPercent >= TRACKING_CONFIG.hybridCompletionThreshold
  ) {
    return completed("hybrid", "medium");
  }
  if (evidence.manuallyMarkedWatched) {
    return completed("manual", "low");
  }
  return {
    completed: false,
    completionSource: "unknown",
    confidence: providerPercent > 0 ? "high" : estimatedPercent > 0 ? "medium" : "low",
  };
}

export function validHeartbeatIntervalSeconds(input: {
  previousHeartbeatAt: number;
  heartbeatAt: number;
  previousDocumentVisible: boolean;
  previousPlaybackState?: string | null;
}) {
  if (!input.previousDocumentVisible) return 0;
  if (
    input.previousPlaybackState === "paused" ||
    input.previousPlaybackState === "buffering"
  ) {
    return 0;
  }
  const elapsed = Math.floor(
    (input.heartbeatAt - input.previousHeartbeatAt) / 1000,
  );
  if (
    elapsed <= 0 ||
    elapsed > TRACKING_CONFIG.maxHeartbeatGapSeconds
  ) {
    return 0;
  }
  return elapsed;
}

export function providerProgressDeltaSeconds(input: {
  previousProgressSeconds: number;
  progressSeconds?: number | null;
  intervalSeconds: number;
}) {
  const current = nonNegative(input.progressSeconds);
  const previous = nonNegative(input.previousProgressSeconds);
  const delta = current - previous;
  if (delta <= 0) return 0;
  return Math.floor(
    Math.min(delta, Math.max(0, input.intervalSeconds) + 5),
  );
}

export function providerObservedDeltaSeconds(input: {
  previousObservedSeconds: number;
  observedSeconds?: number | null;
}) {
  const current = nonNegative(input.observedSeconds);
  const previous = nonNegative(input.previousObservedSeconds);
  if (current <= previous) return 0;
  return Math.floor(
    Math.min(
      current - previous,
      TRACKING_CONFIG.maximumExtensionObservationGapSeconds,
    ),
  );
}

export function capEstimatedSeconds(
  seconds: number,
  officialRuntimeSeconds?: number | null,
) {
  const value = nonNegative(seconds);
  const runtime = nonNegative(officialRuntimeSeconds);
  if (!runtime) return Math.floor(value);
  return Math.floor(
    Math.min(
      value,
      runtime * TRACKING_CONFIG.maximumEstimatedRuntimeMultiplier,
    ),
  );
}

export function completionSignalWeight(source: CompletionSource) {
  switch (source) {
    case "provider":
      return 0.45;
    case "estimated":
      return 0.3;
    case "hybrid":
      return 0.25;
    case "manual":
      return 0.5;
    case "manual_legacy":
      return 0;
    case "legacy":
      return 0.35;
    default:
      return 0.2;
  }
}

function completed(
  completionSource: CompletionSource,
  confidence: TrackingConfidence,
): CompletionDecision {
  return { completed: true, completionSource, confidence };
}

function normalizedPercent(
  explicitPercent: number | undefined,
  progressSeconds: number | undefined,
  runtimeSeconds: number,
) {
  const percent = Number(explicitPercent);
  if (Number.isFinite(percent)) {
    return Math.min(1, Math.max(0, percent > 1 ? percent / 100 : percent));
  }
  return runtimeSeconds
    ? Math.min(1, nonNegative(progressSeconds) / runtimeSeconds)
    : 0;
}

function nonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
