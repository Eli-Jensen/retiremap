// Cost-of-living index arithmetic. Indexes are Numbeo's, NYC = 100.

/** $/mo needed in a city to match the lifestyle userMonthly buys at idxHome. */
export function requiredMonthly(userMonthly: number, idxCity: number, idxHome: number): number {
  return (userMonthly * idxCity) / idxHome;
}

/** Portfolio sustaining `monthly` at a safe withdrawal rate (fraction, e.g. 0.04). */
export function portfolioNeeded(monthly: number, swr: number): number {
  return (monthly * 12) / swr;
}

export function withdrawalMonthly(portfolio: number, swr: number): number {
  return (portfolio * swr) / 12;
}

/**
 * Converts a local monthly budget to the annual spend that buys the same
 * lifestyle at the US-average price level — the bridge onto the US
 * spending-percentile curve. Works identically for US and non-US cities.
 */
export function equivAnnualUS(monthly: number, idx: number, usRef: number): number {
  return ((monthly * 12) * usRef) / idx;
}

/** Inverse of equivAnnualUS: local $/mo that buys a US-annual-equivalent lifestyle. */
export function monthlyFromEquivAnnualUS(annualUS: number, idx: number, usRef: number): number {
  return ((annualUS / 12) * idx) / usRef;
}
