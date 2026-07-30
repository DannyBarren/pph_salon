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

/**
 * Accounting-style money: negatives are wrapped in parentheses (e.g. `($67.60)`)
 * exactly like the client's UAT spreadsheet. `decimals` defaults to 2.
 */
export const moneyAcct = (n: number, decimals = 2) => {
  const v = safe(n);
  const abs = money(Math.abs(v), decimals);
  return v < 0 ? `(${abs})` : abs;
};

/** US short date `MM/DD/YY` (matches the UAT spreadsheet's pay-period format). */
export const usDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
};
