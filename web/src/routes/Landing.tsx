import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { formatUnits } from "viem";
import { initLanding } from "../landing/engine";
import "../landing/strings";
import { factoryAbi } from "../lib/abi";
import { explorerAddress, publicClient } from "../lib/arc";
import { FACTORY, PROOF_CHEST } from "../lib/contracts";
import { LangSwitch, useLang } from "../lib/i18n";
import { collectiveLogs } from "../lib/logs";
import "../styles/landing.css";

type CardStyle = CSSProperties & { "--r": string };
/** Position (px inside a 1400×900 scene) + resting tilt of a pinned card. */
const at = (left: number, top: number, r: number, width?: number): CardStyle => ({
  left,
  top,
  "--r": `${r}deg`,
  ...(width ? { width } : {}),
});

type Stats = { chests: number; paid: number; usdc: number; payouts: number };

/** Counts read straight from Arc: chests from the factory, flows from the proof chest's events. */
function useLiveStats() {
  const [stats, setStats] = useState<Stats | "error" | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [count, events] = await Promise.all([
          publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "count" }),
          collectiveLogs(PROOF_CHEST),
        ]);
        let paid = 0;
        let usdc = 0n;
        let payouts = 0;
        for (const e of events) {
          if (e.eventName === "InvoicePaid") {
            paid += 1;
            usdc += (e.args as { amount: bigint }).amount;
          } else if (e.eventName === "Paid") payouts += 1;
        }
        if (live) setStats({ chests: Number(count), paid, usdc: Number(formatUnits(usdc, 6)), payouts });
      } catch {
        if (live) setStats("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return stats;
}

function Stat({ value, decimals, label, id }: { value: number | undefined; decimals: number; label: string; id: string }) {
  return (
    <div className="card stat lift" id={id}>
      <i className="pin" />
      <span className="stat-num" data-value={value ?? ""} data-dec={decimals}>—</span>
      <span className="label">{label}</span>
    </div>
  );
}

/** Remounts the whole board when the language changes so every scene rebuilds from the new text. */
export default function Landing() {
  const { lang } = useLang();
  return <Board key={lang} />;
}

function Board() {
  const root = useRef<HTMLDivElement>(null);
  const { t, lang } = useLang();
  const stats = useLiveStats();

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    document.documentElement.lang = lang; // the odometers read the page language while building
    document.body.classList.add("landing-body");
    const dispose = initLanding(el);
    return () => {
      dispose();
      document.body.classList.remove("landing-body");
    };
  }, [lang]);

  // live numbers can land after their scene already played: write them at the progress reached
  useEffect(() => {
    if (!stats || stats === "error") return;
    root.current?.querySelectorAll<HTMLElement>(".stat-num").forEach((el) => {
      const p = Number(el.dataset.p ?? 0);
      if (p > 0) el.dispatchEvent(new CustomEvent("keyarc:value"));
    });
  }, [stats]);

  const s = stats && stats !== "error" ? stats : undefined;

  return (
    <div className="landing" ref={root}>
      <div className="cursor" aria-hidden="true"><i className="c-needle" /><i className="c-head" /></div>

      <header className="strip">
        <Link className="brand" to="/" aria-label="Keyarc"><div className="tape" /><b>Keyarc</b><span>{t("l.tagline")}</span></Link>
        <nav className="navcard" aria-label="Main">
          <a href="#s2" data-go="s2">{t("l.nav.why")}</a>
          <a href="#s3" data-go="s3">{t("l.nav.how")}</a>
          <a href="#s6" data-go="s6">{t("l.nav.rules")}</a>
          <a href="#s7" data-go="s7">{t("l.nav.proof")}</a>
          <Link className="cta" to="/app">{t("l.nav.open")}</Link>
          <LangSwitch className="nav-lang" />
        </nav>
      </header>

      <div className="mthread" aria-hidden="true"><svg preserveAspectRatio="none" viewBox="0 0 10 1000"><path d="M5 0 C 8 120, 2 260, 5 380 S 8 640, 5 760 S 2 920, 5 1000" /></svg></div>

      <div className="viewport">
        <div className="world">
          <svg className="mainthread" aria-hidden="true" />

          {/* 1 · opening — the money arrived */}
          <section className="cluster" id="s1" data-scene="s1" aria-label={t("l.s1.l2")}>
            <div className="night" />
            <canvas className="threads" />
            <div className="copy s1-copy">
              <span className="eyebrow">{t("l.s1.eyebrow")}</span>
              <h1 className="kin">
                <span className="kl">{t("l.s1.l1")}</span>
                <span className="kl">{t("l.s1.l2")}</span>
                <span className="kl em">{t("l.s1.l3")}</span>
              </h1>
            </div>
            <div className="card pay anchor lift" id="pay" style={at(820, 400, -2.5)}>
              <i className="pin" />
              <span className="label">{t("l.s1.payLabel")}</span>
              <div className="amount big">2,000 <small>USDC</small></div>
              <span className="note">{t("l.s1.payJob")}</span>
            </div>
            <div className="card member lift" id="mB" style={at(760, 70, -4)}><i className="pin" /><div className="face">B</div><div className="name">Bekir</div><div className="role">{t("l.role.frontend")}</div></div>
            <div className="card member lift" id="mO" style={at(960, 40, 3)}><i className="pin" /><div className="face" style={{ background: "#7a2a1d" }}>Ö</div><div className="name">Ömer</div><div className="role">{t("l.role.design")}</div></div>
            <div className="card member lift" id="mN" style={at(1160, 96, -2)}><i className="pin" /><div className="face" style={{ background: "#2f4a3a" }}>N</div><div className="name">Naim</div><div className="role">{t("l.role.contracts")}</div></div>
            <a className="scrollhint" href="#s2" data-go="s2">{t("l.scroll")} <span>↓</span></a>
          </section>

          {/* 2 · the problem — one person's spreadsheet */}
          <section className="cluster" id="s2" data-scene="s2" aria-label={t("l.s2.q3")}>
            <canvas className="threads" />
            <div className="copy s2-copy">
              <p className="q kin"><span className="kl">{t("l.s2.q1")}</span></p>
              <p className="q kin"><span className="kl">{t("l.s2.q2")}</span></p>
              <p className="q big kin"><span className="kl em">{t("l.s2.q3")}</span></p>
            </div>
            <div className="card sheet anchor" id="sheet" style={at(680, 150, -1.5, 560)}>
              <i className="pin" />
              <div className="bar"><span>{t("l.s2.file")}</span><span>{t("l.s2.edited")}</span></div>
              <table>
                <tbody>
                  <tr><td>Bekir</td><td className="cell" data-a="40" data-b="55">40%</td><td className="cell money" data-a="800" data-b="1100">800</td></tr>
                  <tr><td>Ömer</td><td className="cell" data-a="40" data-b="25">40%</td><td className="cell money" data-a="800" data-b="500">800</td></tr>
                  <tr><td>Naim</td><td className="cell" data-a="20" data-b="20">20%</td><td className="cell money" data-a="400" data-b="400">400</td></tr>
                  <tr><td>{t("l.s2.reserve")}</td><td>—</td><td className="forgot">{t("l.s2.forgot")}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="card sticky lift" id="n1" style={at(1120, 60, 5, 230)}><i className="pin" /><p className="note">{t("l.s2.n1")}</p></div>
            <div className="card sticky pink lift" id="n2" style={at(1180, 470, -4, 220)}><i className="pin" /><p className="note">{t("l.s2.n2")}</p></div>
            <div className="card sticky blue lift" id="n3" style={at(560, 600, 3, 240)}><i className="pin" /><p className="note">{t("l.s2.n3")}</p></div>
            <div className="card mini lift" id="tB" style={at(70, 690, -3)}><i className="pin" /><b>B</b></div>
            <div className="card mini lift" id="tO" style={at(380, 740, 4)}><i className="pin" /><b>Ö</b></div>
            <span className="trustchip" id="trust">{t("l.s2.trust")}</span>
          </section>

          {/* 3 · the chest */}
          <section className="cluster" id="s3" data-scene="s3" aria-label={t("l.s3.title")}>
            <canvas className="threads" />
            <div className="copy s3-copy">
              <h2 className="kin"><span className="kl">{t("l.s3.title")}</span></h2>
              <p className="body">{t("l.s3.body")}</p>
            </div>
            <div className="card invoice lift" id="inv" style={at(60, 90, -2, 300)}>
              <i className="pin" />
              <span className="label">{t("l.s3.invoice")}</span>
              <div className="row"><span className="note">{t("l.s3.client")}</span><span className="amount">2,000</span></div>
            </div>
            <div className="card job anchor lift" id="job" style={at(110, 420, 1.5, 240)}>
              <i className="pin brass" />
              <span className="label">{t("l.s3.matched")}</span>
              <h4>{t("l.s1.payJob")}</h4>
              <div className="who"><span className="chip">Bekir 60%</span><span className="chip">Ömer 40%</span></div>
            </div>
            <div className="card reserve lift" id="res" style={at(470, 110, -1, 230)}><i className="pin" /><span className="label">{t("l.s3.reserve")}</span><span className="amount"><span className="odo" id="resAmt" data-max="200" /> USDC</span></div>
            <div className="card payee lift" id="pB" style={at(500, 560, -3, 210)}><i className="pin" /><span className="label">Bekir · 60%</span><div className="amount"><span className="odo" id="bAmt" data-max="1080" /> USDC</div></div>
            <div className="card payee lift" id="pO" style={at(770, 640, 2.5, 210)}><i className="pin" /><span className="label">Ömer · 40%</span><div className="amount"><span className="odo" id="oAmt" data-max="720" /> USDC</div></div>
            <div className="burst" id="burst" />
          </section>

          {/* 4 · the agent at work */}
          <section className="cluster" id="s4" data-scene="s4" aria-label={t("l.s4.title")}>
            <div className="copy s4-copy">
              <h2 className="kin"><span className="kl">{t("l.s4.title")}</span></h2>
            </div>
            <div className="card agent anchor" id="agent" style={at(500, 320, 1, 400)}>
              <i className="pin brass" />
              <span className="label">{t("l.s4.agent")}</span>
              <p className="sub">{t("l.s4.agentSub")}</p>
              <ul className="checks">
                <li id="ck1"><b>✓</b> Figma · 15 USDC</li>
                <li id="ck2"><b>✓</b> Hetzner · 22 USDC</li>
                <li id="ck3"><b>✓</b> Selin · 300 USDC</li>
              </ul>
              <p className="why">{t("l.s4.why")}</p>
            </div>
            {[
              { id: "b1", label: t("l.s4.b1"), amt: "15", pos: at(70, 300, -3, 280) },
              { id: "b2", label: t("l.s4.b2"), amt: "22", pos: at(1040, 250, 3, 280) },
              { id: "b3", label: t("l.s4.b3"), amt: "300", pos: at(980, 620, -2, 280) },
            ].map((b) => (
              <div className="card bill lift" id={b.id} key={b.id} style={b.pos}>
                <i className="pin" />
                <span className="label">{b.label}</span>
                <div className="amount">{b.amt} <small>USDC</small></div>
                <i className="scan" />
                <i className="paid">{t("l.s4.paid")}</i>
              </div>
            ))}
          </section>

          {/* 5 · the fake bill */}
          <section className="cluster" id="s5" data-scene="s5" aria-label={t("l.s5.big.b")}>
            <div className="copy s5-copy">
              <p className="lead kin"><span className="kl">{t("l.s5.lead")}</span></p>
            </div>
            <div className="card mail anchor" id="mail" style={at(80, 210, -2, 540)}>
              <i className="pin" />
              <div className="alarm" />
              <span className="label">{t("l.s5.from")}</span>
              <h4>{t("l.s5.subject")}</h4>
              <p className="msg">
                {t("l.s5.body.a")}<mark className="sus">{t("l.s5.body.amt")}</mark>{t("l.s5.body.b")}<mark className="sus">0x9f3a…c41e</mark>.
              </p>
              <span className="heldstamp" id="heldstamp">{t("l.s5.held")}</span>
            </div>
            <div className="card agentnote" id="anote" style={at(720, 130, 1.5, 460)}>
              <i className="pin brass" />
              <span className="label">{t("l.s4.agent")}</span>
              <ul className="flags">
                <li className="tl" data-text={`✕ ${t("l.s5.flag1")}`} />
                <li className="tl" data-text={`✕ ${t("l.s5.flag2")}`} />
                <li className="tl" data-text={`✕ ${t("l.s5.flag3")}`} />
                <li className="tl verdict" data-text={`→ ${t("l.s5.verdict")}`} />
              </ul>
            </div>
            <div className="card term" id="term" style={at(720, 470, -1, 560)}>
              <i className="pin" />
              <span className="label">{t("l.s5.forced")}</span>
              <pre>
                <span className="tl" data-text="> payExpense(0x9f3a…c41e, 480 USDC)" />
                <span className="tl err" data-text={`✕ ${t("l.s5.reverted")} · NotPayee(0x9f3a…c41e)`} />
                <span className="tl dim" data-text={`  ${t("l.s5.chain")}`} />
              </pre>
            </div>
            <p className="bigline kin"><span className="kl">{t("l.s5.big.a")}</span> <span className="kl em">{t("l.s5.big.b")}</span></p>
          </section>

          {/* 6 · the rules */}
          <section className="cluster" id="s6" data-scene="s6" aria-label={t("l.s6.title")}>
            <div className="copy s6-copy">
              <h2 className="kin"><span className="kl">{t("l.s6.title")}</span></h2>
            </div>
            <div className="card ballot anchor" id="ballot" style={at(110, 360, -1.5, 420)}>
              <i className="pin" />
              <span className="label">{t("l.s6.proposal")}</span>
              <span className="tally"><span className="odo" id="voteOdo" data-max="2" />/3</span>
              <h4>{t("l.s6.raise")}</h4>
              <div className="votes">
                {["B", "Ö", "N"].map((w, i) => (
                  <div className="vote" key={w}>{w}{i < 2 && <><i className="splat" /><i className="stamp">{t("l.s6.yes")}</i></>}</div>
                ))}
              </div>
            </div>
            <div className="card lock" id="lock" style={at(640, 420, 1, 560)}>
              <i className="pin brass" />
              <span className="label" id="lockLabel" data-a={t("l.s6.wait")} data-b={t("l.s6.ready")}>{t("l.s6.wait")}</span>
              <div className="bar"><i id="lockFill" /></div>
            </div>
            <div className="card agentcap kraft" id="acap" style={at(900, 120, 3, 380)}>
              <i className="pin" />
              <span className="label">{t("l.s4.agent")}</span>
              <p className="note">{t("l.s6.agentCant")}</p>
              <p className="sub">{t("l.s6.agentCap")}</p>
            </div>
          </section>

          {/* 7 · proof, read live from Arc */}
          <section className="cluster" id="s7" data-scene="s7" aria-label={t("l.s7.title")}>
            <div className="copy s7-copy">
              <h2 className="kin"><span className="kl">{t("l.s7.title")}</span></h2>
              <p className={`livenote${s ? "" : " wait"}`}><i className="dot" />{stats === "error" ? t("l.s7.offline") : s ? t("l.s7.live") : "Arc mainnet · 5042 …"}</p>
            </div>
            <div className="stats">
              <div className="anchor-slot" id="statAnchor"><Stat id="st1" value={s?.chests} decimals={0} label={t("l.s7.chests")} /></div>
              <Stat id="st2" value={s?.paid} decimals={0} label={t("l.s7.paid")} />
              <Stat id="st3" value={s?.usdc} decimals={2} label={t("l.s7.usdc")} />
              <Stat id="st4" value={s?.payouts} decimals={0} label={t("l.s7.payouts")} />
            </div>
            <a className="card explorer lift" id="explorer" href={explorerAddress(FACTORY)} target="_blank" rel="noopener noreferrer">
              <i className="pin brass" />
              <span className="label">Arc mainnet · 5042</span>
              <span className="mono">{FACTORY.slice(0, 10)}…{FACTORY.slice(-6)}</span>
              <span className="go">{t("l.s7.explorer")} ↗</span>
            </a>
          </section>

          {/* 8 · close */}
          <section className="cluster" id="s8" data-scene="s8" aria-label={t("l.s8.l1")}>
            <div className="card close anchor" id="closeCard" style={at(160, 150, -0.8, 1080)}>
              <i className="pin" />
              <div className="card period" id="period" style={at(870, -46, 6, 220)}><i className="pin brass" /><span className="label">{t("l.s8.period")}</span><div className="amount">{t("l.s8.opens")}</div></div>
              <h2 className="kin"><span className="kl">{t("l.s8.l1")}</span><span className="kl em">{t("l.s8.l2")}</span></h2>
              <p className="body">{t("l.s8.body")}</p>
              <div className="btnrow">
                <Link className="btn" to="/app">{t("l.s8.cta")} <span className="arr">→</span></Link>
                <a className="btn ghost" href={explorerAddress(PROOF_CHEST)} target="_blank" rel="noopener noreferrer">{t("l.nav.proof")} <span className="arr">↗</span></a>
              </div>
            </div>
            <footer className="foot"><span>{t("l.foot.a")}</span><span>{t("l.foot.b")}</span></footer>
          </section>
        </div>
      </div>
      <div className="track" aria-hidden="true" />
    </div>
  );
}

