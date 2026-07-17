import "./index.css";
import Lenis from "lenis";
import * as THREE from "three";
import { animate, spring, stagger } from "animejs";
import { bindTelemetry, clamp01, motion } from "./lib/motion.js";

/* ================================================================
   0. UTILITIES + SHARED MODULE MODEL
================================================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const pad = (n, l) => String(n).padStart(l, "0");
const SVGNS = "http://www.w3.org/2000/svg";

/* canonical module map — one source of truth for HUD, rail, registry, palette, hotkeys */
const MODULES = [
  { id: "top",        n: "00",   name: "ORIGIN",      meta: "Hero / icosa field",        hot: "g" },
  { id: "m-marquee",  n: "+B",   name: "MARQUEE",     meta: "Velocity-reactive strip",    hot: null },
  { id: "m-registry", n: "+R",   name: "REGISTRY",    meta: "System map / index",         hot: null },
  { id: "m-reveal",   n: "01",   name: "REVEAL",      meta: "Entry choreography",         hot: "1" },
  { id: "m-parallax", n: "02",   name: "PARALLAX",    meta: "Stacked drift",              hot: "2" },
  { id: "m-progress", n: "03",   name: "PROGRESS",    meta: "Sticky 0→1 dial",            hot: "3" },
  { id: "m-lerp",     n: "04",   name: "LERP",        meta: "Velocity skew",              hot: "4" },
  { id: "m-glide",    n: "05",   name: "GLIDE",       meta: "Scroll multipliers",         hot: "5" },
  { id: "m-cursor",   n: "06",   name: "CURSOR",      meta: "Local coordinates",          hot: "6" },
  { id: "m-magnetic", n: "07",   name: "MAGNETIC",    meta: "Pointer pull",               hot: "7" },
  { id: "m-spotlight",n: "08",   name: "SPOTLIGHT",   meta: "3D lit surface",             hot: "8" },
  { id: "m-webgl",    n: "+3D",  name: "WEBGL",       meta: "Torus-knot rig",             hot: "9" },
  { id: "m-impulse",  n: "09",   name: "IMPULSE",     meta: "Velocity → springs",         hot: "0" },
  { id: "m-drag",     n: "+D",   name: "DRAG",        meta: "Momentum + rest spring",     hot: null },
  { id: "m-statement",n: "+S",   name: "STATEMENT",   meta: "Pinned typographic moment",  hot: null },
  { id: "m-split",    n: "10",   name: "SPLIT",       meta: "Per-char cascade",           hot: null },
  { id: "m-mask",     n: "+M",   name: "MASK",        meta: "Clip-path wipe",             hot: null },
  { id: "m-sequence", n: "16",   name: "SEQUENCE",    meta: "00–99 frame",                hot: null },
  { id: "m-diag",     n: "14·15",name: "DIAGNOSTICS", meta: "FPS + position",             hot: null },
  { id: "m-outro",    n: "+X",   name: "TRANSMISSION",meta: "Cinematic outro",            hot: "G" },
  { id: "footer",     n: "END",  name: "END",         meta: "Transmission complete",      hot: null },
];
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (motion.lenis) motion.lenis.scrollTo(el, { offset: -46, duration: 1.25 });
  else el.scrollIntoView({ behavior: "smooth" });
};

/* ---- PORT WIPE: shutter teleport — hides the travel ---- */
let wipeBusy = false;
function wipeTransport(id) {
  const el = document.getElementById(id);
  if (!el) return Promise.resolve(false);
  if (motion.reduced || wipeBusy) {
    if (motion.lenis) motion.lenis.scrollTo(el, { offset: -46, immediate: true, force: true });
    else el.scrollIntoView();
    return Promise.resolve(true);
  }
  wipeBusy = true;
  const wipe = $("#port-wipe");
  const top = $("#wipe-top");
  const bot = $("#wipe-bot");
  const scan = $("#wipe-scan");
  wipe.classList.remove("hidden");
  if (lenis) lenis.stop(); else document.documentElement.classList.add("boot-lock");
  const jump = () => {
    if (motion.lenis) motion.lenis.scrollTo(el, { offset: -46, immediate: true, force: true });
    else { window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 46); }
  };
  return new Promise((resolve) => {
    /* panels close */
    animate(top, { y: ["-105%", "0%"], duration: 320, ease: "inOut(4)" });
    animate(bot, { y: ["105%", "0%"], duration: 320, ease: "inOut(4)" });
    animate(scan, { opacity: [0, 1], duration: 150, delay: 260 });
    /* midpoint: teleport while hidden */
    setTimeout(jump, 340);
    setTimeout(() => {
      /* scanline flicker at join */
      animate(scan, { opacity: [1, 1, 0], duration: 240, fullKeyframes: true });
      /* panels open */
      animate(top, { y: ["0%", "105%"], duration: 420, ease: "inOut(4)" });
      animate(bot, { y: ["0%", "-105%"], duration: 420, ease: "inOut(4)", onComplete: () => {
        wipe.classList.add("hidden");
        scan.style.opacity = "0";
        top.style.transform = "translateY(-105%)";
        bot.style.transform = "translateY(105%)";
        if (lenis) lenis.start(); else document.documentElement.classList.remove("boot-lock");
        wipeBusy = false;
        resolve(true);
      } });
    }, 460);
  });
}

class Spring {
  x = 0;
  v = 0;
  target = 0;
  constructor(k, d) {
    this.k = k;
    this.d = d;
  }
  step(dt) {
    this.v += (this.target - this.x) * this.k * dt;
    this.v *= Math.exp(-this.d * dt);
    this.x += this.v * dt;
  }
  get settled() {
    return Math.abs(this.v) < 0.001 && Math.abs(this.target - this.x) < 0.001;
  }
}

const SCRAMBLE_CHARS = "█▓▒<>/#*+=-";
function scramble(el, str, speed = 22) {
  if (motion.reduced) {
    el.textContent = str;
    return;
  }
  const state = { f: 0 };
  const total = str.length + 4;
  return animate(state, {
    f: total,
    duration: total * speed,
    ease: "linear",
    onUpdate: () => {
      const f = Math.floor(state.f);
      el.textContent = str
        .split("")
        .map((c, i) => (i < f - 2 ? c : c === " " ? " " : SCRAMBLE_CHARS[(i * 17 + f * 31) % SCRAMBLE_CHARS.length]))
        .join("");
    },
    onComplete: () => {
      el.textContent = str;
    },
  });
}

/* master rAF registry */
const updaters = [];
/* three.js materials that follow the theme accent */
const themedMaterials = [];
let fpsNow = 0;
let booted = false;

/* ================================================================
   1. TELEMETRY + SMOOTH SCROLL
================================================================ */

const unbind = bindTelemetry();
void unbind;
let lenis = null;

if (!motion.reduced) {
  lenis = new Lenis({ lerp: 0.105, smoothWheel: true });
  lenis.stop();
  motion.lenis = lenis;
  lenis.on("scroll", (e) => {
    motion.scrollY = e.scroll;
    motion.docProgress = clamp01(e.progress ?? e.scroll / Math.max(e.limit, 1));
    motion.velocityTarget = Math.max(-9000, Math.min(9000, e.velocity * 60));
  });
  const loop = (t) => {
    lenis.raf(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.addEventListener(
  "scroll",
  () => {
    motion.scrollY = window.scrollY;
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    motion.docProgress = clamp01(window.scrollY / Math.max(limit, 1));
  },
  { passive: true }
);

/* master loop */
let lastT = performance.now();
let frames = 0;
let fpsLast = lastT;
const sparkHistory = Array(44).fill(0);
let peakFps = 0;
function master(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  for (const u of updaters) u(dt, t / 1000);
  frames++;
  if (t - fpsLast >= 500) {
    fpsNow = Math.round((frames * 1000) / (t - fpsLast));
    frames = 0;
    fpsLast = t;
    sparkHistory.push(fpsNow);
    sparkHistory.shift();
    renderFps();
    if (fpsNow > peakFps) {
      peakFps = fpsNow;
      if (booted && peakFps >= 120 && !master.ann120) {
        master.ann120 = true;
        pushStatus("PEAK 120+ FPS — HIGH REFRESH DETECTED", "ok");
      }
      if (booted && peakFps >= 60 && !master.ann60) {
        master.ann60 = true;
        pushStatus("60 FPS LOCKED — GPU NOMINAL", "ok");
      }
    }
  }
  requestAnimationFrame(master);
}
requestAnimationFrame(master);

/* scroll milestone announcements + velocity-triggered glyph bursts */
(function scrollMilestones() {
  const marks = [25, 50, 75, 100];
  const seen = new Set();
  let lastBurst = 0;
  window.setInterval(() => {
    if (!booted) return;
    const pct = Math.round(motion.docProgress * 100);
    for (const m of marks) {
      if (pct >= m && !seen.has(m)) {
        seen.add(m);
        pushStatus(`SCROLL ${m}% · TRANSMISSION ${m === 100 ? "COMPLETE" : "IN PROGRESS"}`, m === 100 ? "ok" : "meta");
      }
    }
    const now = performance.now();
    if (Math.abs(motion.velocity) > 5000 && now - lastBurst > 1800) {
      lastBurst = now;
      window.__glyphBurst?.(10);
    }
  }, 120);
})();

/* ================================================================
   2. PRELOADER → BOOT
================================================================ */

const BOOT_LINES = [
  "STRINGREVEAL", "STRINGPARALLAX", "STRINGPROGRESS", "STRINGLERP", "STRINGGLIDE",
  "STRINGCURSOR", "STRINGMAGNETIC", "STRINGSPOTLIGHT", "LONGSTRING.GL", "STRINGIMPULSE",
  "STRINGSPLIT", "STRINGSEQUENCE", "STRINGDIAG", "WEBGL CONTEXT", "GPU BUFFERS", "RAF LOOP",
];

document.documentElement.classList.add("boot-lock");
(function preloader() {
  const pre = $("#preloader");
  const count = $("#boot-count");
  const line = $("#boot-line");
  const mod = $("#boot-mod");
  const status = $("#boot-status");
  const bar = $("#boot-bar");
  const brand = $("#boot-brand");
  const product = $("#boot-product");
  const divider = $("#boot-divider");
  let li = 0;

  /* Phase 1: brand splash entrance (RAGESTAR + STRNG UI) */
  if (!motion.reduced) {
    /* RAGESTAR title reveals */
    animate(brand, {
      opacity: [0, 1],
      y: [30, 0],
      scale: [0.92, 1],
      duration: 900,
      ease: "out(4)",
      delay: 150,
    });
    /* STRNG UI v0.1 reveals staggered */
    animate(product, {
      opacity: [0, 1],
      y: [20, 0],
      duration: 800,
      ease: "out(3)",
      delay: 500,
    });
    /* divider wipe */
    animate(divider, {
      opacity: [0, 1],
      scaleX: [0, 1],
      duration: 600,
      ease: "out(3)",
      delay: 700,
    });
  } else {
    brand.style.opacity = "1";
    product.style.opacity = "1";
    divider.style.opacity = "1";
    divider.style.transform = "scaleX(1)";
  }

  /* Phase 2: boot counter starts after brand splash settles */
  const counterDelay = motion.reduced ? 0 : 900;
  setTimeout(() => {
    const lineTick = window.setInterval(() => {
      li = (li + 1) % BOOT_LINES.length;
      line.textContent = BOOT_LINES[li];
    }, 78);

    const state = { pct: 0 };
    animate(state, {
      pct: 100,
      duration: motion.reduced ? 400 : 1400,
      ease: "out(3)",
      onUpdate: () => {
        const p = Math.round(state.pct);
        count.textContent = pad(p, 3);
        mod.textContent = pad(Math.min(16, Math.floor((p / 100) * 16) + 1), 2);
        bar.style.width = `${p}%`;
      },
      onComplete: () => {
        window.clearInterval(lineTick);
        status.textContent = "GREEN — MOUNTING";
        line.textContent = "ALL MODULES";
        window.setTimeout(() => {
          pre.classList.add("exit");
          boot();
          window.setTimeout(() => (pre.style.display = "none"), 1050);
        }, 260);
      },
    });
  }, counterDelay);
})();

const SPEC_LINES = [
  "SCROLL PROGRESS → GROUP ROTATION",
  "VELOCITY → VERTEX DISPLACEMENT",
  "POINTER → SCENE BANK / DRIFT",
  "DOC PROGRESS → PARTICLE ORBIT",
];

function boot() {
  booted = true;
  document.documentElement.classList.remove("boot-lock");
  document.body.classList.add("booted");
  lenis?.start();

  /* anime.js hero entrance — replaces the CSS transitions */
  animate("#top .w-in", {
    y: ["115%", "0%"],
    rotate: [4, 0],
    duration: 1050,
    ease: "out(4)",
    delay: stagger(90),
  });
  animate("#top .h-fade", {
    opacity: [0, 1],
    y: [18, 0],
    duration: 900,
    ease: "out(3)",
    delay: stagger(200, { start: 850 }),
  });

  pushStatus("RUNTIME MOUNTED", "ok");
  pushStatus(`${MODULES.length - 1} MODULES ONLINE`, "meta");
  pushStatus("⌘K FOR COMMANDS · ? FOR HOTKEYS", "meta");

  const spec = $("#hero-spec");
  let si = 0;
  window.setInterval(() => {
    si = (si + 1) % SPEC_LINES.length;
    scramble(spec, SPEC_LINES[si], 18);
  }, 2600);
}

/* ================================================================
   3. HUD
================================================================ */

$("#hero-res").textContent = motion.touch ? "LOW-RES" : "HI-RES";
$("#gl-dpr").textContent = motion.dpr.toFixed(1);

(function clocks() {
  const clock = $("#hud-clock");
  const up = $("#ft-uptime");
  let secs = 0;
  const tick = () => {
    const d = new Date();
    clock.textContent = `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)} UTC`;
    up.textContent = `${pad(Math.floor(secs / 60), 2)}:${pad(secs % 60, 2)}`;
    secs++;
  };
  tick();
  window.setInterval(tick, 1000);
})();

/* FIX #1: cursor reticle — proper state with tx/ty initialised */
if (!motion.touch) {
  const ret = $("#reticle");
  let retX = -100, retY = -100, targetX = -100, targetY = -100;
  window.addEventListener("pointermove", (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
  }, { passive: true });
  updaters.push(() => {
    retX += (targetX - retX) * 0.22;
    retY += (targetY - retY) * 0.22;
    ret.style.transform = `translate(${retX}px, ${retY}px)`;
  });
}

/* FPS readouts + sparkline */
const fpsHud = $("#hud-fps");
const fpsBig = $("#fps-big");
const spark = $("#fps-spark");
function renderFps() {
  fpsHud.textContent = `${pad(fpsNow, 3)} FPS`;
  fpsHud.className = `tick-label tabular-nums ${fpsNow >= 50 ? "text-acid" : fpsNow >= 28 ? "text-bone" : "text-red-400"}`;
  fpsBig.textContent = pad(fpsNow, 2);
  fpsBig.className = `font-mono text-7xl font-light tabular-nums md:text-8xl ${fpsNow >= 50 ? "text-acid" : "text-bone"}`;
  const max = Math.max(60, ...sparkHistory);
  spark.innerHTML = sparkHistory
    .map((v, i) => {
      const tone = v >= 50 ? "bg-acid/80" : v >= 28 ? "bg-bone/60" : "bg-red-400/80";
      return `<div class="spark-bar ${tone}" style="height:${Math.max(6, (v / max) * 100)}%;opacity:${0.25 + (i / sparkHistory.length) * 0.75}"></div>`;
    })
    .join("");
}

/* scroll stat readouts */
(function statsLoop() {
  const el = {
    pxl: $("#t-pxl"), pct: $("#t-pct"), vel: $("#t-vel"), dir: $("#t-dir"),
    cueLabel: $("#cue-label"), cueBar: $("#cue-bar"),
    posPxl: $("#pos-pxl"), posPct: $("#pos-pct"), posDot: $("#pos-dot"),
    posDown: $("#pos-down"), posUp: $("#pos-up"), posIdle: $("#pos-idle"),
    impV: $("#imp-v"),
    velGauge: $("#hud-vel-gauge"),
  };
  let prev = 0;
  window.setInterval(() => {
    const y = motion.scrollY;
    const pct = Math.round(motion.docProgress * 100);
    const vel = Math.round(motion.velocity);
    const dir = y > prev + 0.5 ? "DOWN" : y < prev - 0.5 ? "UP" : "IDLE";
    prev = y;
    el.pxl.textContent = pad(Math.round(y), 5);
    el.pct.textContent = `${pad(pct, 2)}%`;
    el.vel.textContent = `${vel > 0 ? "+" : ""}${vel}`;
    el.dir.textContent = dir === "IDLE" ? "·" : dir === "DOWN" ? "▼" : "▲";
    el.cueLabel.textContent = pct < 2 ? "SCROLL TO TUNE" : pct > 96 ? "END OF TRANSMISSION" : "IN MOTION";
    el.cueBar.style.width = `${pct}%`;
    el.posPxl.textContent = Math.round(y).toLocaleString();
    el.posPct.textContent = `${pct}%`;
    el.posDot.style.top = `calc(${pct}% - ${pct * 0.08}px)`;
    el.posDown.classList.toggle("hidden", dir !== "DOWN");
    el.posUp.classList.toggle("hidden", dir !== "UP");
    el.posIdle.classList.toggle("hidden", dir !== "IDLE");
    el.impV.textContent = Math.round(motion.pointerV).toLocaleString();
    if (el.velGauge) {
      const norm = Math.min(Math.abs(vel) / 6000, 1);
      el.velGauge.style.width = `${norm * 100}%`;
      el.velGauge.style.background = norm > 0.7 ? "#c8ff2e" : norm > 0.35 ? "#e6e6ea" : "#3a3a44";
    }
  }, 120);
})();

/* active module observer + rail + status console */
let currentModuleIdx = 0;
const statusQueue = [];
const statusConsole = $("#status-console");
let statusIdleTimer = 0;

function pushStatus(msg, tone = "info") {
  const tones = { info: "text-bone/80", ok: "text-acid", warn: "text-red-400", meta: "text-fog" };
  const el = document.createElement("div");
  el.className = `flex items-center gap-2 border-l-2 pl-2 py-0.5 ${
    tone === "ok" ? "border-acid" : tone === "warn" ? "border-red-400" : "border-line2"
  } ${tones[tone] || tones.info}`;
  el.innerHTML = `<span class="shrink-0 text-[9px] opacity-50">${pad(statusQueue.length + 1, 3)}</span><span class="truncate">${msg}</span>`;
  statusQueue.push(el);
  statusConsole.appendChild(el);
  statusConsole.classList.remove("hidden");
  while (statusConsole.children.length > 5) statusConsole.removeChild(statusConsole.firstChild);
  clearTimeout(statusIdleTimer);
  statusIdleTimer = setTimeout(() => {
    statusConsole.classList.add("hidden");
    statusConsole.innerHTML = "";
    statusQueue.length = 0;
  }, 4200);
}

function scrollToModuleByIndex(i) {
  const target = MODULES[Math.max(0, Math.min(MODULES.length - 1, i))];
  if (!target) return;
  scrollToId(target.id);
  pushStatus(`JUMP ${target.n} · ${target.name}`, "ok");
}

const visitedModules = new Set(["top"]); // hero counted as visited on load
window.__visitedModules = visitedModules;
(function moduleObserver() {
  const els = $$("[data-module]");
  const rail = $("#rail");
  const idxEl = $("#hud-mod-idx");
  const labelEl = $("#hud-mod-label");
  const progEl = $("#hud-mod-prog");
  $("#hud-mod-total").textContent = pad(els.length, 2);
  const ticks = els.map(() => {
    const s = document.createElement("span");
    s.className = "rail-tick";
    rail.appendChild(s);
    return s;
  });
  let activeEl = els[0];
  const setActive = (i) => {
    currentModuleIdx = i;
    activeEl = els[i];
    idxEl.textContent = pad(i + 1, 2);
    labelEl.textContent = els[i].dataset.module ?? "";
    ticks.forEach((t, ti) => t.classList.toggle("on", ti === i));
    if (els[i].id) visitedModules.add(els[i].id);
  };
  setActive(0);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(els.indexOf(e.target));
    },
    { rootMargin: "-42% 0px -50% 0px" }
  );
  els.forEach((el) => io.observe(el));
  updaters.push(() => {
    if (!activeEl) return;
    const r = activeEl.getBoundingClientRect();
    if (r.top > motion.vh || r.bottom < 0) return;
    const p = clamp01((motion.vh - r.top) / (motion.vh + r.height));
    progEl.textContent = pad(Math.round(p * 100), 3) + "%";
  });
})();

/* copy share link */
(function copyLink() {
  const btn = $("#ft-copy");
  const label = $("#ft-copy-label");
  btn.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      label.textContent = "LINK COPIED";
      pushStatus("SHARE LINK COPIED", "ok");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      label.textContent = "LINK COPIED";
      pushStatus("SHARE LINK COPIED", "ok");
    }
    setTimeout(() => (label.textContent = "COPY LINK"), 1800);
  });
})();

