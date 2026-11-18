import { shade } from '../../core/math';
import type { ResidentDef } from '../../data/schemas';
import { ctx2d, makeCanvas } from './registry';

/**
 * Процедурный спрайт жильца.
 * Лист кадров: CELL_W×CELL_H, кадры в ряд (см. FRAME). Персонаж нарисован лицом вправо,
 * по центру ячейки (x = 12), ноги на нижней строке. Такую же раскладку должен иметь PNG-спрайт
 * для подмены (docs/SPRITES.md).
 */
export const CELL_W = 24;
export const CELL_H = 24;
export const FRAME = {
  stand: 0,
  walk0: 1,
  walk1: 2,
  walk2: 3,
  walk3: 4,
  sit: 5,
  frontStand: 6,
  frontSit: 7,
  lie: 8,
  frontTalk: 9,
  work: 10,
  frontWave: 11,
} as const;
export const FRAME_COUNT = 12;

type Appearance = ResidentDef['appearance'];

interface Pal {
  skin: string;
  skinS: string;
  hair: string;
  hairS: string;
  top: string;
  topS: string;
  bottom: string;
  bottomS: string;
  shoes: string;
  eye: string;
  white: string;
}

const C = 12; // центр ячейки

export function generateCharacterSheet(app: Appearance, opts: { coat?: boolean } = {}): HTMLCanvasElement {
  const canvas = makeCanvas(CELL_W * FRAME_COUNT, CELL_H);
  const g = ctx2d(canvas);
  const top = opts.coat && app.outfit.coat ? app.outfit.coat : app.outfit.top;
  const pal: Pal = {
    skin: app.skin,
    skinS: shade(app.skin, -0.18),
    hair: app.hair.color,
    hairS: shade(app.hair.color, -0.25),
    top,
    topS: shade(top, -0.25),
    bottom: app.outfit.bottom,
    bottomS: shade(app.outfit.bottom, -0.3),
    shoes: app.outfit.shoes,
    eye: '#2a1d1a',
    white: '#f4f1ea',
  };
  const H = app.height === 'short' ? 18 : app.height === 'tall' ? 22 : 20;
  const legLen = H === 18 ? 7 : H === 22 ? 9 : 8;
  const torsoLen = H - legLen - 6;
  for (let f = 0; f < FRAME_COUNT; f++) {
    g.save();
    g.translate(f * CELL_W, 0);
    drawFrame(g, f, app, pal, H, legLen, torsoLen, !!opts.coat);
    g.restore();
  }
  return canvas;
}

