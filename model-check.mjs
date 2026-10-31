import * as M from "./model.mjs";

const C = M.buildCycle();
const E = M.ENGINE;
let peak = [0, 0];
let hottest = [0, 0];
let work = 0;
let torqueMax = [0, 0];
for (let t = 0; t < 720; t += 0.5) {
  const p = C.pressureAt(t);
  if (p > peak[0]) peak = [p, t];
  const T = C.temperatureAt(t);
  if (T > hottest[0]) hottest = [T, t];
  const tq = C.torqueAt(t);
  if (tq > torqueMax[0]) torqueMax = [tq, t];
  const dV = (M.volume(t + 0.5) - M.volume(t)) * 1e-9;
  work += p * 1e5 * dV;
}
const vd = M.displacement * 1e-9;
const row = (name, value) => console.log(name.padEnd(30), value);
row("cilindrada (cm3)", (M.displacement / 1000).toFixed(1));
row("volume morto (cm3)", (M.clearance / 1000).toFixed(1));
row("V(PMI)/V(PMS)", (M.volume(180) / M.volume(0)).toFixed(3));
row("pressão máxima (bar @ theta)", `${peak[0].toFixed(1)} @ ${peak[1]}`);
row("pressão no fim da compressão", C.pressureAt(340).toFixed(1));
row("pressão na abertura do escape", C.pressureAt(E.evo).toFixed(2));
row("temperatura máxima (K @ theta)", `${hottest[0].toFixed(0)} @ ${hottest[1]}`);
row("trabalho por ciclo (J)", work.toFixed(1));
row("pressão média indicada (bar)", (work / vd / 1e5).toFixed(2));
row("torque médio indicado (N.m)", (work / (4 * Math.PI)).toFixed(2));
row("potência a 3600 rpm (kW)", ((work * 3600) / 120 / 1000).toFixed(2));
row("torque máximo do gás (N.m @)", `${torqueMax[0].toFixed(0)} @ ${torqueMax[1]}`);
row("força máxima (kN)", (Math.max(...[...Array(1440).keys()].map((i) => C.forceAt(i / 2))) / 1000).toFixed(1));
row("levante admissão máx @", `${M.intakeLift(M.intakeCentre).toFixed(2)} @ ${M.intakeCentre}`);
row("levante escape máx @", `${M.exhaustLift(M.exhaustCentre).toFixed(2)} @ ${M.exhaustCentre}`);
row("levantes no PMS (0)", `${M.intakeLift(0).toFixed(2)} / ${M.exhaustLift(0).toFixed(2)}`);
row("levantes no PMS (360)", `${M.intakeLift(360).toFixed(4)} / ${M.exhaustLift(360).toFixed(4)}`);

let minGap = 1e9;
for (let t = 0; t < 720; t += 0.5) {
  const crown = M.crownHeight(t);
  const gap = 155 - Math.max(M.intakeLift(t), M.exhaustLift(t)) - crown;
  if (gap < minGap) minGap = gap;
}
row("folga válvula-pistão mín (mm)", minGap.toFixed(2));
for (const t of [0, 90, 180, 270, 340, 360, 375, 400, 450, 495, 540, 630, 700]) {
  console.log(String(t).padStart(4), "p", C.pressureAt(t).toFixed(2).padStart(6), "T", C.temperatureAt(t).toFixed(0).padStart(5), "x", M.burned(t).toFixed(3), "F", (C.forceAt(t) / 1000).toFixed(2).padStart(6), M.positionText(t));
}
