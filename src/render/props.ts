import type { ResidentDef } from '../data/schemas';
import type { PropAt, PropKind } from './animation';
import { rect } from './pixel';
import { CELL_H, CELL_W, FRAME, figureOf } from './sprites/character';

const C = 12;
const FRONT_FRAMES = new Set<number>([FRAME.frontStand, FRAME.frontSit, FRAME.frontTalk, FRAME.frontWave, FRAME.frontSitHands, FRAME.frontSitHandUp, FRAME.frontSitSlouch, FRAME.standHandUp, FRAME.backStand, FRAME.backSit, FRAME.backWork, FRAME.backSitWork, FRAME.frontSitCross]);
const SIT_FRAMES = new Set<number>([FRAME.sit, FRAME.frontSit, FRAME.sitArm, FRAME.sitArmUp, FRAME.sitLean, FRAME.frontSitHands, FRAME.frontSitHandUp, FRAME.frontSitSlouch, FRAME.backSit, FRAME.backSitWork, FRAME.frontSitCross]);

/** Где глаза в этом кадре (для моргания); со спины — нет */
export function eyesOf(app: ResidentDef['appearance'], frame: number): [number, number][] {
  if (frame === FRAME.lie || frame === FRAME.backStand || frame === FRAME.backSit || frame === FRAME.backWork || frame === FRAME.backSitWork) return [];
  const { H, legLen } = figureOf(app);
  const dy = SIT_FRAMES.has(frame) ? Math.max(0, legLen - 4) : 0;
  const hy = CELL_H - H + 1 + dy + (frame === FRAME.frontSitSlouch ? 1 : 0);
  if (FRONT_FRAMES.has(frame)) return [[C - 2, hy + 2], [C + 1, hy + 2]];
  return [[C + 1 + (frame === FRAME.sitLean ? -1 : 0), hy + 2]];
}

/** Где в ячейке спрайта находится рука для этого кадра */
function anchor(app: ResidentDef['appearance'], frame: number, at: PropAt): [number, number] {
  const { H, legLen, torsoLen } = figureOf(app);
  const sit = SIT_FRAMES.has(frame);
  const dy = sit ? Math.max(0, legLen - 4) : 0;
  const y0 = CELL_H - H;
  let ty = y0 + 6 + dy;
  const hy = y0 + 1 + dy;
  if (frame === FRAME.frontSitSlouch) ty += 1;
  const lean = frame === FRAME.sitLean ? -1 : 0;
  if (FRONT_FRAMES.has(frame)) {
    const armR = app.build === 'heavy' ? C + 4 : app.build === 'slim' ? C + 2 : C + 3;
    switch (at) {
      case 'hands':
      case 'fwd':
        return [C - 1, ty + torsoLen - 3];
      case 'ear':
        return [armR + 1, hy + 1];
      case 'mouth':
        return [armR, ty - 2];
      case 'up':
        return [armR, ty - 3];
      case 'low':
        return [armR, ty + torsoLen - 1];
    }
  }
  switch (at) {
    case 'hands':
    case 'fwd':
      return [C + 4 + lean, ty + 2];
    case 'mouth':
      return [C + 3 + lean, ty - 1];
    case 'ear':
      return [C + 2 + lean, hy + 2];
    case 'up':
      return [C + 4, ty - 3];
    case 'low':
      return [C + 2 + lean, ty + torsoLen - 1];
  }
}

/**
 * Нарисовать реквизит в руке. ix/top — где нарисован спрайт, flip — смотрит влево.
 */
