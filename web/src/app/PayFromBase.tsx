import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { erc20Abi } from "../lib/abi";
import { baseClient } from "../lib/arc";
import { announceBurn, BASE_CHAIN_ID, BASE_USDC, burnFor, depositArgs, quoteFeeBps, TOKEN_MESSENGER, tokenMessengerAbi } from "../lib/cctp";
import { usdc } from "../lib/format";
import { useLang } from "../lib/i18n";
import { reason, useToast } from "../lib/tx";

/**
 * Pay an Arc invoice with USDC on Base. The burn names the chest as mint recipient; Circle attests in seconds
 * (fast transfer), the treasury agent mints it on Arc and matches it to this invoice.
 */
export function PayFromBase({ chest, invoiceId, amount }: { chest: Address; invoiceId: Hex; amount: bigint }) {
  const { t } = useLang();
  const toast = useToast();
  const { address: me, chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [burnTx, setBurnTx] = useState<Hex | null>(null);
  const onBase = isConnected && chainId === BASE_CHAIN_ID;

  const quote = useQuery({
    queryKey: ["cctp-fee"],
    queryFn: quoteFeeBps,
    staleTime: 60_000,
    retry: 1,
  });
  const plan = quote.data !== undefined ? burnFor(amount, quote.data) : null;

  const balances = useQuery({
    queryKey: ["base-usdc", me, plan?.burn.toString()],
    enabled: !!me && onBase,
    refetchInterval: 10_000,
    queryFn: async () => {
      const [balance, allowance] = await Promise.all([
        baseClient.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: "balanceOf", args: [me!] }),
        baseClient.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: "allowance", args: [me!, TOKEN_MESSENGER] }),
      ]);
      return { balance, allowance };
    },
  });

  const enough = plan && balances.data ? balances.data.balance >= plan.burn : false;
  const approved = plan && balances.data ? balances.data.allowance >= plan.burn : false;

  async function step(label: string, run: () => Promise<Hex>) {
    setBusy(true);
    try {
      toast({ kind: "pending", text: t("toast.confirm", { label }) });
      const hash = await run();
      toast({ kind: "pending", text: t("base.waiting", { label }) });
      const r = await baseClient.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(t("err.reverted"));
      toast({ kind: "ok", text: t("toast.done", { label }) });
      return hash;
    } catch (e) {
      toast({ kind: "error", text: `${label}: ${reason(e, t)}` });
      return null;
    } finally {
      setBusy(false);
      balances.refetch();
    }
  }

  async function approve() {
    if (!plan) return;
    await step(t("base.allow"), () =>
      writeContractAsync({ chainId: BASE_CHAIN_ID, address: BASE_USDC, abi: erc20Abi, functionName: "approve", args: [TOKEN_MESSENGER, plan.burn] }));
  }

  async function burn() {
    if (!plan) return;
    const hash = await step(t("base.send"), () =>
      writeContractAsync({ chainId: BASE_CHAIN_ID, address: TOKEN_MESSENGER, abi: tokenMessengerAbi, functionName: "depositForBurn", args: depositArgs(plan.burn, chest, plan.maxFee) }));
    if (hash) {
      setBurnTx(hash);
      await announceBurn(chest, invoiceId, hash);
    }
  }

  if (burnTx) {
    return (
      <div className="card kraft tilt-r">
        <span className="stamp">{t("base.onTheWay")}</span>
        <p className="note" style={{ marginTop: 12 }}>{t("base.after")}</p>
        <a className="mono" href={`https://basescan.org/tx/${burnTx}`} target="_blank" rel="noreferrer">{t("base.seeBurn")}</a>
      </div>
    );
  }

  return (
    <div className="card ink">
      <div className="label">{t("base.label")}</div>
      <ol className="mono" style={{ marginTop: 10, paddingLeft: 18, display: "grid", gap: 6 }}>
        <li>{t("base.step1")}</li>
        <li>{t("base.step2")}</li>
        <li>{t("base.step3")}</li>
      </ol>
      {plan ? (
        <p className="mono" style={{ marginTop: 10, opacity: 0.85 }}>
          {t("base.total", { amt: usdc(plan.burn), fee: usdc(plan.maxFee) })}
        </p>
      ) : (
        <p className="mono" style={{ marginTop: 10, opacity: 0.7 }}>{quote.isError ? t("base.noQuote") : "…"}</p>
      )}
      {onBase && balances.data && <p className="mono" style={{ marginTop: 6, opacity: 0.8 }}>{t("base.have", { amt: usdc(balances.data.balance) })}</p>}
      {onBase && balances.data && !enough && <p className="error" style={{ marginTop: 8 }}>{t("base.short")}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        {!isConnected ? (
          <span className="hint">{t("wallet.needConnect")}</span>
        ) : !onBase ? (
          <button className="btn red" onClick={() => switchChainAsync({ chainId: BASE_CHAIN_ID })}>{t("base.switch")}</button>
        ) : !approved ? (
          <button className="btn" disabled={busy || !plan || !enough} onClick={approve}>{t("base.allowBtn", { amt: plan ? usdc(plan.burn) : "…" })}</button>
        ) : (
          <button className="btn red" disabled={busy || !plan || !enough} onClick={burn}>{t("base.sendBtn", { amt: plan ? usdc(plan.burn) : "…" })}</button>
        )}
      </div>
    </div>
  );
}