/* scroll reveals */
(function reveals() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  $$(".rv").forEach((el) => io.observe(el));
})();

/* ================================================================
   4. HERO WEBGL SCENE
================================================================ */

function makeRenderer(container, cameraZ) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(motion.dpr, motion.touch ? 1.5 : 1.8));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 30);
  camera.position.z = cameraZ;
  window.addEventListener("resize", () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  });
  return { renderer, scene, camera };
}

function gateVisibility(el, cb) {
  new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), { rootMargin: "160px" }).observe(el);
}

(function heroScene() {
  const holder = $("#gl-hero");
  const { renderer, scene, camera } = makeRenderer(holder, 6);
  scene.fog = new THREE.Fog(0x08080a, 7, 13);
  const group = new THREE.Group();
  scene.add(group);
  const geo = new THREE.IcosahedronGeometry(1.72, 3);
  const base = Float32Array.from(geo.attributes.position.array);
  const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xc8ff2e, wireframe: true, transparent: true, opacity: 0.62 }));
  themedMaterials.push(core.material);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe6e6ea, size: 0.028, transparent: true, opacity: 0.85, sizeAttenuation: true }));
  const occl = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x08080a, transparent: true, opacity: 0.55, depthWrite: false }));
  occl.scale.setScalar(0.985);
  group.add(core, pts, occl);
  const COUNT = motion.touch ? 420 : 900;
  const shellGeo = new THREE.BufferGeometry();
  const arr = new Float32Array(COUNT * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(2.6 + Math.random() * 3.4);
    arr[i * 3] = tmp.x; arr[i * 3 + 1] = tmp.y; arr[i * 3 + 2] = tmp.z;
  }
  shellGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  const shell = new THREE.Points(shellGeo, new THREE.PointsMaterial({ color: 0xc8ff2e, size: 0.02, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  themedMaterials.push(shell.material);
  group.add(shell);
  const mkRing = (radius, tilt, opacity) => {
    const p = [];
    for (let i = 0; i < 128; i++) { const a = (i / 128) * Math.PI * 2; p.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: 0x3a3a44, transparent: true, opacity }));
    ring.rotation.x = tilt; group.add(ring); return ring;
  };
  const ring1 = mkRing(2.65, 1.12, 0.9);
  const ring2 = mkRing(3.35, 1.45, 0.5);
  let visible = true;
  gateVisibility(holder, (v) => (visible = v));
  const pos = geo.attributes.position;
  updaters.push((dt, t) => {
    if (!visible) return;
    const v = Math.min(Math.abs(motion.velocity) / 5200, 1);
    const amp = 0.055 + v * 0.42;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
      const n = Math.sin(bx * 1.35 + t * 1.15) * Math.sin(by * 1.69 + t * 0.9) * Math.sin(bz * 1.15 + t * 0.7) + 0.5 * Math.sin(bx * 3.1 - t * 1.6) * Math.sin(by * 3.1 + t * 1.2);
      const s = 1 + amp * n; pos.setXYZ(i, bx * s, by * s, bz * s);
    }
    pos.needsUpdate = true;
    const breathe = 1 + Math.sin(t * 0.8) * 0.015 + v * 0.05;
    core.scale.setScalar(breathe); pts.scale.setScalar(breathe);
    core.rotation.z = t * 0.04; pts.rotation.z = t * 0.04;
    core.material.opacity = 0.55 + v * 0.45;
    shell.rotation.y = t * 0.02 + motion.docProgress * 0.9;
    shell.rotation.x = Math.sin(t * 0.06) * 0.12 + motion.spy * 0.15;
    shell.rotation.z += dt * Math.min(Math.abs(motion.velocity) / 24000, 0.12);
    ring1.rotation.z = t * 0.05; ring1.rotation.x = 1.12 + motion.spy * 0.1;
    ring2.rotation.z = -t * 0.035; ring2.rotation.x = 1.45 + motion.spy * 0.1;
    group.rotation.y += dt * (0.05 + Math.min(Math.abs(motion.velocity) / 6000, 1) * 0.6);
    group.rotation.x += (motion.spy * 0.42 + motion.docProgress * 0.6 - group.rotation.x) * 0.06;
    group.position.x += (motion.spx * 0.35 - group.position.x) * 0.05;
    renderer.render(scene, camera);
  });
  if (motion.reduced) renderer.render(scene, camera);
})();

/* hero dial ticks */
(function dialTicks() {
  const g = $("#dial-ticks");
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = document.createElementNS(SVGNS, "line");
    l.setAttribute("x1", String(56 + Math.cos(a) * 44)); l.setAttribute("y1", String(56 + Math.sin(a) * 44));
    l.setAttribute("x2", String(56 + Math.cos(a) * 49)); l.setAttribute("y2", String(56 + Math.sin(a) * 49));
    l.setAttribute("stroke", "#2b2b35"); l.setAttribute("stroke-width", "1.4");
    g.appendChild(l);
  }
})();

/* hero scroll parallax */
(function heroParallax() {
  const header = $("#top"); const content = $("#hero-content"); const gl = $("#hero-gl");
  updaters.push(() => {
    const r = header.getBoundingClientRect(); if (r.bottom < -100) return;
    const p = clamp01(-r.top / r.height);
    content.style.transform = `translateY(${-140 * p}px)`; content.style.opacity = String(1 - clamp01(p / 0.75));
    gl.style.transform = `scale(${1 + 0.18 * p})`;
  });
})();

/* ================================================================
   5. FIX #3: VELOCITY MARQUEES — rAF driven, no anime.js recursion
================================================================ */

$$(".vmq").forEach((wrap) => {
  const track = wrap.querySelector(".vmq-track");
  const items = (wrap.dataset.items ?? "").split("|");
  const outline = wrap.dataset.outline === "1";
  const reverse = wrap.dataset.reverse === "1";
  const baseSpeed = Number(wrap.dataset.speed ?? 110);
  const rowHtml = items.map((item) =>
    `<span class="flex items-center"><span class="whitespace-nowrap px-6 font-display text-[clamp(1.6rem,3.4vw,3rem)] font-medium uppercase tracking-tight md:px-10 ${outline ? "text-outline" : "text-bone"}">${item}</span><span class="h-2 w-2 bg-acid"></span></span>`
  ).join("");
  track.innerHTML = `<div class="vmq-row">${rowHtml}</div><div class="vmq-row" aria-hidden="true">${rowHtml}</div>`;
  let rowW = 0;
  const measure = () => (rowW = track.firstElementChild.offsetWidth);
  measure(); document.fonts?.ready.then(measure); window.addEventListener("resize", measure);
  let x = reverse ? 0 : 0;
  let initialized = false;
  updaters.push((dt) => {
    if (!rowW) return;
    if (!initialized) { initialized = true; x = reverse ? -rowW : 0; }
    if (motion.reduced) { track.style.transform = `translateX(${-rowW / 2}px)`; return; }
    const boost = Math.min(Math.abs(motion.velocity), 7000) * 0.22;
    x += (reverse ? 1 : -1) * (baseSpeed + boost) * dt;
    if (x <= -rowW) x += rowW;
    if (x > 0) x -= rowW;
    const skew = Math.max(-14, Math.min(14, motion.velocity / 320));
    track.style.transform = `translateX(${x}px) skewX(${skew}deg)`;
  });
});

/* ================================================================
   6. MODULE REGISTRY
================================================================ */

