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
  const c = document.createElement('canvas');
  c.width = CELL_W;
  c.height = CELL_H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet, FRAME.frontStand * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  return c;
}
