/** Глобальные константы мира. */
export const TILE = 16;
/** высота этажа (от пола до пола) */
export const FLOOR_H = 64;
/** толщина перекрытия */
export const SLAB = 4;
/** ширина лестнично-лифтового ядра */
export const CORE_W = 64;
/** толщина внешних стен дома */
export const OUTER_WALL = 4;
/** толщина межкомнатной стены */
export const INNER_WALL = 2;
/** узкий проулок слева от дома */
export const ALLEY_W = 48;
/** двор справа от дома */
export const YARD_W = 256;
/** небо над крышей (с запасом: на любом экране видно небо, а не край мира) */
export const SKY_MARGIN = 380;
export const ROOF_H = 16;
/** земля под уровнем улицы: разрез грунта, трубы, корни, подвал */
export const GROUND_H = 200;

/** шаг симуляции, игровых секунд */
export const DT = 10;
/** игровых секунд за реальную секунду на скорости ×1 (1 мин реальная = 1 час игровой) */
export const BASE_TIME_SCALE = 60;

/** скорость ходьбы, мировых пикселей за игровую минуту */
export const WALK_SPEED = 30;
/** скорость лифта, пикселей за игровую минуту */
export const ELEVATOR_SPEED = 90;
export const ELEVATOR_DOOR_TIME = 20; // секунд
