import { calendar } from '../core/time';
import { touchChronicle } from '../sim/chronicle/chronicle';
import { nameCase } from '../sim/chronicle/russian';
import { rel } from '../sim/social/relations';
import type { ResidentDef } from '../data/schemas';
import type { ChronicleEntry } from '../sim/state';
import type { Simulation } from '../sim/simulation';
import { detectLocalModel, ModelError, type ChatMessage, type LocalModel } from './localModel';

/**
 * «Голоса жильцов»: локальная нейросеть пишет, что именно соседи говорят друг другу.
 *
 * Тело жильцов остаётся по сценарию (симуляция детерминирована и нейросеть не читает).
 * Как только разговор начался — встреча на лестнице, гости, пара болтает дома, звонок по
 * телефону — модели сразу уходит запрос, и реплики появляются облачками над головами
 * по мере того, как модель их пишет, пока люди ещё разговаривают. Долгий разговор
 * (гости на пару часов) идёт несколькими заходами. Короткие события (лифт, «здрасьте»,
 * консьержка, вопрос к соседу-«справочнику», ссора) озвучиваются, когда попадают в хронику.
 *
 * Всё сказанное сохраняется в мире (реплики — в записи хроники, память — в дневниках),
 * поэтому перезагрузка ничего не ломает. Пока мир досчитывает пропущенное время, нейросеть
 * не зовут: там работают обычные шаблоны.
 */

/** Разговоры, которые слышно, пока они идут (озвучиваются с начала) */
const LIVE = new Set(['chat', 'visit', 'couple.talk', 'phone-call']);
/** Короткие события: озвучиваются по записи в хронике */
const SPOKEN = new Set(['elevator', 'ask-help', 'quarrel', 'reconcile', 'honest', 'concierge', 'greet']);
/** говорит один (второго не слышно или это не жилец): рыбка, кружок с детьми */
const SOLO = new Set(['fish.talk', 'circle.heard']);
/** сколько записей дневника хранить и сколько показывать модели */
const DIARY_KEEP = 16;
const DIARY_SHOW = 6;
/** заходов на один долгий разговор */
const MAX_ROUNDS = 4;
/** не начинать разговор, которому осталось меньше (игровых секунд = реальных мс / 1000 * 60) */
const MIN_LEFT = 5 * 60;

type Who = 'A' | 'B' | 'X';
export interface Line {
  who: Who;
  text: string;
}

/** Что модель озвучивает: идущий разговор или короткое событие из хроники */
export interface SceneInput {
  kind: string;
  actors: string[];
  data: Record<string, unknown>;
  /** как это записал сосед (для событий из хроники) */
  text?: string;
}

interface Scene extends SceneInput {
  key: string;
  live: boolean;
  startedAt: number;
  endsAt: number;
  /** разговор ещё идёт */
  active: boolean;
  lines: Line[];
  rounds: number;
  queued: boolean;
  entryId: number | null;
  /** облачки: сколько реплик уже показано и до какого момента (реальное время) видна текущая */
  shown: number;
  lineUntil: number;
  /** когда сцену можно забыть (реальное время) */
  forgetAt: number;
}

export interface VoicesStatus {
  server: string;
  model: string;
  busy: boolean;
  /** что пошло не так в последний раз (если последний ответ не удался) */
  problem: string | null;
  /** сколько реплик модель уже написала */
  voiced: number;
}

/** Реплика над головой: кто говорит и что */
export interface Speech {
  id: string;
  text: string;
  key: string;
}

