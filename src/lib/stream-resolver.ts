import "server-only";

import {
  streamCandidatesToProviders,
  type StreamSourceAdapter,
} from "@/lib/streaming";
import type { EmbedProvider, MediaDetails } from "@/lib/types";

export async function resolveStreamProviders(
  adapters: StreamSourceAdapter[],
  input: {
    detail: MediaDetails;
    seasonNumber: number | null;
    episodeNumber: number | null;
  },
): Promise<EmbedProvider[]> {
  const resolutions = await Promise.all(
    adapters.map(async (adapter) => {
      const startedAt = Date.now();
      try {
        return {
          ok: true as const,
          adapter,
          candidates: await adapter.resolve(input),
          durationMs: Date.now() - startedAt,
        };
      } catch {
        return {
          ok: false as const,
          sourceId: adapter.id,
          durationMs: Date.now() - startedAt,
        };
      }
    }),
  );

  const providers = resolutions.flatMap((result) => {
    if (!result.ok) {
      console.warn(
        "[stream-resolver]",
        JSON.stringify({
          sourceId: result.sourceId,
          code: "SOURCE_FAILED",
          durationMs: result.durationMs,
        }),
      );
      return [];
    }

    const sourceProviders = streamCandidatesToProviders(result.candidates, {
      providerIdPrefix: result.adapter.id,
      templateForHost: (hostId) =>
        result.adapter.providerTemplate(hostId),
    });
    console.info(
      "[stream-resolver]",
      JSON.stringify({
        sourceId: result.adapter.id,
        code: "SOURCE_RESOLVED",
        durationMs: result.durationMs,
        candidateCount: result.candidates.length,
        providerCount: sourceProviders.length,
      }),
    );
    return sourceProviders;
  });

  return providers.sort((left, right) => left.priority - right.priority);
}
