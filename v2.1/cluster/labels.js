/**
 * cluster/labels.js — reserved point-label sentinels shared across the passes.
 * Extracted verbatim from the original single-file tool (behaviour unchanged).
 *
 * Cluster ids count from 1, so these sentinels stay disjoint from any real label.
 * UNVISITED is 0 so a freshly allocated Int32Array is already "nothing decided yet".
 */

/** Point reached no cluster. Never dropped — this is the last-mile layer. */
export const NOISE = -1;

/** Point removed before clustering by a user filter. */
export const FILTERED = -2;

/** Point not yet examined. */
export const UNVISITED = 0;