(function registry() {
  const rows = $("#reg-rows");
  const hoverLabel = $("#reg-hover");
  const regNodes = MODULES.filter((m) => !["top", "footer", "m-outro"].includes(m.id));
  regNodes.forEach((node, i) => {
    const b = document.createElement("button");
    b.className = "reg-row rv relative grid w-full grid-cols-12 items-center gap-2 border-b border-line px-5 py-4 text-left transition-colors duration-300 md:px-10 md:py-5";
    b.style.setProperty("--rvd", `${(i % 5) * 0.05}s`);
    b.innerHTML = `
      <span class="rr-idx tick-label col-span-2 text-fog md:col-span-1">${node.n}</span>
      <span class="rr-name col-span-8 font-display text-xl font-medium uppercase tracking-tight text-bone md:col-span-5 md:text-3xl">${node.name}</span>
      <span class="rr-meta tick-label col-span-4 hidden truncate text-fog md:block">${node.meta}</span>
      <span class="rr-live tick-label col-span-1 hidden items-center gap-1.5 text-fog md:flex"><span class="rr-dot h-1 w-1 bg-acid"></span>LIVE</span>
      <span class="col-span-2 flex justify-end md:col-span-1">
        <svg class="rr-arrow h-5 w-5 text-acid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7M7 7h10v10"/></svg>
      </span>`;
    b.addEventListener("mouseenter", () => { b.classList.add("hot"); hoverLabel.textContent = `→ ${node.id.replace("m-", "").toUpperCase()}`; scramble(b.querySelector(".rr-name"), node.name, 20); });
    b.addEventListener("mouseleave", () => { b.classList.remove("hot"); hoverLabel.textContent = "IDLE"; });
    b.addEventListener("click", () => { wipeTransport(node.id); pushStatus(`JUMP ${node.n} · ${node.name} · WIPE`, "ok"); });
    rows.appendChild(b);
  });
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { rootMargin: "0px 0px -6% 0px" }
  );
  $$("#reg-rows .rv").forEach((el) => io.observe(el));
})();

/* ================================================================
   7. SCROLL-DRIVEN MODULES (01–05)
================================================================ */

(function underlines() {
  const lines = $$(".rv-line"); const cards = lines.map((l) => l.closest(".rv"));
  updaters.push(() => {
    for (let i = 0; i < lines.length; i++) {
      const r = cards[i].getBoundingClientRect(); if (r.top > motion.vh || r.bottom < 0) continue;
      lines[i].style.transform = `scaleX(${clamp01((motion.vh * 0.96 - r.top) / (motion.vh * 0.48))})`;
    }
  });
})();

(function parallax() {
  const stage = $("#px-stage"); const layers = Array.from(stage.querySelectorAll("[data-px]"));
  const specs = layers.map((el) => ({ el, y0: Number(el.dataset.y0), y1: Number(el.dataset.y1), r0: el.dataset.r0 !== undefined ? Number(el.dataset.r0) : null, r1: el.dataset.r1 !== undefined ? Number(el.dataset.r1) : null }));
  updaters.push(() => {
    const r = stage.getBoundingClientRect(); if (r.top > motion.vh || r.bottom < 0) return;
    const p = clamp01((motion.vh - r.top) / (motion.vh + r.height));
    for (const s of specs) { const y = s.y0 + (s.y1 - s.y0) * p; const rot = s.r0 !== null ? ` rotate(${s.r0 + (s.r1 - s.r0) * p}deg)` : ""; s.el.style.transform = `translateY(${y}px)${rot}`; }
  });
})();

(function progressDial() {
  const wrap = $("#prog-wrap"), ring = $("#prog-ring"), pctEl = $("#prog-pct"), fill = $("#prog-fill"), arrow = $("#prog-arrow"), scale = $("#prog-scale"), degEl = $("#prog-deg"), sxEl = $("#prog-sx"), mulEl = $("#prog-mul");
  const CIRC = 753.98;
  const g = $("#prog-ticks");
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const l = document.createElementNS(SVGNS, "line"); l.setAttribute("x1", String(140 + Math.cos(a) * 104)); l.setAttribute("y1", String(140 + Math.sin(a) * 104)); l.setAttribute("x2", String(140 + Math.cos(a) * 112)); l.setAttribute("y2", String(140 + Math.sin(a) * 112)); l.setAttribute("stroke", "#2b2b35"); g.appendChild(l); }
  let smooth = 0;
  updaters.push(() => {
    const r = wrap.getBoundingClientRect(); if (r.top > motion.vh || r.bottom < 0) return;
    const raw = clamp01(-r.top / (r.height - motion.vh));
    const eased = raw < 0.5 ? 4 * raw ** 3 : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    smooth += (eased - smooth) * 0.09; const pct = Math.round(smooth * 100);
    ring.style.strokeDashoffset = String(CIRC * (1 - smooth)); pctEl.textContent = pad(pct, 3);
    fill.style.transform = `scaleX(${smooth})`; arrow.style.transform = `rotate(${smooth * 360}deg)`;
    scale.style.transform = `scale(${0.35 + 0.65 * smooth})`; degEl.textContent = String(Math.round(smooth * 360));
    sxEl.textContent = String(pct); mulEl.textContent = (0.35 + 0.65 * smooth).toFixed(2);
  });
})();

(function lerpModule() {
  const word = $("#lerp-word"), read = $("#lerp-read"), up = $("#lerp-up"), down = $("#lerp-down"), flat = $("#lerp-flat");
  let lastRead = 0;
  updaters.push((_, t) => {
    const v = motion.velocity; const skew = Math.max(-14, Math.min(14, (v / -3200) * 14));
    const shift = Math.max(-70, Math.min(70, (v / -3200) * 70));
    word.style.transform = `translateX(${shift}px) skewX(${skew}deg) scaleY(${1 + Math.min(Math.abs(v) / 9000, 0.35)})`;
    if (t - lastRead > 0.12) { lastRead = t; const rv = Math.round(v); read.textContent = `${rv > 0 ? "+" : ""}${rv.toLocaleString()} px/s`;
      down.classList.toggle("hidden", !(rv > 40)); up.classList.toggle("hidden", !(rv < -40)); flat.classList.toggle("hidden", Math.abs(rv) > 40); }
  });
})();

(function glide() {
  const grid = $("#glide-grid"), cards = $$(".glide-card"), factors = cards.map((c) => Number(c.dataset.f));
  updaters.push(() => {
    const r = grid.getBoundingClientRect(); if (r.top > motion.vh || r.bottom < 0) return;
    const p = clamp01((motion.vh - r.top) / (motion.vh + r.height));
    cards.forEach((c, i) => { c.style.transform = `translateY(${(1 - 2 * p) * 160 * factors[i]}px)`; });
  });
})();

/* ================================================================
   8. CURSOR MODULES (06–09)
================================================================ */

(function trackZone() {
  const zone = $("#track-zone"), dot = $("#track-dot"), read = $("#track-xy");
  let tx = 0, ty = 0, cx = 0, cy = 0;
  zone.addEventListener("pointermove", (e) => { const r = zone.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; read.textContent = `--x ${((tx / r.width) * 2 - 1).toFixed(2)} · --y ${((ty / r.height) * 2 - 1).toFixed(2)}`; });
  updaters.push(() => { cx += (tx - cx) * 0.24; cy += (ty - cy) * 0.24; dot.style.transform = `translate(${cx}px, ${cy}px)`; });
})();

(function pushZone() {
  const zone = $("#push-zone"), card = $("#push-card"), read = $("#push-read");
  const rx = new Spring(260, 22), ry = new Spring(260, 22);
  zone.addEventListener("pointermove", (e) => { const r = zone.getBoundingClientRect(); const nx = ((e.clientX - r.left) / r.width) * 2 - 1; const ny = ((e.clientY - r.top) / r.height) * 2 - 1; ry.target = nx * 16; rx.target = -ny * 16; read.textContent = `rx ${(-ny * 16).toFixed(0)}° · ry ${(nx * 16).toFixed(0)}°`; });
  zone.addEventListener("pointerleave", () => { rx.target = 0; ry.target = 0; read.textContent = "rx 0° · ry 0°"; });
  updaters.push((dt) => { if (rx.settled && ry.settled) return; rx.step(dt); ry.step(dt); card.style.transform = `rotateX(${rx.x}deg) rotateY(${ry.x}deg)`; });
})();

/* 07 — magnetic — anime.js spring-driven pull */
(function magnetic() {
  $$(".mag-wrap").forEach((w) => {
    const btn = w.querySelector(".mag-btn");
    const strength = Number(w.dataset.strength), radius = Number(w.dataset.radius);
    const sx = new Spring(180, 15), sy = new Spring(180, 15);
    window.addEventListener("pointermove", (e) => {
      const r = w.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < radius) { sx.target = dx * strength; sy.target = dy * strength; btn.classList.add("hot"); }
      else { sx.target = 0; sy.target = 0; btn.classList.remove("hot"); }
    }, { passive: true });
    updaters.push((dt) => { if (sx.settled && sy.settled) return; sx.step(dt); sy.step(dt); w.style.transform = `translate(${sx.x}px, ${sy.x}px)`; });
  });
})();

/* 08 — spotlight — spring tilt per card */
(function spotlight() {
  $$(".spot-tilt").forEach((tilt) => {
    const card = tilt.querySelector(".spot-card");
    const rx = new Spring(260, 22), ry = new Spring(260, 22);
    window.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect(); const lx = e.clientX - r.left; const ly = e.clientY - r.top;
      card.style.setProperty("--sx", `${lx}px`); card.style.setProperty("--sy", `${ly}px`);
      const inside = lx > -80 && ly > -80 && lx < r.width + 80 && ly < r.height + 80;
      ry.target = inside ? ((lx / r.width) * 2 - 1) * 8 : 0; rx.target = inside ? -((ly / r.height) * 2 - 1) * 8 : 0;
    }, { passive: true });
    updaters.push((dt) => { if (rx.settled && ry.settled) return; rx.step(dt); ry.step(dt); tilt.style.transform = `rotateX(${rx.x}deg) rotateY(${ry.x}deg)`; });
  });
})();

/* 09 — impulse — spring return after velocity shove */
(function impulse() {
  const zone = $("#imp-zone"), cards = $$(".imp-card");
  const specs = cards.map((c) => ({ el: c, sx: new Spring(Number(c.dataset.k), Number(c.dataset.d)), sy: new Spring(Number(c.dataset.k), Number(c.dataset.d)), sr: new Spring(Number(c.dataset.k), Number(c.dataset.d) * 0.8) }));
  let lx = 0, ly = 0, lt = 0;
  zone.addEventListener("pointermove", (e) => {
    const now = performance.now(); const dt = Math.max((now - lt) / 1000, 1 / 120);
    const vx = (e.clientX - lx) / dt; const vy = (e.clientY - ly) / dt; const v = Math.hypot(vx, vy);
    lx = e.clientX; ly = e.clientY; lt = now; if (v < 240) return;
    specs.forEach((s) => {
      const rct = s.el.getBoundingClientRect(); const d = Math.hypot(e.clientX - (rct.left + rct.width / 2), e.clientY - (rct.top + rct.height / 2));
      if (d > 300) return; const fall = 1 - d / 300; const mag = Math.min(v / 90, 34) * fall;
      s.sx.x += (vx / v) * mag; s.sy.x += (vy / v) * mag; s.sr.x += (vx / v) * mag * 0.35;
      s.sx.target = 0; s.sy.target = 0; s.sr.target = 0;
    });
  });
  updaters.push((dt) => { for (const s of specs) { if (s.sx.settled && s.sy.settled && s.sr.settled) continue; s.sx.step(dt); s.sy.step(dt); s.sr.step(dt); s.el.style.transform = `translate(${s.sx.x}px, ${s.sy.x}px) rotate(${s.sr.x}deg)`; } });
})();

/* ================================================================
   9. WEBGL SECTION (+3D orbit engine)
================================================================ */

(function orbitScene() {
  const holder = $("#gl-orbit"); const { renderer, scene, camera } = makeRenderer(holder, 6.4);
  scene.fog = new THREE.Fog(0x08080a, 6, 12); const rig = new THREE.Group(); scene.add(rig);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.05, 0.34, 220, 26), new THREE.MeshBasicMaterial({ color: 0xc8ff2e, wireframe: true, transparent: true, opacity: 0.6 }));
  themedMaterials.push(knot.material);
  rig.add(knot);
  const satGeo = new THREE.OctahedronGeometry(0.14, 0); const sats = [];
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(satGeo, new THREE.MeshBasicMaterial({ color: 0xe6e6ea, wireframe: true, transparent: true, opacity: 0.9 })); rig.add(m); sats.push(m); }
  let progress = 0; let visible = false;
  gateVisibility(holder, (v) => (visible = v));
  const stage = $("#webgl-stage"), secEl = $("#gl-sec"), velEl = $("#gl-vel"); let lastRead = 0;
  updaters.push((dt, t) => {
    const r = stage.getBoundingClientRect();
    if (r.top < motion.vh && r.bottom > 0) { progress = clamp01((motion.vh - r.top) / (motion.vh + r.height)); if (t - lastRead > 0.12) { lastRead = t; secEl.textContent = `${pad(Math.round(progress * 100), 3)}%`; const rv = Math.round(motion.velocity); velEl.textContent = `${rv > 0 ? "+" : ""}${rv}`; } }
    if (!visible) return;
    const v = Math.min(Math.abs(motion.velocity) / 5000, 1);
    rig.rotation.y += dt * (0.08 + v * 0.5); rig.rotation.x += (progress * Math.PI + motion.spy * 0.3 - rig.rotation.x) * 0.07;
    rig.rotation.z += (motion.spx * 0.25 - rig.rotation.z) * 0.06; knot.rotation.x = t * 0.16;
    knot.material.opacity = 0.35 + progress * 0.45 + v * 0.2;
    for (let i = 0; i < 3; i++) { const a = t * (0.35 + i * 0.17) + progress * Math.PI * 2 + (i * Math.PI * 2) / 3; const rad = 2.1 + i * 0.36; sats[i].position.set(Math.cos(a) * rad, Math.sin(a * 1.3) * (0.5 + v * 0.9), Math.sin(a) * rad); sats[i].rotation.x = a * 1.4; sats[i].rotation.y = a; }
    renderer.render(scene, camera);
  });
  if (motion.reduced) renderer.render(scene, camera);
})();

