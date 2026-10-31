import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import * as A from "../../.claude/skills/anatomy/kit/audit.mjs";
import { tubePieces, tubeSvg } from "../../.claude/skills/anatomy/kit/tube.mjs";
import { glCamera } from "../../.claude/skills/anatomy/kit/gl.mjs";
import { kitScript, glScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const E = M.ENGINE;
const TAU = Math.PI * 2;

const W = 640;
const H = 610;
const AZIMUTH = 62;
const BENCH = -88;
const PLATE = { x: -214, y: -92, w: 428, d: 156, r: 10 };
const PLATE_H = 12;
const FOOT_H = 6;

// Trem de engrenagens: 25 dentes no virabrequim, 50 em cada comando (2:1).
const GEAR = { crank: 20, cam: 40, module: 1.6, teethCrank: 25, teethCam: 50, back: -15, front: -9 };
const CAM = { x: 59, z: Math.sqrt(60 * 60 - 59 * 59), base: 11, roller: 5 };
const ROLLER_Z = CAM.z + CAM.base + CAM.roller;
const TAPPET_LEN = 38;
const PUSH_TOP = 216.5;
const VALVE = { x: 17, seat: 155, tip: 224, head: 14, stem: 3, seatTop: 200, retainer: 216 };
const ROCKER = { x: (CAM.x + VALVE.x) / 2, arm: (CAM.x - VALVE.x) / 2, drop: 5 };
ROCKER.z = (PUSH_TOP + VALVE.tip) / 2 + ROCKER.drop;
const DISC = { r: 52, back: -24, front: -16 };
const ROD = { big: 11.5, small: 8, half: 7, pin: 5.2 };
const CROWN = M.crownHeight(0);
const PIN_Z = M.pinHeight(0);
const SKIRT = PIN_Z - 20;
const R_BORE = E.bore / 2;
const WINDOW = { from: ((AZIMUTH - 40) * Math.PI) / 180, to: ((AZIMUTH + 40) * Math.PI) / 180, top: 126 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, BENCH - PLATE_H - FOOT_H, BENCH), [0, 0, 272], [-188, -42, 206], [196, -42, 44]],
  W,
  H,
  { pad: 14, azimuth: AZIMUTH },
);
const KS = G.scaleOf(P);

const f2 = (value) => Math.round(value * 100) / 100;
const f3 = (value) => Math.round(value * 1000) / 1000;
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const sec = (x, z, y = 0) => at([x, y, z]);
const poly = (points, y = 0, closed = true) => k.pathOf(points.map(([x, z]) => sec(x, z, y)), closed);
const seg = (a, b, y = 0) => k.pathOf([sec(a[0], a[1], y), sec(b[0], b[1], y)]);
const XV = k.axisVector(P, [1, 0, 0]);
const ZV = k.axisVector(P, [0, 0, 1]);
const matrixAt = (x, z, y) => {
  const [ox, oy] = at([x, y, z]);
  return `matrix(${f3(XV[0])} ${f3(XV[1])} ${f3(ZV[0])} ${f3(ZV[1])} ${f2(ox)} ${f2(oy)})`;
};
const flat = (points, closed = true) => points.map(([u, v], index) => `${index ? "L" : "M"}${f2(u)} ${f2(v)}`).join("") + (closed ? "Z" : "");
const circle = (cx, cy, r, n = 48) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * TAU), cy + r * Math.sin((i / n) * TAU)]);
const arc = (cx, cz, r, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
});
const area = (ring) => ring.reduce((sum, [ax, ay], index) => {
  const [bx, by] = ring[(index + 1) % ring.length];
  return sum + ax * by - bx * ay;
}, 0) / 2;
const ccw = (ring) => (area(ring) < 0 ? [...ring].reverse() : ring);
const FY = (x, z) => G.frameAlong([x, 0, z], [0, 1, 0]);
const FZ = (x, y) => G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const FX = (y, z) => G.frameAlong([0, y, z], [1, 0, 0]);
const FLAT_Y = G.frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const box = (x0, x1, z0, z1, y0, y1) => G.prismOf(FLAT_Y, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, P);

function spline(points, per = 6) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// ---- Seção de corte, no plano y = 0 ----
const roof = (x) => E.deck + 10.4 * (1 - (x / R_BORE) ** 2);
const roofRun = (from, to, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
  const x = from + ((to - from) * i) / n;
  return [x, roof(x)];
});
const PORT = spline([[29, roof(29)], [30.5, 160], [35, 167], [43, 170], [46, 174], [46.6, 181], [44, 188], [36, 191], [24, 191], [14, 186], [8, 176], [5.2, 166], [5, roof(5)]]);
const PORT_LEFT = [...PORT].reverse().map(([x, z]) => [-x, z]);
const HOLE = [
  [34, 58],
  [34, 147],
  ...roofRun(34, 29, 4),
  ...PORT.slice(1, -1),
  ...roofRun(5, -5, 6),
  ...PORT_LEFT.slice(1, -1),
  ...roofRun(-29, -34, 4),
  [-34, 147],
  [-34, 58],
];
const ISLAND = [[-52.5, 58], [-52.5, 68], [-50.5, 68], [-50.5, 200], [50.5, 200], [50.5, 68], [52.5, 68], [52.5, 58], ...HOLE];
const VOID = [
  ...arc(-98, -50, 12, 180, 270),
  ...arc(98, -50, 12, 270, 360),
  ...arc(98, 46, 12, 0, 90),
  [65.5, 58],
  [65.5, 68],
  [67.5, 68],
  [67.5, 200],
  [84, 200],
  ...arc(78, 240, 6, 0, 90),
  ...arc(-78, 240, 6, 90, 180),
  [-84, 200],
  [-67.5, 200],
  [-67.5, 68],
  [-65.5, 68],
  [-65.5, 58],
  ...arc(-98, 46, 12, 90, 180),
];
const comb = (root, tip, z0, count, pitch, thick) => {
  const out = [];
  for (let i = 0; i < count; i++) {
    const z = z0 + i * pitch;
    out.push([root, z], [tip, z], [tip, z + thick], [root, z + thick]);
  }
  return out;
};
const RIGHT = [[118, -72], [118, 68], [96, 68], [96, 73], [72, 73], ...comb(72, 92, 75, 10, 7, 3), [72, 143], [92, 143], [92, 147], [98, 147], [98, 200], [92, 200], [92, 204], [88, 204], [88, 250]];
const OUTER = [...RIGHT, ...[...RIGHT].reverse().map(([x, z]) => [-x, z])];
const WELL = [[[-8.6, 200], [-7, 200], [-7, 250], [-8.6, 250]], [[7, 200], [8.6, 200], [8.6, 250], [7, 250]]];

