import { ctx2d, makeCanvas } from './registry';

/**
 * Значки над головой (7×7). Символы: '.' — прозрачно, остальное — по палитре значка.
 */
interface IconDef {
  rows: string[];
  colors: Record<string, string>;
}

const ICONS: Record<string, IconDef> = {
  zzz: { rows: ['.aaaa..', '...a...', '..a....', '.aaaa..', '....bbb', '.....b.', '....bbb'], colors: { a: '#cfe2ff', b: '#9fb9e8' } },
  food: { rows: ['.a.a.b.', '.a.a.b.', '.aaa.b.', '..a..b.', '..a.bb.', '..a..b.', '..a..b.'], colors: { a: '#d8dde2', b: '#d8dde2' } },
  cook: { rows: ['..a.a..', '.a.a...', '..a.a..', 'bbbbbbb', 'bcccccb', '.bcccb.', '..bbb..'], colors: { a: '#e8eef2', b: '#4b4f55', c: '#e0703a' } },
  book: { rows: ['.......', 'aaa.ccc', 'abbacbc', 'abbacbc', 'abbacbc', 'aaaaccc', '.......'], colors: { a: '#7a3b2e', b: '#f2ecd8', c: '#7a3b2e' } },
  tv: { rows: ['.a...a.', '..a.a..', 'bbbbbbb', 'bcccccb', 'bcccccb', 'bbbbbbb', '.b...b.'], colors: { a: '#999', b: '#333a44', c: '#7fc4f0' } },
  music: { rows: ['...aaaa', '...a..a', '...a..a', '...a..a', '.aaa.aa', 'aaaa.aa', '.aa....'], colors: { a: '#f2d16b' } },
  heart: { rows: ['.aa.aa.', 'abaaaaa', 'aaaaaaa', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...'], colors: { a: '#e8506a', b: '#ffb3c0' } },
  talk: { rows: ['aaaaaaa', 'abbbbba', 'ab.b.ba', 'abbbbba', 'aaaaaaa', '.aa....', 'a......'], colors: { a: '#f4f1ea', b: '#f4f1ea' } },
  anger: { rows: ['a..a..a', '.a.a.a.', '..aaa..', 'aaa.aaa', '..aaa..', '.a.a.a.', 'a..a..a'], colors: { a: '#ff5a3c' } },
  work: { rows: ['..aaa..', '.a...a.', 'bbbbbbb', 'bbbcbbb', 'bbbbbbb', 'bbbbbbb', '.......'], colors: { a: '#6b4a2a', b: '#8a5d34', c: '#e8c547' } },
  leaf: { rows: ['....aaa', '..aaaab', '.aaabaa', '.aabaaa', '.abaaa.', 'b.aa...', '.......'], colors: { a: '#7cc46a', b: '#3d7a33' } },
  phone: { rows: ['.aaaaa.', '.abbba.', '.abbba.', '.abbba.', '.abbba.', '.aacaa.', '.aaaaa.'], colors: { a: '#30343a', b: '#8fd0f5', c: '#aaa' } },
  game: { rows: ['.......', '.aaaaa.', 'aabaaca', 'abbbaaa', 'aabaaca', '.aa.aa.', '.......'], colors: { a: '#5a5f6b', b: '#e8e8e8', c: '#e85050' } },
  sick: { rows: ['..aaa..', '.abbba.', '.abcba.', '.abbba.', '..aaa..', '..a.a..', '.......'], colors: { a: '#7fbf5a', b: '#d9f2c4', c: '#3d7a33' } },
  gift: { rows: ['.a...a.', '..a.a..', 'bbbcbbb', 'bbbcbbb', '.bbcbb.', '.bbcbb.', '.bbcbb.'], colors: { a: '#f2d16b', b: '#e8506a', c: '#f2d16b' } },
  wash: { rows: ['...a...', '..aaa..', '.aaaaa.', '.aabaa.', '.aaaaa.', '..aaa..', '.......'], colors: { a: '#7fc4f0', b: '#e8f6ff' } },
  plant: { rows: ['..a.a..', '.aaaaa.', '..aaa..', '...a...', '.bbbbb.', '..bbb..', '..bbb..'], colors: { a: '#7cc46a', b: '#b8653a' } },
  sport: { rows: ['.......', 'a.....a', 'aabbbaa', 'a.....a', '.......', '.......', '.......'], colors: { a: '#555b66', b: '#9aa' } },
  bag: { rows: ['..aaa..', '.a...a.', 'bbbbbbb', 'bcbcbcb', 'bbbbbbb', 'bbbbbbb', '.......'], colors: { a: '#c9a36a', b: '#e9d3a8', c: '#7cc46a' } },
  dots: { rows: ['.......', '.......', '.......', 'a.a.a..', '.......', '.......', '.......'], colors: { a: '#f4f1ea' } },
  laugh: { rows: ['.aaaaa.', 'aaaaaaa', 'ab.a.ba', 'aaaaaaa', 'accccca', '.accca.', '..aaa..'], colors: { a: '#f2d16b', b: '#3a2a1a', c: '#7a2a2a' } },
  snow: { rows: ['...a...', '.a.a.a.', '..aaa..', 'aaaaaaa', '..aaa..', '.a.a.a.', '...a...'], colors: { a: '#e8f4ff' } },
  umbrella: { rows: ['..aaa..', '.aaaaa.', 'aaaaaaa', '...b...', '...b...', '...b...', '..bb...'], colors: { a: '#3a6fb0', b: '#444' } },
};

export const ICON_SIZE = 7;

export function iconNames(): string[] {
  return Object.keys(ICONS);
}

export function generateIcon(name: string): HTMLCanvasElement {
  const def = ICONS[name] ?? ICONS.dots;
  const c = makeCanvas(ICON_SIZE + 2, ICON_SIZE + 2);
  const g = ctx2d(c);
  // тёмная обводка для читаемости на любом фоне
  const draw = (ox: number, oy: number, outline: boolean) => {
    def.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        g.fillStyle = outline ? 'rgba(20,18,30,0.55)' : def.colors[ch] ?? '#fff';
        g.fillRect(x + ox, y + oy, 1, 1);
      });
    });
  };
  for (const [ox, oy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) draw(ox, oy, true);
  draw(1, 1, false);
  return c;
}
