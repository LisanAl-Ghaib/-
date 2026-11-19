import type { Place } from './types';

/** Предмет мебели → место занятия (для выбора базовой сцены) */
const BY_DRAW: Record<string, Place> = {
  bed: 'bed', bed_double: 'bed', crib: 'bed',
  bathtub: 'bath', shower: 'shower', washbasin: 'basin', toilet: 'toilet',
  dining_table: 'table', kitchen_table: 'table', round_table: 'table',
  desk: 'desk', computer_desk: 'desk', gaming_desk: 'desk', laptop_desk: 'desk', concierge_desk: 'desk', sewing_table: 'desk',
  sofa: 'seat', armchair: 'seat', rocking_chair: 'seat', bean_bag: 'seat', chair: 'seat', stool: 'seat',
  recliner: 'recliner',
  stove: 'stove', hotplate: 'stove',
  fridge: 'fridge', fridge_old: 'fridge', mini_fridge: 'fridge',
  window_plants: 'window', plant: 'plant', plant_big: 'plant', aquarium: 'aquarium', cat_bowls: 'bowls',
  piano: 'piano', digital_piano: 'piano', eguitar_amp: 'amp', guitar: 'seat',
  pullup_bar: 'bar', exercise_mat: 'mat', exercise_bike: 'bike', easel: 'easel',
};

/**
 * Где человек занят: по предмету мебели слота, а для общих предметов — по занятию
 * (у кухонной стойки готовят у «плиты», моют посуду у «мойки», умываются у «раковины»).
 */
export function placeOf(draw: string | undefined, actionId: string | undefined, slotPose: string | undefined, outdoors: boolean): Place {
  if (!draw) {
    if (outdoors) return 'outdoor';
    if (actionId === 'smoke_window' || actionId === 'wave_window') return 'window';
    return 'floor';
  }
  if (draw === 'kitchen_counter' || draw === 'sink_small') return actionId === 'cook' ? 'stove' : actionId === 'wash' ? 'basin' : 'sink';
  if (draw === 'cot') return slotPose === 'lie' ? 'bed' : 'seat';
  return BY_DRAW[draw] ?? (slotPose === 'sit' ? 'seat' : 'floor');
}
