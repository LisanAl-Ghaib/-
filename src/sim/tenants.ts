import type { ResidentDef } from '../data/schemas';
import type { WorldDefs } from '../data/defs';
import { chronicle } from './chronicle/chronicle';
import { syncPets } from './pets';
import { initRelations } from './social/relations';
import { createResidentState, type Tenancy } from './state';
import type { ActionDef } from './ai/types';
import type { Simulation } from './simulation';

/**
 * Съёмные квартиры («фантомные гости»): в квартире с `rental: true` по очереди живут арендаторы
 * из data/tenants/. Сколько проживёт каждый — неизвестно (диапазон `lease` в его файле, точный срок
 * решает seeded RNG и держится в секрете). Въезжает днём с чемоданом, живёт как все жильцы
 * (работа, быт, знакомства — с полной симуляцией), потом выносит чемодан и уезжает. Между ними
 * квартира пару дней пустует с объявлением «Сдаётся» в окне.
 *
 * Арендатор, пока живёт, — обычный жилец: его ResidentDef добавляется в defs.residents
 * (и на стенд у почтовых ящиков), а при выезде убирается. Соседи помнят его (отношения остаются),
 * и если он через долгое время снова снимет квартиру — его узнают.
 * Пул арендаторов пополняет Claude, не сообщая пользователю, кто это.
 */

/** с какого дня бывший арендатор может снова снять квартиру */
const RETURN_AFTER = 45 * 86400;
const DEFAULT_LEASE = { minDays: 3, maxDays: 40 };

function rentals(defs: WorldDefs): string[] {
  return defs.apartments.filter((a) => a.rental).map((a) => a.id);
}

function addDef(defs: WorldDefs, def: ResidentDef): void {
  if (!defs.residentById.has(def.id)) defs.residents.push(def);
  defs.residentById.set(def.id, def);
}

function removeDef(defs: WorldDefs, id: string): void {
  const i = defs.residents.findIndex((d) => d.id === id);
  if (i >= 0) defs.residents.splice(i, 1);
  defs.residentById.delete(id);
}

/**
 * При загрузке мира: в defs — только те арендаторы, кто сейчас живёт (по сохранению).
 * Вызывается до syncResidents (иначе тот решит, что арендатора больше нет).
 */
export function syncTenants(sim: Simulation): void {
  const { defs, state: s } = sim;
  s.tenancy ??= {};
  for (const t of defs.tenants) removeDef(defs, t.id);
  for (const aptId of rentals(defs)) {
    const ten = (s.tenancy[aptId] ??= { current: null, since: s.time, until: 0, vacantUntil: s.time + 6 * 3600, leaving: false, past: [] });
    if (!ten.current) continue;
    const def = defs.tenants.find((t) => t.id === ten.current && t.apartment === aptId);
    if (def) addDef(defs, def);
    else {
      // описание арендатора убрали из данных — съехал, пока никто не смотрел
      ten.past.push({ id: ten.current, left: s.time });
      ten.current = null;
      ten.leaving = false;
      ten.vacantUntil = s.time + 2 * 86400;
    }
  }
  // снимали квартиру, которая больше не сдаётся
  for (const id of Object.keys(s.tenancy)) if (!rentals(defs).includes(id)) delete s.tenancy[id];
  showBelongings(sim);
}

/** Вещи нынешних арендаторов — в квартирах, вещи уехавших — нет */
function showBelongings(sim: Simulation): void {
  sim.defs.layout.setTenantsPresent(Object.values(sim.state.tenancy ?? {}).flatMap((t) => (t.current ? [t.current] : [])));
}

/** Каждый шаг: въезд, срок, выезд */
export function updateTenants(sim: Simulation): void {
  const s = sim.state;
  if (!s.tenancy) return;
  const h = sim.calendar().hourOfDay;
  for (const [aptId, ten] of Object.entries(s.tenancy)) {
    if (!ten.current) {
      if (s.time >= ten.vacantUntil && h >= 10 && h < 19) moveIn(sim, aptId, ten);
      continue;
    }
    const r = s.residents[ten.current];
    if (!r) {
      finish(sim, ten, false);
      continue;
    }
    if (ten.leaving) {
      if (r.away) finish(sim, ten, false);
      else if (r.action?.id !== 'move_out') startMoveOut(sim, ten.current);
      continue;
    }
    if (s.time < ten.until) continue;
    // срок вышел: съезжает днём, когда дома и ничем важным не занят
    if (r.away) {
      // уехал и не вернулся — вещи из квартиры забрали без него
      if (s.time > ten.until + 3 * 86400) {
        chronicle(sim, 'tenant.vanished', [ten.current], 2, { apt: aptNumber(sim, aptId) });
        finish(sim, ten, true);
      }
      continue;
    }
    const busy = r.interaction !== null || ['sleep', 'toilet', 'wash', 'host', 'guest', 'chat'].includes(r.action?.id ?? '');
    if (h >= 9 && h < 18 && !busy) {
      ten.leaving = true;
      startMoveOut(sim, ten.current);
      chronicle(sim, 'tenant.leaving', [ten.current], 2, { apt: aptNumber(sim, aptId), v: sim.rng.int(0, 2) });
    }
  }
}

