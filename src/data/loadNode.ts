import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RawData, RawFile } from './defs';

function readDir(dir: string): RawFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), 'utf8');
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`${join(dir, f)}: невалидный JSON — ${(e as Error).message}`);
      }
      return { file: f.replace(/\.json$/, ''), data };
    });
}

/**
 * Читает данные из папки root (по умолчанию data/). Каталог мебели можно взять
 * из другой папки (тесты используют свои жильцов, но общий каталог).
 */
export function loadRawDataNode(root = resolve(process.cwd(), 'data'), catalogRoot = root): RawData {
  return {
    world: JSON.parse(readFileSync(join(root, 'world.json'), 'utf8')),
    catalog: JSON.parse(readFileSync(join(catalogRoot, 'catalog', 'furniture.json'), 'utf8')),
    residents: readDir(join(root, 'residents')),
    apartments: readDir(join(root, 'apartments')),
  };
}
