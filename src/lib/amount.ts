function localeDecimalSeparator() {
  return Intl.NumberFormat()
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ".";
}

/**
 * Normalizes typed or pasted money into the dot-decimal representation stored
 * by the form. The rightmost separator wins when both `,` and `.` are present;
 * a lone comma follows the device locale, while obvious three-digit grouping
 * remains grouping in dot-decimal locales.
 */
export function sanitizeAmount(raw: string, decimalSeparator = localeDecimalSeparator()) {
  const clean = raw.replace(/[^\d.,]/g, "");
  const lastDot = clean.lastIndexOf(".");
  const lastComma = clean.lastIndexOf(",");
  let decimalIndex = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalIndex = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0) {
    decimalIndex = lastDot;
  } else if (lastComma >= 0) {
    const fractionLength = clean.length - lastComma - 1;
    const looksLikeDecimal = fractionLength <= 2;
    decimalIndex = decimalSeparator === "," || looksLikeDecimal ? lastComma : -1;
  }

  const wholeSource = decimalIndex >= 0 ? clean.slice(0, decimalIndex) : clean;
  const whole = wholeSource.replace(/\D/g, "").slice(0, 9);
  if (decimalIndex < 0) return whole;

  const fraction = clean.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}
