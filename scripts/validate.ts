/**
 * npm run validate — проверка всех JSON в data/ (zod + перекрёстные проверки).
 */
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';

const raw = loadRawDataNode();
const res = buildDefs(raw);

for (const w of res.warnings) console.log(`⚠️  ${w}`);
if (res.errors.length) {
  for (const e of res.errors) console.log(`❌ ${e}`);
  console.log(`\nОшибок: ${res.errors.length}`);
  process.exit(1);
}
const defs = res.defs!;
console.log(`✅ Данные корректны: жильцов ${defs.residents.length}, квартир описано ${defs.apartments.length}, предметов в каталоге ${defs.catalog.size}`);
console.log(`   Этажей в доме: ${defs.layout.levels}\n`);
const label = (id: string) => {
  const people = defs.residents.filter((r) => r.apartment === id).map((r) => r.name.short ?? r.name.first);
  const def = defs.apartments.find((a) => a.id === id);
  if (people.length) return people.join(', ');
  if (def?.renovation) return '(ремонт)';
  if (!def && defs.layout.constructionLevel !== null && !defs.config.building.construction?.finished && id.startsWith(`apt-${defs.layout.constructionLevel + 1}-`)) return '(строится)';
  return def ? '(после ремонта, пустует)' : '— свободна —';
};
for (let level = defs.layout.floors; level >= 0; level--) {
  const floor = level + 1;
  const row =
    level === 0
      ? [`${'apt-1-left'.padEnd(12)} ${defs.layout.aptById.has('apt-1-left') ? `консьержная: ${label('apt-1-left')}` : '— колясочная —'}`.padEnd(46), 'колясочная, почта, выход во двор']
      : (['left', 'right'] as const).map((side) => `${`apt-${floor}-${side}`.padEnd(12)} ${label(`apt-${floor}-${side}`)}`.padEnd(46));
  console.log(`  ${floor} этаж: ${row.join(' | ')}`);
}
console.log('\nНовый этаж появится сам, как только будет описана квартира на нём (apt-<этаж>-<left|right>).');
const con = defs.config.building.construction;
if (con && con.finished) console.log(`${con.floor} этаж достроен (data/world.json → building.construction.finished).`);
else if (con) console.log(`Строится ${con.floor} этаж (data/world.json → building.construction, ~${con.workdays} рабочих дней бригады).`);
