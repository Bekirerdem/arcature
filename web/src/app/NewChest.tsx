import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { isAddress, parseEventLogs, type Address } from "viem";
import { useConnection } from "wagmi";
import { factoryAbi } from "../lib/abi";
import { FACTORY } from "../lib/contracts";
import { toUsdc } from "../lib/format";
import { useTx } from "../lib/tx";
import { Brand, OnArc, Wallet } from "./Wallet";

const PERIODS = [
  { label: "1 hour (try it out)", s: 3600 },
  { label: "1 week", s: 7 * 86400 },
  { label: "2 weeks", s: 14 * 86400 },
  { label: "1 month", s: 30 * 86400 },
];
const WAITS = [
  { label: "1 hour", s: 3600 },
  { label: "1 day", s: 86400 },
  { label: "3 days", s: 3 * 86400 },
];

export default function NewChest() {
  const { address } = useConnection();
  const nav = useNavigate();
  const { send, busy } = useTx();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([""]);
  const [reservePct, setReservePct] = useState("10");
  const [reserveTarget, setReserveTarget] = useState("500");
  const [agent, setAgent] = useState("");
  const [agentCap, setAgentCap] = useState("100");
  const [period, setPeriod] = useState(30 * 86400);
  const [wait, setWait] = useState(86400);

  useEffect(() => {
    if (address) setMembers((m) => (m[0] === "" ? [address, ...m.slice(1)] : m));
  }, [address]);

  const errors = useMemo(() => {
    const e: string[] = [];
    const list = members.map((m) => m.trim()).filter(Boolean);
    if (!name.trim()) e.push("Give the chest a name.");
    if (list.length === 0) e.push("Add at least one member.");
    if (list.length > 50) e.push("At most 50 members.");
    if (list.some((m) => !isAddress(m))) e.push("Every member must be a wallet address (0x…).");
    if (new Set(list.map((m) => m.toLowerCase())).size !== list.length) e.push("A member is listed twice.");
    const r = Number(reservePct);
    if (!(r >= 0 && r <= 100)) e.push("Reserve share must be between 0 and 100%.");
    if (agent.trim() && !isAddress(agent.trim())) e.push("Agent must be a wallet address or empty.");
    return e;
  }, [name, members, reservePct, agent]);

  async function create() {
    const list = members.map((m) => m.trim()).filter(Boolean) as Address[];
    const rules = {
      reserveBps: Math.round(Number(reservePct) * 100),
      reserveTarget: toUsdc(reserveTarget),
      autoAttributeCap: toUsdc(agentCap),
      expenseCapPerPeriod: toUsdc(agentCap),
      quorumBps: 5001, // more than half; the contract refuses anything lower
      timelock: wait,
      periodLength: period,
    };
    const receipt = await send("Open chest", {
      address: FACTORY,
      abi: factoryAbi,
      functionName: "create",
      args: [name.trim(), list, rules, (agent.trim() || "0x0000000000000000000000000000000000000000") as Address],
    });
    if (!receipt) return;
    const [created] = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: "CollectiveCreated" });
    if (created) nav(`/c/${created.args.collective}`);
  }

  return (
    <div className="board">
      <aside className="rail">
        <Brand />
        <Wallet />
        <div className="card no-pin kraft tilt-l">
          <div className="label">what can't happen</div>
          <ul className="mono" style={{ marginTop: 10, paddingLeft: 16, display: "grid", gap: 6 }}>
            <li>Nobody, not even you, can take money out alone.</li>
            <li>Rules change only when more than half of the members vote, after a waiting time.</li>
            <li>The reserve leaves only by vote.</li>
          </ul>
        </div>
      </aside>

      <main className="main">
        <div className="card tape no-pin">
          <div className="label">new chest</div>
          <h1 className="title" style={{ marginTop: 6 }}>Open a chest for your team.</h1>
        </div>

        <div className="card tilt-l">
          <div className="stack">
            <label className="field">
              <span className="label">name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Berlin Studio Guild" />
            </label>
            <div className="field">
              <span className="label">members</span>
              {members.map((m, i) => (
                <div className="row" key={i}>
                  <input className="input" style={{ flex: 1 }} value={m} placeholder="0x…" onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} />
                  {members.length > 1 && <button className="btn ghost small" onClick={() => setMembers(members.filter((_, j) => j !== i))}>Remove</button>}
                </div>
              ))}
              <button className="btn ghost small" style={{ alignSelf: "flex-start" }} onClick={() => setMembers([...members, ""])}>+ Add member</button>
            </div>
          </div>
        </div>

        <div className="grid2">
          <div className="card tilt-r">
            <div className="label">reserve</div>
            <p className="note" style={{ margin: "8px 0 12px" }}>A slice of every payment goes aside until the reserve is full.</p>
            <div className="grid2">
              <label className="field"><span className="hint">share of each payment (%)</span><input className="input" inputMode="decimal" value={reservePct} onChange={(e) => setReservePct(e.target.value)} /></label>
              <label className="field"><span className="hint">fill up to (USDC)</span><input className="input" inputMode="decimal" value={reserveTarget} onChange={(e) => setReserveTarget(e.target.value)} /></label>
            </div>
          </div>
          <div className="card tilt-l">
            <div className="label">payout rhythm</div>
            <p className="note" style={{ margin: "8px 0 12px" }}>How often the pot is shared out, and how long a vote waits.</p>
            <div className="grid2">
              <label className="field"><span className="hint">pay out every</span>
                <select className="input" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>{PERIODS.map((p) => <option key={p.s} value={p.s}>{p.label}</option>)}</select>
              </label>
              <label className="field"><span className="hint">votes wait</span>
                <select className="input" value={wait} onChange={(e) => setWait(Number(e.target.value))}>{WAITS.map((p) => <option key={p.s} value={p.s}>{p.label}</option>)}</select>
              </label>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="label">agent (optional)</div>
          <p className="note" style={{ margin: "8px 0 12px" }}>An agent can match unlabelled income to a member and pay allowed bills, up to a limit each period. Anything above goes to a vote.</p>
          <div className="grid2">
            <label className="field"><span className="hint">agent address</span><input className="input" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x… or leave empty" /></label>
            <label className="field"><span className="hint">limit per period (USDC)</span><input className="input" inputMode="decimal" value={agentCap} onChange={(e) => setAgentCap(e.target.value)} /></label>
          </div>
        </div>
      </main>

      <aside className="side">
        <div className="card ink">
          <div className="label">pin it</div>
          {errors.length > 0 ? (
            <ul className="mono" style={{ marginTop: 10, paddingLeft: 16, display: "grid", gap: 6 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          ) : (
            <p className="mono" style={{ marginTop: 10, opacity: 0.85 }}>Ready. Opening a chest costs about a cent of USDC in gas on Arc.</p>
          )}
          <div style={{ marginTop: 16 }}>
            <OnArc>
              <button className="btn" disabled={errors.length > 0 || busy} onClick={create}>{busy ? "Opening…" : "Open the chest"}</button>
            </OnArc>
          </div>
        </div>
      </aside>
    </div>
  );
}
