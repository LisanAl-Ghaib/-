import { FLOOR_H } from '../config';
import type { BuildingLayout } from './layout';

/** Шаг маршрута. Всё — чистые данные (сохраняются вместе с миром). */
export type Step =
  | { k: 'walk'; x: number; y: number; level?: number }
  | { k: 'elevator'; from: number; to: number; phase?: 'wait' | 'ride' }
  | { k: 'leave' }
  /** ждать автобус на остановке */
  | { k: 'bus' }
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
  /** как уходить/возвращаться «за кадр» */
  via?: 'bus' | 'walk';
  /** как вернулся последний раз (для точки появления) */
  returnVia?: 'bus' | 'walk';
}

export function planPath(L: BuildingLayout, from: Position, to: Target, opts: PathOptions = {}): Step[] {
  const steps: Step[] = [];
  let level = from.level;
  const elevatorFrom = opts.elevatorFrom ?? 3;

  if (from.away) {
    if (to.away) return steps;
    const ax = opts.returnVia === 'bus' ? L.yard.busStop - 4 : L.yard.offscreenX;
    steps.push({ k: 'appear', x: ax, y: L.floorY(0), level: 0 });
    level = 0;
  }

  const destLevel = to.away ? 0 : to.level;

  const stairsTo = (dest: number) => {
    steps.push({ k: 'walk', x: L.stairs.footX, y: L.floorY(level) });
    const dir = dest > level ? 1 : -1;
    while (level !== dest) {
      const half = FLOOR_H / 2;
      // площадка между этажами
      const midY = L.floorY(level) - dir * half;
      steps.push({ k: 'walk', x: L.stairs.landingX, y: midY });
      level += dir;
      steps.push({ k: 'walk', x: L.stairs.footX, y: L.floorY(level), level });
    }
  };
  const ride = (dest: number) => {
    steps.push({ k: 'walk', x: L.elevator.doorX, y: L.floorY(level) });
    steps.push({ k: 'elevator', from: level, to: dest });
    level = dest;
  };

  if (level !== destLevel) {
    // лифт в подвал не ходит: до первого этажа — на лифте, дальше пешком
    const lo = Math.max(0, Math.min(level, destLevel));
    const hi = Math.max(level, destLevel);
    if (hi - lo >= elevatorFrom) {
      if (level < 0) stairsTo(0);
      ride(Math.max(0, destLevel));
      if (destLevel < 0) stairsTo(destLevel);
    } else stairsTo(destLevel);
  }

  if (to.away) {
    if (opts.via === 'bus') {
      steps.push({ k: 'walk', x: L.yard.busStop - 6, y: L.floorY(0), level: 0 });
      steps.push({ k: 'bus' });
    } else steps.push({ k: 'walk', x: L.yard.offscreenX, y: L.floorY(0), level: 0 });
    steps.push({ k: 'leave' });
  } else {
    steps.push({ k: 'walk', x: to.x, y: L.floorY(destLevel), level: destLevel });
  }
  return steps;
}
