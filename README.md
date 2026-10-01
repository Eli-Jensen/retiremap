# RetireMap 🌍

A static web app that answers: **where — and when — could you retire, and at
what level?** Enter your age, savings, yearly saving, and retirement income;
every one of 555 cities is rated by the lifestyle you could afford there,
measured against what locals earn:

| Tier | Monthly spend vs. the local reference |
|---|---|
| Not enough | < 0.43× (below a minimum-wage local) |
| Scraping by | 0.43–0.75× |
| Like a local | 0.75–1.5× |
| Comfortable | 1.5–3× |
| Living well | 3–6× |
| Like a king | ≥ 6× |

Two questions, map or list:

- **Retire today** — the tier your savings buy in each city right now.
- **When could I…** — pick a tier; see the age you could retire there at it.

Filter by Numbeo's Quality of Life Index and region. Every input starts at a
cited, data-backed default (`src/data/defaults.json`) and is mirrored to the
URL hash so a plan can be shared.

Svelte 5 + Vite + TypeScript + Tailwind v4 + MapLibre GL. No backend, no
accounts, no tracking; all computation is client-side (~7 ms per full
recompute).

## Develop

```sh
npm install
npm run dev        # dev server
npm test           # vitest: SWR parity, planner, tiers, URL state, pipeline
npm run check      # svelte-check + tsc
npm run build      # production build to dist/
npm run deploy     # build + firebase deploy --only hosting (project retiremap-ej)
```

## The model (all real, today's dollars)

- **Local reference** = max(average monthly net salary, one person's non-rent
  costs). Numbeo defines Local Purchasing Power as salary ÷ cost of a
  COL-plus-rent basket relative to NYC, so
  `salary = NYC salary × k × PP/100 × colRent/100`; `k` is the median ratio
  against hand-read published salaries (`pipeline/salary-anchor.json`,
  ~1% mean error). Non-rent basics scale with the COL index the same way
  (~5%). The floor matters where pay doesn't cover the basket (Damascus,
  Lagos, Accra…).
- **Tier** = spend ÷ OECD-equivalent adults (couple = 1.5) ÷ local reference.
- **Savings needed** to retire at age A (`src/lib/math/plan.ts`):
  - perpetual part: long-run gap (spend + health − Social Security − other
    income, grossed up for tax) ÷ SWR(plan-to age − A);
  - bridge: extra shortfall before income starts / before 65, discounted at
    the historical real 10-year Treasury return (a bond ladder).
- **SWR(horizon)** (`src/lib/math/swr.ts`): port of the
  trinity-study engine — the highest rate that failed in ≤ X% of overlapping
  monthly US cohorts since 1871 (Shiller stocks, 10-yr Treasuries),
  pinned to the Python reference by `swr.test.ts`. Made non-increasing in
  horizon (the raw 5th percentile turns up past ~57 years as the 1960s–70s
  cohorts drop out).
- **When**: savings grow at the historical real CAGR of the stock/bond mix
  plus yearly contributions; first year the projection covers the need.
- **Health**: per person, outside the US international-plan broker quotes
  ($470 <65 / $800 65+); US ACA full price ($1,330) / Medicare + Medigap + Part
  D ($430).
- The detail card also shows the old RetireMap readout: the cost-adjusted
  percentile of US household spending (BLS CE deciles, PCHIP).

## Refreshing the data snapshot

The app builds from committed JSON in `src/data/`, produced by
`npm run pipeline` from raw files in `pipeline/raw/` (gitignored). Refresh
once or twice a year:

1. **Numbeo tables** (manual — Numbeo's ToS prohibits automated scraping):
   - <https://www.numbeo.com/cost-of-living/rankings_current.jsp> →
     `pipeline/raw/numbeo.csv` (columns: Rank, City, Cost of Living Index,
     Rent Index, Cost of Living Plus Rent Index, Groceries Index, Restaurant
     Price Index, Local Purchasing Power Index).
   - <https://www.numbeo.com/quality-of-life/rankings_current.jsp> →
     `pipeline/raw/numbeo-qol.csv` (Rank, City, Quality of Life Index,
     Safety Index, Health Care Index, Pollution Index, Climate Index).
2. **Salary & basics anchors** — open NYC and the validation cities in
   `pipeline/salary-anchor.json` on Numbeo (display currency USD) and update
   "Average Monthly Net Salary (After Tax)" and "estimated monthly costs for a
   single person … excluding rent", plus the date.
3. **GeoNames** (only if new cities fail to match):
   ```sh
   curl -so pipeline/raw/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip
   unzip -o pipeline/raw/cities15000.zip -d pipeline/raw
   curl -so pipeline/raw/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
   ```
4. **BLS deciles** (only when a new CE year is published):
   ```sh
   curl -so pipeline/raw/fred_deciles.csv "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CXUTOTALEXPLB1502M,CXUTOTALEXPLB1503M,CXUTOTALEXPLB1504M,CXUTOTALEXPLB1505M,CXUTOTALEXPLB1506M,CXUTOTALEXPLB1507M,CXUTOTALEXPLB1508M,CXUTOTALEXPLB1509M,CXUTOTALEXPLB1510M,CXUTOTALEXPLB1511M"
   ```
   then bump the year + cross-checks in `pipeline/build-deciles.ts`.
5. `npm run pipeline` — matches cities, prints the salary/basics calibration
   tables, and trips loudly on anything suspicious (salary error > 5%, basics
   error > 10%, < 250 QoL-rated cities…). Fix stragglers in
   `pipeline/overrides.json`, commit the regenerated `src/data/*.json`.
6. **Market history** (`src/data/market.json`) is exported from the
   trinity-study project (`make web-data` there); copy it and
   `src/lib/math/swr.reference.json` across together.
7. **Defaults** (`src/data/defaults.json`) — re-check the sources listed in
   it, especially the Fed SCF (2025 survey due), SSA COLA, and KFF premiums.

## Manual smoke checklist

1. Default inputs: "Not enough to retire today" anywhere; "When could I…"
   shows Chiang Mai/Medellín like a local around 49, Lisbon 52, Austin 64.
2. Savings $1M → most cities flip to a tier; Lisbon "Comfortable".
3. Raise Social Security → retire-by ages drop (Lisbon comfortable 60 → 56 at
   $40k).
4. QoL ≥ 150 → ~189 cities; unrated cities dim on the map, vanish from the list.
5. Copy the URL into a new tab → every input restored; removing a key from
   the hash resets that input.
6. 375 px wide: list is the default, inputs collapse to a summary, detail
   card docks at the bottom, no horizontal scroll.

## Data credits & licenses

- Cost of living & quality of life: [Numbeo](https://www.numbeo.com/)
  (snapshot; attribution required — this link is the credit).
- City coordinates: [GeoNames](https://www.geonames.org/) (CC BY 4.0).
- Market history: Robert Shiller (stocks, CPI), FRED GS10.
- Spending distribution: BLS Consumer Expenditure Survey (2024) via FRED.
- Defaults: Federal Reserve SCF, Vanguard, Census, SSA, IRS, KFF, CMS, OECD,
  International Citizens Insurance — full list with URLs in
  `src/data/defaults.json` and on the in-app "How this works" page.
- Basemap: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, data from
  OpenStreetMap.

Not financial advice. Visas and exchange-rate swings are not modeled.
