
const D = __DATA__;
const stage = document.querySelector(".mt-stage");
const front = stage.querySelector("svg.mt-layer");
const readout = document.querySelector("[data-readout]");
const liveText = document.querySelector("[data-live]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const Cycle = buildCycle();
const f = (value) => Math.round(value * 100) / 100;

const cam = cameraOf(D.P);
const [ox, oy] = D.P.origin;
const sx = (x, y) => ox + (x * cam.sinA - y * cam.cosA) * cam.k;
const sy = (x, y, z) => oy + ((x * cam.cosA + y * cam.sinA) * cam.sinE - z * cam.cosE) * cam.k;
const VIEW = [cam.cosA * cam.cosE, cam.sinA * cam.cosE, cam.sinE];
const lightLength = Math.hypot(cam.sinA, cam.cosA, 1.2);
const LIGHT = [-cam.sinA / lightLength, cam.cosA / lightLength, 1.2 / lightLength];
const toneBand = (score) => (score >= 0.42 ? 3 : score >= 0.2 ? 2 : score >= 0 ? 1 : 0);
const pathFrom = (xs, ys, closed) => {
  let out = "";
  for (let i = 0; i < xs.length; i++) out += `${i ? "L" : "M"}${f(xs[i])} ${f(ys[i])}`;
  return closed ? out + "Z" : out;
};
const shift = (dx, dz) => `translate(${f((dx * cam.sinA) * cam.k)} ${f((dx * cam.cosA * cam.sinE - dz * cam.cosE) * cam.k)})`;

function solidPart(name) {
  const root = front.querySelector(`[data-live="${name}"]`);
  return {
    fill: root.querySelector(".iso-fill"),
    shades: [0, 1, 2, 3].map((tone) => root.querySelector(`[data-shade="${tone}"]`)),
    top: root.querySelector(".iso-top"),
    crease: root.querySelector(".iso-crease"),
    edge: root.querySelector(".iso-edge"),
  };
}

// Prisma ao longo de y, reconstruído a cada quadro: mesmos tons do kit, sem precisar de depthOf.
function prism(part, ring, cx, cz, rotation, y0, y1) {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const n = ring.length;
  const hx = new Array(n);
  const hy = new Array(n);
  const lx = new Array(n);
  const ly = new Array(n);
  const wx = new Array(n);
  const wz = new Array(n);
  const hull = [];
  for (let i = 0; i < n; i++) {
    wx[i] = cx + ring[i][0] * c - ring[i][1] * s;
    wz[i] = cz + ring[i][0] * s + ring[i][1] * c;
    hx[i] = sx(wx[i], y1);
    hy[i] = sy(wx[i], y1, wz[i]);
    lx[i] = sx(wx[i], y0);
    ly[i] = sy(wx[i], y0, wz[i]);
    hull.push([hx[i], hy[i]], [lx[i], ly[i]]);
  }
  const buckets = ["", "", "", ""];
  let crease = "";
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = wx[j] - wx[i];
    const dz = wz[j] - wz[i];
    const length = Math.hypot(dx, dz) || 1;
    const nx = dz / length;
    const nz = -dx / length;
    if (nx * VIEW[0] + nz * VIEW[2] <= 1e-6) continue;
    const tone = toneBand(nx * LIGHT[0] + nz * LIGHT[2]);
    buckets[tone] += `M${f(lx[i])} ${f(ly[i])}L${f(lx[j])} ${f(ly[j])}L${f(hx[j])} ${f(hy[j])}L${f(hx[i])} ${f(hy[i])}Z`;
    crease += `M${f(hx[i])} ${f(hy[i])}L${f(hx[j])} ${f(hy[j])}`;
  }
  const edge = convexHull(hull);
  const outline = pathFrom(edge.map((p) => p[0]), edge.map((p) => p[1]), true);
  part.fill.setAttribute("d", outline);
  part.edge.setAttribute("d", outline);
  buckets.forEach((d, tone) => part.shades[tone].setAttribute("d", d));
  part.top.setAttribute("d", pathFrom(hx, hy, true));
  part.crease.setAttribute("d", crease);
}

