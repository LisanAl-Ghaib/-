import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { calendar, DAY } from '../src/core/time';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';

/** тестовый дом с пятью жильцами (tests/fixtures/data) + общий каталог мебели */
const FIXTURE = (): ReturnType<typeof loadRawDataNode> => loadRawDataNode('tests/fixtures/data', 'data');
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';

function makeSim(seed = 11) {
  const r = buildDefs(FIXTURE());
  if (!r.defs) throw new Error(r.errors.join('\n'));
  return new Simulation(r.defs, createWorldState(r.defs, seed));
}

/** собрать, кто что делал по часам */
function trace(sim: Simulation, days: number) {
  const log: { id: string; hour: number; weekday: number; action: string; away: boolean }[] = [];
  const steps = Math.round((days * DAY) / DT);
  for (let i = 0; i < steps; i++) {
    sim.step();
    if (sim.time % 600 === 0) {
      const c = calendar(sim.defs.epochMs, sim.time);
      for (const id of sim.residentIds()) {
        const r = sim.state.residents[id];
        log.push({ id, hour: c.hourOfDay, weekday: c.weekday, action: r.action?.id ?? '', away: r.away });
      }
    }
  }
  return log;
}

describe('поведение', () => {
  const sim = makeSim();
  const log = trace(sim, 4);

  it('ночью все спят', () => {
    const night = log.filter((l) => l.hour >= 3 && l.hour < 4.5);
    expect(night.length).toBeGreaterThan(0);
    expect(night.every((l) => l.action === 'sleep')).toBe(true);
  });

  it('Ольга в рабочий день уходит на смену и возвращается', () => {
    const work = log.filter((l) => l.id === 'olga' && l.weekday === 2 && l.hour >= 10 && l.hour < 16);
    expect(work.every((l) => l.away && l.action === 'go_to_work')).toBe(true);
    const evening = log.filter((l) => l.id === 'olga' && l.weekday === 2 && l.hour >= 21 && l.hour < 21.5);
    expect(evening.every((l) => !l.away)).toBe(true);
  });

  it('Марк работает из дома днём в будни', () => {
    const work = log.filter((l) => l.id === 'mark' && l.weekday <= 4 && l.hour >= 11 && l.hour < 19);
    const share = work.filter((l) => l.action === 'work').length / work.length;
    expect(share).toBeGreaterThan(0.4);
  });

  it('никто не голодает и не падает без сил надолго', () => {
    for (const id of sim.residentIds()) {
      const n = sim.state.residents[id].needs;
      expect(n.food).toBeGreaterThan(10);
      expect(n.energy).toBeGreaterThan(5);
    }
  });
});

describe('следы жизни в квартирах', () => {
  it('посуда копится после еды и потом моется, кровати заправляют', () => {
    const sim = makeSim(21);
    let maxDishes = 0;
    let washed = false;
    let madeBed = false;
    for (let i = 0; i < (3 * 86400) / 10; i++) {
      sim.step();
      for (const st of Object.values(sim.state.apartments)) maxDishes = Math.max(maxDishes, st.dishes);
      for (const r of Object.values(sim.state.residents)) {
        if (r.action?.id === 'wash_dishes') washed = true;
        if (r.action?.id === 'make_bed') madeBed = true;
      }
    }
    expect(maxDishes).toBeGreaterThan(0);
    expect(washed).toBe(true);
    expect(madeBed).toBe(true);
  });
});

describe('настоящий дом', () => {
  it('двухэтажный, с консьержной и квартирой на ремонте', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const r = build(loadRawDataNode());
    expect(r.errors).toEqual([]);
    const L = r.defs!.layout;
    expect(L.levels).toBe(2);
    expect(L.aptById.get('apt-1-left')).toBeTruthy();
    expect(L.aptById.get('apt-2-left')?.def?.renovation).toBe(true);
    expect(L.aptById.get('apt-2-right')?.vacant).toBe(true);
  });
});

describe('Ольга Дмитриевна (настоящий дом)', () => {
  it('кошки живут, дочь приезжает, бессонница видна по ночам', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, create(d, 77));
    expect(Object.keys(sim.state.pets)).toHaveLength(2);
    const xs = new Set<number>();
    for (let i = 0; i < (150 * 86400) / 10; i++) {
      sim.step();
      if (i % 360 === 0) xs.add(Math.round(Object.values(sim.state.pets)[0].x));
    }
    expect(xs.size).toBeGreaterThan(5); // кошка не стоит на месте
    const kinds = new Set(sim.state.chronicle.map((e) => e.kind));
    expect(kinds.has('relative.arrive')).toBe(true);
    expect(kinds.has('insomnia')).toBe(true);
    expect(kinds.has('pet')).toBe(true);
    expect(kinds.has('phone-call')).toBe(true);
  });
});
