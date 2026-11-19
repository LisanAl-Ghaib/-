import { SLAB } from '../config';
import { mix, shade } from '../core/math';
import { Rng } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import { disc, rect } from './pixel';
import { makeCanvas } from './sprites/registry';

/** Параметры сезона для отрисовки улицы (заполняются из погоды/календаря) */
export interface OutdoorLook {
  /** цвета листвы; пустой массив — голые ветки */
  foliage: string[];
  /** доля листвы 0..1 */
  leafAmount: number;
  /** цветы/цветение весной */
  blossom: number;
  grass: string;
  snow: number; // 0..1
  puddles: number; // 0..1
  wind: number; // 0..1
}

export const DEFAULT_LOOK: OutdoorLook = {
  foliage: ['#4f8a45', '#5f9e52', '#3f7a3c', '#6fae5c'],
  leafAmount: 1,
  blossom: 0,
  grass: '#6a9a4a',
  snow: 0,
  puddles: 0,
  wind: 0.2,
};

/** Земля, тротуары, двор (без деревьев — они анимируются отдельно) */
export function drawGround(g: CanvasRenderingContext2D, defs: WorldDefs, look: OutdoorLook) {
  const L = defs.layout;
  const gy = L.groundY;
  const bottom = L.worldH;
  // разрез земли — слои грунта, камни, трубы, корни (рисуется один раз и кэшируется)
  let under = undergroundCache.get(L);
  if (!under) undergroundCache.set(L, (under = makeUnderground(defs)));
  g.drawImage(under, 0, gy + SLAB + 2);
  // проулок
  rect(g, 0, gy, L.buildingX0, SLAB, '#7b7770');
  rect(g, 0, gy, L.buildingX0, 1, '#97928a');
  rect(g, 0, gy + SLAB, L.buildingX0, 2, '#5d4a3a');
  // двор: дорожка у дома, газон, бордюр, дорога у остановки
  const yx0 = L.yard.x0;
  rect(g, yx0, gy + SLAB, L.worldW - yx0, 2, '#5d4a3a');
  void bottom;
  const grass = look.snow > 0.5 ? '#e8eef2' : look.grass;
  rect(g, yx0, gy, L.worldW - yx0, SLAB, grass);
  rect(g, yx0, gy, L.worldW - yx0, 1, shade(grass, 0.15));
  // асфальтовая дорожка
  rect(g, yx0, gy, 40, SLAB, '#7b7770');
  rect(g, yx0, gy, 40, 1, '#97928a');
  // дорога и бордюр у остановки
  const roadX = L.yard.busStop - 26;
  rect(g, roadX, gy, L.worldW - roadX, SLAB, '#6c6862');
  rect(g, roadX, gy, L.worldW - roadX, 1, '#8a857e');
  rect(g, roadX - 2, gy - 1, 2, 2, '#b0aba2');
  // травинки / снег
  const rng = Rng.fromSeed('grass');
  for (let x = yx0 + 42; x < roadX - 2; x += 1) {
    if (rng.chance(0.35)) rect(g, x, gy - 1, 1, 1, look.snow > 0.5 ? '#f4f8fb' : shade(look.grass, rng.range(-0.15, 0.1)));
  }
  if (look.snow > 0) {
    const h = Math.max(1, Math.round(look.snow * 3));
    g.globalAlpha = Math.min(1, look.snow * 1.4);
    rect(g, 0, gy - h + 1, L.buildingX0, h, '#f2f6f9');
    rect(g, yx0 + 40, gy - h + 1, roadX - yx0 - 40, h, '#f2f6f9');
    rect(g, L.buildingX0 - 2, L.roofY + 6 - h, L.buildingX1 - L.buildingX0 + 4, h, '#f2f6f9');
    g.globalAlpha = 1;
  }
  if (look.puddles > 0.15 && look.snow < 0.3) {
    const pr = Rng.fromSeed('puddles');
    g.globalAlpha = Math.min(0.9, look.puddles);
    for (let i = 0; i < 6; i++) {
      const px = pr.int(yx0 + 4, L.worldW - 10);
      const w = Math.round(pr.int(5, 14) * (0.5 + look.puddles * 0.5));
      rect(g, px, gy, w, 1, '#8fb3cf');
      rect(g, px + 1, gy, Math.max(1, w - 3), 1, '#b9d4e8');
    }
    const ax = pr.int(4, L.buildingX0 - 12);
    rect(g, ax, gy, 9, 1, '#8fb3cf');
    g.globalAlpha = 1;
  }
}

