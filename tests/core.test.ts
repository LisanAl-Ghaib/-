import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { calendar, parseEpoch } from '../src/core/time';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';

/** тестовый дом с пятью жильцами (tests/fixtures/data) + общий каталог мебели */
const FIXTURE = (): ReturnType<typeof loadRawDataNode> => loadRawDataNode('tests/fixtures/data', 'data');
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';
import { DAY } from '../src/core/time';
import { DT } from '../src/config';

const defs = () => {
  const r = buildDefs(FIXTURE());
  if (!r.defs) throw new Error(r.errors.join('\n'));
  return r.defs;
};

describe('Rng', () => {
  it('детерминирован и сохраняем', () => {
    const a = Rng.fromSeed(42);
    const b = Rng.fromSeed(42);
    const xs = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
    const c = new Rng([...a.state] as [number, number, number, number]);
    expect(c.next()).toBe(a.next());
  });
  it('разные seed — разные числа', () => {
    expect(Rng.fromSeed(1).next()).not.toBe(Rng.fromSeed(2).next());
  });
});

describe('календарь', () => {
  it('считает день недели и время', () => {
    const e = parseEpoch('2026-09-14T05:30');
    const c = calendar(e, 0);
    expect(c.weekday).toBe(1);
    expect(c.hour).toBe(5);
    expect(c.minute).toBe(30);
    const c2 = calendar(e, 3600 * 20);
    expect(c2.dayIndex).toBe(1);
    expect(c2.weekday).toBe(2);
  });
});

describe('данные', () => {
  it('валидны', () => {
    const r = buildDefs(FIXTURE());
    expect(r.errors).toEqual([]);
    expect(r.defs!.residents.length).toBeGreaterThan(0);
  });
});

describe('симуляция', () => {
  const snapshot = (seed: number, days: number) => {
    const d = defs();
    const sim = new Simulation(d, createWorldState(d, seed));
    sim.run(Math.round((days * DAY) / DT));
    return JSON.stringify(sim.state);
  };
  it('детерминирована: одинаковый seed — одинаковый мир', () => {
    expect(snapshot(7, 1)).toBe(snapshot(7, 1));
  });
  it('разный seed — разный мир', () => {
    expect(snapshot(7, 1)).not.toBe(snapshot(8, 1));
  });
  it('сохранение/загрузка продолжает тот же путь', () => {
    const d = defs();
    const a = new Simulation(d, createWorldState(d, 5));
    a.run(3000);
    const saved = structuredClone(a.state);
    a.run(3000);
    const b = new Simulation(d, saved);
    b.run(3000);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });
});
