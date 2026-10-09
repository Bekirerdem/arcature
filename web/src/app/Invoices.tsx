import { useMemo, useState } from "react";
import { Link } from "react-router";
import { isAddress, keccak256, toHex, type Address } from "viem";
import { collectiveAbi } from "../lib/abi";
import { explorerTx } from "../lib/arc";
import { InvoiceStatus } from "../lib/contracts";
import { pct, short, toUsdc, usdc } from "../lib/format";
import { useTx } from "../lib/tx";
import type { Chest, Invoice } from "./useChest";
import { OnArc } from "./Wallet";

export function Invoices({ chest, invoices, isMember, onChange }: { chest: Chest; invoices: Invoice[]; isMember: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card tilt-r">
      <div className="between">
        <div>
          <div className="label">invoices</div>
          <div className="h3" style={{ marginTop: 4 }}>Work pinned to money</div>
        </div>
        {isMember && <button className="btn small" onClick={() => setOpen(!open)}>{open ? "Close" : "+ New invoice"}</button>}
      </div>
      {open && <NewInvoice chest={chest} onDone={() => { setOpen(false); onChange(); }} />}
      {invoices.length === 0 ? (
        <p className="note muted" style={{ marginTop: 14 }}>No invoices yet.</p>
      ) : (
        <table className="simple" style={{ marginTop: 14 }}>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{usdc(inv.amount)} USDC</td>
                <td>{inv.contributors.map((m, i) => `${short(m)} ${pct(inv.sharesBps[i])}`).join(" · ")}</td>
                <td><span className={`chip ${inv.status === 2 ? "paid" : inv.status === 1 ? "open" : ""}`}>{InvoiceStatus[inv.status].toLowerCase()}</span></td>
                <td>
                  {inv.status === 1 && <Link to={`/pay/${chest.address}/${inv.id}`}>pay link ↗</Link>}
                  {inv.paidTx && <a href={explorerTx(inv.paidTx)} target="_blank" rel="noreferrer">tx ↗</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewInvoice({ chest, onDone }: { chest: Chest; onDone: () => void }) {
  const { send, busy } = useTx();
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [rows, setRows] = useState<{ member: Address; share: string }[]>([{ member: chest.members[0], share: "100" }]);

  const total = rows.reduce((s, r) => s + (Number(r.share) || 0), 0);
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!(Number(amount) > 0)) e.push("Enter an amount.");
    if (payer.trim() && !isAddress(payer.trim())) e.push("Payer must be an address or empty (anyone can pay).");
    if (Math.abs(total - 100) > 1e-9) e.push(`Shares add up to ${total}%, need 100%.`);
    if (new Set(rows.map((r) => r.member)).size !== rows.length) e.push("A member is listed twice.");
    return e;
  }, [amount, payer, total, rows]);

  async function create() {
    const shares = rows.map((r) => Math.round(Number(r.share) * 100));
    shares[shares.length - 1] += 10_000 - shares.reduce((a, b) => a + b, 0); // absorb rounding
    const salt = keccak256(toHex(`${Date.now()}-${Math.random()}`));
    const ok = await send("Create invoice", {
      address: chest.address,
      abi: collectiveAbi,
      functionName: "createInvoice",
      args: [salt, toUsdc(amount), (payer.trim() || "0x0000000000000000000000000000000000000000") as Address, rows.map((r) => r.member), shares],
    });
    if (ok) onDone();
  }

  return (
    <div className="stack" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed rgba(29,26,22,.3)" }}>
      <div className="grid2">
        <label className="field"><span className="hint">amount (USDC)</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2000" /></label>
        <label className="field"><span className="hint">who pays (optional)</span><input className="input" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="anyone" /></label>
      </div>
      <span className="hint">who did the work, and their share — fixed before the money arrives</span>
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <select className="input" style={{ flex: 2 }} value={r.member} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, member: e.target.value as Address } : x)))}>
            {chest.members.map((m) => <option key={m} value={m}>{short(m)}</option>)}
          </select>
          <input className="input" style={{ flex: 1 }} inputMode="decimal" value={r.share} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)))} />
          <span className="mono">%</span>
          {rows.length > 1 && <button className="btn ghost small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      {rows.length < chest.members.length && (
        <button className="btn ghost small" style={{ alignSelf: "flex-start" }} onClick={() => setRows([...rows, { member: chest.members.find((m) => !rows.some((r) => r.member === m)) ?? chest.members[0], share: "0" }])}>+ Add person</button>
      )}
      {errors.length > 0 && <div className="error">{errors[0]}</div>}
      <OnArc><button className="btn" disabled={errors.length > 0 || busy} onClick={create}>{busy ? "Pinning…" : "Pin invoice"}</button></OnArc>
    </div>
  );
}
