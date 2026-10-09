import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Address } from "viem";
import { useConnection } from "wagmi";
import { collectiveAbi, factoryAbi } from "../lib/abi";
import { publicClient } from "../lib/arc";
import { FACTORY, PROOF_CHEST } from "../lib/contracts";
import { short, usdc } from "../lib/format";
import { Brand, Wallet } from "./Wallet";

function useMyChests(me?: Address) {
  return useQuery({
    queryKey: ["my-chests", me],
    enabled: !!me,
    queryFn: async () => {
      const list = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "collectivesOf", args: [me!] });
      if (!list.length) return [];
      const reads = await publicClient.multicall({
        allowFailure: false,
        contracts: list.flatMap((a) => [
          { address: a, abi: collectiveAbi, functionName: "name" } as const,
          { address: a, abi: collectiveAbi, functionName: "pool" } as const,
          { address: a, abi: collectiveAbi, functionName: "isMember", args: [me!] } as const,
        ]),
      });
      // collectivesOf can be padded by strangers listing you as a member and then removing you; keep only live memberships.
      return list
        .map((a, i) => ({ address: a, name: reads[i * 3] as string, pool: reads[i * 3 + 1] as bigint, member: reads[i * 3 + 2] as boolean }))
        .filter((x) => x.member)
        .reverse();
    },
  });
}

export default function Home() {
  const { address } = useConnection();
  const mine = useMyChests(address);

  return (
    <div className="board">
      <aside className="rail">
        <Brand />
        <Wallet />
        <div className="card tilt-l no-pin kraft">
          <div className="label">what this is</div>
          <p className="note" style={{ marginTop: 8 }}>
            One chest for a team that earns together. Every payment is pinned to the job that earned it, a reserve goes aside first, the rest is paid out by what each person did.
          </p>
        </div>
      </aside>

      <main className="main">
        <div className="card tape no-pin">
          <div className="between">
            <div>
              <div className="label">your chests</div>
              <h1 className="title" style={{ marginTop: 6 }}>The board.</h1>
            </div>
            <Link className="btn" to="/app/new">Open a chest →</Link>
          </div>
        </div>

        {!address && (
          <div className="card tilt-l">
            <p className="note">Connect your wallet to see the chests you belong to.</p>
          </div>
        )}
        {address && mine.isLoading && <div className="card"><div className="skeleton" style={{ height: 60 }} /></div>}
        {address && mine.data && mine.data.length === 0 && (
          <div className="card tilt-r empty">
            <p className="note">No chest on your board yet.</p>
            <p className="hint" style={{ marginTop: 8 }}>Open one for your team, or look at the live proof chest on the right.</p>
          </div>
        )}
        <div className="grid2">
          {mine.data?.map((c, i) => (
            <Link key={c.address} to={`/c/${c.address}`} className={`card ${i % 2 ? "tilt-r" : "tilt-l"}`} style={{ textDecoration: "none", animationDelay: `${i * 60}ms` }}>
              <div className="label">{short(c.address)}</div>
              <div className="h3" style={{ marginTop: 6 }}>{c.name}</div>
              <div className="amount" style={{ marginTop: 10 }}>{usdc(c.pool)}<small>USDC this period</small></div>
            </Link>
          ))}
        </div>
      </main>

      <aside className="side">
        <Link to={`/c/${PROOF_CHEST}`} className="card ink" style={{ textDecoration: "none" }}>
          <div className="label">live on Arc mainnet</div>
          <div className="h3" style={{ marginTop: 6 }}>Proof Guild</div>
          <p className="mono" style={{ marginTop: 8, opacity: 0.8 }}>A real chest: a 0.10 USDC invoice paid through Arc Memo, reserve set aside, paid out by share.</p>
          <span className="btn small" style={{ marginTop: 14 }}>Look inside →</span>
        </Link>
      </aside>
    </div>
  );
}
