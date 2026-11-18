import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { DAY } from '../src/core/time';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';

/** тестовый дом с пятью жильцами (tests/fixtures/data) + общий каталог мебели */
const FIXTURE = (): ReturnType<typeof loadRawDataNode> => loadRawDataNode('tests/fixtures/data', 'data');
import { nameCase, fromFloor, durationPhrase, years } from '../src/sim/chronicle/russian';
import { rel } from '../src/sim/social/relations';
import { quarrel, reconcile } from '../src/sim/social/social';
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';

const defs = () => {
  const r = buildDefs(FIXTURE());
  if (!r.defs) throw new Error(r.errors.join('\n'));
  return r.defs;
};

describe('русский язык хроники', () => {
  it('падежи из данных и автоматические', () => {
    const d = defs();
    expect(nameCase(d.residentById.get('mark')!, 'dat')).toBe('Марку');
    const fake = { ...d.residentById.get('olga')!, name: { first: 'Ирина', last: '', cases: {} } };
    expect(nameCase(fake, 'dat')).toBe('Ирине');
    expect(nameCase(fake, 'acc')).toBe('Ирину');
    const fakeM = { ...d.residentById.get('mark')!, name: { first: 'Андрей', last: '', cases: {} } };
    expect(nameCase(fakeM, 'ins')).toBe('Андреем');
  });
  it('этажи, длительности, годы', () => {
    expect(fromFloor(2)).toBe('со второго этажа');
    expect(fromFloor(3)).toBe('с третьего этажа');
    expect(durationPhrase(19 * 60 + 40, 24 * 60, 260)).toBe('до полуночи');
    expect(years(41)).toBe('41 год');
    expect(years(72)).toBe('72 года');
  });
});

describe('отношения', () => {
  it('семейные связи и выведенная обратная сторона', () => {
    const d = defs();
    const sim = new Simulation(d, createWorldState(d, 1));
    expect(rel(sim, 'igor', 'natasha').kind).toBe('spouse');
    expect(rel(sim, 'natasha', 'igor').kind).toBe('spouse');
    expect(rel(sim, 'olga', 'vera').affinity).toBe(45);
  });
  it('ссора портит отношения, примирение чинит', () => {
    const d = defs();
    const sim = new Simulation(d, createWorldState(d, 1));
    const before = rel(sim, 'olga', 'vera').affinity;
    quarrel(sim, 'olga', 'vera', 'из-за шума');
    expect(rel(sim, 'olga', 'vera').conflict).not.toBeNull();
    expect(rel(sim, 'olga', 'vera').affinity).toBeLessThan(before);
    reconcile(sim, 'olga', 'vera');
    expect(rel(sim, 'vera', 'olga').conflict).toBeNull();
  });
});

describe('социальная жизнь', () => {
  it('за неделю в хронике есть визиты, встречи и личные события', () => {
    const d = defs();
    const sim = new Simulation(d, createWorldState(d, 3));
    sim.run(Math.round((7 * DAY) / DT));
    const kinds = new Set(sim.state.chronicle.map((e) => e.kind));
    expect(kinds.has('world.start')).toBe(true);
    expect(kinds.has('visit')).toBe(true);
    expect(kinds.has('birthday')).toBe(true);
    expect([...kinds].some((k) => k === 'chat' || k === 'greet' || k === 'elevator')).toBe(true);
    // взаимодействия не «зависают»
    expect(sim.state.interactions.every((i) => !i.ended)).toBe(true);
    for (const r of Object.values(sim.state.residents)) {
      if (r.interaction !== null) expect(sim.state.interactions.some((i) => i.id === r.interaction)).toBe(true);
    }
  });
});
