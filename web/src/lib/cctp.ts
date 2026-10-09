import { pad, parseAbi, zeroHash, type Address, type Hex } from "viem";
import { AGENT_URL as AGENT_API } from "./agent";

/** CCTP v2 on Base → Arc. Same contract addresses on every CCTP v2 EVM chain. */
export const BASE_CHAIN_ID = 8453;
export const BASE_DOMAIN = 6;
export const ARC_DOMAIN = 26;
export const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const TOKEN_MESSENGER: Address = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
/** Fast transfer: Circle attests after soft finality (seconds), for a small fee. */
export const FAST_FINALITY = 1000;

export const tokenMessengerAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
]);

/**
 * How much to burn so the chest receives at least `invoice` after Circle's fee.
 * Fee is in basis points (may be fractional); we leave 25% headroom, then round up.
 */
export function burnFor(invoice: bigint, feeBps: number): { burn: bigint; maxFee: bigint } {
  const milliBps = BigInt(Math.ceil(feeBps * 1000)); // 0.325 bps -> 325
  const fee = (invoice * milliBps * 125n + 10_000_000n * 100n - 1n) / (10_000_000n * 100n); // ceil(invoice * bps/10_000 * 1.25)
  const maxFee = fee + 1n;
  return { burn: invoice + maxFee, maxFee };
}

export const depositArgs = (burn: bigint, chest: Address, maxFee: bigint) =>
  [burn, ARC_DOMAIN, pad(chest), BASE_USDC, zeroHash, maxFee, FAST_FINALITY] as const;

export async function quoteFeeBps(): Promise<number> {
  const res = await fetch(`${AGENT_API}/cctp/fee?source=${BASE_DOMAIN}&chest=0x0000000000000000000000000000000000000000`);
  if (!res.ok) throw new Error("fee quote unavailable");
  return ((await res.json()) as { feeBps: number }).feeBps;
}

export async function announceBurn(chest: Address, invoiceId: Hex, burnTx: Hex) {
  const post = (path: string, body: unknown) =>
    fetch(`${AGENT_API}${path}?chest=${chest}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  await Promise.allSettled([
    post("/cctp", { burnTx, source: BASE_DOMAIN }),
    post("/invoice-note", { id: invoiceId, note: `Paid from Base via CCTP, burn tx ${burnTx}` }),
  ]);
}
