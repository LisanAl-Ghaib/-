import { CORE_W } from '../../config';
import { runExclusive } from '../events/engine';
import type { PlaceKind } from '../events/types';
import { onFloor } from '../chronicle/russian';
import type { ResidentState } from '../state';
import type { Simulation } from '../simulation';
import { pairKey } from './relations';

interface Spot {
  kind: PlaceKind;
  phrase: string;
  /** ключ «места»: встречаются только в одном месте */
  key: string;
}

/** Где сейчас жилец — с точки зрения случайных встреч (null — дома/за кадром) */
export function publicSpot(sim: Simulation, r: ResidentState): Spot | null {
  if (r.away) return null;
  const L = sim.defs.layout;
  const e = sim.state.elevator;
  if (e.riders.includes(r.id)) return { kind: 'elevator', phrase: 'в лифте', key: 'elevator' };
  if (r.x >= L.buildingX1) {
    if (r.action?.id === 'bench' && r.action.phase === 'perform') return { kind: 'bench', phrase: 'на лавочке у подъезда', key: 'bench' };
    if (r.x >= L.yard.busStop - 30) return { kind: 'busstop', phrase: 'на остановке', key: 'yard' };
    if (r.x < L.buildingX1 + 24) return { kind: 'entrance', phrase: 'у подъезда', key: 'yard' };
    return { kind: 'yard', phrase: 'во дворе', key: 'yard' };
  }
  if (r.x < L.buildingX0) return { kind: 'yard', phrase: 'в проулке', key: 'alley' };
  const inCore = r.x >= L.coreX - 8 && r.x < L.coreX + CORE_W + 8;
  if (r.level === 0) {
    if (r.x >= L.coreX + CORE_W) return { kind: 'entrance', phrase: 'в тамбуре у входа', key: 'ground' };
    if (inCore) return { kind: 'lobby', phrase: 'у почтовых ящиков', key: 'ground' };
    return null;
  }
  if (inCore) {
    const onStairs = Math.abs(r.y - L.floorY(r.level)) > 2;
    return onStairs
      ? { kind: 'stairs', phrase: 'на лестнице', key: `stairs:${Math.round(r.y / 24)}` }
      : { kind: 'stairs', phrase: `на лестничной площадке ${onFloor(r.level).replace('на ', '')}`, key: `landing:${r.level}` };
  }
  return null;
}

function hurrying(r: ResidentState): boolean {
  const a = r.action;
  if (!a) return false;
  return a.phase === 'travel' && (a.id === 'go_to_work' || a.id === 'shopping' || a.id === 'visit' || a.id === 'jog');
}

/** Раз в игровую минуту ищем пары, оказавшиеся рядом в общих местах */
export function detectEncounters(sim: Simulation): void {
  const s = sim.state;
  const ids = sim.residentIds();
  const spots = new Map<string, Spot | null>();
  for (const id of ids) spots.set(id, publicSpot(sim, s.residents[id]));
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    const ra = s.residents[a];
    const sa = spots.get(a);
    if (!sa || ra.interaction !== null) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j];
      const rb = s.residents[b];
      const sb = spots.get(b);
      if (!sb || rb.interaction !== null || sa.key !== sb.key) continue;
      const near = sa.kind === 'elevator' || (Math.abs(ra.x - rb.x) < (sa.key === 'yard' || sa.key === 'bench' ? 28 : 16) && Math.abs(ra.y - rb.y) < 10);
      if (!near) continue;
      const key = pairKey(a, b);
      if ((s.pairCooldown[key] ?? -1) > sim.time) continue;
      s.pairCooldown[key] = sim.time + (sa.kind === 'elevator' ? 3 : 2) * 3600;
      runExclusive('encounter', {
        sim,
        now: sim.time,
        a,
        b,
        place: sa.phrase,
        placeKind: sa.kind,
        hurry: hurrying(ra) || hurrying(rb),
      });
      if (ra.interaction !== null) break;
    }
  }
  // чистим устаревшие кулдауны
  if (sim.time % 3600 === 0) for (const [k, t] of Object.entries(s.pairCooldown)) if (t < sim.time) delete s.pairCooldown[k];
}
