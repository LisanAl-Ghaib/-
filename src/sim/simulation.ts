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
import { updateNeeds } from './needs';
import { ensurePlan } from './schedule';
import { daylight } from './env/sun';
import { createResidentState, type ApartmentState, type ResidentState, type WorldState } from './state';

export type SimEvent =
  | { type: 'action.start'; t: number; residentId: string; actionId: string; label: string }
  | { type: 'cooked'; t: number; residentId: string; baking: boolean; portions: number }
  | { type: 'shopped'; t: number; residentId: string }
  | { type: 'left-for-work'; t: number; residentId: string }
  | { type: 'back-from-work'; t: number; residentId: string }
  | { type: 'resident.moved-in'; t: number; residentId: string }
  | { type: 'resident.moved-out'; t: number; residentId: string }
  | { type: 'day.start'; t: number; dayIndex: number };

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
    this.syncResidents();
  }

  /** Добавляет новых жильцов из данных и убирает тех, кого больше нет. */
  syncResidents(): void {
    const s = this.state;
    for (const def of this.defs.residents) {
      if (!s.residents[def.id]) {
        s.residents[def.id] = createResidentState(this.defs, def.id, () => this.rng.next());
        if (s.time > 0) this.emit({ type: 'resident.moved-in', t: s.time, residentId: def.id });
      }
    }
    for (const id of Object.keys(s.residents)) {
      if (!this.defs.residentById.has(id)) {
        delete s.residents[id];
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
    if (!a) a = this.state.apartments[id] = { groceries: 5, meals: 1 };
    return a;
  }

  /** Продвинуть жильца по текущему маршруту (для действий, которые двигаются на месте) */
  advance(r: ResidentState, dt: number): boolean {
    return advanceMovement(this, r, dt);
  }

  /** Насколько тянет на улицу: 0..1 (погода и свет; погода появится на этапе 4) */
  outdoorAppeal(_def: ResidentDef): number {
    const day = daylight(this.calendar());
    return 0.35 + 0.65 * day;
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
    const free = apt.slots.filter((s) => s.use.includes(use as never) && this.isSlotFree(s.key, rid));
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

  elevatorThreshold(def: ResidentDef, _r: ResidentState): number {
    const age = this.age(def);
    if (age >= 65) return 1;
    if (def.traits.activity === 'active') return 4;
    if (def.traits.activity === 'lazy') return 2;
    return 3;
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
    for (const id of this.residentIds()) {
      const r = s.residents[id];
      const ctx = this.ctx(r);
      ensurePlan(ctx);
      updateNeeds(ctx, DT);
      updateAgent(ctx, DT);
      if (r.bubble && r.bubble.until <= s.time) r.bubble = null;
    }
  }

  /** Прогнать n шагов (для тестов и безголового режима) */
  run(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }
}