// ---- Peças que giram: desenhadas planas em (u, v) e giradas por transformação ----
function gearOutline(teeth, pitch, m) {
  const root = pitch - 1.25 * m;
  const tip = pitch + m;
  const step = TAU / teeth;
  const out = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [r, d] of [[root, -0.3], [tip, -0.15], [tip, 0.15], [root, 0.3]]) out.push([r * Math.cos(a + d * step), r * Math.sin(a + d * step)]);
  }
  return out;
}
const CRANK_GEAR = gearOutline(GEAR.teethCrank, GEAR.crank, GEAR.module);
const CAM_GEAR = gearOutline(GEAR.teethCam, GEAR.cam, GEAR.module);
const mesh = (delta) => {
  const pitch1 = TAU / GEAR.teethCrank;
  const near = Math.round(delta / pitch1);
  const e1 = delta - near * pitch1;
  const linear = (TAU * GEAR.crank) / GEAR.teethCrank;
  const e2 = (linear / 2 - e1 * GEAR.crank) / GEAR.cam;
  return ((delta + Math.PI - e2) * 180) / Math.PI;
};
const CAMS = [
  { id: "in", side: -1, x: -CAM.x, z: CAM.z, phase: mesh(Math.atan2(CAM.z, -CAM.x)), lift: M.intakeLift, centre: M.intakeCentre },
  { id: "ex", side: 1, x: CAM.x, z: CAM.z, phase: mesh(Math.atan2(CAM.z, CAM.x)), lift: M.exhaustLift, centre: M.exhaustCentre },
];

// Perfil do ressalto: curva primitiva do rolete, deslocada para dentro pelo raio do rolete.
function lobeRing(lift) {
  const count = 180;
  const pitch = (beta) => {
    const theta = 2 * (90 - beta);
    const r = CAM.base + CAM.roller + lift(theta);
    const a = (beta * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const beta = (i / count) * 360;
    const [x, y] = pitch(beta);
    const [ax, ay] = pitch(beta - 0.5);
    const [bx, by] = pitch(beta + 0.5);
    const tx = bx - ax;
    const ty = by - ay;
    const length = Math.hypot(tx, ty) || 1;
    out.push([f2(x - (ty / length) * CAM.roller), f2(y + (tx / length) * CAM.roller)]);
  }
  return ccw(out);
}

const ROD_RING = ccw(G.hullOf([...circle(0, 0, ROD.big, 40), ...circle(0, E.rod, ROD.small, 32)])).map(([x, y]) => [f2(x), f2(y)]);
const ROCKER_RING = ccw(G.hullOf([...circle(0, 0, 6.6, 28), ...circle(ROCKER.arm, -ROCKER.drop + 1.8, 2.8, 16), ...circle(-ROCKER.arm, -ROCKER.drop + 1.8, 2.8, 16)])).map(([x, y]) => [f2(x), f2(y)]);

const live = (name, { tone = "hi", lit = false, crease = "faint" } = {}) =>
  `<g class="iso-solid" data-live="${name}"${lit ? " data-lit" : ""}><path class="iso-fill"/><path class="iso-shade" data-shade="0"/><path class="iso-shade" data-shade="1"/><path class="iso-shade" data-shade="2"/><path class="iso-shade" data-shade="3"/><path class="iso-top"/><path class="iso-line iso-crease" data-tone="${crease}"/><path class="iso-line iso-edge" data-tone="${tone}"/></g>`;

// ---- Bancada e exterior: desenhos fixos, ordem medida pela auditoria ----
const R = A.recorder(P);
const put = (name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) => R.put({ name, at: ref, bias, svg, shapes, piece: "engine", ...rest });
const shapeZ = (ring, z, h, name) => R.solid(A.extruded(ring, z, h, { name }));
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function halfPlan(hw, depth, r, n = 8) {
  const left = arc(-hw + r, -depth + r, r, 180, 270, n).map(([x, y]) => [x, y]);
  const right = arc(hw - r, -depth + r, r, 270, 360, n).map(([x, y]) => [x, y]);
  return [[hw, 0], [-hw, 0], ...left, ...right];
}

function bench() {
  const shapes = [];
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, BENCH - PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 8, BENCH - PLATE_H - FOOT_H, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, BENCH - PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 28), { tone: "mid" }));
    shapes.push(R.solid(A.cylinder(x, y, 8, BENCH - PLATE_H - FOOT_H, FOOT_H, { name: "stand.foot" })));
  }
  out.push(S(k.slabOf(PLATE, BENCH - PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  shapes.push(R.solid(A.slab(PLATE, BENCH - PLATE_H, PLATE_H, { name: "stand.plate" })));
  out.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), BENCH, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.4, BENCH, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, BENCH])), { size: 0.55 }));
  const strip = { x: -196, y: PLATE.y + PLATE.d - 17, w: 392, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, BENCH, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, BENCH + 0.6, [2.2, 4], P);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 4, BENCH + 0.6]), at([strip.x + strip.w - 2, strip.y + 4, BENCH + 0.6])], { size: 0.45 }));
  const label = { x: -192, y: 2, w: 72, d: 30, r: 2 };
  out.push(S(k.slabOf(label, BENCH, 0.8, P, 4), { tone: "lo" }));
  out.push(Ln(k.planOutline(k.insetPlan(label, 1.8), BENCH + 0.8, P, 3), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 6, label.y + 12], BENCH + 0.8, P, "x"), "196 cm³ · 8,5:1", { size: 5, tone: "mid" }));
  out.push(Ln([20, 25].map((y) => k.lineOnTop([label.x + 6, label.y + y], [label.x + (y === 20 ? 48 : 34), label.y + y], BENCH + 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + 4, label.y + 4, BENCH + 0.8]), at([label.x + label.w - 4, label.y + 4, BENCH + 0.8])], { size: 0.45 }));
  for (const y of [-66, -22]) {
    const rail = { x: -140, y, w: 280, d: 20, r: 2 };
    out.push(S(k.slabOf(rail, BENCH, 5, P, 3, 0.5), { tone: "mid" }));
    shapes.push(R.solid(A.slab(rail, BENCH, 5, { name: "stand.rail" })));
    out.push(D([-132, 132].map((x) => at([x, y + 10, BENCH + 5])), { size: 0.5 }));
  }
  put("stand.bench", [0, 0, BENCH - 3], out.join(""), shapes, { bias: -400 });
}

