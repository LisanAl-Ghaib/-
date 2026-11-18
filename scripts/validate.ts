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
console.log(`✅ Данные корректны: жильцов ${defs.residents.length}, квартир описано ${defs.apartments.length}, предметов в каталоге ${defs.catalog.size}\n`);
console.log('Занятость квартир:');
for (let level = defs.layout.floors; level >= 1; level--) {
  const row = (['left', 'right'] as const).map((side) => {
    const id = `apt-${level}-${side}`;
    const people = defs.residents.filter((r) => r.apartment === id).map((r) => r.name.short ?? r.name.first);
    const described = defs.apartments.some((a) => a.id === id);
    const label = people.length ? people.join(', ') : described ? '(описана, пустует)' : '— свободна —';
    return `${id.padEnd(12)} ${label}`.padEnd(46);
  });
  console.log(`  ${level} этаж: ${row.join(' | ')}`);
}
