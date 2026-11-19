import { clamp } from '../../core/math';
import { FAMILY_KINDS, inverseRelation } from '../../data/defs';
import type { Relation } from '../state';
import type { Simulation } from '../simulation';

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Создаёт отношения для всех пар (из данных, остальным — «соседи») */
export function initRelations(sim: Simulation): void {
  const s = sim.state;
  const ids = sim.defs.residents.map((d) => d.id);
  for (const a of ids) {
    s.relations[a] ??= {};
    for (const b of ids) {
      if (a === b || s.relations[a][b]) continue;
      const defA = sim.defs.residentById.get(a)!;
      const defB = sim.defs.residentById.get(b)!;
      const own = defA.relationships.find((r) => r.with === b);
      const back = defB.relationships.find((r) => r.with === a);
      let rel: Relation;
      if (own) {
        rel = blank(own.kind, own.affinity, own.familiarity);
      } else if (back) {
        // обратная сторона не описана — выводим из описанной
        const inv = inverseRelation(back.kind);
        const aff = FAMILY_KINDS.has(back.kind) ? back.affinity : Math.round(back.affinity * 0.8 + sim.rng.range(-8, 8));
        rel = blank(inv, aff, back.familiarity);
      } else {
        const sameApt = defA.apartment === defB.apartment;
        rel = blank(sameApt ? 'relative' : 'neighbor', Math.round(sim.rng.range(-5, 15)), Math.round(sim.rng.range(5, 25)));
      }
      s.relations[a][b] = rel;
    }
  }
  // удалить отношения с выбывшими (арендаторов, которые съехали, соседи помнят: вдруг вернутся)
  const known = (id: string) => sim.defs.residentById.has(id) || sim.defs.tenants.some((t) => t.id === id);
  for (const a of Object.keys(s.relations)) {
    if (!known(a)) delete s.relations[a];
    else for (const b of Object.keys(s.relations[a])) if (!known(b)) delete s.relations[a][b];
  }
}

function blank(kind: Relation['kind'], affinity: number, familiarity: number): Relation {
  return { affinity, familiarity, kind, conflict: null, lastMet: -1e9, history: [] };
}

export function rel(sim: Simulation, a: string, b: string): Relation {
  const s = sim.state;
  s.relations[a] ??= {};
  let r = s.relations[a][b];
  if (!r) r = s.relations[a][b] = blank('neighbor', 0, 5);
  return r;
}

export function isFamily(r: Relation): boolean {
  return FAMILY_KINDS.has(r.kind);
}

/** Изменить отношения (по умолчанию — в обе стороны, с разбросом) */
export function adjust(sim: Simulation, a: string, b: string, dAffinity: number, dFamiliarity = 0, both = true): void {
  const ra = rel(sim, a, b);
  ra.affinity = clamp(ra.affinity + dAffinity, -100, 100);
  ra.familiarity = clamp(ra.familiarity + dFamiliarity, 0, 100);
  if (both) {
    const rb = rel(sim, b, a);
    rb.affinity = clamp(rb.affinity + dAffinity * sim.rng.range(0.7, 1.15), -100, 100);
    rb.familiarity = clamp(rb.familiarity + dFamiliarity, 0, 100);
  }
}

export function remember(sim: Simulation, a: string, b: string, type: string): void {
  for (const [x, y] of [[a, b], [b, a]]) {
    const r = rel(sim, x, y);
    r.lastMet = sim.time;
    r.history.push({ t: sim.time, type });
    if (r.history.length > 14) r.history.splice(0, r.history.length - 14);
  }
}

export function setConflict(sim: Simulation, a: string, b: string, cause: string, severity: number): void {
  for (const [x, y] of [[a, b], [b, a]]) rel(sim, x, y).conflict = { since: sim.time, cause, severity };
}

export function clearConflict(sim: Simulation, a: string, b: string): void {
  rel(sim, a, b).conflict = null;
  rel(sim, b, a).conflict = null;
}

export function inConflict(sim: Simulation, a: string, b: string): boolean {
  return !!rel(sim, a, b).conflict;
}

/** Словесное описание отношения для карточки */
export function describeAffinity(v: number): string {
  if (v >= 75) return 'очень близки';
  if (v >= 50) return 'дружат';
  if (v >= 25) return 'приятельствуют';
  if (v >= 5) return 'симпатизирует';
  if (v > -10) return 'нейтрально';
  if (v > -35) return 'недолюбливает';
  if (v > -65) return 'неприязнь';
  return 'терпеть не может';
}

export const RELATION_WORDS: Record<string, { m: string; f: string }> = {
  spouse: { m: 'муж', f: 'жена' },
  partner: { m: 'партнёр', f: 'партнёрша' },
  parent: { m: 'отец', f: 'мать' },
  child: { m: 'сын', f: 'дочь' },
  sibling: { m: 'брат', f: 'сестра' },
  grandparent: { m: 'дедушка', f: 'бабушка' },
  grandchild: { m: 'внук', f: 'внучка' },
  relative: { m: 'родственник', f: 'родственница' },
  ex: { m: 'бывший', f: 'бывшая' },
  friend: { m: 'друг', f: 'подруга' },
  colleague: { m: 'коллега', f: 'коллега' },
  neighbor: { m: 'сосед', f: 'соседка' },
  rival: { m: 'соперник', f: 'соперница' },
  crush: { m: 'тайная симпатия', f: 'тайная симпатия' },
};
