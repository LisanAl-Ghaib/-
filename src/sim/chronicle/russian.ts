import type { ResidentDef } from '../../data/schemas';

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'pre';

/** Падеж короткого имени. Берём из JSON; если нет — простые правила склонения. */
export function nameCase(def: ResidentDef, c: Case): string {
  const base = def.name.short ?? def.name.first;
  if (c === 'nom') return base;
  const given = def.name.cases[c];
  if (given) return given;
  return base.split(' ').map((w) => declineWord(w, c, def.gender)).join(' ');
}

function declineWord(w: string, c: Exclude<Case, 'nom'>, gender: 'm' | 'f'): string {
  const last = w.slice(-1);
  const stem = w.slice(0, -1);
  const soft = 'гкхжчшщ'.includes(stem.slice(-1));
  if (last === 'а') {
    return { gen: stem + (soft ? 'и' : 'ы'), dat: stem + 'е', acc: stem + 'у', ins: stem + (soft || 'жчшщц'.includes(stem.slice(-1)) ? 'ой' : 'ой'), pre: stem + 'е' }[c];
  }
  if (last === 'я') {
    if (stem.endsWith('и')) return { gen: stem + 'и', dat: stem + 'и', acc: stem + 'ю', ins: stem + 'ей', pre: stem + 'и' }[c];
    return { gen: stem + 'и', dat: stem + 'е', acc: stem + 'ю', ins: stem + 'ей', pre: stem + 'е' }[c];
  }
  if (gender === 'f') return w; // несклоняемые женские (Ирэн, Кармен)
  if (last === 'й') return { gen: stem + 'я', dat: stem + 'ю', acc: stem + 'я', ins: stem + 'ем', pre: stem + 'е' }[c];
  if (last === 'ь') return { gen: stem + 'я', dat: stem + 'ю', acc: stem + 'я', ins: stem + 'ем', pre: stem + 'е' }[c];
  if ('бвгджзклмнпрстфхцчшщ'.includes(last)) return { gen: w + 'а', dat: w + 'у', acc: w + 'а', ins: w + ('жчшщц'.includes(last) ? 'ем' : 'ом'), pre: w + 'е' }[c];
  return w;
}

/** Глагол по роду */
export function v(def: ResidentDef, m: string, f: string): string {
  return def.gender === 'f' ? f : m;
}

const ORD_GEN = ['', 'первого', 'второго', 'третьего', 'четвёртого', 'пятого', 'шестого', 'седьмого', 'восьмого', 'девятого', 'десятого', 'одиннадцатого', 'двенадцатого'];
const ORD_PRE = ['', 'первом', 'втором', 'третьем', 'четвёртом', 'пятом', 'шестом', 'седьмом', 'восьмом', 'девятом', 'десятом', 'одиннадцатом', 'двенадцатом'];

/** «с третьего этажа», «со второго этажа» */
export function fromFloor(level: number): string {
  const w = ORD_GEN[level] ?? `${level}-го`;
  return `${w.startsWith('в') ? 'со' : 'с'} ${w} этажа`;
}

/** «на третьем этаже» */
export function onFloor(level: number): string {
  return `на ${ORD_PRE[level] ?? `${level}-м`} этаже`;
}

export function hhmmOf(minuteOfDay: number): string {
  const m = Math.floor(minuteOfDay) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** «до полуночи», «часа два», «минут двадцать» */
export function durationPhrase(startMin: number, endMin: number, minutes: number): string {
  const endDay = ((endMin % 1440) + 1440) % 1440;
  if (endDay >= 1425 || endDay <= 15) {
    if (minutes >= 40) return 'до полуночи';
  }
  if (endDay > 15 && endDay < 240 && minutes >= 60) return 'до глубокой ночи';
  if (minutes < 12) return 'буквально пару минут';
  if (minutes < 25) return 'минут пятнадцать';
  if (minutes < 40) return 'около получаса';
  if (minutes < 75) return 'около часа';
  if (minutes < 105) return 'полтора часа';
  if (startMin >= 17 * 60 && endDay >= 21 * 60 + 30) return `весь вечер, до ${hhmmOf(endDay)}`;
  if (minutes < 150) return 'часа два';
  return `до ${hhmmOf(endDay)}`;
}

/** Список имён: «Ольга, Марк и Вера Павловна» */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «35 лет», «41 год», «72 года» */
export function years(n: number): string {
  return `${n} ${plural(n, 'год', 'года', 'лет')}`;
}

/** Фамилия во множественном числе: «Ковалёвы» */
export function familyName(last: string): string {
  if (/(ов|ев|ёв|ин|ын)$/.test(last)) return `${last}ы`;
  if (/(ова|ева|ёва|ина|ына)$/.test(last)) return `${last.slice(0, -1)}ы`;
  if (/ий$/.test(last)) return `${last.slice(0, -2)}ие`;
  if (/ая$/.test(last)) return `${last.slice(0, -2)}ие`;
  return `семья ${last}`;
}
