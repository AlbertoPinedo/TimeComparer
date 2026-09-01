const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('el renderer está aislado y la política bloquea conexiones', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(html, /connect-src 'none'/);
});

test('el preload no expone ipcRenderer directamente', () => {
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer\s*[,}]/s);
  assert.match(preload, /bootstrap:/);
  assert.match(preload, /registerShortcut:/);
});
