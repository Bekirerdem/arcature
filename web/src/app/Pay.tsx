import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { encodeFunctionData, isAddress, isHex, type Address, type Hex } from "viem";
import { useConnection } from "wagmi";
import { collectiveAbi, erc20Abi, memoAbi } from "../lib/abi";
import { explorerTx, publicClient } from "../lib/arc";
import { MEMO, USDC } from "../lib/contracts";
import { pct, short, usdc } from "../lib/format";
import { useLang } from "../lib/i18n";
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
  const { t } = useLang();

  const d = inv.data;
  const exists = d && d.status !== 0;
  const wrongPayer = d && me && !/^0x0+$/.test(d.payer) && d.payer.toLowerCase() !== me.toLowerCase();
  const short_ = d && bal.data !== undefined && bal.data < d.amount;
  const approved = d && d.allowance >= d.amount;

  async function approve() {
    if (!d || !chest) return;
    // approve exactly this invoice, never an open-ended allowance
    const r = await send(t("tx.allow"), { address: USDC, abi: erc20Abi, functionName: "approve", args: [chest, d.amount] });
    if (r) qc.invalidateQueries({ queryKey: ["invoice", chest, id, me] });
  }

  async function pay() {
    if (!d || !chest || !id) return;
    // Pay through Arc's Memo contract: the invoice id is written to Arc's memo log, the payer stays msg.sender.
    const data = encodeFunctionData({ abi: collectiveAbi, functionName: "payInvoice", args: [id, d.amount] });
    const r = await send(t("tx.payInvoice"), { address: MEMO, abi: memoAbi, functionName: "memo", args: [chest, data, id, "0x"] });
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
          <div className="card"><p className="note">{t("pay.broken")}</p></div>
        ) : inv.isLoading ? (
          <div className="card"><div className="skeleton" style={{ height: 220 }} /></div>
        ) : !exists ? (
          <div className="card"><p className="note">{t("pay.missing")}</p></div>
        ) : (
          <>
            <div className="card tape no-pin">
              <div className="label">{t("pay.from")}</div>
              <h1 className="title" style={{ marginTop: 6 }}>{d!.name}</h1>
              <div className="amount" style={{ marginTop: 18, fontSize: 44 }}>{usdc(d!.amount)}<small>{t("pay.onArc")}</small></div>
              <span className={`chip ${d!.status === 2 ? "paid" : "open"}`} style={{ marginTop: 12 }}>{t(`inv.status.${d!.status}`)}</span>
            </div>
            <div className="card tilt-l">
              <div className="label">{t("pay.who")}</div>
              <ul className="mono" style={{ listStyle: "none", marginTop: 10, display: "grid", gap: 6 }}>
                {d!.contributors.map((m, k) => <li key={m} className="between"><span>{short(m)}</span><span>{pct(d!.sharesBps[k])}</span></li>)}
              </ul>
              <p className="hint" style={{ marginTop: 12 }}>{t("pay.explain")}</p>
            </div>
            {d!.status === 1 && !paidTx && (
              <div className="card ink">
                <div className="label">{t("pay.label")}</div>
                <ol className="mono" style={{ marginTop: 10, paddingLeft: 18, display: "grid", gap: 6 }}>
                  <li style={{ opacity: approved ? 0.5 : 1 }}>{t("pay.step1", { amt: usdc(d!.amount) })}</li>
                  <li>{t("pay.step2")}</li>
                </ol>
                {me && bal.data !== undefined && <p className="mono" style={{ marginTop: 10, opacity: 0.8 }}>{t("pay.have", { amt: usdc(bal.data) })}</p>}
                {wrongPayer && <p className="error" style={{ marginTop: 10 }}>{t("pay.wrongPayer", { who: short(d!.payer) })}</p>}
                {short_ && <p className="error" style={{ marginTop: 10 }}>{t("pay.short")}</p>}
                <div className="row" style={{ marginTop: 16 }}>
                  <OnArc>
                    {!approved ? (
                      <button className="btn" disabled={busy || !!wrongPayer || !!short_} onClick={approve}>{t("pay.allow", { amt: usdc(d!.amount) })}</button>
                    ) : (
                      <button className="btn red" disabled={busy || !!wrongPayer || !!short_} onClick={pay}>{t("pay.pay", { amt: usdc(d!.amount) })}</button>
                    )}
                  </OnArc>
                </div>
              </div>
            )}
            {(d!.status === 2 || paidTx) && (
              <div className="card kraft tilt-r">
                <span className="stamp">PAID · ARC</span>
                <p className="note" style={{ marginTop: 12 }}>{t("pay.thanks")}</p>
                {paidTx && <a className="mono" href={explorerTx(paidTx)} target="_blank" rel="noreferrer">{t("pay.see")}</a>}
              </div>
            )}
            {d!.status === 3 && <div className="card"><p className="note">{t("pay.cancelled")}</p></div>}
          </>
        )}
      </main>
      <aside className="side">
        <Wallet />
        {chest && <Link className="btn ghost small" style={{ alignSelf: "flex-start" }} to={`/c/${chest}`}>{t("pay.lookInside")}</Link>}
      </aside>
    </div>
  );
}
