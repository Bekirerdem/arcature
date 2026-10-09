import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { collectiveAbi } from "../lib/abi";
import { publicClient } from "../lib/arc";
import { collectiveLogs, type CollectiveEvent } from "../lib/logs";

export type Rules = {
  reserveBps: number;
  reserveTarget: bigint;
  autoAttributeCap: bigint;
  expenseCapPerPeriod: bigint;
  quorumBps: number;
  timelock: number;
  periodLength: number;
};

export type Proposal = {
  id: number;
  kind: number;
  payload: Hex;
  ref: Hex;
  proposer: Address;
  executableAt: number;
  expiresAt: number;
  epoch: bigint;
  votes: number;
  votesNeeded: number;
  executed: boolean;
  cancelled: boolean;
  iVoted: boolean;
};

export type Invoice = {
  id: Hex;
  creator: Address;
  amount: bigint;
  payer: Address;
  status: number;
  contributors: readonly Address[];
  sharesBps: readonly number[];
  createdTx: Hex;
  paidTx?: Hex;
};

export type Chest = {
  address: Address;
  name: string;
  members: readonly Address[];
  agent: Address;
  rules: Rules;
  reserve: bigint;
  pool: bigint;
  unattributed: bigint;
  period: bigint;
  periodStart: number;
  governanceEpoch: bigint;
  credits: { member: Address; credit: bigint }[];
  totalCredit: bigint;
  owedToMe: bigint;
  proposals: Proposal[];
};

const c = (address: Address) => ({ address, abi: collectiveAbi }) as const;

export async function readChest(address: Address, me?: Address): Promise<Chest> {
  const [name, members, agent, rules, reserve, pool, unattributed, period, periodStart, epoch, proposalCount] =
    await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { ...c(address), functionName: "name" },
        { ...c(address), functionName: "members" },
        { ...c(address), functionName: "agent" },
        { ...c(address), functionName: "rules" },
        { ...c(address), functionName: "reserve" },
        { ...c(address), functionName: "pool" },
        { ...c(address), functionName: "unattributed" },
        { ...c(address), functionName: "period" },
        { ...c(address), functionName: "periodStart" },
        { ...c(address), functionName: "governanceEpoch" },
        { ...c(address), functionName: "proposalCount" },
      ],
    });

  const [creditors, totalCredit, owedToMe] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...c(address), functionName: "creditors", args: [period] },
      { ...c(address), functionName: "totalCredit", args: [period] },
      { ...c(address), functionName: "owed", args: [me ?? "0x0000000000000000000000000000000000000000"] },
    ],
  });

  const creditValues = creditors.length
    ? await publicClient.multicall({
        allowFailure: false,
        contracts: creditors.map((m) => ({ ...c(address), functionName: "credit", args: [period, m] }) as const),
      })
    : [];

  const n = Number(proposalCount);
  const ids = Array.from({ length: Math.min(n, 30) }, (_, i) => n - 1 - i); // newest 30
  const [props, voted] = ids.length
    ? await Promise.all([
        publicClient.multicall({
          allowFailure: false,
          contracts: ids.map((i) => ({ ...c(address), functionName: "proposal", args: [BigInt(i)] }) as const),
        }),
        me
          ? publicClient.multicall({
              allowFailure: false,
              contracts: ids.map((i) => ({ ...c(address), functionName: "hasVoted", args: [BigInt(i), me] }) as const),
            })
          : Promise.resolve(ids.map(() => false)),
      ])
    : [[], []];

  return {
    address,
    name,
    members,
    agent,
    rules: {
      reserveBps: rules.reserveBps,
      reserveTarget: rules.reserveTarget,
      autoAttributeCap: rules.autoAttributeCap,
      expenseCapPerPeriod: rules.expenseCapPerPeriod,
      quorumBps: rules.quorumBps,
      timelock: rules.timelock,
      periodLength: rules.periodLength,
    },
    reserve,
    pool,
    unattributed,
    period,
    periodStart: Number(periodStart),
    governanceEpoch: epoch,
    credits: creditors.map((m, i) => ({ member: m, credit: creditValues[i] as bigint })),
    totalCredit,
    owedToMe,
    proposals: props.map((p, k) => ({
      id: ids[k],
      kind: p.kind,
      payload: p.payload,
      ref: p.ref,
      proposer: p.proposer,
      executableAt: Number(p.executableAt),
      expiresAt: Number(p.expiresAt),
      epoch: p.epoch,
      votes: p.votes,
      votesNeeded: p.votesNeeded,
      executed: p.executed,
      cancelled: p.cancelled,
      iVoted: voted[k] as boolean,
    })),
  };
}

export function useChest(address?: Address, me?: Address) {
  return useQuery({
    queryKey: ["chest", address, me],
    enabled: !!address,
    refetchInterval: 20_000,
    queryFn: () => readChest(address!, me),
  });
}

export function useChestEvents(address?: Address) {
  return useQuery({
    queryKey: ["chest-events", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: () => collectiveLogs(address!),
  });
}

/** Invoices rebuilt from InvoiceCreated / InvoicePaid / InvoiceCancelled events. */
export function invoicesFrom(events: CollectiveEvent[]): Invoice[] {
  const map = new Map<Hex, Invoice>();
  for (const e of events) {
    if (e.eventName === "InvoiceCreated") {
      const a = e.args as { id: Hex; creator: Address; amount: bigint; payer: Address; contributors: readonly Address[]; sharesBps: readonly number[] };
      map.set(a.id, { ...a, status: 1, createdTx: e.transactionHash });
    } else if (e.eventName === "InvoicePaid") {
      const a = e.args as { id: Hex };
      const inv = map.get(a.id);
      if (inv) map.set(a.id, { ...inv, status: 2, paidTx: e.transactionHash });
    } else if (e.eventName === "InvoiceCancelled") {
      const a = e.args as { id: Hex };
      const inv = map.get(a.id);
      if (inv) map.set(a.id, { ...inv, status: 3 });
    }
  }
  return [...map.values()].reverse();
}
