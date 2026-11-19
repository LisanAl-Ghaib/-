import { describe, expect, it } from 'vitest';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';
import { planPath } from '../src/world/navigation';

describe('комната отдыха в подвале', () => {
  it('в подвал спускаются по лестнице (лифт туда не ходит)', () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const L = d.layout;
    expect(L.commonRoom?.level).toBe(-1);
    const room = L.commonRoom!;
    // с третьего этажа: на лифте до первого, дальше пешком вниз
    const steps = planPath(L, { x: L.coreX + 20, y: L.floorY(2), level: 2, away: false }, { level: -1, x: room.x0 + 40 });
    const rides = steps.filter((s) => s.k === 'elevator');
    for (const r of rides) if (r.k === 'elevator') expect(Math.min(r.from, r.to)).toBeGreaterThanOrEqual(0);
    expect(steps[steps.length - 1]).toMatchObject({ y: L.floorY(-1), level: -1 });
    expect(L.levelAtY(L.floorY(-1) - 5)).toBe(-1);
  });

  it('вечерами там пьют чай, угощают, разговаривают и играют в шахматы', () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const sim = new Simulation(d, createWorldState(d, 42));
    const visitors = new Set<string>();
    let lowest = 0;
    for (let i = 0; i < 8640 * 20; i++) {
      sim.step();
      if (i % 30) continue;
      for (const r of Object.values(sim.state.residents)) {
        if (r.action?.id === 'common_room' && r.action.phase === 'perform') visitors.add(r.id);
        lowest = Math.min(lowest, r.level);
      }
      expect(sim.state.elevator.level).toBeGreaterThanOrEqual(0);
    }
    expect(lowest).toBe(-1);
    expect(visitors.size).toBeGreaterThanOrEqual(3);
    const kinds = sim.state.chronicle.map((e) => e.kind);
    expect(kinds).toContain('common.chess');
    expect(kinds.some((k) => k === 'common.treat' || k === 'common.gathering')).toBe(true);
    // Иван и Клод Антропович — шахматисты из разных квартир: в подвале они встречаются за доской
    const games = sim.state.chronicle.filter((e) => e.kind === 'common.chess' && e.actors.includes('ivan-muravyev') && e.actors.includes('claude-opusov'));
    expect(games.length).toBeGreaterThan(0);
    // разговоры там — обычные встречи с местом «в комнате отдыха»
    expect(sim.state.chronicle.some((e) => e.kind === 'chat' && String(e.data.place).includes('комнате отдыха'))).toBe(true);
  }, 240_000);
});
