import { WALK_SPEED } from '../config';
import { callElevator, elevatorAt, elevatorDoorsOpen } from '../world/elevator';
import { busAtStop } from '../world/transport';
import type { ResidentState } from './state';
import type { Simulation } from './simulation';

/**
 * Продвигает жильца по маршруту на dt игровых секунд.
 * Возвращает true, если маршрут пройден (path пуст).
 */
export function advanceMovement(sim: Simulation, r: ResidentState, dt: number): boolean {
  const L = sim.defs.layout;
  const e = sim.state.elevator;
  let budget = (sim.walkSpeed(r) * WALK_SPEED * dt) / 60;
  let guard = 0;
  while (r.path.length > 0 && guard++ < 32) {
    const s = r.path[0];
    if (s.k === 'walk') {
      const dx = s.x - r.x;
      const dy = s.y - r.y;
      const dist = Math.hypot(dx, dy);
      // на лестнице чуть медленнее
      const cost = dy !== 0 ? 1.35 : 1;
      if (Math.abs(dx) > 0.01) r.facing = dx > 0 ? 1 : -1;
      r.front = false;
      r.pose = 'stand';
      if (dist * cost <= budget) {
        r.x = s.x;
        r.y = s.y;
        r.walkDist += dist;
        budget -= dist * cost;
        if (s.level !== undefined) r.level = s.level;
        r.path.shift();
        continue;
      }
      const k = budget / cost / dist;
      r.x += dx * k;
      r.y += dy * k;
      r.walkDist += budget / cost;
      // уровень на лестнице — по высоте
      r.level = L.levelAtY(r.y + 2);
      budget = 0;
      break;
    }
    if (s.k === 'elevator') {
      if (s.phase !== 'ride') {
        s.phase = 'wait';
        r.front = true;
        if (elevatorAt(e, s.from) && elevatorDoorsOpen(e) && e.riders.length < 4) {
          s.phase = 'ride';
          e.riders.push(r.id);
          callElevator(e, s.to);
        } else {
          callElevator(e, s.from);
          break;
        }
      }
      // едем
      const idx = Math.max(0, e.riders.indexOf(r.id));
      r.x = L.elevator.doorX - 4 + (idx % 3) * 4;
      r.y = e.y;
      r.level = e.level;
      r.front = true;
      if (elevatorAt(e, s.to) && elevatorDoorsOpen(e)) {
        e.riders = e.riders.filter((id) => id !== r.id);
        r.level = s.to;
        r.y = L.floorY(s.to);
        r.x = L.elevator.doorX;
        r.path.shift();
        continue;
      }
      callElevator(e, s.to);
      break;
    }
    if (s.k === 'bus') {
      r.front = true;
      if (busAtStop(sim.state.time)) {
        r.path.shift();
        continue;
      }
      break;
    }
    if (s.k === 'leave') {
      r.away = true;
      r.path.shift();
      continue;
    }
    if (s.k === 'appear') {
      r.away = false;
      r.x = s.x;
      r.y = s.y;
      r.level = s.level;
      r.path.shift();
      continue;
    }
    if (s.k === 'wait') {
      if (sim.state.time >= s.until) {
        r.path.shift();
        continue;
      }
      break;
    }
  }
  return r.path.length === 0;
}
