import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useConnect, useConnection, useDisconnect } from "wagmi";
import { erc20Abi } from "../lib/abi";
import { publicClient } from "../lib/arc";
import { USDC } from "../lib/contracts";
import { short, usdc } from "../lib/format";
import { useArcGuard } from "../lib/tx";

export function useUsdcBalance(address?: `0x${string}`) {
  return useQuery({
    queryKey: ["usdc", address],
    enabled: !!address,
    refetchInterval: 15_000,
    queryFn: () => publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address!] }),
  });
}

export function Wallet() {
  const { address, isConnected } = useConnection();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { onArc, switchToArc } = useArcGuard();
  const bal = useUsdcBalance(address);

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <div className="card tilt-r pin-gold">
        <div className="label">your wallet</div>
        <p className="note" style={{ margin: "8px 0 14px" }}>Pin your wallet to the board to act. Looking around works without one.</p>
        <button className="btn" disabled={!injected || isPending} onClick={() => injected && connect({ connector: injected })}>
          {isPending ? "Opening wallet…" : "Connect wallet"}
        </button>
      </div>
    );
  }
  return (
    <div className="card tilt-r pin-gold">
      <div className="between">
        <span className="label">your wallet</span>
        <button className="btn ghost small" onClick={() => disconnect()}>Unpin</button>
      </div>
      <div className="mono" style={{ marginTop: 8 }}>{short(address)}</div>
      {onArc ? (
        <div className="amount" style={{ marginTop: 6 }}>{bal.data !== undefined ? usdc(bal.data) : "…"}<small>USDC</small></div>
      ) : (
        <button className="btn red small" style={{ marginTop: 10 }} onClick={() => switchToArc()}>Switch to Arc</button>
      )}
    </div>
  );
}

/** Wraps a write button: not connected → hint, wrong chain → switch button, otherwise the button. */
export function OnArc({ children }: { children: ReactNode }) {
  const { isConnected, onArc, switchToArc } = useArcGuard();
  if (!isConnected) return <span className="hint">Connect your wallet to do this.</span>;
  if (!onArc) return <button className="btn red small" onClick={() => switchToArc()}>Switch to Arc</button>;
  return <>{children}</>;
}

export function Brand() {
  return (
    <Link className="brand" to="/">
      <b>Arcature</b>
      <span>the guild chest, onchain</span>
    </Link>
  );
}
