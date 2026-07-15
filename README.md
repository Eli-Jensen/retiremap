# RetireMap 🌍

A static web app that answers: **what would it take to retire, at your current
standard of living, in 554 cities around the world?**

Pick your home city and monthly spend. Every city is colored green→red by how
its cost of living compares. Three views:

- **Monthly cost** — $/mo to keep your lifestyle in each city
- **Portfolio needed** — the nest egg that sustains it at a chosen safe
  withdrawal rate (default 4%)
- **What I can afford** — enter a (theoretical) portfolio and see the
  standard of living it buys everywhere, as a US-household spending percentile

Standard of living is expressed as a **cost-adjusted percentile of US
household spending** (interpolated from BLS Consumer Expenditure Survey 2024
income-decile means).

Svelte 5 + Vite + TypeScript + Tailwind v4 + MapLibre GL. No backend, no
accounts, no tracking; all computation is client-side over a baked-in data
snapshot.

## Develop

```sh
npm install
npm run dev        # dev server
npm test           # vitest (math + pipeline matcher)
npm run check      # svelte-check
npm run build      # production build to dist/
npm run deploy     # build + firebase deploy --only hosting
```

## Refreshing the data snapshot

The app builds from three committed JSON files in `src/data/`, produced by
`npm run pipeline` from raw files in `pipeline/raw/` (gitignored). To refresh
(~once or twice a year is plenty):

1. **Numbeo table** — in a browser, open
   <https://www.numbeo.com/cost-of-living/rankings_current.jsp> and save the
   rankings table as `pipeline/raw/numbeo.csv` (via its "Download table"
   link) or the whole page as `pipeline/raw/numbeo.html`. Numbeo's ToS
   prohibits automated scraping — keep this a manual download.
2. **GeoNames** (only if new cities fail to match):
   ```sh
   curl -so pipeline/raw/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip
   unzip -o pipeline/raw/cities15000.zip -d pipeline/raw
   curl -so pipeline/raw/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
   ```
3. **BLS deciles** (only when a new CE year is published):
   ```sh
   curl -so pipeline/raw/fred_deciles.csv "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CXUTOTALEXPLB1502M,CXUTOTALEXPLB1503M,CXUTOTALEXPLB1504M,CXUTOTALEXPLB1505M,CXUTOTALEXPLB1506M,CXUTOTALEXPLB1507M,CXUTOTALEXPLB1508M,CXUTOTALEXPLB1509M,CXUTOTALEXPLB1510M,CXUTOTALEXPLB1511M"
   ```
   then bump the year + expected-value cross-checks in
   `pipeline/build-deciles.ts`.
4. `npm run pipeline` — it matches cities, prints a report, and trips loudly
   on anything suspicious. Fix stragglers in `pipeline/overrides.json`
   (keyed by the exact Numbeo name; see the file for the three forms), rerun,
   eyeball the `fuzzy` list in `pipeline/out/match-report.json`, commit the
   regenerated `src/data/*.json`.

## Manual smoke checklist (after changes)

1. Dots render worldwide; no console errors.
2. With no home city: US cities cluster yellow-ish, SE Asia deep green,
   Switzerland red-orange.
3. Set home = New York: Reykjavik reads ~$3,072/mo (4000 × 76.8/100) — spot
   check against the popup's index table.
4. Percentile slider and $/mo input track each other both directions.
5. Switch to "What I can afford": legend relabels, home city is exactly
   break-even when portfolio = 300× monthly spend at 4%.
6. Rent toggle shifts colors (rent-heavy cities move most).
7. Click a dot → detail card; "Set as my home city" works.
8. Narrow window: detail card docks to the bottom, panels stay usable.

## The math

- `required(city) = spend × idx(city) / idx(home)` — Numbeo index ratio
  (Cost of Living **Plus Rent** by default, toggleable to ex-rent).
- `portfolio = required × 12 / SWR`.
- Percentile bridge: `US-equivalent annual = spend × 12 × usRef / idx(city)`
  where `usRef` is the population-weighted mean index over the US cities in
  the dataset — then looked up on a monotone-cubic (PCHIP) curve through the
  BLS decile anchors. One code path for US and non-US homes.
- Reverse mode inverts: `withdrawal = portfolio × SWR / 12`, affordable ⇔
  withdrawal ≥ required.

## Data credits & licenses

- Cost-of-living indexes: [Numbeo](https://www.numbeo.com/cost-of-living/)
  (snapshot; free for personal use with attribution — this link is the
  required credit).
- City coordinates: [GeoNames](https://www.geonames.org/) (CC BY 4.0).
- Spending distribution: BLS Consumer Expenditure Survey, Table 1110 (2024),
  via FRED.
- Basemap: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, data from
  OpenStreetMap.

Not financial advice. The 4% rule is a heuristic; taxes, healthcare, visas,
and FX are all out of scope.
