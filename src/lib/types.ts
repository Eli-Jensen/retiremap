// Shared between the app and the data pipeline.

export type CityRecord = {
  id: string; // stable slug, e.g. "lisbon-pt"
  name: string; // Numbeo display name, e.g. "Lisbon"
  admin?: string; // state/province hint for disambiguation, e.g. "NY"
  country: string;
  iso2: string;
  lat: number;
  lng: number;
  pop?: number;
  col: number; // Cost of Living Index (NYC = 100)
  rent: number;
  colRent: number; // Cost of Living Plus Rent Index
  groceries: number;
  restaurant: number;
  purchasingPower: number;
};

export type Meta = {
  edition: string;
  snapshotDate: string; // ISO date of the Numbeo snapshot
  cityCount: number;
  // Population-weighted mean index over US cities in the dataset; the
  // reference point that places any budget on the US spending-percentile curve.
  usRefIndex: { col: number; colRent: number };
};

export type SpendingDeciles = {
  source: string;
  year: number;
  // Decile means plotted at percentile midpoints p = 5, 15, ..., 95.
  anchors: { p: number; annual: number }[];
};

export type IndexKind = 'col' | 'colRent';