/* ================================================================
   10. FIX #5/#6: SPLIT + OUTRO — manual char splitting (no anime.js text.split)
================================================================ */

function buildChars(container, selector) {
  const lines = Array.from(container.querySelectorAll(selector));
  const allChars = [];
  let total = 0;
  lines.forEach((line) => {
    const txt = line.dataset.split ?? "";
    total += txt.length;
    line.innerHTML = txt.split("").map((ch) => {
      if (ch === " ") return '<span class="ch sp">&nbsp;</span>';
      return `<span class="ch">${ch}</span>`;
    }).join("");
    Array.from(line.querySelectorAll(".ch")).forEach((c) => allChars.push(c));
  });
  return { allChars, total };
}

function playCharCascade(chars, opts = {}) {
  const { dur = 750, ease = "out(4)", del = 20 } = opts;
  /* reset first */
  chars.forEach((ch) => { ch.style.transform = "translateY(112%)"; ch.style.opacity = "0"; });
  /* small delay to let reset paint */
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      animate(chars, {
        y: [112, 0],
        opacity: [0, 1],
        rotate: [() => (Math.random() * 20 - 10), 0],
        duration: dur,
        ease,
        delay: stagger(del),
        onComplete: resolve,
      });
    });
  });
}

function resetChars(chars) {
  chars.forEach((ch) => { ch.style.transform = "translateY(112%)"; ch.style.opacity = "0"; });
}

/* split module */
(function splitModule() {
  const head = $("#split-head"), stage = $("#split-stage");
  const { allChars, total } = buildChars(head, ".split-line");
  $("#split-count").textContent = String(total);
  resetChars(allChars);
  let playing = false;
  new IntersectionObserver(
    (es) => es.forEach((e) => {
      if (e.isIntersecting && !playing) { playing = true; playCharCascade(allChars).then(() => (playing = false)); }
      else if (!e.isIntersecting) { playing = false; resetChars(allChars); }
    }),
    { rootMargin: "-18% 0px" }
  ).observe(stage);
  $("#split-replay").addEventListener("click", () => { resetChars(allChars); playing = true; playCharCascade(allChars).then(() => (playing = false)); });
})();

/* sequence */
(function sequence() {
  const wrap = $("#seq-wrap"), frameEl = $("#seq-frame"), ring = $("#seq-ring"), bar = $("#seq-bar"), pctEl = $("#seq-pct"), steps = $$(".seq-step");
  const RING = 565.49; let lastFrame = -1;
  updaters.push(() => {
    const r = wrap.getBoundingClientRect(); if (r.top > motion.vh || r.bottom < 0) return;
    const p = clamp01(-r.top / (r.height - motion.vh)); const frame = Math.min(99, Math.floor(p * 100));
    if (frame === lastFrame) return; lastFrame = frame;
    frameEl.textContent = pad(frame, 2); ring.style.strokeDashoffset = String(RING * (1 - frame / 99));
    bar.style.width = `${frame}%`; pctEl.textContent = String(frame);
    const active = frame === 0 ? 0 : Math.min(8, Math.floor((frame / 100) * 8) + 1);
    steps.forEach((s, i) => s.classList.toggle("lit", i < active));
  });
})();

/* ================================================================
   11. FOOTER
================================================================ */

$("#ft-top").addEventListener("click", () => {
  pushStatus("RETURNING TO ORIGIN · WIPE", "ok");
  wipeTransport("top");
});

/* ================================================================
   12. PERSISTENT SHADER BACKGROUND LAYER
================================================================ */

(function shaderLayer() {
  const host = $("#fx-layer");
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(motion.dpr, motion.touch ? 1.25 : 1.5));
  const setSize = () => renderer.setSize(window.innerWidth, window.innerHeight);
  setSize(); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }, uMouse: { value: new THREE.Vector2(0, 0) }, uVel: { value: 0 }, uProg: { value: 0 }, uOver: { value: 0 }, uAcid: { value: new THREE.Color(0.784, 1.0, 0.18) } },
    vertexShader: `void main(){gl_Position=vec4(position,1.0);}`,
    fragmentShader: `precision mediump float;uniform float uTime;uniform vec2 uRes;uniform vec2 uMouse;uniform float uVel;uniform float uProg;uniform float uOver;uniform vec3 uAcid;float hash(vec2 p){return fract(sin(dot(p,vec2(41.13,289.7)))*43758.5453);}float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}float fbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<5;i++){v+=a*vnoise(p);p*=2.02;a*=0.5;}return v;}void main(){vec2 uv=(gl_FragCoord.xy-0.5*uRes)/min(uRes.x,uRes.y);vec2 m=uMouse*0.5;float t=uTime*0.08;vec2 q=uv*1.4+vec2(t,t*0.6);float f=fbm(q+fbm(q+vec2(uProg*2.0,-t))*1.2);vec2 g=uv*22.0;vec2 gi=fract(g)-0.5;float d=1.0-smoothstep(0.02,0.10,length(gi));d*=0.35+0.4*f;float ptr=exp(-length(uv-m)*3.5)*0.55;float streak=smoothstep(0.85,1.0,f)*clamp(abs(uVel)/6000.0,0.0,1.0);vec3 acid=uAcid;vec3 col=vec3(0.03,0.03,0.04);col+=acid*(d*0.28+ptr*0.9+streak*0.6);col+=vec3(0.06,0.06,0.08)*f;if(uOver>0.5){float h=fract(t*0.4+f*0.6);vec3 r=0.5+0.5*cos(6.2831*(h+vec3(0.0,0.33,0.67)));col=mix(col,col*r*1.6,0.55);}col*=0.85-0.35*length(uv)*0.6;gl_FragColor=vec4(col,1.0);}`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  window.addEventListener("resize", () => { setSize(); mat.uniforms.uRes.value.set(window.innerWidth, window.innerHeight); });
  updaters.push((_dt, t) => {
    if (host.style.display === "none") return;
    mat.uniforms.uTime.value = t; mat.uniforms.uMouse.value.set(motion.spx, -motion.spy);
    mat.uniforms.uVel.value = motion.velocity; mat.uniforms.uProg.value = motion.docProgress;
    mat.uniforms.uOver.value = document.body.classList.contains("overdrive") ? 1 : 0;
    renderer.render(scene, cam);
  });
  /* expose so the theme switcher can retint the shader */
  window.__setShaderAcid = (r, g, b) => { mat.uniforms.uAcid.value.setRGB(r / 255, g / 255, b / 255); };
})();

/* ================================================================
   12b. PIXEL-ARC BACKGROUND (theme-tinted, canvas 2D)
================================================================ */

(function pixelArc() {
  const canvas = $("#arc-layer");
  const ctx = canvas.getContext("2d", { alpha: false });
  const pixelSize = motion.touch ? 12 : 9;
  let width = 0, height = 0;
  /* current theme accent, updated by theme switcher */
  const acid = { r: 200, g: 255, b: 46 };
  window.__setArcAcid = (r, g, b) => { acid.r = r; acid.g = g; acid.b = b; };

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  }
  window.addEventListener("resize", resize);
  resize();

  let t = 0;
  let raf = 0;
  function render() {
    /* base dark fill */
    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, width, height);

    if (document.body.classList.contains("no-fx")) { raf = requestAnimationFrame(render); return; }

    const cols = Math.ceil(width / pixelSize);
    const rows = Math.ceil(height / pixelSize);
    /* arc lives lower on the page; scroll progress lifts it slightly */
    const arcCenterY = height * (0.78 - motion.docProgress * 0.12);
    const arcDrop = height * 0.9;
    const thickness = height * 0.36;
    /* velocity spreads the band */
    const velBoost = Math.min(Math.abs(motion.velocity) / 6000, 1) * 0.12;

    for (let x = 0; x < cols; x++) {
      const px = x * pixelSize;
      const nx = (px / width) * 2 - 1;
      const curveY = arcCenterY + Math.pow(Math.abs(nx), 1.8) * arcDrop;
      const edgeFade = 1 - Math.pow(Math.abs(nx), 2.5);
      if (edgeFade <= 0) continue;
      for (let y = 0; y < rows; y++) {
        const py = y * pixelSize;
        const distToCurve = Math.abs(py - curveY);
        let intensity = Math.max(0, 1 - distToCurve / (thickness * (1 + velBoost)));
        if (intensity <= 0.01) continue;
        const wave1 = Math.sin(nx * 4 - t * 1.5) * 0.1;
        const wave2 = Math.cos(py * 0.01 + t) * 0.1;
        intensity = Math.max(0, Math.min(1, intensity + wave1 + wave2)) * edgeFade;
        if (intensity <= 0.02) continue;
        const coreStr = Math.pow(intensity, 3);
        const midStr = Math.pow(intensity, 1.5);
        /* blend theme accent into a bright core */
        const r = Math.floor(acid.r * 0.16 * intensity + 235 * coreStr);
        const g = Math.floor(acid.g * 0.16 * intensity + 235 * coreStr);
        const b = Math.floor(acid.b * 0.9 * midStr + 35 * coreStr);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.globalAlpha = intensity;
        ctx.fillRect(px, py, pixelSize - 1, pixelSize - 1);
      }
    }
    ctx.globalAlpha = 1;
    t += motion.reduced ? 0 : 0.02;
    raf = requestAnimationFrame(render);
  }
  render();
  void raf;
})();

/* ================================================================
   13. +D DRAG MODULE
================================================================ */

(function dragModule() {
  const frame = $("#drag-frame"), chips = $$(".drag-chip"), vread = $("#drag-vread"), active = $("#drag-active");
  const masses = [1.0, 1.4, 0.7, 1.2];
  const state = chips.map((el, i) => ({ el, idx: i, m: masses[i] || 1, x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, w: 0, h: 0, grabbed: false, ox: 0, oy: 0, lpx: 0, lpy: 0, lpt: 0 }));
  function layout() {
    const r = frame.getBoundingClientRect(); const pd = 22; const w = r.width - pd * 2; const h = r.height - pd * 2;
    const cols = w > 700 ? 4 : 2; const rows = Math.ceil(state.length / cols); const cellW = w / cols; const cellH = h / rows;
    state.forEach((s, i) => { s.w = s.el.offsetWidth; s.h = s.el.offsetHeight; const cx = pd + (i % cols) * cellW + cellW / 2 - s.w / 2; const cy = pd + Math.floor(i / cols) * cellH + cellH / 2 - s.h / 2; s.hx = cx; s.hy = cy; if (!s.grabbed) { s.x = cx; s.y = cy; s.el.style.transform = `translate(${cx}px, ${cy}px)`; } });
  }
  layout(); window.addEventListener("resize", layout); document.fonts?.ready.then(layout);
  const rectCache = { r: null, t: 0 };
  const frameRect = () => { const now = performance.now(); if (!rectCache.r || now - rectCache.t > 300) { rectCache.r = frame.getBoundingClientRect(); rectCache.t = now; } return rectCache.r; };
  let peakV = 0;
  chips.forEach((el, i) => {
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); const s = state[i]; const fr = frameRect(); s.grabbed = true; s.el.classList.add("grabbed"); const px = e.clientX - fr.left; const py = e.clientY - fr.top; s.ox = px - s.x; s.oy = py - s.y; s.vx = 0; s.vy = 0; s.lpx = e.clientX; s.lpy = e.clientY; s.lpt = performance.now(); el.setPointerCapture(e.pointerId); active.textContent = pad(i + 1, 2); });
    el.addEventListener("pointermove", (e) => { const s = state[i]; if (!s.grabbed) return; const fr = frameRect(); const px = e.clientX - fr.left; const py = e.clientY - fr.top; const now = performance.now(); const dt = Math.max((now - s.lpt) / 1000, 1 / 240); s.vx = (e.clientX - s.lpx) / dt; s.vy = (e.clientY - s.lpy) / dt; s.lpx = e.clientX; s.lpy = e.clientY; s.lpt = now; s.x = px - s.ox; s.y = py - s.oy; const mag = Math.hypot(s.vx, s.vy); if (mag > peakV) peakV = mag; });
    const release = (e) => { const s = state[i]; if (!s.grabbed) return; s.grabbed = false; s.el.classList.remove("grabbed"); try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
    el.addEventListener("pointerup", release); el.addEventListener("pointercancel", release);
  });
  updaters.push((dt) => {
    const fr = frameRect(); peakV *= 0.94; vread.textContent = Math.round(peakV).toLocaleString();
    for (const s of state) {
      if (s.grabbed) { s.el.style.transform = `translate(${s.x}px, ${s.y}px)`; continue; }
      const ax = (s.hx - s.x) * 6.5 - s.vx * 3.2; const ay = (s.hy - s.y) * 6.5 - s.vy * 3.2;
      s.vx = (s.vx + ax * dt / s.m) * 0.985; s.vy = (s.vy + ay * dt / s.m) * 0.985; s.x += s.vx * dt; s.y += s.vy * dt;
      const maxX = fr.width - s.w; const maxY = fr.height - s.h;
      if (s.x < 0) { s.x = 0; s.vx = -s.vx * 0.42; } else if (s.x > maxX) { s.x = maxX; s.vx = -s.vx * 0.42; }
      if (s.y < 0) { s.y = 0; s.vy = -s.vy * 0.42; } else if (s.y > maxY) { s.y = maxY; s.vy = -s.vy * 0.42; }
      s.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  });
})();

/* ================================================================
   14. +M MASK MODULE
================================================================ */

(function maskModule() {
  const stage = $("#mask-stage"), layer = $("#mask-layer"), pctEl = $("#mask-pct");
  updaters.push(() => {
    const r = stage.getBoundingClientRect(); if (r.top > motion.vh || r.bottom < 0) return;
    const p = clamp01((motion.vh - r.top) / (motion.vh + r.height)); const cut = p * 100; const shift = p * 40;
    const topX = Math.max(0, Math.min(100, cut)); const botX = Math.max(0, Math.min(100, cut - shift)); const midX = Math.max(0, Math.min(100, cut - 20));
    layer.style.clipPath = `polygon(${topX}% 0, 100% 0, 100% 100%, ${botX}% 100%, ${midX}% 50%)`;
    pctEl.textContent = pad(Math.round(p * 100), 3) + "%";
  });
})();

/* ================================================================
   15. CINEMATIC OUTRO
================================================================ */