export function drawProp(
  g: CanvasRenderingContext2D,
  app: ResidentDef['appearance'],
  frame: number,
  kind: PropKind,
  at: PropAt,
  ix: number,
  top: number,
  flip: boolean,
  nowMs: number,
  seed: number,
): void {
  const [cx, cy] = anchor(app, frame, at);
  const x = flip ? ix + CELL_W / 2 - 1 - cx : ix - CELL_W / 2 + cx;
  const y = top + cy;
  const d = flip ? -1 : 1;
  const tick = Math.floor(nowMs / 400 + seed);
  switch (kind) {
    case 'phone':
      if (at === 'hands') {
        rect(g, x - 1, y - 1, 3, 2, '#25262c');
        rect(g, x, y - 1, 1, 1, tick % 5 === 0 ? '#ffffff' : '#8fd0f5');
      } else {
        rect(g, x, y, 1, 3, '#25262c');
      }
      break;
    case 'cup':
      rect(g, x, y, 2, 2, '#f4f2ec');
      rect(g, x + (d > 0 ? 2 : -1), y, 1, 1, '#d8d4c8');
      if (tick % 3 === 0) rect(g, x + (tick % 2), y - 2, 1, 1, 'rgba(255,255,255,0.7)');
      break;
    case 'book': {
      const cover = ['#8a2a2a', '#2a4a7a', '#3a6a3a', '#7a5a2a'][seed % 4];
      rect(g, x - 2, y - 1, 5, 3, cover);
      rect(g, x - 1, y - 1, 3, 2, '#f3efe2');
      rect(g, x, y - 1, 1, 2, '#c8c2b0');
      if (Math.floor(nowMs / 150 + seed) % 40 === 0) rect(g, x + 1, y - 2, 1, 2, '#ffffff'); // листает
      break;
    }
    case 'paper':
      rect(g, x - 3, y - 2, 6, 4, '#e8e4d8');
      rect(g, x - 2, y - 1, 4, 1, '#9a968c');
      rect(g, x - 2, y + 1, 3, 1, '#9a968c');
      break;
    case 'remote':
      rect(g, x, y, 1, 2, '#2e2e34');
      break;
    case 'fork':
      rect(g, x, y - 1, 1, 2, '#c8c8c8');
      break;
    case 'pen':
      rect(g, x, y - 1, 1, 2, '#3a6fb0');
      break;
    case 'spoon':
      rect(g, x, y - 1, 1, 3, '#b8b8b8');
      break;
    case 'sponge':
      rect(g, x, y, 2, 1, '#f0c040');
      if (tick % 2) rect(g, x + d, y - 2, 1, 1, '#e8f6ff');
      break;
    case 'rag':
      rect(g, x, y, 2, 2, '#8fc0e0');
      break;
    case 'can':
      rect(g, x - 1, y, 3, 2, '#5f9e52');
      rect(g, x + 2 * d, y - 1, 1, 1, '#5f9e52');
      if (tick % 2) rect(g, x + 3 * d, y + 1, 1, 1, '#8fd0f5');
      break;
    case 'knitting': {
      const yarn = ['#c84a5a', '#4a7ac8', '#e8b040', '#7aa05a'][seed % 4];
      rect(g, x - 1, y, 3, 2, yarn); // вязание
      rect(g, x - 2 + (tick % 2), y - 1, 1, 1, '#c8c8c8'); // спицы
      rect(g, x + 2 - (tick % 2), y - 1, 1, 1, '#c8c8c8');
      rect(g, x + 3 * d, y + 4, 3, 3, yarn); // клубок рядом
      break;
    }
    case 'hoop':
      rect(g, x - 2, y - 2, 5, 5, '#b8742e'); // деревянные пяльцы
      rect(g, x - 1, y - 1, 3, 3, '#f4efe0');
      rect(g, x - 1 + (tick % 3), y, 1, 1, '#c8402e'); // стежок
      rect(g, x + 1, y - 1, 1, 1, '#3f8a4a');
      rect(g, x + 2 + (tick % 2), y - 3, 1, 2, '#c8c8c8'); // игла с ниткой
      break;
    case 'laptop': {
      // ноутбук на коленях: крышка с мерцающим фильмом
      rect(g, x - 3, y - 4, 7, 4, '#b8bcc4');
      rect(g, x - 2, y - 3, 5, 2, ['#3a6a9a', '#6a8a5a', '#9a6a4a', '#2a3a5a'][Math.floor(nowMs / 1800) % 4]);
      rect(g, x - 4, y, 9, 1, '#9aa0a8');
      break;
    }
    case 'headset':
      rect(g, x - 1, y, 1, 2, '#2b2b2b');
      break;
    case 'guitar':
      rect(g, x - 2, y - 1, 5, 4, '#b8742e');
      rect(g, x - 1, y, 1, 1, '#3a2010');
      for (let i = 0; i < 5; i++) rect(g, x + (3 + i) * d, y - 1 - Math.floor(i / 2), 1, 1, '#3a2010');
      break;
    case 'eguitar':
      drawEGuitar(g, app, frame, ix, top, flip, nowMs, seed, at);
      break;
  }
}

/**
 * Электрогитара в руках: корпус у бедра, гриф по диагонали к плечу,
 * правая рука бьёт по струнам, левая — на грифе. Все координаты целые.
 */
function drawEGuitar(g: CanvasRenderingContext2D, app: ResidentDef['appearance'], frame: number, ix: number, top: number, flip: boolean, nowMs: number, seed: number, at: PropAt) {
  const { H, torsoLen } = figureOf(app);
  const x0 = ix - CELL_W / 2;
  const ty = top + CELL_H - H + 6; // верх торса
  const by = ty + torsoLen - 3; // корпус гитары — у бедра
  const BODY = '#7a1f2b';
  const NECK = '#3a2a1a';
  const strum = Math.floor(nowMs / 140 + seed) % 2;
  if (FRONT_FRAMES.has(frame)) {
    // анфас: корпус слева (правая рука играющего), гриф уходит вверх-вправо
    const bx = x0 + C - 4;
    rect(g, bx, by, 4, 3, BODY);
    rect(g, bx - 1, by + 1, 1, 2, BODY);
    rect(g, bx + 1, by + 1, 2, 1, '#f3f1ea'); // накладка
    rect(g, bx + 2, by + 2, 1, 1, '#c8c8c8'); // звукосниматель
    const steps = Math.max(3, torsoLen - 2);
    for (let i = 0; i < steps; i++) rect(g, bx + 4 + i, by - 1 - i, 1, 1, NECK);
    rect(g, bx + 4 + steps, by - 2 - steps, 2, 1, '#2a2a30'); // голова грифа
    // правая рука бьёт по струнам, левая — на ладу
    rect(g, bx + 2, by - 1 + strum, 1, 1, app.skin);
    const fret = at === 'up' ? steps - 1 : Math.floor(steps / 2) + (Math.floor(nowMs / 900 + seed) % 2);
    rect(g, bx + 4 + fret, by - 1 - fret + 1, 1, 1, app.skin);
    // шнур к комбику
    rect(g, bx - 1, by + 3, 1, Math.max(1, top + CELL_H - by - 3), '#1e1e22');
    return;
  }
  // сбоку: корпус перед бедром, гриф вперёд-вверх
  const d = flip ? -1 : 1;
  const bx = flip ? x0 + CELL_W - 1 - (C + 1) - 3 : x0 + C + 1;
  rect(g, bx, by, 4, 3, BODY);
  rect(g, bx + (flip ? 0 : 1), by + 1, 2, 1, '#f3f1ea');
  const nx = flip ? bx - 1 : bx + 4;
  for (let i = 0; i < 4; i++) rect(g, nx + i * d, by - i, 1, 1, NECK);
  rect(g, bx + 1, by - 1 + strum, 1, 1, app.skin);
}
