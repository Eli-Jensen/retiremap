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
  climate?: Climate; // Open-Meteo (ERA5) averages; absent until fetched
  usFlights?: UsFlights; // absent for cities in the US
};

/** Nonstop passenger flights to US hub airports from airports near a city. */
export type UsFlights = {
  yearRound: string[]; // US airport IATA codes
  seasonal: string[]; // seasonal-only
  via: { airport: string; km: number }[]; // nearby airports with US service
};

/** Climate averages over the fetched years. Temperatures °C, rain mm. */
export type Climate = {
  years: number; // how many years are averaged
  summerHigh: number; // average daily high in the hottest month
  winterLow: number; // average daily low in the coldest month
  sunHours: number; // per year
  rain: number; // mm per year
  rainyDays: number; // days with ≥ 1 mm, per year
  humidity: number; // mean relative humidity, %
  months: { hi: number; lo: number; rain: number }[]; // Jan..Dec
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
  flights?: { fetched: string; usAirports: { iata: string; name: string }[]; radiusKm: number };
  climate?: {
    firstYear: number;
    lastYear: number;
    cities: number;
    sunCalibration?: { n: number; rawMae: number; looMae: number; looMedian: number };
  };
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
