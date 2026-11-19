import { DT } from '../config';
import { EventBus } from '../core/eventBus';
import { Rng } from '../core/rng';
import { calendar, type CalendarInfo } from '../core/time';
import type { WorldDefs } from '../data/defs';
import type { ResidentDef } from '../data/schemas';
import { updateElevator } from '../world/elevator';
import type { ApartmentModel, SlotInstance } from '../world/layout';
import { updateAgent } from './ai/brain';
import { ACTIONS } from './ai/actions';
import type { ActionDef, AgentCtx } from './ai/types';
import { advanceMovement } from './movement';
import { STOICS, updateNeeds } from './needs';
import { ensurePlan } from './schedule';
import { daylight } from './env/sun';
import { createWeather, seasonOf, updateWeather, weatherAppeal, type WeatherState } from './env/weather';
import { createResidentState, type ApartmentState, type ChronicleEntry, type ResidentState, type WorldState } from './state';
import { endAction, startAction } from './ai/brain';
import type { ActionPlan } from './ai/types';
import { chronicle, chronicleAt, flushPendingChronicle } from './chronicle/chronicle';
import { familyName } from './chronicle/russian';
import { runExclusive, runIndependent } from './events/engine';
import { detectEncounters } from './social/encounters';
import { updateInteractions } from './social/interactions';
import { adjust, initRelations, inConflict } from './social/relations';
import { warmth } from './social/social';
import { addMoodlet } from './needs';
import { petNotes, syncPets, updatePets } from './pets';
import { scheduleVisits, updateVisitors } from './visitors';
import { updateCircles } from './circle';
import { syncConstruction, syncWorkers, updateWorkers } from './workers';
import { joinCooking, planTogether, updateFarewells } from './couple';
import { updateDressing } from './dressing';

export type SimEvent =
  | { type: 'action.start'; t: number; residentId: string; actionId: string; label: string }
  | { type: 'cooked'; t: number; residentId: string; baking: boolean; portions: number; dish?: string }
  | { type: 'shopped'; t: number; residentId: string }
  | { type: 'left-for-work'; t: number; residentId: string }
  | { type: 'back-from-work'; t: number; residentId: string }
  | { type: 'resident.moved-in'; t: number; residentId: string }
  | { type: 'resident.moved-out'; t: number; residentId: string }
  | { type: 'day.start'; t: number; dayIndex: number }
  | { type: 'chronicle'; entry: ChronicleEntry }
  | { type: 'action.end'; t: number; residentId: string; actionId: string; interrupted: boolean };

export class Simulation {
  readonly defs: WorldDefs;
  state: WorldState;
  readonly rng: Rng;
  readonly bus = new EventBus<SimEvent>();
  readonly actions: readonly ActionDef[] = ACTIONS;
  readonly actionById = new Map<string, ActionDef>(ACTIONS.map((a) => [a.id, a]));
  readonly slotIndex = new Map<string, SlotInstance>();
  private calCache: { t: number; c: CalendarInfo } | null = null;

  constructor(defs: WorldDefs, state: WorldState) {
    this.defs = defs;
    this.state = state;
    // Rng работает прямо с массивом в состоянии → сохраняется вместе с миром
    this.rng = new Rng(state.rng);
    for (const apt of defs.layout.apartments) for (const s of apt.slots) this.slotIndex.set(s.key, s);
    const fresh = state.time === 0 && state.chronicle.length === 0;
    state.weather ??= createWeather(this.calendar(), this.rng, state.time);
    state.yard ??= { snowman: null };
    state.pendingChronicle ??= [];
    state.visitors ??= [];
    state.workers ??= [];
    shiftGeometry(state, defs);
    for (const r of Object.values(state.residents)) {
      r.needs.bladder ??= 70;
      r.dressed ??= false;
    }
    this.syncResidents();
    STOICS.clear();
    for (const d of defs.residents) if (d.traits.tags.some((t) => /стоик|стоиц/i.test(t))) STOICS.add(d.id);
    initRelations(this);
    if (fresh) chronicle(this, 'world.start', [], 3);
    this.bus.on('cooked', (e) => this.onCooked(e.residentId, e.baking, e.dish));
    this.bus.on('action.end', (e) => this.onActionEnd(e.residentId, e.actionId, e.interrupted));
    this.bus.on('action.start', (e) => {
      if (e.actionId === 'cook') joinCooking(this, e.residentId);
    });
    syncPets(this);
    syncConstruction(this);
    syncWorkers(this);
  }