function engineBody() {
  const shapes = [];
  const out = [];
  const zPrism = (ring, z, h, tone, name, options = {}) => {
    const { bevel = 0, inner = "" } = options;
    out.push(S(k.extrude(ring, z, h, P, { bevel }), { tone, inner }));
    shapes.push(shapeZ(ring, z, h, name));
  };
  const lug = (x) => {
    const plan = { x: x - 16, y: -70, w: 32, d: 70, r: 2 };
    out.push(S(k.slabOf(plan, BENCH + 5, 11, P, 3, 0.6), { tone: "mid" }));
    shapes.push(R.solid(A.slab(plan, BENCH + 5, 11, { name: "stand.lug" })));
    out.push(D([[x - 9, -56], [x + 9, -56], [x - 9, -12], [x + 9, -12]].map(([px, py]) => at([px, py, BENCH + 16])), { size: 0.55 }));
    out.push(Ln([[x - 9, -56], [x + 9, -56], [x - 9, -12], [x + 9, -12]].map(([px, py]) => k.ring(px, py, 2.4, BENCH + 16, P, 14)).join(""), { tone: "lo" }));
  };
  lug(-108);
  lug(108);
  const caseRing = halfPlan(118, 66, 14);
  const ribs = [-8, -22, -36, -50].map((y) => k.segment([118, y, -72], [118, y, 68], P)).join("");
  zPrism(caseRing, -72, 140, "mid", "stand.case", { bevel: 1, inner: Ln(ribs, { tone: "faint" }) + Ln(k.ringSeam(caseRing, 40, P), { tone: "lo" }) });
  out.push(D([[100, -10], [100, -30], [100, -50], [80, -56], [40, -56], [-20, -56], [-60, -56], [60, -56]].map(([x, y]) => at([x, y, 68])), { size: 0.5 }));
  const flangeRing = halfPlan(96, 72, 26);
  zPrism(flangeRing, 68, 5, "mid", "stand.base", { bevel: 0.5 });
  const coreRing = halfPlan(72, 60, 30);
  const finRing = halfPlan(92, 76, 38, 12);
  let z = 73;
  for (let i = 0; i < 10; i++) {
    zPrism(coreRing, z, 75 + i * 7 - z, "lo", "stand.core");
    zPrism(finRing, 75 + i * 7, 3, "mid", "stand.fin");
    z = 78 + i * 7;
  }
  zPrism(coreRing, z, 143 - z, "lo", "stand.core");
  zPrism(halfPlan(92, 76, 38, 12), 143, 4, "mid", "stand.deck", { bevel: 0.5 });
  const headRing = halfPlan(98, 78, 30, 12);
  const headLines = [160, 172, 184].map((h) => k.ringSeam(headRing, h, P)).join("");
  zPrism(headRing, 147, 53, "mid", "stand.head", { bevel: 0.8, inner: Ln(headLines, { tone: "faint" }) });
  zPrism(halfPlan(92, 72, 28, 10), 200, 4, "mid", "stand.flange", { bevel: 0.5 });
  const coverRing = halfPlan(88, 68, 24, 10);
  zPrism(coverRing, 204, 46, "mid", "stand.cover", { bevel: 1.2, inner: Ln(k.ringSeam(coverRing, 214, P), { tone: "faint" }) });
  const top = 250;
  const bolts = [[-70, -16], [-20, -16], [20, -16], [70, -16], [-60, -52], [0, -52], [60, -52]];
  out.push(Ln(bolts.map(([x, y]) => k.ring(x, y, 2.6, top, P, 14)).join(""), { tone: "lo" }));
  out.push(D(bolts.map(([x, y]) => at([x, y, top])), { size: 0.6 }));
  out.push(Ln(k.onTop(halfPlan(82, 62, 20, 8), top, P, true), { tone: "faint" }));
  out.push(D([[-92, -40], [-40, -74], [40, -74], [92, -40]].map(([x, y]) => at([x, y, 200 + 4])), { size: 0.45 }));
  put("stand.engine", [0, -30, 90], out.join(""), shapes, { bias: -200 });
}

function stack(name, F, list, tone = "mid") {
  const shapes = [];
  const out = [];
  list.forEach(([s0, s1, r, t]) => {
    out.push(S(G.disc(s0, s1, r, F, P), { tone: t ?? tone }));
    shapes.push(R.solid(A.disc(F, s0, s1, r, { name })));
  });
  return { svg: out.join(""), shapes };
}

function pipe(name, points, r, { bend = r * 2.6, tone = "hi", free, limp = false, maxLength = 26, caps, rings, touch } = {}) {
  const route = G.fillet(points, bend, 8, { P, tube: r });
  R.route(name, route, r, { piece: "engine", free, limp, touch });
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.8, Math.min(2, r)), ...(caps ? { caps } : {}), ...(rings ? { rings } : {}) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { route: name, chunk: index }),
  );
  return route;
}

function flangeX(name, x0, x1, y, z, r, boltR) {
  const F = FX(y, z);
  const paths = G.disc(x0, x1, r, F, P);
  const face = Math.max(x0, x1);
  const shape = R.solid(A.disc(F, x0, x1, r, { name }));
  put(name, [(x0 + x1) / 2, y, z], S(paths, { tone: "mid" }) + (boltR ? D(G.dotsOf(F, face, boltR, 6, P, { all: true }), { size: 0.5 }) : ""), [shape]);
}

function intake() {
  const y = -42;
  const z = 176;
  const Fc = FX(y, z);
  put("stand.port.in", [-104, y, z], S(G.disc(-108, -98, 13, Fc, P), { tone: "mid" }), [R.solid(A.disc(Fc, -108, -98, 13, { name: "stand.port.in" }))]);
  flangeX("in.flange", -112, -108, y, z, 16, 12);
  pipe("in.runner", [[-112, y, z], [-124, y, z]], 8, { caps: [false, false], tone: "hi" });
  const carb = stack("in.carb", Fc, [[-146, -143, 12, "mid"], [-143, -127, 15, "hi"], [-127, -124, 11, "mid"]]);
  put("in.carb", [-135, y, z], carb.svg + Ln(G.arcOf(Fc, -135, 15, P), { tone: "faint" }), carb.shapes);
  const Fb = FZ(-133, y);
  const bowl = stack("in.bowl", Fb, [[148.4, 161.4, 11.5, "mid"]]);
  put("in.bowl", [-133, y, 150], bowl.svg + Ln(G.arcOf(Fb, 152, 11.5, P), { tone: "faint" }), bowl.shapes.map((shape) => Object.assign(shape, { owner: "in.carb" })), { bias: -0.2 });
  const profile = [[-184, 22], [-182, 28], [-180, 30], [-150, 30], [-148, 28], [-146, 22]];
  const ribs = G.ribsOf(Fc, -176, -154, 30, 64, P, { fade: [0.1, 0.55], seams: true });
  put("in.filter", [-165, y, z], S(G.solidOf(profile, Fc, P), { tone: "hi", inner: k.fadedSvg(ribs, { tone: "lo" }) }), [R.solid(A.solid(Fc, profile, { name: "in.filter" }))]);
  const Fp = FZ(-165, y);
  const postIn = stack("stand.post.in", Fp, [[BENCH, BENCH + 2.4, 10, "lo"], [BENCH + 2.4, 146.2, 4.6, "mid"]]);
  put("stand.post.in", [-165, y, 60], postIn.svg, postIn.shapes);
}

function exhaust() {
  const y = -42;
  const z = 172;
  const X = 156;
  put("stand.port.ex", [104, y, z], S(G.disc(98, 110, 14, FX(y, z), P), { tone: "mid" }) + D(G.dotsOf(FX(y, z), 110, 11, 6, P, { all: true }), { size: 0.45 }), [R.solid(A.disc(FX(y, z), 98, 110, 14, { name: "stand.port.ex" }))]);
  const top = 118;
  pipe("ex.header", [[110, y, z], [X, y, z], [X, y, top]], 8.5, { bend: 26, caps: [false, false], tone: "hi" });
  const F = FZ(X, y);
  const body = [[20, 18], [24, 25], [112, 25], [116, 19], [118, 12]];
  const ribs = G.ribsOf(F, 36, 100, 25, 56, P, { fade: [0.1, 0.55], seams: true });
  const muffler = R.solid(A.solid(F, body, { name: "ex.muffler" }));
  put("ex.muffler", [X, y, 70], S(G.solidOf(body, F, P), { tone: "hi", inner: k.fadedSvg(ribs, { tone: "lo" }) }), [muffler]);
  const Ft = FX(y, 44);
  put("ex.boss", [X + 27, y, 44], S(G.disc(X + 22, X + 30, 7.4, Ft, P), { tone: "mid" }), [R.solid(A.disc(Ft, X + 22, X + 30, 7.4, { name: "ex.boss", seated: true, cut: [muffler] }))]);
  put("ex.tip", [X + 46, y, 44], S(G.disc(X + 44, X + 47, 6.4, Ft, P), { tone: "mid" }) + Ln(G.circleOf(Ft, X + 47, 4.2, P, 24), { tone: "lo" }), [R.solid(A.disc(Ft, X + 44, X + 47, 6.4, { name: "ex.tip" }))]);
  const postEx = stack("stand.post.ex", F, [[BENCH, BENCH + 2.4, 12, "lo"], [BENCH + 2.4, 20, 6, "mid"]]);
  put("stand.post.ex", [X, y, -30], postEx.svg, postEx.shapes);
  pipe("ex.tail", [[X + 30, y, 44], [X + 44, y, 44]], 5, { tone: "hi", caps: [false, false] });
}

