export interface LengthStatus {
  label: string;
  className: string;
}

// Soft, non-blocking guidance shown alongside a hard maxLength - never
// prevents publishing on its own, just nudges. Thresholds are fractions of
// the hard cap passed in by the caller (100,000 for articles/chapters).
export function getLengthStatus(length: number, hardLimit: number): LengthStatus {
  const ratio = length / hardLimit;
  if (ratio < 0.5) return { label: 'Good length', className: 'text-gray-400' };
  if (ratio < 0.8) return { label: 'Long - consider splitting into parts', className: 'text-amber-600' };
  return { label: 'Very long - may affect readability', className: 'text-amber-600' };
}
