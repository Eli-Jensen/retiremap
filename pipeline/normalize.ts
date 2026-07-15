// Name normalization + country aliasing for joining Numbeo names to GeoNames.

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Krakow (Cracow)" → ["krakow cracow", "krakow", "cracow"]
export function nameVariants(raw: string): string[] {
  const variants = [norm(raw)];
  const m = raw.match(/^(.*?)\s*\((.*?)\)\s*$/);
  if (m) {
    variants.push(norm(m[1]), norm(m[2]));
  }
  return [...new Set(variants.filter(Boolean))];
}

// Numbeo country name (normalized) → GeoNames countryInfo name (normalized).
// Only needed where the two disagree; grown from match-report triage.
export const COUNTRY_ALIASES: Record<string, string> = {
  'czech republic': 'czechia',
  'kosovo disputed territory': 'kosovo',
  'hong kong china': 'hong kong',
  'macao china': 'macao',
  'netherlands': 'the netherlands',
};

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}