const spins = {};
front.querySelectorAll("[data-spin]").forEach((node) => (spins[node.dataset.spin] ??= []).push({ node, base: node.dataset.m }));
const spin = (name, degrees) => {
  const value = ` rotate(${f(degrees)})`;
  for (const item of spins[name]) item.node.setAttribute("transform", item.base + value);
};
const slides = {};
stage.querySelectorAll("[data-slide]").forEach((node) => (slides[node.dataset.slide] ??= []).push(node));
const slide = (name, transform) => slides[name].forEach((node) => node.setAttribute("transform", transform));

const rodPart = solidPart("rod");
const rodArt = front.querySelector("[data-rod-art]");
const lobes = Object.fromEntries(D.cams.map((item) => [item.id, solidPart(`lobe-${item.id}`)]));
const rockers = Object.fromEntries(D.cams.map((item) => [item.id, solidPart(`rocker-${item.id}`)]));
const coils = Object.fromEntries(D.cams.map((item) => [item.id, { back: front.querySelector(`[data-coil-back="${item.id}"]`), front: front.querySelector(`[data-coil-front="${item.id}"]`) }]));
const needle = front.querySelector("[data-needle]");

function coilPaths(x, z0, z1, radius) {
  const turns = 5.5;
  const count = Math.round(turns * 18);
  let back = "";
  let near = "";
  let wasFront = null;
  let run = "";
  for (let i = 0; i <= count; i++) {
    const share = i / count;
    const a = share * turns * Math.PI * 2;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    const z = z0 + (z1 - z0) * share;
    const px = sx(x + radius * nx, radius * ny);
    const py = sy(x + radius * nx, radius * ny, z);
    const facing = nx * VIEW[0] + ny * VIEW[1] > 0;
    if (wasFront === null) wasFront = facing;
    if (facing !== wasFront) {
      run += `L${f(px)} ${f(py)}`;
      if (wasFront) near += run;
      else back += run;
      run = `M${f(px)} ${f(py)}`;
      wasFront = facing;
    } else run += `${run ? "L" : "M"}${f(px)} ${f(py)}`;
  }
  if (wasFront) near += run;
  else back += run;
  return { back, near };
}

const liftOf = { in: intakeLift, ex: exhaustLift };
const steps = [...document.querySelectorAll("[data-step]")];
const columns = [...document.querySelectorAll("[data-tl]")];
const cursor = document.querySelector("[data-cursor]");
const cursorDot = document.querySelector("[data-cursor-dot]");
let shownStroke = 0;

function drawMechanism(theta) {
  const [px, pz] = pinAt(theta);
  const pinZ = pinHeight(theta);
  spin("disc", -theta);
  spin("crank", -theta);
  slide("pin", shift(px, pz));
  slide("piston", shift(0, pinZ - pinHeight(0)));
  const lean = Math.asin(px / ENGINE.rod);
  prism(rodPart, D.rodRing, px, pz, lean, -D.rod.half, D.rod.half);
  rodArt.setAttribute("transform", `matrix(${f(cam.sinA * cam.k)} ${f(cam.cosA * cam.sinE * cam.k)} 0 ${f(-cam.cosE * cam.k)} ${f(sx(px, D.rod.half))} ${f(sy(px, D.rod.half, pz))}) rotate(${f((lean * 180) / Math.PI)})`);
  for (const item of D.cams) {
    const lift = liftOf[item.id](theta);
    spin(`cam-${item.id}`, item.phase + theta / 2);
    spin(`shaft-${item.id}`, theta / 2);
    prism(lobes[item.id], D.lobes[item.id], item.x, item.z, (theta / 2) * (Math.PI / 180), -6, 6);
    slide(`tappet-${item.id}`, shift(0, lift));
    slide(`valve-${item.id}`, shift(0, -lift));
    const sinTilt = (D.rocker.pushTop - D.rocker.valveTip + 2 * lift) / (2 * D.rocker.arm);
    const tilt = Math.asin(sinTilt) * item.side;
    prism(rockers[item.id], D.rocker.ring, item.side * D.rocker.x, D.rocker.z, tilt, -6, 6);
    const coil = coilPaths(item.side * D.valve.x, D.valve.seatTop, D.valve.retainer - lift, D.valve.r);
    coils[item.id].back.setAttribute("d", coil.back);
    coils[item.id].front.setAttribute("d", coil.near);
  }
}