/** Неподвижные предметы двора */
export function drawYardProps(g: CanvasRenderingContext2D, defs: WorldDefs, look: OutdoorLook) {
  const L = defs.layout;
  const gy = L.groundY;
  const Y = L.yard;
  // мусорные баки
  rect(g, Y.bins, gy - 10, 9, 10, '#3d6b4a');
  rect(g, Y.bins - 1, gy - 11, 11, 2, '#2f5a3c');
  rect(g, Y.bins + 11, gy - 10, 9, 10, '#4a5a6b');
  rect(g, Y.bins + 10, gy - 11, 11, 2, '#3a4a5a');
  // лавочка
  const bx = Y.bench.x;
  rect(g, bx, gy - 6, 26, 2, '#8a5a34');
  rect(g, bx, gy - 7, 26, 1, '#a8703f');
  rect(g, bx + 1, gy - 12, 24, 2, '#8a5a34');
  rect(g, bx + 2, gy - 4, 2, 4, '#3a3a40');
  rect(g, bx + 22, gy - 4, 2, 4, '#3a3a40');
  rect(g, bx + 2, gy - 12, 1, 6, '#3a3a40');
  rect(g, bx + 23, gy - 12, 1, 6, '#3a3a40');
  if (look.snow > 0.4) rect(g, bx, gy - 8, 26, 1, '#f2f6f9');
  // урна
  rect(g, bx + 30, gy - 7, 5, 7, '#555a60');
  // фонарь
  const lx = Y.lamp;
  rect(g, lx, gy - 46, 2, 46, '#4a4d55');
  rect(g, lx - 4, gy - 48, 8, 2, '#4a4d55');
  rect(g, lx - 3, gy - 46, 6, 2, '#e8e2c8');
  // качели
  const sx = Y.swing;
  rect(g, sx - 10, gy - 28, 1, 28, '#c84a3a');
  rect(g, sx + 10, gy - 28, 1, 28, '#c84a3a');
  rect(g, sx - 11, gy - 29, 23, 2, '#c84a3a');
  rect(g, sx - 3, gy - 27, 1, 19, '#888');
  rect(g, sx + 3, gy - 27, 1, 19, '#888');
  rect(g, sx - 4, gy - 8, 9, 2, '#d6a03c');
  // песочница
  rect(g, sx + 16, gy - 4, 22, 4, '#b8864a');
  rect(g, sx + 18, gy - 4, 18, 1, look.snow > 0.4 ? '#f2f6f9' : '#e2c98c');
  // остановка
  const st = Y.busStop;
  rect(g, st - 18, gy - 30, 30, 2, '#3a5a7a');
  rect(g, st - 17, gy - 28, 1, 28, '#55595f');
  rect(g, st + 10, gy - 28, 1, 28, '#55595f');
  g.globalAlpha = 0.35;
  rect(g, st - 16, gy - 28, 26, 22, '#a8c8dc');
  g.globalAlpha = 1;
  rect(g, st - 12, gy - 9, 18, 2, '#6a6e75');
  rect(g, st - 10, gy - 7, 1, 7, '#55595f');
  rect(g, st + 4, gy - 7, 1, 7, '#55595f');
  if (look.snow > 0.4) rect(g, st - 18, gy - 31, 30, 1, '#f2f6f9');
  // знак «А»
  rect(g, st + 18, gy - 34, 1, 34, '#6a6e75');
  rect(g, st + 14, gy - 38, 9, 7, '#f0c419');
  rect(g, st + 16, gy - 36, 1, 3, '#333');
  rect(g, st + 19, gy - 36, 1, 3, '#333');
  rect(g, st + 17, gy - 37, 2, 1, '#333');
  rect(g, st + 17, gy - 35, 2, 1, '#333');
  // проулок: водосток и фонарь
  rect(g, L.buildingX0 - 3, L.roofY + 8, 2, L.groundY - L.roofY - 8, '#7a7d84');
  rect(g, L.buildingX0 - 6, L.groundY - 2, 5, 2, '#7a7d84');
  rect(g, 14, gy - 40, 2, 40, '#4a4d55');
  rect(g, 14, gy - 42, 8, 2, '#4a4d55');
  rect(g, 19, gy - 40, 4, 2, '#e8e2c8');
}

