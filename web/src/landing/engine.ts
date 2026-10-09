import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { setupCursor } from "./cursor";
import { LAND, POP, SHIFT, baseRot, clamp, type Point } from "./motion";
import { clearOdo, getOdo, makeOdo, setOdo } from "./odometer";
import { Bead, Rope, stagePoint, type Scene } from "./rope";

gsap.registerPlugin(ScrollTrigger);

type TL = gsap.core.Timeline;
type SlamOptions = { x?: number; y?: number; rot?: number; dur?: number };

// ── the board ─────────────────────────────────────────────────────────────
// Desktop is one big cork board and a camera that flies between eight scenes (no crossfades:
// pan, pull back, push in). Each scene is a 1400×900 patch of the board at a fixed spot.
const SCENE_W = 1400;
const SCENE_H = 900;
const ORDER = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const;
type SceneId = (typeof ORDER)[number];
const LAYOUT: Record<SceneId, [number, number]> = {
  s1: [0, 0],
  s2: [1720, 240],
  s3: [3440, 0],
  s4: [3440, 1260],
  s5: [1720, 1480],
  s6: [0, 1260],
  s7: [0, 2620],
  s8: [1720, 2780],
};
const WORLD_W = 3440 + SCENE_W;
const WORLD_H = 2780 + SCENE_H + 120;
/** The one red thread runs through these pins, scene to scene. */
const ANCHORS = ["#pay", "#sheet", "#job", "#agent", "#mail", "#ballot", "#st1", "#period"];
const ROPE_SCENES = ["s1", "s2", "s3"] as const;

/** Wires the landing inside `root` and returns a full cleanup (timelines, ScrollTriggers, Lenis,
 *  rAF, listeners, observers, and every DOM change it made). */
