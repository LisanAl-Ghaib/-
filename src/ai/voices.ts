import { calendar } from '../core/time';
import { touchChronicle } from '../sim/chronicle/chronicle';
import { nameCase } from '../sim/chronicle/russian';
import { rel } from '../sim/social/relations';
import type { ResidentDef } from '../data/schemas';
import type { ChronicleEntry } from '../sim/state';
import type { Simulation } from '../sim/simulation';
import { detectLocalModel, type ChatMessage, type LocalModel } from './localModel';

/**
 * «Голоса жильцов»: локальная нейросеть пишет, что именно соседи сказали друг другу.
 *
 * Тело жильцов остаётся по сценарию (симуляция детерминирована и нейросеть не читает),
 * а когда в хронике появляется разговор — встреча на лестнице, гости, лифт, ссора, вопрос
 * к соседу-«справочнику» — нейросеть дописывает 2–4 реплики, которые слышит сосед, с учётом
 * характеров, отношений и того, что было раньше (дневник каждого жильца).
 *
 * Всё, что она написала, сохраняется в мире (реплики — в записи хроники, память — в дневниках),
 * поэтому перезагрузка ничего не ломает. Пока мир досчитывает пропущенное время, нейросеть
 * не зовут: там работают обычные шаблоны.
 */

/** О каких событиях есть что послушать */
const SPOKEN = new Set(['chat', 'visit', 'elevator', 'ask-help', 'quarrel', 'reconcile', 'honest']);
/** сколько записей дневника хранить и сколько показывать модели */
const DIARY_KEEP = 16;
const DIARY_SHOW = 6;
const QUEUE_MAX = 3;

export interface VoicesStatus {
  server: string;
  model: string;
  busy: boolean;
}

export class Voices {
  private model: LocalModel | null = null;
  private queue: number[] = [];
  private busy = false;
  private failures = 0;
  private lastDetect = -Infinity;
  private detecting = false;
  /** мир досчитывает пропущенное — модель не зовём */
  live = true;

  constructor(
    private sim: Simulation,
    private fetchImpl: typeof fetch = (...args) => fetch(...args),
    private now: () => number = () => Date.now(),
  ) {
    sim.state.diaries ??= {};
    sim.bus.on('chronicle', (e) => this.onEntry(e.entry));
  }

  status(): VoicesStatus | null {
    return this.model ? { server: this.model.server, model: this.model.model, busy: this.busy } : null;
  }

  /** Раз в минуту проверить, не запустили ли модель (или не выключили ли) */
  async tick(): Promise<void> {
    if (this.model || this.detecting || this.now() - this.lastDetect < 60_000) return;
    this.detecting = true;
    this.lastDetect = this.now();
    try {
      this.model = await detectLocalModel(this.fetchImpl);
      if (this.model) console.info(`[голоса] ${this.model.server}: ${this.model.model}`);
    } finally {
      this.detecting = false;
    }
    void this.pump();
  }

  private onEntry(e: ChronicleEntry): void {
    // дневник: заметное о жильце запоминается и без нейросети
    if (e.importance >= 2 && !SPOKEN.has(e.kind)) for (const id of e.actors) this.remember(id, e.t, e.text);
    if (!this.live || !SPOKEN.has(e.kind) || e.actors.length < 2) return;
    if (e.kind === 'chat' && Number(e.data.minutes ?? 0) < 6 && !e.data.quarrel) return;
    this.queue.push(e.id);
    // не копим: свежее важнее
    while (this.queue.length > QUEUE_MAX) this.queue.shift();
    void this.pump();
  }

  private remember(id: string, t: number, text: string): void {
    const d = (this.sim.state.diaries![id] ??= []);
    const c = calendar(this.sim.defs.epochMs, t);
    d.push(`${String(c.day).padStart(2, '0')}.${String(c.month).padStart(2, '0')}: ${text.slice(0, 180)}`);
    if (d.length > DIARY_KEEP) d.splice(0, d.length - DIARY_KEEP);
  }

