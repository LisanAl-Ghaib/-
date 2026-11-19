import { chronicle, chronicleAt } from '../../chronicle/chronicle';
import { adjust, inConflict, remember } from '../../social/relations';
import { startChat } from '../../social/interactions';
import type { EventCtx, EventDef } from '../types';

/**
 * Сосед-«справочник»: к нему подходят с вопросами (квитанция, задачка, розетка),
 * он объясняет — долго, с удовольствием, но не делает за других.
 * И блокнот-память: без блокнота он не помнит вчерашних разговоров.
 */

const HELPER = /к нему подходят с вопросами|справочник/i;
const NOTEBOOK = /без блокнота/i;

function tags(c: EventCtx, id: string): string[] {
  return c.sim.defs.residentById.get(id)?.traits.tags ?? [];
}

/** Кто из двоих — тот, к кому подходят с вопросами */
function helperOf(c: EventCtx): { helper: string; asker: string } | null {
  for (const [x, y] of [[c.a!, c.b!], [c.b!, c.a!]]) if (tags(c, x).some((t) => HELPER.test(t)) && !tags(c, y).some((t) => HELPER.test(t))) return { helper: x, asker: y };
  return null;
}

const QUESTIONS = [
  { what: 'с квитанцией за свет', how: 'разобрал строчку за строчкой' },
  { what: 'с задачкой по математике', how: 'объяснил, но решать за него не стал' },
  { what: 'с розеткой, которая искрит', how: 'показал, где выключить автомат, и что подкрутить' },
  { what: 'с непонятным письмом из управляющей компании', how: 'перевёл с канцелярского на человеческий' },
  { what: 'с телефоном, который «сам всё удалил»', how: 'терпеливо показал, где что лежит' },
  { what: 'с вопросом «а почему небо синее?»', how: 'просиял: «Хороший вопрос!» — и рассказывал минут двадцать' },
  { what: 'с кроссвордом', how: 'подсказал слово и тут же рассказал, откуда оно взялось' },
];

/** К «справочнику» подходят с вопросом — на лавочке, в подъезде, у почтовых ящиков */
export const askHelp: EventDef = {
  id: 'ask-help',
  trigger: 'encounter',
  weight(c) {
    const h = helperOf(c);
    if (!h || c.placeKind === 'elevator' || c.hurry || inConflict(c.sim, c.a!, c.b!)) return 0;
    const key = `ask:${h.asker}:${c.sim.calendar().dayIndex}`;
    if (c.sim.state.flags[key]) return 0;
    return c.placeKind === 'bench' ? 7 : 2.5;
  },
  apply(c) {
    const { sim } = c;
    const { helper, asker } = helperOf(c)!;
    sim.state.flags[`ask:${asker}:${sim.calendar().dayIndex}`] = sim.time;
    const q = sim.rng.pick(QUESTIONS);
    const it = startChat(sim, asker, helper, c.place ?? 'в подъезде', c.placeKind ?? 'stairs', sim.rng.int(15, 35));
    it.notes.push('help');
    adjust(sim, asker, helper, 3, 4);
    adjust(sim, helper, asker, 2, 4);
    remember(sim, asker, helper, 'chat');
    const hd = sim.defs.residentById.get(helper)!;
    chronicle(sim, 'ask-help', [asker, helper], 2, { what: q.what, how: q.how, place: c.place ?? '', saying: hd.sayings.length ? sim.rng.pick(hd.sayings) : null });
  },
};

// ───────────────────────────── блокнот-память

export function notebookLost(c: { sim: EventCtx['sim'] }, id: string): boolean {
  return (c.sim.state.flags[`notebook-lost:${id}`] ?? 0) > c.sim.time;
}

