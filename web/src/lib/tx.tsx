import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { BaseError, ContractFunctionRevertedError, type Hash } from "viem";
import { useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { arc, explorerTx, publicClient } from "./arc";

type Toast = { kind: "pending" | "ok" | "error"; text: string; hash?: Hash };
const ToastCtx = createContext<(t: Toast | null) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  return (
    <ToastCtx.Provider value={setToast}>
      {children}
      {toast && (
        <div className={`toast card no-pin ${toast.kind === "error" ? "" : "kraft"}`} role="status" onClick={() => setToast(null)}>
          <div className="label">{toast.kind === "pending" ? "on its way" : toast.kind === "ok" ? "done" : "didn't go through"}</div>
          <p className="mono" style={{ marginTop: 6 }}>{toast.text}</p>
          {toast.hash && (
            <a className="mono" href={explorerTx(toast.hash)} target="_blank" rel="noreferrer">view on Arc explorer ↗</a>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Is the wallet connected to Arc? Every write button uses this so a wrong chain never fails silently. */
export function useArcGuard() {
  const { address, chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const onArc = isConnected && chainId === arc.id;
  const switchToArc = useCallback(() => switchChainAsync({ chainId: arc.id }), [switchChainAsync]);
  return { address, isConnected, onArc, switchToArc };
}

/** Human-readable reason from a viem error (custom errors from the contract included). */
export function reason(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      return plainError[name] ?? (name || revert.shortMessage);
    }
    if (e.shortMessage.toLowerCase().includes("user rejected")) return "You cancelled it in the wallet.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

const plainError: Record<string, string> = {
  NotAMember: "That address isn't a member of this chest.",
  NotMemberOrAgent: "Only members can do this.",
  BadShares: "Shares must add up to 100%.",
  BadRules: "Those rules aren't allowed: more than half must vote and the wait must be at least 1 hour.",
  InvoiceNotOpen: "This invoice is already paid or cancelled.",
  WrongPayer: "This invoice is addressed to a different payer.",
  AmountMismatch: "The invoice amount changed. Reload and try again.",
  PeriodNotOver: "The period isn't over yet.",
  NoQuorum: "Not enough votes yet.",
  TimelockActive: "Still in the waiting time.",
  ProposalExpired: "This vote expired.",
  ProposalStale: "Members or rules changed since this vote opened; open a new one.",
  AlreadyVoted: "You already voted on this.",
  AboveCap: "Above the limit; it needs a vote.",
  InsufficientPool: "Not enough in this period's pot.",
  InsufficientReserve: "Not enough in the reserve.",
};

type WriteArgs = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

/** Send a contract write, wait for Arc to confirm, report through the toast. Returns the receipt or null. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const send = useCallback(
    async (label: string, args: WriteArgs) => {
      setBusy(true);
      try {
        toast({ kind: "pending", text: `${label}: confirm in your wallet…` });
        const hash = await writeContractAsync({ ...args, chainId: arc.id } as WriteArgs);
        toast({ kind: "pending", text: `${label}: waiting for Arc…`, hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted on Arc.");
        toast({ kind: "ok", text: `${label}: done.`, hash });
        return receipt;
      } catch (e) {
        toast({ kind: "error", text: `${label}: ${reason(e)}` });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [writeContractAsync, toast],
  );
  return { send, busy };
}