export function initLanding(root: HTMLElement): () => void {
  const q = <E extends HTMLElement = HTMLElement>(sel: string): E => {
    const el = root.querySelector<E>(sel);
    if (!el) throw new Error(`landing: missing ${sel}`);
    return el;
  };
  const qa = <E extends HTMLElement = HTMLElement>(sel: string): E[] => [...root.querySelectorAll<E>(sel)];

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lang = document.documentElement.lang === "tr" ? "tr-TR" : "en-US";
  const cleanups: Array<() => void> = [];
  let alive = true;
  let raf = 0;
  let mode: "cam" | "flow" = "flow";

  const world = q(".world");
  const track = q(".track");
  const cluster = Object.fromEntries(ORDER.map((id) => [id, q(`#${id}`)])) as Record<SceneId, HTMLElement>;

  // ── kinetic type: every big line is split into words → letters ─────────
  const kinLines = qa(".kin .kl");
  const kinHtml = kinLines.map((l) => l.innerHTML);
  kinLines.forEach((line) => {
    const words = (line.textContent ?? "").split(" ");
    line.innerHTML = "";
    words.forEach((w, i) => {
      const ws = document.createElement("span");
      ws.className = "w";
      [...w].forEach((ch) => {
        const c = document.createElement("span");
        c.className = "ch";
        c.textContent = ch;
        ws.appendChild(c);
      });
      line.appendChild(ws);
      if (i < words.length - 1) line.appendChild(document.createTextNode(" "));
    });
  });
  const chars = (scope: HTMLElement) => [...scope.querySelectorAll<HTMLElement>(".kin .ch")];

  const odos = qa(".odo");
  odos.forEach(makeOdo);

  // typed lines: shown text is a pure function of progress, so scrubbing back and forth is exact
  const typed = qa(".tl");
  const typeGroup = (els: HTMLElement[], dur: number) => {
    const total = els.reduce((a, e) => a + (e.dataset.text ?? "").length, 0);
    return value(0, total, dur, "none", (n) => {
      let left = Math.round(n);
      els.forEach((e) => {
        const t = e.dataset.text ?? "";
        const k = clamp(left, 0, t.length);
        left -= t.length;
        e.textContent = t.slice(0, k);
        e.classList.toggle("typing", k > 0 && k < t.length);
      });
    });
  };

  // live numbers from Arc: rendered at whatever progress their scene reached
  const stats = qa(".stat-num");
  const renderStat = (el: HTMLElement, p: number) => {
    el.dataset.p = String(p);
    const v = el.dataset.value;
    if (!v || p <= 0) {
      el.textContent = "—";
      return;
    }
    const dec = Number(el.dataset.dec ?? 0);
    el.textContent = (p * Number(v)).toLocaleString(lang, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  stats.forEach((el) => {
    const on = () => renderStat(el, Number(el.dataset.p ?? 0));
    el.addEventListener("keyarc:value", on);
    cleanups.push(() => el.removeEventListener("keyarc:value", on));
  });

  // ── rope scenes ─────────────────────────────────────────────────────────
  const scenes = {} as Record<(typeof ROPE_SCENES)[number], Scene>;
  ROPE_SCENES.forEach((id) => {
    const sec = cluster[id];
    const canvas = sec.querySelector<HTMLCanvasElement>("canvas.threads");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    scenes[id] = { sec, stage: sec, canvas, ctx, ropes: [], beads: [], active: false, rect: sec.getBoundingClientRect(), scale: 1 };
  });
  const S = scenes;

  const ropesOf = new Map<Element, Rope[]>();
  const tie = (sc: Scene, a: string, b: string, slack: number) => {
    const r = new Rope(sc, q(a), q(b), { slack });
    [a, b].forEach((sel) => {
      const el = q(sel);
      ropesOf.set(el, [...(ropesOf.get(el) ?? []), r]);
    });
    return r;
  };
  const r1 = [tie(S.s1, "#pay", "#mB", 1.12), tie(S.s1, "#pay", "#mO", 1.1), tie(S.s1, "#pay", "#mN", 1.14)];
  const r2notes = [tie(S.s2, "#n1", "#sheet", 1.06), tie(S.s2, "#n2", "#sheet", 1.08), tie(S.s2, "#n3", "#sheet", 1.07)];
  const trustRope = tie(S.s2, "#tB", "#tO", 1.16);
  const tInv = tie(S.s3, "#inv", "#job", 1.08);
  const tRes = tie(S.s3, "#job", "#res", 1.1);
  const tB = tie(S.s3, "#job", "#pB", 1.12);
  const tO = tie(S.s3, "#job", "#pO", 1.06);
  const bInv = new Bead(S.s3, tInv, 9, "2,000 USDC");
  const bRes = new Bead(S.s3, tRes, 4.4, lang === "tr-TR" ? "200 · yedek" : "200 · reserve");
  const bB = new Bead(S.s3, tB, 7.6, "1,080 · Bekir");
  const bO = new Bead(S.s3, tO, 6.2, "720 · Ömer");
  const beads = [bInv, bRes, bB, bO];
  const allRopes = [...r1, ...r2notes, trustRope, tInv, tRes, tB, tO];

  // the trust chip rides the middle of its thread
  const trustChip = q("#trust");
  const placeTrust = () => {
    if (mode !== "cam" || !trustRope.pts || trustRope.reveal < 0.5) {
      trustChip.style.transform = "";
      return;
    }
    const p = trustRope.pointAt(0.5);
    trustChip.style.transform = `translate(${p.x - trustChip.offsetWidth / 2}px,${p.y + 10}px)`;
  };

  // pointer + scroll speed feed the threads
  let mouse: Point | null = null;
  let scrollV = 0;
  const onMove = (e: PointerEvent) => (mouse = { x: e.clientX, y: e.clientY });
  const onLeave = () => (mouse = null);
  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  cleanups.push(() => {
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
  });

  // ── camera ──────────────────────────────────────────────────────────────
  const centerOf = (id: SceneId): Point => ({ x: LAYOUT[id][0] + SCENE_W / 2, y: LAYOUT[id][1] + SCENE_H / 2 });
  const cam = { cx: centerOf("s1").x, cy: centerOf("s1").y, z: 1, r: 0 };
  const intro = { z: 0.8 };
  const fit = () => Math.min(innerWidth / 1500, innerHeight / 960);
  let current: SceneId = "s1";
  const applyCamera = () => {
    if (mode !== "cam") return;
    const s = fit() * cam.z * intro.z;
    world.style.transform = `translate3d(${innerWidth / 2}px,${innerHeight / 2}px,0) rotate(${cam.r}deg) scale(${s}) translate3d(${-cam.cx}px,${-cam.cy}px,0)`;
    let best = Infinity;
    for (const id of ORDER) {
      const c = centerOf(id);
      const d = Math.hypot(c.x - cam.cx, c.y - cam.cy);
      if (d < best) {
        best = d;
        current = id;
      }
    }
  };

  const sizeCanvas = (sc: Scene) => {
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    const w = sc.stage.clientWidth;
    const h = sc.stage.clientHeight;
    if (sc.canvas.width !== Math.round(w * dpr) || sc.canvas.height !== Math.round(h * dpr)) {
      sc.canvas.width = Math.round(w * dpr);
      sc.canvas.height = Math.round(h * dpr);
    }
    sc.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const frame = () => {
    if (!alive) return;
    scrollV *= 0.9;
    applyCamera();
    if (mode === "cam") {
      const ci = ORDER.indexOf(current);
      for (const id of ROPE_SCENES) {
        const sc = S[id];
        sc.active = Math.abs(ORDER.indexOf(id) - ci) <= 1;
        if (!sc.active) continue;
        sc.rect = sc.stage.getBoundingClientRect();
        sc.scale = sc.rect.width / (sc.stage.offsetWidth || 1);
        sizeCanvas(sc);
        const m = mouse && !REDUCED ? { x: (mouse.x - sc.rect.left) / sc.scale, y: (mouse.y - sc.rect.top) / sc.scale } : null;
        sc.ctx.clearRect(0, 0, sc.canvas.width, sc.canvas.height);
        for (const r of sc.ropes) {
          r.step(m, scrollV);
          r.draw(sc.ctx);
        }
        for (const b of sc.beads) b.draw(sc.ctx);
      }
      placeTrust();
    }
    raf = requestAnimationFrame(frame);
  };

  // ── building blocks ─────────────────────────────────────────────────────
  /** Value tween whose onUpdate gets the current value. */
  function value(from: number, to: number, duration: number, ease: string, onUpdate: (v: number) => void) {
    const o = { v: from };
    return gsap.to(o, { v: to, duration, ease, onUpdate: () => onUpdate(o.v) });
  }
  /** Instant switch on a timeline: `true` past its midpoint, `false` before. Scrubs both ways. */
  const toggle = (onChange: (on: boolean) => void) => value(0, 1, 0.01, "none", (v) => onChange(v > 0.5));

  /** A card flies in, hits the cork, squashes, overshoots and settles; the pin is punched last. */
  const slam = (el: HTMLElement, o: SlamOptions = {}) => {
    const r = baseRot(el);
    const pin = el.querySelector(":scope > .pin");
    const tl = gsap.timeline();
    tl.fromTo(
      el,
      { x: o.x ?? 0, y: o.y ?? -340, rotation: r + (o.rot ?? gsap.utils.random(-16, 16)), scale: 1.16, autoAlpha: 0 },
      { x: 0, y: 0, rotation: r, scale: 1, autoAlpha: 1, duration: o.dur ?? 0.42, ease: LAND, immediateRender: true },
    )
      .to(el, { scaleX: 1.04, scaleY: 0.95, duration: 0.06, ease: SHIFT })
      .to(el, { scaleX: 1, scaleY: 1, duration: 0.32, ease: POP });
    if (pin)
      tl.fromTo(pin, { y: -30, scale: 2.2, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.26, ease: POP, immediateRender: true }, "<-.06");
    tl.add(() => (ropesOf.get(el) ?? []).forEach((rp) => rp.pluck(9)), "<-.2");
    return tl;
  };
  /** Letters rise out of their line, one frame apart. */
  const rise = (scope: HTMLElement, dur = 0.5) =>
    gsap.fromTo(chars(scope), { yPercent: 115, rotation: 7 }, { yPercent: 0, rotation: 0, duration: dur, ease: LAND, stagger: 0.012, immediateRender: true });
  const stampIn = (el: Element) => gsap.fromTo(el, { scale: 2.3, rotation: -30, autoAlpha: 0 }, { scale: 1, rotation: -12, autoAlpha: 1, duration: 0.3, ease: POP, immediateRender: true });

  // ── scenes (each returns its own timeline; the camera or the scroll decides when it runs) ──
  const beats: Record<Exclude<SceneId, "s1">, () => TL> = {
    s2: () => {
      const tl = gsap.timeline();
      const sheet = q("#sheet");
      const cells = qa("#sheet .cell");
      tl.add(rise(q(".s2-copy")))
        .add(slam(sheet, { y: -460, rot: -18, dur: 0.55 }), "<.15")
        .add(slam(q("#n1"), { x: 220, y: -200, rot: 22 }), "<.35")
        .add(slam(q("#n2"), { x: 240, y: 180, rot: -18 }), "<.12")
        .add(slam(q("#n3"), { y: 260, rot: 16 }), "<.12")
        .to(r2notes, { reveal: 1, duration: 0.45, ease: LAND, stagger: 0.08 }, "<.2")
        // one person edits the numbers at 02:14
        .add(value(0, 1, 1, "none", (p) => {
          cells.forEach((c, i) => {
            const a = Number(c.dataset.a);
            const b = Number(c.dataset.b);
            const wob = p > 0 && p < 1 ? Math.round(Math.sin(p * 37 + i * 2.1) * (b - a) * 0.4) : 0;
            const v = Math.round(a + (b - a) * p) + wob;
            c.textContent = c.classList.contains("money") ? v.toLocaleString(lang) : `${v}%`;
            c.classList.toggle("edited", p > 0.02 && a !== b);
          });
        }), "+=.05")
        .add(slam(q("#tB"), { x: -240, y: 60, rot: -20 }), "<.1")
        .add(slam(q("#tO"), { x: 260, y: 80, rot: 18 }), "<.1")
        .to(trustRope, { reveal: 1, duration: 0.4, ease: LAND }, "<.25")
        .fromTo(q("#trust"), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: POP, immediateRender: true }, "<.2")
        // the trust thread pulls tight, trembles, and snaps
        .to(trustRope, { taut: 1, tautTarget: 1, holdTaut: 1, duration: 0.5, ease: SHIFT }, "+=.1")
        .add(value(0, 1, 0.5, "none", (j) => (trustRope.jitter = j * 2.2)), "<")
        .to([q("#tB"), q("#tO")], { x: (i: number) => (i ? 1 : -1) * (mode === "cam" ? 26 : 8), duration: 0.5, ease: SHIFT }, "<")
        .addLabel("snap")
        .add(toggle((on) => {
          trustRope.setFree(on);
          trustRope.jitter = on ? 0 : trustRope.jitter;
          if (on) trustRope.pluck(14);
          const chip = q("#trust");
          chip.classList.toggle("snapped", on);
          chip.textContent = on ? chip.dataset.b ?? chip.textContent : chip.dataset.a ?? chip.textContent;
        }), "snap")
        .to(q("#tB"), { x: () => (mode === "cam" ? -60 : -10), rotation: "-=8", duration: 0.4, ease: LAND }, "snap")
        .to(q("#tO"), { x: () => (mode === "cam" ? 60 : 10), rotation: "+=9", duration: 0.4, ease: LAND }, "snap")
        .to(sheet, { keyframes: { rotation: [-1.5, -3.2, 0.4, -2.6, -1.5], x: [0, -5, 6, -3, 0] }, duration: 0.45, ease: "none" }, "snap");
      return tl;
    },

    s3: () => {
      const tl = gsap.timeline();
      const recv = (el: HTMLElement, rope: Rope) =>
        gsap.timeline().to(el, { scale: 1.06, duration: 0.08, ease: SHIFT }).to(el, { scale: 1, duration: 0.4, ease: POP }).add(() => rope.pluck(8), 0);
      const flow = (bead: Bead, dur: number) =>
        value(0, 1, dur, SHIFT, (t) => {
          bead.t = t;
          bead.on = t > 0 && t < 1;
        });
      const burst = q("#burst");
      tl.add(rise(q(".s3-copy")))
        .fromTo(q(".s3-copy .body"), { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: LAND, immediateRender: true }, "<.3")
        .add(slam(q("#inv"), { y: -320, rot: -18 }), "<.1")
        .add(slam(q("#job"), { x: -280, y: -40, rot: 12 }), ">-.05")
        .to(tInv, { reveal: 1, duration: 0.4, ease: LAND }, "<.2")
        .add(flow(bInv, 1))
        .add(recv(q("#job"), tInv), ">-.02")
        .fromTo(burst, { autoAlpha: 1, scale: 0.2 }, {
          scale: 1.6, autoAlpha: 0, duration: 0.5, ease: LAND,
          onStart: () => {
            const sc = S.s3;
            sc.rect = sc.stage.getBoundingClientRect();
            sc.scale = mode === "cam" ? sc.rect.width / (sc.stage.offsetWidth || 1) : 1;
            const p = stagePoint(q("#job"), sc);
            gsap.set(burst, { x: p.x, y: p.y });
          },
        }, "<")
        .add(slam(q("#res"), { y: -280, rot: 14 }), "<.05")
        .to(tRes, { reveal: 1, duration: 0.35, ease: LAND }, "<.2")
        .add(flow(bRes, 0.7))
        .add(recv(q("#res"), tRes))
        .add(value(0, 200, 0.5, LAND, (v) => setOdo(q("#resAmt"), v)), "<")
        .add(slam(q("#pB"), { y: 300, rot: -16 }), ">-.1")
        .add(slam(q("#pO"), { y: 320, rot: 16 }), "<.1")
        .to([tB, tO], { reveal: 1, duration: 0.4, ease: LAND, stagger: 0.08 }, "<.2")
        .addLabel("split")
        .add(flow(bB, 0.95), "split")
        .add(flow(bO, 1.1), "split")
        .add(recv(q("#pB"), tB), "split+=.95")
        .add(recv(q("#pO"), tO), "split+=1.1")
        .add(value(0, 1080, 0.6, LAND, (v) => setOdo(q("#bAmt"), v)), "split+=.95")
        .add(value(0, 720, 0.6, LAND, (v) => setOdo(q("#oAmt"), v)), "split+=1.1")
        .to([q("#pB"), q("#pO")], {
          boxShadow: "0 0 0 3px #ffe08a, 0 0 40px 8px rgba(255,214,110,.7), 0 14px 28px -8px rgba(40,20,5,.45)",
          duration: 0.3, ease: LAND, stagger: 0.1,
        }, "split+=1.15");
      return tl;
    },

    s4: () => {
      const tl = gsap.timeline();
      tl.add(rise(q(".s4-copy"))).add(slam(q("#agent"), { y: -380, rot: 16 }), "<.2");
      ["b1", "b2", "b3"].forEach((id, i) => {
        const bill = q(`#${id}`);
        const at = i === 0 ? ">" : ">-.05";
        tl.add(slam(bill, { x: i === 0 ? -320 : 320, y: i === 2 ? 260 : -140, rot: i % 2 ? 18 : -18 }), at)
          .fromTo(bill.querySelector(".scan"), { left: "0%", autoAlpha: 1 }, { left: "100%", duration: 0.45, ease: SHIFT, immediateRender: true })
          .set(bill.querySelector(".scan"), { autoAlpha: 0 })
          .fromTo(q(`#ck${i + 1}`), { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.3, ease: LAND, immediateRender: true }, "<")
          .add(stampIn(bill.querySelector(".paid") as Element), "<.15");
      });
      tl.fromTo(q("#agent .why"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: LAND, immediateRender: true });
      return tl;
    },

    s5: () => {
      const tl = gsap.timeline();
      const mail = q("#mail");
      tl.add(rise(q(".s5-copy")))
        .add(slam(mail, { x: -360, y: -120, rot: -14, dur: 0.5 }), "<.2")
        .add(toggle((on) => qa("#mail .sus").forEach((m) => m.classList.toggle("on", on))), "+=.1")
        .fromTo(q("#mail .alarm"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: LAND, immediateRender: true }, "<")
        .to(mail, { keyframes: { x: [0, -7, 8, -5, 4, 0], rotation: [-2, -3.4, -0.6, -2.8, -1.4, -2] }, duration: 0.4, ease: "none" }, "<")
        .add(slam(q("#anote"), { x: 300, y: -160, rot: 14 }), "<.1")
        .add(typeGroup(qa("#anote .tl"), 1.1))
        .add(stampIn(q("#heldstamp")), ">-.1")
        .add(slam(q("#term"), { y: 300, rot: 8 }), "+=.05")
        .add(typeGroup(qa("#term .tl"), 0.9))
        .to(q("#term"), { keyframes: { x: [0, 6, -6, 3, 0] }, duration: 0.25, ease: "none" }, ">-.35")
        .add(rise(q("#s5 .bigline"), 0.55), "+=.05");
      return tl;
    },

    s6: () => {
      const tl = gsap.timeline();
      const ballot = q("#ballot");
      tl.add(rise(q(".s6-copy"))).add(slam(ballot, { x: -360, y: -60, rot: -14 }), "<.2");
      qa("#ballot .vote").slice(0, 2).forEach((v, i) => {
        const splat = v.querySelector(".splat");
        const stamp = v.querySelector(".stamp");
        if (!splat || !stamp) return;
        const at = `>${i ? "-.05" : "+=.05"}`;
        tl.fromTo(splat, { scale: 0.2, autoAlpha: 0 }, { scale: 1.2, autoAlpha: 1, duration: 0.18, ease: LAND, immediateRender: true }, at)
          .to(splat, { scale: 1.05, autoAlpha: 0.55, duration: 0.28, ease: LAND })
          .add(stampIn(stamp), "<-.2")
          .to(ballot, { y: 3, duration: 0.05, ease: SHIFT }, "<.05")
          .to(ballot, { y: 0, duration: 0.2, ease: POP })
          .add(value(i, i + 1, 0.22, LAND, (n) => setOdo(q("#voteOdo"), n)), "<-.15");
      });
      const label = q("#lockLabel");
      tl.add(slam(q("#lock"), { y: 260, rot: 8 }), "+=.05")
        .fromTo(q("#lockFill"), { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "none", immediateRender: true })
        .add(toggle((on) => {
          label.textContent = (on ? label.dataset.b : label.dataset.a) ?? "";
          q("#lock").classList.toggle("ready", on);
        }), ">")
        .add(slam(q("#acap"), { x: 300, y: -120, rot: 16 }), "<.05");
      return tl;
    },

    s7: () => {
      const tl = gsap.timeline();
      tl.add(rise(q(".s7-copy")))
        .fromTo(q(".livenote"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: LAND, immediateRender: true }, "<.3");
      qa(".stats .stat").forEach((c, i) => tl.add(slam(c, { y: -300 - i * 40, rot: i % 2 ? 14 : -14 }), i ? "<.12" : ">-.1"));
      tl.add(value(0, 1, 0.9, LAND, (p) => stats.forEach((el) => renderStat(el, p))), ">-.1")
        .add(slam(q("#explorer"), { x: 260, y: 120, rot: 12 }), "<.2");
      return tl;
    },

    s8: () => {
      const tl = gsap.timeline();
      tl.add(slam(q("#closeCard"), { y: 280, rot: -9, dur: 0.55 }))
        .add(rise(q("#closeCard")), "<.25")
        .add(slam(q("#period"), { y: -280, x: 180, rot: 30 }), ">-.2")
        .fromTo(qa("#closeCard .body, #closeCard .btn"), { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: POP, stagger: 0.08, immediateRender: true }, "<.1");
      return tl;
    },
  };

  // opening: the board is dark, one payment lands in the light, the camera leans in
  const buildIntro = () => {
    const tl = gsap.timeline({ delay: 0.15 });
    tl.fromTo(intro, { z: 0.78 }, { z: 1, duration: 2.2, ease: SHIFT }, 0)
      .add(rise(q(".s1-copy"), 0.6), 0.25)
      .fromTo(q(".eyebrow"), { y: -40, rotation: -12, autoAlpha: 0 }, { y: 0, rotation: -1, autoAlpha: 1, duration: 0.45, ease: POP, immediateRender: true }, 0.35)
      .add(slam(q("#pay"), { y: -420, rot: -18, dur: 0.55 }), 0.7)
      .fromTo(q("#s1 .night"), { "--spot": "0px" }, { "--spot": "260px", duration: 0.9, ease: LAND, immediateRender: true }, 0.7);
    ["#mB", "#mO", "#mN"].forEach((s, i) => tl.add(slam(q(s), { y: -360 - i * 30 }), 1.15 + i * 0.12));
    tl.to(r1, { reveal: 1, duration: 0.6, ease: LAND, stagger: 0.1 }, ">-.25")
      .fromTo(q(".scrollhint"), { autoAlpha: 0, y: -10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: LAND, immediateRender: true }, ">");
    return tl;
  };

  // ── the one thread through every scene (desktop) ───────────────────────
  const SVGNS = "http://www.w3.org/2000/svg";
  const svg = q<HTMLElement>(".mainthread") as unknown as SVGSVGElement;
  const segs: SVGPathElement[] = [];
  const worldPoint = (el: HTMLElement): Point => {
    let x = el.offsetLeft + el.offsetWidth / 2;
    let y = el.offsetTop;
    let p = el.offsetParent as HTMLElement | null;
    while (p && p !== world) {
      x += p.offsetLeft;
      y += p.offsetTop;
      p = p.offsetParent as HTMLElement | null;
    }
    return { x, y };
  };
  const buildThread = () => {
    svg.setAttribute("viewBox", `0 0 ${WORLD_W} ${WORLD_H}`);
    svg.setAttribute("width", String(WORLD_W));
    svg.setAttribute("height", String(WORLD_H));
    const pts = ANCHORS.map((sel) => worldPoint(q(sel)));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const sag = Math.min(300, dist * 0.2);
      const d = `M${a.x},${a.y} C${a.x + (b.x - a.x) * 0.28},${a.y + (b.y - a.y) * 0.1 + sag} ${a.x + (b.x - a.x) * 0.72},${b.y - (b.y - a.y) * 0.1 + sag} ${b.x},${b.y}`;
      const shade = document.createElementNS(SVGNS, "path");
      shade.setAttribute("d", d);
      shade.setAttribute("class", "shade");
      const main = document.createElementNS(SVGNS, "path");
      main.setAttribute("d", d);
      main.setAttribute("class", "main");
      svg.append(shade, main);
      const len = main.getTotalLength();
      [shade, main].forEach((p) => {
        p.style.strokeDasharray = `${len}`;
        p.style.strokeDashoffset = `${len}`;
      });
      segs.push(main, shade);
    }
  };
  const segPair = (i: number) => [segs[i * 2], segs[i * 2 + 1]];

  // ── modes ──────────────────────────────────────────────────────────────
  let lenis: Lenis | null = null;
  let master: TL | null = null;

  const buildCamera = () => {
    mode = "cam";
    root.classList.add("cam");
    ORDER.forEach((id) => {
      cluster[id].style.left = `${LAYOUT[id][0]}px`;
      cluster[id].style.top = `${LAYOUT[id][1]}px`;
    });
    world.style.width = `${WORLD_W}px`;
    world.style.height = `${WORLD_H}px`;
    buildThread();
    applyCamera();

    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
    const l = lenis;
    l.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => l.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const tl = gsap.timeline({ paused: true });
    tl.addLabel("s1").to({}, { duration: 0.7 });
    (ORDER.slice(1) as Exclude<SceneId, "s1">[]).forEach((id, k) => {
      const i = k + 1;
      const c = centerOf(id);
      tl.addLabel(id)
        .to(cam, { cx: c.x, cy: c.y, duration: 1.1, ease: SHIFT }, id)
        .to(cam, { z: 0.6, r: i % 2 ? 0.7 : -0.7, duration: 0.55, ease: SHIFT }, id)
        .to(cam, { z: 1, r: 0, duration: 0.55, ease: SHIFT }, `${id}+=.55`)
        .to(segPair(i - 1), { strokeDashoffset: 0, duration: 1.1, ease: "none" }, id);
      if (id === "s2") tl.to(q("#s1 .night"), { autoAlpha: 0, duration: 0.6, ease: SHIFT }, id);
      tl.add(beats[id](), `${id}+=.9`).to({}, { duration: 0.45 });
    });
    track.style.height = `${Math.round(tl.duration() * 46 + 100)}vh`;
    master = tl;
    ScrollTrigger.create({
      trigger: track,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      animation: tl,
      invalidateOnRefresh: true,
    });

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      l.destroy();
      lenis = null;
      master = null;
      root.classList.remove("cam");
      ORDER.forEach((id) => {
        cluster[id].style.left = "";
        cluster[id].style.top = "";
      });
      world.style.transform = world.style.width = world.style.height = "";
      track.style.height = "";
      svg.innerHTML = "";
      segs.length = 0;
      mode = "flow";
    };
  };

  const buildFlow = () => {
    mode = "flow";
    root.classList.add("flow");
    ORDER.slice(1).forEach((id) => {
      const sub = beats[id as Exclude<SceneId, "s1">]();
      sub.pause();
      ScrollTrigger.create({ trigger: cluster[id], start: "top 78%", once: true, onEnter: () => void sub.play() });
    });
    // the thread down the left edge draws as you read (clipped: its svg is stretched to the page)
    gsap.fromTo(q(".mthread"), { clipPath: "inset(0 0 100% 0)" }, {
      clipPath: "inset(0 0 0% 0)", ease: "none",
      scrollTrigger: { trigger: root, start: "top top", end: "bottom bottom", scrub: 0.4 },
    });
    gsap.to(q("#s1 .night"), { autoAlpha: 0.15, ease: "none", scrollTrigger: { trigger: cluster.s1, start: "top top", end: "bottom top", scrub: true } });
    return () => {
      root.classList.remove("flow");
    };
  };

  const finalStates = () => {
    root.classList.add("flow", "still");
    allRopes.forEach((r) => (r.reveal = 1));
    setOdo(q("#resAmt"), 200);
    setOdo(q("#bAmt"), 1080);
    setOdo(q("#oAmt"), 720);
    setOdo(q("#voteOdo"), 2);
    typed.forEach((e) => (e.textContent = e.dataset.text ?? ""));
    qa("#sheet .cell").forEach((c) => {
      c.textContent = c.classList.contains("money") ? Number(c.dataset.b).toLocaleString(lang) : `${c.dataset.b}%`;
      c.classList.add("edited");
    });
    const chip = q("#trust");
    chip.classList.add("snapped");
    chip.textContent = chip.dataset.b ?? chip.textContent;
    qa("#mail .sus").forEach((m) => m.classList.add("on"));
    const label = q("#lockLabel");
    label.textContent = label.dataset.b ?? "";
    q("#lock").classList.add("ready");
    stats.forEach((el) => renderStat(el, 1));
  };

  // nav + scroll hint: jump to a scene (camera mode scrolls to the scene's resting point)
  qa("[data-go]").forEach((a) => {
    const go = (e: Event) => {
      const id = a.dataset.go as SceneId;
      if (!ORDER.includes(id)) return;
      e.preventDefault();
      if (mode === "cam" && master?.scrollTrigger && lenis) {
        const st = master.scrollTrigger;
        const tPos = (master.labels[id] ?? 0) + (id === "s1" ? 0 : 1.15);
        lenis.scrollTo(st.start + (tPos / master.duration()) * (st.end - st.start), { duration: 1.8 });
      } else cluster[id].scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
    };
    a.addEventListener("click", go);
    cleanups.push(() => a.removeEventListener("click", go));
  });

  // trust chip text for both states
  const chip = q("#trust");
  chip.dataset.a = chip.textContent ?? "";
  chip.dataset.b = document.documentElement.lang === "tr" ? "güven · koptu" : "trust · snapped";

  // ── wire everything ────────────────────────────────────────────────────
  const mm = gsap.matchMedia();
  const ctx = gsap.context(() => {
    qa(".card").forEach((c) => gsap.set(c, { rotation: baseRot(c) }));
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: (s) => (scrollV = s.getVelocity()) });

    qa(".card.lift").forEach((c) => {
      const enter = () => (ropesOf.get(c) ?? []).forEach((r) => (r.tautTarget = Math.max(r.tautTarget, 0.6)));
      const leave = () => (ropesOf.get(c) ?? []).forEach((r) => (r.tautTarget = r.holdTaut || 0));
      c.addEventListener("pointerenter", enter);
      c.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        c.removeEventListener("pointerenter", enter);
        c.removeEventListener("pointerleave", leave);
      });
    });
    if (matchMedia("(hover:hover) and (pointer:fine)").matches && !REDUCED) cleanups.push(setupCursor(q(".cursor")));

    if (REDUCED) {
      finalStates();
      return;
    }
    buildIntro();
  }, root);

  if (!REDUCED) {
    mm.add("(min-width:761px)", () => buildCamera());
    mm.add("(max-width:760px)", () => buildFlow());
  }

  raf = requestAnimationFrame(frame);
  const refresh = () => {
    if (alive) ScrollTrigger.refresh();
  };
  window.addEventListener("load", refresh);
  cleanups.push(() => window.removeEventListener("load", refresh));
  void document.fonts?.ready.then(refresh);

  if (import.meta.env.DEV) {
    (window as unknown as { __keyarc?: unknown }).__keyarc = {
      cam, intro, world, segs, scenes, beads, trustRope, getOdo,
      odo: (sel: string) => getOdo(q(sel)),
      mode: () => mode,
      master: () => master,
    };
  }

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    mm.revert();
    ctx.revert();
    cleanups.forEach((fn) => fn());
    beads.forEach((b) => b.remove());
    odos.forEach(clearOdo);
    typed.forEach((e) => (e.textContent = ""));
    stats.forEach((e) => {
      delete e.dataset.p;
      e.textContent = "—";
    });
    kinLines.forEach((l, i) => (l.innerHTML = kinHtml[i]));
    root.classList.remove("flow", "still", "cam");
    trustChip.style.transform = "";
    if (import.meta.env.DEV) delete (window as unknown as { __keyarc?: unknown }).__keyarc;
  };
}
