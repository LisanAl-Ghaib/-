#!/usr/bin/env node
const path = require('path');
const { packageProject } = require('./package/package_output');

const cmd = process.argv[2];

switch (cmd) {
  case 'convert': {
    const projectDir = process.argv[3];
    if (!projectDir) {
      console.error('Usage: node app/cli.js convert <php-project-dir>');
      process.exit(1);
    }
    const outDir = path.resolve('generated');
    const archive = path.resolve('converted.zip');
    const result = packageProject(projectDir, outDir, archive);
    console.log('Conversion complete. Archive at', result.archive);
    break;
  }
  case 'serve': {
    require('./server/upload_service');
    break;
  }
  default:
    console.log('Usage: node app/cli.js <convert|serve> [projectDir]');
}
