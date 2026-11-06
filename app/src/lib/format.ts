// U128 amounts are decimal strings of the token's smallest unit. Do the maths
// in BigInt; Number loses precision above 2^53.

export function parseUnits(value: string, decimals: number): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount");
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`At most ${decimals} decimal places`);
  }
  const units = BigInt(whole + frac.padEnd(decimals, "0"));
  return units.toString();
}

export function formatUnits(
  value: string | bigint,
  decimals: number,
  maxFraction = 2
): string {
  const v = BigInt(value);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base)
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFraction)
    .replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return frac ? `${wholeStr}.${frac}` : wholeStr;
}

const NS_PER_MS = BigInt(1_000_000);
const NS_PER_DAY = BigInt(86_400) * BigInt(1_000_000_000);

export const nsToDate = (ns: string | bigint) =>
  new Date(Number(BigInt(ns) / NS_PER_MS));

export const daysToNs = (days: number) =>
  (BigInt(Math.round(days * 1000)) * NS_PER_DAY) / BigInt(1000);

export function formatInterval(ns: string): string {
  const minutes = Number(BigInt(ns) / (NS_PER_MS * BigInt(60_000)));
  const plural = (n: number, unit: string) =>
    `${+n.toFixed(1)} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes >= 1440) return plural(minutes / 1440, "day");
  if (minutes >= 60) return plural(minutes / 60, "hour");
  return plural(minutes, "minute");
}

/** NEAR amount like "0.01" to yoctoNEAR. */
export const nearToYocto = (near: string) => parseUnits(near, 24);

export const shortAccount = (id: string) =>
  id.length > 24 ? `${id.slice(0, 8)}…${id.slice(-8)}` : id;