  private onCooked(id: string, baking: boolean, dish?: string): void {
    this.cookExperiment(id);
    if (!baking) return;
    chronicle(this, 'baked', [id], 2, { dish: dish ?? null });
    if (dish) {
      // испёк по традиции — разносит соседям: всем, с кем ладит
      const def = this.defs.residentById.get(id)!;
      const piece = `кусок ${dish === 'шарлотку' ? 'шарлотки' : dish} на тарелке`;
      const seen = new Set<string>();
      for (const d of this.defs.residents) {
        if (d.id === id || d.apartment === def.apartment || seen.has(d.apartment) || inConflict(this, id, d.id) || warmth(this, id, d.id) < 0.05) continue;
        seen.add(d.apartment); // одна тарелка на квартиру
        this.state.residents[id].intents.push({ target: d.id, kind: 'treat', until: this.time + 7 * 3600, gift: piece });
      }
      return;
    }
    const def = this.defs.residentById.get(id)!;
    const friends = this.defs.residents
      .filter((d) => d.id !== id && d.apartment !== def.apartment && !inConflict(this, id, d.id))
      .map((d) => ({ id: d.id, w: warmth(this, id, d.id) }))
      .filter((x) => x.w > 0.3)
      .sort((a, b) => b.w - a.w);
    if (friends.length && this.rng.chance(0.75)) {
      this.state.residents[id].intents.push({ target: friends[0].id, kind: 'treat', until: this.time + 8 * 3600 });
    }
  }

  /** Телефонный разговор с кем-то вне дома — иногда слышно через стену */
  private onActionEnd(id: string, actionId: string, interrupted: boolean): void {
    if ((actionId === 'gaming' || actionId === 'computer') && !interrupted) this.onlineHeard(id, actionId);
    if (actionId !== 'phone' || interrupted) return;
    const def = this.defs.residentById.get(id);
    const friends = def?.contacts.filter((c) => c.phone && !c.callEveryDays) ?? [];
    if (!def || !friends.length || !this.rng.chance(0.3)) return;
    const c = this.rng.pick(friends);
    const topic = c.topics.length ? this.rng.pick(c.topics) : this.rng.pick(['цены на рынке', 'давление и погоду', 'новых соседей', 'вчерашний сериал', 'рецепт засолки', 'общих знакомых', 'внуков']);
    chronicle(this, 'phone-call', [id], 1, { name: c.name ?? null, gender: c.gender, kind: c.kind, topic, family: c.kind !== 'friend' && !!c.name });
  }

  /** Голоса из-за стены: играет по сети, созванивается; ночь за компьютером видна по свету */
  private onlineHeard(id: string, actionId: string): void {
    const def = this.defs.residentById.get(id);
    const r = this.state.residents[id];
    if (!def || !r) return;
    const cal = this.calendar();
    const h = cal.hourOfDay;
    if (actionId === 'gaming' && r.plan?.allNighter && h >= 3 && h < 5.5) {
      const key = `allnight:${id}:${cal.dayIndex}`;
      if (!this.state.flags[key]) {
        this.state.flags[key] = this.time;
        // заметно утром: свет монитора видели из двора, а днём он отсыпается
        chronicleAt(this, this.time + 5 * 3600, 'all-nighter', [id], 1);
      }
      return;
    }
    if (!def.traits.tags.some((t) => /дискорд|онлайн/i.test(t)) || !this.rng.chance(0.12)) return;
    const key = `online:${id}:${cal.dayIndex}`;
    if (this.state.flags[key]) return;
    this.state.flags[key] = this.time;
    chronicle(this, 'online-voice', [id], 1, { game: actionId === 'gaming', late: h >= 23 || h < 5 });
  }

