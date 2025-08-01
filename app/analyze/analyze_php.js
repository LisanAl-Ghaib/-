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

function analyze(dir) {
  const result = {
    phpFiles: [],
    hasHtaccess: false,
    mysqlUsage: [],
    entryPoints: [],
    includes: []
  };

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Directory not found: ${dir}`);
  }

  result.phpFiles = listPhpFiles(dir);
  result.hasHtaccess = fs.existsSync(path.join(dir, '.htaccess'));

  for (const file of result.phpFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (/mysql_(connect|query|select_db)/i.test(content) || /new\s+mysqli\b/i.test(content) || /PDO\(\s*['\"]mysql:/i.test(content)) {
      result.mysqlUsage.push(file);
    }
    if (/require(_once)?\s*\(|include(_once)?\s*\(/i.test(content)) {
      result.includes.push(file);
    }
    if (/\bindex\.php\b/i.test(file)) {
      result.entryPoints.push(file);
    }
  }

  return result;
}

if (require.main === module) {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: node analyze_php.js <path-to-php-project>');
    process.exit(1);
  }
  const analysis = analyze(targetDir);
  console.log(JSON.stringify(analysis, null, 2));
}

module.exports = { analyze };