function ignition() {
  const y = -34;
  const z = 262;
  const plan = { x: -74, y: -48, w: 46, d: 28, r: 2 };
  put("stand.coil.bracket", [-52, y, 251], S(k.slabOf(plan, 250, 3, P, 3, 0.4), { tone: "mid" }) + D([[-70, -44], [-32, -44], [-70, -24], [-32, -24]].map(([px, py]) => at([px, py, 253])), { size: 0.5 }), [R.solid(A.slab(plan, 250, 3, { name: "stand.coil.bracket" }))]);
  const F = FX(y, z);
  const coil = stack("ign.coil", F, [[-72, -36, 9.5, "hi"], [-36, -33, 6.5, "mid"], [-33, -27, 3.6, "mid"]]);
  put("ign.coil", [-50, y, z], coil.svg + Ln(G.arcOf(F, -60, 9.5, P) + G.arcOf(F, -46, 9.5, P), { tone: "faint" }), coil.shapes);
  for (const x of [-62, -44]) {
    const strap = { x: x - 2, y: y - 10.5, w: 4, d: 21, r: 0.8 };
    put("stand.coil.strap", [x, y, 252], S(k.slabOf(strap, 253, 3, P, 2), { tone: "mid", crease: "none" }), [R.solid(A.slab(strap, 253, 3, { name: "stand.coil.strap", owner: "ign.coil" }))]);
  }
  R.solid(A.disc(FZ(0, 0), 250, 268, 6.6, { name: "stand.cap" }));
  pipe("ign.lead", [[-27, y, z], [0, y, z], [0, -6.5, z]], 1.5, { bend: 16, tone: "mid", limp: true, maxLength: 12, caps: [false, false] });
}

const GAUGE = { x: 164, y: 28, puck: -54, r: 26 };
function gauge() {
  const { x, y, puck, r: dial } = GAUGE;
  const face = puck + 12;
  const out = [];
  const Fp = FZ(x, y);
  const post = stack("stand.gauge.post", Fp, [[BENCH, BENCH + 2.4, 13, "lo"], [BENCH + 2.4, puck, 7.5, "mid"]]);
  out.push(post.svg);
  out.push(S(k.cylinder(x, y, dial, puck, 12, P, 72, 0.8), { tone: "hi", crease: "lo" }));
  const shapes = [...post.shapes, R.solid(A.cylinder(x, y, dial, puck, 12, { name: "gauge.body" }))];
  out.push(Ln(k.knurl(x, y, dial, face - 4, face, 110, P, 0.3), { tone: "lo" }));
  out.push(Ln(k.sideArc(x, y, dial, face - 4, P, 48), { tone: "faint" }));
  out.push(Ln(k.ring(x, y, dial - 2.4, face, P, 72), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, dial - 3.4, 50, 10, face, [1.5, 3.4], P, -135 * (Math.PI / 180), 270 * (Math.PI / 180));
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 13], face, P, "x"), "bar", { size: 3.6, tone: "lo", anchor: "middle" }));
  put("gauge", [x, y, puck], out.join(""), shapes);
  const sensorF = FX(-12, 158);
  const sensor = stack("sensor", sensorF, [[98, 102, 7, "mid"], [102, 112, 4.2, "mid"], [112, 115, 2.2, "hi"]]);
  put("sensor", [104, -12, 158], sensor.svg, sensor.shapes);
  pipe("sensor.cable", [[115, -12, 158], [124, -12, 158], [124, -12, -48], [124, y, -48], [x - dial, y, -48]], 1.1, { bend: 8, tone: "mid", limp: true, maxLength: 20, caps: [false, false] });
}

bench();
engineBody();
intake();
exhaust();
ignition();
gauge();
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

// ---- Cavidades, atrás da camada de gás ----
const boreF = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const boreArcs = [64, 84, 104, 124, 142].map((z) => G.arcOf(boreF, z, R_BORE, P, { inward: true, trim: 0 })).join("");
const cavity = `<clipPath id="mt-void"><path d="${poly(VOID)}"/></clipPath><clipPath id="mt-hole"><path d="${poly(HOLE)}"/></clipPath>
<linearGradient id="mt-bore-grad" gradientUnits="userSpaceOnUse" x1="${f2(sec(-34, 100)[0])}" y1="0" x2="${f2(sec(34, 100)[0])}" y2="0"><stop offset="0" style="stop-color:var(--mt-bore-0)"/><stop offset=".55" style="stop-color:var(--mt-bore-1)"/><stop offset="1" style="stop-color:var(--mt-bore-2)"/></linearGradient>
<g class="mt-cav"><path class="mt-wall" d="${poly(OUTER)}"/>
<g clip-path="url(#mt-void)"><path class="mt-back" d="${poly(VOID, -30)}"/>${Ln(poly(VOID, -30), { tone: "lo" })}</g>
<path d="${poly(HOLE)}" fill="url(#mt-bore-grad)"/>
<g clip-path="url(#mt-hole)">${Ln(boreArcs, { tone: "lo" })}<path class="mt-fb" data-fallback/><path class="mt-fb-port" data-fb-port="in" d="${poly(PORT_LEFT)}"/><path class="mt-fb-port" data-fb-port="ex" d="${poly(PORT)}"/></g></g>`;

// ---- Peças fundas, antes da face de corte ----
const planeDisc = matrixAt(0, 0, DISC.front);
const tickRing = (() => {
  const minor = [];
  const major = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU + Math.PI / 2;
    const big = i % 6 === 0;
    const from = DISC.r - (big ? 5 : 2.6);
    (big ? major : minor).push(flat([[from * Math.cos(a), from * Math.sin(a)], [(DISC.r - 0.4) * Math.cos(a), (DISC.r - 0.4) * Math.sin(a)]], false));
  }
  return { minor: minor.join(""), major: major.join("") };
})();
const pocket = flat([...arc(0, 0, 42, 205, 335, 28), ...arc(0, 0, 25, 335, 205, 20)]);
const discArt = `<g data-spin="disc" data-m="${planeDisc}">
<path class="mt-recess" d="${pocket}"/><path class="iso-line" data-tone="lo" d="${pocket}"/>
<path class="mt-recess" d="${flat(circle(-38, 22, 5.5, 24))}${flat(circle(38, 22, 5.5, 24))}"/><path class="iso-line" data-tone="lo" d="${flat(circle(-38, 22, 5.5, 24))}${flat(circle(38, 22, 5.5, 24))}"/>
<path class="iso-line" data-tone="lo" d="${tickRing.minor}"/><path class="iso-line" data-tone="mid" d="${tickRing.major}"/>
<path class="mt-mark" d="${flat([[0, DISC.r - 1], [-3, DISC.r - 8], [3, DISC.r - 8]])}"/>
</g>`;
const discBody = S(G.disc(DISC.back, DISC.front, DISC.r, FY(0, 0), P), { tone: "mid" });

