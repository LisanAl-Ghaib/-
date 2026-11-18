/** Мелкие помощники пиксельной отрисовки (только целые координаты). */
export function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Пиксельный круг (заливка), без сглаживания */
export function disc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  g.fillStyle = color;
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
    g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
  }
}

const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

/** Крошечные пиксельные цифры 3×5 */
export function digits(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  g.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of text) {
    const d = DIGITS[ch];
    if (d) d.forEach((row, ry) => [...row].forEach((b, rx) => b === '1' && g.fillRect(cx + rx, Math.round(y) + ry, 1, 1)));
    cx += 4;
  }
}