  private async pump(): Promise<void> {
    if (this.busy || !this.model) return;
    const id = this.queue.shift();
    if (id === undefined) return;
    const entry = this.sim.state.chronicle.find((x) => x.id === id);
    // устарело (больше двух игровых часов назад) — уже неинтересно
    if (!entry || entry.data.voice || this.sim.time - entry.t > 2 * 3600) return void this.pump();
    this.busy = true;
    try {
      const raw = await this.model.chat(buildPrompt(this.sim, entry, this.model.model), { maxTokens: 450 });
      const parsed = parseReply(raw);
      if (parsed) {
        const [a, b] = entry.actors;
        const name = (who: 'A' | 'B') => shortName(this.sim, who === 'A' ? a : b);
        entry.data.voice = parsed.lines.map((l) => `${name(l.who)}: ${l.text}`).join('\n');
        if (parsed.memoryA) this.remember(a, entry.t, parsed.memoryA);
        if (parsed.memoryB) this.remember(b, entry.t, parsed.memoryB);
        touchChronicle();
      }
      this.failures = 0;
    } catch (err) {
      console.warn('[голоса]', err);
      // модель выключили или она не отвечает — вернёмся к шаблонам и поищем снова позже
      if (++this.failures >= 3) {
        this.model = null;
        this.failures = 0;
        this.queue = [];
      }
    } finally {
      this.busy = false;
    }
    void this.pump();
  }
}

function shortName(sim: Simulation, id: string): string {
  const d = sim.defs.residentById.get(id);
  return d ? nameCase(d, 'nom') : id;
}

/** Карточка жильца для модели: кто он, как говорит, что с ним было */
function card(sim: Simulation, def: ResidentDef): string {
  const habits = [...def.habits].sort((x, y) => y.strength - x.strength).slice(0, 4).map((h) => h.note).filter(Boolean);
  const lines = [
    `${nameCase(def, 'nom')} (${def.gender === 'f' ? 'женщина' : 'мужчина'}, ${sim.age(def)} лет), ${def.occupation.title}.`,
    `Характер: ${def.traits.tags.slice(0, 14).join('; ')}.`,
  ];
  if (habits.length) lines.push(`Привычки: ${habits.join('; ')}.`);
  if (def.sayings.length) lines.push(`Словечки (иногда, не в каждой фразе): ${def.sayings.map((s) => `«${s}»`).join(', ')}.`);
  if (def.backstory) lines.push(`Предыстория (вслух не рассказывает): ${def.backstory.slice(0, 220)}`);
  const diary = sim.state.diaries?.[def.id]?.slice(-DIARY_SHOW) ?? [];
  if (diary.length) lines.push(`Что с ним было недавно:\n${diary.map((x) => `- ${x}`).join('\n')}`);
  return lines.join('\n');
}

function relation(sim: Simulation, a: string, b: string): string {
  const r = rel(sim, a, b);
  const aff = (r.affinity + rel(sim, b, a).affinity) / 2;
  const words = aff > 50 ? 'близкие, тёплые отношения' : aff > 20 ? 'приятельствуют' : aff > -10 ? 'ровные соседские отношения' : 'недолюбливают друг друга';
  const parts = [words];
  if (r.familiarity < 15) parts.push('почти не знакомы');
  if (r.conflict) parts.push('сейчас в ссоре');
  const da = sim.defs.residentById.get(a);
  const db = sim.defs.residentById.get(b);
  const dispute = da?.relationships.find((x) => x.with === b)?.dispute ?? db?.relationships.find((x) => x.with === a)?.dispute;
  if (dispute) parts.push(`давно и добродушно спорят: ${dispute}`);
  const note = da?.relationships.find((x) => x.with === b)?.note;
  if (note) parts.push(note);
  return parts.join('; ');
}

/** Что за сцена: подсказка по виду события */
function scene(entry: ChronicleEntry): string {
  const d = entry.data;
  switch (entry.kind) {
    case 'chat':
      if (d.quarrel) return `Встретились ${d.place} и поссорились${d.cause ? ` (${d.cause})` : ''}. Реплики резкие, но без мата.`;
      if (d.place === 'на балконах') return 'Переговариваются с балконов соседних этажей, перегнувшись через перила.';
      return `Встретились ${d.place} и разговорились${d.topic ? ` — ${d.topic}` : ''}.`;
    case 'visit':
      return `A пришёл/пришла в гости к B${d.intent && d.intent !== 'chat' ? ` (повод: ${d.intent === 'treat' ? 'угостить' : d.intent === 'congratulate' ? 'поздравить' : d.intent === 'care' ? 'проведать больного' : d.intent === 'apologize' ? 'помириться' : d.intent})` : ''}${d.gift ? `, принёс(ла) ${d.gift}` : ''}${d.dinner ? ', вместе поели' : ''}${d.quarrel ? `. Разговор перешёл в ссору${d.cause ? ` (${d.cause})` : ''}` : ''}. Слышно из-за двери.`;
    case 'elevator':
      return 'Едут вместе в лифте: короткий разговор на пару фраз.';
    case 'ask-help':
      return `A подошёл/подошла к B ${d.what}; B ${d.how}.`;
    case 'quarrel':
      return `Ссорятся${d.cause ? ` (${d.cause})` : ''}; слышны громкие голоса.`;
    case 'reconcile':
      return 'Мирятся после ссоры: неловко, но по-доброму.';
    case 'honest':
      return `В гостях A мягко, но честно говорит хозяину (B), что ${d.what}.`;
    default:
      return '';
  }
}

