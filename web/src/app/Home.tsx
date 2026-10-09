import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Address } from "viem";
import { useConnection } from "wagmi";
import { collectiveAbi, factoryAbi } from "../lib/abi";
import { publicClient } from "../lib/arc";
import { FACTORY, PROOF_CHEST } from "../lib/contracts";
import { short, usdc } from "../lib/format";
import { useLang } from "../lib/i18n";
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
  const { t } = useLang();

  return (
    <div className="board">
      <aside className="rail">
        <Brand />
        <Wallet />
        <div className="card tilt-l no-pin kraft">
          <div className="label">{t("home.what")}</div>
          <p className="note" style={{ marginTop: 8 }}>{t("home.whatBody")}</p>
        </div>
      </aside>

      <main className="main">
        <div className="card tape no-pin">
          <div className="between">
            <div>
              <div className="label">{t("home.yourChests")}</div>
              <h1 className="title" style={{ marginTop: 6 }}>{t("home.title")}</h1>
            </div>
            <Link className="btn" to="/app/new">{t("home.open")}</Link>
          </div>
        </div>

        {!address && (
          <div className="card tilt-l">
            <p className="note">{t("home.connectFirst")}</p>
          </div>
        )}
        {address && mine.isLoading && <div className="card"><div className="skeleton" style={{ height: 60 }} /></div>}
        {address && mine.data && mine.data.length === 0 && (
          <div className="card tilt-r empty">
            <p className="note">{t("home.empty")}</p>
            <p className="hint" style={{ marginTop: 8 }}>{t("home.emptyHint")}</p>
          </div>
        )}
        <div className="grid2">
          {mine.data?.map((c, i) => (
            <Link key={c.address} to={`/c/${c.address}`} className={`card ${i % 2 ? "tilt-r" : "tilt-l"}`} style={{ textDecoration: "none", animationDelay: `${i * 60}ms` }}>
              <div className="label">{short(c.address)}</div>
              <div className="h3" style={{ marginTop: 6 }}>{c.name}</div>
              <div className="amount" style={{ marginTop: 10 }}>{usdc(c.pool)}<small>{t("home.thisPeriod")}</small></div>
            </Link>
          ))}
        </div>
      </main>

      <aside className="side">
        <Link to={`/c/${PROOF_CHEST}`} className="card ink" style={{ textDecoration: "none" }}>
          <div className="label">{t("home.live")}</div>
          <div className="h3" style={{ marginTop: 6 }}>Proof Guild</div>
          <p className="mono" style={{ marginTop: 8, opacity: 0.8 }}>{t("home.proofBody")}</p>
          <span className="btn small" style={{ marginTop: 14 }}>{t("home.lookInside")}</span>
        </Link>
        <div className="card kraft tilt-r pin-gold">
          <div className="label">{t("home.how")}</div>
          <ol className="mono" style={{ marginTop: 10, paddingLeft: 18, display: "grid", gap: 8 }}>
            <li>{t("home.how1")}</li>
            <li>{t("home.how2")}</li>
            <li>{t("home.how3")}</li>
            <li>{t("home.how4")}</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
