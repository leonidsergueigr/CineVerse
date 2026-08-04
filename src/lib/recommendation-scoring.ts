export function sourceAffinityScore(input: {
  recommendationHits: number;
  similarHits: number;
  discoveryHits: number;
}) {
  const recommendationHits = Math.min(3, Math.max(0, input.recommendationHits));
  const similarHits = Math.min(3, Math.max(0, input.similarHits));
  const discoveryHits = Math.min(3, Math.max(0, input.discoveryHits));
  return recommendationHits * 8 + similarHits * 4 + discoveryHits * 1.5;
}
