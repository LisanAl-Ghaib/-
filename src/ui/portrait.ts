import type { ResidentDef } from '../data/schemas';
import { CELL_H, CELL_W, FRAME, generateCharacterSheet } from '../render/sprites/character';

const cache = new Map<string, HTMLCanvasElement>();

/** Маленький портрет жильца (кадр «стоит лицом к зрителю») */
export function portrait(def: ResidentDef, size = 36): HTMLCanvasElement {
  const key = `${def.id}:${JSON.stringify(def.appearance)}`;
  let sheet = cache.get(key);
  if (!sheet) {
    sheet = generateCharacterSheet(def.appearance);
    cache.set(key, sheet);
  }
  // кадр «лицом к зрителю», обрезанный по фигуре
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = CELL_H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet, FRAME.frontStand * CELL_W + (CELL_W - 16) / 2, 0, 16, CELL_H, 0, 0, 16, CELL_H);
  c.className = 'portrait';
  c.style.width = `${Math.round((size * 16) / CELL_H)}px`;
  c.style.height = `${size}px`;
  return c;
}
