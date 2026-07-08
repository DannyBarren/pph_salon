// Display formatters. All coerce non-finite input (NaN/Infinity/undefined) to 0
// so corrupt or partial data can never render as "$NaN" / "undefined" in the UI.
const safe = (n: number) => (Number.isFinite(n) ? n : 0);

export const money = (n: number, decimals = 0) =>
  `$${(Math.round(safe(n) * 10 ** decimals) / 10 ** decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

export const rate = (n: number) => `$${safe(n).toFixed(2)}`;

export const hrs = (n: number) => `${Math.round(safe(n) * 10) / 10}h`;

export const num = (n: number) => Math.round(safe(n)).toLocaleString("en-US");

export const pct = (n: number) => `${Math.round(safe(n) * 100)}%`;
