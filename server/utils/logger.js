const fs = require('fs');
const path = require('path');
const config = require('../config');

const MAX_BYTES = 512 * 1024;
const MAX_FILES = 5;

function ensureLogsDir() {
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }
}

function rotateIfNeeded(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    if (fs.statSync(filePath).size < MAX_BYTES) return;
    for (let i = MAX_FILES - 1; i >= 1; i -= 1) {
      const src = `${filePath}.${i}`;
      const dest = `${filePath}.${i + 1}`;
      if (fs.existsSync(src)) fs.renameSync(src, dest);
    }
    fs.renameSync(filePath, `${filePath}.1`);
  } catch {
    /* ignore rotation errors */
  }
}

function writeLine(category, message, meta) {
  ensureLogsDir();
  const filePath = path.join(config.logsDir, `${category}.log`);
  rotateIfNeeded(filePath);
  const stamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  fs.appendFileSync(filePath, `[${stamp}] ${message}${suffix}\n`, 'utf8');
}

module.exports = {
  info(category, message, meta) {
    writeLine(category, message, meta);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${category}] ${message}`, meta || '');
    }
  },
  error(category, message, meta) {
    writeLine(category, `ERROR ${message}`, meta);
    console.error(`[${category}] ${message}`, meta || '');
  },
};
