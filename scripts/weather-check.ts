// Проверка: в дождь гуляют меньше. npx tsx scripts/weather-check.ts
import { DT } from '../src/config';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';
const defs = buildDefs(loadRawDataNode()).defs!;
const sim = new Simulation(defs, createWorldState(defs, 5));
const stat: Record<string, { out: number; total: number }> = {};
const kinds: Record<string, number> = {};
for (let i = 0; i < (120 * 86400) / DT; i++) {
  sim.step();
  const c = sim.calendar();
  if (sim.time % 600 || c.hourOfDay < 9 || c.hourOfDay > 20) continue;
  const k = sim.weather.kind;
  kinds[k] = (kinds[k] ?? 0) + 1;
  for (const r of Object.values(sim.state.residents)) {
    const s = (stat[k] ??= { out: 0, total: 0 });
    s.total++;
    if (['walk_yard', 'bench', 'go_out', 'jog', 'snowman'].includes(r.action?.id ?? '')) s.out++;
  }
}
for (const [k, s] of Object.entries(stat)) console.log(k.padEnd(7), `гуляют ${((100 * s.out) / s.total).toFixed(1)}%`, `(${kinds[k]} замеров)`);
console.log('Хроника погоды:', sim.state.chronicle.filter((e) => ['first-snow', 'downpour', 'frost', 'fog', 'snowman', 'heat'].includes(e.kind)).map((e) => e.text).slice(0, 12));
