// Shared between the app and the data pipeline.

export type CityRecord = {
  id: string; // stable slug, e.g. "lisbon-pt"
  name: string; // Numbeo display name, e.g. "Lisbon"
  admin?: string; // state/province hint for disambiguation, e.g. "NY"
  country: string;
  iso2: string;
  places: string[]; // place ids, broad → narrow: continent, sub-region(s), groups, country
  lat: number;
  lng: number;
  pop?: number;
  col: number; // Cost of Living Index (NYC = 100)
  rent: number;
  colRent: number; // Cost of Living Plus Rent Index
  groceries: number;
  restaurant: number;
  purchasingPower: number;
  // Average monthly net (after-tax) salary, USD, derived from purchasing
  // power x COL-plus-rent and calibrated to Numbeo's published figures.
  salary: number;
  // Numbeo-estimated monthly costs for one person excluding rent, USD.
  basics: number;
  qol?: QualityOfLife; // absent when Numbeo doesn't rate the city
  // Best available single indexes: Numbeo's per-topic rankings (more cities
  // than the Quality of Life table), falling back to the QoL table's copy.
  safety?: number;
  healthCare?: number;
};

export type PlaceKind = 'continent' | 'subregion' | 'group' | 'country';

/** A filterable place (src/data/places.json), from UN M49 plus a few groups. */
export type Place = { id: string; label: string; kind: PlaceKind; count: number };

export type QualityOfLife = {
  index: number; // Numbeo Quality of Life Index
  safety: number;
  healthCare: number;
  pollution: number; // higher = worse
  climate?: number;
};

export type Meta = {
  edition: string;
  snapshotDate: string; // ISO date of the Numbeo snapshot
  cityCount: number;
  // Population-weighted mean index over US cities in the dataset; the
  // reference point that places any budget on the US spending-percentile curve.
  usRefIndex: { col: number; colRent: number };
  salaryAnchor: {
    date: string;
    nycNet: number; // Numbeo NYC average monthly net salary, USD
    calibration: number; // k: median(published / derived) over the validation cities
    meanAbsError: number; // after calibration, over the validation cities
    basicsCalibration: number;
    basicsMeanAbsError: number;
  };
};

export type SpendingDeciles = {
  source: string;
  year: number;
  // Decile means plotted at percentile midpoints p = 5, 15, ..., 95.
  anchors: { p: number; annual: number }[];
};

export type IndexKind = 'col' | 'colRent';
