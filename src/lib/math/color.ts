// Map classes share one ordinal ramp so "darker = better" holds in both
// modes: lifestyle tier in "retire now", how soon in "retire at a tier".
// Class 0 (not enough / never) is a muted neutral, not a step on the ramp.
// The ramp passes the dataviz validator in ordinal mode against the
// basemap's land color (#f2efe9): monotone L, visible steps, light end 2.18:1.

export const CLASS_COLORS = ['#b9b6ae', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] as const;
