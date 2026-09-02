import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Pulls just the symbol out of a formatted amount, e.g. "PHP" -> "₱". Falls back to the code. */
export function currencySymbol(currency = "USD") {
  const parts = new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}
