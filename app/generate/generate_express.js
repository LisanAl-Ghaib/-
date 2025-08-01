const fs = require('fs');
const path = require('path');
const { parseProject } = require('../parse/parse_php');

function sanitizeRoute(route) {
  return route
    .replace(/^[\/]+/, '')
    .replace(/[\/]/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '') || 'root';
}

function generate(projectDir, outputDir = 'generated') {
  const parseResult = parseProject(projectDir);
  const routesSet = new Set();
  let hasQueries = false;

  for (const file of parseResult.files) {
    for (const r of file.routes) routesSet.add(r.startsWith('/') ? r : '/' + r);
    if (file.sqlQueries && file.sqlQueries.length > 0) {
      hasQueries = true;
    }
  }

  const routes = Array.from(routesSet);
  if (routes.length === 0) routes.push('/');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'routes'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'controllers'), { recursive: true });

  const pkg = {
    name: 'converted-app',
    version: '0.1.0',
    main: 'app.js',
    scripts: { start: 'node app.js' },
    dependencies: { express: '^4.18.2' }
  };
  if (hasQueries) pkg.dependencies.mysql2 = '^3.9.2';
  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(pkg, null, 2));

  const requires = routes.map(r => {
    const name = sanitizeRoute(r);
    return `const ${name} = require('./routes/${name}');`;
  }).join('\n');

  const uses = routes.map(r => {
    const name = sanitizeRoute(r);
    return `app.use('${r}', ${name});`;
  }).join('\n');

  const appJs = `const express = require('express');
${hasQueries ? "const db = require('./db');" : ''}
const app = express();

${requires}

${uses}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
`;
  fs.writeFileSync(path.join(outputDir, 'app.js'), appJs);

  for (const r of routes) {
    const name = sanitizeRoute(r);
    const routeJs = `const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  // TODO: migrate logic from PHP
  res.send('Placeholder for ${r}');
});

module.exports = router;`;
    fs.writeFileSync(path.join(outputDir, 'routes', `${name}.js`), routeJs);
  }

  if (hasQueries) {
    const dbJs = `const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'user',
  password: 'pass',
  database: 'db'
});

module.exports = pool;`;
    fs.writeFileSync(path.join(outputDir, 'db.js'), dbJs);
  }

  return { routes, hasQueries, outputDir };
}

if (require.main === module) {
  const [projectDir, outDir] = process.argv.slice(2);
  if (!projectDir) {
    console.error('Usage: node generate_express.js <php-project-dir> [output-dir]');
    process.exit(1);
  }
  const info = generate(projectDir, outDir || 'generated');
  console.log('Generated Express project in', info.outputDir);
}

module.exports = { generate };
