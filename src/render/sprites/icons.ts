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
  yawn: { rows: ['.aaaaa.', 'a.....a', 'a.b.b.a', 'a.....a', 'a.ccc.a', 'a.ccc.a', '.aaaaa.'], colors: { a: '#f2d16b', b: '#3a2a1a', c: '#7a2a2a' } },
  gloom: { rows: ['..aaa..', '.aaaaa.', 'aaaaaaa', '.......', '.b.b.b.', 'b.b.b..', '.......'], colors: { a: '#8a92a0', b: '#7fb0e0' } },
  hungry: { rows: ['..aaa..', '.a...a.', 'a..b..a', 'a.bbb.a', 'a..b..a', '.a...a.', '..aaa..'], colors: { a: '#e8d8b0', b: '#c8402e' } },
  umbrella: { rows: ['..aaa..', '.aaaaa.', 'aaaaaaa', '...b...', '...b...', '...b...', '..bb...'], colors: { a: '#3a6fb0', b: '#444' } },
  // ── значки занятий (в белой плашке)
  cup: { rows: ['.c.c...', '..c.c..', '.......', 'aaaaa..', 'abbbaaa', 'abbba.a', '.aaa.aa'], colors: { a: '#8a5a3a', b: '#c8a070', c: '#b8b8b8' } },
  cig: { rows: ['....c..', '...c...', '....c..', '.......', 'aaaaab.', 'aaaaab.', '.......'], colors: { a: '#e8e4dc', b: '#e8602a', c: '#a0a0a0' } },
  chalk: { rows: ['aaaaaaa', 'abbbbba', 'abcbcba', 'abbcbba', 'abbbbba', 'aaaaaaa', '.d.....'], colors: { a: '#6a4630', b: '#2f3a33', c: '#e8ece4', d: '#f4f4f0' } },
  notebook: { rows: ['.aaaaa.', '.abbba.', '.acbca.', '.abbba.', '.acbca.', '.aaaaa.', '.....d.'], colors: { a: '#3a5a7a', b: '#f2efe4', c: '#a8c0d8', d: '#e0b040' } },
  chess: { rows: ['...a...', '..aaa..', '...a...', '..aaa..', '..aaa..', '.aaaaa.', '.aaaaa.'], colors: { a: '#2a2a30' } },
  bed: { rows: ['.......', 'a......', 'abb....', 'accccca', 'aaaaaaa', 'a.....a', '.......'], colors: { a: '#7a5a3a', b: '#f4f2ec', c: '#5a8ac8' } },
  trash: { rows: ['..aaa..', 'aaaaaaa', '.bbbbb.', '.b.b.b.', '.b.b.b.', '.b.b.b.', '.bbbbb.'], colors: { a: '#4a4a52', b: '#6a6a72' } },
  moon: { rows: ['..aaa..', '.aa....', 'aa.....', 'aa...b.', 'aa.....', '.aa....', '..aaa..'], colors: { a: '#e8d070', b: '#e8e4dc' } },
  fish: { rows: ['.......', '..aaa..', 'babbaa.', 'bbaaaaa', 'babbaa.', '..aaa..', '.......'], colors: { a: '#e8862e', b: '#c86a1e' } },
  laptop: { rows: ['.aaaaa.', '.abbba.', '.abcba.', '.abbba.', '.aaaaa.', 'ddddddd', '.......'], colors: { a: '#3a3e48', b: '#7fc4f0', c: '#e8f6ff', d: '#9aa0a8' } },
  film: { rows: ['a.a.a.a', 'aaaaaaa', 'abbbbba', 'abbbbba', 'aaaaaaa', 'a.a.a.a', '.......'], colors: { a: '#2a2a30', b: '#7fc4f0' } },
  shoe: { rows: ['.......', '..aa...', '..aa...', '..aaaa.', 'aaaaaaa', 'bbbbbbb', '.......'], colors: { a: '#3a6ab0', b: '#e8e4dc' } },
  broom: { rows: ['.....a.', '....a..', '...a...', '..a....', '.bbb...', 'bbbb...', 'b.b.b..'], colors: { a: '#8a5a3a', b: '#d8b860' } },
  hand: { rows: ['.a.a.a.', '.a.a.a.', '.aaaaa.', 'aaaaaa.', '.aaaaa.', '..aaa..', '.......'], colors: { a: '#e8c0a0' } },
  hoop: { rows: ['..aaa..', '.abbba.', 'abcbbba', 'abbcbba', 'abbbcba', '.abbba.', '..aaa..'], colors: { a: '#b8742e', b: '#f4efe0', c: '#c8402e' } },
  eye: { rows: ['.......', '..aaa..', '.abbba.', 'abbcbba', '.abbba.', '..aaa..', '.......'], colors: { a: '#3a3a42', b: '#f4f2ec', c: '#3a6ab0' } },
  guitar: { rows: ['......a', '.....a.', '....a..', '.bba...', 'bbbb...', 'bcbb...', '.bb....'], colors: { a: '#3a2a1a', b: '#c84a3a', c: '#2a1a10' } },
  shock: { rows: ['...a...', '...a...', '...a...', '...a...', '.......', '...a...', '.......'], colors: { a: '#ff5a3c' } },
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

/** Значок занятия в белой плашке с хвостиком (как подпись-картинка над человеком) */
export function generatePlate(name: string, mood = false): HTMLCanvasElement {
  const def = ICONS[name] ?? ICONS.dots;
  const c = makeCanvas(ICON_SIZE + 4, ICON_SIZE + 6);
  const g = ctx2d(c);
  const W = ICON_SIZE + 4;
  const H = ICON_SIZE + 4;
  const bg = mood ? '#e8eef8' : '#fbf8f0';
  const border = mood ? '#7a8aa8' : '#3a3440';
  // плашка со скруглёнными углами
  g.fillStyle = border;
  g.fillRect(1, 0, W - 2, 1);
  g.fillRect(1, H - 1, W - 2, 1);
  g.fillRect(0, 1, 1, H - 2);
  g.fillRect(W - 1, 1, 1, H - 2);
  g.fillStyle = bg;
  g.fillRect(1, 1, W - 2, H - 2);
  // хвостик вниз
  g.fillStyle = border;
  g.fillRect(Math.floor(W / 2) - 1, H, 3, 1);
  g.fillRect(Math.floor(W / 2), H + 1, 1, 1);
  g.fillStyle = bg;
  g.fillRect(Math.floor(W / 2), H - 1, 1, 1);
  def.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      // светлые части значка на светлой плашке — темнее, чтобы читались
      const col = def.colors[ch] ?? '#333';
      g.fillStyle = /^#(e|f|d)[0-9a-f]/i.test(col) && (col === '#f4f1ea' || col === '#e8e4dc' || col === '#f4f2ec' || col === '#e8f6ff' || col === '#e8e8e8' || col === '#d8dde2' || col === '#e8eef2' || col === '#cfe2ff') ? '#8a8a96' : col;
      g.fillRect(x + 2, y + 2, 1, 1);
    });
  });
  return c;
}
