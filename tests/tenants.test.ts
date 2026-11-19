import { describe, expect, it } from 'vitest';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';

describe('съёмная квартира: арендаторы меняются сами', () => {
  it('въезжают с чемоданом, живут, съезжают; вещи — только у нынешнего; сохранение помнит, кто живёт', () => {
    const defs = buildDefs(loadRawDataNode()).defs!;
    const rental = defs.apartments.find((a) => a.rental)!;
    expect(rental).toBeTruthy();
    const poolIds = new Set(defs.tenants.map((t) => t.id));
    expect(poolIds.size).toBeGreaterThan(1);
    // в начале — никого из арендаторов, в окне «Сдаётся»
    const sim = new Simulation(defs, createWorldState(defs, 42));
    expect(defs.residents.some((d) => poolIds.has(d.id))).toBe(false);
    expect(sim.state.tenancy?.[rental.id]?.current).toBeNull();

    const seen = new Set<string>();
    let sawSuitcase = false;
    for (let day = 0; day < 45; day++) {
      for (let i = 0; i < 8640; i++) {
        sim.step();
        if (i % 360) continue;
        const ten = sim.state.tenancy![rental.id];
        const living = Object.keys(sim.state.residents).filter((id) => poolIds.has(id));
        // в доме живёт ровно тот, кто снимает
        expect(living).toEqual(ten.current ? [ten.current] : []);
        expect(defs.residents.filter((d) => poolIds.has(d.id)).map((d) => d.id)).toEqual(living);
        // его вещи стоят, чужих — нет
        const apt = defs.layout.aptById.get(rental.id)!;
        const owners = new Set(apt.rooms.flatMap((r) => r.furniture.flatMap((f) => (f.tenant ? [f.tenant] : []))));
        for (const o of owners) expect(o).toBe(ten.current);
        if (ten.current) {
          seen.add(ten.current);
          if (sim.state.residents[ten.current].carrying === 'suitcase') sawSuitcase = true;
        }
      }
    }
    const ten = sim.state.tenancy![rental.id];
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(ten.past.length).toBeGreaterThanOrEqual(1);
    expect(sawSuitcase).toBe(true);
    const kinds = new Set(sim.state.chronicle.map((e) => e.kind));
    expect(kinds.has('tenant.in')).toBe(true);
    expect(kinds.has('tenant.leaving') || kinds.has('tenant.vanished')).toBe(true);

    // перезагрузка: тот же арендатор на месте (а соседи его помнят)
    const saved = JSON.parse(JSON.stringify(sim.state));
    const defs2 = buildDefs(loadRawDataNode()).defs!;
    const sim2 = new Simulation(defs2, saved);
    const cur = sim2.state.tenancy![rental.id].current;
    expect(defs2.residents.filter((d) => poolIds.has(d.id)).map((d) => d.id)).toEqual(cur ? [cur] : []);
    if (cur) expect(sim2.state.residents[cur]).toBeTruthy();
    for (const p of ten.past) expect(Object.values(sim2.state.relations).some((m) => m[p.id])).toBe(true);
  }, 240_000);
});