(function outroModule() {
  const head = $("#outro-head");
  const { allChars } = buildChars(head, ".split-line");
  resetChars(allChars);
  let playing = false;
  new IntersectionObserver(
    (es) => es.forEach((e) => {
      if (e.isIntersecting && !playing) { playing = true; playCharCascade(allChars, { dur: 900, ease: "out(3)", del: 30 }).then(() => (playing = false)); }
      else if (!e.isIntersecting) { playing = false; resetChars(allChars); }
    }),
    { rootMargin: "-14% 0px" }
  ).observe(head);

  const sig = $("#sig-str"), framesEl = $("#ox-frames"), mem = $("#ox-mem"), count = $("#ox-count"), bar = $("#ox-bar"), section = $("#m-outro");
  let framesN = 0; updaters.push(() => framesN++);
  window.setInterval(() => {
    framesEl.textContent = pad(framesN, 5);
    const perf = performance; if (perf.memory) { mem.textContent = (perf.memory.usedJSHeapSize / 1048576).toFixed(1) + " MB"; }
    const r = section.getBoundingClientRect(); const vis = clamp01(1 - Math.abs(r.top + r.height / 2 - motion.vh / 2) / motion.vh);
    const bars = Math.max(0, Math.floor(vis * 5));
    sig.textContent = "◼".repeat(bars) + "◻".repeat(5 - bars); sig.className = bars >= 4 ? "text-acid" : bars >= 2 ? "text-bone" : "text-fog";
    const p = clamp01((motion.vh - r.top) / (motion.vh + r.height)); const secs = Math.max(0, 60 - Math.floor(p * 60));
    count.textContent = `${pad(Math.floor(secs / 60), 2)}:${pad(secs % 60, 2)}`; bar.style.width = `${Math.round(p * 100)}%`;
  }, 300);
})();

/* ================================================================
   16. COMMAND PALETTE
================================================================ */

const COMMANDS = [
  { n: "⚡", name: "PORTSTACK", meta: "Open 3D transport overlay", to: "__portstack" },
  ...MODULES.filter((m) => m.id !== "footer").map((m) => ({ n: m.n, name: m.name, meta: m.meta, to: m.id })),
];

(function commandPalette() {
  const wrap = $("#cmdk"), input = $("#cmdk-input"), list = $("#cmdk-list"); let cursor = 0; let filtered = COMMANDS.slice();
  function render() {
    list.innerHTML = filtered.map((c, i) => `<div class="cmdk-item${i === cursor ? " on" : ""}" data-i="${i}"><span class="ck-idx">${c.n}</span><div class="grid"><span class="ck-name">${c.name}</span><span class="ck-meta">${c.meta}</span></div><svg class="ck-arrow h-4 w-4 text-acid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7M7 7h10v10"/></svg></div>`).join("");
    Array.from(list.querySelectorAll(".cmdk-item")).forEach((el, i) => { el.addEventListener("mouseenter", () => { cursor = i; syncCursor(); }); el.addEventListener("click", () => jumpTo(filtered[i])); });
  }
  function syncCursor() { Array.from(list.children).forEach((el, i) => el.classList.toggle("on", i === cursor)); const el = list.children[cursor]; if (el) el.scrollIntoView({ block: "nearest" }); }
  function filter(q) { q = q.trim().toLowerCase(); filtered = q ? COMMANDS.filter((c) => (c.name + " " + c.meta + " " + c.n).toLowerCase().includes(q)) : COMMANDS.slice(); cursor = 0; render(); }
  function open() { wrap.classList.add("open"); document.documentElement.classList.add("modal-lock"); input.value = ""; filter(""); setTimeout(() => input.focus(), 40); }
  function close() { wrap.classList.remove("open"); document.documentElement.classList.remove("modal-lock"); }
  function jumpTo(cmd) {
    close();
    if (cmd.to === "__portstack") {
      setTimeout(() => window.__portstack?.summon(), 50);
      pushStatus("PORTSTACK OPENED VIA PALETTE", "ok");
      return;
    }
    wipeTransport(cmd.to);
    pushStatus(`JUMP ${cmd.n} · ${cmd.name} · WIPE`, "ok");
  }
  input.addEventListener("input", () => filter(input.value));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); cursor = Math.min(filtered.length - 1, cursor + 1); syncCursor(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cursor = Math.max(0, cursor - 1); syncCursor(); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[cursor]) jumpTo(filtered[cursor]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  window.__cmdk = { open, close };
})();

/* ================================================================
   17. HOTKEYS + KONAMI + HASH SYNC
================================================================ */

(function hotkeys() {
  const hk = $("#hotkeys"), cmdk = $("#cmdk");
  function toggleHK(force) { const should = force ?? !hk.classList.contains("open"); hk.classList.toggle("open", should); document.documentElement.classList.toggle("modal-lock", should || cmdk.classList.contains("open")); }
  hk.addEventListener("click", (e) => { if (e.target === hk) toggleHK(false); });
  const KEY_TO_MODULE = new Map(MODULES.filter((m) => m.hot).map((m) => [m.hot, m.id]));
  function jumpId(id) { scrollToId(id); const m = MODULE_BY_ID.get(id); if (m) pushStatus(`JUMP ${m.n} · ${m.name}`, "ok"); }
  function nextMod(dir) {
    const cur = MODULES.findIndex((m) => m.id === ($$("[data-module]")[currentModuleIdx]?.id ?? "top"));
    const next = Math.max(0, Math.min(MODULES.length - 1, cur + dir));
    jumpId(MODULES[next].id);
  }
  const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"]; let seq = [];
  window.addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); window.__cmdk.open(); return; }
    seq.push(e.key.length === 1 ? e.key.toLowerCase() : e.key); if (seq.length > KONAMI.length) seq.shift();
    if (KONAMI.every((k, i) => seq[i] === k)) { document.body.classList.toggle("overdrive"); seq = []; const on = document.body.classList.contains("overdrive"); console.log("%c" + (on ? "▶ OVERDRIVE ENGAGED" : "■ OVERDRIVE DISENGAGED"), "background:#c8ff2e;color:#08080a;padding:4px 10px;font-family:monospace;font-weight:700"); pushStatus(on ? "OVERDRIVE ENGAGED" : "OVERDRIVE DISENGAGED", on ? "ok" : "meta"); return; }
    const tag = document.activeElement?.tagName; if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "Escape") { if (hk.classList.contains("open")) toggleHK(false); if (cmdk.classList.contains("open")) window.__cmdk.close(); return; }
    if (e.key === "?" || e.key === "/") { e.preventDefault(); toggleHK(); pushStatus(hk.classList.contains("open") ? "HOTKEYS OPENED" : "HOTKEYS CLOSED", "meta"); return; }
    if (e.key === "g") { e.preventDefault(); jumpId("top"); return; }
    if (e.key === "G") { e.preventDefault(); jumpId("m-outro"); return; }
    if (e.key === "j" || e.key === "ArrowRight") { e.preventDefault(); nextMod(1); return; }
    if (e.key === "k" || e.key === "ArrowLeft") { e.preventDefault(); nextMod(-1); return; }
    if (e.key === "s" || e.key === "S") { e.preventDefault(); document.body.classList.toggle("no-fx"); pushStatus(document.body.classList.contains("no-fx") ? "SHADER LAYER OFF" : "SHADER LAYER ON", "meta"); return; }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); const btn = $("#split-replay"); if (btn) { btn.click(); pushStatus("SPLIT REPLAYED", "ok"); } return; }
    if (e.key === "t" || e.key === "T") { e.preventDefault(); window.__cycleTheme?.(); return; }
    if (e.key === "f" || e.key === "F") { e.preventDefault(); window.__toggleFocus?.(); return; }
    if (e.key === "d" || e.key === "D") { e.preventDefault(); window.__toggleDebug?.(); return; }
    if (e.key === "m" || e.key === "M") { e.preventDefault(); window.__toggleSynth?.(); return; }
    if (e.key === "p" || e.key === "P") { e.preventDefault(); window.__snap?.(); return; }
    if (e.key === ".") { e.preventDefault(); window.__toggleDwell?.(); return; }
    if (e.key === "x") { e.preventDefault(); window.__toggleGlyphStorm?.(); return; }
    if (e.key === "X") { e.preventDefault(); window.__cycleGlyphIntensity?.(); return; }
    if (e.key === "\\") { e.preventDefault(); window.__portstack?.summon(); return; }
    if (/^[0-9]$/.test(e.key)) { const target = KEY_TO_MODULE.get(e.key); if (target) { e.preventDefault(); jumpId(target); } return; }
  });
})();

(function hashSync() {
  const els = $$("[data-module]"); const byIndex = els.map((el) => el.id).filter(Boolean); let last = ""; let raf = 0;
  const io = new IntersectionObserver((entries) => { for (const e of entries) { if (e.isIntersecting && e.target.id && e.target.id !== last) { last = e.target.id; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { history.replaceState(null, "", `#${last}`); }); } } }, { rootMargin: "-42% 0px -50% 0px" });
  els.forEach((el) => { if (el.id) io.observe(el); });
  window.addEventListener("load", () => { const h = location.hash.slice(1); if (!h || !byIndex.includes(h)) return; const wait = () => { if (!document.body.classList.contains("booted")) return setTimeout(wait, 60); const el = document.getElementById(h); if (!el) return; if (motion.lenis) motion.lenis.scrollTo(el, { offset: -46, immediate: true }); else el.scrollIntoView(); }; wait(); });
})();

/* ================================================================
   18–26. THEME, FOCUS, IDLE, HERO SPARKS, DWELL, DEBUG, SYNTH, SNAP, EXPORT
================================================================ */

/* central theme registry — one source of truth for CSS, shader + pixel arc */
const THEME_REGISTRY = {
  acid:    { label: "ACID GREEN",     rgb: [200, 255, 46] },
  cyan:    { label: "PLASMA CYAN",    rgb: [92, 225, 255] },
  magenta: { label: "SIGNAL MAGENTA", rgb: [255, 92, 214] },
  amber:   { label: "SIGNAL AMBER",   rgb: [255, 184, 77] },
  nexus:   { label: "NEXUS BLUE",     rgb: [106, 106, 255] },
  mono:    { label: "MONO WHITE",     rgb: [230, 230, 234] },
};
const THEMES = Object.keys(THEME_REGISTRY);
const THEME_LABELS = Object.fromEntries(THEMES.map((k) => [k, THEME_REGISTRY[k].label]));
let currentTheme = THEME_REGISTRY[localStorage.getItem("theme")] ? localStorage.getItem("theme") : "acid";
document.body.dataset.theme = currentTheme;
(function themes() {
  const swatches = $$(".theme-swatch"), wrap = $("#theme-swatches"); wrap.classList.remove("hidden"); wrap.classList.add("md:flex");
  function apply(name) {
    if (!THEME_REGISTRY[name]) name = "acid";
    currentTheme = name;
    document.body.dataset.theme = name;
    localStorage.setItem("theme", name);
    swatches.forEach((s) => s.classList.toggle("on", s.dataset.theme === name));
    /* propagate accent to every subsystem */
    const [r, g, b] = THEME_REGISTRY[name].rgb;
    window.__setShaderAcid?.(r, g, b);
    window.__setArcAcid?.(r, g, b);
    /* retint every registered three.js material */
    themedMaterials.forEach((m) => { if (m && m.color) m.color.setRGB(r / 255, g / 255, b / 255); });
    /* also set a runtime CSS var in case any inline rgb() needs it */
    document.documentElement.style.setProperty("--acid-rgb", `${r} ${g} ${b}`);
    pushStatus(`THEME · ${THEME_LABELS[name]}`, "meta");
  }
  swatches.forEach((s) => s.addEventListener("click", () => apply(s.dataset.theme)));
  apply(currentTheme);
  window.__cycleTheme = () => { const i = THEMES.indexOf(currentTheme); apply(THEMES[(i + 1) % THEMES.length]); };
  window.__applyTheme = apply;
})();
window.__toggleFocus = () => { const on = document.body.classList.toggle("focus-mode"); pushStatus(on ? "FOCUS MODE ON — CHROME HIDDEN" : "FOCUS MODE OFF", "meta"); };
(function idle() {
  const badge = $("#idle-badge"); let idleTimer = 0; let isIdle = false;
  function reset() { if (isIdle) { isIdle = false; document.body.classList.remove("idle"); badge.classList.remove("on"); pushStatus("ACTIVITY RESUMED", "ok"); } clearTimeout(idleTimer); idleTimer = window.setTimeout(() => { if (!booted) return; isIdle = true; document.body.classList.add("idle"); badge.classList.add("on"); pushStatus("IDLE MODE ENGAGED", "meta"); }, 14000); }
  ["pointermove", "keydown", "wheel", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, reset, { passive: true })); reset();
})();

/* FIX #4: hero sparks — anime.js per-spark (no stagger in forEach) */
(function heroSparks() {
  const hero = $("#top");
  hero.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a,button,input")) return;
    const N = motion.touch ? 14 : 26;
    for (let i = 0; i < N; i++) {
      const spark = document.createElement("div"); spark.className = "hero-spark";
      spark.style.left = e.clientX + "px"; spark.style.top = e.clientY + "px";
      document.body.appendChild(spark);
      const angle = (i / N) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 60 + Math.random() * 280;
      const dx = Math.cos(angle) * speed; const dy = Math.sin(angle) * speed - 60;
      const life = 620 + Math.random() * 380;
      animate(spark, {
        x: dx,
        y: dy + life * 0.5,
        scale: [1, 0.3],
        opacity: [1, 0],
        duration: life,
        delay: i * 4,
        ease: "out(3)",
        onComplete: () => spark.remove(),
      });
    }
  });
})();

