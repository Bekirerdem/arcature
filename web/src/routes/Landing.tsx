import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router";
import { initLanding } from "../landing/engine";
import "../styles/landing.css";

const FACTORY_URL = "https://explorer.arc.io/address/0x8e4BB9741D40C4A48EF626f2195AF99D48eb0CC2";

type CardStyle = CSSProperties & { "--r": string };
/** Position + resting tilt for a pinned card. */
const at = (left: string | null, top: string | null, r: string, extra: CSSProperties = {}): CardStyle => ({
  ...(left ? { left } : {}),
  ...(top ? { top } : {}),
  "--r": r,
  ...extra,
});

function SheetHalf({ side }: { side: "l" | "r" }) {
  return (
    <div className={`half ${side}`} aria-hidden={side === "r" ? true : undefined}>
      <div className="tear">
        <div className="bar">
          <span>split_FINAL_v7(2).xlsx</span>
          <span>edited by Ali · 02:14</span>
        </div>
        <table>
          <tbody>
            <tr><td>Ali</td><td>web p2</td><td className="q">40% ?</td></tr>
            <tr><td>Ayşe</td><td>web p2</td><td className="x">40%</td></tr>
            <tr><td>Mehmet</td><td>api</td><td className="q">?? check</td></tr>
            <tr><td>reserve</td><td>—</td><td className="q">forgot</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Vote({ who, yes }: { who: string; yes: boolean }) {
  return (
    <div className="vote">
      {who}
      {yes && (
        <>
          <i className="splat" />
          <i className="stamp">YES</i>
        </>
      )}
    </div>
  );
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    document.body.classList.add("landing-body");
    const dispose = initLanding(el);
    return () => {
      dispose();
      document.body.classList.remove("landing-body");
    };
  }, []);

  return (
    <div className="landing" ref={root}>
      <div className="cursor" aria-hidden="true"><i className="c-needle" /><i className="c-head" /></div>

      <div className="strip">
        <div className="brand"><div className="tape" /><b>Arcature</b><span>the guild chest, onchain</span></div>
        <nav className="navcard" aria-label="Main">
          <a href="#but">Why</a>
          <a href="#so">How</a>
          <a href="#rules">Rules</a>
          <Link className="cta" to="/app">Start a chest</Link>
        </nav>
      </div>

      {/* 1 · HERO — the team earns together */}
      <section className="scene" id="hero" data-scene="hero">
        <div className="stage" id="heroStage">
          <canvas className="threads" />
          <div className="hero-copy">
            <span className="eyebrow">For teams that earn together</span>
            <h1>
              <span className="line"><span>Earn together.</span></span>
              <span className="line"><span>Split by</span></span>
              <span className="line"><span><em>the work.</em></span></span>
            </h1>
            <p className="lede">
              A shared chest on Arc. Every payment is pinned to the job that earned it, a reserve goes aside first, and the
              rest is paid out by what each person actually did.
            </p>
            <div className="btnrow">
              <Link className="btn" to="/app">Start a chest <span className="arr">→</span></Link>
              <a className="btn ghost" href="#but">See the board move <span className="arr">↓</span></a>
            </div>
          </div>

          <div className="card member hc lift" id="mAli" style={at("58vw", "16vh", "-4deg")}><i className="pin" /><div className="face">A</div><div className="name">Ali</div><div className="role">frontend</div></div>
          <div className="card member hc lift" id="mAyse" style={at("73vw", "12vh", "3deg")}><i className="pin" /><div className="face" style={{ background: "#7a2a1d" }}>Ay</div><div className="name">Ayşe</div><div className="role">design</div></div>
          <div className="card member hc lift" id="mMeh" style={at("86vw", "24vh", "-2deg")}><i className="pin" /><div className="face" style={{ background: "#2f4a3a" }}>M</div><div className="name">Mehmet</div><div className="role">contracts</div></div>
          <div className="card job hc lift" id="jWeb" style={at("61vw", "52vh", "2deg")}><i className="pin brass" /><span className="label">Job · Berlin client</span><h4>Website, phase 2</h4><div className="who"><span className="chip">Ali 60%</span><span className="chip">Ayşe 40%</span></div></div>
          <div className="card job hc lift" id="jApi" style={at("80vw", "60vh", "-3deg")}><i className="pin brass" /><span className="label">Sold to agents · x402</span><h4>Invoice parser API</h4><div className="who"><span className="chip">Mehmet 100%</span></div></div>
        </div>
      </section>

      {/* 2 · BUT — the split lives in one spreadsheet */}
      <section className="scene" id="but" data-scene="but">
        <div className="stage" id="butStage">
          <canvas className="threads" />
          <div className="card sticky bc lift" id="stA" style={at("8vw", "16vh", "-6deg")}><i className="pin" /><p className="note">"Who decided I get 40%?"</p></div>
          <div className="card sticky pink bc lift" id="stB" style={at("66vw", "10vh", "5deg")}><i className="pin" /><p className="note">Berlin client can't pay. No PayPal here. Wire is $45.</p></div>
          <div className="card sticky blue bc lift" id="stC" style={at("72vw", "44vh", "-3deg")}><i className="pin" /><p className="note">Ran out of cash in August. Nothing set aside.</p></div>
          <div className="card sheet" id="sheet" style={at("31vw", "22vh", "-1.5deg")}>
            <i className="pin" id="sheetPin" />
            <SheetHalf side="l" />
            <SheetHalf side="r" />
          </div>
          <div className="big-say but-title">But the split lives in <i>one person's</i> spreadsheet.</div>
        </div>
      </section>

      {/* 3 · SO — the chest */}
      <section className="scene" id="so" data-scene="so">
        <div className="stage" id="soStage">
          <canvas className="threads" />
          <div className="big-say so-title">So the chest does the splitting.</div>
          <div className="card invoice lift" id="inv" style={at("7vw", "12vh", "-2deg")}>
            <i className="pin" />
            <span className="label">Invoice #014 · paid from Base</span>
            <div className="row"><span className="note" style={{ fontSize: 19 }}>Berlin client</span><span className="amount">2,000 USDC</span></div>
          </div>
          <div className="card job lift" id="soJob" style={at("12vw", "42vh", "1.5deg")}><i className="pin brass" /><span className="label">Matched to</span><h4>Website, phase 2</h4><div className="who"><span className="chip">Ali 60%</span><span className="chip">Ayşe 40%</span></div></div>
          <div className="card reserve lift" id="res" style={at("38vw", "12vh", "-1deg")}><i className="pin" /><span className="label" style={{ position: "relative" }}>Reserve · first</span><span className="amount" style={{ position: "relative" }}><span className="odo" id="resAmt" data-max="200" /> USDC</span></div>
          <div className="card payee lift" id="pAli" style={at("40vw", "50vh", "-3deg")}><i className="pin" /><span className="label">Ali · 60%</span><div className="amount"><span className="odo" id="aliAmt" data-max="1080" /> USDC</div></div>
          <div className="card payee lift" id="pAyse" style={at("57vw", "55vh", "2.5deg")}><i className="pin" /><span className="label">Ayşe · 40%</span><div className="amount"><span className="odo" id="ayseAmt" data-max="720" /> USDC</div></div>
          <div className="burst" id="burst" />
          <div className="steps">
            <div className="step"><b>01</b><span>Money arrives, any chain</span></div>
            <div className="step"><b>02</b><span>Pinned to the job that earned it</span></div>
            <div className="step"><b>03</b><span>Reserve goes aside first</span></div>
            <div className="step"><b>04</b><span>The rest, split by the work</span></div>
          </div>
          <div className="ptape" id="ptape">
            <span className="label" style={{ position: "absolute", right: 18, top: -24, background: "var(--paper)", padding: "3px 8px", transform: "rotate(1deg)" }}>Period 10 · October</span>
            <div className="ticks" />
            <div className="days" />
            <span className="now" />
            <span className="flag" id="fl1" style={{ left: "7%" }}>day 02 · <b>+2,000</b> paid from Base</span>
            <span className="flag" id="fl2" style={{ left: "34%" }}>day 02 · <b>200</b> to reserve</span>
            <span className="flag" id="fl3" style={{ left: "58%" }}>day 02 · <b>1,800</b> split 60 / 40</span>
          </div>
        </div>
      </section>

      {/* 4 · RULES — vote + agent inside limits */}
      <section className="scene" id="rules" data-scene="rules">
        <div className="stage" id="rulesStage">
          <canvas className="threads" />
          <div className="big-say rules-title">Rules change by vote. The agent works inside them.</div>
          <div className="card ballot lift" id="ballot" style={at("7vw", "44vh", "-1.5deg")}>
            <i className="pin" />
            <span className="label">Proposal 07 · needs 4 of 6</span>
            <span className="tally"><span className="odo" id="voteOdo" data-max="6" />/6</span>
            <h4>Keep three months of costs in reserve</h4>
            <div className="votes">
              <Vote who="A" yes /><Vote who="Ay" yes /><Vote who="M" yes />
              <Vote who="S" yes /><Vote who="E" yes={false} /><Vote who="K" yes={false} />
            </div>
          </div>
          <div className="card sender kraft lift" id="sender" style={at("84vw", "40vh", "4deg")}><i className="pin" /><span className="label">Unknown sender</span><div className="amount">5,000 USDC</div></div>
          <div className="card agent lift" id="agent" style={at("50vw", "15vh", "2deg")}>
            <i className="pin brass" />
            <span className="label">Agent · 03:12</span>
            <p className="note" style={{ marginTop: 8 }}>5,000 USDC arrived from a sender I don't know. Above my limit, so I'm holding it. Want me to pin it to a job?</p>
          </div>
          <span className="held" id="held">HELD</span>
          <div className="card ruler" id="ruler" style={at("44vw", "58vh", "-1deg")}><i className="pin" /><span className="limitline" /><span className="needle" id="needle" /><span className="label">Agent can move per period</span><span className="limit">limit 1,500 USDC · set by vote</span></div>
          <div className="card receipt" id="receipt" style={at("7vw", "76vh", ".6deg")}>
            <i className="pin brass" />
            <div className="ln" data-text="03:12  held 5,000 USDC · unknown sender → asked members" />
            <div className="ln" data-text="03:14  paid hosting 42 USDC · allowlisted · inside limit" />
            <div className="ln" data-text="03:20  proposal 07 passed 4/6 · reserve = 3 months" />
          </div>
        </div>
      </section>

      {/* 5 · CLOSE — month end, board clears, new period */}
      <section className="close" id="start">
        <div className="card close-card lift" id="closeCard" style={at(null, null, "-.8deg")}>
          <i className="pin" />
          <div className="card period" id="periodCard" style={at(null, null, "6deg")}><i className="pin brass" /><span className="label">Period 11</span><div className="amount" style={{ marginTop: 6 }}>opens today</div></div>
          <span className="label">Month end · everyone paid · board cleared</span>
          <h2 style={{ marginTop: 18 }}>Pin your first job.</h2>
          <p>Set the reserve, add the people, send the first payment link. The chest keeps the count from there.</p>
          <div className="btnrow">
            <Link className="btn" to="/app">Start a chest <span className="arr">→</span></Link>
            <a className="btn ghost" href={FACTORY_URL} target="_blank" rel="noopener noreferrer">Read the contract <span className="arr">↗</span></a>
          </div>
        </div>
      </section>
      <footer className="foot"><span>Built on Arc · settled in USDC</span><span>Arcature · live on Arc mainnet</span></footer>
    </div>
  );
}