  /** Кулинарные эксперименты: по запаху из квартиры слышно, что готовят что-то необычное */
  private cookExperiment(id: string): void {
    const def = this.defs.residentById.get(id)!;
    if (!def.traits.tags.some((t) => /эксперимент/i.test(t)) || !this.rng.chance(0.35)) return;
    const cal = this.calendar();
    const key = `cookexp:${def.apartment}`;
    if (this.time - (this.state.flags[key] ?? -1e9) < 2 * 86400) return;
    this.state.flags[key] = this.time;
    const helper = Object.values(this.state.residents).find(
      (o) => o.id !== id && o.action?.id === 'together' && o.action.data.kind === 'help_cook' && o.action.data.with === id,
    );
    const dish = this.rng.pick([
      'карри с яблоком', 'суп на кокосовом молоке', 'шакшуку', 'тыквенное ризотто', 'пад-тай', 'гречневую лапшу с кунжутом',
      'запечённую свёклу с козьим сыром', 'пельмени с необычной начинкой', 'том ям', 'сырники с кардамоном',
    ]);
    chronicle(this, 'cook.experiment', helper ? [id, helper.id] : [id], 1, { dish, hour: cal.hour });
  }

  /** Принудительно сменить действие жильца (визит, разговор) */
  forceAction(rid: string, actionId: string, plan: ActionPlan): void {
    const r = this.state.residents[rid];
    const def = this.actionById.get(actionId);
    if (!r || !def) return;
    const ctx = this.ctx(r);
    if (r.action) endAction(ctx, true);
    startAction(ctx, def, plan);
    if (plan.data?.keepY) r.path = [];
  }

  /** Добавляет новых жильцов из данных и убирает тех, кого больше нет. */
  syncResidents(): void {
    const s = this.state;
    for (const def of this.defs.residents) {
      if (!s.residents[def.id]) {
        s.residents[def.id] = createResidentState(this.defs, def.id, () => this.rng.next());
        if (s.time > 0) {
          this.emit({ type: 'resident.moved-in', t: s.time, residentId: def.id });
          initRelations(this);
          const apt = this.defs.layout.aptById.get(def.apartment)!;
          chronicle(this, 'moved-in', [def.id], 3, { apt: apt.number });
        }
      }
    }
    for (const id of Object.keys(s.residents)) {
      if (!this.defs.residentById.has(id)) {
        delete s.residents[id];
        chronicle(this, 'moved-out', [], 3, { name: id, gender: '' });
        for (const [k, v] of Object.entries(s.slots)) if (v === id) delete s.slots[k];
        s.elevator.riders = s.elevator.riders.filter((r) => r !== id);
        this.emit({ type: 'resident.moved-out', t: s.time, residentId: id });
      }
    }
    // мебель могла измениться — действия, привязанные к исчезнувшим слотам, сбрасываем
    for (const r of Object.values(s.residents)) {
      if (r.action?.target.slot && !this.slotIndex.has(r.action.target.slot)) {
        r.action = null;
        r.path = [];
      }
    }
    for (const [k] of Object.entries(s.slots)) if (!this.slotIndex.has(k)) delete s.slots[k];
  }

  emit(e: SimEvent): void {
    this.bus.emit(e);
  }

  get time(): number {
    return this.state.time;
  }

  calendar(): CalendarInfo {
    if (this.calCache?.t !== this.state.time) {
      this.calCache = { t: this.state.time, c: calendar(this.defs.epochMs, this.state.time) };
    }
    return this.calCache.c;
  }

  residentIds(): string[] {
    return Object.keys(this.state.residents).sort();
  }

  home(def: ResidentDef): ApartmentModel {
    return this.defs.layout.aptById.get(def.apartment)!;
  }

  ctx(r: ResidentState): AgentCtx {
    const def = this.defs.residentById.get(r.id)!;
    return { sim: this, r, def, cal: this.calendar(), home: this.home(def), now: this.state.time };
  }

  aptState(id: string): ApartmentState {
    let a = this.state.apartments[id];
    if (!a) a = this.state.apartments[id] = { groceries: 5, meals: 1, dishes: 0, unmade: [], trash: 0, bags: 0 };
    return a;
  }

