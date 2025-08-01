const fs = require('fs');
const path = require('path');

function listPhpFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listPhpFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.php')) {
      files.push(full);
    }
  }
  return files;
}

function extractRoutes(content) {
  const routes = [];
  let m;
  const directIf = /\$_SERVER\['REQUEST_URI'\]\s*==\s*['"]([^'"]+)['"]/g;
  while ((m = directIf.exec(content)) !== null) {
    routes.push(m[1]);
  }
  const switchRe = /switch\s*\(\s*\$_(?:GET|POST)\['[^']+'\]\s*\)([\s\S]*?)}/g;
  while ((m = switchRe.exec(content)) !== null) {
    const body = m[1];
    const caseRe = /case\s*['"]([^'"]+)['"]/g;
    let c;
    while ((c = caseRe.exec(body)) !== null) {
      routes.push(c[1]);
    }
  }
  return Array.from(new Set(routes));
}

function extractQueries(content) {
  const queries = [];
  let m;
  const queryRe = /(mysql_query|mysqli_query|->query|->prepare)\s*\(\s*(['"`])([\s\S]*?)\2/g;
  while ((m = queryRe.exec(content)) !== null) {
    queries.push(m[3].trim());
  }
  return queries;
}

function parseFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  return {
    file,
    routes: extractRoutes(content),
    sqlQueries: extractQueries(content)
  };
}

function parseProject(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Directory not found: ${dir}`);
  }
  const files = listPhpFiles(dir);
  return { files: files.map(parseFile) };
}

if (require.main === module) {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: node parse_php.js <path-to-php-project>');
    process.exit(1);
  }
  const result = parseProject(targetDir);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { parseProject };
