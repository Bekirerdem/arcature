import { parseEventLogs, type Address, type Log } from "viem";
import { publicClient } from "./arc";
import { collectiveAbi } from "./abi";

// Providers cap eth_getLogs ranges differently (Arc ~5k, thirdweb 1k, dRPC free tier lower still), so stay
// under the smallest cap; the local cache means only new blocks are scanned on later visits.
const CHUNK = 900n;

type Cached = { from: string; to: string; logs: SerializedLog[] };
type SerializedLog = { blockNumber: string; transactionHash: string; logIndex: number; data: `0x${string}`; topics: `0x${string}`[] };

const key = (a: Address) => `keyarc:logs:v1:${a.toLowerCase()}`;

function load(a: Address): Cached | null {
  try {
    const raw = localStorage.getItem(key(a));
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function save(a: Address, c: Cached) {
  try {
    localStorage.setItem(key(a), JSON.stringify(c));
  } catch {
    /* storage full or blocked: the page still works, it just rescans next time */
  }
}

/** First block where `a` has code (binary search on eth_getCode). */
export async function creationBlock(a: Address): Promise<bigint> {
  const cachedKey = `keyarc:born:${a.toLowerCase()}`;
  try {
    const hit = localStorage.getItem(cachedKey);
    if (hit) return BigInt(hit);
  } catch { /* ignore */ }
  let lo = 0n;
  let hi = await publicClient.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await publicClient.getCode({ address: a, blockNumber: mid });
    if (code && code !== "0x") hi = mid;
    else lo = mid + 1n;
  }
  try { localStorage.setItem(cachedKey, lo.toString()); } catch { /* ignore */ }
  return lo;
}

/** All logs emitted by a collective, decoded, oldest first. Incremental: only new blocks are fetched. */
export async function collectiveLogs(a: Address) {
  const head = await publicClient.getBlockNumber();
  const cached = load(a);
  let from = cached ? BigInt(cached.to) + 1n : await creationBlock(a);
  const raw: SerializedLog[] = cached ? [...cached.logs] : [];
  const start = cached ? BigInt(cached.from) : from;

  while (from <= head) {
    const to = from + CHUNK > head ? head : from + CHUNK;
    const logs: Log[] = await publicClient.getLogs({ address: a, fromBlock: from, toBlock: to });
    for (const l of logs) {
      raw.push({
        blockNumber: (l.blockNumber ?? 0n).toString(),
        transactionHash: l.transactionHash ?? "0x",
        logIndex: l.logIndex ?? 0,
        data: l.data,
        topics: l.topics as `0x${string}`[],
      });
    }
    from = to + 1n;
  }
  save(a, { from: start.toString(), to: head.toString(), logs: raw });

  const asLogs = raw.map((r) => ({
    address: a,
    blockHash: null,
    blockNumber: BigInt(r.blockNumber),
    data: r.data,
    logIndex: r.logIndex,
    removed: false,
    topics: r.topics as [`0x${string}`, ...`0x${string}`[]],
    transactionHash: r.transactionHash as `0x${string}`,
    transactionIndex: null,
  }));
  return parseEventLogs({ abi: collectiveAbi, logs: asLogs as never, strict: false });
}

export type CollectiveEvent = Awaited<ReturnType<typeof collectiveLogs>>[number];