  /** Продвинуть жильца по текущему маршруту (для действий, которые двигаются на месте) */
  advance(r: ResidentState, dt: number): boolean {
    return advanceMovement(this, r, dt);
  }

  get weather(): WeatherState {
    return this.state.weather!;
  }

  /** Насколько тянет на улицу: 0..1 — свет и погода (в дождь гуляют мало) */
  outdoorAppeal(def: ResidentDef): number {
    const day = daylight(this.calendar());
    return (0.35 + 0.65 * day) * weatherAppeal(this.weather, def.traits.outlook === 'cheerful' || def.traits.activity === 'active');
  }

  /** Погода: обновление, заметные события, влияние на настроение */
  private stepWeather(newHour: boolean): void {
    const w = this.weather;
    const cal = this.calendar();
    const changed = updateWeather(w, cal, this.rng, this.time, DT);
    const flag = (key: string) => {
      const k = `${key}:${cal.dayIndex}`;
      if (this.state.flags[k]) return false;
      this.state.flags[k] = this.time;
      return true;
    };
    if (changed) {
      const season = seasonOf(cal.month);
      if (w.kind === 'snow' && w.firstSnowYear !== (cal.month >= 7 ? cal.year : cal.year - 1) && season !== 'summer') {
        w.firstSnowYear = cal.month >= 7 ? cal.year : cal.year - 1;
        chronicle(this, 'first-snow', [], 3);
      } else if (w.kind === 'rain' && w.intensity > 0.75 && flag('downpour')) chronicle(this, 'downpour', [], 2, { wind: w.wind > 0.5 });
      else if (w.kind === 'fog' && w.intensity > 0.85 && flag('fog')) chronicle(this, 'fog', [], 1);
    }
    if (!newHour) return;
    if (w.temp <= -15 && flag('frost')) chronicle(this, 'frost', [], 2, { temp: Math.round(w.temp) });
    if (w.temp >= 28 && flag('heat')) chronicle(this, 'heat', [], 2, { temp: Math.round(w.temp) });
    // снеговик тает
    const sm = this.state.yard.snowman;
    if (sm && w.temp > 2 && w.snowCover < 0.25) {
      this.state.yard.snowman = null;
      chronicle(this, 'snowman.melt', [sm.by], 1);
    }
    // погода и настроение
    const L = this.defs.layout;
    for (const d of this.defs.residents) {
      const r = this.state.residents[d.id];
      if (!r || r.action?.id === 'sleep') continue;
      const ctx = { r, now: this.time };
      const gloomySky = w.kind === 'rain' || w.kind === 'fog' || (w.kind === 'cloudy' && seasonOf(cal.month) !== 'summer');
      if (d.traits.outlook === 'gloomy' && gloomySky) addMoodlet(ctx, 'weather', 'Тоскливая погода', -5, 2);
      else if (w.kind === 'clear' && cal.hourOfDay > 8 && cal.hourOfDay < 19 && d.traits.outlook !== 'gloomy') addMoodlet(ctx, 'weather', 'Солнечный день', 3, 2);
      else if (w.kind === 'snow' && d.traits.outlook === 'cheerful') addMoodlet(ctx, 'weather', 'Снег идёт', 3, 2);
      const outside = !r.away && r.level === 0 && (r.x > L.buildingX1 || r.x < L.buildingX0);
      if (outside && w.kind === 'rain' && (w.wind > 0.45 || w.intensity > 0.8)) {
        this.state.flags[`wet:${d.id}`] = this.time;
        addMoodlet(ctx, 'wet', d.gender === 'f' ? 'Промокла под дождём' : 'Промок под дождём', -4, 3);
      }
      if (outside && w.temp < -12) addMoodlet(ctx, 'cold', d.gender === 'f' ? 'Замёрзла' : 'Замёрз', -3, 2);
    }
  }

