import { ELEVATOR_DOOR_TIME, ELEVATOR_SPEED } from '../config';
import type { BuildingLayout } from './layout';

export interface ElevatorState {
  /** y пола кабины */
  y: number;
  level: number;
  target: number | null;
  doorTimer: number;
  calls: number[];
  riders: string[];
}

export function createElevator(L: BuildingLayout): ElevatorState {
  return { y: L.floorY(0), level: 0, target: null, doorTimer: 0, calls: [], riders: [] };
}

export function callElevator(e: ElevatorState, level: number): void {
  if (!e.calls.includes(level)) e.calls.push(level);
}

export function elevatorDoorsOpen(e: ElevatorState): boolean {
  return e.doorTimer > 0 && e.target === null;
}

export function elevatorAt(e: ElevatorState, level: number): boolean {
  return e.target === null && e.level === level;
}

/** Простой контроллер: едем к ближайшему вызову, по прибытии открываем двери. */
export function updateElevator(e: ElevatorState, L: BuildingLayout, dt: number): void {
  if (e.doorTimer > 0) {
    e.doorTimer -= dt;
    // пока двери открыты — новые вызовы с этого же этажа просто продлевают стоянку
    const here = e.calls.indexOf(e.level);
    if (here >= 0 && e.target === null) {
      e.calls.splice(here, 1);
      e.doorTimer = Math.max(e.doorTimer, ELEVATOR_DOOR_TIME / 2);
    }
    if (e.doorTimer > 0) return;
    e.doorTimer = 0;
  }
  if (e.target === null) {
    if (e.calls.length === 0) return;
    // ближайший вызов
    let best = e.calls[0];
    for (const c of e.calls) if (Math.abs(c - e.level) < Math.abs(best - e.level)) best = c;
    if (best === e.level) {
      e.calls.splice(e.calls.indexOf(best), 1);
      e.doorTimer = ELEVATOR_DOOR_TIME;
      return;
    }
    e.target = best;
  }
  const ty = L.floorY(e.target);
  const step = (ELEVATOR_SPEED / 60) * dt;
  if (Math.abs(ty - e.y) <= step) {
    e.y = ty;
    e.level = e.target;
    e.target = null;
    const i = e.calls.indexOf(e.level);
    if (i >= 0) e.calls.splice(i, 1);
    e.doorTimer = ELEVATOR_DOOR_TIME;
  } else {
    e.y += Math.sign(ty - e.y) * step;
    e.level = L.levelAtY(e.y);
  }
}
