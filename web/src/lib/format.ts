import { formatUnits, parseUnits } from "viem";

export const usdc = (v: bigint, digits = 2) =>
  Number(formatUnits(v, 6)).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: 6 });
export const toUsdc = (s: string) => parseUnits(s.trim() === "" ? "0" : s.trim(), 6);
export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export type Units = { now: string; d: string; h: string; m: string };
const EN_UNITS: Units = { now: "now", d: "d", h: "h", m: "m" };

export function duration(seconds: number, u: Units = EN_UNITS) {
  if (seconds <= 0) return u.now;
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  if (d) return h ? `${d}${u.d} ${h}${u.h}` : `${d}${u.d}`;
  if (h) return m ? `${h}${u.h} ${m}${u.m}` : `${h}${u.h}`;
  return `${Math.max(m, 1)}${u.m}`;
}
