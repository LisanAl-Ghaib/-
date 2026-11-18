import type { ActionDef } from '../types';
import { cook, eat, shopping, snack } from './food';
import { chores, computer, crafts, fitness, gaming, idle, lookOutside, music, phone, plants, read, watchTv } from './leisure';
import { bench, goOut, jog, smoke, walkYard } from './outside';
import { nap, sleep, wash } from './rest';
import { goToWork, workFromHome } from './work';

/**
 * Реестр действий. Чтобы добавить действие — создай ActionDef и допиши сюда.
 * Порядок не важен: выбор делается по оценке полезности (utility AI).
 */
export const ACTIONS: readonly ActionDef[] = [
  // отдых
  sleep, nap, wash,
  // еда
  eat, cook, snack, shopping,
  // работа
  goToWork, workFromHome,
  // досуг дома
  watchTv, read, music, gaming, computer, crafts, plants, fitness, phone, lookOutside, chores, idle,
  // на улице
  walkYard, bench, smoke, jog, goOut,
];
