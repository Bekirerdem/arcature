import { useState } from "react";
import { decodeAbiParameters, encodeAbiParameters, isAddress, type Address, type Hex } from "viem";
import { collectiveAbi } from "../lib/abi";
import { kindIndex, ProposalKind, type ProposalKindName } from "../lib/contracts";
import { duration, pct, short, toUsdc, usdc } from "../lib/format";
import { useTx } from "../lib/tx";
import type { Chest, Proposal, Rules } from "./useChest";
import { OnArc } from "./Wallet";

const RULES_T = [{
  type: "tuple",
  components: [
    { name: "reserveBps", type: "uint16" }, { name: "reserveTarget", type: "uint256" }, { name: "autoAttributeCap", type: "uint256" },
    { name: "expenseCapPerPeriod", type: "uint256" }, { name: "quorumBps", type: "uint16" }, { name: "timelock", type: "uint32" },
    { name: "periodLength", type: "uint32" },
  ],
}] as const;

function describe(p: Proposal): string {
  const k = ProposalKind[p.kind];
  try {
    switch (k) {
      case "AddMember": return `Add ${short(decodeAbiParameters([{ type: "address" }], p.payload)[0])} as a member`;
      case "RemoveMember": return `Remove ${short(decodeAbiParameters([{ type: "address" }], p.payload)[0])}`;
      case "SetAgent": {
        const a = decodeAbiParameters([{ type: "address" }], p.payload)[0];
        return /^0x0+$/.test(a) ? "Remove the agent" : `Make ${short(a)} the agent`;
      }
      case "SetPayee": {
        const [a, ok] = decodeAbiParameters([{ type: "address" }, { type: "bool" }], p.payload);
        return ok ? `Allow bills to ${short(a)}` : `Stop bills to ${short(a)}`;
      }
      case "ReleaseReserve": {
        const [to, amt] = decodeAbiParameters([{ type: "address[]" }, { type: "uint256[]" }], p.payload);
        return `Release ${usdc(amt.reduce((s, x) => s + x, 0n))} USDC of reserve to ${to.map(short).join(", ")}`;
      }
      case "Attribute": {
        const [m, a] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], p.payload);
        return `Credit ${usdc(a)} USDC of unlabelled income to ${short(m)}`;
      }
      case "Expense": {
        const [to, a] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], p.payload);
        return `Pay ${usdc(a)} USDC to ${short(to)}`;
      }
      case "SetRules": {
        const r = decodeAbiParameters(RULES_T, p.payload)[0];
        return `New rules: reserve ${pct(r.reserveBps)} up to ${usdc(r.reserveTarget)}, pay out every ${duration(r.periodLength)}`;
      }
    }
  } catch { /* fall through */ }
  return k;
}

