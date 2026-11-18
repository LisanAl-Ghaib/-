import { FLOOR_H } from '../config';
import type { BuildingLayout } from './layout';

/** Шаг маршрута. Всё — чистые данные (сохраняются вместе с миром). */
export type Step =
  | { k: 'walk'; x: number; y: number; level?: number }
  | { k: 'elevator'; from: number; to: number; phase?: 'wait' | 'ride' }
  | { k: 'leave' }
  | { k: 'appear'; x: number; y: number; level: number }
  | { k: 'wait'; until: number };

export interface Position {
  x: number;
  y: number;
  level: number;
  away: boolean;
}

export interface Target {
  level: number;
  x: number;
  /** уйти за кадр (работа, магазин, город) */
  away?: boolean;
  /** ключ слота мебели */
  slot?: string;
}

export interface PathOptions {
  /** с какой разницы этажей ехать на лифте (Infinity — никогда) */
  elevatorFrom?: number;
}

export function planPath(L: BuildingLayout, from: Position, to: Target, opts: PathOptions = {}): Step[] {
  const steps: Step[] = [];
  let level = from.level;
  const elevatorFrom = opts.elevatorFrom ?? 3;

  if (from.away) {
    if (to.away) return steps;
    steps.push({ k: 'appear', x: L.yard.offscreenX, y: L.floorY(0), level: 0 });
    level = 0;
  }

  const destLevel = to.away ? 0 : to.level;

  if (level !== destLevel) {
    const diff = Math.abs(destLevel - level);
    if (diff >= elevatorFrom) {
      steps.push({ k: 'walk', x: L.elevator.doorX, y: L.floorY(level) });
      steps.push({ k: 'elevator', from: level, to: destLevel });
    } else {
      steps.push({ k: 'walk', x: L.stairs.footX, y: L.floorY(level) });
      const dir = destLevel > level ? 1 : -1;
      while (level !== destLevel) {
        const half = FLOOR_H / 2;
        // площадка между этажами
        const midY = L.floorY(level) - dir * half;
        steps.push({ k: 'walk', x: L.stairs.landingX, y: midY });
        level += dir;
        steps.push({ k: 'walk', x: L.stairs.footX, y: L.floorY(level), level });
      }
    }
  }

  if (to.away) {
    steps.push({ k: 'walk', x: L.yard.offscreenX, y: L.floorY(0), level: 0 });
    steps.push({ k: 'leave' });
  } else {
    steps.push({ k: 'walk', x: to.x, y: L.floorY(destLevel), level: destLevel });
  }
  return steps;
}
