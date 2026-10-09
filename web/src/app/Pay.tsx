import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { encodeFunctionData, isAddress, isHex, type Address, type Hex } from "viem";
import { useConnection } from "wagmi";
import { collectiveAbi, erc20Abi, memoAbi } from "../lib/abi";
import { explorerTx, publicClient } from "../lib/arc";
import { InvoiceStatus, MEMO, USDC } from "../lib/contracts";
import { pct, short, usdc } from "../lib/format";
import { useTx } from "../lib/tx";
import { Brand, OnArc, useUsdcBalance, Wallet } from "./Wallet";

function useInvoice(chest?: Address, id?: Hex, me?: Address) {
  return useQuery({
    queryKey: ["invoice", chest, id, me],
    enabled: !!chest && !!id,
    refetchInterval: 10_000,
    queryFn: async () => {
      const [inv, name, allowance] = await Promise.all([
        publicClient.readContract({ address: chest!, abi: collectiveAbi, functionName: "invoice", args: [id!] }),
        publicClient.readContract({ address: chest!, abi: collectiveAbi, functionName: "name" }),
        me ? publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [me, chest!] }) : Promise.resolve(0n),
      ]);
      const [amount, creator, payer, status, contributors, sharesBps] = inv;
      return { amount, creator, payer, status, contributors, sharesBps, name, allowance };
    },
  });
}

export default function Pay() {
  const { chest: c, id: i } = useParams();
  const chest = c && isAddress(c) ? (c as Address) : undefined;
  const id = i && isHex(i) && i.length === 66 ? (i as Hex) : undefined;
  const { address: me } = useConnection();
  const inv = useInvoice(chest, id, me);
  const bal = useUsdcBalance(me);
  const { send, busy } = useTx();
  const qc = useQueryClient();
  const [paidTx, setPaidTx] = useState<Hex | null>(null);

  const d = inv.data;
  const exists = d && d.status !== 0;
  const wrongPayer = d && me && !/^0x0+$/.test(d.payer) && d.payer.toLowerCase() !== me.toLowerCase();
  const short_ = d && bal.data !== undefined && bal.data < d.amount;
  const approved = d && d.allowance >= d.amount;

  async function approve() {
    if (!d || !chest) return;
    // approve exactly this invoice, never an open-ended allowance
    const r = await send("Allow payment", { address: USDC, abi: erc20Abi, functionName: "approve", args: [chest, d.amount] });
    if (r) qc.invalidateQueries({ queryKey: ["invoice", chest, id, me] });
  }

  async function pay() {
    if (!d || !chest || !id) return;
    // Pay through Arc's Memo contract: the invoice id is written to Arc's memo log, the payer stays msg.sender.
    const data = encodeFunctionData({ abi: collectiveAbi, functionName: "payInvoice", args: [id, d.amount] });
    const r = await send("Pay invoice", { address: MEMO, abi: memoAbi, functionName: "memo", args: [chest, data, id, "0x"] });
    if (r) {
      setPaidTx(r.transactionHash);
      qc.invalidateQueries();
    }
  }

  return (
    <div className="board" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,560px) minmax(0,1fr)" }}>
      <aside className="rail"><Brand /></aside>
      <main className="main">
        {!chest || !id ? (
          <div className="card"><p className="note">This pay link is broken.</p></div>
        ) : inv.isLoading ? (
          <div className="card"><div className="skeleton" style={{ height: 220 }} /></div>
        ) : !exists ? (
          <div className="card"><p className="note">There's no invoice behind this link.</p></div>
        ) : (
          <>
            <div className="card tape no-pin">
              <div className="label">invoice from</div>
              <h1 className="title" style={{ marginTop: 6 }}>{d!.name}</h1>
              <div className="amount" style={{ marginTop: 18, fontSize: 44 }}>{usdc(d!.amount)}<small>USDC on Arc</small></div>
              <span className={`chip ${d!.status === 2 ? "paid" : "open"}`} style={{ marginTop: 12 }}>{InvoiceStatus[d!.status].toLowerCase()}</span>
            </div>
            <div className="card tilt-l">
              <div className="label">who did the work</div>
              <ul className="mono" style={{ listStyle: "none", marginTop: 10, display: "grid", gap: 6 }}>
                {d!.contributors.map((m, k) => <li key={m} className="between"><span>{short(m)}</span><span>{pct(d!.sharesBps[k])}</span></li>)}
              </ul>
              <p className="hint" style={{ marginTop: 12 }}>Your payment lands in the team's chest on Arc. A reserve is set aside first, the rest is shared by these percentages at the end of the period.</p>
            </div>
            {d!.status === 1 && !paidTx && (
              <div className="card ink">
                <div className="label">pay</div>
                <ol className="mono" style={{ marginTop: 10, paddingLeft: 18, display: "grid", gap: 6 }}>
                  <li style={{ opacity: approved ? 0.5 : 1 }}>Allow exactly {usdc(d!.amount)} USDC</li>
                  <li>Pay — the invoice reference is recorded on Arc</li>
                </ol>
                {me && bal.data !== undefined && <p className="mono" style={{ marginTop: 10, opacity: 0.8 }}>You have {usdc(bal.data)} USDC on Arc.</p>}
                {wrongPayer && <p className="error" style={{ marginTop: 10 }}>This invoice is addressed to {short(d!.payer)}.</p>}
                {short_ && <p className="error" style={{ marginTop: 10 }}>Not enough USDC on Arc for this invoice.</p>}
                <div className="row" style={{ marginTop: 16 }}>
                  <OnArc>
                    {!approved ? (
                      <button className="btn" disabled={busy || !!wrongPayer || !!short_} onClick={approve}>1 · Allow {usdc(d!.amount)} USDC</button>
                    ) : (
                      <button className="btn red" disabled={busy || !!wrongPayer || !!short_} onClick={pay}>2 · Pay {usdc(d!.amount)} USDC</button>
                    )}
                  </OnArc>
                </div>
              </div>
            )}
            {(d!.status === 2 || paidTx) && (
              <div className="card kraft tilt-r">
                <span className="stamp">PAID · ARC</span>
                <p className="note" style={{ marginTop: 12 }}>Thank you. The team's chest has it.</p>
                {paidTx && <a className="mono" href={explorerTx(paidTx)} target="_blank" rel="noreferrer">see it on Arc ↗</a>}
              </div>
            )}
            {d!.status === 3 && <div className="card"><p className="note">This invoice was cancelled by the team.</p></div>}
          </>
        )}
      </main>
      <aside className="side">
        <Wallet />
        {chest && <Link className="btn ghost small" style={{ alignSelf: "flex-start" }} to={`/c/${chest}`}>Look inside this chest →</Link>}
      </aside>
    </div>
  );
}
