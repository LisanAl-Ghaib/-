const { generate } = require('./generate_express');
const { spawn } = require('child_process');
const http = require('http');

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function request(port, path) {
  return new Promise(resolve => {
    const req = http.get({ host: 'localhost', port, path }, res => {
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(null));
  });
}

async function test(projectDir, outputDir = 'generated', port = 3000) {
  const info = generate(projectDir, outputDir);
  const child = spawn('node', ['app.js'], {
    cwd: outputDir,
    env: { ...process.env, PORT: port }
  });

  await wait(1000);

  const results = [];
  for (const r of info.routes) {
    const status = await request(port, r);
    results.push({ route: r, status });
  }

  child.kill();
  return results;
}

if (require.main === module) {
  const [projectDir, outDir] = process.argv.slice(2);
  if (!projectDir) {
    console.error('Usage: node test_generated.js <php-project-dir> [output-dir]');
    process.exit(1);
  }
  test(projectDir, outDir || 'generated').then(results => {
    console.log('Test results:');
    for (const r of results) {
      console.log(`${r.route}: ${r.status}`);
    }
  });
}

module.exports = { test };