function drawGauge(bar) {
  const angle = ((-135 + (Math.min(bar, D.gauge.max) / D.gauge.max) * 270) * Math.PI) / 180;
  const s = Math.sin(angle);
  const c = -Math.cos(angle);
  needle.setAttribute("d", lineOnTop([D.gauge.x - s * 4, D.gauge.y - c * 4], [D.gauge.x + s * D.gauge.r, D.gauge.y + c * D.gauge.r], D.gauge.z + 0.2, D.P));
}

function drawPanel(theta, bar) {
  const stroke = strokeOf(theta);
  cursor.setAttribute("transform", `translate(${f((theta / 720) * 600)} 0)`);
  cursorDot.setAttribute("cy", f(92 - (Math.min(bar, 40) / 40) * 66));
  const text = `${stroke.id} ${stroke.name} · ${positionText(theta)} · ${bar < 9.95 ? bar.toFixed(1).replace(".", ",") : Math.round(bar)} bar`;
  if (readout.textContent !== text) readout.textContent = text;
  if (shownStroke !== stroke.id) {
    shownStroke = stroke.id;
    steps.forEach((node, index) => node.toggleAttribute("data-on", index + 1 === stroke.id));
    columns.forEach((node, index) => node.toggleAttribute("data-on", index + 1 === stroke.id));
    liveText.textContent = stroke.name;
    stage.setAttribute("aria-valuetext", `Tempo ${stroke.id}: ${stroke.name}`);
  }
  stage.setAttribute("aria-valuenow", String(Math.round(theta)));
}

