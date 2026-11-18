import { calendar, hhmm } from '../core/time';
import type { HabitKind, ResidentDef } from '../data/schemas';
import { describeAffinity, RELATION_WORDS } from '../sim/social/relations';
import type { ResidentState } from '../sim/state';
import { bar, el } from './dom';
import { portrait } from './portrait';
import type { UiHost } from './ui';

const NEEDS: [keyof ResidentState['needs'], string][] = [
  ['energy', 'Энергия'],
  ['food', 'Сытость'],
  ['social', 'Общение'],
  ['mood', 'Настроение'],
];

const HABIT: Record<HabitKind, string> = {
  reading: 'чтение', tv: 'телевизор', cooking: 'готовка', walking: 'прогулки', jogging: 'бег',
  music: 'музыка', gaming: 'видеоигры', crafts: 'рукоделие', plants: 'цветы', phone: 'телефон',
  smoking: 'курит', bench: 'лавочка у подъезда', fitness: 'спорт', computer: 'интернет',
};

const OCCUPATION: Record<string, string> = {
  office: 'работает в офисе', shift: 'работает сменами', remote: 'работает из дома', freelance: 'фрилансер',
  student: 'студент', school: 'школьник', retired: 'на пенсии', unemployed: 'без работы', homemaker: 'ведёт хозяйство',
};

function traitChips(d: ResidentDef): string[] {
  const f = d.gender === 'f';
  const t = d.traits;
  const out = [
    { lark: f ? 'жаворонок' : 'жаворонок', neutral: 'обычный режим', owl: 'сова' }[t.chronotype],
    { homebody: f ? 'домоседка' : 'домосед', balanced: f ? 'в меру общительна' : 'в меру общителен', outgoing: 'душа компании' }[t.sociability],
    { calm: f ? 'спокойная' : 'спокойный', even: f ? 'уравновешенная' : 'уравновешенный', hot: f ? 'вспыльчивая' : 'вспыльчивый' }[t.temper],
  ];
  if (t.outlook !== 'neutral') out.push(t.outlook === 'cheerful' ? (f ? 'оптимистка' : 'оптимист') : (f ? 'пессимистка' : 'пессимист'));
  if (t.activity !== 'normal') out.push(t.activity === 'active' ? (f ? 'активная' : 'активный') : (f ? 'неторопливая' : 'неторопливый'));
  return [...out, ...t.tags];
}

function years(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'год' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'года' : 'лет';
  return `${n} ${w}`;
}

/** Карточка жильца: биография, текущее действие, потребности, отношения */
export function renderResidentCard(box: HTMLElement, host: UiHost, id: string): void {
  const def = host.defs.residentById.get(id);
  if (!def) return;
  const apt = host.defs.layout.aptById.get(def.apartment)!;
  const fullName = [def.name.first, def.name.patronymic, def.name.last].filter(Boolean).join(' ');
  box.innerHTML = '';
  const card = el('div', { class: 'card' },
    portrait(def, 84),
    el('h2', {}, fullName),
    el('div', { class: 'sub' }, `${years(host.sim.age(def))} · ${def.occupation.title}`),
    el('div', { class: 'sub' }, `кв. ${apt.number}, ${apt.level} этаж · ${OCCUPATION[def.occupation.kind]}${def.occupation.workplace ? ` — ${def.occupation.workplace}` : ''}`),
    el('div', { style: 'display:flex;gap:4px;margin:6px 0' },
      el('button', { onclick: () => host.select(id, { focus: true }) }, '◎ Следить'),
      el('button', { onclick: () => host.focusApartment(def.apartment) }, '⌂ Квартира'),
    ),
    el('div', { class: 'now', 'data-k': 'now' }, '…'),
    el('h3', {}, 'Потребности'),
    el('div', { 'data-k': 'needs' }),
    el('div', { 'data-k': 'moodlets' }),
    el('h3', {}, 'Характер'),
    el('div', { class: 'chips' }, ...traitChips(def).map((t) => el('span', { class: 'chip' }, t))),
    def.habits.length ? el('h3', {}, 'Привычки') : null,
    ...def.habits.map((h) => el('p', {}, el('b', {}, HABIT[h.kind]), h.note ? ` — ${h.note}` : '')),
    el('h3', {}, 'История'),
    el('p', {}, def.backstory || '—'),
    el('h3', {}, 'Распорядок на сегодня'),
    el('div', { class: 'furn-list', 'data-k': 'plan' }),
    el('h3', {}, 'Отношения с соседями'),
    el('div', { 'data-k': 'rels' }),
    el('h3', {}, 'Недавно'),
    el('div', { 'data-k': 'recent' }),
  );
  box.append(card);
  updateResidentCard(box, host, id, true);
}

