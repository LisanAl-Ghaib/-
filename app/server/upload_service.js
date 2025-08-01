const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { packageProject } = require('../package/package_output');

const app = express();
const upload = multer({ dest: path.join(os.tmpdir(), 'uploads') });

app.use(express.json());

// simple health check / info endpoint
app.get('/', (req, res) => {
  res.send('Upload service running. Use /upload or /convert.');
});

// POST /upload - accepts a zip archive
app.post('/upload', upload.single('archive'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'archive file required' });
  }
  const tempPath = req.file.path;
  return res.json({ saved: tempPath });
});

// POST /clone - accepts JSON { repoUrl: "..." }
app.post('/clone', async (req, res) => {
  const { repoUrl } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl required' });
  }
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  exec(`git clone --depth 1 ${repoUrl} ${target}`, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: stderr.toString() });
    }
    return res.json({ cloned: target });
  });
});

// POST /convert - accepts JSON { projectDir: "..." }
app.post('/convert', (req, res) => {
  const { projectDir } = req.body;
  if (!projectDir || !fs.existsSync(projectDir)) {
    return res.status(400).json({ error: 'valid projectDir required' });
  }
  try {
    const tempOut = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-'));
    const archivePath = path.join(tempOut, 'converted.zip');
    const result = packageProject(projectDir, path.join(tempOut, 'generated'), archivePath);
    return res.json({ archive: result.archive });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'conversion failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Upload service listening on port ${PORT}`);
});