export interface TreeShape {
  x: number;
  trunkH: number;
  crown: { dx: number; dy: number; r: number; tone: number }[];
  branches: { dx: number; dy: number; len: number; dir: number }[];
}

export function makeTrees(defs: WorldDefs): TreeShape[] {
  return defs.layout.yard.trees.map((x, i) => {
    const rng = Rng.fromSeed(`tree${i}`);
    const trunkH = rng.int(22, 34);
    const crown = Array.from({ length: 9 + rng.int(0, 4) }, () => ({
      dx: rng.int(-12, 12),
      dy: rng.int(-14, 4),
      r: rng.int(5, 9),
      tone: rng.int(0, 3),
    }));
    const branches = Array.from({ length: 6 }, (_, k) => ({
      dx: 0,
      dy: -rng.int(6, trunkH - 4),
      len: rng.int(6, 13),
      dir: k % 2 ? 1 : -1,
    }));
    return { x, trunkH, crown, branches };
  });
}

/** Деревья: листва по сезону, покачивание от ветра */
export function drawTrees(g: CanvasRenderingContext2D, defs: WorldDefs, trees: TreeShape[], look: OutdoorLook, t: number) {
  const gy = defs.layout.groundY;
  for (const tr of trees) {
    const sway = Math.round(Math.sin(t * 0.0015 * (1 + look.wind * 2) + tr.x) * look.wind * 2);
    const topY = gy - tr.trunkH;
    rect(g, tr.x - 2, topY, 4, tr.trunkH, '#5b4030');
    rect(g, tr.x - 2, topY, 1, tr.trunkH, '#4a3326');
    for (const b of tr.branches) {
      for (let i = 0; i < b.len; i++) rect(g, tr.x + b.dir * (2 + i) + Math.round((sway * i) / b.len), gy + b.dy - Math.floor(i / 2), 1, 1, '#5b4030');
    }
    if (look.leafAmount > 0.02 && look.foliage.length) {
      const rng = new Rng([tr.x * 7919, 17, 31, 47]);
      for (const c of tr.crown) {
        if (rng.next() > look.leafAmount) continue;
        const color = look.foliage[c.tone % look.foliage.length];
        disc(g, tr.x + c.dx + sway, topY + c.dy, c.r, color);
        disc(g, tr.x + c.dx + sway - 1, topY + c.dy - 2, Math.max(1, c.r - 3), shade(color, 0.12));
      }
      if (look.blossom > 0) {
        const br = new Rng([tr.x * 31, 3, 5, 7]);
        for (let i = 0; i < 40 * look.blossom; i++) rect(g, tr.x + br.int(-16, 16) + sway, topY + br.int(-20, 8), 1, 1, mix('#ffd0e0', '#ffffff', br.next()));
      }
    }
    if (look.snow > 0.3) {
      for (const b of tr.branches) rect(g, tr.x + b.dir * 3, gy + b.dy - 1, Math.min(4, b.len), 1, '#f2f6f9');
      if (look.leafAmount > 0.3) for (const c of tr.crown.slice(0, 5)) rect(g, tr.x + c.dx - c.r + 2 + sway, topY + c.dy - c.r, c.r * 2 - 3, 1, '#f2f6f9');
    }
  }
}

const undergroundCache = new WeakMap<object, HTMLCanvasElement>();

/**
 * Земля в разрезе: дёрн с корнями травы, суглинок с камнями, глина, песок, внизу — серый гравий.
 * Под двором — водопровод и канализация к дому, кабель с сигнальной лентой, корни деревьев.
 */