const spinCopy = (name, x, z, y, d, cls) => `<g data-spin="${name}" data-m="${matrixAt(x, z, y)}"><path class="${cls}" d="${d}"/></g>`;
function gearArt(name, x, z, ring, decor) {
  const d = flat(ring);
  const copies = [GEAR.back, GEAR.back + 2, GEAR.back + 4].map((y) => spinCopy(name, x, z, y, d, "mt-gear-side")).join("");
  return `${copies}<g data-spin="${name}" data-m="${matrixAt(x, z, GEAR.front)}"><path class="mt-gear" d="${d}"/>${decor}</g>`;
}
const camDecor = (() => {
  const holes = Array.from({ length: 5 }, (_, i) => flat(circle(24 * Math.cos((i / 5) * TAU), 24 * Math.sin((i / 5) * TAU), 6.4, 24))).join("");
  return `<path class="mt-recess" d="${holes}"/><path class="iso-line" data-tone="lo" d="${holes}"/><path class="iso-line" data-tone="faint" d="${flat(circle(0, 0, 34, 64))}"/><circle class="mt-dot" cx="0" cy="32" r="1.1"/>`;
})();
const crankDecor = `<path class="iso-line" data-tone="lo" d="${flat(circle(0, 0, 13, 36))}"/><path class="iso-line" data-tone="lo" d="${flat(circle(0, 0, 6, 24))}"/>${Array.from({ length: 6 }, (_, i) => `<circle class="mt-dot" cx="${f2(9.6 * Math.cos((i / 6) * TAU))}" cy="${f2(9.6 * Math.sin((i / 6) * TAU))}" r=".8"/>`).join("")}`;
const gears = gearArt("crank", 0, 0, CRANK_GEAR, crankDecor) + CAMS.map((cam) => gearArt(`cam-${cam.id}`, cam.x, cam.z, CAM_GEAR, camDecor)).join("");

// ---- Face de corte ----
const cutPath = [poly(OUTER), poly(VOID), poly(ISLAND), ...WELL.map((ring) => poly(ring))].join("");
const seams = [
  seg([-50.5, 147], [-34, 147]),
  seg([34, 147], [50.5, 147]),
  seg([67.5, 147], [92, 147]),
  seg([-92, 147], [-67.5, 147]),
  seg([67.5, 68], [96, 68]),
  seg([-96, 68], [-67.5, 68]),
  seg([67.5, 200], [84, 200]),
  seg([-84, 200], [-67.5, 200]),
].join("");
const studs = [-70, 70].map((x) => seg([x, 68], [x, 147])).join("");
const guides = [-1, 1].flatMap((side) => [-3.4, 3.4].map((d) => seg([side * VALVE.x + d, 186], [side * VALVE.x + d, 200]))).join("");
const rim = [[-108, -66], [-60, -66], [0, -66], [60, -66], [108, -66], [114, -20], [114, 30], [-114, -20], [-114, 30]];
const ruler = (() => {
  const x = 41.5;
  const minor = [];
  const major = [];
  for (let s = 0; s <= E.stroke; s += 2) {
    const big = s % 10 === 0;
    const z = CROWN - s;
    (big ? major : minor).push(seg([x, z], [x + (big ? 4.2 : 2.4), z]));
  }
  const ends = [seg([x, CROWN], [x + 7, CROWN]), seg([x, CROWN - E.stroke], [x + 7, CROWN - E.stroke])].join("");
  return `<path class="mt-strip" d="${poly([[x, CROWN + 2], [x + 7.6, CROWN + 2], [x + 7.6, CROWN - E.stroke - 2], [x, CROWN - E.stroke - 2]])}"/>${Ln(poly([[x, CROWN + 2], [x + 7.6, CROWN + 2], [x + 7.6, CROWN - E.stroke - 2], [x, CROWN - E.stroke - 2]]), { tone: "lo" })}${Ln(minor.join(""), { tone: "lo" })}${Ln(major.join(""), { tone: "mid" })}${Ln(ends, { tone: "hi" })}`;
})();
const cut = `<path class="mt-cut" fill-rule="evenodd" d="${cutPath}"/>${Ln(cutPath, { tone: "mid" })}${Ln(seams, { tone: "lo" })}${Ln(studs, { tone: "faint" })}${Ln(guides, { tone: "lo" })}${D(rim.map(([x, z]) => sec(x, z)), { size: 0.55 })}${Ln(rim.map(([x, z]) => k.pathOf(circle(x, z, 2.2, 14).map(([u, v]) => sec(u, v)), true)).join(""), { tone: "lo" })}${ruler}`;

// ---- Trem de válvulas ----
function tappet(cam) {
  const x = cam.x;
  const body = box(x - 6, x + 6, ROLLER_Z + 2.6, ROLLER_Z + TAPPET_LEN, -6, 6);
  const F = FY(x, ROLLER_Z);
  const roller = S(G.disc(-5, 5, CAM.roller, F, P), { tone: "hi" }) + Ln(G.circleOf(F, 5, 2, P, 16), { tone: "lo" }) + D([sec(x, ROLLER_Z, 5)], { size: 0.5 });
  const cheeks = box(x - 6, x + 6, ROLLER_Z - 2, ROLLER_Z + 3, -6.4, -5);
  const rod = S(G.solidOf([[ROLLER_Z + TAPPET_LEN, 2.4], [PUSH_TOP - 2, 2.4], [PUSH_TOP - 1, 3.1, 1], [PUSH_TOP, 2.2, 1]], FZ(x, 0), P), { tone: "hi" });
  return `<g data-slide="tappet-${cam.id}">${S(cheeks, { tone: "mid" })}${roller}${S(body, { tone: "hi", inner: Ln(seg([x - 6, ROLLER_Z + 16], [x + 6, ROLLER_Z + 16], 6), { tone: "faint" }) })}${rod}</g>`;
}
function post(cam) {
  const x = cam.side * ROCKER.x;
  const plan = { x: x - 7, y: -10, w: 14, d: 7, r: 1 };
  return S(k.slabOf(plan, 200, ROCKER.z - 200 + 6, P, 3, 0.4), { tone: "mid" });
}
function postBolt(cam) {
  const x = cam.side * ROCKER.x;
  const F = FY(x, ROCKER.z);
  return S(G.disc(6, 8, 3.8, F, P), { tone: "mid" }) + D([sec(x, ROCKER.z, 8)], { size: 0.6, tone: "hi" });
}
function valve(cam) {
  const x = cam.side * VALVE.x;
  const profile = [[VALVE.seat, VALVE.head], [VALVE.seat + 1.6, VALVE.head], [VALVE.seat + 3.4, 11.4, 1], [VALVE.seat + 7, 6.6, 1], [VALVE.seat + 12, 3.7, 1], [VALVE.seat + 18, VALVE.stem, 1], [204, VALVE.stem]];
  const F = FZ(x, 0);
  const retainer = S(G.solidOf([[VALVE.retainer, 7.6], [VALVE.retainer + 1.4, 7.6], [VALVE.retainer + 2.6, 4.2]], F, P), { tone: "mid" });
  const tip = S(G.solidOf([[190, VALVE.stem], [VALVE.tip - 0.6, VALVE.stem], [VALVE.tip, VALVE.stem - 0.6]], F, P), { tone: "hi" });
  return { body: S(G.solidOf(profile, F, P), { tone: "hi" }), tip, retainer };
}