export class Voices {
  private model: LocalModel | null = null;
  private scenes = new Map<string, Scene>();
  private busy = false;
  private failures = 0;
  private lastDetect = -Infinity;
  private detecting = false;
  private problem: string | null = null;
  private voiced = 0;
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
    return this.model ? { server: this.model.server, model: this.model.model, busy: this.busy, problem: this.problem, voiced: this.voiced } : null;
  }

  /** Часто (несколько раз в секунду): заметить начавшиеся разговоры; раз в минуту — поискать модель */
  async tick(): Promise<void> {
    if (this.model && this.live) this.watch();
    if (!this.model && !this.detecting && this.now() - this.lastDetect >= 60_000) {
      this.detecting = true;
      this.lastDetect = this.now();
      try {
        this.model = await detectLocalModel(this.fetchImpl);
        if (this.model) console.info(`[голоса] ${this.model.server}: ${this.model.model}`);
      } finally {
        this.detecting = false;
      }
    }
    void this.pump();
  }

  /** Реплики, которые сейчас звучат (для облачков над головами) */
  speech(): Speech[] {
    const now = this.now();
    const out: Speech[] = [];
    for (const sc of this.scenes.values()) {
      if (now >= sc.lineUntil && sc.shown < sc.lines.length) {
        // разговор давно кончился, а реплик накопилось — облачками уже не показываем
        const late = !sc.active && this.sim.time - sc.endsAt > 15 * 60;
        if (late) sc.shown = sc.lines.length;
        else {
          const l = sc.lines[sc.shown++];
          sc.lineUntil = now + Math.min(7000, 2200 + l.text.length * 70);
          if (sc.shown === sc.lines.length && !sc.active) sc.forgetAt = Math.max(sc.forgetAt, sc.lineUntil + 1000);
        }
      }
      if (sc.shown > 0 && now < sc.lineUntil) {
        const l = sc.lines[sc.shown - 1];
        const id = l.who === 'A' ? sc.actors[0] : l.who === 'B' ? sc.actors[1] : undefined;
        if (id) out.push({ id, text: l.text, key: `${sc.key}:${sc.shown}` });
      }
    }
    return out;
  }

  /** Какие разговоры сейчас идут (только читаем мир) */
  private watch(): void {
    const s = this.sim.state;
    const t = this.sim.time;
    const seen = new Set<string>();
    const touch = (key: string, endsAt: number, make: () => SceneInput | null, startedAt: number) => {
      let sc = this.scenes.get(key);
      if (!sc) {
        if (endsAt - t < MIN_LEFT) return;
        const input = make();
        if (!input) return;
        sc = this.scene(key, input, true, startedAt, endsAt);
        this.enqueue(sc);
      }
      sc.endsAt = endsAt;
      sc.active = true;
      seen.add(key);
    };
    // встречи и гости
    for (const it of s.interactions) {
      if (it.ended || it.members.length < 2) continue;
      const rs = it.members.map((id) => s.residents[id]);
      if (!rs.every((r) => r && !r.away && (r.action?.phase === 'perform' || r.action?.id === 'bench'))) continue;
      const meta = Object.fromEntries(it.notes.filter((n) => n.includes('=')).map((n) => n.split('=') as [string, string]));
      touch(
        `it:${it.id}`,
        it.endsAt,
        () =>
          it.kind === 'visit'
            ? { kind: 'visit', actors: [it.members[0], it.host!], data: { intent: it.intent, gift: meta.gift ?? null } }
            : { kind: 'chat', actors: [...it.members], data: { place: it.place } },
        it.startedAt,
      );
    }
    for (const r of Object.values(s.residents)) {
      const a = r.action;
      if (!a || r.away || a.phase !== 'perform') continue;
      // пара болтает дома
      if (a.id === 'together' && a.data.kind === 'talk' && a.data.lead) {
        const other = String(a.data.with);
        const oa = s.residents[other]?.action;
        if (oa?.id !== 'together' || oa.phase !== 'perform') continue;
        touch(`talk:${r.id}:${a.startedAt}`, a.endsAt, () => {
          const def = this.sim.defs.residentById.get(r.id);
          const apt = def ? this.sim.defs.layout.aptById.get(def.apartment) : undefined;
          const room = apt?.rooms.find((x) => r.x >= x.x0 && r.x < x.x1);
          return { kind: 'couple.talk', actors: [r.id, other], data: { room: room?.name ?? 'дома' } };
        }, a.startedAt);
      }
      // говорит по телефону
      if (a.id === 'phone') {
        touch(`phone:${r.id}:${a.startedAt}`, a.endsAt, () => {
          const def = this.sim.defs.residentById.get(r.id);
          const phones = def?.contacts.filter((c) => c.phone) ?? [];
          const c = typeof a.data.contact === 'number' ? def?.contacts[a.data.contact] : phones[Math.floor(a.startedAt / 60) % Math.max(1, phones.length)];
          if (!c) return { kind: 'phone-call', actors: [r.id], data: { topic: 'как дела' } };
          const topic = c.topics.length ? c.topics[Math.floor(a.startedAt / 60) % c.topics.length] : 'как дела';
          return { kind: 'phone-call', actors: [r.id], data: { name: c.name ?? null, gender: c.gender, kind: c.kind, topic } };
        }, a.startedAt);
      }
    }
    const now = this.now();
    for (const sc of this.scenes.values()) {
      if (sc.live && sc.active && !seen.has(sc.key)) {
        sc.active = false;
        sc.forgetAt = now + 60_000;
      }
      if (!sc.active && !sc.queued && sc !== this.current && now > sc.forgetAt && sc.shown >= sc.lines.length) this.scenes.delete(sc.key);
    }
  }

  private scene(key: string, input: SceneInput, live: boolean, startedAt: number, endsAt: number): Scene {
    const sc: Scene = { ...input, key, live, startedAt, endsAt, active: live, lines: [], rounds: 0, queued: false, entryId: null, shown: 0, lineUntil: 0, forgetAt: this.now() + 120_000 };
    this.scenes.set(key, sc);
    return sc;
  }

  private enqueue(sc: Scene): void {
    sc.queued = true;
    void this.pump();
  }

  private onEntry(e: ChronicleEntry): void {
    // дневник: заметное о жильце запоминается и без нейросети
    if (e.importance >= 2 && !LIVE.has(e.kind) && !SPOKEN.has(e.kind) && !SOLO.has(e.kind)) for (const id of e.actors) this.remember(id, e.t, e.text);
    // идущий (или только что закончившийся) разговор попал в хронику — реплики туда же
    if (LIVE.has(e.kind)) {
      const sc = [...this.scenes.values()].find(
        (x) =>
          x.live &&
          x.entryId === null &&
          x.kind === e.kind &&
          x.actors.length === e.actors.length &&
          x.actors.every((id) => e.actors.includes(id)) &&
          (e.kind === 'phone-call' ? e.t >= x.startedAt - 60 && e.t <= x.endsAt + 600 : Math.abs(e.t - x.startedAt) <= 15 * 60),
      );
      if (sc) {
        sc.entryId = e.id;
        sc.text = e.text;
        this.attach(sc);
      }
      return;
    }
    if (!this.live || !this.model) return;
    if (!(SPOKEN.has(e.kind) && e.actors.length >= 2) && !(SOLO.has(e.kind) && e.actors.length >= 1)) return;
    // консьержка кивает каждому — озвучиваем только, когда есть о чём сказать
    if (e.kind === 'concierge' && (e.data.flavor === 'nod' || e.data.flavor === 'kid')) return;
    // кивнули друг другу — иногда слышно и пару слов (через раз, чтобы не заваливать модель)
    if (e.kind === 'greet' && e.id % 2 === 1) return;
    const sc = this.scene(`e:${e.id}`, { kind: e.kind, actors: e.actors, data: e.data, text: e.text }, false, e.t, e.t);
    sc.entryId = e.id;
    sc.active = false;
    this.enqueue(sc);
  }

  private remember(id: string, t: number, text: string): void {
    const d = (this.sim.state.diaries![id] ??= []);
    const c = calendar(this.sim.defs.epochMs, t);
    d.push(`${String(c.day).padStart(2, '0')}.${String(c.month).padStart(2, '0')}: ${text.slice(0, 180)}`);
    if (d.length > DIARY_KEEP) d.splice(0, d.length - DIARY_KEEP);
  }

  /** Реплики сцены — в её запись хроники */
  private attach(sc: Scene): void {
    if (sc.entryId === null || !sc.lines.length) return;
    const entry = this.sim.state.chronicle.find((x) => x.id === sc.entryId);
    if (!entry) return;
    const other = sc.kind === 'circle.heard' ? 'Дети' : null;
    const name = (who: Who) => (who === 'A' ? shortName(this.sim, sc.actors[0]) : who === 'B' && sc.actors[1] ? shortName(this.sim, sc.actors[1]) : other);
    entry.data.voice = sc.lines
      .filter((l) => name(l.who))
      .map((l) => `${name(l.who)}: ${l.text}`)
      .join('\n');
    touchChronicle();
  }

  /** Что озвучить следующим: начавшиеся разговоры — первыми, продолжения — когда прошлое уже сказано */
  private pick(): Scene | null {
    const t = this.sim.time;
    let best: Scene | null = null;
    let bestScore = -Infinity;
    for (const sc of this.scenes.values()) {
      if (!sc.queued) continue;
      // разговор кончился раньше, чем до него дошла очередь, — облачкам уже поздно
      if ((sc.live && !sc.active) || (!sc.live && t - sc.startedAt > 2 * 3600)) {
        sc.queued = false;
        continue;
      }
      const unshown = sc.lines.length - sc.shown;
      if (sc.rounds > 0 && unshown > 1) continue;
      const fresh = sc.live ? (sc.rounds === 0 ? 300 : 100) : t - sc.startedAt < 10 * 60 ? 200 : 0;
      const score = fresh + sc.startedAt / 1e6;
      if (score > bestScore) {
        best = sc;
        bestScore = score;
      }
    }
    return best;
  }

  private current: Scene | null = null;

  private async pump(): Promise<void> {
    if (this.busy || !this.model || !this.live) return;
    const sc = this.pick();
    if (!sc) return;
    sc.queued = false;
    this.busy = true;
    this.current = sc;
    const model = this.model;
    const names: Record<string, Who> = {};
    sc.actors.forEach((id, i) => {
      const d = this.sim.defs.residentById.get(id);
      if (d) for (const n of [nameCase(d, 'nom'), d.name.first, d.name.short ?? '']) if (n) names[n] = i === 0 ? 'A' : 'B';
    });
    const before = sc.lines.length;
    const round = sc.rounds;
    const last = sc.live && sc.endsAt - this.sim.time < 25 * 60;
    let got = 0;
    const take = (reply: Reply | null) => {
      if (!reply) return;
      while (got < reply.lines.length && got < 4) {
        const l = reply.lines[got++];
        // у одного говорящего «B» нет; «X» (дети) — только на кружке
        if ((l.who === 'B' && !sc.actors[1]) || (l.who === 'X' && sc.kind !== 'circle.heard')) continue;
        sc.lines.push(l);
        this.voiced++;
      }
      this.attach(sc);
    };
    try {
      console.info(`[голоса] → ${sc.kind}${round ? ` (заход ${round + 1})` : ''}: ${sc.actors.map((id) => shortName(this.sim, id)).join(' и ')}`);
      const raw = await model.chat(buildPrompt(this.sim, sc, model.model, sc.lines.slice(0, before), last), {
        maxTokens: 450,
        onText: (text) => take(parseLines(text, names, false)),
      });
      const parsed = parseReply(raw, names);
      take(parsed);
      if (!parsed || sc.lines.length === before) {
        this.problem = 'ответ модели не разобран';
        console.warn('[голоса] не разобрал ответ модели:', raw.slice(0, 400));
      } else {
        this.problem = null;
        console.info(`[голоса] ← ${sc.lines.slice(before).map((l) => `${l.who}: ${l.text}`).join(' | ')}`);
        const t = sc.live ? this.sim.time : sc.startedAt;
        if (parsed.memoryA) this.remember(sc.actors[0], t, parsed.memoryA);
        if (parsed.memoryB && sc.actors[1]) this.remember(sc.actors[1], t, parsed.memoryB);
      }
      sc.rounds++;
      // долгий разговор продолжается — следующий заход, когда эти реплики прозвучат
      if (sc.live && sc.active && sc.lines.length > before && sc.rounds < MAX_ROUNDS && sc.endsAt - this.sim.time > 12 * 60) sc.queued = true;
      this.failures = 0;
    } catch (err) {
      console.warn('[голоса]', err);
      this.problem = err instanceof Error ? err.message : String(err);
      // модель выключили или сервер пропал — вернёмся к шаблонам и поищем снова позже
      // (если модель просто долго думала — не сдаёмся)
      const network = !(err instanceof ModelError) || err.kind === 'network';
      if (network && ++this.failures >= 3) {
        this.model = null;
        this.failures = 0;
        for (const x of this.scenes.values()) x.queued = false;
      }
    } finally {
      this.busy = false;
      this.current = null;
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
function scene(entry: SceneInput): string {
  const d = entry.data;
  switch (entry.kind) {
    case 'chat':
      if (d.quarrel) return `Встретились ${d.place} и поссорились${d.cause ? ` (${d.cause})` : ''}. Реплики резкие, но без мата.`;
      if (d.place === 'на балконах') return 'Переговариваются с балконов соседних этажей, перегнувшись через перила.';
      return `Встретились ${d.place} и остановились поговорить${d.topic ? ` — ${d.topic}` : ''}.`;
    case 'visit':
      return `A пришёл/пришла в гости к B${d.intent && d.intent !== 'chat' ? ` (повод: ${d.intent === 'treat' ? 'угостить' : d.intent === 'congratulate' ? 'поздравить' : d.intent === 'care' ? 'проведать больного' : d.intent === 'apologize' ? 'помириться' : d.intent})` : ''}${d.gift ? `, принёс(ла) ${d.gift}` : ''}${d.dinner ? ', вместе поели' : ''}${d.quarrel ? `. Разговор перешёл в ссору${d.cause ? ` (${d.cause})` : ''}` : ''}. Слышно из-за двери.`;
    case 'elevator':
      return 'Едут вместе в лифте: короткий разговор на пару фраз.';
    case 'greet':
      return `Поздоровались на ходу ${d.place}: 1–2 короткие реплики, не больше.`;
    case 'ask-help':
      return `A подошёл/подошла к B ${d.what}; B ${d.how}.`;
    case 'quarrel':
      return `Ссорятся${d.cause ? ` (${d.cause})` : ''}; слышны громкие голоса.`;
    case 'reconcile':
      return 'Мирятся после ссоры: неловко, но по-доброму.';
    case 'honest':
      return `В гостях A мягко, но честно говорит хозяину (B), что ${d.what}.`;
    case 'couple.talk':
      return `A и B живут вместе и болтают дома (${d.room}) о чём-нибудь своём, бытовом или смешном. Соседям через стенку слышны обрывки.`;
    case 'concierge':
      return `A — консьержка, сидит в своём окошке у входа; B проходит мимо (${d.flavor === 'candy' ? 'это ребёнок — она даёт конфету' : d.flavor === 'bags' ? 'с тяжёлыми сумками' : d.flavor === 'late' ? 'возвращается поздно' : d.flavor === 'wet' ? 'с мокрой улицы' : d.flavor === 'cold' ? 'выходит на мороз без шапки' : d.flavor === 'quit' ? 'жалуется на работу и в который раз грозится уволиться' : 'остановился поговорить'}). Коротко, 2–3 реплики.`;
    case 'phone-call':
      return `A говорит по телефону (${d.kind === 'sibling' ? (d.gender === 'f' ? 'с сестрой' : 'с братом') : d.kind === 'friend' ? (d.gender === 'f' ? 'с подругой' : 'с другом') : 'с кем-то из своих'}${d.name ? ` по имени ${d.name}` : ''}) — про ${d.topic}. Слышны только реплики A, собеседника не слышно. Пиши только строки «A: …», 2–3 штуки.`;
    case 'fish.talk':
      return 'A кормит рыбку в аквариуме и вполголоса с ней разговаривает — живёт один. Только строки «A: …», 1–3 штуки, просто и немного грустно-смешно.';
    case 'circle.heard':
      return 'A ведёт у себя дома детский шахматный кружок. Слышно из-за двери: A объясняет, дети спрашивают. Реплики A — строки «A: …», реплики детей — строки «X: …». 2–4 реплики.';
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
- Ответь ТОЛЬКО строками, без пояснений, каждая реплика с новой строки:
A: реплика
B: реплика
В конце — по строке на каждого: что он запомнит из разговора (коротко, в третьем лице):
ПАМЯТЬ A: ...
ПАМЯТЬ B: ...`;

export function buildPrompt(sim: Simulation, entry: SceneInput, model = '', said: Line[] = [], closing = false): ChatMessage[] {
  const [a, b] = entry.actors;
  const da = sim.defs.residentById.get(a)!;
  const db = b ? sim.defs.residentById.get(b) : undefined;
  const c = sim.calendar();
  const part = c.hourOfDay < 6 ? 'ночь' : c.hourOfDay < 12 ? 'утро' : c.hourOfDay < 18 ? 'день' : c.hourOfDay < 23 ? 'вечер' : 'ночь';
  const days = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  const w = sim.weather;
  const user = [
    `Сейчас: ${days[c.weekday]}, ${part} (${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}), погода: ${w.kind}, ${Math.round(w.temp)}°.`,
    ...(entry.text ? [`Что произошло (так это записал сосед): ${entry.text}`] : []),
    `Сцена: ${scene(entry)}`,
    '',
    `A — ${card(sim, da)}`,
    ...(db ? ['', `B — ${card(sim, db)}`, '', `Отношения A и B: ${relation(sim, a, b)}.`] : []),
  ];
  if (said.length) {
    user.push('', 'Разговор уже идёт, вот что уже сказали:', ...said.slice(-8).map((l) => `${l.who}: ${l.text}`));
    user.push(closing ? 'Разговор подходит к концу: ещё 2–3 реплики — закругляются и прощаются.' : 'Продолжи: ещё 2–4 реплики, не повторяйся; можно перейти на другую тему.');
  }
  // Qwen3 и похожие по умолчанию «думают» вслух — просим сразу отвечать
  const noThink = /qwen3|deepseek-r1|qwq/i.test(model) ? ' /no_think' : '';
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user.join('\n') + noThink },
  ];
}

export interface Reply {
  /** A и B — жильцы, X — не жилец (дети на кружке) */
  lines: Line[];
  memoryA?: string;
  memoryB?: string;
}

const clean = (t: string) =>
  t
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[«"“„'—–-]+\s*|\s*[»"”']+$/g, '')
    .trim()
    .slice(0, 160);

/** Кириллические «А», «В», «Х» вместо латинских — тоже годятся */
const LETTER: Record<string, Who> = { A: 'A', B: 'B', X: 'X', А: 'A', В: 'B', Х: 'X' };

/**
 * Разобрать строки «A: реплика» (в т. ч. недописанный ответ: final=false — последняя строка
 * ещё пишется и не берётся). names — имена жильцов, если модель написала «Ольга:» вместо «A:».
 */
export function parseLines(raw: string, names: Record<string, Who> = {}, final = true): Reply | null {
  const rows = raw.split('\n');
  if (!final) rows.pop();
  const lines: Line[] = [];
  let memoryA: string | undefined;
  let memoryB: string | undefined;
  for (const row of rows) {
    const r = row.replace(/[*_`]/g, '').trim();
    const mem = /^(?:ПАМЯТЬ|память|Память)\s*([ABАВ])\s*[:：]\s*(.+)$/.exec(r);
    if (mem) {
      const t = mem[2].trim().slice(0, 160);
      if (LETTER[mem[1]] === 'A') memoryA = t;
      else memoryB = t;
      continue;
    }
    const m = /^[-–—•\d.)\s]*([^:：]{1,40}?)\s*[:：]\s*(.+)$/.exec(r);
    if (!m) continue;
    const label = m[1].trim();
    const who = LETTER[label] ?? names[label];
    const text = clean(m[2]);
    if (who && text) lines.push({ who, text });
  }
  if (!lines.length) return null;
  return { lines: lines.slice(0, 4), memoryA, memoryB };
}

/** Разобрать ответ модели: строки «A: …» или JSON {"lines":[…]} (с запасом на мусор вокруг) */
export function parseReply(raw: string, names: Record<string, Who> = {}): Reply | null {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s >= 0 && e > s) {
    let j: unknown = null;
    try {
      j = JSON.parse(raw.slice(s, e + 1));
    } catch {
      /* не JSON — попробуем строками */
    }
    const o = j as { lines?: unknown; memoryA?: unknown; memoryB?: unknown } | null;
    if (o && Array.isArray(o.lines)) {
      const lines = o.lines
        .map((l) => l as { who?: unknown; text?: unknown })
        .filter((l) => (l.who === 'A' || l.who === 'B' || l.who === 'X') && typeof l.text === 'string' && clean(l.text).length > 0)
        .slice(0, 4)
        .map((l) => ({ who: l.who as Who, text: clean(l.text as string) }));
      if (lines.length < 1) return null;
      const mem = (m: unknown) => (typeof m === 'string' && m.trim() ? m.trim().slice(0, 160) : undefined);
      return { lines, memoryA: mem(o.memoryA), memoryB: mem(o.memoryB) };
    }
  }
  return parseLines(raw, names, true);
}