function makeUnderground(defs: WorldDefs): HTMLCanvasElement {
  const L = defs.layout;
  const W = L.worldW;
  const H = L.worldH - L.groundY - SLAB - 2;
  const c = makeCanvas(W, Math.max(1, H));
  const g = c.getContext('2d')!;
  const rng = Rng.fromSeed('underground');
  // слои с волнистыми границами
  const layers: [number, string, string][] = [
    [0, '#4e3a2c', '#5a4434'],
    [16, '#6a5038', '#765a40'],
    [58, '#8a6a48', '#967452'],
    [104, '#a08a62', '#ac966c'],
    [146, '#5e5a56', '#6a6660'],
  ];
  for (let x = 0; x < W; x++) {
    for (let li = 0; li < layers.length; li++) {
      const wav = (y: number, k: number) => y + Math.round(Math.sin(x * 0.045 + k * 1.7) * 3 + Math.sin(x * 0.13 + k) * 1.5);
      const y0 = li === 0 ? 0 : wav(layers[li][0], li);
      const y1 = li + 1 < layers.length ? wav(layers[li + 1][0], li + 1) : H;
      if (y1 <= y0) continue;
      g.fillStyle = layers[li][1];
      g.fillRect(x, y0, 1, y1 - y0);
      // зерно
      for (let y = y0; y < y1; y += 3) if (rng.chance(0.18)) {
        g.fillStyle = layers[li][2];
        g.fillRect(x, y + rng.int(0, 2), 1, 1);
      }
    }
  }
  // камни разного размера, глубже — крупнее
  for (let i = 0; i < 260; i++) {
    const x = rng.int(0, W - 4);
    const y = rng.int(10, H - 3);
    const s = y > 120 ? rng.int(2, 5) : rng.int(1, 3);
    g.fillStyle = rng.pick(['#8a8478', '#a09a8e', '#6e6a62', '#b4ae9e']);
    g.fillRect(x, y, s, Math.max(1, s - 1));
    g.fillStyle = '#c8c2b4';
    g.fillRect(x, y, 1, 1);
  }
  // корни травы у самой поверхности
  for (let x = 0; x < W; x += 2) if (rng.chance(0.5)) {
    g.fillStyle = '#3e2e22';
    g.fillRect(x, 0, 1, rng.int(2, 6));
  }
  // корни деревьев двора
  for (const tx of L.yard.trees) {
    for (let k = 0; k < 7; k++) {
      let x = tx;
      let y = 0;
      const dir = k % 2 ? 1 : -1;
      const len = rng.int(18, 40);
      for (let i = 0; i < len; i++) {
        x += rng.chance(0.55) ? dir : 0;
        y += 1;
        g.fillStyle = '#4a3020';
        g.fillRect(x, y, i < 8 ? 2 : 1, 1);
      }
    }
  }
  // водопровод (синий) и канализация (коричневая) идут из двора в подвал дома
  const bx1 = L.buildingX1;
  const pipe = (y: number, h: number, col: string, x0: number, x1: number) => {
    g.fillStyle = col;
    g.fillRect(x0, y, x1 - x0, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x0, y, x1 - x0, 1);
    for (let x = x0 + 30; x < x1; x += 48) {
      g.fillStyle = '#2a2a2a';
      g.fillRect(x, y - 1, 2, h + 2); // стыки
    }
  };
  pipe(30, 3, '#3a5a8a', bx1 - 6, W);
  pipe(44, 4, '#6a4a32', bx1 - 6, W);
  // колодец у дороги
  const well = L.yard.busStop - 40;
  g.fillStyle = '#7a7670';
  g.fillRect(well, 0, 10, 52);
  g.fillStyle = '#3a3632';
  g.fillRect(well + 2, 0, 6, 50);
  for (let y = 4; y < 48; y += 5) {
    g.fillStyle = '#9a968e';
    g.fillRect(well + 2, y, 6, 1); // скобы-ступени
  }
  // кабель в песчаной подсыпке и сигнальная лента над ним
  g.fillStyle = '#c8402e';
  g.fillRect(0, 20, W, 1);
  g.fillStyle = '#1e1e22';
  g.fillRect(0, 24, W, 1);
  // старая находка: ржавая банка, кусок кирпича
  g.fillStyle = '#8a4a2a';
  g.fillRect(rng.int(20, W - 20), rng.int(60, 90), 3, 2);
  g.fillStyle = '#a85a4a';
  g.fillRect(rng.int(20, W - 20), rng.int(70, 120), 4, 2);
  return c;
}