function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function drawFrame(
  g: CanvasRenderingContext2D,
  f: number,
  app: Appearance,
  p: Pal,
  H: number,
  legLen: number,
  torsoLen: number,
  coat: boolean,
) {
  const y0 = CELL_H - H; // строка макушки (волосы)
  const headY = y0 + 1;
  const torsoY = y0 + 6;
  const legY = torsoY + torsoLen;
  const build = app.build;
  const dress = app.outfit.style === 'dress' || app.outfit.style === 'robe';
  const acc = new Set(app.accessories);

  if (f === FRAME.lie) {
    drawLie(g, app, p, H);
    return;
  }

  const front = f === FRAME.frontStand || f === FRAME.frontSit || f === FRAME.frontTalk || f === FRAME.frontWave;
  const sitting = f === FRAME.sit || f === FRAME.frontSit;
  const dy = sitting ? Math.max(0, legLen - 4) : 0; // садится — верх опускается

  if (!front) {
    // ── вид сбоку, лицом вправо
    const tw0 = build === 'heavy' ? C - 3 : C - 2;
    const tw1 = build === 'slim' ? C + 1 : C + 2;
    // ноги
    if (sitting) {
      const hipY = legY + dy;
      px(g, C - 1, hipY - 1, 5, 2, p.bottom); // бедро
      px(g, C + 2, hipY + 1, 2, CELL_H - hipY - 2, p.bottomS); // голень
      px(g, C + 2, CELL_H - 1, 3, 1, p.shoes);
    } else {
      const walk = f >= FRAME.walk0 && f <= FRAME.walk3 ? f - FRAME.walk0 : -1;
      const spread = walk === 0 ? 1 : walk === 2 ? -1 : 0;
      const upper = Math.ceil(legLen / 2);
      // задняя нога
      px(g, C, legY, 2, upper, p.bottomS);
      px(g, C - spread, legY + upper, 2, legLen - upper - 1, p.bottomS);
      px(g, C - spread, CELL_H - 1, 3, 1, shade(p.shoes, -0.2));
      // передняя
      px(g, C - 1, legY, 2, upper, p.bottom);
      px(g, C - 1 + spread, legY + upper, 2, legLen - upper - 1, p.bottom);
      px(g, C - 1 + spread, CELL_H - 1, 3, 1, p.shoes);
    }
    // торс
    const ty = torsoY + dy;
    px(g, tw0, ty, tw1 - tw0 + 1, torsoLen, p.top);
    px(g, tw0, ty, 1, torsoLen, p.topS);
    if (build === 'heavy') px(g, tw1 + 1, ty + 2, 1, torsoLen - 2, p.top);
    if (dress && !sitting) {
      const skirt = Math.max(2, Math.floor(legLen / 2) + (app.outfit.style === 'robe' ? 2 : 0));
      px(g, tw0 - 1, ty + torsoLen, tw1 - tw0 + 3, skirt, p.top);
      px(g, tw0 - 1, ty + torsoLen, 1, skirt, p.topS);
    }
    if (coat && !sitting) px(g, tw0, ty + torsoLen, tw1 - tw0 + 1, 2, p.top);
    if (acc.has('apron')) px(g, tw1 - 1, ty + 2, 2, torsoLen + 2, '#e9e4d8');
    if (acc.has('tie') || app.outfit.style === 'formal') {
      px(g, tw1, ty, 1, 1, p.white);
      if (acc.has('tie')) px(g, tw1, ty + 1, 1, 3, '#7a1f2b');
    }
    if (acc.has('scarf') || coat) px(g, C - 2, ty, 5, 1, coat ? shade(p.top, 0.25) : '#b8423a');
    if (acc.has('bag')) px(g, tw0 - 1, ty + 2, 2, 3, '#6b4a2a');
    // рука
    if (f === FRAME.work) {
      px(g, C, ty + 1, 1, 2, p.topS);
      px(g, C + 1, ty + 2, 2, 1, p.topS);
      px(g, C + 3, ty + 2, 1, 1, p.skin);
    } else if (sitting) {
      px(g, C, ty + 1, 1, torsoLen - 2, p.topS);
      px(g, C + 1, ty + torsoLen - 1, 2, 1, p.skin);
    } else {
      const walk = f >= FRAME.walk0 && f <= FRAME.walk3 ? f - FRAME.walk0 : -1;
      const sw = walk === 0 ? -1 : walk === 2 ? 1 : 0;
      px(g, C, ty + 1, 1, torsoLen - 2, p.topS);
      px(g, C + sw, ty + torsoLen - 1, 1, 1, p.topS);
      px(g, C + sw, ty + torsoLen, 1, 1, p.skin);
    }
    // голова
    const hy = headY + dy;
    px(g, C - 2, hy, 5, 5, p.skin);
    px(g, C + 3, hy + 2, 1, 1, p.skin); // нос
    px(g, C - 1, hy + 2, 1, 1, p.skinS); // ухо
    px(g, C + 1, hy + 2, 1, 1, p.eye);
    if (acc.has('glasses') || acc.has('sunglasses')) {
      const gl = acc.has('sunglasses') ? '#1d1d22' : '#3c3c44';
      px(g, C, hy + 2, 3, 1, gl);
      if (!acc.has('sunglasses')) px(g, C + 1, hy + 2, 1, 1, '#bfe0f0');
    }
    if (acc.has('beard')) px(g, C, hy + 3, 3, 2, p.hair);
    else if (acc.has('stubble')) px(g, C, hy + 4, 3, 1, shade(p.skin, -0.3));
    if (acc.has('mustache')) px(g, C + 1, hy + 3, 2, 1, p.hair);
    if (acc.has('earrings')) px(g, C - 1, hy + 3, 1, 1, '#e8c547');
    drawHairSide(g, app.hair.style, p, y0 + dy);
    drawHeadwearSide(g, acc, y0 + dy);
    if (acc.has('headphones')) {
      px(g, C - 2, hy - 1, 4, 1, '#2b2b2b');
      px(g, C - 2, hy + 1, 2, 2, '#2b2b2b');
    }
    return;
  }

  // ── вид спереди
  const tw0 = build === 'heavy' ? C - 4 : build === 'slim' ? C - 2 : C - 3;
  const tw1 = build === 'heavy' ? C + 3 : build === 'slim' ? C + 1 : C + 2;
  const ty = torsoY + dy;
  // ноги
  if (sitting) {
    px(g, C - 3, legY + dy, 6, 2, p.bottom);
    px(g, C - 3, legY + dy + 2, 2, CELL_H - legY - dy - 3, p.bottomS);
    px(g, C + 1, legY + dy + 2, 2, CELL_H - legY - dy - 3, p.bottomS);
    px(g, C - 3, CELL_H - 1, 2, 1, p.shoes);
    px(g, C + 1, CELL_H - 1, 2, 1, p.shoes);
  } else {
    px(g, C - 2, legY, 2, legLen - 1, p.bottom);
    px(g, C, legY, 2, legLen - 1, p.bottom);
    px(g, C, legY + 1, 1, legLen - 2, p.bottomS);
    px(g, C - 2, CELL_H - 1, 2, 1, p.shoes);
    px(g, C, CELL_H - 1, 2, 1, p.shoes);
  }
  // торс
  px(g, tw0, ty, tw1 - tw0 + 1, torsoLen, p.top);
  px(g, tw0, ty + torsoLen - 1, tw1 - tw0 + 1, 1, p.topS);
  if (dress && !sitting) {
    const skirt = Math.max(2, Math.floor(legLen / 2) + (app.outfit.style === 'robe' ? 2 : 0));
    px(g, tw0 - 1, ty + torsoLen, tw1 - tw0 + 3, skirt, p.top);
    px(g, tw0 - 1, ty + torsoLen + skirt - 1, tw1 - tw0 + 3, 1, p.topS);
  }
  if (coat && !sitting) {
    px(g, tw0, ty + torsoLen, tw1 - tw0 + 1, 2, p.top);
    px(g, C - 1, ty + 1, 1, torsoLen + 1, p.topS); // застёжка
  }
  if (acc.has('apron')) px(g, C - 2, ty + 2, 4, torsoLen + 2, '#e9e4d8');
  if (acc.has('tie')) px(g, C - 1, ty + 1, 1, 4, '#7a1f2b');
  if (app.outfit.style === 'formal') {
    px(g, C - 2, ty, 1, 1, p.white);
    px(g, C, ty, 1, 1, p.white);
  }
  if (acc.has('scarf') || coat) px(g, C - 3, ty, 6, 1, coat ? shade(p.top, 0.25) : '#b8423a');
  // руки
  const armL = tw0 - 1;
  const armR = tw1 + 1;
  px(g, armL, ty + 1, 1, torsoLen - 1, p.topS);
  px(g, armL, ty + torsoLen, 1, 1, p.skin);
  if (f === FRAME.frontTalk) {
    px(g, armR, ty + 1, 1, 2, p.topS);
    px(g, armR + 1, ty, 1, 1, p.skin);
  } else if (f === FRAME.frontWave) {
    px(g, armR, ty - 2, 1, 3, p.topS);
    px(g, armR, ty - 3, 1, 1, p.skin);
  } else {
    px(g, armR, ty + 1, 1, torsoLen - 1, p.topS);
    px(g, armR, ty + torsoLen, 1, 1, p.skin);
  }
  if (acc.has('bag')) px(g, armR, ty + 3, 2, 3, '#6b4a2a');
  // голова
  const hy = headY + dy;
  px(g, C - 3, hy, 6, 5, p.skin);
  px(g, C - 3, hy + 4, 6, 1, p.skinS);
  px(g, C - 2, hy + 2, 1, 1, p.eye);
  px(g, C + 1, hy + 2, 1, 1, p.eye);
  if (acc.has('glasses') || acc.has('sunglasses')) {
    const gl = acc.has('sunglasses') ? '#1d1d22' : '#3c3c44';
    px(g, C - 3, hy + 2, 6, 1, gl);
    if (!acc.has('sunglasses')) {
      px(g, C - 2, hy + 2, 1, 1, '#bfe0f0');
      px(g, C + 1, hy + 2, 1, 1, '#bfe0f0');
    }
  }
  if (acc.has('beard')) px(g, C - 3, hy + 3, 6, 2, p.hair);
  else if (acc.has('stubble')) px(g, C - 2, hy + 4, 4, 1, shade(p.skin, -0.3));
  if (acc.has('mustache')) px(g, C - 2, hy + 3, 4, 1, p.hair);
  if (acc.has('earrings')) {
    px(g, C - 4, hy + 3, 1, 1, '#e8c547');
    px(g, C + 3, hy + 3, 1, 1, '#e8c547');
  }
  drawHairFront(g, app.hair.style, p, y0 + dy);
  drawHeadwearFront(g, acc, y0 + dy);
  if (acc.has('headphones')) {
    px(g, C - 3, hy - 1, 6, 1, '#2b2b2b');
    px(g, C - 4, hy + 1, 1, 2, '#2b2b2b');
    px(g, C + 3, hy + 1, 1, 2, '#2b2b2b');
  }
}

