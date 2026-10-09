import { parseAbi, type Address, type Hex } from "viem";
import { agentWallet, publicClient } from "./chain";
import type { Env } from "./env";

/**
 * Cross-chain collection: a client burns USDC on Base with the chest as mintRecipient (CCTP v2, domain 6 → 26).
 * The agent waits for Circle's attestation and calls receiveMessage on Arc, which mints the USDC into the chest.
 * The collections step then matches that inflow to the invoice. Anyone may relay; the agent just saves the payer a hop.
 */
export const IRIS = "https://iris-api.circle.com";
export const MESSAGE_TRANSMITTER: Address = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
export const ARC_DOMAIN = 26;
export const SOURCE_DOMAINS: Record<number, string> = { 0: "Ethereum", 3: "Arbitrum", 6: "Base" };

const transmitterAbi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
  "function usedNonces(bytes32 nonce) view returns (uint256)",
]);

type PendingBurn = { sourceDomain: number; burnTx: Hex; chest: Address; at: number };
const key = "cctp:pending";

export async function queueBurn(env: Env, burn: Omit<PendingBurn, "at">) {
  const list = JSON.parse((await env.AGENT_KV.get(key)) ?? "[]") as PendingBurn[];
  if (!list.some((b) => b.burnTx.toLowerCase() === burn.burnTx.toLowerCase())) list.push({ ...burn, at: Date.now() });
  await env.AGENT_KV.put(key, JSON.stringify(list.slice(-200)));
}

type IrisMessage = {
  message: Hex;
  attestation: Hex | "PENDING";
  status: string;
  eventNonce?: Hex;
  decodedMessage?: { destinationDomain?: string; decodedMessageBody?: { mintRecipient?: string } };
};

/** Relay every queued burn whose attestation is ready. Burns older than a day are dropped. */
export async function relayBurns(env: Env) {
  const list = JSON.parse((await env.AGENT_KV.get(key)) ?? "[]") as PendingBurn[];
  if (list.length === 0) return;
  const { account, wallet } = agentWallet(env);
  const keep: PendingBurn[] = [];
  for (const burn of list) {
    if (Date.now() - burn.at > 24 * 60 * 60 * 1000) continue;
    const res = await fetch(`${IRIS}/v2/messages/${burn.sourceDomain}?transactionHash=${burn.burnTx}`);
    if (!res.ok) {
      keep.push(burn);
      continue;
    }
    const body = (await res.json()) as { messages?: IrisMessage[] };
    const m = body.messages?.[0];
    if (!m || m.status !== "complete" || !m.attestation || m.attestation === "PENDING") {
      keep.push(burn);
      continue;
    }
    // Only relay messages that actually pay the chest the payer said they were paying.
    const recipient = m.decodedMessage?.decodedMessageBody?.mintRecipient?.toLowerCase() ?? "";
    if (Number(m.decodedMessage?.destinationDomain) !== ARC_DOMAIN || !recipient.endsWith(burn.chest.slice(2).toLowerCase())) continue;
    try {
      const tx = await wallet.writeContract({ address: MESSAGE_TRANSMITTER, abi: transmitterAbi, functionName: "receiveMessage", args: [m.message, m.attestation as Hex], account });
      await publicClient.waitForTransactionReceipt({ hash: tx });
    } catch (e) {
      // already received (by us or anyone else) is fine; anything else gets retried next cycle
      if (!/nonce already used|already received/i.test(String(e))) keep.push(burn);
    }
  }
  await env.AGENT_KV.put(key, JSON.stringify(keep));
}

/** Fee quote for a fast transfer, in basis points, straight from Circle. */
export async function fastFeeBps(sourceDomain: number): Promise<number> {
  const res = await fetch(`${IRIS}/v2/burn/USDC/fees/${sourceDomain}/${ARC_DOMAIN}`);
  const fees = (await res.json()) as { finalityThreshold: number; minimumFee: number }[];
  return fees.find((f) => f.finalityThreshold === 1000)?.minimumFee ?? 1;
}