function aptNumber(sim: Simulation, aptId: string): number {
  return sim.defs.layout.aptById.get(aptId)?.number ?? 0;
}

function startMoveOut(sim: Simulation, id: string): void {
  const r = sim.state.residents[id];
  if (!r) return;
  r.carrying = 'suitcase';
  sim.forceAction(id, 'move_out', {
    score: 100,
    target: { level: 0, x: sim.defs.layout.yard.offscreenX, away: true },
    duration: 3600,
    label: 'уходит с чемоданом',
    via: 'walk',
    interruptible: false,
    data: { out: true },
  });
}

function moveIn(sim: Simulation, aptId: string, ten: Tenancy): void {
  const { defs, state: s } = sim;
  const living = new Set(Object.values(s.tenancy ?? {}).map((t) => t.current));
  const pool = defs.tenants.filter((t) => t.apartment === aptId && !living.has(t.id));
  const lastLeft = (id: string) => Math.max(-Infinity, ...ten.past.filter((p) => p.id === id).map((p) => p.left));
  const fresh = pool.filter((t) => lastLeft(t.id) === -Infinity);
  const back = pool.filter((t) => lastLeft(t.id) !== -Infinity && s.time - lastLeft(t.id) > RETURN_AFTER).sort((a, b) => lastLeft(a.id) - lastLeft(b.id));
  const def = fresh.length ? sim.rng.pick(fresh) : back[0];
  if (!def) {
    // некому снимать — объявление висит дальше
    ten.vacantUntil = s.time + 2 * 86400;
    return;
  }
  const lease = def.lease ?? DEFAULT_LEASE;
  addDef(defs, def);
  const L = defs.layout;
  const r = createResidentState(defs, def.id, () => sim.rng.next());
  // приезжает с улицы с чемоданом
  Object.assign(r, { away: true, level: 0, x: L.yard.offscreenX, y: L.floorY(0), carrying: 'suitcase', dressed: true });
  s.residents[def.id] = r;
  ten.current = def.id;
  ten.since = s.time;
  ten.until = s.time + Math.round(sim.rng.range(lease.minDays, Math.max(lease.minDays, lease.maxDays)) * 86400);
  ten.leaving = false;
  showBelongings(sim);
  initRelations(sim);
  syncPets(sim);
  sim.refreshTraits();
  const age = sim.age(def);
  const f = def.gender === 'f';
  const look = age < 26 ? (f ? 'девушка' : 'парень') : age < 55 ? (f ? 'женщина' : 'мужчина') : f ? 'пожилая женщина' : 'пожилой мужчина';
  chronicle(sim, 'tenant.in', [def.id], 2, { apt: aptNumber(sim, aptId), again: lastLeft(def.id) !== -Infinity, look, v: sim.rng.int(0, 3) });
  sim.emit({ type: 'resident.moved-in', t: s.time, residentId: def.id });
}

/** Арендатор уехал: из дома и со стенда; квартира снова сдаётся */
function finish(sim: Simulation, ten: Tenancy, vanished: boolean): void {
  const { defs, state: s } = sim;
  const id = ten.current;
  if (!id) return;
  removeDef(defs, id);
  delete s.residents[id];
  for (const [k, v] of Object.entries(s.slots)) if (v === id) delete s.slots[k];
  s.elevator.riders = s.elevator.riders.filter((x) => x !== id);
  s.visitors = s.visitors.filter((v) => v.owner !== id);
  for (const it of s.interactions) if (it.members.includes(id)) it.ended = true;
  s.interactions = s.interactions.filter((it) => !it.ended);
  for (const r of Object.values(s.residents)) if (r.action?.data.partner === id || r.action?.data.with === id) r.action.endsAt = s.time;
  syncPets(sim);
  sim.refreshTraits();
  ten.past.push({ id, left: s.time });
  if (ten.past.length > 40) ten.past.splice(0, ten.past.length - 40);
  ten.current = null;
  ten.leaving = false;
  showBelongings(sim);
  ten.vacantUntil = s.time + Math.round(sim.rng.range(vanished ? 2 : 1, 6) * 86400);
  sim.emit({ type: 'resident.moved-out', t: s.time, residentId: id });
}

/** Съезжает: выносит чемодан и уходит со двора (выбирается только принудительно) */
export const moveOut: ActionDef = {
  id: 'move_out',
  icon: 'bag',
  plan: () => null,
  continueScore: () => 100,
};
