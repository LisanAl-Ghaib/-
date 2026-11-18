/**
 * npm run sim -- --days 3 --seed 42 [--actions] [--quiet] [--min 2]
 *   --actions  печатать каждое начатое действие
 *   --quiet    не печатать сводку потребностей каждые 6 часов
 *   --min N    минимальная важность записей хроники (1..3)
 *   --fixtures тестовый дом с пятью жильцами (tests/fixtures/data)
 * Безголовая симуляция: та же логика, что в браузере, без рендера.
 */
import { calendar, DAY, HOUR, hhmm, formatDate } from '../src/core/time';
import { DT } from '../src/config';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

// --fixtures — тестовый дом с пятью жильцами из tests/fixtures/data
const res = buildDefs(flag('fixtures') ? loadRawDataNode('tests/fixtures/data', 'data') : loadRawDataNode());
if (!res.defs) {
  console.error(res.errors.join('\n'));
  process.exit(1);
}
const defs = res.defs;
const seed = opt('seed');
const state = createWorldState(defs, seed !== undefined ? (isNaN(+seed) ? seed : +seed) : undefined);
const sim = new Simulation(defs, state);
const days = Number(opt('days', '2'));
const showActions = flag('actions');

const name = (id: string) => defs.residentById.get(id)?.name.short ?? id;
const stamp = () => {
  const c = sim.calendar();
  return `${formatDate(c)} ${hhmm(c.minuteOfDay)}`;
};

if (showActions) {
  sim.bus.on('action.start', (e) => console.log(`${stamp()}  ${name(e.residentId)}: ${e.label}`));
}
sim.bus.onAny((e) => {
  if (e.type === 'day.start') console.log(`\n══════ ${stamp()} ══════`);
});
const minImportance = Number(opt('min', '1'));
sim.bus.on('chronicle', (e) => {
  if (e.entry.importance < minImportance) return;
  const c = calendar(defs.epochMs, e.entry.t);
  const mark = e.entry.importance === 3 ? '★' : e.entry.importance === 2 ? '·' : ' ';
  console.log(`${mark} ${hhmm(c.minuteOfDay)} — ${e.entry.text}`);
});

const steps = Math.round((days * DAY) / DT);
for (let i = 0; i < steps; i++) {
  sim.step();
  if (!flag('quiet') && sim.time % (6 * HOUR) === 0) {
    const line = sim.residentIds().map((id) => {
      const r = sim.state.residents[id];
      const n = r.needs;
      return `${name(id)}: ${r.action?.label ?? '—'} [E${n.energy | 0} F${n.food | 0} S${n.social | 0} M${n.mood | 0}]`;
    });
    console.log(`  · ${stamp()}  ${line.join(' | ')}`);
  }
}
console.log(`\nГотово: ${days} дн., seed=${state.seed}`);
