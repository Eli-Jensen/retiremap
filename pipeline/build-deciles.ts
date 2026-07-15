// Turns the FRED export of BLS CE Table 1110 (mean annual expenditures by
// income decile) into the app's percentile anchors. Run via build-data.ts.
import type { SpendingDeciles } from '../src/lib/types.ts';
import { parseCsv } from './parse-numbeo.ts';

// Cross-checks against the published BLS 2024 figures. If FRED ever shuffles
// series, these trip rather than shipping a garbage curve.
const EXPECTED_ALL_UNITS_MEAN_2024 = 78_535;
const EXPECTED_QUINTILE_MEANS_2024 = [35_046, 50_054, 66_900, 89_972, 150_342];
const TOLERANCE = 0.02;

export function buildDeciles(fredCsv: string, year: number): SpendingDeciles {
  const table = parseCsv(fredCsv);
  const header = table[0];
  if (header[0] !== 'observation_date' || header.length !== 11) {
    throw new Error(`Unexpected FRED CSV shape: ${header.join(',')}`);
  }
  const target = table.find((r) => r[0].startsWith(String(year)));
  if (!target) throw new Error(`No ${year} observation in FRED CSV`);
  const values = target.slice(1).map(Number);
  if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
    throw new Error(`Bad decile values for ${year}: ${target.slice(1).join(',')}`);
  }

  for (let i = 1; i < values.length; i++) {
    if (values[i] <= values[i - 1]) {
      throw new Error(`Decile means not strictly increasing at index ${i}: ${values.join(',')}`);
    }
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assertClose(mean, EXPECTED_ALL_UNITS_MEAN_2024, 'mean of decile means vs all-units mean');
  EXPECTED_QUINTILE_MEANS_2024.forEach((expected, q) => {
    assertClose((values[2 * q] + values[2 * q + 1]) / 2, expected, `quintile ${q + 1}`);
  });

  return {
    source: `BLS Consumer Expenditure Survey Table 1110 (${year}), mean annual expenditures by income decile, via FRED CXUTOTALEXPLB1502M-1511M`,
    year,
    anchors: values.map((annual, i) => ({ p: 5 + 10 * i, annual })),
  };
}

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) / expected > TOLERANCE) {
    throw new Error(`Decile cross-check failed (${label}): got ${Math.round(actual)}, expected ~${expected}`);
  }
}
