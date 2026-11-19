import type { ActionDef } from '../types';
import { cook, eat, shopping, snack } from './food';
import { makeBed, takeOutTrash, unpack, washDishes } from './home';
import { board, chess, chores, computer, crafts, fitness, gaming, idle, lookOutside, music, phone, plants, read, tea, watchTv } from './leisure';
import { circleAction } from '../../circle';
import { balcony } from './balcony';
import { bench, goOut, jog, smoke, snowman, walkYard } from './outside';
import { nap, sleep, toilet, wash } from './rest';
import { chat, guest, host, visit } from './social';
import { familyVisit, feedFish, feedPets, nightmare, nightWatch, smokeWindow } from './personal';
import { goToWork, sideWork, workFromHome } from './work';
import { together, waveWindow } from '../../couple';

/**
 * Реестр действий. Чтобы добавить действие — создай ActionDef и допиши сюда.
 * Порядок не важен: выбор делается по оценке полезности (utility AI).
 */
export const ACTIONS: readonly ActionDef[] = [
  // отдых
  sleep, nap, wash, toilet,
  // еда
  eat, cook, snack, shopping,
  // домашние дела, которые видно со стороны
  washDishes, makeBed, unpack, takeOutTrash,
  // работа
  goToWork, workFromHome, sideWork,
  // досуг дома
  watchTv, read, tea, music, gaming, computer, crafts, plants, fitness, phone, lookOutside, chores, chess, board, idle,
  // кружок у себя дома (дети приходят в гости)
  circleAction,
  // балкон
  balcony,
  // на улице
  walkYard, bench, smoke, jog, goOut, snowman,
  // общение
  visit, host, guest, chat,
  // личное: питомцы, родные, бессонница
  feedPets, familyVisit, nightWatch, nightmare, smokeWindow, feedFish,
  // вдвоём (пара)
  together, waveWindow,
];