const SYSTEM = `Ты пишешь реплики жильцов обычного многоквартирного дома для тихой хроники «как живут соседи».
Правила:
- По-русски, просто и естественно, как говорят живые люди в подъезде: бытово, коротко, без пафоса и литературщины.
- Только то, что сказано вслух и слышно соседу. Никаких мыслей, чувств «за кадром», описаний и ремарок.
- Каждый говорит своим голосом и в своём характере. Словечки персонажа — изредка, к месту.
- Опирайся на то, что с ними было недавно, если это к месту. Не придумывай новых жильцов и крупных событий.
- 2–4 реплики, каждая 3–16 слов. Без мата и грубости, если персонаж не грубый.
- Ответь ТОЛЬКО JSON без пояснений:
{"lines":[{"who":"A","text":"..."},{"who":"B","text":"..."}],"memoryA":"...","memoryB":"..."}
memoryA/memoryB — одна короткая фраза в третьем лице: что каждый запомнит из этого разговора.`;

export function buildPrompt(sim: Simulation, entry: ChronicleEntry, model = ''): ChatMessage[] {
  const [a, b] = entry.actors;
  const da = sim.defs.residentById.get(a)!;
  const db = sim.defs.residentById.get(b)!;
  const c = sim.calendar();
  const part = c.hourOfDay < 6 ? 'ночь' : c.hourOfDay < 12 ? 'утро' : c.hourOfDay < 18 ? 'день' : c.hourOfDay < 23 ? 'вечер' : 'ночь';
  const days = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  const w = sim.weather;
  const user = [
    `Сейчас: ${days[c.weekday]}, ${part} (${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}), погода: ${w.kind}, ${Math.round(w.temp)}°.`,
    `Что произошло (так это записал сосед): ${entry.text}`,
    `Сцена: ${scene(entry)}`,
    '',
    `A — ${card(sim, da)}`,
    '',
    `B — ${card(sim, db)}`,
    '',
    `Отношения A и B: ${relation(sim, a, b)}.`,
  ].join('\n');
  // Qwen3 и похожие по умолчанию «думают» вслух — просим сразу отвечать
  const noThink = /qwen3|deepseek-r1|qwq/i.test(model) ? ' /no_think' : '';
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user + noThink },
  ];
}

export interface Reply {
  lines: { who: 'A' | 'B'; text: string }[];
  memoryA?: string;
  memoryB?: string;
}

/** Разобрать ответ модели (с запасом на мусор вокруг JSON) */
export function parseReply(raw: string): Reply | null {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let j: unknown;
  try {
    j = JSON.parse(raw.slice(s, e + 1));
  } catch {
    return null;
  }
  const o = j as { lines?: unknown; memoryA?: unknown; memoryB?: unknown };
  if (!Array.isArray(o.lines)) return null;
  const clean = (t: string) =>
    t
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[«"“„'—–-]+\s*|\s*[»"”']+$/g, '')
      .trim()
      .slice(0, 160);
  const lines = o.lines
    .map((l) => l as { who?: unknown; text?: unknown })
    .filter((l) => (l.who === 'A' || l.who === 'B') && typeof l.text === 'string' && clean(l.text).length > 0)
    .slice(0, 4)
    .map((l) => ({ who: l.who as 'A' | 'B', text: clean(l.text as string) }));
  if (lines.length < 1) return null;
  const mem = (m: unknown) => (typeof m === 'string' && m.trim() ? m.trim().slice(0, 160) : undefined);
  return { lines, memoryA: mem(o.memoryA), memoryB: mem(o.memoryB) };
}
