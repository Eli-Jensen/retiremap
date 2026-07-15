// US spending-percentile curve: monotone cubic (Fritsch-Carlson PCHIP)
// through the BLS decile anchors, linear tails, clamped to [1, 99].

export type Anchor = { p: number; annual: number };

export type PercentileCurve = {
  /** annual US-equivalent spend → percentile in [1, 99] */
  spendToPercentile(annual: number): number;
  /** percentile in [1, 99] → annual US-equivalent spend */
  percentileToSpend(p: number): number;
};

export const P_MIN = 1;
export const P_MAX = 99;

export function buildCurve(anchors: Anchor[]): PercentileCurve {
  const n = anchors.length;
  if (n < 2) throw new Error('Need at least 2 anchors');
  const xs = anchors.map((a) => a.p);
  const ys = anchors.map((a) => a.annual);
  for (let i = 1; i < n; i++) {
    if (xs[i] <= xs[i - 1] || ys[i] <= ys[i - 1]) throw new Error('Anchors must be strictly increasing');
  }

  // Fritsch-Carlson tangents; with strictly increasing data this guarantees
  // a monotone interpolant.
  const h = Array.from({ length: n - 1 }, (_, i) => xs[i + 1] - xs[i]);
  const d = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1] - ys[i]) / h[i]);
  const m = new Array<number>(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }

  function evalAt(p: number): number {
    const x = Math.max(P_MIN, Math.min(P_MAX, p));
    if (x <= xs[0]) return ys[0] + d[0] * (x - xs[0]); // linear tail, first-segment slope
    if (x >= xs[n - 1]) return ys[n - 1] + d[n - 2] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      ys[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * h[i] * (t3 - 2 * t2 + t) +
      ys[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * h[i] * (t3 - t2)
    );
  }

  const yMin = evalAt(P_MIN);
  const yMax = evalAt(P_MAX);

  function invert(annual: number): number {
    if (annual <= yMin) return P_MIN;
    if (annual >= yMax) return P_MAX;
    let lo = P_MIN;
    let hi = P_MAX;
    for (let iter = 0; iter < 60; iter++) {
      const mid = (lo + hi) / 2;
      if (evalAt(mid) < annual) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  return { spendToPercentile: invert, percentileToSpend: evalAt };
}