  // ── слоты мебели
  reserveSlot(key: string, rid: string): void {
    this.state.slots[key] = rid;
  }
  releaseSlot(key: string, rid: string): void {
    if (this.state.slots[key] === rid) delete this.state.slots[key];
  }
  isSlotFree(key: string, rid: string): boolean {
    const who = this.state.slots[key];
    return !who || who === rid;
  }
  /** свободный слот нужного типа в квартире (предпочтительно в комнате room) */
  findSlot(apt: ApartmentModel, use: string, rid: string, room?: number): SlotInstance | undefined {
    // чужие вещи («Ванин компьютер») не трогаем, свои — в первую очередь
    const free = apt.slots
      .filter((s) => s.use.includes(use as never) && this.isSlotFree(s.key, rid) && (!s.owner || s.owner === rid))
      .sort((a, b) => Number(b.owner === rid) - Number(a.owner === rid));
    if (room !== undefined) {
      const inRoom = free.find((s) => s.roomIndex === room);
      if (inRoom) return inRoom;
    }
    return free[0];
  }

  // ── параметры движения
  age(def: ResidentDef): number {
    const c = this.calendar();
    const [y, m, d] = def.birthday.split('-').map(Number);
    let age = c.year - y;
    if (c.month < m || (c.month === m && c.day < d)) age--;
    return age;
  }

  walkSpeed(r: ResidentState): number {
    const def = this.defs.residentById.get(r.id)!;
    let k = 1;
    const age = this.age(def);
    if (age >= 70) k *= 0.7;
    else if (age >= 60) k *= 0.85;
    if (def.traits.activity === 'active') k *= 1.1;
    if (def.traits.activity === 'lazy') k *= 0.95;
    return k;
  }

  /** С какой разницы в этажах человек едет на лифте, а не идёт пешком */
  elevatorThreshold(def: ResidentDef, r: ResidentState): number {
    const age = this.age(def);
    const sick = !!(r.sick && r.sick.until > this.time);
    if (age >= 65 || sick) return 1;
    let t = def.traits.activity === 'active' ? 4 : def.traits.activity === 'lazy' ? 2 : 3;
    // тяжёлые сумки, валится с ног, поздно ночью — поедет и на один этаж
    if (r.carrying === 'bags') t -= 2;
    if (r.needs.energy < 25) t -= 1;
    const h = this.calendar().hourOfDay;
    if (h >= 23 || h < 5) t -= 1;
    // кто любит ходить пешком — по лестнице, пока здоров (разве что с полными сумками)
    if (def.traits.tags.some((x) => /ходить пешком|пешком/i.test(x))) t = Math.max(t, r.carrying === 'bags' ? 2 : 4);
    return Math.max(1, t);
  }

  // ── шаг мира
  step(): void {
    const s = this.state;
    s.time += DT;
    const cal = this.calendar();
    if (cal.dayIndex !== s.lastDay) {
      s.lastDay = cal.dayIndex;
      this.emit({ type: 'day.start', t: s.time, dayIndex: cal.dayIndex });
    }
    updateElevator(s.elevator, this.defs.layout, DT);
    const newHour = cal.hour !== s.lastHour;
    this.stepWeather(newHour);
    if (newHour) {
      s.lastHour = cal.hour;
      runIndependent('hourly', { sim: this, now: s.time });
      this.householdHour();
    }
    for (const id of this.residentIds()) {
      const r = s.residents[id];
      const ctx = this.ctx(r);
      if (ensurePlan(ctx)) {
        runIndependent('daily', { sim: this, now: s.time, who: id });
        scheduleVisits(this, id);
        if (r.sick && r.plan) r.plan.workday = false;
      }
      updateNeeds(ctx, DT);
      updateDressing(this, r);
      updateAgent(ctx, DT);
      // пришёл домой с пакетами — поставил в прихожей
      if (r.carrying === 'bags' && !r.away && r.level === ctx.home.level && r.x >= ctx.home.x0 && r.x < ctx.home.x1) {
        r.carrying = null;
        this.aptState(ctx.home.id).bags = 2;
        // первым делом — разобрать сумки (переоценка на следующем шаге)
        if (r.action?.interruptible) r.action.lastEval = -Infinity;
      }
      if (r.bubble && r.bubble.until <= s.time) r.bubble = null;
      if (r.gesture && r.gesture.until <= s.time) r.gesture = null;
    }
    updateInteractions(this, DT);
    updatePets(this, DT);
    updateCircles(this);
    updateVisitors(this, DT);
    updateWorkers(this, DT);
    updateFarewells(this);
    if (s.time % 600 === 0) petNotes(this);
    flushPendingChronicle(this);
    if (s.time % 60 === 0) detectEncounters(this);
    if (s.time % 300 === 0) this.familyDinners();
    if (s.time % 600 === 0) planTogether(this);
  }

