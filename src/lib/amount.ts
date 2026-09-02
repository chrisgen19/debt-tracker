function localeDecimalSeparator() {
  return Intl.NumberFormat()
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ".";
}

/**
 * Normalizes typed or pasted money into the dot-decimal representation stored
 * by the form. The rightmost separator wins when both `,` and `.` are present.
 * With only one separator style, the device locale identifies decimals while
 * a non-locale separator followed by three digits is treated as grouping.
 */
export function sanitizeAmount(raw: string, decimalSeparator = localeDecimalSeparator()) {
  const clean = raw.replace(/[^\d.,]/g, "");
  const lastDot = clean.lastIndexOf(".");
  const lastComma = clean.lastIndexOf(",");
  let decimalIndex = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalIndex = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separatorIndex = Math.max(lastDot, lastComma);
    const separator = clean[separatorIndex];
    const fractionLength = clean.length - separatorIndex - 1;
    const looksLikeDecimal = fractionLength <= 2;
    decimalIndex = separator === decimalSeparator || looksLikeDecimal ? separatorIndex : -1;
  }

  const wholeSource = decimalIndex >= 0 ? clean.slice(0, decimalIndex) : clean;
  const wholeDigits = wholeSource.replace(/\D/g, "");
  const whole = wholeDigits.replace(/^0+(?=\d)/, "").slice(0, 9);
  if (decimalIndex < 0) return whole;

  const fraction = clean.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}