let relStamp = 0;

export function updateResidentCard(box: HTMLElement, host: UiHost, id: string, full = false): void {
  const r = host.sim.state.residents[id];
  const def = host.defs.residentById.get(id);
  if (!r || !def) return;
  const q = (k: string) => box.querySelector<HTMLElement>(`[data-k="${k}"]`);
  const now = q('now');
  if (now) {
    const sick = r.sick && r.sick.until > host.sim.time ? ' · болеет' : '';
    now.textContent = `Сейчас: ${r.action?.label ?? 'думает, чем заняться'}${sick}`;
  }
  const needs = q('needs');
  if (needs) {
    needs.innerHTML = '';
    for (const [k, label] of NEEDS) needs.append(el('div', { class: 'need' }, el('span', {}, label), bar(r.needs[k]), el('span', {}, String(Math.round(r.needs[k])))));
  }
  const ml = q('moodlets');
  if (ml) {
    ml.innerHTML = '';
    for (const m of [...r.moodlets].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))) {
      ml.append(el('div', { class: 'moodlet' }, el('b', { class: m.value >= 0 ? 'pos' : 'neg' }, `${m.value > 0 ? '+' : ''}${m.value}`), ` ${m.label}`));
    }
  }
  const plan = q('plan');
  if (plan && r.plan) {
    const t = (abs: number | null) => (abs === null ? '—' : hhmm(calendar(host.defs.epochMs, abs).minuteOfDay));
    const p = r.plan;
    const st = host.sim.aptState(def.apartment);
    plan.innerHTML = '';
    plan.append(
      el('div', {}, `Подъём ${t(p.wakeAt)} · отбой ${t(p.bedAt)}`),
      el('div', {}, p.workday && p.workStartAt !== null ? `Работа ${t(p.workStartAt)}–${t(p.workEndAt)}${p.leaveAt !== null && p.leaveAt < p.workStartAt ? `, выходит в ${t(p.leaveAt)}` : ''}` : r.sick ? 'Сегодня на больничном' : 'Сегодня не работает'),
      el('div', {}, `Завтрак ~${t(p.breakfastAt)} · обед ~${t(p.lunchAt)} · ужин ~${t(p.dinnerAt)}`),
      el('div', {}, `В холодильнике: ${st.meals} порц. готовой еды, продуктов на ${Math.floor(st.groceries)} готовок`),
    );
  }
  // отношения и «недавно» меняются редко — обновляем раз в пару секунд
  if (!full && performance.now() - relStamp < 2000) return;
  relStamp = performance.now();
  const rels = q('rels');
  if (rels) {
    rels.innerHTML = '';
    const mine = host.sim.state.relations[id] ?? {};
    const rows = Object.entries(mine).sort((a, b) => b[1].affinity - a[1].affinity);
    if (!rows.length) rels.append(el('div', { class: 'empty' }, 'Пока ни с кем не знаком(а).'));
    for (const [other, re] of rows) {
      const od = host.defs.residentById.get(other);
      if (!od) continue;
      const kind = RELATION_WORDS[re.kind]?.[od.gender] ?? re.kind;
      const v = re.affinity;
      const color = v >= 0 ? 'var(--good)' : 'var(--bad)';
      const style = v >= 0 ? `left:50%;width:${v / 2}%;background:${color}` : `left:${50 + v / 2}%;width:${-v / 2}%;background:${color}`;
      rels.append(
        el('div', { class: 'rel' },
          el('div', {},
            el('span', { class: 'who', onclick: () => host.select(other) }, od.name.short ?? od.name.first),
            el('span', { class: 'kind' }, ` · ${kind} · ${describeAffinity(v)}`),
            re.conflict ? el('div', {}, el('span', { class: 'chip warn' }, `в ссоре ${re.conflict.cause}`)) : null,
          ),
          el('div', { class: 'affbar', title: `симпатия ${Math.round(v)}, знакомство ${Math.round(re.familiarity)}` }, el('i', { style })),
        ),
      );
    }
  }
  const recent = q('recent');
  if (recent) {
    recent.innerHTML = '';
    const entries = host.sim.state.chronicle.filter((e) => e.actors.includes(id) && e.importance >= 2).slice(-6).reverse();
    if (!entries.length) recent.append(el('div', { class: 'empty' }, 'Пока ничего примечательного.'));
    for (const e of entries) {
      const c = calendar(host.defs.epochMs, e.t);
      recent.append(el('div', { class: 'chron-entry' }, el('span', { class: 't' }, `${c.day}.${String(c.month).padStart(2, '0')} ${hhmm(c.minuteOfDay)}`), e.text));
    }
  }
}
