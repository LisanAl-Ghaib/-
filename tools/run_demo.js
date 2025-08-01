const path = require('path');
const { spawn } = require('child_process');
const { generate } = require('../app/generate/generate_express');

const projectDir = path.join(__dirname, '../test_data/simple');
const outDir = path.join(__dirname, '../demo_generated');

console.log('Generating demo project...');
const info = generate(projectDir, outDir);
console.log('Routes:', info.routes.join(', '));

console.log('Starting server on http://localhost:3000');
spawn('node', ['app.js'], { cwd: outDir, stdio: 'inherit' });
