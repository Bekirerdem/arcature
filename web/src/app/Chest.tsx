import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { isAddress, type Address } from "viem";
import { useConnection } from "wagmi";
import { collectiveAbi } from "../lib/abi";
import { explorerAddress, explorerTx } from "../lib/arc";
import { duration, pct, short, usdc } from "../lib/format";
import type { CollectiveEvent } from "../lib/logs";
import { useTx } from "../lib/tx";
import { Invoices } from "./Invoices";
import { invoicesFrom, useChest, useChestEvents, type Chest as ChestT } from "./useChest";
import { Votes } from "./Votes";
import { Brand, OnArc, Wallet } from "./Wallet";

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Chest() {
  const { address: param } = useParams();
  const address = param && isAddress(param) ? (param as Address) : undefined;
  const { address: me } = useConnection();
  const chest = useChest(address, me);
  const events = useChestEvents(address);
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["chest", address] });
    qc.invalidateQueries({ queryKey: ["chest-events", address] });
    qc.invalidateQueries({ queryKey: ["usdc"] });
  };

  if (!address) return <Missing text="That isn't a chest address." />;
  if (chest.isError) return <Missing text="Couldn't read this chest from Arc. Is the address right?" />;

  const c = chest.data;
  const isMember = !!(me && c?.members.some((m) => m.toLowerCase() === me.toLowerCase()));
  const invoices = events.data ? invoicesFrom(events.data) : [];

  return (
    <div className="board">
      <aside className="rail">
        <Brand />
        <Wallet />
        <div className="card tilt-l">
          <div className="label">members</div>
          {!c ? <div className="skeleton" style={{ marginTop: 10, height: 80 }} /> : (
            <ul className="mono" style={{ listStyle: "none", marginTop: 10, display: "grid", gap: 8 }}>
              {c.members.map((m) => (
                <li key={m} className="between">
                  <a href={explorerAddress(m)} target="_blank" rel="noreferrer">{short(m)}</a>
                  {me && m.toLowerCase() === me.toLowerCase() && <span className="chip">you</span>}
                </li>
              ))}
            </ul>
          )}
          {c && !/^0x0+$/.test(c.agent) && <p className="hint" style={{ marginTop: 12 }}>agent: {short(c.agent)}</p>}
        </div>
        <div className="card no-pin kraft tilt-r">
          <div className="label">rules</div>
          {c && (
            <ul className="mono" style={{ marginTop: 10, paddingLeft: 16, display: "grid", gap: 6 }}>
              <li>{pct(c.rules.reserveBps)} of each payment to reserve, up to {usdc(c.rules.reserveTarget)} USDC</li>
              <li>pay out every {duration(c.rules.periodLength)}</li>
              <li>votes: more than half, then {duration(c.rules.timelock)}</li>
              <li>agent limit {usdc(c.rules.autoAttributeCap)} USDC / period</li>
            </ul>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="card tape no-pin">
          <div className="label">chest · <a href={explorerAddress(address)} target="_blank" rel="noreferrer">{short(address)} ↗</a></div>
          <h1 className="title" style={{ marginTop: 6 }}>{c?.name ?? "…"}</h1>
          {!isMember && c && <p className="hint" style={{ marginTop: 8 }}>You're looking in. Only members can pin invoices or vote.</p>}
        </div>
        {c ? <Period chest={c} isMember={isMember} onChange={refresh} /> : <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>}
        {c && <Invoices chest={c} invoices={invoices} isMember={isMember} onChange={refresh} />}
      </main>

      <aside className="side">
        {c && <Votes chest={c} isMember={isMember} me={me} onChange={refresh} />}
        <Activity events={events.data} loading={events.isLoading} />
      </aside>
    </div>
  );
}

function Period({ chest, isMember, onChange }: { chest: ChestT; isMember: boolean; onChange: () => void }) {
  const now = useNow();
  const { send, busy } = useTx();
  const ends = chest.periodStart + chest.rules.periodLength;
  const over = now >= ends;
  const reserveFill = chest.rules.reserveTarget > 0n ? Number((chest.reserve * 10_000n) / chest.rules.reserveTarget) / 100 : 100;
  const max = chest.credits.reduce((m, x) => (x.credit > m ? x.credit : m), 0n);

  return (
    <>
      <div className="grid2">
        <div className="card ink tilt-l">
          <div className="label">this period's pot · #{chest.period.toString()}</div>
          <div className="amount" style={{ marginTop: 8, color: "var(--glow)" }}>{usdc(chest.pool)}<small style={{ color: "inherit", opacity: 0.7 }}>USDC</small></div>
          <p className="mono" style={{ marginTop: 10, opacity: 0.8 }}>{over ? "Period is over: ready to pay out." : `Pays out in ${duration(ends - now)}`}</p>
          <div style={{ marginTop: 14 }}>
            {(isMember || over) && (
              <OnArc>
                <button className="btn" disabled={!over || busy || !isMember} onClick={() =>
                  send("Pay out", { address: chest.address, abi: collectiveAbi, functionName: "distribute" }).then((r) => r && onChange())
                }>{busy ? "Paying out…" : "Pay out now"}</button>
              </OnArc>
            )}
          </div>
        </div>
        <div className="card tilt-r">
          <div className="label">reserve</div>
          <div className="amount" style={{ marginTop: 8 }}>{usdc(chest.reserve)}<small>of {usdc(chest.rules.reserveTarget)} USDC</small></div>
          <div className="gauge" style={{ marginTop: 14 }}><i style={{ width: `${Math.min(reserveFill, 100)}%` }} /></div>
          <p className="hint" style={{ marginTop: 10 }}>Only a vote can release it.</p>
          {chest.unattributed > 0n && <p className="mono" style={{ marginTop: 10, color: "var(--thread)" }}>{usdc(chest.unattributed)} USDC arrived without a label: the agent or a vote assigns it.</p>}
        </div>
      </div>

      <div className="card">
        <div className="between">
          <div>
            <div className="label">who brought the money in, this period</div>
            <div className="h3" style={{ marginTop: 4 }}>Shares by contribution</div>
          </div>
          {chest.owedToMe > 0n && (
            <OnArc>
              <ClaimButton chest={chest} onDone={onChange} />
            </OnArc>
          )}
        </div>
        {chest.credits.length === 0 ? (
          <p className="note muted" style={{ marginTop: 14 }}>Nothing earned yet this period. Pin an invoice and send the pay link.</p>
        ) : (
          <div className="stack" style={{ marginTop: 16 }}>
            {chest.credits.map((x) => {
              const share = chest.totalCredit > 0n ? Number((x.credit * 10_000n) / chest.totalCredit) / 100 : 0;
              const payout = chest.totalCredit > 0n ? (chest.pool * x.credit) / chest.totalCredit : 0n;
              return (
                <div key={x.member} className="bar">
                  <span>{short(x.member)}</span>
                  <span className="track"><i style={{ width: `${max > 0n ? Number((x.credit * 1000n) / max) / 10 : 0}%` }} /></span>
                  <span>{share}% · {usdc(payout)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function ClaimButton({ chest, onDone }: { chest: ChestT; onDone: () => void }) {
  const { send, busy } = useTx();
  const { address } = useConnection();
  return (
    <button className="btn red small" disabled={busy || !address} onClick={() =>
      send("Collect payout", { address: chest.address, abi: collectiveAbi, functionName: "claim", args: [address!] }).then((r) => r && onDone())
    }>Collect {usdc(chest.owedToMe)} USDC</button>
  );
}

const line = (e: CollectiveEvent): string | null => {
  const a = e.args as Record<string, unknown>;
  switch (e.eventName) {
    case "CollectiveInitialized": return "Chest opened";
    case "InvoiceCreated": return `Invoice pinned · ${usdc(a.amount as bigint)} USDC`;
    case "InvoicePaid": return `Invoice paid · ${usdc(a.amount as bigint)} USDC (${usdc(a.toReserve as bigint)} to reserve)`;
    case "InvoiceCancelled": return "Invoice cancelled";
    case "Paid": return `Paid out ${usdc(a.amount as bigint)} USDC → ${short(a.member as string)}`;
    case "PayoutDeferred": return `Payout held for ${short(a.member as string)} · ${usdc(a.amount as bigint)} USDC (collect anytime)`;
    case "Distributed": return `Period #${String(a.period)} closed · ${usdc(a.total as bigint)} USDC shared`;
    case "Attributed": return `Agent credited ${usdc(a.amount as bigint)} USDC → ${short(a.member as string)}`;
    case "ExpensePaid": return `Bill paid · ${usdc(a.amount as bigint)} USDC → ${short(a.to as string)}`;
    case "Proposed": return `Vote #${String(a.id)} opened`;
    case "Executed": return `Vote #${String(a.id)} carried out`;
    case "ReserveReleased": return `Reserve released · ${usdc(a.amount as bigint)} USDC → ${short(a.to as string)}`;
    case "Claimed": return `Collected ${usdc(a.amount as bigint)} USDC`;
    default: return null;
  }
};

function Activity({ events, loading }: { events?: CollectiveEvent[]; loading: boolean }) {
  const items = (events ?? []).map((e) => ({ e, text: line(e) })).filter((x) => x.text).reverse().slice(0, 25);
  return (
    <div className="card tilt-r pin-gold">
      <div className="label">on the record · Arc</div>
      {loading && <div className="skeleton" style={{ marginTop: 12, height: 120 }} />}
      {!loading && items.length === 0 && <p className="note muted" style={{ marginTop: 10 }}>Quiet so far.</p>}
      <div className="timeline" style={{ marginTop: 8 }}>
        {items.map(({ e, text }) => (
          <div className="ev" key={`${e.transactionHash}-${e.logIndex}`}>
            <span>{text} · <a href={explorerTx(e.transactionHash)} target="_blank" rel="noreferrer">tx ↗</a></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Missing({ text }: { text: string }) {
  return (
    <div className="board">
      <aside className="rail"><Brand /></aside>
      <main className="main"><div className="card tilt-l"><p className="note">{text}</p><Link className="btn small" style={{ marginTop: 14 }} to="/app">Back to the board</Link></div></main>
    </div>
  );
}
