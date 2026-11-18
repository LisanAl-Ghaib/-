import type { RngState } from '../core/rng';
import { seedState } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import type { Pose } from '../data/schemas';
import { createElevator, type ElevatorState } from '../world/elevator';
import type { Step, Target } from '../world/navigation';

/** Меняй при любом несовместимом изменении формы WorldState. */
export const SAVE_VERSION = 1;

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
  /** когда последний раз выполнялось действие (id → время) — для разнообразия */
  recent: Record<string, number>;
  /** значок над головой */
  bubble: { icon: string; until: number } | null;
}

export interface WorldState {
  version: number;
  seed: number | string;
  dataHash: string;
  /** игровые секунды от даты старта */
  time: number;
  rng: RngState;
  residents: Record<string, ResidentState>;
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
      energy: 60 + rngNext() * 30,
      food: 50 + rngNext() * 30,
      social: 50 + rngNext() * 30,
      mood: 55 + rngNext() * 25,
    },
    recent: {},
    bubble: null,
  };
}

export function createWorldState(defs: WorldDefs, seedOverride?: number | string): WorldState {
  const seed = seedOverride ?? defs.config.seed;
  const rngState = seedState(seed);
  const state: WorldState = {
    version: SAVE_VERSION,
    seed,
    dataHash: defs.dataHash,
    time: 0,
    rng: rngState,
    residents: {},
    elevator: createElevator(defs.layout),
    slots: {},
    lastDay: -1,
  };
  return state;
}