function drawHairSide(g: CanvasRenderingContext2D, style: string, p: Pal, y0: number) {
  const hy = y0 + 1;
  const top = () => {
    px(g, C - 2, y0, 5, 1, p.hair);
    px(g, C - 2, hy, 4, 1, p.hair);
    px(g, C - 2, hy + 1, 1, 1, p.hairS);
  };
  switch (style) {
    case 'short':
      top();
      break;
    case 'buzz':
      px(g, C - 2, hy, 5, 1, p.hairS);
      px(g, C - 2, hy + 1, 1, 1, p.hairS);
      break;
    case 'long':
      top();
      px(g, C - 3, hy, 2, 8, p.hair);
      px(g, C - 3, hy + 6, 1, 2, p.hairS);
      break;
    case 'bob':
      top();
      px(g, C - 3, hy, 2, 5, p.hair);
      px(g, C + 2, hy, 1, 1, p.hair);
      break;
    case 'ponytail':
      top();
      px(g, C - 3, hy, 1, 2, p.hair);
      px(g, C - 4, hy + 1, 1, 5, p.hairS);
      break;
    case 'braid':
      top();
      px(g, C - 3, hy, 1, 3, p.hair);
      px(g, C - 4, hy + 2, 1, 7, p.hairS);
      break;
    case 'bun':
      top();
      px(g, C - 4, y0 - 1, 3, 3, p.hair);
      px(g, C - 4, y0 + 1, 1, 1, p.hairS);
      break;
    case 'curly':
      px(g, C - 3, y0 - 1, 6, 2, p.hair);
      px(g, C - 3, hy, 2, 4, p.hair);
      px(g, C - 2, y0 - 1, 1, 1, p.hairS);
      px(g, C, y0, 1, 1, p.hairS);
      px(g, C - 3, hy + 2, 1, 1, p.hairS);
      break;
    case 'bald':
      px(g, C - 1, y0, 3, 1, p.skin);
      break;
    case 'balding':
      px(g, C - 1, y0, 3, 1, p.skin);
      px(g, C - 2, hy, 1, 3, p.hair);
      break;
    case 'mohawk':
      px(g, C - 1, y0 - 2, 2, 3, p.hair);
      px(g, C - 2, hy, 1, 2, p.hairS);
      break;
    case 'pigtails':
      top();
      px(g, C - 4, hy + 1, 2, 3, p.hair);
      break;
  }
}

