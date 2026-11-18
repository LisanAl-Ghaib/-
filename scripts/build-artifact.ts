/**
 * npm run build:artifact — собирает игру в один самодостаточный HTML
 * (dist-artifact/dom.html): весь JS и CSS внутри, данные из data/ вшиты в бандл.
 * Такой файл можно опубликовать как страницу и открыть с телефона.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';

const out = 'dist-artifact';
await build({
  logLevel: 'warn',
  define: { 'import.meta.env.VITE_SINGLE_FILE': '"1"' },
  build: {
    outDir: join(out, 'tmp'),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: { polyfill: false },
  },
});

const assets = join(out, 'tmp', 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[^>]*src="\/src\/main\.ts"[^>]*><\/script>/, '');

const page = `<title>Дом</title>
<style>
${css}
</style>
${body.trim()}
<script type="module">
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'dom.html'), page);
console.log(`✅ ${join(out, 'dom.html')} — ${(page.length / 1024).toFixed(0)} КБ`);
