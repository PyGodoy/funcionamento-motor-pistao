// Modelo puro do motor monocilíndrico de 4 tempos. Tudo que a figura mostra sai daqui.
// theta é o ângulo do virabrequim em graus, de 0 a 720: 0 = PMS no início da admissão, 360 = PMS da combustão.

export const ENGINE = {
  bore: 68,
  stroke: 54,
  rod: 92,
  ratio: 8.5,
  crownAbovePin: 26,
  deck: 147,
  lift: 7.5,
  ivo: -10,
  ivc: 225,
  evo: 495,
  evc: 730,
  spark: 340,
  burnStart: 345,
  burnLength: 52,
  intakeBar: 0.94,
  exhaustBar: 1.06,
  ambientBar: 1.0,
  polytropic: 1.3,
  heatJ: 400,
};

const RAD = Math.PI / 180;
export const crankRadius = ENGINE.stroke / 2;
export const boreArea = (Math.PI / 4) * ENGINE.bore * ENGINE.bore;
export const displacement = boreArea * ENGINE.stroke;
export const clearance = displacement / (ENGINE.ratio - 1);

export const wrap = (theta) => ((theta % 720) + 720) % 720;

// Altura do pino do pistão acima do eixo do virabrequim.
export const pinHeight = (theta) => {
  const a = theta * RAD;
  const s = crankRadius * Math.sin(a);
  return crankRadius * Math.cos(a) + Math.sqrt(ENGINE.rod * ENGINE.rod - s * s);
};
export const crownHeight = (theta) => pinHeight(theta) + ENGINE.crownAbovePin;
export const travel = (theta) => ENGINE.rod + crankRadius - pinHeight(theta);
export const volume = (theta) => clearance + boreArea * travel(theta);
export const rodAngle = (theta) => Math.asin((crankRadius * Math.sin(theta * RAD)) / ENGINE.rod);
export const pinAt = (theta) => [crankRadius * Math.sin(theta * RAD), crankRadius * Math.cos(theta * RAD)];

// Braço de alavanca efetivo: quanto de giro cada mm de pistão produz (mm por radiano).
export const leverArm = (theta) => (travel(theta + 0.05) - travel(theta - 0.05)) / (0.1 * RAD);

const liftShape = (x) => (Math.abs(x) >= 1 ? 0 : Math.pow(Math.cos((x * Math.PI) / 2), 2));
const signedFrom = (theta, centre) => ((((theta - centre) % 720) + 1080) % 720) - 360;

export const intakeCentre = (ENGINE.ivo + ENGINE.ivc) / 2;
export const exhaustCentre = (ENGINE.evo + ENGINE.evc) / 2;
const intakeHalf = (ENGINE.ivc - ENGINE.ivo) / 2;
const exhaustHalf = (ENGINE.evc - ENGINE.evo) / 2;
export const intakeLift = (theta) => ENGINE.lift * liftShape(signedFrom(theta, intakeCentre) / intakeHalf);
export const exhaustLift = (theta) => ENGINE.lift * liftShape(signedFrom(theta, exhaustCentre) / exhaustHalf);

// Fração queimada: função de Wiebe.
export const burned = (theta) => {
  const x = (wrap(theta) - ENGINE.burnStart) / ENGINE.burnLength;
  if (x <= 0) return 0;
  return 1 - Math.exp(-5 * Math.pow(Math.min(x, 1.4), 3));
};

// Ciclo: integração da primeira lei em passos de 0,5°, de IVC até a abertura do escape.
export function buildCycle(step = 0.5) {
  const n = ENGINE.polytropic;
  const count = Math.round(720 / step);
  const pressure = new Float64Array(count + 1);
  const start = ENGINE.ivc;
  const openAt = ENGINE.evo;
  const closedV = volume(start);
  let p = ENGINE.intakeBar;
  const closed = new Map();
  for (let theta = start; theta <= openAt + 1e-9; theta += step) {
    closed.set(Math.round(theta / step), p);
    const v0 = volume(theta);
    const v1 = volume(theta + step);
    const dq = ENGINE.heatJ * (burned(theta + step) - burned(theta));
    const mid = (v0 + v1) / 2;
    p += -n * (p / mid) * (v1 - v0) + ((n - 1) / (mid * 1e-9)) * dq * 1e-5;
  }
  const pOpen = closed.get(Math.round(openAt / step));
  for (let index = 0; index <= count; index++) {
    const theta = index * step;
    let value;
    if (theta < start) {
      const swap = (theta - ENGINE.ivo - 0) / (ENGINE.evc - 720 - ENGINE.ivo);
      const s = Math.min(1, Math.max(0, swap));
      value = ENGINE.exhaustBar + (ENGINE.intakeBar - ENGINE.exhaustBar) * (s * s * (3 - 2 * s));
    } else if (theta <= openAt) {
      value = closed.get(index);
    } else {
      const blow = Math.exp(-(theta - openAt) / 16);
      value = ENGINE.exhaustBar + (pOpen - ENGINE.exhaustBar) * blow;
      if (theta > 710) {
        const s = (theta - 710) / 20;
        value += (ENGINE.intakeBar - ENGINE.exhaustBar) * (s * s * (3 - 2 * s));
      }
    }
    pressure[index] = value;
  }
  const trapped = (ENGINE.intakeBar * 1e5 * closedV * 1e-9) / (287 * 340);
  const at = (table, theta) => {
    const x = wrap(theta) / step;
    const i = Math.floor(x);
    const t = x - i;
    return table[i] + (table[Math.min(i + 1, count)] - table[i]) * t;
  };
  const pressureAt = (theta) => at(pressure, theta);
  const tOpen = (pressureAt(openAt) * 1e5 * volume(openAt) * 1e-9) / (trapped * 287);
  const blown = (w) => Math.max(760, tOpen * Math.pow(pressureAt(w) / pressureAt(openAt), (n - 1) / n));
  const tEnd = blown(720);
  const temperatureAt = (theta) => {
    const w = wrap(theta);
    if (w >= start && w <= openAt) return (pressureAt(w) * 1e5 * volume(w) * 1e-9) / (trapped * 287);
    if (w > openAt) return blown(w);
    const s = Math.min(1, w / 120);
    return tEnd + (335 - tEnd) * (s * s * (3 - 2 * s));
  };
  const forceAt = (theta) => (pressureAt(theta) - ENGINE.ambientBar) * 0.1 * boreArea;
  const torqueAt = (theta) => (forceAt(theta) * leverArm(theta)) / 1000;
  return { step, pressure, pressureAt, temperatureAt, forceAt, torqueAt, trapped };
}

// Tempo atual pela posição do virabrequim.
export const STROKES = [
  { id: 1, name: "Admissão", from: 0, to: 180 },
  { id: 2, name: "Compressão", from: 180, to: 360 },
  { id: 3, name: "Expansão", from: 360, to: 540 },
  { id: 4, name: "Escape", from: 540, to: 720 },
];
export const strokeOf = (theta) => STROKES[Math.min(3, Math.floor(wrap(theta) / 180))];

// Em relação ao ponto morto mais próximo que importa para o leitor.
export const positionText = (theta) => {
  const w = wrap(theta);
  const fold = w % 360;
  const fromTop = fold <= 180 ? fold : 360 - fold;
  if (fromTop < 0.5) return "no PMS";
  if (fromTop > 179.5) return "no PMI";
  if (fromTop <= 90) return `${Math.round(fromTop)}° ${fold <= 180 ? "após" : "antes do"} PMS`;
  return `${Math.round(180 - fromTop)}° ${fold <= 180 ? "antes do" : "após"} PMI`;
};
