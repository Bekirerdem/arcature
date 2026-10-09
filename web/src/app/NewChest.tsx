import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { isAddress, parseEventLogs, type Address } from "viem";
import { useConnection } from "wagmi";
import { factoryAbi } from "../lib/abi";
import { FACTORY } from "../lib/contracts";
import { toUsdc } from "../lib/format";
import { useLang } from "../lib/i18n";
import { useTx } from "../lib/tx";
import { Brand, OnArc, Wallet } from "./Wallet";

const PERIODS = [
  { label: "new.p1h", s: 3600 },
  { label: "new.p1w", s: 7 * 86400 },
  { label: "new.p2w", s: 14 * 86400 },
  { label: "new.p1m", s: 30 * 86400 },
];
const WAITS = [
  { label: "new.w1h", s: 3600 },
  { label: "new.w1d", s: 86400 },
  { label: "new.w3d", s: 3 * 86400 },
];

export default function NewChest() {
  const { address } = useConnection();
  const nav = useNavigate();
  const { send, busy } = useTx();
  const { t } = useLang();
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
    if (!name.trim()) e.push(t("new.err.name"));
    if (list.length === 0) e.push(t("new.err.one"));
    if (list.length > 50) e.push(t("new.err.max"));
    if (list.some((m) => !isAddress(m))) e.push(t("new.err.addr"));
    if (new Set(list.map((m) => m.toLowerCase())).size !== list.length) e.push(t("new.err.dup"));
    const r = Number(reservePct);
    if (!(r >= 0 && r <= 100)) e.push(t("new.err.reserve"));
    if (agent.trim() && !isAddress(agent.trim())) e.push(t("new.err.agent"));
    return e;
  }, [name, members, reservePct, agent, t]);

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
    const receipt = await send(t("tx.openChest"), {
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
          <div className="label">{t("new.cant")}</div>
          <ul className="mono" style={{ marginTop: 10, paddingLeft: 16, display: "grid", gap: 6 }}>
            <li>{t("new.cant1")}</li>
            <li>{t("new.cant2")}</li>
            <li>{t("new.cant3")}</li>
          </ul>
        </div>
      </aside>

      <main className="main">
        <div className="card tape no-pin">
          <div className="label">{t("new.label")}</div>
          <h1 className="title" style={{ marginTop: 6 }}>{t("new.title")}</h1>
        </div>

        <div className="card tilt-l">
          <div className="stack">
            <label className="field">
              <span className="label">{t("new.name")}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Berlin Studio Guild" />
            </label>
            <div className="field">
              <span className="label">{t("new.members")}</span>
              {members.map((m, i) => (
                <div className="row" key={i}>
                  <input className="input" style={{ flex: 1 }} value={m} placeholder="0x…" onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} />
                  {members.length > 1 && <button className="btn ghost small" onClick={() => setMembers(members.filter((_, j) => j !== i))}>{t("new.remove")}</button>}
                </div>
              ))}
              <button className="btn ghost small" style={{ alignSelf: "flex-start" }} onClick={() => setMembers([...members, ""])}>{t("new.addMember")}</button>
            </div>
          </div>
        </div>

        <div className="grid2">
          <div className="card tilt-r">
            <div className="label">{t("new.reserve")}</div>
            <p className="note" style={{ margin: "8px 0 12px" }}>{t("new.reserveBody")}</p>
            <div className="grid2">
              <label className="field"><span className="hint">{t("new.reserveShare")}</span><input className="input" inputMode="decimal" value={reservePct} onChange={(e) => setReservePct(e.target.value)} /></label>
              <label className="field"><span className="hint">{t("new.reserveTarget")}</span><input className="input" inputMode="decimal" value={reserveTarget} onChange={(e) => setReserveTarget(e.target.value)} /></label>
            </div>
          </div>
          <div className="card tilt-l">
            <div className="label">{t("new.rhythm")}</div>
            <p className="note" style={{ margin: "8px 0 12px" }}>{t("new.rhythmBody")}</p>
            <div className="grid2">
              <label className="field"><span className="hint">{t("new.every")}</span>
                <select className="input" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>{PERIODS.map((p) => <option key={p.s} value={p.s}>{t(p.label)}</option>)}</select>
              </label>
              <label className="field"><span className="hint">{t("new.wait")}</span>
                <select className="input" value={wait} onChange={(e) => setWait(Number(e.target.value))}>{WAITS.map((p) => <option key={p.s} value={p.s}>{t(p.label)}</option>)}</select>
              </label>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="label">{t("new.agent")}</div>
          <p className="note" style={{ margin: "8px 0 12px" }}>{t("new.agentBody")}</p>
          <div className="grid2">
            <label className="field"><span className="hint">{t("new.agentAddr")}</span><input className="input" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder={t("new.agentAddrPh")} /></label>
            <label className="field"><span className="hint">{t("new.agentCap")}</span><input className="input" inputMode="decimal" value={agentCap} onChange={(e) => setAgentCap(e.target.value)} /></label>
          </div>
        </div>
      </main>

      <aside className="side">
        <div className="card ink">
          <div className="label">{t("new.pin")}</div>
          {errors.length > 0 ? (
            <ul className="mono" style={{ marginTop: 10, paddingLeft: 16, display: "grid", gap: 6 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          ) : (
            <p className="mono" style={{ marginTop: 10, opacity: 0.85 }}>{t("new.ready")}</p>
          )}
          <div style={{ marginTop: 16 }}>
            <OnArc>
              <button className="btn" disabled={errors.length > 0 || busy} onClick={create}>{busy ? t("new.submitting") : t("new.submit")}</button>
            </OnArc>
          </div>
        </div>
      </aside>
    </div>
  );
}