/** Иногда блокнот теряется (на день), потом находится — под котом или на нужной книге */
export const notebookLose: EventDef = {
  id: 'notebook-lose',
  trigger: 'daily',
  chance(c) {
    if (!tags(c, c.who!).some((t) => NOTEBOOK.test(t))) return 0;
    const key = `notebook-lost:${c.who}`;
    const until = c.sim.state.flags[key] ?? 0;
    if (until > 0 && until <= c.sim.time) return 1; // пора найти
    return until > c.sim.time ? 0 : 1 / 28;
  },
  apply(c) {
    const { sim, who } = c;
    const key = `notebook-lost:${who}`;
    const until = sim.state.flags[key] ?? 0;
    if (until > 0 && until <= sim.time) {
      delete sim.state.flags[key];
      const def = sim.defs.residentById.get(who!)!;
      const cat = def.pets.find((p) => p.species === 'cat');
      chronicleAt(sim, sim.time + sim.rng.int(3, 6) * 3600, 'notebook.found', [who!], 2, { where: cat ? sim.rng.pick([`под котом — ${cat.name ?? 'кот'} на нём спал`, 'в стопке книг на полу', 'в холодильнике, рядом с сыром']) : sim.rng.pick(['в стопке книг на полу', 'в кармане пальто']) });
      return;
    }
    sim.state.flags[key] = sim.time + 22 * 3600;
  },
};

/** Без блокнота встречает каждого как в первый раз — вежливо и с интересом */
export const notebookLostMeet: EventDef = {
  id: 'notebook-lost-meet',
  trigger: 'encounter',
  weight(c) {
    for (const [x, y] of [[c.a!, c.b!], [c.b!, c.a!]]) {
      if (!notebookLost(c, x) || c.sim.state.flags[`met-anew:${x}:${y}`] === c.sim.state.flags[`notebook-lost:${x}`]) continue;
      return 30;
    }
    return 0;
  },
  apply(c) {
    const { sim } = c;
    const [x, y] = notebookLost(c, c.a!) ? [c.a!, c.b!] : [c.b!, c.a!];
    sim.state.flags[`met-anew:${x}:${y}`] = sim.state.flags[`notebook-lost:${x}`];
    adjust(sim, y, x, 0.5, 0);
    chronicle(sim, 'notebook.anew', [x, y], 2, { place: c.place ?? '' });
  },
};

/** Паркет скрипит: снизу слышно, как ходят по квартире (поздно вечером и рано утром) */
export const creak: EventDef = {
  id: 'creak',
  trigger: 'hourly',
  chance(c) {
    const h = c.sim.calendar().hourOfDay;
    return (h >= 22 || h < 1 || (h >= 6 && h < 7.5)) ? 0.35 : 0;
  },
  apply(c) {
    const { sim } = c;
    const L = sim.defs.layout;
    for (const apt of L.apartments) {
      if (!apt.def?.creaky) continue;
      const key = `creak:${apt.id}:${sim.calendar().dayIndex}`;
      if (sim.state.flags[key]) continue;
      const walker = sim.defs.residents.find((d) => {
        const r = sim.state.residents[d.id];
        return d.apartment === apt.id && r && !r.away && r.level === apt.level && r.path.length > 0;
      });
      if (!walker) continue;
      const below = L.apartments.find((x) => x.level === apt.level - 1 && x.side === apt.side);
      const listener = below && sim.defs.residents.find((d) => d.apartment === below.id && !sim.state.residents[d.id]?.away);
      if (!listener) continue;
      sim.state.flags[key] = sim.time;
      chronicle(sim, 'creak', [listener.id, walker.id], 1, { hour: sim.calendar().hour });
    }
  },
};

/** Не умеет врать: за ужином в гостях скажет про пересоленный суп — мягко, но честно */
export const honest: EventDef = {
  id: 'honest',
  trigger: 'conversation',
  weight(c) {
    const it = c.interaction;
    if (!it?.dinner || it.notes.includes('honest')) return 0;
    const guest = it.members.find((m) => m !== it.host);
    return guest && tags(c, guest).some((t) => /не умеет врать/i.test(t)) ? 3 : 0;
  },
  apply(c) {
    const it = c.interaction!;
    it.notes.push('honest');
    const guest = it.members.find((m) => m !== it.host)!;
    adjust(c.sim, it.host!, guest, 1, 2);
    chronicle(c.sim, 'honest', [guest, it.host!], 2, { what: c.sim.rng.pick(['суп пересолен', 'котлеты пригорели', 'компот, пожалуй, слишком сладкий', 'картошка недоварена']) });
  },
};