const FRAGMENT = `
uniform float uCrown,uFill,uDense,uWarm,uRadius,uConsume,uFront,uHeat,uSmoke,uSpark,uSwirl,uDrift,uIn,uEx,uFlowIn,uFlowEx;
const float BORE=34.;
float roofZ(float x){return 147.+10.4*(1.-x*x/(BORE*BORE));}
vec3 fireInk(float t){
  t=clamp(t,0.,1.);
  vec3 c=mix(vec3(.30,.03,.01),vec3(.86,.16,.02),smoothstep(0.,.33,t));
  c=mix(c,vec3(1.,.52,.07),smoothstep(.33,.6,t));
  c=mix(c,vec3(1.,.83,.32),smoothstep(.6,.85,t));
  return mix(c,vec3(1.,.97,.86),smoothstep(.85,1.,t));
}
vec2 twirl(vec2 q,vec2 c,float a){vec2 d=q-c;float t=a*exp(-length(d)/46.);float s=sin(t);float k=cos(t);return c+vec2(k*d.x-s*d.y,s*d.x+k*d.y);}
vec4 over(vec4 top,vec4 under){return top+under*(1.-top.a);}
vec4 ink(vec3 c,float a){return vec4(c*a,a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec2 q=onWallY(vb,0.).xz;
  float mask=window(q.x,-49.,49.,.6)*window(q.y,uCrown,197.,.35);
  if(mask<.002){gl_FragColor=vec4(0.);return;}
  float h=q.y-roofZ(q.x);
  float duct=smoothstep(-.6,2.2,h);
  float left=1.-smoothstep(-3.,3.,q.x);
  float cylinder=1.-duct;

  vec2 mid=vec2(0.,(uCrown+150.)*.5);
  vec2 sw=twirl(q,mid,uSwirl*1.1);
  float n=fbm2(sw*.075+vec2(1.7,-uSwirl*.28));
  float reach=mix(4.,200.,uFill);
  float wave=1.-smoothstep(reach-42.,reach,length(q-vec2(-17.,156.)));
  float d=length(q-vec2(0.,roofZ(0.)-4.5));
  float wr=(fbm2(q*.11+vec2(3.1,uDrift*.3))-.5)*20.*smoothstep(1.,16.,uRadius);
  float dd=d+wr;
  float burnt=1.-smoothstep(uRadius-8.,uRadius+1.,dd);
  float mist=cylinder*wave*(.42+.86*n)*(1.-burnt*uConsume);
  float dens=mist*(.34+1.5*uDense);
  vec4 gas=ink(mix(vec3(.60,.78,1.),vec3(1.,.80,.50),uWarm),1.-exp(-dens*1.7));

  float inDuct=duct*left;
  float ni=fbm2(vec2(q.x*.085+uFlowIn,q.y*.11));
  gas=over(ink(vec3(.60,.78,1.),(1.-exp(-(.34+.5*ni+.5*uIn*ni)*1.2))*inDuct),gas);

  vec2 toValve=normalize(vec2(17.,156.)-q+vec2(.001));
  vec2 ex=q-toValve*uFlowEx*5.+vec2(0.,-uDrift*2.);
  float ns=fbm2(ex*.07+vec2(5.3,1.9));
  float t=uHeat*(.6+.42*ns)+.1*exp(-d*d/1400.)*uHeat;
  vec3 hot=fireInk(t);
  float soot=1.-smoothstep(.03,.2,uHeat);
  vec3 body=mix(hot,vec3(.34,.32,.31),soot*.85);
  float e=cylinder*burnt*uSmoke*(.5+.8*ns)*(.42+1.5*uHeat);
  gas=over(ink(body,1.-exp(-e*3.)),gas);
  float rim=cylinder*exp(-pow((dd-uRadius)/2.8,2.))*uFront;
  gas=over(ink(vec3(.70,.84,1.),1.-exp(-rim*1.6)),gas);

  float exDuct=duct*(1.-left);
  float nx=fbm2(vec2(q.x*.09-uFlowEx,q.y*.12));
  float flow=uEx*(.55+.9*nx);
  vec3 outGas=mix(vec3(.34,.32,.31),fireInk(uHeat*(.9+.5*nx)),smoothstep(.02,.16,uHeat)*uEx);
  gas=over(ink(outGas,(1.-exp(-(flow+.16*nx)*2.1))*exDuct),gas);

  float gap=length(q-vec2(0.,152.6));
  float spark=uSpark*(exp(-gap*gap/5.)+.5*exp(-gap*gap/90.));
  gas=over(ink(vec3(.82,.90,1.),1.-exp(-spark*3.5)),gas);

  gas*=mask;
  gas.rgb=min(gas.rgb,vec3(gas.a));
  float dither=(hash12(gl_FragCoord.xy)+hash12(gl_FragCoord.yx*1.37)-1.)/255.;
  gl_FragColor=max(gas+vec4(dither)*smoothstep(0.,1.5/255.,gas.a),vec4(0.));
}`;
const layer = glLayer({ canvas: stage.querySelector(".mt-gl"), fragment: FRAGMENT, view: [D.W, D.H], camera: D.camera, uniforms: ["uCrown", "uFill", "uDense", "uWarm", "uRadius", "uConsume", "uFront", "uHeat", "uSmoke", "uSpark", "uSwirl", "uDrift", "uIn", "uEx", "uFlowIn", "uFlowEx"] });
if (layer) stage.setAttribute("data-gl", "");
const crownGlow = front.querySelector("[data-crown-glow]");
const fallback = document.querySelector("[data-fallback]");
const portExhaust = document.querySelector('[data-fb-port="ex"]');
const volumeAtClose = volume(ENGINE.ivc);
const fillSpan = volume(ENGINE.ivc) - clearance;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const SMOKE_LEFT = 0.6 * Math.pow(volume(720) / volume(540), 0.55);

