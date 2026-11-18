import type { ActionDef } from '../types';
import { cook, eat, shopping, snack } from './food';
import { makeBed, takeOutTrash, unpack, washDishes } from './home';
import { chores, computer, crafts, fitness, gaming, idle, lookOutside, music, phone, plants, read, tea, watchTv } from './leisure';
import { bench, goOut, jog, smoke, snowman, walkYard } from './outside';
import { nap, sleep, wash } from './rest';
import { chat, guest, host, visit } from './social';
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
  // домашние дела, которые видно со стороны
  washDishes, makeBed, unpack, takeOutTrash,
  // работа
  goToWork, workFromHome,
  // досуг дома
  watchTv, read, tea, music, gaming, computer, crafts, plants, fitness, phone, lookOutside, chores, idle,
  // на улице
  walkYard, bench, smoke, jog, goOut, snowman,
  // общение
  visit, host, guest, chat,
];