const dwellData = new Map(MODULES.map((m) => [m.id, 0])); let dwellActiveId = "top"; let dwellLast = performance.now();
(function dwell() {
  const panel = $("#dwell-panel"), rows = $("#dwell-rows");
  function accumulate() { const now = performance.now(); dwellData.set(dwellActiveId, (dwellData.get(dwellActiveId) || 0) + (now - dwellLast)); dwellLast = now; }
  function render() { accumulate(); const total = Array.from(dwellData.values()).reduce((a, b) => a + b, 0) || 1; rows.innerHTML = MODULES.filter((m) => dwellData.get(m.id) > 0).sort((a, b) => (dwellData.get(b.id) || 0) - (dwellData.get(a.id) || 0)).map((m) => { const ms = dwellData.get(m.id) || 0; const pct = Math.round((ms / total) * 100); const secs = (ms / 1000).toFixed(1); const act = m.id === dwellActiveId ? "active" : ""; return `<div class="dwell-row ${act}"><span>${m.n}</span><span>${m.name}</span><span class="text-bone tabular-nums">${secs}s · ${pct}%</span></div><div class="dwell-bar"><span style="width:${pct}%"></span></div>`; }).join(""); }
  const io = new IntersectionObserver((entries) => { for (const e of entries) { if (e.isIntersecting) { accumulate(); const id = e.target.id; if (id && dwellData.has(id)) dwellActiveId = id; } } }, { rootMargin: "-42% 0px -50% 0px" });
  $$("[data-module]").forEach((el) => { if (el.id) io.observe(el); });
  window.__toggleDwell = () => { const on = panel.classList.toggle("hidden") === false; if (on) render(); pushStatus(on ? "DWELL PANEL OPENED" : "DWELL PANEL CLOSED", "meta"); };
  panel.classList.add("hidden"); window.setInterval(() => { if (!panel.classList.contains("hidden")) render(); }, 500);
  window.__getDwellData = () => { accumulate(); return Array.from(dwellData.entries()).map(([id, ms]) => { const m = MODULE_BY_ID.get(id); return { id, name: m?.name, ms: Math.round(ms), seconds: +(ms / 1000).toFixed(2) }; }); };
})();
window.__toggleDebug = () => { const g = $("#debug-grid"); const on = g.classList.toggle("on"); pushStatus(on ? "DEBUG GRID ON" : "DEBUG GRID OFF", "meta"); };

let synthCtx = null; let synthOn = false; let synthNodes = null;
async function toggleSynth() {
  if (synthOn) { if (synthNodes) synthNodes.master.gain.linearRampToValueAtTime(0, synthCtx.currentTime + 0.4); setTimeout(() => { try { synthNodes?.osc1.stop(); synthNodes?.osc2.stop(); synthNodes?.lfo.stop(); } catch (_) {} synthNodes = null; }, 500); synthOn = false; pushStatus("SYNTH · OFF", "meta"); return; }
  if (!synthCtx) synthCtx = new (window.AudioContext || window.webkitAudioContext)(); await synthCtx.resume();
  const t = synthCtx.currentTime; const master = synthCtx.createGain(); master.gain.setValueAtTime(0, t); master.gain.linearRampToValueAtTime(0.05, t + 0.8); master.connect(synthCtx.destination);
  const filter = synthCtx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 800; filter.Q.value = 4; filter.connect(master);
  const osc1 = synthCtx.createOscillator(); osc1.type = "sine"; osc1.frequency.value = 55; osc1.connect(filter); osc1.start(t);
  const osc2 = synthCtx.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = 55 * 1.5; const osc2Gain = synthCtx.createGain(); osc2Gain.gain.value = 0.2; osc2.connect(osc2Gain).connect(filter); osc2.start(t);
  const lfo = synthCtx.createOscillator(); lfo.frequency.value = 0.15; const lfoGain = synthCtx.createGain(); lfoGain.gain.value = 400; lfo.connect(lfoGain).connect(filter.frequency); lfo.start(t);
  synthNodes = { master, filter, osc1, osc2, lfo }; synthOn = true; pushStatus("SYNTH · AMBIENT LOOP ENGAGED", "ok");
  updaters.push(() => { if (!synthOn || !synthNodes) return; const v = Math.min(Math.abs(motion.velocity) / 6000, 1); synthNodes.filter.frequency.setTargetAtTime(400 + v * 2400 + motion.docProgress * 900, synthCtx.currentTime, 0.25); const pitch = 55 * (1 + motion.docProgress * 0.6); synthNodes.osc1.frequency.setTargetAtTime(pitch, synthCtx.currentTime, 0.4); synthNodes.osc2.frequency.setTargetAtTime(pitch * 1.5, synthCtx.currentTime, 0.4); });
}
window.__toggleSynth = toggleSynth;
window.__isSoundOn = () => synthOn;