// Tudo é função do ângulo: arrastar para trás desfaz a chama sem nenhum salto.
function gasState(theta, unwrapped) {
  const w = wrap(theta);
  const T = Cycle.temperatureAt(w);
  const x = burned(w);
  const compressed = w >= ENGINE.ivc && w < 420;
  const fill = w < ENGINE.ivc ? clamp01((volume(w) - clearance) / fillSpan) : w < 420 ? 1 : 0;
  const dense = compressed ? clamp01((volumeAtClose / volume(w) - 1) / (ENGINE.ratio - 1)) : 0;
  const warm = compressed ? clamp01((T - 335) / 330) : 0;
  const after = w >= ENGINE.burnStart;
  const opened = smooth(395, 425, w);
  const radius = after ? 74 * Math.pow(x, 0.6) + 500 * opened : w < 110 ? 600 : 0;
  let smoke = 0;
  if (w >= ENGINE.burnStart) smoke = 1;
  if (w > ENGINE.evo) smoke = 1 - 0.4 * smooth(ENGINE.evo, 540, w);
  if (w > 540) smoke *= Math.pow(volume(w) / volume(540), 0.55);
  if (w < 90) smoke = SMOKE_LEFT * (1 - smooth(4, 80, w));
  const heat = clamp01((T - 800) / 1600);
  const age = w - ENGINE.spark;
  const spark = age > 0 && age < 60 ? burst(age, 1.6, 7) : 0;
  const sinceIntake = unwrapped - ENGINE.ivo;
  const sinceExhaust = unwrapped - ENGINE.evo;
  const intakeFlow = Math.floor(sinceIntake / 720) + clamp01(wrap(sinceIntake) / (ENGINE.ivc - ENGINE.ivo));
  const exhaustFlow = Math.floor(sinceExhaust / 720) + clamp01(wrap(sinceExhaust) / (ENGINE.evc - ENGINE.evo));
  return {
    uCrown: crownHeight(w),
    uFill: fill,
    uDense: dense,
    uWarm: warm,
    uRadius: radius,
    uConsume: after ? 1 : 0,
    uFront: clamp01(4 * x * (1 - x)),
    uHeat: heat,
    uSmoke: smoke,
    uSpark: spark,
    uSwirl: w * 0.0087,
    uDrift: (w < 180 ? w + 720 : w) * 0.0087,
    uIn: intakeLift(w) / ENGINE.lift,
    uEx: exhaustLift(w) / ENGINE.lift,
    uFlowIn: intakeFlow * 3,
    uFlowEx: exhaustFlow * 3,
  };
}

function drawGas(theta) {
  const state = gasState(theta, theta);
  const glow = state.uHeat * Math.min(1, state.uSmoke) * clamp01(state.uRadius / 40);
  crownGlow.style.opacity = f(glow * 0.26);
  if (layer) {
    layer.draw(state, 0);
    return;
  }
  const crown = state.uCrown;
  fallback.setAttribute("d", pathFrom(D.fb.x.map((u) => sx(u, 0)), D.fb.x.map((u, index) => sy(u, 0, index < 2 ? crown - 4 : D.fb.top)), true));
  const fire = state.uHeat * state.uSmoke;
  fallback.style.fill = fire > 0.02 ? "var(--mt-fire)" : "var(--mt-cool)";
  fallback.style.opacity = f(fire > 0.02 ? 0.25 + 0.7 * Math.min(1, fire * 1.4) : 0.12 + 0.45 * state.uFill * (0.4 + state.uDense));
  portExhaust.style.opacity = f(0.1 + 0.6 * state.uEx);
}

let angle = 372;
let target = angle;
let period = 8;
let playing = !still.matches;
let held = false;
let visible = false;
let frame = 0;
let last = 0;
let idleTimer = 0;
let drawn = -1;

