/**
 * Stable, JSON-serialisable projection of a cluster_features result.
 * Shared by the golden-master capture script and the regression test so both
 * compare exactly the same shape (typed-array labels become plain arrays).
 */
export function serializeResult(r) {
  return {
    algorithm: r.algorithm,
    labels: Array.from(r.labels),
    clusters: r.clusters.map((c) => ({
      id: c.id,
      size: c.size,
      member_ids: c.member_ids,
      totals: c.totals,
      centroid: c.centroid,
    })),
    noise_ids: r.noise_ids,
    weighting: r.weighting ?? null,
    filtered_ids: r.filtered_ids,
  };
}
