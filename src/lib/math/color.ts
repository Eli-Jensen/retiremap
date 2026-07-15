// One color meaning across all views: green = cheaper/affordable,
// yellow = break-even, red = pricier/out of reach.

// CVD-tolerant red-yellow-green: teal-leaning green end, dark red end,
// pale midpoint so both ends stay distinguishable.
export const RAMP = ['#00876c', '#89c079', '#fff1a8', '#f28d5c', '#9b2226'] as const;
export const RAMP_POSITIONS = [-1, -0.5, 0, 0.5, 1] as const;

/**
 * Position on the ramp for a cost ratio, log-scaled so "half the cost" and
 * "double the cost" sit symmetrically: clamp(log2(num/den), -1, +1).
 */
export function tRatio(numerator: number, denominator: number): number {
  const t = Math.log2(numerator / denominator);
  return Math.max(-1, Math.min(1, t));
}