// ---- Pistão, biela e pino ----
const pistonF = boreF;
const notchSteps = 28;
const surface = (a, z, r = 33.7) => at([r * Math.cos(a), r * Math.sin(a), z]);
const notchArc = Array.from({ length: notchSteps + 1 }, (_, i) => surface(WINDOW.from + ((WINDOW.to - WINDOW.from) * i) / notchSteps, WINDOW.top));
const notch = k.pathOf([surface(WINDOW.from, SKIRT - 60), ...notchArc, surface(WINDOW.to, SKIRT - 60)], true);
const notchEdge = k.pathOf([surface(WINDOW.from, SKIRT), ...notchArc, surface(WINDOW.to, SKIRT)]);
const pistonUpper = [[WINDOW.top, 33.7], [127, 33.7], [127, 32.8], [130, 32.8], [130, 33.7], [133, 33.7], [133, 32.8], [135, 32.8], [135, 33.7], [138, 33.7], [138, 32.8], [140, 32.8], [140, 33.4], [144.4, 33.4], [CROWN, 32.6]];
const lowerPiston = G.solidOf([[SKIRT, 33.7], [WINDOW.top, 33.7]], pistonF, P);
const backRim = Array.from({ length: 49 }, (_, i) => {
  const a = ((AZIMUTH + 90) * Math.PI) / 180 + (i / 48) * Math.PI;
  return surface(a, SKIRT, 31);
});
const frontTop = Array.from({ length: 49 }, (_, i) => {
  const a = ((AZIMUTH - 90) * Math.PI) / 180 + (i / 48) * Math.PI;
  return surface(a, WINDOW.top, 33.7);
});
const pistonInner = k.pathOf([...frontTop, ...backRim], true);
const ringLines = [[128.5, "lo"], [134, "mid"], [139, "hi"]];
const pistonArt = {
  defs: `<clipPath id="mt-notch"><path d="${notch}"/></clipPath><clipPath id="mt-skirt"><path clip-rule="evenodd" d="M-200 -200H840V840H-200Z${notch}"/></clipPath>`,
  back: `<g data-slide="piston"><g clip-path="url(#mt-notch)"><path class="mt-inner" d="${pistonInner}"/></g></g>`,
  front: (() => {
    const pinF = FY(0, PIN_Z);
    const boss = S(box(-5, 5, PIN_Z + 2, WINDOW.top + 1, 14, 26), { tone: "mid" }) + S(G.disc(14, 26, 9.4, pinF, P), { tone: "mid" });
    const pin = S(G.disc(26, 31, 5, pinF, P), { tone: "hi" }) + Ln(G.circleOf(pinF, 31, 3.2, P, 20), { tone: "lo" }) + D([sec(0, PIN_Z, 31)], { size: 0.6, tone: "hi" });
    const skirt = `<g clip-path="url(#mt-skirt)">${S(lowerPiston, { tone: "hi", lit: true })}</g>${Ln(notchEdge, { tone: "lit" })}`;
    const upper = S(G.solidOf(pistonUpper, pistonF, P), { tone: "hi", lit: true, inner: Ln(ringLines.filter(([, t]) => t !== "lo").map(([z]) => G.arcOf(pistonF, z, 33.7, P)).join(""), { tone: "lo" }) });
    return `<g data-slide="piston">${boss}${pin}<g clip-path="url(#mt-crown-front)">${skirt}${upper}${Ln(k.ring(0, 0, 28, CROWN, P, 56), { tone: "lo" })}<path class="mt-crown-glow" data-crown-glow d="${k.ring(0, 0, 32.6, CROWN, P, 64)}"/></g></g>`;
  })(),
};
// A coroa atrás do plano de corte fica dentro do gás: desenhada sob a camada WebGL.
const crownBack = `<g data-slide="piston"><path class="iso-fill" d="${k.ring(0, 0, 32.6, CROWN, P, 64)}"/><path class="iso-top" d="${k.ring(0, 0, 32.6, CROWN, P, 64)}"/>${Ln(k.ring(0, 0, 28, CROWN, P, 56), { tone: "lo" })}${Ln(k.ring(0, 0, 32.6, CROWN, P, 64), { tone: "hi" })}</g>`;
const clipCrown = poly([[-400, CROWN], [400, CROWN], [400, -400], [-400, -400]]);
const clipPiston = poly([[-400, E.deck], [-34, E.deck], ...roofRun(-34, 34, 24), [34, E.deck], [34, 58], [400, 58], [400, -400], [-400, -400]]);

const rodFace = (() => {
  const web = flat([[-3.6, 18], [3.6, 18], [2.6, E.rod - 16], [-2.6, E.rod - 16]]);
  const shell = flat(circle(0, 0, 8, 36));
  const eye = flat(circle(0, E.rod, 5.4, 28));
  return `<g data-rodface="" ><path class="mt-recess" d="${web}"/><path class="iso-line" data-tone="lo" d="${web}"/><path class="iso-line" data-tone="lo" d="${shell}"/><path class="iso-line" data-tone="lo" d="${eye}"/><path class="iso-line" data-tone="mid" d="${flat([[-ROD.big, -1], [ROD.big, -1]], false)}"/><circle class="mt-dot" cx="-9.3" cy="-4" r=".8"/><circle class="mt-dot" cx="9.3" cy="-4" r=".8"/><circle class="mt-dot" cx="-9.3" cy="3" r=".8"/><circle class="mt-dot" cx="9.3" cy="3" r=".8"/></g>`;
})();
const crankPin = S(G.disc(DISC.front, ROD.half + 1.2, ROD.pin, FY(0, 0), P), { tone: "hi" });
const pinEnd = Ln(G.circleOf(FY(0, 0), ROD.half + 1.2, ROD.pin - 2, P, 18), { tone: "lo" }) + D([sec(0, 0, ROD.half + 1.2)], { size: 0.6, tone: "hi" });

// ---- Vela, poço e cachimbo ----
const plug = (() => {
  const F = FZ(0, 0);
  const ceramic = [[196, 4.8], [220, 4.4], [226, 3.4], [232, 3.4]];
  const nose = [[153.8, 1.1], [157.4, 3.2]];
  const hook = k.pathOf([sec(5.2, 157.4), sec(5.2, 151.4), sec(0.8, 151.4)]);
  const threadLines = [160, 163, 166, 169, 172, 175].map((z) => G.arcOf(F, z, 6.2, P)).join("");
  return `${S(G.solidOf(nose, F, P), { tone: "hi" })}${Ln(hook, { tone: "hi", free: "end" })}${S(G.disc(157.4, 178, 6.2, F, P), { tone: "mid", inner: Ln(threadLines, { tone: "faint" }) })}${S(G.disc(178, 188, 9.2, F, P), { tone: "mid", inner: Ln(G.arcOf(F, 183, 9.2, P), { tone: "faint" }) })}${S(G.disc(188, 196, 6.4, F, P), { tone: "hi" })}${S(G.solidOf(ceramic, F, P), { tone: "hi" })}`;
})();
const cap = (() => {
  const F = FZ(0, 0);
  const boot = [[228, 5.6], [246, 5.6], [250, 6.6], [262, 6.6], [266, 5, 1], [268, 2.4, 1]];
  return S(G.solidOf(boot, F, P), { tone: "mid", inner: Ln(G.arcOf(F, 254, 6.6, P) + G.arcOf(F, 258, 6.6, P), { tone: "faint" }) });
})();

