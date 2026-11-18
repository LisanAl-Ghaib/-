import type { ResidentDef } from '../data/schemas';
import type { PropAt, PropKind } from './animation';
import { rect } from './pixel';
import { CELL_H, CELL_W, FRAME, figureOf } from './sprites/character';

const C = 12;
const FRONT_FRAMES = new Set<number>([FRAME.frontStand, FRAME.frontSit, FRAME.frontTalk, FRAME.frontWave, FRAME.frontSitHands, FRAME.frontSitHandUp, FRAME.frontSitSlouch, FRAME.standHandUp]);
const SIT_FRAMES = new Set<number>([FRAME.sit, FRAME.frontSit, FRAME.sitArm, FRAME.sitArmUp, FRAME.sitLean, FRAME.frontSitHands, FRAME.frontSitHandUp, FRAME.frontSitSlouch]);

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
    case 'guitar':
      rect(g, x - 2, y - 1, 5, 4, '#b8742e');
      rect(g, x - 1, y, 1, 1, '#3a2010');
      for (let i = 0; i < 5; i++) rect(g, x + (3 + i) * d, y - i * 0.5 - 1, 1, 1, '#3a2010');
      break;
  }
}
