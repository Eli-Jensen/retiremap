// Map classes share one ordered palette so "purple = best" holds in both
// modes: lifestyle tier when retiring at your chosen age, how soon in
// "when could I…". Red → amber → green → blue → purple varies hue *and*
// lightness, so neighbors stay apart (the single-blue ramp read as one
// color). Class 0 (not enough / never) is a muted neutral.
//
// Passes the dataviz validator against the basemap land color (#f2efe9):
// lightness band, chroma floor, adjacent CVD ΔE ≥ 8.2, normal-vision ΔE ≥ 15.
// Amber is 1.88:1 against the map, so every dot carries a dark ring.

export const CLASS_COLORS = ['#b9b6ae', '#d6453d', '#f0a020', '#2f9e44', '#1c7ed6', '#8f2d9e'] as const;