function draw(theta) {
  const w = wrap(theta);
  const bar = Cycle.pressureAt(w);
  drawMechanism(w);
  drawGauge(bar);
  drawPanel(w, bar);
  drawGas(theta);
  drawn = w;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (playing && !held) {
    angle += (dt * 720) / period;
    target = angle;
  } else {
    angle = still.matches ? target : angle + (target - angle) * (1 - Math.exp(-dt / 0.1));
    if (Math.abs(target - angle) < 0.02) angle = target;
  }
  if (wrap(angle) !== drawn) draw(angle);
  const moving = (playing && !held) || angle !== target;
  frame = visible && moving ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

const holdFor = (seconds = 3.6) => {
  held = true;
  clearTimeout(idleTimer);
  if (playing) idleTimer = setTimeout(() => {
    held = false;
    target = angle;
    run();
  }, seconds * 1000);
};
const steer = (next, seconds) => {
  target = next;
  holdFor(seconds);
  run();
};
const nearest = (wanted) => {
  const base = angle - wrap(angle);
  return [base + wanted - 720, base + wanted, base + wanted + 720].reduce((best, value) => (Math.abs(value - angle) < Math.abs(best - angle) ? value : best));
};

let dragFrom = null;
stage.addEventListener("pointerdown", (event) => {
  dragFrom = { x: event.clientX, angle: angle, id: event.pointerId };
  target = angle;
  stage.setAttribute("data-drag", "");
  stage.setPointerCapture(event.pointerId);
  held = true;
  clearTimeout(idleTimer);
});
stage.addEventListener("pointermove", (event) => {
  if (!dragFrom) return;
  const scale = 720 / stage.getBoundingClientRect().width;
  target = dragFrom.angle + (event.clientX - dragFrom.x) * scale;
  run();
});
const endDrag = () => {
  if (!dragFrom) return;
  dragFrom = null;
  stage.removeAttribute("data-drag");
  holdFor();
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

const timelineWrap = document.querySelector(".mt-tl-wrap");
let scrubbing = false;
const scrub = (event) => {
  const box = timelineWrap.getBoundingClientRect();
  const share = Math.min(0.9999, Math.max(0, (event.clientX - box.left) / box.width));
  target = nearest(share * 720);
  held = true;
  clearTimeout(idleTimer);
  run();
};
timelineWrap.addEventListener("pointerdown", (event) => {
  scrubbing = true;
  timelineWrap.setPointerCapture(event.pointerId);
  scrub(event);
});
timelineWrap.addEventListener("pointermove", (event) => scrubbing && scrub(event));
const endScrub = () => {
  if (!scrubbing) return;
  scrubbing = false;
  holdFor();
};
timelineWrap.addEventListener("pointerup", endScrub);
timelineWrap.addEventListener("pointercancel", endScrub);

const STROKE_MID = [90, 270, 450, 630];
const jump = (index) => steer(nearest(STROKE_MID[index]), 6);
steps.forEach((node, index) => node.addEventListener("click", () => jump(index)));

const playButton = document.querySelector("[data-play]");
const playLabel = document.querySelector("[data-play-label]");
const setPlaying = (value) => {
  playing = value;
  held = false;
  clearTimeout(idleTimer);
  target = angle;
  playButton.setAttribute("aria-pressed", String(value));
  playLabel.textContent = value ? "Pausar" : "Ligar o motor";
  run();
};
playButton.addEventListener("click", () => setPlaying(!playing));
document.querySelectorAll("[data-speed]").forEach((node) =>
  node.addEventListener("click", () => {
    period = Number(node.dataset.speed);
    document.querySelectorAll("[data-speed]").forEach((other) => other.setAttribute("aria-pressed", String(other === node)));
  }),
);
stage.addEventListener("keydown", (event) => {
  const stepSize = event.shiftKey ? 30 : 5;
  const from = held || !playing ? target : angle;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") steer(from + stepSize);
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") steer(from - stepSize);
  else if (event.key === "Home") steer(nearest(0));
  else if (["1", "2", "3", "4"].includes(event.key)) jump(Number(event.key) - 1);
  else if (event.key === " ") setPlaying(!playing);
  else return;
  event.preventDefault();
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => setPlaying(!still.matches));
setPlaying(playing);
draw(angle);
addEventListener("resize", () => draw(angle));
window.__motor = { set(theta) { playing = false; held = false; clearTimeout(idleTimer); angle = target = theta; draw(theta); return readout.textContent; } };
