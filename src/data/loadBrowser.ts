import type { RawData, RawFile } from './defs';
import world from '../../data/world.json';
import catalog from '../../data/catalog/furniture.json';

const residentMods = import.meta.glob('../../data/residents/*.json', { eager: true, import: 'default' });
const apartmentMods = import.meta.glob('../../data/apartments/*.json', { eager: true, import: 'default' });

function toFiles(mods: Record<string, unknown>): RawFile[] {
  return Object.entries(mods)
    .map(([path, data]) => ({ file: path.split('/').pop()!.replace(/\.json$/, ''), data }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function loadRawData(): RawData {
  return { world, catalog, residents: toFiles(residentMods), apartments: toFiles(apartmentMods) };
}