function drawHairFront(g: CanvasRenderingContext2D, style: string, p: Pal, y0: number) {
  const hy = y0 + 1;
  const top = () => {
    px(g, C - 3, y0, 6, 1, p.hair);
    px(g, C - 3, hy, 6, 1, p.hair);
    px(g, C - 3, hy + 1, 1, 1, p.hairS);
    px(g, C + 2, hy + 1, 1, 1, p.hairS);
  };
  switch (style) {
    case 'short':
      top();
      break;
    case 'buzz':
      px(g, C - 3, hy, 6, 1, p.hairS);
      break;
    case 'long':
      top();
      px(g, C - 4, hy, 1, 8, p.hair);
      px(g, C + 3, hy, 1, 8, p.hair);
      break;
    case 'bob':
      top();
      px(g, C - 4, hy, 1, 5, p.hair);
      px(g, C + 3, hy, 1, 5, p.hair);
      break;
    case 'ponytail':
    case 'braid':
      top();
      px(g, C + 3, hy + 1, 1, 4, p.hairS);
      break;
    case 'bun':
      top();
      px(g, C - 1, y0 - 2, 2, 2, p.hair);
      break;
    case 'curly':
      px(g, C - 4, y0 - 1, 8, 2, p.hair);
      px(g, C - 4, hy, 1, 4, p.hair);
      px(g, C + 3, hy, 1, 4, p.hair);
      px(g, C - 2, y0 - 1, 1, 1, p.hairS);
      px(g, C + 1, y0, 1, 1, p.hairS);
      break;
    case 'bald':
      px(g, C - 2, y0, 4, 1, p.skin);
      break;
    case 'balding':
      px(g, C - 2, y0, 4, 1, p.skin);
      px(g, C - 3, hy, 1, 2, p.hair);
      px(g, C + 2, hy, 1, 2, p.hair);
      break;
    case 'mohawk':
      px(g, C - 1, y0 - 2, 2, 3, p.hair);
      break;
    case 'pigtails':
      top();
      px(g, C - 5, hy + 1, 2, 3, p.hair);
      px(g, C + 3, hy + 1, 2, 3, p.hair);
      break;
  }
}

