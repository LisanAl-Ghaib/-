import type { RngState } from '../core/rng';
import { seedState } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import type { Pose } from '../data/schemas';
import { createElevator, type ElevatorState } from '../world/elevator';
import type { Step, Target } from '../world/navigation';

/** Меняй при любом несовместимом изменении формы WorldState. */
export const SAVE_VERSION = 2;

export interface Needs {
  /** бодрость: 0 — валится с ног */
  energy: number;
  /** сытость: 0 — очень голоден */
  food: number;
  /** общение: 0 — одиноко */
  social: number;
  /** настроение */
  mood: number;
}

export interface Moodlet {
  key: string;
  label: string;
  /** сдвиг «целевого» настроения, пока действует */
  value: number;
  until: number;
}

export interface ActiveAction {
  id: string;
  label: string;
  phase: 'travel' | 'perform';
  target: Target;
  startedAt: number;
  performStart: number;
  endsAt: number;
  interruptible: boolean;
  lastEval: number;
  data: Record<string, string | number | boolean | null>;
}

/** Распорядок на «логические сутки» (с 04:00 до 04:00) */
export interface DailyPlan {
  day: number;
  wakeAt: number;
  bedAt: number;
  workday: boolean;
  leaveAt: number | null;
  workStartAt: number | null;
  workEndAt: number | null;
  /** когда хочется есть: абсолютное время */
  breakfastAt: number;
  lunchAt: number;
  dinnerAt: number;
}

export interface ResidentState {
  id: string;
  x: number;
  y: number;
  level: number;
  away: boolean;
  facing: 1 | -1;
  /** смотрит на зрителя (сидит на диване, стоит у окна) */
  front: boolean;
  pose: Pose;
  /** пройденное расстояние — для анимации шагов */
  walkDist: number;
  path: Step[];
  action: ActiveAction | null;
  needs: Needs;
  moodlets: Moodlet[];
  plan: DailyPlan | null;
  /** что уже было сегодня (по логическим суткам) */
  today: { day: number; breakfast: boolean; lunch: boolean; dinner: boolean; worked: number; washed: boolean };
  /** когда последний раз выполнялось действие (id → время) — для разнообразия */
  recent: Record<string, number>;
  /** значок над головой */
  bubble: { icon: string; until: number } | null;
  /** болезнь (этап 3) */
  sick: { since: number; until: number } | null;
  /** когда проснулся последний раз */
  wokeAt: number;
  /** как ушёл «за кадр» (автобусом — вернётся с остановки) */
  via: 'bus' | 'walk';
}

export interface ApartmentState {
  /** продукты (порции «сырья») */
  groceries: number;
  /** готовая еда (порции) */
  meals: number;
}

export interface WorldState {
  version: number;
  seed: number | string;
  dataHash: string;
  /** игровые секунды от даты старта */
  time: number;
  rng: RngState;
  residents: Record<string, ResidentState>;
  apartments: Record<string, ApartmentState>;
  elevator: ElevatorState;
  /** занятые слоты мебели: ключ слота → id жильца */
  slots: Record<string, string>;
  lastDay: number;
}

export function createResidentState(defs: WorldDefs, id: string, rngNext: () => number): ResidentState {
  const def = defs.residentById.get(id)!;
  const apt = defs.layout.aptById.get(def.apartment)!;
  // стартуем в своей квартире, в случайной комнате
  const room = apt.rooms[Math.floor(rngNext() * apt.rooms.length)];
  const x = Math.round(room.x0 + 6 + rngNext() * (room.x1 - room.x0 - 12));
  return {
    id,
    x,
    y: defs.layout.floorY(apt.level),
    level: apt.level,
    away: false,
    facing: rngNext() < 0.5 ? 1 : -1,
    front: false,
    pose: 'stand',
    walkDist: 0,
    path: [],
    action: null,
    needs: {
      energy: 75 + rngNext() * 20,
      food: 55 + rngNext() * 25,
      social: 50 + rngNext() * 30,
      mood: 55 + rngNext() * 25,
    },
    moodlets: [],
    plan: null,
    today: { day: -1, breakfast: false, lunch: false, dinner: false, worked: 0, washed: false },
    recent: {},
    bubble: null,
    sick: null,
    wokeAt: -1e9,
    via: 'walk',
  };
}

export function createWorldState(defs: WorldDefs, seedOverride?: number | string): WorldState {
  const seed = seedOverride ?? defs.config.seed;
  return {
    version: SAVE_VERSION,
    seed,
    dataHash: defs.dataHash,
    time: 0,
    rng: seedState(seed),
    residents: {},
    apartments: {},
    elevator: createElevator(defs.layout),
    slots: {},
    lastDay: -1,
  };
}
