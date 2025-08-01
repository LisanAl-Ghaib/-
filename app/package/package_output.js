const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { generate } = require('../generate/generate_express');

function packageProject(phpDir, outDir = 'generated', archiveName = 'converted.zip') {
  const info = generate(phpDir, outDir);

  const readme = `# Converted Project\n\nRun the following commands to start the server:\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`;
  fs.writeFileSync(path.join(outDir, 'README.md'), readme);

  const report = {
    routes: info.routes,
    hasQueries: info.hasQueries
  };
  fs.writeFileSync(path.join(outDir, 'migration_report.json'), JSON.stringify(report, null, 2));

  const zipPath = path.resolve(archiveName);
  spawnSync('zip', ['-r', zipPath, '.'], { cwd: outDir, stdio: 'inherit' });

  return { archive: zipPath, report: path.join(outDir, 'migration_report.json') };
}

if (require.main === module) {
  const [phpDir, outDir, archiveName] = process.argv.slice(2);
  if (!phpDir) {
    console.error('Usage: node package_output.js <php-project-dir> [output-dir] [archive-name]');
    process.exit(1);
  }
  const result = packageProject(phpDir, outDir || 'generated', archiveName || 'converted.zip');
  console.log('Archive created at', result.archive);
}

module.exports = { packageProject };