async function takeSnapshot() {
  const w = Math.min(window.innerWidth, 1920), h = Math.min(window.innerHeight, 1200); const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d");
  ctx.fillStyle = "#030308"; ctx.fillRect(0, 0, w, h);
  const arc = document.querySelector("#arc-layer"); if (arc) { try { ctx.drawImage(arc, 0, 0, w, h); } catch (_) {} }
  const fx = document.querySelector("#fx-layer canvas"); if (fx) { try { ctx.globalAlpha = 0.3; ctx.drawImage(fx, 0, 0, w, h); ctx.globalAlpha = 1; } catch (_) {} }
  ctx.fillStyle = "rgba(8,8,10,0.55)"; ctx.fillRect(0, h - 140, w, 140); ctx.fillStyle = "#c8ff2e"; ctx.font = "700 22px monospace"; ctx.fillText("STRINGTUNE × THREE.JS", 24, h - 96);
  ctx.fillStyle = "#e6e6ea"; ctx.font = "12px monospace"; const mod = MODULES[Math.max(0, Math.min(MODULES.length - 1, currentModuleIdx))];
  ctx.fillText(`MODULE ${mod.n} · ${mod.name}   ·   SCROLL ${Math.round(motion.docProgress * 100)}%   ·   ${fpsNow} FPS   ·   THEME ${THEME_LABELS[currentTheme]}`, 24, h - 66);
  ctx.fillStyle = "#8e8e96"; ctx.fillText(new Date().toISOString(), 24, h - 42); ctx.fillText("build · 2026 · one file, zero framework", 24, h - 22);
  const flash = document.createElement("div"); flash.className = "snap-flash"; document.body.appendChild(flash); setTimeout(() => flash.remove(), 500);
  return new Promise((resolve) => { c.toBlob((blob) => { if (!blob) { resolve(); return; } const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `stringtune-${mod.name.toLowerCase()}-${Date.now()}.png`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); pushStatus(`SNAPSHOT SAVED · ${mod.name}`, "ok"); resolve(); }, "image/png"); });
}
window.__snap = takeSnapshot;
function exportJSON() {
  const data = { generated: new Date().toISOString(), build: "stringtune-threejs · one file · zero framework", theme: currentTheme, performance: { fpsNow, peakFps, sampleHistory: sparkHistory }, scroll: { pixels: Math.round(motion.scrollY), progress: +(motion.docProgress * 100).toFixed(2), velocity: Math.round(motion.velocity) }, pointer: { normalizedX: +motion.spx.toFixed(3), normalizedY: +motion.spy.toFixed(3), speed: Math.round(motion.pointerV) }, activeModule: MODULES[Math.max(0, Math.min(MODULES.length - 1, currentModuleIdx))], dwell: window.__getDwellData ? window.__getDwellData() : [], modules: MODULES };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `stringtune-telemetry-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); pushStatus("TELEMETRY EXPORTED — JSON DOWNLOADED", "ok");
}
$("#ft-snap")?.addEventListener("click", () => takeSnapshot());
$("#ft-export")?.addEventListener("click", exportJSON);

/* ================================================================
   27. GLYPH STORM
================================================================ */

(function glyphStorm() {
  const STORM_CHARS = "█▓▒<>/#*+=-∆∇ΣΩΦΨλδπ0123456789ABCDEFZYXWVUTSRQP";
  const hudBtn = $("#glyph-toggle");
  const stormState = { on: localStorage.getItem("glyphStorm") !== "off", intensity: Number(localStorage.getItem("glyphIntensity")) || 1, activeJobs: new Map(), nextId: 0 };
  hudBtn.classList.remove("hidden"); hudBtn.classList.add("sm:flex");
  function setHudState() { const dot = hudBtn.querySelector("span:first-child"); const label = hudBtn.querySelector("span:last-child"); dot.className = `h-1.5 w-1.5 ${stormState.on ? "bg-acid animate-blink" : "bg-line2"}`; label.textContent = stormState.on ? `GLYPH ×${stormState.intensity}` : "GLYPH OFF"; hudBtn.classList.toggle("border-acid", stormState.on); hudBtn.classList.toggle("text-acid", stormState.on); }
  setHudState();
  hudBtn.addEventListener("click", () => { stormState.on = !stormState.on; localStorage.setItem("glyphStorm", stormState.on ? "on" : "off"); setHudState(); pushStatus(stormState.on ? "GLYPH STORM ON" : "GLYPH STORM OFF", stormState.on ? "ok" : "meta"); });
  function collectTextNodes() {
    const result = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT; const parent = node.parentElement; if (!parent) return NodeFilter.FILTER_REJECT;
      if (/^(SCRIPT|STYLE|TEXTAREA|INPUT|NOSCRIPT|CANVAS|SVG|TEMPLATE|IFRAME)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("#status-console, #preloader, #cmdk, #hotkeys, #reticle, #dwell-panel, #portstack")) return NodeFilter.FILTER_REJECT;
      if (stormState.activeJobs.has(parent)) return NodeFilter.FILTER_REJECT;
      const r = parent.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return NodeFilter.FILTER_REJECT;
      if (r.bottom < -200 || r.top > motion.vh + 200) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; } });
    let n; while ((n = walker.nextNode())) result.push(n); return result;
  }
  function pickNode() { const pool = collectTextNodes(); if (!pool.length) return null; const weights = pool.map((n) => { const r = n.parentElement.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(n.parentElement).fontSize) || 14; return Math.max(1, (r.width * r.height) / 1000) * Math.max(1, fs / 14); }); const total = weights.reduce((a, b) => a + b, 0); let r = Math.random() * total; for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; } return pool[pool.length - 1]; }
  function stormOne() {
    if (!stormState.on) return; const node = pickNode(); if (!node) return; const parent = node.parentElement; if (stormState.activeJobs.has(parent)) return;
    const original = node.nodeValue; if (original.length < 2) return;
    const pureNum = /^[\s:+\-.,%0-9]+$/.test(original); const speed = pureNum ? 10 : 22;
    const duration = pureNum ? 240 : Math.min(1200, 220 + original.length * 28 + Math.random() * 280);
    const id = ++stormState.nextId; stormState.activeJobs.set(parent, id);
    const totalFrames = Math.ceil(duration / speed); const resolveStart = Math.floor(totalFrames * 0.35);
    const job = { frame: 0 };
    animate(job, { frame: totalFrames, duration: totalFrames * speed, ease: "linear",
      onUpdate: () => { const f = Math.floor(job.frame); node.nodeValue = original.split("").map((c, i) => { if (c === " " || c === "\u00A0") return c; if (f > resolveStart && i < f - resolveStart) return c; return STORM_CHARS[(i * 17 + f * 31 + id * 7) % STORM_CHARS.length]; }).join(""); },
      onComplete: () => { node.nodeValue = original; stormState.activeJobs.delete(parent); },
    });
  }
  function scheduleNext() { const base = 700 - stormState.intensity * 110; const delay = base + Math.random() * 340; window.setTimeout(() => { const jobs = stormState.intensity <= 2 ? 1 : stormState.intensity <= 4 ? 2 : 3; for (let i = 0; i < jobs; i++) stormOne(); scheduleNext(); }, Math.max(60, delay)); }
  scheduleNext();
  window.__toggleGlyphStorm = () => { stormState.on = !stormState.on; localStorage.setItem("glyphStorm", stormState.on ? "on" : "off"); setHudState(); pushStatus(stormState.on ? "GLYPH STORM ON" : "GLYPH STORM OFF", stormState.on ? "ok" : "meta"); };
  window.__cycleGlyphIntensity = () => { stormState.intensity = stormState.intensity >= 5 ? 1 : stormState.intensity + 1; localStorage.setItem("glyphIntensity", String(stormState.intensity)); setHudState(); pushStatus(`GLYPH INTENSITY ×${stormState.intensity}`, "meta"); };
  window.__glyphBurst = (n = 12) => { for (let i = 0; i < n; i++) setTimeout(() => stormOne(), i * 30); };
})();

/* ================================================================
   28. PORTSTACK — advanced 3D transport system (\ hotkey)
================================================================ */

(function portstack() {
  const wrap = $("#portstack");
  const deck = $("#port-deck");
  const dim = $("#port-dim");
  const totalEl = $("#port-total");
  const selIdx = $("#port-sel-idx");
  const selName = $("#port-sel-name");
  const selMeta = $("#port-sel-meta");
  const selStatus = $("#port-sel-status");
  const fromName = $("#port-from-name");
  const fromDwell = $("#port-from-dwell");
  const visitedEl = $("#port-visited");
  const confirmBtn = $("#port-confirm");
  const confirmTag = $("#port-confirm-tag");
  const hudOpenBtn = $("#port-open");
  const track = $("#port-track");
  const trackFill = $("#port-fill");
  const trackHead = $("#port-head");
  const ticksWrap = $("#port-ticks");
  const nameMini = $("#port-name-mini");

  /* portstack only ports to real destinations (all MODULES) */
  const NODES = MODULES.slice();
  totalEl.textContent = `${NODES.length} NODES`;
  const trailEl = $("#port-trail");
  const filterEl = $("#port-filter");

  let open = false;
  let busy = false; /* transition guard — blocks re-entrant summon/dismiss/port */
  /* fractional deck position — the smooth scroll target and current value */
  let deckPos = 0;      /* smoothed, currently displayed */
  let deckTarget = 0;   /* what deckPos is easing toward */
  let selected = 0;     /* discrete integer for readouts & port */
  let cards = [];
  let ticks = [];
  let filterStr = "";
  let lastSelected = -1;
  let dragRot = 0;
  let nameJob = null;
  let prevFocus = null;
  const trail = [];
  const posEl = $("#port-pos");

  /* ---- live page previews — each card shows a scaled-down clone of the real
     section DOM, snapshotted at summon time, behind a fake loading veil ---- */
  const PAGE_W = 1280; /* virtual page width the clones render at */
  function makeLivePreview(node) {
    const holder = document.createElement("div");
    holder.className = "pv-live";
    const inner = document.createElement("div");
    inner.className = "pv-live-inner";
    const src = document.getElementById(node.id);
    if (src) {
      const clone = src.cloneNode(true);
      clone.removeAttribute("id");
      clone.removeAttribute("data-module");
      clone.style.transform = "";
      clone.style.opacity = "";
      /* strip ids so the clones never collide with the live document */
      clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      /* canvases clone blank — swap for a wire-grid placeholder */
      clone.querySelectorAll("canvas").forEach((c) => {
        const ph = document.createElement("div");
        ph.className = "pv-canvas-ph";
        ph.style.position = "absolute";
        ph.style.inset = "0";
        c.replaceWith(ph);
      });
      /* wake states that observers/animations drive on the real page */
      clone.querySelectorAll(".rv").forEach((el) => el.classList.add("in"));
      clone.querySelectorAll(".ch").forEach((el) => { el.style.transform = "none"; el.style.opacity = "1"; });
      clone.querySelectorAll("[style]").forEach((el) => { if (el.style.opacity) el.style.opacity = ""; });
      const page = document.createElement("div");
      page.className = "pv-live-page";
      page.appendChild(clone);
      inner.appendChild(page);
    } else {
      inner.innerHTML = `<div class="pv-glyph">${"▓▒░<>/#*+=-ΣΩΦ".repeat(4)}</div>`;
    }
    const veil = document.createElement("div");
    veil.className = "pv-load";
    veil.innerHTML = `
      <div class="pv-load-scan"></div>
      <div class="pv-load-meta"><span>SYNC ${node.n}</span><span class="pv-load-pct">000%</span></div>
      <div class="pv-load-bar"><span style="width:0%"></span></div>`;
    holder.appendChild(inner);
    holder.appendChild(veil);
    return holder;
  }

  /* fit each clone to its card — must run while the overlay is visible */
  function sizeLivePreviews() {
    cards.forEach((card) => {
      const holder = card.querySelector(".pv-live");
      const inner = holder?.querySelector(".pv-live-inner");
      const page = holder?.querySelector(".pv-live-page");
      if (!holder || !inner || !page) return;
      const w = holder.clientWidth || 1;
      const h = holder.clientHeight || 1;
      const s = w / PAGE_W;
      inner.style.transform = `scale(${s})`;
      page.style.height = `${Math.ceil(h / s)}px`;
    });
  }

  /* fake loading — counters resolve staggered outward from the selection */
  function playPreviewLoads() {
    cards.forEach((card, i) => {
      const holder = card.querySelector(".pv-live");
      if (!holder) return;
      holder.classList.remove("ready");
      if (motion.reduced) { holder.classList.add("ready"); return; }
      const pct = holder.querySelector(".pv-load-pct");
      const bar = holder.querySelector(".pv-load-bar > span");
      const st = { p: 0 };
      animate(st, {
        p: 100,
        duration: 420 + Math.random() * 320,
        delay: 240 + Math.abs(i - selected) * 70 + Math.random() * 220,
        ease: "inOut(2)",
        onUpdate: () => { const v = Math.floor(st.p); pct.textContent = `${pad(v, 3)}%`; bar.style.width = `${v}%`; },
        onComplete: () => holder.classList.add("ready"),
      });
    });
  }

  /* ---- build cards + timeline tick marks (once) ---- */
  function build() {
    deck.innerHTML = "";
    cards = NODES.map((node, i) => {
      const card = document.createElement("div");
      card.className = "port-card";
      card.dataset.i = String(i);
      card.innerHTML = `
        <div class="flex items-start justify-between">
          <span class="port-card-idx">${node.n}</span>
          <span class="port-card-status"><span class="dot"></span><span class="label">UNVISITED</span></span>
        </div>
        <div>
          <div class="port-card-name">${node.name}</div>
          <div class="port-card-meta mt-2">${node.meta}</div>
        </div>
        <div class="port-card-preview"></div>`;
      card.querySelector(".port-card-preview").appendChild(makeLivePreview(node));
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if (i === selected) confirmPort();
        else select(i);
      });
      deck.appendChild(card);
      return card;
    });

    /* timeline tick markers */
    ticksWrap.innerHTML = "";
    ticks = NODES.map((node, i) => {
      const t = document.createElement("div");
      t.className = "port-tick";
      t.style.left = `${(i / (NODES.length - 1)) * 100}%`;
      t.innerHTML = `<span class="port-tick-label">${node.n}</span>`;
      t.addEventListener("click", (e) => { e.stopPropagation(); select(i); });
      ticksWrap.appendChild(t);
      return t;
    });
  }

  /* ---- filter matching ---- */
  function matches(i) {
    if (!filterStr) return true;
    const n = NODES[i];
    return (n.name + " " + n.meta + " " + n.n).toLowerCase().includes(filterStr.toLowerCase());
  }
  function nextVisible(from, dir) {
    let i = from;
    for (let step = 0; step < NODES.length; step++) {
      i += dir;
      if (i < 0 || i > NODES.length - 1) return from;
      if (matches(i)) return i;
    }
    return from;
  }

  /* ---- fractional diagonal cascade — uses continuous deckPos, not integer ---- */
  function layoutCards() {
    const mobile = motion.vw < 768;
    const sx = mobile ? 34 : 82;
    const sy = mobile ? -26 : -60;
    const sz = mobile ? 150 : 210;
    cards.forEach((card, i) => {
      const offset = i - deckPos;   /* fractional — enables smooth sub-integer motion */
      const abs = Math.abs(offset);
      const dim = filterStr && !matches(i);
      /* diagonal filmstrip: cards cascade up-and-right into depth */
      const x = offset * sx;
      const y = offset * sy;
      const z = -abs * sz;
      const rot = offset * -3;
      const scale = Math.max(0.4, 1 - abs * 0.07);
      let opacity = abs > 7 ? 0 : Math.max(0.06, 1 - abs * 0.13);
      if (dim) opacity *= 0.12;
      card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateY(${rot}deg) scale(${scale})`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(1000 - Math.round(abs));
      /* "front" state only when we're within half a step of the discrete selected index */
      const isFront = i === selected && Math.abs(deckPos - selected) < 0.5;
      card.classList.toggle("front", isFront);
      card.classList.toggle("dof", abs >= 2.5 && !dim);
      card.classList.toggle("filtered-out", dim);
      const node = NODES[i];
      const visited = visitedModules.has(node.id);
      card.classList.toggle("visited", visited);
      card.classList.toggle("current", i === currentModuleIdx);
      const statusEl = card.querySelector(".port-card-status");
      const labelEl = statusEl.querySelector(".label");
      if (i === currentModuleIdx) { statusEl.classList.add("on"); labelEl.textContent = "YOU ARE HERE"; }
      else if (visited) { statusEl.classList.add("on"); labelEl.textContent = "VISITED"; }
      else { statusEl.classList.remove("on"); labelEl.textContent = "UNVISITED"; }
    });
    /* update ticks */
    ticks.forEach((t, i) => {
      t.classList.toggle("visited", visitedModules.has(NODES[i].id));
      t.classList.toggle("current", i === selected);
      t.style.opacity = filterStr && !matches(i) ? "0.3" : "1";
    });
    /* fill & playhead — use fractional deckPos for smooth animation */
    const pct = NODES.length > 1 ? (deckPos / (NODES.length - 1)) * 100 : 0;
    const pctClamped = Math.max(0, Math.min(100, pct));
    trackFill.style.width = `${pctClamped}%`;
    trackHead.style.left = `${pctClamped}%`;
  }

  /* ---- selection readout (with glyph scramble on change) ---- */
  function updateReadout() {
    const node = NODES[selected];
    selIdx.textContent = node.n;
    if (selected !== lastSelected) {
      if (nameJob) { try { nameJob.cancel?.(); } catch (_) {} }
      nameJob = scramble(selName, node.name, 16);
      lastSelected = selected;
    } else {
      selName.textContent = node.name;
    }
    selMeta.textContent = node.meta;
    const visited = visitedModules.has(node.id);
    const here = node.id === MODULES[currentModuleIdx]?.id;
    selStatus.textContent = here ? "YOU ARE HERE" : visited ? "VISITED" : "UNVISITED";
    selStatus.className = `tick-label ${here || visited ? "text-acid" : "text-line2"}`;
    confirmTag.textContent = `${node.n} · ${node.name}`;
    posEl.textContent = `${pad(selected + 1, 2)} / ${pad(NODES.length, 2)}`;
    nameMini.textContent = node.name;
    const from = MODULES[currentModuleIdx] ?? MODULES[0];
    fromName.textContent = from.name;
    fromDwell.textContent = ((dwellData.get(from.id) || 0) / 1000).toFixed(1) + "s";
    const v = NODES.filter((n) => visitedModules.has(n.id)).length;
    visitedEl.textContent = `${pad(v, 2)} / ${pad(NODES.length, 2)} VISITED`;
  }

  /* discrete select — sets both target and integer selected, easing renders the motion */
  function select(i) {
    if (busy) return;
    selected = Math.max(0, Math.min(NODES.length - 1, i));
    deckTarget = selected;
    updateReadout();
  }

  /* fractional target — used by wheel/drag scrubbing; snaps selected to nearest */
  function scrubTo(pos) {
    if (busy) return;
    deckTarget = Math.max(0, Math.min(NODES.length - 1, pos));
    const rounded = Math.round(deckTarget);
    if (rounded !== selected) {
      selected = rounded;
      updateReadout();
    }
  }

  /* ---- filter input ---- */
  function applyFilter() {
    if (filterStr) {
      const count = NODES.filter((_, i) => matches(i)).length;
      filterEl.textContent = `/ ${filterStr.toUpperCase()} · ${count} MATCH`;
      filterEl.classList.remove("hidden");
    } else { filterEl.textContent = ""; filterEl.classList.add("hidden"); }
    if (filterStr && !matches(selected)) {
      const first = NODES.findIndex((_, i) => matches(i));
      if (first >= 0) { selected = first; deckTarget = first; }
    }
    layoutCards();
    updateReadout();
  }

  /* ---- trail breadcrumb ---- */
  function renderTrail() {
    if (!trail.length) { trailEl.classList.add("hidden"); return; }
    trailEl.classList.remove("hidden");
    const recent = trail.slice(-5);
    trailEl.innerHTML = recent.map((t, i) => {
      const head = i === recent.length - 1 ? " head" : "";
      const sep = i < recent.length - 1 ? '<span class="port-trail-sep">→</span>' : "";
      return `<span class="port-trail-item${head}">${t.n} ${t.name}</span>${sep}`;
    }).join("");
  }

  /* ---- summon / dismiss ---- */
  function summon() {
    if (open || busy) return;
    open = true;
    busy = true;
    prevFocus = document.activeElement;
    /* freeze scroll */
    lenis?.stop();
    document.documentElement.classList.add("port-lock");
    document.body.classList.add("porting");
    /* reset filter + selection */
    filterStr = "";
    filterEl.classList.add("hidden");
    lastSelected = -1;
    selected = Math.max(0, currentModuleIdx);
    deckPos = selected;
    deckTarget = selected;
    /* seed trail with current location if empty */
    if (!trail.length) { const cur = MODULES[currentModuleIdx] ?? MODULES[0]; trail.push({ n: cur.n, name: cur.name }); }
    build();
    renderTrail();
    /* start every card deep in the void with no transitions */
    wrap.classList.add("no-tween");
    cards.forEach((c) => {
      c.style.transform = "translate3d(0, 40px, -1400px)";
      c.style.opacity = "0";
      c.style.transitionDelay = "";
    });
    wrap.classList.add("open");
    wrap.setAttribute("aria-hidden", "false");
    wrap.focus({ preventScroll: true });
    updateReadout();
    void deck.offsetWidth; /* reflow so initial state paints */
    sizeLivePreviews(); /* needs layout — overlay must be visible */
    playPreviewLoads();
    /* re-enable transitions and let CSS animate the fly-in, staggered from center */
    wrap.classList.remove("no-tween");
    cards.forEach((c, i) => {
      c.style.transitionDelay = `${Math.abs(i - selected) * 30}ms`;
    });
    layoutCards();

    /* anime.js owns the section collapse (no CSS transition on sections) */
    const sections = $$("body > header[data-module], body > section[data-module], body > footer[data-module]");
    animate(sections, {
      scaleY: [1, 0.02],
      opacity: [1, 0.35],
      duration: 550,
      ease: "inOut(3)",
      delay: stagger(8),
    });

    setTimeout(() => {
      cards.forEach((c) => { c.style.transitionDelay = ""; });
      busy = false;
    }, 600 + NODES.length * 30);

    pushStatus("PORTSTACK SUMMONED", "ok");
  }

  function dismiss() {
    if (!open || busy) return;
    open = false;
    busy = true;
    wrap.classList.add("dismissing");
    /* CSS transitions: cards recede into the void, staggered from selection */
    cards.forEach((c, i) => {
      c.style.transitionDelay = `${Math.abs(i - selected) * 18}ms`;
      c.style.transform = "translate3d(0, 40px, -1600px)";
      c.style.opacity = "0";
    });
    /* anime.js: sections expand back */
    const sections = $$("body > header[data-module], body > section[data-module], body > footer[data-module]");
    animate(sections, {
      scaleY: [0.02, 1],
      opacity: [0.35, 1],
      duration: 550,
      ease: "out(3)",
      delay: stagger(6, { from: "center" }),
      onComplete: () => {
        sections.forEach((s) => { s.style.transform = ""; s.style.opacity = ""; });
      },
    });
    setTimeout(() => {
      wrap.classList.remove("open");
      wrap.classList.remove("dismissing");
      wrap.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("port-lock");
      document.body.classList.remove("porting");
      deck.style.transform = "";
      busy = false;
      lenis?.start();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    }, 500);
    pushStatus("PORTSTACK DISMISSED", "meta");
  }

  /* ---- confirm port — front card flies through the camera, the teleport
     happens while the dim still covers the page, then the overlay fades out
     at the destination. (No wipeTransport here — the overlay IS the cover.) ---- */
  function confirmPort() {
    if (!open || busy) return;
    busy = true;
    const node = NODES[selected];
    const targetCard = cards[selected];

    /* CSS transitions: front card flies forward through the camera, others recede */
    cards.forEach((c, i) => {
      c.style.transitionDelay = i === selected ? "0ms" : `${Math.abs(i - selected) * 14}ms`;
    });
    targetCard.style.transform = "translate3d(0, 0, 420px) scale(3.2)";
    targetCard.style.opacity = "0";
    cards.forEach((c, i) => {
      if (i === selected) return;
      c.style.transform = "translate3d(0, 40px, -2000px)";
      c.style.opacity = "0";
    });

    const sections = $$("body > header[data-module], body > section[data-module], body > footer[data-module]");

    /* midpoint: teleport behind the opaque dim, then reveal the destination */
    setTimeout(() => {
      const el = document.getElementById(node.id);
      if (el) {
        if (motion.lenis) motion.lenis.scrollTo(el, { offset: -46, immediate: true, force: true });
        else el.scrollIntoView();
      }
      /* sections expand at the destination, seen through the overlay fade */
      animate(sections, {
        scaleY: [0.02, 1],
        opacity: [0.35, 1],
        duration: 550,
        ease: "out(4)",
        delay: stagger(8, { from: "center" }),
        onComplete: () => {
          sections.forEach((s) => { s.style.transform = ""; s.style.opacity = ""; });
        },
      });
      wrap.classList.add("dismissing");
    }, 400);

    /* after the overlay fade completes, clean state */
    setTimeout(() => {
      wrap.classList.remove("open");
      wrap.classList.remove("dismissing");
      wrap.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("port-lock");
      document.body.classList.remove("porting");
      open = false;
      busy = false;
      deck.style.transform = "";
      cards.forEach((c) => { c.style.transitionDelay = ""; });
      lenis?.start();
      visitedModules.add(node.id);
      /* record the jump in the trail */
      if (trail[trail.length - 1]?.name !== node.name) trail.push({ n: node.n, name: node.name });
      if (trail.length > 8) trail.shift();
      renderTrail();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      pushStatus(`PORTED → ${node.n} · ${node.name}`, "ok");
    }, 840);
  }

  /* ---- MASTER loop: parallax + smooth deckPos easing + card layout ---- */
  updaters.push((dt, t) => {
    if (!open) return;
    /* smooth deckPos toward deckTarget with time-based easing (frame-rate independent) */
    const easeK = 12; /* higher = snappier */
    const delta = deckTarget - deckPos;
    if (Math.abs(delta) > 0.0005) {
      deckPos += delta * Math.min(1, easeK * dt);
      layoutCards();
    } else if (deckPos !== deckTarget) {
      deckPos = deckTarget;
      layoutCards();
    }
    /* pointer parallax + idle drift on the whole deck */
    const drift = Math.sin(t * 0.4) * 3;
    const px = motion.spx * 10;
    const py = motion.spy * -7;
    deck.style.transform = `rotateY(${-14 + px + dragRot}deg) rotateX(${5 + py + drift}deg)`;
  });

  /* ---- input handlers: WHEEL — continuous fractional scrubbing ---- */
  wrap.addEventListener("wheel", (e) => {
    if (!open || busy) return;
    e.preventDefault();
    /* map wheel delta to fractional deck steps — 100px = 1 card */
    const stepSize = 100;
    const dp = e.deltaY / stepSize;
    /* if filter is active, still snap to visible next/prev on decisive gestures */
    if (filterStr && Math.abs(e.deltaY) > 40) {
      const dir = e.deltaY > 0 ? 1 : -1;
      const target = nextVisible(selected, dir);
      select(target);
    } else {
      scrubTo(deckTarget + dp);
    }
  }, { passive: false });

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target === dim) dismiss();
  });

  confirmBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmPort();
  });

  /* ---- drag-to-surf with continuous fractional scrubbing + momentum ---- */
  const stage = $("#port-stage");
  let dragging = false, dragStartX = 0, lastDragX = 0, dragVel = 0, lastDragT = 0, dragStartDeck = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (!open) return;
    if (e.target.closest(".port-card") && e.target.closest(".port-card").classList.contains("front")) return;
    dragging = true;
    dragStartX = lastDragX = e.clientX;
    dragStartDeck = deckTarget;
    dragVel = 0; lastDragT = performance.now();
    wrap.classList.add("dragging");
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastDragX;
    const now = performance.now();
    const dt = Math.max((now - lastDragT) / 1000, 1 / 240);
    dragVel = dx / dt;
    lastDragT = now;
    lastDragX = e.clientX;
    /* drag → fractional deck position (drag right = go backward through the stack) */
    const totalDx = e.clientX - dragStartX;
    const pxPerCard = 90;
    scrubTo(dragStartDeck - totalDx / pxPerCard);
    dragRot = Math.max(-14, Math.min(14, totalDx / 20));
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove("dragging");
    stage.releasePointerCapture?.(e.pointerId);
    /* momentum: use release velocity for extra glide, then snap to nearest */
    const glide = Math.max(-5, Math.min(5, -dragVel / 700));
    if (Math.abs(glide) > 0.2) {
      const rounded = Math.round(deckTarget + glide);
      select(Math.max(0, Math.min(NODES.length - 1, rounded)));
    } else {
      select(Math.round(deckTarget)); /* snap to nearest whole card */
    }
    /* ease dragRot back toward neutral */
    const rotState = { r: dragRot };
    animate(rotState, { r: 0, duration: 600, ease: "out(3)", onUpdate: () => { dragRot = rotState.r; } });
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  /* ---- click on timeline track to jump to that position ---- */
  track.addEventListener("click", (e) => {
    if (!open || busy) return;
    e.stopPropagation();
    const r = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const target = Math.round(pct * (NODES.length - 1));
    select(target);
  });

  /* keyboard when open */
  window.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (filterStr) { filterStr = ""; applyFilter(); return; } /* first Esc clears filter */
      dismiss(); return;
    }
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); confirmPort(); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); select(filterStr ? nextVisible(selected, 1) : selected + 1); return; }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); select(filterStr ? nextVisible(selected, -1) : selected - 1); return; }
    if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); select(0); return; }
    if (e.key === "End") { e.preventDefault(); e.stopPropagation(); select(NODES.length - 1); return; }
    if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); filterStr = filterStr.slice(0, -1); applyFilter(); return; }
    /* printable char → type-to-filter */
    if (e.key.length === 1 && /[a-z0-9 +]/i.test(e.key)) {
      e.preventDefault(); e.stopPropagation();
      filterStr += e.key;
      applyFilter();
      return;
    }
  }, true); /* capture so it beats page hotkeys */

  hudOpenBtn.addEventListener("click", summon);
  window.addEventListener("resize", () => { if (open) sizeLivePreviews(); });

  window.__portstack = { summon, dismiss, confirmPort, select };
})();

