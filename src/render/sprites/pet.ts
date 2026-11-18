import { shade } from '../../core/math';
import type { PetDef } from '../../data/schemas';
import { ctx2d, makeCanvas } from './registry';

/**
 * Процедурная кошка: кадры 16×12, смотрит вправо, лапы на нижней строке.
 * 0 сидит · 1–2 идёт · 3 лежит «буханкой» · 4 спит клубком · 5 умывается · 6 тянется/ест
 */
export const PET_W = 16;
export const PET_H = 12;
export const PET_FRAME = { sit: 0, walk0: 1, walk1: 2, loaf: 3, curl: 4, groom: 5, stretch: 6 } as const;
const COUNT = 7;

export function generatePetSheet(p: PetDef): HTMLCanvasElement {
  const c = makeCanvas(PET_W * COUNT, PET_H);
  const g = ctx2d(c);
  const base = p.color;
  const dark = p.color2 ?? shade(base, -0.3);
  const light = p.pattern === 'tuxedo' || p.pattern === 'calico' ? '#f4f2ec' : shade(base, 0.2);
  const eye = '#2a3a1a';
  const nose = '#d89090';
  const R = (f: number, x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(f * PET_W + x, y, w, h);
  };
  const stripes = (f: number, x0: number, y0: number, w: number, h: number) => {
    if (p.pattern === 'tabby') for (let x = x0 + 1; x < x0 + w; x += 2) R(f, x, y0, 1, Math.max(1, h - 1), dark);
    if (p.pattern === 'spotted') for (let x = x0 + 1; x < x0 + w; x += 3) R(f, x, y0 + ((x * 3) % Math.max(1, h)), 1, 1, dark);
    if (p.pattern === 'calico') R(f, x0 + 1, y0, 3, 2, dark);
  };
  const head = (f: number, x: number, y: number) => {
    R(f, x, y + 1, 4, 3, base);
    R(f, x, y, 1, 1, base); // уши
    R(f, x + 3, y, 1, 1, base);
    if (p.pattern === 'tabby') R(f, x + 1, y + 1, 2, 1, dark);
    R(f, x + 2, y + 2, 1, 1, eye);
    R(f, x + 3, y + 3, 1, 1, nose);
    if (p.pattern === 'tuxedo') R(f, x + 1, y + 3, 2, 1, light);
  };
  // сидит
  R(0, 5, 4, 5, 7, base);
  R(0, 6, 3, 3, 1, base);
  stripes(0, 5, 5, 5, 4);
  if (p.pattern === 'tuxedo') R(0, 8, 6, 2, 4, light);
  R(0, 8, 10, 2, 1, shade(base, -0.1)); // лапки
  head(0, 8, 0);
  R(0, 1, 10, 5, 1, dark); // хвост по полу
  R(0, 1, 9, 1, 1, dark);
  // идёт (два кадра)
  for (const [f, k] of [[1, 0], [2, 1]] as const) {
    R(f, 3, 5, 9, 4, base);
    stripes(f, 3, 5, 9, 3);
    if (p.pattern === 'tuxedo') R(f, 8, 7, 3, 2, light);
    head(f, 11, 2);
    const legs = k ? [4, 9] : [5, 10];
    for (const lx of legs) R(f, lx, 9, 1, 3, shade(base, -0.1));
    for (const lx of k ? [6, 11] : [3, 8]) R(f, lx, 9, 1, 3, dark);
    R(f, 1, 2, 1, 4, base); // хвост трубой
    R(f, 2, 5, 1, 1, base);
    R(f, 1, 1, 1, 1, dark);
  }
  // буханка
  R(3, 3, 7, 9, 5, base);
  R(3, 4, 6, 7, 1, base);
  stripes(3, 4, 7, 7, 3);
  head(3, 10, 4);
  R(3, 1, 11, 3, 1, dark);
  // клубок (спит)
  R(4, 4, 7, 8, 5, base);
  R(4, 5, 6, 6, 1, base);
  stripes(4, 5, 7, 6, 3);
  R(4, 9, 8, 3, 2, shade(base, 0.08)); // голова спрятана
  R(4, 10, 7, 1, 1, base);
  R(4, 3, 10, 2, 2, dark);
  R(4, 4, 11, 7, 1, dark); // хвост обёрнут
  // умывается (голова к лапе)
  R(5, 5, 4, 5, 7, base);
  stripes(5, 5, 5, 5, 4);
  head(5, 8, 2);
  R(5, 10, 5, 1, 3, shade(base, -0.1)); // поднятая лапа
  R(5, 1, 10, 5, 1, dark);
  // тянется / ест из миски (голова внизу)
  R(6, 2, 5, 8, 3, base);
  stripes(6, 2, 5, 8, 2);
  R(6, 2, 4, 3, 1, base);
  head(6, 10, 6);
  R(6, 3, 8, 1, 4, dark);
  R(6, 9, 9, 1, 3, dark);
  R(6, 0, 2, 1, 3, base);
  R(6, 1, 4, 1, 1, base);
  return c;
}