function drawHeadwearSide(g: CanvasRenderingContext2D, acc: Set<string>, y0: number) {
  if (acc.has('hat')) {
    px(g, C - 3, y0, 7, 1, '#3d3a36');
    px(g, C - 2, y0 - 2, 5, 2, '#3d3a36');
  } else if (acc.has('cap')) {
    px(g, C - 2, y0 - 1, 5, 2, '#2f5d8a');
    px(g, C + 3, y0, 2, 1, '#2f5d8a');
  } else if (acc.has('beret')) {
    px(g, C - 3, y0 - 1, 6, 2, '#7a2230');
  }
}

function drawHeadwearFront(g: CanvasRenderingContext2D, acc: Set<string>, y0: number) {
  if (acc.has('hat')) {
    px(g, C - 4, y0, 8, 1, '#3d3a36');
    px(g, C - 3, y0 - 2, 6, 2, '#3d3a36');
  } else if (acc.has('cap')) {
    px(g, C - 3, y0 - 1, 6, 2, '#2f5d8a');
  } else if (acc.has('beret')) {
    px(g, C - 4, y0 - 1, 7, 2, '#7a2230');
  }
}

function drawLie(g: CanvasRenderingContext2D, app: Appearance, p: Pal, H: number) {
  // лежит на спине, голова справа
  const y = CELL_H - 5;
  const x1 = C + Math.floor(H / 2);
  const x0 = x1 - H;
  px(g, x0, y + 2, H - 6, 3, p.bottom); // ноги/тело
  px(g, x0, y + 2, 2, 3, p.shoes);
  px(g, x1 - 12, y + 1, 7, 4, p.top);
  px(g, x1 - 5, y, 5, 5, p.skin);
  px(g, x1 - 3, y + 1, 1, 1, p.eye);
  // волосы на подушке
  if (app.hair.style !== 'bald') {
    px(g, x1 - 1, y, 1, 5, p.hair);
    if (['long', 'bob', 'curly', 'braid', 'ponytail'].includes(app.hair.style)) px(g, x1, y + 1, 1, 4, p.hair);
  }
}