/* ================================================================
   29. STATEMENT MODULE (pinned typography, scroll-driven words)
================================================================ */

(function statementModule() {
  const wrap = $("#stmt-wrap");
  const words = $$(".stmt-word");
  const pctEl = $("#stmt-pct");
  let lastPct = -1;
  updaters.push(() => {
    const r = wrap.getBoundingClientRect();
    if (r.top > motion.vh || r.bottom < 0) return;
    const p = clamp01(-r.top / (r.height - motion.vh));
    words.forEach((w, i) => {
      /** each word maps to a slice of the progress; ~0.5 full reveal per word */
      const wp = clamp01(p * (words.length + 1) - i * 0.8);
      w.style.opacity = String(0.08 + 0.92 * wp);
      w.style.transform = `translateY(${(1 - wp) * 28}px)`;
    });
    const pct = Math.round(p * 100);
    if (pct !== lastPct) { lastPct = pct; pctEl.textContent = `${pad(pct, 3)}%`; }
  });
})();

/* ================================================================
   30. CURSOR COORDS READOUT (+ click telemetry → debug grid)
================================================================ */

(function coordsReadout() {
  const xEl = $("#t-x");
  const yEl = $("#t-y");
  const tele = $("#tele-bot");
  updaters.push(() => {
    /* normalized -1..1 → raw device pixels */
    const x = Math.round(((motion.spx + 1) / 2) * motion.vw);
    const y = Math.round(((motion.spy + 1) / 2) * motion.vh);
    xEl.textContent = pad(x, 4);
    yEl.textContent = pad(y, 4);
  });
  if (tele) {
    tele.style.cursor = "crosshair";
    tele.addEventListener("click", () => window.__toggleDebug?.());
  }
})();

/* ================================================================
   31. LOCAL TIME (GMT±X) next to the UTC clock
================================================================ */

(function localTime() {
  const el = $("#hud-local");
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const off = -d.getTimezoneOffset() / 60;
    const sign = off >= 0 ? "+" : "-";
    el.textContent = `GMT${sign}${Math.abs(off)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
  };
  tick();
  window.setInterval(tick, 1000);
})();

/* ================================================================
   32. AMBIENT SOUND BUTTON (+ level indicator)
================================================================ */

(function soundButton() {
  const btn = $("#sound-open");
  const label = $("#snd-label");
  btn.addEventListener("click", () => window.__toggleSynth?.());
  /* poll sound state — toggleSynth is async */
  window.setInterval(() => {
    const on = window.__isSoundOn?.() ?? false;
    btn.classList.toggle("on", on);
    label.textContent = on ? "SOUND ON" : "SOUND OFF";
  }, 300);
})();

/* ================================================================
   33. VELOCITY → VARIABLE FONT WEIGHT
================================================================ */

(function velocityWeight() {
  if (motion.reduced) return;
  updaters.push(() => {
    const v = Math.min(Math.abs(motion.velocity) / 6000, 1);
    const w = 300 + v * 400;
    $$(".velo-wght").forEach((el) => el.style.setProperty("--velo-wght", String(Math.round(w))));
  });
})();

/* ================================================================
   34. SIGNATURE DRAW — stroke-dashoffset, staggered, in-view trigger
================================================================ */

(function signatureDraw() {
  const svg = $("#sig-draw");
  const paths = Array.from(svg.querySelectorAll(".sig-path"));
  let played = false;
  function draw() {
    if (played) return;
    played = true;
    paths.forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
    });
    if (motion.reduced) {
      paths.forEach((p) => { p.style.strokeDashoffset = "0"; });
      return;
    }
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      animate(p, {
        strokeDashoffset: [len, 0],
        duration: 900,
        ease: "inOut(2)",
        delay: i * 180,
      });
    });
  }
  new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) draw(); }), { rootMargin: "-20% 0px" }).observe(svg);
})();

/* ================================================================
   35. REDACTED / CLASSIFIED BLOCK (passcode gate)
================================================================ */

(function redacted() {
  const openBtn = $("#redact-open");
  const field = $("#redact-field");
  const input = $("#redact-input");
  const revealed = $("#redact-revealed");
  const CODES = new Set(["v0.1", "0.1", "01", "strng", "strngui"]);
  const KEY = "declassified";

  function reveal(fromSave = false) {
    openBtn.classList.add("hidden");
    field.classList.add("hidden");
    revealed.classList.remove("hidden");
    if (!fromSave) pushStatus("ACCESS GRANTED · DOCUMENT DECLASSIFIED", "ok");
    localStorage.setItem(KEY, "1");
  }
  if (localStorage.getItem(KEY) === "1") {
    reveal(true);
    return;
  }
  openBtn.addEventListener("click", () => {
    openBtn.classList.add("hidden");
    field.classList.remove("hidden");
    input.focus();
    pushStatus("ACCESS CODE REQUIRED", "warn");
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const code = input.value.trim().toLowerCase();
      if (CODES.has(code)) { reveal(); }
      else {
        input.value = "";
        input.style.borderColor = "#ff4d4d";
        pushStatus("ACCESS DENIED · TRY AGAIN", "warn");
        setTimeout(() => (input.style.borderColor = ""), 600);
      }
    } else if (e.key === "Escape") {
      field.classList.add("hidden");
      openBtn.classList.remove("hidden");
    }
    e.stopPropagation();
  });
})();

/* ================================================================
   36. FOREGROUND INK TRAIL (cursor smear, screen-blend overlay)
================================================================ */

(function inkTrail() {
  if (motion.reduced) return;
  const canvas = $("#ink-trail");
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0;
  const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
  resize();
  window.addEventListener("resize", resize);

  const blobs = [];
  let accent = [200, 255, 46];
  /* sync accent from the css var each ~1s */
  window.setInterval(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--acid-rgb");
    if (raw) accent = raw.trim().split(" ").map(Number);
  }, 1000);

  window.addEventListener("pointermove", (e) => {
    const v = Math.min(Math.abs(motion.pointerV) / 4000, 1);
    const r = 6 + v * 26;
    blobs.push({ x: e.clientX + (Math.random() - 0.5) * 8, y: e.clientY + (Math.random() - 0.5) * 8, r, life: 1, decay: 1.4 + Math.random() });
    if (blobs.length > 48) blobs.shift();
  });

  updaters.push((dt) => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i];
      b.life -= b.decay * dt;
      if (b.life <= 0) { blobs.splice(i, 1); continue; }
      const a = b.life * 0.13;
      const rad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * (2 - b.life));
      rad.addColorStop(0, `rgba(${accent[0]},${accent[1]},${accent[2]},${a})`);
      rad.addColorStop(1, `rgba(${accent[0]},${accent[1]},${accent[2]},0)`);
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (2 - b.life), 0, Math.PI * 2);
      ctx.fill();
    }
  });
})();

/* ================================================================
   37. CONSOLE SIGNATURE
================================================================ */

(function signature() {
  const banner = [
    "", "  ██████╗████████╗██████╗ ██╗███╗   ██╗ ██████╗ ",
    " ██╔════╝╚══██╔══╝██╔══██╗██║████╗  ██║██╔════╝ ",
    " ╚█████╗    ██║   ██████╔╝██║██╔██╗ ██║██║  ███╗",
    "  ╚═══██╗   ██║   ██╔══██╗██║██║╚██╗██║██║   ██║",
    " ██████╔╝   ██║   ██║  ██║██║██║ ╚████║╚██████╔╝",
    " ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ",
    "", " STRINGTUNE × THREE.JS — one file, zero framework", "",
  ].join("\n");
  console.log("%c" + banner, "color:#c8ff2e;font-family:monospace;line-height:1.05");
  console.log("%cPress %c?%c anywhere for hotkeys · %c⌘K%c for the command palette · try the Konami code", "color:#8e8e96;font-family:monospace", "color:#c8ff2e;font-weight:700", "color:#8e8e96;font-family:monospace", "color:#c8ff2e;font-weight:700", "color:#8e8e96;font-family:monospace");
  console.log("%cbuild · 2026 · " + navigator.userAgent.split(") ").pop(), "color:#3a3a44;font-family:monospace;font-size:11px");
})();

void booted;