const frontLayer = [
  discBody,
  discArt,
  gears,
  cut,
  ...CAMS.map((cam) => `${live(`lobe-${cam.id}`, { tone: "hi" })}<g data-spin="shaft-${cam.id}" data-m="${matrixAt(cam.x, cam.z, 6)}"><path class="iso-line" data-tone="lo" d="${flat(circle(0, 0, 4.2, 20))}"/><circle class="mt-dot" cx="0" cy="0" r=".8"/></g>`),
  ...CAMS.map((cam) => tappet(cam)),
  ...CAMS.map((cam) => post(cam)),
  plug,
  cap,
  ...CAMS.map((cam) => {
    const parts = valve(cam);
    const x = cam.side * VALVE.x;
    return `${S(G.disc(200, 201.2, 8.4, FZ(x, 0), P), { tone: "mid" })}<path class="iso-line" data-tone="lo" data-free="" data-coil-back="${cam.id}"/><g clip-path="url(#mt-rockers)"><g data-slide="valve-${cam.id}">${parts.tip}</g></g><path class="iso-line" data-tone="mid" data-free="" data-coil-front="${cam.id}"/><g data-slide="valve-${cam.id}">${parts.retainer}</g>`;
  }),
  ...CAMS.map((cam) => live(`rocker-${cam.id}`, { tone: "hi" })),
  ...CAMS.map((cam) => postBolt(cam)),
  `<g data-slide="pin">${crankPin}</g>`,
  `<g clip-path="url(#mt-piston)">${pistonArt.back}${live("rod", { tone: "hi" })}<g data-rod-art="">${rodFace}</g>${pistonArt.front}</g>`,
  `<g data-slide="pin">${pinEnd}</g>`,
];

const defs = `<defs><clipPath id="mt-piston"><path d="${clipPiston}"/></clipPath><clipPath id="mt-rockers"><path d="${poly([[-84, 201], [84, 201], [84, 260], [-84, 260]])}"/></clipPath>${pistonArt.defs}<clipPath id="mt-crown-front"><path d="${clipCrown}"/></clipPath></defs>`;
const needle = `<path data-needle class="iso-line" data-tone="lit" data-free="" style="stroke-width:1.1"/><path class="iso-line" data-tone="mid" d="${k.ring(GAUGE.x, GAUGE.y, 1.8, GAUGE.puck + 12, P, 16)}"/>`;

const DATA = {
  W,
  H,
  P,
  camera: glCamera(P),
  rodRing: ROD_RING,
  rocker: { ring: ROCKER_RING, ...ROCKER, pushTop: PUSH_TOP, valveTip: VALVE.tip },
  lobes: { in: lobeRing(M.intakeLift), ex: lobeRing(M.exhaustLift) },
  cams: CAMS.map(({ id, side, x, z, phase }) => ({ id, side, x, z, phase })),
  valve: { x: VALVE.x, seat: VALVE.seat, seatTop: VALVE.seatTop + 1.2, retainer: VALVE.retainer, r: 6.4 },
  rod: { half: ROD.half },
  gauge: { x: GAUGE.x, y: GAUGE.y, z: GAUGE.puck + 12, r: GAUGE.r - 7, max: 50 },
  crownRest: CROWN,
  deck: E.deck,
  roofH: 10.4,
  fb: { x: [-34, 34, 34, -34], top: 158 },
};