export function Votes({ chest, isMember, me, onChange }: { chest: Chest; isMember: boolean; me?: Address; onChange: () => void }) {
  const { send, busy } = useTx();
  const now = Math.floor(Date.now() / 1000);
  const open = chest.proposals.filter((p) => !p.executed && !p.cancelled && p.epoch === chest.governanceEpoch && now <= p.expiresAt);
  const past = chest.proposals.filter((p) => !open.includes(p)).slice(0, 6);

  const act = (label: string, fn: "vote" | "unvote" | "execute" | "cancel", id: number) =>
    send(label, { address: chest.address, abi: collectiveAbi, functionName: fn, args: [BigInt(id)] }).then((r) => r && onChange());

  return (
    <div className="card tilt-l">
      <div className="label">votes</div>
      <div className="h3" style={{ marginTop: 4 }}>Nobody moves money alone</div>
      <p className="hint" style={{ marginTop: 6 }}>More than half of members must agree, then a {duration(chest.rules.timelock)} wait.</p>

      <div className="stack" style={{ marginTop: 14 }}>
        {open.length === 0 && <p className="note muted">Nothing on the ballot.</p>}
        {open.map((p) => {
          const ready = p.votes >= p.votesNeeded && now >= p.executableAt;
          return (
            <div key={p.id} className="card no-pin" style={{ background: "var(--paper-2)", animation: "none" }}>
              <div className="between">
                <span className="mono">#{p.id} · {describe(p)}</span>
                <span className="stamp">{p.votes}/{p.votesNeeded}</span>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {now < p.executableAt ? `can run in ${duration(p.executableAt - now)}` : `open for ${duration(p.expiresAt - now)}`} · by {short(p.proposer)}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <OnArc>
                  {isMember && !p.iVoted && <button className="btn small" disabled={busy} onClick={() => act("Vote", "vote", p.id)}>Vote yes</button>}
                  {isMember && p.iVoted && <button className="btn ghost small" disabled={busy} onClick={() => act("Take back vote", "unvote", p.id)}>Take back my vote</button>}
                  {ready && <button className="btn red small" disabled={busy} onClick={() => act("Carry out", "execute", p.id)}>Carry it out</button>}
                  {me && p.proposer.toLowerCase() === me.toLowerCase() && <button className="btn ghost small" disabled={busy} onClick={() => act("Withdraw", "cancel", p.id)}>Withdraw</button>}
                </OnArc>
              </div>
            </div>
          );
        })}
      </div>

      {isMember && <Propose chest={chest} onDone={onChange} />}

      {past.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary className="label" style={{ cursor: "pointer" }}>past votes</summary>
          <ul className="mono" style={{ marginTop: 8, paddingLeft: 16, display: "grid", gap: 4 }}>
            {past.map((p) => <li key={p.id}>#{p.id} {describe(p)} — {p.executed ? "carried out" : p.cancelled ? "withdrawn" : "lapsed"}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Propose({ chest, onDone }: { chest: Chest; onDone: () => void }) {
  const { send, busy } = useTx();
  const [kind, setKind] = useState<ProposalKindName>("AddMember");
  const [addr, setAddr] = useState("");
  const [amount, setAmount] = useState("");
  const [reservePct, setReservePct] = useState(String(chest.rules.reserveBps / 100));

  let payload: Hex | null = null;
  let error = "";
  try {
    if (kind === "AddMember" || kind === "RemoveMember" || kind === "SetAgent") {
      if (!isAddress(addr.trim())) error = "Enter a wallet address.";
      else payload = encodeAbiParameters([{ type: "address" }], [addr.trim() as Address]);
    } else if (kind === "SetPayee") {
      if (!isAddress(addr.trim())) error = "Enter the address bills go to.";
      else payload = encodeAbiParameters([{ type: "address" }, { type: "bool" }], [addr.trim() as Address, true]);
    } else if (kind === "ReleaseReserve") {
      const total = toUsdc(amount || "0");
      if (total <= 0n) error = "Enter an amount.";
      else if (total > chest.reserve) error = `Reserve holds ${usdc(chest.reserve)} USDC.`;
      else {
        // split evenly between current members; remainder to the first
        const n = BigInt(chest.members.length);
        const each = total / n;
        const amts = chest.members.map((_, i) => (i === 0 ? each + (total - each * n) : each));
        payload = encodeAbiParameters([{ type: "address[]" }, { type: "uint256[]" }], [[...chest.members], amts]);
      }
    } else if (kind === "SetRules") {
      const r = Number(reservePct);
      if (!(r >= 0 && r <= 100)) error = "Reserve share must be 0–100%.";
      else {
        const next: Rules = { ...chest.rules, reserveBps: Math.round(r * 100) };
        payload = encodeAbiParameters(RULES_T, [next]);
      }
    }
  } catch {
    error = "Check the values.";
  }

  async function propose() {
    if (!payload) return;
    const ok = await send("Open vote", {
      address: chest.address,
      abi: collectiveAbi,
      functionName: "propose",
      args: [kindIndex(kind), payload, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    });
    if (ok) { setAddr(""); setAmount(""); onDone(); }
  }

  return (
    <div className="stack" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed rgba(29,26,22,.3)" }}>
      <span className="label">open a vote</span>
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ProposalKindName)}>
        <option value="AddMember">Add a member</option>
        <option value="RemoveMember">Remove a member</option>
        <option value="SetAgent">Set the agent</option>
        <option value="SetPayee">Allow a bill recipient</option>
        <option value="ReleaseReserve">Release reserve to members (equal split)</option>
        <option value="SetRules">Change reserve share</option>
      </select>
      {(kind === "AddMember" || kind === "RemoveMember" || kind === "SetAgent" || kind === "SetPayee") && (
        <input className="input" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" />
      )}
      {kind === "ReleaseReserve" && <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`up to ${usdc(chest.reserve)} USDC`} />}
      {kind === "SetRules" && <input className="input" inputMode="decimal" value={reservePct} onChange={(e) => setReservePct(e.target.value)} placeholder="reserve %" />}
      {error && <div className="error">{error}</div>}
      <OnArc><button className="btn small" disabled={!payload || busy} onClick={propose}>Put it to a vote</button></OnArc>
    </div>
  );
}
