import type { RoomModel } from '../world/layout';
import type { ResidentState } from './state';
import type { Simulation } from './simulation';

/**
 * Куртку надевают в прихожей, а не на улице: по пути из дома человек останавливается
 * у вешалки (одевается, обувается), вернувшись — раздевается там же.
 * Где прихожая: комната `hall`, иначе — комната с вешалкой, иначе — комната у входной двери.
 */
const DRESS_S = 100; // одеться ≈ 1,5 минуты игрового времени
const UNDRESS_S = 70;

const hallCache = new WeakMap<object, Map<string, RoomModel>>();

export function hallOf(sim: Simulation, aptId: string): RoomModel {
  let byApt = hallCache.get(sim.defs.layout);
  if (!byApt) hallCache.set(sim.defs.layout, (byApt = new Map()));
  let room = byApt.get(aptId);
  if (room) return room;
  const apt = sim.defs.layout.aptById.get(aptId)!;
  room =
    apt.rooms.find((r) => r.type === 'hall') ??
    apt.rooms.find((r) => r.furniture.some((f) => f.def.draw === 'coat_rack')) ??
    apt.rooms.reduce((best, r) => (Math.abs((r.x0 + r.x1) / 2 - apt.doorX) < Math.abs((best.x0 + best.x1) / 2 - apt.doorX) ? r : best));
  byApt.set(aptId, room);
  return room;
}

/** Холодно настолько, что выходят в куртке */
export function coatWeather(sim: Simulation): boolean {
  return sim.weather.temp < 10;
}

/** Цель действия — за пределами дома (улица, двор) */
export function goingOut(sim: Simulation, r: ResidentState): boolean {
  const a = r.action;
  if (!a) return false;
  const L = sim.defs.layout;
  return !!a.target.away || a.data.out === true || (a.target.level === 0 && (a.target.x >= L.buildingX1 || a.target.x < L.buildingX0));
}

export function updateDressing(sim: Simulation, r: ResidentState): void {
  if (r.away) return;
  const a = r.action;
  const def = sim.defs.residentById.get(r.id)!;
  const apt = sim.defs.layout.aptById.get(def.apartment)!;
  const L = sim.defs.layout;
  const outside = r.level === 0 && (r.x >= L.buildingX1 || r.x < L.buildingX0);
  // на улице — уже одет (вышел раньше, чем начал одеваться — например, сохранение старое)
  if (outside) {
    if (!r.dressed) r.dressed = true;
    return;
  }
  const hall = hallOf(sim, apt.id);
  const inHall = r.level === apt.level && r.x >= hall.x0 && r.x < hall.x1;
  if (!inHall || !a || a.phase !== 'travel' || Number(a.data.pauseUntil ?? 0) > sim.time) return;
  const hasStreet = !!def.appearance.street;
  const out = goingOut(sim, r);
  if (out && !r.dressed && !a.data.dressedHere) {
    // собирается на улицу: к вешалке, одеться и обуться
    const cold = coatWeather(sim);
    a.data.dressedHere = true;
    a.data.pauseUntil = sim.time + (cold || hasStreet ? DRESS_S : 40);
    a.data.dressing = 'on';
    r.dressed = true; // одет для улицы (куртка — если холодно, уличная одежда — всегда)
    const rack = hall.furniture.find((f) => f.def.draw === 'coat_rack');
    if (rack) r.facing = rack.x + rack.w / 2 >= r.x ? 1 : -1;
  } else if (!out && r.dressed) {
    // вернулся: куртку — на вешалку
    a.data.pauseUntil = sim.time + UNDRESS_S;
    a.data.dressing = 'off';
    r.dressed = false;
  }
}
