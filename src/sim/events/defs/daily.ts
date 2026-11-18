import { chronicleAt } from '../../chronicle/chronicle';

/** Заметно станет, когда дом проснётся: часов в 9–11 */
function noticeAt(c: { sim: { time: number; rng: { int(a: number, b: number): number } } }): number {
  return c.sim.time + c.sim.rng.int(5 * 60, 7 * 60) * 60;
}
import { addMoodlet } from '../../needs';
import { rel } from '../../social/relations';
import type { EventDef } from '../types';

function isBirthday(c: Parameters<NonNullable<EventDef['chance']>>[0]): boolean {
  const def = c.sim.defs.residentById.get(c.who!)!;
  const cal = c.sim.calendar();
  const [, m, d] = def.birthday.split('-').map(Number);
  return cal.month === m && cal.day === d;
}

/** День рождения: запись в хронике, праздничное настроение, соседи соберутся поздравить */
export const birthday: EventDef = {
  id: 'birthday',
  trigger: 'daily',
  chance(c) {
    if (!isBirthday(c)) return 0;
    return c.sim.state.flags[`bday:${c.who}:${c.sim.calendar().year}`] ? 0 : 1;
  },
  apply(c) {
    const { sim, who } = c;
    sim.state.flags[`bday:${who}:${sim.calendar().year}`] = 1;
    const def = sim.defs.residentById.get(who!)!;
    const r = sim.state.residents[who!];
    addMoodlet({ r, now: sim.time }, 'birthday', 'День рождения!', 15, 20, 10);
    r.bubble = { icon: 'gift', until: sim.time + 3600 };
    chronicleAt(sim, noticeAt(c), 'birthday', [who!], 3, { age: sim.age(def) });
    for (const other of sim.defs.residents) {
      if (other.id === who) continue;
      const ro = rel(sim, other.id, who!);
      if (ro.conflict || ro.affinity < 15 || ro.familiarity < 25) continue;
      if (!sim.rng.chance(0.4 + ro.affinity / 120)) continue;
      sim.state.residents[other.id].intents.push({ target: who!, kind: 'congratulate', until: sim.time + 18 * 3600 });
    }
  },
};

/** Болезнь: чаще осенью и зимой, при усталости и в возрасте */
export const illness: EventDef = {
  id: 'illness',
  trigger: 'daily',
  chance(c) {
    const r = c.sim.state.residents[c.who!];
    if (r.sick) return 0;
    const def = c.sim.defs.residentById.get(c.who!)!;
    const m = c.sim.calendar().month;
    const season = m >= 11 || m <= 3 ? 2.6 : m >= 9 ? 1.6 : 0.7;
    const tired = r.needs.energy < 30 ? 2 : 1;
    const old = c.sim.age(def) >= 65 ? 1.5 : 1;
    const chilled = (c.sim.state.flags[`wet:${c.who}`] ?? -1e9) > c.sim.time - 2 * 86400 ? 2.2 : 1;
    // молодые, здоровые, со спортом — болеют заметно реже
    const healthy = def.traits.tags.some((t) => /здоров|любит спорт/i.test(t)) ? 0.35 : 1;
    return 0.006 * season * tired * old * chilled * healthy;
  },
  apply(c) {
    const { sim, who } = c;
    const r = sim.state.residents[who!];
    const days = sim.rng.range(2, 5);
    r.sick = { since: sim.time, until: sim.time + Math.round(days * 86400) };
    addMoodlet({ r, now: sim.time }, 'sick', 'Болеет', -10, days * 24);
    r.bubble = { icon: 'sick', until: sim.time + 4 * 3600 };
    chronicleAt(sim, noticeAt(c), 'sick', [who!], 3);
    // кто узнает — придёт проведать
    for (const other of sim.defs.residents) {
      if (other.id === who) continue;
      const ro = rel(sim, other.id, who!);
      if (ro.conflict || ro.affinity < 25) continue;
      const medic = /медсестр|врач|фельдшер|медбрат/i.test(other.occupation.title) ? 0.35 : 0;
      if (sim.rng.chance(0.35 + medic + ro.affinity / 200)) {
        sim.state.residents[other.id].intents.push({ target: who!, kind: 'care', until: sim.time + days * 86400 });
      }
    }
  },
};

/** Тот, кто остыл первым, решает пойти мириться */
export const apologyIntent: EventDef = {
  id: 'apology-intent',
  trigger: 'daily',
  chance: (c) => (Object.values(c.sim.state.relations[c.who!] ?? {}).some((r) => r.conflict) ? 1 : 0),
  apply(c) {
    const { sim, who } = c;
    const def = sim.defs.residentById.get(who!)!;
    const r = sim.state.residents[who!];
    for (const [other, re] of Object.entries(sim.state.relations[who!] ?? {})) {
      if (!re.conflict) continue;
      const days = (sim.time - re.conflict.since) / 86400;
      const temper = { calm: 0.2, even: 0.05, hot: -0.05 }[def.traits.temper];
      const outlook = { cheerful: 0.1, neutral: 0, gloomy: -0.08 }[def.traits.outlook];
      const p = 0.12 + days * 0.18 + temper + outlook + Math.max(0, re.affinity) / 300 + (re.kind === 'friend' ? 0.1 : 0);
      if (sim.rng.chance(Math.min(0.9, p))) r.intents.push({ target: other, kind: 'apologize', until: sim.time + 20 * 3600 });
    }
  },
};