const LABEL = "Motor monocilíndrico de quatro tempos com a carcaça cortada ao meio, montado numa bancada. Dentro do corte aparecem o pistão no cilindro, a biela, o volante do virabrequim, as engrenagens que giram dois comandos, os tuchos, as varetas, os balancins, as duas válvulas com suas molas e a vela. À esquerda ficam o carburador e o filtro de ar; à direita, o escapamento e um manômetro ligado à câmara de combustão.";
const backSvg = k.figureSvg({ width: W, height: H, label: LABEL, body: [...R.items.map((item) => item.svg), cavity, crownBack, ...CAMS.map((cam) => `<g data-slide="valve-${cam.id}">${valve(cam).body}</g>`)] });
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg mt-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${defs}${frontLayer.join("")}${needle}</svg>`;
const stage = `<div class="mt-stage" tabindex="0" role="slider" aria-label="Motor em corte. Setas giram o virabrequim; as teclas 1 a 4 vão para cada tempo; espaço pausa." aria-valuemin="0" aria-valuemax="720" aria-valuenow="0">${backSvg}<canvas class="mt-layer mt-gl" aria-hidden="true"></canvas>${frontSvg}</div>`;

// ---- Linha do tempo ----
const cycle = M.buildCycle();
const TL = { w: 600, top: 26, plot: 66, inY: 104, exY: 120, band: 11, max: 40 };
const tx = (theta) => (theta / 720) * TL.w;
const tp = (bar) => TL.top + TL.plot - (Math.min(bar, TL.max) / TL.max) * TL.plot;
const PEAK = Math.max(...Array.from({ length: 1440 }, (_, i) => cycle.pressureAt(i / 2)));
const series = (fn, step = 2) => Array.from({ length: Math.round(720 / step) + 1 }, (_, i) => [tx(i * step), fn(i * step)]);
const line = series((theta) => tp(cycle.pressureAt(theta)));
const linePath = flat(line, false);
const areaPath = `${linePath}L${TL.w} ${TL.top + TL.plot}L0 ${TL.top + TL.plot}Z`;
const liftPath = (fn, base) => `${flat(series((theta) => base - (fn(theta) / E.lift) * TL.band), false)}L${TL.w} ${base}L0 ${base}Z`;
const columns = M.STROKES.map((stroke) => `<g data-tl="${stroke.id}"><rect class="mt-tl-col" x="${tx(stroke.from)}" y="0" width="${tx(stroke.to) - tx(stroke.from)}" height="126"/><text class="mt-tl-name" x="${tx(stroke.from) + 8}" y="15">${stroke.id} ${stroke.name.toUpperCase()}</text></g>`).join("");
const grid = [180, 360, 540].map((theta) => `<path class="mt-tl-grid" d="M${tx(theta)} 0V126"/>`).join("");
const timeline = `<svg class="mt-tl" viewBox="0 0 ${TL.w} 126" role="img" aria-label="Linha do tempo de um ciclo de 720 graus: pressão no cilindro e abertura das válvulas em cada tempo.">${columns}${grid}
<path class="mt-tl-area" d="${areaPath}"/><path class="mt-tl-line" d="${linePath}"/>
<path class="mt-tl-lift" d="${liftPath(M.intakeLift, TL.inY)}"/><path class="mt-tl-lift" data-kind="ex" d="${liftPath(M.exhaustLift, TL.exY)}"/>
<path class="mt-tl-spark" d="M${tx(E.spark)} ${TL.top + 2}V${TL.top + TL.plot}"/>
<text class="mt-tl-tag" x="${tx(E.spark) - 4}" y="${TL.top + 9}" text-anchor="end">faísca</text>
<text class="mt-tl-tag" x="${tx(404)}" y="${tp(PEAK) + 8}">pico de ${Math.round(PEAK)} bar</text>
<text class="mt-tl-tag" x="8" y="${TL.top + 9}">pressão</text>
<text class="mt-tl-tag" x="${tx(240)}" y="${TL.inY - 1}">válvula de admissão</text><text class="mt-tl-tag" x="${tx(366)}" y="${TL.exY - 1}">válvula de escape</text>
<g data-cursor><path class="mt-tl-cursor" d="M0 0V126"/><circle class="mt-tl-dot" data-cursor-dot r="3" cx="0" cy="0"/></g></svg>`;

const STEPS = [
  { name: "Admissão", text: "O pistão desce com a válvula de admissão aberta e puxa para dentro a mistura de ar e combustível." },
  { name: "Compressão", text: "As válvulas fecham e o pistão sobe, espremendo a mistura em 8,5 vezes. Perto do topo, a vela solta a faísca." },
  { name: "Expansão", text: "A mistura queima, a pressão salta e empurra o pistão para baixo. É o único tempo que gera força." },
  { name: "Escape", text: "A válvula de escape abre e o pistão sobe expulsando os gases queimados. Depois, tudo recomeça." },
];
const steps = STEPS.map((step, index) => `<button type="button" class="mt-step" data-step="${index + 1}"><span class="mt-step-num">${index + 1}</span><span class="mt-step-name">${step.name}</span><span class="mt-step-text">${step.text}</span></button>`).join("");
const controls = `<div class="mt-controls"><button type="button" class="mt-btn" data-play aria-pressed="true"><span data-play-label>Ligar o motor</span></button><span class="mt-speed" role="group" aria-label="Velocidade da animação">${[["Lento", 16], ["Normal", 8], ["Rápido", 2]].map(([label, seconds]) => `<button type="button" class="mt-btn" data-speed="${seconds}"${seconds === 8 ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${label}</button>`).join("")}</span></div>`;
const caption = "Motor de 196 cm³ (68 × 54 mm, taxa 8,5:1) com a carcaça cortada ao meio. A biela transforma o vaivém do pistão no giro do virabrequim, e o volante guarda a energia da expansão para carregar o motor pelos outros três tempos. Como o ciclo ocupa duas voltas, as engrenagens giram os comandos à metade da rotação. A régua ao lado do pistão marca o curso de 54 mm entre o ponto morto superior (PMS) e o inferior (PMI). As pressões vêm de um ciclo calculado e simplificado. Aqui tudo está em câmera lenta: a 3.600 rpm, são 30 ciclos por segundo.";
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">Motor de 4 tempos</span><span class="iso-plate-corner" data-corner="hint">Arraste para girar o virabrequim</span><span class="iso-plate-corner" data-corner="readout" data-readout></span></div>`;
const body = `<style>${readFileSync(join(HERE, "motor.css"), "utf8")}</style><figure class="iso-figure mt"><div class="iso-plate">${corners}${stage}</div><div class="mt-panel">${controls}<div class="mt-tl-wrap" tabindex="-1">${timeline}</div><div class="mt-steps">${steps}</div></div><figcaption class="iso-legend"><span class="iso-caption">${caption}</span></figcaption><span class="mt-live" aria-live="polite" data-live></span></figure>`;

const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const liveSource = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const name = theme === "light" ? "motor-pistao-light.html" : "motor-pistao.html";
const page = k.pageHtml({ title: "Motor de 4 tempos", theme, body, script: kitScript() + glScript() + modelSource + liveSource, width: 720 }).replace('<html lang="en">', '<html lang="pt-BR">');
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} itens`, `escala ${KS.toFixed(3)}`);

if (process.argv.includes("--audit")) {
  const worst = {};
  const low = (key, value, theta) => { if (!(key in worst) || value < worst[key][0]) worst[key] = [value, theta]; };
  const toWorld = (ring, cx, cz, a) => ring.map(([u, v]) => [cx + u * Math.cos(a) - v * Math.sin(a), cz + u * Math.sin(a) + v * Math.cos(a)]);
  let roller = 0;
  for (let theta = 0; theta < 720; theta += 1) {
    const [px, pz] = M.pinAt(theta);
    const pinZ = M.pinHeight(theta);
    for (const cam of CAMS) {
      const ring = toWorld(lobeRing(cam.lift), cam.x, cam.z, ((theta / 2) * Math.PI) / 180);
      const rollerZ = ROLLER_Z + cam.lift(theta);
      let contact = Infinity;
      for (const [x, z] of ring) {
        low("biela (olhal) × ressalto", Math.hypot(x - px, z - pz) - ROD.big, theta);
        const t = Math.max(0, Math.min(1, ((x - px) * -px + (z - pz) * (pinZ - pz)) / (E.rod * E.rod)));
        low("biela (corpo) × ressalto", Math.hypot(x - (px - px * t), z - (pz + (pinZ - pz) * t)) - ROD.small, theta);
        contact = Math.min(contact, Math.hypot(x - cam.x, z - rollerZ));
      }
      roller = Math.max(roller, Math.abs(contact - CAM.roller));
    }
    const lift = Math.max(M.intakeLift(theta), M.exhaustLift(theta));
    low("coroa × cabeça da válvula", VALVE.seat - lift - M.crownHeight(theta), theta);
    const skirt = SKIRT + M.pinHeight(theta) - PIN_Z;
    const atDisc = Math.sqrt(33.7 ** 2 - DISC.front ** 2);
    low("saia × volante", skirt - Math.sqrt(Math.max(0, DISC.r ** 2 - atDisc ** 2)), theta);
    const atGear = Math.sqrt(33.7 ** 2 - GEAR.front ** 2);
    low("saia × engrenagem do comando", skirt - (CAM.z + Math.sqrt(Math.max(0, (GEAR.cam + GEAR.module) ** 2 - (CAM.x - atGear) ** 2))), theta);
    low("mola da válvula (altura)", VALVE.retainer - lift - (VALVE.seatTop + 1.2) - 5.5 * 1.1, theta);
  }
  low("dente da engrenagem × moente", M.crankRadius - ROD.pin - (GEAR.crank + GEAR.module), 0);
  console.log("folgas do mecanismo em 720° (mm):");
  let bad = 0;
  for (const [name, [value, theta]] of Object.entries(worst)) {
    if (value < 0) bad++;
    console.log(`  ${value < 0 ? "FALHA" : "ok   "} ${name.padEnd(32)} ${value.toFixed(2)} em ${theta}°`);
  }
  console.log(`  ${roller > 0.1 ? "FALHA" : "ok   "} ${"rolete × perfil do ressalto".padEnd(32)} erro máx ${roller.toFixed(3)}`);
  if (bad || roller > 0.1) process.exitCode = 1;
}
A.auditOrExit(R, P, {});
