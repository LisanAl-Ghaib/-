import type { ChronicleEntry } from '../state';
import type { Simulation } from '../simulation';
import { TemplateNarrator, type Narrator } from './narrator';

export const CHRONICLE_LIMIT = 800;

let narrator: Narrator = new TemplateNarrator();

/** Записи хроники меняются задним числом (нейросеть дописала реплики) — ленте пора перерисоваться */
let revision = 0;
export function touchChronicle(): void {
  revision++;
}
export function chronicleRevision(): number {
  return revision;
}

/** Подменить нарратор (например, на LLM) */
export function setNarrator(n: Narrator): void {
  narrator = n;
}

/** Записать событие, когда его станет видно (не раньше времени at) */
export function chronicleAt(
  sim: Simulation,
  at: number,
  kind: string,
  actors: string[],
  importance: 1 | 2 | 3,
  data: ChronicleEntry['data'] = {},
): void {
  if (at <= sim.time) {
    chronicle(sim, kind, actors, importance, data);
    return;
  }
  sim.state.pendingChronicle.push({ at, kind, actors, importance, data });
}

/** Вызывается каждый шаг: выпускает отложенные записи */
export function flushPendingChronicle(sim: Simulation): void {
  const p = sim.state.pendingChronicle;
  if (!p.length) return;
  const due = p.filter((e) => e.at <= sim.time);
  if (!due.length) return;
  sim.state.pendingChronicle = p.filter((e) => e.at > sim.time);
  for (const e of due) if (e.actors.every((id) => sim.state.residents[id])) chronicle(sim, e.kind, e.actors, e.importance, e.data);
}

/** Записать событие в хронику дома */
export function chronicle(
  sim: Simulation,
  kind: string,
  actors: string[],
  importance: 1 | 2 | 3,
  data: ChronicleEntry['data'] = {},
  t = sim.time,
): ChronicleEntry {
  const s = sim.state;
  const base = { id: s.nextId++, t, kind, actors, importance, data };
  let text: string;
  try {
    text = narrator.describe(base, {
      defs: sim.defs,
      // этаж по-человечески: уровень 0 — первый этаж
      floorOf: (id) => (sim.defs.layout.aptById.get(sim.defs.residentById.get(id)?.apartment ?? '')?.level ?? 0) + 1,
    });
  } catch (e) {
    text = `${kind}: ${actors.join(', ')}`;
    console.warn('[narrator]', e);
  }
  const entry: ChronicleEntry = { ...base, text };
  s.chronicle.push(entry);
  if (s.chronicle.length > CHRONICLE_LIMIT) s.chronicle.splice(0, s.chronicle.length - CHRONICLE_LIMIT);
  sim.emit({ type: 'chronicle', entry });
  return entry;
}
