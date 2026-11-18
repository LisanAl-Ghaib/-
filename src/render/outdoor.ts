import { SLAB } from '../config';
import { mix, shade } from '../core/math';
import { Rng } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import { disc, rect } from './pixel';

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
  // проулок
  rect(g, 0, gy, L.buildingX0, SLAB, '#7b7770');
  rect(g, 0, gy, L.buildingX0, 1, '#97928a');
  rect(g, 0, gy + SLAB, L.buildingX0, bottom - gy - SLAB, '#5d4a3a');
  // двор: дорожка у дома, газон, бордюр, дорога у остановки
  const yx0 = L.yard.x0;
  rect(g, yx0, gy + SLAB, L.worldW - yx0, bottom - gy - SLAB, '#5d4a3a');
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
