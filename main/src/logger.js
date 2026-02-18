const fs = require('node:fs');
const path = require('node:path');

let logPath = null;

function initLogger(baseDir) {
  const logDir = path.join(baseDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  logPath = path.join(logDir, 'app.log');
}

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const payload = meta ? ` | ${JSON.stringify(meta)}` : '';
  const line = `[${timestamp}] [${level}] ${message}${payload}\n`;
  if (logPath) {
    fs.appendFileSync(logPath, line, 'utf8');
  }
  if (level === 'ERROR') {
    console.error(line);
    return;
  }
  console.log(line);
}

function info(message, meta) {
  write('INFO', message, meta);
}

function error(message, meta) {
  write('ERROR', message, meta);
}

module.exports = {
  initLogger,
  info,
  error
};