  /** Семья дома вместе — раз в час что-нибудь происходит */
  private householdHour(): void {
    const byApt = new Map<string, string[]>();
    for (const d of this.defs.residents) {
      const r = this.state.residents[d.id];
      if (!r || r.away || r.interaction !== null) continue;
      if (r.action?.id === 'sleep' || r.action?.id === 'nap') continue;
      const apt = this.defs.layout.aptById.get(d.apartment)!;
      if (r.level !== apt.level || r.x < apt.x0 || r.x >= apt.x1) continue;
      byApt.set(d.apartment, [...(byApt.get(d.apartment) ?? []), d.id]);
    }
    for (const ids of byApt.values()) {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) runExclusive('household', { sim: this, now: this.time, a: ids[i], b: ids[j], place: 'дома', placeKind: 'home' }, 3);
    }
  }

  /** Двое и больше из семьи едят одновременно — совместный ужин */
  private familyDinners(): void {
    const cal = this.calendar();
    if (cal.hourOfDay < 17) return;
    const byApt = new Map<string, string[]>();
    for (const d of this.defs.residents) {
      const r = this.state.residents[d.id];
      if (r?.action?.id === 'eat' && r.action.phase === 'perform') byApt.set(d.apartment, [...(byApt.get(d.apartment) ?? []), d.id]);
    }
    for (const [apt, ids] of byApt) {
      if (ids.length < 2) continue;
      const key = `fdinner:${apt}:${cal.dayIndex}`;
      if (this.state.flags[key]) continue;
      this.state.flags[key] = this.time;
      const last = this.defs.residentById.get(ids[0])!.name.last;
      for (let i = 0; i < ids.length; i++) {
        addMoodlet({ r: this.state.residents[ids[i]], now: this.time }, 'family-dinner', 'Ужин всей семьёй', 5, 5);
        for (let j = i + 1; j < ids.length; j++) adjust(this, ids[i], ids[j], 1.5, 1);
      }
      chronicle(this, 'family-dinner', ids, 2, { family: last ? familyName(last) : 'Соседи' });
    }
  }

  /** Прогнать n шагов (для тестов и безголового режима) */
  run(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }
}

/**
 * Геометрия мира поменялась (выше небо, глубже земля, вырос этаж) — все вертикальные координаты
 * в сохранении сдвигаются, чтобы люди остались на своих полах, а не висели в воздухе.
 * Старые сохранения без groundY: сдвиг узнаём по стоящему лифту (его пол — пол этажа).
 */
function shiftGeometry(state: WorldState, defs: WorldDefs): void {
  const L = defs.layout;
  let dy = 0;
  if (state.groundY !== undefined) dy = L.groundY - state.groundY;
  else {
    const e = state.elevator;
    if (e && e.target === null && e.level <= L.floors) dy = L.floorY(e.level) - e.y;
    else {
      // лифт был в пути — по тому, кто спокойно стоит у себя на полу
      const r = Object.values(state.residents).find((x) => !x.away && x.pose === 'stand' && x.path.length === 0);
      if (r) dy = L.floorY(r.level) - r.y;
    }
  }
  state.groundY = L.groundY;
  if (!dy) return;
  const shiftPath = (path: { y?: number }[]) => {
    for (const st of path) if (typeof st.y === 'number') st.y += dy;
  };
  for (const r of Object.values(state.residents)) {
    r.y += dy;
    shiftPath(r.path as { y?: number }[]);
  }
  for (const v of state.visitors ?? []) {
    v.y += dy;
    shiftPath(v.path as { y?: number }[]);
  }
  for (const w of state.workers ?? []) {
    w.y += dy;
    shiftPath(w.path as { y?: number }[]);
  }
  state.elevator.y += dy;
}
