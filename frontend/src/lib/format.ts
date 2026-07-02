export const money = (n: number, decimals = 0) =>
  `$${(Math.round(n * 10 ** decimals) / 10 ** decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

export const rate = (n: number) => `$${n.toFixed(2)}`;

export const hrs = (n: number) => `${Math.round(n * 10) / 10}h`;

export const num = (n: number) => Math.round(n).toLocaleString("en-US");

export const pct = (n: number) => `${Math.round(n * 100)}%`;
